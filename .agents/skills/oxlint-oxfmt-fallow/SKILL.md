---
name: oxlint-oxfmt-fallow
description: Audit and change Ark of Atrahasis static-analysis tooling, including Biome lint, Fallow dead-code/duplication reports, and evidence-based Oxlint or Oxfmt adoption. Use for .fallowrc.json, analyzer scripts, lint/analyze/check package scripts, CI tooling gates, dead exports, circular dependencies, clone triage, or Oxc-family evaluation in this repository.
---

# Ark tooling audit

Preserve diagnostics and the repository's exact Node/npm contract. Read
`references/tooling-contract.md` before changing analyzer configuration or
classifying findings.

## Workflow

1. Inspect `package.json`, `.fallowrc.json`, `scripts/fallow-report.mjs`, the
   relevant workflow, and the current source around every reported location.
2. Establish a baseline with the installed binaries and resolved config. Do not
   infer coverage from config text alone.
3. Classify each finding as a defect, intentional contract, analyzer limitation,
   or infrastructure/configuration failure. Verify the evidence for every
   suppression or ignore; prefer fixing the shared contract.
4. Apply one representative change and run its narrow behavioral/type check.
   Scale only after it passes.
5. Rerun Biome, exact TypeScript matrices, Fallow JSON reports, relevant tests,
   and finally the repository gate required by the change.

## Constraints

- Keep Fallow advisory for findings. Its binary, signature, config, spawn, and
  runtime failures remain blocking through `scripts/fallow-report.mjs`.
- Use the installed version's local JSON schema and `fallow config`; never copy
  rule names or defaults from another repository without resolving them here.
- Do not import MS-specific Svelte, CSS, monorepo boundaries, baselines, Bun
  commands, or broad entry globs.
- Do not add `|| true`, blanket ignores, or suppression comments to make a gate
  green.
- Treat Oxc tools as separate adoption decisions. Probe them read-only against
  the current tree and add a dependency only when it finds useful issues beyond
  Biome, TypeScript, and Fallow at an acceptable false-positive and lockfile cost.
- Keep formatter adoption separate from lint adoption when it would create a
  repository-wide formatting diff.
