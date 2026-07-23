import { invalidPolicy } from "./errors.ts";

/**
 * CSS properties whose value grammars can be handled through the CSSOM without
 * granting raw declaration/rule access. Host policy still has to opt in to
 * every property; this list is only the outer, library-defined ceiling.
 */
export const SAFE_STYLE_PROPERTIES = Object.freeze([
  "accent-color",
  "align-items",
  "align-self",
  "animation-delay",
  "animation-direction",
  "animation-fill-mode",
  "animation-iteration-count",
  "animation-timing-function",
  "appearance",
  "aspect-ratio",
  "background-color",
  "block-size",
  "border-bottom-color",
  "border-bottom-left-radius",
  "border-bottom-right-radius",
  "border-bottom-style",
  "border-bottom-width",
  "border-block-end-color",
  "border-block-end-style",
  "border-block-end-width",
  "border-block-start-color",
  "border-block-start-style",
  "border-block-start-width",
  "border-color",
  "border-end-end-radius",
  "border-end-start-radius",
  "border-inline-end-color",
  "border-inline-end-style",
  "border-inline-end-width",
  "border-inline-start-color",
  "border-inline-start-style",
  "border-inline-start-width",
  "border-left-color",
  "border-left-style",
  "border-left-width",
  "border-radius",
  "border-right-color",
  "border-right-style",
  "border-right-width",
  "border-style",
  "border-start-end-radius",
  "border-start-start-radius",
  "border-top-color",
  "border-top-left-radius",
  "border-top-right-radius",
  "border-top-style",
  "border-top-width",
  "border-width",
  "bottom",
  "box-shadow",
  "caret-color",
  "clip-path",
  "column-count",
  "column-gap",
  "color",
  "contain",
  "container-type",
  "cursor",
  "flex-basis",
  "flex-direction",
  "flex-grow",
  "flex-shrink",
  "flex-wrap",
  "font-size",
  "font-variant",
  "gap",
  "grid-column",
  "grid-row",
  "grid-template-columns",
  "grid-template-rows",
  "height",
  "hyphens",
  "inline-size",
  "inset-block-end",
  "inset-block-start",
  "inset-inline-end",
  "inset-inline-start",
  "isolation",
  "justify-content",
  "justify-self",
  "left",
  "letter-spacing",
  "line-height",
  "margin-bottom",
  "margin-block-end",
  "margin-block-start",
  "margin-inline-end",
  "margin-inline-start",
  "margin-left",
  "margin-right",
  "margin-top",
  "max-height",
  "max-block-size",
  "max-inline-size",
  "max-width",
  "min-height",
  "min-block-size",
  "min-inline-size",
  "min-width",
  "mix-blend-mode",
  "object-fit",
  "object-position",
  "opacity",
  "order",
  "outline-color",
  "outline-offset",
  "outline-style",
  "outline-width",
  "overflow",
  "overflow-wrap",
  "overflow-x",
  "overflow-y",
  "padding-bottom",
  "padding-block-end",
  "padding-block-start",
  "padding-inline-end",
  "padding-inline-start",
  "padding-left",
  "padding-right",
  "padding-top",
  "pointer-events",
  "position",
  "resize",
  "right",
  "row-gap",
  "scroll-behavior",
  "scroll-margin-bottom",
  "scroll-margin-top",
  "scroll-padding-bottom",
  "scroll-padding-top",
  "text-align",
  "text-decoration",
  "text-indent",
  "text-overflow",
  "text-transform",
  "top",
  "touch-action",
  "transform",
  "transition",
  "user-select",
  "vertical-align",
  "visibility",
  "white-space",
  "width",
  "will-change",
  "word-break",
  "word-spacing",
  "z-index",
] as const);

export type SafeStyleProperty = (typeof SAFE_STYLE_PROPERTIES)[number];

export interface SafeStylePolicy {
  /** Canonical kebab-case properties granted to guest wrappers. */
  readonly allowedProperties: readonly SafeStyleProperty[];
}

const safePropertySet: ReadonlySet<string> = new Set(SAFE_STYLE_PROPERTIES);

/** Internal, compiled policy. Its mutable Set is retained only in this closure. */
export interface StylePolicyEngine {
  readonly allows: (property: SafeStyleProperty) => boolean;
}

const DENY_ALL_STYLE_POLICY: StylePolicyEngine = Object.freeze({
  allows: Object.freeze((_property: SafeStyleProperty): boolean => false),
});

/**
 * Convert the supported CSS spelling or its CSSStyleDeclaration camel-case
 * spelling to one canonical kebab-case property. No trimming, coercion, custom
 * properties, vendor aliases, or arbitrary CSSOM member names are accepted.
 */
export function canonicalizeStyleProperty(value: unknown): SafeStyleProperty | undefined {
  if (typeof value !== "string") return undefined;
  if (safePropertySet.has(value)) return value as SafeStyleProperty;

  const canonical = value.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`);
  return safePropertySet.has(canonical) ? canonical as SafeStyleProperty : undefined;
}

/** Compile a host policy. An omitted policy deliberately grants no properties. */
export function createStylePolicy(policy?: SafeStylePolicy): StylePolicyEngine {
  if (policy === undefined) return DENY_ALL_STYLE_POLICY;

  let configured: unknown;
  try {
    configured = policy.allowedProperties;
  } catch {
    throw invalidPolicy("stylePolicy.allowedProperties");
  }

  if (!Array.isArray(configured)) {
    throw invalidPolicy("stylePolicy.allowedProperties");
  }

  const allowed = new Set<SafeStyleProperty>();
  try {
    const length: unknown = configured.length;
    if (
      typeof length !== "number" ||
      !Number.isSafeInteger(length) ||
      length < 0 ||
      length > SAFE_STYLE_PROPERTIES.length
    ) {
      throw invalidPolicy("stylePolicy.allowedProperties");
    }
    for (let index = 0; index < length; index += 1) {
      const property = configured[index];
      if (typeof property !== "string" || !safePropertySet.has(property)) {
        throw invalidPolicy("stylePolicy.allowedProperties");
      }
      allowed.add(property as SafeStyleProperty);
    }
  } catch {
    // Do not let a hostile array getter's thrown DOM/global value cross the API.
    throw invalidPolicy("stylePolicy.allowedProperties");
  }

  return Object.freeze({
    allows: Object.freeze((property: SafeStyleProperty): boolean => allowed.has(property)),
  });
}
