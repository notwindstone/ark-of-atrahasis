// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import type { SafeURLPolicy } from "../src/index.ts";
import { createContainedRoot } from "./support/contained-root.ts";
import { createTestSafeDocument as createSafeDocument } from "./support/create-safe-document.ts";

const URL_POLICY = {
  baseURL: "https://example.test/",
  sinks: {
    "anchor.href": { allowedOrigins: ["https://example.test"] },
  },
} as const satisfies SafeURLPolicy;

afterEach(() => {
  document.body.replaceChildren();
});

describe("Ark 1.0 documents without legacy resource controls", () => {
  it("completes more than 100,000 public operations", { timeout: 15_000 }, () => {
    const safeDocument = createSafeDocument(createContainedRoot());
    const element = safeDocument.createDiv();
    let observed = "";

    try {
      for (let count = 0; count < 100_001; count += 1) {
        observed = element.getText();
      }
      expect(observed).toBe("");
    } finally {
      safeDocument.dispose();
    }
  });

  it("keeps more than 1,000 nodes and public listeners live together", {
    timeout: 15_000,
  }, () => {
    const root = createContainedRoot();
    const safeDocument = createSafeDocument(root);
    const parent = safeDocument.createDiv();
    const eventTarget = safeDocument.createDiv();
    const cleanups: Array<() => void> = [];
    const noop = (): void => undefined;

    try {
      parent.appendChild(eventTarget);
      for (let count = 0; count < 1_001; count += 1) {
        parent.appendChild(safeDocument.createTextNode());
        cleanups.push(eventTarget.onClick(noop));
      }
      safeDocument.appendChild(parent);

      expect(root.firstElementChild?.childNodes).toHaveLength(1_002);
      expect(cleanups).toHaveLength(1_001);
    } finally {
      for (const cleanup of cleanups.reverse()) cleanup();
      safeDocument.dispose();
    }
  });

  it("allows more than 64 live request attributes and 256 approved attempts", {
    timeout: 15_000,
  }, () => {
    const root = createContainedRoot();
    const safeDocument = createSafeDocument(root, { urlPolicy: URL_POLICY });
    const parent = safeDocument.createDiv();
    const anchors = [];
    let approved = 0;

    try {
      for (let count = 0; count < 65; count += 1) {
        const anchor = safeDocument.createAnchor();
        if (anchor.setHref(`resource-${count}`).allowed) approved += 1;
        parent.appendChild(anchor);
        anchors.push(anchor);
      }
      const repeated = anchors[0];
      if (repeated === undefined) throw new Error("expected a request-capable element");
      for (let count = 0; count < 257; count += 1) {
        if (repeated.setHref(`attempt-${count}`).allowed) approved += 1;
      }
      safeDocument.appendChild(parent);

      expect(approved).toBe(322);
      expect(root.querySelectorAll("a[href]")).toHaveLength(65);
      expect(root.querySelector("a")?.getAttribute("href")).toBe(
        "https://example.test/attempt-256",
      );
    } finally {
      safeDocument.dispose();
    }
  });

  it("accepts text, attribute, and style values beyond the former byte ceilings", {
    timeout: 15_000,
  }, () => {
    const root = createContainedRoot();
    const safeDocument = createSafeDocument(root, {
      stylePolicy: { allowedProperties: ["will-change"] },
    });
    const element = safeDocument.createDiv();
    const text = "t".repeat(1_048_577);
    const title = "a".repeat(262_145);
    const customIdent = `a${"b".repeat(262_144)}`;

    try {
      element.setText(text);
      element.setTitle(title);
      expect(element.style.set("will-change", customIdent)).toBe(true);
      safeDocument.appendChild(element);

      const raw = root.querySelector("div");
      expect(element.getText()).toHaveLength(text.length);
      expect(raw?.getAttribute("title")).toHaveLength(title.length);
      expect(raw?.getAttribute("style")?.length).toBeGreaterThan(262_144);
    } finally {
      safeDocument.dispose();
    }
  });

  it("maintains more than 4,096 distinct logical identifier mappings", {
    timeout: 15_000,
  }, () => {
    const root = createContainedRoot();
    const safeDocument = createSafeDocument(root);
    const cell = safeDocument.createTh();
    const logicalTokens = Array.from({ length: 4_097 }, (_, index) => `logical-${index}`);

    try {
      cell.setHeaders(logicalTokens.join(" "));
      safeDocument.appendChild(cell);

      const physicalTokens = root.querySelector("th")?.getAttribute("headers")?.split(" ");
      expect(cell.getHeaders().split(" ")).toEqual(logicalTokens);
      expect(physicalTokens).toHaveLength(logicalTokens.length);
      expect(new Set(physicalTokens)).toHaveLength(logicalTokens.length);
    } finally {
      safeDocument.dispose();
    }
  });
});
