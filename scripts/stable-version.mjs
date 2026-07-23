const stableVersionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;

export function parseStableVersion(value) {
  const match = typeof value === "string" ? stableVersionPattern.exec(value) : null;
  if (!match) {
    throw new Error(`version ${String(value)} must be a stable release version`);
  }
  return Object.freeze([BigInt(match[1]), BigInt(match[2]), BigInt(match[3])]);
}

export function compareStableVersions(left, right) {
  const leftParts = parseStableVersion(left);
  const rightParts = parseStableVersion(right);
  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] > rightParts[index]) return 1;
    if (leftParts[index] < rightParts[index]) return -1;
  }
  return 0;
}

export function assertVersionAdvancesLatest({ latest, name, version }) {
  try {
    parseStableVersion(latest);
  } catch {
    throw new Error("npm registry has no valid stable latest dist-tag");
  }
  if (compareStableVersions(version, latest) <= 0) {
    throw new Error(`${name}@${version} would not advance the current latest version ${latest}`);
  }
}
