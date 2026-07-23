import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { extractReadmeFences } from "./readme-examples.mjs";
import { EXPECTED_RUNTIME_EXPORTS } from "./runtime-export-contract.mjs";
import {
  CYCLONEDX_SCHEMA,
  CYCLONEDX_SPEC_VERSION,
  generateReleaseSbom,
  validateReleaseSbomInventory,
} from "./sbom.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputFlag = process.argv.indexOf("--output");

if (outputFlag !== -1 && !process.argv[outputFlag + 1]) {
  throw new Error("--output requires a directory");
}

const outputDirectory =
  outputFlag === -1 ? undefined : resolve(repositoryRoot, process.argv[outputFlag + 1]);

function run(command, args, cwd, options = {}) {
  return execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    env: options.env ?? process.env,
    stdio: options.capture ? ["ignore", "pipe", "inherit"] : "inherit",
  });
}

const npmExecPath = process.env.npm_execpath;

if (!npmExecPath) {
  throw new Error("run package smoke tests through npm so the pinned npm CLI can be verified");
}

function runNpm(args, cwd, options = {}) {
  return run(process.execPath, [npmExecPath, ...args], cwd, options);
}

function sha256(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

function readArchiveEntry(tarballPath, entry, cwd) {
  return run(
    "tar",
    ["--extract", "--to-stdout", "--file", tarballPath, entry],
    cwd,
    { capture: true },
  );
}

function parseTarballName(packOutput) {
  const tarballName = packOutput
    .trim()
    .split(/\r?\n/u)
    .findLast((line) => line.endsWith(".tgz"));

  if (!tarballName) {
    throw new Error(`npm pack did not report a tarball: ${packOutput}`);
  }

  return tarballName;
}

async function runPackedReadmeBrowserExamples({
  examples,
  installedPackageDirectory,
  sourceDirectory,
}) {
  const { chromium } = await import("@playwright/test");
  const sesBundle = join(sourceDirectory, "node_modules", "ses", "dist", "ses.mjs");
  const packageBundle = join(installedPackageDirectory, "dist", "index.js");
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    try {
      if (url.pathname === "/") {
        const index = Number(url.searchParams.get("example"));
        if (!Number.isSafeInteger(index) || index < 0 || index >= examples.length) {
          throw new Error("README example index is invalid");
        }
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        response.end(`<!doctype html>
<html><head><meta charset="utf-8"><title>packed README example</title></head>
<body><div id="plugin-a-root"></div>
<script type="importmap">${JSON.stringify({ imports: {
  "ark-of-atrahasis": "/package/index.js",
  ses: "/ses.mjs",
} })}</script>
<script type="module" src="/readme-example-${index}.mjs"></script></body></html>`);
        return;
      }
      if (url.pathname === "/package/index.js") {
        response.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
        response.end(readFileSync(packageBundle));
        return;
      }
      const exampleMatch = /^\/readme-example-(\d+)\.mjs$/u.exec(url.pathname);
      if (exampleMatch) {
        const index = Number(exampleMatch[1]);
        const example = examples[index];
        if (!example) throw new Error("README example module is missing");
        response.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
        response.end(
          `${example.code}\nglobalThis.__arkReadmeExampleCompleted = ${index + 1};\n`,
        );
        return;
      }
      if (url.pathname === "/ses.mjs") {
        response.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
        response.end(readFileSync(sesBundle));
        return;
      }
      response.writeHead(404).end("not found");
    } catch (error) {
      response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      response.end(error instanceof Error ? error.message : "README example server failure");
    }
  });

  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("README example server failed");

  let browser;
  try {
    browser = await chromium.launch();
    for (let index = 0; index < examples.length; index += 1) {
      const page = await browser.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("requestfailed", (request) => {
        errors.push(`${request.url()}: ${request.failure()?.errorText ?? "request failed"}`);
      });
      await page.goto(`http://127.0.0.1:${address.port}/?example=${index}`);
      try {
        await page.waitForFunction(
          (expected) => globalThis.__arkReadmeExampleCompleted === expected,
          index + 1,
          { timeout: 5_000 },
        );
      } catch (error) {
        throw new Error(
          `packed README executable fence at line ${examples[index].line} failed in Chromium: ${
            errors.join("; ") || (error instanceof Error ? error.message : "unknown failure")
          }`,
        );
      } finally {
        await page.close();
      }
      if (errors.length > 0) {
        throw new Error(
          `packed README executable fence at line ${examples[index].line} emitted browser errors: ${errors.join("; ")}`,
        );
      }
    }
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise((resolveClose, rejectClose) => {
      server.close((error) => error ? rejectClose(error) : resolveClose());
    });
  }
}

const sourceManifest = JSON.parse(readFileSync(join(repositoryRoot, "package.json"), "utf8"));
const packageManagerMatch = /^npm@(\d+\.\d+\.\d+)$/u.exec(sourceManifest.packageManager ?? "");
const requiredNodeVersion = readFileSync(join(repositoryRoot, ".node-version"), "utf8").trim();

if (process.version !== `v${requiredNodeVersion}`) {
  throw new Error(
    `package smoke tests require Node.js v${requiredNodeVersion}, received ${process.version}`,
  );
}

if (!packageManagerMatch) {
  throw new Error("packageManager must pin an exact npm version");
}

const actualNpmVersion = runNpm(["--version"], repositoryRoot, { capture: true }).trim();

if (actualNpmVersion !== packageManagerMatch[1]) {
  throw new Error(
    `package smoke tests require npm ${packageManagerMatch[1]}, received ${actualNpmVersion}`,
  );
}

const status = run(
  "git",
  ["status", "--porcelain", "--untracked-files=all"],
  repositoryRoot,
  { capture: true },
).trim();

if (status !== "") {
  throw new Error("package smoke tests require a clean committed working tree");
}

const temporaryRoot = mkdtempSync(join(tmpdir(), "ark-package-smoke-"));
const archivePath = join(temporaryRoot, "source.tar");
const sourceDirectory = join(temporaryRoot, "source");
const consumerDirectory = join(temporaryRoot, "consumer");
const rebuildDirectory = join(temporaryRoot, "rebuild");
const isolatedHome = join(temporaryRoot, "home");
const isolatedCache = join(temporaryRoot, "npm-cache");
const emptyConsumerCache = join(temporaryRoot, "consumer-npm-cache");

mkdirSync(sourceDirectory, { recursive: true });
mkdirSync(consumerDirectory, { recursive: true });
mkdirSync(rebuildDirectory, { recursive: true });
mkdirSync(isolatedHome, { recursive: true });
mkdirSync(isolatedCache, { recursive: true });
mkdirSync(emptyConsumerCache, { recursive: true });

const isolatedEnvironment = {
  ...process.env,
  HOME: isolatedHome,
  NODE_OPTIONS: "--throw-deprecation",
  NPM_CONFIG_AUDIT: "false",
  NPM_CONFIG_CACHE: isolatedCache,
  NPM_CONFIG_FUND: "false",
  NPM_CONFIG_UPDATE_NOTIFIER: "false",
};
const offlineRebuildEnvironment = {
  ...isolatedEnvironment,
  NPM_CONFIG_OFFLINE: "true",
  NPM_CONFIG_REGISTRY: "http://127.0.0.1:9/",
};
const offlineConsumerEnvironment = {
  ...offlineRebuildEnvironment,
  NPM_CONFIG_CACHE: emptyConsumerCache,
};

try {
  run(
    "git",
    ["archive", "--format=tar", `--output=${archivePath}`, "HEAD"],
    repositoryRoot,
  );
  run("tar", ["--extract", "--file", archivePath, "--directory", sourceDirectory], repositoryRoot);

  if (existsSync(join(sourceDirectory, "dist"))) {
    throw new Error("the pristine Git archive unexpectedly contains dist/");
  }

  if (!existsSync(join(sourceDirectory, "npm-shrinkwrap.json"))) {
    throw new Error("the pristine source archive is missing the publishable build lockfile");
  }

  runNpm(
    ["ci", "--ignore-scripts", "--no-audit", "--no-fund"],
    sourceDirectory,
    { env: isolatedEnvironment },
  );

  if (existsSync(join(sourceDirectory, "dist"))) {
    throw new Error("npm ci created dist/ before the package prepack lifecycle");
  }

  const firstTarballName = parseTarballName(
    runNpm(["pack", "--silent"], sourceDirectory, {
      capture: true,
      env: isolatedEnvironment,
    }),
  );
  const firstTarballPath = join(sourceDirectory, firstTarballName);
  const firstTarballDigest = sha256(readFileSync(firstTarballPath));

  rmSync(firstTarballPath);

  const tarballName = parseTarballName(
    runNpm(["pack", "--silent"], sourceDirectory, {
      capture: true,
      env: isolatedEnvironment,
    }),
  );
  const tarballPath = join(sourceDirectory, tarballName);
  const tarballDigest = sha256(readFileSync(tarballPath));

  if (tarballName !== firstTarballName || tarballDigest !== firstTarballDigest) {
    throw new Error("two consecutive npm prepack builds did not produce byte-identical tarballs");
  }

  const archiveListing = run("tar", ["--list", "--file", tarballPath], sourceDirectory, {
    capture: true,
  });
  const archiveEntries = new Set(archiveListing.trim().split(/\r?\n/u));
  const trackedCorrespondingSource = run(
    "git",
    ["ls-tree", "-r", "--name-only", "HEAD", "src", "scripts", "test"],
    repositoryRoot,
    { capture: true },
  )
    .trim()
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((entry) => `package/${entry}`);
  const requiredEntries = [
    "package/.github/workflows/check.yml",
    "package/.github/workflows/release.yml",
    "package/.github/workflows/security.yml",
    "package/.fallowrc.json",
    "package/.node-version",
    "package/CHANGELOG.md",
    "package/LICENSE",
    "package/README.md",
    "package/RELEASING.md",
    "package/dist/index.d.ts",
    "package/dist/index.d.ts.map",
    "package/dist/index.js",
    "package/dist/index.js.map",
    "package/npm-shrinkwrap.json",
    "package/package.json",
    "package/tsconfig.json",
    "package/tsconfig.tooling.json",
    "package/tsdown.config.ts",
    ...trackedCorrespondingSource,
  ];

  for (const requiredEntry of requiredEntries) {
    if (!archiveEntries.has(requiredEntry)) {
      throw new Error(`packed artifact is missing ${requiredEntry}`);
    }
  }

  if (
    readArchiveEntry(tarballPath, "package/.node-version", sourceDirectory).trim() !==
      requiredNodeVersion
  ) {
    throw new Error("packed Node version differs from the verified build runtime");
  }

  const allowedGitHubEntries = new Set([
    "package/.github/workflows/check.yml",
    "package/.github/workflows/release.yml",
    "package/.github/workflows/security.yml",
  ]);
  const forbiddenEntries = ["bun.lockb", "package-lock.json", "node_modules/"];
  if (
    [...archiveEntries].some(
      (entry) =>
        entry === "package/.git" ||
        entry.startsWith("package/.git/") ||
        (entry.startsWith("package/.github/") && !allowedGitHubEntries.has(entry)) ||
        forbiddenEntries.some((forbiddenEntry) => entry.includes(forbiddenEntry)),
    )
  ) {
    throw new Error("packed artifact contains repository-only or retired package-manager data");
  }

  const packedManifest = JSON.parse(
    readArchiveEntry(tarballPath, "package/package.json", sourceDirectory),
  );

  if (packedManifest.name !== sourceManifest.name || packedManifest.version !== sourceManifest.version) {
    throw new Error("packed manifest identity differs from the committed source manifest");
  }

  if (packedManifest.sideEffects !== false) {
    throw new Error("packed manifest must declare sideEffects: false");
  }

  if (packedManifest.engines?.node !== `>=${requiredNodeVersion}`) {
    throw new Error("packed manifest Node engine must match the exact build baseline");
  }

  if (
    packedManifest.repository?.url !==
      "git+https://github.com/notwindstone/ark-of-atrahasis.git" ||
    packedManifest.homepage !== "https://github.com/notwindstone/ark-of-atrahasis#readme" ||
    packedManifest.bugs?.url !== "https://github.com/notwindstone/ark-of-atrahasis/issues"
  ) {
    throw new Error("packed manifest must identify the canonical upstream repository, not a fork");
  }

  if (
    packedManifest.publishConfig?.provenance !== true ||
    packedManifest.publishConfig?.registry !== "https://registry.npmjs.org/"
  ) {
    throw new Error("packed manifest must require npm registry provenance");
  }

  if (packedManifest.peerDependencies?.typescript) {
    throw new Error("packed manifest must not impose a consumer TypeScript peer");
  }

  if (Object.keys(packedManifest.dependencies ?? {}).length !== 0) {
    throw new Error("packed runtime must have zero production dependencies");
  }

  if (packedManifest.devDependencies?.["@types/bun"]) {
    throw new Error("packed manifest must not depend on unbounded Bun types");
  }

  if (
    packedManifest.devDependencies?.["@biomejs/biome"] !== "2.5.4" ||
    packedManifest.devDependencies?.fallow !== "3.6.0" ||
    packedManifest.devDependencies?.tsdown !== "0.22.8" ||
    packedManifest.devDependencies?.typescript !== "6.0.3" ||
    packedManifest.devDependencies?.["typescript-current"] !== "npm:typescript@7.0.2" ||
    packedManifest.devDependencies?.["typescript-min"] !== "npm:typescript@5.0.4" ||
    packedManifest.devDependencies?.vitest !== "4.1.10" ||
    packedManifest.devDependencies?.["fast-check"] !== "4.9.0" ||
    packedManifest.devDependencies?.ses !== "2.2.0" ||
    packedManifest.devDependencies?.["@endo/pass-style"] !== "1.8.1" ||
    packedManifest.devDependencies?.["@endo/eventual-send"] !== "1.5.0"
  ) {
    throw new Error(
      "packed manifest must pin Fallow, tsdown, TypeScript, fast-check, and the SES verification toolchain",
    );
  }

  const packedLock = JSON.parse(
    readArchiveEntry(tarballPath, "package/npm-shrinkwrap.json", sourceDirectory),
  );

  if (
    packedLock.lockfileVersion !== 3 ||
    packedLock.packages?.[""]?.name !== packedManifest.name ||
    packedLock.packages?.[""]?.version !== packedManifest.version ||
    JSON.stringify(packedLock.packages?.[""]?.devDependencies) !==
      JSON.stringify(packedManifest.devDependencies)
  ) {
    throw new Error("published build lockfile is not synchronized with the packed manifest");
  }

  for (const [dependencyPath, dependency] of Object.entries(packedLock.packages)) {
    if (!dependencyPath || dependency.link) continue;
    if (typeof dependency.integrity !== "string") {
      throw new Error(`locked dependency ${dependencyPath} has no integrity digest`);
    }
    if (
      typeof dependency.resolved !== "string" ||
      !dependency.resolved.startsWith("https://registry.npmjs.org/")
    ) {
      throw new Error(`locked dependency ${dependencyPath} is not pinned to the npm registry`);
    }
  }

  const sourceMap = JSON.parse(
    readArchiveEntry(tarballPath, "package/dist/index.js.map", sourceDirectory),
  );

  if (
    !Array.isArray(sourceMap.sources) ||
    !Array.isArray(sourceMap.sourcesContent) ||
    sourceMap.sources.length === 0 ||
    sourceMap.sources.length !== sourceMap.sourcesContent.length ||
    sourceMap.sources.some((source) => /^(?:\/|file:|[A-Za-z]:)/u.test(source)) ||
    sourceMap.sourcesContent.some((source) => typeof source !== "string")
  ) {
    throw new Error("packed JavaScript source map must contain complete, relative source content");
  }

  const declaration = readArchiveEntry(
    tarballPath,
    "package/dist/index.d.ts",
    sourceDirectory,
  );
  const declarationMap = JSON.parse(
    readArchiveEntry(tarballPath, "package/dist/index.d.ts.map", sourceDirectory),
  );
  if (
    !declaration.endsWith("//# sourceMappingURL=index.d.ts.map") ||
    declarationMap.file !== "index.d.ts" ||
    !Array.isArray(declarationMap.sources) ||
    declarationMap.sources.length === 0 ||
    declarationMap.sources.some(
      (source) =>
        typeof source !== "string" ||
        !/^\.\.\/src\/.+\.ts$/u.test(source) ||
        !archiveEntries.has(`package/${source.slice(3)}`),
    )
  ) {
    throw new Error("packed declaration map must resolve only to included TypeScript source");
  }

  const packedReadme = readArchiveEntry(
    tarballPath,
    "package/README.md",
    sourceDirectory,
  );
  const packedReadmeFences = extractReadmeFences(packedReadme);
  const executableReadmeFences = packedReadmeFences.filter((fence) => fence.executable);
  if (executableReadmeFences.length === 0) {
    throw new Error("packed README must retain at least one executable fence");
  }
  for (const fence of executableReadmeFences) {
    if (fence.language !== "js" && fence.language !== "javascript") {
      throw new Error(
        `packed README executable fence at line ${fence.line} uses unsupported language ${fence.language}`,
      );
    }
  }

  writeFileSync(
    join(consumerDirectory, "package.json"),
    `${JSON.stringify({ name: "package-smoke-consumer", private: true, type: "module" }, null, 2)}\n`,
  );
  runNpm(
    ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--offline", tarballPath],
    consumerDirectory,
    { env: offlineConsumerEnvironment },
  );

  writeFileSync(
    join(consumerDirectory, "runtime-smoke.mjs"),
    `import * as api from "ark-of-atrahasis";

const expectedRuntimeExports = ${JSON.stringify(EXPECTED_RUNTIME_EXPORTS)};
const actualRuntimeExports = Object.keys(api).sort();
if (JSON.stringify(actualRuntimeExports) !== JSON.stringify(expectedRuntimeExports)) {
  throw new Error(\`installed ESM package runtime exports differ: expected \${JSON.stringify(expectedRuntimeExports)}, received \${JSON.stringify(actualRuntimeExports)}\`);
}

if (typeof api.createSafeDocument !== "function") {
  throw new Error("installed ESM package does not export createSafeDocument");
}

const hardenForSmoke = value => {
  const pending = [value];
  const visited = new WeakSet();
  while (pending.length > 0) {
    const candidate = pending.pop();
    if ((typeof candidate !== "object" && typeof candidate !== "function") || candidate === null) continue;
    if (visited.has(candidate)) continue;
    visited.add(candidate);
    for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(candidate))) {
      if ("value" in descriptor) pending.push(descriptor.value);
      else pending.push(descriptor.get, descriptor.set);
    }
    Object.freeze(candidate);
  }
  return value;
};
Object.freeze(hardenForSmoke);

try {
  api.createSafeDocument(null, { harden: hardenForSmoke });
  throw new Error("the installed runtime accepted a non-ShadowRoot capability");
} catch (error) {
  if (error?.code !== "INVALID_ROOT") throw error;
}

const resolved = import.meta.resolve("ark-of-atrahasis");
if (!resolved.includes("/node_modules/ark-of-atrahasis/dist/index.js")) {
  throw new Error(\`runtime resolved outside the installed tarball: \${resolved}\`);
}
`,
  );
  run("node", ["runtime-smoke.mjs"], consumerDirectory, {
    env: offlineConsumerEnvironment,
  });

  const installedTypeFixtureDirectory = join(
    consumerDirectory,
    "node_modules",
    "ark-of-atrahasis",
    "test",
    "types",
  );
  for (const fixture of ["positive.ts", "negative.ts", "tsconfig.json"]) {
    copyFileSync(join(installedTypeFixtureDirectory, fixture), join(consumerDirectory, fixture));
  }

  const compilers = [
    { directory: "typescript-min", label: "minimum", version: "5.0.4" },
    { directory: "typescript-current", label: "current", version: "7.0.2" },
  ];

  const readmeExampleFiles = executableReadmeFences.map((fence, index) => {
    const name = `readme-example-${index}.mjs`;
    writeFileSync(join(consumerDirectory, name), fence.code);
    return name;
  });
  writeFileSync(
    join(consumerDirectory, "readme-example-globals.d.ts"),
    `declare module "ses";
declare function lockdown(): void;
declare const harden: <Value>(value: Value) => Value;
declare class Compartment {
  constructor(endowments?: Record<string, unknown>);
}
`,
  );
  writeFileSync(
    join(consumerDirectory, "readme-examples-tsconfig.json"),
    `${JSON.stringify({
      compilerOptions: {
        allowJs: true,
        checkJs: true,
        lib: ["ESNext", "DOM"],
        module: "NodeNext",
        moduleResolution: "NodeNext",
        noEmit: true,
        strict: true,
        target: "ESNext",
        types: [],
      },
      files: ["readme-example-globals.d.ts", ...readmeExampleFiles],
    }, null, 2)}\n`,
  );

  for (const compiler of compilers) {
    const compilerPath = join(sourceDirectory, "node_modules", compiler.directory, "bin", "tsc");
    const reportedVersion = run(process.execPath, [compilerPath, "--version"], consumerDirectory, {
      capture: true,
      env: offlineConsumerEnvironment,
    }).trim();

    if (reportedVersion !== `Version ${compiler.version}`) {
      throw new Error(
        `${compiler.label} TypeScript resolved to ${reportedVersion}, expected ${compiler.version}`,
      );
    }

    run(
      process.execPath,
      [compilerPath, "--project", join(consumerDirectory, "tsconfig.json")],
      consumerDirectory,
      { env: offlineConsumerEnvironment },
    );
    run(
      process.execPath,
      [compilerPath, "--project", join(consumerDirectory, "readme-examples-tsconfig.json")],
      consumerDirectory,
      { env: offlineConsumerEnvironment },
    );
  }

  await runPackedReadmeBrowserExamples({
    examples: executableReadmeFences,
    installedPackageDirectory: join(consumerDirectory, "node_modules", packedManifest.name),
    sourceDirectory,
  });

  run("tar", ["--extract", "--file", tarballPath, "--directory", rebuildDirectory], sourceDirectory);
  const rebuildPackageDirectory = join(rebuildDirectory, "package");
  rmSync(join(rebuildPackageDirectory, "dist"), { force: true, recursive: true });
  runNpm(
    ["ci", "--ignore-scripts", "--no-audit", "--no-fund", "--offline"],
    rebuildPackageDirectory,
    { env: offlineRebuildEnvironment },
  );
  runNpm(["run", "build"], rebuildPackageDirectory, {
    env: offlineRebuildEnvironment,
  });

  for (const artifact of ["index.d.ts", "index.d.ts.map", "index.js", "index.js.map"]) {
    const packedContents = readArchiveEntry(
      tarballPath,
      `package/dist/${artifact}`,
      sourceDirectory,
    );
    const rebuiltContents = readFileSync(join(rebuildPackageDirectory, "dist", artifact), "utf8");
    if (rebuiltContents !== packedContents) {
      throw new Error(`packed dist/${artifact} is not reproducible from the included source and lockfile`);
    }
  }

  const sbomOptions = {
    cwd: sourceDirectory,
    env: isolatedEnvironment,
    name: packedManifest.name,
    npmExecPath,
    npmVersion: actualNpmVersion,
    tarballSha256: tarballDigest,
    version: packedManifest.version,
  };
  const sbomContents = await generateReleaseSbom(sbomOptions);
  const repeatedSbomContents = await generateReleaseSbom(sbomOptions);
  if (repeatedSbomContents !== sbomContents) {
    throw new Error("two consecutive CycloneDX SBOM generations were not byte-identical");
  }
  const sbom = JSON.parse(sbomContents);
  validateReleaseSbomInventory(
    sbom,
    JSON.parse(readFileSync(join(sourceDirectory, "npm-shrinkwrap.json"), "utf8")),
  );
  if (
    sbom.$schema !== CYCLONEDX_SCHEMA
    || sbom.specVersion !== CYCLONEDX_SPEC_VERSION
    || sbom.metadata?.component?.name !== packedManifest.name
    || sbom.metadata?.component?.version !== packedManifest.version
    || sbom.metadata?.component?.hashes?.[0]?.content !== tarballDigest
    || !Array.isArray(sbom.components)
    || sbom.components.length === 0
  ) {
    throw new Error("generated CycloneDX SBOM does not describe the exact packed release");
  }

  if (outputDirectory) {
    mkdirSync(outputDirectory, { recursive: true });
    const verifiedArtifact = join(outputDirectory, basename(tarballPath));
    const artifactBaseName = basename(tarballPath, ".tgz");
    const sbomName = `${artifactBaseName}.sbom.cdx.json`;
    const checksumName = `${artifactBaseName}.sha256`;

    copyFileSync(tarballPath, verifiedArtifact);
    writeFileSync(join(outputDirectory, sbomName), sbomContents);
    writeFileSync(
      join(outputDirectory, checksumName),
      `${tarballDigest}  ${basename(tarballPath)}\n${sha256(sbomContents)}  ${sbomName}\n`,
    );
    console.log(`Verified ${verifiedArtifact} (sha256 ${tarballDigest})`);
  } else {
    console.log(`Verified ${tarballName} (sha256 ${tarballDigest})`);
  }
} finally {
  rmSync(temporaryRoot, { force: true, recursive: true });
}
