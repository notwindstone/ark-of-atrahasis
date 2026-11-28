import { descendants } from "./platform.ts";
import { Owner, owners } from "./owner.ts";
import { createElement } from "./element.ts";
import { createTextNode, treeOperations } from "./text.ts";
import { createSafeStyleSheet } from "./stylesheet.ts";
import { FACTORY_TAGS, requireString, validateFactory } from "./validators.ts";
import { error } from "./errors.ts";
import type {
  SafeDomain,
  SafeDocument,
  SafeDomainOptions,
  SafeElement,
  ListType,
  FormattingTag,
  HeadingLevel,
} from "./types.ts";
export type * from "./types.ts";
export type { SafeDOMError, SafeDOMErrorCode } from "./errors.ts";
export type { SafeURLPolicy, SafeURLDecision, SafeStylePolicy, URLSink, URLSinkPolicy } from "./policies.ts";
export { createURLPolicy, createStylePolicy } from "./policies.ts";
export { isSafeDOMError } from "./errors.ts";

function mount(owner: Owner, root: Element | ShadowRoot, single = false): SafeDocument {
  const mount = owner.claim(root);
  const active = mount.check;
  const create = (tag: string) => {
    active();
    return createElement(owner, tag);
  };
  const doc = {
    ...Object.fromEntries(Object.entries(FACTORY_TAGS).map(([name, tag]) => [name, () => create(tag)])),
    ...treeOperations(owner, active),
    createHeading(level: HeadingLevel) {
      active();
      validateFactory("createHeading", level);
      return create("h" + level);
    },
    createFormatting(tag: FormattingTag) {
      active();
      validateFactory("createFormatting", tag);
      return create(tag);
    },
    createList(type: ListType) {
      active();
      validateFactory("createList", type);
      return create({ ordered: "ol", unordered: "ul", description: "dl" }[type]);
    },
    createTextNode(value = "") {
      active();
      validateFactory("createTextNode", value);
      return createTextNode(owner, value);
    },
    createStyle() {
      return createSafeStyleSheet(owner, mount);
    },
    getElement(id: string) {
      const root = active();
      requireString(id);
      if (!id) return null;
      const p = owner.platform;
      const iface = p.isShadowRoot(root) ? "DocumentFragment" : "Element";
      const simple = /^[A-Za-z_][A-Za-z0-9_-]*$/.test(id);
      let el = simple ? p.call(iface, "querySelector", root, "#" + id) : null;
      if (!simple || (el && p.call("Element", "id", el) !== id)) {
        el = null;
        for (const candidate of descendants(p, root)) {
          if (p.isElement(candidate) && p.call("Element", "id", candidate) === id) {
            el = candidate;
            break;
          }
        }
      }
      const entry = el && owner.byReal.get(el);
      if (!entry) return null;
      owner.authorized(entry);
      return entry.wrapper as SafeElement;
    },
    dispose() {
      if (single) owner.dispose();
      else mount.dispose();
    },
  };
  try {
    const completed = owner.complete(doc);
    mount.activate();
    return completed as unknown as SafeDocument;
  } catch (err) {
    mount.dispose();
    throw err;
  }
}
export function createSafeDomain(document: Document, options?: SafeDomainOptions): SafeDomain {
  const owner = new Owner(document, options);
  const domain = {
    mount: (root: Element | ShadowRoot) => mount(owner, root),
    dispose: () => owner.dispose(),
  };
  try {
    owner.complete(domain);
  } catch (err) {
    owner.dispose();
    throw err;
  }
  owners.set(domain, owner);
  return domain;
}
export function createSafeDocument(root: Element | ShadowRoot, options?: SafeDomainOptions): SafeDocument {
  if (typeof root !== "object" || root === null || !root.ownerDocument)
    throw error("INVALID_ROOT", "createSafeDocument");
  return mount(new Owner(root.ownerDocument, options), root, true);
}
