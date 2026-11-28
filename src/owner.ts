import { error } from "./errors.ts";
import { capturePlatform, descendants, controlInterfaces, type TargetKind } from "./platform.ts";
import { createStylePolicy, createURLPolicy, checkKeys, readOwnDataProperty } from "./policies.ts";
import type { SafeDomainOptions, SafeDomain, SafeEventTargetSnapshot } from "./types.ts";

const claimedRoots = new WeakSet<Node>();
const ownedNodes = new WeakSet<Node>();
export interface NodeEntry {
  real: Node | null;
  wrapper: object | null;
  state: "pending" | "active" | "disposed";
  targetKind: TargetKind | null;
  listeners: Set<() => void> | null;
}
function deepFreeze<T>(value: T): T {
  const seen = new WeakSet<object>();
  function visit(obj: unknown) {
    if (!obj || (typeof obj !== "object" && typeof obj !== "function") || seen.has(obj)) return;
    seen.add(obj);
    Object.freeze(obj);
    for (const d of Object.values(Object.getOwnPropertyDescriptors(obj))) visit(d.value);
  }
  visit(value);
  return value;
}

function once(remove: (() => void) | null) {
  return () => {
    if (remove) remove();
    remove = null;
  };
}

function liveEntries() {
  if (typeof WeakRef !== "function" || typeof FinalizationRegistry !== "function") {
    return new Set<NodeEntry>();
  }
  const refs = new Set<WeakRef<NodeEntry>>();
  const keys = new WeakMap<NodeEntry, WeakRef<NodeEntry>>();
  const registry = new FinalizationRegistry<WeakRef<NodeEntry>>((ref) => refs.delete(ref));
  return {
    add(entry: NodeEntry) {
      const ref = new WeakRef(entry);
      refs.add(ref);
      keys.set(entry, ref);
      registry.register(entry, ref, ref);
    },
    delete(entry: NodeEntry) {
      const ref = keys.get(entry);
      if (!ref) return;
      keys.delete(entry);
      refs.delete(ref);
      registry.unregister(ref);
    },
    forEach(fn: (entry: NodeEntry) => void) {
      for (const ref of refs) {
        const entry = ref.deref();
        if (entry) fn(entry);
      }
    },
    clear: () => refs.clear(),
  };
}

export class Owner {
  readonly platform;
  readonly urls;
  readonly styles;
  readonly allowStylesheet;
  readonly allowFormControls;
  readonly complete;
  readonly byReal = new WeakMap<Node, NodeEntry>();
  readonly byWrapper = new WeakMap<object, NodeEntry>();
  private readonly mounts = new Map<
    Node,
    {
      active: boolean;
      releasing: boolean;
      root: Node | null;
      sheets: Set<() => void>;
    }
  >();
  private readonly unfinished = new WeakSet<NodeEntry>();
  private active = true;
  private readonly entries = liveEntries();
  readonly internalText = new WeakSet<Node>();
  private scratchStyle?: CSSStyleDeclaration;
  constructor(
    readonly document: Document,
    options: SafeDomainOptions = {},
  ) {
    this.platform = capturePlatform(document);
    checkKeys(
      options,
      ["harden", "urlPolicy", "stylePolicy", "allowStylesheet", "allowFormControls"],
      "createSafeDomain",
    );
    const option = (name: keyof SafeDomainOptions) => readOwnDataProperty(options, name, "createSafeDomain");
    const ambient = Reflect.get(globalThis, "harden");
    const configured = option("harden");
    const harden =
      configured !== undefined ? configured : typeof ambient === "function" ? ambient : deepFreeze;
    try {
      const probe = { nested: {} };
      if (
        typeof harden !== "function" ||
        harden(probe) !== probe ||
        !Object.isFrozen(probe) ||
        !Object.isFrozen(probe.nested)
      )
        throw 0;
    } catch {
      throw error("INVALID_HARDENER", "createSafeDomain");
    }
    this.complete = <T>(value: T): T => {
      try {
        return harden(value);
      } catch {
        throw error("INVALID_HARDENER", "harden");
      }
    };
    const flag = (name: keyof SafeDomainOptions, fallback: boolean) => {
      const value = option(name);
      if (value === undefined) return fallback;
      if (typeof value !== "boolean") throw error("INVALID_POLICY", name);
      return value;
    };
    this.allowFormControls = flag("allowFormControls", true);
    this.allowStylesheet = flag("allowStylesheet", false);
    this.urls = createURLPolicy(option("urlPolicy") as SafeDomainOptions["urlPolicy"], this.platform.URL);
    this.styles = createStylePolicy(option("stylePolicy") as SafeDomainOptions["stylePolicy"]);
  }
  createInternalElement(tag: string) {
    const element = this.platform.create(tag);
    ownedNodes.add(element);
    return element;
  }
  scratch(): CSSStyleDeclaration {
    return (this.scratchStyle ??= this.platform.call("HTMLElement", "style", this.createInternalElement("div")));
  }
  assertActive() {
    if (!this.active) throw error("DOCUMENT_DISPOSED", "domain");
  }
  isLiveRoot(root: Node) {
    const p = this.platform;
    return p.node("ownerDocument", root) === this.document && p.node("isConnected", root);
  }
  claim(root: Element | ShadowRoot) {
    this.assertActive();
    const p = this.platform;
    if ((!p.isElement(root) && !p.isShadowRoot(root)) || !this.isLiveRoot(root))
      throw error("INVALID_ROOT", "mount");
    if (claimedRoots.has(root) || ownedNodes.has(root)) throw error("ROOT_ALREADY_CLAIMED", "mount");
    claimedRoots.add(root);
    const mount = {
      active: false,
      releasing: false,
      root: root as Node | null,
      sheets: new Set<() => void>(),
    };
    this.mounts.set(root, mount);
    return {
      sheets: mount.sheets,
      activate: () => {
        this.assertActive();
        if (!mount.root || this.mounts.get(mount.root) !== mount) throw error("DOCUMENT_DISPOSED", "mount");
        if (!this.isLiveRoot(mount.root)) throw error("INVALID_ROOT", "mount");
        mount.active = true;
      },
      check: () => {
        this.assertActive();
        if (!mount.active || !mount.root) throw error("DOCUMENT_DISPOSED", "mount");
        if (!this.isLiveRoot(mount.root)) throw error("INVALID_ROOT", "mount");
        return mount.root;
      },
      dispose: () => {
        if (mount.root && this.mounts.get(mount.root) === mount) this.release(mount.root);
      },
    };
  }
  register(real: Node, wrapper: object, targetKind: TargetKind | null = null): NodeEntry {
    const entry: NodeEntry = {
      real,
      wrapper,
      targetKind,
      state: "pending",
      listeners: null,
    };
    this.entries.add(entry);
    ownedNodes.add(real);
    this.byReal.set(real, entry);
    this.byWrapper.set(wrapper, entry);
    return entry;
  }
  authorized(entry: NodeEntry) {
    this.assertActive();
    if (entry.state !== "active") throw error("NODE_DISPOSED", "node");
    if (!this.placed(entry)) throw error("EXTERNAL_NODE", "placement");
    return entry.real!;
  }
  private placed(entry: NodeEntry): boolean {
    if (this.platform.node("ownerDocument", entry.real!) === this.document) {
      let parent = this.platform.node("parentNode", entry.real!);
      while (parent && !this.mounts.has(parent)) {
        if (this.byReal.get(parent)?.state !== "active") break;
        parent = this.platform.node("parentNode", parent);
      }
      if (!parent || (this.mounts.get(parent)?.active && this.isLiveRoot(parent))) return true;
    }
    this.unfinished.delete(entry);
    this.revoke(entry);
    return false;
  }
  requireNode(wrapper: object): Node {
    const e = this.byWrapper.get(wrapper);
    if (!e) throw error("CROSS_OWNER_NODE", "child");
    return this.authorized(e);
  }
  ownsChild(node: Node) {
    return this.internalText.has(node) || this.byReal.get(node)?.state === "active";
  }
  hasForeignDescendant(root: Node) {
    for (const node of descendants(this.platform, root)) if (!this.ownsChild(node)) return true;
    return false;
  }
  canReadValue(kind: TargetKind, node: Node) {
    return kind === "input" || kind === "button" || !this.hasForeignDescendant(node);
  }
  resolveEventTarget(raw: Node | null): SafeEventTargetSnapshot | null {
    try {
      if (!raw) return null;
      const e = this.byReal.get(raw);
      if (!e || !this.canDispatch(e) || !this.platform.isElement(raw)) return null;
      const id = this.platform.read("Element", "id", raw);
      const snapshot: { id: string; value?: string; checked?: boolean } = {
        id: typeof id === "string" ? id : "",
      };
      if (e.targetKind) {
        const value = this.platform.read(controlInterfaces[e.targetKind], "value", raw);
        if (typeof value === "string") snapshot.value = value;
        if (e.targetKind === "input") {
          const checked = this.platform.read("HTMLInputElement", "checked", raw);
          if (typeof checked === "boolean") snapshot.checked = checked;
        }
      }
      return snapshot;
    } catch {
      return null;
    }
  }
  canDispatch(e: NodeEntry) {
    return this.active && e.state === "active" && this.placed(e);
  }
  track(e: NodeEntry, remove: () => void) {
    e.listeners ??= new Set();
    const cleanup = once(() => {
      if (!e.listeners?.has(cleanup)) return;
      remove();
      e.listeners.delete(cleanup);
      if (!e.listeners.size) e.listeners = null;
    });
    e.listeners.add(cleanup);
    try {
      return this.complete(cleanup);
    } catch (err) {
      cleanup();
      throw err;
    }
  }
  revoke(e: NodeEntry) {
    e.state = "disposed";
    e.listeners?.forEach((cleanup) => cleanup());
    if (!this.unfinished.has(e)) {
      this.entries.delete(e);
      e.real = null;
      e.wrapper = null;
    }
  }
  completeNode<T extends object>(entry: NodeEntry, wrapper: T): T {
    try {
      const completed = this.complete(wrapper);
      this.assertActive();
      if (entry.state !== "pending") throw error("NODE_DISPOSED", "node");
      entry.state = "active";
      return completed;
    } catch (err) {
      this.revoke(entry);
      throw err;
    }
  }
  ownedChildren(parent: Node): Node[] {
    const children: Node[] = [];
    this.eachOwnedChild(parent, child => children.push(child));
    return children;
  }
  revokeSubtree(root: Node) {
    this.disposeTree(root, null);
  }
  detach(real: Node) {
    const parent = this.platform.node("parentNode", real);
    if (parent) this.platform.node("removeChild", parent, real);
  }
  disposeNode(entry: NodeEntry) {
    if (entry.state === "pending") {
      this.revoke(entry);
      return;
    }
    if (entry.state === "active") this.authorized(entry);
    else {
      if (!this.unfinished.has(entry)) return;
      this.assertActive();
      if (!this.placed(entry)) throw error("EXTERNAL_NODE", "dispose");
    }
    this.disposeTree(entry.real!, this.platform.node("parentNode", entry.real!));
  }
  private disposeTree(root: Node, parent: Node | null) {
    const entry = this.byReal.get(root)!;
    this.unfinished.add(entry);
    const pending = [root];
    while (pending.length) {
      const real = pending.pop()!;
      const child = this.byReal.get(real)!;
      if (real !== root) this.unfinished.delete(child);
      this.revoke(child);
      this.eachOwnedChild(real, (child) => pending.push(child));
    }
    if (parent) this.platform.node("removeChild", parent, root);
    this.unfinished.delete(entry);
    this.entries.delete(entry);
    entry.real = null;
    entry.wrapper = null;
  }
  private eachOwnedChild(parent: Node, action: (child: Node) => void) {
    let child = this.platform.node("firstChild", parent);
    while (child) {
      const next = this.platform.node("nextSibling", child);
      if (this.byReal.has(child)) action(child);
      child = next;
    }
  }
  private release(root: Node) {
    const mount = this.mounts.get(root)!;
    if (mount.releasing) return;
    mount.releasing = true;
    mount.active = false;
    try {
      mount.sheets.forEach((cleanup) => cleanup());
      const p = this.platform;
      const isLocal = () => {
        // Happy DOM records a detached adoption in an own data property.
        const doc = Object.getOwnPropertyDescriptor(root, "ownerDocument");
        return p.node("ownerDocument", root) === this.document &&
          (!doc || !("value" in doc) || doc.value === this.document);
      };
      for (;;) {
        if (!isLocal()) {
          this.eachOwnedChild(root, child => this.revokeSubtree(child));
          break;
        }
        const owned = this.ownedChildren(root);
        if (!owned.length) break;
        for (const child of owned) {
          if (!isLocal()) break;
          if (p.node("parentNode", child) === root) this.disposeTree(child, root);
        }
      }
      if (this.mounts.get(root) === mount) {
        this.mounts.delete(root);
        claimedRoots.delete(root);
        mount.root = null;
      }
    } finally {
      mount.releasing = false;
    }
  }
  dispose() {
    this.active = false;
    this.mounts.forEach((_, root) => this.release(root));
    this.entries.forEach((entry) => {
      this.unfinished.delete(entry);
      this.revoke(entry);
    });
    this.entries.clear();
  }
}

export const owners = new WeakMap<SafeDomain, Owner>();
