// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import {
  PUBLIC_EVENT_CATALOG,
  ROOT_BUBBLE_FENCE_EVENT_TYPES,
  ROOT_BUBBLE_FENCE_ONLY_EVENT_TYPES,
  TARGET_FENCE_EVENT_TYPES,
  TARGET_FENCE_ONLY_EVENT_TYPES,
} from "../src/event-catalog.ts";
import { createContainedRoot } from "./support/contained-root.ts";
import { createTestSafeDocument } from "./support/create-safe-document.ts";

describe("authoritative public event catalog", () => {
  it("derives both fence catalogs with explicit fence-only entries", () => {
    const metadata = Object.values(PUBLIC_EVENT_CATALOG);
    const publicTypes = metadata.map((entry) => entry.type);

    expect(new Set(publicTypes).size).toBe(21);
    expect(ROOT_BUBBLE_FENCE_ONLY_EVENT_TYPES).toEqual([
      "beforeinput",
      "focusin",
      "focusout",
      "reset",
      "submit",
    ]);
    expect(TARGET_FENCE_ONLY_EVENT_TYPES).toEqual([]);
    expect(ROOT_BUBBLE_FENCE_EVENT_TYPES).toEqual([
      ...metadata.filter((entry) => entry.fence === "root-bubble").map((entry) => entry.type),
      ...ROOT_BUBBLE_FENCE_ONLY_EVENT_TYPES,
    ]);
    expect(TARGET_FENCE_EVENT_TYPES).toEqual([
      ...metadata.filter((entry) => entry.fence === "target").map((entry) => entry.type),
      ...TARGET_FENCE_ONLY_EVENT_TYPES,
    ]);
  });

  it.each(Object.entries(PUBLIC_EVENT_CATALOG))(
    "%s registers its authoritative native type and snapshot kind",
    (method, metadata) => {
      const root = createContainedRoot();
      const safeDocument = createTestSafeDocument(root);
      const target = safeDocument.createInput();
      safeDocument.appendChild(target);
      const rawTarget = root.querySelector("input");
      if (!(rawTarget instanceof HTMLInputElement)) throw new Error("input fixture is missing");

      let observed: { readonly kind: string; readonly type: string } | undefined;
      const register = Reflect.get(target, method);
      if (typeof register !== "function") throw new Error(`missing public handler ${method}`);
      const cleanup = Reflect.apply(register, target, [
        (event: { readonly kind: string; readonly type: string }) => {
          observed = { kind: event.kind, type: event.type };
        },
      ]) as () => void;
      rawTarget.dispatchEvent(
        new Event(metadata.type, { bubbles: true, cancelable: true, composed: true }),
      );

      expect(observed).toEqual({ kind: metadata.kind, type: metadata.type });
      cleanup();
      safeDocument.dispose();
    },
  );
});
