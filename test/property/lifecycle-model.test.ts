// @vitest-environment jsdom

import fc, { type Arbitrary, type Command } from "fast-check";
import { beforeEach, describe, expect, it } from "vitest";
import {
  createSafeDocument,
  type SafeContainerElement,
  type SafeDocument,
  type SafeElement,
  type SafeImageElement,
  type SafeLabelElement,
  type SafeTextNode,
  type SafeURLDecision,
} from "../../src/index.ts";
import { testHarden } from "../support/harden.ts";
import {
  assertStableBoundaryError,
  commandReplayPath,
  propertyEnvironment,
  propertyParameters,
} from "../support/property-config.ts";

type NodeState = "active" | "disposed" | "revoked";
type NodeKind = "container" | "image" | "button" | "text" | "list" | "label";
type Placement =
  | { readonly kind: "detached" }
  | { readonly kind: "root" }
  | { readonly kind: "owned-parent"; readonly parentId: number }
  | { readonly kind: "external" }
  | { readonly kind: "foreign-document" };
type ModelWrapper = SafeElement | SafeTextNode;

interface ModelNode {
  readonly id: number;
  readonly kind: NodeKind;
  state: NodeState;
  placement: Placement;
  logicalId?: string;
  physicalToken?: string;
  reference?: string;
  textValue: string;
  titleValue?: string;
  readonly styles: Map<string, string>;
  readonly requests: Map<string, string>;
  readonly listeners: Set<number>;
  cleanupApplied: boolean;
  externalSnapshot?: string;
}

interface ListenerModel {
  readonly id: number;
  readonly nodeId: number;
  active: boolean;
}

interface Model {
  documentState: "active" | "disposed";
  readonly nodes: Map<number, ModelNode>;
  nextNodeId: number;
  nextListenerId: number;
  readonly listeners: Map<number, ListenerModel>;
  readonly listenerCalls: Map<number, number>;
  readonly logicalIds: Map<string, number>;
  readonly logicalReferences: Map<string, number>;
  readonly physicalTokens: Map<string, string>;
}

interface Real {
  readonly safeDocument: SafeDocument;
  readonly root: ShadowRoot;
  readonly host: HTMLElement;
  readonly outsideSentinel: HTMLElement;
  readonly outsideSnapshot: string;
  readonly external: HTMLElement;
  readonly foreignDocument: Document;
  readonly foreignExternal: HTMLElement;
  readonly wrappers: Map<number, ModelWrapper>;
  readonly rawNodes: Map<number, Node>;
  readonly cleanups: Map<number, () => void>;
  readonly callbackCounts: Map<number, number>;
  readonly capturedElements: Element[];
  readonly capturedTexts: Text[];
  destroy(): void;
}

const generateSyncCommands: (
  commandArbitraries: Arbitrary<Command<Model, Real>>[],
  constraints?: { maxCommands?: number; replayPath?: string },
) => Arbitrary<Iterable<Command<Model, Real>>> = fc.commands;

const MODEL_URL_POLICY = Object.freeze({
  baseURL: "https://model.test/",
  sinks: Object.freeze({
    "image.src": Object.freeze({ allowedOrigins: Object.freeze(["https://model.test"]) }),
  }),
});

function createModel(): Model {
  return {
    documentState: "active",
    nodes: new Map(),
    nextNodeId: 0,
    nextListenerId: 0,
    listeners: new Map(),
    listenerCalls: new Map(),
    logicalIds: new Map(),
    logicalReferences: new Map(),
    physicalTokens: new Map(),
  };
}

function createReal(): Real {
  const host = document.createElement("div");
  host.style.contain = "paint";
  const outsideSentinel = document.createElement("p");
  const external = document.createElement("section");
  outsideSentinel.id = "model-outside-sentinel";
  outsideSentinel.setAttribute("data-state", "host-owned");
  outsideSentinel.textContent = "outside-original";
  document.body.append(host, outsideSentinel, external);
  const root = host.attachShadow({ mode: "open" });
  const foreignDocument = document.implementation.createHTMLDocument("foreign");
  const foreignExternal = foreignDocument.createElement("section");
  foreignDocument.body.append(foreignExternal);
  const capturedElements: Element[] = [];
  const capturedTexts: Text[] = [];
  const documentPrototype = window.Document.prototype;
  const createElementDescriptor = Object.getOwnPropertyDescriptor(documentPrototype, "createElement");
  const createTextDescriptor = Object.getOwnPropertyDescriptor(documentPrototype, "createTextNode");
  if (
    createElementDescriptor === undefined
    || typeof createElementDescriptor.value !== "function"
    || createTextDescriptor === undefined
    || typeof createTextDescriptor.value !== "function"
  ) {
    throw new Error("expected owner-realm Document creation methods");
  }
  const nativeCreateElement = createElementDescriptor.value;
  const nativeCreateText = createTextDescriptor.value;
  Object.defineProperty(documentPrototype, "createElement", {
    ...createElementDescriptor,
    value(this: Document, qualifiedName: string, options?: ElementCreationOptions): Element {
      const argumentsList = options === undefined ? [qualifiedName] : [qualifiedName, options];
      const created = Reflect.apply(nativeCreateElement, this, argumentsList);
      if (!(created instanceof Element)) throw new Error("expected captured Element");
      capturedElements.push(created);
      return created;
    },
  });
  Object.defineProperty(documentPrototype, "createTextNode", {
    ...createTextDescriptor,
    value(this: Document, data: string): Text {
      const created = Reflect.apply(nativeCreateText, this, [data]);
      if (!(created instanceof Text)) throw new Error("expected captured Text");
      capturedTexts.push(created);
      return created;
    },
  });

  let safeDocument: SafeDocument;
  try {
    safeDocument = createSafeDocument(root, {
      harden: testHarden,
      formControlPolicy: { allowNonCredentialFormElements: true },
      urlPolicy: MODEL_URL_POLICY,
      stylePolicy: { allowedProperties: ["color", "opacity"] },
    });
  } finally {
    Object.defineProperty(documentPrototype, "createElement", createElementDescriptor);
    Object.defineProperty(documentPrototype, "createTextNode", createTextDescriptor);
  }

  return {
    safeDocument,
    root,
    host,
    outsideSentinel,
    outsideSnapshot: outsideSentinel.outerHTML,
    external,
    foreignDocument,
    foreignExternal,
    wrappers: new Map(),
    rawNodes: new Map(),
    cleanups: new Map(),
    callbackCounts: new Map(),
    capturedElements,
    capturedTexts,
    destroy(): void {
      try {
        safeDocument.dispose();
      } finally {
        host.remove();
        outsideSentinel.remove();
        external.remove();
      }
    },
  };
}

function requireNode(model: Model, id: number): ModelNode {
  const node = model.nodes.get(id);
  if (node === undefined) throw new Error(`missing model node ${id}`);
  return node;
}

function requireWrapper(real: Real, id: number): ModelWrapper {
  const wrapper = real.wrappers.get(id);
  if (wrapper === undefined) throw new Error(`missing wrapper ${id}`);
  return wrapper;
}

function requireRaw(real: Real, id: number): Node {
  const raw = real.rawNodes.get(id);
  if (raw === undefined) throw new Error(`missing raw node ${id}`);
  return raw;
}

function requireElementWrapper(wrapper: ModelWrapper): SafeElement {
  if (!("style" in wrapper)) throw new Error("expected element wrapper");
  return wrapper;
}

function isContainerWrapper(wrapper: ModelWrapper): wrapper is SafeContainerElement {
  return "appendChild" in wrapper && "setText" in wrapper && "style" in wrapper;
}

function requireContainerWrapper(wrapper: ModelWrapper): SafeContainerElement {
  if (!isContainerWrapper(wrapper)) throw new Error("expected container wrapper");
  return wrapper;
}

function isImageWrapper(wrapper: ModelWrapper): wrapper is SafeImageElement {
  return "setSrc" in wrapper && "setAlt" in wrapper && "style" in wrapper;
}

function requireImageWrapper(wrapper: ModelWrapper): SafeImageElement {
  if (!isImageWrapper(wrapper)) throw new Error("expected image wrapper");
  return wrapper;
}

function isLabelWrapper(wrapper: ModelWrapper): wrapper is SafeLabelElement {
  return isContainerWrapper(wrapper) && "setFor" in wrapper && "getFor" in wrapper;
}

function requireLabelWrapper(wrapper: ModelWrapper): SafeLabelElement {
  if (!isLabelWrapper(wrapper)) throw new Error("expected label wrapper");
  return wrapper;
}

function nodeStateCode(node: ModelNode): "NODE_DISPOSED" | "NODE_REVOKED" | undefined {
  if (node.state === "disposed") return "NODE_DISPOSED";
  if (node.state === "revoked") return "NODE_REVOKED";
  return undefined;
}

function isDescendant(model: Model, candidateId: number, ancestorId: number): boolean {
  let current = model.nodes.get(candidateId);
  const visited = new Set<number>();
  while (current?.placement.kind === "owned-parent") {
    if (visited.has(current.id)) return false;
    visited.add(current.id);
    if (current.placement.parentId === ancestorId) return true;
    current = model.nodes.get(current.placement.parentId);
  }
  return false;
}

function subtreeIds(model: Model, rootId: number): number[] {
  return [...model.nodes.keys()].filter((id) => id === rootId || isDescendant(model, id, rootId));
}

function collectIdentifierRecord(model: Model, logicalId: string): void {
  if (model.logicalIds.has(logicalId) || (model.logicalReferences.get(logicalId) ?? 0) > 0) return;
  model.physicalTokens.delete(logicalId);
}

function releaseNodeState(model: Model, node: ModelNode, state: Exclude<NodeState, "active">): void {
  node.state = state;
  if (node.cleanupApplied) return;
  for (const listenerId of node.listeners) {
    const listener = model.listeners.get(listenerId);
    if (listener?.active) {
      listener.active = false;
    }
  }
  if (node.logicalId !== undefined && node.logicalId !== "") {
    model.logicalIds.delete(node.logicalId);
    collectIdentifierRecord(model, node.logicalId);
  }
  if (node.reference !== undefined && node.reference !== "") {
    const references = model.logicalReferences.get(node.reference) ?? 0;
    if (references <= 1) model.logicalReferences.delete(node.reference);
    else model.logicalReferences.set(node.reference, references - 1);
    collectIdentifierRecord(model, node.reference);
  }
  node.styles.clear();
  node.requests.clear();
  delete node.logicalId;
  delete node.physicalToken;
  delete node.reference;
  node.cleanupApplied = true;
}

function terminateSubtree(model: Model, rootId: number, state: Exclude<NodeState, "active">): void {
  for (const id of subtreeIds(model, rootId)) {
    const node = requireNode(model, id);
    if (node.state === "active" || node.state === state) releaseNodeState(model, node, state);
  }
}

function expectedOwnerDocument(model: Model, node: ModelNode, real: Real): Document {
  let current = node;
  const visited = new Set<number>();
  for (;;) {
    if (visited.has(current.id)) return document;
    visited.add(current.id);
    if (current.placement.kind === "foreign-document") return real.foreignDocument;
    if (current.placement.kind !== "owned-parent") return document;
    current = requireNode(model, current.placement.parentId);
  }
}

function assertDecision(decision: SafeURLDecision): void {
  expect(Object.isFrozen(decision)).toBe(true);
  expect(Reflect.ownKeys(decision)).toEqual(decision.allowed ? ["allowed", "url"] : ["allowed", "error"]);
  if (!decision.allowed) assertStableBoundaryError(decision.error, "ERR_URL_DENIED");
}

function assertInvariants(model: Model, real: Real): void {
  expect(real.outsideSentinel.outerHTML).toBe(real.outsideSnapshot);
  for (const node of model.nodes.values()) {
    const raw = requireRaw(real, node.id);
    const wrapper = requireWrapper(real, node.id);
    let expectedParent: Node | null;
    switch (node.placement.kind) {
      case "detached": expectedParent = null; break;
      case "root": expectedParent = real.root; break;
      case "owned-parent": expectedParent = requireRaw(real, node.placement.parentId); break;
      case "external": expectedParent = real.external; break;
      case "foreign-document": expectedParent = real.foreignExternal; break;
    }
    expect(raw.parentNode, `raw parent mismatch for node ${node.id}`).toBe(expectedParent);
    expect(raw.ownerDocument, `ownerDocument mismatch for node ${node.id}`).toBe(
      expectedOwnerDocument(model, node, real),
    );
    expect(Object.isFrozen(wrapper)).toBe(true);
    for (const value of Object.values(wrapper)) {
      if (typeof value === "function" || (typeof value === "object" && value !== null)) {
        expect(Object.isFrozen(value)).toBe(true);
      }
    }
    if (node.kind === "text") expect(raw.textContent).toBe(node.textValue);
    if (raw instanceof HTMLElement) {
      if (node.state === "active") {
        expect(raw.style.length, `unexpected style slot count for node ${node.id}`).toBe(
          node.styles.size,
        );
        for (const [property, value] of node.styles) {
          expect(raw.style.getPropertyValue(property)).toBe(value);
        }
        expect(raw.getAttribute("src"), `request state mismatch for node ${node.id}`).toBe(
          node.requests.get("src") ?? null,
        );
        expect(raw.getAttribute("title"), `title state mismatch for node ${node.id}`).toBe(
          node.titleValue ?? null,
        );
        if (node.kind === "button") expect(raw.getAttribute("type")).toBe("button");
        if (node.logicalId !== undefined && node.logicalId !== "") {
          expect(raw.getAttribute("id")).toBe(node.physicalToken);
          expect(node.physicalToken).toMatch(/^aoa-i-[0-9a-f]{48}$/u);
          expect(node.physicalToken).not.toBe(node.logicalId);
        } else {
          expect(raw.getAttribute("id"), `identifier state mismatch for node ${node.id}`).toBeNull();
        }
        if (node.kind === "label") {
          expect(raw.getAttribute("for"), `reference state mismatch for node ${node.id}`).toBe(
            node.reference === undefined
              ? null
              : node.reference === ""
                ? ""
                : model.physicalTokens.get(node.reference),
          );
        }
      } else if (node.state === "revoked" && node.externalSnapshot !== undefined) {
        expect(raw.outerHTML, `external markup changed for node ${node.id}`).toBe(
          node.externalSnapshot,
        );
      } else {
        expect(raw.style.cssText, `style survived termination for node ${node.id}`).toBe("");
        expect(raw.hasAttribute("src"), `request survived termination for node ${node.id}`).toBe(false);
        expect(raw.hasAttribute("id"), `identifier survived termination for node ${node.id}`).toBe(false);
        expect(raw.hasAttribute("for"), `reference survived termination for node ${node.id}`).toBe(false);
        expect(raw.getAttribute("title"), `safe title changed for node ${node.id}`).toBe(
          node.titleValue ?? null,
        );
        if (node.kind === "button") expect(raw.getAttribute("type")).toBe("button");
      }
    }
  }
  for (const [listenerId, expectedCalls] of model.listenerCalls) {
    expect(real.callbackCounts.get(listenerId) ?? 0).toBe(expectedCalls);
  }
  for (const [logicalId, nodeId] of model.logicalIds) {
    const node = requireNode(model, nodeId);
    expect(node.logicalId).toBe(logicalId);
    expect(node.state).toBe("active");
  }
  for (const [logicalId, token] of model.physicalTokens) {
    expect(token, `physical token mismatch for ${logicalId}`).toMatch(/^aoa-i-[0-9a-f]{48}$/u);
    expect(model.logicalIds.has(logicalId) || (model.logicalReferences.get(logicalId) ?? 0) > 0)
      .toBe(true);
  }
  if (model.documentState === "disposed") expect(real.root.childNodes).toHaveLength(0);
}

type CommandSpec =
  | { readonly type: "create"; readonly id: number; readonly kind: NodeKind }
  | { readonly type: "append"; readonly childId: number; readonly parentId: number | "root" }
  | { readonly type: "detach"; readonly nodeId: number }
  | { readonly type: "raw-move"; readonly nodeId: number; readonly mode: "reparent" | "adopt" }
  | { readonly type: "add-listener"; readonly nodeId: number; readonly listenerId: number }
  | { readonly type: "dispatch"; readonly nodeId: number }
  | { readonly type: "cleanup-listener"; readonly listenerId: number }
  | { readonly type: "style"; readonly nodeId: number; readonly action: "red" | "blue" | "denied" | "remove" }
  | { readonly type: "request"; readonly nodeId: number; readonly recipe: "allowed" | "denied" | "malformed" | "non-primitive"; readonly token: number }
  | { readonly type: "set-text"; readonly nodeId: number; readonly value: string }
  | { readonly type: "set-title"; readonly nodeId: number; readonly value: string }
  | { readonly type: "set-id"; readonly nodeId: number; readonly logicalId: string }
  | { readonly type: "set-reference"; readonly nodeId: number; readonly logicalId: string }
  | { readonly type: "lookup-id"; readonly logicalId: string }
  | { readonly type: "dispose-node"; readonly nodeId: number }
  | { readonly type: "dispose-document" };

type ExpectedCode =
  | "DOCUMENT_DISPOSED"
  | "NODE_DISPOSED"
  | "NODE_REVOKED"
  | "PLACEMENT_VIOLATION"
  | "DOM_OPERATION_FAILED"
  | "DUPLICATE_IDENTIFIER";

function executeExpected<Result>(
  expectedCode: ExpectedCode | undefined,
  action: () => Result,
): Result | undefined {
  try {
    const result = action();
    if (expectedCode !== undefined) {
      throw new Error(`expected ${expectedCode}, but the operation succeeded`);
    }
    return result;
  } catch (error) {
    if (expectedCode === undefined) throw error;
    assertStableBoundaryError(error, expectedCode);
    return undefined;
  }
}

function factoryForKind(safeDocument: SafeDocument, kind: NodeKind): ModelWrapper {
  switch (kind) {
    case "container": return safeDocument.createDiv();
    case "image": return safeDocument.createImage();
    case "button": return safeDocument.createButton();
    case "text": return safeDocument.createTextNode();
    case "list": return safeDocument.createList("unordered");
    case "label": return safeDocument.createLabel();
  }
}

function takeCapturedRaw(real: Real, kind: NodeKind): Node {
  const raw = kind === "text" ? real.capturedTexts.shift() : real.capturedElements.shift();
  if (raw === undefined) throw new Error(`factory ${kind} did not expose one captured raw node`);
  return raw;
}

function executeCreate(model: Model, real: Real, spec: Extract<CommandSpec, { type: "create" }>): void {
  const expectedCode = model.documentState === "disposed" ? "DOCUMENT_DISPOSED" : undefined;

  const wrapper = executeExpected(expectedCode, () => factoryForKind(real.safeDocument, spec.kind));
  if (expectedCode !== undefined) {
    expect(real.capturedElements).toHaveLength(0);
    expect(real.capturedTexts).toHaveLength(0);
    return;
  }
  if (wrapper === undefined) throw new Error("successful creation returned no wrapper");
  const raw = takeCapturedRaw(real, spec.kind);
  model.nodes.set(spec.id, {
    id: spec.id,
    kind: spec.kind,
    state: "active",
    placement: { kind: "detached" },
    textValue: "",
    styles: new Map(),
    requests: new Map(),
    listeners: new Set(),
    cleanupApplied: false,
  });
  model.nextNodeId = Math.max(model.nextNodeId, spec.id + 1);
  real.wrappers.set(spec.id, wrapper);
  real.rawNodes.set(spec.id, raw);
}

function appendExpectedCode(
  model: Model,
  child: ModelNode,
  parent: ModelNode | undefined,
): ExpectedCode | undefined {
  if (model.documentState === "disposed") return "DOCUMENT_DISPOSED";
  if (parent !== undefined) {
    const parentCode = nodeStateCode(parent);
    if (parentCode !== undefined) return parentCode;
  }
  const childCode = nodeStateCode(child);
  if (childCode !== undefined) return childCode;
  if (parent !== undefined && (parent.id === child.id || isDescendant(model, parent.id, child.id))) {
    return "DOM_OPERATION_FAILED";
  }
  return undefined;
}

function executeAppend(model: Model, real: Real, spec: Extract<CommandSpec, { type: "append" }>): void {
  const child = requireNode(model, spec.childId);
  const parent = spec.parentId === "root" ? undefined : requireNode(model, spec.parentId);
  const expectedCode = appendExpectedCode(model, child, parent);
  executeExpected(expectedCode, () => {
    const childWrapper = requireWrapper(real, spec.childId);
    if (spec.parentId === "root") real.safeDocument.appendChild(childWrapper);
    else requireContainerWrapper(requireWrapper(real, spec.parentId)).appendChild(childWrapper);
  });
  if (expectedCode === undefined) {
    child.placement = spec.parentId === "root"
      ? { kind: "root" }
      : { kind: "owned-parent", parentId: spec.parentId };
  }
}

function executeDetach(model: Model, real: Real, spec: Extract<CommandSpec, { type: "detach" }>): void {
  const node = requireNode(model, spec.nodeId);
  let expectedCode: ExpectedCode | undefined;
  if (model.documentState === "disposed") expectedCode = "DOCUMENT_DISPOSED";
  else expectedCode = nodeStateCode(node);
  executeExpected(expectedCode, () => requireWrapper(real, spec.nodeId).detach());
  if (expectedCode === undefined) node.placement = { kind: "detached" };
}

function executeRawMove(model: Model, real: Real, spec: Extract<CommandSpec, { type: "raw-move" }>): void {
  const node = requireNode(model, spec.nodeId);
  const raw = requireRaw(real, spec.nodeId);
  const priorStateCode = nodeStateCode(node);
  if (model.documentState === "active" && priorStateCode === undefined) {
    for (const id of subtreeIds(model, spec.nodeId)) {
      const subtreeNode = requireNode(model, id);
      const subtreeRaw = requireRaw(real, id);
      if (subtreeNode.state === "active" && subtreeRaw instanceof Element) {
        subtreeNode.externalSnapshot = subtreeRaw.outerHTML;
      }
    }
  }
  if (spec.mode === "reparent") real.external.append(raw);
  else {
    real.foreignDocument.adoptNode(raw);
    real.foreignExternal.append(raw);
  }
  node.placement = spec.mode === "reparent" ? { kind: "external" } : { kind: "foreign-document" };

  const expectedCode = model.documentState === "disposed"
    ? "DOCUMENT_DISPOSED"
    : priorStateCode ?? "PLACEMENT_VIOLATION";
  executeExpected(expectedCode, () => {
    const wrapper = requireWrapper(real, spec.nodeId);
    if ("getText" in wrapper) return wrapper.getText();
    return requireElementWrapper(wrapper).getClass();
  });
  if (model.documentState === "active" && priorStateCode === undefined) {
    terminateSubtree(model, spec.nodeId, "revoked");
  }
}

function executeAddListener(
  model: Model,
  real: Real,
  spec: Extract<CommandSpec, { type: "add-listener" }>,
): void {
  const node = requireNode(model, spec.nodeId);
  let expectedCode: ExpectedCode | undefined;
  if (model.documentState === "disposed") expectedCode = "DOCUMENT_DISPOSED";
  else expectedCode = nodeStateCode(node);
  const cleanup = executeExpected(expectedCode, () => {
    return requireElementWrapper(requireWrapper(real, spec.nodeId)).onClick(() => {
      real.callbackCounts.set(spec.listenerId, (real.callbackCounts.get(spec.listenerId) ?? 0) + 1);
    });
  });
  if (expectedCode !== undefined) return;
  if (cleanup === undefined) throw new Error("successful listener installation returned no cleanup");
  expect(Object.isFrozen(cleanup)).toBe(true);
  node.listeners.add(spec.listenerId);
  model.listeners.set(spec.listenerId, { id: spec.listenerId, nodeId: node.id, active: true });
  model.listenerCalls.set(spec.listenerId, 0);
  model.nextListenerId = Math.max(model.nextListenerId, spec.listenerId + 1);
  real.cleanups.set(spec.listenerId, cleanup);
}

function executeDispatch(model: Model, real: Real, spec: Extract<CommandSpec, { type: "dispatch" }>): void {
  const node = requireNode(model, spec.nodeId);
  const raw = requireRaw(real, spec.nodeId);
  if (!(raw instanceof Element)) throw new Error("expected event-capable raw element");
  raw.dispatchEvent(new Event("click"));
  if (model.documentState !== "active" || node.state !== "active") return;
  for (const listenerId of node.listeners) {
    const listener = model.listeners.get(listenerId);
    if (listener?.active) {
      model.listenerCalls.set(listenerId, (model.listenerCalls.get(listenerId) ?? 0) + 1);
    }
  }
}

function executeCleanupListener(
  model: Model,
  real: Real,
  spec: Extract<CommandSpec, { type: "cleanup-listener" }>,
): void {
  const listener = model.listeners.get(spec.listenerId);
  const cleanup = real.cleanups.get(spec.listenerId);
  if (listener === undefined || cleanup === undefined) throw new Error("missing modeled listener cleanup");
  cleanup();
  cleanup();
  listener.active = false;
}

function executeStyle(model: Model, real: Real, spec: Extract<CommandSpec, { type: "style" }>): void {
  const node = requireNode(model, spec.nodeId);
  let expectedCode: ExpectedCode | undefined;
  if (model.documentState === "disposed") expectedCode = "DOCUMENT_DISPOSED";
  else expectedCode = nodeStateCode(node);

  const value = spec.action === "red" ? "red" : spec.action === "blue" ? "blue" : undefined;

  const result = executeExpected(expectedCode, () => {
    const style = requireElementWrapper(requireWrapper(real, spec.nodeId)).style;
    if (spec.action === "remove") return style.remove("color");
    if (spec.action === "denied") return style.set("color", "url(https://attacker.test/a.png)");
    return style.set("color", value ?? "");
  });
  if (expectedCode !== undefined) return;
  if (spec.action === "denied") {
    expect(result).toBe(false);
    return;
  }
  expect(result).toBe(true);
  if (spec.action === "remove") {
    node.styles.delete("color");
    return;
  }
  if (value === undefined) throw new Error("missing modeled style value");
  node.styles.set("color", value);
}

function executeRequest(
  model: Model,
  real: Real,
  spec: Extract<CommandSpec, { type: "request" }>,
): void {
  const node = requireNode(model, spec.nodeId);
  let expectedCode: ExpectedCode | undefined;
  if (model.documentState === "disposed") expectedCode = "DOCUMENT_DISPOSED";
  else expectedCode = nodeStateCode(node);

  const input = spec.recipe === "allowed"
    ? `/allowed-${spec.token}.png`
    : spec.recipe === "denied"
      ? `https://attacker.test/${spec.token}.png`
      : spec.recipe === "malformed"
        ? "https://[::1"
        : undefined;
  const allowed = spec.recipe === "allowed";
  const canonical = allowed && input !== undefined
    ? new URL(input, MODEL_URL_POLICY.baseURL).href
    : undefined;

  let traps = 0;
  const nonPrimitive = new Proxy({}, {
    get() {
      traps += 1;
      throw new Error("coercion trap executed");
    },
  });
  const result = executeExpected(expectedCode, () => {
    const image = requireImageWrapper(requireWrapper(real, spec.nodeId));
    return spec.recipe === "non-primitive"
      ? Reflect.apply(image.setSrc, image, [nonPrimitive])
      : image.setSrc(input ?? "");
  });
  expect(traps).toBe(0);
  if (expectedCode !== undefined) return;
  if (result === undefined) throw new Error("URL setter returned no decision");
  assertDecision(result);
  if (!allowed) {
    expect(result.allowed).toBe(false);
    return;
  }
  expect(result.allowed).toBe(true);
  if (!result.allowed || canonical === undefined) throw new Error("expected an allowed canonical URL");
  expect(result.url).toBe(canonical);
  node.requests.set("src", canonical);
}

function executeSetText(
  model: Model,
  real: Real,
  spec: Extract<CommandSpec, { type: "set-text" }>,
): void {
  const node = requireNode(model, spec.nodeId);
  let expectedCode: ExpectedCode | undefined;
  if (model.documentState === "disposed") expectedCode = "DOCUMENT_DISPOSED";
  else expectedCode = nodeStateCode(node);
  executeExpected(expectedCode, () => {
    const wrapper = requireWrapper(real, spec.nodeId);
    if ("style" in wrapper) throw new Error("expected text wrapper");
    wrapper.setText(spec.value);
  });
  if (expectedCode !== undefined) return;
  node.textValue = spec.value;
}

function executeSetTitle(
  model: Model,
  real: Real,
  spec: Extract<CommandSpec, { type: "set-title" }>,
): void {
  const node = requireNode(model, spec.nodeId);
  let expectedCode: ExpectedCode | undefined;
  if (model.documentState === "disposed") expectedCode = "DOCUMENT_DISPOSED";
  else expectedCode = nodeStateCode(node);
  executeExpected(expectedCode, () => {
    requireElementWrapper(requireWrapper(real, spec.nodeId)).setTitle(spec.value);
  });
  if (expectedCode !== undefined) return;
  node.titleValue = spec.value;
}

function executeSetReference(
  model: Model,
  real: Real,
  spec: Extract<CommandSpec, { type: "set-reference" }>,
): void {
  const node = requireNode(model, spec.nodeId);
  let expectedCode: ExpectedCode | undefined;
  if (model.documentState === "disposed") expectedCode = "DOCUMENT_DISPOSED";
  else expectedCode = nodeStateCode(node);

  const oldLogical = node.reference;
  const logicalChanged = oldLogical !== spec.logicalId;

  executeExpected(expectedCode, () => {
    requireLabelWrapper(requireWrapper(real, spec.nodeId)).setFor(spec.logicalId);
  });
  if (expectedCode !== undefined) return;
  if (logicalChanged && oldLogical !== undefined && oldLogical !== "") {
    const oldReferences = model.logicalReferences.get(oldLogical) ?? 0;
    if (oldReferences <= 1) model.logicalReferences.delete(oldLogical);
    else model.logicalReferences.set(oldLogical, oldReferences - 1);
    collectIdentifierRecord(model, oldLogical);
  }
  if (logicalChanged && spec.logicalId !== "") {
    model.logicalReferences.set(
      spec.logicalId,
      (model.logicalReferences.get(spec.logicalId) ?? 0) + 1,
    );
  }
  const raw = requireRaw(real, node.id);
  if (!(raw instanceof Element)) throw new Error("expected physical IDREF element");
  if (spec.logicalId !== "") {
    const physicalToken = raw.getAttribute("for");
    if (physicalToken === null) throw new Error("expected physical identifier reference");
    const knownToken = model.physicalTokens.get(spec.logicalId);
    if (knownToken !== undefined) expect(physicalToken).toBe(knownToken);
    else model.physicalTokens.set(spec.logicalId, physicalToken);
  }
  node.reference = spec.logicalId;
}

function executeSetId(model: Model, real: Real, spec: Extract<CommandSpec, { type: "set-id" }>): void {
  const node = requireNode(model, spec.nodeId);
  let expectedCode: ExpectedCode | undefined;
  if (model.documentState === "disposed") expectedCode = "DOCUMENT_DISPOSED";
  else expectedCode = nodeStateCode(node);

  const oldLogical = node.logicalId ?? "";
  const logicalChanged = oldLogical !== spec.logicalId;
  const duplicateOwner = spec.logicalId === "" ? undefined : model.logicalIds.get(spec.logicalId);
  if (expectedCode === undefined && duplicateOwner !== undefined && duplicateOwner !== node.id) {
    expectedCode = "DUPLICATE_IDENTIFIER";
  }

  executeExpected(expectedCode, () => requireElementWrapper(requireWrapper(real, spec.nodeId)).setId(spec.logicalId));
  if (expectedCode !== undefined) return;
  if (logicalChanged && oldLogical !== "") {
    model.logicalIds.delete(oldLogical);
    collectIdentifierRecord(model, oldLogical);
  }
  if (spec.logicalId === "") {
    delete node.logicalId;
    delete node.physicalToken;
  } else {
    node.logicalId = spec.logicalId;
    model.logicalIds.set(spec.logicalId, node.id);
    const raw = requireRaw(real, node.id);
    if (!(raw instanceof Element)) throw new Error("expected physical ID element");
    const physicalToken = raw.getAttribute("id");
    if (physicalToken === null) throw new Error("expected physical identifier token");
    const knownToken = model.physicalTokens.get(spec.logicalId);
    if (knownToken !== undefined) expect(physicalToken).toBe(knownToken);
    else model.physicalTokens.set(spec.logicalId, physicalToken);
    node.physicalToken = physicalToken;
  }
}

function isMountedInRoot(model: Model, node: ModelNode): boolean {
  let current = node;
  const visited = new Set<number>();
  for (;;) {
    if (visited.has(current.id)) return false;
    visited.add(current.id);
    if (current.placement.kind === "root") return true;
    if (current.placement.kind !== "owned-parent") return false;
    current = requireNode(model, current.placement.parentId);
  }
}

function executeLookupId(
  model: Model,
  real: Real,
  spec: Extract<CommandSpec, { type: "lookup-id" }>,
): void {
  let expectedCode: ExpectedCode | undefined;
  if (model.documentState === "disposed") expectedCode = "DOCUMENT_DISPOSED";
  const result = executeExpected(expectedCode, () => real.safeDocument.getElement(spec.logicalId));
  if (expectedCode !== undefined) return;
  const nodeId = model.logicalIds.get(spec.logicalId);
  const expected = nodeId === undefined
    ? null
    : (() => {
        const node = requireNode(model, nodeId);
        return node.state === "active" && isMountedInRoot(model, node)
          ? requireElementWrapper(requireWrapper(real, nodeId))
          : null;
      })();
  expect(result).toBe(expected);
}

function executeDisposeNode(
  model: Model,
  real: Real,
  spec: Extract<CommandSpec, { type: "dispose-node" }>,
): void {
  const node = requireNode(model, spec.nodeId);
  expect(() => requireWrapper(real, spec.nodeId).dispose()).not.toThrow();
  if (model.documentState === "disposed" || node.state !== "active") return;
  terminateSubtree(model, node.id, "disposed");
  node.placement = { kind: "detached" };
}

function executeDisposeDocument(model: Model, real: Real): void {
  expect(() => real.safeDocument.dispose()).not.toThrow();
  if (model.documentState === "disposed") return;
  for (const node of model.nodes.values()) {
    if (node.state === "active") releaseNodeState(model, node, "disposed");
    if (node.placement.kind === "root") node.placement = { kind: "detached" };
  }
  model.documentState = "disposed";
}

function executeCommand(model: Model, real: Real, spec: CommandSpec): void {
  switch (spec.type) {
    case "create": executeCreate(model, real, spec); break;
    case "append": executeAppend(model, real, spec); break;
    case "detach": executeDetach(model, real, spec); break;
    case "raw-move": executeRawMove(model, real, spec); break;
    case "add-listener": executeAddListener(model, real, spec); break;
    case "dispatch": executeDispatch(model, real, spec); break;
    case "cleanup-listener": executeCleanupListener(model, real, spec); break;
    case "style": executeStyle(model, real, spec); break;
    case "request": executeRequest(model, real, spec); break;
    case "set-text": executeSetText(model, real, spec); break;
    case "set-title": executeSetTitle(model, real, spec); break;
    case "set-id": executeSetId(model, real, spec); break;
    case "set-reference": executeSetReference(model, real, spec); break;
    case "lookup-id": executeLookupId(model, real, spec); break;
    case "dispose-node": executeDisposeNode(model, real, spec); break;
    case "dispose-document": executeDisposeDocument(model, real); break;
  }
}

function kindCanContain(kind: NodeKind): boolean {
  return kind === "container" || kind === "button" || kind === "list" || kind === "label";
}

class LifecycleCommand implements Command<Model, Real> {
  readonly #spec: CommandSpec;

  constructor(spec: CommandSpec) {
    this.#spec = spec;
  }

  check(model: Readonly<Model>): boolean {
    const spec = this.#spec;
    switch (spec.type) {
      case "create": return !model.nodes.has(spec.id);
      case "append": {
        const child = model.nodes.get(spec.childId);
        if (child === undefined) return false;
        if (spec.parentId === "root") return true;
        const parent = model.nodes.get(spec.parentId);
        return parent !== undefined && kindCanContain(parent.kind);
      }
      case "detach":
      case "raw-move":
      case "dispose-node": return model.nodes.has(spec.nodeId);
      case "add-listener": {
        const node = model.nodes.get(spec.nodeId);
        return node !== undefined && node.kind !== "text" && !model.listeners.has(spec.listenerId);
      }
      case "dispatch":
      case "style":
      case "set-title":
      case "set-id": {
        const node = model.nodes.get(spec.nodeId);
        return node !== undefined && node.kind !== "text";
      }
      case "request": return model.nodes.get(spec.nodeId)?.kind === "image";
      case "set-text": return model.nodes.get(spec.nodeId)?.kind === "text";
      case "set-reference": return model.nodes.get(spec.nodeId)?.kind === "label";
      case "cleanup-listener": return model.listeners.has(spec.listenerId);
      case "lookup-id":
      case "dispose-document": return true;
    }
  }

  run(model: Model, real: Real): void {
    try {
      executeCommand(model, real, this.#spec);
    } finally {
      assertInvariants(model, real);
    }
  }

  toString(): string {
    return JSON.stringify(this.#spec);
  }
}

function commandArbitrary(specification: Arbitrary<CommandSpec>): Arbitrary<Command<Model, Real>> {
  return specification.map((spec) => new LifecycleCommand(spec));
}

const NODE_ID = fc.integer({ min: 0, max: 7 });
const LISTENER_ID = fc.integer({ min: 0, max: 15 });
const LOGICAL_ID = fc.constantFrom("", "id-0", "id-1", "id-2", "__proto__", "constructor");

function lifecycleCommands(
  maxCommands: number,
  replayPathOverride?: string | null,
): Arbitrary<Iterable<Command<Model, Real>>> {
  const cleanupListenerCommand = commandArbitrary(
    fc.record({ type: fc.constant("cleanup-listener"), listenerId: LISTENER_ID }),
  );
  const disposeNodeCommand = commandArbitrary(
    fc.record({ type: fc.constant("dispose-node"), nodeId: NODE_ID }),
  );
  const commands: Arbitrary<Command<Model, Real>>[] = [
    commandArbitrary(fc.record({
      type: fc.constant("create"),
      id: NODE_ID,
      kind: fc.constantFrom<NodeKind>("container", "image", "button", "text", "list", "label"),
    })),
    commandArbitrary(fc.record({
      type: fc.constant("append"),
      childId: NODE_ID,
      parentId: fc.oneof(fc.constant("root"), NODE_ID),
    })),
    commandArbitrary(fc.record({ type: fc.constant("detach"), nodeId: NODE_ID })),
    commandArbitrary(fc.record({
      type: fc.constant("raw-move"),
      nodeId: NODE_ID,
      mode: fc.constantFrom("reparent", "adopt"),
    })),
    commandArbitrary(fc.record({
      type: fc.constant("add-listener"),
      nodeId: NODE_ID,
      listenerId: LISTENER_ID,
    })),
    commandArbitrary(fc.record({ type: fc.constant("dispatch"), nodeId: NODE_ID })),
    cleanupListenerCommand,
    commandArbitrary(fc.record({
      type: fc.constant("style"),
      nodeId: NODE_ID,
      action: fc.constantFrom("red", "blue", "denied", "remove"),
    })),
    commandArbitrary(fc.record({
      type: fc.constant("request"),
      nodeId: NODE_ID,
      recipe: fc.constantFrom("allowed", "denied", "malformed", "non-primitive"),
      token: fc.integer({ min: 0, max: 9 }),
    })),
    commandArbitrary(fc.record({
      type: fc.constant("set-text"),
      nodeId: NODE_ID,
      value: fc.constantFrom("", "a", "é", "éa", "12345678"),
    })),
    commandArbitrary(fc.record({
      type: fc.constant("set-title"),
      nodeId: NODE_ID,
      value: fc.constantFrom("", "a", "é", "abc"),
    })),
    commandArbitrary(fc.record({ type: fc.constant("set-id"), nodeId: NODE_ID, logicalId: LOGICAL_ID })),
    commandArbitrary(fc.record({
      type: fc.constant("set-reference"),
      nodeId: NODE_ID,
      logicalId: LOGICAL_ID,
    })),
    commandArbitrary(fc.record({ type: fc.constant("lookup-id"), logicalId: LOGICAL_ID })),
    disposeNodeCommand,
    commandArbitrary(fc.record({ type: fc.constant("dispose-document") })),
  ];
  const replayPath = replayPathOverride === null ? undefined : replayPathOverride ?? commandReplayPath();
  return generateSyncCommands([
    ...commands,
    cleanupListenerCommand,
    disposeNodeCommand,
    disposeNodeCommand,
  ], {
    maxCommands,
    ...(replayPath === undefined ? {} : { replayPath }),
  });
}

function runCommands(commands: Iterable<Command<Model, Real>>): void {
  let currentReal: Real | undefined;
  let modelFailed = false;
  let modelFailure: unknown;
  try {
    fc.modelRun(() => {
      currentReal = createReal();
      return { model: createModel(), real: currentReal };
    }, commands);
  } catch (error) {
    modelFailed = true;
    modelFailure = error;
  }

  try {
    currentReal?.destroy();
  } catch (cleanupError) {
    if (modelFailed) {
      throw new AggregateError(
        [modelFailure, cleanupError],
        "Lifecycle model and fixture disposal both failed",
      );
    }
    throw cleanupError;
  }
  if (modelFailed) throw modelFailure;
}

function fixedCommand(spec: CommandSpec): Command<Model, Real> {
  return new LifecycleCommand(spec);
}

describe.sequential("lifecycle command model", () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it("surfaces an unexpected fixture disposal failure and permits cleanup retry", () => {
    const prototype = window.Node.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "removeChild");
    if (descriptor === undefined || typeof descriptor.value !== "function") {
      throw new Error("expected Node.removeChild");
    }
    const nativeRemoveChild = descriptor.value;
    let failNext = false;
    Object.defineProperty(prototype, "removeChild", {
      ...descriptor,
      value(this: Node, child: Node): Node {
        if (failNext) {
          failNext = false;
          throw document.body;
        }
        return Reflect.apply(nativeRemoveChild, this, [child]);
      },
    });

    let real: Real | undefined;
    try {
      real = createReal();
      const wrapper = real.safeDocument.createDiv();
      real.safeDocument.appendChild(wrapper);
      failNext = true;

      expect(() => real?.destroy()).toThrowError(expect.objectContaining({
        code: "DOM_OPERATION_FAILED",
      }));
      expect(() => real?.destroy()).not.toThrow();
    } finally {
      Object.defineProperty(prototype, "removeChild", descriptor);
      real?.destroy();
    }
  });

  it("runs the mandatory cleanup and revocation witness", () => {
    runCommands([
      fixedCommand({ type: "create", id: 0, kind: "container" }),
      fixedCommand({ type: "create", id: 1, kind: "image" }),
      fixedCommand({ type: "style", nodeId: 1, action: "red" }),
      fixedCommand({ type: "request", nodeId: 1, recipe: "allowed", token: 1 }),
      fixedCommand({ type: "add-listener", nodeId: 1, listenerId: 0 }),
      fixedCommand({ type: "append", childId: 1, parentId: 0 }),
      fixedCommand({ type: "append", childId: 0, parentId: "root" }),
      fixedCommand({ type: "dispatch", nodeId: 1 }),
      fixedCommand({ type: "raw-move", nodeId: 0, mode: "reparent" }),
      fixedCommand({ type: "dispatch", nodeId: 1 }),
      fixedCommand({ type: "create", id: 2, kind: "image" }),
      fixedCommand({ type: "style", nodeId: 2, action: "red" }),
      fixedCommand({ type: "request", nodeId: 2, recipe: "allowed", token: 2 }),
      fixedCommand({ type: "add-listener", nodeId: 2, listenerId: 1 }),
      fixedCommand({ type: "dispose-node", nodeId: 2 }),
      fixedCommand({ type: "dispose-node", nodeId: 2 }),
      fixedCommand({ type: "cleanup-listener", listenerId: 1 }),
    ]);
  });

  it("runs every lifecycle command family in one deterministic trace", () => {
    runCommands([
      fixedCommand({ type: "create", id: 0, kind: "container" }),
      fixedCommand({ type: "create", id: 1, kind: "image" }),
      fixedCommand({ type: "create", id: 2, kind: "button" }),
      fixedCommand({ type: "create", id: 3, kind: "text" }),
      fixedCommand({ type: "create", id: 4, kind: "list" }),
      fixedCommand({ type: "create", id: 5, kind: "label" }),
      fixedCommand({ type: "set-text", nodeId: 3, value: "éa" }),
      fixedCommand({ type: "set-title", nodeId: 5, value: "abc" }),
      fixedCommand({ type: "set-reference", nodeId: 5, logicalId: "id-1" }),
      fixedCommand({ type: "append", childId: 5, parentId: "root" }),
      fixedCommand({ type: "append", childId: 3, parentId: 0 }),
      fixedCommand({ type: "append", childId: 1, parentId: 0 }),
      fixedCommand({ type: "append", childId: 0, parentId: "root" }),
      fixedCommand({ type: "set-id", nodeId: 1, logicalId: "id-0" }),
      fixedCommand({ type: "lookup-id", logicalId: "id-0" }),
      fixedCommand({ type: "detach", nodeId: 1 }),
      fixedCommand({ type: "lookup-id", logicalId: "id-0" }),
      fixedCommand({ type: "append", childId: 1, parentId: 0 }),
      fixedCommand({ type: "lookup-id", logicalId: "id-0" }),
      fixedCommand({ type: "style", nodeId: 1, action: "denied" }),
      fixedCommand({ type: "style", nodeId: 1, action: "red" }),
      fixedCommand({ type: "style", nodeId: 1, action: "remove" }),
      fixedCommand({ type: "request", nodeId: 1, recipe: "malformed", token: 0 }),
      fixedCommand({ type: "request", nodeId: 1, recipe: "denied", token: 1 }),
      fixedCommand({ type: "request", nodeId: 1, recipe: "non-primitive", token: 2 }),
      fixedCommand({ type: "request", nodeId: 1, recipe: "allowed", token: 3 }),
      fixedCommand({ type: "append", childId: 2, parentId: "root" }),
      fixedCommand({ type: "set-id", nodeId: 2, logicalId: "id-1" }),
      fixedCommand({ type: "lookup-id", logicalId: "id-1" }),
      fixedCommand({ type: "add-listener", nodeId: 2, listenerId: 0 }),
      fixedCommand({ type: "dispatch", nodeId: 2 }),
      fixedCommand({ type: "cleanup-listener", listenerId: 0 }),
      fixedCommand({ type: "dispatch", nodeId: 2 }),
      fixedCommand({ type: "append", childId: 0, parentId: 0 }),
      fixedCommand({ type: "append", childId: 4, parentId: "root" }),
      fixedCommand({ type: "raw-move", nodeId: 4, mode: "adopt" }),
      fixedCommand({ type: "raw-move", nodeId: 0, mode: "reparent" }),
      fixedCommand({ type: "dispose-node", nodeId: 2 }),
      fixedCommand({ type: "dispose-node", nodeId: 2 }),
      fixedCommand({ type: "dispose-document" }),
      fixedCommand({ type: "dispose-document" }),
      fixedCommand({ type: "create", id: 6, kind: "image" }),
    ]);
  });

  it("composes generated topology, registry, listener, style, request, lookup, and disposal commands", () => {
    fc.assert(fc.property(lifecycleCommands(40), (commands) => {
      runCommands(commands);
    }), propertyParameters(100));
  });

  it("replays the runner's shrunk counterexample through the documented environment", () => {
    const property = fc.property(fc.integer({ min: 0, max: 100 }), (value) => value < 10);
    const first = fc.check(property, { seed: 0x0a7a4515, numRuns: 100 });
    expect(first.failed).toBe(true);
    expect(first.counterexamplePath).not.toBeNull();
    if (first.counterexamplePath === null) throw new Error("expected a shrunk counterexample path");
    const previous = {
      seed: propertyEnvironment.FC_SEED,
      path: propertyEnvironment.FC_PATH,
      endOnFailure: propertyEnvironment.FC_END_ON_FAILURE,
    };
    let replayParameters: ReturnType<typeof propertyParameters>;
    try {
      propertyEnvironment.FC_SEED = `${first.seed}`;
      propertyEnvironment.FC_PATH = first.counterexamplePath;
      propertyEnvironment.FC_END_ON_FAILURE = "1";
      replayParameters = propertyParameters(1);
    } finally {
      if (previous.seed === undefined) delete propertyEnvironment.FC_SEED;
      else propertyEnvironment.FC_SEED = previous.seed;
      if (previous.path === undefined) delete propertyEnvironment.FC_PATH;
      else propertyEnvironment.FC_PATH = previous.path;
      if (previous.endOnFailure === undefined) delete propertyEnvironment.FC_END_ON_FAILURE;
      else propertyEnvironment.FC_END_ON_FAILURE = previous.endOnFailure;
    }
    const replay = fc.check(property, replayParameters);
    expect(replay.failed).toBe(true);
    expect(replay.counterexample).toEqual(first.counterexample);
  });

  it("replays a shrunk command model with its runner path and command replay path", () => {
    const failsOnExecutedCreate = (commands: Iterable<Command<Model, Real>>): boolean => {
      runCommands(commands);
      return !String(commands).includes('"type":"create"');
    };
    const first = fc.check(fc.property(lifecycleCommands(12, null), failsOnExecutedCreate), {
      seed: 0x0a7a4515,
      numRuns: 100,
      verbose: true,
    });
    expect(first.failed).toBe(true);
    expect(first.counterexamplePath).not.toBeNull();
    if (first.counterexamplePath === null || first.counterexample === null) {
      throw new Error("expected a shrunk command counterexample");
    }
    const firstTrace = String(first.counterexample[0]);
    const replayMetadata = firstTrace.match(/replayPath=("[^"]+")/u);
    if (replayMetadata === null) throw new Error(`missing command replay metadata: ${firstTrace}`);
    const encodedReplayPath = replayMetadata[1];
    if (encodedReplayPath === undefined) {
      throw new Error(`missing encoded command replay path: ${firstTrace}`);
    }
    const replayPath = JSON.parse(encodedReplayPath);
    if (typeof replayPath !== "string" || replayPath === "") {
      throw new Error("expected a non-empty command replay path");
    }

    const previousReplayPath = propertyEnvironment.FC_COMMAND_REPLAY_PATH;
    let replayArbitrary: Arbitrary<Iterable<Command<Model, Real>>>;
    try {
      propertyEnvironment.FC_COMMAND_REPLAY_PATH = replayPath;
      replayArbitrary = lifecycleCommands(12);
    } finally {
      if (previousReplayPath === undefined) delete propertyEnvironment.FC_COMMAND_REPLAY_PATH;
      else propertyEnvironment.FC_COMMAND_REPLAY_PATH = previousReplayPath;
    }
    const replay = fc.check(fc.property(replayArbitrary, failsOnExecutedCreate), {
      seed: first.seed,
      path: first.counterexamplePath,
      endOnFailure: true,
      numRuns: 1,
    });
    expect(replay.failed).toBe(true);
    expect(replay.counterexample).not.toBeNull();
    if (replay.counterexample === null) throw new Error("expected replayed command counterexample");
    expect(String(replay.counterexample[0])).toBe(firstTrace);
  });
});
