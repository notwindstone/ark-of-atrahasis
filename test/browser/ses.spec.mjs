import {
  expect,
  expectNoUnapprovedActivity,
  flushBrowserWork,
  openHarness,
  test,
} from "./fixtures.mjs";
import { PUBLIC_EVENT_CATALOG } from "../../src/event-catalog.ts";

const BASE_EVENT_FIELDS = [
  "bubbles",
  "cancelable",
  "composed",
  "currentTarget",
  "defaultPrevented",
  "eventPhase",
  "kind",
  "preventDefault",
  "stopImmediatePropagation",
  "stopPropagation",
  "target",
  "timeStamp",
  "type",
];
const MODIFIER_FIELDS = ["altKey", "ctrlKey", "metaKey", "shiftKey"];
const MOUSE_FIELDS = [
  "button",
  "buttons",
  "clientX",
  "clientY",
  "movementX",
  "movementY",
  "offsetX",
  "offsetY",
  "pageX",
  "pageY",
  "relatedTarget",
  "screenX",
  "screenY",
];
const EVENT_FIELDS = Object.freeze({
  generic: [...BASE_EVENT_FIELDS].sort(),
  keyboard: [
    ...BASE_EVENT_FIELDS,
    ...MODIFIER_FIELDS,
    "code",
    "isComposing",
    "key",
    "location",
    "repeat",
  ].sort(),
  mouse: [...BASE_EVENT_FIELDS, ...MODIFIER_FIELDS, ...MOUSE_FIELDS].sort(),
  pointer: [
    ...BASE_EVENT_FIELDS,
    ...MODIFIER_FIELDS,
    ...MOUSE_FIELDS,
    "height",
    "isPrimary",
    "pointerId",
    "pointerType",
    "pressure",
    "tangentialPressure",
    "tiltX",
    "tiltY",
    "twist",
    "width",
  ].sort(),
  touch: [
    ...BASE_EVENT_FIELDS,
    ...MODIFIER_FIELDS,
    "changedTouches",
    "targetTouches",
    "touches",
  ].sort(),
  focus: [...BASE_EVENT_FIELDS, "relatedTarget"].sort(),
  input: [...BASE_EVENT_FIELDS, "data", "inputType", "isComposing"].sort(),
});
const TOUCH_FIELDS = [
  "clientX",
  "clientY",
  "force",
  "identifier",
  "pageX",
  "pageY",
  "radiusX",
  "radiusY",
  "rotationAngle",
  "screenX",
  "screenY",
  "target",
].sort();
const CONTROL_EVENT_FIELDS = new Set([
  "kind",
  "preventDefault",
  "stopImmediatePropagation",
  "stopPropagation",
]);
const POISONED_EVENT_FIELDS = Object.freeze(Object.fromEntries(
  Object.entries(EVENT_FIELDS).map(([family, fields]) => [
    family,
    fields.filter((field) => !CONTROL_EVENT_FIELDS.has(field)),
  ]),
));
const PUBLIC_EVENT_REGISTRATIONS = Object.freeze(Object.fromEntries(
  Object.entries(PUBLIC_EVENT_CATALOG).map(([method, metadata]) => [
    method,
    Object.freeze({ kind: metadata.kind, type: metadata.type }),
  ]),
));

test("real browser SES hardens the completed public capability graph", async ({
  page,
  browserLedger,
}) => {
  await openHarness(page, browserLedger);

  const state = await page.evaluateHandle(() => {
    const mount = document.querySelector("#mount");
    if (!(mount instanceof HTMLElement)) throw new Error("host fixture is incomplete");
    const root = mount.attachShadow({ mode: "open" });
    const safeDocument = globalThis.arkPublicAPI.createSafeDocument(root, {
      stylePolicy: { allowedProperties: ["color"] },
      formControlPolicy: { allowNonCredentialFormElements: true },
    });
    const input = safeDocument.createInput();
    const guest = new Compartment({ safeDocument });
    guest.evaluate(`
      globalThis.div = safeDocument.createDiv();
      div.setId("browser-trace");
      div.setText("guest trace");
      div.style.set("color", "red");
      safeDocument.appendChild(div);
      globalThis.image = safeDocument.createImage();
      globalThis.denied = image.setSrc("https://attacker.test/ses.png");
      safeDocument.appendChild(image);
      image.detach();
      safeDocument.appendChild(image);
      globalThis.clicks = 0;
      globalThis.cleanup = div.onClick(event => {
        globalThis.snapshot = event;
        globalThis.clicks += 1;
      });
    `);
    const guestDiv = guest.evaluate("div");
    const rawDiv = root.querySelector("div");
    if (!(rawDiv instanceof HTMLElement)) throw new Error("guest trace div is missing");
    rawDiv.dispatchEvent(new MouseEvent("click", { cancelable: true }));
    return { root, safeDocument, guest, input, guestDiv };
  });
  try {
    const live = await state.evaluate(({ root, safeDocument, guest, input, guestDiv }) => ({
      compartment: typeof Compartment === "function",
      document: Object.isFrozen(safeDocument),
      input: Object.isFrozen(input),
      inputMethod: Object.isFrozen(input.getValue),
      style: Object.isFrozen(input.style),
      styleMethod: Object.isFrozen(input.style.set),
      guestDiv: Object.isFrozen(guestDiv),
      trace: {
        lookup: guest.evaluate('safeDocument.getElement("browser-trace") === div'),
        style: guest.evaluate('div.style.get("color")'),
        denied: guest.evaluate("({ allowed: denied.allowed, code: denied.error.code })"),
        imageReattached: root.querySelector("img") !== null,
        clicks: guest.evaluate("clicks"),
        eventFrozen: guest.evaluate("Object.isFrozen(snapshot)"),
        targetFrozen: guest.evaluate("Object.isFrozen(snapshot.target)"),
        controlClosed: guest.evaluate("snapshot.preventDefault() === false"),
        cleanupFrozen: guest.evaluate("Object.isFrozen(cleanup)"),
      },
    }));
    await flushBrowserWork(page);
    expectNoUnapprovedActivity(browserLedger);

    const terminal = await state.evaluate(({ root, safeDocument, guest }) => {
      safeDocument.dispose();
      const disposed = guest.evaluate(`
        try {
          div.getText();
          null;
        } catch (error) {
          ({ code: error.code, frozen: Object.isFrozen(error) });
        }
      `);
      return { disposed, rootEmpty: root.childNodes.length === 0 };
    });
    await flushBrowserWork(page);

    expect(live).toEqual({
      compartment: true,
      document: true,
      input: true,
      inputMethod: true,
      style: true,
      styleMethod: true,
      guestDiv: true,
      trace: {
        lookup: true,
        style: "red",
        denied: { allowed: false, code: "ERR_URL_DENIED" },
        imageReattached: true,
        clicks: 1,
        eventFrozen: true,
        targetFrozen: true,
        controlClosed: true,
        cleanupFrozen: true,
      },
    });
    expect(terminal).toEqual({
      disposed: { code: "DOCUMENT_DISPOSED", frozen: true },
      rootEmpty: true,
    });
    expectNoUnapprovedActivity(browserLedger);
  } finally {
    await state.dispose();
  }
});

test("post-lockdown dispatches every advertised public event type through its fence", async ({
  page,
  browserLedger,
}) => {
  await openHarness(page, browserLedger);

  const result = await page.evaluate((registrations) => {
    const host = document.createElement("div");
    host.style.contain = "paint";
    document.body.append(host);
    const root = host.attachShadow({ mode: "closed" });
    const safeDocument = globalThis.arkPublicAPI.createSafeDocument(root, {
      formControlPolicy: { allowNonCredentialFormElements: true },
    });
    const target = safeDocument.createInput();
    safeDocument.appendChild(target);
    const rawTarget = root.querySelector("input");
    if (!(rawTarget instanceof HTMLInputElement)) throw new Error("event target is missing");

    const hardenedRegistrations = harden(registrations);
    const delegated = [];
    for (const { type } of Object.values(hardenedRegistrations)) {
      host.addEventListener(type, () => delegated.push(type));
    }
    const guest = new Compartment({ registrations: hardenedRegistrations, target });
    guest.evaluate(`
      globalThis.snapshots = [];
      for (const [method, metadata] of Object.entries(registrations)) {
        target[method](event => {
          snapshots.push({
            deeplyFrozen: Object.isFrozen(event) && Object.isFrozen(event.target),
            kind: event.kind,
            method,
            type: event.type,
          });
        });
      }
    `);

    const createNativeEvent = ({ kind, type }) => {
      const initialization = { bubbles: true, cancelable: true, composed: true };
      if (kind === "keyboard") return new KeyboardEvent(type, initialization);
      if (kind === "mouse") return new MouseEvent(type, initialization);
      if (kind === "pointer") return new PointerEvent(type, initialization);
      if (kind === "focus") return new FocusEvent(type, initialization);
      if (kind === "touch") return new TouchEvent(type, initialization);
      if (kind === "input" && type === "input") {
        return new InputEvent(type, initialization);
      }
      return new Event(type, initialization);
    };
    for (const metadata of Object.values(hardenedRegistrations)) {
      rawTarget.dispatchEvent(createNativeEvent(metadata));
    }

    const snapshots = guest.evaluate("snapshots");
    safeDocument.dispose();
    host.remove();
    return { delegated, snapshots };
  }, PUBLIC_EVENT_REGISTRATIONS);
  await flushBrowserWork(page);

  expect(result.snapshots).toEqual(
    Object.entries(PUBLIC_EVENT_REGISTRATIONS).map(([method, metadata]) => ({
      deeplyFrozen: true,
      kind: metadata.kind,
      method,
      type: metadata.type,
    })),
  );
  expect(result.delegated).toEqual([]);
  expectNoUnapprovedActivity(browserLedger);
});

test("real browser SES covers the browser-relevant strict acceptance matrix", async ({
  page,
  browserLedger,
}) => {
  await openHarness(page, browserLedger);

  const result = await page.evaluate(() => {
    const mount = document.querySelector("#mount");
    const hostForm = document.querySelector("#host-form");
    if (!(mount instanceof HTMLElement) || !(hostForm instanceof HTMLFormElement)) {
      throw new Error("host fixture is incomplete");
    }
    const hostFormBefore = [...new FormData(hostForm).entries()];
    const root = mount.attachShadow({ mode: "open" });
    const safeDocument = globalThis.arkPublicAPI.createSafeDocument(root, {
      stylePolicy: { allowedProperties: ["color"] },
      formControlPolicy: { allowNonCredentialFormElements: true },
    });

    const foreignHost = document.createElement("div");
    foreignHost.style.contain = "paint";
    document.body.append(foreignHost);
    const foreignRoot = foreignHost.attachShadow({ mode: "open" });
    const foreignDocument = globalThis.arkPublicAPI.createSafeDocument(foreignRoot);
    const foreignWrapper = foreignDocument.createDiv();
    const guest = new Compartment({ foreignWrapper, safeDocument });

    guest.evaluate(`
      globalThis.capture = action => {
        try {
          action();
          return null;
        } catch (error) {
          return {
            code: error.code,
            frozen: Object.isFrozen(error),
            noCause: !Object.hasOwn(error, "cause"),
            noStack: !Object.hasOwn(error, "stack"),
            operation: error.operation,
          };
        }
      };
      globalThis.authority = {
        domGlobalsAbsent: [typeof document, typeof window, typeof Node, typeof Element]
          .every(value => value === "undefined"),
        rawKeysAbsent: ["root", "host", "ownerDocument", "defaultView"]
          .every(key => !Reflect.ownKeys(safeDocument).includes(key)),
      };
      globalThis.div = safeDocument.createDiv();
      div.setText("ses matrix");
      globalThis.styleAllowed = div.style.set("color", "red");
      globalThis.styleDenied = div.style.set("position", "fixed");
      safeDocument.appendChild(div);
      globalThis.image = safeDocument.createImage();
      globalThis.urlDenied = image.setSrc("https://attacker.test/ses-matrix.png");
      safeDocument.appendChild(image);

      globalThis.input = safeDocument.createInput();
      input.setId("ses-control");
      input.setName("ses-name");
      globalThis.passwordError = capture(() => input.setType("password"));
      safeDocument.appendChild(input);

      globalThis.button = safeDocument.createButton();
      safeDocument.appendChild(button);
      button.onClick(event => { globalThis.eventSnapshot = event; });
      globalThis.topologyError = capture(() => div.appendChild(div));
      globalThis.crossOwnerError = capture(() => safeDocument.appendChild(foreignWrapper));
      globalThis.numericError = capture(() => safeDocument.createCanvas().setWidth(Infinity));
    `);

    const rawButton = root.querySelector("button");
    const rawInput = root.querySelector("input");
    if (!(rawButton instanceof HTMLButtonElement) || !(rawInput instanceof HTMLInputElement)) {
      throw new Error("SES matrix controls are missing");
    }
    const event = new MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: false });
    Object.defineProperty(event, "ctrlKey", {
      configurable: true,
      get: () => { throw document.body; },
    });
    rawButton.dispatchEvent(event);

    const formIsolation = {
      autocomplete: rawInput.autocomplete,
      formNull: rawInput.form === null,
      hostFormUnchanged: JSON.stringify([...new FormData(hostForm).entries()])
        === JSON.stringify(hostFormBefore),
      type: rawInput.type,
    };
    const outside = document.createElement("section");
    document.body.append(outside);
    outside.append(rawInput);
    const placementError = guest.evaluate(`capture(() => input.getId())`);
    const terminalError = guest.evaluate(`capture(() => input.getValue())`);
    const placementRevocation = {
      idPreserved: rawInput.hasAttribute("id"),
      namePreserved: rawInput.hasAttribute("name"),
      stillOutside: outside.firstElementChild === rawInput,
    };

    const guestResult = guest.evaluate(`({
      authority,
      crossOwnerError,
      event: {
        ctrlKey: eventSnapshot.ctrlKey,
        frozen: Object.isFrozen(eventSnapshot),
        targetFrozen: Object.isFrozen(eventSnapshot.target),
      },
      numericError,
      passwordError,
      styleAllowed,
      styleDenied,
      topologyError,
      urlDenied: { allowed: urlDenied.allowed, code: urlDenied.error.code },
    })`);

    safeDocument.dispose();
    foreignDocument.dispose();
    outside.remove();
    foreignHost.remove();
    return { formIsolation, guestResult, placementError, placementRevocation, terminalError };
  });

  await flushBrowserWork(page);
  expect(result).toMatchObject({
    formIsolation: {
      autocomplete: "off",
      formNull: true,
      hostFormUnchanged: true,
      type: "text",
    },
    guestResult: {
      authority: { domGlobalsAbsent: true, rawKeysAbsent: true },
      crossOwnerError: { code: "CROSS_OWNER", frozen: true, noCause: true, noStack: true },
      event: { ctrlKey: false, frozen: true, targetFrozen: true },
      numericError: { code: "ERR_INVALID_ARGUMENT", frozen: true, noCause: true, noStack: true },
      passwordError: { code: "ERR_INVALID_ARGUMENT", frozen: true, noCause: true, noStack: true },
      styleAllowed: true,
      styleDenied: false,
      topologyError: { code: "DOM_OPERATION_FAILED", frozen: true, noCause: true, noStack: true },
      urlDenied: { allowed: false, code: "ERR_URL_DENIED" },
    },
    placementRevocation: { idPreserved: true, namePreserved: true, stillOutside: true },
    placementError: { code: "PLACEMENT_VIOLATION", frozen: true, noCause: true, noStack: true },
    terminalError: { code: "NODE_REVOKED", frozen: true, noCause: true, noStack: true },
  });
  expectNoUnapprovedActivity(browserLedger);
});

test("real browser SES snapshots every advertised event family and public field", async ({
  browserName,
  page,
  browserLedger,
}) => {
  await openHarness(page, browserLedger);

  const setup = await page.evaluate(({
    allowTouchConstructorFallback,
    poisonedEventFields,
    touchFields,
  }) => {
    const host = document.createElement("div");
    Object.assign(host.style, {
      contain: "paint",
      height: "120px",
      width: "240px",
    });
    document.body.append(host);
    const root = host.attachShadow({ mode: "open" });
    const safeDocument = globalThis.arkPublicAPI.createSafeDocument(root, {
      formControlPolicy: { allowNonCredentialFormElements: true },
    });
    const target = safeDocument.createInput();
    target.setId("event-target");
    target.setType("checkbox");
    target.setValue("event-value");
    target.setChecked(true);
    const related = safeDocument.createInput();
    related.setId("event-related");
    related.setValue("related-value");
    const touchTarget = safeDocument.createDiv();
    touchTarget.setId("touch-target");
    for (const wrapper of [target, related, touchTarget]) safeDocument.appendChild(wrapper);
    const rawTarget = root.querySelectorAll("input")[0];
    const rawRelated = root.querySelectorAll("input")[1];
    const rawTouchTarget = root.querySelector("div");
    if (
      !(rawTarget instanceof HTMLInputElement)
      || !(rawRelated instanceof HTMLInputElement)
      || !(rawTouchTarget instanceof HTMLDivElement)
    ) {
      throw new Error("event matrix targets are missing");
    }
    Object.assign(rawTouchTarget.style, {
      display: "block",
      height: "40px",
      width: "100px",
    });

    let poisonReads = 0;
    const poison = (event, properties) => properties.map((property) => {
      try {
        Object.defineProperty(event, property, {
          configurable: true,
          get: () => {
            poisonReads += 1;
            throw document.body;
          },
        });
        return property;
      } catch {
        return `rejected:${property}`;
      }
    });
    const poisoned = {};
    const nestedMouse = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: 7,
      clientY: 8,
    });
    const dispatchNested = harden(() => rawTarget.dispatchEvent(nestedMouse));
    const guest = new Compartment({ dispatchNested, target, touchTarget });
    guest.evaluate(`
      globalThis.snapshots = {};
      globalThis.controls = {
        innerDuring: false,
        innerLateDuringOuter: false,
        outerDuring: false,
        outerStillLive: false,
      };
      globalThis.inMouse = false;
      target.onScroll(event => { snapshots.generic = event; });
      target.onKeyDown(event => { snapshots.keyboard = event; });
      target.onClick(event => {
        if (inMouse) {
          snapshots.inner = event;
          controls.innerDuring = event.preventDefault();
          return;
        }
        inMouse = true;
        snapshots.mouse = event;
        controls.outerDuring = event.preventDefault();
        dispatchNested();
        controls.innerLateDuringOuter = snapshots.inner.preventDefault();
        controls.outerStillLive = event.stopPropagation();
        inMouse = false;
      });
      target.onPointerDown(event => { snapshots.pointer = event; });
      target.onFocus(event => { snapshots.focus = event; });
      target.onInput(event => { snapshots.input = event; });
      touchTarget.onTouchStart(event => { snapshots.touch = event; });
    `);

    const generic = new Event("scroll", { bubbles: true, cancelable: true, composed: true });
    poisoned.generic = poison(generic, poisonedEventFields.generic);
    rawTarget.dispatchEvent(generic);

    const keyboard = new KeyboardEvent("keydown", {
      altKey: true,
      bubbles: true,
      cancelable: true,
      code: "KeyK",
      composed: true,
      ctrlKey: true,
      isComposing: true,
      key: "k",
      location: 1,
      repeat: true,
      shiftKey: true,
    });
    poisoned.keyboard = poison(keyboard, poisonedEventFields.keyboard);
    rawTarget.dispatchEvent(keyboard);

    const mouse = new MouseEvent("click", {
      altKey: true,
      bubbles: true,
      button: 1,
      buttons: 2,
      cancelable: true,
      clientX: 20,
      clientY: 30,
      composed: true,
      ctrlKey: true,
      relatedTarget: rawRelated,
      screenX: 40,
      screenY: 50,
      shiftKey: true,
    });
    poisoned.mouse = poison(mouse, poisonedEventFields.mouse);
    rawTarget.dispatchEvent(mouse);

    const pointer = new PointerEvent("pointerdown", {
      altKey: true,
      bubbles: true,
      buttons: 1,
      cancelable: true,
      clientX: 60,
      clientY: 70,
      composed: true,
      height: 9,
      isPrimary: true,
      pointerId: 41,
      pointerType: "pen",
      pressure: 0.75,
      relatedTarget: rawRelated,
      tangentialPressure: 0.125,
      twist: 180,
      width: 12,
    });
    poisoned.pointer = poison(pointer, poisonedEventFields.pointer);
    rawTarget.dispatchEvent(pointer);

    const focus = new FocusEvent("focus", {
      bubbles: false,
      cancelable: true,
      composed: true,
      relatedTarget: rawRelated,
    });
    poisoned.focus = poison(focus, poisonedEventFields.focus);
    rawTarget.dispatchEvent(focus);

    const input = new InputEvent("input", {
      bubbles: true,
      cancelable: true,
      composed: true,
      data: "x",
      inputType: "insertText",
      isComposing: true,
    });
    poisoned.input = poison(input, poisonedEventFields.input);
    rawTarget.dispatchEvent(input);

    let touchMode = "constructor";
    let touch;
    let touchEvent;
    try {
      touch = new Touch({
        clientX: 3,
        clientY: 4,
        force: 0.5,
        identifier: 7,
        pageX: 5,
        pageY: 6,
        radiusX: 7,
        radiusY: 8,
        rotationAngle: 9,
        screenX: 1,
        screenY: 2,
        target: rawTouchTarget,
      });
      touchEvent = new TouchEvent("touchstart", {
        bubbles: true,
        cancelable: true,
        changedTouches: [touch],
        composed: true,
        ctrlKey: true,
        targetTouches: [touch],
        touches: [touch],
      });
    } catch (error) {
      if (!allowTouchConstructorFallback) throw error;
      touchMode = "playwright-trusted-touch";
      poisoned.touch = "trusted-injection-no-pre-dispatch-object";
    }
    if (touch !== undefined && touchEvent !== undefined) {
      poisoned.touch = {
        event: poison(touchEvent, poisonedEventFields.touch),
        point: poison(touch, touchFields),
      };
      rawTouchTarget.dispatchEvent(touchEvent);
    }

    const touchRect = rawTouchTarget.getBoundingClientRect();
    globalThis.__arkEventMatrix = {
      guest,
      host,
      mouse,
      nestedMouse,
      poisoned,
      safeDocument,
      getPoisonReads: () => poisonReads,
    };
    return {
      touchMode,
      touchPoint: {
        x: touchRect.left + touchRect.width / 2,
        y: touchRect.top + touchRect.height / 2,
      },
    };
  }, {
    allowTouchConstructorFallback: browserName === "webkit",
    poisonedEventFields: POISONED_EVENT_FIELDS,
    touchFields: TOUCH_FIELDS,
  });

  if (setup.touchMode === "playwright-trusted-touch") {
    await page.touchscreen.tap(setup.touchPoint.x, setup.touchPoint.y);
  }

  const result = await page.evaluate(() => {
    const state = globalThis.__arkEventMatrix;
    const snapshots = state.guest.evaluate("snapshots");
    const deeplyFrozen = (root) => {
      const pending = [root];
      const seen = new Set();
      while (pending.length > 0) {
        const value = pending.pop();
        if ((typeof value !== "object" && typeof value !== "function") || value === null) continue;
        if (seen.has(value)) continue;
        if (!Object.isFrozen(value)) return false;
        seen.add(value);
        for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
          if ("value" in descriptor) pending.push(descriptor.value);
          else if (descriptor.get !== undefined || descriptor.set !== undefined) return false;
        }
      }
      return true;
    };
    const summarize = (event) => {
      const data = {};
      for (const key of Reflect.ownKeys(event)) {
        const value = event[key];
        data[key] = typeof value === "function"
          ? { frozen: Object.isFrozen(value), type: "function" }
          : value;
      }
      return {
        data,
        deeplyFrozen: deeplyFrozen(event),
        keys: Reflect.ownKeys(event).sort(),
        timeStampFinite: Number.isFinite(event.timeStamp),
      };
    };
    const summaries = {};
    for (const family of ["generic", "keyboard", "mouse", "pointer", "touch", "focus", "input"]) {
      if (snapshots[family] === undefined) throw new Error(`missing ${family} snapshot`);
      summaries[family] = summarize(snapshots[family]);
    }
    const controls = state.guest.evaluate(`({
      ...controls,
      innerLate: snapshots.inner.preventDefault(),
      outerLate: snapshots.mouse.preventDefault(),
    })`);
    const defaultPreventedGetter = Object.getOwnPropertyDescriptor(
      Event.prototype,
      "defaultPrevented",
    )?.get;
    if (defaultPreventedGetter === undefined) {
      throw new Error("Event.defaultPrevented getter is missing");
    }
    const terminal = {
      mouseDefaultPrevented: Reflect.apply(defaultPreventedGetter, state.mouse, []),
      nestedDefaultPrevented: Reflect.apply(defaultPreventedGetter, state.nestedMouse, []),
      poisonReads: state.getPoisonReads(),
      poisoned: state.poisoned,
    };
    state.safeDocument.dispose();
    state.host.remove();
    delete globalThis.__arkEventMatrix;
    return { controls, summaries, terminal };
  });

  for (const family of Object.keys(EVENT_FIELDS)) {
    expect(result.summaries[family].keys).toEqual(EVENT_FIELDS[family]);
    expect(result.summaries[family].deeplyFrozen).toBe(true);
    expect(result.summaries[family].timeStampFinite).toBe(true);
    for (const control of ["preventDefault", "stopImmediatePropagation", "stopPropagation"]) {
      expect(result.summaries[family].data[control]).toEqual({ frozen: true, type: "function" });
    }
  }
  expect(result.terminal.poisonReads).toBe(0);
  for (const family of ["generic", "keyboard", "mouse", "pointer", "focus", "input"]) {
    expect(result.terminal.poisoned[family]).toEqual(POISONED_EVENT_FIELDS[family]);
  }
  if (setup.touchMode === "constructor") {
    expect(result.terminal.poisoned.touch).toEqual({
      event: POISONED_EVENT_FIELDS.touch,
      point: TOUCH_FIELDS,
    });
  } else {
    expect(result.terminal.poisoned.touch).toBe("trusted-injection-no-pre-dispatch-object");
  }

  const ownedTarget = { checked: true, id: "event-target", value: "event-value" };
  const relatedTarget = { checked: false, id: "event-related", value: "related-value" };
  for (const family of ["generic", "keyboard", "mouse", "pointer", "focus", "input"]) {
    expect(result.summaries[family].data.target).toEqual(ownedTarget);
    expect(result.summaries[family].data.currentTarget).toEqual(ownedTarget);
  }
  expect(result.summaries.generic.data).toMatchObject({
    bubbles: true,
    cancelable: true,
    composed: true,
    defaultPrevented: false,
    eventPhase: 2,
    kind: "generic",
    type: "scroll",
  });
  expect(result.summaries.keyboard.data).toMatchObject({
    altKey: true,
    code: "KeyK",
    ctrlKey: true,
    isComposing: true,
    key: "k",
    kind: "keyboard",
    location: 1,
    repeat: true,
    shiftKey: true,
    type: "keydown",
  });
  expect(result.summaries.mouse.data).toMatchObject({
    altKey: true,
    button: 1,
    buttons: 2,
    clientX: 20,
    clientY: 30,
    ctrlKey: true,
    kind: "mouse",
    relatedTarget,
    screenX: 40,
    screenY: 50,
    shiftKey: true,
    type: "click",
  });
  expect(result.summaries.pointer.data).toMatchObject({
    buttons: 1,
    clientX: 60,
    clientY: 70,
    height: 9,
    isPrimary: true,
    kind: "pointer",
    pointerId: 41,
    pointerType: "pen",
    pressure: 0.75,
    relatedTarget,
    tangentialPressure: 0.125,
    twist: 180,
    type: "pointerdown",
    width: 12,
  });
  expect(result.summaries.focus.data).toMatchObject({
    kind: "focus",
    relatedTarget,
    type: "focus",
  });
  expect(result.summaries.input.data).toMatchObject({
    data: "x",
    inputType: "insertText",
    isComposing: true,
    kind: "input",
    type: "input",
  });

  const touch = result.summaries.touch.data;
  expect(touch).toMatchObject({
    kind: "touch",
    target: { id: "touch-target" },
    currentTarget: { id: "touch-target" },
    type: "touchstart",
  });
  for (const listName of ["touches", "targetTouches", "changedTouches"]) {
    expect(touch[listName]).toHaveLength(1);
    expect(Reflect.ownKeys(touch[listName][0]).sort()).toEqual(TOUCH_FIELDS);
    expect(touch[listName][0].target).toEqual({ id: "touch-target" });
    for (const field of TOUCH_FIELDS.filter((field) => field !== "target")) {
      expect(Number.isFinite(touch[listName][0][field])).toBe(true);
    }
  }
  if (setup.touchMode === "constructor") {
    expect(touch).toMatchObject({ altKey: false, ctrlKey: true, metaKey: false, shiftKey: false });
    expect(touch.touches[0]).toEqual({
      clientX: 3,
      clientY: 4,
      force: 0.5,
      identifier: 7,
      pageX: 5,
      pageY: 6,
      radiusX: 7,
      radiusY: 8,
      rotationAngle: 9,
      screenX: 1,
      screenY: 2,
      target: { id: "touch-target" },
    });
  }
  expect(result.controls).toEqual({
    innerDuring: true,
    innerLate: false,
    innerLateDuringOuter: false,
    outerDuring: true,
    outerLate: false,
    outerStillLive: true,
  });
  expect(result.terminal).toMatchObject({
    mouseDefaultPrevented: true,
    nestedDefaultPrevented: true,
  });
  expectNoUnapprovedActivity(browserLedger);
});
