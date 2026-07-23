// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import { createContainedRoot as makeRoot } from "./support/contained-root.ts";
import { createTestSafeDocument as createSafeDocument } from "./support/create-safe-document.ts";

beforeEach(() => {
  document.body.replaceChildren();
});

describe("internationalization contract", () => {
  it("preserves multilingual text and BCP 47 language tags while constraining direction", () => {
    const root = makeRoot();
    const safeDocument = createSafeDocument(root);
    const wrapper = safeDocument.createDiv();
    const multilingual = "English — العربية — 日本語 — e\u0301 — 😀";

    wrapper.setLang("sr-Latn-RS");
    wrapper.setDir("RTL");
    wrapper.setTranslate(false);
    wrapper.setText(multilingual);
    safeDocument.appendChild(wrapper);

    const physical = root.querySelector("div");
    expect(physical?.getAttribute("lang")).toBe("sr-Latn-RS");
    expect(physical?.getAttribute("dir")).toBe("rtl");
    expect(wrapper.getTranslate()).toBe(false);
    expect(physical?.getAttribute("translate")).toBe("no");
    expect(wrapper.getText()).toBe(multilingual);
    expect(physical?.textContent).toBe(multilingual);

    wrapper.setLang("");
    expect(wrapper.getLang()).toBe("");
    expect(physical?.hasAttribute("lang")).toBe(true);
    expect(physical?.getAttribute("lang")).toBe("");

    wrapper.clearLang();
    expect(wrapper.getLang()).toBeUndefined();
    expect(physical?.hasAttribute("lang")).toBe(false);

    wrapper.setDir("auto");
    expect(wrapper.getDir()).toBe("auto");
    expect(physical?.getAttribute("dir")).toBe("auto");

    wrapper.clearDir();
    expect(wrapper.getDir()).toBeUndefined();
    expect(physical?.hasAttribute("dir")).toBe(false);

    physical?.setAttribute("dir", "SIDEWAYS");
    expect(wrapper.getDir()).toBeUndefined();
    physical?.setAttribute("dir", "RTL");
    expect(wrapper.getDir()).toBe("rtl");

    wrapper.clearTranslate();
    expect(wrapper.getTranslate()).toBeUndefined();
    expect(physical?.hasAttribute("translate")).toBe(false);
    physical?.setAttribute("translate", "");
    expect(wrapper.getTranslate()).toBe(true);
    physical?.setAttribute("translate", "NO");
    expect(wrapper.getTranslate()).toBe(false);
    physical?.setAttribute("translate", "invalid");
    expect(wrapper.getTranslate()).toBeUndefined();
  });

  it("keeps canonically equivalent Unicode identifier strings distinct", () => {
    const safeDocument = createSafeDocument(makeRoot());
    const composed = safeDocument.createDiv();
    const decomposed = safeDocument.createDiv();

    composed.setId("\u00e9");
    decomposed.setId("e\u0301");
    safeDocument.appendChild(composed);
    safeDocument.appendChild(decomposed);

    expect(safeDocument.getElement("\u00e9")).toBe(composed);
    expect(safeDocument.getElement("e\u0301")).toBe(decomposed);
    expect(composed.getId()).not.toBe(decomposed.getId());
  });

  it("round-trips astral, confusable, bidi-control, and lone-surrogate strings exactly", () => {
    const safeDocument = createSafeDocument(makeRoot());
    const wrapper = safeDocument.createDiv();
    const text = "😀 Latin a / Cyrillic а / \u202e / \ud800 / \udc00";

    wrapper.setText(text);
    wrapper.setId("a\ud800");
    expect(wrapper.getText()).toBe(text);
    expect(wrapper.getId()).toBe("a\ud800");

    const confusable = safeDocument.createSpan();
    confusable.setId("а\ud800");
    safeDocument.appendChild(wrapper);
    safeDocument.appendChild(confusable);
    expect(safeDocument.getElement("a\ud800")).toBe(wrapper);
    expect(safeDocument.getElement("а\ud800")).toBe(confusable);
  });

  it("provides semantic bidirectional isolation without CSS override authority", () => {
    const root = makeRoot();
    const safeDocument = createSafeDocument(root);
    const isolated = safeDocument.createBdi();

    isolated.setText("مستخدم 123");
    safeDocument.appendChild(isolated);

    const physical = root.querySelector("bdi");
    expect(physical?.localName).toBe("bdi");
    expect(physical?.textContent).toBe("مستخدم 123");
    expect(physical?.hasAttribute("dir")).toBe(false);
  });

  it("preserves a required localized option-group label", () => {
    const root = makeRoot();
    const safeDocument = createSafeDocument(root);
    const optgroup = safeDocument.createOptgroup();

    expect(() => optgroup.setLabel("")).toThrowError(expect.objectContaining({
      code: "ERR_INVALID_ARGUMENT",
      operation: "SafeOptgroupElement.setLabel.value",
    }));
    optgroup.setLabel("العربية");
    safeDocument.appendChild(optgroup);

    expect(root.querySelector("optgroup")?.getAttribute("label")).toBe("العربية");
  });

  it("exposes localized media-track semantics through a dedicated URL sink", () => {
    const deniedRoot = makeRoot();
    const deniedDocument = createSafeDocument(deniedRoot);
    const deniedTrack = deniedDocument.createTrack();
    expect(deniedTrack.setSrc("https://media.example/denied.vtt")).toMatchObject({
      allowed: false,
      error: { code: "ERR_URL_DENIED", operation: "track.src" },
    });
    deniedDocument.appendChild(deniedTrack);
    expect(deniedRoot.querySelector("track")?.hasAttribute("src")).toBe(false);

    const root = makeRoot();
    const safeDocument = createSafeDocument(root, {
      urlPolicy: {
        baseURL: "https://faß.example/",
        sinks: {
          "track.src": {
            allowedOrigins: ["https://faß.example"],
            allowedProtocols: ["https:"],
          },
        },
      },
    });
    const track = safeDocument.createTrack();

    expect(() => track.setSrcLang("")).toThrowError(expect.objectContaining({
      code: "ERR_INVALID_ARGUMENT",
      operation: "SafeTrackElement.setSrcLang.value",
    }));
    expect(() => track.setLabel("")).toThrowError(expect.objectContaining({
      code: "ERR_INVALID_ARGUMENT",
      operation: "SafeTrackElement.setLabel.value",
    }));
    track.setKind("CAPTIONS");
    expect(() => track.setKind("karaoke" as "captions")).toThrowError(expect.objectContaining({
      code: "ERR_INVALID_ARGUMENT",
      operation: "SafeTrackElement.setKind.value",
    }));
    track.setSrcLang("sr-Latn-RS");
    track.setLabel("العربية");
    track.setDefault(true);
    expect(track.setSrc("/字幕.vtt")).toEqual({
      allowed: true,
      url: "https://xn--fa-hia.example/%E5%AD%97%E5%B9%95.vtt",
    });
    safeDocument.appendChild(track);

    const physical = root.querySelector("track");
    expect(physical?.getAttribute("kind")).toBe("captions");
    expect(physical?.getAttribute("srclang")).toBe("sr-Latn-RS");
    expect(physical?.getAttribute("label")).toBe("العربية");
    expect(physical?.hasAttribute("default")).toBe(true);
    expect(physical?.getAttribute("src")).toBe(
      "https://xn--fa-hia.example/%E5%AD%97%E5%B9%95.vtt",
    );
  });

  it("exposes locale-independent error codes and operation identifiers", () => {
    const wrapper = createSafeDocument(makeRoot()).createDiv();

    expect(() => wrapper.setDir("sideways" as "ltr")).toThrowError(expect.objectContaining({
      name: "SafeDOMError",
      code: "ERR_INVALID_ARGUMENT",
      operation: "SafeElement.setDir.value",
    }));
  });

  it("preserves localized visible and accessible strings without translating structure", () => {
    const root = makeRoot();
    const safeDocument = createSafeDocument(root);
    const wrapper = safeDocument.createDiv();
    const visibleLabel = safeDocument.createSpan();

    wrapper.setText("إعدادات الحساب");
    wrapper.setAria("label", "إعدادات الحساب");
    wrapper.setAria("roledescription", "لوحة إعدادات");
    visibleLabel.setId("اسم-الحساب");
    visibleLabel.setText("اسم الحساب");
    wrapper.setAria("labelledby", "اسم-الحساب");
    safeDocument.appendChild(wrapper);
    safeDocument.appendChild(visibleLabel);

    expect(wrapper.getAria("label")).toBe("إعدادات الحساب");
    expect(wrapper.getAria("roledescription")).toBe("لوحة إعدادات");
    expect(wrapper.getAria("labelledby")).toBe("اسم-الحساب");
    expect(root.querySelector("div")?.textContent).toBe("إعدادات الحساب");
    expect(root.querySelector("div")?.getAttribute("aria-labelledby")).toMatch(
      /^aoa-i-[0-9a-f]{48}$/u,
    );
    expect(root.querySelector("div")?.getAttribute("aria-labelledby")).not.toBe("اسم-الحساب");
  });
});
