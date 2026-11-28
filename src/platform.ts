import { error } from "./errors.ts";

export const controlInterfaces = Object.freeze({
  input: "HTMLInputElement",
  textarea: "HTMLTextAreaElement",
  select: "HTMLSelectElement",
  option: "HTMLOptionElement",
  button: "HTMLButtonElement",
  output: "HTMLOutputElement",
} as const);
export type TargetKind = keyof typeof controlInterfaces;

const modifiers = "ctrlKey altKey shiftKey metaKey";
export const mouseNumbers =
  "screenX screenY clientX clientY pageX pageY offsetX offsetY movementX movementY button buttons";
export const pointerNumbers = "pointerId width height pressure tangentialPressure tiltX tiltY twist";
export const touchNumbers =
  "identifier screenX screenY clientX clientY pageX pageY radiusX radiusY rotationAngle force";
const members = {
  Node: "nodeType ownerDocument parentNode textContent firstChild nextSibling isConnected appendChild insertBefore removeChild replaceChild",
  Document: "createElement createTextNode head documentElement getElementById",
  CharacterData: "textContent",
  Element: "tagName textContent id getAttribute setAttribute removeAttribute hasAttribute querySelector",
  DocumentFragment: "querySelector",
  ShadowRoot: "host",
  HTMLElement: "style focus blur",
  CSSStyleDeclaration: "getPropertyValue getPropertyPriority setProperty removeProperty",
  EventTarget: "addEventListener removeEventListener",
  HTMLInputElement: "type value checked disabled readOnly required multiple",
  HTMLTextAreaElement: "value disabled readOnly required",
  HTMLSelectElement: "value disabled multiple required",
  HTMLOptionElement: "value selected disabled",
  HTMLButtonElement: "type value disabled",
  HTMLOutputElement: "value",
  HTMLCanvasElement: "width height",
  HTMLMediaElement: "muted",
  HTMLDetailsElement: "open",
  HTMLDialogElement: "open",
  HTMLProgressElement: "value max",
  HTMLMeterElement: "value min max low high optimum",
  Event:
    "type target currentTarget bubbles cancelable composed defaultPrevented eventPhase timeStamp preventDefault stopPropagation stopImmediatePropagation",
  FocusEvent: "relatedTarget",
  KeyboardEvent: modifiers + " key code location repeat isComposing",
  MouseEvent: modifiers + " " + mouseNumbers + " relatedTarget",
  PointerEvent: pointerNumbers + " pointerType isPrimary",
  TouchEvent: modifiers + " touches changedTouches targetTouches",
  InputEvent: "data inputType isComposing",
  Touch: touchNumbers + " target",
  TouchList: "length item",
};
type Interface = keyof typeof members;
type Operation = (receiver: object, ...args: unknown[]) => any;

export function capturePlatform(doc: Document) {
  const view = doc?.defaultView;
  if (!view || view.document !== doc) throw error("INVALID_ROOT", "createSafeDomain");
  const calls = new Map<string, Operation>();
  for (const [name, fields] of Object.entries(members)) {
    const proto = Reflect.get(view, name)?.prototype;
    for (const field of fields.split(" ")) {
      let descriptor;
      for (let obj = proto; obj && !descriptor; obj = Object.getPrototypeOf(obj))
        descriptor = Object.getOwnPropertyDescriptor(obj, field);
      if (!descriptor) continue;
      for (const [suffix, fn] of [
        ["", descriptor.get ?? descriptor.value],
        ["=", descriptor.set],
      ] as const) {
        if (typeof fn !== "function") continue;
        const key = name + "." + field + suffix;
        calls.set(key, (receiver, ...args) => Reflect.apply(fn, receiver, args));
      }
    }
  }
  function call(iface: Interface, member: string, receiver: object, ...args: unknown[]) {
    const op = calls.get(iface + "." + member);
    if (!op) throw error("DOM_OPERATION_FAILED", iface + "." + member);
    try {
      return op(receiver, ...args);
    } catch {
      throw error("DOM_OPERATION_FAILED", iface + "." + member);
    }
  }
  function read(iface: Interface, field: string, receiver: object, own = false) {
    const op = calls.get(iface + "." + field);
    try {
      return op ? op(receiver) : own ? Object.getOwnPropertyDescriptor(receiver, field)?.value : undefined;
    } catch {
      return undefined;
    }
  }
  const isElement = (node: object) => typeof read("Element", "tagName", node) === "string";
  return {
    call,
    URL: view.URL,
    read,
    isElement,
    isShadowRoot: (node: object) => !!read("ShadowRoot", "host", node),
    node: (field: string, node: Node, ...args: unknown[]) => {
      const iface = field.startsWith("textContent")
        ? isElement(node)
          ? "Element"
          : "CharacterData"
        : "Node";
      return call(iface, field, node, ...args);
    },
    create: (tag: string): HTMLElement => call("Document", "createElement", doc, tag),
    event: (iface: Interface, field: string, receiver: object) => read(iface, field, receiver, true),
  };
}
export type Platform = ReturnType<typeof capturePlatform>;

export function* descendants(
  p: Platform,
  root: Node,
  descend: (node: Node) => boolean = () => true,
): Generator<Node> {
  const siblings: Node[] = [];
  let node = p.node("firstChild", root);
  while (node) {
    yield node;
    const next = p.node("nextSibling", node);
    const first = descend(node) && p.node("firstChild", node);
    if (first && next) siblings.push(next);
    node = first || next || siblings.pop();
  }
}
