import type {
  SafeContainerElement,
  SafeElement,
  SafeVoidElement,
  SafeTextNode,
  SafeInputElement,
  SafeTextareaElement,
  SafeSelectElement,
  SafeOptionElement,
  SafeOptgroupElement,
  SafeButtonElement,
  SafeLabelElement,
  SafeFieldsetElement,
  SafeImageElement,
  SafeAnchorElement,
  SafeVideoElement,
  SafeAudioElement,
  SafeSourceElement,
  SafeTrackElement,
  SafeCanvasElement,
  SafeTableCellElement,
  SafeDetailsElement,
  SafeDialogElement,
  SafeProgressElement,
  SafeMeterElement,
  SafeListElement,
  SafeDescriptionListElement,
  SafeEvent,
  SafeEventKind,
  SafeFocusEvent,
  SafeGenericEvent,
  SafeInputEvent,
  SafeKeyboardEvent,
  SafeMouseEvent,
  SafePointerEvent,
  SafeTouchEvent,
  EventHandler,
  EventCleanup,
} from "./types.ts";
import type { DocumentContext } from "./context.ts";
import { createSafeStyle } from "./style.ts";
import { isAttrKeySafe } from "./validation.ts";
import type { SafeURLDecision } from "./url-policy.ts";
import { invalidArgument } from "./errors.ts";
import { PUBLIC_EVENT_CATALOG as EVENTS } from "./event-catalog.ts";
import {
  asciiLowercase,
  requireAsciiKeyword,
  requireBoolean,
  requireExactKeyword,
  requireFinite,
  requireFunction,
  requireIntegerInRange,
  requireLineBreakFreeString,
  requireMimeType,
  requireString,
} from "./attribute-contract.ts";
import {
  assertInputTypeTransition,
  compareInputRangeValues,
  getInputType,
  inputTypeSupportsAutocomplete,
  isCheckableInputType,
  parseInputRangeValue,
  parseInputStep,
  requireAutocompleteInputState,
  requireCheckableInputState,
  requirePlaceholderInputState,
  requireRangeInputState,
  requireReadonlyInputState,
  requireRequiredInputState,
  requireTextInputState,
} from "./input-state-contract.ts";
import {
  ARIA_ROLES,
  ARIA_IDREF_LIST_NAMES,
  ARIA_IDREF_NAMES,
  AUTOCOMPLETE_VALUES,
  BUTTON_TYPES,
  DIR_VALUES,
  ENTER_KEY_HINT_VALUES,
  IMAGE_LOADING_VALUES,
  INPUT_MODE_VALUES,
  INPUT_TYPES,
  TABLE_SCOPE_VALUES,
  TEXTAREA_WRAP_VALUES,
  TRACK_KINDS,
  type DirValue,
  type TrackKind,
} from "./vocabularies.ts";

const ASCII_WHITESPACE = /[\t\n\f\r ]/;

function requireIdentifierToken(value: string, operation: string): string {
  const primitive = requireString(value, operation);
  if (ASCII_WHITESPACE.test(primitive)) throw invalidArgument(operation);
  return primitive;
}

function addSafeEvent<Kind extends SafeEventKind>(
  context: DocumentContext,
  realEl: Element,
  eventName: string,
  kind: Kind,
  handler: EventHandler<Extract<SafeEvent, { readonly kind: Kind }>>,
  operation: string,
): EventCleanup {
  const primitiveHandler = requireFunction(handler, operation);
  const nativeHandler = (nativeEvent: Event): void => {
    if (!context.canDispatch(realEl)) return;
    const dispatch = context.eventSnapshotter.open(nativeEvent, kind);
    try {
      primitiveHandler(dispatch.event);
    } finally {
      dispatch.close();
    }
  };
  return context.addEventListener(realEl, eventName, nativeHandler);
}

function attribute(
  context: DocumentContext,
  realEl: Element,
  name: string,
  value: string | null | undefined,
  validate?: () => void,
): void {
  context.setAttribute(realEl, name, value, validate);
}

function booleanAttribute(
  context: DocumentContext,
  realEl: Element,
  name: string,
  value: boolean,
): void {
  attribute(context, realEl, name, value ? "" : null);
}

function applyURLDecision(
  context: DocumentContext,
  realEl: Element,
  name: string,
  decide: () => SafeURLDecision,
): SafeURLDecision {
  return context.setURLAttribute(realEl, name, decide);
}

export function createSafeContainerElement(
  context: DocumentContext,
  realEl: Element,
): SafeContainerElement {
  const known = context.registry.getWrapper<SafeContainerElement>(realEl);
  if (known) return known;
  return context.complete(buildSafeContainerElement(context, realEl), realEl);
}

export function createSafeVoidElement(
  context: DocumentContext,
  realEl: Element,
): SafeVoidElement {
  const known = context.registry.getWrapper<SafeVoidElement>(realEl);
  if (known) return known;
  return context.complete(buildSafeElement(context, realEl), realEl);
}

function buildSafeElement(context: DocumentContext, realEl: Element): SafeElement {
  const htmlEl = realEl as HTMLElement;

  const wrapper: SafeElement = {
    detach(): void { context.detachNode(realEl); },
    remove(): void { context.detachNode(realEl); },
    dispose(): void { context.disposeNode(realEl); },

    setClass(value: string): void {
      attribute(context, realEl, "class", requireString(value, "SafeElement.setClass.value"));
    },
    getClass(): string {
      return context.nodeOperation(
        realEl,
        () => context.platform.getAttribute(realEl, "class") ?? "",
      );
    },
    setId(value: string): void {
      context.setLocalId(realEl, requireIdentifierToken(value, "SafeElement.setId.value"));
    },
    getId(): string {
      return context.getLocalId(realEl);
    },
    setTitle(value: string): void {
      attribute(context, realEl, "title", requireString(value, "SafeElement.setTitle.value"));
    },
    setRole(value: string): void {
      attribute(context, realEl, "role", requireAsciiKeyword(value, ARIA_ROLES, "SafeElement.setRole.value"));
    },
    setTabIndex(value: number): void {
      const tabIndex = requireIntegerInRange(value, -1, 0, "SafeElement.setTabIndex.value");
      context.setReflectedIDL(realEl, "tabindex", `${tabIndex}`, () => {
        context.platform.setTabIndex(htmlEl, tabIndex);
      });
    },
    setHidden(value: boolean): void {
      booleanAttribute(context, realEl, "hidden", requireBoolean(value, "SafeElement.setHidden.value"));
    },
    setLang(value: string): void {
      attribute(context, realEl, "lang", requireString(value, "SafeElement.setLang.value"));
    },
    clearLang(): void {
      attribute(context, realEl, "lang", null);
    },
    getLang(): string | undefined {
      return context.nodeOperation(
        realEl,
        () => context.platform.getAttribute(realEl, "lang") ?? undefined,
      );
    },
    setDir(value: string): void {
      attribute(context, realEl, "dir", requireAsciiKeyword(value, DIR_VALUES, "SafeElement.setDir.value"));
    },
    clearDir(): void {
      attribute(context, realEl, "dir", null);
    },
    getDir(): DirValue | undefined {
      return context.nodeOperation(realEl, () => {
        const value = context.platform.getAttribute(realEl, "dir");
        if (value === null) return undefined;
        const normalized = asciiLowercase(value);
        return (DIR_VALUES as readonly string[]).includes(normalized)
          ? normalized as DirValue
          : undefined;
      });
    },
    setTranslate(value: boolean): void {
      attribute(
        context,
        realEl,
        "translate",
        requireBoolean(value, "SafeElement.setTranslate.value") ? "yes" : "no",
      );
    },
    clearTranslate(): void {
      attribute(context, realEl, "translate", null);
    },
    getTranslate(): boolean | undefined {
      return context.nodeOperation(realEl, () => {
        const value = context.platform.getAttribute(realEl, "translate");
        if (value === null) return undefined;
        const normalized = asciiLowercase(value);
        if (normalized === "" || normalized === "yes") return true;
        if (normalized === "no") return false;
        return undefined;
      });
    },
    setSpellcheck(value: boolean): void {
      const primitive = requireBoolean(value, "SafeElement.setSpellcheck.value");
      attribute(context, realEl, "spellcheck", primitive ? "true" : "false");
    },

    setData(key: string, value: string): void {
      const primitiveKey = requireString(key, "SafeElement.setData.key");
      if (!isAttrKeySafe(primitiveKey)) throw invalidArgument("SafeElement.setData.key");
      const primitiveValue = requireString(value, "SafeElement.setData.value");
      attribute(context, realEl, `data-${primitiveKey}`, primitiveValue);
    },
    getData(key: string): string | undefined {
      const primitiveKey = requireString(key, "SafeElement.getData.key");
      if (!isAttrKeySafe(primitiveKey)) throw invalidArgument("SafeElement.getData.key");
      return context.nodeOperation(realEl, () => {
        return context.platform.getAttribute(realEl, `data-${primitiveKey}`) ?? undefined;
      });
    },
    setAria(key: string, value: string): void {
      const primitiveKey = requireString(key, "SafeElement.setAria.key");
      if (!isAttrKeySafe(primitiveKey)) throw invalidArgument("SafeElement.setAria.key");
      const canonicalKey = asciiLowercase(primitiveKey);
      const primitiveValue = requireString(value, "SafeElement.setAria.value");
      if ((ARIA_IDREF_NAMES as readonly string[]).includes(canonicalKey)) {
        context.setLocalIdReference(
          realEl,
          `aria-${canonicalKey}`,
          requireIdentifierToken(primitiveValue, "SafeElement.setAria.value"),
          "single",
        );
        return;
      }
      if ((ARIA_IDREF_LIST_NAMES as readonly string[]).includes(canonicalKey)) {
        context.setLocalIdReference(realEl, `aria-${canonicalKey}`, primitiveValue, "list");
        return;
      }
      attribute(context, realEl, `aria-${canonicalKey}`, primitiveValue);
    },
    getAria(key: string): string | undefined {
      const primitiveKey = requireString(key, "SafeElement.getAria.key");
      if (!isAttrKeySafe(primitiveKey)) throw invalidArgument("SafeElement.getAria.key");
      const canonicalKey = asciiLowercase(primitiveKey);
      if (
        (ARIA_IDREF_NAMES as readonly string[]).includes(canonicalKey)
        || (ARIA_IDREF_LIST_NAMES as readonly string[]).includes(canonicalKey)
      ) {
        return context.getLocalIdReference(realEl, `aria-${canonicalKey}`);
      }
      return context.nodeOperation(
        realEl,
        () => context.platform.getAttribute(realEl, `aria-${canonicalKey}`) ?? undefined,
      );
    },

    onClick(handler: EventHandler<SafeMouseEvent>): EventCleanup { return addSafeEvent(context, realEl, EVENTS.onClick.type, EVENTS.onClick.kind, handler, "SafeElement.onClick.handler"); },
    onDblClick(handler: EventHandler<SafeMouseEvent>): EventCleanup { return addSafeEvent(context, realEl, EVENTS.onDblClick.type, EVENTS.onDblClick.kind, handler, "SafeElement.onDblClick.handler"); },
    onMouseDown(handler: EventHandler<SafeMouseEvent>): EventCleanup { return addSafeEvent(context, realEl, EVENTS.onMouseDown.type, EVENTS.onMouseDown.kind, handler, "SafeElement.onMouseDown.handler"); },
    onMouseUp(handler: EventHandler<SafeMouseEvent>): EventCleanup { return addSafeEvent(context, realEl, EVENTS.onMouseUp.type, EVENTS.onMouseUp.kind, handler, "SafeElement.onMouseUp.handler"); },
    onMouseEnter(handler: EventHandler<SafeMouseEvent>): EventCleanup { return addSafeEvent(context, realEl, EVENTS.onMouseEnter.type, EVENTS.onMouseEnter.kind, handler, "SafeElement.onMouseEnter.handler"); },
    onMouseLeave(handler: EventHandler<SafeMouseEvent>): EventCleanup { return addSafeEvent(context, realEl, EVENTS.onMouseLeave.type, EVENTS.onMouseLeave.kind, handler, "SafeElement.onMouseLeave.handler"); },
    onMouseMove(handler: EventHandler<SafeMouseEvent>): EventCleanup { return addSafeEvent(context, realEl, EVENTS.onMouseMove.type, EVENTS.onMouseMove.kind, handler, "SafeElement.onMouseMove.handler"); },
    onPointerDown(handler: EventHandler<SafePointerEvent>): EventCleanup { return addSafeEvent(context, realEl, EVENTS.onPointerDown.type, EVENTS.onPointerDown.kind, handler, "SafeElement.onPointerDown.handler"); },
    onPointerUp(handler: EventHandler<SafePointerEvent>): EventCleanup { return addSafeEvent(context, realEl, EVENTS.onPointerUp.type, EVENTS.onPointerUp.kind, handler, "SafeElement.onPointerUp.handler"); },
    onPointerMove(handler: EventHandler<SafePointerEvent>): EventCleanup { return addSafeEvent(context, realEl, EVENTS.onPointerMove.type, EVENTS.onPointerMove.kind, handler, "SafeElement.onPointerMove.handler"); },
    onContextMenu(handler: EventHandler<SafeMouseEvent>): EventCleanup { return addSafeEvent(context, realEl, EVENTS.onContextMenu.type, EVENTS.onContextMenu.kind, handler, "SafeElement.onContextMenu.handler"); },

    onKeyDown(handler: EventHandler<SafeKeyboardEvent>): EventCleanup { return addSafeEvent(context, realEl, EVENTS.onKeyDown.type, EVENTS.onKeyDown.kind, handler, "SafeElement.onKeyDown.handler"); },
    onKeyUp(handler: EventHandler<SafeKeyboardEvent>): EventCleanup { return addSafeEvent(context, realEl, EVENTS.onKeyUp.type, EVENTS.onKeyUp.kind, handler, "SafeElement.onKeyUp.handler"); },

    onFocus(handler: EventHandler<SafeFocusEvent>): EventCleanup { return addSafeEvent(context, realEl, EVENTS.onFocus.type, EVENTS.onFocus.kind, handler, "SafeElement.onFocus.handler"); },
    onBlur(handler: EventHandler<SafeFocusEvent>): EventCleanup { return addSafeEvent(context, realEl, EVENTS.onBlur.type, EVENTS.onBlur.kind, handler, "SafeElement.onBlur.handler"); },

    onTouchStart(handler: EventHandler<SafeTouchEvent>): EventCleanup { return addSafeEvent(context, realEl, EVENTS.onTouchStart.type, EVENTS.onTouchStart.kind, handler, "SafeElement.onTouchStart.handler"); },
    onTouchEnd(handler: EventHandler<SafeTouchEvent>): EventCleanup { return addSafeEvent(context, realEl, EVENTS.onTouchEnd.type, EVENTS.onTouchEnd.kind, handler, "SafeElement.onTouchEnd.handler"); },
    onTouchMove(handler: EventHandler<SafeTouchEvent>): EventCleanup { return addSafeEvent(context, realEl, EVENTS.onTouchMove.type, EVENTS.onTouchMove.kind, handler, "SafeElement.onTouchMove.handler"); },

    onScroll(handler: EventHandler<SafeGenericEvent>): EventCleanup { return addSafeEvent(context, realEl, EVENTS.onScroll.type, EVENTS.onScroll.kind, handler, "SafeElement.onScroll.handler"); },

    style: createSafeStyle(context, htmlEl),
  };

  return wrapper;
}

function buildSafeContainerElement(
  context: DocumentContext,
  realEl: Element,
): SafeContainerElement {
  const base = buildSafeElement(context, realEl);
  const htmlEl = realEl as HTMLElement;

  return Object.assign(base, {
    appendChild(child: SafeElement | SafeTextNode): void {
      context.nodeOperation(realEl, () => {
        context.platform.appendChild(realEl, context.requireRealNode(child));
      });
    },
    insertBefore(newChild: SafeElement | SafeTextNode, reference: SafeElement | SafeTextNode): void {
      context.nodeOperation(realEl, () => {
        context.platform.insertBefore(
          realEl,
          context.requireRealNode(newChild),
          context.requireRealNode(reference),
        );
      });
    },
    removeChild(child: SafeElement | SafeTextNode): void {
      context.nodeOperation(realEl, () => {
        context.platform.removeChild(realEl, context.requireRealNode(child));
      });
    },
    replaceChild(newChild: SafeElement | SafeTextNode, oldChild: SafeElement | SafeTextNode): void {
      context.nodeOperation(realEl, () => {
        context.platform.replaceChild(
          realEl,
          context.requireRealNode(newChild),
          context.requireRealNode(oldChild),
        );
      });
    },
    setText(value: string): void {
      const text = requireString(value, "SafeElement.setText.value");
      context.setText(realEl, "textContent", text, () => {
        context.platform.setTextContent(htmlEl, text);
      });
    },
    getText(): string {
      return context.nodeOperation(realEl, () => context.platform.getTextContent(htmlEl) ?? "");
    },
  });
}

export function createSafeInputElement(
  context: DocumentContext,
  realEl: HTMLInputElement,
  initializeNonForm = false,
): SafeInputElement {
  const known = context.registry.getWrapper<SafeInputElement>(realEl);
  if (known) return known;
  const base = buildSafeElement(context, realEl);
  const setReadOnly = (value: boolean): void => {
    const primitive = requireBoolean(value, "SafeInputElement.setReadonly.value");
    attribute(context, realEl, "readonly", primitive ? "" : null, () => {
      requireReadonlyInputState(context.platform, realEl, "SafeInputElement.setReadonly.state");
    });
  };
  const setAutoFocus = (value: boolean): void => {
    const primitive = requireBoolean(value, "SafeInputElement.setAutofocus.value");
    if (primitive) throw invalidArgument("SafeInputElement.setAutofocus.value");
    attribute(context, realEl, "autofocus", null);
  };

  const wrapper = Object.assign(base, {
    setType(type: string): void {
      const normalized = requireAsciiKeyword(type, INPUT_TYPES, "SafeInputElement.setType.type");
      context.updateContentResources(realEl, () => {
        const current = assertInputTypeTransition(context.platform, realEl, normalized);
        const preview = context.platform.previewInputType(realEl, normalized);
        const sourceValue = isCheckableInputType(current)
          ? (context.platform.getAttribute(realEl, "value") ?? "")
          : context.platform.getInputValue(realEl);
        const targetCreatesDefault = sourceValue === ""
          && (normalized === "range" || normalized === "color");
        if (!isCheckableInputType(normalized) && preview.value !== sourceValue && !targetCreatesDefault) {
          throw invalidArgument("SafeInputElement.setType.state");
        }
        const autocomplete = inputTypeSupportsAutocomplete(normalized) ? "off" : null;
        return {
          changes: [
            { resource: "attribute", slot: "type", value: normalized },
            { resource: "attribute", slot: "value", value: preview.valueAttribute },
            { resource: "attribute", slot: "autocomplete", value: autocomplete },
            {
              resource: "text",
              slot: "value",
              value: isCheckableInputType(normalized) ? null : preview.value,
            },
          ],
          action: () => {
            context.platform.setInputType(realEl, normalized);
            if (autocomplete === null) context.platform.removeAttribute(realEl, "autocomplete");
            else context.platform.setAttribute(realEl, "autocomplete", autocomplete);
          },
        };
      });
    },
    setValue(value: string): void {
      const text = requireString(value, "SafeInputElement.setValue.value");
      context.updateContentResources(realEl, () => {
        const type = getInputType(context.platform, realEl, "SafeInputElement.setValue.state");
        const preview = context.platform.previewInputValue(realEl, text);
        if (!isCheckableInputType(type) && preview.value !== text) {
          throw invalidArgument("SafeInputElement.setValue.value");
        }
        return {
          changes: [
            { resource: "attribute", slot: "value", value: preview.valueAttribute },
            {
              resource: "text",
              slot: "value",
              value: isCheckableInputType(type) ? null : preview.value,
            },
          ],
          action: () => context.platform.setInputValue(realEl, text),
        };
      });
    },
    getValue(): string {
      return context.nodeOperation(realEl, () => {
        getInputType(context.platform, realEl, "SafeInputElement.getValue.state");
        return context.platform.getInputValue(realEl);
      });
    },
    setPlaceholder(value: string): void {
      const primitive = requireLineBreakFreeString(value, "SafeInputElement.setPlaceholder.value");
      attribute(context, realEl, "placeholder", primitive, () => {
        requirePlaceholderInputState(context.platform, realEl, "SafeInputElement.setPlaceholder.state");
      });
    },
    setDisabled(value: boolean): void {
      booleanAttribute(context, realEl, "disabled", requireBoolean(value, "SafeInputElement.setDisabled.value"));
    },
    setReadOnly,
    setReadonly: setReadOnly,
    setRequired(value: boolean): void {
      const primitive = requireBoolean(value, "SafeInputElement.setRequired.value");
      attribute(context, realEl, "required", primitive ? "" : null, () => {
        requireRequiredInputState(context.platform, realEl, "SafeInputElement.setRequired.state");
      });
    },
    setChecked(value: boolean): void {
      const primitive = requireBoolean(value, "SafeInputElement.setChecked.value");
      context.setIDL(
        realEl,
        primitive,
        () => context.platform.getInputChecked(realEl),
        (next) => context.platform.setInputChecked(realEl, next),
        () => requireCheckableInputState(
          context.platform,
          realEl,
          "SafeInputElement.setChecked.state",
        ),
      );
    },
    getChecked(): boolean {
      return context.nodeOperation(realEl, () => {
        requireCheckableInputState(context.platform, realEl, "SafeInputElement.getChecked.state");
        return context.platform.getInputChecked(realEl);
      });
    },
    setMin(value: string): void {
      const primitive = requireString(value, "SafeInputElement.setMin.value");
      attribute(context, realEl, "min", primitive, () => {
        const type = requireRangeInputState(context.platform, realEl, "SafeInputElement.setMin.state");
        const candidate = parseInputRangeValue(type, primitive, "SafeInputElement.setMin.value");
        const currentMaximum = context.platform.getAttribute(realEl, "max");
        if (currentMaximum !== null) {
          const maximum = parseInputRangeValue(type, currentMaximum, "SafeInputElement.setMin.range");
          if (type !== "time" && compareInputRangeValues(candidate, maximum) > 0) {
            throw invalidArgument("SafeInputElement.setMin.range");
          }
        }
      });
    },
    setMax(value: string): void {
      const primitive = requireString(value, "SafeInputElement.setMax.value");
      attribute(context, realEl, "max", primitive, () => {
        const type = requireRangeInputState(context.platform, realEl, "SafeInputElement.setMax.state");
        const candidate = parseInputRangeValue(type, primitive, "SafeInputElement.setMax.value");
        const currentMinimum = context.platform.getAttribute(realEl, "min");
        if (currentMinimum !== null) {
          const minimum = parseInputRangeValue(type, currentMinimum, "SafeInputElement.setMax.range");
          if (type !== "time" && compareInputRangeValues(minimum, candidate) > 0) {
            throw invalidArgument("SafeInputElement.setMax.range");
          }
        }
      });
    },
    setStep(value: string): void {
      const primitive = requireString(value, "SafeInputElement.setStep.value");
      const normalized = asciiLowercase(primitive);
      const serialized = normalized === "any" ? normalized : primitive;
      attribute(context, realEl, "step", serialized, () => {
        requireRangeInputState(context.platform, realEl, "SafeInputElement.setStep.state");
        parseInputStep(serialized, "SafeInputElement.setStep.value");
      });
    },
    setMinLength(value: number): void {
      const candidate = requireIntegerInRange(value, 0, 2_147_483_647, "SafeInputElement.setMinLength.value");
      context.setReflectedIDL(realEl, "minlength", `${candidate}`, () => {
        requireTextInputState(context.platform, realEl, "SafeInputElement.setMinLength.state");
        const maximum = context.platform.getInputMaxLength(realEl);
        if (maximum >= 0 && candidate > maximum) throw invalidArgument("SafeInputElement.setMinLength.range");
        context.platform.setInputMinLength(realEl, candidate);
      });
    },
    setMaxLength(value: number): void {
      const candidate = requireIntegerInRange(value, 0, 2_147_483_647, "SafeInputElement.setMaxLength.value");
      context.setReflectedIDL(realEl, "maxlength", `${candidate}`, () => {
        requireTextInputState(context.platform, realEl, "SafeInputElement.setMaxLength.state");
        const minimum = context.platform.getInputMinLength(realEl);
        if (minimum >= 0 && candidate < minimum) throw invalidArgument("SafeInputElement.setMaxLength.range");
        context.platform.setInputMaxLength(realEl, candidate);
      });
    },
    setPattern(value: string): void {
      const primitive = requireString(value, "SafeInputElement.setPattern.value");
      attribute(context, realEl, "pattern", primitive, () => {
        requireTextInputState(context.platform, realEl, "SafeInputElement.setPattern.state");
        if (!context.platform.isInputPatternValid(primitive)) throw invalidArgument("SafeInputElement.setPattern.value");
      });
    },
    setAutocomplete(value: string): void {
      const primitive = requireExactKeyword(value, AUTOCOMPLETE_VALUES, "SafeInputElement.setAutocomplete.value");
      attribute(context, realEl, "autocomplete", primitive, () => {
        requireAutocompleteInputState(context.platform, realEl, "SafeInputElement.setAutocomplete.state");
      });
    },
    setAutoFocus,
    setAutofocus: setAutoFocus,
    setName(value: string): void {
      context.setLocalName(realEl, requireString(value, "SafeInputElement.setName.value"));
    },
    setInputMode(value: string): void {
      attribute(context, realEl, "inputmode", requireAsciiKeyword(value, INPUT_MODE_VALUES, "SafeInputElement.setInputMode.value"));
    },
    setEnterKeyHint(value: string): void {
      attribute(context, realEl, "enterkeyhint", requireAsciiKeyword(value, ENTER_KEY_HINT_VALUES, "SafeInputElement.setEnterKeyHint.value"));
    },
    onChange(handler: EventHandler<SafeInputEvent>): EventCleanup {
      return addSafeEvent(context, realEl, EVENTS.onChange.type, EVENTS.onChange.kind, handler, "SafeInputElement.onChange.handler");
    },
    onInput(handler: EventHandler<SafeInputEvent>): EventCleanup {
      return addSafeEvent(context, realEl, EVENTS.onInput.type, EVENTS.onInput.kind, handler, "SafeInputElement.onInput.handler");
    },
  }) as SafeInputElement;
  if (initializeNonForm) {
    return context.completeInitialized(wrapper, realEl, "input", [
      { name: "autocomplete", value: "off" },
    ], () => context.platform.setAttribute(realEl, "autocomplete", "off"));
  }
  return context.complete(wrapper, realEl, "input");
}

export function createSafeTextareaElement(
  context: DocumentContext,
  realEl: HTMLTextAreaElement,
  initializeNonForm = false,
): SafeTextareaElement {
  const known = context.registry.getWrapper<SafeTextareaElement>(realEl);
  if (known) return known;
  const base = buildSafeContainerElement(context, realEl);
  const setReadOnly = (value: boolean): void => {
    booleanAttribute(
      context,
      realEl,
      "readonly",
      requireBoolean(value, "SafeTextareaElement.setReadonly.value"),
    );
  };

  const wrapper = Object.assign(base, {
    setValue(value: string): void {
      const text = requireString(value, "SafeTextareaElement.setValue.value");
      context.setText(realEl, "value", text, () => {
        context.platform.setTextareaValue(realEl, text);
      });
    },
    getValue(): string {
      return context.nodeOperation(realEl, () => context.platform.getTextareaValue(realEl));
    },
    setPlaceholder(value: string): void {
      attribute(context, realEl, "placeholder", requireLineBreakFreeString(value, "SafeTextareaElement.setPlaceholder.value"));
    },
    setDisabled(value: boolean): void {
      booleanAttribute(context, realEl, "disabled", requireBoolean(value, "SafeTextareaElement.setDisabled.value"));
    },
    setReadOnly,
    setReadonly: setReadOnly,
    setRequired(value: boolean): void {
      booleanAttribute(context, realEl, "required", requireBoolean(value, "SafeTextareaElement.setRequired.value"));
    },
    setMinLength(value: number): void {
      const candidate = requireIntegerInRange(value, 0, 2_147_483_647, "SafeTextareaElement.setMinLength.value");
      context.setReflectedIDL(realEl, "minlength", `${candidate}`, () => {
        const maximum = context.platform.getTextareaMaxLength(realEl);
        if (maximum >= 0 && candidate > maximum) {
          throw invalidArgument("SafeTextareaElement.setMinLength.range");
        }
        context.platform.setTextareaMinLength(realEl, candidate);
      });
    },
    setMaxLength(value: number): void {
      const candidate = requireIntegerInRange(value, 0, 2_147_483_647, "SafeTextareaElement.setMaxLength.value");
      context.setReflectedIDL(realEl, "maxlength", `${candidate}`, () => {
        const minimum = context.platform.getTextareaMinLength(realEl);
        if (minimum >= 0 && candidate < minimum) {
          throw invalidArgument("SafeTextareaElement.setMaxLength.range");
        }
        context.platform.setTextareaMaxLength(realEl, candidate);
      });
    },
    setRows(value: number): void {
      const rows = requireIntegerInRange(value, 1, 4_294_967_295, "SafeTextareaElement.setRows.value");
      context.setReflectedIDL(realEl, "rows", `${rows}`, () => {
        context.platform.setTextareaRows(realEl, rows);
      });
    },
    setCols(value: number): void {
      const cols = requireIntegerInRange(value, 1, 4_294_967_295, "SafeTextareaElement.setCols.value");
      context.setReflectedIDL(realEl, "cols", `${cols}`, () => {
        context.platform.setTextareaCols(realEl, cols);
      });
    },
    setWrap(value: string): void {
      attribute(context, realEl, "wrap", requireAsciiKeyword(value, TEXTAREA_WRAP_VALUES, "SafeTextareaElement.setWrap.value"));
    },
    setName(value: string): void {
      context.setLocalName(realEl, requireString(value, "SafeTextareaElement.setName.value"));
    },
    setAutocomplete(value: string): void {
      attribute(context, realEl, "autocomplete", requireExactKeyword(value, AUTOCOMPLETE_VALUES, "SafeTextareaElement.setAutocomplete.value"));
    },
    onChange(handler: EventHandler<SafeInputEvent>): EventCleanup {
      return addSafeEvent(context, realEl, EVENTS.onChange.type, EVENTS.onChange.kind, handler, "SafeTextareaElement.onChange.handler");
    },
    onInput(handler: EventHandler<SafeInputEvent>): EventCleanup {
      return addSafeEvent(context, realEl, EVENTS.onInput.type, EVENTS.onInput.kind, handler, "SafeTextareaElement.onInput.handler");
    },
  }) as SafeTextareaElement;
  if (initializeNonForm) {
    return context.completeInitialized(wrapper, realEl, "textarea", [
      { name: "autocomplete", value: "off" },
    ], () => context.platform.setAttribute(realEl, "autocomplete", "off"));
  }
  return context.complete(wrapper, realEl, "textarea");
}

export function createSafeSelectElement(
  context: DocumentContext,
  realEl: HTMLSelectElement,
  initializeNonForm = false,
): SafeSelectElement {
  const known = context.registry.getWrapper<SafeSelectElement>(realEl);
  if (known) return known;
  const base = buildSafeContainerElement(context, realEl);

  const wrapper = Object.assign(base, {
    setValue(value: string): void {
      const text = requireString(value, "SafeSelectElement.setValue.value");
      context.setText(realEl, "value", text, () => {
        context.platform.setSelectValue(realEl, text);
      });
    },
    getValue(): string {
      return context.nodeOperation(realEl, () => context.platform.getSelectValue(realEl));
    },
    setDisabled(value: boolean): void {
      booleanAttribute(context, realEl, "disabled", requireBoolean(value, "SafeSelectElement.setDisabled.value"));
    },
    setRequired(value: boolean): void {
      booleanAttribute(context, realEl, "required", requireBoolean(value, "SafeSelectElement.setRequired.value"));
    },
    setMultiple(value: boolean): void {
      booleanAttribute(context, realEl, "multiple", requireBoolean(value, "SafeSelectElement.setMultiple.value"));
    },
    setName(value: string): void {
      context.setLocalName(realEl, requireString(value, "SafeSelectElement.setName.value"));
    },
    onChange(handler: EventHandler<SafeInputEvent>): EventCleanup {
      return addSafeEvent(context, realEl, EVENTS.onChange.type, EVENTS.onChange.kind, handler, "SafeSelectElement.onChange.handler");
    },
  }) as SafeSelectElement;
  if (initializeNonForm) {
    return context.completeInitialized(wrapper, realEl, "select", [
      { name: "autocomplete", value: "off" },
    ], () => context.platform.setAttribute(realEl, "autocomplete", "off"));
  }
  return context.complete(wrapper, realEl, "select");
}

export function createSafeOptionElement(context: DocumentContext, realEl: HTMLOptionElement): SafeOptionElement {
  const known = context.registry.getWrapper<SafeOptionElement>(realEl);
  if (known) return known;
  const base = buildSafeContainerElement(context, realEl);

  return context.complete(Object.assign(base, {
    setValue(value: string): void {
      attribute(context, realEl, "value", requireString(value, "SafeOptionElement.setValue.value"));
    },
    setSelected(value: boolean): void {
      const primitive = requireBoolean(value, "SafeOptionElement.setSelected.value");
      context.setIDL(
        realEl,
        primitive,
        () => context.platform.getOptionSelected(realEl),
        (next) => context.platform.setOptionSelected(realEl, next),
      );
    },
    setDisabled(value: boolean): void {
      booleanAttribute(context, realEl, "disabled", requireBoolean(value, "SafeOptionElement.setDisabled.value"));
    },
    setLabel(value: string): void {
      attribute(context, realEl, "label", requireString(value, "SafeOptionElement.setLabel.value"));
    },
  }) as SafeOptionElement, realEl, "option");
}

export function createSafeOptgroupElement(
  context: DocumentContext,
  realEl: HTMLOptGroupElement,
): SafeOptgroupElement {
  const known = context.registry.getWrapper<SafeOptgroupElement>(realEl);
  if (known) return known;
  const base = buildSafeContainerElement(context, realEl);

  return context.complete(Object.assign(base, {
    setLabel(value: string): void {
      const primitive = requireString(value, "SafeOptgroupElement.setLabel.value");
      if (primitive.length === 0) throw invalidArgument("SafeOptgroupElement.setLabel.value");
      attribute(context, realEl, "label", primitive);
    },
  }), realEl, "optgroup");
}

export function createSafeButtonElement(
  context: DocumentContext,
  realEl: HTMLButtonElement,
  initializeNonForm = false,
): SafeButtonElement {
  const known = context.registry.getWrapper<SafeButtonElement>(realEl);
  if (known) return known;
  const base = buildSafeContainerElement(context, realEl);

  const wrapper = Object.assign(base, {
    setType(type: string): void {
      const normalized = requireAsciiKeyword(type, BUTTON_TYPES, "SafeButtonElement.setType.type");
      context.setReflectedIDL(realEl, "type", normalized, () => {
        context.platform.setButtonType(realEl, normalized);
      });
    },
    setDisabled(value: boolean): void {
      booleanAttribute(context, realEl, "disabled", requireBoolean(value, "SafeButtonElement.setDisabled.value"));
    },
    setName(value: string): void {
      context.setLocalName(realEl, requireString(value, "SafeButtonElement.setName.value"));
    },
    setValue(value: string): void {
      attribute(context, realEl, "value", requireString(value, "SafeButtonElement.setValue.value"));
    },
  }) as SafeButtonElement;
  if (initializeNonForm) {
    return context.completeInitialized(wrapper, realEl, "button", [
      { name: "type", value: "button" },
    ], () => context.platform.setButtonType(realEl, "button"));
  }
  return context.complete(wrapper, realEl, "button");
}

export function createSafeLabelElement(context: DocumentContext, realEl: HTMLLabelElement): SafeLabelElement {
  const known = context.registry.getWrapper<SafeLabelElement>(realEl);
  if (known) return known;
  const base = buildSafeContainerElement(context, realEl);

  return context.complete(Object.assign(base, {
    setFor(value: string): void {
      context.setLocalIdReference(
        realEl,
        "for",
        requireIdentifierToken(value, "SafeLabelElement.setFor.value"),
        "single",
      );
    },
    getFor(): string {
      return context.getLocalIdReference(realEl, "for") ?? "";
    },
  }) as SafeLabelElement, realEl, "label");
}

export function createSafeFieldsetElement(context: DocumentContext, realEl: HTMLFieldSetElement): SafeFieldsetElement {
  const known = context.registry.getWrapper<SafeFieldsetElement>(realEl);
  if (known) return known;
  const base = buildSafeContainerElement(context, realEl);

  return context.complete(Object.assign(base, {
    setDisabled(value: boolean): void {
      booleanAttribute(context, realEl, "disabled", requireBoolean(value, "SafeFieldsetElement.setDisabled.value"));
    },
  }) as SafeFieldsetElement, realEl, "fieldset");
}

export function createSafeImageElement(
  context: DocumentContext,
  realEl: HTMLImageElement,
): SafeImageElement {
  const known = context.registry.getWrapper<SafeImageElement>(realEl);
  if (known) return known;
  const base = buildSafeElement(context, realEl);

  return context.complete(Object.assign(base, {
    setSrc(url: string): SafeURLDecision {
      return applyURLDecision(
        context,
        realEl,
        "src",
        () => context.urlPolicy.decide("image.src", url),
      );
    },
    setAlt(value: string): void {
      attribute(context, realEl, "alt", requireString(value, "SafeImageElement.setAlt.value"));
    },
    setWidth(value: number): void {
      const width = requireIntegerInRange(value, 0, 4_294_967_295, "SafeImageElement.setWidth.value");
      context.setReflectedIDL(realEl, "width", `${width}`, () => {
        context.platform.setImageWidth(realEl, width);
      });
    },
    setHeight(value: number): void {
      const height = requireIntegerInRange(value, 0, 4_294_967_295, "SafeImageElement.setHeight.value");
      context.setReflectedIDL(realEl, "height", `${height}`, () => {
        context.platform.setImageHeight(realEl, height);
      });
    },
    setLoading(value: string): void {
      attribute(context, realEl, "loading", requireAsciiKeyword(value, IMAGE_LOADING_VALUES, "SafeImageElement.setLoading.value"));
    },
  }) as SafeImageElement, realEl, "image");
}

export function createSafeAnchorElement(
  context: DocumentContext,
  realEl: HTMLAnchorElement,
): SafeAnchorElement {
  const known = context.registry.getWrapper<SafeAnchorElement>(realEl);
  if (known) return known;
  const base = buildSafeContainerElement(context, realEl);

  return context.complete(Object.assign(base, {
    setHref(url: string): SafeURLDecision {
      return applyURLDecision(
        context,
        realEl,
        "href",
        () => context.urlPolicy.decide("anchor.href", url),
      );
    },
  }) as SafeAnchorElement, realEl, "anchor");
}

export function createSafeVideoElement(
  context: DocumentContext,
  realEl: HTMLVideoElement,
): SafeVideoElement {
  const known = context.registry.getWrapper<SafeVideoElement>(realEl);
  if (known) return known;
  const base = buildSafeContainerElement(context, realEl);

  return context.complete(Object.assign(base, {
    setSrc(url: string): SafeURLDecision {
      return applyURLDecision(
        context,
        realEl,
        "src",
        () => context.urlPolicy.decide("video.src", url),
      );
    },
    setWidth(value: number): void {
      const width = requireIntegerInRange(value, 0, 4_294_967_295, "SafeVideoElement.setWidth.value");
      context.setReflectedIDL(realEl, "width", `${width}`, () => {
        context.platform.setVideoWidth(realEl, width);
      });
    },
    setHeight(value: number): void {
      const height = requireIntegerInRange(value, 0, 4_294_967_295, "SafeVideoElement.setHeight.value");
      context.setReflectedIDL(realEl, "height", `${height}`, () => {
        context.platform.setVideoHeight(realEl, height);
      });
    },
    setControls(value: boolean): void {
      const primitive = requireBoolean(value, "SafeVideoElement.setControls.value");
      context.setReflectedIDL(realEl, "controls", primitive ? "" : null, () => {
        context.platform.setMediaControls(realEl, primitive);
      });
    },
    setAutoplay(value: boolean): void {
      const primitive = requireBoolean(value, "SafeVideoElement.setAutoplay.value");
      context.setReflectedIDL(realEl, "autoplay", primitive ? "" : null, () => {
        context.platform.setMediaAutoplay(realEl, primitive);
      });
    },
    setLoop(value: boolean): void {
      const primitive = requireBoolean(value, "SafeVideoElement.setLoop.value");
      context.setReflectedIDL(realEl, "loop", primitive ? "" : null, () => {
        context.platform.setMediaLoop(realEl, primitive);
      });
    },
    setMuted(value: boolean): void {
      const primitive = requireBoolean(value, "SafeVideoElement.setMuted.value");
      context.setIDL(
        realEl,
        primitive,
        () => context.platform.getMediaMuted(realEl),
        (next) => context.platform.setMediaMuted(realEl, next),
      );
    },
    setPoster(url: string): SafeURLDecision {
      return applyURLDecision(
        context,
        realEl,
        "poster",
        () => context.urlPolicy.decide("video.poster", url),
      );
    },
  }) as SafeVideoElement, realEl, "video");
}

export function createSafeAudioElement(
  context: DocumentContext,
  realEl: HTMLAudioElement,
): SafeAudioElement {
  const known = context.registry.getWrapper<SafeAudioElement>(realEl);
  if (known) return known;
  const base = buildSafeContainerElement(context, realEl);

  return context.complete(Object.assign(base, {
    setSrc(url: string): SafeURLDecision {
      return applyURLDecision(
        context,
        realEl,
        "src",
        () => context.urlPolicy.decide("audio.src", url),
      );
    },
    setControls(value: boolean): void {
      const primitive = requireBoolean(value, "SafeAudioElement.setControls.value");
      context.setReflectedIDL(realEl, "controls", primitive ? "" : null, () => {
        context.platform.setMediaControls(realEl, primitive);
      });
    },
    setAutoplay(value: boolean): void {
      const primitive = requireBoolean(value, "SafeAudioElement.setAutoplay.value");
      context.setReflectedIDL(realEl, "autoplay", primitive ? "" : null, () => {
        context.platform.setMediaAutoplay(realEl, primitive);
      });
    },
    setLoop(value: boolean): void {
      const primitive = requireBoolean(value, "SafeAudioElement.setLoop.value");
      context.setReflectedIDL(realEl, "loop", primitive ? "" : null, () => {
        context.platform.setMediaLoop(realEl, primitive);
      });
    },
    setMuted(value: boolean): void {
      const primitive = requireBoolean(value, "SafeAudioElement.setMuted.value");
      context.setIDL(
        realEl,
        primitive,
        () => context.platform.getMediaMuted(realEl),
        (next) => context.platform.setMediaMuted(realEl, next),
      );
    },
  }) as SafeAudioElement, realEl, "audio");
}

export function createSafeSourceElement(
  context: DocumentContext,
  realEl: HTMLSourceElement,
): SafeSourceElement {
  const known = context.registry.getWrapper<SafeSourceElement>(realEl);
  if (known) return known;
  const base = buildSafeElement(context, realEl);

  return context.complete(Object.assign(base, {
    setSrc(url: string): SafeURLDecision {
      return applyURLDecision(
        context,
        realEl,
        "src",
        () => context.urlPolicy.decide("source.src", url),
      );
    },
    setType(value: string): void {
      attribute(context, realEl, "type", requireMimeType(value, "SafeSourceElement.setType.value"));
    },
  }) as SafeSourceElement, realEl, "source");
}

export function createSafeTrackElement(
  context: DocumentContext,
  realEl: HTMLTrackElement,
): SafeTrackElement {
  const known = context.registry.getWrapper<SafeTrackElement>(realEl);
  if (known) return known;
  const base = buildSafeElement(context, realEl);

  return context.complete(Object.assign(base, {
    setKind(value: TrackKind): void {
      attribute(
        context,
        realEl,
        "kind",
        requireAsciiKeyword(value, TRACK_KINDS, "SafeTrackElement.setKind.value"),
      );
    },
    setSrc(url: string): SafeURLDecision {
      return applyURLDecision(
        context,
        realEl,
        "src",
        () => context.urlPolicy.decide("track.src", url),
      );
    },
    setSrcLang(value: string): void {
      const primitive = requireString(value, "SafeTrackElement.setSrcLang.value");
      if (primitive.length === 0) throw invalidArgument("SafeTrackElement.setSrcLang.value");
      attribute(context, realEl, "srclang", primitive);
    },
    setLabel(value: string): void {
      const primitive = requireString(value, "SafeTrackElement.setLabel.value");
      if (primitive.length === 0) throw invalidArgument("SafeTrackElement.setLabel.value");
      attribute(context, realEl, "label", primitive);
    },
    setDefault(value: boolean): void {
      booleanAttribute(
        context,
        realEl,
        "default",
        requireBoolean(value, "SafeTrackElement.setDefault.value"),
      );
    },
  }), realEl, "track");
}

export function createSafeCanvasElement(context: DocumentContext, realEl: HTMLCanvasElement): SafeCanvasElement {
  const known = context.registry.getWrapper<SafeCanvasElement>(realEl);
  if (known) return known;
  const base = buildSafeContainerElement(context, realEl);

  return context.complete(Object.assign(base, {
    setWidth(value: number): void {
      const width = requireIntegerInRange(value, 0, 4_294_967_295, "SafeCanvasElement.setWidth.value");
      context.setCanvasDimension(realEl, "width", width);
    },
    setHeight(value: number): void {
      const height = requireIntegerInRange(value, 0, 4_294_967_295, "SafeCanvasElement.setHeight.value");
      context.setCanvasDimension(realEl, "height", height);
    },
  }) as SafeCanvasElement, realEl, "canvas");
}

export function createSafeTableCellElement(
  context: DocumentContext,
  realEl: HTMLTableCellElement,
  specializedKind: "th" | "td",
): SafeTableCellElement {
  const known = context.registry.getWrapper<SafeTableCellElement>(realEl);
  if (known) return known;
  const base = buildSafeContainerElement(context, realEl);
  const setColSpan = (value: number): void => {
    const span = requireIntegerInRange(
      value,
      1,
      1_000,
      "SafeTableCellElement.setColspan.value",
    );
    context.setReflectedIDL(realEl, "colspan", `${span}`, () => {
      context.platform.setTableColSpan(realEl, span);
    });
  };
  const setRowSpan = (value: number): void => {
    const span = requireIntegerInRange(
      value,
      0,
      65_534,
      "SafeTableCellElement.setRowspan.value",
    );
    context.setReflectedIDL(realEl, "rowspan", `${span}`, () => {
      context.platform.setTableRowSpan(realEl, span);
    });
  };

  return context.complete(Object.assign(base, {
    setColSpan,
    setColspan: setColSpan,
    setRowSpan,
    setRowspan: setRowSpan,
    setScope(value: string): void {
      attribute(context, realEl, "scope", requireAsciiKeyword(value, TABLE_SCOPE_VALUES, "SafeTableCellElement.setScope.value"));
    },
    setHeaders(value: string): void {
      context.setLocalIdReference(
        realEl,
        "headers",
        requireString(value, "SafeTableCellElement.setHeaders.value"),
        "list",
      );
    },
    getHeaders(): string {
      return context.getLocalIdReference(realEl, "headers") ?? "";
    },
  }) as SafeTableCellElement, realEl, specializedKind);
}

export function createSafeDetailsElement(context: DocumentContext, realEl: HTMLDetailsElement): SafeDetailsElement {
  const known = context.registry.getWrapper<SafeDetailsElement>(realEl);
  if (known) return known;
  const base = buildSafeContainerElement(context, realEl);

  return context.complete(Object.assign(base, {
    setOpen(value: boolean): void {
      const primitive = requireBoolean(value, "SafeDetailsElement.setOpen.value");
      context.setReflectedIDL(realEl, "open", primitive ? "" : null, () => {
        context.platform.setDetailsOpen(realEl, primitive);
      });
    },
  }) as SafeDetailsElement, realEl, "details");
}

export function createSafeDialogElement(context: DocumentContext, realEl: HTMLDialogElement): SafeDialogElement {
  const known = context.registry.getWrapper<SafeDialogElement>(realEl);
  if (known) return known;
  const base = buildSafeContainerElement(context, realEl);

  return context.complete(Object.assign(base, {
    setOpen(value: boolean): void {
      const primitive = requireBoolean(value, "SafeDialogElement.setOpen.value");
      context.setReflectedIDL(realEl, "open", primitive ? "" : null, () => {
        context.platform.setDialogOpen(realEl, primitive);
      });
    },
  }) as SafeDialogElement, realEl, "dialog");
}

export function createSafeProgressElement(context: DocumentContext, realEl: HTMLProgressElement): SafeProgressElement {
  const known = context.registry.getWrapper<SafeProgressElement>(realEl);
  if (known) return known;
  const base = buildSafeContainerElement(context, realEl);

  return context.complete(Object.assign(base, {
    setValue(value: number): void {
      const candidate = requireFinite(value, "SafeProgressElement.setValue.value");
      context.setReflectedIDL(realEl, "value", `${candidate}`, () => {
        const maximum = context.platform.getProgressMax(realEl);
        if (candidate < 0 || candidate > maximum) {
          throw invalidArgument("SafeProgressElement.setValue.range");
        }
        context.platform.setProgressValue(realEl, candidate);
      });
    },
    setMax(value: number): void {
      const candidate = requireFinite(value, "SafeProgressElement.setMax.value");
      context.setReflectedIDL(realEl, "max", `${candidate}`, () => {
        if (candidate <= 0 || candidate < context.platform.getProgressValue(realEl)) {
          throw invalidArgument("SafeProgressElement.setMax.range");
        }
        context.platform.setProgressMax(realEl, candidate);
      });
    },
  }) as SafeProgressElement, realEl, "progress");
}

export function createSafeMeterElement(context: DocumentContext, realEl: HTMLMeterElement): SafeMeterElement {
  const known = context.registry.getWrapper<SafeMeterElement>(realEl);
  if (known) return known;
  const base = buildSafeContainerElement(context, realEl);

  return context.complete(Object.assign(base, {
    setValue(value: number): void {
      const candidate = requireFinite(value, "SafeMeterElement.setValue.value");
      context.setReflectedIDL(realEl, "value", `${candidate}`, () => {
        const minimum = context.platform.getMeterMin(realEl);
        const maximum = context.platform.getMeterMax(realEl);
        if (candidate < minimum || candidate > maximum) {
          throw invalidArgument("SafeMeterElement.setValue.range");
        }
        context.platform.setMeterValue(realEl, candidate);
      });
    },
    setMin(value: number): void {
      const candidate = requireFinite(value, "SafeMeterElement.setMin.value");
      context.setReflectedIDL(realEl, "min", `${candidate}`, () => {
        const maximum = context.platform.getMeterMax(realEl);
        const currentValue = context.platform.getMeterValue(realEl);
        if (candidate >= maximum || candidate > currentValue) {
          throw invalidArgument("SafeMeterElement.setMin.range");
        }
        context.platform.setMeterMin(realEl, candidate);
      });
    },
    setMax(value: number): void {
      const candidate = requireFinite(value, "SafeMeterElement.setMax.value");
      context.setReflectedIDL(realEl, "max", `${candidate}`, () => {
        const minimum = context.platform.getMeterMin(realEl);
        const currentValue = context.platform.getMeterValue(realEl);
        if (candidate <= minimum || candidate < currentValue) {
          throw invalidArgument("SafeMeterElement.setMax.range");
        }
        context.platform.setMeterMax(realEl, candidate);
      });
    },
  }) as SafeMeterElement, realEl, "meter");
}

export function createSafeListElement(context: DocumentContext, realEl: HTMLUListElement | HTMLOListElement): SafeListElement {
  const known = context.registry.getWrapper<SafeListElement>(realEl);
  if (known) return known;
  const base = buildSafeContainerElement(context, realEl);

  return context.complete(Object.assign(base, {
    createItem(): SafeContainerElement {
      return createSafeContainerElement(context, context.createElement("li"));
    },
  }) as SafeListElement, realEl, "list");
}

export function createSafeDescriptionListElement(context: DocumentContext, realEl: HTMLDListElement): SafeDescriptionListElement {
  const known = context.registry.getWrapper<SafeDescriptionListElement>(realEl);
  if (known) return known;
  const base = buildSafeContainerElement(context, realEl);

  return context.complete(Object.assign(base, {
    createTerm(): SafeContainerElement {
      return createSafeContainerElement(context, context.createElement("dt"));
    },
    createDescription(): SafeContainerElement {
      return createSafeContainerElement(context, context.createElement("dd"));
    },
  }) as SafeDescriptionListElement, realEl, "description-list");
}
