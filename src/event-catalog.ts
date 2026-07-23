import type { SafeEventKind } from "./types.ts";

type EventFence = "root-bubble" | "target";

function eventMetadata<
  Type extends string,
  Kind extends SafeEventKind,
  Fence extends EventFence,
>(type: Type, kind: Kind, fence: Fence) {
  return Object.freeze({ fence, kind, type });
}

/** One authoritative contract for every public event-registration method. */
export const PUBLIC_EVENT_CATALOG = Object.freeze({
  onClick: eventMetadata("click", "mouse", "root-bubble"),
  onDblClick: eventMetadata("dblclick", "mouse", "root-bubble"),
  onMouseDown: eventMetadata("mousedown", "mouse", "root-bubble"),
  onMouseUp: eventMetadata("mouseup", "mouse", "root-bubble"),
  onMouseEnter: eventMetadata("mouseenter", "mouse", "root-bubble"),
  onMouseLeave: eventMetadata("mouseleave", "mouse", "root-bubble"),
  onMouseMove: eventMetadata("mousemove", "mouse", "root-bubble"),
  onPointerDown: eventMetadata("pointerdown", "pointer", "root-bubble"),
  onPointerUp: eventMetadata("pointerup", "pointer", "root-bubble"),
  onPointerMove: eventMetadata("pointermove", "pointer", "root-bubble"),
  onContextMenu: eventMetadata("contextmenu", "mouse", "root-bubble"),
  onKeyDown: eventMetadata("keydown", "keyboard", "root-bubble"),
  onKeyUp: eventMetadata("keyup", "keyboard", "root-bubble"),
  onFocus: eventMetadata("focus", "focus", "target"),
  onBlur: eventMetadata("blur", "focus", "target"),
  onTouchStart: eventMetadata("touchstart", "touch", "root-bubble"),
  onTouchEnd: eventMetadata("touchend", "touch", "root-bubble"),
  onTouchMove: eventMetadata("touchmove", "touch", "root-bubble"),
  onScroll: eventMetadata("scroll", "generic", "root-bubble"),
  onChange: eventMetadata("change", "input", "root-bubble"),
  onInput: eventMetadata("input", "input", "root-bubble"),
});

/** Native events fenced for host integration although no public handler advertises them. */
export const ROOT_BUBBLE_FENCE_ONLY_EVENT_TYPES = Object.freeze([
  "beforeinput",
  "focusin",
  "focusout",
  "reset",
  "submit",
] as const);

/** No target-only native event is fenced beyond the advertised focus methods. */
export const TARGET_FENCE_ONLY_EVENT_TYPES = Object.freeze([] as const);

const publicMetadata = Object.values(PUBLIC_EVENT_CATALOG);

export const ROOT_BUBBLE_FENCE_EVENT_TYPES = Object.freeze([
  ...publicMetadata
    .filter((metadata) => metadata.fence === "root-bubble")
    .map((metadata) => metadata.type),
  ...ROOT_BUBBLE_FENCE_ONLY_EVENT_TYPES,
]);

export const TARGET_FENCE_EVENT_TYPES = Object.freeze([
  ...publicMetadata
    .filter((metadata) => metadata.fence === "target")
    .map((metadata) => metadata.type),
  ...TARGET_FENCE_ONLY_EVENT_TYPES,
]);
