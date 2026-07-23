import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fallow = join(repositoryRoot, "node_modules", "fallow", "bin", "fallow");
const analyses = [
  ["dead-code", "--format", "compact"],
  ["dupes", "--format", "compact"],
];

function runFallow(arguments_) {
  return spawnSync(process.execPath, [fallow, ...arguments_], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: process.env,
  });
}

function writeResult(result) {
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
}

function assertProcessCompleted(result, label) {
  if (result.error !== undefined) throw result.error;
  if (result.signal !== null) {
    throw new Error(`${label} terminated by ${result.signal}`);
  }
}

const preflight = runFallow(["--version"]);
assertProcessCompleted(preflight, "fallow --version");
if (
  preflight.status !== 0 ||
  !/^verified: yes \([^\r\n]+\)(?:;[^\r\n]+)?$/mu.test(preflight.stdout ?? "")
) {
  writeResult(preflight);
  throw new Error(`fallow binary preflight failed with exit code ${preflight.status}`);
}

for (const arguments_ of analyses) {
  const result = runFallow(arguments_);

  writeResult(result);
  assertProcessCompleted(result, `fallow ${arguments_[0]}`);

  const hasCompactFinding = /^(?:[a-z][a-z-]*):[^:\n]+:\d+(?::|$)/mu.test(result.stdout ?? "");
  const findingsOnly = result.status === 1 && result.stderr === "" && hasCompactFinding;
  if (result.status !== 0 && !findingsOnly) {
    throw new Error(`fallow ${arguments_[0]} failed with exit code ${result.status}`);
  }
}
