# Changelog

All notable changes to this project are recorded here. A release-candidate
heading is prepared before publication; release automation rejects a tag without
an exact package-version and dated heading. A heading alone is not evidence that
the tag, npm package, or GitHub release exists.

## [Unreleased]

## [1.0.0] - 2026-07-23

This source release defines the Ark 1.0 contract. This heading does not claim a
`v1.0.0` tag, npm publication, provenance attestation, or GitHub release; those
are exclusively upstream-maintainer actions through the protected release
workflow.

### Breaking

- Removed document resource controls from the public and runtime contracts:
  `DEFAULT_SAFE_DOCUMENT_QUOTAS`, `DEFAULT_SAFE_DOCUMENT_RATES`,
  `SafeDocumentQuotas`, `SafeDocumentRateLimit`, `SafeDocumentRates`, the
  `quotas` and `rates` options, and the `INVALID_QUOTA`, `INVALID_RATE`,
  `QUOTA_EXCEEDED`, and `RATE_LIMIT_EXCEEDED` error codes.
- Own legacy `quotas` or `rates` properties now fail explicitly with
  `ERR_INVALID_POLICY` before the root is claimed, so corrected initialization
  can retry without silently treating obsolete configuration as protection.
- Removed node, listener, operation, byte, request, identifier, and canvas
  accounting and its fixed ceilings. Calls and live DOM effects are no longer
  rejected because they cross the former Ark-managed limits.
- Removed the 256-occurrence IDREF-list ceiling and the package's canvas-area
  ceiling. IDREF lists are scanned and canonicalized across the complete input,
  and canvas dimensions retain unsigned-32-bit DOM validation without an
  Ark-managed area limit.
- Removed dedicated-Worker termination from Ark acceptance. Availability,
  scheduling, preemption, and host resource enforcement are explicit non-goals;
  integrations that need them must isolate and test their own Worker, process,
  or RPC boundary.

### Security

- Preserved owner branding, cross-owner rejection, placement revocation,
  default-deny URL/style/form policies, captured owner-realm operations,
  transactional rollback, retryable cleanup, listener abort, idempotent
  disposal, owned canvas zeroing, and non-mutating external revocation.
- Retained the exclusion of `animation-name`, `animation-duration`, `display`,
  `font-family`, `font-style`, and `font-weight` from the grantable style
  ceiling because these values can activate request-bearing host stylesheet
  rules outside URL policy.
- Refreshed the locked transitive `fast-uri` resolution from 3.1.3 to patched
  3.1.4 for GHSA-v2hh-gcrm-f6hx; the low-severity audit gate reports no known
  vulnerabilities in the resulting locked graph.
- Reworked resource-accounting-dependent lifecycle coverage to assert physical
  state, logical namespace ownership, rollback, revocation, and cleanup
  directly. Positive IDREF and canvas cases now cross the former caps without
  weakening their platform and lifecycle checks.

## [0.5.0] - 2026-07-16

This is the ESNext/Node 26 modernization release candidate. As of 2026-07-16,
npm `latest` remains `0.3.1`; no `v0.5.0` tag, npm publication, or immutable
GitHub release is claimed here.

### Security

- Added an aggregate `canvasPixels` lifetime quota with a 16,777,216-pixel
  default. Native `300 × 150` creation, width/height replacement, reflected
  attributes, rollback, owned cleanup, external revocation, and quota
  reacquisition now share one transaction; owned disposal zeroes canvas
  dimensions before releasing accounting. Invalid native observations and
  unproven setter/cleanup writes fail closed without under-counting.
- Removed `animation-name`, `animation-duration`, `display`, `font-family`,
  `font-style`, and `font-weight` from the grantable style ceiling because their
  otherwise URL-free values can activate request-bearing host stylesheet rules
  outside URL policy and request quotas.
- Replaced unbounded IDREF-list split/filter allocation with an ASCII-whitespace
  scanner that stops before token 257. This is defense-in-depth for the
  documented same-agent availability non-goal and preserves the existing
  256-token error and canonicalization contract.

### Changed

- Raised the exact build, test, package, and release runtime from Node.js
  22.22.2 to Node.js 26.5.0 and the published engine floor to `>=26.5.0`.
- Moved TypeScript libraries, emitted syntax, declaration fixtures, packed
  README examples, and bundled output from fixed ES2022 to rolling `ESNext`, which
  is the TypeScript 6/7 spelling for the TC39-next surface because neither
  compiler accepts a literal `ES2026` target.
- Upgraded Biome from 2.5.3 to 2.5.4 and Vitest from 3.2.7 to 4.1.10, and added
  Fallow 3.6.0 report-mode dead-code/cycle/duplication analysis to the complete
  gate. The report wrapper verifies the signed platform binary and accepts exit
  1 only for well-formed findings. Its entry roots name only directly invoked
  scripts, and no redundant self-ignore can hide future dependency drift.
  Ark-specific rule severities and clone parameters are now explicit, and a
  repository-local tooling skill preserves the same evidence-first workflow
  without copying MS-specific monorepo or framework settings. Entry exports are
  analyzed with exact externally loaded config-default exceptions.
- Replaced unmaintained tsup 8.5.1 with its recommended successor, tsdown
  0.22.8 and Rolldown 1.1.5. This removes tsup's TypeScript 6 DTS failure caused
  by its unconditional deprecated `baseUrl` injection while preserving the
  exact `dist/index.js`, declaration, and source-map artifact contract. The
  verified package now also requires and reproducibly rebuilds the declaration
  map referenced by `dist/index.d.ts`. The obsolete direct `esbuild` override
  is gone: the resolved tsdown/Rolldown/Vite graph does not install esbuild, and
  Vite declares it only as an optional peer.
- Included the check and release workflow fixtures in the source package so its
  packed release tests and Fallow graph retain the same workflow inputs as the
  repository instead of reporting unresolved repo-only imports.
- Added a least-privilege security workflow with SHA-pinned dependency review
  that blocks new advisories at `low` severity in every dependency scope. Push,
  weekly, and manual coverage uses the exact frozen Node/npm toolchain to repeat
  the vulnerability audit and verify npm registry signatures plus attestations.
  Base-branch edits now revalidate the current pull-request merge and dependency
  diff without allocating runners for title/body-only edits. The `main` check
  reuses its installed graph for registry trust instead of starting a duplicate
  audit job, while weekly/manual temporal rechecks remain independent. The
  release gate now installs its exact three Playwright engines before the full
  browser matrix and verifies registry trust before creating artifacts.
  The workflow fixture and its exact contract are included in the reproducible
  source package and structurally validated in release tests with pinned,
  dependency-free YAML 2.9.0.
- Addressed the initial CodeQL extended findings in the npm registry preflight
  by requiring the immutable package identity and reconstructing a canonical
  stable version before either value can enter the fixed registry request.
- Updated the check workflow to the pinned `actions/checkout` 7.0.0 revision
  already used by the release workflow, and made the exact `.node-version` the
  single Node source for checkout jobs and the no-checkout publish handoff.
- Strengthened the TypeScript 6/7 source and property configurations with exact
  optional properties, checked indexed access, index-signature syntax,
  side-effect-import checks, explicit returns/overrides, erasable syntax, and
  unreachable/unused-label errors. Production declarations now run with full
  library checking; only the isolated tsdown config skips its uninstalled
  optional-feature peer declarations.
- Began native Temporal adoption in Node-only release tooling: changelog dates
  are parsed as `Temporal.PlainDate`, rejecting calendar-impossible headings.
  Browser runtime code stays Temporal-free because Playwright 1.61.1's WebKit
  26.5 still has no `Temporal` global. The Node Worker termination test now
  measures its deadline with monotonic `performance.now()` rather than wall
  time.
- Retained npm 11.18.0 because npm 12.0.1 no longer accepts the publishable
  `npm-shrinkwrap.json` for `npm ci` or `npm sbom`; the reproducible install,
  exact dependency inventory, and CycloneDX 1.7 gates therefore stay on the
  latest compatible npm line.
- Retained TypeScript 5.0.4 as the minimum consumer declaration fixture and
  TypeScript 6.0.3 for release declaration generation while continuing to
  check the source and packed declarations with current TypeScript 7.0.2.
- Resolved the confirmed Fallow hygiene/design backlog by removing unnecessary
  internal export edges, naming the public `URLConstructor` type, sharing the
  hostile-realm reflection and event-record contracts, consolidating exact
  identifier quota bookkeeping while preserving distinct ID/name commits, and
  sharing date-part validation between date and local-date-time parsing.

## [0.4.0] - 2026-07-15

This is the repository release candidate. As of 2026-07-15, npm `latest` remains
`0.3.1`; no tag, npm publication, or immutable GitHub release is claimed here.

### Added

- Added a strict-default policy denial for the complete public form surface
  (`button`, `fieldset`, `img`, `input`, `label`, `legend`, `optgroup`, `option`,
  `output`, `select`, and `textarea`), an exact
  `allowNonCredentialFormElements: true` host grant, operation metering before
  policy evaluation, and unit/API/type/SES/three-engine coverage for stable
  pre-creation failure.
- Added a dedicated Chrome-for-Testing Chromium address-Autofill limitation
  witness: opted-in email remains guest-readable after autofill while external
  host form/named state remains unchanged; no password-manager claim is made.
- Added exported fixed-window operation and request-attempt rate defaults,
  captured owner-realm monotonic timing, exact boundary/reset/property tests,
  and stable fail-closed rate configuration/runtime errors alongside the
  existing lifetime quotas.
- Added a disposable strict event fence at the `ShadowRoot` bubble seam and at
  owned `focus`/`blur` targets, with three-engine delegated click/hotkey/action/
  form/focus coverage and an explicit trusted-host capture-phase obligation.
- Expanded post-lockdown Chromium, Firefox, and WebKit SES coverage to every
  advertised event family, all 21 public event types, and every public snapshot
  field, cancellation reentrancy, hostile getters, and a documented
  trusted-touch substitute where WebKit rejects scripted `Touch` construction.
- Enforced computed paint containment on the `ShadowRoot` host and added
  Chromium, Firefox, and WebKit geometry/hit-test coverage for explicitly
  granted fixed, viewport-sized, high-z-index guest styles.
- Expanded real-browser SES coverage across the browser-relevant issue #1
  authority, event/error, policy, form, owner, lifecycle, numeric, and quota
  seams.
- A single lint, typecheck, test, audit, and pristine-package CI gate.
- Real Chromium, Firefox, and WebKit request/navigation interception, browser
  SES bootstrap, and unyielding dedicated-Worker termination coverage.
- Fixed-seed generated CSS, URL, numeric, identifier, and lifecycle/model tests,
  including exact quota failure/release and replay paths.
- Reproducible tarball verification from a clean Git archive, exact installed
  root runtime-export namespace enforcement, minimum/current
  TypeScript declaration checks, offline consumer installation, source rebuild
  comparison, literal typecheck/browser execution of every executable packed
  README fence, SHA-256 checksums, and a byte-reproducible, strict-validated
  CycloneDX 1.7 SBOM bound to the exact tarball SHA-256 and reconciled with the
  complete non-root, non-link packed-shrinkwrap component inventory.
- A tag-triggered release workflow whose write/OIDC job targets the protected
  `npm` environment, transfers only the verified tarball, checksum, and SBOM,
  verifies their identity, uses npm trusted publishing, and publishes a
  populated draft GitHub release.
- Release-engineering documentation for reproducible packaging, external owner
  controls, preferred source information, and historical package metadata risk.
- An explicit internationalization contract and tests for BCP 47 language-tag
  round-tripping, distinct unknown/inherited language states, resettable HTML
  direction keywords, multilingual/Unicode string preservation, exact
  non-normalized identifiers, inherited translation instructions, semantic
  `<bdi>` isolation, locale-independent error codes, localized ARIA ownership,
  and the explicit `isComposing`-only IME boundary.
- Specialized localized `optgroup` labels and media-track kind/language/label/
  default operations, with `track.src` routed through the same default-deny URL,
  request-accounting, lifecycle, and three-engine network boundary as existing
  sinks.
- Flow-relative block/inline size, inset, margin, padding, border-side, and
  corner-radius longhands in the fixed deny-by-default style ceiling for
  direction-neutral host grants.

### Changed

- Upgraded the Node DOM test realm to `jsdom` 29.1.1 and replaced its deprecated
  `whatwg-encoding` chain with the maintained `@exodus/bytes` implementation.
- Replaced the abandoned `ajv-formats-draft2019` SBOM-validator peer with a
  narrow Ajv adapter retaining its direct RFC 5321 parser semantics, promoted
  CI/release/package Node deprecations to failures, and added a zero-deprecated
  lock gate.
- Renamed the paragraph and text-node factories to `createParagraph()` and
  `createTextNode()` while retaining deprecated same-function `createText()` and
  `createRawText()` aliases, made list-local creation helpers consistently
  detached, and documented that descendants replaced by `setText()` remain
  reusable.
- Added preferred `setReadOnly()`, `setAutoFocus()`, `setColSpan()`, and
  `setRowSpan()` casing while retaining the deprecated former spellings as
  exact-function aliases with identical lifecycle and validation behavior.
- Centralized all public handler event types, snapshot kinds, and root/target
  fence placement in one authoritative catalog consumed by runtime
  registration, fence installation, and exhaustive unit/browser checks.
- Centralized stable version parsing/comparison/advance checks in one module
  shared by release metadata and interrupted-publication recovery, and required
  unique target and empty `[Unreleased]` headings, with the latter immediately
  before the dated release heading.
- Removed `password` from the public input vocabulary and runtime state machine;
  credential-confidentiality deployments now explicitly require a separately
  trusted origin/iframe or process boundary.
- Consolidated UTF-8 quota accounting and enabled TypeScript unused-local and
  unused-parameter diagnostics.
- Replaced the Bun lock and unbounded Bun types with a publishable npm build
  lock and exact development dependency versions.
- Added explicit TypeScript 5.0.4/7.0.2 compatibility checks while retaining
  TypeScript 6.0.3 for tsup 8 declaration generation.
- Removed the unnecessary consumer TypeScript peer dependency and enabled ESM
  source maps with embedded source content.
- Replaced the legacy string-ID/light-DOM initializer with the breaking strict
  profile: a host-owned `ShadowRoot`, root-realm DOM operations, canonical
  owner-branded wrappers, placement checks, quotas, and idempotent disposal.
- The strict initializer now requires a host-supplied SES-compatible `harden`
  own data option and completes each document, specialized wrapper, nested
  style, event, cleanup capability, and URL result before exposure.
- Replaced raw global stylesheet authority and allow-all network sinks with
  root-scoped typed style operations and deny-by-default URL policies.
- Replaced live/native event exposure with immutable primitive snapshots and
  dispatch-scoped cancellation capabilities.
- Replaced the native `Error` subclass boundary with hardened primitive-only
  typed error records and an explicit `isSafeDOMError()` guard.
- Added per-document opaque identifier/name/IDREF namespaces, non-form control
  defaults, canonical specialized lookup, literal list overloads, readonly
  event/type vocabularies, and runtime container-versus-void enforcement.

### Security

- Added fail-closed handling for cross-owner, reparenting, active-element,
  form-default, malformed primitive, and post-disposal behavior in the strict
  profile.
- External raw reparent/adopt/detach placement violations—including entries
  already revoked by an unproven rollback—now revoke wrapper setters/listeners
  and release logical accounting without mutating host-owned markup,
  URL/style/identifier attributes, IDL state, or tree placement.
- Added fail-closed validation for missing, accessor, non-function, no-op,
  shallow, identity-changing, throwing, replacement-returning, and stateful
  hardeners without claiming hardener provenance.
- Added real SES 2.2.0 two-compartment tests, pass-style 1.8.1 checks for copied
  data records, and browser lockdown coverage in all three Playwright engines.
- Documented that a whole `SafeEvent` is a hardened synchronous local control
  record rather than SES pass-by-copy, and that same-agent availability remains
  outside the DOM capability contract.

## [0.3.1] - 2026-07-10

### Added

- Restored `createListItem()`, `createTerm()`, and `createDescription()` on
  `SafeDocument`.

[Unreleased]: https://github.com/notwindstone/ark-of-atrahasis/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/notwindstone/ark-of-atrahasis/compare/v0.5.0...v1.0.0
[0.5.0]: https://github.com/notwindstone/ark-of-atrahasis/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/notwindstone/ark-of-atrahasis/compare/v0.3.1...v0.4.0
[0.3.1]: https://www.npmjs.com/package/ark-of-atrahasis/v/0.3.1
