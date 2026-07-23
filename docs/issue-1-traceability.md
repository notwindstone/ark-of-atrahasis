# Historical Issue #1 implementation traceability (0.4/0.5)

> **Frozen historical record.** This document preserves the 0.4/0.5 umbrella
> security-hardening evidence for
> [issue #1](https://github.com/Vantrongs/ark-of-atrahasis/issues/1). It is not
> the current Ark 1.0 contract: 1.0 removed the resource-control API,
> accounting, caps, associated error codes, and dedicated-Worker availability
> acceptance. Historical statements below are intentionally not rewritten as
> though those earlier contracts never existed. See the
> [Ark 1.0 migration guide](./migration-0.5-to-1.0.md) and the
> [live Issue #29 map](./issue-29-ark-1.0-traceability.md).

The audited integration base for this evidence pass is
`2360347962a2befca8ab0627ab2ee02dd04a74c2`; that is a historical base, not a
claim that the commit containing this document has the same SHA. A criterion
was marked satisfied only where a committed test or artifact check directly
exercised the claim. Repository-complete release machinery was kept separate
from external owner configuration and from an actual tag/publication.

Exact checks for a later code or documentation commit are per-commit CI
evidence. The final live SHA, check-run link, counts, and artifact digest belong
in issue/PR status after CI runs for that immutable commit; embedding them here
would make the next documentation commit stale by construction.

## Exact public boundary

`src/index.ts` exports the sole DOM-authority factory
`createSafeDocument(root: ShadowRoot, options: SafeDocumentOptions)`. The host
must supply `harden` as an own data property and must retain the factory, raw
root, outer host, ambient globals, and raw nodes. The completed `SafeDocument`
exposes only fixed mount operations, fixed element/text factories, logical
local-ID lookup, and irreversible document disposal. Type-specific wrappers
expose only declared operations and no raw node. There is no selector/document
initializer, arbitrary tag factory, root/host/raw-node wrapper or getter,
`createStyle`, raw stylesheet text, or raw CSS rule API.

The completed transition surface retains additive deprecated aliases without
adding authority: `createText()`/`createParagraph()` and
`createRawText()`/`createTextNode()` are identical function objects, as are the
former/preferred casing pairs for readonly, autofocus, column span, and row
span. `createStyle` is removed; list-local helpers are detached; void and table
wrapper shapes are enforced. Internationalized semantics deepen only reviewed
seams: `optgroup` has a localized label operation behind the existing
form gate; `track` has fixed kind/language/label/default operations plus its own
default-deny URL sink; and `bdi` supplies semantic direction isolation. `time`,
`data`, `output`, and `col` remain deliberately shallow fixed factories.

The other runtime exports are frozen quota/rate defaults and vocabularies, pure policy
compilers and validators, and the `isSafeDOMError` record guard; they carry no
DOM capability. `scripts/runtime-export-contract.mjs` is the exact independent
sorted value-namespace allowlist consumed by both the built API and installed
tarball gates. `src/types.ts`, `src/vocabularies.ts`, and the emitted
declarations define the complete type surface. `test/types/positive.ts` and
`test/types/negative.ts` assert literal list overloads, specialized canonical
lookup, readonly snapshots/vocabularies, and container-versus-void restrictions
with TypeScript 5.0.4 and 7.0.2 during the package gate.

## Implementation evidence by concern

### Root, ownership, placement, and lifecycle

- `src/context.ts` validates a native `ShadowRoot` through its owner realm,
  requires effective paint containment on a host with a principal box, claims
  the root once, owns per-document policies/quotas/registry/namespace, audits
  every placement, implements fixed owner-clock operation/request-attempt
  windows in addition to lifetime quotas, fences bubbling events at the root
  and composed non-bubbling `focus`/`blur` at owned targets, and implements
  wrapper/document disposal.
- `src/registry.ts` gives each document a private owner brand, one wrapper per
  real node, stable active/disposed/revoked states, and cross-owner rejection.
- `src/platform.ts` captures root-owner-realm DOM/Web IDL and CSSOM methods and
  accessors, `Performance.now()`, and `Event.stopPropagation()`; containment,
  rate-clock, event-fence, and platform/attacker-thrown values are normalized
  before crossing the API.
- `test/capability-core.test.ts`, `test/lifecycle-placement.test.ts`,
  `test/platform-boundary.test.ts`, and
  `test/property/lifecycle-model.test.ts` cover root guessing, aliases,
  cross-owner resources, iframe/second-realm behavior, raw reparent/adopt/
  detach-to-external revocation, cleanup ordering, stable terminal behavior,
  and exact accounting release/reacquisition.
- `test/rate-limits.test.ts` and `test/property/rate-limits.test.ts` cover exact
  `N`/`N+1`/boundary reset, independent request-attempt windows, hostile rate
  records, captured owner-realm clocks, clock rollback/failure, and generated
  fixed-window traces.

`detach()` is reversible. Disposal is irreversible and idempotent. For owned
placements it aborts wrapper-owned listeners, removes tracked request/style/
identifier effects, detaches nodes still in the mount, releases live accounting
after cleanup, and blocks all later wrapper operations. For a raw node that the
trusted host has already moved outside the mount, placement auditing performs
logical-only revocation: it aborts listeners and releases registry, namespace,
and accounting state without writing attributes, style, text, IDL state, URL
state, or tree placement. An already-issued raw request is host-owned and is not
canceled.

### Policy, forms, events, and errors

- `src/url-policy.ts` compiles a host-selected base and per-sink origin, port,
  protocol, credentials, query, fragment, and length decisions. Missing policy
  or sink denies. Each enabled runtime input is primitive-checked and parsed
  exactly once through the root realm's captured URL constructor.
- `src/style-policy.ts`, `src/style.ts`, and `src/validation.ts` replace raw CSS
  and the old Proxy contract with explicit default-deny `get`/`set`/`remove`
  methods over a fixed property ceiling and fail-closed request-grammar scan.
  The ceiling excludes the six properties proven to activate request-bearing
  host rules without passing through URL policy or request accounting.
- `src/identifier-namespace.ts`, `src/attribute-contract.ts`, and
  `src/input-state-contract.ts` map guest IDs/names/IDREFs to per-document opaque
  tokens, exclude password/submit/file-like states, and validate
  primitive/vocabulary/state relations before reflected IDL mutation. IDREF
  lists stop before token 257 without first allocating an unbounded split array.
  `src/context.ts` parses the exact own-data `formControlPolicy` once; the strict
  default rejects the complete public form surface—`button`, `fieldset`, `img`,
  `input`, `label`, `legend`, `optgroup`, `option`, `output`, `select`, and
  `textarea`—before native node creation, while the exact
  `allowNonCredentialFormElements: true` grant retains structural non-form
  defaults.
- `src/event-catalog.ts` is the authoritative catalog for all 21 public handler
  methods, native event types, snapshot kinds, and root/target fence placement.
  `src/event.ts` snapshots captured standard getters into frozen discriminated
  primitive records and closes cancellation cells in handler `finally` blocks.
  `src/context.ts` derives its abortable root bubble and owned-target fences
  from that catalog so internal target handlers run while later host/document
  delegation is stopped.
  `src/errors.ts` exposes only frozen four-field `SafeDOMError` copy records.
- `test/url-policy.test.ts`, `test/style-membrane.test.ts`,
  `test/form-control-policy.test.ts`, `test/form-isolation.test.ts`,
  `test/identifier-namespace.test.ts`,
  `test/input-state-contract.test.ts`, `test/event-membrane.test.ts`,
  `test/event-catalog.test.ts`, `test/numeric-media-contract.test.ts`, and
  `test/property/security-inputs.test.ts` directly cover those contracts,
  hostile getters/coercion, native/custom exception replacement, exact numeric
  relations, and generated malformed inputs.

The event fence does not claim generic capture-phase isolation. Earlier
document/host capture listeners run before dispatch reaches the `ShadowRoot`;
the trusted host must keep those listeners safe and filter plugin-origin events
when capture observation matters. Unit and three-engine browser tests assert
both sides of that contract, including deterministic fence cleanup on document
disposal.

A whole `SafeEvent` is deliberately a hardened synchronous local control
record, not an SES pass-by-copy value and not an eventual-send value, because it
contains dispatch-scoped cancellation methods. Its copied target/touch data
records, URL decisions, and `SafeDOMError` records are pass-by-copy. This is the
contract asserted by `test/ses.node.mjs`; no broader whole-event transport claim
is made.

### Internationalization and accessibility semantics

- `SafeElement` keeps absent, empty, and non-empty local `lang` states distinct;
  exposes validated local `dir` and inherited/local `translate` state; and can
  clear all three declarations. Values are exact caller strings: no Unicode
  normalization, locale-sensitive case conversion, or frozen IANA registry is
  applied.
- `createBdi()` supplies intrinsic-auto semantic isolation without exposing
  `<bdo>`, CSS `direction`, `unicode-bidi`, or writing-mode authority. The fixed
  style ceiling adds 34 logical size, inset, margin, padding, border-side, and
  radius longhands, each still requiring an explicit host grant.
- Specialized `optgroup` and `track` wrappers expose localized labels and fixed
  track metadata. `track.src` is the seventh independent, default-deny URL sink
  and uses the common canonicalization, attempt/rate, live-resource, rollback,
  placement, and disposal contracts. Parent/media aggregate conformance and
  live `TextTrack`/cue/WebVTT authority remain explicitly outside the wrapper.
- `test/i18n-contract.test.ts`, `test/url-policy.test.ts`,
  `test/style-membrane.test.ts`, `test/rate-limits.test.ts`, and
  `test/lifecycle-placement.test.ts` cover exact Unicode/UTF-8 behavior, IDN
  canonicalization and confusable separation, localized ARIA values and opaque
  logical IDREFs, logical CSS, track metering, and owned/external lifecycle.
  `test/browser/i18n.spec.mjs` checks native inheritance/bidi/translate/layout
  behavior and an actual VTT request in Chromium, Firefox, and WebKit. Existing
  event/SES matrices preserve `isComposing`; composition and `beforeinput`
  lifecycle authority remains out of scope. The matrix records Firefox's lack
  of effective `:lang()` matching through the shadow host and WebKit's
  renderer-owned VTT cue blobs instead of claiming identical engine behavior.

### Browser, SES, and availability

- `test/browser/boundary.spec.mjs` runs a committed CSS/URL/ID/lifecycle corpus,
  request/navigation interception, strict default form-value denial, opt-in
  opaque identifier/form isolation, raw-host placement cases, one explicitly
  approved image request, fenced delegated
  click/hotkey/action/form/focus gadgets, and owner-realm iframe behavior in
  Chromium, Firefox, and WebKit.
- `test/browser/containment.spec.mjs` grants fixed, viewport-sized, high-z-index,
  pointer-active styles and proves geometry clipping and outside hit testing at
  a bounded paint-contained host in all three engines.
- `test/browser/ses.spec.mjs` runs after SES 2.2.0 lockdown in a real Compartment
  in all three engines. Its matrix covers absent raw/global authority, exact
  operation/request-attempt windows, dispatch of all 21 methods imported from
  the authoritative event catalog, every generic/keyboard/mouse/pointer/touch/
  focus/input field, hostile getters, cancellation lifetime/reentrancy,
  normalized errors, URL/style policy with a zero-activity ledger,
  form/password rejection, cross-owner failure, external-state preservation and terminal
  state, finite numeric rejection, and exact quota failure/release. Chromium
  and Firefox use full constructed touch records; WebKit's rejected constructors
  select an explicit trusted-touch injection substitute that still checks every
  public field without claiming pre-dispatch malicious touch getters.
- `test/browser/autofill-limit.spec.mjs` runs only in a dedicated Playwright
  1.61.1 Chrome-for-Testing `chromium` channel project. Chromium address
  Autofill positively fills an opt-in safe email that remains readable through
  `getValue()` despite `autocomplete="off"`, opaque IDs/names, `form === null`,
  and Shadow DOM, while the external host value, FormData, and named state stay
  unchanged. The strict default exposes no anchor/sink. This is a CDP address
  Autofill limitation witness, not password-manager or credential-store proof.
- `test/ses.node.mjs` runs two mutually distrusting compartments with independent
  roots and checks copied records with `@endo/pass-style` 1.8.1.
- `test/browser/worker-termination.spec.mjs` proves host termination of an
  unyielding dedicated Worker that continuously mutates shared memory in
  Chromium, Firefox, and WebKit while the page remains responsive. It returns
  after `terminate()`, waits outside the inspected page evaluation, and uses
  fresh observations to prove shared effects stopped.
- `test/worker-termination.node.test.mjs` separately proves that Node
  `worker_threads` terminates an unyielding CPU/`Atomics.add` loop after the host
  observes shared-memory progress.

A one-off diagnostic showed that keeping one inspector evaluation open while
waiting after `Worker.terminate()` delays Chromium's parent-thread forced-
termination task and creates a false failure; returning from that evaluation
before waiting closes the harness artifact. The committed test proves real
unyielding dedicated-Worker termination, not arbitrary same-agent browser-page
main-thread preemption. Same-thread SES denial of service remains an explicit
non-goal.

## Thirteen acceptance criteria

| # | Status | Direct source and test evidence | Limits / outstanding authority |
| ---: | --- | --- | --- |
| 1 | **Satisfied** | `src/index.ts` accepts only a native `ShadowRoot` and returns mount operations without root/host access; `src/context.ts` claims it once and requires computed paint containment on a host with a principal box. Capability, built-package, containment, and SES tests reject string IDs/uncontained roots and show the guest has no factory/root/document/window endowment. | The trusted host still owns the outer host and must maintain containment and controlled bounds for the capability lifetime; immutability is from the guest boundary. |
| 2 | **Satisfied** | `DocumentContextImplementation.#auditPlacements()` runs after operation reservation, and terminal cleanup independently classifies every tracked entry as owned-physical or logical-only before registry removal. `test/lifecycle-placement.test.ts`, `test/property/lifecycle-model.test.ts`, `test/numeric-media-contract.test.ts`, and `test/browser/boundary.spec.mjs` cover raw reparent, adopt, and detach-to-external cases with exact markup/IDL preservation plus revoked setters and listeners; deterministic regressions also cover style, URL, canvas, IDL, and namespace entries already revoked by unproven rollback before the host move. | A host-retained external raw node is not sanitized: its physical DOM, canvas dimensions, and already-issued URL remain host-owned while guest wrappers, listeners, namespace state, and accounting are revoked/released. |
| 3 | **Satisfied for the documented boundary values** | `src/platform.ts`, `src/event.ts`, and `src/errors.ts` replace platform exceptions and event graphs with frozen primitive records. `test/platform-boundary.test.ts`, `test/event-membrane.test.ts`, `test/completion-boundary.test.ts`, and `test/ses.node.mjs` check no DOM/global/function/native exception escapes and copied nested data has the documented pass style. | A whole `SafeEvent` is a local hardened control record, deliberately not pass-by-copy/eventual-send. |
| 4 | **Satisfied** | `src/event-catalog.ts` authoritatively maps all 21 public methods to native types, snapshot kinds, and fences; runtime registration and unit/post-lockdown three-engine dispatch tests consume it directly. Captured branded accessors, primitive defaults, deep completion, independent native-event cells, and dispatch-scoped cancellation cover malicious getters, every public field/type, reentrancy, callback throws, and closed controls. | Cancellation is synchronous only by design. WebKit touch construction is replaced by an explicit trusted-injection path, so pre-dispatch malicious touch getters are not claimed there. |
| 5 | **Satisfied for public URL sinks and the validated style activators** | `src/url-policy.ts` is default-deny and per-sink; element URL setters apply only an allowed canonical string. The fixed style ceiling excludes `animation-name`, `animation-duration`, `display`, `font-family`, `font-style`, and `font-weight`, whose URL-free values were shown to activate request-bearing host rules outside that policy. `test/style-membrane.test.ts` fixes the exclusion inventory; browser boundary tests intercept request/navigation/form activity and observe exactly one explicitly approved image request in the grant case and none for denied sinks/actions. `test/browser/i18n.spec.mjs` separately proves a granted localized `track.src` fetches the exact VTT asset in Chromium, Firefox, and WebKit and is removed on disposal. | The host remains responsible for policy selection, host stylesheet content, and defense-in-depth CSP/navigation controls. |
| 6 | **Satisfied by strict default denial; opt-in limitation is explicit** | `src/context.ts` and `src/index.ts` route all eleven public form-surface factories through one policy seam and deny them after operation reservation but before native node creation unless the host supplies the exact `allowNonCredentialFormElements: true` grant. Unit, type, built-package, SES, and three-engine browser cases prove stable full-inventory denial plus unchanged external host submission, FormData, named access, radio grouping, labels, and IDREFs for the opt-in profile. The dedicated Chromium address-Autofill test proves the strict profile has no sink and positively witnesses that an opt-in email can be filled/read without changing external host state. | Same-origin opt-in controls are not autofill/PII confidential. The Chromium address CDP witness is not password-manager proof. Credential UI requires a separately trusted cross-origin iframe/origin or process/RPC boundary plus deployment-browser and credential-agent testing. |
| 7 | **Satisfied under the documented disposal contract** | `src/registry.ts` enforces canonical owner identity; `src/context.ts` implements idempotent terminal states, owned physical cleanup, and external logical-only revocation. Canvas registration and both dimension setters share aggregate pixel accounting; captured dimensions are validated and mutation/cleanup writes are read back before commit or release. `test/capability-core.test.ts`, `test/lifecycle-placement.test.ts`, `test/numeric-media-contract.test.ts`, `test/platform-boundary.test.ts`, `test/property/lifecycle-model.test.ts`, and browser SES tests cover cross-owner failure, exact external-state preservation, invalid/no-op accessors, proven and unproven setter rollback, accounting release/reacquisition, repeated dispose, and stable post-dispose errors. | Owned disposal removes tracked physical effects. External revocation deliberately preserves every raw DOM field, canvas dimension, and tree position while removing wrapper authority and logical ownership state. |
| 8 | **Satisfied** | `src/context.ts` resolves the supplied root's `ownerDocument/defaultView`; `src/platform.ts` captures that realm without ambient `instanceof`, including native host and computed-style access. Platform tests poison ambient constructors, root getters, and computed-style operations while proving owner-realm operation or normalized failure; the browser iframe case covers a second realm. | No claim is made for non-standard DOM implementations outside the checked contracts. |
| 9 | **Satisfied** | `src/attribute-contract.ts`, `src/input-state-contract.ts`, `src/primitives.ts`, `src/platform.ts`, and `src/errors.ts` enforce primitive, finite/integer/range/relation rules and one stable error-record policy. Numeric/input/platform/property tests cover hostile inputs, atomic failures, media IDL, and native exception replacement. | The stable rejection value is a record, not an `Error` subclass. |
| 10 | **Satisfied** | `src/types.ts` and `src/vocabularies.ts` encode readonly snapshots, literal vocabularies, specialized lookup, list overloads, container/void shapes, language/direction/translation states, media-track kinds, and semantic bidi isolation. Runtime/API/type tests require preferred factory/casing names and exact deprecated same-function aliases, uniformly detached list helpers, reusable descendants after `setText()`, localized `optgroup`/`track` operations, and password rejection; package tests compile declarations with TypeScript 5.0.4 and 7.0.2. | `createStyle` is gone; void/table shapes are corrected. `time`, `data`, `output`, and `col` remain deliberately shallow rather than gaining speculative authority or being removed incompatibly. |
| 11 | **Satisfied with dedicated-Worker termination scope** | `DEFAULT_SAFE_DOCUMENT_QUOTAS` fixes all twelve lifetime limits, including aggregate live canvas pixels. `DEFAULT_SAFE_DOCUMENT_RATES` adds real fixed owner-clock windows for operations and request attempts; strict policy denials reserve the operation rate/lifetime call before policy evaluation. Unit/property/API/three-engine SES tests exercise denial metering, exact `N`/`N+1`/reset, hostile configuration/clock failure, generated traces, lifetime separation, canvas creation/replacement/cleanup, and stable errors. Browser Worker tests prove termination of a real unyielding shared-memory loop in all three engines; Node proves an unyielding CPU/Atomics loop terminates. | No arbitrary same-agent browser-page main-thread preemption claim. The bounded IDREF parser is defense-in-depth, not a preemption guarantee. Lifetime `operations`/`requestAttempts` ceilings remain cumulative while their independent rate windows reset. |
| 12 | **Satisfied under the layered exact gate** | In Chromium, Firefox, and WebKit, boundary and containment suites exercise browser geometry/network/form/realm and delegated-event behavior; the real-Compartment SES matrix dispatches all 21 catalog-derived event types, covers every public event family/field plus rates and browser-relevant criteria 1–12, and the Worker suite proves unyielding-loop termination. The separate Chromium-channel project executes the non-portable CDP address-Autofill witness exactly once. TypeScript, property/model, Node SES, release, and packed-artifact invariants remain exact dedicated gates because they are not browser-runtime contracts. | Standard Firefox/WebKit/Chromium projects do not run a Chromium-only protocol test. WebKit uses the documented trusted-touch substitute because scripted `Touch` construction is rejected. No portable password-store or same-agent page-main-thread preemption coverage is claimed. |
| 13 | **Repository-complete; publication outstanding** | `scripts/test-package.mjs` creates a pristine Git archive under exact Node 26.5.0/npm 11.18.0, builds rolling-ESNext output twice byte-identically, installs the exact tarball offline, rejects any missing or extra root runtime export against `scripts/runtime-export-contract.mjs`, checks declarations, executes every literal executable packed README fence in TypeScript 5.0.4/7.0.2 and Chromium, rebuilds packed `dist`, and emits the tested tarball, checksum manifest, and a strict-schema-validated CycloneDX 1.7 SBOM. The SBOM generation is itself byte-reproducible, removes time/random fields, records the pinned npm/normalizer/validator toolchain, and binds the root component SHA-256 to the exact tested tarball. Release metadata requires empty `[Unreleased]` before the dated target heading; shared `scripts/stable-version.mjs`, recovery tests, and the workflow enforce one stable version contract plus exact interrupted-publication recovery and artifact handoff. `.github/workflows/security.yml` adds SHA-pinned all-scope dependency review at `low` severity plus frozen scheduled/manual advisory and npm signature/attestation checks; the `main` check reuses its installed graph for the push signature gate. | No repository evidence here claims a `0.5.0` tag/publication. npm trusted publisher, protected environment/tag policy, signed-tag trust, immutable releases, and actual publish/provenance evidence are external owner actions. Dependency graph, Dependabot, CodeQL, and required-check settings must still be configured in each receiving repository. |

The repository strict runtime/type/browser contract in criteria 1–12 is covered
by committed gates. Criterion 13 still requires external owner configuration,
tagging, and publication, so this document does not claim that issue #1 or the
release is externally complete.

## Property/model and reproducibility details

- `fast-check` is pinned at `4.9.0`; `test/support/property-config.ts` fixes the
  default seed at `0x0a7a4515` and supports `FC_SEED`, `FC_PATH`,
  `FC_COMMAND_REPLAY_PATH`, and `FC_END_ON_FAILURE=1`.
- `test/property/security-inputs.test.ts` has 20 generated properties at 300
  cases each across CSS grammar, URL dimensions/normalization, hostile
  non-coercion, numeric relations, UTF-8 accounting, and thrown-value
  normalization.
- `test/property/rate-limits.test.ts` has two 160-run fixed-window properties
  for operation and denied request-attempt traces, including zero limits,
  repeated timestamps, exact rejection, and monotonic reset sequences.
- `test/property/lifecycle-model.test.ts` has eight topology/quota/replay tests:
  a 100-run topology profile up to 40 commands, a 150-run exact-quota profile
  with limits 0–8 and up to 24 commands, deterministic command-family traces,
  external raw-markup preservation after logical revocation, and runner/command
  replay paths.
- `scripts/test-package.mjs` requires Node 26.5.0 from the packed
  `.node-version` and the npm 11.18.0 CLI via
  `npm_execpath`, a clean committed tree, no pre-existing `dist/` in the Git
  archive, exact manifest/lock pins and registry integrity records, relative
  source maps with embedded content, two byte-identical prepack tarballs, an
  offline consumer install, literal minimum/current typecheck and Chromium
  execution of every executable packed README fence, exact installed ESM root
  namespace comparison with `scripts/runtime-export-contract.mjs`, and a
  byte-for-byte `dist` rebuild. `scripts/readme-examples.mjs` recognizes CommonMark backtick/tilde,
  length, and indentation forms and structurally rejects unclosed or unsupported
  executable fences instead of maintaining a copied example.
- `.node-version` is the single checkout-job runtime source and is handed from
  the credential-free release job to the no-checkout publish job. The same
  source, strict TS 6/7 configs, isolated tsdown tooling config, and Fallow
  3.6.0 report configuration are present in the verified source package. Native
  `Temporal.PlainDate` rejects calendar-impossible changelog headings without
  adding a browser dependency; pinned WebKit 26.5 still lacks `Temporal`.
  The packed source now includes the check/release/security workflow fixtures
  consumed by the release tests, preserving the same Fallow graph outside the
  worktree.
- `scripts/sbom.mjs` upgrades npm 11.18.0's locked-dependency graph to the
  current CycloneDX 1.7 JSON envelope, removes UUID/time nondeterminism, binds
  the root component to the exact tarball SHA-256, and requires two consecutive
  outputs to match byte-for-byte. The final serialized bytes must pass the
  official schema bundle shipped by pinned `@cyclonedx/cyclonedx-library`
  10.1.0 using pinned Ajv 8.20.0 and `ajv-formats` 3.0.1 before artifact
  handoff. The local `idn-email` adapter removes the abandoned
  `ajv-formats-draft2019` peer while preserving its RFC 5321 parser semantics,
  including quoted and UTF-8 local parts. Complete CI/release and local package
  gates promote Node deprecations to failures, while release tests reject every
  lock-marked deprecated package. Components describe the shipped
  shrinkwrap/source build closure rather than a per-file tarball inventory; the
  package has zero runtime dependencies. An exact inventory gate compares each
  non-root, non-link packed-shrinkwrap installed alias/version (deduplicated by
  that identity) with the component set; the root digest supplies the exact
  artifact binding.
- `scripts/stable-version.mjs` is the single parser/comparator/advance contract
  imported by metadata verification and release recovery. The publish job
  extracts it beside the recovery script from the verified tarball, and the
  dated target release is accepted only when its heading and the immediately
  preceding empty `[Unreleased]` heading are both unique.

## PR chain and live CI

At the 2026-07-15 evidence observation, umbrella
[PR #7](https://github.com/Vantrongs/ark-of-atrahasis/pull/7) was an open draft
from `agent/issue-1-integration` to `main`. That state is historical, and PR prose
or state is not acceptance evidence by itself.

Initial draft stacks [#2](https://github.com/Vantrongs/ark-of-atrahasis/pull/2),
[#3](https://github.com/Vantrongs/ark-of-atrahasis/pull/3),
[#4](https://github.com/Vantrongs/ark-of-atrahasis/pull/4),
[#5](https://github.com/Vantrongs/ark-of-atrahasis/pull/5), and
[#6](https://github.com/Vantrongs/ark-of-atrahasis/pull/6) were also open drafts
at that observation; their PR state is not evidence of merge. Selected work was
integrated into PR #7 and then completed by these merged PRs to
`agent/issue-1-integration`:

- [#8](https://github.com/Vantrongs/ark-of-atrahasis/pull/8) protected release
  workflow (`d640dde`);
- [#9](https://github.com/Vantrongs/ark-of-atrahasis/pull/9) real-browser
  harness (`979aa0d`);
- [#10](https://github.com/Vantrongs/ark-of-atrahasis/pull/10) owner-realm
  platform boundary (`c9937cd`);
- [#11](https://github.com/Vantrongs/ark-of-atrahasis/pull/11) SES capability
  completion (`eb55770`);
- [#12](https://github.com/Vantrongs/ark-of-atrahasis/pull/12) input/attribute
  contracts (`5eb3b77`);
- [#13](https://github.com/Vantrongs/ark-of-atrahasis/pull/13) identifier/form
  namespace (`022c308`);
- [#14](https://github.com/Vantrongs/ark-of-atrahasis/pull/14) terminal detach
  rollback fix (`9b5e9de`);
- [#15](https://github.com/Vantrongs/ark-of-atrahasis/pull/15) public type/runtime
  completion (`0361972`); and
- [#16](https://github.com/Vantrongs/ark-of-atrahasis/pull/16) property/model and
  hard Worker coverage, merged at `cc8df22`; and
- [#17](https://github.com/Vantrongs/ark-of-atrahasis/pull/17) final evidence
  documentation (`f509787`);
- [#18](https://github.com/Vantrongs/ark-of-atrahasis/pull/18) transactional
  rollback and cleanup reporting (`26487e0`); and
- [#19](https://github.com/Vantrongs/ark-of-atrahasis/pull/19) interrupted
  release recovery hardening, merged into the audited integration base
  `4cb4da1`;
- [#20](https://github.com/Vantrongs/ark-of-atrahasis/pull/20) strict contract
  gap closure (head `4cc5f05`), merged at `39d227a`;
- [#21](https://github.com/Vantrongs/ark-of-atrahasis/pull/21) runtime rates and
  strict event boundary (head `5fb320e`), merged at `33817f6`; and
- [#22](https://github.com/Vantrongs/ark-of-atrahasis/pull/22) strict-default
  form-control policy (head `bd41ab0`), merged into this pass's historical base
  at `c316986`; and
- [#23](https://github.com/Vantrongs/ark-of-atrahasis/pull/23) primary release,
  compatibility API, event-catalog, and browser evidence gap closure, merged at
  `2360347`; and
- [#24](https://github.com/Vantrongs/ark-of-atrahasis/pull/24) final contract
  closure for external raw preservation, form-surface policy metering, and the
  exact runtime namespace, merged at `d685401`;
- [#25](https://github.com/Vantrongs/ark-of-atrahasis/pull/25) i18n and
  deterministic CycloneDX 1.7 completion, merged at `57a40bf`; and
- [#26](https://github.com/Vantrongs/ark-of-atrahasis/pull/26) deprecated
  dependency-path removal, merged at `f538767`.

Fork umbrella [#27](https://github.com/Vantrongs/ark-of-atrahasis/pull/27)
added the continuous dependency, registry-signature, Dependabot, and CodeQL
security layer and merged at `f79eee7` after exact-head and immutable-merge CI
completed successfully.

Exact check counts, artifact digests, and links are intentionally not copied
into this mutable document. They belong to the CI check for the immutable head
commit and to the PR status that identifies that head.

## External owner and legal status

Repository code/tests cannot configure npm trusted publishing, a protected
GitHub `npm` environment, required reviewers, branch/tag protection, a signed-
tag trust policy, immutable GitHub releases, npm account controls, or retention
policy. On 2026-07-16 the Vantrongs fork's live GitHub API reported strict
`main` protection requiring `check`, `dependency-review`, and `CodeQL`, with
admin enforcement and conversation resolution enabled and force pushes and
deletion disabled. No accessible `npm` environment was present; the canonical
upstream's private/owner settings could not be verified with the available
authority.

The exact release source and build inputs are included in the package allowlist,
but an owner with qualified legal advice must still select and document the
applicable GPLv3 section 6 conveyance method. The published npm `0.1.0` manifest
and its included license reportedly disagree (MIT versus GPLv3); no code or
documentation change here retroactively relicenses it. Deprecation wording and
any legal claim remain owner/legal actions.
