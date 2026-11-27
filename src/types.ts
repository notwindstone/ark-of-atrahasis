import type { SafeStylePolicy, SafeURLPolicy } from "./policies.ts";
import type { PUBLIC_EVENT_CATALOG, ALLOWED_INPUT_TYPES, FORMATTING_TAGS, LIST_TYPES } from "./validators.ts";

export interface SafeDomainOptions {
  harden?: Hardener | undefined;
  allowStylesheet?: boolean | undefined;
  allowFormControls?: boolean | undefined;
  stylePolicy?: SafeStylePolicy | undefined;
  urlPolicy?: SafeURLPolicy | undefined;
}
export type SafeDocumentOptions = SafeDomainOptions;
export interface SafeDomain {
  mount(root: Element | ShadowRoot): SafeDocument;
  dispose(): void;
}
export interface DeclarativeListenerOptions {
  preventDefault?: boolean | undefined;
  stopPropagation?: boolean | undefined;
  stopImmediatePropagation?: boolean | undefined;
}
type Catalog = typeof PUBLIC_EVENT_CATALOG;
export type PublicEventType = Catalog[keyof Catalog]["type"];
type EventMethods = {
  readonly [M in keyof Catalog]: (
    handler: EventHandler<Extract<SafeEvent, { kind: Catalog[M]["kind"] }>>,
    options?: DeclarativeListenerOptions,
  ) => EventCleanup;
};
export type SafeEventKind = "generic" | "keyboard" | "mouse" | "pointer" | "touch" | "focus" | "input";

export interface SafeEventTargetSnapshot {
  /** Native ID for an active owned target; empty for foreign/terminal targets. */
  readonly id: string;
  /** Present only for an active owned branded standard form control. */
  readonly value?: string;
  /** Present only for an active owned branded HTMLInputElement. */
  readonly checked?: boolean;
}

export interface SafeEventBase<Kind extends SafeEventKind> extends SafeModifierSnapshot {
  readonly kind: Kind;
  readonly type: string;
  readonly bubbles: boolean;
  readonly cancelable: boolean;
  readonly composed: boolean;
  readonly defaultPrevented: boolean;
  readonly eventPhase: number;
  readonly timeStamp: number;
  readonly target: SafeEventTargetSnapshot;
  readonly currentTarget: SafeEventTargetSnapshot;

  /** Returns false once the synchronous handler invocation has ended. */
  readonly preventDefault: () => boolean;
  /** Returns false once the synchronous handler invocation has ended. */
  readonly stopPropagation: () => boolean;
  /** Returns false once the synchronous handler invocation has ended. */
  readonly stopImmediatePropagation: () => boolean;
}

export interface SafeModifierSnapshot {
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
  readonly metaKey: boolean;
}

export interface SafeGenericEvent extends SafeEventBase<"generic"> {}

export interface SafeKeyboardEvent extends SafeEventBase<"keyboard"> {
  readonly key: string;
  readonly code: string;
  readonly location: number;
  readonly repeat: boolean;
  readonly isComposing: boolean;
}

interface MouseFields {
  readonly screenX: number;
  readonly screenY: number;
  readonly clientX: number;
  readonly clientY: number;
  readonly pageX: number;
  readonly pageY: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly movementX: number;
  readonly movementY: number;
  readonly button: number;
  readonly buttons: number;
  readonly relatedTarget: SafeEventTargetSnapshot | null;
}
export interface SafeMouseEvent extends SafeEventBase<"mouse">, MouseFields {}
export interface SafePointerEvent extends SafeEventBase<"pointer">, MouseFields {
  readonly pointerId: number;
  readonly width: number;
  readonly height: number;
  readonly pressure: number;
  readonly tangentialPressure: number;
  readonly tiltX: number;
  readonly tiltY: number;
  readonly twist: number;
  readonly pointerType: string;
  readonly isPrimary: boolean;
}

export interface SafeTouchSnapshot {
  readonly identifier: number;
  readonly screenX: number;
  readonly screenY: number;
  readonly clientX: number;
  readonly clientY: number;
  readonly pageX: number;
  readonly pageY: number;
  readonly radiusX: number;
  readonly radiusY: number;
  readonly rotationAngle: number;
  readonly force: number;
  readonly target: SafeEventTargetSnapshot;
}

export interface SafeTouchEvent extends SafeEventBase<"touch"> {
  readonly touches: readonly SafeTouchSnapshot[];
  readonly targetTouches: readonly SafeTouchSnapshot[];
  readonly changedTouches: readonly SafeTouchSnapshot[];
}

export interface SafeFocusEvent extends SafeEventBase<"focus"> {
  readonly relatedTarget: SafeEventTargetSnapshot | null;
}

export interface SafeInputEvent extends SafeEventBase<"input"> {
  readonly data: string | null;
  readonly inputType: string;
  readonly isComposing: boolean;
}

export type SafeEvent =
  | SafeGenericEvent
  | SafeKeyboardEvent
  | SafeMouseEvent
  | SafePointerEvent
  | SafeTouchEvent
  | SafeFocusEvent
  | SafeInputEvent;

export interface SafeStyle {
  /** Reads the canonical serialized value, or undefined when denied/invalid. */
  readonly get: (property: string) => string | undefined;
  /** Sets one policy-approved property. No coercion or URL-bearing CSS occurs. */
  readonly set: (property: string, value: string) => boolean;
  /** Removes one policy-approved property. */
  readonly remove: (property: string) => boolean;
}

export type EventHandler<Event extends SafeEvent = SafeEvent> = (event: Event) => void;
export type EventCleanup = () => void;

/** Host-supplied SES-compatible recursive object graph finalizer. */
export type Hardener = <Value>(value: Value) => Value;

export interface SafeTextNode {
  setText(value: string): void;
  getText(): string;
  detach(): void;
  dispose(): void;
}

export interface SafeStyleSheet {
  setCSS(value: string): void;
  getCSS(): string;
  dispose(): void;
}

export interface SafeElement extends EventMethods {
  detach(): void;
  dispose(): void;
  focus(): void;
  blur(): void;
  addEventListener(
    type: PublicEventType,
    handler: EventHandler,
    options?: DeclarativeListenerOptions,
  ): EventCleanup;
  setClass(value: string): void;
  getClass(): string;
  setId(value: string): void;
  getId(): string;
  setTitle(value: string): void;
  setRole(value: string): void;
  setTabIndex(value: number): void;
  setHidden(value: boolean): void;
  setLang(value: string): void;
  setDir(value: string): void;
  setSpellcheck(value: boolean): void;

  setData(key: string, value: string): void;
  getData(key: string): string | undefined;
  setAria(key: string, value: string): void;
  getAria(key: string): string | undefined;

  readonly style: SafeStyle;
}

export interface TreeOperations {
  appendChild(child: SafeElement | SafeTextNode): void;
  insertBefore(newChild: SafeElement | SafeTextNode, reference: SafeElement | SafeTextNode): void;
  removeChild(child: SafeElement | SafeTextNode): void;
  replaceChild(newChild: SafeElement | SafeTextNode, oldChild: SafeElement | SafeTextNode): void;
}
export interface SafeContainerElement extends SafeElement, TreeOperations {
  setText(value: string): void;
  getText(): string;
}
export interface SafeVoidElement extends SafeElement {}
export interface SafeInputElement extends SafeVoidElement {
  setType(type: (typeof ALLOWED_INPUT_TYPES)[number]): void;
  setValue(value: string): void;
  getValue(): string;
  setPlaceholder(value: string): void;
  setDisabled(value: boolean): void;
  setReadonly(value: boolean): void;
  setRequired(value: boolean): void;
  setChecked(value: boolean): void;
  getChecked(): boolean;
  setMin(value: string): void;
  setMax(value: string): void;
  setStep(value: string): void;
  setMinLength(value: number): void;
  setMaxLength(value: number): void;
  setMultiple(value: boolean): void;
  setPattern(value: string): void;
  setAutocomplete(value: "off"): void;
  setAutofocus(value: false): void;
  setName(value: string): void;
  setInputMode(value: string): void;
  setEnterKeyHint(value: string): void;
}

export interface SafeTextareaElement extends SafeContainerElement {
  setValue(value: string): void;
  getValue(): string;
  setPlaceholder(value: string): void;
  setDisabled(value: boolean): void;
  setReadonly(value: boolean): void;
  setRequired(value: boolean): void;
  setMinLength(value: number): void;
  setMaxLength(value: number): void;
  setRows(value: number): void;
  setCols(value: number): void;
  setWrap(value: string): void;
  setName(value: string): void;
  setAutocomplete(value: "off"): void;
}

export interface SafeSelectElement extends SafeContainerElement {
  setAutocomplete(value: "off"): void;
  setValue(value: string): void;
  getValue(): string;
  setDisabled(value: boolean): void;
  setRequired(value: boolean): void;
  setMultiple(value: boolean): void;
  setName(value: string): void;
}

export interface SafeOptionElement extends SafeContainerElement {
  getValue(): string;
  setValue(value: string): void;
  setSelected(value: boolean): void;
  setDisabled(value: boolean): void;
  setLabel(value: string): void;
}

export interface SafeButtonElement extends SafeContainerElement {
  getValue(): string;
  setType(type: "button"): void;
  setDisabled(value: boolean): void;
  setName(value: string): void;
  setValue(value: string): void;
}

export interface SafeLabelElement extends SafeContainerElement {
  setFor(value: string): void;
}

export interface SafeFieldsetElement extends SafeContainerElement {
  setDisabled(value: boolean): void;
}

export interface SafeImageElement extends SafeVoidElement {
  setSrc(url: string): void;
  setAlt(value: string): void;
  setWidth(value: number): void;
  setHeight(value: number): void;
  setLoading(value: string): void;
}

export interface SafeAnchorElement extends SafeContainerElement {
  setHref(url: string): void;
}

export interface SafeVideoElement extends SafeContainerElement {
  setSrc(url: string): void;
  setWidth(value: number): void;
  setHeight(value: number): void;
  setControls(value: boolean): void;
  setAutoplay(value: boolean): void;
  setLoop(value: boolean): void;
  setMuted(value: boolean): void;
  setPoster(url: string): void;
}

export interface SafeAudioElement extends SafeContainerElement {
  setSrc(url: string): void;
  setControls(value: boolean): void;
  setAutoplay(value: boolean): void;
  setLoop(value: boolean): void;
  setMuted(value: boolean): void;
}

export interface SafeSourceElement extends SafeVoidElement {
  setSrc(url: string): void;
  setType(value: string): void;
}

export interface SafeCanvasElement extends SafeContainerElement {
  setWidth(value: number): void;
  setHeight(value: number): void;
}

export interface SafeTableCellElement extends SafeContainerElement {
  setColspan(value: number): void;
  setRowspan(value: number): void;
  setScope(value: string): void;
  setHeaders(value: string): void;
}

export interface SafeDetailsElement extends SafeContainerElement {
  setOpen(value: boolean): void;
}

export interface SafeDialogElement extends SafeContainerElement {
  setOpen(value: boolean): void;
}

export interface SafeProgressElement extends SafeContainerElement {
  setValue(value: number): void;
  setMax(value: number): void;
}

export interface SafeMeterElement extends SafeContainerElement {
  setLow(value: number): void;
  setHigh(value: number): void;
  setOptimum(value: number): void;
  setValue(value: number): void;
  setMin(value: number): void;
  setMax(value: number): void;
}

export type ListType = (typeof LIST_TYPES)[number];

export interface SafeTrackElement extends SafeVoidElement {
  setSrc(value: string): void;
  setKind(value: string): void;
  setSrclang(value: string): void;
  setLabel(value: string): void;
  setDefault(value: boolean): void;
}
export interface SafeOptgroupElement extends SafeContainerElement {
  setLabel(value: string): void;
  setDisabled(value: boolean): void;
}
export interface SafeOutputElement extends SafeContainerElement {
  setValue(value: string): void;
  getValue(): string;
  setFor(value: string): void;
  setName(value: string): void;
}
export interface SafeListElement extends SafeContainerElement {
  createItem(): SafeContainerElement;
}

export interface SafeDescriptionListElement extends SafeContainerElement {
  createTerm(): SafeContainerElement;
  createDescription(): SafeContainerElement;
}

export type FormattingTag = (typeof FORMATTING_TAGS)[number];

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export interface SafeDocument extends TreeOperations {
  dispose(): void;
  createBdi(): SafeContainerElement;
  createDiv(): SafeContainerElement;
  createSpan(): SafeContainerElement;
  createSection(): SafeContainerElement;
  createArticle(): SafeContainerElement;
  createNav(): SafeContainerElement;
  createHeader(): SafeContainerElement;
  createFooter(): SafeContainerElement;
  createMain(): SafeContainerElement;
  createAside(): SafeContainerElement;
  createFigure(): SafeContainerElement;
  createFigcaption(): SafeContainerElement;

  createParagraph(): SafeContainerElement;
  createHeading(level: HeadingLevel): SafeContainerElement;
  createFormatting(format: FormattingTag): SafeContainerElement;

  createBlockquote(): SafeContainerElement;
  createPre(): SafeContainerElement;

  createList(type: "ordered" | "unordered"): SafeListElement;
  createList(type: "description"): SafeDescriptionListElement;
  createList(type: ListType): SafeListElement | SafeDescriptionListElement;
  createListItem(): SafeContainerElement;
  createTerm(): SafeContainerElement;
  createDescription(): SafeContainerElement;

  createTable(): SafeContainerElement;
  createThead(): SafeContainerElement;
  createTbody(): SafeContainerElement;
  createTfoot(): SafeContainerElement;
  createTr(): SafeContainerElement;
  createTh(): SafeTableCellElement;
  createTd(): SafeTableCellElement;
  createCaption(): SafeContainerElement;
  createColgroup(): SafeContainerElement;
  createCol(): SafeVoidElement;

  createButton(): SafeButtonElement;
  createInput(): SafeInputElement;
  createSelect(): SafeSelectElement;
  createOption(): SafeOptionElement;
  createOptgroup(): SafeOptgroupElement;
  createTextarea(): SafeTextareaElement;
  createLabel(): SafeLabelElement;
  createFieldset(): SafeFieldsetElement;
  createLegend(): SafeContainerElement;

  createImage(): SafeImageElement;
  createVideo(): SafeVideoElement;
  createAudio(): SafeAudioElement;
  createSource(): SafeSourceElement;
  createTrack(): SafeTrackElement;
  createPicture(): SafeContainerElement;
  createCanvas(): SafeCanvasElement;

  createAnchor(): SafeAnchorElement;
  createDetails(): SafeDetailsElement;
  createSummary(): SafeContainerElement;
  createDialog(): SafeDialogElement;
  createHr(): SafeVoidElement;
  createBr(): SafeVoidElement;
  createWbr(): SafeVoidElement;
  createProgress(): SafeProgressElement;
  createMeter(): SafeMeterElement;
  createOutput(): SafeOutputElement;
  createTime(): SafeContainerElement;
  createData(): SafeContainerElement;
  createRuby(): SafeContainerElement;
  createRt(): SafeContainerElement;
  createRp(): SafeContainerElement;

  createTextNode(value?: string): SafeTextNode;

  createStyle(): SafeStyleSheet;

  getElement(id: string): SafeElement | null;
}
