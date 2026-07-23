# ark-of-atrahasis

`ark-of-atrahasis` is an ESM-only, capability-oriented DOM wrapper for
host-controlled Secure ECMAScript (SES) integrations. The repository is at the
`1.0.0` source state: it requires a host-created `ShadowRoot`
whose host has effective CSS paint containment, plus a host-supplied SES
`harden`. It exposes fixed wrapper operations rather than raw DOM nodes, denies
URL and inline-style authority unless the host grants it, and deterministically
revokes owned wrappers and tracked effects.

This source state does **not** claim that `1.0.0` has been tagged, published to
npm, or released on GitHub. Publication is exclusively an upstream-maintainer
action through the protected release workflow. Verify the registry version and
its provenance before treating `npm install ark-of-atrahasis` as the contract
documented here.

## Public capability boundary

The package has one ESM root export and no package subpaths. Its runtime exports
are exactly the sorted allowlist in `scripts/runtime-export-contract.mjs`:

- the authority-bearing `createSafeDocument` factory;
- the pure policy helpers `createURLPolicy`, `createStylePolicy`,
  `canonicalizeStyleProperty`, and their frozen ceilings `URL_SINKS` and
  `SAFE_STYLE_PROPERTIES`;
- the pure validators `requireFiniteNumber`, `requireInteger`,
  `requirePrimitiveBoolean`, `requirePrimitiveString`, and
  `scanCSSNetworkRisk`;
- the `isSafeDOMError` record guard; and
- the frozen vocabulary arrays `ARIA_IDREF_LIST_NAMES`, `ARIA_IDREF_NAMES`,
  `ARIA_ROLES`, `AUTOCOMPLETE_VALUES`, `BUTTON_TYPES`, `DIR_VALUES`,
  `ENTER_KEY_HINT_VALUES`, `FORMATTING_TAGS`, `HEADING_LEVELS`,
  `IMAGE_LOADING_VALUES`, `INPUT_MODE_VALUES`, `INPUT_TYPES`, `LIST_TYPES`,
  `SPECIALIZED_ELEMENT_KINDS`, `TABLE_SCOPE_VALUES`, `TEXTAREA_WRAP_VALUES`, and
  `TRACK_KINDS`.

Only `createSafeDocument(root, options)` grants DOM authority. The returned
`SafeDocument` has mount operations, fixed `create*` factories, logical local-ID
lookup, and `dispose()`. Its wrappers expose only their type-specific text,
attribute, inline-style, event, tree, detach, and disposal methods. There is no
public selector/document initializer, arbitrary-tag factory, raw-root/host/node
getter, raw stylesheet factory, or raw CSS rule/text API. The pure policy and
validation exports do not grant DOM authority.

The trusted host must retain the factory, raw `ShadowRoot`, outer host element,
`document`, `window`, and all raw DOM nodes. Guest code receives only the
completed `SafeDocument` or selected wrappers. From that boundary it cannot
remove, rename, style, or clear the outer host because no reference or wrapper
for the root or host is exposed; the trusted host itself retains that authority.

All public `create*` factories return detached wrappers, including
`list.createItem()` and the description-list `createTerm()`/
`createDescription()` conveniences. `createParagraph()` creates `<p>`, while
`createTextNode()` creates a text node. `setText()` replaces a container's DOM
children; wrappers for those detached descendants remain active and may be
explicitly reattached until they are disposed or revoked.

The `1.0.0` declarations retain additive transition aliases: `createText()` is
the exact same function as `createParagraph()`, `createRawText()` is the exact
same function as `createTextNode()`, and the former casing of `setReadonly()`,
`setAutofocus()`, `setColspan()`, and `setRowspan()` delegates to the preferred
`setReadOnly()`, `setAutoFocus()`, `setColSpan()`, and `setRowSpan()` functions.
The aliases are deprecated but preserve the same owner, lifecycle, validation,
and error behavior; they do not create a second authority path.

The emitted declarations enumerate the complete `SafeDocument`, specialized
wrapper, event, policy, error, vocabulary, and readonly/container-versus-void
type surface. `test/types/positive.ts` and `test/types/negative.ts` check that
surface with TypeScript 5.0.4 and 7.0.2.

## Host bootstrap

Call SES `lockdown()` before importing this package. Create one exclusively
owned `ShadowRoot`, and pass the resulting global `harden` as the required own
data property `options.harden`.

```js
import "ses";

lockdown();

const { createSafeDocument } = await import("ark-of-atrahasis");
const hostElement = document.querySelector("#plugin-a-root");
if (!(hostElement instanceof HTMLElement)) throw new Error("plugin host is missing");
hostElement.style.contain = "paint";
const root = hostElement.attachShadow({ mode: "closed" });
const safeDocument = createSafeDocument(root, {
  harden,
  stylePolicy: { allowedProperties: ["color", "background-color"] },
  urlPolicy: {
    baseURL: "https://app.example/",
    sinks: {
      "image.src": {
        allowedOrigins: ["https://cdn.example"],
        allowedProtocols: ["https:"],
      },
    },
  },
});

const compartment = new Compartment({ safeDocument });
```

Initialization reads the host's computed `contain` and `display` values through
captured APIs from the `ShadowRoot` owner realm. It rejects a missing paint
containment component and display boxes on which paint containment is
ineffective: absent boxes (`none`/`contents`), non-atomic inline boxes, internal
ruby boxes, and internal table boxes other than cells. The `paint`, `content`,
and `strict` containment forms are accepted on supported block, atomic-inline,
table-cell, flex, grid, list-item, flow-root, and table boxes. The host must
establish containment before calling `createSafeDocument()` and maintain it,
together with controlled host bounds, for the lifetime of the `SafeDocument`.

Omitting `urlPolicy` denies all seven URL sinks. An omitted sink is denied;
enabled sinks separately constrain canonical origin (including port), protocol,
credentials, query, fragment, and maximum length. Omitting `stylePolicy` denies
all inline-style properties. A style grant selects from the library's fixed
property ceiling. The ceiling excludes `animation-name`, `animation-duration`,
`display`, `font-family`, `font-style`, and `font-weight`: URL-free values for
those properties can activate request-bearing host stylesheet rules without
passing through URL policy. Values containing direct
URL/request grammar, indirection, malformed CSS, or non-primitive input are
also rejected. Raw stylesheets and global selectors are not part of the API.

The package has zero runtime dependencies and does not import SES. It
behaviorally checks that the supplied hardener returns the same value and deeply
freezes each completed graph, including later wrappers, nested style methods,
event records, cleanups, decisions, and errors. JavaScript cannot prove the
hardener's provenance: a test double outside tests does not satisfy the security
precondition.

The default strict profile does not create any element in the complete public
form surface: `button`, `fieldset`, `img`, `input`, `label`, `legend`,
`optgroup`, `option`, `output`, `select`, and `textarea`. This includes the
HTML Standard's form-associated elements represented by the API, including the
historically form-associated `img`, plus their public label/grouping helpers
([WHATWG form categories](https://html.spec.whatwg.org/multipage/forms.html#categories)).
Each factory fails before native node creation with
`FORM_CONTROL_POLICY_REQUIRED`. A host that needs same-origin,
non-credential form structure must explicitly acknowledge the weaker surface
with the exact own-data option
`formControlPolicy: { allowNonCredentialFormElements: true }`.

The policy and its grant are read once through own data descriptors. Accessors,
non-records, extra keys, and values other than primitive `true` fail with
`ERR_INVALID_POLICY` without claiming the root, so corrected initialization can
retry. The grant does not enable password, hidden, file, submit, or reset input
states and does not promise autofill or PII confidentiality.

## Threat model and lifecycle contract

- **Ownership and placement:** one `SafeDocument` claims one native
  `ShadowRoot`. Wrappers are canonical and owner-branded. Cross-owner/forged
  wrappers fail. Each operation audits actual owner-document placement; raw-host
  reparent, adoption, or detach-then-external insertion revokes the affected
  wrappers before a later guest mutation can touch external DOM. Revocation
  aborts wrapper-owned listeners and releases logical registry and namespace
  ownership, but does not write the external node's attributes,
  style, text, IDL state, or tree placement.
- **Identifiers and forms:** logical IDs, names, IDREFs, and IDREF lists map to
  per-document opaque physical tokens. The strict default denies all eleven
  public form-surface factories listed above. The explicit non-credential
  opt-in initializes applicable controls with structural non-form defaults;
  buttons remain `type="button"`, and password, hidden, file, submit, and reset
  states remain unavailable. Address, email, telephone, or username-like
  values may still be autofilled and read by the guest despite
  `autocomplete="off"`, opaque identifiers, `form === null`, and Shadow DOM.
  The HTML autofill standard permits user-agent override of author hints and
  does not make a ShadowRoot a no-autofill boundary
  ([WHATWG HTML autofill](https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#autofill)).
  If an integration handles credentials or requires autofill/PII
  confidentiality, place the UI behind a separately trusted cross-origin
  iframe/origin or a separate process/RPC boundary, then test the deployed
  browser and credential agent directly.
- **Events and errors:** handlers receive deeply frozen primitive snapshots made
  through captured standard accessors. Malicious getters and platform failures
  collapse to primitive defaults or frozen `SafeDOMError` records without
  native/custom exceptions, stacks, causes, DOM nodes, globals, or functions.
  Cancellation functions are usable only during the synchronous callback and
  return `false` afterward. Captured listeners stop advertised bubbling events
  at the strict `ShadowRoot` seam and stop native composed, non-bubbling
  `focus`/`blur` at each owned target. Host or document bubble-delegated
  handlers, hotkeys, or action/form gadgets therefore do not run, while
  target-local `SafeElement` handlers do. This is not generic
  capture-phase isolation: capture listeners on `document`, the host, or another
  earlier ancestor have already run before the event reaches the root. Trusted
  integrations must keep capture handlers capability-safe and filter plugin
  origins there when capture observation itself matters.
  One authoritative catalog defines all 21 public handler methods, native event
  types, snapshot families, and root/target fence placement. Unit registration
  checks and post-lockdown Chromium, Firefox, and WebKit dispatch tests consume
  that catalog directly, so an advertised handler cannot silently drift from
  its runtime fence or snapshot kind.
- **SES pass style:** copied event target/touch records, URL decisions, and
  `SafeDOMError` records are pass-by-copy. A whole `SafeEvent` is deliberately a
  hardened synchronous local control record, not SES pass-by-copy and not an
  eventual-send value, because it contains time-bounded cancellation methods.
- **Detach and disposal:** `detach()` (and deprecated `remove()`) is reversible.
  Wrapper or document `dispose()` is irreversible and idempotent, closes future
  wrapper mutation, aborts wrapper-owned listeners, removes tracked URL/style
  and identifier effects, zeroes owned canvas dimensions, detaches owned nodes
  still in the mount, and returns stable
  disposed/revoked errors on later operations.
  Those physical cleanup writes apply only while the node remains owned. If the
  trusted host has already moved a raw node outside the mount, revocation leaves
  its complete physical DOM state unchanged—including tracked ID/name/IDREF,
  style, URL attributes, and canvas dimensions as well as ordinary text/IDL
  state—while aborting wrapper listeners and releasing logical state.
  Guest setters are then revoked; an already-issued raw URL/request remains
  under host ownership and is not cleared by the wrapper.
- **Layout and host authority:** required paint containment clips guest paint
  and hit testing to the bounded host even when the host grants fixed,
  viewport-sized, high-z-index styles. The event fence is deliberately
  narrower than an event sandbox and cannot undo earlier capture listeners. The
  host must still control host geometry, raw nodes, endowments, navigation,
  CSP, capture handlers, and integration lifetime.

## Availability non-goal

Ark confines DOM authority; it does not meter resource use, rate-limit calls,
schedule guest code, preempt a JavaScript agent, or provide a Worker lifecycle
contract. Same-agent SES code can therefore block its agent indefinitely. Hosts
that require availability must isolate untrusted work behind a Worker,
process, or RPC boundary and test that boundary's limits and termination
semantics against their deployed runtime. Those host controls are not part of
Ark's API or acceptance claim.

## Internationalization contract

The library has no built-in user interface or locale catalog. The host owns the
page/default language and locale selection; the guest application owns its
rendered and accessible localized strings. Guest text,
titles, ARIA values, form values, and other natural-language content come from
the caller and are preserved as primitive JavaScript/DOM strings. The wrapper
does not apply Unicode normalization: canonically equivalent strings such as
NFC `é` and NFD `e` plus a combining acute accent remain distinct logical IDs.
This preserves exact caller data and avoids hidden identifier remapping.

`setLang()` writes the HTML `lang` attribute unchanged. The empty string remains
present and means that the language is explicitly unknown; `clearLang()` removes
the local declaration and returns to inheritance, including inheritance from a
shadow host. `getLang()` distinguishes those states as `""` and `undefined`.
Non-empty values are caller-selected [BCP 47](https://www.rfc-editor.org/rfc/rfc5646)
language tags; the library deliberately does not freeze a copy of the evolving
IANA language-subtag registry or rewrite unknown future/private-use tags.
`setDir()` accepts only the HTML keywords `ltr`, `rtl`, and `auto` (ASCII
case-insensitively); `clearDir()` removes the local declaration and `getDir()`
reports only the local state. Ordinary elements then participate in
inheritance, while `<bdi>` returns to its intrinsic `auto` directionality. The
browser applies the Unicode bidirectional algorithm;
`auto` is suitable only when the caller cannot supply the direction explicitly.
These behaviors follow the
[HTML language and direction contract](https://html.spec.whatwg.org/multipage/dom.html#the-lang-and-xml:lang-attributes).
`setTranslate(boolean)` writes the local HTML `yes`/`no` translation
instruction; `clearTranslate()` restores inheritance and `getTranslate()`
reports `true`, `false`, or `undefined` for the local state. This supports
localization tooling without granting an arbitrary attribute setter, following
the [HTML translation-mode contract](https://html.spec.whatwg.org/multipage/dom.html#the-translate-attribute).
`createBdi()` provides
[semantic bidirectional isolation](https://html.spec.whatwg.org/multipage/text-level-semantics.html#the-bdi-element)
for caller/user text
whose direction is not known in advance; no `bdo`, raw `unicode-bidi`, or
direction-override escape hatch is exposed.
The fixed style ceiling includes
[CSS logical](https://drafts.csswg.org/css-logical-1/) block/inline size, inset,
margin, padding, border-side, and corner-radius longhands so a host can grant
direction-neutral layout without granting raw CSS; every property remains
deny-by-default. It deliberately excludes CSS `direction`, `unicode-bidi`,
`writing-mode`, logical shorthands, broader logical modules, and the six
host-resource activators listed above.

Public `SafeDOMError.code` is the stable locale-independent localization and
control-flow key. `operation` is diagnostic context, not a translation key.
The English `message` is a fixed authenticated developer diagnostic, not text
that consumers should parse or present without their own translation.

Accessible names remain host/guest content: use `setLang()`, `setDir()`, and
the fixed `setAria()` surface together, and localize those values in the
integration rather than in this security boundary. The role and IDREF
vocabularies use WAI-ARIA 1.2 as their current baseline. `setAria()` constrains
boundary shape and local ID references; it does not prove that a role/attribute
combination is semantically valid. Prefer visible native labels or
`aria-labelledby` where possible, and localize `aria-roledescription` sparingly
because it replaces assistive technology's localized role name. Localize the
human-readable ARIA value, not the structural role/state vocabulary or logical
IDREF token.
`createOptgroup()` exposes a required non-empty localized `setLabel()` under
the [HTML optgroup contract](https://html.spec.whatwg.org/multipage/form-elements.html#the-optgroup-element).
`createTrack()` exposes fixed `kind`, non-empty `srclang` and
localized label, `default`, and a separate `track.src` URL sink. That sink is
denied unless the host grants it explicitly and uses the same canonicalization,
transactional rollback, placement-revocation, and disposal behavior as every
other URL sink. The wrapper intentionally does not enforce aggregate sibling/media
invariants such as a required `src`, `srclang` for `kind="subtitles"`, or unique
`default` tracks; it also exposes no WebVTT parser, cue, `TextTrack`, or
`TextTrackList` authority. Those limits follow the authority needed to expose
the [HTML track metadata contract](https://html.spec.whatwg.org/multipage/media.html#the-track-element)
without exposing the browser's live text-track objects.

URL policy compares owner-realm canonical origins. Internationalized hostnames
therefore become ASCII punycode and non-ASCII paths become UTF-8 percent-encoded
before allow/deny and `maxLength` checks. Hosts should review and log canonical
ASCII origins and must not present a raw guest URL as trusted identity;
confusable detection is an integration/UI responsibility. The optional
owner-realm/test constructor accepted by `createURLPolicy` is named by the
exported `URLConstructor` type, so the complete public signature is importable
without referring to a private declaration.

Keyboard and input snapshots preserve the primitive `isComposing` state.
Composition start/update/end and `beforeinput` lifecycle control are not
currently advertised or root-fenced, so an IME-aware editor that requires that
lifecycle needs a separately reviewed event-surface extension and
deployed-browser testing.

## Compatibility

- ESM only; CommonJS `require()` is not provided.
- Source, declaration fixtures, packed examples, and output target rolling
  `ESNext` plus standard DOM APIs. TypeScript 6.0.3 and 7.0.2 do not accept a
  literal `ES2026` target; `ESNext` is their TC39-next spelling.
- The Node packaging/tooling engine floor is 26.5.0. Node 26 is Current rather
  than LTS until its scheduled 2026-10-28 transition. Node 26.5 exposes the
  checked ES2026 APIs used by the toolchain, but `Math.sumPrecise` still needs a
  disabled-by-default V8 flag, so this package does not claim complete engine
  conformance or depend on that API.
- Node-only release metadata validation uses native `Temporal.PlainDate` so a
  changelog heading must contain a real canonical ISO calendar date, not merely
  a date-shaped string. A 2026-07-16 probe of the pinned browser matrix found
  `Temporal` in Chromium and Firefox but not WebKit 26.5, so the shipped browser
  runtime does not require `Temporal` and adds no polyfill/runtime dependency.
- The checked browser matrix is the Chromium, Firefox, and WebKit builds bundled
  by Playwright 1.61.1.
- In that pinned matrix, Chromium and WebKit make an attribute-free shadow child
  match the shadow host's `:lang(en)`, while Firefox does not. The wrapper keeps
  the standards-level absent/local distinction and does not copy the host
  language into descendants; integrations requiring uniform Firefox behavior
  should set the local language explicitly.
- In that matrix, an initially attribute-free Arabic `<bdi>` computes its
  intrinsic RTL direction in all three engines and `clearDir()` removes the
  local attribute in all three. WebKit 26.5 can retain the previous computed
  direction after dynamically removing an explicit `dir`; the wrapper does not
  rewrite or replace nodes to mask that browser behavior.
- WebKit's VTT renderer issues same-origin UUID `blob:` image requests while
  showing the Arabic cue. Only that exact request shape is exempted in the VTT
  browser case; the shared zero-activity ledger still rejects all unnamed
  `blob:` and `data:` requests.
- The standard three-engine projects prove full eleven-factory strict default
  denial plus external
  host form/submission/named-access/label/radio isolation for the explicit
  non-credential profile. A separate `chromium-autofill` project uses the
  Chrome-for-Testing `chromium` channel and Chromium's address Autofill CDP
  domain to preserve the positive limitation: an opt-in safe email can be
  filled and read while external host state stays unchanged. Playwright exposes
  CDP sessions only for Chromium
  ([Playwright `newCDPSession`](https://playwright.dev/docs/api/class-browsercontext#browser-context-new-cdp-session)),
  and the [CDP Autofill domain](https://chromedevtools.github.io/devtools-protocol/tot/Autofill/)
  seeds address/card data, not a browser password store. This is not
  password-manager proof.
- Post-lockdown browser event tests dispatch every one of the 21 advertised
  public event types from the authoritative source catalog and cover generic,
  keyboard, mouse, pointer, touch, focus, and input snapshots, every public
  field, hostile getters, cancellation lifetime, and reentrancy in every
  engine. Chromium and Firefox use full synthetic `Touch`/`TouchEvent` records
  under touch emulation. WebKit 26.5 rejects those constructors, so its explicit
  substitute uses Playwright trusted touch injection and checks all public
  touch fields; malicious pre-dispatch touch getters are not claimed for that
  engine path.
- Real SES checks use SES 2.2.0, `@endo/pass-style` 1.8.1, and
  `@endo/eventual-send` 1.5.0.
- Packed declarations are checked with TypeScript 5.0.4 (consumer minimum) and
  7.0.2 (pinned current). Source and property-model commands run under pinned
  TypeScript 6.0.3 and 7.0.2. tsdown 0.22.8 generates the release declarations
  with the pinned TypeScript 6 compiler while the same source and packed
  declarations are checked independently with TypeScript 7. TypeScript is not
  a consumer peer dependency.
- Node can import the module for packaging/tooling checks, but DOM operations
  require a browser-like host.

## Development

The exact CI/release toolchain is Node.js 26.5.0, npm 11.18.0, and Playwright
1.61.1. First run `npm ci --ignore-scripts --no-audit --no-fund` to install the
frozen `npm-shrinkwrap.json` without dependency lifecycle scripts. Then run
`npm run check`. npm 12.0.1 is intentionally not used: its `npm ci` and
`npm sbom --package-lock-only` paths require `package-lock.json` and reject this
package's publishable shrinkwrap, which would break the verified install and
CycloneDX inventory contract.

`tsconfig.json` applies the strict TS 6/7 source contract, including exact
optional-property semantics, checked index access, index-signature access
syntax, side-effect-import checks, explicit returns/overrides, erasable-only
syntax, and full declaration-library checking. `tsconfig.tooling.json` isolates
the one exception: tsdown's public config declarations expose optional feature
peers (`publint`, ATTW, CSS, executable, devtools, and unused-code integrations)
that this project does not install, so only that tooling import uses
`skipLibCheck`. Source declarations retain full library checking. The
TypeScript 5.0.4 consumer fixture enables every compatible soundness flag while
remaining a genuine minimum-version check. The package gate also requires the
declaration map referenced by `dist/index.d.ts`, verifies that every map source
is included under `src/`, and reproduces all four build artifacts byte-for-byte.

Fallow 3.6.0 is pinned locally and configured with the repository's real
script, Playwright, Vitest, Node, and declaration entry points. `npm run
analyze` verifies the signed platform binary, then reports dead code, circular
dependencies, private-type leaks, and duplication. Exit 1 is accepted only
with well-formed compact findings and no stderr; installation, integrity,
configuration, and runtime failures remain fatal. No finding is auto-deleted or
hidden behind `|| true`. The rule severities and clone thresholds are explicit
in `.fallowrc.json`; entry exports are checked except for the externally loaded
Playwright and tsdown config defaults. The repository-local
`oxlint-oxfmt-fallow` skill records the required evidence and validation
workflow without importing MS-specific Bun, Svelte, CSS, workspace, or baseline
policy.

The separate `security` workflow reviews every pull request's dependency diff
at `low` severity across runtime, development, and unknown scopes. Opening,
updating, reopening, or changing the base branch revalidates the current merge
and dependency diff; title/body-only edits skip the jobs without allocating a
runner. The complete `main` check reuses its frozen install to verify npm
registry signatures and available attestations instead of starting a duplicate
audit runner. Every Monday and on manual dispatch, `security` performs an
independent frozen advisory and registry-trust recheck with the exact Node/npm
toolchain. This keeps temporal coverage without adding container-only scanners
to a package with no runtime dependencies or shipped image.

On a non-FHS host, `ARK_PLAYWRIGHT_WEBKIT_EXECUTABLE_PATH` may point to a local
wrapper that launches Playwright 1.61.1's exact bundled WebKit executable with
the required system libraries. CI and ordinary FHS hosts leave it unset.

| Command | Purpose |
| --- | --- |
| `npm run lint` | Lint TypeScript and test/release scripts |
| `npm run typecheck` | Check source and property/model commands with TypeScript 6.0.3 and 7.0.2 |
| `npm run analyze` | Report Fallow 3.6.0 dead code, cycles, private-type leaks, and duplication; fail only if the analyzer itself fails |
| `npm test` | Run unit/property/model tests, built ESM/API smoke, and release-contract tests |
| `npm run test:property` | Run only the fixed-seed generated security and lifecycle suites (already discovered by `test:unit`) |
| `npm run test:browser` | Run boundary and SES tests in Chromium, Firefox, and WebKit plus the dedicated Chromium address-Autofill limitation witness |
| `npm run test:ses` | Run SES 2.2.0 with two mutually distrusting compartments and pass-style checks |
| `npm run audit` | Fail on any known locked-dependency advisory |
| `npm run audit:signatures` | Verify npm registry signatures and available attestations for the installed dependency graph |
| `npm run test:package` | Build and test a tarball from a pristine Git archive, including the exact root runtime-export namespace and literal typecheck/browser execution of every executable packed README fence |
| `npm run check` | Run the complete CI gate, including advisory Fallow analysis |
| `npm run pack:verified` | Test and write the exact tarball, strictly validated reproducible CycloneDX 1.7 SBOM bound to that tarball's SHA-256, and checksum manifest |

See [RELEASING.md](./RELEASING.md) for immutable artifact handoff, protected
publishing, and source-correspondence engineering notes. The historical 0.4/0.5
mapping of issue #1 is frozen in
[docs/issue-1-traceability.md](./docs/issue-1-traceability.md). The live Ark 1.0
disposition of issue #29 is in
[docs/issue-29-ark-1.0-traceability.md](./docs/issue-29-ark-1.0-traceability.md),
and breaking upgrade steps are in
[docs/migration-0.5-to-1.0.md](./docs/migration-0.5-to-1.0.md).

## License and security reports

The package declares `GPL-3.0-only`; see [LICENSE](./LICENSE). This is not a
legal conclusion about the historical npm `0.1.0` metadata or the correct GPLv3
section 6 conveyance method; those remain owner/legal decisions documented in
[RELEASING.md](./RELEASING.md).

Report security concerns through the repository issue tracker without including
live secrets or exploit data that should remain private.
