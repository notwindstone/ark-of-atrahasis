import type { SafeURLDecision, SafeURLPolicy } from "./url-policy.ts";
import type { SafeStylePolicy } from "./style-policy.ts";
import type {
  AriaRole,
  AutocompleteValue,
  ButtonType,
  DirValue,
  EnterKeyHintValue,
  FormattingTag,
  HeadingLevel,
  ImageLoadingValue,
  InputModeValue,
  InputType,
  ListType,
  SpecializedElementKind,
  TableScopeValue,
  TextareaWrapValue,
  TrackKind,
} from "./vocabularies.ts";

export type {
  AriaRole,
  AutocompleteValue,
  ButtonType,
  DirValue,
  EnterKeyHintValue,
  FormattingTag,
  HeadingLevel,
  ImageLoadingValue,
  InputModeValue,
  InputType,
  ListType,
  SpecializedElementKind,
  TableScopeValue,
  TextareaWrapValue,
  TrackKind,
} from "./vocabularies.ts";

export type SafeEventKind =
  | "generic"
  | "keyboard"
  | "mouse"
  | "pointer"
  | "touch"
  | "focus"
  | "input";

export interface SafeEventTargetSnapshot {
  /** Logical local ID for an active owned target; empty for foreign/terminal targets. */
  readonly id: string;
  /** Present only for an active owned branded standard form control. */
  readonly value?: string;
  /** Present only for an active owned branded HTMLInputElement. */
  readonly checked?: boolean;
}

export interface SafeEventBase<Kind extends SafeEventKind> {
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

export interface SafeKeyboardEvent extends SafeEventBase<"keyboard">, SafeModifierSnapshot {
  readonly key: string;
  readonly code: string;
  readonly location: number;
  readonly repeat: boolean;
  readonly isComposing: boolean;
}

export interface SafeMouseEvent extends SafeEventBase<"mouse">, SafeModifierSnapshot {
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

export interface SafePointerEvent extends SafeEventBase<"pointer">, SafeModifierSnapshot {
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

export interface SafeTouchEvent extends SafeEventBase<"touch">, SafeModifierSnapshot {
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

/** Explicit host acknowledgement for the complete non-credential form surface. */
export interface SafeFormControlPolicy {
  readonly allowNonCredentialFormElements: true;
}

export interface SafeDocumentOptions {
  /**
   * The host must call SES lockdown before importing this package and pass its
   * resulting global harden function here as an own data property.
   */
  readonly harden: Hardener;
  /** Missing policy means every URL-bearing sink is denied. */
  readonly urlPolicy?: SafeURLPolicy;
  /** Missing policy means every inline style property is denied. */
  readonly stylePolicy?: SafeStylePolicy;
  /**
   * Missing policy denies every public form-surface factory, including the
   * historically form-associated image element.
   */
  readonly formControlPolicy?: SafeFormControlPolicy;
}

export interface SafeTextNode {
  readonly setText: (value: string) => void;
  readonly getText: () => string;
  /** Reversible DOM detach; the wrapper remains usable. */
  readonly detach: () => void;
  /** @deprecated Use detach(). */
  readonly remove: () => void;
  /** Irreversible and idempotent wrapper/resource revocation. */
  readonly dispose: () => void;
}

export interface SafeElement {
  /** Reversible DOM detach; the wrapper and its subtree remain usable. */
  readonly detach: () => void;
  /** @deprecated Use detach(). */
  readonly remove: () => void;
  /** Irreversible and idempotent disposal of this wrapper and its owned subtree. */
  readonly dispose: () => void;

  readonly setClass: (value: string) => void;
  readonly getClass: () => string;
  readonly setId: (value: string) => void;
  readonly getId: () => string;
  readonly setTitle: (value: string) => void;
  readonly setRole: (value: AriaRole) => void;
  readonly setTabIndex: (value: number) => void;
  readonly setHidden: (value: boolean) => void;
  readonly setLang: (value: string) => void;
  /** Remove the local language declaration and return to HTML inheritance. */
  readonly clearLang: () => void;
  /** Local language declaration; undefined means inherited, empty means unknown. */
  readonly getLang: () => string | undefined;
  readonly setDir: (value: DirValue) => void;
  /** Remove the local direction declaration and return to HTML inheritance. */
  readonly clearDir: () => void;
  /** Local direction declaration; undefined means inherited. */
  readonly getDir: () => DirValue | undefined;
  readonly setTranslate: (value: boolean) => void;
  /** Remove the local translation instruction and return to HTML inheritance. */
  readonly clearTranslate: () => void;
  /** Local translation instruction; undefined means inherited. */
  readonly getTranslate: () => boolean | undefined;
  readonly setSpellcheck: (value: boolean) => void;

  readonly setData: (key: string, value: string) => void;
  readonly getData: (key: string) => string | undefined;
  readonly setAria: (key: string, value: string) => void;
  readonly getAria: (key: string) => string | undefined;

  readonly onClick: (handler: EventHandler<SafeMouseEvent>) => EventCleanup;
  readonly onDblClick: (handler: EventHandler<SafeMouseEvent>) => EventCleanup;
  readonly onMouseDown: (handler: EventHandler<SafeMouseEvent>) => EventCleanup;
  readonly onMouseUp: (handler: EventHandler<SafeMouseEvent>) => EventCleanup;
  readonly onMouseEnter: (handler: EventHandler<SafeMouseEvent>) => EventCleanup;
  readonly onMouseLeave: (handler: EventHandler<SafeMouseEvent>) => EventCleanup;
  readonly onMouseMove: (handler: EventHandler<SafeMouseEvent>) => EventCleanup;
  readonly onPointerDown: (handler: EventHandler<SafePointerEvent>) => EventCleanup;
  readonly onPointerUp: (handler: EventHandler<SafePointerEvent>) => EventCleanup;
  readonly onPointerMove: (handler: EventHandler<SafePointerEvent>) => EventCleanup;
  readonly onContextMenu: (handler: EventHandler<SafeMouseEvent>) => EventCleanup;

  readonly onKeyDown: (handler: EventHandler<SafeKeyboardEvent>) => EventCleanup;
  readonly onKeyUp: (handler: EventHandler<SafeKeyboardEvent>) => EventCleanup;

  readonly onFocus: (handler: EventHandler<SafeFocusEvent>) => EventCleanup;
  readonly onBlur: (handler: EventHandler<SafeFocusEvent>) => EventCleanup;

  readonly onTouchStart: (handler: EventHandler<SafeTouchEvent>) => EventCleanup;
  readonly onTouchEnd: (handler: EventHandler<SafeTouchEvent>) => EventCleanup;
  readonly onTouchMove: (handler: EventHandler<SafeTouchEvent>) => EventCleanup;

  readonly onScroll: (handler: EventHandler<SafeGenericEvent>) => EventCleanup;

  readonly style: SafeStyle;
}

export interface SafeContainerElement extends SafeElement {
  readonly appendChild: (child: SafeElement | SafeTextNode) => void;
  readonly insertBefore: (
    newChild: SafeElement | SafeTextNode,
    reference: SafeElement | SafeTextNode,
  ) => void;
  readonly removeChild: (child: SafeElement | SafeTextNode) => void;
  readonly replaceChild: (
    newChild: SafeElement | SafeTextNode,
    oldChild: SafeElement | SafeTextNode,
  ) => void;
  /** Replace DOM descendants; their detached wrappers remain independently usable. */
  readonly setText: (value: string) => void;
  readonly getText: () => string;
}

export interface SafeVoidElement extends SafeElement {}

export interface SafeInputElement extends SafeVoidElement {
  readonly setType: (type: InputType) => void;
  readonly setValue: (value: string) => void;
  readonly getValue: () => string;
  readonly setPlaceholder: (value: string) => void;
  readonly setDisabled: (value: boolean) => void;
  readonly setReadOnly: (value: boolean) => void;
  /** @deprecated Use setReadOnly(). */
  readonly setReadonly: (value: boolean) => void;
  readonly setRequired: (value: boolean) => void;
  readonly setChecked: (value: boolean) => void;
  readonly getChecked: () => boolean;
  readonly setMin: (value: string) => void;
  readonly setMax: (value: string) => void;
  readonly setStep: (value: string) => void;
  readonly setMinLength: (value: number) => void;
  readonly setMaxLength: (value: number) => void;
  readonly setPattern: (value: string) => void;
  readonly setAutocomplete: (value: AutocompleteValue) => void;
  readonly setAutoFocus: (value: false) => void;
  /** @deprecated Use setAutoFocus(). */
  readonly setAutofocus: (value: false) => void;
  readonly setName: (value: string) => void;
  readonly setInputMode: (value: InputModeValue) => void;
  readonly setEnterKeyHint: (value: EnterKeyHintValue) => void;
  readonly onChange: (handler: EventHandler<SafeInputEvent>) => EventCleanup;
  readonly onInput: (handler: EventHandler<SafeInputEvent>) => EventCleanup;
}

export interface SafeTextareaElement extends SafeContainerElement {
  readonly setValue: (value: string) => void;
  readonly getValue: () => string;
  readonly setPlaceholder: (value: string) => void;
  readonly setDisabled: (value: boolean) => void;
  readonly setReadOnly: (value: boolean) => void;
  /** @deprecated Use setReadOnly(). */
  readonly setReadonly: (value: boolean) => void;
  readonly setRequired: (value: boolean) => void;
  readonly setMinLength: (value: number) => void;
  readonly setMaxLength: (value: number) => void;
  readonly setRows: (value: number) => void;
  readonly setCols: (value: number) => void;
  readonly setWrap: (value: TextareaWrapValue) => void;
  readonly setName: (value: string) => void;
  readonly setAutocomplete: (value: AutocompleteValue) => void;
  readonly onChange: (handler: EventHandler<SafeInputEvent>) => EventCleanup;
  readonly onInput: (handler: EventHandler<SafeInputEvent>) => EventCleanup;
}

export interface SafeSelectElement extends SafeContainerElement {
  readonly setValue: (value: string) => void;
  readonly getValue: () => string;
  readonly setDisabled: (value: boolean) => void;
  readonly setRequired: (value: boolean) => void;
  readonly setMultiple: (value: boolean) => void;
  readonly setName: (value: string) => void;
  readonly onChange: (handler: EventHandler<SafeInputEvent>) => EventCleanup;
}

export interface SafeOptionElement extends SafeContainerElement {
  readonly setValue: (value: string) => void;
  readonly setSelected: (value: boolean) => void;
  readonly setDisabled: (value: boolean) => void;
  readonly setLabel: (value: string) => void;
}

export interface SafeOptgroupElement extends SafeContainerElement {
  /** Required non-empty, localized label when no child legend supplies it. */
  readonly setLabel: (value: string) => void;
}

export interface SafeButtonElement extends SafeContainerElement {
  readonly setType: (type: ButtonType) => void;
  readonly setDisabled: (value: boolean) => void;
  readonly setName: (value: string) => void;
  readonly setValue: (value: string) => void;
}

export interface SafeLabelElement extends SafeContainerElement {
  readonly setFor: (value: string) => void;
  readonly getFor: () => string;
}

export interface SafeFieldsetElement extends SafeContainerElement {
  readonly setDisabled: (value: boolean) => void;
}

export interface SafeImageElement extends SafeVoidElement {
  readonly setSrc: (url: string) => SafeURLDecision;
  readonly setAlt: (value: string) => void;
  readonly setWidth: (value: number) => void;
  readonly setHeight: (value: number) => void;
  readonly setLoading: (value: ImageLoadingValue) => void;
}

export interface SafeAnchorElement extends SafeContainerElement {
  readonly setHref: (url: string) => SafeURLDecision;
}

export interface SafeVideoElement extends SafeContainerElement {
  readonly setSrc: (url: string) => SafeURLDecision;
  readonly setWidth: (value: number) => void;
  readonly setHeight: (value: number) => void;
  readonly setControls: (value: boolean) => void;
  readonly setAutoplay: (value: boolean) => void;
  readonly setLoop: (value: boolean) => void;
  readonly setMuted: (value: boolean) => void;
  readonly setPoster: (url: string) => SafeURLDecision;
}

export interface SafeAudioElement extends SafeContainerElement {
  readonly setSrc: (url: string) => SafeURLDecision;
  readonly setControls: (value: boolean) => void;
  readonly setAutoplay: (value: boolean) => void;
  readonly setLoop: (value: boolean) => void;
  readonly setMuted: (value: boolean) => void;
}

export interface SafeSourceElement extends SafeVoidElement {
  readonly setSrc: (url: string) => SafeURLDecision;
  readonly setType: (value: string) => void;
}

export interface SafeTrackElement extends SafeVoidElement {
  readonly setKind: (value: TrackKind) => void;
  readonly setSrc: (url: string) => SafeURLDecision;
  readonly setSrcLang: (value: string) => void;
  readonly setLabel: (value: string) => void;
  readonly setDefault: (value: boolean) => void;
}

export interface SafeCanvasElement extends SafeContainerElement {
  readonly setWidth: (value: number) => void;
  readonly setHeight: (value: number) => void;
}

export interface SafeTableCellElement extends SafeContainerElement {
  readonly setColSpan: (value: number) => void;
  /** @deprecated Use setColSpan(). */
  readonly setColspan: (value: number) => void;
  readonly setRowSpan: (value: number) => void;
  /** @deprecated Use setRowSpan(). */
  readonly setRowspan: (value: number) => void;
  readonly setScope: (value: TableScopeValue) => void;
  readonly setHeaders: (value: string) => void;
  readonly getHeaders: () => string;
}

export interface SafeDetailsElement extends SafeContainerElement {
  readonly setOpen: (value: boolean) => void;
}

export interface SafeDialogElement extends SafeContainerElement {
  readonly setOpen: (value: boolean) => void;
}

export interface SafeProgressElement extends SafeContainerElement {
  readonly setValue: (value: number) => void;
  readonly setMax: (value: number) => void;
}

export interface SafeMeterElement extends SafeContainerElement {
  readonly setValue: (value: number) => void;
  readonly setMin: (value: number) => void;
  readonly setMax: (value: number) => void;
}

export interface SafeListElement extends SafeContainerElement {
  /** Create a detached list item; append it explicitly. */
  readonly createItem: () => SafeContainerElement;
}

export interface SafeDescriptionListElement extends SafeContainerElement {
  /** Create a detached term; append it explicitly. */
  readonly createTerm: () => SafeContainerElement;
  /** Create a detached description; append it explicitly. */
  readonly createDescription: () => SafeContainerElement;
}

export interface SafeElementByKind {
  readonly input: SafeInputElement;
  readonly textarea: SafeTextareaElement;
  readonly select: SafeSelectElement;
  readonly option: SafeOptionElement;
  readonly optgroup: SafeOptgroupElement;
  readonly button: SafeButtonElement;
  readonly label: SafeLabelElement;
  readonly fieldset: SafeFieldsetElement;
  readonly image: SafeImageElement;
  readonly anchor: SafeAnchorElement;
  readonly video: SafeVideoElement;
  readonly audio: SafeAudioElement;
  readonly source: SafeSourceElement;
  readonly track: SafeTrackElement;
  readonly canvas: SafeCanvasElement;
  readonly th: SafeTableCellElement;
  readonly td: SafeTableCellElement;
  readonly details: SafeDetailsElement;
  readonly dialog: SafeDialogElement;
  readonly progress: SafeProgressElement;
  readonly meter: SafeMeterElement;
  readonly list: SafeListElement;
  readonly "description-list": SafeDescriptionListElement;
}

export interface CreateList {
  (type: "unordered" | "ordered"): SafeListElement;
  (type: "description"): SafeDescriptionListElement;
  (type: ListType): SafeListElement | SafeDescriptionListElement;
}

export interface GetElement {
  (id: string): SafeElement | null;
  <K extends SpecializedElementKind>(
    id: string,
    kind: K,
  ): SafeElementByKind[K] | null;
}

export interface SafeDocument {
  /** Mount operations target the claimed ShadowRoot without exposing a root wrapper. */
  readonly appendChild: (child: SafeElement | SafeTextNode) => void;
  readonly insertBefore: (
    newChild: SafeElement | SafeTextNode,
    reference: SafeElement | SafeTextNode,
  ) => void;
  readonly removeChild: (child: SafeElement | SafeTextNode) => void;
  readonly replaceChild: (
    newChild: SafeElement | SafeTextNode,
    oldChild: SafeElement | SafeTextNode,
  ) => void;
  /** Irreversibly dispose every owned wrapper/resource. Idempotent. */
  readonly dispose: () => void;

  readonly createDiv: () => SafeContainerElement;
  readonly createSpan: () => SafeContainerElement;
  readonly createSection: () => SafeContainerElement;
  readonly createArticle: () => SafeContainerElement;
  readonly createNav: () => SafeContainerElement;
  readonly createHeader: () => SafeContainerElement;
  readonly createFooter: () => SafeContainerElement;
  readonly createMain: () => SafeContainerElement;
  readonly createAside: () => SafeContainerElement;
  readonly createFigure: () => SafeContainerElement;
  readonly createFigcaption: () => SafeContainerElement;

  readonly createParagraph: () => SafeContainerElement;
  /** @deprecated Use createParagraph(). */
  readonly createText: () => SafeContainerElement;
  readonly createHeading: (level: HeadingLevel) => SafeContainerElement;
  readonly createFormatting: (format: FormattingTag) => SafeContainerElement;
  /** Bidirectional isolation for caller text whose direction is not known in advance. */
  readonly createBdi: () => SafeContainerElement;

  readonly createBlockquote: () => SafeContainerElement;
  readonly createPre: () => SafeContainerElement;

  readonly createList: CreateList;
  readonly createListItem: () => SafeContainerElement;
  readonly createTerm: () => SafeContainerElement;
  readonly createDescription: () => SafeContainerElement;

  readonly createTable: () => SafeContainerElement;
  readonly createThead: () => SafeContainerElement;
  readonly createTbody: () => SafeContainerElement;
  readonly createTfoot: () => SafeContainerElement;
  readonly createTr: () => SafeContainerElement;
  readonly createTh: () => SafeTableCellElement;
  readonly createTd: () => SafeTableCellElement;
  readonly createCaption: () => SafeContainerElement;
  readonly createColgroup: () => SafeContainerElement;
  readonly createCol: () => SafeVoidElement;

  readonly createButton: () => SafeButtonElement;
  readonly createInput: () => SafeInputElement;
  readonly createSelect: () => SafeSelectElement;
  readonly createOption: () => SafeOptionElement;
  readonly createOptgroup: () => SafeOptgroupElement;
  readonly createTextarea: () => SafeTextareaElement;
  readonly createLabel: () => SafeLabelElement;
  readonly createFieldset: () => SafeFieldsetElement;
  readonly createLegend: () => SafeContainerElement;

  readonly createImage: () => SafeImageElement;
  readonly createVideo: () => SafeVideoElement;
  readonly createAudio: () => SafeAudioElement;
  readonly createSource: () => SafeSourceElement;
  readonly createTrack: () => SafeTrackElement;
  readonly createPicture: () => SafeContainerElement;
  readonly createCanvas: () => SafeCanvasElement;

  readonly createAnchor: () => SafeAnchorElement;
  readonly createDetails: () => SafeDetailsElement;
  readonly createSummary: () => SafeContainerElement;
  readonly createDialog: () => SafeDialogElement;
  readonly createHr: () => SafeVoidElement;
  readonly createBr: () => SafeVoidElement;
  readonly createWbr: () => SafeVoidElement;
  readonly createProgress: () => SafeProgressElement;
  readonly createMeter: () => SafeMeterElement;
  readonly createOutput: () => SafeContainerElement;
  readonly createTime: () => SafeContainerElement;
  readonly createData: () => SafeContainerElement;
  readonly createRuby: () => SafeContainerElement;
  readonly createRt: () => SafeContainerElement;
  readonly createRp: () => SafeContainerElement;

  readonly createTextNode: () => SafeTextNode;
  /** @deprecated Use createTextNode(). */
  readonly createRawText: () => SafeTextNode;

  readonly getElement: GetElement;
}
