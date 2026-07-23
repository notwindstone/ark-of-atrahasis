import { createSafeDOMError, isSafeDOMError } from "./errors.ts";
import type { PlatformOps } from "./platform.ts";
import type { NodeRegistry, RegistryEntry } from "./registry.ts";
import type { SafeElement } from "./types.ts";
import type { SpecializedElementKind } from "./vocabularies.ts";

export type IdentifierReferenceKind = "single" | "list";

export interface PreparedNamespaceMutation {
  readonly attributeName: string;
  readonly physicalValue: string | null;
  readonly reserveTokens: readonly string[];
  commit(): void;
}

export interface EventTargetResolution {
  readonly owned: boolean;
  readonly localId: string;
}

export interface IdentifierNamespace {
  prepareId(entry: RegistryEntry, local: string): PreparedNamespaceMutation;
  readId(entry: RegistryEntry): string;
  prepareName(entry: RegistryEntry, local: string): PreparedNamespaceMutation;
  prepareReference(
    entry: RegistryEntry,
    attributeName: string,
    local: string,
    kind: IdentifierReferenceKind,
  ): PreparedNamespaceMutation;
  readReference(entry: RegistryEntry, attributeName: string): string | undefined;
  lookup(localId: string, specializedKind?: SpecializedElementKind): SafeElement | null;
  resolveEventTarget(value: unknown): EventTargetResolution;
  recordFailedMutation(entry: RegistryEntry, prepared: PreparedNamespaceMutation): void;
  clearPhysicalEffects(entry: RegistryEntry): void;
  releaseEntry(entry: RegistryEntry): void;
  assertEmpty(): void;
}

interface IdRecord {
  readonly local: string;
  readonly physical: string;
  target: RegistryEntry | null;
  references: number;
}

interface NameRecord {
  readonly local: string;
  readonly physical: string;
  users: number;
}

interface ReferenceSlot {
  readonly localValue: string;
  readonly physicalValue: string;
  readonly records: readonly IdRecord[];
}

const TOKEN_BYTES = 24;
const TOKEN_ATTEMPTS = 8;
const ASCII_WHITESPACE = /[\t\n\f\r ]/;

function isASCIIWhitespaceCode(code: number): boolean {
  return code === 0x09 || code === 0x0a || code === 0x0c || code === 0x0d || code === 0x20;
}

function splitReferenceTokens(local: string): readonly string[] {
  const tokens: string[] = [];
  let tokenStart = -1;
  for (let index = 0; index <= local.length; index += 1) {
    const atEnd = index === local.length;
    const whitespace = !atEnd && isASCIIWhitespaceCode(local.charCodeAt(index));
    if (!atEnd && !whitespace) {
      if (tokenStart !== -1) continue;
      tokenStart = index;
      continue;
    }
    if (tokenStart === -1) continue;
    tokens.push(local.slice(tokenStart, index));
    tokenStart = -1;
  }
  return tokens;
}

function increment<RecordType>(map: Map<RecordType, number>, record: RecordType): void {
  map.set(record, (map.get(record) ?? 0) + 1);
}

interface LocalNamespaceRecord {
  readonly physical: string;
}

function unchangedMutation(
  attributeName: "id" | "name",
  physicalValue: string,
): PreparedNamespaceMutation {
  return {
    attributeName,
    physicalValue,
    reserveTokens: [],
    commit: () => undefined,
  };
}

function mappedMutation(
  attributeName: "id" | "name",
  next: LocalNamespaceRecord | undefined,
  created: boolean,
  commit: () => void,
): PreparedNamespaceMutation {
  return {
    attributeName,
    physicalValue: next?.physical ?? null,
    reserveTokens: created && next !== undefined ? [next.physical] : [],
    commit,
  };
}

class IdentifierNamespaceImplementation implements IdentifierNamespace {
  readonly #root: ShadowRoot;
  readonly #registry: NodeRegistry;
  readonly #platform: PlatformOps;
  readonly #idByLocal = new Map<string, IdRecord>();
  readonly #idByEntry = new WeakMap<RegistryEntry, IdRecord>();
  readonly #referenceSlotsByEntry = new Map<RegistryEntry, Map<string, ReferenceSlot>>();
  readonly #nameByLocal = new Map<string, NameRecord>();
  readonly #nameByEntry = new WeakMap<RegistryEntry, NameRecord>();
  readonly #entriesWithNamespaceState = new Set<RegistryEntry>();
  readonly #usedPhysicalTokens = new Set<string>();
  readonly #pendingPhysicalByEntry = new Map<RegistryEntry, {
    readonly attributes: Set<string>;
    readonly reservedTokens: Set<string>;
  }>();

  constructor(root: ShadowRoot, registry: NodeRegistry, platform: PlatformOps) {
    this.#root = root;
    this.#registry = registry;
    this.#platform = platform;
  }

  prepareId(entry: RegistryEntry, local: string): PreparedNamespaceMutation {
    const previous = this.#idByEntry.get(entry);
    if (previous?.local === local) {
      return unchangedMutation("id", previous.physical);
    }

    let next = local === "" ? undefined : this.#idByLocal.get(local);
    let created = false;
    if (next !== undefined && next.target !== null && next.target !== entry) {
      throw createSafeDOMError("DUPLICATE_IDENTIFIER", "SafeElement.setId.value");
    }
    if (local !== "" && next === undefined) {
      next = {
        local,
        physical: this.#createToken("aoa-i-", new Set()),
        target: null,
        references: 0,
      };
      created = true;
    }

    const preparedNext = next;
    return mappedMutation(
      "id",
      preparedNext,
      created,
      () => {
        if (created && preparedNext !== undefined) this.#installIdRecord(preparedNext);
        if (previous !== undefined) {
          this.#idByEntry.delete(entry);
          previous.target = null;
          this.#collectIdRecord(previous);
        }
        if (preparedNext !== undefined) {
          preparedNext.target = entry;
          this.#idByEntry.set(entry, preparedNext);
          this.#entriesWithNamespaceState.add(entry);
        } else {
          this.#refreshEntryTracking(entry);
        }
      },
    );
  }

  readId(entry: RegistryEntry): string {
    return this.#idByEntry.get(entry)?.local ?? "";
  }

  prepareName(entry: RegistryEntry, local: string): PreparedNamespaceMutation {
    const previous = this.#nameByEntry.get(entry);
    if (previous?.local === local) {
      return unchangedMutation("name", previous.physical);
    }

    let next = local === "" ? undefined : this.#nameByLocal.get(local);
    let created = false;
    if (local !== "" && next === undefined) {
      next = {
        local,
        physical: this.#createToken("aoa-n-", new Set()),
        users: 0,
      };
      created = true;
    }

    const preparedNext = next;
    return mappedMutation(
      "name",
      preparedNext,
      created,
      () => {
        if (created && preparedNext !== undefined) this.#installNameRecord(preparedNext);
        if (previous !== undefined) {
          this.#nameByEntry.delete(entry);
          previous.users -= 1;
          this.#collectNameRecord(previous);
        }
        if (preparedNext !== undefined) {
          preparedNext.users += 1;
          this.#nameByEntry.set(entry, preparedNext);
          this.#entriesWithNamespaceState.add(entry);
        } else {
          this.#refreshEntryTracking(entry);
        }
      },
    );
  }

  prepareReference(
    entry: RegistryEntry,
    attributeName: string,
    local: string,
    kind: IdentifierReferenceKind,
  ): PreparedNamespaceMutation {
    const localTokens = kind === "single"
      ? (local === "" ? [] : [local])
      : splitReferenceTokens(local);

    const previousSlots = this.#referenceSlotsByEntry.get(entry);
    const previous = previousSlots?.get(attributeName);
    const previousCounts = new Map<IdRecord, number>();
    for (const record of previous?.records ?? []) increment(previousCounts, record);

    const pendingByLocal = new Map<string, IdRecord>();
    const pendingTokens = new Set<string>();
    const createdRecords: IdRecord[] = [];
    const nextRecords: IdRecord[] = [];
    for (const token of localTokens) {
      let record = this.#idByLocal.get(token) ?? pendingByLocal.get(token);
      if (record === undefined) {
        record = {
          local: token,
          physical: this.#createToken("aoa-i-", pendingTokens),
          target: null,
          references: 0,
        };
        pendingByLocal.set(token, record);
        pendingTokens.add(record.physical);
        createdRecords.push(record);
      }
      nextRecords.push(record);
    }

    const nextCounts = new Map<IdRecord, number>();
    for (const record of nextRecords) increment(nextCounts, record);
    const collectedRecords: IdRecord[] = [];
    for (const [record, removed] of previousCounts) {
      const projected = record.references - removed + (nextCounts.get(record) ?? 0);
      if (projected === 0 && record.target === null) collectedRecords.push(record);
    }

    const canonicalLocal = localTokens.join(" ");
    const physicalValue = nextRecords.map((record) => record.physical).join(" ");
    const nextSlot: ReferenceSlot = {
      localValue: canonicalLocal,
      physicalValue,
      records: nextRecords,
    };
    const preparedSlots = previousSlots ?? new Map<string, ReferenceSlot>();

    return {
      attributeName,
      physicalValue,
      reserveTokens: createdRecords.map((record) => record.physical),
      commit: () => {
        for (const record of createdRecords) this.#installIdRecord(record);
        for (const record of previous?.records ?? []) record.references -= 1;
        for (const record of nextRecords) record.references += 1;
        preparedSlots.set(attributeName, nextSlot);
        if (previousSlots === undefined) this.#referenceSlotsByEntry.set(entry, preparedSlots);
        for (const record of collectedRecords) this.#collectIdRecord(record);
        this.#entriesWithNamespaceState.add(entry);
      },
    };
  }

  readReference(entry: RegistryEntry, attributeName: string): string | undefined {
    return this.#referenceSlotsByEntry.get(entry)?.get(attributeName)?.localValue;
  }

  lookup(localId: string, specializedKind?: SpecializedElementKind): SafeElement | null {
    if (localId === "" || ASCII_WHITESPACE.test(localId)) return null;
    const record = this.#idByLocal.get(localId);
    if (record === undefined) return null;
    const target = record.target;
    if (target === null || target.state !== "active") return null;
    if (specializedKind !== undefined && target.specializedKind !== specializedKind) return null;
    const found = this.#platform.getElementById(this.#root, record.physical);
    if (found !== target.real) return null;
    const wrapper = this.#registry.getWrapper<SafeElement>(found);
    return wrapper === target.wrapper ? wrapper : null;
  }

  resolveEventTarget(value: unknown): EventTargetResolution {
    if ((typeof value !== "object" && typeof value !== "function") || value === null) {
      return { owned: false, localId: "" };
    }
    const entry = this.#registry.getEntryByReal(value as Element);
    if (entry?.state !== "active" || !this.#platform.isElement(entry.real)) {
      return { owned: false, localId: "" };
    }
    return { owned: true, localId: this.#idByEntry.get(entry)?.local ?? "" };
  }

  recordFailedMutation(entry: RegistryEntry, prepared: PreparedNamespaceMutation): void {
    let pending = this.#pendingPhysicalByEntry.get(entry);
    if (pending === undefined) {
      pending = {
        attributes: new Set(),
        reservedTokens: new Set(),
      };
      this.#pendingPhysicalByEntry.set(entry, pending);
    }
    pending.attributes.add(prepared.attributeName);
    for (const token of prepared.reserveTokens) {
      pending.reservedTokens.add(token);
      this.#usedPhysicalTokens.add(token);
    }
    this.#entriesWithNamespaceState.add(entry);
  }

  clearPhysicalEffects(entry: RegistryEntry): void {
    if (!this.#platform.isElement(entry.real)) return;
    const names: string[] = [];
    if (this.#idByEntry.has(entry)) names.push("id");
    if (this.#nameByEntry.has(entry)) names.push("name");
    for (const name of this.#referenceSlotsByEntry.get(entry)?.keys() ?? []) names.push(name);
    for (const name of this.#pendingPhysicalByEntry.get(entry)?.attributes ?? []) names.push(name);

    let firstFailure: unknown;
    for (const name of names) {
      try {
        this.#platform.removeAttribute(entry.real, name);
      } catch (error) {
        firstFailure ??= error;
      }
    }
    if (firstFailure !== undefined) {
      throw isSafeDOMError(firstFailure)
        ? firstFailure
        : createSafeDOMError("DOM_OPERATION_FAILED", "IdentifierNamespace.clearPhysicalEffects");
    }
  }

  releaseEntry(entry: RegistryEntry): void {
    if (!this.#entriesWithNamespaceState.delete(entry)) {
      return;
    }

    const pending = this.#pendingPhysicalByEntry.get(entry);
    if (pending !== undefined) {
      for (const token of pending.reservedTokens) this.#usedPhysicalTokens.delete(token);
      this.#pendingPhysicalByEntry.delete(entry);
    }
    const id = this.#idByEntry.get(entry);
    if (id !== undefined) {
      this.#idByEntry.delete(entry);
      id.target = null;
    }
    const name = this.#nameByEntry.get(entry);
    if (name !== undefined) {
      this.#nameByEntry.delete(entry);
      name.users -= 1;
      this.#collectNameRecord(name);
    }
    const slots = this.#referenceSlotsByEntry.get(entry);
    const affected = new Set<IdRecord>();
    if (slots !== undefined) {
      for (const slot of slots.values()) {
        for (const record of slot.records) {
          record.references -= 1;
          affected.add(record);
        }
      }
      this.#referenceSlotsByEntry.delete(entry);
    }
    if (id !== undefined) affected.add(id);
    for (const record of affected) {
      this.#collectIdRecord(record);
    }
  }

  assertEmpty(): void {
    if (
      this.#idByLocal.size !== 0
      || this.#nameByLocal.size !== 0
      || this.#referenceSlotsByEntry.size !== 0
      || this.#pendingPhysicalByEntry.size !== 0
      || this.#entriesWithNamespaceState.size !== 0
      || this.#usedPhysicalTokens.size !== 0
    ) {
      throw createSafeDOMError("DOM_OPERATION_FAILED", "IdentifierNamespace.assertEmpty");
    }
  }

  #createToken(prefix: "aoa-i-" | "aoa-n-", pending: ReadonlySet<string>): string {
    for (let attempt = 0; attempt < TOKEN_ATTEMPTS; attempt += 1) {
      const token = `${prefix}${this.#platform.randomHex(TOKEN_BYTES)}`;
      if (!this.#usedPhysicalTokens.has(token) && !pending.has(token)) return token;
    }
    throw createSafeDOMError("DOM_OPERATION_FAILED", "IdentifierNamespace.token");
  }

  #installIdRecord(record: IdRecord): void {
    this.#idByLocal.set(record.local, record);
    this.#usedPhysicalTokens.add(record.physical);
  }

  #installNameRecord(record: NameRecord): void {
    this.#nameByLocal.set(record.local, record);
    this.#usedPhysicalTokens.add(record.physical);
  }

  #collectIdRecord(record: IdRecord): boolean {
    if (record.target !== null || record.references !== 0) return false;
    this.#idByLocal.delete(record.local);
    this.#usedPhysicalTokens.delete(record.physical);
    return true;
  }

  #collectNameRecord(record: NameRecord): boolean {
    if (record.users !== 0) return false;
    this.#nameByLocal.delete(record.local);
    this.#usedPhysicalTokens.delete(record.physical);
    return true;
  }

  #refreshEntryTracking(entry: RegistryEntry): void {
    if (
      this.#idByEntry.has(entry)
      || this.#nameByEntry.has(entry)
      || this.#referenceSlotsByEntry.has(entry)
    ) {
      this.#entriesWithNamespaceState.add(entry);
    } else {
      this.#entriesWithNamespaceState.delete(entry);
    }
  }
}

export function createIdentifierNamespace(
  root: ShadowRoot,
  registry: NodeRegistry,
  platform: PlatformOps,
): IdentifierNamespace {
  return new IdentifierNamespaceImplementation(root, registry, platform);
}
