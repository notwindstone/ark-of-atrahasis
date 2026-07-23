import { BUTTON_TYPES, INPUT_TYPES } from "./vocabularies.ts";

export type CSSNetworkRisk =
  | "invalid-input"
  | "malformed-comment"
  | "malformed-escape"
  | "import"
  | "url"
  | "image-set"
  | "image"
  | "src"
  | "indirect-value";

export type CSSNetworkRiskDecision =
  | Readonly<{ risky: false }>
  | Readonly<{ risky: true; risk: CSSNetworkRisk }>;

const NO_CSS_NETWORK_RISK: CSSNetworkRiskDecision = Object.freeze({ risky: false });

function cssRisk(risk: CSSNetworkRisk): CSSNetworkRiskDecision {
  return Object.freeze({ risky: true, risk });
}

function isHexDigit(character: string): boolean {
  const code = character.charCodeAt(0);
  return (
    (code >= 0x30 && code <= 0x39) ||
    (code >= 0x41 && code <= 0x46) ||
    (code >= 0x61 && code <= 0x66)
  );
}

function isCSSWhitespace(character: string): boolean {
  return character === " " || character === "\t" || character === "\n" || character === "\r" || character === "\f";
}

interface CanonicalCSS {
  readonly value: string;
  readonly malformed?: "comment" | "escape";
}

/**
 * Canonicalize the constructs that can disguise security-sensitive CSS tokens.
 * This scanner is intentionally conservative: it may reject harmless strings,
 * but comments, escapes and continuations cannot hide a network-bearing token.
 */
function canonicalizeCSSForSecurityScan(input: string): CanonicalCSS {
  let canonical = "";

  for (let index = 0; index < input.length;) {
    const character = input.charAt(index);

    if (character === "/" && input[index + 1] === "*") {
      const commentEnd = input.indexOf("*/", index + 2);
      if (commentEnd === -1) return { value: canonical, malformed: "comment" };
      index = commentEnd + 2;
      continue;
    }

    if (character !== "\\") {
      canonical += character.toLowerCase();
      index += 1;
      continue;
    }

    index += 1;
    if (index >= input.length) return { value: canonical, malformed: "escape" };

    // A backslash-newline (including CRLF and form feed) is a CSS line
    // continuation. Removing it can join an identifier such as u\<LF>rl.
    if (input[index] === "\r") {
      index += input[index + 1] === "\n" ? 2 : 1;
      continue;
    }
    if (input[index] === "\n" || input[index] === "\f") {
      index += 1;
      continue;
    }

    if (!isHexDigit(input.charAt(index))) {
      canonical += input.charAt(index).toLowerCase();
      index += 1;
      continue;
    }

    let hex = "";
    while (index < input.length && hex.length < 6 && isHexDigit(input.charAt(index))) {
      hex += input.charAt(index);
      index += 1;
    }

    // CSS consumes one optional whitespace character after a hex escape (CRLF
    // is one newline for this purpose).
    if (index < input.length && isCSSWhitespace(input.charAt(index))) {
      if (input[index] === "\r" && input[index + 1] === "\n") index += 2;
      else index += 1;
    }

    const codePoint = Number.parseInt(hex, 16);
    const decoded = codePoint === 0 || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)
      ? "\ufffd"
      : String.fromCodePoint(codePoint);
    canonical += decoded.toLowerCase();
  }

  return { value: canonical };
}

const CSS_IMPORT = /@\s*import(?:\s|["'(;]|$)/;
const CSS_URL_FUNCTION = /(^|[^a-z0-9_-])url\s*\(/;
const CSS_IMAGE_SET_FUNCTION = /(^|[^a-z0-9_-])(?:-webkit-)?image-set\s*\(/;
const CSS_IMAGE_FUNCTION = /(^|[^a-z0-9_-])image\s*\(/;
const CSS_SRC_FUNCTION = /(^|[^a-z0-9_-])src\s*\(/;
// var()/env()/attr() can resolve to a request-bearing token that does not
// appear in the guest-provided value. The strict style facade rejects these
// indirections rather than attempting to reason about host/custom state.
const CSS_INDIRECT_VALUE_FUNCTION = /(^|[^a-z0-9_-])(?:var|env|attr)\s*\(/;

/**
 * Detect CSS constructs that can initiate a request. Unlike a raw regex, this
 * accounts for CSS comments, identifier escapes, hex-escape whitespace and
 * escaped newlines. Non-string and malformed input is rejected conservatively.
 */
export function scanCSSNetworkRisk(value: unknown): CSSNetworkRiskDecision {
  if (typeof value !== "string") return cssRisk("invalid-input");

  const canonical = canonicalizeCSSForSecurityScan(value);
  if (canonical.malformed === "comment") return cssRisk("malformed-comment");
  if (canonical.malformed === "escape") return cssRisk("malformed-escape");
  if (CSS_IMPORT.test(canonical.value)) return cssRisk("import");
  if (CSS_URL_FUNCTION.test(canonical.value)) return cssRisk("url");
  if (CSS_IMAGE_SET_FUNCTION.test(canonical.value)) return cssRisk("image-set");
  if (CSS_IMAGE_FUNCTION.test(canonical.value)) return cssRisk("image");
  if (CSS_SRC_FUNCTION.test(canonical.value)) return cssRisk("src");
  if (CSS_INDIRECT_VALUE_FUNCTION.test(canonical.value)) return cssRisk("indirect-value");
  return NO_CSS_NETWORK_RISK;
}

/** Backwards-compatible boolean facade used by the current style wrappers. */
export function hasCssUrl(value: unknown): boolean {
  return scanCSSNetworkRisk(value).risky;
}

const ALLOWED_INPUT_TYPES: ReadonlySet<string> = new Set(INPUT_TYPES);

export function isInputTypeAllowed(type: unknown): type is string {
  return typeof type === "string" && ALLOWED_INPUT_TYPES.has(type);
}

const ALLOWED_BUTTON_TYPES: ReadonlySet<string> = new Set(BUTTON_TYPES);

export function isButtonTypeAllowed(type: unknown): type is string {
  return typeof type === "string" && ALLOWED_BUTTON_TYPES.has(type);
}

const SAFE_ATTR_KEY = /^[a-z][a-z0-9-]*$/;

export function isAttrKeySafe(key: unknown): key is string {
  return typeof key === "string" && SAFE_ATTR_KEY.test(key);
}
