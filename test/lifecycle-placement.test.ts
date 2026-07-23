// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { isSafeDOMError, type SafeURLPolicy } from "../src/index.ts";
import { createContainedRoot as makeRoot } from "./support/contained-root.ts";
import { createTestSafeDocument as createSafeDocument } from "./support/create-safe-document.ts";

const REQUEST_POLICY: SafeURLPolicy = {
  baseURL: "https://example.test/",
  sinks: {
    "image.src": { allowedOrigins: ["https://example.test"] },
    "anchor.href": { allowedOrigins: ["https://example.test"] },
    "track.src": { allowedOrigins: ["https://example.test"] },
  },
};

const STYLE_POLICY = {
  allowedProperties: ["color", "opacity"],
} as const;

function expectCode(action: () => unknown, code: string): void {
  expect(action).toThrowError(expect.objectContaining({ code }));
}

function captureSafeError(action: () => unknown, code: string): void {
  let caught: unknown;
  try {
    action();
  } catch (error) {
    caught = error;
  }
  expect(isSafeDOMError(caught)).toBe(true);
  expect(caught).toEqual(expect.objectContaining({ code }));
  expect(Object.isFrozen(caught)).toBe(true);
}

function requireElement<ElementType extends Element>(value: ElementType | null): ElementType {
  if (value === null) throw new Error("expected the test DOM element to exist");
  return value;
}

describe("placement enforcement", () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it("revokes a raw-host reparent without mutating the external DOM", () => {
    const root = makeRoot();
    const safeDocument = createSafeDocument(root);
    const wrapper = safeDocument.createDiv();
    safeDocument.appendChild(wrapper);
    const raw = requireElement(root.firstElementChild);
    const outside = document.createElement("section");
    document.body.appendChild(outside);
    outside.appendChild(raw);

    expectCode(() => wrapper.setText("guest mutation"), "PLACEMENT_VIOLATION");
    expect(outside.firstElementChild).toBe(raw);
    expect(raw.textContent).toBe("");

    expectCode(() => wrapper.setTitle("again"), "NODE_REVOKED");
    expect(raw.hasAttribute("title")).toBe(false);
    expect(() => wrapper.dispose()).not.toThrow();
    expect(outside.firstElementChild).toBe(raw);
    safeDocument.dispose();
    expect(outside.firstElementChild).toBe(raw);
  });

  it("releases logical namespace ownership without changing external namespace state", () => {
    const root = makeRoot();
    const safeDocument = createSafeDocument(root);
    const parent = safeDocument.createDiv();
    const input = safeDocument.createInput();
    const label = safeDocument.createLabel();
    const cell = safeDocument.createTh();
    input.setId("x");
    input.setName("y");
    input.setAria("controls", "x");
    label.setFor("x");
    cell.setHeaders("x");
    parent.appendChild(input);
    parent.appendChild(label);
    parent.appendChild(cell);
    safeDocument.appendChild(parent);

    const rawParent = requireElement(root.querySelector("div"));
    const rawInput = requireElement(rawParent.querySelector("input"));
    const rawLabel = requireElement(rawParent.querySelector("label"));
    const rawCell = requireElement(rawParent.querySelector("th"));
    const outside = document.createElement("section");
    document.body.appendChild(outside);
    outside.appendChild(rawParent);
    const beforeMarkup = new TextEncoder().encode(rawParent.outerHTML);

    expectCode(() => parent.getText(), "PLACEMENT_VIOLATION");
    expect(new TextEncoder().encode(rawParent.outerHTML)).toEqual(beforeMarkup);
    expect(rawInput.hasAttribute("id")).toBe(true);
    expect(rawInput.hasAttribute("name")).toBe(true);
    expect(rawInput.hasAttribute("aria-controls")).toBe(true);
    expect(rawLabel.hasAttribute("for")).toBe(true);
    expect(rawCell.hasAttribute("headers")).toBe(true);

    const replacementInput = safeDocument.createInput();
    const replacementLabel = safeDocument.createLabel();
    const replacementCell = safeDocument.createTh();
    replacementInput.setId("x");
    replacementInput.setName("y");
    replacementInput.setAria("controls", "x");
    replacementLabel.setFor("x");
    replacementCell.setHeaders("x");
  });

  it("does not attempt external namespace cleanup and releases logical ownership", () => {
    const prototype = window.Element.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "removeAttribute");
    if (descriptor === undefined || typeof descriptor.value !== "function") {
      throw new Error("expected Element.prototype.removeAttribute");
    }
    const nativeRemoveAttribute = descriptor.value;
    let failNextIdCleanup = false;
    Object.defineProperty(prototype, "removeAttribute", {
      ...descriptor,
      value(this: Element, name: string): void {
        if (failNextIdCleanup && name === "id") {
          failNextIdCleanup = false;
          throw document.body;
        }
        Reflect.apply(nativeRemoveAttribute, this, [name]);
      },
    });

    try {
      const root = makeRoot();
      const safeDocument = createSafeDocument(root);
      const input = safeDocument.createInput();
      input.setId("x");
      input.setName("y");
      safeDocument.appendChild(input);
      const raw = requireElement(root.querySelector("input"));
      const outside = document.createElement("section");
      document.body.appendChild(outside);
      outside.appendChild(raw);
      failNextIdCleanup = true;

      const beforeMarkup = new TextEncoder().encode(raw.outerHTML);
      expectCode(() => input.getId(), "PLACEMENT_VIOLATION");
      expect(new TextEncoder().encode(raw.outerHTML)).toEqual(beforeMarkup);
      expect(raw.hasAttribute("id")).toBe(true);
      expect(raw.hasAttribute("name")).toBe(true);

      expect(() => input.dispose()).not.toThrow();
      expect(new TextEncoder().encode(raw.outerHTML)).toEqual(beforeMarkup);
      const replacement = safeDocument.createInput();
      replacement.setId("x");
      replacement.setName("y");
    } finally {
      Object.defineProperty(prototype, "removeAttribute", descriptor);
    }
  });

  it("revokes nested capabilities without changing external raw-node state", () => {
    const root = makeRoot();
    const safeDocument = createSafeDocument(root, {
      urlPolicy: REQUEST_POLICY,
      stylePolicy: STYLE_POLICY,
    });
    const parent = safeDocument.createDiv();
    const image = safeDocument.createImage();
    const handler = vi.fn();
    parent.setTitle("ordinary parent state");
    image.setId("image");
    image.setAria("describedby", "image");
    image.setAlt("ordinary image state");
    image.setData("host-state", "preserve");
    expect(image.style.set("color", "red")).toBe(true);
    expect(image.setSrc("https://example.test/image.png").allowed).toBe(true);
    image.onClick(handler);
    parent.appendChild(image);
    safeDocument.appendChild(parent);

    const rawParent = requireElement(root.querySelector("div"));
    const rawImage = requireElement(root.querySelector("img")) as HTMLImageElement;
    const outside = document.createElement("section");
    document.body.appendChild(outside);
    outside.appendChild(rawParent);
    const beforeMarkup = new TextEncoder().encode(rawParent.outerHTML);
    const beforeIDL = new TextEncoder().encode(JSON.stringify({
      alt: rawImage.alt,
      complete: rawImage.complete,
    }));

    expectCode(() => parent.getText(), "PLACEMENT_VIOLATION");
    expect(new TextEncoder().encode(rawParent.outerHTML)).toEqual(beforeMarkup);
    expect(new TextEncoder().encode(JSON.stringify({
      alt: rawImage.alt,
      complete: rawImage.complete,
    }))).toEqual(beforeIDL);
    rawImage.dispatchEvent(new Event("click"));
    expect(handler).not.toHaveBeenCalled();
    expectCode(
      () => image.setSrc("https://example.test/revoked.png"),
      "NODE_REVOKED",
    );
    expect(new TextEncoder().encode(rawParent.outerHTML)).toEqual(beforeMarkup);

    expect(() => parent.dispose()).not.toThrow();
    expect(() => image.dispose()).not.toThrow();
    expect(() => safeDocument.dispose()).not.toThrow();
    expect(outside.firstElementChild).toBe(rawParent);
    expect(new TextEncoder().encode(rawParent.outerHTML)).toEqual(beforeMarkup);
  });

  it("does not attempt external request cleanup for a revoked descendant", () => {
    const prototype = window.Element.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "removeAttribute");
    if (descriptor === undefined || typeof descriptor.value !== "function") {
      throw new Error("expected Element.prototype.removeAttribute");
    }
    const nativeRemoveAttribute = descriptor.value;
    let failNextSourceCleanup = false;
    Object.defineProperty(prototype, "removeAttribute", {
      ...descriptor,
      value(this: Element, name: string): void {
        if (failNextSourceCleanup && name === "src") {
          failNextSourceCleanup = false;
          throw document.body;
        }
        Reflect.apply(nativeRemoveAttribute, this, [name]);
      },
    });

    try {
      const root = makeRoot();
      const safeDocument = createSafeDocument(root, {
        urlPolicy: REQUEST_POLICY,
      });
      const parent = safeDocument.createDiv();
      const image = safeDocument.createImage();
      expect(image.setSrc("https://example.test/original.png").allowed).toBe(true);
      parent.appendChild(image);
      safeDocument.appendChild(parent);
      const rawParent = requireElement(root.querySelector("div"));
      const rawImage = requireElement(root.querySelector("img"));
      const outside = document.createElement("section");
      document.body.appendChild(outside);
      outside.appendChild(rawParent);
      failNextSourceCleanup = true;
      const beforeMarkup = new TextEncoder().encode(rawParent.outerHTML);

      expectCode(() => parent.getText(), "PLACEMENT_VIOLATION");
      expect(new TextEncoder().encode(rawParent.outerHTML)).toEqual(beforeMarkup);
      expect(rawImage.hasAttribute("src")).toBe(true);
      expect(() => parent.dispose()).not.toThrow();
      expect(new TextEncoder().encode(rawParent.outerHTML)).toEqual(beforeMarkup);
    } finally {
      Object.defineProperty(prototype, "removeAttribute", descriptor);
    }
  });

  it("revokes an externally moved track without removing its physical VTT source", () => {
    const root = makeRoot();
    const safeDocument = createSafeDocument(root, {
      urlPolicy: REQUEST_POLICY,
    });
    const video = safeDocument.createVideo();
    const track = safeDocument.createTrack();
    expect(track.setSrc("https://example.test/captions.vtt").allowed).toBe(true);
    video.appendChild(track);
    safeDocument.appendChild(video);

    const rawVideo = requireElement(root.querySelector("video"));
    const rawTrack = requireElement(rawVideo.querySelector("track"));
    const outside = document.createElement("section");
    document.body.appendChild(outside);
    outside.appendChild(rawVideo);

    expectCode(() => video.getText(), "PLACEMENT_VIOLATION");
    expect(rawTrack.getAttribute("src")).toBe("https://example.test/captions.vtt");
    expectCode(() => track.setSrc("https://example.test/revoked.vtt"), "NODE_REVOKED");

  });

  it("removes an owned track source on disposal", () => {
    const root = makeRoot();
    const safeDocument = createSafeDocument(root, {
      urlPolicy: REQUEST_POLICY,
    });
    const track = safeDocument.createTrack();
    expect(track.setSrc("https://example.test/captions.vtt").allowed).toBe(true);
    safeDocument.appendChild(track);
    const rawTrack = requireElement(root.querySelector("track"));

    track.dispose();
    expect(rawTrack.hasAttribute("src")).toBe(false);
    expect(rawTrack.isConnected).toBe(false);
  });

  it("treats a detached external parent as outside the owned tree", () => {
    const root = makeRoot();
    const safeDocument = createSafeDocument(root);
    const wrapper = safeDocument.createSpan();
    safeDocument.appendChild(wrapper);
    const raw = requireElement(root.firstElementChild);
    const detachedExternalParent = document.createElement("div");
    detachedExternalParent.appendChild(raw);

    expectCode(() => wrapper.setId("escaped"), "PLACEMENT_VIOLATION");
    expect(detachedExternalParent.firstElementChild).toBe(raw);
    expect(raw.hasAttribute("id")).toBe(false);
  });

  it("revokes a node adopted into another document", () => {
    const root = makeRoot();
    const safeDocument = createSafeDocument(root);
    const wrapper = safeDocument.createInput();
    wrapper.setId("adopted-id");
    wrapper.setName("adopted-name");
    wrapper.setValue("ordinary IDL state");
    safeDocument.appendChild(wrapper);
    const raw = requireElement(root.firstElementChild);
    const foreignDocument = document.implementation.createHTMLDocument("foreign");
    foreignDocument.adoptNode(raw);
    const beforeMarkup = new TextEncoder().encode(raw.outerHTML);
    const beforeIDL = new TextEncoder().encode((raw as HTMLInputElement).value);

    expectCode(() => wrapper.setClass("cross-realm"), "PLACEMENT_VIOLATION");
    expect(raw.ownerDocument).toBe(foreignDocument);
    expect(raw.hasAttribute("class")).toBe(false);
    expect(raw.parentNode).toBe(null);
    expect(new TextEncoder().encode(raw.outerHTML)).toEqual(beforeMarkup);
    expect(new TextEncoder().encode((raw as HTMLInputElement).value)).toEqual(beforeIDL);
    expect(() => wrapper.dispose()).not.toThrow();
    expect(raw.ownerDocument).toBe(foreignDocument);
    expect(raw.parentNode).toBe(null);
    expect(new TextEncoder().encode(raw.outerHTML)).toEqual(beforeMarkup);
  });

  it("suppresses callbacks after raw placement is compromised", () => {
    const root = makeRoot();
    const safeDocument = createSafeDocument(root);
    const wrapper = safeDocument.createButton();
    const handler = vi.fn();
    wrapper.onClick(handler);
    safeDocument.appendChild(wrapper);
    const raw = requireElement(root.firstElementChild);
    const outside = document.createElement("div");
    outside.appendChild(raw);

    raw.dispatchEvent(new Event("click"));

    expect(handler).not.toHaveBeenCalled();
    expect(outside.firstElementChild).toBe(raw);
    expectCode(() => wrapper.getText(), "NODE_REVOKED");
  });
});

describe("detach and disposal", () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it("does not rewrite text when the mutation fails before writing", () => {
    const prototype = window.Node.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "textContent");
    if (
      descriptor === undefined
      || typeof descriptor.get !== "function"
      || typeof descriptor.set !== "function"
    ) {
      throw new Error("expected Node.textContent accessors");
    }
    const nativeSetter = descriptor.set;
    let target: Node | undefined;
    Object.defineProperty(prototype, "textContent", {
      ...descriptor,
      set(this: Node, value: string | null): void {
        if (this === target && value === "guest mutation") throw document.body;
        Reflect.apply(nativeSetter, this, [value]);
      },
    });

    try {
      const root = makeRoot();
      const safeDocument = createSafeDocument(root);
      const wrapper = safeDocument.createDiv();
      safeDocument.appendChild(wrapper);
      target = requireElement(root.querySelector("div"));
      const trustedChild = document.createElement("span");
      trustedChild.textContent = "trusted";
      target.appendChild(trustedChild);

      captureSafeError(() => wrapper.setText("guest mutation"), "DOM_OPERATION_FAILED");
      expect(target.firstChild).toBe(trustedChild);
      expect(target.textContent).toBe("trusted");
    } finally {
      Object.defineProperty(prototype, "textContent", descriptor);
    }
  });

  it("does not rewrite non-reflected IDL when its setter fails before writing", () => {
    const prototype = window.HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "checked");
    if (
      descriptor === undefined
      || typeof descriptor.get !== "function"
      || typeof descriptor.set !== "function"
    ) {
      throw new Error("expected HTMLInputElement.checked accessors");
    }
    const nativeSetter = descriptor.set;
    let target: HTMLInputElement | undefined;
    let writes = 0;
    Object.defineProperty(prototype, "checked", {
      ...descriptor,
      set(this: HTMLInputElement, value: boolean): void {
        if (this === target) {
          writes += 1;
          if (value) throw document.body;
        }
        Reflect.apply(nativeSetter, this, [value]);
      },
    });

    try {
      const root = makeRoot();
      const safeDocument = createSafeDocument(root);
      const wrapper = safeDocument.createInput();
      wrapper.setType("checkbox");
      safeDocument.appendChild(wrapper);
      target = requireElement(root.querySelector("input"));

      captureSafeError(() => wrapper.setChecked(true), "DOM_OPERATION_FAILED");
      expect(writes).toBe(1);
      expect(target.checked).toBe(false);
      expect(() => wrapper.setTitle("still-active")).not.toThrow();
    } finally {
      Object.defineProperty(prototype, "checked", descriptor);
    }
  });

  it("does not retry a pre-revocation IDL rollback after the host moves the raw node external", () => {
    const prototype = window.HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "checked");
    if (
      descriptor === undefined
      || typeof descriptor.get !== "function"
      || typeof descriptor.set !== "function"
    ) {
      throw new Error("expected HTMLInputElement.checked accessors");
    }
    const nativeSetter = descriptor.set;
    let target: HTMLInputElement | undefined;
    let mutationFailure = true;
    let restorationFailure = true;
    Object.defineProperty(prototype, "checked", {
      ...descriptor,
      set(this: HTMLInputElement, value: boolean): void {
        if (this === target && value && mutationFailure) {
          mutationFailure = false;
          Reflect.apply(nativeSetter, this, [value]);
          throw document.body;
        }
        if (this === target && !value && restorationFailure) {
          restorationFailure = false;
          throw document.body;
        }
        Reflect.apply(nativeSetter, this, [value]);
      },
    });

    try {
      const root = makeRoot();
      const safeDocument = createSafeDocument(root);
      const wrapper = safeDocument.createInput();
      wrapper.setType("checkbox");
      safeDocument.appendChild(wrapper);
      target = requireElement(root.querySelector("input")) as HTMLInputElement;

      captureSafeError(() => wrapper.setChecked(true), "DOM_OPERATION_FAILED");
      expect(target.checked).toBe(true);
      const outside = document.createElement("section");
      document.body.append(outside);
      outside.append(target);

      expect(() => wrapper.dispose()).not.toThrow();
      expect(target.checked).toBe(true);
      expect(outside.firstElementChild).toBe(target);
    } finally {
      Object.defineProperty(prototype, "checked", descriptor);
    }
  });

  it("preserves an unproven canvas write after the host moves it external", () => {
    const prototype = window.HTMLCanvasElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "width");
    if (
      descriptor === undefined
      || typeof descriptor.get !== "function"
      || typeof descriptor.set !== "function"
    ) {
      throw new Error("expected HTMLCanvasElement.width accessors");
    }
    const nativeSetter = descriptor.set;
    let target: HTMLCanvasElement | undefined;
    let mutationFailure = true;
    let restorationFailure = true;
    Object.defineProperty(prototype, "width", {
      ...descriptor,
      set(this: HTMLCanvasElement, value: number): void {
        if (this === target && value === 301 && mutationFailure) {
          mutationFailure = false;
          Reflect.apply(nativeSetter, this, [value]);
          throw document.body;
        }
        if (this === target && value === 300 && restorationFailure) {
          restorationFailure = false;
          throw document.body;
        }
        Reflect.apply(nativeSetter, this, [value]);
      },
    });

    try {
      const root = makeRoot();
      const safeDocument = createSafeDocument(root);
      const wrapper = safeDocument.createCanvas();
      safeDocument.appendChild(wrapper);
      target = requireElement(root.querySelector("canvas")) as HTMLCanvasElement;

      captureSafeError(() => wrapper.setWidth(301), "DOM_OPERATION_FAILED");
      expect([target.width, target.height]).toEqual([301, 150]);
      expect(target.getAttribute("width")).toBe("301");

      const outside = document.createElement("section");
      document.body.append(outside);
      outside.append(target);
      const before = new TextEncoder().encode(target.outerHTML);

      expect(() => wrapper.dispose()).not.toThrow();
      expect(new TextEncoder().encode(target.outerHTML)).toEqual(before);
      expect(outside.firstElementChild).toBe(target);
    } finally {
      Object.defineProperty(prototype, "width", descriptor);
    }
  });

  it("does not rewrite style when its setter fails before writing", () => {
    const prototype = window.CSSStyleDeclaration.prototype;
    const setDescriptor = Object.getOwnPropertyDescriptor(prototype, "setProperty");
    const removeDescriptor = Object.getOwnPropertyDescriptor(prototype, "removeProperty");
    if (
      setDescriptor === undefined
      || typeof setDescriptor.value !== "function"
      || removeDescriptor === undefined
      || typeof removeDescriptor.value !== "function"
    ) {
      throw new Error("expected CSSStyleDeclaration mutation methods");
    }
    const nativeSetProperty = setDescriptor.value;
    const nativeRemoveProperty = removeDescriptor.value;
    let target: CSSStyleDeclaration | undefined;
    let setCalls = 0;
    let removeCalls = 0;
    Object.defineProperty(prototype, "setProperty", {
      ...setDescriptor,
      value(this: CSSStyleDeclaration, ...arguments_: [string, string, string?]): void {
        if (this === target) {
          setCalls += 1;
          throw document.body;
        }
        Reflect.apply(nativeSetProperty, this, arguments_);
      },
    });
    Object.defineProperty(prototype, "removeProperty", {
      ...removeDescriptor,
      value(this: CSSStyleDeclaration, property: string): string {
        if (this === target) removeCalls += 1;
        return Reflect.apply(nativeRemoveProperty, this, [property]);
      },
    });

    try {
      const root = makeRoot();
      const safeDocument = createSafeDocument(root, { stylePolicy: STYLE_POLICY });
      const wrapper = safeDocument.createDiv();
      safeDocument.appendChild(wrapper);
      const raw = requireElement(root.querySelector("div")) as HTMLElement;
      target = raw.style;

      expect(wrapper.style.set("color", "red")).toBe(false);
      expect({ setCalls, removeCalls }).toEqual({ setCalls: 1, removeCalls: 0 });
      expect(raw.hasAttribute("style")).toBe(false);
      expect(() => wrapper.setTitle("still-active")).not.toThrow();
    } finally {
      Object.defineProperty(prototype, "setProperty", setDescriptor);
      Object.defineProperty(prototype, "removeProperty", removeDescriptor);
    }
  });

  it("retains a write-then-throw URL effect until retryable disposal removes it", () => {
    const prototype = window.Element.prototype;
    const setDescriptor = Object.getOwnPropertyDescriptor(prototype, "setAttribute");
    const removeDescriptor = Object.getOwnPropertyDescriptor(prototype, "removeAttribute");
    if (
      setDescriptor === undefined
      || typeof setDescriptor.value !== "function"
      || removeDescriptor === undefined
      || typeof removeDescriptor.value !== "function"
    ) {
      throw new Error("expected Element attribute methods");
    }
    const nativeSetAttribute = setDescriptor.value;
    const nativeRemoveAttribute = removeDescriptor.value;
    const trustedSource = "https://host.test/trusted-before.png";
    const guestSource = "https://example.test/write-then-throw.png";
    let target: Element | undefined;
    let intercept = false;
    let restorationFailures = 2;
    let cleanupFailures = 1;
    Object.defineProperty(prototype, "setAttribute", {
      ...setDescriptor,
      value(this: Element, name: string, value: string): void {
        if (intercept && this === target && name === "src") {
          if (value === guestSource) {
            Reflect.apply(nativeSetAttribute, this, [name, value]);
            throw document.body;
          }
          if (value === trustedSource && restorationFailures > 0) {
            restorationFailures -= 1;
            throw document.body;
          }
        }
        Reflect.apply(nativeSetAttribute, this, [name, value]);
      },
    });
    Object.defineProperty(prototype, "removeAttribute", {
      ...removeDescriptor,
      value(this: Element, name: string): void {
        if (this === target && name === "src" && cleanupFailures > 0) {
          cleanupFailures -= 1;
          throw document.body;
        }
        Reflect.apply(nativeRemoveAttribute, this, [name]);
      },
    });

    try {
      const root = makeRoot();
      const safeDocument = createSafeDocument(root, {
        urlPolicy: REQUEST_POLICY,
      });
      const image = safeDocument.createImage();
      safeDocument.appendChild(image);
      target = requireElement(root.querySelector("img"));
      Reflect.apply(nativeSetAttribute, target, ["src", trustedSource]);
      intercept = true;

      captureSafeError(
        () => image.setSrc(guestSource),
        "DOM_OPERATION_FAILED",
      );
      expect(target.getAttribute("src")).toBe(guestSource);

      captureSafeError(() => safeDocument.dispose(), "DOM_OPERATION_FAILED");
      expect(target.getAttribute("src")).toBe(guestSource);
      expect(() => safeDocument.dispose()).not.toThrow();
      expect(target.getAttribute("src")).toBe(trustedSource);
    } finally {
      Object.defineProperty(prototype, "setAttribute", setDescriptor);
      Object.defineProperty(prototype, "removeAttribute", removeDescriptor);
    }
  });

  it("does not retry a pre-revocation URL rollback after the host moves the raw node external", () => {
    const prototype = window.Element.prototype;
    const setDescriptor = Object.getOwnPropertyDescriptor(prototype, "setAttribute");
    if (setDescriptor === undefined || typeof setDescriptor.value !== "function") {
      throw new Error("expected Element.setAttribute");
    }
    const nativeSetAttribute = setDescriptor.value;
    const trustedSource = "https://host.test/trusted-before.png";
    const guestSource = "https://example.test/write-then-throw.png";
    let target: Element | undefined;
    let intercept = false;
    let mutationFailure = true;
    let restorationFailure = true;
    Object.defineProperty(prototype, "setAttribute", {
      ...setDescriptor,
      value(this: Element, name: string, value: string): void {
        if (intercept && this === target && name === "src") {
          if (value === guestSource && mutationFailure) {
            mutationFailure = false;
            Reflect.apply(nativeSetAttribute, this, [name, value]);
            throw document.body;
          }
          if (value === trustedSource && restorationFailure) {
            restorationFailure = false;
            throw document.body;
          }
        }
        Reflect.apply(nativeSetAttribute, this, [name, value]);
      },
    });

    try {
      const root = makeRoot();
      const safeDocument = createSafeDocument(root, {
        urlPolicy: REQUEST_POLICY,
      });
      const image = safeDocument.createImage();
      safeDocument.appendChild(image);
      target = requireElement(root.querySelector("img"));
      Reflect.apply(nativeSetAttribute, target, ["src", trustedSource]);
      intercept = true;

      captureSafeError(() => image.setSrc(guestSource), "DOM_OPERATION_FAILED");
      expect(target.getAttribute("src")).toBe(guestSource);
      const outside = document.createElement("section");
      document.body.append(outside);
      outside.append(target);
      const before = new TextEncoder().encode(target.outerHTML);

      expect(() => image.dispose()).not.toThrow();
      expect(new TextEncoder().encode(target.outerHTML)).toEqual(before);
      expect(outside.firstElementChild).toBe(target);
    } finally {
      Object.defineProperty(prototype, "setAttribute", setDescriptor);
    }
  });

  it("does not retry pre-revocation namespace cleanup against external raw DOM", () => {
    const prototype = window.Element.prototype;
    const setDescriptor = Object.getOwnPropertyDescriptor(prototype, "setAttribute");
    const removeDescriptor = Object.getOwnPropertyDescriptor(prototype, "removeAttribute");
    if (
      setDescriptor === undefined
      || typeof setDescriptor.value !== "function"
      || removeDescriptor === undefined
      || typeof removeDescriptor.value !== "function"
    ) {
      throw new Error("expected Element attribute methods");
    }
    const nativeSetAttribute = setDescriptor.value;
    const nativeRemoveAttribute = removeDescriptor.value;
    let target: Element | undefined;
    let mutationFailure = true;
    let restorationFailure = true;
    Object.defineProperty(prototype, "setAttribute", {
      ...setDescriptor,
      value(this: Element, name: string, value: string): void {
        Reflect.apply(nativeSetAttribute, this, [name, value]);
        if (this === target && name === "id" && mutationFailure) {
          mutationFailure = false;
          throw document.body;
        }
      },
    });
    Object.defineProperty(prototype, "removeAttribute", {
      ...removeDescriptor,
      value(this: Element, name: string): void {
        if (this === target && name === "id" && restorationFailure) {
          restorationFailure = false;
          throw document.body;
        }
        Reflect.apply(nativeRemoveAttribute, this, [name]);
      },
    });

    try {
      const root = makeRoot();
      const safeDocument = createSafeDocument(root);
      const wrapper = safeDocument.createDiv();
      safeDocument.appendChild(wrapper);
      target = requireElement(root.querySelector("div"));

      captureSafeError(() => wrapper.setId("pending"), "DOM_OPERATION_FAILED");
      expect(target.id).toMatch(/^aoa-i-[0-9a-f]{48}$/u);
      const outside = document.createElement("section");
      document.body.append(outside);
      outside.append(target);
      const before = new TextEncoder().encode(target.outerHTML);

      expect(() => wrapper.dispose()).not.toThrow();
      expect(new TextEncoder().encode(target.outerHTML)).toEqual(before);
      expect(outside.firstElementChild).toBe(target);
      const replacement = safeDocument.createDiv();
      replacement.setId("pending");
      expect(replacement.getId()).toBe("pending");
    } finally {
      Object.defineProperty(prototype, "setAttribute", setDescriptor);
      Object.defineProperty(prototype, "removeAttribute", removeDescriptor);
    }
  });

  it("retains an unproven style effect until retryable disposal succeeds", () => {
    const stylePrototype = window.CSSStyleDeclaration.prototype;
    const setDescriptor = Object.getOwnPropertyDescriptor(stylePrototype, "setProperty");
    const removePropertyDescriptor = Object.getOwnPropertyDescriptor(
      stylePrototype,
      "removeProperty",
    );
    const elementPrototype = window.Element.prototype;
    const removeAttributeDescriptor = Object.getOwnPropertyDescriptor(
      elementPrototype,
      "removeAttribute",
    );
    if (
      setDescriptor === undefined
      || typeof setDescriptor.value !== "function"
      || removePropertyDescriptor === undefined
      || typeof removePropertyDescriptor.value !== "function"
      || removeAttributeDescriptor === undefined
      || typeof removeAttributeDescriptor.value !== "function"
    ) {
      throw new Error("expected CSS and Element mutation methods");
    }
    const nativeSetProperty = setDescriptor.value;
    const nativeRemoveProperty = removePropertyDescriptor.value;
    const nativeRemoveAttribute = removeAttributeDescriptor.value;
    let targetDeclaration: CSSStyleDeclaration | undefined;
    let targetElement: Element | undefined;
    let mutationFailure = true;
    let restorationFailure = true;
    let cleanupFailure = true;
    Object.defineProperty(stylePrototype, "setProperty", {
      ...setDescriptor,
      value(this: CSSStyleDeclaration, property: string, value: string, priority?: string): void {
        Reflect.apply(nativeSetProperty, this, [property, value, priority]);
        if (this === targetDeclaration && mutationFailure) {
          mutationFailure = false;
          throw document.body;
        }
      },
    });
    Object.defineProperty(stylePrototype, "removeProperty", {
      ...removePropertyDescriptor,
      value(this: CSSStyleDeclaration, property: string): string {
        if (this === targetDeclaration && restorationFailure) {
          restorationFailure = false;
          throw document.body;
        }
        return Reflect.apply(nativeRemoveProperty, this, [property]);
      },
    });
    Object.defineProperty(elementPrototype, "removeAttribute", {
      ...removeAttributeDescriptor,
      value(this: Element, name: string): void {
        if (this === targetElement && name === "style" && cleanupFailure) {
          cleanupFailure = false;
          throw document.body;
        }
        Reflect.apply(nativeRemoveAttribute, this, [name]);
      },
    });

    try {
      const root = makeRoot();
      const safeDocument = createSafeDocument(root, {
        stylePolicy: STYLE_POLICY,
      });
      const wrapper = safeDocument.createDiv();
      safeDocument.appendChild(wrapper);
      targetElement = requireElement(root.querySelector("div"));
      targetDeclaration = (targetElement as HTMLElement).style;

      expect(wrapper.style.set("color", "red")).toBe(false);
      expect(targetDeclaration.getPropertyValue("color")).toBe("red");

      captureSafeError(() => safeDocument.dispose(), "DOM_OPERATION_FAILED");
      expect(targetElement.hasAttribute("style")).toBe(true);
      expect(() => safeDocument.dispose()).not.toThrow();
      expect(targetElement.hasAttribute("style")).toBe(false);
    } finally {
      Object.defineProperty(stylePrototype, "setProperty", setDescriptor);
      Object.defineProperty(stylePrototype, "removeProperty", removePropertyDescriptor);
      Object.defineProperty(elementPrototype, "removeAttribute", removeAttributeDescriptor);
    }
  });

  it.each(["node", "document"] as const)(
    "never retries a pre-revocation style rollback against external raw DOM during %s disposal",
    (disposal) => {
      const prototype = window.CSSStyleDeclaration.prototype;
      const setDescriptor = Object.getOwnPropertyDescriptor(prototype, "setProperty");
      const removeDescriptor = Object.getOwnPropertyDescriptor(prototype, "removeProperty");
      if (
        setDescriptor === undefined
        || typeof setDescriptor.value !== "function"
        || removeDescriptor === undefined
        || typeof removeDescriptor.value !== "function"
      ) {
        throw new Error("expected CSSStyleDeclaration mutation methods");
      }
      const nativeSetProperty = setDescriptor.value;
      const nativeRemoveProperty = removeDescriptor.value;
      let target: CSSStyleDeclaration | undefined;
      let mutationFailure = true;
      let restorationFailure = true;
      Object.defineProperty(prototype, "setProperty", {
        ...setDescriptor,
        value(this: CSSStyleDeclaration, property: string, value: string, priority?: string): void {
          Reflect.apply(nativeSetProperty, this, [property, value, priority]);
          if (this === target && mutationFailure) {
            mutationFailure = false;
            throw document.body;
          }
        },
      });
      Object.defineProperty(prototype, "removeProperty", {
        ...removeDescriptor,
        value(this: CSSStyleDeclaration, property: string): string {
          if (this === target && restorationFailure) {
            restorationFailure = false;
            throw document.body;
          }
          return Reflect.apply(nativeRemoveProperty, this, [property]);
        },
      });

      try {
        const root = makeRoot();
        const safeDocument = createSafeDocument(root, {
          stylePolicy: STYLE_POLICY,
        });
        const wrapper = safeDocument.createDiv();
        safeDocument.appendChild(wrapper);
        const raw = requireElement(root.querySelector("div")) as HTMLElement;
        target = raw.style;

        expect(wrapper.style.set("color", "red")).toBe(false);
        expect(raw.style.getPropertyValue("color")).toBe("red");
        const outside = document.createElement("section");
        document.body.append(outside);
        outside.append(raw);
        const before = new TextEncoder().encode(raw.outerHTML);

        expect(() => disposal === "node" ? wrapper.dispose() : safeDocument.dispose()).not.toThrow();
        expect(new TextEncoder().encode(raw.outerHTML)).toEqual(before);
        expect(outside.firstElementChild).toBe(raw);
      } finally {
        Object.defineProperty(prototype, "setProperty", setDescriptor);
        Object.defineProperty(prototype, "removeProperty", removeDescriptor);
      }
    },
  );

  it.each(["parent-first", "child-first"] as const)(
    "preserves an external subtree and revokes its descendant during parent disposal (%s)",
    (creationOrder) => {
    const prototype = window.CSSStyleDeclaration.prototype;
    const setDescriptor = Object.getOwnPropertyDescriptor(prototype, "setProperty");
    const removeDescriptor = Object.getOwnPropertyDescriptor(prototype, "removeProperty");
    if (
      setDescriptor === undefined
      || typeof setDescriptor.value !== "function"
      || removeDescriptor === undefined
      || typeof removeDescriptor.value !== "function"
    ) {
      throw new Error("expected CSSStyleDeclaration mutation methods");
    }
    const nativeSetProperty = setDescriptor.value;
    const nativeRemoveProperty = removeDescriptor.value;
    let target: CSSStyleDeclaration | undefined;
    let mutationFailure = true;
    let restorationFailure = true;
    Object.defineProperty(prototype, "setProperty", {
      ...setDescriptor,
      value(this: CSSStyleDeclaration, property: string, value: string, priority?: string): void {
        Reflect.apply(nativeSetProperty, this, [property, value, priority]);
        if (this === target && mutationFailure) {
          mutationFailure = false;
          throw document.body;
        }
      },
    });
    Object.defineProperty(prototype, "removeProperty", {
      ...removeDescriptor,
      value(this: CSSStyleDeclaration, property: string): string {
        if (this === target && restorationFailure) {
          restorationFailure = false;
          throw document.body;
        }
        return Reflect.apply(nativeRemoveProperty, this, [property]);
      },
    });

    try {
      const root = makeRoot();
      const safeDocument = createSafeDocument(root, {
        stylePolicy: STYLE_POLICY,
      });
      const first = safeDocument.createDiv();
      const second = safeDocument.createDiv();
      const parent = creationOrder === "parent-first" ? first : second;
      const child = creationOrder === "parent-first" ? second : first;
      parent.appendChild(child);
      safeDocument.appendChild(parent);
      const rawParent = requireElement(root.querySelector("div")) as HTMLElement;
      const rawChild = requireElement(rawParent.querySelector("div")) as HTMLElement;
      target = rawChild.style;

      expect(child.style.set("color", "red")).toBe(false);
      expect(rawChild.style.getPropertyValue("color")).toBe("red");
      const outside = document.createElement("section");
      document.body.append(outside);
      outside.append(rawParent);
      const before = new TextEncoder().encode(rawParent.outerHTML);

      expect(() => parent.dispose()).not.toThrow();
      expect(new TextEncoder().encode(rawParent.outerHTML)).toEqual(before);
      expectCode(() => child.getText(), "NODE_REVOKED");
    } finally {
      Object.defineProperty(prototype, "setProperty", setDescriptor);
      Object.defineProperty(prototype, "removeProperty", removeDescriptor);
    }
    },
  );

  it("preserves a disposed descendant state while retrying owned subtree cleanup", () => {
    const elementPrototype = window.Element.prototype;
    const removeAttributeDescriptor = Object.getOwnPropertyDescriptor(
      elementPrototype,
      "removeAttribute",
    );
    const stylePrototype = window.CSSStyleDeclaration.prototype;
    const setPropertyDescriptor = Object.getOwnPropertyDescriptor(stylePrototype, "setProperty");
    const removePropertyDescriptor = Object.getOwnPropertyDescriptor(
      stylePrototype,
      "removeProperty",
    );
    if (
      removeAttributeDescriptor === undefined
      || typeof removeAttributeDescriptor.value !== "function"
      || setPropertyDescriptor === undefined
      || typeof setPropertyDescriptor.value !== "function"
      || removePropertyDescriptor === undefined
      || typeof removePropertyDescriptor.value !== "function"
    ) {
      throw new Error("expected Element and CSSStyleDeclaration mutation methods");
    }
    const nativeRemoveAttribute = removeAttributeDescriptor.value;
    const nativeSetProperty = setPropertyDescriptor.value;
    const nativeRemoveProperty = removePropertyDescriptor.value;
    let imageTarget: Element | undefined;
    let parentStyleTarget: CSSStyleDeclaration | undefined;
    let sourceCleanupFailure = true;
    let styleMutationFailure = true;
    let styleRestorationFailure = true;
    Object.defineProperty(elementPrototype, "removeAttribute", {
      ...removeAttributeDescriptor,
      value(this: Element, name: string): void {
        if (this === imageTarget && name === "src" && sourceCleanupFailure) {
          sourceCleanupFailure = false;
          throw document.body;
        }
        Reflect.apply(nativeRemoveAttribute, this, [name]);
      },
    });
    Object.defineProperty(stylePrototype, "setProperty", {
      ...setPropertyDescriptor,
      value(this: CSSStyleDeclaration, property: string, value: string, priority?: string): void {
        Reflect.apply(nativeSetProperty, this, [property, value, priority]);
        if (this === parentStyleTarget && styleMutationFailure) {
          styleMutationFailure = false;
          throw document.body;
        }
      },
    });
    Object.defineProperty(stylePrototype, "removeProperty", {
      ...removePropertyDescriptor,
      value(this: CSSStyleDeclaration, property: string): string {
        if (this === parentStyleTarget && styleRestorationFailure) {
          styleRestorationFailure = false;
          throw document.body;
        }
        return Reflect.apply(nativeRemoveProperty, this, [property]);
      },
    });

    try {
      const root = makeRoot();
      const safeDocument = createSafeDocument(root, {
        stylePolicy: STYLE_POLICY,
        urlPolicy: REQUEST_POLICY,
      });
      const parent = safeDocument.createDiv();
      const image = safeDocument.createImage();
      expect(image.setSrc("https://example.test/original.png").allowed).toBe(true);
      parent.appendChild(image);
      safeDocument.appendChild(parent);
      const rawParent = requireElement(root.querySelector("div")) as HTMLElement;
      const rawImage = requireElement(rawParent.querySelector("img"));
      imageTarget = rawImage;

      expectCode(() => image.dispose(), "DOM_OPERATION_FAILED");
      expect(rawImage.hasAttribute("src")).toBe(true);
      rawParent.append(rawImage);
      parentStyleTarget = rawParent.style;
      expect(parent.style.set("color", "red")).toBe(false);

      expect(() => parent.dispose()).not.toThrow();
      expect(rawImage.hasAttribute("src")).toBe(false);
      expect(root.childNodes).toHaveLength(0);
    } finally {
      Object.defineProperty(elementPrototype, "removeAttribute", removeAttributeDescriptor);
      Object.defineProperty(stylePrototype, "setProperty", setPropertyDescriptor);
      Object.defineProperty(stylePrototype, "removeProperty", removePropertyDescriptor);
    }
  });

  it("accepts a style restoration only after write-then-throw readback proves it", () => {
    const prototype = window.CSSStyleDeclaration.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "setProperty");
    if (descriptor === undefined || typeof descriptor.value !== "function") {
      throw new Error("expected CSSStyleDeclaration.setProperty");
    }
    const nativeSetProperty = descriptor.value;
    let target: CSSStyleDeclaration | undefined;
    let failures = 2;
    Object.defineProperty(prototype, "setProperty", {
      ...descriptor,
      value(this: CSSStyleDeclaration, property: string, value: string, priority?: string): void {
        Reflect.apply(nativeSetProperty, this, [property, value, priority]);
        if (this === target && failures > 0) {
          failures -= 1;
          throw document.body;
        }
      },
    });

    try {
      const root = makeRoot();
      const safeDocument = createSafeDocument(root, {
        stylePolicy: STYLE_POLICY,
      });
      const wrapper = safeDocument.createDiv();
      safeDocument.appendChild(wrapper);
      const raw = requireElement(root.querySelector("div")) as HTMLElement;
      Reflect.apply(nativeSetProperty, raw.style, ["color", "blue", ""]);
      target = raw.style;

      expect(wrapper.style.set("color", "red")).toBe(false);
      expect(raw.style.getPropertyValue("color")).toBe("blue");
      expect(() => wrapper.setTitle("still-active")).not.toThrow();
      expect(() => safeDocument.dispose()).not.toThrow();
      expect(raw.style.getPropertyValue("color")).toBe("blue");
    } finally {
      Object.defineProperty(prototype, "setProperty", descriptor);
    }
  });

  it("keeps detach reversible and makes node disposal irreversible and idempotent", () => {
    const root = makeRoot();
    const safeDocument = createSafeDocument(root);
    const wrapper = safeDocument.createDiv();
    safeDocument.appendChild(wrapper);

    wrapper.detach();
    expect(root.childNodes).toHaveLength(0);
    wrapper.setText("still alive");
    safeDocument.appendChild(wrapper);
    expect(root.textContent).toBe("still alive");

    wrapper.dispose();
    wrapper.dispose();
    expect(root.childNodes).toHaveLength(0);
    expectCode(() => wrapper.getText(), "NODE_DISPOSED");
  });

  it("recursively disposes an owned subtree", () => {
    const root = makeRoot();
    const safeDocument = createSafeDocument(root);
    const parent = safeDocument.createDiv();
    const child = safeDocument.createSpan();
    parent.appendChild(child);
    safeDocument.appendChild(parent);

    parent.dispose();

    expect(root.childNodes).toHaveLength(0);
    expectCode(() => parent.getText(), "NODE_DISPOSED");
    expectCode(() => child.setText("retained"), "NODE_DISPOSED");
  });

  it("disposes a document twice and gives stable post-dispose errors", () => {
    const root = makeRoot();
    const safeDocument = createSafeDocument(root);
    const wrapper = safeDocument.createDiv();
    safeDocument.appendChild(wrapper);

    safeDocument.dispose();
    safeDocument.dispose();
    wrapper.dispose();

    expect(root.childNodes).toHaveLength(0);
    expectCode(() => safeDocument.createSpan(), "DOCUMENT_DISPOSED");
    expectCode(() => wrapper.getText(), "DOCUMENT_DISPOSED");
    expectCode(() => wrapper.style.get("color"), "DOCUMENT_DISPOSED");
  });

  it("retries a failed captured detach before releasing disposal tracking", () => {
    const prototype = window.Node.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "removeChild");
    if (descriptor === undefined || typeof descriptor.value !== "function") {
      throw new Error("expected Node.prototype.removeChild");
    }
    const nativeRemoveChild = descriptor.value;
    let failNext = false;
    Object.defineProperty(prototype, "removeChild", {
      ...descriptor,
      value(this: Node, child: Node): Node {
        if (failNext) {
          failNext = false;
          throw document.body;
        }
        return Reflect.apply(nativeRemoveChild, this, [child]);
      },
    });

    try {
      const root = makeRoot();
      const safeDocument = createSafeDocument(root);
      const wrapper = safeDocument.createDiv();
      safeDocument.appendChild(wrapper);
      failNext = true;

      expectCode(() => safeDocument.dispose(), "DOM_OPERATION_FAILED");
      expect(root.childNodes).toHaveLength(1);
      expect(() => safeDocument.dispose()).not.toThrow();
      expect(root.childNodes).toHaveLength(0);
      expectCode(() => wrapper.getText(), "DOCUMENT_DISPOSED");
    } finally {
      Object.defineProperty(prototype, "removeChild", descriptor);
    }
  });

  it("retries failed descendant cleanup during recursive disposal", () => {
    const prototype = window.Element.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "removeAttribute");
    if (descriptor === undefined || typeof descriptor.value !== "function") {
      throw new Error("expected Element.prototype.removeAttribute");
    }
    const nativeRemoveAttribute = descriptor.value;
    let failNextSourceCleanup = false;
    Object.defineProperty(prototype, "removeAttribute", {
      ...descriptor,
      value(this: Element, name: string): void {
        if (failNextSourceCleanup && name === "src") {
          failNextSourceCleanup = false;
          throw document.body;
        }
        Reflect.apply(nativeRemoveAttribute, this, [name]);
      },
    });

    try {
      const root = makeRoot();
      const safeDocument = createSafeDocument(root, {
        urlPolicy: REQUEST_POLICY,
      });
      const parent = safeDocument.createDiv();
      const image = safeDocument.createImage();
      expect(image.setSrc("https://example.test/original.png").allowed).toBe(true);
      parent.appendChild(image);
      safeDocument.appendChild(parent);
      const rawImage = requireElement(root.querySelector("img"));
      failNextSourceCleanup = true;

      expectCode(() => parent.dispose(), "DOM_OPERATION_FAILED");
      expect(rawImage.hasAttribute("src")).toBe(true);
      expect(() => parent.dispose()).not.toThrow();
      expect(rawImage.hasAttribute("src")).toBe(false);
    } finally {
      Object.defineProperty(prototype, "removeAttribute", descriptor);
    }
  });

  it("aborts retained listeners and clears owned styles and request resources", () => {
    const root = makeRoot();
    const safeDocument = createSafeDocument(root, {
      urlPolicy: REQUEST_POLICY,
      stylePolicy: STYLE_POLICY,
    });
    const button = safeDocument.createButton();
    const image = safeDocument.createImage();
    const handler = vi.fn();
    const cleanup = button.onClick(handler);
    expect(button.style.set("color", "red")).toBe(true);
    image.setSrc("https://example.test/image.png");
    safeDocument.appendChild(button);
    safeDocument.appendChild(image);
    const rawButton = requireElement(root.querySelector("button"));
    const rawImage = requireElement(root.querySelector("img"));

    rawButton.dispatchEvent(new Event("click"));
    expect(handler).toHaveBeenCalledTimes(1);

    safeDocument.dispose();
    cleanup();
    cleanup();
    rawButton.dispatchEvent(new Event("click"));

    expect(handler).toHaveBeenCalledTimes(1);
    expect(root.childNodes).toHaveLength(0);
    expect(rawButton.hasAttribute("style")).toBe(false);
    expect(rawImage.hasAttribute("src")).toBe(false);
  });

  it("uses captured attribute and listener methods despite hostile own shadowing", () => {
    const root = makeRoot();
    const safeDocument = createSafeDocument(root);
    const wrapper = safeDocument.createDiv();
    safeDocument.appendChild(wrapper);
    const raw = requireElement(root.firstElementChild);
    Object.defineProperties(raw, {
      setAttribute: { configurable: true, value: () => { throw document.body; } },
      addEventListener: { configurable: true, value: () => { throw () => window; } },
    });

    expect(() => wrapper.setId("abc")).not.toThrow();
    expect(raw.getAttribute("id")).toMatch(/^aoa-i-[0-9a-f]{48}$/);
    expect(wrapper.getId()).toBe("abc");
    const handler = vi.fn();
    const cleanup = wrapper.onClick(handler);
    raw.dispatchEvent(new Event("click"));
    expect(handler).toHaveBeenCalledTimes(1);
    cleanup();
  });
});
