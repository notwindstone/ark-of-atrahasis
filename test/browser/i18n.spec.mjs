import {
  expect,
  expectNoUnapprovedActivity,
  flushBrowserWork,
  openHarness,
  test,
} from "./fixtures.mjs";

test("language unknown, local override, and shadow-host inheritance stay distinct", async ({
  page,
  browserLedger,
  browserName,
}) => {
  await openHarness(page, browserLedger);

  const result = await page.evaluate(() => {
    const host = document.querySelector("#mount");
    if (!(host instanceof HTMLElement)) throw new Error("host fixture is missing");
    host.lang = "en";
    host.dir = "ltr";

    const root = host.attachShadow({ mode: "open" });
    const safeDocument = globalThis.arkPublicAPI.createSafeDocument(root, {
      stylePolicy: {
        allowedProperties: [
          "border-inline-start-color",
          "border-inline-start-style",
          "border-inline-start-width",
          "inline-size",
          "padding-block-end",
          "padding-inline-start",
          "text-align",
        ],
      },
    });
    const wrapper = safeDocument.createSpan();
    const isolated = safeDocument.createBdi();
    const multilingual = "English — العربية — 日本語 — e\u0301 — 😀";
    wrapper.setText(multilingual);
    wrapper.style.set("borderInlineStartColor", "red");
    wrapper.style.set("borderInlineStartStyle", "solid");
    wrapper.style.set("borderInlineStartWidth", "2px");
    wrapper.style.set("inlineSize", "40px");
    wrapper.style.set("paddingBlockEnd", "7px");
    wrapper.style.set("paddingInlineStart", "11px");
    wrapper.style.set("textAlign", "start");
    isolated.setText("مستخدم 123");
    safeDocument.appendChild(wrapper);
    safeDocument.appendChild(isolated);

    const raw = root.querySelector("span");
    if (!(raw instanceof HTMLSpanElement)) throw new Error("safe span is missing");
    const rawIsolated = root.querySelector("bdi");
    if (!(rawIsolated instanceof HTMLElement)) throw new Error("safe bdi is missing");
    const isolatedState = {
      initial: getComputedStyle(rawIsolated).direction,
      tag: rawIsolated.localName,
      text: rawIsolated.textContent,
    };
    isolated.setDir("ltr");
    isolatedState.explicit = getComputedStyle(rawIsolated).direction;
    isolated.clearDir();
    // WebKit 26.5 retains the previous computed direction after dynamic
    // removal, so assert the semantic DOM reset separately from the untouched
    // intrinsic-auto case above.
    isolatedState.clearedHasDir = rawIsolated.hasAttribute("dir");
    const inheritedStyle = getComputedStyle(raw);
    const inherited = {
      direction: inheritedStyle.direction,
      hasLocalLang: raw.hasAttribute("lang"),
      hostLang: host.lang,
      lang: wrapper.getLang(),
      matchesEnglish: raw.matches(":lang(en)"),
      layout: {
        borderLeft: `${inheritedStyle.borderLeftWidth} ${inheritedStyle.borderLeftStyle} ${inheritedStyle.borderLeftColor}`,
        borderRight: `${inheritedStyle.borderRightWidth} ${inheritedStyle.borderRightStyle} ${inheritedStyle.borderRightColor}`,
        inlineSize: inheritedStyle.inlineSize,
        paddingBottom: inheritedStyle.paddingBottom,
        paddingLeft: inheritedStyle.paddingLeft,
        paddingRight: inheritedStyle.paddingRight,
        textAlign: inheritedStyle.textAlign,
      },
      text: raw.textContent,
      translateEffective: raw.translate,
      isolated: isolatedState,
    };

    wrapper.setLang("");
    const unknown = {
      attribute: raw.getAttribute("lang"),
      hasAttribute: raw.hasAttribute("lang"),
      lang: wrapper.getLang(),
      matchesEnglish: raw.matches(":lang(en)"),
    };

    wrapper.setLang("ar");
    wrapper.setDir("rtl");
    wrapper.setTranslate(false);
    const localStyle = getComputedStyle(raw);
    const local = {
      direction: localStyle.direction,
      lang: wrapper.getLang(),
      layout: {
        borderLeft: `${localStyle.borderLeftWidth} ${localStyle.borderLeftStyle} ${localStyle.borderLeftColor}`,
        borderRight: `${localStyle.borderRightWidth} ${localStyle.borderRightStyle} ${localStyle.borderRightColor}`,
        paddingLeft: localStyle.paddingLeft,
        paddingRight: localStyle.paddingRight,
      },
      matchesArabic: raw.matches(":lang(ar)"),
      translate: wrapper.getTranslate(),
      translateEffective: raw.translate,
    };

    wrapper.clearLang();
    wrapper.clearDir();
    wrapper.clearTranslate();
    const cleared = {
      direction: getComputedStyle(raw).direction,
      dir: wrapper.getDir(),
      hasLocalLang: raw.hasAttribute("lang"),
      hostLang: host.lang,
      lang: wrapper.getLang(),
      matchesEnglish: raw.matches(":lang(en)"),
      translate: wrapper.getTranslate(),
      translateEffective: raw.translate,
    };
    return { cleared, inherited, local, unknown };
  });

  const matchesShadowHostLanguage = browserName !== "firefox";
  expect(result).toEqual({
    inherited: {
      direction: "ltr",
      hasLocalLang: false,
      hostLang: "en",
      isolated: {
        clearedHasDir: false,
        explicit: "ltr",
        initial: "rtl",
        tag: "bdi",
        text: "مستخدم 123",
      },
      lang: undefined,
      matchesEnglish: matchesShadowHostLanguage,
      layout: {
        borderLeft: "2px solid rgb(255, 0, 0)",
        borderRight: "0px none rgb(0, 0, 0)",
        inlineSize: "40px",
        paddingBottom: "7px",
        paddingLeft: "11px",
        paddingRight: "0px",
        textAlign: "start",
      },
      text: "English — العربية — 日本語 — e\u0301 — 😀",
      translateEffective: true,
    },
    unknown: {
      attribute: "",
      hasAttribute: true,
      lang: "",
      matchesEnglish: false,
    },
    local: {
      direction: "rtl",
      lang: "ar",
      layout: {
        borderLeft: "0px none rgb(0, 0, 0)",
        borderRight: "2px solid rgb(255, 0, 0)",
        paddingLeft: "0px",
        paddingRight: "11px",
      },
      matchesArabic: true,
      translate: false,
      translateEffective: false,
    },
    cleared: {
      direction: "ltr",
      dir: undefined,
      hasLocalLang: false,
      hostLang: "en",
      lang: undefined,
      matchesEnglish: matchesShadowHostLanguage,
      translate: undefined,
      translateEffective: true,
    },
  });
});

test("localized captions use only the explicitly granted track URL sink", async ({
  page,
  browserLedger,
  browserName,
}) => {
  await openHarness(page, browserLedger);

  const result = await page.evaluate(async () => {
    const host = document.querySelector("#mount");
    if (!(host instanceof HTMLElement)) throw new Error("host fixture is missing");
    const root = host.attachShadow({ mode: "open" });
    const safeDocument = globalThis.arkPublicAPI.createSafeDocument(root, {
      urlPolicy: {
        baseURL: "http://127.0.0.1:4173/",
        sinks: {
          "track.src": {
            allowedOrigins: ["http://127.0.0.1:4173"],
            allowedProtocols: ["http:"],
          },
        },
      },
    });
    const video = safeDocument.createVideo();
    const track = safeDocument.createTrack();
    track.setKind("captions");
    track.setSrcLang("ar");
    track.setLabel("العربية");
    track.setDefault(true);
    const decision = track.setSrc("/allowed/captions-ar.vtt");
    video.appendChild(track);
    safeDocument.appendChild(video);

    const rawTrack = root.querySelector("track");
    if (!(rawTrack instanceof HTMLTrackElement)) throw new Error("safe track is missing");
    rawTrack.track.mode = "showing";
    const loaded = await new Promise((resolve) => {
      if (rawTrack.readyState === HTMLTrackElement.LOADED) {
        resolve(true);
        return;
      }
      rawTrack.addEventListener("load", () => resolve(true), { once: true });
      rawTrack.addEventListener("error", () => resolve(false), { once: true });
      setTimeout(() => resolve(false), 5_000);
    });
    const state = {
      decision,
      kind: rawTrack.kind,
      label: rawTrack.label,
      loaded,
      srcLang: rawTrack.srclang,
    };
    safeDocument.dispose();
    return { ...state, removedOnDispose: root.querySelector("track") === null };
  });

  await flushBrowserWork(page);
  expect(result).toEqual({
    decision: {
      allowed: true,
      url: "http://127.0.0.1:4173/allowed/captions-ar.vtt",
    },
    kind: "captions",
    label: "العربية",
    loaded: true,
    removedOnDispose: true,
    srcLang: "ar",
  });
  expect(
    browserLedger.requests.some(({ url }) => new URL(url).pathname === "/allowed/captions-ar.vtt"),
  ).toBe(true);
  const webkitCueBlobRequests = browserLedger.requests.filter(({ method, resourceType, url }) =>
    browserName === "webkit"
    && method === "GET"
    && resourceType === "image"
    && /^blob:http:\/\/127\.0\.0\.1:4173\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u.test(url));
  if (browserName === "webkit") expect(webkitCueBlobRequests.length).toBeGreaterThan(0);
  else expect(webkitCueBlobRequests).toEqual([]);
  const approvedCueBlobURLs = new Set(webkitCueBlobRequests.map(({ url }) => url));
  expectNoUnapprovedActivity({
    navigations: browserLedger.navigations,
    requests: browserLedger.requests.filter(({ url }) => !approvedCueBlobURLs.has(url)),
  }, ["/allowed/captions-ar.vtt"]);
});
