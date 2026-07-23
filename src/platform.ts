import { createSafeDOMError } from "./errors.ts";

type PlatformMethod = (...arguments_: never[]) => unknown;

function captureMethod<Method extends PlatformMethod>(
  prototype: object,
  property: PropertyKey,
  operation: string,
): Method {
  try {
    let current: object | null = prototype;
    while (current !== null) {
      const descriptor = Object.getOwnPropertyDescriptor(current, property);
      if (descriptor !== undefined) {
        if (typeof descriptor.value === "function") return descriptor.value;
        break;
      }
      current = Object.getPrototypeOf(current);
    }
  } catch {
    // The thrown platform value is deliberately discarded below.
  }
  throw createSafeDOMError("DOM_OPERATION_FAILED", operation);
}

function captureCallableProperty<Method extends PlatformMethod>(
  receiver: object,
  property: PropertyKey,
  operation: string,
): Method {
  try {
    let current: object | null = receiver;
    while (current !== null) {
      const descriptor = Object.getOwnPropertyDescriptor(current, property);
      if (descriptor !== undefined) {
        if (typeof descriptor.value === "function") return descriptor.value;
        if (typeof descriptor.get === "function") {
          const value: unknown = Reflect.apply(descriptor.get, receiver, []);
          if (typeof value === "function") return value as Method;
        }
        break;
      }
      current = Object.getPrototypeOf(current);
    }
  } catch {
    // The thrown platform value is deliberately discarded below.
  }
  throw createSafeDOMError("DOM_OPERATION_FAILED", operation);
}

function captureAccessor<Accessor extends PlatformMethod>(
  prototype: object,
  property: PropertyKey,
  kind: "get" | "set",
  operation: string,
): Accessor {
  try {
    let current: object | null = prototype;
    while (current !== null) {
      const descriptor = Object.getOwnPropertyDescriptor(current, property);
      if (descriptor !== undefined) {
        const accessor = descriptor[kind];
        // This is the single typed boundary from a validated WebIDL descriptor
        // into its exact captured accessor signature.
        if (typeof accessor === "function") return accessor as Accessor;
        break;
      }
      current = Object.getPrototypeOf(current);
    }
  } catch {
    // The thrown platform value is deliberately discarded below.
  }
  throw createSafeDOMError("DOM_OPERATION_FAILED", operation);
}

type OwnerDocumentGetter = (this: Node) => Document | null;
type ParentNodeGetter = (this: Node) => ParentNode | null;
type TextContentGetter = (this: Node) => string | null;
type TextContentSetter = (this: Node, value: string | null) => void;
type AbortSignalGetter = (this: AbortController) => AbortSignal;
type StringGetter<ElementType extends Element> = (this: ElementType) => string;
type StringSetter<ElementType extends Element> = (this: ElementType, value: string) => void;
type BooleanGetter<ElementType extends Element> = (this: ElementType) => boolean;
type BooleanSetter<ElementType extends Element> = (this: ElementType, value: boolean) => void;
type NumberGetter<ElementType extends Element> = (this: ElementType) => number;
type NumberSetter<ElementType extends Element> = (this: ElementType, value: number) => void;
type CryptoGetter = (this: Window) => Crypto;
type GetRandomValues = (this: Crypto, array: Uint8Array) => Uint8Array;
type ShadowHostGetter = (this: ShadowRoot) => Element;

const EFFECTIVE_PAINT_CONTAINMENT_DISPLAYS: ReadonlySet<string> = new Set([
  "block",
  "flow-root",
  "flex",
  "grid",
  "inline-block",
  "inline-flex",
  "inline-grid",
  "inline-table",
  "list-item",
  "table",
  "table-cell",
]);

function hasEffectivePaintContainment(containment: string, display: string): boolean {
  // Paint containment is ineffective for absent principal boxes, non-atomic
  // inline boxes, internal ruby boxes, and internal table boxes other than
  // cells. Fail closed for every unknown display serialization as well.
  if (!EFFECTIVE_PAINT_CONTAINMENT_DISPLAYS.has(display)) return false;
  if (containment === "paint" || containment === "content" || containment === "strict") {
    return true;
  }
  return containment.split(/[\t\n\f\r ]+/u).includes("paint");
}

export interface InputMutationPreview {
  readonly value: string;
  readonly valueAttribute: string | null;
}

function prototypeOwns(prototype: object, value: object): boolean {
  try {
    return Reflect.apply(Object.prototype.isPrototypeOf, prototype, [value]);
  } catch {
    throw createSafeDOMError("DOM_OPERATION_FAILED", "Element.brand");
  }
}

export interface PlatformOps {
  readonly URL: typeof URL;
  assertPaintContainedRoot(root: ShadowRoot): void;
  randomHex(byteLength: number): string;
  createElement(tag: string): HTMLElement;
  createTextNode(value: string): Text;
  appendChild(parent: Node, child: Node, operation?: string): void;
  insertBefore(parent: Node, child: Node, reference: Node, operation?: string): void;
  removeChild(parent: Node, child: Node, operation?: string): void;
  replaceChild(parent: Node, child: Node, replaced: Node, operation?: string): void;
  detach(node: Node): void;
  ownerDocument(node: Node): Document | null;
  parentNode(node: Node): ParentNode | null;
  getTextContent(node: Node): string | null;
  setTextContent(node: Node, value: string): void;
  getAttribute(element: Element, name: string): string | null;
  setAttribute(element: Element, name: string, value: string): void;
  removeAttribute(element: Element, name: string): void;
  getElementById(root: ShadowRoot, id: string): Element | null;
  isElement(node: Node): node is Element;
  createAbortController(): AbortController;
  getAbortSignal(controller: AbortController): AbortSignal;
  addEventListener(
    target: EventTarget,
    eventName: string,
    listener: EventListener,
    signal: AbortSignal,
  ): void;
  stopEventPropagation(event: Event): void;
  abort(controller: AbortController): void;
  setTabIndex(element: HTMLElement, value: number): void;
  getInputValue(element: HTMLInputElement): string;
  setInputValue(element: HTMLInputElement, value: string): void;
  previewInputValue(element: HTMLInputElement, value: string): InputMutationPreview;
  getInputType(element: HTMLInputElement): string;
  setInputType(element: HTMLInputElement, value: string): void;
  previewInputType(element: HTMLInputElement, value: string): InputMutationPreview;
  getInputChecked(element: HTMLInputElement): boolean;
  setInputChecked(element: HTMLInputElement, value: boolean): void;
  getInputMinLength(element: HTMLInputElement): number;
  setInputMinLength(element: HTMLInputElement, value: number): void;
  getInputMaxLength(element: HTMLInputElement): number;
  setInputMaxLength(element: HTMLInputElement, value: number): void;
  isInputPatternValid(value: string): boolean;
  getTextareaValue(element: HTMLTextAreaElement): string;
  setTextareaValue(element: HTMLTextAreaElement, value: string): void;
  getTextareaMinLength(element: HTMLTextAreaElement): number;
  setTextareaMinLength(element: HTMLTextAreaElement, value: number): void;
  getTextareaMaxLength(element: HTMLTextAreaElement): number;
  setTextareaMaxLength(element: HTMLTextAreaElement, value: number): void;
  setTextareaRows(element: HTMLTextAreaElement, value: number): void;
  setTextareaCols(element: HTMLTextAreaElement, value: number): void;
  getSelectValue(element: HTMLSelectElement): string;
  setSelectValue(element: HTMLSelectElement, value: string): void;
  getOptionSelected(element: HTMLOptionElement): boolean;
  setOptionSelected(element: HTMLOptionElement, value: boolean): void;
  setButtonType(element: HTMLButtonElement, value: string): void;
  setImageWidth(element: HTMLImageElement, value: number): void;
  setImageHeight(element: HTMLImageElement, value: number): void;
  setVideoWidth(element: HTMLVideoElement, value: number): void;
  setVideoHeight(element: HTMLVideoElement, value: number): void;
  setMediaControls(element: HTMLMediaElement, value: boolean): void;
  setMediaAutoplay(element: HTMLMediaElement, value: boolean): void;
  setMediaLoop(element: HTMLMediaElement, value: boolean): void;
  getMediaMuted(element: HTMLMediaElement): boolean;
  setMediaMuted(element: HTMLMediaElement, value: boolean): void;
  getCanvasWidth(element: HTMLCanvasElement): number;
  setCanvasWidth(element: HTMLCanvasElement, value: number): void;
  getCanvasHeight(element: HTMLCanvasElement): number;
  setCanvasHeight(element: HTMLCanvasElement, value: number): void;
  setTableColSpan(element: HTMLTableCellElement, value: number): void;
  setTableRowSpan(element: HTMLTableCellElement, value: number): void;
  setDetailsOpen(element: HTMLDetailsElement, value: boolean): void;
  setDialogOpen(element: HTMLDialogElement, value: boolean): void;
  getProgressValue(element: HTMLProgressElement): number;
  setProgressValue(element: HTMLProgressElement, value: number): void;
  getProgressMax(element: HTMLProgressElement): number;
  setProgressMax(element: HTMLProgressElement, value: number): void;
  getMeterValue(element: HTMLMeterElement): number;
  setMeterValue(element: HTMLMeterElement, value: number): void;
  getMeterMin(element: HTMLMeterElement): number;
  setMeterMin(element: HTMLMeterElement, value: number): void;
  getMeterMax(element: HTMLMeterElement): number;
  setMeterMax(element: HTMLMeterElement, value: number): void;
}

class OwnerRealmPlatformOps implements PlatformOps {
  readonly URL: typeof URL;
  readonly #ownerDocument: Document;
  readonly #view: Window & typeof globalThis;
  readonly #shadowHostGetter: ShadowHostGetter;
  readonly #getComputedStyle: Window["getComputedStyle"];
  readonly #getStylePropertyValue: CSSStyleDeclaration["getPropertyValue"];
  readonly #crypto: Crypto;
  readonly #getRandomValues: GetRandomValues;
  readonly #Uint8Array: typeof Uint8Array;
  readonly #elementPrototype: object;
  readonly #createElement: (qualifiedName: string) => HTMLElement;
  readonly #createTextNode: Document["createTextNode"];
  readonly #appendChild: Node["appendChild"];
  readonly #insertBefore: Node["insertBefore"];
  readonly #removeChild: Node["removeChild"];
  readonly #replaceChild: Node["replaceChild"];
  readonly #ownerDocumentGetter: OwnerDocumentGetter;
  readonly #parentNodeGetter: ParentNodeGetter;
  readonly #textContentGetter: TextContentGetter;
  readonly #textContentSetter: TextContentSetter;
  readonly #getAttribute: Element["getAttribute"];
  readonly #setAttribute: Element["setAttribute"];
  readonly #removeAttribute: Element["removeAttribute"];
  readonly #getElementById: ShadowRoot["getElementById"];
  readonly #AbortController: typeof AbortController;
  readonly #abortSignalGetter: AbortSignalGetter;
  readonly #addEventListener: EventTarget["addEventListener"];
  readonly #stopEventPropagation: Event["stopPropagation"];
  readonly #abort: AbortController["abort"];
  readonly #tabIndexSetter: NumberSetter<HTMLElement>;
  readonly #inputValueGetter: StringGetter<HTMLInputElement>;
  readonly #inputValueSetter: StringSetter<HTMLInputElement>;
  readonly #inputTypeGetter: StringGetter<HTMLInputElement>;
  readonly #inputTypeSetter: StringSetter<HTMLInputElement>;
  readonly #inputCheckedGetter: BooleanGetter<HTMLInputElement>;
  readonly #inputCheckedSetter: BooleanSetter<HTMLInputElement>;
  readonly #inputMinLengthGetter: NumberGetter<HTMLInputElement>;
  readonly #inputMinLengthSetter: NumberSetter<HTMLInputElement>;
  readonly #inputMaxLengthGetter: NumberGetter<HTMLInputElement>;
  readonly #inputMaxLengthSetter: NumberSetter<HTMLInputElement>;
  readonly #RegExp: typeof RegExp;
  readonly #textareaValueGetter: StringGetter<HTMLTextAreaElement>;
  readonly #textareaValueSetter: StringSetter<HTMLTextAreaElement>;
  readonly #textareaMinLengthGetter: NumberGetter<HTMLTextAreaElement>;
  readonly #textareaMinLengthSetter: NumberSetter<HTMLTextAreaElement>;
  readonly #textareaMaxLengthGetter: NumberGetter<HTMLTextAreaElement>;
  readonly #textareaMaxLengthSetter: NumberSetter<HTMLTextAreaElement>;
  readonly #textareaRowsSetter: NumberSetter<HTMLTextAreaElement>;
  readonly #textareaColsSetter: NumberSetter<HTMLTextAreaElement>;
  readonly #selectValueGetter: StringGetter<HTMLSelectElement>;
  readonly #selectValueSetter: StringSetter<HTMLSelectElement>;
  readonly #optionSelectedGetter: BooleanGetter<HTMLOptionElement>;
  readonly #optionSelectedSetter: BooleanSetter<HTMLOptionElement>;
  readonly #buttonTypeSetter: StringSetter<HTMLButtonElement>;
  readonly #imageWidthSetter: NumberSetter<HTMLImageElement>;
  readonly #imageHeightSetter: NumberSetter<HTMLImageElement>;
  readonly #videoWidthSetter: NumberSetter<HTMLVideoElement>;
  readonly #videoHeightSetter: NumberSetter<HTMLVideoElement>;
  readonly #mediaControlsSetter: BooleanSetter<HTMLMediaElement>;
  readonly #mediaAutoplaySetter: BooleanSetter<HTMLMediaElement>;
  readonly #mediaLoopSetter: BooleanSetter<HTMLMediaElement>;
  readonly #mediaMutedGetter: BooleanGetter<HTMLMediaElement>;
  readonly #mediaMutedSetter: BooleanSetter<HTMLMediaElement>;
  readonly #canvasWidthGetter: NumberGetter<HTMLCanvasElement>;
  readonly #canvasWidthSetter: NumberSetter<HTMLCanvasElement>;
  readonly #canvasHeightGetter: NumberGetter<HTMLCanvasElement>;
  readonly #canvasHeightSetter: NumberSetter<HTMLCanvasElement>;
  readonly #tableColSpanSetter: NumberSetter<HTMLTableCellElement>;
  readonly #tableRowSpanSetter: NumberSetter<HTMLTableCellElement>;
  readonly #detailsOpenSetter: BooleanSetter<HTMLDetailsElement>;
  readonly #dialogOpenSetter: BooleanSetter<HTMLDialogElement>;
  readonly #progressValueGetter: NumberGetter<HTMLProgressElement>;
  readonly #progressValueSetter: NumberSetter<HTMLProgressElement>;
  readonly #progressMaxGetter: NumberGetter<HTMLProgressElement>;
  readonly #progressMaxSetter: NumberSetter<HTMLProgressElement>;
  readonly #meterValueGetter: NumberGetter<HTMLMeterElement>;
  readonly #meterValueSetter: NumberSetter<HTMLMeterElement>;
  readonly #meterMinGetter: NumberGetter<HTMLMeterElement>;
  readonly #meterMinSetter: NumberSetter<HTMLMeterElement>;
  readonly #meterMaxGetter: NumberGetter<HTMLMeterElement>;
  readonly #meterMaxSetter: NumberSetter<HTMLMeterElement>;

  constructor(ownerDocument: Document, view: Window & typeof globalThis) {
    this.#ownerDocument = ownerDocument;
    this.#view = view;
    this.URL = view.URL;
    this.#shadowHostGetter = captureAccessor(
      view.ShadowRoot.prototype,
      "host",
      "get",
      "ShadowRoot.host.capture",
    );
    this.#getComputedStyle = captureCallableProperty(
      view,
      "getComputedStyle",
      "Window.getComputedStyle.capture",
    );
    this.#getStylePropertyValue = captureMethod(
      view.CSSStyleDeclaration.prototype,
      "getPropertyValue",
      "CSSStyleDeclaration.getPropertyValue.capture",
    );
    const cryptoGetter = captureAccessor<CryptoGetter>(
      view,
      "crypto",
      "get",
      "Window.crypto.capture",
    );
    this.#crypto = Reflect.apply(cryptoGetter, view, []);
    this.#getRandomValues = captureMethod<GetRandomValues>(
      Object.getPrototypeOf(this.#crypto),
      "getRandomValues",
      "Crypto.getRandomValues.capture",
    );
    this.#Uint8Array = view.Uint8Array;
    const nodePrototype = view.Node.prototype;
    const elementPrototype = view.Element.prototype;
    this.#elementPrototype = elementPrototype;
    this.#createElement = captureMethod(
      view.Document.prototype,
      "createElement",
      "Document.createElement.capture",
    );
    this.#createTextNode = captureMethod(
      view.Document.prototype,
      "createTextNode",
      "Document.createTextNode.capture",
    );
    this.#appendChild = captureMethod(nodePrototype, "appendChild", "Node.appendChild.capture");
    this.#insertBefore = captureMethod(nodePrototype, "insertBefore", "Node.insertBefore.capture");
    this.#removeChild = captureMethod(nodePrototype, "removeChild", "Node.removeChild.capture");
    this.#replaceChild = captureMethod(nodePrototype, "replaceChild", "Node.replaceChild.capture");
    this.#ownerDocumentGetter = captureAccessor(
      nodePrototype,
      "ownerDocument",
      "get",
      "Node.ownerDocument.capture",
    );
    this.#parentNodeGetter = captureAccessor(
      nodePrototype,
      "parentNode",
      "get",
      "Node.parentNode.capture",
    );
    this.#textContentGetter = captureAccessor(
      nodePrototype,
      "textContent",
      "get",
      "Node.textContent.get.capture",
    );
    this.#textContentSetter = captureAccessor(
      nodePrototype,
      "textContent",
      "set",
      "Node.textContent.set.capture",
    );
    this.#getAttribute = captureMethod(elementPrototype, "getAttribute", "Element.getAttribute.capture");
    this.#setAttribute = captureMethod(elementPrototype, "setAttribute", "Element.setAttribute.capture");
    this.#removeAttribute = captureMethod(
      elementPrototype,
      "removeAttribute",
      "Element.removeAttribute.capture",
    );
    this.#getElementById = captureMethod(
      view.ShadowRoot.prototype,
      "getElementById",
      "ShadowRoot.getElementById.capture",
    );
    this.#AbortController = view.AbortController;
    this.#abortSignalGetter = captureAccessor(
      view.AbortController.prototype,
      "signal",
      "get",
      "AbortController.signal.capture",
    );
    this.#addEventListener = captureMethod(
      view.EventTarget.prototype,
      "addEventListener",
      "EventTarget.addEventListener.capture",
    );
    this.#stopEventPropagation = captureMethod(
      view.Event.prototype,
      "stopPropagation",
      "Event.stopPropagation.capture",
    );
    this.#abort = captureMethod(
      view.AbortController.prototype,
      "abort",
      "AbortController.abort.capture",
    );
    this.#tabIndexSetter = captureAccessor(
      view.HTMLElement.prototype,
      "tabIndex",
      "set",
      "HTMLElement.tabIndex.set.capture",
    );

    const inputPrototype = view.HTMLInputElement.prototype;
    this.#inputValueGetter = captureAccessor(inputPrototype, "value", "get", "HTMLInputElement.value.get.capture");
    this.#inputValueSetter = captureAccessor(inputPrototype, "value", "set", "HTMLInputElement.value.set.capture");
    this.#inputTypeGetter = captureAccessor(inputPrototype, "type", "get", "HTMLInputElement.type.get.capture");
    this.#inputTypeSetter = captureAccessor(inputPrototype, "type", "set", "HTMLInputElement.type.set.capture");
    this.#inputCheckedGetter = captureAccessor(inputPrototype, "checked", "get", "HTMLInputElement.checked.get.capture");
    this.#inputCheckedSetter = captureAccessor(inputPrototype, "checked", "set", "HTMLInputElement.checked.set.capture");
    this.#inputMinLengthGetter = captureAccessor(inputPrototype, "minLength", "get", "HTMLInputElement.minLength.get.capture");
    this.#inputMinLengthSetter = captureAccessor(inputPrototype, "minLength", "set", "HTMLInputElement.minLength.set.capture");
    this.#inputMaxLengthGetter = captureAccessor(inputPrototype, "maxLength", "get", "HTMLInputElement.maxLength.get.capture");
    this.#inputMaxLengthSetter = captureAccessor(inputPrototype, "maxLength", "set", "HTMLInputElement.maxLength.set.capture");
    this.#RegExp = view.RegExp;

    const textareaPrototype = view.HTMLTextAreaElement.prototype;
    this.#textareaValueGetter = captureAccessor(textareaPrototype, "value", "get", "HTMLTextAreaElement.value.get.capture");
    this.#textareaValueSetter = captureAccessor(textareaPrototype, "value", "set", "HTMLTextAreaElement.value.set.capture");
    this.#textareaMinLengthGetter = captureAccessor(textareaPrototype, "minLength", "get", "HTMLTextAreaElement.minLength.get.capture");
    this.#textareaMinLengthSetter = captureAccessor(textareaPrototype, "minLength", "set", "HTMLTextAreaElement.minLength.set.capture");
    this.#textareaMaxLengthGetter = captureAccessor(textareaPrototype, "maxLength", "get", "HTMLTextAreaElement.maxLength.get.capture");
    this.#textareaMaxLengthSetter = captureAccessor(textareaPrototype, "maxLength", "set", "HTMLTextAreaElement.maxLength.set.capture");
    this.#textareaRowsSetter = captureAccessor(textareaPrototype, "rows", "set", "HTMLTextAreaElement.rows.set.capture");
    this.#textareaColsSetter = captureAccessor(textareaPrototype, "cols", "set", "HTMLTextAreaElement.cols.set.capture");

    const selectPrototype = view.HTMLSelectElement.prototype;
    this.#selectValueGetter = captureAccessor(selectPrototype, "value", "get", "HTMLSelectElement.value.get.capture");
    this.#selectValueSetter = captureAccessor(selectPrototype, "value", "set", "HTMLSelectElement.value.set.capture");
    const optionPrototype = view.HTMLOptionElement.prototype;
    this.#optionSelectedGetter = captureAccessor(
      optionPrototype,
      "selected",
      "get",
      "HTMLOptionElement.selected.get.capture",
    );
    this.#optionSelectedSetter = captureAccessor(
      optionPrototype,
      "selected",
      "set",
      "HTMLOptionElement.selected.set.capture",
    );
    this.#buttonTypeSetter = captureAccessor(
      view.HTMLButtonElement.prototype,
      "type",
      "set",
      "HTMLButtonElement.type.set.capture",
    );
    const imagePrototype = view.HTMLImageElement.prototype;
    this.#imageWidthSetter = captureAccessor(imagePrototype, "width", "set", "HTMLImageElement.width.set.capture");
    this.#imageHeightSetter = captureAccessor(imagePrototype, "height", "set", "HTMLImageElement.height.set.capture");

    const videoPrototype = view.HTMLVideoElement.prototype;
    this.#videoWidthSetter = captureAccessor(videoPrototype, "width", "set", "HTMLVideoElement.width.set.capture");
    this.#videoHeightSetter = captureAccessor(videoPrototype, "height", "set", "HTMLVideoElement.height.set.capture");

    const mediaPrototype = view.HTMLMediaElement.prototype;
    this.#mediaControlsSetter = captureAccessor(mediaPrototype, "controls", "set", "HTMLMediaElement.controls.set.capture");
    this.#mediaAutoplaySetter = captureAccessor(mediaPrototype, "autoplay", "set", "HTMLMediaElement.autoplay.set.capture");
    this.#mediaLoopSetter = captureAccessor(mediaPrototype, "loop", "set", "HTMLMediaElement.loop.set.capture");
    this.#mediaMutedGetter = captureAccessor(mediaPrototype, "muted", "get", "HTMLMediaElement.muted.get.capture");
    this.#mediaMutedSetter = captureAccessor(mediaPrototype, "muted", "set", "HTMLMediaElement.muted.set.capture");

    const canvasPrototype = view.HTMLCanvasElement.prototype;
    this.#canvasWidthGetter = captureAccessor(canvasPrototype, "width", "get", "HTMLCanvasElement.width.get.capture");
    this.#canvasWidthSetter = captureAccessor(canvasPrototype, "width", "set", "HTMLCanvasElement.width.set.capture");
    this.#canvasHeightGetter = captureAccessor(canvasPrototype, "height", "get", "HTMLCanvasElement.height.get.capture");
    this.#canvasHeightSetter = captureAccessor(canvasPrototype, "height", "set", "HTMLCanvasElement.height.set.capture");

    const tableCellPrototype = view.HTMLTableCellElement.prototype;
    this.#tableColSpanSetter = captureAccessor(tableCellPrototype, "colSpan", "set", "HTMLTableCellElement.colSpan.set.capture");
    this.#tableRowSpanSetter = captureAccessor(tableCellPrototype, "rowSpan", "set", "HTMLTableCellElement.rowSpan.set.capture");
    this.#detailsOpenSetter = captureAccessor(view.HTMLDetailsElement.prototype, "open", "set", "HTMLDetailsElement.open.set.capture");
    this.#dialogOpenSetter = captureAccessor(view.HTMLDialogElement.prototype, "open", "set", "HTMLDialogElement.open.set.capture");

    const progressPrototype = view.HTMLProgressElement.prototype;
    this.#progressValueGetter = captureAccessor(progressPrototype, "value", "get", "HTMLProgressElement.value.get.capture");
    this.#progressValueSetter = captureAccessor(progressPrototype, "value", "set", "HTMLProgressElement.value.set.capture");
    this.#progressMaxGetter = captureAccessor(progressPrototype, "max", "get", "HTMLProgressElement.max.get.capture");
    this.#progressMaxSetter = captureAccessor(progressPrototype, "max", "set", "HTMLProgressElement.max.set.capture");

    const meterPrototype = view.HTMLMeterElement.prototype;
    this.#meterValueGetter = captureAccessor(meterPrototype, "value", "get", "HTMLMeterElement.value.get.capture");
    this.#meterValueSetter = captureAccessor(meterPrototype, "value", "set", "HTMLMeterElement.value.set.capture");
    this.#meterMinGetter = captureAccessor(meterPrototype, "min", "get", "HTMLMeterElement.min.get.capture");
    this.#meterMinSetter = captureAccessor(meterPrototype, "min", "set", "HTMLMeterElement.min.set.capture");
    this.#meterMaxGetter = captureAccessor(meterPrototype, "max", "get", "HTMLMeterElement.max.get.capture");
    this.#meterMaxSetter = captureAccessor(meterPrototype, "max", "set", "HTMLMeterElement.max.set.capture");
  }

  assertPaintContainedRoot(root: ShadowRoot): void {
    const host = this.#invoke("ShadowRoot.host", this.#shadowHostGetter, root, []);
    const computed = this.#invoke(
      "Window.getComputedStyle",
      this.#getComputedStyle,
      this.#view,
      [host],
    );
    const containment = this.#invoke(
      "CSSStyleDeclaration.getPropertyValue.contain",
      this.#getStylePropertyValue,
      computed,
      ["contain"],
    );
    const display = this.#invoke(
      "CSSStyleDeclaration.getPropertyValue.display",
      this.#getStylePropertyValue,
      computed,
      ["display"],
    );
    if (!hasEffectivePaintContainment(containment, display)) {
      throw createSafeDOMError("INVALID_ROOT", "createSafeDocument.root.containment");
    }
  }

  createElement(tag: string): HTMLElement {
    return this.#invoke("Document.createElement", this.#createElement, this.#ownerDocument, [tag]);
  }

  randomHex(byteLength: number): string {
    let bytes: Uint8Array;
    try {
      bytes = new this.#Uint8Array(byteLength);
    } catch {
      throw createSafeDOMError("DOM_OPERATION_FAILED", "Uint8Array.constructor");
    }
    this.#invoke("Crypto.getRandomValues", this.#getRandomValues, this.#crypto, [bytes]);
    try {
      const alphabet = "0123456789abcdef";
      let result = "";
      for (let index = 0; index < byteLength; index += 1) {
        const byte = bytes[index] ?? 0;
        result += alphabet[byte >>> 4] ?? "";
        result += alphabet[byte & 0x0f] ?? "";
      }
      return result;
    } catch {
      throw createSafeDOMError("DOM_OPERATION_FAILED", "PlatformOps.randomHex");
    }
  }

  createTextNode(value: string): Text {
    return this.#invoke(
      "Document.createTextNode",
      this.#createTextNode,
      this.#ownerDocument,
      [value],
    );
  }

  appendChild(parent: Node, child: Node, operation = "Node.appendChild"): void {
    this.#invoke(operation, this.#appendChild, parent, [child]);
  }

  insertBefore(
    parent: Node,
    child: Node,
    reference: Node,
    operation = "Node.insertBefore",
  ): void {
    this.#invoke(operation, this.#insertBefore, parent, [child, reference]);
  }

  removeChild(parent: Node, child: Node, operation = "Node.removeChild"): void {
    this.#invoke(operation, this.#removeChild, parent, [child]);
  }

  replaceChild(
    parent: Node,
    child: Node,
    replaced: Node,
    operation = "Node.replaceChild",
  ): void {
    this.#invoke(operation, this.#replaceChild, parent, [child, replaced]);
  }

  detach(node: Node): void {
    const parent = this.parentNode(node);
    if (parent !== null) this.removeChild(parent, node, "Node.remove");
  }

  ownerDocument(node: Node): Document | null {
    return this.#invoke("Node.ownerDocument", this.#ownerDocumentGetter, node, []);
  }

  parentNode(node: Node): ParentNode | null {
    return this.#invoke("Node.parentNode", this.#parentNodeGetter, node, []);
  }

  getTextContent(node: Node): string | null {
    return this.#invoke("Node.textContent.get", this.#textContentGetter, node, []);
  }

  setTextContent(node: Node, value: string): void {
    this.#invoke("Node.textContent.set", this.#textContentSetter, node, [value]);
  }

  getAttribute(element: Element, name: string): string | null {
    return this.#invoke("Element.getAttribute", this.#getAttribute, element, [name]);
  }

  setAttribute(element: Element, name: string, value: string): void {
    this.#invoke("Element.setAttribute", this.#setAttribute, element, [name, value]);
  }

  removeAttribute(element: Element, name: string): void {
    this.#invoke("Element.removeAttribute", this.#removeAttribute, element, [name]);
  }

  getElementById(root: ShadowRoot, id: string): Element | null {
    return this.#invoke("ShadowRoot.getElementById", this.#getElementById, root, [id]);
  }

  isElement(node: Node): node is Element {
    return prototypeOwns(this.#elementPrototype, node);
  }

  createAbortController(): AbortController {
    try {
      return new this.#AbortController();
    } catch {
      throw createSafeDOMError("DOM_OPERATION_FAILED", "AbortController.constructor");
    }
  }

  getAbortSignal(controller: AbortController): AbortSignal {
    return this.#invoke("AbortController.signal", this.#abortSignalGetter, controller, []);
  }

  addEventListener(
    target: EventTarget,
    eventName: string,
    listener: EventListener,
    signal: AbortSignal,
  ): void {
    this.#invoke(
      "EventTarget.addEventListener",
      this.#addEventListener,
      target,
      [eventName, listener, { signal }],
    );
  }

  stopEventPropagation(event: Event): void {
    this.#invoke("Event.stopPropagation", this.#stopEventPropagation, event, []);
  }

  abort(controller: AbortController): void {
    this.#invoke("AbortController.abort", this.#abort, controller, []);
  }

  setTabIndex(element: HTMLElement, value: number): void {
    this.#invoke("HTMLElement.tabIndex.set", this.#tabIndexSetter, element, [value]);
  }

  getInputValue(element: HTMLInputElement): string {
    return this.#invoke("HTMLInputElement.value.get", this.#inputValueGetter, element, []);
  }

  setInputValue(element: HTMLInputElement, value: string): void {
    this.#invoke("HTMLInputElement.value.set", this.#inputValueSetter, element, [value]);
  }

  previewInputValue(element: HTMLInputElement, value: string): InputMutationPreview {
    const scratch = this.#copyInputState(element);
    this.setInputValue(scratch, value);
    return this.#snapshotInputMutation(scratch);
  }

  getInputType(element: HTMLInputElement): string {
    return this.#invoke("HTMLInputElement.type.get", this.#inputTypeGetter, element, []);
  }

  setInputType(element: HTMLInputElement, value: string): void {
    this.#invoke("HTMLInputElement.type.set", this.#inputTypeSetter, element, [value]);
  }

  previewInputType(element: HTMLInputElement, value: string): InputMutationPreview {
    const scratch = this.#copyInputState(element);
    this.setInputType(scratch, value);
    return this.#snapshotInputMutation(scratch);
  }

  getInputChecked(element: HTMLInputElement): boolean {
    return this.#invoke("HTMLInputElement.checked.get", this.#inputCheckedGetter, element, []);
  }

  setInputChecked(element: HTMLInputElement, value: boolean): void {
    this.#invoke("HTMLInputElement.checked.set", this.#inputCheckedSetter, element, [value]);
  }

  getInputMinLength(element: HTMLInputElement): number {
    return this.#invoke("HTMLInputElement.minLength.get", this.#inputMinLengthGetter, element, []);
  }

  setInputMinLength(element: HTMLInputElement, value: number): void {
    this.#invoke("HTMLInputElement.minLength.set", this.#inputMinLengthSetter, element, [value]);
  }

  getInputMaxLength(element: HTMLInputElement): number {
    return this.#invoke("HTMLInputElement.maxLength.get", this.#inputMaxLengthGetter, element, []);
  }

  setInputMaxLength(element: HTMLInputElement, value: number): void {
    this.#invoke("HTMLInputElement.maxLength.set", this.#inputMaxLengthSetter, element, [value]);
  }

  isInputPatternValid(value: string): boolean {
    try {
      new this.#RegExp(value, "v");
      return true;
    } catch {
      return false;
    }
  }

  getTextareaValue(element: HTMLTextAreaElement): string {
    return this.#invoke("HTMLTextAreaElement.value.get", this.#textareaValueGetter, element, []);
  }

  setTextareaValue(element: HTMLTextAreaElement, value: string): void {
    this.#invoke("HTMLTextAreaElement.value.set", this.#textareaValueSetter, element, [value]);
  }

  getTextareaMinLength(element: HTMLTextAreaElement): number {
    return this.#invoke("HTMLTextAreaElement.minLength.get", this.#textareaMinLengthGetter, element, []);
  }

  setTextareaMinLength(element: HTMLTextAreaElement, value: number): void {
    this.#invoke("HTMLTextAreaElement.minLength.set", this.#textareaMinLengthSetter, element, [value]);
  }

  getTextareaMaxLength(element: HTMLTextAreaElement): number {
    return this.#invoke("HTMLTextAreaElement.maxLength.get", this.#textareaMaxLengthGetter, element, []);
  }

  setTextareaMaxLength(element: HTMLTextAreaElement, value: number): void {
    this.#invoke("HTMLTextAreaElement.maxLength.set", this.#textareaMaxLengthSetter, element, [value]);
  }

  setTextareaRows(element: HTMLTextAreaElement, value: number): void {
    this.#invoke("HTMLTextAreaElement.rows.set", this.#textareaRowsSetter, element, [value]);
  }

  setTextareaCols(element: HTMLTextAreaElement, value: number): void {
    this.#invoke("HTMLTextAreaElement.cols.set", this.#textareaColsSetter, element, [value]);
  }

  getSelectValue(element: HTMLSelectElement): string {
    return this.#invoke("HTMLSelectElement.value.get", this.#selectValueGetter, element, []);
  }

  setSelectValue(element: HTMLSelectElement, value: string): void {
    this.#invoke("HTMLSelectElement.value.set", this.#selectValueSetter, element, [value]);
  }

  getOptionSelected(element: HTMLOptionElement): boolean {
    return this.#invoke("HTMLOptionElement.selected.get", this.#optionSelectedGetter, element, []);
  }

  setOptionSelected(element: HTMLOptionElement, value: boolean): void {
    this.#invoke("HTMLOptionElement.selected.set", this.#optionSelectedSetter, element, [value]);
  }

  setButtonType(element: HTMLButtonElement, value: string): void {
    this.#invoke("HTMLButtonElement.type.set", this.#buttonTypeSetter, element, [value]);
  }

  setImageWidth(element: HTMLImageElement, value: number): void {
    this.#invoke("HTMLImageElement.width.set", this.#imageWidthSetter, element, [value]);
  }

  setImageHeight(element: HTMLImageElement, value: number): void {
    this.#invoke("HTMLImageElement.height.set", this.#imageHeightSetter, element, [value]);
  }

  setVideoWidth(element: HTMLVideoElement, value: number): void {
    this.#invoke("HTMLVideoElement.width.set", this.#videoWidthSetter, element, [value]);
  }

  setVideoHeight(element: HTMLVideoElement, value: number): void {
    this.#invoke("HTMLVideoElement.height.set", this.#videoHeightSetter, element, [value]);
  }

  setMediaControls(element: HTMLMediaElement, value: boolean): void {
    this.#invoke("HTMLMediaElement.controls.set", this.#mediaControlsSetter, element, [value]);
  }

  setMediaAutoplay(element: HTMLMediaElement, value: boolean): void {
    this.#invoke("HTMLMediaElement.autoplay.set", this.#mediaAutoplaySetter, element, [value]);
  }

  setMediaLoop(element: HTMLMediaElement, value: boolean): void {
    this.#invoke("HTMLMediaElement.loop.set", this.#mediaLoopSetter, element, [value]);
  }

  getMediaMuted(element: HTMLMediaElement): boolean {
    return this.#invoke("HTMLMediaElement.muted.get", this.#mediaMutedGetter, element, []);
  }

  setMediaMuted(element: HTMLMediaElement, value: boolean): void {
    this.#invoke("HTMLMediaElement.muted.set", this.#mediaMutedSetter, element, [value]);
  }

  getCanvasWidth(element: HTMLCanvasElement): number {
    return this.#invoke("HTMLCanvasElement.width.get", this.#canvasWidthGetter, element, []);
  }

  setCanvasWidth(element: HTMLCanvasElement, value: number): void {
    this.#invoke("HTMLCanvasElement.width.set", this.#canvasWidthSetter, element, [value]);
  }

  getCanvasHeight(element: HTMLCanvasElement): number {
    return this.#invoke("HTMLCanvasElement.height.get", this.#canvasHeightGetter, element, []);
  }

  setCanvasHeight(element: HTMLCanvasElement, value: number): void {
    this.#invoke("HTMLCanvasElement.height.set", this.#canvasHeightSetter, element, [value]);
  }

  setTableColSpan(element: HTMLTableCellElement, value: number): void {
    this.#invoke("HTMLTableCellElement.colSpan.set", this.#tableColSpanSetter, element, [value]);
  }

  setTableRowSpan(element: HTMLTableCellElement, value: number): void {
    this.#invoke("HTMLTableCellElement.rowSpan.set", this.#tableRowSpanSetter, element, [value]);
  }

  setDetailsOpen(element: HTMLDetailsElement, value: boolean): void {
    this.#invoke("HTMLDetailsElement.open.set", this.#detailsOpenSetter, element, [value]);
  }

  setDialogOpen(element: HTMLDialogElement, value: boolean): void {
    this.#invoke("HTMLDialogElement.open.set", this.#dialogOpenSetter, element, [value]);
  }

  getProgressValue(element: HTMLProgressElement): number {
    return this.#invoke("HTMLProgressElement.value.get", this.#progressValueGetter, element, []);
  }

  setProgressValue(element: HTMLProgressElement, value: number): void {
    this.#invoke("HTMLProgressElement.value.set", this.#progressValueSetter, element, [value]);
  }

  getProgressMax(element: HTMLProgressElement): number {
    return this.#invoke("HTMLProgressElement.max.get", this.#progressMaxGetter, element, []);
  }

  setProgressMax(element: HTMLProgressElement, value: number): void {
    this.#invoke("HTMLProgressElement.max.set", this.#progressMaxSetter, element, [value]);
  }

  getMeterValue(element: HTMLMeterElement): number {
    return this.#invoke("HTMLMeterElement.value.get", this.#meterValueGetter, element, []);
  }

  setMeterValue(element: HTMLMeterElement, value: number): void {
    this.#invoke("HTMLMeterElement.value.set", this.#meterValueSetter, element, [value]);
  }

  getMeterMin(element: HTMLMeterElement): number {
    return this.#invoke("HTMLMeterElement.min.get", this.#meterMinGetter, element, []);
  }

  setMeterMin(element: HTMLMeterElement, value: number): void {
    this.#invoke("HTMLMeterElement.min.set", this.#meterMinSetter, element, [value]);
  }

  getMeterMax(element: HTMLMeterElement): number {
    return this.#invoke("HTMLMeterElement.max.get", this.#meterMaxGetter, element, []);
  }

  setMeterMax(element: HTMLMeterElement, value: number): void {
    this.#invoke("HTMLMeterElement.max.set", this.#meterMaxSetter, element, [value]);
  }

  #copyInputState(element: HTMLInputElement): HTMLInputElement {
    // `input` is a fixed built-in tag passed to the captured owner-document
    // factory, so this is the typed boundary for the detached preview control.
    const scratch = this.#invoke(
      "Document.createElement.input-preview",
      this.#createElement,
      this.#ownerDocument,
      ["input"],
    ) as HTMLInputElement;
    const currentType = this.getInputType(element);
    this.setInputType(scratch, currentType);
    for (const name of ["min", "max", "step", "value"] as const) {
      const attributeValue = this.getAttribute(element, name);
      if (attributeValue !== null) this.setAttribute(scratch, name, attributeValue);
    }
    if (currentType !== "checkbox" && currentType !== "radio") {
      this.setInputValue(scratch, this.getInputValue(element));
    }
    return scratch;
  }

  #snapshotInputMutation(element: HTMLInputElement): InputMutationPreview {
    return {
      value: this.getInputValue(element),
      valueAttribute: this.getAttribute(element, "value"),
    };
  }

  #invoke<Arguments extends unknown[], Result>(
    operation: string,
    method: (...arguments_: Arguments) => Result,
    receiver: object,
    arguments_: Arguments,
  ): Result {
    try {
      return Reflect.apply(method, receiver, arguments_);
    } catch {
      throw createSafeDOMError("DOM_OPERATION_FAILED", operation);
    }
  }
}

export function createPlatformOps(
  ownerDocument: Document,
  view: Window & typeof globalThis,
): PlatformOps {
  try {
    return new OwnerRealmPlatformOps(ownerDocument, view);
  } catch {
    throw createSafeDOMError("DOM_OPERATION_FAILED", "PlatformOps.capture");
  }
}
