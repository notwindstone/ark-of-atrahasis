import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const Ajv = require("ajv");
const addFormats = require("ajv-formats");
const cyclonedxLibraryManifest = require("@cyclonedx/cyclonedx-library/package.json");
const { parse: parseSmtpAddress } = require("smtp-address-parser");

export const CYCLONEDX_SPEC_VERSION = "1.7";
export const CYCLONEDX_SCHEMA =
  `http://cyclonedx.org/schema/bom-${CYCLONEDX_SPEC_VERSION}.schema.json`;
export const CYCLONEDX_LIBRARY_VERSION = "10.1.0";

if (cyclonedxLibraryManifest.version !== CYCLONEDX_LIBRARY_VERSION) {
  throw new Error(
    `CycloneDX validator drift: expected ${CYCLONEDX_LIBRARY_VERSION}, received ${cyclonedxLibraryManifest.version}`,
  );
}

const cyclonedxSchemaDirectory = join(
  dirname(require.resolve("@cyclonedx/cyclonedx-library/package.json")),
  "res",
  "schema",
);
const referencedSchemaFiles = Object.freeze({
  "http://cyclonedx.org/schema/cryptography-defs.SNAPSHOT.schema.json":
    "cryptography-defs.SNAPSHOT.schema.json",
  "http://cyclonedx.org/schema/jsf-0.82.SNAPSHOT.schema.json":
    "jsf-0.82.SNAPSHOT.schema.json",
  "http://cyclonedx.org/schema/spdx.SNAPSHOT.schema.json":
    "spdx.SNAPSHOT.schema.json",
});
let releaseSbomValidator;

function readCycloneDxSchema(file) {
  return JSON.parse(readFileSync(join(cyclonedxSchemaDirectory, file), "utf8"));
}

function getReleaseSbomValidator() {
  if (releaseSbomValidator) return releaseSbomValidator;

  const referencedSchemas = Object.fromEntries(
    Object.entries(referencedSchemaFiles).map(([id, file]) => [id, readCycloneDxSchema(file)]),
  );
  const ajv = new Ajv({
    addUsedSchema: false,
    loadSchema: (uri) => {
      throw new Error(`Remote CycloneDX schemas are disabled: ${uri}`);
    },
    schemas: referencedSchemas,
    strict: false,
    strictSchema: false,
    useDefaults: false,
  });
  addFormats(ajv);

  // The removed ajv-formats-draft2019 plugin used smtp-address-parser for
  // idn-email. Keep that RFC 5321 grammar directly so quoted and UTF-8 local
  // parts retain their previous meaning without loading the plugin's deprecated
  // node:punycode-backed idn-hostname format.
  ajv.addFormat("iri-reference", true);
  ajv.addFormat("idn-email", {
    type: "string",
    validate: (value) => {
      try {
        parseSmtpAddress(value);
        return true;
      } catch {
        return false;
      }
    },
  });

  releaseSbomValidator = ajv.compile(
    readCycloneDxSchema(`bom-${CYCLONEDX_SPEC_VERSION}.SNAPSHOT.schema.json`),
  );
  return releaseSbomValidator;
}

function requireNonEmptyString(value, name) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }
  return value;
}

function requireSha256(value) {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/u.test(value)) {
    throw new Error("tarballSha256 must be a lowercase SHA-256 digest");
  }
  return value;
}

function validateDependencyGraph(sbom, rootRef) {
  const componentRefs = new Set([rootRef]);
  for (const component of sbom.components) {
    const ref = component?.["bom-ref"];
    if (typeof ref !== "string" || ref.length === 0 || componentRefs.has(ref)) {
      throw new Error("CycloneDX components must have unique non-empty bom-ref values");
    }
    componentRefs.add(ref);
  }

  const dependencyRefs = new Set();
  for (const dependency of sbom.dependencies) {
    const ref = dependency?.ref;
    if (
      typeof ref !== "string"
      || !componentRefs.has(ref)
      || dependencyRefs.has(ref)
      || !Array.isArray(dependency.dependsOn)
      || dependency.dependsOn.some((childRef) => !componentRefs.has(childRef))
    ) {
      throw new Error("CycloneDX dependency references must be unique and graph-closed");
    }
    dependencyRefs.add(ref);
  }
  if (dependencyRefs.size !== componentRefs.size) {
    throw new Error("CycloneDX dependency graph must describe the root and every component");
  }
}

export function collectShrinkwrapComponentInventory(shrinkwrap) {
  if (
    shrinkwrap === null
    || typeof shrinkwrap !== "object"
    || Array.isArray(shrinkwrap)
    || shrinkwrap.packages === null
    || typeof shrinkwrap.packages !== "object"
    || Array.isArray(shrinkwrap.packages)
  ) {
    throw new Error("npm shrinkwrap must contain a packages object");
  }

  const identities = new Set();
  for (const [installedPath, packageEntry] of Object.entries(shrinkwrap.packages)) {
    if (installedPath === "" || packageEntry?.link === true) continue;
    if (packageEntry === null || typeof packageEntry !== "object" || Array.isArray(packageEntry)) {
      throw new Error(`npm shrinkwrap package entry is invalid: ${installedPath}`);
    }

    const marker = "node_modules/";
    const markerIndex = installedPath.lastIndexOf(marker);
    const installedName = markerIndex === -1
      ? ""
      : installedPath.slice(markerIndex + marker.length);
    const nameParts = installedName.split("/");
    const validInstalledName = installedName.startsWith("@")
      ? nameParts.length === 2 && nameParts.every((part) => part.length > 0)
      : nameParts.length === 1 && nameParts[0]?.length > 0;
    if (!validInstalledName) {
      throw new Error(`npm shrinkwrap package path has no installed package name: ${installedPath}`);
    }
    const version = requireNonEmptyString(packageEntry.version, `shrinkwrap ${installedPath} version`);
    identities.add(`${installedName}@${version}`);
  }
  return [...identities].sort();
}

export function validateReleaseSbomInventory(sbom, shrinkwrap) {
  if (sbom === null || typeof sbom !== "object" || !Array.isArray(sbom.components)) {
    throw new Error("CycloneDX SBOM must contain a component array");
  }
  const expected = collectShrinkwrapComponentInventory(shrinkwrap);
  const actual = sbom.components.map((component, index) => {
    if (component === null || typeof component !== "object" || Array.isArray(component)) {
      throw new Error(`CycloneDX component is invalid at index ${index}`);
    }
    const name = requireNonEmptyString(component.name, `CycloneDX component ${index} name`);
    const version = requireNonEmptyString(component.version, `CycloneDX component ${index} version`);
    return `${name}@${version}`;
  });
  const actualSet = new Set(actual);
  if (actualSet.size !== actual.length) {
    throw new Error("CycloneDX components must have unique installed-name/version identities");
  }

  const expectedSet = new Set(expected);
  const missing = expected.filter((identity) => !actualSet.has(identity));
  const unexpected = actual.filter((identity) => !expectedSet.has(identity));
  if (missing.length > 0 || unexpected.length > 0) {
    throw new Error(
      `CycloneDX component inventory differs from npm shrinkwrap: missing=${JSON.stringify(missing.slice(0, 5))} unexpected=${JSON.stringify(unexpected.slice(0, 5))}`,
    );
  }
}

/**
 * Upgrade npm 11's dependency graph to the current CycloneDX envelope, remove
 * time/random fields, and bind the root component to the exact tested tarball.
 */
export function normalizeReleaseSbom(rawSbom, {
  name,
  npmVersion,
  tarballSha256,
  version,
}) {
  const packageName = requireNonEmptyString(name, "name");
  const packageVersion = requireNonEmptyString(version, "version");
  const expectedNpmVersion = requireNonEmptyString(npmVersion, "npmVersion");
  const digest = requireSha256(tarballSha256);

  if (rawSbom === null || typeof rawSbom !== "object" || Array.isArray(rawSbom)) {
    throw new Error("npm sbom did not return a CycloneDX object");
  }

  const sbom = structuredClone(rawSbom);
  const component = sbom.metadata?.component;
  const tools = sbom.metadata?.tools;
  const npmTool = Array.isArray(tools)
    ? tools.find((tool) => tool?.vendor === "npm" && tool?.name === "cli")
    : undefined;

  if (
    sbom.bomFormat !== "CycloneDX"
    || component === null
    || typeof component !== "object"
    || component.type !== "library"
    || component["bom-ref"] !== `${packageName}@${packageVersion}`
    || !Array.isArray(tools)
    || !Array.isArray(sbom.components)
    || !Array.isArray(sbom.dependencies)
    || npmTool?.version !== expectedNpmVersion
  ) {
    throw new Error("npm SBOM structure or pinned tool identity drifted");
  }

  sbom.$schema = CYCLONEDX_SCHEMA;
  sbom.specVersion = CYCLONEDX_SPEC_VERSION;
  delete sbom.serialNumber;
  delete sbom.metadata.timestamp;

  component.name = packageName;
  component.version = packageVersion;
  component.type = "library";
  component.hashes = [{ alg: "SHA-256", content: digest }];

  tools.push({
    vendor: packageName,
    name: "scripts/sbom.mjs",
    version: packageVersion,
  });
  tools.push({
    vendor: "OWASP Foundation",
    name: "@cyclonedx/cyclonedx-library",
    version: CYCLONEDX_LIBRARY_VERSION,
  });
  sbom.metadata.properties = [
    ...(Array.isArray(sbom.metadata.properties) ? sbom.metadata.properties : []),
    { name: "cdx:reproducible", value: "true" },
  ];

  validateDependencyGraph(sbom, component["bom-ref"]);

  return sbom;
}

export async function validateReleaseSbomContents(contents) {
  const validator = getReleaseSbomValidator();
  if (!validator(JSON.parse(contents))) {
    throw new Error(
      `CycloneDX ${CYCLONEDX_SPEC_VERSION} validation failed: ${JSON.stringify(validator.errors)}`,
    );
  }
}

export async function generateReleaseSbom({
  cwd,
  env,
  name,
  npmExecPath,
  npmVersion,
  tarballSha256,
  version,
}) {
  const raw = execFileSync(
    process.execPath,
    [
      npmExecPath,
      "sbom",
      "--package-lock-only",
      "--sbom-format",
      "cyclonedx",
      "--sbom-type",
      "library",
    ],
    {
      cwd,
      encoding: "utf8",
      env,
      stdio: ["ignore", "pipe", "inherit"],
    },
  );
  const normalized = normalizeReleaseSbom(JSON.parse(raw), {
    name,
    npmVersion,
    tarballSha256,
    version,
  });
  const shrinkwrap = JSON.parse(readFileSync(join(cwd, "npm-shrinkwrap.json"), "utf8"));
  validateReleaseSbomInventory(normalized, shrinkwrap);
  const contents = `${JSON.stringify(normalized, null, 2)}\n`;
  await validateReleaseSbomContents(contents);
  return contents;
}
