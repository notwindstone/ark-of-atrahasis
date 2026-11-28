import { owners } from "../src/owner.ts";
import { expect, test } from "bun:test";
import { fixture, fails } from "./helpers.ts";
import { getRealNode } from "../src/host.ts";
import { createSafeDomain } from "../src/index.ts";
import type { SafeEvent } from "../src/index.ts";

test("pointer movement projects three IDs without probing any control", () => {
  const { win, root, document } = fixture(),
    restorers: (() => void)[] = [];
  let reads = 0;
  try {
    for (const [proto, key] of [
      [win.HTMLInputElement.prototype, "value"],
      [win.HTMLInputElement.prototype, "checked"],
      [win.HTMLTextAreaElement.prototype, "value"],
      [win.HTMLSelectElement.prototype, "value"],
      [win.HTMLOptionElement.prototype, "value"],
      [win.HTMLButtonElement.prototype, "value"],
      [win.HTMLOutputElement.prototype, "value"],
    ] as const) {
      let holder: object = proto;
      while (!Object.hasOwn(holder, key)) holder = Object.getPrototypeOf(holder);
      const d = Object.getOwnPropertyDescriptor(holder, key)!;
      Object.defineProperty(holder, key, {
        ...d,
        get() {
          reads++;
          return d.get!.call(this);
        },
      });
      restorers.push(() => Object.defineProperty(holder, key, d));
    }
    const domain = createSafeDomain(document),
      doc = domain.mount(root());
    const div = doc.createDiv(),
      span = doc.createSpan();
    div.setId("div");
    span.setId("span");
    doc.appendChild(div);
    div.appendChild(span);
    let snapshot: unknown;
    div.onMouseMove((e) => {
      snapshot = e;
    });
    const raw = getRealNode(domain, span)!;
    raw.dispatchEvent(
      new win.MouseEvent("mousemove", {
        bubbles: true,
        relatedTarget: getRealNode(domain, div) as never,
      }) as unknown as Event,
    );
    expect(snapshot).toMatchObject({
      target: { id: "span" },
      currentTarget: { id: "div" },
      relatedTarget: { id: "div" },
    });
    expect(reads).toBe(0);
  } finally {
    restorers.reverse().forEach((restore) => restore());
  }
});

test("control snapshots use the matching getter and cancellation expires", () => {
  const { win, domain, root } = fixture(),
    doc = domain.mount(root());
  const input = doc.createInput();
  input.setValue("typed");
  input.setChecked(true);
  const option = doc.createOption();
  option.setText("derived");
  const output = doc.createOutput();
  output.setValue("computed");
  for (const [control, value] of [
    [input, "typed"],
    [option, "derived"],
    [output, "computed"],
  ] as const) {
    doc.appendChild(control);
    let snapshot: SafeEvent | undefined;
    const off = control.addEventListener(
      "change",
      (e) => {
        snapshot = e;
      },
      { preventDefault: true },
    );
    const native = new win.Event("change", { cancelable: true });
    getRealNode(domain, control)!.dispatchEvent(native as unknown as Event);
    expect(snapshot?.target.value).toBe(value);
    expect(snapshot?.target.checked).toBe(control === input ? true : undefined);
    expect(snapshot?.ctrlKey).toBe(false);
    expect(snapshot?.defaultPrevented).toBe(true);
    expect(snapshot?.preventDefault()).toBe(false);
    expect(Object.isFrozen(snapshot?.target)).toBe(true);
    off();
  }
  fails("UNSUPPORTED_EVENT", () => input.addEventListener("submit" as never, () => {}));
});
test("foreign ancestry redacts bubbling target, relatedTarget and every touch target", () => {
  const { win, domain, root, document } = fixture(),
    doc = domain.mount(root());
  const outer = doc.createDiv();
  doc.appendChild(outer);
  const host = document.createElement("div");
  getRealNode(domain, outer)!.appendChild(host);
  let calls = 0;
  const foreign = () => {
    const input = doc.createInput();
    input.onMouseMove(() => {
      calls++;
    });
    input.setId("hidden");
    input.setValue("private");
    const raw = getRealNode(domain, input)!;
    host.appendChild(raw);
    return raw;
  };
  const raw = foreign(),
    related = foreign(),
    touchTarget = foreign();
  let mouse: unknown, touches: unknown;
  outer.onMouseMove((e) => {
    mouse = e;
  });
  raw.dispatchEvent(
    new win.MouseEvent("mousemove", {
      bubbles: true,
      relatedTarget: related as never,
    }) as unknown as Event,
  );
  expect(calls).toBe(0);
  expect((mouse as any).target).toEqual({ id: "" });
  expect((mouse as any).relatedTarget).toEqual({ id: "" });
  outer.onTouchMove((e) => {
    touches = e.touches;
  });
  const points = Array.from(
    { length: 257 },
    (_, identifier) => new win.Touch({ identifier, target: touchTarget as never }),
  );
  getRealNode(domain, outer)!.dispatchEvent(
    new win.TouchEvent("touchmove", { touches: points }) as unknown as Event,
  );
  expect(touches).toHaveLength(257);
  expect((touches as any[])[256]).toMatchObject({
    identifier: 256,
    target: { id: "" },
  });
  expect(touchTarget.parentNode).toBe(host);
});
test("each iframe domain captures the prototype as it exists at construction", () => {
  const { win } = fixture();
  const iframe = win.document.createElement("iframe");
  iframe.srcdoc = "<body></body>";
  win.document.body.appendChild(iframe);
  const doc = iframe.contentDocument! as unknown as Document;
  const view = doc.defaultView!;
  const proto = view.HTMLInputElement.prototype;
  const orig = Object.getOwnPropertyDescriptor(proto, "value");
  function capture(value: string) {
    Object.defineProperty(proto, "value", {
      configurable: true,
      get: () => value,
    });
    const domain = createSafeDomain(doc),
      mount = domain.mount(doc.body.appendChild(doc.createElement("div")));
    const input = mount.createInput(),
      raw = getRealNode(domain, input)!;
    Object.defineProperty(raw, "value", {
      get() {
        throw Error("own getter");
      },
    });
    return input;
  }
  try {
    const a = capture("A"),
      b = capture("B");
    expect(a.getValue()).toBe("A");
    expect(b.getValue()).toBe("B");
  } finally {
    if (orig) Object.defineProperty(proto, "value", orig);
    else Reflect.deleteProperty(proto, "value");
  }
});

test("foreign input snapshots contain neutral keyboard and text fields", () => {
  const { document, domain, root, win } = fixture();
  const mount = domain.mount(root()),
    ancestor = mount.createDiv();
  mount.appendChild(ancestor);
  const leaf = getRealNode(domain, ancestor)!.appendChild(document.createElement("span"));
  let keyboard, input;
  ancestor.onKeyDown((e) => {
    keyboard = e;
  });
  ancestor.onInput((e) => {
    input = e;
  });
  leaf.dispatchEvent(
    new win.KeyboardEvent("keydown", {
      bubbles: true,
      key: "x",
      code: "KeyX",
    }) as unknown as Event,
  );
  leaf.dispatchEvent(
    new win.InputEvent("input", {
      bubbles: true,
      data: "x",
      inputType: "insertText",
    }) as unknown as Event,
  );
  expect(keyboard).toMatchObject({ key: "", code: "", target: { id: "" } });
  expect(input).toMatchObject({
    data: null,
    inputType: "",
    target: { id: "" },
  });
});

test("unreadable control value leaves the rest of a frozen event available", () => {
  const { document, root, win } = fixture();
  const proto = win.HTMLOutputElement.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, "value")!;
  Object.defineProperty(proto, "value", {
    ...desc,
    get() {
      throw Error();
    },
  });
  try {
    const domain = createSafeDomain(document),
      control = domain.mount(root()).createOutput();
    control.setId("answer");
    let event: SafeEvent | undefined;
    control.onChange((e) => {
      event = e;
    });
    getRealNode(domain, control)!.dispatchEvent(new win.Event("change") as unknown as Event);
    expect(event?.target).toEqual({ id: "answer" });
    expect(Object.isFrozen(event)).toBe(true);
  } finally {
    Object.defineProperty(proto, "value", desc);
  }
});

test("select mousemove projects its value without traversing options", () => {
  const { domain, root, win } = fixture();
  const doc = domain.mount(root()), select = doc.createSelect();
  doc.appendChild(select);
  for (let i = 0; i < 100; i++) select.appendChild(doc.createOption());
  const p = owners.get(domain)!.platform, node = p.node, read = p.read;
  let siblings = 0, values = 0, calls = 0;
  p.node = (key, ...args) => {
    if (key === "firstChild" || key === "nextSibling") siblings++;
    return node(key, ...args);
  };
  p.read = (iface, key, ...args) => {
    if (iface === "HTMLSelectElement" && key === "value") values++;
    return read(iface, key, ...args);
  };
  select.onMouseMove(() => calls++);
  getRealNode(domain, select)!.dispatchEvent(new win.MouseEvent("mousemove") as unknown as Event);
  expect([calls, siblings, values]).toEqual([1, 0, 1]);
});

test("a target placement getter failure leaves the bubbling event available", () => {
  const { domain, root, win } = fixture();
  const doc = domain.mount(root()), outer = doc.createDiv(), target = doc.createButton();
  outer.appendChild(target);
  doc.appendChild(outer);
  const raw = getRealNode(domain, target)!;
  const p = owners.get(domain)!.platform, node = p.node;
  p.node = (op, receiver, ...args) => {
    if (op === "parentNode" && receiver === raw) throw Error();
    return node(op, receiver, ...args);
  };
  let delivered: SafeEvent | undefined;
  outer.onClick(e => { delivered = e; });
  raw.dispatchEvent(new win.MouseEvent("click", { bubbles: true }) as unknown as Event);
  expect(delivered?.target).toEqual({ id: "" });
  expect(Object.isFrozen(delivered)).toBe(true);
});
