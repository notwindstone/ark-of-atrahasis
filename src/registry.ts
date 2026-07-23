import type { SafeElement, SafeTextNode } from "./types.ts";
import type { SpecializedElementKind } from "./vocabularies.ts";
import { createSafeDOMError } from "./errors.ts";

export type SafeNode = SafeElement | SafeTextNode;
export type RealNode = Element | Text;
export type NodeState = "active" | "disposed" | "revoked";

export interface PendingPhysicalEffect {
  cleanup(): void;
}

export interface RegistryEntry {
  readonly owner: object;
  readonly wrapper: SafeNode;
  readonly real: RealNode;
  readonly specializedKind?: SpecializedElementKind;
  state: NodeState;
  terminalFinalized: boolean;
  styleCleanupRequired: boolean;
  readonly listeners: Set<() => void>;
  readonly pendingEffects: Set<PendingPhysicalEffect>;
  readonly requestAttributes: Set<string>;
}

/** A registry belongs to exactly one SafeDocument capability. */
export class NodeRegistry {
  readonly #owner = Object.freeze({});
  readonly #ownerDocument: Document;
  readonly #entryByReal = new WeakMap<RealNode, RegistryEntry>();
  readonly #entryByWrapper = new WeakMap<SafeNode, RegistryEntry>();
  readonly #entries = new Set<RegistryEntry>();
  readonly #ownerDocumentOf: (node: RealNode) => Document | null;

  constructor(
    ownerDocument: Document,
    ownerDocumentOf: (node: RealNode) => Document | null,
  ) {
    this.#ownerDocument = ownerDocument;
    this.#ownerDocumentOf = ownerDocumentOf;
  }

  register(
    wrapper: SafeNode,
    real: RealNode,
    specializedKind?: SpecializedElementKind,
  ): RegistryEntry {
    if (this.#ownerDocumentOf(real) !== this.#ownerDocument) {
      throw createSafeDOMError(
        "OWNER_DOCUMENT_MISMATCH",
        "A wrapper can only own nodes from its ShadowRoot document",
      );
    }

    const byReal = this.#entryByReal.get(real);
    const byWrapper = this.#entryByWrapper.get(wrapper);
    if (byReal?.wrapper === wrapper && byWrapper?.real === real) return byReal;
    if (byReal || byWrapper) {
      throw createSafeDOMError(
        "DUPLICATE_REGISTRATION",
        "A DOM node has exactly one canonical wrapper per SafeDocument",
      );
    }

    const entry: RegistryEntry = {
      owner: this.#owner,
      wrapper,
      real,
      state: "active",
      terminalFinalized: false,
      styleCleanupRequired: false,
      listeners: new Set(),
      pendingEffects: new Set(),
      requestAttributes: new Set(),
    };
    Object.defineProperty(entry, "specializedKind", {
      configurable: false,
      enumerable: true,
      value: specializedKind,
      writable: false,
    });
    this.#entryByReal.set(real, entry);
    this.#entryByWrapper.set(wrapper, entry);
    this.#entries.add(entry);
    return entry;
  }

  getWrapper<T extends SafeNode = SafeNode>(real: RealNode): T | undefined {
    const entry = this.#entryByReal.get(real);
    if (!entry || entry.owner !== this.#owner || entry.state !== "active") return undefined;
    return entry.wrapper as T;
  }

  getEntryByReal(real: RealNode): RegistryEntry | undefined {
    const entry = this.#entryByReal.get(real);
    return entry?.owner === this.#owner ? entry : undefined;
  }

  getEntryByWrapper(wrapper: SafeNode): RegistryEntry | undefined {
    const entry = this.#entryByWrapper.get(wrapper);
    return entry?.owner === this.#owner ? entry : undefined;
  }

  entries(): readonly RegistryEntry[] {
    return [...this.#entries];
  }

  stopTracking(entry: RegistryEntry): void {
    this.#entries.delete(entry);
  }

  requireEntry(wrapper: SafeNode): RegistryEntry {
    const entry = this.getEntryByWrapper(wrapper);
    if (!entry) {
      throw createSafeDOMError(
        "CROSS_OWNER",
        "The supplied wrapper is not owned by this SafeDocument",
      );
    }
    return entry;
  }
}
