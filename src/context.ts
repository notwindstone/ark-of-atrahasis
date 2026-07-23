import { createSafeDOMError, isSafeDOMError, type SafeDOMError } from "./errors.ts";
import { createEventSnapshotter, type EventSnapshotter } from "./event.ts";
import {
  ROOT_BUBBLE_FENCE_EVENT_TYPES,
  TARGET_FENCE_EVENT_TYPES,
} from "./event-catalog.ts";
import {
  createIdentifierNamespace,
  type IdentifierNamespace,
  type IdentifierReferenceKind,
  type PreparedNamespaceMutation,
} from "./identifier-namespace.ts";
import {
  NodeRegistry,
  type PendingPhysicalEffect,
  type RealNode,
  type RegistryEntry,
  type SafeNode,
} from "./registry.ts";
import type {
  Hardener,
  SafeDocumentOptions,
  SafeElement,
  SafeFormControlPolicy,
} from "./types.ts";
import {
  createStylePolicy,
  type SafeStylePolicy,
  type StylePolicyEngine,
} from "./style-policy.ts";
import {
  createURLPolicy,
  type SafeURLPolicy,
  type SafeURLDecision,
  type URLPolicyEngine,
} from "./url-policy.ts";
import { createPlatformOps, type PlatformOps } from "./platform.ts";
import type { SpecializedElementKind } from "./vocabularies.ts";

const claimedRoots = new WeakSet<object>();
const objectIsPrototypeOf = Function.call.bind(Object.prototype.isPrototypeOf) as (
  prototype: object,
  value: unknown,
) => boolean;

type FormElementTag =
  | "button"
  | "fieldset"
  | "img"
  | "input"
  | "label"
  | "legend"
  | "optgroup"
  | "option"
  | "output"
  | "select"
  | "textarea";
type TerminalCleanup = "owned-physical" | "logical-only";

function assertCanvasDimension(value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > 4_294_967_295) {
    throw createSafeDOMError("DOM_OPERATION_FAILED", "SafeDocument.canvasDimensions");
  }
}

interface NormalizedOptions {
  readonly harden: Hardener;
  readonly urlPolicy: SafeURLPolicy | undefined;
  readonly stylePolicy: SafeStylePolicy | undefined;
  readonly formControlPolicy: SafeFormControlPolicy | undefined;
}

function readOwnDataProperty<Value>(
  record: object,
  property: PropertyKey,
  error: () => SafeDOMError,
): Value | undefined {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(record, property);
    if (descriptor === undefined) return undefined;
    if (!("value" in descriptor)) throw error();
    return descriptor.value;
  } catch {
    throw error();
  }
}

type OwnDataProperty<Value> =
  | { readonly present: false }
  | { readonly present: true; readonly value: Value };

function readOwnDataPropertyEntry<Value>(
  record: object,
  property: PropertyKey,
  error: () => SafeDOMError,
): OwnDataProperty<Value> {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(record, property);
    if (descriptor === undefined) return { present: false };
    if (!("value" in descriptor)) throw error();
    return { present: true, value: descriptor.value };
  } catch {
    throw error();
  }
}

function normalizeOptions(options: SafeDocumentOptions | undefined): NormalizedOptions {
  if (options === null || typeof options !== "object") throw invalidHardener();

  const harden = readOwnDataProperty<Hardener>(options, "harden", invalidHardener);
  if (typeof harden !== "function") throw invalidHardener();

  for (const removedOption of ["quotas", "rates"] as const) {
    const operation = `createSafeDocument.options.${removedOption}`;
    const legacy = readOwnDataPropertyEntry<unknown>(
      options,
      removedOption,
      () => createSafeDOMError("ERR_INVALID_POLICY", operation),
    );
    if (legacy.present) throw createSafeDOMError("ERR_INVALID_POLICY", operation);
  }

  const formControlPolicy = readOwnDataPropertyEntry<SafeFormControlPolicy | undefined>(
    options,
    "formControlPolicy",
    () => createSafeDOMError(
      "ERR_INVALID_POLICY",
      "createSafeDocument.options.formControlPolicy",
    ),
  );
  if (formControlPolicy.present && formControlPolicy.value === undefined) {
    throw createSafeDOMError(
      "ERR_INVALID_POLICY",
      "createSafeDocument.options.formControlPolicy",
    );
  }

  completeWithHardener(harden, { nested: { method: (): boolean => true } });

  return {
    harden,
    urlPolicy: readOwnDataProperty(
      options,
      "urlPolicy",
      () => createSafeDOMError("ERR_INVALID_POLICY", "createSafeDocument.options.urlPolicy"),
    ),
    stylePolicy: readOwnDataProperty(
      options,
      "stylePolicy",
      () => createSafeDOMError("ERR_INVALID_POLICY", "createSafeDocument.options.stylePolicy"),
    ),
    formControlPolicy: formControlPolicy.present
      ? formControlPolicy.value
      : undefined,
  };
}

function resolveFormControlPolicy(supplied: SafeFormControlPolicy | undefined): boolean {
  if (supplied === undefined) return false;
  const policyOperation = "createSafeDocument.options.formControlPolicy";
  if (supplied === null || typeof supplied !== "object") {
    throw createSafeDOMError("ERR_INVALID_POLICY", policyOperation);
  }

  let keys: readonly PropertyKey[];
  try {
    keys = Reflect.ownKeys(supplied);
  } catch {
    throw createSafeDOMError("ERR_INVALID_POLICY", policyOperation);
  }
  const grantName = "allowNonCredentialFormElements";
  if (keys.length !== 1 || keys[0] !== grantName) {
    throw createSafeDOMError("ERR_INVALID_POLICY", policyOperation);
  }
  const grantOperation = `${policyOperation}.${grantName}`;
  const grant = readOwnDataPropertyEntry<unknown>(
    supplied,
    grantName,
    () => createSafeDOMError("ERR_INVALID_POLICY", grantOperation),
  );
  if (!grant.present || grant.value !== true) {
    throw createSafeDOMError("ERR_INVALID_POLICY", grantOperation);
  }
  return true;
}

function invalidHardener(): SafeDOMError {
  return createSafeDOMError("ERR_INVALID_HARDENER", "createSafeDocument.options.harden");
}

function isDeeplyFrozen(root: unknown): boolean {
  const pending: unknown[] = [root];
  const visited = new WeakSet<object>();

  try {
    while (pending.length > 0) {
      const value = pending.pop();
      if ((typeof value !== "object" && typeof value !== "function") || value === null) {
        continue;
      }
      if (visited.has(value)) continue;
      if (!Object.isFrozen(value)) return false;

      visited.add(value);
      for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
        if ("value" in descriptor) pending.push(descriptor.value);
        else pending.push(descriptor.get, descriptor.set);
      }
    }
    return true;
  } catch {
    return false;
  }
}

function completeWithHardener<Value>(harden: Hardener, value: Value): Value {
  try {
    const completed = harden(value);
    if (!Object.is(completed, value) || !isDeeplyFrozen(value)) throw invalidHardener();
    return completed;
  } catch {
    // A bad/stateful hardener never gets to choose the thrown boundary value.
    throw invalidHardener();
  }
}

export type StyleMutationResult =
  | { readonly status: "committed" }
  | {
      readonly status: "rejected";
      readonly rollbackProven: true;
    }
  | {
      readonly status: "rejected";
      readonly rollbackProven: false;
      readonly retryRollback: () => boolean;
    };

export interface DocumentContext {
  readonly root: ShadowRoot;
  readonly ownerDocument: Document;
  readonly ownerRealm: Window & typeof globalThis;
  readonly registry: NodeRegistry;
  readonly urlPolicy: URLPolicyEngine;
  readonly stylePolicy: StylePolicyEngine;
  readonly eventSnapshotter: EventSnapshotter;
  readonly platform: PlatformOps;
  complete<Value>(value: Value): Value;
  complete<Node extends SafeNode>(
    value: Node,
    real: RealNode,
    specializedKind?: SpecializedElementKind,
  ): Node;
  completeInitialized<Node extends SafeElement>(
    value: Node,
    real: Element,
    specializedKind: SpecializedElementKind,
    attributes: readonly InitialAttribute[],
    initialize: () => void,
  ): Node;
  createElement<K extends keyof HTMLElementTagNameMap>(tag: K): HTMLElementTagNameMap[K];
  createElement(tag: string): HTMLElement;
  createFormElement<Tag extends FormElementTag>(
    tag: Tag,
    operation: string,
  ): HTMLElementTagNameMap[Tag];
  createTextNode(value: string): Text;
  documentOperation<T>(action: () => T): T;
  nodeOperation<T>(real: RealNode, action: () => T): T;
  requireRealNode(wrapper: SafeNode): RealNode;
  setText(real: RealNode, slot: string, value: string, action: () => void): void;
  updateContentResources(
    real: Element,
    prepare: () => ContentResourceTransaction,
  ): void;
  setAttribute(
    real: Element,
    name: string,
    value: string | null | undefined,
    validate?: () => void,
  ): void;
  setLocalId(real: Element, local: string): void;
  getLocalId(real: Element): string;
  setLocalName(real: Element, local: string): void;
  setLocalIdReference(
    real: Element,
    attributeName: string,
    local: string,
    kind: IdentifierReferenceKind,
  ): void;
  getLocalIdReference(real: Element, attributeName: string): string | undefined;
  lookupLocalId(local: string, specializedKind?: SpecializedElementKind): SafeElement | null;
  setReflectedIDL(real: Element, name: string, value: string | null, action: () => void): void;
  setCanvasDimension(
    real: HTMLCanvasElement,
    dimension: "width" | "height",
    value: number,
  ): void;
  setIDL<Value extends string | number | boolean>(
    real: Element,
    value: Value,
    read: () => Value,
    write: (next: Value) => void,
    validate?: () => void,
  ): void;
  setURLAttribute(
    real: Element,
    name: string,
    decide: () => SafeURLDecision,
  ): SafeURLDecision;
  setStyle(
    real: Element,
    action: () => StyleMutationResult,
  ): boolean;
  addEventListener(
    real: Element,
    eventName: string,
    listener: (event: Event) => void,
  ): () => void;
  canDispatch(real: Element): boolean;
  detachNode(real: RealNode): void;
  disposeNode(real: RealNode): void;
  disposeDocument(): void;
  abandonInitialization(): void;
}

export interface InitialAttribute {
  readonly name: string;
  readonly value: string;
}

function getNativeRoot(value: unknown): {
  root: ShadowRoot;
  ownerDocument: Document;
  view: Window & typeof globalThis;
} {
  try {
    if ((typeof value !== "object" && typeof value !== "function") || value === null) {
      throw createSafeDOMError("INVALID_ROOT", "createSafeDocument.root");
    }

    // Initialisation is a host operation. Resolve the constructor from the
    // supplied root's realm instead of using ambient globals.
    const candidate = value as Partial<ShadowRoot>;
    const ownerDocument = candidate.ownerDocument;
    const view = ownerDocument?.defaultView;
    const ShadowRootConstructor = view?.ShadowRoot;
    if (
      !ownerDocument
      || !ShadowRootConstructor
      || !objectIsPrototypeOf(ShadowRootConstructor.prototype, value)
    ) {
      throw createSafeDOMError("INVALID_ROOT", "createSafeDocument.root");
    }

    return { root: value as ShadowRoot, ownerDocument, view };
  } catch {
    throw createSafeDOMError("INVALID_ROOT", "createSafeDocument requires a native ShadowRoot");
  }
}

class DocumentContextImplementation implements DocumentContext {
  readonly root: ShadowRoot;
  readonly ownerDocument: Document;
  readonly ownerRealm: Window & typeof globalThis;
  readonly registry: NodeRegistry;
  readonly platform: PlatformOps;
  readonly urlPolicy: URLPolicyEngine;
  readonly stylePolicy: StylePolicyEngine;
  readonly eventSnapshotter: EventSnapshotter;
  readonly #identifierNamespace: IdentifierNamespace;
  readonly #harden: Hardener;
  readonly #allowNonCredentialFormElements: boolean;
  readonly #rootBoundaryController: AbortController;
  #rootBoundaryDisposed = false;
  #disposed = false;
  #disposalComplete = false;

  constructor(
    root: ShadowRoot,
    ownerDocument: Document,
    view: Window & typeof globalThis,
    options?: SafeDocumentOptions,
  ) {
    const normalizedOptions = normalizeOptions(options);
    this.#harden = normalizedOptions.harden;
    this.root = root;
    this.ownerDocument = ownerDocument;
    this.ownerRealm = view;
    this.#allowNonCredentialFormElements = resolveFormControlPolicy(
      normalizedOptions.formControlPolicy,
    );
    this.platform = createPlatformOps(ownerDocument, view);
    this.platform.assertPaintContainedRoot(root);
    this.registry = new NodeRegistry(ownerDocument, (node) => this.platform.ownerDocument(node));
    this.#identifierNamespace = createIdentifierNamespace(root, this.registry, this.platform);
    this.urlPolicy = createURLPolicy(normalizedOptions.urlPolicy, this.platform.URL);
    this.stylePolicy = createStylePolicy(normalizedOptions.stylePolicy);
    this.eventSnapshotter = createEventSnapshotter(
      view,
      <Value>(value: Value): Value => this.complete(value),
      (target) => this.#identifierNamespace.resolveEventTarget(target),
    );
    this.#rootBoundaryController = this.#installRootBoundary();
  }

  complete<Value>(value: Value): Value;
  complete<Node extends SafeNode>(
    value: Node,
    real: RealNode,
    specializedKind?: SpecializedElementKind,
  ): Node;
  complete<Value>(value: Value, real?: RealNode, specializedKind?: SpecializedElementKind): Value {
    const completed = completeWithHardener(this.#harden, value);
    if (real !== undefined) this.#register(completed as SafeNode, real, specializedKind);
    return completed;
  }

  completeInitialized<Node extends SafeElement>(
    value: Node,
    real: Element,
    specializedKind: SpecializedElementKind,
    attributes: readonly InitialAttribute[],
    initialize: () => void,
  ): Node {
    const completed = completeWithHardener(this.#harden, value);
    this.#registerInitialized(completed, real, specializedKind, attributes, initialize);
    return completed;
  }

  createElement<K extends keyof HTMLElementTagNameMap>(tag: K): HTMLElementTagNameMap[K];
  createElement(tag: string): HTMLElement;
  createElement(tag: string): HTMLElement {
    return this.documentOperation(() => this.platform.createElement(tag));
  }

  createFormElement<Tag extends FormElementTag>(
    tag: Tag,
    operation: string,
  ): HTMLElementTagNameMap[Tag] {
    return this.documentOperation(() => {
      if (!this.#allowNonCredentialFormElements) {
        throw createSafeDOMError("FORM_CONTROL_POLICY_REQUIRED", operation);
      }
      return this.platform.createElement(tag) as HTMLElementTagNameMap[Tag];
    });
  }

  createTextNode(value: string): Text {
    return this.documentOperation(() => this.platform.createTextNode(value));
  }

  #register(wrapper: SafeNode, real: RealNode, specializedKind?: SpecializedElementKind): void {
    this.#assertDocumentActive();
    let boundaryCleanup: (() => void) | undefined;
    try {
      if (this.platform.isElement(real)) {
        boundaryCleanup = this.#installTargetBoundary(real);
      }
      const entry = this.registry.register(wrapper, real, specializedKind);
      if (boundaryCleanup !== undefined) entry.listeners.add(boundaryCleanup);
    } catch (error) {
      try {
        boundaryCleanup?.();
      } catch {
        // Preserve the authoritative registration failure for the discarded node.
      }
      throw error;
    }
  }

  #registerInitialized(
    wrapper: SafeNode,
    real: Element,
    specializedKind: SpecializedElementKind,
    attributes: readonly InitialAttribute[],
    initialize: () => void,
  ): void {
    this.#assertDocumentActive();
    let boundaryCleanup: (() => void) | undefined;
    try {
      initialize();
      boundaryCleanup = this.#installTargetBoundary(real);
      const entry = this.registry.register(wrapper, real, specializedKind);
      entry.listeners.add(boundaryCleanup);
    } catch (error) {
      try {
        boundaryCleanup?.();
      } catch {
        // Preserve the authoritative initialization failure for the discarded node.
      }
      for (const { name } of attributes) {
        try {
          this.platform.removeAttribute(real, name);
        } catch {
          // The unregistered node is discarded even if best-effort cleanup fails.
        }
      }
      if (isSafeDOMError(error)) throw error;
      throw createSafeDOMError("DOM_OPERATION_FAILED", "SafeDocument.initializeElement");
    }
  }

  documentOperation<T>(action: () => T): T {
    this.#assertDocumentActive();
    this.#auditPlacements();
    return action();
  }

  nodeOperation<T>(real: RealNode, action: () => T): T {
    this.#assertDocumentActive();
    const entry = this.#requireEntryByReal(real);
    const compromised = this.#auditPlacements();
    if (compromised.has(entry)) {
      throw createSafeDOMError(
        "PLACEMENT_VIOLATION",
        "The owned node was placed outside its SafeDocument mount and has been revoked",
      );
    }
    this.#assertEntryActive(entry);
    return action();
  }

  requireRealNode(wrapper: SafeNode): RealNode {
    const entry = this.registry.requireEntry(wrapper);
    this.#assertEntryActive(entry);
    return entry.real;
  }

  setText(real: RealNode, slot: string, value: string, action: () => void): void {
    this.nodeOperation(real, () => {
      const entry = this.#requireEntryByReal(real);
      this.#updateResources(entry, [{
        resource: "text",
        slot,
        value,
      }], action);
    });
  }

  updateContentResources(
    real: Element,
    prepare: () => ContentResourceTransaction,
  ): void {
    this.nodeOperation(real, () => {
      const entry = this.#requireEntryByReal(real);
      const { changes, action } = prepare();
      this.#updateResources(entry, changes, action);
    });
  }

  setAttribute(
    real: Element,
    name: string,
    value: string | null | undefined,
    validate?: () => void,
  ): void {
    this.nodeOperation(real, () => {
      if (value === undefined) return;
      const entry = this.#requireEntryByReal(real);
      const changes: ResourceChange[] = [{
        resource: "attribute",
        slot: name,
        value: value ?? null,
      }];
      this.#updateResources(entry, changes, () => {
        validate?.();
        if (value === null) this.platform.removeAttribute(real, name);
        else this.platform.setAttribute(real, name, value);
      });
    });
  }

  setLocalId(real: Element, local: string): void {
    this.nodeOperation(real, () => {
      const entry = this.#requireEntryByReal(real);
      this.#commitNamespaceMutation(entry, this.#identifierNamespace.prepareId(entry, local));
    });
  }

  getLocalId(real: Element): string {
    return this.nodeOperation(real, () => {
      return this.#identifierNamespace.readId(this.#requireEntryByReal(real));
    });
  }

  setLocalName(real: Element, local: string): void {
    this.nodeOperation(real, () => {
      const entry = this.#requireEntryByReal(real);
      this.#commitNamespaceMutation(entry, this.#identifierNamespace.prepareName(entry, local));
    });
  }

  setLocalIdReference(
    real: Element,
    attributeName: string,
    local: string,
    kind: IdentifierReferenceKind,
  ): void {
    this.nodeOperation(real, () => {
      const entry = this.#requireEntryByReal(real);
      this.#commitNamespaceMutation(
        entry,
        this.#identifierNamespace.prepareReference(entry, attributeName, local, kind),
      );
    });
  }

  getLocalIdReference(real: Element, attributeName: string): string | undefined {
    return this.nodeOperation(real, () => {
      return this.#identifierNamespace.readReference(
        this.#requireEntryByReal(real),
        attributeName,
      );
    });
  }

  lookupLocalId(local: string, specializedKind?: SpecializedElementKind): SafeElement | null {
    return this.documentOperation(() => this.#identifierNamespace.lookup(local, specializedKind));
  }

  setReflectedIDL(real: Element, name: string, value: string | null, action: () => void): void {
    this.nodeOperation(real, () => {
      const entry = this.#requireEntryByReal(real);
      this.#updateResources(entry, [{
        resource: "attribute",
        slot: name,
        value,
      }], action);
    });
  }

  setCanvasDimension(
    real: HTMLCanvasElement,
    dimension: "width" | "height",
    value: number,
  ): void {
    this.nodeOperation(real, () => {
      const entry = this.#requireEntryByReal(real);
      if (entry.specializedKind !== "canvas") {
        throw createSafeDOMError("DOM_OPERATION_FAILED", "SafeDocument.canvasDimension");
      }

      const readState = (): {
        readonly width: number;
        readonly height: number;
        readonly attributeValue: string | null;
      } => {
        const width = this.platform.getCanvasWidth(real);
        const height = this.platform.getCanvasHeight(real);
        assertCanvasDimension(width);
        assertCanvasDimension(height);
        return {
          width,
          height,
          attributeValue: this.platform.getAttribute(real, dimension),
        };
      };
      const writeDimension = (next: number): void => {
        if (dimension === "width") this.platform.setCanvasWidth(real, next);
        else this.platform.setCanvasHeight(real, next);
      };

      const previous = readState();
      const nextWidth = dimension === "width" ? value : previous.width;
      const nextHeight = dimension === "height" ? value : previous.height;
      assertCanvasDimension(value);

      const serialized = `${value}`;
      const restorePrevious = (): boolean => {
        try {
          const current = readState();
          if (
            current.width !== previous.width
            || current.height !== previous.height
            || current.attributeValue !== previous.attributeValue
          ) {
            writeDimension(dimension === "width" ? previous.width : previous.height);
            if (previous.attributeValue === null) this.platform.removeAttribute(real, dimension);
            else this.platform.setAttribute(real, dimension, previous.attributeValue);
          }
        } catch {
          // Readback below decides whether the throwing restoration took effect.
        }
        try {
          const restored = readState();
          return restored.width === previous.width
            && restored.height === previous.height
            && restored.attributeValue === previous.attributeValue;
        } catch {
          return false;
        }
      };

      try {
        writeDimension(value);
        const committed = readState();
        if (
          committed.width !== nextWidth
          || committed.height !== nextHeight
          || committed.attributeValue !== serialized
        ) {
          throw createSafeDOMError(
            "DOM_OPERATION_FAILED",
            "SafeDocument.canvasDimension.readback",
          );
        }
      } catch (mutationError) {
        if (restorePrevious()) {
          if (isSafeDOMError(mutationError)) throw mutationError;
          throw createSafeDOMError("DOM_OPERATION_FAILED", "SafeDocument.canvasDimension");
        }

        const pending: PendingPhysicalEffect = {
          cleanup: (): void => {
            if (!restorePrevious()) {
              throw createSafeDOMError("DOM_OPERATION_FAILED", "SafeDocument.canvasRollback");
            }
          },
        };
        entry.pendingEffects.add(pending);
        entry.state = "revoked";
        throw createSafeDOMError("DOM_OPERATION_FAILED", "SafeDocument.canvasRollback");
      }
    });
  }

  setIDL<Value extends string | number | boolean>(
    real: Element,
    value: Value,
    read: () => Value,
    write: (next: Value) => void,
    validate?: () => void,
  ): void {
    this.nodeOperation(real, () => {
      validate?.();
      const entry = this.#requireEntryByReal(real);
      const previous = read();
      const restorePrevious = (): boolean => {
        try {
          if (Object.is(read(), previous)) return true;
        } catch {
          // A failed read cannot prove that no restoration write is needed.
        }
        try {
          write(previous);
        } catch {
          // Readback below decides whether the throwing restoration took effect.
        }
        try {
          return Object.is(read(), previous);
        } catch {
          return false;
        }
      };
      try {
        write(value);
      } catch (mutationError) {
        if (!restorePrevious()) {
          const pending: PendingPhysicalEffect = {
            cleanup: (): void => {
              if (!restorePrevious()) {
                throw createSafeDOMError("DOM_OPERATION_FAILED", "SafeDocument.idlRollback");
              }
            },
          };
          entry.pendingEffects.add(pending);
          entry.state = "revoked";
          throw createSafeDOMError("DOM_OPERATION_FAILED", "SafeDocument.idlRollback");
        }
        if (isSafeDOMError(mutationError)) throw mutationError;
        throw createSafeDOMError("DOM_OPERATION_FAILED", "The DOM mutation could not be completed");
      }
    });
  }

  setURLAttribute(
    real: Element,
    name: string,
    decide: () => SafeURLDecision,
  ): SafeURLDecision {
    return this.nodeOperation(real, () => {
      const decision = this.complete(decide());
      if (!decision.allowed) return decision;

      const entry = this.#requireEntryByReal(real);
      const value = decision.url;
      this.#updateResources(entry, [
        {
          resource: "attribute",
          slot: name,
          value,
        },
      ], () => this.platform.setAttribute(real, name, value));
      entry.requestAttributes.add(name);
      return decision;
    });
  }

  setStyle(
    real: Element,
    action: () => StyleMutationResult,
  ): boolean {
    return this.nodeOperation(real, () => {
      const entry = this.#requireEntryByReal(real);

      let result: StyleMutationResult;
      try {
        result = action();
      } catch {
        throw createSafeDOMError(
          "DOM_OPERATION_FAILED",
          "The style transaction could not be completed",
        );
      }
      if (result.status === "rejected" && result.rollbackProven) {
        return false;
      }

      if (result.status === "rejected") {
        const pending: PendingPhysicalEffect = {
          cleanup: (): void => {
            if (!result.retryRollback()) {
              throw createSafeDOMError("DOM_OPERATION_FAILED", "SafeDocument.styleRollback");
            }
          },
        };
        entry.pendingEffects.add(pending);
        entry.state = "revoked";
        return false;
      }

      entry.styleCleanupRequired = this.platform.getAttribute(real, "style") !== null;
      return true;
    });
  }

  addEventListener(
    real: Element,
    eventName: string,
    listener: (event: Event) => void,
  ): () => void {
    return this.nodeOperation(real, () => {
      const entry = this.#requireEntryByReal(real);
      const controller = this.platform.createAbortController();
      let active = true;
      const cleanup = (): void => {
        if (!active) return;
        this.platform.abort(controller);
        active = false;
        entry.listeners.delete(cleanup);
      };
      entry.listeners.add(cleanup);
      try {
        this.platform.addEventListener(
          real,
          eventName,
          listener,
          this.platform.getAbortSignal(controller),
        );
      } catch (error) {
        cleanup();
        if (isSafeDOMError(error)) throw error;
        throw createSafeDOMError(
          "DOM_OPERATION_FAILED",
          "The event listener could not be installed",
        );
      }
      try {
        return this.complete(cleanup);
      } catch (error) {
        cleanup();
        throw error;
      }
    });
  }

  canDispatch(real: Element): boolean {
    if (this.#disposed) return false;
    const entry = this.registry.getEntryByReal(real);
    if (entry?.state !== "active") return false;
    const compromised = this.#auditPlacements();
    return !compromised.has(entry) && entry.state === "active";
  }

  detachNode(real: RealNode): void {
    this.nodeOperation(real, () => this.platform.detach(real));
  }

  disposeNode(real: RealNode): void {
    const entry = this.#requireEntryByReal(real);
    if (this.#disposed) return;
    if (entry.state === "disposed") {
      this.#finalizeTerminalSubtree(entry, "disposed", "always");
      return;
    }
    if (entry.state === "revoked") {
      const detach = this.#isWithin(entry.real, this.root) ? "always" : "none";
      this.#finalizeTerminalSubtree(entry, "revoked", detach);
      return;
    }
    const compromised = this.#auditPlacements();
    if (compromised.has(entry) || entry.state !== "active") return;

    this.#finalizeTerminalSubtree(entry, "disposed", "always");
  }

  disposeDocument(): void {
    if (this.#disposalComplete) return;
    if (!this.#disposed) this.#auditPlacements();
    const terminalEntries = this.registry.entries().map((entry) => ({
      cleanup: this.#terminalCleanup(entry),
      entry,
      state: entry.state === "revoked" ? "revoked" as const : "disposed" as const,
    }));
    this.#disposed = true;

    let firstFailure: SafeDOMError | undefined;
    try {
      this.#disposeRootBoundary();
    } catch (error) {
      firstFailure = isSafeDOMError(error)
        ? error
        : createSafeDOMError("DOM_OPERATION_FAILED", "SafeDocument.dispose.eventBoundary");
    }
    for (const { cleanup, entry, state } of terminalEntries) {
      try {
        this.#finalizeEntry(entry, state, "from-root", cleanup);
      } catch (error) {
        firstFailure ??= isSafeDOMError(error)
          ? error
          : createSafeDOMError("DOM_OPERATION_FAILED", "SafeDocument.dispose");
      }
    }

    if (this.registry.entries().length === 0 && this.#rootBoundaryDisposed) {
      try {
        this.#identifierNamespace.assertEmpty();
        this.#disposalComplete = true;
      } catch (error) {
        firstFailure ??= isSafeDOMError(error)
          ? error
          : createSafeDOMError("DOM_OPERATION_FAILED", "SafeDocument.dispose.namespace");
      }
    }
    if (firstFailure !== undefined) throw firstFailure;
  }

  abandonInitialization(): void {
    try {
      this.disposeDocument();
    } catch {
      // Preserve the original initialization error after best-effort cleanup.
    } finally {
      claimedRoots.delete(this.root);
    }
  }

  #assertDocumentActive(): void {
    if (this.#disposed) {
      throw createSafeDOMError("DOCUMENT_DISPOSED", "The SafeDocument has been disposed");
    }
  }

  #requireEntryByReal(real: RealNode): RegistryEntry {
    const entry = this.registry.getEntryByReal(real);
    if (!entry) {
      throw createSafeDOMError("CROSS_OWNER", "The node is not owned by this SafeDocument");
    }
    return entry;
  }

  #assertEntryActive(entry: RegistryEntry): void {
    if (entry.state === "disposed") {
      throw createSafeDOMError("NODE_DISPOSED", "The node wrapper has been disposed");
    }
    if (entry.state === "revoked") {
      throw createSafeDOMError("NODE_REVOKED", "The node wrapper has been revoked");
    }
  }

  #installRootBoundary(): AbortController {
    const controller = this.platform.createAbortController();
    const signal = this.platform.getAbortSignal(controller);
    const stopAtRoot = (event: Event): void => {
      this.platform.stopEventPropagation(event);
    };
    try {
      for (const eventName of ROOT_BUBBLE_FENCE_EVENT_TYPES) {
        this.platform.addEventListener(this.root, eventName, stopAtRoot, signal);
      }
      return controller;
    } catch (error) {
      try {
        this.platform.abort(controller);
      } catch {
        // The original normalized installation error remains authoritative.
      }
      if (isSafeDOMError(error)) throw error;
      throw createSafeDOMError("DOM_OPERATION_FAILED", "SafeDocument.eventBoundary");
    }
  }

  #installTargetBoundary(real: Element): () => void {
    const controller = this.platform.createAbortController();
    const signal = this.platform.getAbortSignal(controller);
    const stopAtTarget = (event: Event): void => {
      this.platform.stopEventPropagation(event);
    };
    try {
      for (const eventName of TARGET_FENCE_EVENT_TYPES) {
        this.platform.addEventListener(real, eventName, stopAtTarget, signal);
      }
    } catch (error) {
      try {
        this.platform.abort(controller);
      } catch {
        // The original normalized installation error remains authoritative.
      }
      if (isSafeDOMError(error)) throw error;
      throw createSafeDOMError("DOM_OPERATION_FAILED", "SafeElement.eventBoundary");
    }

    let active = true;
    return (): void => {
      if (!active) return;
      this.platform.abort(controller);
      active = false;
    };
  }

  #disposeRootBoundary(): void {
    if (this.#rootBoundaryDisposed) return;
    this.platform.abort(this.#rootBoundaryController);
    this.#rootBoundaryDisposed = true;
  }

  #commitNamespaceMutation(
    entry: RegistryEntry,
    prepared: PreparedNamespaceMutation,
  ): void {
    if (!this.platform.isElement(entry.real)) {
      throw createSafeDOMError("DOM_OPERATION_FAILED", "IdentifierNamespace.element");
    }
    const real = entry.real;
    const previousPhysical = this.platform.getAttribute(real, prepared.attributeName);
    const restorePrevious = (): boolean => {
      try {
        const current = this.platform.getAttribute(real, prepared.attributeName);
        if (current !== previousPhysical) {
          if (previousPhysical === null) this.platform.removeAttribute(real, prepared.attributeName);
          else this.platform.setAttribute(real, prepared.attributeName, previousPhysical);
        }
      } catch {
        // Readback below decides whether a throwing restoration took effect.
      }
      try {
        return this.platform.getAttribute(real, prepared.attributeName) === previousPhysical;
      } catch {
        return false;
      }
    };
    try {
      if (prepared.physicalValue === null) {
        this.platform.removeAttribute(real, prepared.attributeName);
      } else {
        this.platform.setAttribute(real, prepared.attributeName, prepared.physicalValue);
      }
    } catch (mutationError) {
      if (!restorePrevious()) {
        this.#identifierNamespace.recordFailedMutation(entry, prepared);
        entry.state = "revoked";
        throw createSafeDOMError("DOM_OPERATION_FAILED", "IdentifierNamespace.rollback");
      }
      if (isSafeDOMError(mutationError)) throw mutationError;
      throw createSafeDOMError("DOM_OPERATION_FAILED", "IdentifierNamespace.mutation");
    }

    prepared.commit();
  }

  #auditPlacements(): Set<RegistryEntry> {
    const compromised = new Set<RegistryEntry>();
    const trackedEntries = this.registry.entries();
    for (const entry of trackedEntries) {
      if (entry.state === "active" && !this.#hasSafePlacement(entry)) {
        compromised.add(entry);
      }
    }
    const compromisedEntries = [...compromised];
    // Snapshot the complete terminal worklist before revoking or untracking
    // any ancestor. Descendants may already be revoked or disposed after an
    // unproven rollback and still retain logical state.
    const terminalEntries = trackedEntries.filter((entry) => (
      !entry.terminalFinalized
      && compromisedEntries.some((rootEntry) => this.#isWithin(entry.real, rootEntry.real))
    )).map((entry) => ({
      cleanup: this.#terminalCleanup(entry),
      entry,
      state: entry.state === "active" ? "revoked" as const : entry.state,
    }));
    for (const { entry } of terminalEntries) {
      if (entry.state === "active") entry.state = "revoked";
    }
    let firstFailure: SafeDOMError | undefined;
    for (const { cleanup, entry, state } of terminalEntries) {
      try {
        this.#finalizeEntry(entry, state, "none", cleanup);
      } catch (error) {
        firstFailure ??= isSafeDOMError(error)
          ? error
          : createSafeDOMError("DOM_OPERATION_FAILED", "SafeElement.revoke");
      }
    }
    if (firstFailure !== undefined) throw firstFailure;
    return compromised;
  }

  #hasSafePlacement(entry: RegistryEntry): boolean {
    if (this.platform.ownerDocument(entry.real) !== this.ownerDocument) return false;
    let current: Node = entry.real;
    for (;;) {
      const parent = this.platform.parentNode(current);
      if (parent === null || parent === this.root) return true;
      const parentEntry = this.registry.getEntryByReal(parent as RealNode);
      if (parentEntry?.state !== "active") return false;
      current = parent;
    }
  }

  #hasOwnedPlacement(entry: RegistryEntry): boolean {
    if (this.platform.ownerDocument(entry.real) !== this.ownerDocument) return false;
    let current: Node = entry.real;
    for (;;) {
      const parent = this.platform.parentNode(current);
      if (parent === null || parent === this.root) return true;
      const parentEntry = this.registry.getEntryByReal(parent as RealNode);
      if (parentEntry === undefined) return false;
      current = parent;
    }
  }

  #terminalCleanup(entry: RegistryEntry): TerminalCleanup {
    return this.#hasOwnedPlacement(entry) ? "owned-physical" : "logical-only";
  }

  #isWithin(candidate: RealNode, ancestor: Node): boolean {
    let current: Node | null = candidate;
    while (current !== null) {
      if (current === ancestor) return true;
      current = this.platform.parentNode(current);
    }
    return false;
  }

  #clearOwnedResources(entry: RegistryEntry): void {
    let firstFailure: SafeDOMError | undefined;
    for (const pending of [...entry.pendingEffects]) {
      try {
        pending.cleanup();
        entry.pendingEffects.delete(pending);
      } catch (error) {
        firstFailure ??= isSafeDOMError(error)
          ? error
          : createSafeDOMError("DOM_OPERATION_FAILED", "SafeElement.clearPendingEffect");
      }
    }
    if (!this.platform.isElement(entry.real)) {
      if (firstFailure !== undefined) throw firstFailure;
      return;
    }
    try {
      this.#identifierNamespace.clearPhysicalEffects(entry);
    } catch (error) {
      firstFailure ??= isSafeDOMError(error)
        ? error
        : createSafeDOMError("DOM_OPERATION_FAILED", "IdentifierNamespace.clear");
    }
    if (entry.specializedKind === "canvas") {
      const canvas = entry.real as HTMLCanvasElement;
      try {
        this.platform.setCanvasWidth(canvas, 0);
      } catch (error) {
        firstFailure ??= isSafeDOMError(error)
          ? error
          : createSafeDOMError("DOM_OPERATION_FAILED", "SafeCanvasElement.clearWidth");
      }
      try {
        this.platform.setCanvasHeight(canvas, 0);
      } catch (error) {
        firstFailure ??= isSafeDOMError(error)
          ? error
          : createSafeDOMError("DOM_OPERATION_FAILED", "SafeCanvasElement.clearHeight");
      }
      try {
        const width = this.platform.getCanvasWidth(canvas);
        const height = this.platform.getCanvasHeight(canvas);
        assertCanvasDimension(width);
        assertCanvasDimension(height);
        if (width !== 0 || height !== 0) {
          throw createSafeDOMError(
            "DOM_OPERATION_FAILED",
            "SafeCanvasElement.clearDimensions",
          );
        }
      } catch (error) {
        firstFailure ??= isSafeDOMError(error)
          ? error
          : createSafeDOMError("DOM_OPERATION_FAILED", "SafeCanvasElement.clearDimensions");
      }
    }
    for (const name of entry.requestAttributes) {
      try {
        this.platform.removeAttribute(entry.real, name);
      } catch (error) {
        firstFailure ??= isSafeDOMError(error)
          ? error
          : createSafeDOMError("DOM_OPERATION_FAILED", "SafeElement.clearRequest");
      }
    }
    if (entry.styleCleanupRequired) {
      try {
        this.platform.removeAttribute(entry.real, "style");
      } catch (error) {
        firstFailure ??= isSafeDOMError(error)
          ? error
          : createSafeDOMError("DOM_OPERATION_FAILED", "SafeElement.clearStyle");
      }
    }
    if (firstFailure !== undefined) throw firstFailure;
  }

  #finalizeTerminalSubtree(
    rootEntry: RegistryEntry,
    state: "disposed" | "revoked",
    rootDetach: "none" | "always",
  ): void {
    const pendingDescendants = this.registry.entries().filter((candidate) => (
      candidate !== rootEntry
      && !candidate.terminalFinalized
      && this.#isWithin(candidate.real, rootEntry.real)
    )).map((candidate) => ({
      cleanup: this.#terminalCleanup(candidate),
      entry: candidate,
      state: candidate.state === "active" ? state : candidate.state,
    }));
    const rootCleanup = this.#terminalCleanup(rootEntry);
    const rootState = rootEntry.state === "active" ? state : rootEntry.state;
    let firstFailure: SafeDOMError | undefined;
    for (const candidate of pendingDescendants) {
      try {
        this.#finalizeEntry(candidate.entry, candidate.state, "none", candidate.cleanup);
      } catch (error) {
        firstFailure ??= isSafeDOMError(error)
          ? error
          : createSafeDOMError("DOM_OPERATION_FAILED", `SafeElement.${state}.descendant`);
      }
    }
    try {
      this.#finalizeEntry(rootEntry, rootState, rootDetach, rootCleanup);
    } catch (error) {
      firstFailure ??= isSafeDOMError(error)
        ? error
        : createSafeDOMError("DOM_OPERATION_FAILED", `SafeElement.${state}`);
    }
    if (firstFailure !== undefined) throw firstFailure;
  }

  #finalizeEntry(
    entry: RegistryEntry,
    state: "disposed" | "revoked",
    detach: "none" | "always" | "from-root",
    cleanup: TerminalCleanup,
  ): void {
    if (entry.terminalFinalized) return;
    if (entry.state === "active") entry.state = state;
    else if (entry.state !== state) return;

    // Capability revocation happens before cleanup. Physical cleanup is only
    // allowed while the raw node remains in an owned placement. Once the host
    // has moved it outside the mount, the raw bytes belong to the host: abort
    // wrapper listeners and release logical state without writing
    // attributes, style, text, IDL state, or tree placement.
    let firstFailure: SafeDOMError | undefined;
    if (cleanup === "owned-physical") {
      try {
        this.#clearOwnedResources(entry);
      } catch (error) {
        firstFailure ??= isSafeDOMError(error)
          ? error
          : createSafeDOMError("DOM_OPERATION_FAILED", `SafeElement.${state}.resources`);
      }
    } else {
      entry.pendingEffects.clear();
      entry.styleCleanupRequired = false;
      entry.requestAttributes.clear();
    }
    for (const cleanup of [...entry.listeners]) {
      try {
        cleanup();
      } catch (error) {
        firstFailure ??= isSafeDOMError(error)
          ? error
          : createSafeDOMError("DOM_OPERATION_FAILED", `SafeElement.${state}.listener`);
      }
    }
    if (detach !== "none") {
      try {
        const parent = this.platform.parentNode(entry.real);
        if (parent !== null && (detach === "always" || parent === this.root)) {
          this.platform.removeChild(parent, entry.real, "Node.remove");
        }
      } catch (error) {
        firstFailure ??= isSafeDOMError(error)
          ? error
          : createSafeDOMError("DOM_OPERATION_FAILED", `SafeElement.${state}.detach`);
      }
    }
    if (firstFailure !== undefined) throw firstFailure;
    this.#identifierNamespace.releaseEntry(entry);
    entry.requestAttributes.clear();
    entry.terminalFinalized = true;
    this.registry.stopTracking(entry);
  }

  #updateResources(
    entry: RegistryEntry,
    changes: readonly ResourceChange[],
    action: () => void,
  ): void {
    const slots = this.#snapshotMutationSlots(entry, changes);

    try {
      action();
    } catch (error) {
      const restored = this.#restoreMutationSlots(slots);
      if (!restored) {
        const pending: PendingPhysicalEffect = {
          cleanup: (): void => {
            if (!this.#restoreMutationSlots(slots)) {
              throw createSafeDOMError(
                "DOM_OPERATION_FAILED",
                "SafeDocument.resourceRollback",
              );
            }
          },
        };
        entry.pendingEffects.add(pending);
        entry.state = "revoked";
        throw createSafeDOMError("DOM_OPERATION_FAILED", "SafeDocument.resourceRollback");
      }
      if (isSafeDOMError(error)) throw error;
      throw createSafeDOMError(
        "DOM_OPERATION_FAILED",
        "The DOM mutation could not be completed",
      );
    }
  }

  #snapshotMutationSlots(
    entry: RegistryEntry,
    changes: readonly ResourceChange[],
  ): readonly MutationSlot[] {
    const slots = new Map<string, MutationSlot>();
    for (const change of changes) {
      const kind = change.resource;
      const key = `${kind}:${change.slot}`;
      if (slots.has(key)) continue;
      const access = this.#physicalSlotAccess(entry, kind, change.slot);
      slots.set(key, {
        key,
        kind,
        slot: change.slot,
        attempted: change.value,
        previous: access.read(),
        read: access.read,
        write: access.write,
      });
    }
    return [...slots.values()];
  }

  #physicalSlotAccess(
    entry: RegistryEntry,
    kind: "attribute" | "text",
    slot: string,
  ): Pick<MutationSlot, "read" | "write"> {
    if (kind === "attribute") {
      if (!this.platform.isElement(entry.real)) {
        throw createSafeDOMError("DOM_OPERATION_FAILED", "SafeDocument.attributeSlot");
      }
      const element = entry.real;
      return {
        read: () => this.platform.getAttribute(element, slot),
        write: (value) => {
          if (value === null) this.platform.removeAttribute(element, slot);
          else this.platform.setAttribute(element, slot, value);
        },
      };
    }

    if (slot === "textContent" || slot === "data") {
      return {
        read: () => this.platform.getTextContent(entry.real),
        write: (value) => this.platform.setTextContent(entry.real, value ?? ""),
      };
    }
    if (slot === "value" && entry.specializedKind === "input") {
      const element = entry.real as HTMLInputElement;
      return {
        read: () => this.platform.getInputValue(element),
        write: (value) => this.platform.setInputValue(element, value ?? ""),
      };
    }
    if (slot === "value" && entry.specializedKind === "textarea") {
      const element = entry.real as HTMLTextAreaElement;
      return {
        read: () => this.platform.getTextareaValue(element),
        write: (value) => this.platform.setTextareaValue(element, value ?? ""),
      };
    }
    if (slot === "value" && entry.specializedKind === "select") {
      const element = entry.real as HTMLSelectElement;
      return {
        read: () => this.platform.getSelectValue(element),
        write: (value) => this.platform.setSelectValue(element, value ?? ""),
      };
    }
    throw createSafeDOMError("DOM_OPERATION_FAILED", "SafeDocument.textSlot");
  }

  #restoreMutationSlots(slots: readonly MutationSlot[]): boolean {
    for (const slot of slots) {
      try {
        if (slot.read() === slot.previous) continue;
      } catch {
        // A failed read cannot prove that no restoration write is needed.
      }
      try {
        slot.write(slot.previous);
      } catch {
        // Readback below decides whether a throwing restoration took effect.
      }
    }
    let restored = true;
    for (const slot of slots) {
      try {
        if (slot.read() !== slot.previous) restored = false;
      } catch {
        restored = false;
      }
    }
    return restored;
  }

}

interface ResourceChange {
  readonly resource: "attribute" | "text";
  readonly slot: string;
  readonly value: string | null;
}

interface MutationSlot {
  readonly key: string;
  readonly kind: "attribute" | "text";
  readonly slot: string;
  readonly attempted: string | null;
  readonly previous: string | null;
  readonly read: () => string | null;
  readonly write: (value: string | null) => void;
}

export interface ContentResourceChange {
  readonly resource: "attribute" | "text";
  readonly slot: string;
  readonly value: string | null;
}

export interface ContentResourceTransaction {
  readonly changes: readonly ContentResourceChange[];
  readonly action: () => void;
}

export function createDocumentContext(
  rootCapability: unknown,
  options?: SafeDocumentOptions,
): DocumentContext {
  const { root, ownerDocument, view } = getNativeRoot(rootCapability);
  if (claimedRoots.has(root)) {
    throw createSafeDOMError(
      "ROOT_ALREADY_CLAIMED",
      "A ShadowRoot can be claimed by only one SafeDocument",
    );
  }

  // Invalid options do not consume the root capability.
  const context = new DocumentContextImplementation(root, ownerDocument, view, options);
  claimedRoots.add(root);
  return context;
}
