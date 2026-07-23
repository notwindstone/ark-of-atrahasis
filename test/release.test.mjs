import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { parse } from "yaml";

import {
  assertNpmProvenance,
  finalizeGitHubRelease,
  inspectRegistryTarball,
  prepareGitHubRelease,
  publishOrResumeNpm,
} from "../scripts/release-recovery.mjs";
import {
  CYCLONEDX_LIBRARY_VERSION,
  CYCLONEDX_SCHEMA,
  CYCLONEDX_SPEC_VERSION,
  collectShrinkwrapComponentInventory,
  normalizeReleaseSbom,
  validateReleaseSbomInventory,
  validateReleaseSbomContents,
} from "../scripts/sbom.mjs";
import {
  inspectVersionForRelease,
  verifyAnnotatedTagAtHead,
  verifyReleaseMetadata,
} from "../scripts/verify-release.mjs";
import {
  assertVersionAdvancesLatest,
  compareStableVersions,
  parseStableVersion,
} from "../scripts/stable-version.mjs";
import { extractReadmeFences } from "../scripts/readme-examples.mjs";
import { EXPECTED_RUNTIME_EXPORTS } from "../scripts/runtime-export-contract.mjs";

const manifest = {
  name: "ark-of-atrahasis",
  packageManager: "npm@11.18.0",
  version: "0.4.0",
};
const changelog = "## [Unreleased]\n\n## [0.4.0] - 2026-07-15\n";
const releaseWorkflow = readFileSync(
  new URL("../.github/workflows/release.yml", import.meta.url),
  "utf8",
);
const checkWorkflow = readFileSync(
  new URL("../.github/workflows/check.yml", import.meta.url),
  "utf8",
);
const parsedCheckWorkflow = parse(checkWorkflow);
const securityWorkflowSource = readFileSync(
  new URL("../.github/workflows/security.yml", import.meta.url),
  "utf8",
);
const securityWorkflow = parse(securityWorkflowSource);
const releaseRecoverySource = readFileSync(
  new URL("../scripts/release-recovery.mjs", import.meta.url),
  "utf8",
);
const packageGateSource = readFileSync(
  new URL("../scripts/test-package.mjs", import.meta.url),
  "utf8",
);
const fallowReportSource = readFileSync(
  new URL("../scripts/fallow-report.mjs", import.meta.url),
  "utf8",
);
const sourceManifest = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
const sourceShrinkwrap = JSON.parse(
  readFileSync(new URL("../npm-shrinkwrap.json", import.meta.url), "utf8"),
);
const sourceNodeVersion = readFileSync(
  new URL("../.node-version", import.meta.url),
  "utf8",
).trim();
const sourceTsconfig = JSON.parse(
  readFileSync(new URL("../tsconfig.json", import.meta.url), "utf8"),
);
const sourceToolingTsconfig = JSON.parse(
  readFileSync(new URL("../tsconfig.tooling.json", import.meta.url), "utf8"),
);
const sourceFallowConfig = JSON.parse(
  readFileSync(new URL("../.fallowrc.json", import.meta.url), "utf8"),
);
const sourceTsdownConfig = readFileSync(
  new URL("../tsdown.config.ts", import.meta.url),
  "utf8",
);

test("release SBOM normalization is reproducible, current, and bound to the tarball", () => {
  const digest = "a".repeat(64);
  const raw = {
    $schema: "http://cyclonedx.org/schema/bom-1.5.schema.json",
    bomFormat: "CycloneDX",
    specVersion: "1.5",
    serialNumber: "urn:uuid:09f55116-97e1-49cf-b3b8-44d0207e7730",
    version: 1,
    metadata: {
      timestamp: "2026-07-15T00:00:00.000Z",
      tools: [{ vendor: "npm", name: "cli", version: "11.18.0" }],
      component: {
        "bom-ref": "ark-of-atrahasis@0.4.0",
        type: "library",
        name: "temporary-directory-name",
        version: "0.4.0",
      },
    },
    components: [],
    dependencies: [{ ref: "ark-of-atrahasis@0.4.0", dependsOn: [] }],
  };

  const normalized = normalizeReleaseSbom(raw, {
    name: "ark-of-atrahasis",
    npmVersion: "11.18.0",
    tarballSha256: digest,
    version: "0.4.0",
  });

  assert.equal(normalized.$schema, CYCLONEDX_SCHEMA);
  assert.equal(normalized.specVersion, CYCLONEDX_SPEC_VERSION);
  assert.equal(normalized.serialNumber, undefined);
  assert.equal(normalized.metadata.timestamp, undefined);
  assert.equal(normalized.metadata.component.name, "ark-of-atrahasis");
  assert.deepEqual(normalized.metadata.component.hashes, [{ alg: "SHA-256", content: digest }]);
  assert.deepEqual(normalized.metadata.properties, [{ name: "cdx:reproducible", value: "true" }]);
  assert.deepEqual(normalized.metadata.tools.at(-2), {
    vendor: "ark-of-atrahasis",
    name: "scripts/sbom.mjs",
    version: "0.4.0",
  });
  assert.deepEqual(normalized.metadata.tools.at(-1), {
    vendor: "OWASP Foundation",
    name: "@cyclonedx/cyclonedx-library",
    version: CYCLONEDX_LIBRARY_VERSION,
  });
  assert.equal(raw.specVersion, "1.5");
  assert.equal(raw.metadata.component.name, "temporary-directory-name");
  assert.throws(
    () => normalizeReleaseSbom(raw, {
      name: "ark-of-atrahasis",
      npmVersion: "11.18.0",
      tarballSha256: "not-a-digest",
      version: "0.4.0",
    }),
    /lowercase SHA-256 digest/u,
  );
  assert.throws(
    () => normalizeReleaseSbom({ ...raw, metadata: {
      ...raw.metadata,
      tools: [{ vendor: "npm", name: "cli", version: "11.17.0" }],
    } }, {
      name: "ark-of-atrahasis",
      npmVersion: "11.18.0",
      tarballSha256: digest,
      version: "0.4.0",
    }),
    /tool identity drifted/u,
  );
  assert.throws(
    () => normalizeReleaseSbom({ ...raw, metadata: {
      ...raw.metadata,
      component: { ...raw.metadata.component, "bom-ref": "another-package@0.4.0" },
    } }, {
      name: "ark-of-atrahasis",
      npmVersion: "11.18.0",
      tarballSha256: digest,
      version: "0.4.0",
    }),
    /structure/u,
  );
});

test("release SBOM strict validation rejects invalid CycloneDX 1.7 bytes", async () => {
  const invalid = JSON.stringify({
    $schema: CYCLONEDX_SCHEMA,
    bomFormat: "CycloneDX",
    specVersion: CYCLONEDX_SPEC_VERSION,
    version: "not-an-integer",
  });
  await assert.rejects(
    validateReleaseSbomContents(invalid),
    /CycloneDX 1\.7 validation failed/u,
  );
});

test("release SBOM strict validation retains IDN email checks without deprecated plugins", async () => {
  const withEmail = (email) => JSON.stringify({
    bomFormat: "CycloneDX",
    metadata: { authors: [{ email }] },
    specVersion: CYCLONEDX_SPEC_VERSION,
  });

  // Covers the JSON Schema draft 2019-09 email/idn-email string corpus plus
  // the published ajv-formats-draft2019 and smtp-address-parser witnesses.
  const validEmails = [
    "joe.bloggs@example.com",
    "te~st@example.com",
    "~test@example.com",
    "test~@example.com",
    "te.s.t@example.com",
    "실례@실례.테스트",
    "квіточка@пошта.укр",
    "Dörte@Sörensen.example.com",
    "我買@屋企.香港",
    '"John Doe"@example.com',
    '"john..doe"@example.org',
    '"john\\"doe"@example.org',
    "simple@[127.0.0.1]",
  ];
  const invalidEmails = [
    "2962",
    ".test@example.com",
    "test.@example.com",
    "te..st@example.com",
    "",
    "johndoe",
    "valid@example.com?query",
    "foo bar@example.com",
    "A@b@c@example.com",
    "admin@mailserver1",
    'just"not"right@example.com',
  ];

  for (const email of validEmails) {
    await assert.doesNotReject(validateReleaseSbomContents(withEmail(email)), email);
  }
  for (const email of invalidEmails) {
    await assert.rejects(
      validateReleaseSbomContents(withEmail(email)),
      /CycloneDX 1\.7 validation failed/u,
      email,
    );
  }
});

test("release dependency tree excludes deprecated CI modules and lock-marked packages", () => {
  const deprecatedPackages = Object.entries(sourceShrinkwrap.packages)
    .filter(([, entry]) => typeof entry?.deprecated === "string" && entry.deprecated.length > 0)
    .map(([path, entry]) => ({ deprecated: entry.deprecated, path }));

  assert.deepEqual(deprecatedPackages, []);
  assert.equal(sourceManifest.devDependencies?.["ajv-formats-draft2019"], undefined);
  assert.equal(sourceShrinkwrap.packages["node_modules/ajv-formats-draft2019"], undefined);
  assert.equal(sourceShrinkwrap.packages["node_modules/whatwg-encoding"], undefined);
});

test("CI, release, and package gates fail on Node runtime deprecations", () => {
  assert.match(sourceManifest.scripts["test:package"], /node --throw-deprecation/u);
  assert.match(sourceManifest.scripts["pack:verified"], /node --throw-deprecation/u);
  assert.equal((checkWorkflow.match(/NODE_OPTIONS: --throw-deprecation/gu) ?? []).length, 1);
  assert.equal((releaseWorkflow.match(/NODE_OPTIONS: --throw-deprecation/gu) ?? []).length, 2);
  assert.match(packageGateSource, /NODE_OPTIONS: "--throw-deprecation"/u);
});

test("release SBOM inventory rejects an internally closed but truncated shrinkwrap graph", () => {
  const shrinkwrap = {
    packages: {
      "": { name: "fixture", version: "1.0.0" },
      "node_modules/alias": { name: "actual-package", version: "2.0.0" },
      "node_modules/dep": { version: "1.0.0" },
      "node_modules/parent/node_modules/dep": { version: "1.0.0" },
      "node_modules/workspace": { link: true, resolved: "packages/workspace" },
    },
  };
  const complete = {
    components: [
      { "bom-ref": "dep@1.0.0", name: "dep", version: "1.0.0" },
      {
        "bom-ref": "actual-package@2.0.0",
        name: "alias",
        version: "2.0.0",
      },
    ],
    dependencies: [
      { ref: "fixture@1.0.0", dependsOn: ["dep@1.0.0", "actual-package@2.0.0"] },
      { ref: "dep@1.0.0", dependsOn: [] },
      { ref: "actual-package@2.0.0", dependsOn: [] },
    ],
  };

  assert.deepEqual(collectShrinkwrapComponentInventory(shrinkwrap), [
    "alias@2.0.0",
    "dep@1.0.0",
  ]);
  assert.doesNotThrow(() => validateReleaseSbomInventory(complete, shrinkwrap));

  const truncated = {
    components: complete.components.slice(0, 1),
    dependencies: [
      { ref: "fixture@1.0.0", dependsOn: ["dep@1.0.0"] },
      { ref: "dep@1.0.0", dependsOn: [] },
    ],
  };
  assert.throws(
    () => validateReleaseSbomInventory(truncated, shrinkwrap),
    /component inventory differs.*alias@2\.0\.0/u,
  );
});

test("README enumerates the exact root runtime-export contract", () => {
  const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
  const enumeration = readme.match(
    /Its runtime exports\nare exactly[^:]+:\n\n(?<list>[\s\S]*?)\n\nOnly `createSafeDocument/u,
  )?.groups?.list;
  assert.ok(enumeration, "README runtime-export enumeration is missing");
  const documented = [...enumeration.matchAll(/`([A-Za-z][A-Za-z0-9_]*)`/gu)]
    .map((match) => match[1])
    .sort();
  assert.deepEqual(documented, EXPECTED_RUNTIME_EXPORTS);
});

function createRecoveryFixture() {
  const directory = mkdtempSync(join(tmpdir(), "ark-release-recovery-test-"));
  const artifactBase = "ark-of-atrahasis-0.4.0";
  const files = new Map([
    [`${artifactBase}.tgz`, Buffer.from("verified npm tarball\n")],
    [`${artifactBase}.sbom.cdx.json`, Buffer.from('{"bomFormat":"CycloneDX"}\n')],
    [`${artifactBase}.sha256`, Buffer.from("verified checksums\n")],
  ]);
  for (const [name, contents] of files) writeFileSync(join(directory, name), contents);
  const artifacts = [...files].map(([name, contents], index) => ({
    digest: `sha256:${createHash("sha256").update(contents).digest("hex")}`,
    id: index + 10,
    name,
    size: contents.length,
    state: "uploaded",
  }));
  return {
    artifactBase,
    artifacts,
    directory,
    tarball: files.get(`${artifactBase}.tgz`),
    tarballPath: join(directory, `${artifactBase}.tgz`),
  };
}

function draftRelease(overrides = {}) {
  return {
    draft: true,
    id: 1,
    immutable: false,
    name: "v0.4.0",
    prerelease: false,
    published_at: null,
    tag_name: "v0.4.0",
    ...overrides,
  };
}

function createFakeGitHub({ assets = [], commitSha = "release-commit", releases = [] } = {}) {
  const state = {
    assets: assets.map((asset) => ({ ...asset })),
    calls: { create: 0, delete: 0, update: 0, upload: 0 },
    commitSha,
    releases: releases.map((release) => ({ ...release })),
  };
  const github = {
    rest: {
      git: {
        getRef: async () => ({
          data: { object: { sha: "annotated-tag", type: "tag" } },
        }),
        getTag: async () => ({
          data: { object: { sha: state.commitSha, type: "commit" } },
        }),
      },
      repos: {
        createRelease: async (parameters) => {
          state.calls.create += 1;
          const release = draftRelease({
            name: parameters.name,
            tag_name: parameters.tag_name,
          });
          state.releases.push(release);
          return { data: { ...release } };
        },
        deleteReleaseAsset: async ({ asset_id }) => {
          state.calls.delete += 1;
          state.assets = state.assets.filter((asset) => asset.id !== asset_id);
        },
        listReleaseAssets: async ({ page }) => ({
          data: page === 1 ? state.assets.map((asset) => ({ ...asset })) : [],
        }),
        listReleases: async ({ page }) => ({
          data: page === 1 ? state.releases.map((release) => ({ ...release })) : [],
        }),
        updateRelease: async ({ release_id }) => {
          state.calls.update += 1;
          const release = state.releases.find((candidate) => candidate.id === release_id);
          Object.assign(release, {
            draft: false,
            published_at: "2026-07-15T12:00:00Z",
          });
          return { data: { ...release } };
        },
        uploadReleaseAsset: async ({ data, name }) => {
          state.calls.upload += 1;
          const asset = {
            digest: `sha256:${createHash("sha256").update(data).digest("hex")}`,
            id: 100 + state.calls.upload,
            name,
            size: data.length,
            state: "uploaded",
          };
          state.assets.push(asset);
          return { data: { ...asset } };
        },
      },
    },
  };
  return { github, state };
}

function createFakeRegistry(fixture, overrides = {}) {
  const state = {
    integrity: `sha512-${createHash("sha512").update(fixture.tarball).digest("base64")}`,
    latest: "0.3.1",
    metadataName: manifest.name,
    metadataVersion: manifest.version,
    published: false,
    shasum: createHash("sha1").update(fixture.tarball).digest("hex"),
    tarballBytes: fixture.tarball,
    ...overrides,
  };
  const tarballUrl = "https://registry.npmjs.org/ark-of-atrahasis/-/ark-of-atrahasis-0.4.0.tgz";
  const packageUrl = "https://registry.npmjs.org/ark-of-atrahasis";
  const versionUrl = `${packageUrl}/0.4.0`;
  const fetchImplementation = async (input) => {
    const url = String(input);
    if (url === tarballUrl) {
      return {
        arrayBuffer: async () => Uint8Array.from(state.tarballBytes).buffer,
        status: 200,
      };
    }
    if (url === packageUrl) {
      return {
        json: async () => ({ "dist-tags": { latest: state.latest } }),
        status: 200,
      };
    }
    if (url !== versionUrl) return { status: 404 };
    if (!state.published) return { status: 404 };
    return {
      json: async () => ({
        dist: {
          integrity: state.integrity,
          shasum: state.shasum,
          tarball: tarballUrl,
        },
        name: state.metadataName,
        version: state.metadataVersion,
      }),
      status: 200,
    };
  };
  return { fetchImplementation, state };
}

function githubRecoveryOptions(fixture, fake, registryState = "missing") {
  return {
    artifactBase: fixture.artifactBase,
    artifactsDirectory: fixture.directory,
    commitSha: "release-commit",
    github: fake.github,
    owner: "Vantrongs",
    registryState,
    repo: "ark-of-atrahasis",
    tag: "v0.4.0",
  };
}

function npmRecoveryOptions(fixture, registry, releaseState) {
  return {
    attempts: 2,
    delayImplementation: (callback) => callback(),
    fetchImplementation: registry.fetchImplementation,
    name: manifest.name,
    releaseState,
    tarballPath: fixture.tarballPath,
    verifyProvenanceImplementation: async () => {},
    version: manifest.version,
  };
}

function createProvenanceAudit(fixture) {
  const repository = "https://github.com/Vantrongs/ark-of-atrahasis";
  const ref = "refs/tags/v0.4.0";
  const statement = {
    _type: "https://in-toto.io/Statement/v1",
    predicate: {
      buildDefinition: {
        buildType: "https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1",
        externalParameters: {
          workflow: {
            path: ".github/workflows/release.yml",
            ref,
            repository,
          },
        },
        internalParameters: { github: { event_name: "push" } },
        resolvedDependencies: [
          {
            digest: { gitCommit: "a".repeat(40) },
            uri: `git+${repository}@${ref}`,
          },
        ],
      },
      runDetails: {
        builder: { id: "https://github.com/actions/runner/github-hosted" },
        metadata: { invocationId: `${repository}/actions/runs/123/attempts/1` },
      },
    },
    predicateType: "https://slsa.dev/provenance/v1",
    subject: [
      {
        digest: {
          sha512: createHash("sha512").update(fixture.tarball).digest("hex"),
        },
        name: `pkg:npm/${manifest.name}@${manifest.version}`,
      },
    ],
  };
  const attestation = {
    bundle: {
      dsseEnvelope: {
        payload: Buffer.from(JSON.stringify(statement)).toString("base64"),
      },
    },
    predicateType: "https://slsa.dev/provenance/v1",
  };
  return {
    auditResult: {
      invalid: [],
      missing: [],
      verified: [
        {
          attestationBundles: [attestation],
          attestations: {
            provenance: { predicateType: "https://slsa.dev/provenance/v1" },
          },
          name: manifest.name,
          version: manifest.version,
        },
      ],
    },
    commitSha: "a".repeat(40),
    name: manifest.name,
    ref,
    repository,
    statement,
    tarballPath: fixture.tarballPath,
    version: manifest.version,
    workflowPath: ".github/workflows/release.yml",
  };
}

test("release metadata binds the tag to a dated changelog version", () => {
  assert.doesNotThrow(() => verifyReleaseMetadata({ changelog, manifest, tag: "v0.4.0" }));
  assert.throws(
    () =>
      verifyReleaseMetadata({
        changelog,
        manifest: { ...manifest, name: "unexpected-package" },
        tag: "v0.4.0",
      }),
    /package name must remain ark-of-atrahasis/u,
  );
  assert.throws(
    () => verifyReleaseMetadata({
      changelog: "## [Unreleased]\n\n## [0.4.0] - 2026-02-29\n",
      manifest,
      tag: "v0.4.0",
    }),
    /invalid ISO date/u,
  );
  assert.throws(
    () => verifyReleaseMetadata({ changelog, manifest, tag: "v0.4.1" }),
    /does not match package version/u,
  );
  assert.throws(
    () =>
      verifyReleaseMetadata({
        changelog: "## [Unreleased]\n",
        manifest,
        tag: "v0.4.0",
      }),
    /no dated 0\.4\.0 release heading/u,
  );
  assert.throws(
    () =>
      verifyReleaseMetadata({
        changelog: "## [0.4.0-rc.1] - 2026-07-10\n",
        manifest: { ...manifest, version: "0.4.0-rc.1" },
        tag: "v0.4.0-rc.1",
      }),
    /must be a stable release version/u,
  );
  assert.throws(
    () =>
      verifyReleaseMetadata({
        changelog:
          "## [Unreleased]\n\n### Added\n\n- Release-bound change.\n\n## [0.4.0] - 2026-07-15\n",
        manifest,
        tag: "v0.4.0",
      }),
    /unpromoted content above the 0\.4\.0 release heading/u,
  );
  assert.throws(
    () =>
      verifyReleaseMetadata({
        changelog: "## [0.4.0] - 2026-07-15\n\n## [Unreleased]\n",
        manifest,
        tag: "v0.4.0",
      }),
    /Unreleased heading immediately before the 0\.4\.0 release heading/u,
  );
  assert.throws(
    () =>
      verifyReleaseMetadata({
        changelog:
          "## [Unreleased]\n\n## [0.4.0] - 2026-07-15\n\n## [0.4.0] - 2026-07-16\n",
        manifest,
        tag: "v0.4.0",
      }),
    /exactly one dated 0\.4\.0 release heading/u,
  );
  assert.throws(
    () =>
      verifyReleaseMetadata({
        changelog:
          "## [Unreleased]\n\n## [0.4.0] - 2026-07-15\n\n## [Unreleased]\n\n- Unpromoted duplicate section.\n",
        manifest,
        tag: "v0.4.0",
      }),
    /exactly one Unreleased heading/u,
  );
});

test("release metadata in the repository is synchronized at 1.0.0", () => {
  const sourceManifest = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  );
  const shrinkwrap = JSON.parse(
    readFileSync(new URL("../npm-shrinkwrap.json", import.meta.url), "utf8"),
  );
  const sourceChangelog = readFileSync(new URL("../CHANGELOG.md", import.meta.url), "utf8");
  const releaseGuide = readFileSync(new URL("../RELEASING.md", import.meta.url), "utf8");

  assert.equal(sourceManifest.version, "1.0.0");
  assert.equal(shrinkwrap.version, sourceManifest.version);
  assert.equal(shrinkwrap.packages[""].version, sourceManifest.version);
  assert.equal(
    releaseGuide.includes(
      `The repository contains the \`${sourceManifest.version}\` ESNext/Node 26 source state.`,
    ),
    true,
  );
  assert.doesNotThrow(() =>
    verifyReleaseMetadata({
      changelog: sourceChangelog,
      manifest: sourceManifest,
      tag: "v1.0.0",
    }),
  );
});

test("one pure stable-version contract parses, compares, and enforces latest advancement", () => {
  assert.deepEqual(parseStableVersion("0.4.0"), [0n, 4n, 0n]);
  assert.equal(compareStableVersions("0.4.0", "0.3.99"), 1);
  assert.equal(compareStableVersions("1.0.0", "1.0.0"), 0);
  assert.equal(compareStableVersions("1.0.0", "2.0.0"), -1);
  assert.doesNotThrow(() =>
    assertVersionAdvancesLatest({
      latest: "0.3.1",
      name: "ark-of-atrahasis",
      version: "0.4.0",
    }),
  );
  for (const invalid of ["0.4", "v0.4.0", "0.4.0-rc.1", "01.4.0", "0.4.0.0"]) {
    assert.throws(() => parseStableVersion(invalid), /stable release version/u);
  }
  assert.throws(
    () =>
      assertVersionAdvancesLatest({
        latest: "0.4.0",
        name: "ark-of-atrahasis",
        version: "0.4.0",
      }),
    /would not advance/u,
  );
});

test("README fences are structurally classified so executable drift cannot be skipped", () => {
  const sourceReadme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
  const fences = extractReadmeFences(sourceReadme);
  const executable = fences.filter((fence) => fence.executable);

  assert.equal(fences.length, 1);
  assert.equal(executable.length, 1);
  assert.equal(executable[0].language, "js");
  assert.match(executable[0].code, /createSafeDocument\(root/u);
  assert.doesNotMatch(executable[0].code, /npm run check/u);

  const classified = extractReadmeFences(
    "```js\nconsole.log('run');\n```\n\n```sh\nnpm test\n```\n\n```text\nreference\n```\n",
  );
  assert.deepEqual(
    classified.map(({ executable: isExecutable, language }) => ({
      executable: isExecutable,
      language,
    })),
    [
      { executable: true, language: "js" },
      { executable: true, language: "sh" },
      { executable: false, language: "text" },
    ],
  );
  const commonMarkForms = extractReadmeFences(
    "  ~~~javascript\nconsole.log('tilde');\n ~~~\n\n````js\nconsole.log('long');\n```\n````\n",
  );
  assert.deepEqual(
    commonMarkForms.map(({ code, executable: isExecutable, language }) => ({
      code,
      executable: isExecutable,
      language,
    })),
    [
      { code: "console.log('tilde');\n", executable: true, language: "javascript" },
      { code: "console.log('long');\n```\n", executable: true, language: "js" },
    ],
  );
  assert.throws(() => extractReadmeFences("```js\nunclosed\n"), /unclosed README fence/u);
});

test("annotated release tags must resolve to the checked-out HEAD", () => {
  const repository = mkdtempSync(join(tmpdir(), "ark-release-tag-test-"));
  const git = (...args) =>
    execFileSync("git", args, {
      cwd: repository,
      encoding: "utf8",
      stdio: "pipe",
    });

  try {
    git("init", "--quiet");
    git("config", "user.email", "release-test@example.invalid");
    git("config", "user.name", "Release Test");
    writeFileSync(join(repository, "release.txt"), "first\n");
    git("add", "release.txt");
    git("commit", "--quiet", "-m", "first");
    git("tag", "--annotate", "v0.4.0", "--message", "0.4.0");
    git("tag", "v0.4.1");

    assert.doesNotThrow(() => verifyAnnotatedTagAtHead("v0.4.0", repository));
    assert.throws(
      () => verifyAnnotatedTagAtHead("v0.4.1", repository),
      /must be an annotated tag/u,
    );

    writeFileSync(join(repository, "release.txt"), "second\n");
    git("add", "release.txt");
    git("commit", "--quiet", "-m", "second");
    assert.throws(
      () => verifyAnnotatedTagAtHead("v0.4.0", repository),
      /does not resolve to checked-out HEAD/u,
    );
  } finally {
    rmSync(repository, { force: true, recursive: true });
  }
});

test("registry preflight distinguishes a new version from a recoverable publication", async () => {
  let rejectedRequestCount = 0;
  const rejectedRequest = async () => {
    rejectedRequestCount += 1;
    return { status: 500 };
  };
  await assert.rejects(
    inspectVersionForRelease("unexpected-package", manifest.version, rejectedRequest),
    /package name must remain ark-of-atrahasis/u,
  );
  await assert.rejects(
    inspectVersionForRelease(manifest.name, "0.4.0/private-data", rejectedRequest),
    /must be a stable release version/u,
  );
  assert.equal(rejectedRequestCount, 0);

  const unpublishedNextVersion = async (url) =>
    url.endsWith("/0.4.0")
      ? { status: 404 }
      : {
          json: async () => ({ "dist-tags": { latest: "0.3.1" } }),
          status: 200,
        };
  assert.equal(
    await inspectVersionForRelease(manifest.name, manifest.version, unpublishedNextVersion),
    "unpublished",
  );
  assert.equal(
    await inspectVersionForRelease(manifest.name, manifest.version, async () => ({
      json: async () => ({
        dist: {
          integrity: `sha512-${"A".repeat(86)}==`,
          shasum: "a".repeat(40),
          tarball: "https://registry.npmjs.org/ark-of-atrahasis/-/ark-of-atrahasis-0.4.0.tgz",
        },
        name: manifest.name,
        version: manifest.version,
      }),
      status: 200,
    })),
    "published",
  );
  await assert.rejects(
    inspectVersionForRelease(manifest.name, manifest.version, async () => ({
      status: 503,
    })),
    /unexpected HTTP 503/u,
  );
  await assert.rejects(
    inspectVersionForRelease(manifest.name, "0.3.0", async (url) =>
      url.endsWith("/0.3.0")
        ? { status: 404 }
        : {
            json: async () => ({ "dist-tags": { latest: "0.3.1" } }),
            status: 200,
          },
    ),
    /would not advance/u,
  );
});

test("first release run publishes once and an exact completed rerun is a no-op", async () => {
  const fixture = createRecoveryFixture();
  const fake = createFakeGitHub();
  const registry = createFakeRegistry(fixture);
  let publicationCalls = 0;
  const publishImplementation = async () => {
    publicationCalls += 1;
    registry.state.published = true;
  };

  try {
    const prepared = await prepareGitHubRelease(githubRecoveryOptions(fixture, fake));
    assert.equal(prepared.state, "draft");
    assert.deepEqual(fake.state.calls, { create: 1, delete: 0, update: 0, upload: 3 });

    const npmResult = await publishOrResumeNpm({
      ...npmRecoveryOptions(fixture, registry, prepared.state),
      publishImplementation,
    });
    assert.deepEqual(npmResult, { published: true });
    const finalized = await finalizeGitHubRelease(githubRecoveryOptions(fixture, fake));
    assert.equal(finalized.state, "published");

    const rerun = await prepareGitHubRelease(
      githubRecoveryOptions(fixture, fake, "matching"),
    );
    assert.equal(rerun.state, "published");
    const rerunNpm = await publishOrResumeNpm({
      ...npmRecoveryOptions(fixture, registry, rerun.state),
      publishImplementation,
    });
    assert.deepEqual(rerunNpm, { published: false });
    await finalizeGitHubRelease(githubRecoveryOptions(fixture, fake));

    assert.equal(publicationCalls, 1);
    assert.deepEqual(fake.state.calls, { create: 1, delete: 0, update: 1, upload: 3 });
  } finally {
    rmSync(fixture.directory, { force: true, recursive: true });
  }
});

test("a failure after npm publication resumes the matching draft without republishing", async () => {
  const fixture = createRecoveryFixture();
  const fake = createFakeGitHub({
    assets: fixture.artifacts,
    releases: [draftRelease()],
  });
  const registry = createFakeRegistry(fixture, { published: true });
  let publicationCalls = 0;

  try {
    const prepared = await prepareGitHubRelease(
      githubRecoveryOptions(fixture, fake, "matching"),
    );
    const result = await publishOrResumeNpm({
      ...npmRecoveryOptions(fixture, registry, prepared.state),
      publishImplementation: async () => {
        publicationCalls += 1;
      },
    });
    assert.deepEqual(result, { published: false });
    await finalizeGitHubRelease(githubRecoveryOptions(fixture, fake));

    assert.equal(publicationCalls, 0);
    assert.deepEqual(fake.state.calls, { create: 0, delete: 0, update: 1, upload: 0 });
    assert.equal(fake.state.releases[0].draft, false);
  } finally {
    rmSync(fixture.directory, { force: true, recursive: true });
  }
});

test("an interrupted asset upload resumes only the missing exact assets", async () => {
  const fixture = createRecoveryFixture();
  const fake = createFakeGitHub({
    assets: fixture.artifacts.slice(0, 1),
    releases: [draftRelease()],
  });

  try {
    const prepared = await prepareGitHubRelease(githubRecoveryOptions(fixture, fake));
    assert.equal(prepared.state, "draft");
    assert.deepEqual(fake.state.calls, { create: 0, delete: 0, update: 0, upload: 2 });
    assert.deepEqual(
      fake.state.assets.map((asset) => asset.name).sort(),
      fixture.artifacts.map((asset) => asset.name).sort(),
    );
  } finally {
    rmSync(fixture.directory, { force: true, recursive: true });
  }
});

test("a draft release replaces only an expected empty starter asset", async () => {
  const fixture = createRecoveryFixture();
  const fake = createFakeGitHub({
    assets: [
      {
        ...fixture.artifacts[0],
        digest: null,
        size: 0,
        state: "starter",
      },
    ],
    releases: [draftRelease()],
  });

  try {
    const prepared = await prepareGitHubRelease(githubRecoveryOptions(fixture, fake));
    assert.equal(prepared.state, "draft");
    assert.deepEqual(fake.state.calls, { create: 0, delete: 1, update: 0, upload: 3 });
    assert.deepEqual(
      fake.state.assets.map((asset) => asset.name).sort(),
      fixture.artifacts.map((asset) => asset.name).sort(),
    );
  } finally {
    rmSync(fixture.directory, { force: true, recursive: true });
  }
});

test("GitHub recovery rejects conflicting tag, draft, asset, and published states", async (t) => {
  await t.test("tag commit", async () => {
    const fixture = createRecoveryFixture();
    const fake = createFakeGitHub({ commitSha: "other-commit" });
    try {
      await assert.rejects(
        prepareGitHubRelease(githubRecoveryOptions(fixture, fake)),
        /does not resolve to workflow commit/u,
      );
      assert.deepEqual(fake.state.calls, { create: 0, delete: 0, update: 0, upload: 0 });
    } finally {
      rmSync(fixture.directory, { force: true, recursive: true });
    }
  });

  await t.test("draft metadata", async () => {
    const fixture = createRecoveryFixture();
    const fake = createFakeGitHub({
      releases: [draftRelease({ name: "other" })],
    });
    try {
      await assert.rejects(
        prepareGitHubRelease(githubRecoveryOptions(fixture, fake)),
        /metadata does not exactly match/u,
      );
      assert.deepEqual(fake.state.calls, { create: 0, delete: 0, update: 0, upload: 0 });
    } finally {
      rmSync(fixture.directory, { force: true, recursive: true });
    }
  });

  await t.test("npm publication without a draft", async () => {
    const fixture = createRecoveryFixture();
    const fake = createFakeGitHub();
    try {
      await assert.rejects(
        prepareGitHubRelease(githubRecoveryOptions(fixture, fake, "matching")),
        /without a GitHub release draft to recover/u,
      );
      assert.deepEqual(fake.state.calls, { create: 0, delete: 0, update: 0, upload: 0 });
    } finally {
      rmSync(fixture.directory, { force: true, recursive: true });
    }
  });

  await t.test("asset digest", async () => {
    const fixture = createRecoveryFixture();
    const fake = createFakeGitHub({
      assets: [{ ...fixture.artifacts[0], digest: `sha256:${"0".repeat(64)}` }],
      releases: [draftRelease()],
    });
    try {
      await assert.rejects(
        prepareGitHubRelease(githubRecoveryOptions(fixture, fake)),
        /does not match the verified artifact/u,
      );
      assert.deepEqual(fake.state.calls, { create: 0, delete: 0, update: 0, upload: 0 });
    } finally {
      rmSync(fixture.directory, { force: true, recursive: true });
    }
  });

  await t.test("non-empty starter asset", async () => {
    const fixture = createRecoveryFixture();
    const fake = createFakeGitHub({
      assets: [
        {
          ...fixture.artifacts[0],
          digest: null,
          size: 0,
          state: "starter",
        },
        { ...fixture.artifacts[1], digest: null, state: "starter" },
      ],
      releases: [draftRelease()],
    });
    try {
      await assert.rejects(
        prepareGitHubRelease(githubRecoveryOptions(fixture, fake)),
        /conflicting starter asset/u,
      );
      assert.deepEqual(fake.state.calls, { create: 0, delete: 0, update: 0, upload: 0 });
    } finally {
      rmSync(fixture.directory, { force: true, recursive: true });
    }
  });

  await t.test("published release without npm", async () => {
    const fixture = createRecoveryFixture();
    const registry = createFakeRegistry(fixture);
    let publicationCalls = 0;
    try {
      await assert.rejects(
        publishOrResumeNpm({
          ...npmRecoveryOptions(fixture, registry, "published"),
          publishImplementation: async () => {
            publicationCalls += 1;
          },
        }),
        /has no matching npm publication/u,
      );
      assert.equal(publicationCalls, 0);
    } finally {
      rmSync(fixture.directory, { force: true, recursive: true });
    }
  });
});

test("npm recovery requires exact verified trusted-publish provenance", async (t) => {
  await t.test("accepts the exact signed workflow identity", () => {
    const fixture = createRecoveryFixture();
    try {
      assert.doesNotThrow(() => assertNpmProvenance(createProvenanceAudit(fixture)));
    } finally {
      rmSync(fixture.directory, { force: true, recursive: true });
    }
  });

  await t.test("rejects a missing provenance result before publication recovery", async () => {
    const fixture = createRecoveryFixture();
    const registry = createFakeRegistry(fixture, { published: true });
    const provenance = createProvenanceAudit(fixture);
    provenance.auditResult.verified = [];
    let publicationCalls = 0;
    try {
      await assert.rejects(
        publishOrResumeNpm({
          ...npmRecoveryOptions(fixture, registry, "draft"),
          publishImplementation: async () => {
            publicationCalls += 1;
          },
          verifyProvenanceImplementation: async () => {
            assertNpmProvenance(provenance);
          },
        }),
        /has no unique result/u,
      );
      assert.equal(publicationCalls, 0);
    } finally {
      rmSync(fixture.directory, { force: true, recursive: true });
    }
  });

  await t.test("rejects a provenance statement for another commit", () => {
    const fixture = createRecoveryFixture();
    const provenance = createProvenanceAudit(fixture);
    provenance.statement.predicate.buildDefinition.resolvedDependencies[0].digest.gitCommit =
      "b".repeat(40);
    provenance.auditResult.verified[0].attestationBundles[0].bundle.dsseEnvelope.payload =
      Buffer.from(JSON.stringify(provenance.statement)).toString("base64");
    try {
      assert.throws(
        () => assertNpmProvenance(provenance),
        /identity does not match the release workflow commit/u,
      );
    } finally {
      rmSync(fixture.directory, { force: true, recursive: true });
    }
  });

  await t.test("verifies provenance after a new publication becomes visible", async () => {
    const fixture = createRecoveryFixture();
    const registry = createFakeRegistry(fixture);
    let provenanceCalls = 0;
    try {
      const result = await publishOrResumeNpm({
        ...npmRecoveryOptions(fixture, registry, "draft"),
        publishImplementation: async () => {
          registry.state.published = true;
        },
        verifyProvenanceImplementation: async () => {
          provenanceCalls += 1;
        },
      });
      assert.deepEqual(result, { published: true });
      assert.equal(provenanceCalls, 1);
    } finally {
      rmSync(fixture.directory, { force: true, recursive: true });
    }
  });
});

test("npm recovery rejects conflicting version, digest, and tarball bytes", async (t) => {
  for (const [name, overrides, pattern] of [
    ["version", { metadataVersion: "0.4.1", published: true }, /metadata does not match/u],
    ["integrity", { integrity: "sha512-conflict", published: true }, /digest does not match/u],
    ["bytes", { published: true, tarballBytes: Buffer.from("different") }, /bytes do not match/u],
  ]) {
    await t.test(name, async () => {
      const fixture = createRecoveryFixture();
      const registry = createFakeRegistry(fixture, overrides);
      try {
        await assert.rejects(
          inspectRegistryTarball({
            fetchImplementation: registry.fetchImplementation,
            name: manifest.name,
            tarballPath: fixture.tarballPath,
            version: manifest.version,
          }),
          pattern,
        );
      } finally {
        rmSync(fixture.directory, { force: true, recursive: true });
      }
    });
  }

  await t.test("non-advancing new version", async () => {
    const fixture = createRecoveryFixture();
    const registry = createFakeRegistry(fixture, { latest: "0.4.1" });
    let publicationCalls = 0;
    try {
      await assert.rejects(
        publishOrResumeNpm({
          ...npmRecoveryOptions(fixture, registry, "draft"),
          publishImplementation: async () => {
            publicationCalls += 1;
          },
        }),
        /would not advance/u,
      );
      assert.equal(publicationCalls, 0);
    } finally {
      rmSync(fixture.directory, { force: true, recursive: true });
    }
  });
});

test("release workflow pins the exact no-cache Node and npm toolchain", () => {
  assert.match(releaseWorkflow, /push:\n {4}tags:\n {6}- "v\*\.\*\.\*"/u);
  assert.match(
    releaseWorkflow,
    /concurrency:\n {2}group: release\n {2}cancel-in-progress: false/u,
  );
  assert.equal((releaseWorkflow.match(/node-version-file: \.node-version/gu) ?? []).length, 1);
  assert.equal(
    (releaseWorkflow.match(/node-version: \$\{\{ needs\.verify\.outputs\.node-version \}\}/gu) ?? [])
      .length,
    1,
  );
  assert.match(
    releaseWorkflow,
    /outputs:\n {6}node-version: \$\{\{ steps\.toolchain\.outputs\.node-version \}\}/u,
  );
  assert.doesNotMatch(releaseWorkflow, /node-version: 26\.5\.0/u);
  assert.equal((releaseWorkflow.match(/npm@11\.18\.0/gu) ?? []).length, 2);
  assert.equal((releaseWorkflow.match(/package-manager-cache: false/gu) ?? []).length, 2);
  assert.doesNotMatch(releaseWorkflow, /^\s+cache:/mu);
  const installBrowsersIndex = releaseWorkflow.indexOf(
    "node node_modules/@playwright/test/cli.js install --with-deps chromium firefox webkit",
  );
  const checkIndex = releaseWorkflow.indexOf('node "$NPM_CLI" run check');
  const signatureIndex = releaseWorkflow.indexOf('node "$NPM_CLI" run audit:signatures');
  const packIndex = releaseWorkflow.indexOf('node "$NPM_CLI" run pack:verified');
  assert.ok(installBrowsersIndex > 0);
  assert.ok(installBrowsersIndex < checkIndex);
  assert.ok(checkIndex < signatureIndex);
  assert.ok(signatureIndex < packIndex);

  const expectedActionPins = new Map([
    ["actions/checkout", "9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0"],
    ["actions/setup-node", "820762786026740c76f36085b0efc47a31fe5020"],
    ["actions/upload-artifact", "043fb46d1a93c77aae656e7c1c64a875d1fc6a0a"],
    ["actions/download-artifact", "3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c"],
    ["actions/github-script", "3a2844b7e9c422d3c10d287c895573f7108da1b3"],
  ]);
  const actionUses = [...releaseWorkflow.matchAll(/^\s+uses: ([^@\s]+)@([^\s]+)/gmu)];

  assert.ok(actionUses.length > 0);
  for (const [, action, revision] of actionUses) {
    assert.match(revision, /^[0-9a-f]{40}$/u);
    assert.equal(revision, expectedActionPins.get(action), `unexpected pin for ${action}`);
  }
  assert.deepEqual(
    new Set(actionUses.map(([, action]) => action)),
    new Set(expectedActionPins.keys()),
  );
});

test("check workflow revalidates base edits without package-manager cache duplication", () => {
  assert.deepEqual(parsedCheckWorkflow.on, {
    pull_request: {
      types: ["opened", "synchronize", "reopened", "edited"],
    },
    push: { branches: ["main"] },
  });
  const checkJob = parsedCheckWorkflow.jobs.check;
  assert.equal(
    checkJob.if,
    "github.event_name != 'pull_request' || github.event.action != 'edited' || github.event.changes.base.ref.from != ''",
  );
  const checkSteps = Object.fromEntries(checkJob.steps.map((step) => [step.name, step]));
  assert.deepEqual(checkSteps["Set up Node.js without a package-manager cache"].with, {
    "node-version-file": ".node-version",
    "package-manager-cache": false,
  });
  assert.deepEqual(checkSteps["Verify registry signatures and attestations"], {
    if: "github.event_name == 'push'",
    name: "Verify registry signatures and attestations",
    run: 'node "$NPM_CLI" run audit:signatures',
  });
});

test("security workflow blocks vulnerable dependency changes and audits registry trust", () => {
  assert.deepEqual(Object.keys(securityWorkflow).sort(), [
    "concurrency",
    "jobs",
    "name",
    "on",
    "permissions",
  ]);
  assert.equal(securityWorkflow.name, "security");
  assert.deepEqual(
    securityWorkflow.on,
    {
      pull_request: {
        types: ["opened", "synchronize", "reopened", "edited"],
      },
      schedule: [{ cron: "0 6 * * 1" }],
      workflow_dispatch: null,
    },
  );
  assert.deepEqual(securityWorkflow.permissions, { contents: "read" });
  assert.deepEqual(securityWorkflow.concurrency, {
    group: "security-$" + "{{ github.event.pull_request.number || github.ref }}",
    "cancel-in-progress": true,
  });
  assert.deepEqual(Object.keys(securityWorkflow.jobs).sort(), [
    "dependency-review",
    "registry-audit",
  ]);

  const dependencyReview = securityWorkflow.jobs["dependency-review"];
  assert.deepEqual(Object.keys(dependencyReview).sort(), [
    "if",
    "runs-on",
    "steps",
    "timeout-minutes",
  ]);
  assert.equal(
    dependencyReview.if,
    "github.event_name == 'pull_request' && (github.event.action != 'edited' || github.event.changes.base.ref.from != '')",
  );
  assert.equal(dependencyReview["runs-on"], "ubuntu-24.04");
  assert.equal(dependencyReview["timeout-minutes"], 10);
  assert.deepEqual(dependencyReview.steps, [
    {
      name: "Check out the pull request",
      uses: "actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0",
      with: { "persist-credentials": false },
    },
    {
      name: "Review dependency changes",
      uses: "actions/dependency-review-action@a1d282b36b6f3519aa1f3fc636f609c47dddb294",
      with: {
        "fail-on-severity": "low",
        "fail-on-scopes": "runtime, development, unknown",
        "license-check": false,
        "show-patched-versions": true,
        "vulnerability-check": true,
      },
    },
  ]);

  const registryAudit = securityWorkflow.jobs["registry-audit"];
  assert.deepEqual(Object.keys(registryAudit).sort(), [
    "if",
    "runs-on",
    "steps",
    "timeout-minutes",
  ]);
  assert.equal(
    registryAudit.if,
    "github.event_name == 'schedule' || github.event_name == 'workflow_dispatch'",
  );
  assert.equal(registryAudit["runs-on"], "ubuntu-24.04");
  assert.equal(registryAudit["timeout-minutes"], 15);
  assert.deepEqual(
    registryAudit.steps.map((step) => step.name),
    [
      "Check out the audited commit",
      "Set up Node.js",
      "Install the pinned npm CLI without replacing the runner npm",
      "Verify toolchain versions",
      "Install frozen dependencies",
      "Reject known vulnerabilities",
      "Verify registry signatures and attestations",
    ],
  );
  const registrySteps = Object.fromEntries(registryAudit.steps.map((step) => [step.name, step]));
  assert.deepEqual(registrySteps["Check out the audited commit"], {
    name: "Check out the audited commit",
    uses: "actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0",
    with: { "persist-credentials": false },
  });
  assert.deepEqual(registrySteps["Set up Node.js"], {
    name: "Set up Node.js",
    uses: "actions/setup-node@820762786026740c76f36085b0efc47a31fe5020",
    with: {
      "node-version-file": ".node-version",
      "package-manager-cache": false,
    },
  });
  assert.equal(
    registrySteps["Install the pinned npm CLI without replacing the runner npm"].run.trim(),
    [
      'mkdir -p "$RUNNER_TEMP/npm-cli"',
      'npm install --prefix "$RUNNER_TEMP/npm-cli" npm@11.18.0 \\',
      "  --ignore-scripts --no-audit --no-fund --no-package-lock",
      'echo "NPM_CLI=$RUNNER_TEMP/npm-cli/node_modules/npm/bin/npm-cli.js" >> "$GITHUB_ENV"',
      'echo "$RUNNER_TEMP/npm-cli/node_modules/.bin" >> "$GITHUB_PATH"',
    ].join("\n"),
  );
  assert.equal(
    registrySteps["Verify toolchain versions"].run.trim(),
    [
      'test "$(node --version)" = "v$(tr -d \'\\r\\n\' < .node-version)"',
      'test "$(node "$NPM_CLI" --version)" = "11.18.0"',
    ].join("\n"),
  );
  assert.equal(
    registrySteps["Install frozen dependencies"].run,
    'node "$NPM_CLI" ci --ignore-scripts --no-audit --no-fund',
  );
  assert.equal(
    registrySteps["Reject known vulnerabilities"].run,
    'node "$NPM_CLI" audit --audit-level=low',
  );
  assert.equal(
    registrySteps["Verify registry signatures and attestations"].run,
    'node "$NPM_CLI" run audit:signatures',
  );
});

test("repository toolchain targets Node 26.5 and rolling TC39 ESNext consistently", () => {
  assert.equal(sourceNodeVersion, "26.5.0");
  assert.equal(sourceManifest.engines?.node, `>=${sourceNodeVersion}`);
  assert.equal(sourceManifest.packageManager, "npm@11.18.0");
  assert.equal(sourceManifest.devDependencies?.["@biomejs/biome"], "2.5.4");
  assert.equal(sourceManifest.devDependencies?.fallow, "3.6.0");
  assert.equal(sourceManifest.devDependencies?.tsdown, "0.22.8");
  assert.equal(sourceManifest.devDependencies?.vitest, "4.1.10");
  assert.deepEqual(sourceTsconfig.compilerOptions?.lib, ["ESNext", "DOM"]);
  assert.equal(sourceTsconfig.compilerOptions?.target, "ESNext");
  assert.equal(sourceTsconfig.compilerOptions?.strict, true);
  assert.equal(sourceTsconfig.compilerOptions?.exactOptionalPropertyTypes, true);
  assert.equal(sourceTsconfig.compilerOptions?.noUncheckedIndexedAccess, true);
  assert.equal(sourceTsconfig.compilerOptions?.noPropertyAccessFromIndexSignature, true);
  assert.equal(sourceTsconfig.compilerOptions?.noImplicitReturns, true);
  assert.equal(sourceTsconfig.compilerOptions?.noImplicitOverride, true);
  assert.equal(sourceTsconfig.compilerOptions?.noUncheckedSideEffectImports, true);
  assert.equal(sourceTsconfig.compilerOptions?.erasableSyntaxOnly, true);
  assert.equal(sourceTsconfig.compilerOptions?.skipLibCheck, false);
  assert.equal(sourceToolingTsconfig.compilerOptions?.skipLibCheck, true);
  assert.deepEqual(sourceToolingTsconfig.include, ["tsdown.config.ts"]);
  assert.deepEqual(sourceFallowConfig.entry?.slice(0, 6), [
    "src/index.ts",
    "scripts/fallow-report.mjs",
    "scripts/reject-direct-publish.mjs",
    "scripts/release-recovery.mjs",
    "scripts/test-package.mjs",
    "scripts/verify-release.mjs",
  ]);
  assert.ok(!sourceFallowConfig.ignoreDependencies?.includes("fallow"));
  assert.equal(sourceFallowConfig.rules?.["private-type-leaks"], "warn");
  assert.match(sourceManifest.scripts?.check ?? "", /npm run analyze/u);
  assert.equal(sourceManifest.scripts?.audit, "npm audit --audit-level=low");
  assert.equal(
    sourceManifest.scripts?.["audit:signatures"],
    "npm audit signatures",
  );
  assert.ok(sourceManifest.files?.includes(".github/workflows/security.yml"));
  assert.match(fallowReportSource, /\["dead-code", "--format", "compact"\]/u);
  assert.match(fallowReportSource, /\["dupes", "--format", "compact"\]/u);
  assert.match(fallowReportSource, /runFallow\(\["--version"\]\)/u);
  assert.match(fallowReportSource, /\^verified: yes/u);
  assert.match(fallowReportSource, /hasCompactFinding/u);
  assert.match(fallowReportSource, /result\.status === 1 && result\.stderr === ""/u);
  assert.doesNotMatch(fallowReportSource, /\|\| true|health/u);
  assert.match(sourceTsdownConfig, /dts: \{ sourcemap: true \}/u);
  assert.match(sourceTsdownConfig, /target: "esnext"/u);
  assert.match(sourceTsdownConfig, /outExtensions: \(\) => \(\{ js: "\.js", dts: "\.d\.ts" \}\)/u);
  assert.match(packageGateSource, /const allowedGitHubEntries = new Set/u);
  assert.match(packageGateSource, /entry\.startsWith\("package\/\.git\/"\)/u);
  assert.match(
    packageGateSource,
    /entry\.startsWith\("package\/\.github\/"\) && !allowedGitHubEntries\.has\(entry\)/u,
  );
  assert.equal((checkWorkflow.match(/node-version-file: \.node-version/gu) ?? []).length, 1);
  assert.equal((releaseWorkflow.match(/node-version-file: \.node-version/gu) ?? []).length, 1);
  assert.match(
    checkWorkflow,
    /actions\/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0 # v7\.0\.0/u,
  );
});

test("Node 26.5 exposes the checked ES2026 surface and records its runtime limit", () => {
  assert.equal(process.version, "v26.5.0");
  assert.equal(typeof Temporal, "object");
  assert.equal(typeof Map.prototype.getOrInsert, "function");
  assert.equal(typeof Map.prototype.getOrInsertComputed, "function");
  assert.equal(typeof Iterator.concat, "function");
  assert.equal(typeof Uint8Array.fromBase64, "function");
  assert.equal(typeof Uint8Array.prototype.toBase64, "function");
  assert.equal(typeof Error.isError, "function");
  assert.equal(
    JSON.parse("9007199254740993", (_key, _value, context) => context?.source),
    "9007199254740993",
  );
  assert.equal(typeof Math.sumPrecise, "undefined");
});

test("release workflow isolates write and OIDC authority in the protected job", () => {
  const publishStart = releaseWorkflow.indexOf("\n  publish:\n");
  assert.ok(publishStart > 0);
  const verifyJob = releaseWorkflow.slice(0, publishStart);
  const publishJob = releaseWorkflow.slice(publishStart);

  assert.match(releaseWorkflow, /permissions:\n {2}contents: read/u);
  assert.doesNotMatch(verifyJob, /id-token: write|contents: write|secrets\.|NODE_AUTH_TOKEN/u);
  assert.match(verifyJob, /persist-credentials: false/u);
  assert.match(publishJob, /needs: verify/u);
  assert.match(publishJob, /environment: npm/u);
  assert.match(publishJob, /permissions:\n {6}contents: write\n {6}id-token: write\n {4}steps:/u);
  assert.doesNotMatch(publishJob, /actions\/checkout@/u);
  assert.doesNotMatch(publishJob, /secrets\.|NODE_AUTH_TOKEN|NPM_TOKEN/u);
});

test("release workflow hands off and publishes only the exact verified artifacts", () => {
  const metadataIndex = releaseWorkflow.indexOf(
    'node scripts/verify-release.mjs "$GITHUB_REF_NAME"',
  );
  const checkIndex = releaseWorkflow.indexOf('node "$NPM_CLI" run check');
  const packIndex = releaseWorkflow.indexOf('node "$NPM_CLI" run pack:verified');
  const uploadIndex = releaseWorkflow.indexOf("uses: actions/upload-artifact@");
  const downloadIndex = releaseWorkflow.indexOf("uses: actions/download-artifact@");
  const checksumIndex = releaseWorkflow.indexOf("sha256sum --check --strict");
  const recoveryScriptIndex = releaseWorkflow.indexOf("package/scripts/release-recovery.mjs");
  const stableVersionScriptIndex = releaseWorkflow.indexOf("package/scripts/stable-version.mjs");
  const registryIndex = releaseWorkflow.indexOf("inspect-registry");
  const draftIndex = releaseWorkflow.indexOf("recovery.prepareGitHubRelease");
  const npmPublishIndex = releaseWorkflow.indexOf("publish-or-resume");
  const releaseIndex = releaseWorkflow.indexOf("recovery.finalizeGitHubRelease");

  for (const [name, index] of Object.entries({
    checkIndex,
    checksumIndex,
    downloadIndex,
    draftIndex,
    metadataIndex,
    npmPublishIndex,
    packIndex,
    recoveryScriptIndex,
    stableVersionScriptIndex,
    registryIndex,
    releaseIndex,
    uploadIndex,
  })) {
    assert.notEqual(index, -1, `release workflow is missing ${name}`);
  }

  assert.ok(metadataIndex < checkIndex);
  assert.ok(checkIndex < packIndex);
  assert.ok(packIndex < uploadIndex);
  assert.ok(uploadIndex < downloadIndex);
  assert.ok(downloadIndex < checksumIndex);
  assert.ok(checksumIndex < recoveryScriptIndex);
  assert.ok(checksumIndex < stableVersionScriptIndex);
  assert.ok(recoveryScriptIndex < registryIndex);
  assert.match(
    releaseWorkflow,
    /RELEASE_RECOVERY_SCRIPT=\$RUNNER_TEMP\/release-scripts\/release-recovery\.mjs/u,
  );
  assert.ok(registryIndex < draftIndex);
  assert.ok(draftIndex < npmPublishIndex);
  assert.ok(npmPublishIndex < releaseIndex);
  assert.equal(
    (releaseWorkflow.match(/name: npm-release-\$\{\{ github\.sha \}\}/gu) ?? []).length,
    2,
  );
  assert.match(releaseWorkflow, /if-no-files-found: error/u);
  assert.match(releaseWorkflow, /checksum file must cover exactly two assets/u);
  assert.match(releaseWorkflow, /tarball identity does not match the release tag/u);
  assert.match(releaseWorkflow, /node "\$RELEASE_RECOVERY_SCRIPT" publish-or-resume/u);
  assert.match(releaseRecoverySource, /github\.rest\.repos\.createRelease/u);
  assert.match(releaseRecoverySource, /github\.rest\.repos\.uploadReleaseAsset/u);
  assert.match(releaseRecoverySource, /github\.rest\.repos\.updateRelease/u);
  assert.match(releaseRecoverySource, /"--ignore-scripts"/u);
  assert.match(releaseRecoverySource, /"--provenance"/u);
  assert.match(releaseRecoverySource, /process\.env\.NPM_CLI/u);

  const uploadPaths = releaseWorkflow.match(/path: \|\n((?: {12}\.artifacts\/[^\n]+\n){3})/u);
  const artifactOutput = ["$", "{{ steps.artifacts.outputs.artifact-base }}"].join("");
  assert.ok(uploadPaths);
  assert.deepEqual(
    uploadPaths[1]
      .trim()
      .split("\n")
      .map((line) => line.trim()),
    [
      `.artifacts/${artifactOutput}.tgz`,
      `.artifacts/${artifactOutput}.sbom.cdx.json`,
      `.artifacts/${artifactOutput}.sha256`,
    ],
  );
});
