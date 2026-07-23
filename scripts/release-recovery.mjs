import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { assertVersionAdvancesLatest } from "./stable-version.mjs";

const registryOrigin = "https://registry.npmjs.org";
const expectedAssetSuffixes = [".tgz", ".sbom.cdx.json", ".sha256"];

function digest(algorithm, contents, encoding) {
  return createHash(algorithm).update(contents).digest(encoding);
}

function expectedArtifacts(artifactsDirectory, artifactBase) {
  return expectedAssetSuffixes.map((suffix) => {
    const name = `${artifactBase}${suffix}`;
    const data = readFileSync(resolve(artifactsDirectory, name));
    return {
      data,
      digest: `sha256:${digest("sha256", data, "hex")}`,
      name,
      size: data.length,
    };
  });
}

async function listAll(method, parameters) {
  const results = [];
  for (let page = 1; ; page += 1) {
    const { data } = await method({ ...parameters, page, per_page: 100 });
    if (!Array.isArray(data)) throw new Error("GitHub returned a non-array paginated response");
    results.push(...data);
    if (data.length < 100) return results;
  }
}

async function verifyAnnotatedTagCommit({ commitSha, github, owner, repo, tag }) {
  const { data: ref } = await github.rest.git.getRef({
    owner,
    ref: `tags/${tag}`,
    repo,
  });
  if (ref?.object?.type !== "tag" || typeof ref.object.sha !== "string") {
    throw new Error(`release ref refs/tags/${tag} is not an annotated tag`);
  }

  const { data: tagObject } = await github.rest.git.getTag({
    owner,
    repo,
    tag_sha: ref.object.sha,
  });
  if (tagObject?.object?.type !== "commit" || tagObject.object.sha !== commitSha) {
    throw new Error(`release tag ${tag} does not resolve to workflow commit ${commitSha}`);
  }
}

function releaseState(release, tag) {
  if (!Number.isSafeInteger(release?.id) || release.id <= 0) {
    throw new Error("GitHub release has no valid id");
  }
  if (release.tag_name !== tag || release.name !== tag || release.prerelease !== false) {
    throw new Error(`GitHub release metadata does not exactly match ${tag}`);
  }
  if (release.draft === true) {
    if (release.published_at !== null || release.immutable === true) {
      throw new Error(`GitHub draft release ${tag} has a conflicting release state`);
    }
    return "draft";
  }
  if (release.draft === false && typeof release.published_at === "string") return "published";
  throw new Error(`GitHub release ${tag} has a conflicting release state`);
}

function verifyAssets(assets, expected, { allowMissing }) {
  const expectedByName = new Map(expected.map((artifact) => [artifact.name, artifact]));
  const actualByName = new Map();

  for (const asset of assets) {
    const artifact = expectedByName.get(asset?.name);
    if (!artifact)
      throw new Error(`GitHub release has unexpected asset ${asset?.name ?? "<unnamed>"}`);
    if (actualByName.has(asset.name)) {
      throw new Error(`GitHub release has duplicate asset ${asset.name}`);
    }
    if (
      asset.state !== "uploaded" ||
      asset.size !== artifact.size ||
      asset.digest !== artifact.digest
    ) {
      throw new Error(`GitHub release asset ${asset.name} does not match the verified artifact`);
    }
    actualByName.set(asset.name, asset);
  }

  const missing = expected.filter((artifact) => !actualByName.has(artifact.name));
  if (!allowMissing && missing.length > 0) {
    throw new Error(`GitHub release is missing asset ${missing[0].name}`);
  }
  return missing;
}

async function removeRecoverableStarterAssets({ assets, expected, github, owner, repo }) {
  const expectedNames = new Set(expected.map((artifact) => artifact.name));
  const seenNames = new Set();
  for (const asset of assets) {
    if (seenNames.has(asset?.name)) {
      throw new Error(`GitHub release has duplicate asset ${asset?.name ?? "<unnamed>"}`);
    }
    seenNames.add(asset?.name);
  }

  const starters = assets.filter((asset) => asset?.state === "starter");
  for (const asset of starters) {
    if (
      !expectedNames.has(asset.name) ||
      !Number.isSafeInteger(asset.id) ||
      asset.id <= 0 ||
      asset.size !== 0 ||
      asset.digest != null
    ) {
      throw new Error(`GitHub release has a conflicting starter asset ${asset?.name ?? "<unnamed>"}`);
    }
  }

  verifyAssets(
    assets.filter((asset) => asset?.state !== "starter"),
    expected,
    { allowMissing: true },
  );
  for (const asset of starters) {
    await github.rest.repos.deleteReleaseAsset({
      asset_id: asset.id,
      owner,
      repo,
    });
  }
}

async function findRelease({ github, owner, repo, tag }) {
  const releases = await listAll(github.rest.repos.listReleases, {
    owner,
    repo,
  });
  const matching = releases.filter((release) => release.tag_name === tag);
  if (matching.length > 1) throw new Error(`GitHub has multiple releases for tag ${tag}`);
  return matching[0];
}

async function listReleaseAssets({ github, owner, releaseId, repo }) {
  return listAll(github.rest.repos.listReleaseAssets, {
    owner,
    release_id: releaseId,
    repo,
  });
}

export async function prepareGitHubRelease({
  artifactBase,
  artifactsDirectory = ".artifacts",
  commitSha,
  core,
  github,
  owner,
  registryState,
  repo,
  tag,
}) {
  if (registryState !== "missing" && registryState !== "matching") {
    throw new Error(`unexpected npm registry state ${registryState}`);
  }
  const artifacts = expectedArtifacts(artifactsDirectory, artifactBase);
  await verifyAnnotatedTagCommit({ commitSha, github, owner, repo, tag });

  let release = await findRelease({ github, owner, repo, tag });
  if (!release) {
    if (registryState === "matching") {
      throw new Error(`npm ${tag} exists without a GitHub release draft to recover`);
    }
    const response = await github.rest.repos.createRelease({
      draft: true,
      generate_release_notes: true,
      name: tag,
      owner,
      prerelease: false,
      repo,
      tag_name: tag,
      target_commitish: commitSha,
    });
    release = response.data;
  }

  const state = releaseState(release, tag);
  let assets = await listReleaseAssets({
    github,
    owner,
    releaseId: release.id,
    repo,
  });
  if (state === "draft") {
    await removeRecoverableStarterAssets({
      assets,
      expected: artifacts,
      github,
      owner,
      repo,
    });
    assets = await listReleaseAssets({
      github,
      owner,
      releaseId: release.id,
      repo,
    });
  }
  const missing = verifyAssets(assets, artifacts, {
    allowMissing: state === "draft",
  });

  if (state === "published" && missing.length > 0) {
    throw new Error(`published GitHub release ${tag} is incomplete`);
  }

  for (const artifact of missing) {
    const { data: uploaded } = await github.rest.repos.uploadReleaseAsset({
      data: artifact.data,
      headers: {
        "content-length": artifact.size,
        "content-type": "application/octet-stream",
      },
      name: artifact.name,
      owner,
      release_id: release.id,
      repo,
    });
    verifyAssets([uploaded], [artifact], { allowMissing: false });
  }

  assets = await listReleaseAssets({
    github,
    owner,
    releaseId: release.id,
    repo,
  });
  verifyAssets(assets, artifacts, { allowMissing: false });
  core?.setOutput("release-id", release.id);
  core?.setOutput("release-state", state);
  return { releaseId: release.id, state };
}

export async function finalizeGitHubRelease({
  artifactBase,
  artifactsDirectory = ".artifacts",
  commitSha,
  github,
  owner,
  repo,
  tag,
}) {
  const artifacts = expectedArtifacts(artifactsDirectory, artifactBase);
  await verifyAnnotatedTagCommit({ commitSha, github, owner, repo, tag });
  const release = await findRelease({ github, owner, repo, tag });
  if (!release) throw new Error(`GitHub release ${tag} no longer exists`);

  const state = releaseState(release, tag);
  const assets = await listReleaseAssets({
    github,
    owner,
    releaseId: release.id,
    repo,
  });
  verifyAssets(assets, artifacts, { allowMissing: false });
  if (state === "published") return { releaseId: release.id, state };

  const { data: published } = await github.rest.repos.updateRelease({
    draft: false,
    owner,
    release_id: release.id,
    repo,
  });
  if (releaseState(published, tag) !== "published") {
    throw new Error(`GitHub release ${tag} was not published`);
  }
  return { releaseId: release.id, state: "published" };
}

function registryVersionUrl(name, version) {
  const encodedName = encodeURIComponent(name).replaceAll("%2F", "%2f");
  return `${registryOrigin}/${encodedName}/${encodeURIComponent(version)}`;
}

async function verifyNewVersionAdvancesLatest({ fetchImplementation = fetch, name, version }) {
  const encodedName = encodeURIComponent(name).replaceAll("%2F", "%2f");
  const response = await fetchResponse(fetchImplementation, `${registryOrigin}/${encodedName}`);
  if (response.status === 404) return;
  if (response.status !== 200) {
    throw new Error(`npm registry returned unexpected HTTP ${response.status}`);
  }
  const latest = (await response.json())?.["dist-tags"]?.latest;
  assertVersionAdvancesLatest({ latest, name, version });
}

async function fetchResponse(fetchImplementation, url) {
  return fetchImplementation(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
}

export async function inspectRegistryTarball({
  fetchImplementation = fetch,
  name,
  tarballPath,
  version,
}) {
  const localTarball = readFileSync(tarballPath);
  const response = await fetchResponse(fetchImplementation, registryVersionUrl(name, version));
  if (response.status === 404) return { state: "missing" };
  if (response.status !== 200) {
    const error = new Error(`npm registry returned unexpected HTTP ${response.status}`);
    error.code = "REGISTRY_UNAVAILABLE";
    throw error;
  }

  const metadata = await response.json();
  if (metadata?.name !== name || metadata?.version !== version) {
    throw new Error(`npm registry version metadata does not match ${name}@${version}`);
  }
  const expectedIntegrity = `sha512-${digest("sha512", localTarball, "base64")}`;
  const expectedShasum = digest("sha1", localTarball, "hex");
  if (
    metadata?.dist?.integrity !== expectedIntegrity ||
    metadata?.dist?.shasum !== expectedShasum ||
    typeof metadata?.dist?.tarball !== "string"
  ) {
    throw new Error(`npm registry digest does not match the verified ${name}@${version} tarball`);
  }

  const tarballUrl = new URL(metadata.dist.tarball);
  if (
    tarballUrl.origin !== registryOrigin ||
    tarballUrl.username !== "" ||
    tarballUrl.password !== "" ||
    tarballUrl.search !== "" ||
    tarballUrl.hash !== ""
  ) {
    throw new Error("npm registry returned an unexpected tarball URL");
  }
  const tarballResponse = await fetchImplementation(tarballUrl, {
    signal: AbortSignal.timeout(10_000),
  });
  if (tarballResponse.status !== 200) {
    const error = new Error(`npm tarball returned unexpected HTTP ${tarballResponse.status}`);
    error.code = "REGISTRY_UNAVAILABLE";
    throw error;
  }
  const registryTarball = Buffer.from(await tarballResponse.arrayBuffer());
  if (!registryTarball.equals(localTarball)) {
    throw new Error(`npm registry tarball bytes do not match ${name}@${version}`);
  }
  return { state: "matching" };
}

async function inspectReleaseRegistryState({
  verifyProvenanceImplementation = verifyNpmProvenance,
  ...options
}) {
  const state = await inspectRegistryTarball(options);
  if (state.state === "missing") {
    await verifyNewVersionAdvancesLatest(options);
  } else {
    await verifyProvenanceImplementation(options);
  }
  return state;
}

function decodeStatement(attestation) {
  try {
    return JSON.parse(
      Buffer.from(attestation.bundle.dsseEnvelope.payload, "base64").toString("utf8"),
    );
  } catch {
    throw new Error("npm provenance contains an invalid signed statement");
  }
}

export function assertNpmProvenance({
  auditResult,
  commitSha,
  name,
  ref,
  repository,
  tarballPath,
  version,
  workflowPath,
}) {
  if (
    !Array.isArray(auditResult?.invalid) ||
    auditResult.invalid.length !== 0 ||
    !Array.isArray(auditResult?.missing) ||
    auditResult.missing.length !== 0 ||
    !Array.isArray(auditResult?.verified)
  ) {
    throw new Error(`npm attestation audit did not verify ${name}@${version}`);
  }
  const verified = auditResult.verified.filter(
    (entry) => entry?.name === name && entry?.version === version,
  );
  if (verified.length !== 1) {
    throw new Error(`npm attestation audit has no unique result for ${name}@${version}`);
  }
  if (
    verified[0]?.attestations?.provenance?.predicateType !==
    "https://slsa.dev/provenance/v1"
  ) {
    throw new Error(`${name}@${version} has no verified SLSA provenance`);
  }
  const provenance = (verified[0].attestationBundles ?? []).filter(
    (attestation) => attestation?.predicateType === "https://slsa.dev/provenance/v1",
  );
  if (provenance.length !== 1) {
    throw new Error(`${name}@${version} has no unique verified SLSA provenance bundle`);
  }

  const statement = decodeStatement(provenance[0]);
  const expectedPurlName = encodeURIComponent(name).replaceAll("%2F", "/");
  const expectedSubject = `pkg:npm/${expectedPurlName}@${version}`;
  const expectedDigest = digest("sha512", readFileSync(tarballPath), "hex");
  if (
    statement?._type !== "https://in-toto.io/Statement/v1" ||
    statement?.predicateType !== "https://slsa.dev/provenance/v1" ||
    statement?.subject?.length !== 1 ||
    statement.subject[0]?.name !== expectedSubject ||
    statement.subject[0]?.digest?.sha512 !== expectedDigest
  ) {
    throw new Error(`npm provenance subject does not match ${name}@${version}`);
  }

  const buildDefinition = statement?.predicate?.buildDefinition;
  const workflow = buildDefinition?.externalParameters?.workflow;
  const dependencies = buildDefinition?.resolvedDependencies;
  if (
    buildDefinition?.buildType !==
      "https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1" ||
    workflow?.repository !== repository ||
    workflow?.path !== workflowPath ||
    workflow?.ref !== ref ||
    buildDefinition?.internalParameters?.github?.event_name !== "push" ||
    !Array.isArray(dependencies) ||
    dependencies.length !== 1 ||
    dependencies[0]?.uri !== `git+${repository}@${ref}` ||
    dependencies[0]?.digest?.gitCommit !== commitSha ||
    statement?.predicate?.runDetails?.builder?.id !==
      "https://github.com/actions/runner/github-hosted" ||
    !statement?.predicate?.runDetails?.metadata?.invocationId?.startsWith(
      `${repository}/actions/runs/`,
    )
  ) {
    throw new Error(`npm provenance identity does not match the release workflow commit`);
  }
}

async function verifyNpmProvenance({ name, tarballPath, version }) {
  const npmCli = process.env.NPM_CLI;
  const repositoryName = process.env.GITHUB_REPOSITORY;
  const ref = process.env.GITHUB_REF;
  const commitSha = process.env.GITHUB_SHA;
  if (
    !npmCli ||
    !repositoryName ||
    !/^refs\/tags\/v\d+\.\d+\.\d+$/u.test(ref ?? "") ||
    !/^[0-9a-f]{40}$/u.test(commitSha ?? "") ||
    process.env.GITHUB_SERVER_URL !== "https://github.com"
  ) {
    throw new Error("GitHub release identity is unavailable for npm provenance verification");
  }

  const repository = `https://github.com/${repositoryName}`;
  const temporaryDirectory = mkdtempSync(resolve(tmpdir(), "ark-npm-provenance-"));
  const environment = {
    ...process.env,
    NPM_CONFIG_AUDIT: "false",
    NPM_CONFIG_CACHE: resolve(temporaryDirectory, "cache"),
    NPM_CONFIG_FUND: "false",
    NPM_CONFIG_UPDATE_NOTIFIER: "false",
    NPM_CONFIG_USERCONFIG: "/dev/null",
  };
  delete environment.NODE_AUTH_TOKEN;
  delete environment.NPM_TOKEN;

  try {
    writeFileSync(
      resolve(temporaryDirectory, "package.json"),
      `${JSON.stringify({ dependencies: { [name]: version }, private: true })}\n`,
    );
    execFileSync(
      process.execPath,
      [
        npmCli,
        "install",
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
        "--registry",
        `${registryOrigin}/`,
      ],
      { cwd: temporaryDirectory, env: environment, stdio: "inherit" },
    );
    const output = execFileSync(
      process.execPath,
      [
        npmCli,
        "audit",
        "signatures",
        "--json",
        "--include-attestations",
        "--registry",
        `${registryOrigin}/`,
      ],
      {
        cwd: temporaryDirectory,
        encoding: "utf8",
        env: environment,
        stdio: ["ignore", "pipe", "inherit"],
      },
    );
    assertNpmProvenance({
      auditResult: JSON.parse(output),
      commitSha,
      name,
      ref,
      repository,
      tarballPath,
      version,
      workflowPath: ".github/workflows/release.yml",
    });
  } finally {
    rmSync(temporaryDirectory, { force: true, recursive: true });
  }
}

async function waitForMatchingRegistry(options) {
  const { attempts = 10, delayImplementation = setTimeout, delayMilliseconds = 3_000 } = options;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const result = await inspectRegistryTarball(options);
      if (result.state === "matching") return result;
    } catch (error) {
      if (error?.code !== "REGISTRY_UNAVAILABLE" || attempt === attempts) throw error;
    }
    if (attempt < attempts) {
      await new Promise((resolveDelay) => delayImplementation(resolveDelay, delayMilliseconds));
    }
  }
  throw new Error("npm publication did not become visible before the recovery deadline");
}

function publishTarball({ tarballPath }) {
  const npmCli = process.env.NPM_CLI;
  if (!npmCli) throw new Error("NPM_CLI is required for trusted publication");
  execFileSync(
    process.execPath,
    [
      npmCli,
      "publish",
      resolve(tarballPath),
      "--ignore-scripts",
      "--access",
      "public",
      "--provenance",
      "--registry",
      `${registryOrigin}/`,
    ],
    { stdio: "inherit" },
  );
}

export async function publishOrResumeNpm({
  publishImplementation = publishTarball,
  releaseState: githubReleaseState,
  verifyProvenanceImplementation = verifyNpmProvenance,
  ...registryOptions
}) {
  if (githubReleaseState !== "draft" && githubReleaseState !== "published") {
    throw new Error(`unexpected GitHub release state ${githubReleaseState}`);
  }
  const registryState = await inspectReleaseRegistryState({
    ...registryOptions,
    verifyProvenanceImplementation,
  });
  if (registryState.state === "matching") return { published: false };
  if (githubReleaseState === "published") {
    throw new Error("published GitHub release has no matching npm publication");
  }

  await publishImplementation(registryOptions);
  await waitForMatchingRegistry(registryOptions);
  await verifyProvenanceImplementation(registryOptions);
  return { published: true };
}

function writeOutput(name, value) {
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
  }
}

async function main() {
  const [command, firstArgument, secondArgument, thirdArgument, fourthArgument] =
    process.argv.slice(2);
  if (command === "inspect-registry" && firstArgument && secondArgument && thirdArgument) {
    const result = await inspectReleaseRegistryState({
      name: firstArgument,
      tarballPath: thirdArgument,
      version: secondArgument,
    });
    writeOutput("registry-state", result.state);
    console.log(`Verified npm registry state ${result.state} for ${firstArgument}@${secondArgument}`);
    return;
  }
  if (
    command !== "publish-or-resume" ||
    !firstArgument ||
    !secondArgument ||
    !thirdArgument ||
    !fourthArgument
  ) {
    throw new Error(
      "usage: node release-recovery.mjs inspect-registry <name> <version> <tarball> | " +
        "publish-or-resume <draft|published> <name> <version> <tarball>",
    );
  }
  const result = await publishOrResumeNpm({
    name: secondArgument,
    releaseState: firstArgument,
    tarballPath: fourthArgument,
    version: thirdArgument,
  });
  writeOutput("npm-published", result.published);
  console.log(
    result.published
      ? `Published and verified ${secondArgument}@${thirdArgument}`
      : `Verified existing byte-identical ${secondArgument}@${thirdArgument} with exact provenance; publication skipped`,
  );
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (invokedPath === import.meta.url) await main();
