import type { Owner } from "./owner.ts";
import { controlInterfaces, type TargetKind } from "./platform.ts";
import type { URLSink } from "./policies.ts";
import { hasOwn, error } from "./errors.ts";
import {
  isAttrKeySafe,
  isInputTypeAllowed,
  isButtonTypeAllowed,
  isValidMimeType,
  requireString,
  requireBoolean,
  requireFiniteNumber,
  requireIntegerInRange,
} from "./validators.ts";
import { lifecycle, textMethods, treeOperations } from "./text.ts";
import { eventMethods } from "./event.ts";
import { style } from "./style.ts";
import type { SafeElement } from "./types.ts";

const voidTags = new Set("input img br hr wbr col source track".split(" "));
const formTags = new Set(
  "input textarea select option optgroup button fieldset legend label output".split(" "),
);
const interfaces = {
  ...controlInterfaces,
  video: "HTMLMediaElement",
  audio: "HTMLMediaElement",
  canvas: "HTMLCanvasElement",
  details: "HTMLDetailsElement",
  dialog: "HTMLDialogElement",
  progress: "HTMLProgressElement",
  meter: "HTMLMeterElement",
} as const;
type Validate = (value: unknown) => string | boolean | number;
const nonnegative = (v: unknown) => requireIntegerInRange(v, 0, 2147483647);
const positive = (v: unknown) => requireIntegerInRange(v, 1, 2147483647);
const suffix = (s: string) => s[0]!.toUpperCase() + s.slice(1);

export function createElement(owner: Owner, tag: string): SafeElement {
  if (!owner.allowFormControls && formTags.has(tag)) throw error("POLICY_DENIED", "create " + tag);
  const p = owner.platform;
  const real = p.create(tag);
  const wrapper: Record<string, unknown> = {};
  const e = owner.register(real, wrapper, hasOwn(controlInterfaces, tag) ? (tag as TargetKind) : null);
  const check = () => owner.authorized(e);
  const set = (node: Node, key: string, value: string) => p.call("Element", "setAttribute", node, key, value);
  const get = (node: Node, key: string): string | null => p.call("Element", "getAttribute", node, key);
  const del = (node: Node, key: string) => p.call("Element", "removeAttribute", node, key);
  const iface = interfaces[tag as keyof typeof interfaces];
  const prop = (node: Node, key: string, ...args: unknown[]) => p.call(iface, key, node, ...args);
  function attributes(names: string, validate: Validate = requireString) {
    for (const key of names.split(" "))
      wrapper["set" + suffix(key)] = (v: unknown) => {
        const node = check();
        const value = validate(v);
        if (typeof value === "boolean") {
          if (value) set(node, key, "");
          else del(node, key);
        } else set(node, key.toLowerCase(), String(value));
      };
  }
  function properties(names: string, validate: Validate) {
    for (const key of names.split(" "))
      wrapper["set" + suffix(key === "readOnly" ? "readonly" : key)] = (v: unknown) => {
        prop(check(), key + "=", validate(v));
      };
  }
  function url(sink: URLSink) {
    const key = sink.split(".")[1]!;
    wrapper["set" + suffix(key)] = (v: unknown) => {
      const node = check();
      const result = owner.urls.decide(sink, requireString(v));
      if (!result.allowed) throw result.error;
      set(node, key, result.url);
    };
  }
  function prefixedKey(prefix: string, key: string) {
    if (!isAttrKeySafe(key)) throw error("INVALID_ARGUMENT", prefix);
    return prefix + "-" + key;
  }
  attributes("class id title role lang dir");
  attributes("hidden", requireBoolean);
  attributes("tabIndex", (v) => requireIntegerInRange(v, -2147483648, 2147483647));
  Object.assign(wrapper, lifecycle(owner, e), eventMethods(owner, e), {
    style: style(owner, e),
    getClass() {
      return get(check(), "class") ?? "";
    },
    getId() {
      return get(check(), "id") ?? "";
    },
    setSpellcheck(v: boolean) {
      set(check(), "spellcheck", String(requireBoolean(v)));
    },
    focus() {
      const node = check();
      p.call("HTMLElement", "focus", node);
    },
    blur() {
      const node = check();
      p.call("HTMLElement", "blur", node);
    },
  });
  for (const prefix of ["aria", "data"]) {
    wrapper["set" + suffix(prefix)] = (key: string, v: unknown) => {
      set(check(), prefixedKey(prefix, key), requireString(v));
    };
    wrapper["get" + suffix(prefix)] = (key: string) => {
      return get(check(), prefixedKey(prefix, key)) ?? undefined;
    };
  }
  if (!voidTags.has(tag)) Object.assign(wrapper, textMethods(owner, e), treeOperations(owner, check));
  if (e.targetKind) {
    const kind = e.targetKind;
    function valueNode() {
      const node = check();
      if (!owner.canReadValue(kind, node)) throw error("EXTERNAL_NODE", "value");
      return node;
    }
    wrapper.getValue = () => prop(valueNode(), "value");
    wrapper.setValue = (v: unknown) => {
      const node = valueNode();
      requireString(v);
      const owned = kind === "output" ? owner.ownedChildren(node) : null;
      try {
        prop(node, "value=", v);
      } finally {
        if (owned) {
          const text = p.node("firstChild", node);
          if (text && p.node("nodeType", text) === 3 && !owner.byReal.has(text)) owner.internalText.add(text);
          for (const child of owned) {
            if (!p.node("parentNode", child)) owner.revokeSubtree(child);
          }
        }
      }
    };
    if (tag !== "option") attributes("name");
  }
  if (tag === "input" || tag === "textarea" || tag === "select") {
    set(real, "autocomplete", "off");
    properties("disabled required", requireBoolean);
    wrapper.setAutocomplete = (v: unknown) => {
      const node = check();
      if (v !== "off") throw error("INVALID_ARGUMENT", "autocomplete");
      set(node, "autocomplete", "off");
    };
    if (tag !== "textarea") properties("multiple", requireBoolean);
  }
  if (tag === "input" || tag === "textarea") {
    attributes("placeholder");
    attributes("minLength maxLength", nonnegative);
    properties("readOnly", requireBoolean);
  }
  switch (tag) {
    case "input":
      attributes("min max step pattern inputMode enterKeyHint");
      properties("checked", requireBoolean);
      wrapper.getChecked = () => {
        return prop(check(), "checked");
      };
      wrapper.setAutofocus = (v: unknown) => {
        const node = check();
        if (v !== false) throw error("INVALID_ARGUMENT", "autofocus");
        del(node, "autofocus");
      };
      wrapper.setType = (v: unknown) => {
        const node = check();
        if (!isInputTypeAllowed(v)) throw error("INVALID_ARGUMENT", "input.type");
        const old = [get(node, "type"), get(node, "autocomplete")];
        try {
          prop(node, "type=", v);
          set(node, "autocomplete", "off");
        } catch (err) {
          ["type", "autocomplete"].forEach((key, i) =>
            old[i] == null ? del(node, key) : set(node, key, old[i]!),
          );
          throw err;
        }
      };
      break;
    case "textarea":
      attributes("rows cols", positive);
      attributes("wrap");
      break;
    case "option":
      properties("selected disabled", requireBoolean);
      attributes("label");
      break;
    case "optgroup":
      attributes("disabled", requireBoolean);
      attributes("label");
      break;
    case "button":
      prop(real, "type=", "button");
      properties("disabled", requireBoolean);
      wrapper.setType = (v: unknown) => {
        const node = check();
        if (!isButtonTypeAllowed(v)) throw error("INVALID_ARGUMENT", "button.type");
        prop(node, "type=", v);
      };
      break;
    case "output":
    case "label":
      attributes("for");
      break;
    case "fieldset":
      attributes("disabled", requireBoolean);
      break;
    case "a":
      url("anchor.href");
      break;
    case "img":
      url("image.src");
      attributes("alt loading");
      attributes("width height", nonnegative);
      break;
    case "audio":
    case "video":
      url(tag === "audio" ? "audio.src" : "video.src");
      if (tag === "video") {
        url("video.poster");
        attributes("width height", nonnegative);
      }
      attributes("controls autoplay loop", requireBoolean);
      properties("muted", requireBoolean);
      break;
    case "source":
      url("source.src");
      attributes("type", (v) => {
        if (!isValidMimeType(v)) throw error("INVALID_ARGUMENT", "source.type");
        return requireString(v);
      });
      break;
    case "track":
      url("track.src");
      attributes("kind srclang label");
      attributes("default", requireBoolean);
      break;
    case "th":
    case "td":
      attributes("colspan rowspan", nonnegative);
      attributes("scope headers");
      break;
    case "canvas":
      properties("width height", nonnegative);
      break;
    case "details":
    case "dialog":
      properties("open", requireBoolean);
      break;
    case "meter":
    case "progress":
      properties(tag === "meter" ? "value min max low high optimum" : "value max", requireFiniteNumber);
      break;
    case "dl":
    case "ul":
    case "ol":
      for (const [method, child] of tag === "dl"
        ? [
            ["createTerm", "dt"],
            ["createDescription", "dd"],
          ]
        : [["createItem", "li"]])
        wrapper[method!] = () => {
          check();
          return createElement(owner, child!);
        };
      break;
  }
  return owner.completeNode(e, wrapper) as unknown as SafeElement;
}
