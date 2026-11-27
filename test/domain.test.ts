import { expect, test } from "bun:test";
import { fails, fixture } from "./helpers.ts";
import { createSafeDomain, createSafeDocument } from "../src/index.ts";
import { getRealNode } from "../src/host.ts";

test("aliases move nodes, release claims and keep disposed handles closed", () => {
  const { document, domain, root } = fixture();
  const r = root(),
    a = domain.mount(r),
    b = domain.mount(root());
  const other = createSafeDomain(document);
  fails("ROOT_ALREADY_CLAIMED", () => other.mount(r));
  const factories = a,
    node = factories.createDiv(),
    orphan = a.createSpan(),
    child = a.createSpan();
  a.appendChild(orphan);
  a.appendChild(node);
  node.appendChild(child);
  b.appendChild(node);
  node.setId("native");
  a.dispose();
  expect(b.getElement("native")).toBe(node);
  fails("NODE_DISPOSED", () => orphan.getText());
  child.setText("alive");
  expect(node.getText()).toBe("alive");
  const reopened = domain.mount(r);
  a.dispose();
  reopened.appendChild(node);
  fails("DOCUMENT_DISPOSED", () => a.createSpan());
  fails("CROSS_OWNER_NODE", () => other.mount(root()).appendChild(node));
  expect(getRealNode(other, node)).toBeUndefined();
  node.detach();
  child.setText("detached");
  b.appendChild(node);
  node.dispose();
  fails("NODE_DISPOSED", () => child.getText());
  domain.dispose();
  other.mount(r).createDiv();
  fails("DOCUMENT_DISPOSED", () => b.createSpan());
});
test("ownership is checked for every operand and lookup through foreign ancestors", () => {
  const { domain, root, document } = fixture(),
    r = root(),
    doc = domain.mount(r);
  const parent = doc.createDiv();
  doc.appendChild(parent);
  const inside = document.createElement("aside");
  r.appendChild(inside);
  for (const operation of [
    "receiver",
    "append",
    "insert",
    "reference",
    "remove",
    "replacement",
    "old",
    "lookup",
  ]) {
    const child = doc.createSpan();
    child.setId(operation);
    const raw = getRealNode(domain, child)!;
    inside.appendChild(raw);
    fails("EXTERNAL_NODE", () => {
      switch (operation) {
        case "receiver":
          return child.detach();
        case "append":
          return parent.appendChild(child);
        case "insert":
          return parent.insertBefore(child, parent);
        case "reference":
          return parent.insertBefore(parent, child);
        case "remove":
          return parent.removeChild(child);
        case "replacement":
          return parent.replaceChild(child, parent);
        case "old":
          return parent.replaceChild(parent, child);
        default:
          return doc.getElement(operation);
      }
    });
    expect(raw.parentNode).toBe(inside);
  }
});
test("placement walks the same parent chain at widths one and one thousand", () => {
  const { win, document, root } = fixture();
  let reads = 0;
  let proto = win.Node.prototype;
  while (!Object.hasOwn(proto, "parentNode")) proto = Object.getPrototypeOf(proto);
  const d = Object.getOwnPropertyDescriptor(proto, "parentNode")!;
  Object.defineProperty(proto, "parentNode", {
    ...d,
    get() {
      reads++;
      return d.get!.call(this);
    },
  });
  try {
    const doc = createSafeDomain(document).mount(root()),
      n = doc.createDiv();
    doc.appendChild(n);
    reads = 0;
    n.getClass();
    const one = reads;
    for (let i = 1; i < 1000; i++) doc.appendChild(doc.createDiv());
    reads = 0;
    n.getClass();
    expect(reads).toBe(one);
    expect(reads).toBeGreaterThan(0);
  } finally {
    Object.defineProperty(proto, "parentNode", d);
  }
});
test("connected roots, form gate, void nodes, clean list factories and shorthand lifetime", () => {
  const { document, root } = fixture();
  const doc = createSafeDocument(root(), { allowFormControls: false });
  fails("INVALID_ROOT", () => createSafeDocument(document.createElement("div")));
  fails("INVALID_HARDENER", () => createSafeDocument(root(), { harden: (x) => x }));
  fails("POLICY_DENIED", () => doc.createInput());
  const image = doc.createImage();
  expect("appendChild" in image).toBe(false);
  fails("URL_DENIED", () => image.setSrc("https://example.com"));
  const list = doc.createList("ordered"),
    li = list.createItem();
  li.setText("one");
  expect(list.getText()).toBe("");
  list.appendChild(li);
  expect(list.getText()).toBe("one");
  doc.dispose();
  fails("DOCUMENT_DISPOSED", () => li.getText());
});
test("detached IDs and listener registrations do not keep wrappers alive", async () => {
  const { domain, root } = fixture(),
    doc = domain.mount(root());
  function allocate(listener: boolean) {
    const node = doc.createDiv();
    node.setId("row");
    if (listener) node.onClick(() => {});
    return new WeakRef(node);
  }
  const refs = [allocate(false), allocate(true)];
  for (let i = 0; i < 25; i++) {
    await Bun.sleep(0);
    Bun.gc(true);
    if (refs.every((r) => !r.deref())) break;
  }
  expect(refs.map((r) => r.deref())).toEqual([undefined, undefined]);
  domain.dispose();
});

test("failed native detach is retryable without reopening node or mount handles", () => {
  const { document, win, root } = fixture();
  const descriptor = Object.getOwnPropertyDescriptor(win.Node.prototype, "removeChild")!;
  let fail = false;
  Object.defineProperty(win.Node.prototype, "removeChild", {
    ...descriptor,
    value: function (child: Node) {
      if (fail) {
        fail = false;
        throw Error("transient removeChild");
      }
      return descriptor.value.call(this, child);
    },
  });
  try {
    const domain = createSafeDomain(document),
      r = root(),
      doc = domain.mount(r);
    const node = doc.createDiv();
    doc.appendChild(node);
    fail = true;
    fails("DOM_OPERATION_FAILED", () => node.dispose());
    fails("NODE_DISPOSED", () => node.getText());
    node.dispose();
    expect(r.childNodes.length).toBe(0);
    doc.appendChild(doc.createDiv());
    fail = true;
    fails("DOM_OPERATION_FAILED", () => doc.dispose());
    fails("DOCUMENT_DISPOSED", () => doc.createDiv());
    doc.dispose();
    expect(r.childNodes.length).toBe(0);
    domain.mount(r);
    domain.dispose();
  } finally {
    Object.defineProperty(win.Node.prototype, "removeChild", descriptor);
  }
});

test("only host-created elements can be mount roots across domains", () => {
  const { document, root, domain } = fixture({ allowStylesheet: true });
  const mount = domain.mount(root());
  const child = mount.createDiv();
  mount.appendChild(child);
  const native = getRealNode(domain, child)! as Element;
  const other = createSafeDomain(document);
  fails("ROOT_ALREADY_CLAIMED", () => other.mount(native));
  other.mount(native.appendChild(document.createElement("section"))).dispose();
  mount.createStyle();
  fails("ROOT_ALREADY_CLAIMED", () => other.mount(document.head.querySelector("style")!));
  mount.dispose();
});
