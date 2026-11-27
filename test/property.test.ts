import { expect, test } from "bun:test";
import { createSafeDomain } from "../src/index.ts";
import { getRealNode } from "../src/host.ts";
import { scanCSSNetworkRisk, validStyle } from "../src/validators.ts";
import { fixture } from "./helpers.ts";

function seeded(seed: number) {
  return (limit: number) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return Math.floor(seed / 2 ** 32 * limit);
  };
}

test("seeded CSS spellings preserve network and deferred policy decisions", () => {
  const next = seeded(0x61726b);
  const names = ["url", "src", "image", "image-set", "-webkit-image-set", "attr", "env", "var"];
  for (let i = 0; i < 300; i++) {
    const index = next(names.length);
    const name = Array.from(names[index], c => [
      c, c.toUpperCase(), "\\" + c.charCodeAt(0).toString(16) + " ",
    ][next(3)]).join("");
    const prefix = ["", "my-", "界", ",", "x/**/"][next(5)];
    const open = ["(", "/**/(", String.raw`\(`, String.raw`\28 `][next(4)];
    const quote = ["", "", "'", '"'][next(4)];
    const value = quote + prefix + name + open + "x)" + quote;
    const callable = !quote && !["my-", "界"].includes(prefix) && open.endsWith("(") && !open.startsWith("\\");
    const network = callable && index < 5;
    expect(scanCSSNetworkRisk(value), value).toBe(network);
    expect(validStyle("cursor", value), value).toBe(!callable);
    expect(validStyle("fontFamily", value), value).toBe(!network);
  }
});

test("seeded mount lifecycles follow node placement and stylesheet ownership", () => {
  const { document, root, win } = fixture();
  const next = seeded(0x61747261);
  for (let sequence = 0; sequence < 12; sequence++) {
    const domains = [0, 1].map(() => createSafeDomain(document, { allowStylesheet: true }));
    const mounts = [0, 1, 2].map(i => {
      const host = root();
      const parent = i === 1 ? host.attachShadow({mode: "closed"}) : host;
      const domain = domains[i >> 1];
      const mount = domain.mount(parent);
      const sheet = mount.createStyle();
      const sheetNode = (i === 1 ? parent : document.head).lastChild!;
      const node = mount.createButton();
      mount.appendChild(node);
      const real = getRealNode(domain, node)!;
      let calls = 0;
      const off = node.onClick(() => calls++);
      return { host, parent, domain, mount, sheet, sheetNode, node, real, off, calls: () => calls,
        location: i, live: true, mounted: true, listening: true, styled: true };
    });
    for (let step = 0; step < 20; step++) {
      const m = mounts[next(3)], dest = next(3);
      switch (next(6)) {
        case 0:
          if (m.live && mounts[dest].mounted) {
            mounts[dest].parent.appendChild(m.real);
            m.location = dest;
            m.live = m.domain === mounts[dest].domain;
          }
          break;
        case 1:
          m.off();
          m.listening = false;
          break;
        case 2:
          m.sheet.dispose();
          m.styled = false;
          break;
        case 3:
          m.mount.dispose();
          m.mounted = m.styled = false;
          for (const n of mounts) if (mounts[n.location] === m) n.live = false;
          break;
        case 4:
          if (step > 9) {
            m.domain.dispose();
            for (const n of mounts) if (n.domain === m.domain) n.mounted = n.live = n.styled = false;
          }
          break;
        case 5:
          if (m.live) {
            m.node.dispose();
            m.live = false;
          }
          break;
      }
      for (const n of mounts) {
        const before = n.calls();
        n.real.dispatchEvent(new win.Event("click") as unknown as Event);
        expect(n.calls()).toBe(before + Number(n.listening && n.live));
        expect(getRealNode(n.domain, n.node)).toBe(n.live ? n.real : undefined);
        expect(n.sheetNode.isConnected).toBe(n.styled);
      }
    }
    for (const domain of domains) domain.dispose();
    for (const m of mounts) m.host.remove();
  }
});
