import assert from "node:assert/strict";
import test from "node:test";
import "ses";

// This suite exercises the built package with Node's test runner.

import { JSDOM } from "jsdom";
import { EXPECTED_RUNTIME_EXPORTS } from "../scripts/runtime-export-contract.mjs";

lockdown();

const api = await import("../dist/index.js");
const { TRACK_KINDS, createSafeDocument } = api;

const options = Object.freeze({ harden });
const formControlOptions = Object.freeze({
  harden,
  formControlPolicy: Object.freeze({
    allowNonCredentialFormElements: true,
  }),
});

function createRoot() {
  const dom = new JSDOM("<!doctype html><div id=host></div>", {
    url: "https://host.example.test/",
  });
  const host = dom.window.document.getElementById("host");
  host.style.contain = "paint";
  const root = host.attachShadow({ mode: "closed" });
  return { dom, root };
}

test("exports exactly the documented sorted runtime namespace", () => {
  assert.deepEqual(Object.keys(api).sort(), EXPECTED_RUNTIME_EXPORTS);
  assert.deepEqual(TRACK_KINDS, [
    "subtitles", "captions", "descriptions", "chapters", "metadata",
  ]);
  assert.equal(Object.isFrozen(TRACK_KINDS), true);
});

test("fails closed without a native ShadowRoot capability", () => {
  assert.throws(
    () => createSafeDocument("host", options),
    (error) => error?.code === "INVALID_ROOT" && !Object.hasOwn(error, "stack"),
  );
});

test("does not expose the removed resource-control API", () => {
  assert.equal(Object.hasOwn(api, "DEFAULT_SAFE_DOCUMENT_QUOTAS"), false);
  assert.equal(Object.hasOwn(api, "DEFAULT_SAFE_DOCUMENT_RATES"), false);
  assert.equal(api.isSafeDOMError(Object.freeze({
    name: "SafeDOMError",
    code: "QUOTA_EXCEEDED",
    operation: "legacy quota operation",
    message: "A safe document quota was exceeded",
  })), false);
  assert.equal(api.isSafeDOMError(Object.freeze({
    name: "SafeDOMError",
    code: "RATE_LIMIT_EXCEEDED",
    operation: "legacy rate operation",
    message: "A safe document rate limit was exceeded",
  })), false);
  assert.equal(api.isSafeDOMError(Object.freeze({
    name: "SafeDOMError",
    code: "INVALID_QUOTA",
    operation: "legacy quota configuration",
    message: "The quota configuration is invalid",
  })), false);
  assert.equal(api.isSafeDOMError(Object.freeze({
    name: "SafeDOMError",
    code: "INVALID_RATE",
    operation: "legacy rate configuration",
    message: "The rate configuration is invalid",
  })), false);
});

test("rejects legacy resource-control options without claiming the root", () => {
  for (const [name, value] of [
    ["quotas", { operations: 1 }],
    ["rates", { operations: { limit: 1, windowMs: 1_000 } }],
  ]) {
    const { root } = createRoot();
    assert.throws(
      () => createSafeDocument(root, { ...options, [name]: value }),
      (error) => error?.code === "ERR_INVALID_POLICY"
        && error.operation === `createSafeDocument.options.${name}`,
    );
    assert.doesNotThrow(() => createSafeDocument(root, options).dispose());
  }
});

test("mounts only into the claimed ShadowRoot and treats markup as text", () => {
  const { root } = createRoot();
  const safeDocument = createSafeDocument(root, options);
  const message = safeDocument.createDiv();

  message.setText('<img src="x" onerror="alert(1)">');
  safeDocument.appendChild(message);

  assert.equal(root.children.length, 1);
  assert.equal(root.children[0].tagName, "DIV");
  assert.equal(root.children[0].textContent, '<img src="x" onerror="alert(1)">');
});

test("requires paint containment on the host boundary", () => {
  const dom = new JSDOM("<!doctype html><div id=host></div>");
  const host = dom.window.document.getElementById("host");
  const root = host.attachShadow({ mode: "closed" });

  assert.throws(
    () => createSafeDocument(root, options),
    (error) => error?.code === "INVALID_ROOT"
      && error?.operation === "createSafeDocument.root.containment",
  );
});

test("exports compatible text factories and detached list-local helpers", () => {
  const { root } = createRoot();
  const safeDocument = createSafeDocument(root, options);
  const paragraph = safeDocument.createParagraph();
  const text = safeDocument.createTextNode();
  const list = safeDocument.createList("unordered");
  const item = list.createItem();

  assert.equal(safeDocument.createText, safeDocument.createParagraph);
  assert.equal(safeDocument.createRawText, safeDocument.createTextNode);
  assert.equal(safeDocument.createText().getText(), "");
  assert.equal(safeDocument.createRawText().getText(), "");
  assert.equal(paragraph.getText(), "");
  assert.equal(text.getText(), "");
  assert.equal(root.childNodes.length, 0);
  list.appendChild(item);
  safeDocument.appendChild(list);
  assert.equal(root.querySelector("ul")?.children.length, 1);
});

test("preferred and deprecated casing aliases are identical capabilities", () => {
  const { root } = createRoot();
  const safeDocument = createSafeDocument(root, formControlOptions);
  const input = safeDocument.createInput();
  const textarea = safeDocument.createTextarea();
  const cell = safeDocument.createTd();

  assert.equal(input.setReadOnly, input.setReadonly);
  assert.equal(input.setAutoFocus, input.setAutofocus);
  assert.equal(textarea.setReadOnly, textarea.setReadonly);
  assert.equal(cell.setColSpan, cell.setColspan);
  assert.equal(cell.setRowSpan, cell.setRowspan);

  input.setReadOnly(true);
  input.setAutoFocus(false);
  textarea.setReadonly(true);
  cell.setColSpan(2);
  cell.setRowspan(3);
  safeDocument.appendChild(input);
  safeDocument.appendChild(textarea);
  safeDocument.appendChild(cell);

  assert.equal(root.querySelector("input")?.readOnly, true);
  assert.equal(root.querySelector("input")?.autofocus, false);
  assert.equal(root.querySelector("textarea")?.readOnly, true);
  assert.equal(root.querySelector("td")?.colSpan, 2);
  assert.equal(root.querySelector("td")?.rowSpan, 3);

  safeDocument.dispose();
  for (const invoke of [
    () => input.setReadonly(false),
    () => input.setAutoFocus(false),
    () => textarea.setReadOnly(false),
    () => cell.setColspan(1),
    () => cell.setRowSpan(1),
  ]) {
    assert.throws(invoke, (error) => error?.code === "DOCUMENT_DISPOSED");
  }
});

test("strict default denies the complete public form surface and opt-in still rejects passwords", () => {
  const strictFixture = createRoot();
  const strictDocument = createSafeDocument(strictFixture.root, options);
  for (const [factory, operation] of [
    [() => strictDocument.createButton(), "SafeDocument.createButton.policy"],
    [() => strictDocument.createInput(), "SafeDocument.createInput.policy"],
    [() => strictDocument.createSelect(), "SafeDocument.createSelect.policy"],
    [() => strictDocument.createOption(), "SafeDocument.createOption.policy"],
    [() => strictDocument.createOptgroup(), "SafeDocument.createOptgroup.policy"],
    [() => strictDocument.createTextarea(), "SafeDocument.createTextarea.policy"],
    [() => strictDocument.createLabel(), "SafeDocument.createLabel.policy"],
    [() => strictDocument.createFieldset(), "SafeDocument.createFieldset.policy"],
    [() => strictDocument.createLegend(), "SafeDocument.createLegend.policy"],
    [() => strictDocument.createOutput(), "SafeDocument.createOutput.policy"],
    [() => strictDocument.createImage(), "SafeDocument.createImage.policy"],
  ]) {
    assert.throws(
      factory,
      (error) => error?.code === "FORM_CONTROL_POLICY_REQUIRED"
        && error?.operation === operation
        && Object.isFrozen(error),
    );
  }
  assert.equal(strictFixture.root.childNodes.length, 0);

  const { root } = createRoot();
  const safeDocument = createSafeDocument(root, formControlOptions);
  const input = safeDocument.createInput();

  assert.throws(
    () => input.setType("password"),
    (error) => error?.code === "ERR_INVALID_ARGUMENT",
  );
});

test("validates heading levels at the runtime boundary", () => {
  const { root } = createRoot();
  const safeDocument = createSafeDocument(root, options);

  assert.equal(safeDocument.createHeading(2).getText(), "");
  for (const invalid of [0, 7, Number.NaN, Number.POSITIVE_INFINITY, 1.5]) {
    assert.throws(
      () => safeDocument.createHeading(invalid),
      (error) => error?.code === "ERR_INVALID_ARGUMENT",
    );
  }
});

test("event cleanup removes the registered native listener", () => {
  const { dom, root } = createRoot();
  const safeDocument = createSafeDocument(root, formControlOptions);
  const button = safeDocument.createButton();
  safeDocument.appendChild(button);
  let calls = 0;
  const cleanup = button.onClick(() => {
    calls += 1;
  });
  const realButton = root.querySelector("button");

  realButton.dispatchEvent(new dom.window.MouseEvent("click"));
  cleanup();
  realButton.dispatchEvent(new dom.window.MouseEvent("click"));

  assert.equal(calls, 1);
});
