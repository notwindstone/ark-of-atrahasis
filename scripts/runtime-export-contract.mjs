/**
 * The exact public value namespace of the package root.
 *
 * Keep this independent allowlist synchronized with the README contract. Both
 * the built-module and installed-tarball gates consume this one authority.
 */
export const EXPECTED_RUNTIME_EXPORTS = Object.freeze([
  "ARIA_IDREF_LIST_NAMES",
  "ARIA_IDREF_NAMES",
  "ARIA_ROLES",
  "AUTOCOMPLETE_VALUES",
  "BUTTON_TYPES",
  "DIR_VALUES",
  "ENTER_KEY_HINT_VALUES",
  "FORMATTING_TAGS",
  "HEADING_LEVELS",
  "IMAGE_LOADING_VALUES",
  "INPUT_MODE_VALUES",
  "INPUT_TYPES",
  "LIST_TYPES",
  "SAFE_STYLE_PROPERTIES",
  "SPECIALIZED_ELEMENT_KINDS",
  "TABLE_SCOPE_VALUES",
  "TEXTAREA_WRAP_VALUES",
  "TRACK_KINDS",
  "URL_SINKS",
  "canonicalizeStyleProperty",
  "createSafeDocument",
  "createStylePolicy",
  "createURLPolicy",
  "isSafeDOMError",
  "requireFiniteNumber",
  "requireInteger",
  "requirePrimitiveBoolean",
  "requirePrimitiveString",
  "scanCSSNetworkRisk",
]);
