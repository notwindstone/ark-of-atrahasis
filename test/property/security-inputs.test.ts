// @vitest-environment jsdom

import fc from "fast-check";
import { beforeEach, describe, expect, it } from "vitest";
import {
  URL_SINKS,
  createSafeDocument,
  createStylePolicy,
  createURLPolicy,
  scanCSSNetworkRisk,
  type SafeDocument,
  type SafeURLDecision,
} from "../../src/index.ts";
import { createContainedRoot as makeRoot } from "../support/contained-root.ts";
import { createTestSafeDocument } from "../support/create-safe-document.ts";
import {
  assertStableBoundaryError,
  captureThrown,
  propertyParameters,
} from "../support/property-config.ts";

const PURE_RUNS = 300;
const BINARY_STRING = fc.string({ unit: "binary", maxLength: 256 });
const SENSITIVE_IDENTIFIERS = [
  "url",
  "image-set",
  "-webkit-image-set",
  "image",
  "src",
  "var",
  "env",
  "attr",
  "import",
] as const;

function encodedCharacter(character: string): fc.Arbitrary<string> {
  const codePoint = character.codePointAt(0);
  if (codePoint === undefined) throw new Error("expected a non-empty identifier character");
  const literal = /[a-z]/u.test(character)
    ? fc.constantFrom(character, character.toUpperCase())
    : fc.constant(character);
  const hex = codePoint.toString(16);
  const encodings = [
    literal,
    fc.integer({ min: 0, max: 6 - hex.length }).map((zeroes) => `\\${"0".repeat(zeroes)}${hex} `),
  ];
  // A simple escape is valid only when the escaped character is not a CSS hex
  // digit. For example, `\\c` starts a hex escape and does not encode `c`.
  if (!/^[0-9a-f]$/iu.test(character)) encodings.push(fc.constant(`\\${character}`));
  return fc.oneof(...encodings);
}

function encodedIdentifier(identifier: string): fc.Arbitrary<string> {
  const characters = [...identifier];
  const encoded = fc.tuple(...characters.map(encodedCharacter));
  const separators = fc.tuple(
    ...characters.slice(1).map(() => fc.constantFrom("", "/**/", "\\\n", "\\\r\n")),
  );
  return fc.tuple(encoded, separators).map(([parts, joins]) => {
    let result = parts[0] ?? "";
    for (let index = 1; index < parts.length; index += 1) {
      result += `${joins[index - 1] ?? ""}${parts[index]}`;
    }
    return result;
  });
}

const dangerousCSSArbitrary = fc.constantFrom(...SENSITIVE_IDENTIFIERS).chain((identifier) => (
  encodedIdentifier(identifier).map((encoded) => (
    identifier === "import"
      ? `@${encoded} "https://attacker.test/a.css"`
      : `${encoded}("https://attacker.test/a.png")`
  ))
));

function expectCSSDecisionShape(decision: ReturnType<typeof scanCSSNetworkRisk>): void {
  expect(Object.isFrozen(decision)).toBe(true);
  expect(Reflect.ownKeys(decision)).toEqual(decision.risky ? ["risky", "risk"] : ["risky"]);
  expect(Object.values(decision).every((field) => (
    typeof field === "boolean" || typeof field === "string"
  ))).toBe(true);
}

function expectURLDecisionShape(decision: SafeURLDecision): void {
  expect(Object.isFrozen(decision)).toBe(true);
  expect(Reflect.ownKeys(decision)).toEqual(decision.allowed ? ["allowed", "url"] : ["allowed", "error"]);
  if (decision.allowed) {
    expect(typeof decision.url).toBe("string");
  } else {
    assertStableBoundaryError(decision.error, "ERR_URL_DENIED");
  }
}

const ALL_SINK_POLICY = Object.freeze({
  baseURL: "https://allowed.test/base/",
  sinks: Object.freeze(Object.fromEntries(URL_SINKS.map((sink) => [sink, Object.freeze({
    allowedOrigins: Object.freeze(["https://allowed.test"]),
    maxLength: 128,
  })]))),
});

describe("generated CSS security grammar", () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it("rejects every independently encoded network-bearing identifier", () => {
    fc.assert(fc.property(dangerousCSSArbitrary, (value) => {
      const decision = scanCSSNetworkRisk(value);
      expectCSSDecisionShape(decision);
      expect(decision.risky).toBe(true);
    }), propertyParameters(PURE_RUNS));
  });

  it("rejects malformed comments and trailing escapes conservatively", () => {
    const malformed = fc.oneof(
      BINARY_STRING.map((prefix) => `${prefix}/*unterminated`),
      BINARY_STRING.filter((prefix) => !prefix.endsWith("\\")).map((prefix) => `${prefix}\\`),
    );
    fc.assert(fc.property(malformed, (value) => {
      const decision = scanCSSNetworkRisk(value);
      expectCSSDecisionShape(decision);
      expect(decision.risky).toBe(true);
      if (decision.risky) expect(["malformed-comment", "malformed-escape"]).toContain(decision.risk);
    }), propertyParameters(PURE_RUNS));
  });

  it("is total over bounded binary strings and returns only the frozen documented shape", () => {
    fc.assert(fc.property(BINARY_STRING, (value) => {
      expectCSSDecisionShape(scanCSSNetworkRisk(value));
    }), propertyParameters(PURE_RUNS));
  });

  it("keeps the previous serialized style when a generated dangerous value is denied", () => {
    fc.assert(fc.property(dangerousCSSArbitrary, (value) => {
      const root = makeRoot();
      const safeDocument = createTestSafeDocument(root, {
        stylePolicy: { allowedProperties: ["color"] },
      });
      const wrapper = safeDocument.createDiv();
      safeDocument.appendChild(wrapper);
      expect(wrapper.style.set("color", "red")).toBe(true);
      const raw = root.querySelector("div");
      if (!(raw instanceof HTMLDivElement)) throw new Error("expected a physical div");

      expect(wrapper.style.set("color", value)).toBe(false);
      expect(raw.style.getPropertyValue("color")).toBe("red");
      safeDocument.dispose();
      root.host.remove();
    }), propertyParameters(PURE_RUNS));
  });

  it("rejects property and value objects without running coercion traps", () => {
    fc.assert(fc.property(fc.constantFrom("property", "value"), (position) => {
      let traps = 0;
      const hostile = new Proxy({}, {
        get() {
          traps += 1;
          throw new Error("coercion trap executed");
        },
      });
      expect(scanCSSNetworkRisk(hostile)).toEqual({ risky: true, risk: "invalid-input" });
      const wrapper = createTestSafeDocument(makeRoot(), {
        stylePolicy: { allowedProperties: ["color"] },
      }).createDiv();
      const argumentsList = position === "property" ? [hostile, "red"] : ["color", hostile];
      const error = captureThrown(() => Reflect.apply(wrapper.style.set, wrapper.style, argumentsList));
      assertStableBoundaryError(error, "ERR_INVALID_ARGUMENT");
      expect(traps).toBe(0);
    }), propertyParameters(PURE_RUNS));
  });
});

describe("generated URL policy inputs", () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  const safePath = fc.array(
    fc.stringMatching(/^[a-z0-9]{1,8}$/u),
    { minLength: 1, maxLength: 4 },
  ).map((segments) => segments.join("/"));

  it("canonicalizes exactly one generated allowed URL at the configured origin", () => {
    const engine = createURLPolicy(ALL_SINK_POLICY);
    fc.assert(fc.property(
      fc.constantFrom(...URL_SINKS),
      safePath,
      fc.boolean(),
      (sink, path, absolute) => {
        const input = absolute ? `https://allowed.test/${path}` : `../${path}`;
        const decision = engine.decide(sink, input);
        expectURLDecisionShape(decision);
        expect(decision.allowed).toBe(true);
        if (decision.allowed) {
          expect(decision.url).toBe(new URL(input, ALL_SINK_POLICY.baseURL).href);
          expect(new URL(decision.url).origin).toBe("https://allowed.test");
        }
      },
    ), propertyParameters(PURE_RUNS));
  });

  it("denies one forbidden URL dimension at a time", () => {
    const engine = createURLPolicy(ALL_SINK_POLICY);
    const forbidden = fc.oneof(
      safePath.map((path) => `http://allowed.test/${path}`),
      safePath.map((path) => `https://attacker.test/${path}`),
      safePath.map((path) => `https://allowed.test:444/${path}`),
      safePath.map((path) => `https://user:secret@allowed.test/${path}`),
      safePath.map((path) => `https://allowed.test/${path}?q=1`),
      safePath.map((path) => `https://allowed.test/${path}#fragment`),
      fc.constant(`https://allowed.test/${"x".repeat(160)}`),
      fc.constantFrom("https://[::1", "https://%", "https://allowed\u0000.test/", "https://éxample.test/"),
    );
    fc.assert(fc.property(fc.constantFrom(...URL_SINKS), forbidden, (sink, input) => {
      const decision = engine.decide(sink, input);
      expectURLDecisionShape(decision);
      expect(decision.allowed).toBe(false);
    }), propertyParameters(PURE_RUNS));
  });

  it("is total over arbitrary binary strings and preserves the decision shape", () => {
    const engine = createURLPolicy(ALL_SINK_POLICY);
    fc.assert(fc.property(fc.constantFrom(...URL_SINKS), BINARY_STRING, (sink, input) => {
      expectURLDecisionShape(engine.decide(sink, input));
    }), propertyParameters(PURE_RUNS));
  });

  it("parses an enabled primitive runtime input exactly once", () => {
    let constructions = 0;
    class CountingURL extends URL {
      constructor(url: string | URL, base?: string | URL) {
        super(url, base);
        constructions += 1;
      }
    }
    const engine = createURLPolicy(ALL_SINK_POLICY, CountingURL);
    fc.assert(fc.property(fc.constantFrom(...URL_SINKS), safePath, (sink, path) => {
      constructions = 0;
      const decision = engine.decide(sink, `/${path}`);
      expect(decision.allowed).toBe(true);
      expect(constructions).toBe(1);
    }), propertyParameters(PURE_RUNS));
  });

  it("executes zero coercion traps for non-primitive URL inputs", () => {
    const engine = createURLPolicy(ALL_SINK_POLICY);
    fc.assert(fc.property(fc.constantFrom(...URL_SINKS), fc.constantFrom("proxy", "boxed", "stateful"), (sink, recipe) => {
      let traps = 0;
      const input = recipe === "boxed"
        ? new String("https://allowed.test/a")
        : recipe === "proxy"
          ? new Proxy({}, {
              get() {
                traps += 1;
                throw new Error("coercion trap executed");
              },
            })
          : {
              toString() {
                traps += 1;
                return "https://allowed.test/a";
              },
              [Symbol.toPrimitive]() {
                traps += 1;
                return "https://allowed.test/a";
              },
            };
      const decision = Reflect.apply(engine.decide, engine, [sink, input]);
      expectURLDecisionShape(decision);
      expect(decision.allowed).toBe(false);
      expect(traps).toBe(0);
    }), propertyParameters(PURE_RUNS));
  });

});

interface NumericPropertyCase {
  readonly name: string;
  readonly minimum: number;
  readonly maximum: number;
  readonly integer: boolean;
  readonly create: (safeDocument: SafeDocument, root: ShadowRoot) => {
    readonly invoke: (value: number) => void;
    readonly observe: () => number;
  };
}

const NUMERIC_CASES: readonly NumericPropertyCase[] = [
  {
    name: "tabIndex",
    minimum: -1,
    maximum: 0,
    integer: true,
    create(safeDocument, root) {
      const wrapper = safeDocument.createDiv();
      safeDocument.appendChild(wrapper);
      const raw = root.querySelector("div");
      if (!(raw instanceof HTMLElement)) throw new Error("expected physical tab target");
      return { invoke: wrapper.setTabIndex, observe: () => raw.tabIndex };
    },
  },
  {
    name: "rows",
    minimum: 1,
    maximum: 4_294_967_295,
    integer: true,
    create(safeDocument, root) {
      const wrapper = safeDocument.createTextarea();
      safeDocument.appendChild(wrapper);
      const raw = root.querySelector("textarea");
      if (!(raw instanceof HTMLTextAreaElement)) throw new Error("expected textarea");
      return { invoke: wrapper.setRows, observe: () => raw.rows };
    },
  },
  {
    name: "image width",
    minimum: 0,
    maximum: 4_294_967_295,
    integer: true,
    create(safeDocument, root) {
      const wrapper = safeDocument.createImage();
      safeDocument.appendChild(wrapper);
      const raw = root.querySelector("img");
      if (!(raw instanceof HTMLImageElement)) throw new Error("expected image");
      return { invoke: wrapper.setWidth, observe: () => raw.width };
    },
  },
  {
    name: "colSpan",
    minimum: 1,
    maximum: 1_000,
    integer: true,
    create(safeDocument, root) {
      const wrapper = safeDocument.createTd();
      safeDocument.appendChild(wrapper);
      const raw = root.querySelector("td");
      if (!(raw instanceof HTMLTableCellElement)) throw new Error("expected table cell");
      return { invoke: wrapper.setColspan, observe: () => raw.colSpan };
    },
  },
  {
    name: "rowSpan",
    minimum: 0,
    maximum: 65_534,
    integer: true,
    create(safeDocument, root) {
      const wrapper = safeDocument.createTh();
      safeDocument.appendChild(wrapper);
      const raw = root.querySelector("th");
      if (!(raw instanceof HTMLTableCellElement)) throw new Error("expected table cell");
      return { invoke: wrapper.setRowspan, observe: () => raw.rowSpan };
    },
  },
];

describe("generated numeric contracts", () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it("uses independent finite/integer/range predicates and preserves invalid state atomically", () => {
    const values = fc.oneof(
      fc.double(),
      fc.constantFrom(
        Number.NaN,
        Number.NEGATIVE_INFINITY,
        Number.POSITIVE_INFINITY,
        -0,
        -1,
        0,
        1,
        Number.MIN_SAFE_INTEGER,
        Number.MAX_SAFE_INTEGER,
        0.5,
      ),
    );
    fc.assert(fc.property(fc.constantFrom(...NUMERIC_CASES), values, (testCase, value) => {
      const root = makeRoot();
      const safeDocument = createTestSafeDocument(root);
      const target = testCase.create(safeDocument, root);
      const before = target.observe();
      const valid = Number.isFinite(value)
        && (!testCase.integer || Number.isInteger(value))
        && value >= testCase.minimum
        && value <= testCase.maximum;

      if (valid) {
        expect(() => target.invoke(value)).not.toThrow();
        expect(target.observe()).toBe(Object.is(value, -0) ? 0 : value);
      } else {
        const error = captureThrown(() => target.invoke(value));
        assertStableBoundaryError(error, "ERR_INVALID_ARGUMENT");
        expect(target.observe()).toBe(before);
      }
      safeDocument.dispose();
    }), propertyParameters(PURE_RUNS));
  });

  it("checks canvas pixel relations before mutating the owner-realm IDL", () => {
    const value = fc.oneof(
      fc.integer({ min: -2, max: 16_777_218 }),
      fc.constantFrom(Number.NaN, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY, 0.5),
    );
    fc.assert(fc.property(value, (width) => {
      const root = makeRoot();
      const safeDocument = createTestSafeDocument(root);
      const canvas = safeDocument.createCanvas();
      safeDocument.appendChild(canvas);
      canvas.setHeight(1);
      const raw = root.querySelector("canvas");
      if (!(raw instanceof HTMLCanvasElement)) throw new Error("expected canvas");
      const before = raw.width;
      const valid = Number.isInteger(width) && width >= 0 && width <= 16_777_216;
      if (valid) {
        canvas.setWidth(width);
        expect(raw.width).toBe(width);
      } else {
        assertStableBoundaryError(captureThrown(() => canvas.setWidth(width)), "ERR_INVALID_ARGUMENT");
        expect(raw.width).toBe(before);
      }
    }), propertyParameters(PURE_RUNS));
  });

  it("keeps progress and meter relation failures atomic", () => {
    fc.assert(fc.property(fc.double(), fc.double(), (first, second) => {
      const root = makeRoot();
      const safeDocument = createTestSafeDocument(root);
      const progress = safeDocument.createProgress();
      const meter = safeDocument.createMeter();
      safeDocument.appendChild(progress);
      safeDocument.appendChild(meter);
      const rawProgress = root.querySelector("progress");
      const rawMeter = root.querySelector("meter");
      if (!(rawProgress instanceof HTMLProgressElement) || !(rawMeter instanceof HTMLMeterElement)) {
        throw new Error("expected numeric relation elements");
      }

      const progressBefore = { value: rawProgress.value, max: rawProgress.max };
      const validProgress = Number.isFinite(first) && first > 0 && first >= rawProgress.value;
      if (validProgress) {
        progress.setMax(first);
        expect(rawProgress.max).toBe(first);
      } else {
        assertStableBoundaryError(captureThrown(() => progress.setMax(first)), "ERR_INVALID_ARGUMENT");
        expect({ value: rawProgress.value, max: rawProgress.max }).toEqual(progressBefore);
      }

      const meterBefore = { value: rawMeter.value, min: rawMeter.min, max: rawMeter.max };
      const validMeter = Number.isFinite(second) && second > rawMeter.min && second >= rawMeter.value;
      if (validMeter) {
        meter.setMax(second);
        expect(rawMeter.max).toBe(second);
      } else {
        assertStableBoundaryError(captureThrown(() => meter.setMax(second)), "ERR_INVALID_ARGUMENT");
        expect({ value: rawMeter.value, min: rawMeter.min, max: rawMeter.max }).toEqual(meterBefore);
      }
    }), propertyParameters(PURE_RUNS));
  });

});

type HostileRecipe =
  | "undefined"
  | "symbol"
  | "function"
  | "error"
  | "dom-exception"
  | "window"
  | "document"
  | "element"
  | "event"
  | "capability-prototype"
  | "throwing-proxy";

const HOSTILE_RECIPES: readonly HostileRecipe[] = [
  "undefined",
  "symbol",
  "function",
  "error",
  "dom-exception",
  "window",
  "document",
  "element",
  "event",
  "capability-prototype",
  "throwing-proxy",
];

function hostileThrownValue(recipe: HostileRecipe): unknown {
  switch (recipe) {
    case "undefined": return undefined;
    case "symbol": return Symbol("hostile");
    case "function": return () => window;
    case "error": return new Error("hostile");
    case "dom-exception": return new DOMException("hostile");
    case "window": return window;
    case "document": return document;
    case "element": return document.createElement("div");
    case "event": return new Event("hostile");
    case "capability-prototype": {
      const prototype = Object.freeze({ capability: () => window });
      return Object.freeze(Object.create(prototype));
    }
    case "throwing-proxy": return new Proxy({}, {
      get() { throw document; },
      getOwnPropertyDescriptor() { throw window; },
      getPrototypeOf() { throw () => window; },
    });
  }
}

describe.sequential("hostile thrown values at normalization seams", () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it("normalizes context own-property failures without inspecting the thrown value", () => {
    fc.assert(fc.property(fc.constantFrom(...HOSTILE_RECIPES), (recipe) => {
      const root = makeRoot();
      const options = new Proxy({}, {
        getOwnPropertyDescriptor() {
          throw hostileThrownValue(recipe);
        },
      });
      const error = captureThrown(() => Reflect.apply(createSafeDocument, undefined, [root, options]));
      assertStableBoundaryError(error, "ERR_INVALID_HARDENER");
    }), propertyParameters(PURE_RUNS));
  });

  it("normalizes style-policy accessor failures", () => {
    fc.assert(fc.property(fc.constantFrom(...HOSTILE_RECIPES), (recipe) => {
      const stylePolicy = Object.defineProperty({}, "allowedProperties", {
        enumerable: true,
        get() { throw hostileThrownValue(recipe); },
      });
      const error = captureThrown(() => Reflect.apply(createStylePolicy, undefined, [stylePolicy]));
      assertStableBoundaryError(error, "ERR_INVALID_POLICY");
    }), propertyParameters(PURE_RUNS));
  });

  it("normalizes URL-constructor failures during policy compilation and runtime decisions", () => {
    fc.assert(fc.property(fc.constantFrom(...HOSTILE_RECIPES), (recipe) => {
      let fail = true;
      class HostileURL extends URL {
        constructor(url: string | URL, base?: string | URL) {
          super(url, base);
          if (fail) throw hostileThrownValue(recipe);
        }
      }
      const compileError = captureThrown(() => createURLPolicy(ALL_SINK_POLICY, HostileURL));
      assertStableBoundaryError(compileError, "ERR_INVALID_POLICY");

      fail = false;
      const engine = createURLPolicy(ALL_SINK_POLICY, HostileURL);
      fail = true;
      const decision = engine.decide("image.src", "https://allowed.test/a.png");
      expectURLDecisionShape(decision);
      expect(decision.allowed).toBe(false);
    }), propertyParameters(PURE_RUNS));
  });

  it("normalizes owner-realm platform throws", () => {
    fc.assert(fc.property(fc.constantFrom(...HOSTILE_RECIPES), (recipe) => {
      const prototype = window.Element.prototype;
      const descriptor = Object.getOwnPropertyDescriptor(prototype, "setAttribute");
      if (descriptor === undefined || typeof descriptor.value !== "function") {
        throw new Error("expected Element.prototype.setAttribute");
      }
      Object.defineProperty(prototype, "setAttribute", {
        ...descriptor,
        value(): void { throw hostileThrownValue(recipe); },
      });
      try {
        const wrapper = createTestSafeDocument(makeRoot()).createDiv();
        const error = captureThrown(() => wrapper.setTitle("value"));
        assertStableBoundaryError(error, "DOM_OPERATION_FAILED");
      } finally {
        Object.defineProperty(prototype, "setAttribute", descriptor);
      }
    }), propertyParameters(PURE_RUNS));
  });

  it("turns hostile event accessor throws into frozen primitive snapshots", () => {
    fc.assert(fc.property(fc.constantFrom(...HOSTILE_RECIPES), (recipe) => {
      const prototype = window.Event.prototype;
      const descriptor = Object.getOwnPropertyDescriptor(prototype, "type");
      if (descriptor === undefined || typeof descriptor.get !== "function") {
        throw new Error("expected Event.prototype.type");
      }
      Object.defineProperty(prototype, "type", {
        ...descriptor,
        get() { throw hostileThrownValue(recipe); },
      });
      try {
        const root = makeRoot();
        const safeDocument = createTestSafeDocument(root);
        const button = safeDocument.createButton();
        safeDocument.appendChild(button);
        let snapshot: unknown;
        button.onClick((event) => { snapshot = event; });
        const raw = root.querySelector("button");
        if (!(raw instanceof HTMLButtonElement)) throw new Error("expected button");
        raw.dispatchEvent(new Event("click"));
        expect(snapshot).toMatchObject({ kind: "mouse", type: "" });
        expect(Object.isFrozen(snapshot)).toBe(true);
        expect(JSON.stringify(snapshot)).not.toContain("hostile");
      } finally {
        Object.defineProperty(prototype, "type", descriptor);
      }
    }), propertyParameters(PURE_RUNS));
  });
});
