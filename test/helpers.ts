import { expect } from "bun:test";
import { Window } from "happy-dom";
import { createSafeDomain, isSafeDOMError } from "../src/index.ts";
import type { SafeDomainOptions } from "../src/types.ts";

export function fixture(options?: SafeDomainOptions) {
  const win = new Window();
  const document = win.document as unknown as Document;
  const root = () => document.body.appendChild(document.createElement("section"));
  const domain = createSafeDomain(document, options);
  return { win, document, root, domain };
}
export function fails(code: string, run: () => unknown) {
  let actual;
  try {
    run();
  } catch (err) {
    actual = err;
  }
  expect(isSafeDOMError(actual)).toBe(true);
  expect(actual).toMatchObject({ code });
}
