/** Frozen single sources of truth for every public keyword vocabulary. */
export const HEADING_LEVELS = Object.freeze([1, 2, 3, 4, 5, 6] as const);
export type HeadingLevel = (typeof HEADING_LEVELS)[number];

export const FORMATTING_TAGS = Object.freeze([
  "strong", "em", "small", "b", "i", "u", "code", "kbd", "samp", "var",
  "sub", "sup", "mark", "abbr", "cite",
] as const);
export type FormattingTag = (typeof FORMATTING_TAGS)[number];

export const LIST_TYPES = Object.freeze(["unordered", "ordered", "description"] as const);
export type ListType = (typeof LIST_TYPES)[number];

export const INPUT_TYPES = Object.freeze([
  "text", "search", "tel", "url", "email", "date", "month", "week",
  "time", "datetime-local", "number", "range", "color", "checkbox", "radio",
] as const);
export type InputType = (typeof INPUT_TYPES)[number];

export const BUTTON_TYPES = Object.freeze(["button"] as const);
export type ButtonType = (typeof BUTTON_TYPES)[number];

export const AUTOCOMPLETE_VALUES = Object.freeze(["off"] as const);
export type AutocompleteValue = (typeof AUTOCOMPLETE_VALUES)[number];

export const DIR_VALUES = Object.freeze(["ltr", "rtl", "auto"] as const);
export type DirValue = (typeof DIR_VALUES)[number];

export const INPUT_MODE_VALUES = Object.freeze([
  "none", "text", "decimal", "numeric", "tel", "search", "email", "url",
] as const);
export type InputModeValue = (typeof INPUT_MODE_VALUES)[number];

export const ENTER_KEY_HINT_VALUES = Object.freeze([
  "enter", "done", "go", "next", "previous", "search", "send",
] as const);
export type EnterKeyHintValue = (typeof ENTER_KEY_HINT_VALUES)[number];

export const TEXTAREA_WRAP_VALUES = Object.freeze(["soft", "hard"] as const);
export type TextareaWrapValue = (typeof TEXTAREA_WRAP_VALUES)[number];

export const IMAGE_LOADING_VALUES = Object.freeze(["eager", "lazy"] as const);
export type ImageLoadingValue = (typeof IMAGE_LOADING_VALUES)[number];

export const TRACK_KINDS = Object.freeze([
  "subtitles", "captions", "descriptions", "chapters", "metadata",
] as const);
export type TrackKind = (typeof TRACK_KINDS)[number];

export const TABLE_SCOPE_VALUES = Object.freeze(["row", "col", "rowgroup", "colgroup"] as const);
export type TableScopeValue = (typeof TABLE_SCOPE_VALUES)[number];

export const ARIA_IDREF_NAMES = Object.freeze([
  "activedescendant", "details", "errormessage",
] as const);
export type AriaIdRefName = (typeof ARIA_IDREF_NAMES)[number];

export const ARIA_IDREF_LIST_NAMES = Object.freeze([
  "controls", "describedby", "flowto", "labelledby", "owns",
] as const);
export type AriaIdRefListName = (typeof ARIA_IDREF_LIST_NAMES)[number];

export const ARIA_ROLES = Object.freeze([
  "alert", "alertdialog", "application", "article", "banner", "blockquote", "button",
  "caption", "cell", "checkbox", "code", "columnheader", "combobox", "complementary",
  "contentinfo", "definition", "deletion", "dialog", "directory", "document", "emphasis",
  "feed", "figure", "form", "generic", "grid", "gridcell", "group", "heading", "img",
  "insertion", "link", "list", "listbox", "listitem", "log", "main", "marquee", "math",
  "menu", "menubar", "menuitem", "menuitemcheckbox", "menuitemradio", "meter", "navigation",
  "none", "note", "option", "paragraph", "presentation", "progressbar", "radio", "radiogroup",
  "region", "row", "rowgroup", "rowheader", "scrollbar", "search", "searchbox", "separator",
  "slider", "spinbutton", "status", "strong", "subscript", "superscript", "switch", "tab",
  "table", "tablist", "tabpanel", "term", "textbox", "time", "timer", "toolbar", "tooltip",
  "tree", "treegrid", "treeitem",
] as const);
export type AriaRole = (typeof ARIA_ROLES)[number];

export const SPECIALIZED_ELEMENT_KINDS = Object.freeze([
  "input", "textarea", "select", "option", "optgroup", "button", "label", "fieldset", "image", "anchor",
  "video", "audio", "source", "track", "canvas", "th", "td", "details", "dialog", "progress", "meter",
  "list", "description-list",
] as const);
export type SpecializedElementKind = (typeof SPECIALIZED_ELEMENT_KINDS)[number];
