import "ses";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { createSafeDocument } from "../src/index.ts";
const document = new Window().document as unknown as Document;
lockdown();
const doc = createSafeDocument(document.body);
const compartment = new Compartment({ doc });
assert.equal(
  compartment.evaluate(`(() => {
  const div = doc.createDiv();
  if (![doc,div,div.setId,div.style].every(Object.isFrozen)) return false;
  if (doc.appendChild(div) !== undefined || "ownerDocument" in div) return false;
  try { div.setId({toString(){throw 'coercion'}}); } catch (e) {
    return Object.isFrozen(e) && e.code === "INVALID_ARGUMENT" &&
      Object.getPrototypeOf(e) === Object.prototype && Reflect.ownKeys(e).length === 3 &&
      Object.values(e).every(v => typeof v === "string");
  }
})()`),
  true,
);
