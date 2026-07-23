// @vitest-environment jsdom

import { beforeEach, describe, expect, test } from "vitest";
import {
  createSafeDocument,
  type SafeFormControlPolicy,
} from "../src/index.ts";
import { createContainedRoot } from "./support/contained-root.ts";
import { testHarden } from "./support/harden.ts";

const NON_CREDENTIAL_FORM_CONTROL_GRANT = Object.freeze({
  allowNonCredentialFormElements: true,
}) satisfies SafeFormControlPolicy;

const FORM_FACTORY_OPERATIONS = [
  ["createButton", "SafeDocument.createButton.policy"],
  ["createInput", "SafeDocument.createInput.policy"],
  ["createSelect", "SafeDocument.createSelect.policy"],
  ["createOption", "SafeDocument.createOption.policy"],
  ["createOptgroup", "SafeDocument.createOptgroup.policy"],
  ["createTextarea", "SafeDocument.createTextarea.policy"],
  ["createLabel", "SafeDocument.createLabel.policy"],
  ["createFieldset", "SafeDocument.createFieldset.policy"],
  ["createLegend", "SafeDocument.createLegend.policy"],
  ["createOutput", "SafeDocument.createOutput.policy"],
  ["createImage", "SafeDocument.createImage.policy"],
] as const;

beforeEach(() => {
  document.body.replaceChildren();
});

describe("guest-readable non-credential form-control policy", () => {
  test("strict default denies the complete public form surface before native node creation", () => {
    const root = createContainedRoot();
    const originalCreateElement = Document.prototype.createElement;
    const createdTags: string[] = [];
    Document.prototype.createElement = function createElement(
      tagName: string,
      options?: ElementCreationOptions,
    ): HTMLElement {
      createdTags.push(tagName);
      return originalCreateElement.call(this, tagName, options);
    };

    try {
      const safeDocument = createSafeDocument(root, { harden: testHarden });
      for (const [factoryName, operation] of FORM_FACTORY_OPERATIONS) {
        expect(() => safeDocument[factoryName]()).toThrowError(expect.objectContaining({
          code: "FORM_CONTROL_POLICY_REQUIRED",
          operation,
        }));
      }
    } finally {
      Document.prototype.createElement = originalCreateElement;
    }

    expect(createdTags).toEqual([]);
    expect(root.childNodes).toHaveLength(0);
  });

  test("explicit host grant enables the complete non-credential form surface with safe defaults", () => {
    const root = createContainedRoot();
    const originalCreateElement = Document.prototype.createElement;
    const createdElements: Element[] = [];
    Document.prototype.createElement = function createElement(
      tagName: string,
      options?: ElementCreationOptions,
    ): HTMLElement {
      const element = originalCreateElement.call(this, tagName, options);
      createdElements.push(element);
      return element;
    };

    const {
      safeDocument,
      button,
      input,
      select,
      option,
      optgroup,
      textarea,
      label,
      fieldset,
      legend,
      output,
      image,
    } = (() => {
      try {
        const safeDocument = createSafeDocument(root, {
          harden: testHarden,
          formControlPolicy: NON_CREDENTIAL_FORM_CONTROL_GRANT,
        });
        return {
          safeDocument,
          button: safeDocument.createButton(),
          input: safeDocument.createInput(),
          select: safeDocument.createSelect(),
          option: safeDocument.createOption(),
          optgroup: safeDocument.createOptgroup(),
          textarea: safeDocument.createTextarea(),
          label: safeDocument.createLabel(),
          fieldset: safeDocument.createFieldset(),
          legend: safeDocument.createLegend(),
          output: safeDocument.createOutput(),
          image: safeDocument.createImage(),
        };
      } finally {
        Document.prototype.createElement = originalCreateElement;
      }
    })();

    expect(createdElements.map(({ localName }) => localName)).toEqual([
      "button", "input", "select", "option", "optgroup", "textarea",
      "label", "fieldset", "legend", "output", "img",
    ]);
    const rawDetachedButton = createdElements[0];
    expect(rawDetachedButton).toBeInstanceOf(HTMLButtonElement);
    expect((rawDetachedButton as HTMLButtonElement).type).toBe("button");
    expect(rawDetachedButton?.isConnected).toBe(false);

    option.setValue("choice");
    option.setText("choice");
    optgroup.appendChild(option);
    select.appendChild(optgroup);
    input.setId("control");
    input.setName("input-name");
    textarea.setName("textarea-name");
    select.setName("select-name");
    button.setName("button-name");
    label.setFor("control");
    input.setValue("input-value");
    textarea.setValue("textarea-value");
    select.setValue("choice");
    output.setText("output-value");
    image.setAlt("image-value");
    fieldset.appendChild(legend);
    fieldset.appendChild(label);
    fieldset.appendChild(input);
    fieldset.appendChild(textarea);
    fieldset.appendChild(select);
    fieldset.appendChild(button);
    fieldset.appendChild(output);
    safeDocument.appendChild(fieldset);
    safeDocument.appendChild(image);

    expect([input.getValue(), textarea.getValue(), select.getValue()]).toEqual([
      "input-value",
      "textarea-value",
      "choice",
    ]);
    const rawInput = root.querySelector("input");
    const rawLabel = root.querySelector("label");
    const rawButton = root.querySelector("button");
    if (
      !(rawInput instanceof HTMLInputElement)
      || !(rawLabel instanceof HTMLLabelElement)
      || !(rawButton instanceof HTMLButtonElement)
    ) {
      throw new Error("expected the complete form fixture to be mounted");
    }
    expect(rawButton.type).toBe("button");
    expect(rawInput.id).toMatch(/^aoa-i-[0-9a-f]{48}$/u);
    expect(rawInput.id).not.toBe("control");
    expect(rawInput.name).toMatch(/^aoa-n-[0-9a-f]{48}$/u);
    expect(rawLabel.htmlFor).toBe(rawInput.id);
    for (const dangerousType of ["password", "hidden", "file", "submit", "reset"]) {
      expect(() => Reflect.apply(input.setType, undefined, [dangerousType])).toThrowError(
        expect.objectContaining({ code: "ERR_INVALID_ARGUMENT" }),
      );
    }
    expect(() => Reflect.apply(input.setAutocomplete, undefined, ["current-password"]))
      .toThrowError(expect.objectContaining({ code: "ERR_INVALID_ARGUMENT" }));
  });

  test.each([
    {
      label: "explicit undefined policy",
      makeOptions: () => ({ harden: testHarden, formControlPolicy: undefined }),
      operation: "createSafeDocument.options.formControlPolicy",
    },
    {
      label: "non-record policy",
      makeOptions: () => ({ harden: testHarden, formControlPolicy: true }),
      operation: "createSafeDocument.options.formControlPolicy",
    },
    {
      label: "options accessor",
      makeOptions: () => Object.defineProperty({ harden: testHarden }, "formControlPolicy", {
        get() {
          return NON_CREDENTIAL_FORM_CONTROL_GRANT;
        },
      }),
      operation: "createSafeDocument.options.formControlPolicy",
    },
    {
      label: "grant accessor",
      makeOptions: () => ({
        harden: testHarden,
        formControlPolicy: Object.defineProperty(
          {},
          "allowNonCredentialFormElements",
          { get: () => true },
        ),
      }),
      operation:
        "createSafeDocument.options.formControlPolicy.allowNonCredentialFormElements",
    },
    {
      label: "boxed stateful value",
      makeOptions: () => ({
        harden: testHarden,
        formControlPolicy: {
          allowNonCredentialFormElements: {
            valueOf() {
              throw new Error("must not coerce");
            },
          },
        },
      }),
      operation:
        "createSafeDocument.options.formControlPolicy.allowNonCredentialFormElements",
    },
    {
      label: "extra policy state",
      makeOptions: () => ({
        harden: testHarden,
        formControlPolicy: {
          allowNonCredentialFormElements: true,
          mutableMode: "later",
        },
      }),
      operation: "createSafeDocument.options.formControlPolicy",
    },
  ])("rejects $label without consuming the root", ({ makeOptions, operation }) => {
    const root = createContainedRoot();
    expect(() => createSafeDocument(root, makeOptions() as never)).toThrowError(
      expect.objectContaining({ code: "ERR_INVALID_POLICY", operation }),
    );

    const safeDocument = createSafeDocument(root, {
      harden: testHarden,
      formControlPolicy: NON_CREDENTIAL_FORM_CONTROL_GRANT,
    });
    expect(() => safeDocument.createInput()).not.toThrow();
  });
});
