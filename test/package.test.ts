import { expect, test } from "bun:test";
import { Window } from "happy-dom";
import ts from "typescript";
import { readdirSync, readFileSync } from "node:fs";
import { basename } from "node:path";

test("packed entry points expose distinct capabilities and share domain identity", async () => {
  const name = "ark-of-atrahasis";
  const api = await import(name),
    host = await import(name + "/host");
  expect(Object.keys(api).sort()).toEqual([
    "createSafeDocument",
    "createSafeDomain",
    "createStylePolicy",
    "createURLPolicy",
    "isSafeDOMError",
  ]);
  expect(Object.keys(host)).toEqual(["getRealNode"]);
  const validators = await import(name + "/validators");
  expect(typeof globalThis.document).toBe("undefined");
  expect(validators.isButtonTypeAllowed("submit")).toBe(false);
  const doc = new Window().document,
    a = api.createSafeDomain(doc),
    b = api.createSafeDomain(doc);
  const wrap = a.mount(doc.body).createDiv();
  expect(host.getRealNode(a, wrap).ownerDocument).toBe(doc);
  expect(host.getRealNode(b, wrap)).toBeUndefined();
});
test("real SES lockdown and Compartment exercise guest capabilities", () => {
  const run = Bun.spawnSync([process.execPath, "test/ses-fixture.ts"]);
  expect(run.exitCode, run.stderr.toString()).toBe(0);
});
test("source dependency graph is acyclic, including type imports and re-exports", () => {
  const files = readdirSync("src").filter((f) => f.endsWith(".ts")),
    done = new Set<string>();
  function visit(file: string, path: string[]) {
    if (path.includes(file)) throw new Error([...path, file].join(" -> "));
    if (done.has(file)) return;
    const info = ts.preProcessFile(readFileSync("src/" + file, "utf8"), true, true);
    for (const { fileName } of info.importedFiles)
      if (fileName.startsWith(".")) visit(basename(fileName), [...path, file]);
    done.add(file);
  }
  files.forEach((f) => visit(f, []));
  expect(done.size).toBe(files.length);
});

test("built JavaScript contains no private field syntax", () => {
  const bundles = readdirSync("dist").filter(file => file.endsWith(".js"));
  expect(bundles.length).toBeGreaterThan(0);
  for (const file of bundles) expect(readFileSync("dist/" + file, "utf8")).not.toMatch(/#[a-zA-Z]/);
});
