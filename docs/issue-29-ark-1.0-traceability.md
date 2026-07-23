# Issue #29 acceptance under Ark 1.0

This is the live source-and-test map for
[issue #29](https://github.com/Vantrongs/ark-of-atrahasis/issues/29) under the
Ark `1.0.0` contract. The issue was opened against the 0.5 resource-control
model. Ark 1.0 deliberately removes that model, so the original canvas-quota
and bounded-IDREF remedies are superseded rather than presented as current
guarantees. The independently reproduced CSS request-activation finding and the
security-critical rollback/lifecycle requirements remain in force.

This document does not claim that the issue is closed, that per-commit CI is
green, or that `1.0.0` has been tagged or published. Those are live repository
and upstream-maintainer states, not documentation assertions.

## Original checklist disposition

| Original issue #29 criterion | Ark 1.0 disposition | Direct source/test evidence |
| --- | --- | --- |
| Add aggregate `canvasPixels` accounting | **Superseded by the 1.0 authority model.** Ark does not promise resource availability or enforce aggregate canvas area. | `src/types.ts`, `src/context.ts`, `test/numeric-media-contract.test.ts` |
| Preserve the per-canvas cap and reflected-byte accounting | **Superseded in part.** The caps/accounting are removed; unsigned-32-bit validation, exact reflected state, readback, and rollback remain. | `src/context.ts`, `src/element.ts`, `test/numeric-media-contract.test.ts`, `test/platform-boundary.test.ts` |
| Validate captured dimensions and setter/cleanup readback | **Retained.** Native observations are normalized; failed or silent writes cannot be reported as committed or cleaned. | `src/context.ts`, `src/platform.ts`, `test/platform-boundary.test.ts` |
| Zero owned canvas state; preserve external host state | **Retained.** Owned disposal zeroes dimensions, while external placement revocation is physically non-mutating. | `src/context.ts`, `test/numeric-media-contract.test.ts`, `test/lifecycle-placement.test.ts` |
| Remove exactly six CSS request activators | **Retained.** `animation-name`, `animation-duration`, `display`, `font-family`, `font-style`, and `font-weight` remain outside the grantable ceiling. | `src/style-policy.ts`, `test/style-membrane.test.ts` |
| Reject an IDREF list before token 257 | **Replaced.** The ASCII-whitespace scanner processes the complete input without the 256-token rejection and preserves canonical logical/opaque physical values. | `src/identifier-namespace.ts`, `test/identifier-namespace.test.ts` |
| Cover rollback, hostile accessors, cleanup, revocation, CSS inventory, and every IDREF-list entry point | **Retained and reshaped.** Physical/logical state is the oracle; quota capacity is not. Positive witnesses cross the former 8,192-IDREF and 16,777,216-pixel thresholds. | `test/identifier-namespace.test.ts`, `test/numeric-media-contract.test.ts`, `test/platform-boundary.test.ts`, `test/lifecycle-placement.test.ts` |
| Synchronize README, changelog, and Issue #1 traceability | **Mapped to 1.0.** README and changelog describe the current contract; Issue #1 is explicitly frozen as 0.4/0.5 history. | `README.md`, `CHANGELOG.md`, `docs/issue-1-traceability.md`, `docs/migration-0.5-to-1.0.md` |
| Pass the exact project/release gate | **Per-commit evidence required.** The commands remain defined by `package.json`; results belong to the immutable commit's CI and release evidence. | `package.json`, `.github/workflows/check.yml`, `scripts/test-package.mjs` |

## Ark 1.0 acceptance map

| Concern | 1.0 acceptance | Evidence |
| --- | --- | --- |
| Public contract removal | The built namespace has no quota/rate defaults; declarations have no resource-control types/options; all four legacy resource-control error codes are rejected. Own legacy options fail with `ERR_INVALID_POLICY` before claiming the root. | `src/index.ts`, `src/types.ts`, `src/context.ts`, `src/errors.ts`, `scripts/runtime-export-contract.mjs`, `test/api.node.mjs`, `test/types/negative.ts`, `test/release.test.mjs` |
| CSS request activators | The fixed style ceiling excludes exactly the six reproduced activators while adjacent properties are not removed without evidence. | `src/style-policy.ts`, `test/style-membrane.test.ts` |
| Unbounded IDREF count | All public list entry points accept 257 occurrences, and a positive witness accepts 8,193 while preserving canonical logical values and opaque physical tokens. | `src/identifier-namespace.ts`, `test/identifier-namespace.test.ts` |
| Canvas dimensions beyond the former area cap | A `4,097 × 4,096` positive witness exceeds the former area ceiling in unit tests and all three browser engines; unsigned-32-bit input validation still fails atomically. | `src/context.ts`, `test/numeric-media-contract.test.ts`, `test/browser/boundary.spec.mjs` |
| Transactional lifecycle | Before-write failure, write-then-throw, failed rollback, retryable cleanup, listener abort, owned cleanup, external non-mutation, and idempotent terminal behavior remain security contracts without accounting as an oracle. | `src/context.ts`, `src/registry.ts`, `test/lifecycle-placement.test.ts`, `test/platform-boundary.test.ts`, `test/property/lifecycle-model.test.ts` |
| Availability boundary | Ark makes no scheduling, preemption, Worker-termination, rate, quota, or resource-cap guarantee. Host isolation and availability testing are integration responsibilities. | `README.md`, `docs/migration-0.5-to-1.0.md` |

## Release boundary

`package.json` identifies the source as `1.0.0`. The exact runtime namespace is
shared by built-package, README, release, and packed-artifact checks. Actual
tagging, npm trusted publication, provenance, and GitHub release creation remain
exclusively upstream-maintainer actions; this map does not claim they occurred.
