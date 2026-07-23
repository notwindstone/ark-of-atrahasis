import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { test } from "vitest";

import { isSafeDOMError } from "../src/errors.ts";
import {
  SAFE_STYLE_PROPERTIES,
  createStylePolicy,
  type SafeStylePolicy,
} from "../src/style-policy.ts";
import { createContainedRoot } from "./support/contained-root.ts";
import { createTestSafeDocument as createSafeDocument } from "./support/create-safe-document.ts";

function fixture(): { dom: JSDOM; root: ShadowRoot } {
  const dom = new JSDOM("<!doctype html><html><head><meta name=sentinel></head><body></body></html>");
  return { dom, root: createContainedRoot(dom.window.document) };
}

test("strict document exposes no raw stylesheet authority and style is default-deny", () => {
  const { dom, root } = fixture();
  const headBefore = dom.window.document.head.innerHTML;
  const safeDocument = createSafeDocument(root);
  const element = safeDocument.createDiv();

  assert.equal("createStyle" in safeDocument, false);
  assert.equal(dom.window.document.head.innerHTML, headBefore);
  assert.equal(dom.window.document.querySelector("style"), null);

  assert.deepEqual(Object.keys(element.style), ["get", "set", "remove"]);
  assert.equal(Object.isFrozen(element.style), true);
  assert.equal(Object.isFrozen(element.style.get), true);
  assert.equal(Object.isFrozen(element.style.set), true);
  assert.equal(Object.isFrozen(element.style.remove), true);
  assert.equal(element.style.set("color", "red"), false);
  assert.equal(element.style.get("color"), undefined);
  assert.equal(element.style.remove("color"), false);

  assert.equal(Reflect.set(element.style, "color", "red"), false);
  assert.equal((element.style as unknown as Record<string, unknown>).color, undefined);
});

test("generic lookup cannot turn a pre-existing style element into raw CSS authority", () => {
  const { dom, root } = fixture();
  const existing = dom.window.document.createElement("style");
  existing.id = "existing";
  existing.textContent = ".sentinel { color: green }";
  root.appendChild(existing);
  const before = existing.textContent;

  const safeDocument = createSafeDocument(root, {
    stylePolicy: { allowedProperties: ["color"] },
  });

  assert.equal(safeDocument.getElement("existing"), null);
  assert.equal(existing.textContent, before);
  assert.throws(
    () => createSafeDocument(existing as unknown as ShadowRoot),
    (error: unknown) => isSafeDOMError(error) && error.code === "INVALID_ROOT",
  );
});

test("explicit style policy canonicalizes known aliases and coherently gets/sets/removes", () => {
  const { root } = fixture();
  const safeDocument = createSafeDocument(root, {
    stylePolicy: {
      allowedProperties: ["color", "background-color", "cursor", "clip-path"],
    },
  });
  const style = safeDocument.createDiv().style;

  assert.equal(style.set("color", "rgb(255, 0, 0)"), true);
  assert.match(style.get("color") ?? "", /red|rgb\(255, 0, 0\)/);
  assert.equal(style.set("backgroundColor", "#fff"), true);
  assert.notEqual(style.get("background-color"), "");
  assert.equal(style.get("backgroundColor"), style.get("background-color"));

  assert.equal(style.set("width", "10px"), false, "library-safe but host-denied property");
  assert.equal(style.get("width"), undefined);
  assert.equal(style.remove("width"), false);

  assert.equal(style.remove("backgroundColor"), true);
  assert.equal(style.get("background-color"), "");
});

test("flow-relative style properties support direction-neutral host grants", () => {
  const { root } = fixture();
  const safeDocument = createSafeDocument(root, {
    stylePolicy: {
      allowedProperties: [
        "inline-size",
        "border-inline-start-color",
        "border-start-start-radius",
        "margin-inline-start",
        "padding-block-end",
        "inset-inline-end",
      ],
    },
  });
  const style = safeDocument.createDiv().style;

  assert.equal(style.set("inlineSize", "12rem"), true);
  assert.equal(style.set("borderInlineStartColor", "red"), true);
  assert.equal(style.set("border-start-start-radius", "4px"), true);
  assert.equal(style.set("marginInlineStart", "1rem"), true);
  assert.equal(style.set("padding-block-end", "2px"), true);
  assert.equal(style.set("insetInlineEnd", "0px"), true);
  assert.equal(style.get("inline-size"), "12rem");
  assert.match(style.get("border-inline-start-color") ?? "", /red|rgb\(255, 0, 0\)/u);
  assert.equal(style.get("borderStartStartRadius"), "4px");
  assert.equal(style.get("margin-inline-start"), "1rem");
  assert.equal(style.get("paddingBlockEnd"), "2px");
  assert.equal(style.get("inset-inline-end"), "0px");
});

test("logical style authority is exactly the reviewed 34-longhand set", () => {
  const expected = [
    "block-size",
    "border-block-end-color",
    "border-block-end-style",
    "border-block-end-width",
    "border-block-start-color",
    "border-block-start-style",
    "border-block-start-width",
    "border-end-end-radius",
    "border-end-start-radius",
    "border-inline-end-color",
    "border-inline-end-style",
    "border-inline-end-width",
    "border-inline-start-color",
    "border-inline-start-style",
    "border-inline-start-width",
    "border-start-end-radius",
    "border-start-start-radius",
    "inline-size",
    "inset-block-end",
    "inset-block-start",
    "inset-inline-end",
    "inset-inline-start",
    "margin-block-end",
    "margin-block-start",
    "margin-inline-end",
    "margin-inline-start",
    "max-block-size",
    "max-inline-size",
    "min-block-size",
    "min-inline-size",
    "padding-block-end",
    "padding-block-start",
    "padding-inline-end",
    "padding-inline-start",
  ].sort();
  const reviewedLonghand = /^(?:block-size|inline-size|(?:min|max)-(?:block|inline)-size|(?:margin|padding|inset)-(?:block|inline)-(?:start|end)|border-(?:block|inline)-(?:start|end)-(?:color|style|width)|border-(?:start|end)-(?:start|end)-radius)$/u;
  const actual = SAFE_STYLE_PROPERTIES.filter((property) => reviewedLonghand.test(property)).sort();
  const safeProperties: readonly string[] = SAFE_STYLE_PROPERTIES;

  assert.deepEqual(actual, expected);
  for (const property of [
    "direction",
    "overflow-block",
    "overflow-inline",
    "text-orientation",
    "unicode-bidi",
    "writing-mode",
  ]) {
    assert.equal(safeProperties.includes(property), false, property);
  }
  assert.equal(
    safeProperties.some((property) =>
      /^(?:(?:margin|padding|inset)-(?:block|inline)|border-(?:block|inline)(?:-(?:color|style|width))?|scroll-(?:margin|padding)-(?:block|inline)(?:-(?:start|end))?)$/u
        .test(property)),
    false,
    "logical shorthands and scroll variants remain outside the fixed ceiling",
  );
});

test("the style ceiling excludes properties that activate host-defined network resources", () => {
  const safeProperties: readonly string[] = SAFE_STYLE_PROPERTIES;

  for (const property of [
    "animation-duration",
    "animation-name",
    "display",
    "font-family",
    "font-style",
    "font-weight",
  ]) {
    assert.equal(safeProperties.includes(property), false, property);
  }
});

test("style values cannot smuggle URL/network CSS through escapes, comments, or indirection", () => {
  const { root } = fixture();
  const safeDocument = createSafeDocument(root, {
    stylePolicy: { allowedProperties: ["cursor", "clip-path", "color"] },
  });
  const style = safeDocument.createDiv().style;

  assert.equal(style.set("cursor", "pointer"), true);
  for (const value of [
    "url(https://attacker.test/pixel), auto",
    String.raw`u\72l(https://attacker.test/pixel), auto`,
    "u/**/r/**/l(https://attacker.test/pixel), auto",
    String.raw`image\2d set("https://attacker.test/pixel" 1x)`,
    'image("https://attacker.test/pixel")',
    'src("https://attacker.test/pixel")',
    String.raw`v\61r(--host-request)`,
    String.raw`e\6ev(request-token)`,
    String.raw`a\74tr(data-request type(<url>))`,
    '@import "https://attacker.test/a.css"',
    "red; background-image: url(https://attacker.test/pixel)",
    "pointer/*",
    "pointer\\",
  ]) {
    assert.equal(style.set("cursor", value), false, value);
    assert.equal(style.get("cursor"), "pointer", `rejected value changed state: ${value}`);
  }
});

test("style API never coerces hostile properties/values or consults a shadowed style getter", () => {
  const { root } = fixture();
  const safeDocument = createSafeDocument(root, {
    stylePolicy: { allowedProperties: ["color"] },
  });
  const element = safeDocument.createDiv();
  safeDocument.appendChild(element);
  const realElement = root.querySelector("div");
  assert.ok(realElement);

  let ownStyleReads = 0;
  Object.defineProperty(realElement, "style", {
    configurable: true,
    get() {
      ownStyleReads += 1;
      throw realElement;
    },
  });

  let coercions = 0;
  const hostile = {
    toString() {
      coercions += 1;
      return "color";
    },
    [Symbol.toPrimitive]() {
      coercions += 1;
      return "red";
    },
  };

  assert.throws(
    () => element.style.set(hostile as unknown as string, "red"),
    (error: unknown) => isSafeDOMError(error)
      && error.code === "ERR_INVALID_ARGUMENT"
      && error.operation === "SafeStyle.set.property",
  );
  assert.throws(
    () => element.style.set("color", hostile as unknown as string),
    (error: unknown) => isSafeDOMError(error)
      && error.code === "ERR_INVALID_ARGUMENT"
      && error.operation === "SafeStyle.set.value",
  );
  assert.equal(element.style.set("cssText", "color: red"), false);
  assert.equal(element.style.set("constructor", "red"), false);
  assert.equal(element.style.set("--request", "url(https://attacker.test)"), false);
  assert.equal(coercions, 0);

  assert.equal(element.style.set("color", "red"), true);
  assert.equal(element.style.get("color"), "red");
  assert.equal(ownStyleReads, 0, "captured HTMLElement.style getter bypasses own shadowing");
});

test("malicious host style policy accessors collapse to a stable safe error", () => {
  const { root } = fixture();
  const policy = Object.create(null) as Record<string, unknown>;
  Object.defineProperty(policy, "allowedProperties", {
    get() {
      throw root;
    },
  });

  assert.throws(
    () => createStylePolicy(policy as unknown as SafeStylePolicy),
    (error: unknown) =>
      isSafeDOMError(error) &&
      error.code === "ERR_INVALID_POLICY" &&
      error.operation === "stylePolicy.allowedProperties",
  );
});

test("an invalid style policy does not consume the ShadowRoot capability", () => {
  const { root } = fixture();
  assert.throws(
    () => createSafeDocument(root, { stylePolicy: { allowedProperties: ["width", "nope"] as never } }),
    (error: unknown) => isSafeDOMError(error) && error.code === "ERR_INVALID_POLICY",
  );
  assert.doesNotThrow(() => createSafeDocument(root));
});
