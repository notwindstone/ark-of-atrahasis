// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import {
  createSafeDocument,
  isSafeDOMError,
  type Hardener,
  type SafeFormControlPolicy,
} from "../src/index.ts";
import { createContainedRoot as makeRoot } from "./support/contained-root.ts";
import { testHarden } from "./support/harden.ts";

const FORM_CONTROL_POLICY = Object.freeze({
  allowNonCredentialFormElements: true,
}) satisfies SafeFormControlPolicy;

describe("capability completion boundary", () => {
  it("hardens a specialized wrapper only after its nested style and methods are complete", () => {
    const safeDocument = createSafeDocument(makeRoot(), {
      harden: testHarden,
      formControlPolicy: FORM_CONTROL_POLICY,
    });
    const input = safeDocument.createInput();

    expect(Object.isFrozen(input)).toBe(true);
    expect(Object.isFrozen(input.getValue)).toBe(true);
    expect(Object.isFrozen(input.style)).toBe(true);
    expect(Object.isFrozen(input.style.set)).toBe(true);
    expect(Reflect.set(input, "futureCapability", () => undefined)).toBe(false);
  });

  it.each([
    [
      "throws a raw value",
      () => {
        throw makeRoot();
      },
    ],
    ["returns a replacement", () => Object.freeze({ replacement: true })],
    ["becomes shallow", (value: unknown) => Object.freeze(value as object)],
    ["becomes a no-op", (value: unknown) => value],
  ])("fails closed when a stateful hardener %s after its probe", (_label, hostile) => {
    let calls = 0;
    const stateful = Object.freeze(<Value>(value: Value): Value => {
      calls += 1;
      if (calls === 1) return testHarden(value);
      return hostile(value) as Value;
    });

    expect(() => createSafeDocument(makeRoot(), { harden: stateful })).toThrowError(
      expect.objectContaining({
        code: "ERR_INVALID_HARDENER",
        operation: "createSafeDocument.options.harden",
      }),
    );
    try {
      createSafeDocument(makeRoot(), { harden: stateful });
    } catch (error) {
      expect(isSafeDOMError(error)).toBe(true);
    }
  });

  it.each([
    ["missing", {}],
    ["non-function", { harden: 1 }],
    ["identity-changing", { harden: Object.freeze(() => Object.freeze({})) }],
    [
      "shallow",
      {
        harden: Object.freeze(
          <Value>(value: Value): Value => Object.freeze(value as object) as Value,
        ),
      },
    ],
    ["no-op", { harden: Object.freeze(<Value>(value: Value): Value => value) }],
  ])("rejects a %s own harden option with one stable record", (_label, options) => {
    expect(() => createSafeDocument(makeRoot(), options as { harden: Hardener })).toThrowError(
      expect.objectContaining({ code: "ERR_INVALID_HARDENER" }),
    );
  });

  it("rejects an accessor harden option without invoking its thrown value", () => {
    const thrown = makeRoot();
    const options = Object.create(null) as { harden: Hardener };
    Object.defineProperty(options, "harden", {
      get() {
        throw thrown;
      },
    });

    expect(() => createSafeDocument(makeRoot(), options)).toThrowError(
      expect.objectContaining({ code: "ERR_INVALID_HARDENER" }),
    );
  });

  it("releases the exact root when document completion fails", () => {
    const root = makeRoot();
    let calls = 0;
    const stateful = Object.freeze(<Value>(value: Value): Value => {
      calls += 1;
      if (calls === 1) return testHarden(value);
      throw root;
    });

    expect(() => createSafeDocument(root, { harden: stateful })).toThrowError(
      expect.objectContaining({ code: "ERR_INVALID_HARDENER" }),
    );
    expect(() => createSafeDocument(root, { harden: testHarden })).not.toThrow();
  });

  it("rejects a frozen error-shaped record with a capability-bearing prototype", () => {
    const prototype = Object.freeze({ capability: Object.freeze(() => "authority") });
    const spoof = Object.freeze(Object.assign(Object.create(prototype), {
      name: "SafeDOMError",
      code: "ERR_INVALID_ARGUMENT",
      operation: "spoof",
      message: "The operation received an invalid argument",
    }));

    expect(isSafeDOMError(spoof)).toBe(false);
  });
});
