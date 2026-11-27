import { descendants } from "./platform.ts";
import type { Owner, NodeEntry } from "./owner.ts";
import type { SafeTextNode, TreeOperations } from "./types.ts";
import { error } from "./errors.ts";
import { requireString } from "./validators.ts";

export function treeOperations(owner: Owner, check: () => Node): TreeOperations {
  function mutate(op: string, ...wrappers: object[]) {
    const parent = check();
    const nodes = wrappers.map((w) => owner.requireNode(w));
    owner.platform.node(op, parent, ...nodes);
  }
  return {
    appendChild(child) {
      mutate("appendChild", child);
    },
    insertBefore(child, ref) {
      mutate("insertBefore", child, ref);
    },
    removeChild(child) {
      mutate("removeChild", child);
    },
    replaceChild(child, ref) {
      mutate("replaceChild", child, ref);
    },
  };
}
export function lifecycle(owner: Owner, e: NodeEntry) {
  return {
    detach() {
      owner.detach(owner.authorized(e));
    },
    dispose() {
      owner.disposeNode(e);
    },
  };
}
export function textMethods(owner: Owner, e: NodeEntry) {
  const p = owner.platform;
  return {
    setText(value: string) {
      const real = owner.authorized(e);
      requireString(value);
      if (p.node("nodeType", real) === 3) {
        p.node("textContent=", real, value);
        return;
      }
      if (owner.hasForeignDescendant(real)) throw error("EXTERNAL_NODE", "setText");
      let child: Node | null;
      while ((child = p.node("firstChild", real))) {
        const entry = owner.byReal.get(child);
        if (entry?.state !== "active" && !owner.internalText.has(child)) throw error("EXTERNAL_NODE", "setText");
        p.node("removeChild", real, child);
        if (entry) owner.revokeSubtree(child);
        owner.authorized(e);
      }
      if (value) {
        const text = p.call("Document", "createTextNode", owner.document, value);
        owner.internalText.add(text);
        p.node("appendChild", real, text);
      }
    },
    getText(): string {
      const real = owner.authorized(e);
      if (p.node("nodeType", real) === 3) return p.node("textContent", real);
      const pieces = [];
      for (const child of descendants(p, real, (node) => owner.ownsChild(node))) {
        if (owner.ownsChild(child) && p.node("nodeType", child) === 3)
          pieces.push(p.node("textContent", child));
      }
      return pieces.join("");
    },
  };
}
export function createTextNode(owner: Owner, value: string): SafeTextNode {
  const real = owner.platform.call("Document", "createTextNode", owner.document, requireString(value, "createTextNode"));
  const wrapper = {};
  const e = owner.register(real, wrapper);
  return owner.completeNode(e, Object.assign(wrapper, lifecycle(owner, e), textMethods(owner, e)));
}
