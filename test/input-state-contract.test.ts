// @vitest-environment jsdom

import { beforeEach, describe, expect, test } from "vitest";
import type { InputType, SafeInputElement } from "../src/index.ts";
import { createContainedRoot as makeRoot } from "./support/contained-root.ts";
import { createTestSafeDocument as createSafeDocument } from "./support/create-safe-document.ts";

function expectInvalid(action: () => unknown, operation: string): void {
  expect(action).toThrowError(expect.objectContaining({
    name: "SafeDOMError",
    code: "ERR_INVALID_ARGUMENT",
    operation,
    message: "The operation received an invalid argument",
  }));
}

beforeEach(() => {
  document.body.replaceChildren();
});

interface RangeGrammarCase {
  readonly type: InputType;
  readonly minimum: string;
  readonly maximum: string;
  readonly invalid: readonly string[];
}

const RANGE_GRAMMARS: readonly RangeGrammarCase[] = [
  { type: "date", minimum: "2024-02-29", maximum: "2024-12-31", invalid: ["2023-02-29", "0000-01-01"] },
  { type: "month", minimum: "2024-01", maximum: "2024-12", invalid: ["2024-13", "2024-1"] },
  { type: "week", minimum: "2020-W01", maximum: "2020-W53", invalid: ["2021-W53", "2020-w01"] },
  { type: "time", minimum: "00:00", maximum: "23:59:59.999", invalid: ["24:00", "12:00:00.0000"] },
  { type: "datetime-local", minimum: "2024-02-29 00:00", maximum: "2024-02-29T23:59:59.999", invalid: ["2023-02-29T00:00", "2024-02-29T24:00"] },
  { type: "number", minimum: "-.5", maximum: "1E+2", invalid: ["+1", "1e9999"] },
  { type: "range", minimum: ".5", maximum: "1.5", invalid: ["1.", " 1"] },
];

function appendInput(): { readonly input: SafeInputElement; readonly physical: HTMLInputElement } {
  const root = makeRoot();
  const safeDocument = createSafeDocument(root);
  const input = safeDocument.createInput();
  safeDocument.appendChild(input);
  const physical = root.querySelector("input");
  if (!(physical instanceof HTMLInputElement)) throw new Error("expected physical input");
  return { input, physical };
}

describe("strict input state contracts", () => {
  test.each(RANGE_GRAMMARS)("$type uses its exact HTML min/max grammar", ({ type, minimum, maximum, invalid }) => {
    const { input, physical } = appendInput();
    input.setType(type);
    input.setMin(minimum);
    input.setMax(maximum);
    expect({ min: physical.getAttribute("min"), max: physical.getAttribute("max") }).toEqual({ min: minimum, max: maximum });
    for (const value of invalid) {
      expectInvalid(() => input.setMin(value), "SafeInputElement.setMin.value");
      expect(physical.getAttribute("min")).toBe(minimum);
    }
  });

  test("time explicitly accepts a periodic range spanning midnight", () => {
    const { input, physical } = appendInput();
    input.setType("time");
    input.setMin("23:00");
    input.setMax("01:00");
    expect({ min: physical.min, max: physical.max }).toEqual({ min: "23:00", max: "01:00" });
  });

  test("step accepts case-insensitive any or positive finite HTML floats only", () => {
    for (const [value, expected] of [["ANY", "any"], [".5", ".5"], ["1e-2", "1e-2"]] as const) {
      const { input, physical } = appendInput();
      input.setType("number");
      input.setStep(value);
      expect(physical.getAttribute("step")).toBe(expected);
    }
    for (const value of ["", "0", "-1", "+1", "1.", "Infinity", "1e9999"]) {
      const { input, physical } = appendInput();
      input.setType("number");
      expectInvalid(() => input.setStep(value), "SafeInputElement.setStep.value");
      expect(physical.hasAttribute("step")).toBe(false);
    }
  });

  test("type transitions reparse constraints for the target state", () => {
    const { input, physical } = appendInput();
    input.setType("date");
    input.setMin("2024-01-01");

    expectInvalid(() => input.setType("month"), "SafeInputElement.setType.state");
    expect({ type: physical.type, min: physical.min }).toEqual({ type: "date", min: "2024-01-01" });
  });

  test("type transitions reject native value sanitization instead of discarding guest state", () => {
    const { input, physical } = appendInput();
    input.setValue("not-a-number");
    expectInvalid(() => input.setType("number"), "SafeInputElement.setType.state");
    expect({ type: physical.type, value: physical.value }).toEqual({
      type: "text",
      value: "not-a-number",
    });
  });

  test.each([
    { type: "checkbox" as const, operation: "SafeInputElement.setReadonly.state", action: (input: SafeInputElement) => input.setReadonly(true) },
    { type: "checkbox" as const, operation: "SafeInputElement.setPlaceholder.state", action: (input: SafeInputElement) => input.setPlaceholder("x") },
    { type: "checkbox" as const, operation: "SafeInputElement.setAutocomplete.state", action: (input: SafeInputElement) => input.setAutocomplete("off") },
    { type: "range" as const, operation: "SafeInputElement.setRequired.state", action: (input: SafeInputElement) => input.setRequired(true) },
  ])("$operation rejects an inapplicable $type state", ({ type, operation, action }) => {
    const { input } = appendInput();
    input.setType(type);
    expectInvalid(() => action(input), operation);
  });

  test("type transitions reject latent attributes that do not apply to the target state", () => {
    const { input, physical } = appendInput();
    input.setPlaceholder("hint");
    expectInvalid(() => input.setType("date"), "SafeInputElement.setType.state");
    expect({ type: physical.type, placeholder: physical.placeholder }).toEqual({
      type: "text",
      placeholder: "hint",
    });
  });

  test.each(["hidden", "file", "password", "submit", "image", "reset", "button"])(
    "raw host-forced forbidden type $type makes setType fail closed",
    (type) => {
      const { input, physical } = appendInput();
      physical.type = type;
      expectInvalid(() => input.setType("text"), "SafeInputElement.setType.state");
      expect(physical.type).toBe(type);
    },
  );

  test("a raw forbidden state makes every state-specific setter fail closed", () => {
    const { input, physical } = appendInput();
    physical.type = "hidden";
    const cases = [
      ["SafeInputElement.setChecked.state", () => input.setChecked(true)],
      ["SafeInputElement.setMin.state", () => input.setMin("0")],
      ["SafeInputElement.setMax.state", () => input.setMax("1")],
      ["SafeInputElement.setStep.state", () => input.setStep("1")],
      ["SafeInputElement.setMinLength.state", () => input.setMinLength(1)],
      ["SafeInputElement.setMaxLength.state", () => input.setMaxLength(2)],
      ["SafeInputElement.setPattern.state", () => input.setPattern("[a--b]")],
    ] as const;
    for (const [operation, action] of cases) expectInvalid(action, operation);
    expect(physical.outerHTML).toBe('<input autocomplete="off" type="hidden">');
  });

  test.each([
    { operation: "SafeInputElement.setChecked.value", invoke: (input: SafeInputElement, value: unknown) => input.setChecked(value as boolean) },
    { operation: "SafeInputElement.setMin.value", invoke: (input: SafeInputElement, value: unknown) => input.setMin(value as string) },
    { operation: "SafeInputElement.setMax.value", invoke: (input: SafeInputElement, value: unknown) => input.setMax(value as string) },
    { operation: "SafeInputElement.setStep.value", invoke: (input: SafeInputElement, value: unknown) => input.setStep(value as string) },
    { operation: "SafeInputElement.setMinLength.value", invoke: (input: SafeInputElement, value: unknown) => input.setMinLength(value as number) },
    { operation: "SafeInputElement.setMaxLength.value", invoke: (input: SafeInputElement, value: unknown) => input.setMaxLength(value as number) },
    { operation: "SafeInputElement.setPattern.value", invoke: (input: SafeInputElement, value: unknown) => input.setPattern(value as string) },
  ])("$operation rejects hostile objects without coercion", ({ operation, invoke }) => {
    let traps = 0;
    const hostile = new Proxy({}, { get: () => { traps += 1; throw new Error("coercion executed"); } });
    expectInvalid(() => invoke(appendInput().input, hostile), operation);
    expect(traps).toBe(0);
  });

  test("checked applies only to checkbox and radio states", () => {
    const safeDocument = createSafeDocument(makeRoot());
    const input = safeDocument.createInput();

    expectInvalid(() => input.setChecked(true), "SafeInputElement.setChecked.state");
  });

  test("number range syntax and relations reject atomically", () => {
    const root = makeRoot();
    const safeDocument = createSafeDocument(root);
    const input = safeDocument.createInput();
    safeDocument.appendChild(input);
    const physical = root.querySelector("input");
    if (!(physical instanceof HTMLInputElement)) throw new Error("expected physical input");
    input.setType("number");

    expectInvalid(() => input.setMin("+1"), "SafeInputElement.setMin.value");
    input.setMax("10");
    expectInvalid(() => input.setMin("11"), "SafeInputElement.setMin.range");
    input.setMin("1");
    expectInvalid(() => input.setMax("0"), "SafeInputElement.setMax.range");

    expect({ min: physical.getAttribute("min"), max: physical.getAttribute("max") }).toEqual({ min: "1", max: "10" });
  });

  test("state value sanitization is an explicit error instead of a silent native rewrite", () => {
    const { input, physical } = appendInput();
    input.setType("number");
    expectInvalid(() => input.setValue("+1"), "SafeInputElement.setValue.value");
    expect(physical.value).toBe("");
    input.setValue("1.5");
    expect(physical.value).toBe("1.5");
  });

  test("text length relations reject before reflected IDL writes", () => {
    const root = makeRoot();
    const safeDocument = createSafeDocument(root);
    const input = safeDocument.createInput();
    safeDocument.appendChild(input);
    const physical = root.querySelector("input");
    if (!(physical instanceof HTMLInputElement)) throw new Error("expected physical input");

    input.setMaxLength(5);
    expectInvalid(() => input.setMinLength(6), "SafeInputElement.setMinLength.range");
    expect({ minLength: physical.minLength, maxLength: physical.maxLength }).toEqual({ minLength: -1, maxLength: 5 });
  });

  test("pattern is validated with owner-realm Unicode sets semantics", () => {
    const root = makeRoot();
    const safeDocument = createSafeDocument(root);
    const input = safeDocument.createInput();
    safeDocument.appendChild(input);

    expectInvalid(() => input.setPattern("[a-b-c]"), "SafeInputElement.setPattern.value");
    expect(root.querySelector("input")?.hasAttribute("pattern")).toBe(false);
  });

  test("range constraints apply only to compatible states and block incompatible type transitions atomically", () => {
    const root = makeRoot();
    const safeDocument = createSafeDocument(root);
    const input = safeDocument.createInput();
    safeDocument.appendChild(input);
    const physical = root.querySelector("input");
    if (!(physical instanceof HTMLInputElement)) throw new Error("expected physical input");

    expectInvalid(() => input.setMin("1"), "SafeInputElement.setMin.state");
    input.setType("number");
    input.setMin("1");
    input.setMax("10");
    expectInvalid(() => input.setType("text"), "SafeInputElement.setType.state");

    expect({ type: physical.type, min: physical.getAttribute("min"), max: physical.getAttribute("max") }).toEqual({
      type: "number",
      min: "1",
      max: "10",
    });
  });

  test("factories force non-form defaults before controls are returned", () => {
    const root = makeRoot();
    const safeDocument = createSafeDocument(root);
    const input = safeDocument.createInput();
    const textarea = safeDocument.createTextarea();
    const button = safeDocument.createButton();
    for (const control of [input, textarea, button]) safeDocument.appendChild(control);

    const physicalInput = root.querySelector("input");
    const physicalTextarea = root.querySelector("textarea");
    const physicalButton = root.querySelector("button");
    if (!(physicalInput instanceof HTMLInputElement)) throw new Error("expected physical input");
    if (!(physicalTextarea instanceof HTMLTextAreaElement)) throw new Error("expected physical textarea");
    if (!(physicalButton instanceof HTMLButtonElement)) throw new Error("expected physical button");
    const forbidden = ["form", "formaction", "formenctype", "formmethod", "formnovalidate", "formtarget", "name"];

    expect(physicalInput.autocomplete).toBe("off");
    expect(physicalTextarea.autocomplete).toBe("off");
    expect(physicalButton.type).toBe("button");
    for (const control of [physicalInput, physicalTextarea, physicalButton]) {
      for (const name of forbidden) expect(control.hasAttribute(name)).toBe(false);
      expect(control.form).toBeNull();
    }
  });
});
