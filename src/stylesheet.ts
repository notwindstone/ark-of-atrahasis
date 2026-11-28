import type { Owner } from "./owner.ts";
import { error } from "./errors.ts";
import { scanCSSNetworkRisk, requireString } from "./validators.ts";
import type { SafeStyleSheet } from "./types.ts";

export function createSafeStyleSheet(owner: Owner, mount: ReturnType<Owner["claim"]>): SafeStyleSheet {
  const root = mount.check();
  if (!owner.allowStylesheet) throw error("POLICY_DENIED", "createStyle");
  const p = owner.platform;
  let real: Node | null = null;
  const initialParent = resolveParent(owner, root);
  let parent: Node | null = null;
  let state: "pending" | "active" | "disposed" = "pending";
  const { sheets } = mount;
  let disposing = false;
  function check() {
    mount.check();
    if (state !== "active") throw error("NODE_DISPOSED", "stylesheet");
    if (!real || !parent || !p.node("isConnected", parent) || p.node("ownerDocument", real) !== owner.document || p.node("parentNode", real) !== parent)
      throw error("EXTERNAL_NODE", "stylesheet");
    return real;
  }
  function isDisposed() {
    return state === "disposed";
  }
  function dispose() {
    if (disposing || (state === "disposed" && !sheets.has(dispose))) return;
    disposing = true;
    try {
      state = "disposed";
      if (
        real &&
        parent &&
        p.node("ownerDocument", real) === owner.document &&
        p.node("parentNode", real) === parent
      ) {
        p.node("textContent=", real, "");
        if (p.node("ownerDocument", real) === owner.document && p.node("parentNode", real) === parent)
          p.node("removeChild", parent, real);
      }
      sheets.delete(dispose);
      real = parent = null;
    } finally {
      disposing = false;
    }
  }
  const sheet = owner.complete<SafeStyleSheet>({
    getCSS() {
      return p.node("textContent", check());
    },
    setCSS(css) {
      const real = check();
      requireString(css);
      if (scanCSSNetworkRisk(css)) throw error("URL_DENIED", "setCSS");
      p.node("textContent=", real, css);
    },
    dispose,
  });
  if (isDisposed()) throw error("NODE_DISPOSED", "stylesheet");
  mount.check();
  const currentParent = resolveParent(owner, root);
  if (!currentParent || currentParent !== initialParent || !p.node("isConnected", currentParent))
    throw error("INVALID_ROOT", "stylesheet");
  parent = currentParent;
  real = owner.createInternalElement("style");
  sheets.add(dispose);
  try {
    p.node("appendChild", parent, real);
  } catch (err) {
    dispose();
    throw err;
  }
  if (isDisposed()) throw error("DOCUMENT_DISPOSED", "createStyle");
  state = "active";
  return sheet;
}

function resolveParent(owner: Owner, root: Node): Node | null {
  const p = owner.platform;
  return p.isShadowRoot(root)
    ? root
    : (p.call("Document", "head", owner.document) ?? p.call("Document", "documentElement", owner.document));
}
