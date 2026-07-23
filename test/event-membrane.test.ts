import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { test } from "vitest";

import { createContainedRoot } from "./support/contained-root.ts";
import { createTestSafeDocument as createSafeDocument } from "./support/create-safe-document.ts";
import type {
  SafeEvent,
  SafeGenericEvent,
  SafeKeyboardEvent,
  SafeMouseEvent,
  SafePointerEvent,
} from "../src/types.ts";

function fixture(): { dom: JSDOM; root: ShadowRoot } {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  return { dom, root: createContainedRoot(dom.window.document) };
}

function assertDeeplyFrozenData(value: unknown, seen = new Set<unknown>()): void {
  if (value === null || value === undefined) return;
  if (typeof value === "function") {
    assert.equal(Object.isFrozen(value), true, "reachable cancellation function is frozen");
    return;
  }
  if (typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  assert.equal(Object.isFrozen(value), true, "reachable snapshot record/array is frozen");

  for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
    assert.equal(descriptor.get, undefined, "snapshot contains no live getter");
    assert.equal(descriptor.set, undefined, "snapshot contains no setter");
    if ("value" in descriptor) assertDeeplyFrozenData(descriptor.value, seen);
  }
}

function getNativeInputValue(window: JSDOM["window"], input: HTMLInputElement): string {
  const getter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.get;
  if (typeof getter !== "function") throw new Error("missing native input value getter");
  return Reflect.apply(getter, input, []) as string;
}

function setNativeInputValue(
  window: JSDOM["window"],
  input: HTMLInputElement,
  value: string,
): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  if (typeof setter !== "function") throw new Error("missing native input value setter");
  Reflect.apply(setter, input, [value]);
}

test("keyboard event is an immutable primitive snapshot despite hostile own getters", () => {
  const { dom, root } = fixture();
  const safeDocument = createSafeDocument(root);
  const safeInput = safeDocument.createInput();
  safeInput.setId("control");
  safeInput.setValue("trusted-value");
  safeInput.setType("checkbox");
  safeInput.setChecked(true);
  safeDocument.appendChild(safeInput);
  const input = root.querySelector("input");
  assert.ok(input);

  let ownValueReads = 0;
  Object.defineProperty(input, "value", {
    configurable: true,
    get() {
      ownValueReads += 1;
      return dom.window;
    },
  });

  let retained: SafeKeyboardEvent | undefined;
  let hostileEventGetterReads = 0;
  safeInput.onKeyDown((event) => {
    retained = event;
    assert.equal(event.preventDefault(), true);
  });

  const nativeEvent = new dom.window.KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    key: "A",
    code: "KeyA",
    location: 1,
    repeat: true,
    ctrlKey: true,
    altKey: true,
  });
  for (const property of ["type", "target", "key", "ctrlKey", "altKey"]) {
    Object.defineProperty(nativeEvent, property, {
      configurable: true,
      get() {
        hostileEventGetterReads += 1;
        if (property === "key") throw dom.window.document.body;
        if (property === "ctrlKey") throw dom.window;
        return dom.window.document.documentElement;
      },
    });
  }
  Object.defineProperty(nativeEvent, "preventDefault", {
    configurable: true,
    value() {
      throw dom.window.document.body;
    },
  });

  assert.doesNotThrow(() => input.dispatchEvent(nativeEvent));
  assert.ok(retained);
  assert.equal(hostileEventGetterReads, 0, "own/custom event getters were never invoked");
  assert.equal(ownValueReads, 0, "own control value getter was never invoked");
  assert.equal(retained.kind, "keyboard");
  assert.equal(retained.type, "keydown");
  assert.equal(retained.key, "A");
  assert.equal(retained.code, "KeyA");
  assert.equal(retained.location, 1);
  assert.equal(retained.repeat, true);
  assert.equal(retained.ctrlKey, true);
  assert.equal(retained.altKey, true);
  assert.deepEqual(retained.target, { id: "control", value: "trusted-value", checked: true });
  assert.deepEqual(retained.currentTarget, {
    id: "control",
    value: "trusted-value",
    checked: true,
  });
  assert.equal(nativeEvent.defaultPrevented, true);

  assert.equal(retained.preventDefault(), false);
  assert.equal(retained.stopPropagation(), false);
  assert.equal(retained.stopImmediatePropagation(), false);
  assert.equal(Reflect.set(retained.target, "value", "guest-write"), false);
  assert.equal(getNativeInputValue(dom.window, input), "trusted-value");

  setNativeInputValue(dom.window, input, "changed-after-dispatch");
  assert.equal(retained.target.value, "trusted-value", "retained data remains a stable snapshot");
  assertDeeplyFrozenData(retained);
});

test("custom targets and getters that throw DOM/global/function values expose only primitives", () => {
  const { dom, root } = fixture();
  const safeDocument = createSafeDocument(root);
  const safeTarget = safeDocument.createDiv();
  safeTarget.setId("custom");
  safeDocument.appendChild(safeTarget);
  const target = root.querySelector("div");
  assert.ok(target);

  let getterReads = 0;
  Object.defineProperty(target, "value", {
    configurable: true,
    get() {
      getterReads += 1;
      throw dom.window.document.body;
    },
  });

  let retained: SafeGenericEvent | undefined;
  safeTarget.onScroll((event) => {
    retained = event;
  });

  const nativeEvent = new dom.window.Event("scroll", { bubbles: true });
  for (const [property, thrown] of [
    ["type", dom.window],
    ["bubbles", dom.window.document],
    ["currentTarget", () => dom.window],
  ] as const) {
    Object.defineProperty(nativeEvent, property, {
      configurable: true,
      get() {
        getterReads += 1;
        throw thrown;
      },
    });
  }

  assert.doesNotThrow(() => target.dispatchEvent(nativeEvent));
  assert.ok(retained);
  assert.equal(getterReads, 0);
  assert.equal(retained.kind, "generic");
  assert.equal(retained.type, "scroll");
  assert.deepEqual(retained.target, { id: "custom" });
  assert.deepEqual(retained.currentTarget, { id: "custom" });
  assert.equal("value" in retained.target, false);
  assertDeeplyFrozenData(retained);
});

test("owned related targets expose only their local ID and branded control primitives", () => {
  const { dom, root } = fixture();
  const safeDocument = createSafeDocument(root);
  const safeTarget = safeDocument.createInput();
  const safeRelated = safeDocument.createInput();
  safeTarget.setId("target-local");
  safeRelated.setId("related-local");
  safeRelated.setValue("owned-value");
  safeRelated.setType("checkbox");
  safeRelated.setChecked(true);
  safeDocument.appendChild(safeTarget);
  safeDocument.appendChild(safeRelated);
  const [target, related] = root.querySelectorAll("input");
  assert.ok(target);
  assert.ok(related);

  let retained: SafeMouseEvent | undefined;
  safeTarget.onClick((event) => { retained = event; });
  target.dispatchEvent(new dom.window.MouseEvent("click", { relatedTarget: related }));

  assert.ok(retained);
  assert.deepEqual(retained.relatedTarget, {
    id: "related-local",
    value: "owned-value",
    checked: true,
  });
  assertDeeplyFrozenData(retained);
});

test("every registered event family produces its discriminated frozen field set", () => {
  const { dom, root } = fixture();

  class FixturePointerEvent extends dom.window.MouseEvent {
    get pointerId(): number { return 41; }
    get width(): number { return 12; }
    get height(): number { return 9; }
    get pressure(): number { return 0.75; }
    get tangentialPressure(): number { return 0.125; }
    get tiltX(): number { return 10; }
    get tiltY(): number { return -5; }
    get twist(): number { return 180; }
    get pointerType(): string { return "pen"; }
    get isPrimary(): boolean { return true; }
  }
  Object.defineProperty(dom.window, "PointerEvent", {
    configurable: true,
    value: FixturePointerEvent,
  });

  const safeDocument = createSafeDocument(root);
  const safeTarget = safeDocument.createInput();
  safeTarget.setId("target");
  safeDocument.appendChild(safeTarget);
  const target = root.querySelector("input");
  assert.ok(target);
  const related = dom.window.document.createElement("input");
  related.id = "related";
  related.value = "host-secret";
  related.checked = true;
  dom.window.document.body.appendChild(related);

  const snapshots: SafeEvent[] = [];
  safeTarget.onScroll((event) => snapshots.push(event));
  safeTarget.onKeyDown((event) => snapshots.push(event));
  safeTarget.onClick((event) => snapshots.push(event));
  safeTarget.onPointerDown((event) => snapshots.push(event));
  safeTarget.onTouchStart((event) => snapshots.push(event));
  safeTarget.onFocus((event) => snapshots.push(event));
  safeTarget.onInput((event) => snapshots.push(event));

  target.dispatchEvent(new dom.window.Event("scroll"));
  target.dispatchEvent(new dom.window.KeyboardEvent("keydown", {
    key: "Enter",
    code: "Enter",
    shiftKey: true,
  }));
  target.dispatchEvent(new dom.window.MouseEvent("click", {
    clientX: 20,
    clientY: 30,
    screenX: 40,
    screenY: 50,
    button: 1,
    buttons: 2,
    relatedTarget: related,
  }));
  target.dispatchEvent(new FixturePointerEvent("pointerdown", {
    clientX: 60,
    clientY: 70,
    buttons: 1,
  }));
  target.dispatchEvent(new dom.window.TouchEvent("touchstart", {
    ctrlKey: true,
    touches: [],
    targetTouches: [],
    changedTouches: [],
  }));
  target.dispatchEvent(new dom.window.FocusEvent("focus", { relatedTarget: related }));
  target.dispatchEvent(new dom.window.InputEvent("input", {
    data: "x",
    inputType: "insertText",
    isComposing: true,
  }));

  assert.deepEqual(snapshots.map(({ kind }) => kind), [
    "generic",
    "keyboard",
    "mouse",
    "pointer",
    "touch",
    "focus",
    "input",
  ]);

  const mouse = snapshots[2] as SafeMouseEvent;
  assert.equal(mouse.clientX, 20);
  assert.equal(mouse.clientY, 30);
  assert.equal(mouse.buttons, 2);
  assert.deepEqual(mouse.relatedTarget, { id: "" });
  assert.deepEqual(Reflect.ownKeys(mouse.relatedTarget ?? {}), ["id"]);

  const pointer = snapshots[3] as SafePointerEvent;
  assert.equal(pointer.clientX, 60);
  assert.equal(pointer.pointerId, 41);
  assert.equal(pointer.pressure, 0.75);
  assert.equal(pointer.pointerType, "pen");
  assert.equal(pointer.isPrimary, true);

  const touch = snapshots[4];
  assert.equal(touch.kind, "touch");
  if (touch.kind === "touch") {
    assert.equal(touch.ctrlKey, true);
    assert.deepEqual(touch.touches, []);
    assert.equal(Object.isFrozen(touch.touches), true);
    assert.equal(Object.isFrozen(touch.targetTouches), true);
    assert.equal(Object.isFrozen(touch.changedTouches), true);
  }

  const focus = snapshots[5];
  assert.equal(focus.kind, "focus");
  if (focus.kind === "focus") assert.deepEqual(focus.relatedTarget, { id: "" });

  const input = snapshots[6];
  assert.equal(input.kind, "input");
  if (input.kind === "input") {
    assert.equal(input.data, "x");
    assert.equal(input.inputType, "insertText");
    assert.equal(input.isComposing, true);
  }

  for (const snapshot of snapshots) assertDeeplyFrozenData(snapshot);
});

test("touch targets use logical owned IDs and redact foreign or disposed targets in every list", () => {
  const { dom, root } = fixture();

  class FixtureTouch {
    readonly #identifier: number;
    readonly #target: EventTarget;
    constructor(identifier: number, target: EventTarget) {
      this.#identifier = identifier;
      this.#target = target;
    }
    get identifier(): number { return this.#identifier; }
    get target(): EventTarget { return this.#target; }
    get screenX(): number { return 1; }
    get screenY(): number { return 2; }
    get clientX(): number { return 3; }
    get clientY(): number { return 4; }
    get pageX(): number { return 5; }
    get pageY(): number { return 6; }
    get radiusX(): number { return 7; }
    get radiusY(): number { return 8; }
    get rotationAngle(): number { return 9; }
    get force(): number { return 0.5; }
  }

  class FixtureTouchList {
    readonly #items: readonly FixtureTouch[];
    constructor(items: readonly FixtureTouch[]) { this.#items = items; }
    get length(): number { return this.#items.length; }
    item(index: number): FixtureTouch | null { return this.#items[index] ?? null; }
  }

  class FixtureTouchEvent extends dom.window.Event {
    readonly #touches: FixtureTouchList;
    readonly #targetTouches: FixtureTouchList;
    readonly #changedTouches: FixtureTouchList;
    constructor(
      type: string,
      touches: FixtureTouchList,
      targetTouches: FixtureTouchList,
      changedTouches: FixtureTouchList,
    ) {
      super(type);
      this.#touches = touches;
      this.#targetTouches = targetTouches;
      this.#changedTouches = changedTouches;
    }
    get touches(): FixtureTouchList { return this.#touches; }
    get targetTouches(): FixtureTouchList { return this.#targetTouches; }
    get changedTouches(): FixtureTouchList { return this.#changedTouches; }
    get ctrlKey(): boolean { return false; }
    get altKey(): boolean { return false; }
    get shiftKey(): boolean { return false; }
    get metaKey(): boolean { return false; }
  }

  Object.defineProperties(dom.window, {
    Touch: { configurable: true, value: FixtureTouch },
    TouchList: { configurable: true, value: FixtureTouchList },
    TouchEvent: { configurable: true, value: FixtureTouchEvent },
  });

  const safeDocument = createSafeDocument(root);
  const safeTarget = safeDocument.createInput();
  const disposed = safeDocument.createInput();
  safeTarget.setId("owned-touch");
  disposed.setId("disposed-touch");
  safeDocument.appendChild(safeTarget);
  safeDocument.appendChild(disposed);
  const rawTarget = root.querySelectorAll("input")[0];
  const rawDisposed = root.querySelectorAll("input")[1];
  assert.ok(rawTarget);
  assert.ok(rawDisposed);
  disposed.dispose();

  const foreign = dom.window.document.createElement("input");
  foreign.id = "foreign-id";
  foreign.value = "foreign-value";
  foreign.checked = true;
  const ownedTouch = new FixtureTouch(1, rawTarget);
  const foreignTouch = new FixtureTouch(2, foreign);
  const disposedTouch = new FixtureTouch(3, rawDisposed);
  let retained: SafeEvent | undefined;
  safeTarget.onTouchStart((event) => { retained = event; });
  rawTarget.dispatchEvent(new FixtureTouchEvent(
    "touchstart",
    new FixtureTouchList([ownedTouch, foreignTouch]),
    new FixtureTouchList([ownedTouch]),
    new FixtureTouchList([disposedTouch, foreignTouch]),
  ));

  assert.ok(retained);
  assert.equal(retained.kind, "touch");
  if (retained.kind !== "touch") throw new Error("expected touch event");
  assert.deepEqual(retained.touches.map((touch) => touch.target), [
    { id: "owned-touch", value: "", checked: false },
    { id: "" },
  ]);
  assert.deepEqual(retained.targetTouches.map((touch) => touch.target), [
    { id: "owned-touch", value: "", checked: false },
  ]);
  assert.deepEqual(retained.changedTouches.map((touch) => touch.target), [
    { id: "" },
    { id: "" },
  ]);
  assertDeeplyFrozenData(retained);
});

test("cancellation cells are independent under reentrancy and expire after each callback", () => {
  const { dom, root } = fixture();
  const safeDocument = createSafeDocument(root);
  const safeTarget = safeDocument.createButton();
  safeDocument.appendChild(safeTarget);
  const target = root.querySelector("button");
  assert.ok(target);

  let outer: SafeMouseEvent | undefined;
  let inner: SafeMouseEvent | undefined;
  const nestedNative = new dom.window.MouseEvent("click", { cancelable: true });

  safeTarget.onClick((event) => {
    if (outer === undefined) {
      outer = event;
      assert.equal(event.preventDefault(), true);
      target.dispatchEvent(nestedNative);
      assert.ok(inner);
      assert.equal(inner.preventDefault(), false, "nested callback was closed on return");
      assert.equal(event.stopPropagation(), true, "outer callback remains live after nested dispatch");
    } else {
      inner = event;
      assert.equal(event.preventDefault(), true);
    }
  });

  const outerNative = new dom.window.MouseEvent("click", { cancelable: true });
  target.dispatchEvent(outerNative);
  assert.ok(outer);
  assert.ok(inner);
  assert.equal(outerNative.defaultPrevented, true);
  assert.equal(nestedNative.defaultPrevented, true);
  assert.equal(outer.preventDefault(), false);
  assert.equal(outer.stopPropagation(), false);
  assert.equal(inner.stopImmediatePropagation(), false);
});

test("listener finally clears the native event even when the guest callback throws", () => {
  const { dom, root } = fixture();
  const safeDocument = createSafeDocument(root);
  const safeTarget = safeDocument.createButton();
  safeDocument.appendChild(safeTarget);
  const target = root.querySelector("button");
  assert.ok(target);
  let retained: SafeMouseEvent | undefined;

  dom.window.addEventListener("error", (event) => event.preventDefault());
  safeTarget.onClick((event) => {
    retained = event;
    throw new Error("guest callback failure");
  });

  target.dispatchEvent(new dom.window.MouseEvent("click", { cancelable: true }));
  assert.ok(retained);
  assert.equal(retained.preventDefault(), false);
  assert.equal(retained.stopPropagation(), false);
  assertDeeplyFrozenData(retained);
});

test("the strict event fence blocks host delegation while preserving internal and prior capture handlers", () => {
  const dom = new JSDOM("<!doctype html><html><body><form id='host-form'></form></body></html>");
  const hostForm = dom.window.document.querySelector("#host-form");
  assert.ok(hostForm);
  const host = dom.window.document.createElement("div");
  host.style.contain = "paint";
  host.dataset.action = "host-submit";
  hostForm.appendChild(host);
  const root = host.attachShadow({ mode: "closed" });

  const observed = {
    action: 0,
    capture: 0,
    documentBubble: 0,
    form: 0,
    hostBubble: 0,
    internalBlur: 0,
    internalClick: 0,
    internalFocus: 0,
    internalKey: 0,
    hotkey: 0,
  };
  dom.window.document.addEventListener("click", () => { observed.capture += 1; }, true);
  dom.window.document.addEventListener("blur", () => { observed.capture += 1; }, true);
  dom.window.document.addEventListener("focus", () => { observed.capture += 1; }, true);
  dom.window.document.addEventListener("keydown", () => { observed.capture += 1; }, true);
  host.addEventListener("click", () => { observed.hostBubble += 1; });
  host.addEventListener("blur", () => { observed.hostBubble += 1; });
  host.addEventListener("focus", () => { observed.hostBubble += 1; });
  host.addEventListener("keydown", () => { observed.hostBubble += 1; });
  dom.window.document.addEventListener("click", (event) => {
    observed.documentBubble += 1;
    const origin = event.target;
    if (origin instanceof dom.window.HTMLElement && origin.dataset.action === "host-submit") {
      observed.action += 1;
      hostForm.requestSubmit();
    }
  });
  dom.window.document.addEventListener("keydown", (event) => {
    observed.documentBubble += 1;
    if (event.key === "Delete") observed.hotkey += 1;
  });
  hostForm.addEventListener("submit", (event) => {
    event.preventDefault();
    observed.form += 1;
  });

  const safeDocument = createSafeDocument(root);
  const button = safeDocument.createButton();
  button.setData("action", "host-submit");
  button.onBlur(() => { observed.internalBlur += 1; });
  button.onClick(() => { observed.internalClick += 1; });
  button.onFocus(() => { observed.internalFocus += 1; });
  button.onKeyDown(() => { observed.internalKey += 1; });
  safeDocument.appendChild(button);
  const rawButton = root.querySelector("button");
  assert.ok(rawButton);

  const click = new dom.window.MouseEvent("click", {
    bubbles: true,
    cancelable: true,
    composed: true,
  });
  Object.defineProperty(click, "stopPropagation", {
    configurable: true,
    value: () => { throw dom.window.document.body; },
  });
  rawButton.dispatchEvent(click);
  rawButton.dispatchEvent(new dom.window.KeyboardEvent("keydown", {
    bubbles: true,
    composed: true,
    key: "Delete",
  }));
  rawButton.dispatchEvent(new dom.window.FocusEvent("focus", {
    bubbles: false,
    composed: true,
  }));
  rawButton.dispatchEvent(new dom.window.FocusEvent("blur", {
    bubbles: false,
    composed: true,
  }));

  assert.deepEqual(observed, {
    action: 0,
    capture: 4,
    documentBubble: 0,
    form: 0,
    hostBubble: 0,
    internalBlur: 1,
    internalClick: 1,
    internalFocus: 1,
    internalKey: 1,
    hotkey: 0,
  });

  safeDocument.dispose();
  rawButton.dataset.action = "host-submit";
  root.append(rawButton);
  rawButton.dispatchEvent(new dom.window.MouseEvent("click", {
    bubbles: true,
    composed: true,
  }));
  rawButton.dispatchEvent(new dom.window.FocusEvent("focus", {
    bubbles: false,
    composed: true,
  }));
  assert.deepEqual(observed, {
    action: 1,
    capture: 6,
    documentBubble: 1,
    form: 1,
    hostBubble: 2,
    internalBlur: 1,
    internalClick: 1,
    internalFocus: 1,
    internalKey: 1,
    hotkey: 0,
  });
});
