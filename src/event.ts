import type {
  SafeEvent,
  SafeEventBase,
  SafeEventKind,
  SafeEventTargetSnapshot,
  SafeFocusEvent,
  SafeGenericEvent,
  SafeInputEvent,
  SafeKeyboardEvent,
  SafeMouseEvent,
  SafePointerEvent,
  SafeTouchEvent,
  SafeTouchSnapshot,
} from "./types.ts";
import type { EventTargetResolution } from "./identifier-namespace.ts";
import {
  captureRealmPlatformFunctions,
  getOwnPlatformFunction,
  getRealmConstructorPrototype,
  type PlatformFunction,
} from "./realm-reflection.ts";

type GetterRecord<Name extends string> = Readonly<
  Record<Name, PlatformFunction | undefined>
>;

export interface SafeEventDispatch<Event extends SafeEvent = SafeEvent> {
  readonly event: Event;
  /** Host-only dispatch terminator. Always invoke it in a finally block. */
  readonly close: () => void;
}

export interface EventSnapshotter {
  readonly open: <Kind extends SafeEventKind>(
    nativeEvent: Event,
    kind: Kind,
  ) => SafeEventDispatch<Extract<SafeEvent, { readonly kind: Kind }>>;
}

type Completer = <Value>(value: Value) => Value;

const apply = Reflect.apply;
const EMPTY_TOUCHES: readonly SafeTouchSnapshot[] = Object.freeze([]);

function captureGetters<const Names extends readonly string[]>(
  realm: unknown,
  constructorName: string,
  names: Names,
): GetterRecord<Names[number]> {
  return captureRealmPlatformFunctions(realm, constructorName, names, "getter");
}

function captureMethods<const Names extends readonly string[]>(
  realm: unknown,
  constructorName: string,
  names: Names,
): GetterRecord<Names[number]> {
  return captureRealmPlatformFunctions(realm, constructorName, names, "method");
}

function captureEventAccessors(realm: unknown) {
  const valueGetters = [
    getOwnPlatformFunction(
      getRealmConstructorPrototype(realm, "HTMLInputElement"),
      "value",
      "getter",
    ),
    getOwnPlatformFunction(
      getRealmConstructorPrototype(realm, "HTMLTextAreaElement"),
      "value",
      "getter",
    ),
    getOwnPlatformFunction(
      getRealmConstructorPrototype(realm, "HTMLSelectElement"),
      "value",
      "getter",
    ),
    getOwnPlatformFunction(
      getRealmConstructorPrototype(realm, "HTMLButtonElement"),
      "value",
      "getter",
    ),
    getOwnPlatformFunction(
      getRealmConstructorPrototype(realm, "HTMLOptionElement"),
      "value",
      "getter",
    ),
    getOwnPlatformFunction(
      getRealmConstructorPrototype(realm, "HTMLOutputElement"),
      "value",
      "getter",
    ),
  ];

  return Object.freeze({
    event: captureGetters(realm, "Event", [
      "type",
      "target",
      "currentTarget",
      "eventPhase",
      "bubbles",
      "cancelable",
      "defaultPrevented",
      "composed",
      "timeStamp",
    ]),
    eventMethods: captureMethods(realm, "Event", [
      "preventDefault",
      "stopPropagation",
      "stopImmediatePropagation",
    ]),
    keyboard: captureGetters(realm, "KeyboardEvent", [
      "key",
      "code",
      "location",
      "repeat",
      "isComposing",
      "ctrlKey",
      "altKey",
      "shiftKey",
      "metaKey",
    ]),
    mouse: captureGetters(realm, "MouseEvent", [
      "screenX",
      "screenY",
      "clientX",
      "clientY",
      "pageX",
      "pageY",
      "offsetX",
      "offsetY",
      "movementX",
      "movementY",
      "button",
      "buttons",
      "relatedTarget",
      "ctrlKey",
      "altKey",
      "shiftKey",
      "metaKey",
    ]),
    pointer: captureGetters(realm, "PointerEvent", [
      "pointerId",
      "width",
      "height",
      "pressure",
      "tangentialPressure",
      "tiltX",
      "tiltY",
      "twist",
      "pointerType",
      "isPrimary",
    ]),
    touchEvent: captureGetters(realm, "TouchEvent", [
      "touches",
      "targetTouches",
      "changedTouches",
      "ctrlKey",
      "altKey",
      "shiftKey",
      "metaKey",
    ]),
    focus: captureGetters(realm, "FocusEvent", ["relatedTarget"]),
    input: captureGetters(realm, "InputEvent", ["data", "inputType", "isComposing"]),
    inputElement: captureGetters(realm, "HTMLInputElement", ["checked"]),
    controlValueGetters: Object.freeze(valueGetters),
    touchList: Object.freeze({
      length: getOwnPlatformFunction(
        getRealmConstructorPrototype(realm, "TouchList"),
        "length",
        "getter",
      ),
      item: getOwnPlatformFunction(
        getRealmConstructorPrototype(realm, "TouchList"),
        "item",
        "method",
      ),
    }),
    touch: captureGetters(realm, "Touch", [
      "identifier",
      "screenX",
      "screenY",
      "clientX",
      "clientY",
      "pageX",
      "pageY",
      "radiusX",
      "radiusY",
      "rotationAngle",
      "force",
      "target",
    ]),
  });
}

type EventAccessors = ReturnType<typeof captureEventAccessors>;

function readUnknown(getter: PlatformFunction | undefined, receiver: unknown): unknown {
  if (getter === undefined) return undefined;
  try {
    return apply(getter, receiver, []);
  } catch {
    // A caught exception may itself be a DOM node, Window, function, or proxy.
    // Never inspect or propagate it across the membrane.
    return undefined;
  }
}

function readString(getter: PlatformFunction | undefined, receiver: unknown, fallback = ""): string {
  const value = readUnknown(getter, receiver);
  return typeof value === "string" ? value : fallback;
}

function readNullableString(getter: PlatformFunction | undefined, receiver: unknown): string | null {
  const value = readUnknown(getter, receiver);
  return typeof value === "string" ? value : null;
}

function readBoolean(getter: PlatformFunction | undefined, receiver: unknown): boolean {
  const value = readUnknown(getter, receiver);
  return typeof value === "boolean" ? value : false;
}

function readNumber(getter: PlatformFunction | undefined, receiver: unknown): number {
  const value = readUnknown(getter, receiver);
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

type EventTargetResolver = (target: unknown) => EventTargetResolution;

function snapshotTarget(
  target: unknown,
  accessors: EventAccessors,
  resolveTarget: EventTargetResolver,
): SafeEventTargetSnapshot {
  const resolution = resolveTarget(target);
  if (!resolution.owned) return Object.freeze({ id: "" });
  const snapshot: { id: string; value?: string; checked?: boolean } = {
    id: resolution.localId,
  };

  for (const valueGetter of accessors.controlValueGetters) {
    const value = readUnknown(valueGetter, target);
    if (typeof value === "string") {
      snapshot.value = value;
      break;
    }
  }

  const checked = readUnknown(accessors.inputElement.checked, target);
  if (typeof checked === "boolean") snapshot.checked = checked;
  return Object.freeze(snapshot);
}

function snapshotRelatedTarget(
  target: unknown,
  accessors: EventAccessors,
  resolveTarget: EventTargetResolver,
): SafeEventTargetSnapshot | null {
  return target === null || target === undefined
    ? null
    : snapshotTarget(target, accessors, resolveTarget);
}

function modifiers(
  getters: GetterRecord<"ctrlKey" | "altKey" | "shiftKey" | "metaKey">,
  nativeEvent: Event,
): SafeModifierSnapshotRecord {
  return {
    ctrlKey: readBoolean(getters.ctrlKey, nativeEvent),
    altKey: readBoolean(getters.altKey, nativeEvent),
    shiftKey: readBoolean(getters.shiftKey, nativeEvent),
    metaKey: readBoolean(getters.metaKey, nativeEvent),
  };
}

interface SafeModifierSnapshotRecord {
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
  readonly metaKey: boolean;
}

interface NativeEventCell {
  nativeEvent: Event | null;
}

function cancellationCapability(
  cell: NativeEventCell,
  method: PlatformFunction | undefined,
): () => boolean {
  return Object.freeze((): boolean => {
    const nativeEvent = cell.nativeEvent;
    if (nativeEvent === null || method === undefined) return false;
    try {
      apply(method, nativeEvent, []);
      return true;
    } catch {
      return false;
    }
  });
}

function baseSnapshot(
  kind: SafeEventKind,
  nativeEvent: Event,
  accessors: EventAccessors,
  cell: NativeEventCell,
  resolveTarget: EventTargetResolver,
): SafeEventBaseRecord {
  return {
    kind,
    type: readString(accessors.event.type, nativeEvent),
    bubbles: readBoolean(accessors.event.bubbles, nativeEvent),
    cancelable: readBoolean(accessors.event.cancelable, nativeEvent),
    composed: readBoolean(accessors.event.composed, nativeEvent),
    defaultPrevented: readBoolean(accessors.event.defaultPrevented, nativeEvent),
    eventPhase: readNumber(accessors.event.eventPhase, nativeEvent),
    timeStamp: readNumber(accessors.event.timeStamp, nativeEvent),
    target: snapshotTarget(readUnknown(accessors.event.target, nativeEvent), accessors, resolveTarget),
    currentTarget: snapshotTarget(
      readUnknown(accessors.event.currentTarget, nativeEvent),
      accessors,
      resolveTarget,
    ),
    preventDefault: cancellationCapability(cell, accessors.eventMethods.preventDefault),
    stopPropagation: cancellationCapability(cell, accessors.eventMethods.stopPropagation),
    stopImmediatePropagation: cancellationCapability(cell, accessors.eventMethods.stopImmediatePropagation),
  };
}

type SafeEventBaseRecord = SafeEventBase<SafeEventKind>;

function mouseFields(
  nativeEvent: Event,
  accessors: EventAccessors,
  resolveTarget: EventTargetResolver,
): Omit<
  SafeMouseEvent,
  keyof SafeEventBaseRecord | "kind"
> {
  return {
    ...modifiers(accessors.mouse, nativeEvent),
    screenX: readNumber(accessors.mouse.screenX, nativeEvent),
    screenY: readNumber(accessors.mouse.screenY, nativeEvent),
    clientX: readNumber(accessors.mouse.clientX, nativeEvent),
    clientY: readNumber(accessors.mouse.clientY, nativeEvent),
    pageX: readNumber(accessors.mouse.pageX, nativeEvent),
    pageY: readNumber(accessors.mouse.pageY, nativeEvent),
    offsetX: readNumber(accessors.mouse.offsetX, nativeEvent),
    offsetY: readNumber(accessors.mouse.offsetY, nativeEvent),
    movementX: readNumber(accessors.mouse.movementX, nativeEvent),
    movementY: readNumber(accessors.mouse.movementY, nativeEvent),
    button: readNumber(accessors.mouse.button, nativeEvent),
    buttons: readNumber(accessors.mouse.buttons, nativeEvent),
    relatedTarget: snapshotRelatedTarget(
      readUnknown(accessors.mouse.relatedTarget, nativeEvent),
      accessors,
      resolveTarget,
    ),
  };
}

function snapshotTouch(
  touch: unknown,
  accessors: EventAccessors,
  resolveTarget: EventTargetResolver,
): SafeTouchSnapshot {
  return Object.freeze({
    identifier: readNumber(accessors.touch.identifier, touch),
    screenX: readNumber(accessors.touch.screenX, touch),
    screenY: readNumber(accessors.touch.screenY, touch),
    clientX: readNumber(accessors.touch.clientX, touch),
    clientY: readNumber(accessors.touch.clientY, touch),
    pageX: readNumber(accessors.touch.pageX, touch),
    pageY: readNumber(accessors.touch.pageY, touch),
    radiusX: readNumber(accessors.touch.radiusX, touch),
    radiusY: readNumber(accessors.touch.radiusY, touch),
    rotationAngle: readNumber(accessors.touch.rotationAngle, touch),
    force: readNumber(accessors.touch.force, touch),
    target: snapshotTarget(readUnknown(accessors.touch.target, touch), accessors, resolveTarget),
  });
}

function snapshotTouchList(
  list: unknown,
  accessors: EventAccessors,
  resolveTarget: EventTargetResolver,
): readonly SafeTouchSnapshot[] {
  const rawLength = readUnknown(accessors.touchList.length, list);
  if (
    typeof rawLength !== "number" ||
    !Number.isSafeInteger(rawLength) ||
    rawLength <= 0 ||
    accessors.touchList.item === undefined
  ) {
    return EMPTY_TOUCHES;
  }

  // Native touch lists are physically small. A cap also prevents a patched
  // platform implementation from turning snapshotting into unbounded work.
  const length = Math.min(rawLength, 256);
  const snapshots: SafeTouchSnapshot[] = [];
  for (let index = 0; index < length; index += 1) {
    let touch: unknown;
    try {
      touch = apply(accessors.touchList.item, list, [index]);
    } catch {
      continue;
    }
    if (touch !== null && touch !== undefined) {
      snapshots.push(snapshotTouch(touch, accessors, resolveTarget));
    }
  }
  return Object.freeze(snapshots);
}

function createSnapshot(
  nativeEvent: Event,
  kind: SafeEventKind,
  accessors: EventAccessors,
  cell: NativeEventCell,
  resolveTarget: EventTargetResolver,
): SafeEvent {
  const base = baseSnapshot(kind, nativeEvent, accessors, cell, resolveTarget);

  switch (kind) {
    case "keyboard": {
      const snapshot: SafeKeyboardEvent = {
        ...base,
        kind,
        ...modifiers(accessors.keyboard, nativeEvent),
        key: readString(accessors.keyboard.key, nativeEvent),
        code: readString(accessors.keyboard.code, nativeEvent),
        location: readNumber(accessors.keyboard.location, nativeEvent),
        repeat: readBoolean(accessors.keyboard.repeat, nativeEvent),
        isComposing: readBoolean(accessors.keyboard.isComposing, nativeEvent),
      };
      return Object.freeze(snapshot);
    }
    case "mouse": {
      const snapshot: SafeMouseEvent = {
        ...base,
        kind,
        ...mouseFields(nativeEvent, accessors, resolveTarget),
      };
      return Object.freeze(snapshot);
    }
    case "pointer": {
      const snapshot: SafePointerEvent = {
        ...base,
        kind,
        ...mouseFields(nativeEvent, accessors, resolveTarget),
        pointerId: readNumber(accessors.pointer.pointerId, nativeEvent),
        width: readNumber(accessors.pointer.width, nativeEvent),
        height: readNumber(accessors.pointer.height, nativeEvent),
        pressure: readNumber(accessors.pointer.pressure, nativeEvent),
        tangentialPressure: readNumber(accessors.pointer.tangentialPressure, nativeEvent),
        tiltX: readNumber(accessors.pointer.tiltX, nativeEvent),
        tiltY: readNumber(accessors.pointer.tiltY, nativeEvent),
        twist: readNumber(accessors.pointer.twist, nativeEvent),
        pointerType: readString(accessors.pointer.pointerType, nativeEvent),
        isPrimary: readBoolean(accessors.pointer.isPrimary, nativeEvent),
      };
      return Object.freeze(snapshot);
    }
    case "touch": {
      const snapshot: SafeTouchEvent = {
        ...base,
        kind,
        ...modifiers(accessors.touchEvent, nativeEvent),
        touches: snapshotTouchList(
          readUnknown(accessors.touchEvent.touches, nativeEvent),
          accessors,
          resolveTarget,
        ),
        targetTouches: snapshotTouchList(
          readUnknown(accessors.touchEvent.targetTouches, nativeEvent),
          accessors,
          resolveTarget,
        ),
        changedTouches: snapshotTouchList(
          readUnknown(accessors.touchEvent.changedTouches, nativeEvent),
          accessors,
          resolveTarget,
        ),
      };
      return Object.freeze(snapshot);
    }
    case "focus": {
      const snapshot: SafeFocusEvent = {
        ...base,
        kind,
        relatedTarget: snapshotRelatedTarget(
          readUnknown(accessors.focus.relatedTarget, nativeEvent),
          accessors,
          resolveTarget,
        ),
      };
      return Object.freeze(snapshot);
    }
    case "input": {
      const snapshot: SafeInputEvent = {
        ...base,
        kind,
        data: readNullableString(accessors.input.data, nativeEvent),
        inputType: readString(accessors.input.inputType, nativeEvent),
        isComposing: readBoolean(accessors.input.isComposing, nativeEvent),
      };
      return Object.freeze(snapshot);
    }
    case "generic": {
      const snapshot: SafeGenericEvent = { ...base, kind };
      return Object.freeze(snapshot);
    }
  }
}

/** Capture realm-local WebIDL accessors before an adversarial event arrives. */
export function createEventSnapshotter(
  realm: unknown,
  complete: Completer,
  resolveTarget: EventTargetResolver,
): EventSnapshotter {
  const accessors = captureEventAccessors(realm);
  const open = Object.freeze(<Kind extends SafeEventKind>(
    nativeEvent: Event,
    kind: Kind,
  ): SafeEventDispatch<Extract<SafeEvent, { readonly kind: Kind }>> => {
    const cell: NativeEventCell = { nativeEvent };
    const event = complete(createSnapshot(
      nativeEvent,
      kind,
      accessors,
      cell,
      resolveTarget,
    )) as Extract<SafeEvent, { readonly kind: Kind }>;
    let closed = false;
    const close = Object.freeze((): void => {
      if (closed) return;
      closed = true;
      cell.nativeEvent = null;
      Object.freeze(cell);
    });
    return Object.freeze({ event, close });
  });
  return Object.freeze({ open });
}
