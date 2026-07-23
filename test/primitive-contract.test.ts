// @vitest-environment jsdom

import { beforeEach, describe, expect, test } from "vitest";
import {
  ARIA_ROLES,
  BUTTON_TYPES,
  DIR_VALUES,
  ENTER_KEY_HINT_VALUES,
  FORMATTING_TAGS,
  HEADING_LEVELS,
  INPUT_MODE_VALUES,
  INPUT_TYPES,
  LIST_TYPES,
  TEXTAREA_WRAP_VALUES,
  TRACK_KINDS,
  type EventHandler,
  type SafeDocument,
} from "../src/index.ts";
import { createContainedRoot as makeRoot } from "./support/contained-root.ts";
import { createTestSafeDocument as createSafeDocument } from "./support/create-safe-document.ts";

beforeEach(() => {
  document.body.replaceChildren();
});

describe("representative public primitive contract", () => {
  test("input setType rejects a hostile non-primitive without executing coercion", () => {
    const safeDocument = createSafeDocument(makeRoot());
    const input = safeDocument.createInput();
    let traps = 0;
    const hostile = new Proxy({}, {
      get() {
        traps += 1;
        throw new Error("coercion executed");
      },
    });

    let thrown: unknown;
    try {
      input.setType(hostile as unknown as string);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toMatchObject({
      name: "SafeDOMError",
      code: "ERR_INVALID_ARGUMENT",
      operation: "SafeInputElement.setType.type",
      message: "The operation received an invalid argument",
    });
    expect(traps).toBe(0);
  });
});

interface PrimitiveCase {
  readonly operation: string;
  readonly invoke: (safeDocument: SafeDocument, hostile: unknown) => unknown;
}

function asString(value: unknown): string {
  return value as string;
}

function asBoolean(value: unknown): boolean {
  return value as boolean;
}

function asNumber(value: unknown): number {
  return value as number;
}

function asHandler(value: unknown): EventHandler {
  return value as EventHandler;
}

function hostileValue(): { readonly value: object; readonly traps: () => number } {
  let count = 0;
  return {
    value: new Proxy({}, {
      get() {
        count += 1;
        throw new Error("coercion executed");
      },
    }),
    traps: () => count,
  };
}

function capture(action: () => unknown): unknown {
  try {
    action();
    return undefined;
  } catch (error) {
    return error;
  }
}

const COMMON_CASES: readonly PrimitiveCase[] = [
  { operation: "SafeElement.setText.value", invoke: (doc, value) => doc.createDiv().setText(asString(value)) },
  { operation: "SafeElement.setClass.value", invoke: (doc, value) => doc.createDiv().setClass(asString(value)) },
  { operation: "SafeElement.setId.value", invoke: (doc, value) => doc.createDiv().setId(asString(value)) },
  { operation: "SafeElement.setTitle.value", invoke: (doc, value) => doc.createDiv().setTitle(asString(value)) },
  { operation: "SafeElement.setRole.value", invoke: (doc, value) => doc.createDiv().setRole(asString(value)) },
  { operation: "SafeElement.setTabIndex.value", invoke: (doc, value) => doc.createDiv().setTabIndex(asNumber(value)) },
  { operation: "SafeElement.setHidden.value", invoke: (doc, value) => doc.createDiv().setHidden(asBoolean(value)) },
  { operation: "SafeElement.setLang.value", invoke: (doc, value) => doc.createDiv().setLang(asString(value)) },
  { operation: "SafeElement.setDir.value", invoke: (doc, value) => doc.createDiv().setDir(asString(value)) },
  { operation: "SafeElement.setTranslate.value", invoke: (doc, value) => doc.createDiv().setTranslate(asBoolean(value)) },
  { operation: "SafeElement.setSpellcheck.value", invoke: (doc, value) => doc.createDiv().setSpellcheck(asBoolean(value)) },
  { operation: "SafeElement.setData.key", invoke: (doc, value) => doc.createDiv().setData(asString(value), "value") },
  { operation: "SafeElement.setData.value", invoke: (doc, value) => doc.createDiv().setData("key", asString(value)) },
  { operation: "SafeElement.getData.key", invoke: (doc, value) => doc.createDiv().getData(asString(value)) },
  { operation: "SafeElement.setAria.key", invoke: (doc, value) => doc.createDiv().setAria(asString(value), "value") },
  { operation: "SafeElement.setAria.value", invoke: (doc, value) => doc.createDiv().setAria("label", asString(value)) },
  { operation: "SafeElement.getAria.key", invoke: (doc, value) => doc.createDiv().getAria(asString(value)) },
  { operation: "SafeStyle.get.property", invoke: (doc, value) => doc.createDiv().style.get(asString(value)) },
  { operation: "SafeStyle.set.property", invoke: (doc, value) => doc.createDiv().style.set(asString(value), "red") },
  { operation: "SafeStyle.set.value", invoke: (doc, value) => doc.createDiv().style.set("color", asString(value)) },
  { operation: "SafeStyle.remove.property", invoke: (doc, value) => doc.createDiv().style.remove(asString(value)) },
];

const COMMON_LISTENERS = [
  "onClick", "onDblClick", "onMouseDown", "onMouseUp", "onMouseEnter", "onMouseLeave",
  "onMouseMove", "onPointerDown", "onPointerUp", "onPointerMove", "onContextMenu", "onKeyDown",
  "onKeyUp", "onFocus", "onBlur", "onTouchStart", "onTouchEnd", "onTouchMove", "onScroll",
] as const;

const FORM_CASES: readonly PrimitiveCase[] = [
  { operation: "SafeInputElement.setValue.value", invoke: (doc, value) => doc.createInput().setValue(asString(value)) },
  { operation: "SafeInputElement.setPlaceholder.value", invoke: (doc, value) => doc.createInput().setPlaceholder(asString(value)) },
  { operation: "SafeInputElement.setDisabled.value", invoke: (doc, value) => doc.createInput().setDisabled(asBoolean(value)) },
  { operation: "SafeInputElement.setReadonly.value", invoke: (doc, value) => doc.createInput().setReadonly(asBoolean(value)) },
  { operation: "SafeInputElement.setRequired.value", invoke: (doc, value) => doc.createInput().setRequired(asBoolean(value)) },
  { operation: "SafeInputElement.setChecked.value", invoke: (doc, value) => doc.createInput().setChecked(asBoolean(value)) },
  { operation: "SafeInputElement.setMin.value", invoke: (doc, value) => doc.createInput().setMin(asString(value)) },
  { operation: "SafeInputElement.setMax.value", invoke: (doc, value) => doc.createInput().setMax(asString(value)) },
  { operation: "SafeInputElement.setStep.value", invoke: (doc, value) => doc.createInput().setStep(asString(value)) },
  { operation: "SafeInputElement.setPattern.value", invoke: (doc, value) => doc.createInput().setPattern(asString(value)) },
  { operation: "SafeInputElement.setAutocomplete.value", invoke: (doc, value) => doc.createInput().setAutocomplete(asString(value)) },
  { operation: "SafeInputElement.setAutofocus.value", invoke: (doc, value) => doc.createInput().setAutofocus(asBoolean(value)) },
  { operation: "SafeInputElement.setName.value", invoke: (doc, value) => doc.createInput().setName(asString(value)) },
  { operation: "SafeInputElement.setInputMode.value", invoke: (doc, value) => doc.createInput().setInputMode(asString(value)) },
  { operation: "SafeInputElement.setEnterKeyHint.value", invoke: (doc, value) => doc.createInput().setEnterKeyHint(asString(value)) },
  { operation: "SafeInputElement.onChange.handler", invoke: (doc, value) => doc.createInput().onChange(asHandler(value)) },
  { operation: "SafeInputElement.onInput.handler", invoke: (doc, value) => doc.createInput().onInput(asHandler(value)) },
  { operation: "SafeTextareaElement.setValue.value", invoke: (doc, value) => doc.createTextarea().setValue(asString(value)) },
  { operation: "SafeTextareaElement.setPlaceholder.value", invoke: (doc, value) => doc.createTextarea().setPlaceholder(asString(value)) },
  { operation: "SafeTextareaElement.setDisabled.value", invoke: (doc, value) => doc.createTextarea().setDisabled(asBoolean(value)) },
  { operation: "SafeTextareaElement.setReadonly.value", invoke: (doc, value) => doc.createTextarea().setReadonly(asBoolean(value)) },
  { operation: "SafeTextareaElement.setRequired.value", invoke: (doc, value) => doc.createTextarea().setRequired(asBoolean(value)) },
  { operation: "SafeTextareaElement.setWrap.value", invoke: (doc, value) => doc.createTextarea().setWrap(asString(value)) },
  { operation: "SafeTextareaElement.setName.value", invoke: (doc, value) => doc.createTextarea().setName(asString(value)) },
  { operation: "SafeTextareaElement.setAutocomplete.value", invoke: (doc, value) => doc.createTextarea().setAutocomplete(asString(value)) },
  { operation: "SafeTextareaElement.onChange.handler", invoke: (doc, value) => doc.createTextarea().onChange(asHandler(value)) },
  { operation: "SafeTextareaElement.onInput.handler", invoke: (doc, value) => doc.createTextarea().onInput(asHandler(value)) },
  { operation: "SafeSelectElement.setValue.value", invoke: (doc, value) => doc.createSelect().setValue(asString(value)) },
  { operation: "SafeSelectElement.setDisabled.value", invoke: (doc, value) => doc.createSelect().setDisabled(asBoolean(value)) },
  { operation: "SafeSelectElement.setRequired.value", invoke: (doc, value) => doc.createSelect().setRequired(asBoolean(value)) },
  { operation: "SafeSelectElement.setMultiple.value", invoke: (doc, value) => doc.createSelect().setMultiple(asBoolean(value)) },
  { operation: "SafeSelectElement.setName.value", invoke: (doc, value) => doc.createSelect().setName(asString(value)) },
  { operation: "SafeSelectElement.onChange.handler", invoke: (doc, value) => doc.createSelect().onChange(asHandler(value)) },
  { operation: "SafeOptionElement.setValue.value", invoke: (doc, value) => doc.createOption().setValue(asString(value)) },
  { operation: "SafeOptionElement.setSelected.value", invoke: (doc, value) => doc.createOption().setSelected(asBoolean(value)) },
  { operation: "SafeOptionElement.setDisabled.value", invoke: (doc, value) => doc.createOption().setDisabled(asBoolean(value)) },
  { operation: "SafeOptionElement.setLabel.value", invoke: (doc, value) => doc.createOption().setLabel(asString(value)) },
  { operation: "SafeOptgroupElement.setLabel.value", invoke: (doc, value) => doc.createOptgroup().setLabel(asString(value)) },
  { operation: "SafeButtonElement.setDisabled.value", invoke: (doc, value) => doc.createButton().setDisabled(asBoolean(value)) },
  { operation: "SafeButtonElement.setName.value", invoke: (doc, value) => doc.createButton().setName(asString(value)) },
  { operation: "SafeButtonElement.setValue.value", invoke: (doc, value) => doc.createButton().setValue(asString(value)) },
];

const REMAINING_SIMPLE_CASES: readonly PrimitiveCase[] = [
  { operation: "SafeTextareaElement.setMinLength.value", invoke: (doc, value) => doc.createTextarea().setMinLength(asNumber(value)) },
  { operation: "SafeTextareaElement.setMaxLength.value", invoke: (doc, value) => doc.createTextarea().setMaxLength(asNumber(value)) },
  { operation: "SafeTextareaElement.setRows.value", invoke: (doc, value) => doc.createTextarea().setRows(asNumber(value)) },
  { operation: "SafeTextareaElement.setCols.value", invoke: (doc, value) => doc.createTextarea().setCols(asNumber(value)) },
  { operation: "SafeLabelElement.setFor.value", invoke: (doc, value) => doc.createLabel().setFor(asString(value)) },
  { operation: "SafeFieldsetElement.setDisabled.value", invoke: (doc, value) => doc.createFieldset().setDisabled(asBoolean(value)) },
  { operation: "SafeImageElement.setAlt.value", invoke: (doc, value) => doc.createImage().setAlt(asString(value)) },
  { operation: "SafeImageElement.setWidth.value", invoke: (doc, value) => doc.createImage().setWidth(asNumber(value)) },
  { operation: "SafeImageElement.setHeight.value", invoke: (doc, value) => doc.createImage().setHeight(asNumber(value)) },
  { operation: "SafeImageElement.setLoading.value", invoke: (doc, value) => doc.createImage().setLoading(asString(value)) },
  { operation: "SafeVideoElement.setWidth.value", invoke: (doc, value) => doc.createVideo().setWidth(asNumber(value)) },
  { operation: "SafeVideoElement.setHeight.value", invoke: (doc, value) => doc.createVideo().setHeight(asNumber(value)) },
  { operation: "SafeVideoElement.setControls.value", invoke: (doc, value) => doc.createVideo().setControls(asBoolean(value)) },
  { operation: "SafeVideoElement.setAutoplay.value", invoke: (doc, value) => doc.createVideo().setAutoplay(asBoolean(value)) },
  { operation: "SafeVideoElement.setLoop.value", invoke: (doc, value) => doc.createVideo().setLoop(asBoolean(value)) },
  { operation: "SafeVideoElement.setMuted.value", invoke: (doc, value) => doc.createVideo().setMuted(asBoolean(value)) },
  { operation: "SafeAudioElement.setControls.value", invoke: (doc, value) => doc.createAudio().setControls(asBoolean(value)) },
  { operation: "SafeAudioElement.setAutoplay.value", invoke: (doc, value) => doc.createAudio().setAutoplay(asBoolean(value)) },
  { operation: "SafeAudioElement.setLoop.value", invoke: (doc, value) => doc.createAudio().setLoop(asBoolean(value)) },
  { operation: "SafeAudioElement.setMuted.value", invoke: (doc, value) => doc.createAudio().setMuted(asBoolean(value)) },
  { operation: "SafeSourceElement.setType.value", invoke: (doc, value) => doc.createSource().setType(asString(value)) },
  { operation: "SafeTrackElement.setKind.value", invoke: (doc, value) => doc.createTrack().setKind(asString(value) as "subtitles") },
  { operation: "SafeTrackElement.setSrcLang.value", invoke: (doc, value) => doc.createTrack().setSrcLang(asString(value)) },
  { operation: "SafeTrackElement.setLabel.value", invoke: (doc, value) => doc.createTrack().setLabel(asString(value)) },
  { operation: "SafeTrackElement.setDefault.value", invoke: (doc, value) => doc.createTrack().setDefault(asBoolean(value)) },
  { operation: "SafeCanvasElement.setWidth.value", invoke: (doc, value) => doc.createCanvas().setWidth(asNumber(value)) },
  { operation: "SafeCanvasElement.setHeight.value", invoke: (doc, value) => doc.createCanvas().setHeight(asNumber(value)) },
  { operation: "SafeTableCellElement.setColspan.value", invoke: (doc, value) => doc.createTd().setColspan(asNumber(value)) },
  { operation: "SafeTableCellElement.setRowspan.value", invoke: (doc, value) => doc.createTd().setRowspan(asNumber(value)) },
  { operation: "SafeTableCellElement.setScope.value", invoke: (doc, value) => doc.createTd().setScope(asString(value)) },
  { operation: "SafeTableCellElement.setHeaders.value", invoke: (doc, value) => doc.createTd().setHeaders(asString(value)) },
  { operation: "SafeDetailsElement.setOpen.value", invoke: (doc, value) => doc.createDetails().setOpen(asBoolean(value)) },
  { operation: "SafeDialogElement.setOpen.value", invoke: (doc, value) => doc.createDialog().setOpen(asBoolean(value)) },
  { operation: "SafeProgressElement.setValue.value", invoke: (doc, value) => doc.createProgress().setValue(asNumber(value)) },
  { operation: "SafeProgressElement.setMax.value", invoke: (doc, value) => doc.createProgress().setMax(asNumber(value)) },
  { operation: "SafeMeterElement.setValue.value", invoke: (doc, value) => doc.createMeter().setValue(asNumber(value)) },
  { operation: "SafeMeterElement.setMin.value", invoke: (doc, value) => doc.createMeter().setMin(asNumber(value)) },
  { operation: "SafeMeterElement.setMax.value", invoke: (doc, value) => doc.createMeter().setMax(asNumber(value)) },
];

describe("public setter primitive table", () => {
  test.each([...COMMON_CASES, ...FORM_CASES, ...REMAINING_SIMPLE_CASES])("$operation", ({ operation, invoke }) => {
    const safeDocument = createSafeDocument(makeRoot());
    const hostile = hostileValue();
    const thrown = capture(() => invoke(safeDocument, hostile.value));

    expect(thrown).toMatchObject({
      name: "SafeDOMError",
      code: "ERR_INVALID_ARGUMENT",
      operation,
      message: "The operation received an invalid argument",
    });
    expect(thrown).not.toHaveProperty("stack");
    expect(thrown).not.toHaveProperty("cause");
    expect(hostile.traps()).toBe(0);
  });

  test.each(COMMON_LISTENERS)("SafeElement.%s.handler", (name) => {
    const safeDocument = createSafeDocument(makeRoot());
    const element = safeDocument.createDiv();
    const hostile = hostileValue();
    const thrown = capture(() => element[name](asHandler(hostile.value)));

    expect(thrown).toMatchObject({
      code: "ERR_INVALID_ARGUMENT",
      operation: `SafeElement.${name}.handler`,
    });
    expect(hostile.traps()).toBe(0);
  });
});

describe("keyword and operation contracts", () => {
  test("exported vocabularies are frozen strict-profile single sources of truth", () => {
    const vocabularies = [
      ARIA_ROLES,
      BUTTON_TYPES,
      DIR_VALUES,
      ENTER_KEY_HINT_VALUES,
      FORMATTING_TAGS,
      HEADING_LEVELS,
      INPUT_MODE_VALUES,
      INPUT_TYPES,
      LIST_TYPES,
      TEXTAREA_WRAP_VALUES,
      TRACK_KINDS,
    ];
    for (const vocabulary of vocabularies) expect(Object.isFrozen(vocabulary)).toBe(true);
    expect(INPUT_TYPES).toEqual([
      "text", "search", "tel", "url", "email", "date", "month", "week",
      "time", "datetime-local", "number", "range", "color", "checkbox", "radio",
    ]);
    expect(BUTTON_TYPES).toEqual(["button"]);
  });

  test("ASCII keyword setters normalize once and reject forbidden form states", () => {
    const root = makeRoot();
    const safeDocument = createSafeDocument(root);
    const common = safeDocument.createDiv();
    const input = safeDocument.createInput();
    const textarea = safeDocument.createTextarea();
    const button = safeDocument.createButton();
    safeDocument.appendChild(common);
    safeDocument.appendChild(input);
    safeDocument.appendChild(textarea);
    safeDocument.appendChild(button);

    common.setRole("BUTTON");
    common.setDir("RTL");
    input.setType("EMAIL");
    input.setInputMode("NUMERIC");
    input.setEnterKeyHint("DONE");
    textarea.setWrap("HARD");
    button.setType("BUTTON");

    const [physicalCommon, physicalInput, physicalTextarea, physicalButton] = root.children;
    expect(physicalCommon?.getAttribute("role")).toBe("button");
    expect(physicalCommon?.getAttribute("dir")).toBe("rtl");
    expect(physicalInput?.getAttribute("type")).toBe("email");
    expect(physicalInput?.getAttribute("inputmode")).toBe("numeric");
    expect(physicalInput?.getAttribute("enterkeyhint")).toBe("done");
    expect(physicalTextarea?.getAttribute("wrap")).toBe("hard");
    expect(physicalButton?.getAttribute("type")).toBe("button");

    for (const forbidden of ["hidden", "file", "password", "submit", "image", "reset", "button"]) {
      expect(() => input.setType(forbidden as "text")).toThrowError(expect.objectContaining({
        code: "ERR_INVALID_ARGUMENT",
        operation: "SafeInputElement.setType.type",
      }));
      expect(physicalInput?.getAttribute("type")).toBe("email");
    }
    expect(() => input.setAutocomplete("OFF" as "off")).toThrowError(expect.objectContaining({
      code: "ERR_INVALID_ARGUMENT",
      operation: "SafeInputElement.setAutocomplete.value",
    }));
    expect(() => input.setAutofocus(true as false)).toThrowError(expect.objectContaining({
      code: "ERR_INVALID_ARGUMENT",
      operation: "SafeInputElement.setAutofocus.value",
    }));
  });

  test("invalid preconditions precede terminal state without running coercion", () => {
    const safeDocument = createSafeDocument(makeRoot());
    const element = safeDocument.createDiv();
    const hostile = hostileValue();

    for (let index = 0; index < 3; index += 1) {
      expect(() => element.setClass(asString(hostile.value))).toThrowError(expect.objectContaining({
        code: "ERR_INVALID_ARGUMENT",
        operation: "SafeElement.setClass.value",
      }));
    }
    expect(hostile.traps()).toBe(0);
    expect(() => element.setClass("valid")).not.toThrow();

    element.dispose();
    expect(() => element.setClass(asString(hostile.value))).toThrowError(expect.objectContaining({
      code: "ERR_INVALID_ARGUMENT",
      operation: "SafeElement.setClass.value",
    }));
    expect(hostile.traps()).toBe(0);
    expect(() => element.setClass("after-dispose")).toThrowError(expect.objectContaining({
      code: "NODE_DISPOSED",
    }));
  });
});
