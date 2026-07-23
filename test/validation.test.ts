import assert from "node:assert/strict";
import { test } from "vitest";

import {
  hasCssUrl,
  isButtonTypeAllowed,
  isInputTypeAllowed,
  scanCSSNetworkRisk,
} from "../src/validation.ts";
import {
  requireFiniteNumber,
  requirePrimitiveBoolean,
  requirePrimitiveString,
} from "../src/primitives.ts";
import { isSafeDOMError } from "../src/errors.ts";

const requestBearingCSS: ReadonlyArray<readonly [string, string]> = [
  ["plain url", "background: url(https://attacker.test/pixel)"],
  ["uppercase URL", "background: URL (https://attacker.test/pixel)"],
  ["escaped url identifier", String.raw`background:u\72l(https://attacker.test/pixel)`],
  ["fully escaped url", String.raw`background:\75\72\6c(https://attacker.test/pixel)`],
  ["six digit hex escapes", String.raw`background:\000075\000072\00006c(https://attacker.test/pixel)`],
  ["hex escape optional whitespace", String.raw`background:u\000072 l(https://attacker.test/pixel)`],
  ["comments join url", "background:u/**/r/**/l(https://attacker.test/pixel)"],
  ["escaped newline joins url", "background:u\\\nrl(https://attacker.test/pixel)"],
  ["plain image-set", "background:image-set('https://attacker.test/a.png' 1x)"],
  ["vendor image-set", "background:-webkit-image-set('https://attacker.test/a.png' 1x)"],
  ["escaped image-set", String.raw`background:image\2d set('https://attacker.test/a.png' 1x)`],
  ["commented image-set", "background:image/**/-set('https://attacker.test/a.png' 1x)"],
  ["image string source", 'background:image("https://attacker.test/a.png")'],
  ["escaped image", String.raw`background:\69mage("https://attacker.test/a.png")`],
  ["src string source", 'background:src("https://attacker.test/a.png")'],
  ["escaped src", String.raw`background:\73rc("https://attacker.test/a.png")`],
  ["custom property indirection", "background:var(--host-request)"],
  ["escaped var", String.raw`background:v\61r(--host-request)`],
  ["environment indirection", "background:env(host-request)"],
  ["attribute indirection", "background:attr(data-request type(<url>))"],
  ["import string", '@import "https://attacker.test/a.css";'],
  ["import url", "@import url(https://attacker.test/a.css);"],
  ["escaped import", String.raw`@\69mport "https://attacker.test/a.css";`],
  ["six digit escaped import", String.raw`@\000069 mport "https://attacker.test/a.css";`],
  ["commented import", '@im/**/port "https://attacker.test/a.css";'],
];

test("CSS network scanner catches escape/comment/import bypass matrix", () => {
  for (const [name, css] of requestBearingCSS) {
    const decision = scanCSSNetworkRisk(css);
    assert.equal(decision.risky, true, `${name}: ${css}`);
    assert.equal(hasCssUrl(css), true, `${name}: boolean facade`);
    assert.equal(Object.isFrozen(decision), true, `${name}: immutable decision`);
  }
});

test("CSS network scanner rejects malformed tokenization conservatively", () => {
  assert.deepEqual(scanCSSNetworkRisk("color:red;/*"), {
    risky: true,
    risk: "malformed-comment",
  });
  assert.deepEqual(scanCSSNetworkRisk("color:red;\\"), {
    risky: true,
    risk: "malformed-escape",
  });
});

test("CSS scanner does not confuse identifier suffixes with request functions", () => {
  for (const css of [
    "color: red",
    "background-color: #fff",
    "transform: translate(1px, 2px)",
    "--myurl: 1",
    "myurl(1)",
    "image-setter(1)",
    "source(1)",
    "variable(1)",
    "environment(1)",
    "attribute(1)",
    "@important value",
    "https://example.test/not-a-css-function",
  ]) {
    assert.deepEqual(scanCSSNetworkRisk(css), { risky: false }, css);
  }
});

test("fuzz-like hex escaping of every sensitive identifier remains detectable", () => {
  const escaped = (identifier: string): string =>
    [...identifier].map((character, index) =>
      index % 2 === 0 ? `\\${character.codePointAt(0)?.toString(16)} ` : character,
    ).join("");

  for (const identifier of ["url", "image-set", "-webkit-image-set"]) {
    const css = `${escaped(identifier)}(https://attacker.test/a)`;
    assert.equal(scanCSSNetworkRisk(css).risky, true, css);
  }
  assert.equal(
    scanCSSNetworkRisk(`@${escaped("import")} "https://attacker.test/a.css"`).risky,
    true,
  );
});

test("primitive guards never invoke attacker coercion hooks", () => {
  let coercions = 0;
  const stateful = {
    toString() {
      coercions += 1;
      return "text";
    },
    valueOf() {
      coercions += 1;
      return 1;
    },
    [Symbol.toPrimitive]() {
      coercions += 1;
      return "text";
    },
  };

  assert.equal(scanCSSNetworkRisk(stateful).risky, true);
  assert.equal(isInputTypeAllowed(stateful), false);
  assert.equal(isButtonTypeAllowed(stateful), false);
  assert.throws(() => requirePrimitiveString(stateful, "test.string"), isSafeDOMError);
  assert.throws(() => requirePrimitiveBoolean(stateful, "test.boolean"), isSafeDOMError);
  assert.throws(() => requireFiniteNumber(stateful, "test.number"), isSafeDOMError);
  assert.equal(coercions, 0);
});
