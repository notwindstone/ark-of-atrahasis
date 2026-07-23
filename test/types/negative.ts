// @ts-expect-error quota defaults are not part of the Ark 1.0 package surface
import { DEFAULT_SAFE_DOCUMENT_QUOTAS } from "ark-of-atrahasis";
// @ts-expect-error rate defaults are not part of the Ark 1.0 package surface
import { DEFAULT_SAFE_DOCUMENT_RATES } from "ark-of-atrahasis";
// @ts-expect-error quota types are not part of the Ark 1.0 package surface
import type { SafeDocumentQuotas } from "ark-of-atrahasis";
// @ts-expect-error rate-limit types are not part of the Ark 1.0 package surface
import type { SafeDocumentRateLimit } from "ark-of-atrahasis";
// @ts-expect-error rate-map types are not part of the Ark 1.0 package surface
import type { SafeDocumentRates } from "ark-of-atrahasis";

import type {
	AriaIdRefListName,
	AriaIdRefName,
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
	SafeDOMErrorCode,
	SafeElement,
	SafeEventBase,
	SafeFieldsetElement,
	SafeFormControlPolicy,
	SafeImageElement,
	SafeInputElement,
	SafeLabelElement,
	SafeListElement,
	SafeMeterElement,
	SafeMouseEvent,
	SafeOptionElement,
	SafeProgressElement,
	SafeSelectElement,
	SafeSourceElement,
	SafeStyle,
	SafeTableCellElement,
	SafeTextareaElement,
	SafeTextNode,
	SafeTouchEvent,
	SafeTouchSnapshot,
	SafeVideoElement,
	SafeVoidElement,
	SpecializedElementKind,
	StylePolicyEngine,
	TableScopeValue,
	TextareaWrapValue,
	TrackKind,
	URLPolicyEngine,
} from "ark-of-atrahasis";

declare const safeDocument: SafeDocument;
const child = safeDocument.createDiv();
const text = safeDocument.createTextNode();

// @ts-expect-error password inputs are outside the strict credential boundary
safeDocument.createInput().setType("password");
const col = safeDocument.createCol();
const input = safeDocument.createInput();
const image = safeDocument.createImage();
const source = safeDocument.createSource();
const track = safeDocument.createTrack();
const hr = safeDocument.createHr();
const br = safeDocument.createBr();
const wbr = safeDocument.createWbr();

// @ts-expect-error col is void and cannot append children
col.appendChild(child);
// @ts-expect-error col is void and cannot insert children
col.insertBefore(child, child);
// @ts-expect-error col is void and cannot remove children
col.removeChild(child);
// @ts-expect-error col is void and cannot replace children
col.replaceChild(child, child);
// @ts-expect-error col is void and cannot set text
col.setText("text");
// @ts-expect-error col is void and cannot get text
col.getText();

// @ts-expect-error input is void and cannot append children
input.appendChild(child);
// @ts-expect-error input is void and cannot insert children
input.insertBefore(child, child);
// @ts-expect-error input is void and cannot remove children
input.removeChild(child);
// @ts-expect-error input is void and cannot replace children
input.replaceChild(child, child);
// @ts-expect-error input is void and cannot set text
input.setText("text");
// @ts-expect-error input is void and cannot get text
input.getText();

// @ts-expect-error image is void and cannot append children
image.appendChild(child);
// @ts-expect-error image is void and cannot insert children
image.insertBefore(child, child);
// @ts-expect-error image is void and cannot remove children
image.removeChild(child);
// @ts-expect-error image is void and cannot replace children
image.replaceChild(child, child);
// @ts-expect-error image is void and cannot set text
image.setText("text");
// @ts-expect-error image is void and cannot get text
image.getText();

// @ts-expect-error source is void and cannot append children
source.appendChild(child);
// @ts-expect-error source is void and cannot insert children
source.insertBefore(child, child);
// @ts-expect-error source is void and cannot remove children
source.removeChild(child);
// @ts-expect-error source is void and cannot replace children
source.replaceChild(child, child);
// @ts-expect-error source is void and cannot set text
source.setText("text");
// @ts-expect-error source is void and cannot get text
source.getText();

// @ts-expect-error track is void and cannot append children
track.appendChild(child);
// @ts-expect-error track is void and cannot insert children
track.insertBefore(child, child);
// @ts-expect-error track is void and cannot remove children
track.removeChild(child);
// @ts-expect-error track is void and cannot replace children
track.replaceChild(child, child);
// @ts-expect-error track is void and cannot set text
track.setText("text");
// @ts-expect-error track is void and cannot get text
track.getText();

// @ts-expect-error hr is void and cannot append children
hr.appendChild(child);
// @ts-expect-error hr is void and cannot insert children
hr.insertBefore(child, child);
// @ts-expect-error hr is void and cannot remove children
hr.removeChild(child);
// @ts-expect-error hr is void and cannot replace children
hr.replaceChild(child, child);
// @ts-expect-error hr is void and cannot set text
hr.setText("text");
// @ts-expect-error hr is void and cannot get text
hr.getText();

// @ts-expect-error br is void and cannot append children
br.appendChild(child);
// @ts-expect-error br is void and cannot insert children
br.insertBefore(child, child);
// @ts-expect-error br is void and cannot remove children
br.removeChild(child);
// @ts-expect-error br is void and cannot replace children
br.replaceChild(child, child);
// @ts-expect-error br is void and cannot set text
br.setText("text");
// @ts-expect-error br is void and cannot get text
br.getText();

// @ts-expect-error wbr is void and cannot append children
wbr.appendChild(child);
// @ts-expect-error wbr is void and cannot insert children
wbr.insertBefore(child, child);
// @ts-expect-error wbr is void and cannot remove children
wbr.removeChild(child);
// @ts-expect-error wbr is void and cannot replace children
wbr.replaceChild(child, child);
// @ts-expect-error wbr is void and cannot set text
wbr.setText("text");
// @ts-expect-error wbr is void and cannot get text
wbr.getText();

// @ts-expect-error ordered lists never produce description-list wrappers
const wrongOrderedResult: SafeDescriptionListElement =
	safeDocument.createList("ordered");
// @ts-expect-error description lists never produce ordinary list wrappers
const wrongDescriptionResult: SafeListElement =
	safeDocument.createList("description");
declare const commonElement: SafeElement;
// @ts-expect-error common elements do not imply input specialization
const commonAsInput: SafeInputElement = commonElement;
// @ts-expect-error void elements are not containers
const voidAsContainer: SafeContainerElement = br;

// @ts-expect-error invalid heading literal
const invalidHeading: HeadingLevel = 7;
// @ts-expect-error invalid formatting literal
const invalidFormatting: FormattingTag = "script";
// @ts-expect-error invalid list literal
const invalidList: ListType = "menu";
// @ts-expect-error invalid input type literal
const invalidInput: InputType = "file";
// @ts-expect-error invalid button type literal
const invalidButton: ButtonType = "submit";
// @ts-expect-error invalid autocomplete literal
const invalidAutocomplete: AutocompleteValue = "on";
// @ts-expect-error invalid dir literal
const invalidDir: DirValue = "inherit";
// @ts-expect-error invalid input-mode literal
const invalidInputMode: InputModeValue = "latin";
// @ts-expect-error invalid enter-key-hint literal
const invalidEnterKeyHint: EnterKeyHintValue = "accept";
// @ts-expect-error invalid textarea-wrap literal
const invalidTextareaWrap: TextareaWrapValue = "off";
// @ts-expect-error invalid image-loading literal
const invalidImageLoading: ImageLoadingValue = "auto";
// @ts-expect-error invalid table-scope literal
const invalidTableScope: TableScopeValue = "column";
// @ts-expect-error invalid media-track kind literal
const _invalidTrackKind: TrackKind = "karaoke";
// @ts-expect-error invalid single ARIA IDREF name
const invalidAriaIdRef: AriaIdRefName = "labelledby";
// @ts-expect-error invalid list ARIA IDREF name
const invalidAriaIdRefList: AriaIdRefListName = "details";
// @ts-expect-error invalid ARIA role literal
const invalidAriaRole: AriaRole = "window";
// @ts-expect-error invalid specialized kind literal
const invalidSpecializedKind: SpecializedElementKind = "div";

declare const broadString: string;
// @ts-expect-error broad strings are not heading levels
safeDocument.createHeading(broadString);
// @ts-expect-error broad strings are not formatting tags
safeDocument.createFormatting(broadString);
// @ts-expect-error broad strings are not list types
safeDocument.createList(broadString);
// @ts-expect-error broad strings are not specialized kinds
safeDocument.getElement("id", broadString);
// @ts-expect-error broad strings are not input types
input.setType(broadString);
// @ts-expect-error broad strings are not button types
safeDocument.createButton().setType(broadString);
// @ts-expect-error broad strings are not autocomplete values
input.setAutocomplete(broadString);
// @ts-expect-error broad strings are not dir values
child.setDir(broadString);
// @ts-expect-error broad strings are not input-mode values
input.setInputMode(broadString);
// @ts-expect-error broad strings are not enter-key-hint values
input.setEnterKeyHint(broadString);
// @ts-expect-error broad strings are not textarea-wrap values
safeDocument.createTextarea().setWrap(broadString);
// @ts-expect-error broad strings are not image-loading values
image.setLoading(broadString);
// @ts-expect-error broad strings are not table-scope values
safeDocument.createTh().setScope(broadString);
// @ts-expect-error broad strings are not media-track kinds
track.setKind(broadString);
// @ts-expect-error broad strings are not ARIA roles
child.setRole(broadString);

// @ts-expect-error objects cannot cross typed keyword boundaries
safeDocument.createList({});
// @ts-expect-error symbols cannot cross typed keyword boundaries
safeDocument.createList(Symbol("unordered"));
// @ts-expect-error objects cannot be lookup kinds
safeDocument.getElement("id", {});
// @ts-expect-error symbols cannot be lookup kinds
safeDocument.getElement("id", Symbol("input"));
// @ts-expect-error objects cannot be input keyword values
input.setType({});
// @ts-expect-error symbols cannot be input keyword values
input.setType(Symbol("text"));

const removedQuotaOptions: SafeDocumentOptions = {
	harden: (value) => value,
	// @ts-expect-error document quotas are not configurable in the Ark 1.0 API
	quotas: { operations: 1 },
};
const removedRateOptions: SafeDocumentOptions = {
	harden: (value) => value,
	// @ts-expect-error document rates are not configurable in the Ark 1.0 API
	rates: { operations: { limit: 1, windowMs: 1_000 } },
};
void removedQuotaOptions;
void removedRateOptions;
void DEFAULT_SAFE_DOCUMENT_QUOTAS;
void DEFAULT_SAFE_DOCUMENT_RATES;
declare const removedQuotas: SafeDocumentQuotas;
declare const removedRateLimit: SafeDocumentRateLimit;
declare const removedRates: SafeDocumentRates;
void removedQuotas;
void removedRateLimit;
void removedRates;
// @ts-expect-error quota exhaustion is not an Ark 1.0 public error code
const removedQuotaErrorCode: SafeDOMErrorCode = "QUOTA_EXCEEDED";
// @ts-expect-error rate limiting is not an Ark 1.0 public error code
const removedRateErrorCode: SafeDOMErrorCode = "RATE_LIMIT_EXCEEDED";
// @ts-expect-error quota configuration is not an Ark 1.0 public error code
const removedInvalidQuotaErrorCode: SafeDOMErrorCode = "INVALID_QUOTA";
// @ts-expect-error rate configuration is not an Ark 1.0 public error code
const removedInvalidRateErrorCode: SafeDOMErrorCode = "INVALID_RATE";
void removedQuotaErrorCode;
void removedRateErrorCode;
void removedInvalidQuotaErrorCode;
void removedInvalidRateErrorCode;

// @ts-expect-error the explicit form-control grant accepts only literal true
const _disabledFormControlGrant: SafeFormControlPolicy = { allowNonCredentialFormElements: false };

// @ts-expect-error non-primitive grant values are rejected by the public type
const _statefulFormControlGrant: SafeFormControlPolicy = { allowNonCredentialFormElements: new Boolean(true) };

declare const textNode: SafeTextNode;
declare const element: SafeElement;
declare const containerElement: SafeContainerElement;
declare const voidElement: SafeVoidElement;
declare const textarea: SafeTextareaElement;
declare const select: SafeSelectElement;
declare const option: SafeOptionElement;
declare const button: SafeButtonElement;
declare const label: SafeLabelElement;
declare const fieldset: SafeFieldsetElement;
declare const anchor: SafeAnchorElement;
declare const video: SafeVideoElement;
declare const audio: SafeAudioElement;
declare const canvas: SafeCanvasElement;
declare const tableCell: SafeTableCellElement;
declare const details: SafeDetailsElement;
declare const dialog: SafeDialogElement;
declare const progress: SafeProgressElement;
declare const meter: SafeMeterElement;
declare const list: SafeListElement;
declare const descriptionList: SafeDescriptionListElement;
declare const style: SafeStyle;
declare const event: SafeEventBase<"generic">;
declare const urlPolicyEngine: URLPolicyEngine;
declare const stylePolicyEngine: StylePolicyEngine;
declare const documentOptions: SafeDocumentOptions;
declare const formControlPolicy: SafeFormControlPolicy;
declare const replacementDocument: SafeDocument;
declare const replacementTextNode: SafeTextNode;
declare const replacementElement: SafeElement;
declare const replacementContainer: SafeContainerElement;
declare const replacementVoid: SafeVoidElement;
declare const replacementInput: SafeInputElement;
declare const replacementTextarea: SafeTextareaElement;
declare const replacementSelect: SafeSelectElement;
declare const replacementOption: SafeOptionElement;
declare const replacementButton: SafeButtonElement;
declare const replacementLabel: SafeLabelElement;
declare const replacementFieldset: SafeFieldsetElement;
declare const replacementImage: SafeImageElement;
declare const replacementAnchor: SafeAnchorElement;
declare const replacementVideo: SafeVideoElement;
declare const replacementAudio: SafeAudioElement;
declare const replacementSource: SafeSourceElement;
declare const replacementCanvas: SafeCanvasElement;
declare const replacementTableCell: SafeTableCellElement;
declare const replacementDetails: SafeDetailsElement;
declare const replacementDialog: SafeDialogElement;
declare const replacementProgress: SafeProgressElement;
declare const replacementMeter: SafeMeterElement;
declare const replacementList: SafeListElement;
declare const replacementDescriptionList: SafeDescriptionListElement;
declare const replacementStyle: SafeStyle;
declare const replacementEvent: SafeEventBase<"generic">;
declare const replacementURLPolicyEngine: URLPolicyEngine;
declare const replacementStylePolicyEngine: StylePolicyEngine;
declare const replacementDocumentOptions: SafeDocumentOptions;

// @ts-expect-error document functions are readonly
safeDocument.createDiv = replacementDocument.createDiv;
// @ts-expect-error document option function capabilities are readonly
documentOptions.harden = replacementDocumentOptions.harden;
// @ts-expect-error form-control policy fields are readonly
formControlPolicy.allowNonCredentialFormElements = true;
// @ts-expect-error text-node functions are readonly
textNode.setText = replacementTextNode.setText;
// @ts-expect-error common-element functions are readonly
element.setClass = replacementElement.setClass;
// @ts-expect-error container-element functions are readonly
containerElement.appendChild = replacementContainer.appendChild;
// @ts-expect-error void-element functions are readonly
voidElement.setClass = replacementVoid.setClass;
// @ts-expect-error input functions are readonly
input.setType = replacementInput.setType;
// @ts-expect-error textarea functions are readonly
textarea.setValue = replacementTextarea.setValue;
// @ts-expect-error select functions are readonly
select.setValue = replacementSelect.setValue;
// @ts-expect-error option functions are readonly
option.setValue = replacementOption.setValue;
// @ts-expect-error button functions are readonly
button.setType = replacementButton.setType;
// @ts-expect-error label functions are readonly
label.getFor = replacementLabel.getFor;
// @ts-expect-error fieldset functions are readonly
fieldset.setDisabled = replacementFieldset.setDisabled;
// @ts-expect-error image functions are readonly
image.setSrc = replacementImage.setSrc;
// @ts-expect-error anchor functions are readonly
anchor.setHref = replacementAnchor.setHref;
// @ts-expect-error video functions are readonly
video.setSrc = replacementVideo.setSrc;
// @ts-expect-error audio functions are readonly
audio.setSrc = replacementAudio.setSrc;
// @ts-expect-error source functions are readonly
source.setSrc = replacementSource.setSrc;
// @ts-expect-error canvas functions are readonly
canvas.setWidth = replacementCanvas.setWidth;
// @ts-expect-error table-cell namespace getters are readonly
tableCell.getHeaders = replacementTableCell.getHeaders;
// @ts-expect-error details functions are readonly
details.setOpen = replacementDetails.setOpen;
// @ts-expect-error dialog functions are readonly
dialog.setOpen = replacementDialog.setOpen;
// @ts-expect-error progress functions are readonly
progress.setValue = replacementProgress.setValue;
// @ts-expect-error meter functions are readonly
meter.setValue = replacementMeter.setValue;
// @ts-expect-error list functions are readonly
list.createItem = replacementList.createItem;
// @ts-expect-error description-list functions are readonly
descriptionList.createTerm = replacementDescriptionList.createTerm;
// @ts-expect-error style functions are readonly
style.set = replacementStyle.set;
// @ts-expect-error event cancellation functions are readonly
event.preventDefault = replacementEvent.preventDefault;
// @ts-expect-error URL policy functions are readonly
urlPolicyEngine.decide = replacementURLPolicyEngine.decide;
// @ts-expect-error style-policy functions are readonly
stylePolicyEngine.allows = replacementStylePolicyEngine.allows;
// @ts-expect-error nested style capability is readonly
element.style = replacementStyle;

declare const mouseEvent: SafeMouseEvent;
declare const touchEvent: SafeTouchEvent;
declare const touchSnapshot: SafeTouchSnapshot;
declare const replacementMouseEvent: SafeMouseEvent;
declare const replacementTouchEvent: SafeTouchEvent;
declare const replacementTouchSnapshot: SafeTouchSnapshot;
// @ts-expect-error event snapshot fields are readonly
mouseEvent.clientX = replacementMouseEvent.clientX;
// @ts-expect-error target snapshot fields are readonly
mouseEvent.target.id = replacementMouseEvent.target.id;
// @ts-expect-error touch array properties are readonly
touchEvent.touches = replacementTouchEvent.touches;
// @ts-expect-error touch arrays cannot be mutated
touchEvent.touches.push(touchSnapshot);
// @ts-expect-error touch snapshot fields are readonly
touchSnapshot.identifier = replacementTouchSnapshot.identifier;

void text;
void wrongOrderedResult;
void wrongDescriptionResult;
void commonAsInput;
void voidAsContainer;
void invalidHeading;
void invalidFormatting;
void invalidList;
void invalidInput;
void invalidButton;
void invalidAutocomplete;
void invalidDir;
void invalidInputMode;
void invalidEnterKeyHint;
void invalidTextareaWrap;
void invalidImageLoading;
void invalidTableScope;
void invalidAriaIdRef;
void invalidAriaIdRefList;
void invalidAriaRole;
void invalidSpecializedKind;
