# Tooling contract

## Current gates

- `npm run lint` is the blocking Biome source/test/tooling lint.
- `npm run typecheck` runs the repository's exact current, next, tooling, and
  property TypeScript configurations.
- `npm run analyze` runs signed Fallow dead-code and duplication reports.
- `npm run check` is the complete project gate; run it with the exact versions
  declared by `.node-version` and `packageManager`.

Read those scripts from `package.json` on every use. They are the source of
truth if this reference drifts.

## Fallow configuration

Use `./node_modules/fallow/schema.json`, then inspect the effective values:

```sh
node_modules/.bin/fallow --version
node_modules/.bin/fallow config --format json --quiet
node_modules/.bin/fallow list --format json --no-cache --quiet
node_modules/.bin/fallow dead-code --format json --no-cache --quiet
node_modules/.bin/fallow dupes --format json --no-cache --quiet
```

Exit 1 from a direct analysis command may mean findings. Exit 2 means a
validation/runtime failure. The repository runner adds a signed-binary preflight
and must distinguish those states.

Do not copy MS's `health.maxUnitSize` setting or add `fallow health` to the main
report. This repository deliberately scopes Fallow to dead code, dependency and
cycle integrity, and duplication. Health output is a separate on-demand design
audit, not a version-pinned project contract.

The Ark duplicate contract deliberately retains Fallow's curated default clone
ignores. Setting `ignoreDefaults` to false was measured on this repository and
mostly expanded repeated test fixtures rather than production design signal.
Use a separate evidence report if an expanded test-clone audit is requested;
do not silently replace the main report.

## Finding review

For dead code, prove reachability across package roots, tests, dynamic loading,
workflow references, and packed-archive execution before removal. For clones,
name the shared invariant first. Do not merge independent security, rollback,
or public API branches solely to reduce a percentage.

Ark enables entry-export analysis. The only ignored exports are the default
exports of `playwright.config.mjs` and `tsdown.config.ts`, which their external
CLIs load as configuration. Re-prove those consumers before changing the list;
do not add script or package exports merely because an entry point is external.

After refactors, compare structured Fallow output before and after. A lower
count is not sufficient: confirm that no unresolved imports, cycles, dependency
errors, or new clone groups appeared.

## Oxc evaluation

Check current official documentation and npm metadata before probing. Run
Oxlint and Oxfmt without writes first. Separate:

- ordinary Oxlint rules;
- type-aware `tsgolint` results;
- TypeScript compiler diagnostics produced by experimental `--type-check`;
- Oxfmt formatting compatibility and churn.

Do not replace the exact TypeScript matrix with `--type-check` unless its output
matches the supported compiler contracts and all deliberate negative-test
patterns. Do not add parser/transform/minifier packages directly when the build
tool already owns that layer.
