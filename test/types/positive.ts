import type {
	ARIA_IDREF_LIST_NAMES,
	ARIA_IDREF_NAMES,
	ARIA_ROLES,
	AUTOCOMPLETE_VALUES,
	BUTTON_TYPES,
	DIR_VALUES,
	ENTER_KEY_HINT_VALUES,
	FORMATTING_TAGS,
	HEADING_LEVELS,
	IMAGE_LOADING_VALUES,
	INPUT_MODE_VALUES,
	INPUT_TYPES,
	LIST_TYPES,
	SPECIALIZED_ELEMENT_KINDS,
	TABLE_SCOPE_VALUES,
	TEXTAREA_WRAP_VALUES,
	TRACK_KINDS,
	AriaIdRefListName,
	AriaIdRefName,
	AriaRole,
	AutocompleteValue,
	ButtonType,
	CreateList,
	DirValue,
	EnterKeyHintValue,
	FormattingTag,
	GetElement,
	HeadingLevel,
	ImageLoadingValue,
	InputModeValue,
	InputType,
	ListType,
	SafeAnchorElement,
	SafeAudioElement,
	SafeButtonElement,
	SafeCanvasElement,
	SafeContainerElement,
	SafeDescriptionListElement,
	SafeDetailsElement,
	SafeDialogElement,
	SafeDocument,
	SafeDocumentOptions,
	SafeElement,
	SafeElementByKind,
	SafeEvent,
	SafeEventBase,
	SafeEventKind,
	SafeEventTargetSnapshot,
	SafeFieldsetElement,
	SafeFocusEvent,
	SafeFormControlPolicy,
	SafeGenericEvent,
	SafeImageElement,
	SafeInputElement,
	SafeInputEvent,
	SafeKeyboardEvent,
	SafeLabelElement,
	SafeListElement,
	SafeMeterElement,
	SafeMouseEvent,
	SafeOptionElement,
	SafeOptgroupElement,
	SafePointerEvent,
	SafeProgressElement,
	SafeSelectElement,
	SafeSourceElement,
	SafeTrackElement,
	SafeStyle,
	SafeTableCellElement,
	SafeTextareaElement,
	SafeTextNode,
	SafeTouchEvent,
	SafeTouchSnapshot,
	SafeURLDecision,
	SafeVideoElement,
	SafeVoidElement,
	SpecializedElementKind,
	StylePolicyEngine,
	TableScopeValue,
	TextareaWrapValue,
	TrackKind,
	URLConstructor,
	URLPolicyEngine,
	URLSink,
} from "ark-of-atrahasis";

type Equal<Left, Right> =
	(<Value>() => Value extends Left ? 1 : 2) extends <
		Value,
	>() => Value extends Right ? 1 : 2
		? (<Value>() => Value extends Right ? 1 : 2) extends <
				Value,
			>() => Value extends Left ? 1 : 2
			? true
			: false
		: false;
type Expect<Value extends true> = Value;
type AssertNever<Value extends never> = Value;
type MutableKeys<Value> = {
	[Key in keyof Value]-?: Equal<
		Pick<Value, Key>,
		{ -readonly [Candidate in Key]: Value[Candidate] }
	> extends true
		? Key
		: never;
}[keyof Value];
type MutableFunctionKeys<Value> = {
	[Key in keyof Value]-?: Value[Key] extends (...args: never[]) => unknown
		? Key extends MutableKeys<Value>
			? Key
			: never
		: never;
}[keyof Value];

type _HeadingVocabulary = Expect<
	Equal<HeadingLevel, (typeof HEADING_LEVELS)[number]>
>;
type _FormattingVocabulary = Expect<
	Equal<FormattingTag, (typeof FORMATTING_TAGS)[number]>
>;
type _ListVocabulary = Expect<Equal<ListType, (typeof LIST_TYPES)[number]>>;
type _InputVocabulary = Expect<Equal<InputType, (typeof INPUT_TYPES)[number]>>;
type _ButtonVocabulary = Expect<
	Equal<ButtonType, (typeof BUTTON_TYPES)[number]>
>;
type _AutocompleteVocabulary = Expect<
	Equal<AutocompleteValue, (typeof AUTOCOMPLETE_VALUES)[number]>
>;

const formControlPolicy: SafeFormControlPolicy = {
	allowNonCredentialFormElements: true,
};
const formControlDocumentOptions: SafeDocumentOptions = {
	harden: (value) => value,
	formControlPolicy,
};
void formControlDocumentOptions;
type _DirVocabulary = Expect<Equal<DirValue, (typeof DIR_VALUES)[number]>>;
type _InputModeVocabulary = Expect<
	Equal<InputModeValue, (typeof INPUT_MODE_VALUES)[number]>
>;
type _EnterKeyHintVocabulary = Expect<
	Equal<EnterKeyHintValue, (typeof ENTER_KEY_HINT_VALUES)[number]>
>;
type _TextareaWrapVocabulary = Expect<
	Equal<TextareaWrapValue, (typeof TEXTAREA_WRAP_VALUES)[number]>
>;
type _TrackKindVocabulary = Expect<
	Equal<TrackKind, (typeof TRACK_KINDS)[number]>
>;
type _ImageLoadingVocabulary = Expect<
	Equal<ImageLoadingValue, (typeof IMAGE_LOADING_VALUES)[number]>
>;
type _TableScopeVocabulary = Expect<
	Equal<TableScopeValue, (typeof TABLE_SCOPE_VALUES)[number]>
>;
type _AriaIdRefVocabulary = Expect<
	Equal<AriaIdRefName, (typeof ARIA_IDREF_NAMES)[number]>
>;
type _AriaIdRefListVocabulary = Expect<
	Equal<AriaIdRefListName, (typeof ARIA_IDREF_LIST_NAMES)[number]>
>;
type _AriaRoleVocabulary = Expect<Equal<AriaRole, (typeof ARIA_ROLES)[number]>>;
type _SpecializedKindVocabulary = Expect<
	Equal<SpecializedElementKind, (typeof SPECIALIZED_ELEMENT_KINDS)[number]>
>;
type _SpecializedMapIsExhaustive = Expect<
	Equal<keyof SafeElementByKind, SpecializedElementKind>
>;

declare const safeDocument: SafeDocument;

const unordered: SafeListElement = safeDocument.createList("unordered");
const ordered: SafeListElement = safeDocument.createList("ordered");
const description: SafeDescriptionListElement =
	safeDocument.createList("description");
declare const broadListType: ListType;
const broadList: SafeListElement | SafeDescriptionListElement =
	safeDocument.createList(broadListType);
const createListCapability: CreateList = safeDocument.createList;
const getElementCapability: GetElement = safeDocument.getElement;
const specializedOptgroup: SafeOptgroupElement = safeDocument.createOptgroup();
const specializedTrack: SafeTrackElement = safeDocument.createTrack();
specializedOptgroup.setLabel("Localized group");
specializedTrack.setKind("captions");
specializedTrack.setSrcLang("en");
specializedTrack.setLabel("English");
specializedTrack.setDefault(true);
safeDocument.createDiv().setTranslate(false);

const listItem: SafeContainerElement = unordered.createItem();
const term: SafeContainerElement = description.createTerm();
const listDescription: SafeContainerElement = description.createDescription();

const containerFactories: readonly SafeContainerElement[] = [
	safeDocument.createDiv(),
	safeDocument.createSpan(),
	safeDocument.createSection(),
	safeDocument.createArticle(),
	safeDocument.createNav(),
	safeDocument.createHeader(),
	safeDocument.createFooter(),
	safeDocument.createMain(),
	safeDocument.createAside(),
	safeDocument.createFigure(),
	safeDocument.createFigcaption(),
	safeDocument.createParagraph(),
	safeDocument.createText(),
	safeDocument.createHeading(1),
	safeDocument.createFormatting("strong"),
	safeDocument.createBlockquote(),
	safeDocument.createPre(),
	safeDocument.createListItem(),
	safeDocument.createTerm(),
	safeDocument.createDescription(),
	safeDocument.createTable(),
	safeDocument.createThead(),
	safeDocument.createTbody(),
	safeDocument.createTfoot(),
	safeDocument.createTr(),
	safeDocument.createTh(),
	safeDocument.createTd(),
	safeDocument.createCaption(),
	safeDocument.createColgroup(),
	safeDocument.createButton(),
	safeDocument.createSelect(),
	safeDocument.createOption(),
	safeDocument.createOptgroup(),
	safeDocument.createTextarea(),
	safeDocument.createLabel(),
	safeDocument.createFieldset(),
	safeDocument.createLegend(),
	safeDocument.createVideo(),
	safeDocument.createAudio(),
	safeDocument.createPicture(),
	safeDocument.createCanvas(),
	safeDocument.createAnchor(),
	safeDocument.createDetails(),
	safeDocument.createSummary(),
	safeDocument.createDialog(),
	safeDocument.createProgress(),
	safeDocument.createMeter(),
	safeDocument.createOutput(),
	safeDocument.createTime(),
	safeDocument.createData(),
	safeDocument.createRuby(),
	safeDocument.createRt(),
	safeDocument.createRp(),
	safeDocument.createBdi(),
	unordered,
	ordered,
	description,
];
const voidFactories: readonly SafeVoidElement[] = [
	safeDocument.createCol(),
	safeDocument.createInput(),
	safeDocument.createImage(),
	safeDocument.createSource(),
	safeDocument.createTrack(),
	safeDocument.createHr(),
	safeDocument.createBr(),
	safeDocument.createWbr(),
];

const container = safeDocument.createDiv();
container.appendChild(safeDocument.createTextNode());
container.appendChild(safeDocument.createRawText());
container.setText("container text");
const containerText: string = container.getText();
const voidElement = safeDocument.createBr();
voidElement.setClass("void-common-capability");
const voidClass: string = voidElement.getClass();
safeDocument.createInput().setReadOnly(false);
safeDocument.createInput().setReadonly(false);
safeDocument.createInput().setAutoFocus(false);
safeDocument.createInput().setAutofocus(false);
safeDocument.createTextarea().setReadOnly(false);
safeDocument.createTextarea().setReadonly(false);
safeDocument.createTd().setColSpan(1);
safeDocument.createTd().setColspan(1);
safeDocument.createTd().setRowSpan(1);
safeDocument.createTd().setRowspan(1);

const inputLookup: SafeInputElement | null = safeDocument.getElement(
	"input",
	"input",
);
const textareaLookup: SafeTextareaElement | null = safeDocument.getElement(
	"textarea",
	"textarea",
);
const selectLookup: SafeSelectElement | null = safeDocument.getElement(
	"select",
	"select",
);
const optionLookup: SafeOptionElement | null = safeDocument.getElement(
	"option",
	"option",
);
const buttonLookup: SafeButtonElement | null = safeDocument.getElement(
	"button",
	"button",
);
const labelLookup: SafeLabelElement | null = safeDocument.getElement(
	"label",
	"label",
);
const fieldsetLookup: SafeFieldsetElement | null = safeDocument.getElement(
	"fieldset",
	"fieldset",
);
const imageLookup: SafeImageElement | null = safeDocument.getElement(
	"image",
	"image",
);
const anchorLookup: SafeAnchorElement | null = safeDocument.getElement(
	"anchor",
	"anchor",
);
const videoLookup: SafeVideoElement | null = safeDocument.getElement(
	"video",
	"video",
);
const audioLookup: SafeAudioElement | null = safeDocument.getElement(
	"audio",
	"audio",
);
const sourceLookup: SafeSourceElement | null = safeDocument.getElement(
	"source",
	"source",
);
const canvasLookup: SafeCanvasElement | null = safeDocument.getElement(
	"canvas",
	"canvas",
);
const thLookup: SafeTableCellElement | null = safeDocument.getElement(
	"th",
	"th",
);
const tdLookup: SafeTableCellElement | null = safeDocument.getElement(
	"td",
	"td",
);
const detailsLookup: SafeDetailsElement | null = safeDocument.getElement(
	"details",
	"details",
);
const dialogLookup: SafeDialogElement | null = safeDocument.getElement(
	"dialog",
	"dialog",
);
const progressLookup: SafeProgressElement | null = safeDocument.getElement(
	"progress",
	"progress",
);
const meterLookup: SafeMeterElement | null = safeDocument.getElement(
	"meter",
	"meter",
);
const listLookup: SafeListElement | null = safeDocument.getElement(
	"list",
	"list",
);
const descriptionListLookup: SafeDescriptionListElement | null =
	safeDocument.getElement("description-list", "description-list");
const commonLookup: SafeElement | null = safeDocument.getElement("common");

declare const elementByKind: SafeElementByKind;
const mapInput: SafeInputElement = elementByKind.input;
const mapDescriptionList: SafeDescriptionListElement =
	elementByKind["description-list"];

const style: SafeStyle = container.style;
const styleGet: (property: string) => string | undefined = style.get;
const styleSet: (property: string, value: string) => boolean = style.set;
const styleRemove: (property: string) => boolean = style.remove;
declare const stylePolicyEngine: StylePolicyEngine;
const styleAllows: StylePolicyEngine["allows"] = stylePolicyEngine.allows;

declare const urlPolicyEngine: URLPolicyEngine;
const decideURL: (sink: URLSink, input: unknown) => SafeURLDecision =
	urlPolicyEngine.decide;
const urlConstructor: URLConstructor = URL;
const urlDecision: SafeURLDecision = decideURL(
	"anchor.href",
	"https://example.test/",
);
if (urlDecision.allowed) {
	const canonicalURL: string = urlDecision.url;
	void canonicalURL;
} else {
	const errorCode: string = urlDecision.error.code;
	void errorCode;
}

function inspectEvent(event: SafeEvent): void {
	const target: Readonly<SafeEventTargetSnapshot> = event.target;
	switch (event.kind) {
		case "generic": {
			const narrowed: SafeGenericEvent = event;
			void narrowed;
			break;
		}
		case "keyboard": {
			const narrowed: SafeKeyboardEvent = event;
			const key: string = narrowed.key;
			void key;
			break;
		}
		case "mouse": {
			const narrowed: SafeMouseEvent = event;
			const clientX: number = narrowed.clientX;
			void clientX;
			break;
		}
		case "pointer": {
			const narrowed: SafePointerEvent = event;
			const pointerId: number = narrowed.pointerId;
			void pointerId;
			break;
		}
		case "touch": {
			const narrowed: SafeTouchEvent = event;
			const touches: readonly SafeTouchSnapshot[] = narrowed.touches;
			void touches;
			break;
		}
		case "focus": {
			const narrowed: SafeFocusEvent = event;
			const relatedTarget: Readonly<SafeEventTargetSnapshot> | null =
				narrowed.relatedTarget;
			void relatedTarget;
			break;
		}
		case "input": {
			const narrowed: SafeInputEvent = event;
			const data: string | null = narrowed.data;
			void data;
			break;
		}
		default: {
			const exhaustive: never = event;
			void exhaustive;
		}
	}
	void target;
}

const eventKinds: Readonly<Record<SafeEventKind, true>> = {
	generic: true,
	keyboard: true,
	mouse: true,
	pointer: true,
	touch: true,
	focus: true,
	input: true,
};

type PublicCapabilityInterfaces =
	| MutableFunctionKeys<SafeDocument>
	| MutableFunctionKeys<SafeDocumentOptions>
	| MutableFunctionKeys<SafeTextNode>
	| MutableFunctionKeys<SafeElement>
	| MutableFunctionKeys<SafeContainerElement>
	| MutableFunctionKeys<SafeVoidElement>
	| MutableFunctionKeys<SafeInputElement>
	| MutableFunctionKeys<SafeTextareaElement>
	| MutableFunctionKeys<SafeSelectElement>
	| MutableFunctionKeys<SafeOptionElement>
	| MutableFunctionKeys<SafeButtonElement>
	| MutableFunctionKeys<SafeLabelElement>
	| MutableFunctionKeys<SafeFieldsetElement>
	| MutableFunctionKeys<SafeImageElement>
	| MutableFunctionKeys<SafeAnchorElement>
	| MutableFunctionKeys<SafeVideoElement>
	| MutableFunctionKeys<SafeAudioElement>
	| MutableFunctionKeys<SafeSourceElement>
	| MutableFunctionKeys<SafeCanvasElement>
	| MutableFunctionKeys<SafeTableCellElement>
	| MutableFunctionKeys<SafeDetailsElement>
	| MutableFunctionKeys<SafeDialogElement>
	| MutableFunctionKeys<SafeProgressElement>
	| MutableFunctionKeys<SafeMeterElement>
	| MutableFunctionKeys<SafeListElement>
	| MutableFunctionKeys<SafeDescriptionListElement>
	| MutableFunctionKeys<SafeStyle>
	| MutableFunctionKeys<SafeEventBase<SafeEventKind>>
	| MutableFunctionKeys<URLPolicyEngine>
	| MutableFunctionKeys<StylePolicyEngine>;
type _NoMutablePublicFunctions = AssertNever<PublicCapabilityInterfaces>;

void broadList;
void createListCapability;
void getElementCapability;
void listItem;
void term;
void listDescription;
void containerFactories;
void voidFactories;
void containerText;
void voidClass;
void inputLookup;
void textareaLookup;
void selectLookup;
void optionLookup;
void buttonLookup;
void labelLookup;
void fieldsetLookup;
void imageLookup;
void anchorLookup;
void videoLookup;
void audioLookup;
void sourceLookup;
void canvasLookup;
void thLookup;
void tdLookup;
void detailsLookup;
void dialogLookup;
void progressLookup;
void meterLookup;
void listLookup;
void descriptionListLookup;
void commonLookup;
void mapInput;
void mapDescriptionList;
void styleGet;
void styleSet;
void styleRemove;
void styleAllows;
void urlConstructor;
void inspectEvent;
void eventKinds;
