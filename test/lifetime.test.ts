import { expect, spyOn, test } from "bun:test";
import { createSafeDocument, createSafeDomain, type SafeEvent } from "../src/index.ts";
import { getRealNode } from "../src/host.ts";
import { scanCSSNetworkRisk } from "../src/validators.ts";
import { owners } from "../src/owner.ts";
import { fails, fixture } from "./helpers.ts";

for (const placement of ["disconnected", "adopted", "adopted-detached", "nested", "shadow"]) {
  test(`mount operations follow ${placement} root placement`, () => {
    const { domain, root, document, win } = fixture();
    const host = root();
    const outer = domain.mount(document.body);
    const enclosing = outer.createDiv();
    outer.appendChild(enclosing);
    getRealNode(domain, enclosing)!.appendChild(host);
    const r = placement === "shadow" ? host.attachShadow({ mode: "open" }) : host;
    const mount = domain.mount(r);
    const node = mount.createButton();
    const raw = getRealNode(domain, node)!;
    mount.appendChild(node);
    let calls = 0;
    node.onClick(() => calls++);
    if (placement === "nested") outer.dispose();
    else if (placement.startsWith("adopted")) {
      const other = fixture();
      other.document.adoptNode(host);
      if (placement === "adopted") other.document.body.appendChild(host);
    } else host.remove();
    fails("INVALID_ROOT", () => mount.appendChild(node));
    raw.dispatchEvent(new win.Event("click") as unknown as Event);
    expect(calls).toBe(0);
    expect(getRealNode(domain, node)).toBeUndefined();
    fails("NODE_DISPOSED", () => node.setText("gone"));
    mount.dispose();
    if (placement.startsWith("adopted")) expect(raw.parentNode).toBe(r);
    const current = host.ownerDocument;
    current.body.appendChild(host);
    createSafeDomain(current).mount(r).dispose();
  });
}

test("claim stays exclusive throughout disconnection callbacks", () => {
  const { document, win, domain, root } = fixture();
  const r = root(),
    doc = domain.mount(r),
    other = createSafeDomain(document);
  let calls = 0;
  win.customElements.define(
    "release-observer",
    class extends win.HTMLElement {
      disconnectedCallback() {
        calls++;
        doc.dispose();
        fails("ROOT_ALREADY_CLAIMED", () => other.mount(r));
      }
    },
  );
  const child = doc.createDiv();
  doc.appendChild(child);
  getRealNode(domain, child)!.appendChild(document.createElement("release-observer"));
  doc.dispose();
  expect(calls).toBe(1);
  const replacement = other.mount(r);
  doc.dispose();
  fails("ROOT_ALREADY_CLAIMED", () => domain.mount(r));
  replacement.dispose();
});

test("relocated styles survive every disposal path", () => {
  for (const scope of ["sheet", "mount", "domain"]) {
    const { domain, document, root } = fixture({ allowStylesheet: true });
    const doc = domain.mount(root()),
      sheet = doc.createStyle();
    sheet.setCSS("div { color: blue }");
    const style = document.body.appendChild(document.head.querySelector("style")!);
    ({ sheet, mount: doc, domain })[scope as "sheet" | "mount" | "domain"].dispose();
    sheet.dispose();
    expect(style.parentNode).toBe(document.body);
    expect(style.textContent).toBe("div { color: blue }");
  }
});

test("container text reads only owned subtrees and preserves host descendants", () => {
  const { domain, document, root } = fixture(),
    doc = domain.mount(root());
  const a = doc.createDiv(),
    b = doc.createButton();
  a.setText("a");
  b.setText("b");
  a.appendChild(b);
  const foreign = document.createElement("span");
  foreign.textContent = "private";
  getRealNode(domain, b)!.appendChild(foreign);
  a.appendChild(doc.createTextNode("c"));
  expect(a.getText()).toBe("abc");
  fails("EXTERNAL_NODE", () => a.setText("new"));
  expect(foreign.parentNode).toBe(getRealNode(domain, b) as Element);
  expect(a.getText()).toBe("abc");
});

test("launcher events and adopted launcher roots work in an iframe", () => {
  const { document, win } = fixture();
  const frame = document.createElement("iframe");
  frame.srcdoc = "<body></body>";
  document.body.appendChild(frame);
  const iframe = frame.contentDocument!;
  const r = iframe.body.appendChild(iframe.adoptNode(document.createElement("section")));
  const domain = createSafeDomain(iframe),
    doc = domain.mount(r),
    button = doc.createButton();
  doc.appendChild(button);
  button.setId("action");
  let snapshot: SafeEvent | undefined;
  button.onClick((e) => {
    snapshot = e;
  });
  getRealNode(domain, button)!.dispatchEvent(
    new win.MouseEvent("click", { clientX: 18, button: 1 }) as unknown as Event,
  );
  expect(snapshot).toMatchObject({
    target: { id: "action" },
    clientX: 18,
    button: 1,
  });
});

test("exact IDs and typed form getters", () => {
  const { domain, root } = fixture(),
    doc = domain.mount(root());
  const replacement = doc.createOption(),
    nul = doc.createButton();
  replacement.setId("\ufffd");
  doc.appendChild(replacement);
  expect(doc.getElement("\0")).toBeNull();
  nul.setId("\0");
  doc.appendChild(nul);
  expect(doc.getElement("\0")).toBe(nul);
  expect(doc.getElement("\ufffd")).toBe(replacement);
  doc.createSelect().setAutocomplete("off");
  for (const control of [replacement, nul]) {
    control.setValue("ok");
    expect(control.getValue()).toBe("ok");
  }
  for (const primitive of [false, 1, "", Symbol(), null])
    fails("INVALID_ROOT", () => createSafeDocument(primitive as never));
});

test("invalid CSS escape scalars decode to the replacement character", () => {
  const decode = spyOn(String, "fromCodePoint");
  try {
    scanCSSNetworkRisk(String.raw`\0 \d800 \dfff \110000 \10ffff \61`);
    expect(decode.mock.calls).toEqual([[0xfffd], [0xfffd], [0xfffd], [0xfffd], [0x10ffff], [0x61]]);
  } finally {
    decode.mockRestore();
  }
});

test("listener and sheet creation clean up after hardener failure or mount disposal", () => {
  const { document, root, win } = fixture();
  let hook = () => {};
  let balance = 0;
  const proto = win.EventTarget.prototype;
  const { addEventListener, removeEventListener } = proto;
  proto.addEventListener = function (...args) {
    if (args[0] === "click") balance++;
    return addEventListener.apply(this, args);
  };
  proto.removeEventListener = function (...args) {
    if (args[0] === "click") balance--;
    return removeEventListener.apply(this, args);
  };
  try {
    const domain = createSafeDomain(document, {
      allowStylesheet: true,
      harden(value) {
        hook();
        if (value && typeof value === "object" && "nested" in value) Object.freeze(value.nested);
        return Object.freeze(value);
      },
    });
    const doc = domain.mount(root()),
      button = doc.createButton();
    const cleanup = button.onClick(() => {});
    expect(balance).toBe(1);
    cleanup();
    hook = () => {
      throw Error("hardener failed");
    };
    fails("INVALID_HARDENER", () => button.onClick(() => {}));
    expect(balance).toBe(0);
    hook = () => doc.dispose();
    fails("DOCUMENT_DISPOSED", () => doc.createStyle());
    expect(document.querySelectorAll("style")).toHaveLength(0);
  } finally {
    Object.assign(proto, { addEventListener, removeEventListener });
  }
});

test("retained revoked handles release native nodes and closed events release the platform", async () => {
  const retained: unknown[] = [];
  function allocate() {
    const { domain, root, win } = fixture({ allowStylesheet: true });
    const r = root(),
      doc = domain.mount(r);
    const button = doc.createButton(),
      text = doc.createTextNode("x"),
      subscribed = doc.createDiv();
    const refs = [r, ...[button, text, subscribed].map((w) => getRealNode(domain, w)!)].map(
      (n) => new WeakRef(n),
    );
    const cleanup = subscribed.onClick(() => {});
    cleanup();
    retained.push(cleanup, doc, button, text);
    text.dispose();
    button.onClick((event) => retained.push(event));
    getRealNode(domain, button)!.dispatchEvent(new win.Event("click") as unknown as Event);
    button.dispose();
    const sheet = doc.createStyle();
    refs.push(new WeakRef(r.ownerDocument.head.querySelector("style")!));
    retained.push(sheet);
    doc.dispose();
    r.remove();
    return refs;
  }
  function snapshot() {
    const { domain, root, win } = fixture();
    const button = domain.mount(root()).createButton();
    button.onClick((e) => retained.push(e));
    getRealNode(domain, button)!.dispatchEvent(new win.Event("click") as unknown as Event);
    return new WeakRef(owners.get(domain)!.platform);
  }
  const refs: WeakRef<object>[] = [...allocate(), snapshot()];
  for (let i = 0; i < 30; i++) {
    await Bun.sleep(0);
    Bun.gc(true);
    if (refs.every((ref) => !ref.deref())) break;
  }
  expect(refs.map((ref) => !!ref.deref())).toEqual(refs.map(() => false));
  expect(retained.length).toBe(7);
});

test("release follows the current mount children after a sibling moves", () => {
  const { domain, document, win, root } = fixture();
  const a = root(),
    b = root();
  const mount = domain.mount(a),
    destination = domain.mount(b);
  const [first, second, third] = Array.from({ length: 3 }, () => mount.createDiv());
  for (const child of [first, second, third]) mount.appendChild(child);
  const moved = getRealNode(domain, second)!;
  win.customElements.define(
    "move-sibling",
    class extends win.HTMLElement {
      disconnectedCallback() {
        b.appendChild(moved);
      }
    },
  );
  getRealNode(domain, first)!.appendChild(document.createElement("move-sibling"));
  mount.dispose();
  expect(a.childNodes.length).toBe(0);
  expect(getRealNode(domain, second)?.parentNode).toBe(b);
  fails("NODE_DISPOSED", () => third.getText());
  domain.mount(a).dispose();
  destination.dispose();
});

test("legacy globals support mount, listener cleanup and explicit undefined options", () => {
  const { document, root, win } = fixture();
  const r = root();
  const originals = [WeakRef, FinalizationRegistry, Object.hasOwn];
  try {
    Reflect.set(globalThis, "WeakRef", undefined);
    Reflect.set(globalThis, "FinalizationRegistry", undefined);
    Reflect.set(Object, "hasOwn", undefined);
    const domain = createSafeDomain(document, { harden: undefined });
    const mount = domain.mount(r);
    const child = mount.createDiv();
    mount.appendChild(child);
    let calls = 0;
    child.onClick(() => calls++, { preventDefault: undefined });
    const node = getRealNode(domain, child)!;
    node.dispatchEvent(new win.Event("click") as unknown as Event);
    domain.dispose();
    node.dispatchEvent(new win.Event("click") as unknown as Event);
    expect(calls).toBe(1);
    fails("DOCUMENT_DISPOSED", () => child.getText());
  } finally {
    Reflect.set(globalThis, "WeakRef", originals[0]);
    Reflect.set(globalThis, "FinalizationRegistry", originals[1]);
    Reflect.set(Object, "hasOwn", originals[2]);
  }
});

test("a detached facade releases its native node on domain disposal", async () => {
  function allocate() {
    const { domain, root } = fixture();
    const facade = domain.mount(root()).createDiv();
    const ref = new WeakRef(getRealNode(domain, facade)!);
    domain.dispose();
    return { facade, ref };
  }
  const { facade, ref } = allocate();
  for (let i = 0; i < 30; i++) {
    await Bun.sleep(0);
    Bun.gc(true);
    if (!ref.deref()) break;
  }
  expect(ref.deref()).toBeUndefined();
  fails("DOCUMENT_DISPOSED", () => facade.getText());
});

test("direct foreign text stays private and text replacement revokes owned children", () => {
  const { domain, root, document } = fixture();
  const mount = domain.mount(root()),
    div = mount.createDiv(),
    span = mount.createSpan();
  div.appendChild(span);
  span.setText("owned");
  const foreign = document.createTextNode("host");
  getRealNode(domain, div)!.appendChild(foreign);
  expect(div.getText()).toBe("owned");
  fails("EXTERNAL_NODE", () => div.setText("replacement"));
  expect(foreign.textContent).toBe("host");
  foreign.remove();
  div.setText("replacement");
  expect(div.getText()).toBe("replacement");
  fails("NODE_DISPOSED", () => span.getText());
});

test("explicit control value access rejects foreign descendants", () => {
  const { domain, root, document, win } = fixture();
  const mount = domain.mount(root());
  for (const control of [
    mount.createOption(),
    mount.createOutput(),
    mount.createSelect(),
    mount.createTextarea(),
  ]) {
    const raw = getRealNode(domain, control)! as Element;
    const foreign =
      raw.tagName === "SELECT" ? document.createElement("option") : document.createTextNode("host");
    raw.appendChild(foreign);
    fails("EXTERNAL_NODE", () => control.getValue());
    fails("EXTERNAL_NODE", () => control.setValue("new"));
    expect(raw.firstChild).toBe(foreign);
  }
});

test("all IDs resolve the first exact match in tree order", () => {
  const { domain, root, document } = fixture();
  const r = root(),
    mount = domain.mount(r);
  for (const id of ["abc", "0abc", "a b", "\0", "\ufffd", "\ud800"]) {
    const foreign = r.appendChild(document.createElement("article"));
    foreign.appendChild(document.createElement("div")).id = id;
    const owned = mount.createDiv();
    owned.setId(id);
    mount.appendChild(owned);
    expect(mount.getElement(id)).toBeNull();
    foreign.remove();
    expect(mount.getElement(id)).toBe(owned);
  }
});

test("listeners and styles activate only after hardening with a stable parent", () => {
  const { document, win, root } = fixture();
  let hook = (_: unknown) => {};
  const domain = createSafeDomain(document, {
    harden(value) {
      if (value && typeof value === "object" && "nested" in value) Object.freeze(value.nested);
      hook(value);
      return Object.freeze(value);
    },
    allowStylesheet: true,
  });
  const mount = domain.mount(root()),
    div = mount.createDiv();
  const raw = getRealNode(domain, div)!;
  const click = () => raw.dispatchEvent(new win.Event("click") as unknown as Event);
  let calls = 0;
  hook = click;
  div.onClick(() => calls++);
  hook = () => {};
  expect(calls).toBe(0);
  click();
  expect(calls).toBe(1);
  hook = (sheet) => (sheet as { dispose(): void }).dispose();
  fails("NODE_DISPOSED", () => mount.createStyle());
  expect(document.head.querySelector("style")).toBeNull();
  const old = document.head;
  hook = () => old.replaceWith(document.createElement("head"));
  fails("INVALID_ROOT", () => mount.createStyle());
  expect(old.querySelector("style")).toBeNull();
  expect(document.head.querySelector("style")).toBeNull();
});

test("failed stylesheet removal revokes the facade and mount disposal retries", () => {
  const { document, win, root } = fixture();
  const proto = win.Node.prototype;
  const remove = proto.removeChild;
  let reject = true;
  proto.removeChild = function (child) {
    if (reject && child.nodeName === "STYLE") {
      reject = false;
      throw Error();
    }
    return remove.call(this, child) as typeof child;
  };
  try {
    const domain = createSafeDomain(document, { allowStylesheet: true });
    const mount = domain.mount(root()),
      sheet = mount.createStyle();
    sheet.setCSS("p { color: red }");
    fails("DOM_OPERATION_FAILED", () => sheet.dispose());
    expect(document.head.querySelector("style")?.textContent).toBe("");
    fails("NODE_DISPOSED", () => sheet.setCSS("p {}"));
    mount.dispose();
    expect(document.head.querySelector("style")).toBeNull();
  } finally {
    proto.removeChild = remove;
  }
});

test("release removes children revoked by reentrant domain disposal", () => {
  const { domain, document, win, root } = fixture();
  const r = root(), mount = domain.mount(r);
  win.customElements.define("dispose-domain", class extends win.HTMLElement {
    disconnectedCallback() { domain.dispose(); }
  });
  const child = mount.createDiv();
  mount.appendChild(child);
  getRealNode(domain, child)!.appendChild(document.createElement("dispose-domain"));
  mount.appendChild(mount.createDiv());
  mount.dispose();
  expect(r.childNodes.length).toBe(0);
});

test("release cleans up a revoked child after its root reconnects", () => {
  const { domain, document, root } = fixture();
  const r = root(), mount = domain.mount(r), child = mount.createDiv();
  mount.appendChild(child);
  r.remove();
  fails("EXTERNAL_NODE", () => child.getText());
  document.body.appendChild(r);
  mount.dispose();
  expect(r.childNodes.length).toBe(0);
});

test.each([1, 50, 120])("release scans a host prefix at most twice for %i owned children", (count) => {
  const { domain, root, document } = fixture();
  const r = root(), mount = domain.mount(r);
  for (let i = 0; i < 50; i++) r.appendChild(document.createElement("i"));
  for (let i = 0; i < count; i++) mount.appendChild(mount.createDiv());
  const p = owners.get(domain)!.platform, node = p.node;
  let reads = 0;
  spyOn(p, "node").mockImplementation((op, ...args) => {
    if (op === "nextSibling") reads++;
    return node(op, ...args);
  });
  mount.dispose();
  expect(reads).toBeLessThanOrEqual(2 * 50 + count);
  expect(r.children.length).toBe(50);
  expect(r.querySelector("div")).toBeNull();
});

test("setting output value revokes replaced descendants and listeners", () => {
  const { domain, root, win } = fixture();
  const mount = domain.mount(root()), output = mount.createOutput(), child = mount.createDiv();
  const button = mount.createButton(), raw = getRealNode(domain, button)!;
  let calls = 0;
  button.onClick(() => calls++);
  child.appendChild(button);
  output.appendChild(child);
  output.setValue("answer");
  expect(output.getValue()).toBe("answer");
  fails("NODE_DISPOSED", () => child.getText());
  fails("NODE_DISPOSED", () => button.getText());
  raw.dispatchEvent(new win.Event("click") as unknown as Event);
  expect(calls).toBe(0);
});

test("stylesheets check live head placement and tolerate reentrant disposal", () => {
  const { domain, root, document, win } = fixture({ allowStylesheet: true });
  const sheet = domain.mount(root()).createStyle(), head = document.head;
  head.replaceWith(document.createElement("head"));
  fails("EXTERNAL_NODE", () => sheet.getCSS());
  fails("EXTERNAL_NODE", () => sheet.setCSS(""));
  document.head.replaceWith(head);
  let calls = 0;
  win.customElements.define("dispose-sheet", class extends win.HTMLElement {
    disconnectedCallback() { calls++; sheet.dispose(); }
  });
  head.querySelector("style")!.appendChild(document.createElement("dispose-sheet"));
  sheet.dispose();
  expect(calls).toBe(1);
  expect(head.querySelector("style")).toBeNull();
});

test("failed hardening unwinds domain claims and node registrations", () => {
  const { document, root } = fixture();
  const r = root();
  let hook: (value: object) => void = () => {};
  function harden<T>(value: T): T {
    if (value && typeof value === "object") {
      if ("nested" in value) Object.freeze(value.nested);
      hook(value);
    }
    return Object.freeze(value);
  }
  hook = value => {
    if ("mount" in value) {
      (value as import("../src/types.ts").SafeDomain).mount(r);
      throw Error();
    }
  };
  fails("INVALID_HARDENER", () => createSafeDomain(document, { harden }));
  hook = () => {};
  const domain = createSafeDomain(document, { harden }), mount = domain.mount(r);
  let retained!: object;
  hook = value => {
    retained = value;
    mount.appendChild(value as ReturnType<typeof mount.createTextNode>);
    throw Error("hardener failed");
  };
  for (const create of [() => mount.createDiv(), () => mount.createTextNode()]) {
    fails("INVALID_HARDENER", create);
    expect(r.childNodes.length).toBe(0);
    expect(owners.get(domain)!.byWrapper.get(retained)).toMatchObject({ state: "disposed", real: null, wrapper: null });
  }
});

test("output writes preserve attached children on equal values and setter failure", () => {
  const { document, root, win } = fixture();
  const proto = win.HTMLOutputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(proto, "value")!;
  let reject = true;
  Object.defineProperty(proto, "value", {
    ...descriptor,
    set(value: string) {
      if (value === this.value) return;
      if (reject) {
        reject = false;
        throw Error("setter failed");
      }
      descriptor.set!.call(this, value);
    },
  });
  try {
    const domain = createSafeDomain(document), mount = domain.mount(root());
    const output = mount.createOutput(), child = mount.createTextNode("old");
    const raw = getRealNode(domain, output)!, text = getRealNode(domain, child)!;
    output.appendChild(child);
    output.setValue("old");
    expect(text).toBe(raw.firstChild!);
    child.setText("updated");
    expect(output.getValue()).toBe("updated");
    fails("DOM_OPERATION_FAILED", () => output.setValue("new"));
    expect(text).toBe(raw.firstChild!);
    expect(child.getText()).toBe("updated");
    output.setValue("new");
    expect(output.getValue()).toBe("new");
    expect(raw.textContent).toBe("new");
    fails("NODE_DISPOSED", () => child.getText());
  } finally {
    Object.defineProperty(proto, "value", descriptor);
  }
});

test("setText can retry a failed child removal", () => {
  const { document, root, win } = fixture();
  const proto = win.Node.prototype, remove = proto.removeChild;
  let reject = true;
  proto.removeChild = function (child) {
    if (reject) {
      reject = false;
      throw Error("removeChild failed");
    }
    return remove.call(this, child) as typeof child;
  };
  try {
    const domain = createSafeDomain(document), mount = domain.mount(root());
    const el = mount.createDiv(), child = mount.createTextNode("old");
    const raw = getRealNode(domain, el)!, text = getRealNode(domain, child)!;
    el.appendChild(child);
    fails("DOM_OPERATION_FAILED", () => el.setText("new"));
    expect(text).toBe(raw.firstChild!);
    expect(child.getText()).toBe("old");
    el.setText("new");
    expect(raw.textContent).toBe("new");
    expect(el.getText()).toBe("new");
    fails("NODE_DISPOSED", () => child.getText());
  } finally {
    proto.removeChild = remove;
  }
});

test("release removes an owned sibling reordered before the host prefix", () => {
  const { domain, document, win, root } = fixture();
  const r = root(), mount = domain.mount(r), host = r.appendChild(document.createElement("i"));
  const first = mount.createDiv(), second = mount.createDiv();
  mount.appendChild(first);
  mount.appendChild(second);
  const moved = getRealNode(domain, second)!;
  win.customElements.define("reorder-sibling", class extends win.HTMLElement {
    disconnectedCallback() { r.insertBefore(moved, host); }
  });
  getRealNode(domain, first)!.appendChild(document.createElement("reorder-sibling"));
  mount.dispose();
  expect(Array.from(r.childNodes)).toEqual([host]);
  for (const child of [first, second]) fails("NODE_DISPOSED", () => child.getText());
  domain.mount(r).dispose();
});

test("disposing a pending element or text facade cancels creation", () => {
  const { domain, root } = fixture({
    harden(value) {
      if (value && typeof value === "object") {
        if ("nested" in value) Object.freeze(value.nested);
        if ("getText" in value && "dispose" in value && typeof value.dispose === "function") value.dispose();
      }
      return Object.freeze(value);
    },
  });
  const mount = domain.mount(root());
  fails("NODE_DISPOSED", () => mount.createDiv());
  fails("NODE_DISPOSED", () => mount.createTextNode());
});

test.each(["mount", "createSafeDocument"])("pending %s rejects factories and releases a disposed claim", (mode) => {
  const { document, root } = fixture();
  const r = root();
  let attempted = false;
  function harden<T>(value: T): T {
    if (value && typeof value === "object") {
      if ("nested" in value) Object.freeze(value.nested);
      if ("createDiv" in value) {
        const doc = value as unknown as import("../src/types.ts").SafeDocument;
        fails("DOCUMENT_DISPOSED", () => doc.createDiv());
        attempted = true;
        doc.dispose();
      }
    }
    return Object.freeze(value);
  }
  fails("DOCUMENT_DISPOSED", () => mode === "mount"
    ? createSafeDomain(document, { harden }).mount(r)
    : createSafeDocument(r, { harden }));
  expect(attempted).toBe(true);
  createSafeDocument(r).dispose();
});

test("stylesheet cleanup preserves a parent adopted during text removal", () => {
  const { domain, document, win, root } = fixture({ allowStylesheet: true });
  const destination = fixture().document;
  const mount = domain.mount(root()), sheet = mount.createStyle();
  const head = document.head, style = head.querySelector("style")!;
  win.customElements.define("adopt-style-parent", class extends win.HTMLElement {
    disconnectedCallback() {
      destination.body.appendChild(head);
    }
  });
  style.appendChild(document.createElement("adopt-style-parent"));
  sheet.dispose();
  expect(style.ownerDocument).toBe(destination);
  expect(style.parentNode).toBe(head);
  mount.dispose();
});

test("mount disposal during stylesheet insertion rolls back the inserted style", () => {
  const { document, root, win } = fixture();
  const proto = win.Node.prototype, append = proto.appendChild;
  const r = root();
  let dispose = () => {};
  proto.appendChild = function (child) {
    const result = append.call(this, child) as typeof child;
    if (child.nodeName === "STYLE") dispose();
    return result;
  };
  try {
    const mount = createSafeDomain(document, { allowStylesheet: true }).mount(r);
    dispose = mount.dispose;
    fails("DOCUMENT_DISPOSED", () => mount.createStyle());
    expect(document.head.querySelector("style")).toBeNull();
    createSafeDocument(r).dispose();
  } finally {
    proto.appendChild = append;
  }
});

test("output replacement text is readable while replaced listeners are removed", () => {
  const { document, root, win } = fixture();
  const proto = win.EventTarget.prototype, remove = proto.removeEventListener;
  let observe = () => {};
  proto.removeEventListener = function (...args) {
    if (args[0] === "click") observe();
    return remove.apply(this, args);
  };
  try {
    const mount = createSafeDomain(document).mount(root());
    const output = mount.createOutput(), child = mount.createButton();
    output.appendChild(child);
    child.onClick(() => {});
    let observed: string | undefined;
    observe = () => { observed = output.getText(); };
    output.setValue("replacement");
    expect(observed).toBe("replacement");
    mount.dispose();
  } finally {
    proto.removeEventListener = remove;
  }
});

test("output replacement preserves a sibling moved to another mount during blur", () => {
  const { document, root, win } = fixture();
  const proto = win.HTMLOutputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(proto, "value")!;
  Object.defineProperty(proto, "value", {
    ...descriptor,
    set(value: string) {
      (document.activeElement as HTMLElement).blur();
      descriptor.set!.call(this, value);
    },
  });
  try {
    const domain = createSafeDomain(document);
    const mount = domain.mount(root()), destination = root(), second = domain.mount(destination);
    const output = mount.createOutput(), focused = mount.createButton(), sibling = mount.createButton();
    mount.appendChild(output);
    output.appendChild(focused);
    output.appendChild(sibling);
    const button = getRealNode(domain, sibling)! as HTMLButtonElement;
    let clicks = 0;
    sibling.onClick(() => clicks++);
    focused.onBlur(() => second.appendChild(sibling));
    (getRealNode(domain, focused)! as HTMLButtonElement).focus();
    output.setValue("updated");
    expect(output.getValue()).toBe("updated");
    fails("NODE_DISPOSED", () => focused.getText());
    expect(button.parentNode).toBe(destination);
    button.click();
    expect(clicks).toBe(1);
    expect(getRealNode(domain, sibling)).toBe(button);
  } finally {
    Object.defineProperty(proto, "value", descriptor);
  }
});

test("mount activation releases a root adopted during hardening", () => {
  const { document, root } = fixture();
  const destination = fixture(), r = root();
  const domain = createSafeDomain(document, {
    harden(value) {
      if (value && typeof value === "object") {
        if ("nested" in value) Object.freeze(value.nested);
        if ("createDiv" in value) destination.document.body.appendChild(destination.document.adoptNode(r));
      }
      return Object.freeze(value);
    },
  });
  fails("INVALID_ROOT", () => domain.mount(r));
  destination.domain.mount(r).dispose();
});

test("setText stops when its first removal adopts the mount root", () => {
  const { document, win, root } = fixture();
  const destination = fixture().document, r = root();
  const proto = win.Node.prototype, remove = proto.removeChild;
  let first: Node | undefined;
  proto.removeChild = function (child) {
    const result = remove.call(this, child) as typeof child;
    if ((child as unknown as Node) === first) destination.body.appendChild(destination.adoptNode(r));
    return result;
  };
  try {
    const domain = createSafeDomain(document), mount = domain.mount(r);
    const el = mount.createDiv(), removed = mount.createButton(), remaining = mount.createButton();
    mount.appendChild(el);
    el.appendChild(removed);
    el.appendChild(remaining);
    const raw = getRealNode(domain, el)!, sibling = getRealNode(domain, remaining)!;
    first = getRealNode(domain, removed)!;
    fails("EXTERNAL_NODE", () => el.setText("replacement"));
    expect(raw.ownerDocument).toBe(destination);
    expect(raw.childNodes.length).toBe(1);
    expect(sibling).toBe(raw.firstChild!);
  } finally {
    proto.removeChild = remove;
  }
});
