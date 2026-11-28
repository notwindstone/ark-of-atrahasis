import { error, hasOwn } from "./errors.ts";

export function requireString(v: unknown, op = "string"): string {
  if (typeof v !== "string") throw error("INVALID_ARGUMENT", op);
  return v;
}
export function requireBoolean(v: unknown, op = "boolean"): boolean {
  if (typeof v !== "boolean") throw error("INVALID_ARGUMENT", op);
  return v;
}
export function requireFiniteNumber(v: unknown, op = "number"): number {
  if (typeof v !== "number" || !Number.isFinite(v)) throw error("INVALID_ARGUMENT", op);
  return v;
}
export function requireIntegerInRange(v: unknown, min: number, max: number, op = "integer"): number {
  const n = requireFiniteNumber(v, op);
  if (!Number.isInteger(n) || !Number.isInteger(min) || !Number.isInteger(max) || n < min || n > max)
    throw error("INVALID_ARGUMENT", op);
  return n;
}
const words = (s: string) => Object.freeze(s.split(/\s+/));
export const ALLOWED_INPUT_TYPES = Object.freeze([
  "text",
  "number",
  "email",
  "tel",
  "url",
  "search",
  "date",
  "time",
  "datetime-local",
  "month",
  "week",
  "range",
  "color",
  "checkbox",
  "radio",
] as const);
export const ALLOWED_BUTTON_TYPES = Object.freeze(["button"] as const);
export const FORMATTING_TAGS = Object.freeze([
  "strong",
  "em",
  "small",
  "b",
  "i",
  "u",
  "code",
  "kbd",
  "samp",
  "var",
  "sub",
  "sup",
  "mark",
  "abbr",
  "cite",
] as const);
export const LIST_TYPES = Object.freeze(["ordered", "unordered", "description"] as const);
const inputTypes = new Set<string>(ALLOWED_INPUT_TYPES);
export const isInputTypeAllowed = (v: unknown): v is (typeof ALLOWED_INPUT_TYPES)[number] =>
  typeof v === "string" && inputTypes.has(v);
export const isButtonTypeAllowed = (v: unknown) => v === "button";
export const isAttrKeySafe = (v: unknown) => typeof v === "string" && /^[a-z][a-z0-9-]*$/.test(v);
export function isUrlSafe(v: unknown) {
  if (typeof v !== "string") return false;
  try {
    return ["https:", "http:"].includes(new URL(v).protocol);
  } catch {
    return false;
  }
}
const mimeToken = "[a-zA-Z0-9!#$%&'*+.^_`|~-]+";
const quotedParameter = String.raw`"(?:[\t \x21\x23-\x5b\x5d-\x7e\x80-\xff]|\\[\t \x20-\x7e\x80-\xff])*"`;
const mimePattern = new RegExp(
  "^" +
    mimeToken +
    "/" +
    mimeToken +
    "(?:[ \\t]*;[ \\t]*" +
    mimeToken +
    "=(?:" +
    mimeToken +
    "|" +
    quotedParameter +
    "))*$",
);
export function isValidMimeType(value: unknown) {
  return typeof value === "string" && !/[\x00-\x08\x0a-\x1f\x7f]/.test(value) && mimePattern.test(value);
}
export const FACTORY_TAGS = Object.freeze({
  createBdi: "bdi",
  createDiv: "div",
  createSpan: "span",
  createSection: "section",
  createArticle: "article",
  createNav: "nav",
  createHeader: "header",
  createFooter: "footer",
  createMain: "main",
  createAside: "aside",
  createFigure: "figure",
  createFigcaption: "figcaption",
  createParagraph: "p",
  createBlockquote: "blockquote",
  createPre: "pre",
  createListItem: "li",
  createTerm: "dt",
  createDescription: "dd",
  createTable: "table",
  createThead: "thead",
  createTbody: "tbody",
  createTfoot: "tfoot",
  createTr: "tr",
  createTh: "th",
  createTd: "td",
  createCaption: "caption",
  createColgroup: "colgroup",
  createCol: "col",
  createButton: "button",
  createInput: "input",
  createSelect: "select",
  createOption: "option",
  createOptgroup: "optgroup",
  createTextarea: "textarea",
  createLabel: "label",
  createFieldset: "fieldset",
  createLegend: "legend",
  createImage: "img",
  createVideo: "video",
  createAudio: "audio",
  createSource: "source",
  createTrack: "track",
  createPicture: "picture",
  createCanvas: "canvas",
  createAnchor: "a",
  createDetails: "details",
  createSummary: "summary",
  createDialog: "dialog",
  createHr: "hr",
  createBr: "br",
  createWbr: "wbr",
  createProgress: "progress",
  createMeter: "meter",
  createOutput: "output",
  createTime: "time",
  createData: "data",
  createRuby: "ruby",
  createRt: "rt",
  createRp: "rp",
} as const);
export function validateFactory(name: string, value?: unknown) {
  switch (name) {
    case "createTextNode":
      if (value !== undefined) requireString(value, name);
      return;
    case "createHeading":
      requireIntegerInRange(value, 1, 6, name);
      return;
    case "createFormatting":
      if (!(FORMATTING_TAGS as readonly string[]).includes(requireString(value, name))) throw error("INVALID_ARGUMENT", name);
      return;
    case "createList":
      if (!(LIST_TYPES as readonly string[]).includes(requireString(value, name))) throw error("INVALID_ARGUMENT", name);
      return;
    case "createStyle":
      return;
    default:
      if (typeof name !== "string" || !hasOwn(FACTORY_TAGS, name)) throw error("INVALID_ARGUMENT", "factory");
  }
}
const networkSyntax = /@import(?![a-z0-9_\x80-\uffff-])|(?:^|<!--|[^a-z0-9_\x80-\uffff-])(?:url|(?:-webkit-)?image-set|image|src)[ \t\n\r\f]*\(/i;
const deferredSyntax = /(?:^|<!--|[^a-z0-9_\x80-\uffff-])(?:var|env|attr)[ \t\n\r\f]*\(/i;
function unsafeCSS(value: unknown, blockDeferred: boolean): boolean {
  const unsafe = (stream: string) => networkSyntax.test(stream) || (blockDeferred && deferredSyntax.test(stream));
  if (typeof value !== "string") return true;
  if (!/["'\\]|\/\*/.test(value)) return unsafe(value);
  const escape = /\\(?:(\r\n|[\n\r\f])|([\da-f]{1,6})(?:\r\n|[ \t\n\r\f])?|([\s\S])|$)/iy;
  // Check token boundaries at comments/continuations and the conservative joined spelling.
  const segments: string[] = [];
  let stream = "",
    quote = "";
  for (let i = 0; i < value.length; i++) {
    const c = value[i]!;
    if (c === "\\") {
      escape.lastIndex = i;
      const [, continuation, hex, literal] = escape.exec(value)!;
      i = escape.lastIndex - 1;
      if (quote) continue;
      if (continuation) {
        segments.push(stream);
        stream = "";
        continue;
      }
      let decoded = literal ?? "\ufffd";
      if (hex) {
        const code = parseInt(hex, 16);
        decoded = String.fromCodePoint(!code || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff) ? 0xfffd : code);
      }
      // Escaped punctuation belongs to the identifier, even when it spells a delimiter.
      stream += /[a-z0-9_\x80-\uffff-]/i.test(decoded) ? decoded : "_";
    } else if (quote) {
      if (c === quote || c === "\n" || c === "\r" || c === "\f") quote = "";
    } else if (c === "'" || c === '"') {
      quote = c;
      stream += '""';
    } else if (c === "/" && value[i + 1] === "*") {
      const end = value.indexOf("*/", i + 2);
      if (end === -1) return true;
      segments.push(stream);
      stream = "";
      i = end + 1;
    } else stream += c;
  }
  if (!segments.length) return unsafe(stream);
  segments.push(stream);
  return unsafe(segments.join(" ")) || unsafe(segments.join(""));
}
export function scanCSSNetworkRisk(value: unknown): boolean {
  return unsafeCSS(value, false);
}
export const hasCssUrl = scanCSSNetworkRisk;
export const SAFE_STYLE_PROPERTIES =
  words(`accent-color align-items align-self animation-delay animation-direction animation-duration
animation-fill-mode animation-iteration-count animation-name animation-timing-function appearance
aspect-ratio background-color block-size border-bottom-color border-bottom-left-radius
border-bottom-right-radius border-bottom-style border-bottom-width border-block-end-color
border-block-end-style border-block-end-width border-block-start-color border-block-start-style
border-block-start-width border-color border-end-end-radius border-end-start-radius
border-inline-end-color border-inline-end-style border-inline-end-width border-inline-start-color
border-inline-start-style border-inline-start-width border-left-color border-left-style border-left-width
border-radius border-right-color border-right-style border-right-width border-style
border-start-end-radius border-start-start-radius border-top-color border-top-left-radius
border-top-right-radius border-top-style border-top-width border-width bottom box-shadow caret-color
clip-path column-count column-gap color contain container-type cursor display flex-basis flex-direction
flex-grow flex-shrink flex-wrap font-family font-size font-style font-variant font-weight gap grid-column
grid-row grid-template-columns grid-template-rows height hyphens inline-size inset-block-end
inset-block-start inset-inline-end inset-inline-start isolation justify-content justify-self left
letter-spacing line-height margin-bottom margin-block-end margin-block-start margin-inline-end
margin-inline-start margin-left margin-right margin-top max-height max-block-size max-inline-size
max-width min-height min-block-size min-inline-size min-width mix-blend-mode object-fit object-position
opacity order outline-color outline-offset outline-style outline-width overflow overflow-wrap overflow-x
overflow-y padding-bottom padding-block-end padding-block-start padding-inline-end padding-inline-start
padding-left padding-right padding-top pointer-events position resize right row-gap scroll-behavior
scroll-margin-bottom scroll-margin-top scroll-padding-bottom scroll-padding-top text-align text-decoration
text-indent text-overflow text-transform top touch-action transform transition user-select vertical-align
visibility white-space width will-change word-break word-spacing z-index`);
const propertySet = new Set(SAFE_STYLE_PROPERTIES);
export function canonicalizeStyleProperty(v: unknown): string | undefined {
  if (typeof v !== "string" || !/^[a-z][a-zA-Z0-9-]*$/.test(v)) return undefined;
  const name = v.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());
  return propertySet.has(name) ? name : undefined;
}
export function validStyle(prop: unknown, value: unknown): boolean {
  const name = canonicalizeStyleProperty(prop);
  return !!name && typeof value === "string" && !!value.trim() &&
    !unsafeCSS(value, name === "cursor" || name === "clip-path");
}
function eventMetadata<T extends string, K extends string>(type: T, kind: K) {
  return Object.freeze({ type, kind });
}
export const PUBLIC_EVENT_CATALOG = Object.freeze({
  onClick: eventMetadata("click", "mouse"),
  onDblClick: eventMetadata("dblclick", "mouse"),
  onMouseDown: eventMetadata("mousedown", "mouse"),
  onMouseUp: eventMetadata("mouseup", "mouse"),
  onMouseEnter: eventMetadata("mouseenter", "mouse"),
  onMouseLeave: eventMetadata("mouseleave", "mouse"),
  onMouseMove: eventMetadata("mousemove", "mouse"),
  onPointerDown: eventMetadata("pointerdown", "pointer"),
  onPointerUp: eventMetadata("pointerup", "pointer"),
  onPointerMove: eventMetadata("pointermove", "pointer"),
  onContextMenu: eventMetadata("contextmenu", "mouse"),
  onKeyDown: eventMetadata("keydown", "keyboard"),
  onKeyUp: eventMetadata("keyup", "keyboard"),
  onFocus: eventMetadata("focus", "focus"),
  onBlur: eventMetadata("blur", "focus"),
  onTouchStart: eventMetadata("touchstart", "touch"),
  onTouchEnd: eventMetadata("touchend", "touch"),
  onTouchMove: eventMetadata("touchmove", "touch"),
  onScroll: eventMetadata("scroll", "generic"),
  onChange: eventMetadata("change", "input"),
  onInput: eventMetadata("input", "input"),
});
