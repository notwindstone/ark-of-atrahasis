// @vitest-environment jsdom

import { beforeEach, describe, expect, test } from "vitest";
import { createTestSafeDocument as createSafeDocument } from "./support/create-safe-document.ts";

beforeEach(() => {
  document.body.replaceChildren();
});

describe("opt-in structural non-credential form controls", () => {
  test("created buttons are non-submitting and reject submit/reset states", () => {
    const form = document.createElement("form");
    const host = document.createElement("div");
    host.style.contain = "paint";
    form.append(host);
    document.body.append(form);
    const root = host.attachShadow({ mode: "open" });
    const safeDocument = createSafeDocument(root);

    const button = safeDocument.createButton();
    safeDocument.appendChild(button);
    const physical = root.querySelector("button");

    if (!(physical instanceof HTMLButtonElement)) throw new Error("expected a physical button");
    const initialType = physical.type;
    let submitError: unknown;
    try {
      button.setType("submit" as "button");
    } catch (error) {
      submitError = error;
    }

    expect({ initialType, submitError }).toMatchObject({
      initialType: "button",
      submitError: {
      name: "SafeDOMError",
      code: "ERR_INVALID_ARGUMENT",
      operation: "SafeButtonElement.setType.type",
      message: "The operation received an invalid argument",
      },
    });
    expect(physical.form).toBeNull();
    expect(() => button.setType("reset" as "button")).toThrowError(expect.objectContaining({
      code: "ERR_INVALID_ARGUMENT",
      operation: "SafeButtonElement.setType.type",
    }));
    expect(physical.type).toBe("button");
  });
});
