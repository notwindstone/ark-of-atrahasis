import { expect, test } from "bun:test";
import { createSafeDomain, createStylePolicy, createURLPolicy } from "../src/index.ts";
import { getRealNode } from "../src/host.ts";
import { error } from "../src/errors.ts";
import * as v from "../src/validators.ts";
import { fixture, fails } from "./helpers.ts";

test("style commits use an empty scratch declaration and preserve valid CSS", () => {
  const { domain, root } = fixture(),
    doc = domain.mount(root()),
    s = doc.createDiv().style;
  expect(s.set("color", "red")).toBe(true);
  expect(s.set("color", "not-a-color")).toBe(false);
  expect(s.get("color")).toBe("red");
  expect(s.set("color", "red")).toBe(true);
  for (const [name, value] of Object.entries({
    display: "grid",
    fontFamily: "serif",
    "font-weight": "bold",
    fontStyle: "italic",
    animationName: "slide",
    animationDuration: "2s",
  })) {
    expect(s.set(name, value)).toBe(true);
    expect(s.get(name)).toBe(value);
  }
  expect(s.remove("color")).toBe(true);
  expect(s.get("color")).toBe("");
  expect(
    createStylePolicy({
      allowedProperties: Array(500).fill("fontWeight"),
    }).allows("font-weight"),
  ).toBe(true);
  expect(createStylePolicy({ denyAll: true }).allows("color")).toBe(false);
  for (const name of [" color", "--a", "-webkit-appearance", "cssText"])
    fails("INVALID_POLICY", () => createStylePolicy({ allowedProperties: [name] }));
});
test("stylesheets require host opt-in, filter network syntax and follow the mount lifetime", () => {
  const { document, domain, root } = fixture();
  fails("POLICY_DENIED", () => domain.mount(root()).createStyle());
  const enabled = createSafeDomain(document, { allowStylesheet: true });
  for (const shadow of [true, false]) {
    const r = shadow ? root().attachShadow({ mode: "closed" }) : root(),
      doc = enabled.mount(r),
      sheet = doc.createStyle();
    const parent = shadow ? r : document.head;
    expect(parent.querySelector("style")).not.toBeNull();
    const safe = "div {color: var(--text)}";
    sheet.setCSS(safe);
    for (const css of [
      "@import 'foo'",
      "u/**/rl(x)",
      "u\\72 l(x)",
      "im\\\nage(x)",
      "src(x)",
      "-webkit-image-set(x)",
      "/*",
    ]) {
      expect(v.hasCssUrl(css)).toBe(true);
      fails("URL_DENIED", () => sheet.setCSS(css));
      expect(sheet.getCSS()).toBe(safe);
    }
    doc.dispose();
    expect(parent.querySelector("style")).toBeNull();
  }
  const doc = enabled.mount(root());
  doc.createStyle().dispose();
  doc.createStyle();
  enabled.dispose();
  expect(document.head.querySelector("style")).toBeNull();
});
test("strict primitive and policy parsing, canonical decisions and media parameters", () => {
  const obj = {
    valueOf() {
      throw Error("coerced");
    },
    toString() {
      throw Error("coerced");
    },
  };
  for (const f of [v.requireString, v.requireBoolean, v.requireFiniteNumber])
    fails("INVALID_ARGUMENT", () => f(obj));
  for (const val of [obj, 1.5, NaN, "1", 0, 7])
    fails("INVALID_ARGUMENT", () => v.validateFactory("createHeading", val));
  expect(v.isValidMimeType('video/mp4; codecs="avc1.42E01E"')).toBe(true);
  const baseURL = "https://cdn.example/app/";
  const origins = ["https://cdn.example"];
  Object.defineProperty(origins, Symbol.iterator, {
    get() {
      throw Error("iterator");
    },
  });
  const policy = {
    baseURL,
    sinks: { "image.src": { allowedOrigins: origins } },
  };
  const urls = createURLPolicy(policy);
  expect(urls.decide("image.src", "../a")).toEqual({
    allowed: true,
    url: "https://cdn.example/a",
  });
  for (const value of ["http://cdn.example", "?x", "#", "//user@cdn.example", "//different.example", obj])
    expect(urls.decide("image.src", value).allowed).toBe(false);
  expect(urls.decide("video.src", "a").allowed).toBe(false);
  fails("INVALID_POLICY", () => createURLPolicy({ ...policy, anything: true } as never));
  fails("INVALID_POLICY", () => createURLPolicy({ baseURL, sinks: { "img.src": {} } } as never));
  fails("INVALID_POLICY", () =>
    createURLPolicy({
      baseURL,
      sinks: {
        "image.src": {
          get allowedOrigins(): never {
            throw Error();
          },
        },
      },
    }),
  );
});
test("native control state, safe defaults and rollback of input type and autocomplete", () => {
  const { domain, root, document, win } = fixture(),
    doc = domain.mount(root());
  const input = doc.createInput(),
    raw = getRealNode(domain, input) as HTMLInputElement;
  expect(raw.autocomplete).toBe("off");
  expect((getRealNode(domain, doc.createButton()) as HTMLButtonElement).type).toBe("button");
  fails("INVALID_ARGUMENT", () => input.setType("password" as never));
  fails("INVALID_ARGUMENT", () => input.setAutofocus(true as never));
  input.setType("number");
  input.setValue("invalid");
  expect(input.getValue()).toBe(raw.value);
  const d = Object.getOwnPropertyDescriptor(win.Element.prototype, "setAttribute")!;
  let reject = false;
  Object.defineProperty(win.Element.prototype, "setAttribute", {
    ...d,
    value: function (k: string, val: string) {
      if (reject && k === "autocomplete") {
        reject = false;
        throw Error("injected failure");
      }
      return d.value.call(this, k, val);
    },
  });
  try {
    const owner = createSafeDomain(document),
      node = owner.mount(root()).createInput(),
      real = getRealNode(owner, node) as HTMLInputElement;
    reject = true;
    fails("DOM_OPERATION_FAILED", () => node.setType("number"));
    expect(real.type).toBe("text");
    expect(real.getAttribute("type")).toBeNull();
    expect(real.autocomplete).toBe("off");
  } finally {
    Object.defineProperty(win.Element.prototype, "setAttribute", d);
  }
});

test("quoted MIME parameters use HTTP quoted-string code points", () => {
  for (const name of ["café", "avc1.42E01E"])
    expect(v.isValidMimeType('video/mp4; codecs="' + name + '"')).toBe(true);
  expect(v.isValidMimeType('video/mp4; name="😀"')).toBe(false);
  const mixed = { denyAll: true, allowedProperties: [] } as const;
  // @ts-expect-error The two policy variants are mutually exclusive.
  fails("INVALID_POLICY", () => createStylePolicy(mixed));
});

test("CSS network syntax is checked outside quoted literals", () => {
  for (const safe of [
    'font-family: "Image (Sans)"',
    '.label::after { content: "@important"; }',
    'content: "/*"',
    "@important",
  ]) {
    expect(v.scanCSSNetworkRisk(safe)).toBe(false);
  }
  for (const blocked of [
    '@import "https://example.test/x.css"',
    String.raw`@imp\6frt "x"`,
    String.raw`u\72l(x)`,
    "u/**/rl(x)",
    "image(x)",
    "src(x)",
    "image-set(x)",
    "/*",
  ]) {
    expect(v.scanCSSNetworkRisk(blocked)).toBe(true);
  }
});

test("undefined policy values act like omitted properties", () => {
  const baseURL = "https://a.test/";
  expect(createURLPolicy({ baseURL, sinks: { "image.src": undefined } }).decide("image.src", "/").allowed).toBe(false);
  expect(createStylePolicy({ denyAll: true, allowedProperties: undefined }).allows("color")).toBe(false);
  expect(createStylePolicy({ denyAll: undefined, allowedProperties: ["color"] }).allows("color")).toBe(true);
  fails("INVALID_POLICY", () => createStylePolicy({ denyAll: undefined } as never));
  fails("INVALID_POLICY", () => createURLPolicy({ baseURL, sinks: { unknown: undefined } } as never));
});

test("URL-capable inline properties reject deferred substitutions", () => {
  const { domain, root } = fixture();
  const style = domain.mount(root()).createDiv().style;
  for (const property of ["cursor", "clip-path", "clipPath"]) {
    for (const value of ["var(--icon)", "env(shape)", String.raw`a\74tr(shape)`]) {
      expect(v.validStyle(property, value)).toBe(false);
      expect(style.set(property, value)).toBe(false);
    }
  }
  expect(v.validStyle("color", "var(--accent)")).toBe(true);
});

test("factory preflight recognizes mounted factories and matches text node errors", async () => {
  const { domain, root } = fixture();
  const mount = domain.mount(root());
  const argsByName = new Map<string, unknown>([
    ["createFormatting", "em"], ["createHeading", 1], ["createList", "ordered"],
  ]);
  for (const name of Object.keys(mount).filter(name => name.startsWith("create"))) {
    expect(v.validateFactory(name, argsByName.get(name))).toBeUndefined();
  }
  for (const name of ["createRawText", "createDvi", "constructor", "toString", "__proto__", 42, null]) {
    await expect(Promise.resolve().then(() => v.validateFactory(name as string))).rejects.toMatchObject({
      code: "INVALID_ARGUMENT", operation: "factory",
    });
  }
  for (const args of [[], [undefined], ["text"]] as const) {
    expect(v.validateFactory("createTextNode", ...args)).toBeUndefined();
    expect(mount.createTextNode(...args).getText()).toBe(args[0] ?? "");
  }
  for (const value of [42, null, {}]) {
    const record = error("INVALID_ARGUMENT", "createTextNode");
    await expect(Promise.resolve().then(() => v.validateFactory("createTextNode", value))).rejects.toEqual(record);
    await expect(Promise.resolve().then(() => mount.createTextNode(value as never))).rejects.toEqual(record);
  }
});
