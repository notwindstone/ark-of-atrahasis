import {
  expect,
  expectNoUnapprovedActivity,
  flushBrowserWork,
  openHarness,
  test,
} from "./fixtures.mjs";

test("strict-root event fence blocks delegated click, hotkey, form, focus, and blur gadgets", async ({
  page,
  browserLedger,
}) => {
  await openHarness(page, browserLedger);

  const result = await page.evaluate(() => {
    const host = document.querySelector("#mount");
    const hostForm = document.querySelector("#host-form");
    if (!(host instanceof HTMLElement) || !(hostForm instanceof HTMLFormElement)) {
      throw new Error("host fixture is incomplete");
    }
    host.dataset.action = "host-submit";
    const observed = {
      action: 0,
      capture: 0,
      documentBubble: 0,
      form: 0,
      hostBubble: 0,
      hotkey: 0,
      internalClick: 0,
      internalBlur: 0,
      internalFocus: 0,
      internalKey: 0,
    };
    document.addEventListener("click", () => { observed.capture += 1; }, true);
    document.addEventListener("blur", () => { observed.capture += 1; }, true);
    document.addEventListener("focus", () => { observed.capture += 1; }, true);
    document.addEventListener("keydown", () => { observed.capture += 1; }, true);
    host.addEventListener("click", () => { observed.hostBubble += 1; });
    host.addEventListener("blur", () => { observed.hostBubble += 1; });
    host.addEventListener("focus", () => { observed.hostBubble += 1; });
    host.addEventListener("keydown", () => { observed.hostBubble += 1; });
    document.addEventListener("click", (event) => {
      observed.documentBubble += 1;
      if (event.target instanceof HTMLElement && event.target.dataset.action === "host-submit") {
        observed.action += 1;
        hostForm.requestSubmit();
      }
    });
    document.addEventListener("keydown", (event) => {
      observed.documentBubble += 1;
      if (event.key === "Delete") observed.hotkey += 1;
    });
    hostForm.addEventListener("submit", (event) => {
      event.preventDefault();
      observed.form += 1;
    });

    const root = host.attachShadow({ mode: "open" });
    const safeDocument = globalThis.arkPublicAPI.createSafeDocument(root, {
      formControlPolicy: { allowNonCredentialFormElements: true },
    });
    const button = safeDocument.createButton();
    button.onBlur(() => { observed.internalBlur += 1; });
    button.onClick(() => { observed.internalClick += 1; });
    button.onFocus(() => { observed.internalFocus += 1; });
    button.onKeyDown(() => { observed.internalKey += 1; });
    safeDocument.appendChild(button);
    const rawButton = root.querySelector("button");
    if (!(rawButton instanceof HTMLButtonElement)) throw new Error("safe button is missing");

    const click = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      composed: true,
    });
    Object.defineProperty(click, "stopPropagation", {
      configurable: true,
      value: () => { throw document.body; },
    });
    rawButton.dispatchEvent(click);
    rawButton.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true,
      composed: true,
      key: "Delete",
    }));
    rawButton.dispatchEvent(new FocusEvent("focus", { bubbles: false, composed: true }));
    rawButton.dispatchEvent(new FocusEvent("blur", { bubbles: false, composed: true }));
    const fenced = { ...observed };

    safeDocument.dispose();
    root.append(rawButton);
    rawButton.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    rawButton.dispatchEvent(new FocusEvent("focus", { bubbles: false, composed: true }));
    const afterDispose = { ...observed };
    return { afterDispose, fenced };
  });

  expect(result).toEqual({
    fenced: {
      action: 0,
      capture: 4,
      documentBubble: 0,
      form: 0,
      hostBubble: 0,
      hotkey: 0,
      internalClick: 1,
      internalBlur: 1,
      internalFocus: 1,
      internalKey: 1,
    },
    afterDispose: {
      action: 1,
      capture: 6,
      documentBubble: 1,
      form: 1,
      hostBubble: 2,
      hotkey: 0,
      internalClick: 1,
      internalBlur: 1,
      internalFocus: 1,
      internalKey: 1,
    },
  });
  expectNoUnapprovedActivity(browserLedger);
});

test("denied image, link, media, and form actions leave the host and browser ledger unchanged", async ({
  page,
  browserLedger,
}) => {
  await openHarness(page, browserLedger);

  const before = await page.evaluate(() => {
    const outside = document.querySelector("#outside-sentinel");
    const mount = document.querySelector("#mount");
    if (!(outside instanceof HTMLElement) || !(mount instanceof HTMLElement)) {
      throw new Error("host fixture is incomplete");
    }
    const root = mount.attachShadow({ mode: "open" });
    const safeDocument = globalThis.arkPublicAPI.createSafeDocument(root, {
      formControlPolicy: { allowNonCredentialFormElements: true },
    });
    const image = safeDocument.createImage();
    const anchor = safeDocument.createAnchor();
    const video = safeDocument.createVideo();
    const audio = safeDocument.createAudio();
    const track = safeDocument.createTrack();
    const button = safeDocument.createButton();
    const input = safeDocument.createInput();
    const textarea = safeDocument.createTextarea();

    const decisions = [
      image.setSrc("/unapproved/image.png"),
      anchor.setHref("/unapproved/navigation"),
      video.setSrc("/unapproved/video.mp4"),
      video.setPoster("/unapproved/poster.png"),
      audio.setSrc("/unapproved/audio.mp3"),
      track.setSrc("/unapproved/captions.vtt"),
    ].map((decision) => ({
      allowed: decision.allowed,
      code: decision.allowed ? null : decision.error.code,
    }));

    anchor.setText("denied navigation");
    button.setText("guest submit");
    video.appendChild(track);
    for (const node of [image, anchor, video, audio, button, input, textarea]) {
      safeDocument.appendChild(node);
    }
    const physicalInput = root.querySelector("input");
    const physicalTextarea = root.querySelector("textarea");
    const physicalButton = root.querySelector("button");
    if (!(physicalInput instanceof HTMLInputElement) ||
        !(physicalTextarea instanceof HTMLTextAreaElement) ||
        !(physicalButton instanceof HTMLButtonElement)) {
      throw new Error("safe form controls were not created");
    }
    const forbidden = ["form", "formaction", "formenctype", "formmethod", "formnovalidate", "formtarget", "name"];
    const controlDefaults = {
      inputAutocomplete: physicalInput.autocomplete,
      textareaAutocomplete: physicalTextarea.autocomplete,
      buttonType: physicalButton.type,
      formsNull: [physicalInput.form, physicalTextarea.form, physicalButton.form].every((value) => value === null),
      forbiddenAbsent: [physicalInput, physicalTextarea, physicalButton].every((control) => (
        forbidden.every((name) => !control.hasAttribute(name))
      )),
    };
    input.setName("shared-name");
    input.setValue("guest-value");

    return {
      controlDefaults,
      decisions,
      outsideHTML: outside.outerHTML,
      rootHTML: root.innerHTML,
    };
  });

  await page.locator("#mount").locator("button").click();
  await page.locator("#mount").locator("a").click({ force: true });
  await flushBrowserWork(page);

  const after = await page.evaluate(() => {
    const outside = document.querySelector("#outside-sentinel");
    const form = document.querySelector("#host-form");
    const hostControl = document.querySelector("#host-control");
    if (!(outside instanceof HTMLElement) || !(form instanceof HTMLFormElement)) {
      throw new Error("host fixture is incomplete");
    }
    return {
      outsideHTML: outside.outerHTML,
      formAction: form.action,
      formValues: new FormData(form).getAll("shared-name"),
      namedControlIsHostControl: form.elements.namedItem("shared-name") === hostControl,
    };
  });

  expect(before.decisions).toEqual([
    { allowed: false, code: "ERR_URL_DENIED" },
    { allowed: false, code: "ERR_URL_DENIED" },
    { allowed: false, code: "ERR_URL_DENIED" },
    { allowed: false, code: "ERR_URL_DENIED" },
    { allowed: false, code: "ERR_URL_DENIED" },
    { allowed: false, code: "ERR_URL_DENIED" },
  ]);
  expect(before.controlDefaults).toEqual({
    inputAutocomplete: "off",
    textareaAutocomplete: "off",
    buttonType: "button",
    formsNull: true,
    forbiddenAbsent: true,
  });
  expect(before.rootHTML).not.toContain("/unapproved/");
  expect(after.outsideHTML).toBe(before.outsideHTML);
  expect(after.formValues).toEqual(["host-value"]);
  expect(after.namedControlIsHostControl).toBe(true);
  expect(after.formAction).toBe("http://127.0.0.1:4173/unapproved/form-submit");
  expectNoUnapprovedActivity(browserLedger);
});

test("canvas dimensions may cross the former aggregate area cap", async ({ page, browserLedger }) => {
  await openHarness(page, browserLedger);

  const result = await page.evaluate(() => {
    const mount = document.querySelector("#mount");
    if (!(mount instanceof HTMLElement)) throw new Error("host fixture is incomplete");
    const root = mount.attachShadow({ mode: "open" });
    const safeDocument = globalThis.arkPublicAPI.createSafeDocument(root);
    const wrapper = safeDocument.createCanvas();
    safeDocument.appendChild(wrapper);
    wrapper.setWidth(4_096);
    wrapper.setHeight(4_096);
    const canvas = root.querySelector("canvas");
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error("safe canvas was not created");
    const context = canvas.getContext("2d");
    if (context === null) throw new Error("2d canvas context is unavailable");
    context.fillStyle = "rgb(255, 0, 0)";
    context.fillRect(0, 0, 1, 1);

    wrapper.setWidth(4_097);
    return {
      dimensions: [canvas.width, canvas.height],
      pixel: [...context.getImageData(0, 0, 1, 1).data],
    };
  });

  expect(result).toEqual({
    dimensions: [4_097, 4_096],
    pixel: [0, 0, 0, 0],
  });
  expectNoUnapprovedActivity(browserLedger);
});

test("strict default exposes no guest-readable native form-value sink", async ({
  page,
  browserLedger,
}) => {
  await openHarness(page, browserLedger);

  const result = await page.evaluate(() => {
    const mount = document.querySelector("#mount");
    if (!(mount instanceof HTMLElement)) throw new Error("host fixture is incomplete");
    const root = mount.attachShadow({ mode: "open" });
    const safeDocument = globalThis.arkPublicAPI.createSafeDocument(root);
    const errors = [];
    for (const factory of [
      () => safeDocument.createButton(),
      () => safeDocument.createInput(),
      () => safeDocument.createSelect(),
      () => safeDocument.createOption(),
      () => safeDocument.createOptgroup(),
      () => safeDocument.createTextarea(),
      () => safeDocument.createLabel(),
      () => safeDocument.createFieldset(),
      () => safeDocument.createLegend(),
      () => safeDocument.createOutput(),
      () => safeDocument.createImage(),
    ]) {
      try {
        factory();
      } catch (error) {
        errors.push({
          code: error?.code ?? null,
          frozen: Object.isFrozen(error),
          operation: error?.operation ?? null,
        });
      }
    }
    return {
      errors,
      rootHTML: root.innerHTML,
      formSurfaceCount: root.querySelectorAll(
        "button, fieldset, img, input, label, legend, optgroup, option, output, select, textarea",
      ).length,
    };
  });

  expect(result).toEqual({
    errors: [
      { code: "FORM_CONTROL_POLICY_REQUIRED", frozen: true, operation: "SafeDocument.createButton.policy" },
      { code: "FORM_CONTROL_POLICY_REQUIRED", frozen: true, operation: "SafeDocument.createInput.policy" },
      { code: "FORM_CONTROL_POLICY_REQUIRED", frozen: true, operation: "SafeDocument.createSelect.policy" },
      { code: "FORM_CONTROL_POLICY_REQUIRED", frozen: true, operation: "SafeDocument.createOption.policy" },
      { code: "FORM_CONTROL_POLICY_REQUIRED", frozen: true, operation: "SafeDocument.createOptgroup.policy" },
      { code: "FORM_CONTROL_POLICY_REQUIRED", frozen: true, operation: "SafeDocument.createTextarea.policy" },
      { code: "FORM_CONTROL_POLICY_REQUIRED", frozen: true, operation: "SafeDocument.createLabel.policy" },
      { code: "FORM_CONTROL_POLICY_REQUIRED", frozen: true, operation: "SafeDocument.createFieldset.policy" },
      { code: "FORM_CONTROL_POLICY_REQUIRED", frozen: true, operation: "SafeDocument.createLegend.policy" },
      { code: "FORM_CONTROL_POLICY_REQUIRED", frozen: true, operation: "SafeDocument.createOutput.policy" },
      { code: "FORM_CONTROL_POLICY_REQUIRED", frozen: true, operation: "SafeDocument.createImage.policy" },
    ],
    rootHTML: "",
    formSurfaceCount: 0,
  });
  expectNoUnapprovedActivity(browserLedger);
});

test("opt-in non-credential form controls preserve host form and named access with structural autofill-facing defaults", async ({
  page,
  browserLedger,
}) => {
  await openHarness(page, browserLedger);

  const result = await page.evaluate(() => {
    const mount = document.querySelector("#mount");
    const hostForm = document.querySelector("#host-form");
    const hostControl = document.querySelector("#host-control");
    const outside = document.querySelector("#outside-sentinel");
    if (!(mount instanceof HTMLElement) ||
        !(hostForm instanceof HTMLFormElement) ||
        !(hostControl instanceof HTMLInputElement) ||
        !(outside instanceof HTMLElement)) {
      throw new Error("host fixture is incomplete");
    }
    hostControl.id = "shared-key";
    hostControl.name = "shared-key";
    hostControl.value = "host-value";
    hostControl.autocomplete = "email";
    const hostLabel = document.createElement("label");
    hostLabel.htmlFor = "shared-key";
    hostLabel.textContent = "host label";
    hostForm.prepend(hostLabel);

    const snapshotHost = () => ({
      formValues: new FormData(hostForm).getAll("shared-key"),
      namedItemIsHost: hostForm.elements.namedItem("shared-key") === hostControl,
      idLookupIsHost: document.getElementById("shared-key") === hostControl,
      nameLookupIsHostOnly: document.getElementsByName("shared-key").length === 1 &&
        document.getElementsByName("shared-key")[0] === hostControl,
      documentNamedIsHost: document["shared-key"] === hostControl,
      windowNamedIsHost: window["shared-key"] === hostControl,
      value: hostControl.value,
      checked: hostControl.checked,
      autocomplete: hostControl.autocomplete,
      controlHTML: hostControl.outerHTML,
      labelHTML: hostLabel.outerHTML,
      formAction: hostForm.action,
    });
    const before = snapshotHost();

    const root = mount.attachShadow({ mode: "open" });
    const safeDocument = globalThis.arkPublicAPI.createSafeDocument(root, {
      formControlPolicy: { allowNonCredentialFormElements: true },
    });
    const input = safeDocument.createInput();
    const textarea = safeDocument.createTextarea();
    const select = safeDocument.createSelect();
    const option = safeDocument.createOption();
    const button = safeDocument.createButton();
    const radioA = safeDocument.createInput();
    const radioB = safeDocument.createInput();
    const label = safeDocument.createLabel();
    const described = safeDocument.createDiv();
    const cell = safeDocument.createTh();

    let passwordError = null;
    try {
      Reflect.apply(input.setType, undefined, ["password"]);
    } catch (error) {
      passwordError = { code: error?.code ?? null, operation: error?.operation ?? null };
    }

    input.setId("shared-key");
    textarea.setId("textarea-key");
    select.setId("select-key");
    button.setId("button-key");
    for (const control of [input, textarea, select, button]) control.setName("shared-key");
    option.setValue("safe-option");
    option.setText("safe option");
    select.appendChild(option);
    radioA.setType("radio");
    radioB.setType("radio");
    radioA.setName("radio-choice");
    radioB.setName("radio-choice");
    label.setFor("shared-key");
    label.setText("safe label");
    described.setAria("controls", "shared-key textarea-key");
    cell.setHeaders("shared-key textarea-key");
    for (const node of [
      label,
      input,
      textarea,
      select,
      button,
      radioA,
      radioB,
      described,
      cell,
    ]) {
      safeDocument.appendChild(node);
    }

    const secondMount = document.createElement("div");
    secondMount.style.contain = "paint";
    document.body.append(secondMount);
    const secondRoot = secondMount.attachShadow({ mode: "open" });
    const secondDocument = globalThis.arkPublicAPI.createSafeDocument(secondRoot, {
      formControlPolicy: { allowNonCredentialFormElements: true },
    });
    const secondInput = secondDocument.createInput();
    secondInput.setId("shared-key");
    secondInput.setName("shared-key");
    secondDocument.appendChild(secondInput);

    const physicalInput = root.querySelector("input");
    const physicalTextarea = root.querySelector("textarea");
    const physicalSelect = root.querySelector("select");
    const physicalButton = root.querySelector("button");
    const physicalLabel = root.querySelector("label");
    const physicalRadios = [...root.querySelectorAll('input[type="radio"]')];
    const physicalDescribed = root.querySelector("div");
    const physicalCell = root.querySelector("th");
    const secondPhysicalInput = secondRoot.querySelector("input");
    if (!(physicalInput instanceof HTMLInputElement) ||
        !(physicalTextarea instanceof HTMLTextAreaElement) ||
        !(physicalSelect instanceof HTMLSelectElement) ||
        !(physicalButton instanceof HTMLButtonElement) ||
        !(physicalLabel instanceof HTMLLabelElement) ||
        !(physicalDescribed instanceof HTMLElement) ||
        !(physicalCell instanceof HTMLTableCellElement) ||
        !(secondPhysicalInput instanceof HTMLInputElement) ||
        physicalRadios.length !== 2) {
      throw new Error("safe namespace controls were not created");
    }

    const namespaceValues = [
      physicalInput.id,
      physicalInput.name,
      physicalTextarea.id,
      physicalTextarea.name,
      physicalSelect.id,
      physicalSelect.name,
      physicalButton.id,
      physicalButton.name,
      physicalLabel.htmlFor,
      physicalDescribed.getAttribute("aria-controls") ?? "",
      physicalCell.headers,
    ];
    const tokenPattern = /^aoa-[in]-[0-9a-f]{48}(?: aoa-i-[0-9a-f]{48})*$/;
    const namespaceValuesOpaque = namespaceValues.every((value) => (
      tokenPattern.test(value) && !value.includes("shared-key")
    ));
    const perDocumentOpaque = physicalInput.id !== secondPhysicalInput.id &&
      physicalInput.name !== secondPhysicalInput.name;
    const sameNameWithinDocument = [
      physicalTextarea.name,
      physicalSelect.name,
      physicalButton.name,
    ].every((value) => value === physicalInput.name);

    physicalLabel.click();
    const labelTargetsSafeInput = root.activeElement === physicalInput;
    physicalRadios[0].click();
    physicalRadios[1].click();
    const radioGroupingPreserved = physicalRadios[0].checked === false &&
      physicalRadios[1].checked === true;
    physicalInput.focus();
    physicalInput.value = "guest-value";
    physicalInput.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      data: "x",
      inputType: "insertText",
    }));
    physicalButton.click();

    const autofillFacing = {
      autocompleteOff: [
        physicalInput.autocomplete,
        physicalTextarea.autocomplete,
        physicalSelect.autocomplete,
      ].every((value) => value === "off"),
      namesAreOpaque: [physicalInput, physicalTextarea, physicalSelect].every((control) => (
        /^aoa-n-[0-9a-f]{48}$/.test(control.name) && control.name !== "shared-key"
      )),
      idsAreOpaque: [physicalInput, physicalTextarea, physicalSelect].every((control) => (
        /^aoa-i-[0-9a-f]{48}$/.test(control.id) && !control.id.includes("shared-key")
      )),
      formsNull: [physicalInput, physicalTextarea, physicalSelect, physicalButton]
        .every((control) => control.form === null),
      buttonType: physicalButton.type,
      inputType: physicalInput.type,
    };

    document.body.append(physicalInput);
    label.getFor();
    let revokedCode = null;
    try {
      input.getId();
    } catch (error) {
      revokedCode = error?.code ?? null;
    }
    const reparentRevocation = {
      idPreserved: physicalInput.hasAttribute("id"),
      namePreserved: physicalInput.hasAttribute("name"),
      revokedCode,
      lookupNull: safeDocument.getElement("shared-key") === null,
    };

    return {
      before,
      after: snapshotHost(),
      namespaceValuesOpaque,
      perDocumentOpaque,
      sameNameWithinDocument,
      labelTargetsSafeInput,
      radioGroupingPreserved,
      localLookupCanonical: safeDocument.getElement("textarea-key") === textarea,
      logicalGetters: {
        id: textarea.getId(),
        for: label.getFor(),
        headers: cell.getHeaders(),
        aria: described.getAria("controls"),
      },
      autofillFacing,
      passwordError,
      reparentRevocation,
    };
  });

  await flushBrowserWork(page);
  expect(result.after).toEqual(result.before);
  expect(result).toMatchObject({
    namespaceValuesOpaque: true,
    perDocumentOpaque: true,
    sameNameWithinDocument: true,
    labelTargetsSafeInput: true,
    radioGroupingPreserved: true,
    localLookupCanonical: true,
    logicalGetters: {
      id: "textarea-key",
      for: "shared-key",
      headers: "shared-key textarea-key",
      aria: "shared-key textarea-key",
    },
    autofillFacing: {
      autocompleteOff: true,
      namesAreOpaque: true,
      idsAreOpaque: true,
      formsNull: true,
      buttonType: "button",
      inputType: "text",
    },
    passwordError: {
      code: "ERR_INVALID_ARGUMENT",
      operation: "SafeInputElement.setType.type",
    },
    reparentRevocation: {
      idPreserved: true,
      namePreserved: true,
      revokedCode: "NODE_REVOKED",
      lookupNull: true,
    },
  });
  expectNoUnapprovedActivity(browserLedger);
});

test("committed shrunk CSS, URL, ID, and lifecycle corpus has no browser-side escape", async ({
  page,
  browserLedger,
}) => {
  await openHarness(page, browserLedger);

  const result = await page.evaluate(async () => {
    const mount = document.querySelector("#mount");
    if (!(mount instanceof HTMLElement)) throw new Error("host fixture is incomplete");
    const root = mount.attachShadow({ mode: "open" });
    const safeDocument = globalThis.arkPublicAPI.createSafeDocument(root, {
      formControlPolicy: { allowNonCredentialFormElements: true },
      stylePolicy: { allowedProperties: ["color", "cursor"] },
      urlPolicy: {
        baseURL: "http://127.0.0.1:4173/",
        sinks: {
          "image.src": {
            allowedOrigins: ["http://127.0.0.1:4173"],
            allowedProtocols: ["http:"],
            allowQuery: true,
          },
        },
      },
    });
    const image = safeDocument.createImage();
    const anchor = safeDocument.createAnchor();
    safeDocument.appendChild(anchor);
    safeDocument.appendChild(image);
    const rawImage = root.querySelector("img");
    const rawAnchor = root.querySelector("a");
    if (!(rawImage instanceof HTMLImageElement) || !(rawAnchor instanceof HTMLAnchorElement)) {
      throw new Error("safe corpus elements were not created");
    }
    const rawIds = [];
    for (const logicalId of ["__proto__", "#host>[name]", "\u202e😀"]) {
      image.setId(logicalId);
      rawIds.push({
        logicalId,
        logicalGetter: image.getId(),
        physicalOpaque: /^aoa-i-[0-9a-f]{48}$/u.test(rawImage.id)
          && rawImage.id !== logicalId,
        lightDOMLookupMissed: root.ownerDocument.getElementById(logicalId) === null,
      });
    }
    image.setId("__proto__");
    image.style.set("cursor", "pointer");
    const cssResults = [
      "u/**/r/**/l(http://127.0.0.1:4173/unapproved/css)",
      String.raw`u\72l(http://127.0.0.1:4173/unapproved/css)`,
      String.raw`@im\70 ort "http://127.0.0.1:4173/unapproved/css"`,
    ].map((value) => ({
      accepted: image.style.set("cursor", value),
      preserved: image.style.get("cursor"),
    }));
    const deniedURLs = [
      anchor.setHref("/unapproved/corpus-navigation"),
      image.setSrc("https://[::1"),
      image.setSrc("https://attacker.test/corpus.png"),
    ].map((decision) => decision.allowed ? "allowed" : decision.error.code);
    const approved = image.setSrc("/allowed/pixel.png?case=shrunk-corpus");
    const physicalIdWasOpaque = /^aoa-i-[0-9a-f]{48}$/u.test(rawImage.id)
      && rawImage.id !== "__proto__";
    if (!(rawImage.complete && rawImage.naturalWidth > 0)) {
      await new Promise((resolve, reject) => {
        rawImage.addEventListener("load", resolve, { once: true });
        rawImage.addEventListener("error", () => reject(new Error("corpus image failed")), {
          once: true,
        });
      });
    }

    const external = document.createElement("section");
    document.body.append(external);
    external.append(rawImage);
    const beforeExternalBytes = [...new TextEncoder().encode(rawImage.outerHTML)];
    let placementCode = null;
    try {
      image.setAlt("guest mutation");
    } catch (error) {
      placementCode = error?.code ?? null;
    }
    rawAnchor.click();
    return {
      approved: approved.allowed,
      cssResults,
      deniedURLs,
      rawIds,
      physicalIdWasOpaque,
      placementCode,
      beforeExternalBytes,
      afterExternalBytes: [...new TextEncoder().encode(rawImage.outerHTML)],
      logicalLookupNull: safeDocument.getElement("__proto__") === null,
    };
  });
  await flushBrowserWork(page);

  expect(result.afterExternalBytes).toEqual(result.beforeExternalBytes);
  expect({ ...result, beforeExternalBytes: undefined, afterExternalBytes: undefined }).toEqual({
    approved: true,
    cssResults: [
      { accepted: false, preserved: "pointer" },
      { accepted: false, preserved: "pointer" },
      { accepted: false, preserved: "pointer" },
    ],
    deniedURLs: ["ERR_URL_DENIED", "ERR_URL_DENIED", "ERR_URL_DENIED"],
    rawIds: [
      {
        logicalId: "__proto__",
        logicalGetter: "__proto__",
        physicalOpaque: true,
        lightDOMLookupMissed: true,
      },
      {
        logicalId: "#host>[name]",
        logicalGetter: "#host>[name]",
        physicalOpaque: true,
        lightDOMLookupMissed: true,
      },
      {
        logicalId: "\u202e😀",
        logicalGetter: "\u202e😀",
        physicalOpaque: true,
        lightDOMLookupMissed: true,
      },
    ],
    physicalIdWasOpaque: true,
    placementCode: "PLACEMENT_VIOLATION",
    beforeExternalBytes: undefined,
    afterExternalBytes: undefined,
    logicalLookupNull: true,
  });
  expect(
    browserLedger.requests.filter(({ url }) => new URL(url).pathname === "/allowed/pixel.png"),
  ).toEqual([{
    method: "GET",
    resourceType: "image",
    url: "http://127.0.0.1:4173/allowed/pixel.png?case=shrunk-corpus",
  }]);
  expectNoUnapprovedActivity(browserLedger, ["/allowed/pixel.png"]);
});

test("raw host reparent, adopt, and detach-to-external placement revoke before guest mutation", async ({
  page,
  browserLedger,
}) => {
  await openHarness(page, browserLedger);

  const result = await page.evaluate(() => {
    const outside = document.querySelector("#outside-sentinel");
    const iframe = document.querySelector("#foreign-realm");
    if (!(outside instanceof HTMLElement) || !(iframe instanceof HTMLIFrameElement)) {
      throw new Error("host fixture is incomplete");
    }
    const foreignDocument = iframe.contentDocument;
    if (!foreignDocument) throw new Error("foreign document is unavailable");

    const runCase = (kind) => {
      const host = document.createElement("div");
      host.style.contain = "paint";
      const external = kind === "adopt"
        ? foreignDocument.createElement("section")
        : document.createElement("section");
      document.body.append(host);
      if (kind === "adopt") foreignDocument.body.append(external);
      else document.body.append(external);
      const root = host.attachShadow({ mode: "open" });
      const safeDocument = globalThis.arkPublicAPI.createSafeDocument(root, {
        formControlPolicy: { allowNonCredentialFormElements: true },
        stylePolicy: { allowedProperties: ["color"] },
        urlPolicy: {
          baseURL: "http://127.0.0.1:4173/",
          sinks: {
            "anchor.href": {
              allowedOrigins: ["http://127.0.0.1:4173"],
              allowedProtocols: ["http:"],
            },
          },
        },
      });
      const wrapper = safeDocument.createDiv();
      const input = safeDocument.createInput();
      const label = safeDocument.createLabel();
      const cell = safeDocument.createTh();
      const anchor = safeDocument.createAnchor();
      wrapper.setData("ordinary", "guest-state");
      wrapper.style.set("color", "red");
      input.setId("owned-control");
      input.setName("owned-name");
      input.setAria("controls", "owned-control");
      input.setValue("guest IDL state");
      label.setFor("owned-control");
      cell.setHeaders("owned-control");
      anchor.setHref("/allowed/no-request");
      let listenerCalls = 0;
      input.onInput(() => { listenerCalls += 1; });
      wrapper.appendChild(input);
      wrapper.appendChild(label);
      wrapper.appendChild(cell);
      wrapper.appendChild(anchor);
      safeDocument.appendChild(wrapper);
      const raw = root.firstElementChild;
      const rawInput = raw?.querySelector("input");
      const rawLabel = raw?.querySelector("label");
      const rawCell = raw?.querySelector("th");
      const rawAnchor = raw?.querySelector("a");
      if (
        !(raw instanceof Element)
        || !(rawInput instanceof HTMLInputElement)
        || !(rawLabel instanceof HTMLLabelElement)
        || !(rawCell instanceof HTMLTableCellElement)
        || !(rawAnchor instanceof HTMLAnchorElement)
      ) {
        throw new Error("owned placement corpus was not mounted");
      }

      if (kind === "reparent") external.append(raw);
      if (kind === "adopt") {
        foreignDocument.adoptNode(raw);
        external.append(raw);
      }
      if (kind === "detach-to-external") {
        wrapper.detach();
        external.append(raw);
      }

      raw.setAttribute("data-host-state", "preserve");
      rawInput.value = "host live IDL state";
      const beforeMarkup = [...new TextEncoder().encode(raw.outerHTML)];
      const beforeIDL = [...new TextEncoder().encode(JSON.stringify({
        value: rawInput.value,
        checked: rawInput.checked,
      }))];

      const errors = [];
      try {
        wrapper.setTitle("guest mutation");
      } catch (error) {
        errors.push(error?.code);
      }
      try {
        input.onInput(() => undefined);
      } catch (error) {
        errors.push(error?.code);
      }
      const replacement = safeDocument.createDiv();
      try {
        wrapper.appendChild(replacement);
      } catch (error) {
        errors.push(error?.code);
      }
      try {
        anchor.setHref("/allowed/revoked");
      } catch (error) {
        errors.push(error?.code);
      }
      rawInput.dispatchEvent(new rawInput.ownerDocument.defaultView.Event("input"));
      const afterMarkup = [...new TextEncoder().encode(raw.outerHTML)];
      const afterIDL = [...new TextEncoder().encode(JSON.stringify({
        value: rawInput.value,
        checked: rawInput.checked,
      }))];
      replacement.dispose();

      return {
        kind,
        errors,
        ownerIsForeign: raw.ownerDocument === foreignDocument,
        beforeMarkup,
        afterMarkup,
        beforeIDL,
        afterIDL,
        listenerCalls,
        logicalLookupNull: safeDocument.getElement("owned-control") === null,
        trackedStatePresent: {
          id: rawInput.hasAttribute("id"),
          name: rawInput.hasAttribute("name"),
          aria: rawInput.hasAttribute("aria-controls"),
          labelFor: rawLabel.hasAttribute("for"),
          headers: rawCell.hasAttribute("headers"),
          href: rawAnchor.hasAttribute("href"),
          style: raw.hasAttribute("style"),
          hostState: raw.getAttribute("data-host-state"),
        },
      };
    };

    return {
      before: outside.outerHTML,
      cases: [runCase("reparent"), runCase("adopt"), runCase("detach-to-external")],
      after: outside.outerHTML,
    };
  });

  await flushBrowserWork(page);

  expect(result.after).toBe(result.before);
  expect(result.cases.map(({ kind, errors, ownerIsForeign, listenerCalls, logicalLookupNull, trackedStatePresent }) => ({
    kind,
    errors,
    ownerIsForeign,
    listenerCalls,
    logicalLookupNull,
    trackedStatePresent,
  }))).toEqual([
    ["reparent", false],
    ["adopt", true],
    ["detach-to-external", false],
  ].map(([kind, ownerIsForeign]) => ({
    kind,
    errors: ["PLACEMENT_VIOLATION", "NODE_REVOKED", "NODE_REVOKED", "NODE_REVOKED"],
    ownerIsForeign,
    listenerCalls: 0,
    logicalLookupNull: true,
    trackedStatePresent: {
      id: true,
      name: true,
      aria: true,
      labelFor: true,
      headers: true,
      href: true,
      style: true,
      hostState: "preserve",
    },
  })));
  for (const placementCase of result.cases) {
    expect(placementCase.afterMarkup).toEqual(placementCase.beforeMarkup);
    expect(placementCase.afterIDL).toEqual(placementCase.beforeIDL);
  }
  expectNoUnapprovedActivity(browserLedger);
});

test("host sink policy grants one image request while navigation and media remain denied", async ({
  page,
  browserLedger,
}) => {
  await openHarness(page, browserLedger);

  const decisions = await page.evaluate(() => {
    const mount = document.querySelector("#mount");
    if (!(mount instanceof HTMLElement)) throw new Error("host fixture is incomplete");
    const root = mount.attachShadow({ mode: "open" });
    const safeDocument = globalThis.arkPublicAPI.createSafeDocument(root, {
      formControlPolicy: { allowNonCredentialFormElements: true },
      urlPolicy: {
        baseURL: "http://127.0.0.1:4173/",
        sinks: {
          "image.src": {
            allowedOrigins: ["http://127.0.0.1:4173"],
            allowedProtocols: ["http:"],
            allowQuery: true,
          },
        },
      },
    });
    const image = safeDocument.createImage();
    const anchor = safeDocument.createAnchor();
    const video = safeDocument.createVideo();
    const imageDecision = image.setSrc("/allowed/pixel.png?case=per-sink");
    const anchorDecision = anchor.setHref("/unapproved/navigation");
    const videoDecision = video.setSrc("/unapproved/video.mp4");
    anchor.setText("denied navigation");
    safeDocument.appendChild(image);
    safeDocument.appendChild(anchor);
    safeDocument.appendChild(video);

    const summarize = (decision) => ({
      allowed: decision.allowed,
      code: decision.allowed ? null : decision.error.code,
      url: decision.allowed ? decision.url : null,
    });
    return [summarize(imageDecision), summarize(anchorDecision), summarize(videoDecision)];
  });

  await page.locator("#mount").locator("img").evaluate(async (image) => {
    if (image.complete && image.naturalWidth > 0) return;
    await new Promise((resolve, reject) => {
      image.addEventListener("load", resolve, { once: true });
      image.addEventListener("error", () => reject(new Error("approved image failed")), {
        once: true,
      });
    });
  });
  await page.locator("#mount").locator("a").click({ force: true });
  await flushBrowserWork(page);

  expect(decisions).toEqual([
    {
      allowed: true,
      code: null,
      url: "http://127.0.0.1:4173/allowed/pixel.png?case=per-sink",
    },
    { allowed: false, code: "ERR_URL_DENIED", url: null },
    { allowed: false, code: "ERR_URL_DENIED", url: null },
  ]);
  expect(
    browserLedger.requests.filter(({ url }) => new URL(url).pathname === "/allowed/pixel.png"),
    `expected one approved image request; actual ledger: ${JSON.stringify(browserLedger.requests)}`,
  ).toEqual([
    {
      method: "GET",
      resourceType: "image",
      url: "http://127.0.0.1:4173/allowed/pixel.png?case=per-sink",
    },
  ]);
  expectNoUnapprovedActivity(browserLedger, ["/allowed/pixel.png"]);
});

test("ownerDocument iframe realm works after ambient DOM constructors are poisoned", async ({
  page,
  browserLedger,
}) => {
  await openHarness(page, browserLedger);

  const result = await page.evaluate(() => {
    const iframe = document.querySelector("#foreign-realm");
    if (!(iframe instanceof HTMLIFrameElement)) throw new Error("foreign iframe is unavailable");
    const foreignDocument = iframe.contentDocument;
    const foreignWindow = iframe.contentWindow;
    const foreignMount = foreignDocument?.querySelector("#foreign-mount");
    if (!foreignDocument || !foreignWindow || !(foreignMount instanceof foreignWindow.HTMLElement)) {
      throw new Error("foreign realm fixture is incomplete");
    }
    const root = foreignMount.attachShadow({ mode: "open" });
    const PoisonedAmbientConstructor = function PoisonedAmbientConstructor() {
      throw new Error("ambient DOM constructor was used");
    };
    for (const name of [
      "AbortController",
      "Document",
      "Element",
      "Event",
      "HTMLElement",
      "ShadowRoot",
      "Text",
      "URL",
    ]) {
      Object.defineProperty(globalThis, name, {
        configurable: true,
        value: PoisonedAmbientConstructor,
      });
    }

    const safeDocument = globalThis.arkPublicAPI.createSafeDocument(root);
    const wrapper = safeDocument.createDiv();
    wrapper.setText("foreign realm content");
    safeDocument.appendChild(wrapper);

    return {
      ownerIsForeign: root.ownerDocument === foreignDocument,
      rootIsForeignShadowRoot: Object.prototype.isPrototypeOf.call(
        foreignWindow.ShadowRoot.prototype,
        root,
      ),
      rootHTML: root.innerHTML,
      wrapperText: wrapper.getText(),
    };
  });

  expect(result).toEqual({
    ownerIsForeign: true,
    rootIsForeignShadowRoot: true,
    rootHTML: "<div>foreign realm content</div>",
    wrapperText: "foreign realm content",
  });
  expectNoUnapprovedActivity(browserLedger);
});
