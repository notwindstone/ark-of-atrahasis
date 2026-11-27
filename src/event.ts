import type { NodeEntry, Owner } from "./owner.ts";
import { mouseNumbers, pointerNumbers, touchNumbers, type Platform } from "./platform.ts";
import { PUBLIC_EVENT_CATALOG } from "./validators.ts";
import { error } from "./errors.ts";
import type { DeclarativeListenerOptions, EventHandler, SafeEvent } from "./types.ts";

const catalog = new Map<string, (typeof PUBLIC_EVENT_CATALOG)[keyof typeof PUBLIC_EVENT_CATALOG]>(
  Object.values(PUBLIC_EVENT_CATALOG).map((e) => [e.type, e]),
);
type Kind = SafeEvent["kind"];
type Fields = readonly [Parameters<Platform["event"]>[0], string, string | number | boolean | null];
const modifiers = "ctrlKey altKey shiftKey metaKey";
const fields: Record<Kind, Fields[]> = {
  generic: [],
  keyboard: [
    ["KeyboardEvent", modifiers, false],
    ["KeyboardEvent", "key code", ""],
    ["KeyboardEvent", "location", 0],
    ["KeyboardEvent", "repeat isComposing", false],
  ],
  mouse: [
    ["MouseEvent", modifiers, false],
    ["MouseEvent", mouseNumbers, 0],
  ],
  pointer: [
    ["PointerEvent", pointerNumbers, 0],
    ["PointerEvent", "pointerType", ""],
    ["PointerEvent", "isPrimary", false],
  ],
  touch: [["TouchEvent", modifiers, false]],
  focus: [],
  input: [
    ["InputEvent", "data", null],
    ["InputEvent", "inputType", ""],
    ["InputEvent", "isComposing", false],
  ],
};
const base: Fields[] = [
  ["Event", "eventPhase timeStamp", 0],
  ["Event", "bubbles cancelable composed defaultPrevented", false],
];
function scalars(p: Platform, raw: object, spec: Fields[], out: Record<string, unknown>) {
  for (const [iface, names, fallback] of spec)
    for (const name of names.split(" ")) {
      const value = p.event(iface, name, raw);
      out[name] = typeof value === (fallback === null ? "string" : typeof fallback) ? value : fallback;
    }
}

function snapshotTouchList(owner: Owner, list: any) {
  if (!list) return [];
  const p = owner.platform;
  const array = Array.isArray(list);
  const length = array ? list.length : p.event("TouchList", "length", list);
  const touches = [];
  for (let i = 0; i < length; i++) {
    const raw = array ? list[i] : p.call("TouchList", "item", list, i);
    const touch = {
      target: owner.resolveEventTarget(p.event("Touch", "target", raw)) ?? {
        id: "",
      },
    };
    scalars(p, raw, [["Touch", touchNumbers, 0]], touch);
    touches.push(touch);
  }
  return touches;
}

function nativeEventCell(p: Platform | undefined, raw: Event | undefined) {
  function invoke(op: string) {
    if (!p || !raw) return false;
    p.call("Event", op, raw);
    return true;
  }
  return {
    actions: {
      preventDefault: () => invoke("preventDefault"),
      stopPropagation: () => invoke("stopPropagation"),
      stopImmediatePropagation: () => invoke("stopImmediatePropagation"),
    },
    close() {
      raw = undefined;
      p = undefined;
    },
  };
}
function dispatch(owner: Owner, raw: Event, type: string, kind: Kind, handler: EventHandler) {
  const p = owner.platform;
  const cell = nativeEventCell(p, raw);
  try {
    const rawTarget = p.event("Event", "target", raw);
    const target = owner.resolveEventTarget(rawTarget);
    const current = p.event("Event", "currentTarget", raw);
    const snapshot: Record<string, unknown> = {
      type,
      kind,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      metaKey: false,
      ...cell.actions,
      target: target ?? { id: "" },
      currentTarget: (current === rawTarget ? target : owner.resolveEventTarget(current)) ?? { id: "" },
    };
    scalars(p, raw, base, snapshot);
    if (kind === "pointer") scalars(p, raw, fields.mouse, snapshot);
    scalars(p, raw, fields[kind], snapshot);
    if (!target && kind === "keyboard") Object.assign(snapshot, { key: "", code: "" });
    if (!target && kind === "input") Object.assign(snapshot, { data: null, inputType: "" });
    if (kind === "mouse" || kind === "pointer" || kind === "focus") {
      const target = p.event(kind === "focus" ? "FocusEvent" : "MouseEvent", "relatedTarget", raw);
      snapshot.relatedTarget = target ? (owner.resolveEventTarget(target) ?? { id: "" }) : null;
    }
    if (kind === "touch")
      for (const key of ["touches", "targetTouches", "changedTouches"])
        snapshot[key] = snapshotTouchList(owner, p.event("TouchEvent", key, raw));
    handler(owner.complete(snapshot) as unknown as SafeEvent);
  } finally {
    cell.close();
  }
}
function readActions(options?: DeclarativeListenerOptions): (keyof DeclarativeListenerOptions)[] {
  if (options === undefined) return [];
  try {
    if (!options || typeof options !== "object") throw 0;
    const actions: (keyof DeclarativeListenerOptions)[] = [];
    for (const k of Reflect.ownKeys(options)) {
      if (k !== "preventDefault" && k !== "stopPropagation" && k !== "stopImmediatePropagation") throw 0;
      const d = Object.getOwnPropertyDescriptor(options, k);
      if (d && "value" in d && d.value === undefined) continue;
      if (typeof d?.value !== "boolean") throw 0;
      if (d.value) actions.push(k);
    }
    return actions;
  } catch {
    throw error("INVALID_ARGUMENT", "listener options");
  }
}
export function eventMethods(owner: Owner, e: NodeEntry) {
  function listen(type: string, handler: EventHandler, options?: DeclarativeListenerOptions) {
    owner.authorized(e);
    const event = catalog.get(type);
    if (!event) throw error("UNSUPPORTED_EVENT", "addEventListener");
    if (typeof handler !== "function") throw error("INVALID_ARGUMENT", "handler");
    const actions = readActions(options);
    // A Proxy trap in the options record can reenter the mount.
    if (options !== undefined) owner.authorized(e);
    let active = false;
    const listener = (raw: Event) => {
      if (!active || !owner.canDispatch(e)) return;
      for (const action of actions) owner.platform.call("Event", action, raw);
      dispatch(owner, raw, type, event.kind, handler);
    };
    const native = (op: string) => owner.platform.call("EventTarget", op, e.real!, type, listener);
    native("addEventListener");
    const cleanup = owner.track(e, () => {
      native("removeEventListener");
    });
    active = true;
    return cleanup;
  }
  return {
    addEventListener: listen,
    ...Object.fromEntries(
      Object.entries(PUBLIC_EVENT_CATALOG).map(([method, { type }]) => [
        method,
        (handler: EventHandler, options?: DeclarativeListenerOptions) => listen(type, handler, options),
      ]),
    ),
  };
}
