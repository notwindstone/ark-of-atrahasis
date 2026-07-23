import assert from "node:assert/strict";
import test from "node:test";
import "ses";
import { JSDOM } from "jsdom";

lockdown();

const { createSafeDocument, isSafeDOMError } = await import("../dist/index.js");
// pass-style's documented root export includes eventual-send support. Its
// public shim supplies the HandledPromise global expected by that dependency.
await import("@endo/eventual-send/shim.js");
const { passStyleOf } = await import("@endo/pass-style");

function fixture() {
  const dom = new JSDOM(
    `<!doctype html><body>
    <p id="outside">host-owned</p>
    <div id="first"></div>
    <div id="second"></div>
  </body>`,
    { url: "https://host.example.test/" },
  );
  const firstHost = dom.window.document.querySelector("#first");
  const secondHost = dom.window.document.querySelector("#second");
  firstHost.style.contain = "paint";
  secondHost.style.contain = "paint";
  return {
    dom,
    outside: dom.window.document.querySelector("#outside"),
    firstRoot: firstHost.attachShadow({ mode: "closed" }),
    secondRoot: secondHost.attachShadow({ mode: "closed" }),
  };
}

test("real SES completes capabilities for two mutually distrusting compartments", () => {
  const { dom, outside, firstRoot, secondRoot } = fixture();
  const firstDocument = createSafeDocument(firstRoot, {
    harden,
    stylePolicy: { allowedProperties: ["color"] },
    formControlPolicy: { allowNonCredentialFormElements: true },
  });
  const secondDocument = createSafeDocument(secondRoot, {
    harden,
    stylePolicy: { allowedProperties: ["color"] },
    formControlPolicy: { allowNonCredentialFormElements: true },
  });
  const firstGuest = new Compartment({ safeDocument: firstDocument });
  const secondGuest = new Compartment({ safeDocument: secondDocument });

  const { firstRoot: strictRoot } = fixture();
  const strictDocument = createSafeDocument(strictRoot, { harden });
  const strictGuest = new Compartment({ safeDocument: strictDocument });
  const strictFormError = strictGuest.evaluate(`(() => {
    try {
      safeDocument.createInput();
      return null;
    } catch (error) {
      return error;
    }
  })()`);
  assert.equal(isSafeDOMError(strictFormError), true);
  assert.equal(Object.isFrozen(strictFormError), true);
  assert.equal(strictFormError.code, "FORM_CONTROL_POLICY_REQUIRED");
  assert.equal(strictFormError.operation, "SafeDocument.createInput.policy");
  strictDocument.dispose();

  assert.deepEqual(
    firstGuest.evaluate("[typeof createSafeDocument, typeof root, typeof document, typeof window]"),
    ["undefined", "undefined", "undefined", "undefined"],
  );

  firstGuest.evaluate(`
    globalThis.input = safeDocument.createInput();
    input.setId("first-input");
    input.setValue("first-value");
    input.style.set("color", "red");
    safeDocument.appendChild(input);
    globalThis.image = safeDocument.createImage();
    globalThis.deniedDecision = image.setSrc("https://denied.example.test/first.png");
    safeDocument.appendChild(image);
    image.detach();
    safeDocument.appendChild(image);
    globalThis.cleanup = input.onClick(event => {
      globalThis.snapshot = event;
      event.preventDefault();
    });
  `);
  const firstInput = firstGuest.evaluate("input");
  const cleanup = firstGuest.evaluate("cleanup");
  const firstPoisonAttempts = firstGuest.evaluate(`({
    document: Reflect.defineProperty(safeDocument, "poison", { value: true }),
    style: Reflect.defineProperty(input.style, "poison", { value: true }),
    prototype: Reflect.defineProperty(Object.getPrototypeOf(safeDocument), "poison", { value: true }),
  })`);

  assert.equal(Object.isFrozen(firstDocument), true);
  assert.equal(Object.isFrozen(firstInput), true);
  assert.equal(Object.isFrozen(firstInput.getValue), true);
  assert.equal(Object.isFrozen(firstInput.style), true);
  assert.equal(Object.isFrozen(firstInput.style.set), true);
  assert.equal(Object.isFrozen(cleanup), true);
  assert.equal(firstDocument.getElement("first-input"), firstInput);
  assert.equal(firstGuest.evaluate('input.style.get("color")'), "red");
  assert.equal(firstGuest.evaluate("safeDocument.getElement('first-input') === input"), true);
  assert.equal(firstGuest.evaluate("deniedDecision.allowed"), false);
  assert.deepEqual(firstPoisonAttempts, {
    document: false,
    style: false,
    prototype: false,
  });

  secondGuest.evaluate(`
    globalThis.div = safeDocument.createDiv();
    div.setId("first-input");
    div.setText("second-value");
    div.style.set("color", "blue");
    safeDocument.appendChild(div);
    globalThis.image = safeDocument.createImage();
    globalThis.deniedDecision = image.setSrc("https://denied.example.test/second.png");
    safeDocument.appendChild(image);
    image.detach();
    safeDocument.appendChild(image);
    globalThis.clicks = 0;
    globalThis.cleanup = div.onClick(event => {
      globalThis.snapshot = event;
      globalThis.clicks += 1;
    });
  `);
  assert.equal(secondGuest.evaluate("div.getText()"), "second-value");
  assert.equal(secondGuest.evaluate('safeDocument.getElement("first-input") === div'), true);
  assert.equal(secondGuest.evaluate('div.style.get("color")'), "blue");
  assert.equal(secondGuest.evaluate("deniedDecision.allowed"), false);
  assert.equal(secondGuest.evaluate("'poison' in safeDocument || 'poison' in div.style"), false);
  assert.equal(secondGuest.evaluate(`
    Reflect.ownKeys(safeDocument).some(key =>
      typeof key === "string" && /namespace|token|physical/i.test(key)
    )
  `), false);

  secondGuest.globalThis.foreign = firstInput;
  assert.equal(
    secondGuest.evaluate(`
    try {
      safeDocument.appendChild(foreign);
      "unexpected-success";
    } catch (error) {
      error.code;
    }
  `),
    "CROSS_OWNER",
  );

  const nativeInput = firstRoot.querySelector("input");
  const nativeSecond = secondRoot.querySelector("div");
  assert.match(nativeInput.id, /^aoa-i-[0-9a-f]{48}$/);
  assert.match(nativeSecond.id, /^aoa-i-[0-9a-f]{48}$/);
  assert.notEqual(nativeInput.id, nativeSecond.id);
  nativeInput.dispatchEvent(new dom.window.MouseEvent("click", { cancelable: true }));
  nativeSecond.dispatchEvent(new dom.window.MouseEvent("click", { cancelable: true }));
  const snapshot = firstGuest.evaluate("snapshot");
  const secondSnapshot = secondGuest.evaluate("snapshot");
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.target), true);
  assert.equal(Object.isFrozen(snapshot.preventDefault), true);
  assert.equal(snapshot.preventDefault(), false, "event control closes after dispatch");
  assert.equal(secondGuest.evaluate("clicks"), 1);
  assert.throws(() => passStyleOf(snapshot), "the time-bounded event control is local-only");
  assert.throws(() => passStyleOf(secondSnapshot), "the time-bounded event control is local-only");
  assert.equal(passStyleOf(snapshot.target), "copyRecord");
  assert.equal(passStyleOf(snapshot.currentTarget), "copyRecord");
  assert.equal(passStyleOf(secondSnapshot.target), "copyRecord");
  assert.equal(passStyleOf(secondSnapshot.currentTarget), "copyRecord");
  for (const decision of [
    firstGuest.evaluate("deniedDecision"),
    secondGuest.evaluate("deniedDecision"),
  ]) {
    assert.equal(passStyleOf(decision), "copyRecord");
    assert.equal(passStyleOf(decision.error), "copyRecord");
  }
  assert.equal(outside.textContent, "host-owned");
  assert.equal(secondRoot.textContent, "second-value");

  firstDocument.dispose();
  const disposedError = firstGuest.evaluate(`
    try {
      input.getValue();
      undefined;
    } catch (error) {
      error;
    }
  `);
  assert.equal(isSafeDOMError(disposedError), true);
  assert.equal(disposedError.code, "DOCUMENT_DISPOSED");
  assert.equal(passStyleOf(disposedError), "copyRecord");

  secondDocument.dispose();
  const secondDisposedError = secondGuest.evaluate(`
    try {
      div.getText();
      undefined;
    } catch (error) {
      error;
    }
  `);
  assert.equal(isSafeDOMError(secondDisposedError), true);
  assert.equal(secondDisposedError.code, "DOCUMENT_DISPOSED");
  assert.equal(passStyleOf(secondDisposedError), "copyRecord");
});

test("primitive-only errors and URL decisions are pass-by-copy data", () => {
  const { firstRoot } = fixture();
  const safeDocument = createSafeDocument(firstRoot, {
    harden,
    formControlPolicy: { allowNonCredentialFormElements: true },
  });
  const decision = safeDocument.createImage().setSrc("https://denied.example.test/pixel.png");
  let error;
  try {
    safeDocument.createHeading(0);
  } catch (candidate) {
    error = candidate;
  }

  assert.equal(decision.allowed, false);
  assert.equal(isSafeDOMError(error), true);
  assert.equal(isSafeDOMError(decision.error), true);
  assert.equal(passStyleOf(error), "copyRecord");
  assert.equal(passStyleOf(decision), "copyRecord");
  assert.equal(passStyleOf(decision.error), "copyRecord");
  assert.equal(Object.getPrototypeOf(error), Object.prototype);
  assert.deepEqual(Reflect.ownKeys(error), ["name", "code", "operation", "message"]);
  assert.equal(Object.hasOwn(error, "stack"), false);
  assert.equal(Object.hasOwn(error, "cause"), false);

  const hostilePrototype = harden({ capability: () => "authority" });
  const spoof = harden(Object.assign(Object.create(hostilePrototype), {
    name: "SafeDOMError",
    code: "ERR_INVALID_ARGUMENT",
    operation: "spoof",
    message: "The operation received an invalid argument",
  }));
  assert.equal(isSafeDOMError(spoof), false);
  assert.throws(() => passStyleOf(spoof));
});
