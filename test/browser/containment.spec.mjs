import {
  expect,
  expectNoUnapprovedActivity,
  openHarness,
  test,
} from "./fixtures.mjs";

test("paint containment clips fixed, viewport-sized, high-z guest hit testing", async ({
  page,
  browserLedger,
}) => {
  await openHarness(page, browserLedger);

  const setup = await page.evaluate(() => {
    const rejected = [];
    for (const configure of [
      (host) => host,
      (host) => {
        host.style.contain = "paint";
        host.style.display = "contents";
        return host;
      },
      (host) => {
        host.style.contain = "paint";
        host.style.display = "inline";
        return host;
      },
      (host) => {
        host.style.contain = "paint";
        host.style.display = "table-row";
        return host;
      },
    ]) {
      const host = configure(document.createElement("div"));
      document.body.append(host);
      try {
        globalThis.arkPublicAPI.createSafeDocument(host.attachShadow({ mode: "open" }));
        rejected.push(null);
      } catch (error) {
        rejected.push({ code: error?.code, operation: error?.operation });
      }
      host.remove();
    }

    const host = document.createElement("div");
    Object.assign(host.style, {
      contain: "paint",
      height: "90px",
      left: "120px",
      position: "fixed",
      top: "120px",
      width: "150px",
      zIndex: "0",
    });
    const outside = document.createElement("button");
    outside.id = "containment-outside-target";
    Object.assign(outside.style, {
      height: "40px",
      left: "290px",
      position: "fixed",
      top: "140px",
      width: "80px",
      zIndex: "1",
    });
    document.body.append(host, outside);

    const root = host.attachShadow({ mode: "open" });
    const safeDocument = globalThis.arkPublicAPI.createSafeDocument(root, {
      stylePolicy: {
        allowedProperties: [
          "background-color",
          "height",
          "left",
          "pointer-events",
          "position",
          "top",
          "width",
          "z-index",
        ],
      },
    });
    const guest = safeDocument.createDiv();
    guest.style.set("position", "fixed");
    guest.style.set("top", "0");
    guest.style.set("left", "0");
    guest.style.set("width", "100vw");
    guest.style.set("height", "100vh");
    guest.style.set("z-index", "2147483647");
    guest.style.set("pointer-events", "auto");
    guest.style.set("background-color", "rgb(255, 0, 0)");
    safeDocument.appendChild(guest);

    let guestHits = 0;
    let outsideHits = 0;
    guest.onClick(() => { guestHits += 1; });
    outside.addEventListener("click", () => { outsideHits += 1; });
    globalThis.__arkContainmentProbe = {
      get guestHits() { return guestHits; },
      get outsideHits() { return outsideHits; },
      host,
      outside,
      root,
      safeDocument,
    };

    const outsideRect = outside.getBoundingClientRect();
    return {
      point: {
        x: outsideRect.left + outsideRect.width / 2,
        y: outsideRect.top + outsideRect.height / 2,
      },
      rejected,
    };
  });

  await page.mouse.click(setup.point.x, setup.point.y);

  const result = await page.evaluate(({ x, y }) => {
    const probe = globalThis.__arkContainmentProbe;
    const rawGuest = probe.root.querySelector("div");
    if (!(rawGuest instanceof HTMLElement)) throw new Error("guest geometry node is missing");
    const guestRect = rawGuest.getBoundingClientRect();
    const hostRect = probe.host.getBoundingClientRect();
    const documentHit = document.elementFromPoint(x, y);
    const shadowHit = probe.root.elementFromPoint(x, y);
    const snapshot = {
      documentHit: documentHit?.id ?? null,
      guestBoxCoversPoint: guestRect.left <= x && guestRect.right >= x
        && guestRect.top <= y && guestRect.bottom >= y,
      guestHits: probe.guestHits,
      hostRight: hostRect.right,
      outsideHits: probe.outsideHits,
      pointOutsideHost: x > hostRect.right,
      shadowHitIsGuest: shadowHit === rawGuest,
    };
    probe.safeDocument.dispose();
    probe.host.remove();
    probe.outside.remove();
    delete globalThis.__arkContainmentProbe;
    return snapshot;
  }, setup.point);

  expect(setup.rejected).toEqual([
    { code: "INVALID_ROOT", operation: "createSafeDocument.root.containment" },
    { code: "INVALID_ROOT", operation: "createSafeDocument.root.containment" },
    { code: "INVALID_ROOT", operation: "createSafeDocument.root.containment" },
    { code: "INVALID_ROOT", operation: "createSafeDocument.root.containment" },
  ]);
  expect(result).toEqual({
    documentHit: "containment-outside-target",
    guestBoxCoversPoint: true,
    guestHits: 0,
    hostRight: 270,
    outsideHits: 1,
    pointOutsideHost: true,
    shadowHitIsGuest: false,
  });
  expectNoUnapprovedActivity(browserLedger);
});
