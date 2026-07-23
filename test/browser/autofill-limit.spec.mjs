import {
  expect,
  expectNoUnapprovedActivity,
  openHarness,
  test,
} from "./fixtures.mjs";

test("Chromium address Autofill remains guest-readable only behind the explicit non-credential opt-in", async ({
  context,
  page,
  browserLedger,
}) => {
  await openHarness(page, browserLedger);

  const before = await page.evaluate(() => {
    const strictMount = document.querySelector("#mount");
    const hostForm = document.querySelector("#host-form");
    const hostControl = document.querySelector("#host-control");
    if (!(strictMount instanceof HTMLElement)
        || !(hostForm instanceof HTMLFormElement)
        || !(hostControl instanceof HTMLInputElement)) {
      throw new Error("host fixture is incomplete");
    }
    const snapshotHost = () => ({
      formValues: new FormData(hostForm).getAll("shared-name"),
      namedItemIsHost: hostForm.elements.namedItem("shared-name") === hostControl,
      value: hostControl.value,
      controlHTML: hostControl.outerHTML,
    });

    const strictRoot = strictMount.attachShadow({ mode: "open" });
    const strictDocument = globalThis.arkPublicAPI.createSafeDocument(strictRoot);
    const strictErrors = [];
    for (const factory of [
      () => strictDocument.createInput(),
      () => strictDocument.createTextarea(),
      () => strictDocument.createSelect(),
    ]) {
      try {
        factory();
      } catch (error) {
        strictErrors.push({ code: error?.code ?? null, operation: error?.operation ?? null });
      }
    }

    const optInMount = document.createElement("div");
    optInMount.style.contain = "paint";
    document.body.append(optInMount);
    const optInRoot = optInMount.attachShadow({ mode: "open" });
    const optInDocument = globalThis.arkPublicAPI.createSafeDocument(optInRoot, {
      formControlPolicy: { allowNonCredentialFormElements: true },
    });
    const givenName = optInDocument.createInput();
    const email = optInDocument.createInput();
    const street = optInDocument.createTextarea();
    const givenNameLabel = optInDocument.createLabel();
    const emailLabel = optInDocument.createLabel();
    const streetLabel = optInDocument.createLabel();
    givenName.setId("guest-given-name");
    givenName.setName("guest-given-name");
    email.setId("guest-email");
    email.setName("guest-email");
    email.setType("email");
    street.setId("guest-street");
    street.setName("guest-street");
    givenNameLabel.setFor("guest-given-name");
    givenNameLabel.setText("First name");
    emailLabel.setFor("guest-email");
    emailLabel.setText("Email address");
    streetLabel.setFor("guest-street");
    streetLabel.setText("Street address");
    for (const node of [
      givenNameLabel,
      givenName,
      emailLabel,
      email,
      streetLabel,
      street,
    ]) {
      optInDocument.appendChild(node);
    }

    const rawEmail = optInRoot.querySelector('input[type="email"]');
    if (!(rawEmail instanceof HTMLInputElement)) throw new Error("safe email is missing");
    globalThis.arkAutofillLimitationProbe = { email, optInRoot };

    return {
      host: snapshotHost(),
      optIn: {
        autocomplete: rawEmail.autocomplete,
        formIsNull: rawEmail.form === null,
        id: rawEmail.id,
        name: rawEmail.name,
        rawValue: rawEmail.value,
        wrapperValue: email.getValue(),
      },
      strict: {
        errors: strictErrors,
        html: strictRoot.innerHTML,
        valueSinkCount: strictRoot.querySelectorAll("input, textarea, select").length,
      },
    };
  });

  const session = await context.newCDPSession(page);
  await session.send("Autofill.enable");
  const evaluated = await session.send("Runtime.evaluate", {
    expression: `globalThis.arkAutofillLimitationProbe.optInRoot.querySelector('input[type="email"]')`,
    returnByValue: false,
  });
  if (!evaluated.result.objectId) throw new Error("safe email object is missing");
  const { node } = await session.send("DOM.describeNode", {
    objectId: evaluated.result.objectId,
  });
  const autofillEventPromise = new Promise((resolve) => {
    session.on("Autofill.addressFormFilled", resolve);
  });
  await session.send("Autofill.trigger", {
    fieldId: node.backendNodeId,
    address: {
      fields: [
        { name: "NAME_FIRST", value: "Ada" },
        { name: "NAME_LAST", value: "Lovelace" },
        { name: "EMAIL_ADDRESS", value: "ada@example.test" },
        { name: "ADDRESS_HOME_LINE1", value: "1 Analytical Engine Way" },
        { name: "ADDRESS_HOME_CITY", value: "London" },
        { name: "ADDRESS_HOME_ZIP", value: "N1 1AA" },
        { name: "ADDRESS_HOME_COUNTRY", value: "GB" },
      ],
    },
  });
  const autofillEvent = await autofillEventPromise;

  const after = await page.evaluate(() => {
    const hostForm = document.querySelector("#host-form");
    const hostControl = document.querySelector("#host-control");
    const { email, optInRoot } = globalThis.arkAutofillLimitationProbe;
    const rawEmail = optInRoot.querySelector('input[type="email"]');
    if (!(hostForm instanceof HTMLFormElement)
        || !(hostControl instanceof HTMLInputElement)
        || !(rawEmail instanceof HTMLInputElement)) {
      throw new Error("autofill fixture is incomplete");
    }
    return {
      host: {
        formValues: new FormData(hostForm).getAll("shared-name"),
        namedItemIsHost: hostForm.elements.namedItem("shared-name") === hostControl,
        value: hostControl.value,
        controlHTML: hostControl.outerHTML,
      },
      rawValue: rawEmail.value,
      wrapperValue: email.getValue(),
    };
  });

  expect(before.strict).toEqual({
    errors: [
      { code: "FORM_CONTROL_POLICY_REQUIRED", operation: "SafeDocument.createInput.policy" },
      { code: "FORM_CONTROL_POLICY_REQUIRED", operation: "SafeDocument.createTextarea.policy" },
      { code: "FORM_CONTROL_POLICY_REQUIRED", operation: "SafeDocument.createSelect.policy" },
    ],
    html: "",
    valueSinkCount: 0,
  });
  expect(before.optIn).toMatchObject({
    autocomplete: "off",
    formIsNull: true,
    rawValue: "",
    wrapperValue: "",
  });
  expect(before.optIn.id).toMatch(/^aoa-i-[0-9a-f]{48}$/);
  expect(before.optIn.name).toMatch(/^aoa-n-[0-9a-f]{48}$/);
  expect(after).toMatchObject({
    host: before.host,
    rawValue: "ada@example.test",
    wrapperValue: "ada@example.test",
  });
  expect(autofillEvent).toEqual(expect.objectContaining({
    filledFields: expect.arrayContaining([
      expect.objectContaining({
        fillingStrategy: "autofillInferred",
        htmlType: "email",
        value: "ada@example.test",
      }),
    ]),
  }));
  expectNoUnapprovedActivity(browserLedger);
});
