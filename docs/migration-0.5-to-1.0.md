# Migrating from Ark 0.5.0 to 1.0.0

Ark 1.0 narrows its contract to DOM authority confinement. It removes the
package-managed resource-control and availability layers while retaining the
ownership, policy, rollback, revocation, and cleanup boundaries.

This guide describes the repository's `1.0.0` source state. It does not claim
that `1.0.0` is available from npm. Tagging and publication are exclusively
upstream-maintainer actions through the protected release workflow.

## Required source changes

Remove the two default-value imports and all associated public types:

```ts
// Ark 0.5 only; remove these imports.
import {
  DEFAULT_SAFE_DOCUMENT_QUOTAS,
  DEFAULT_SAFE_DOCUMENT_RATES,
  type SafeDocumentQuotas,
  type SafeDocumentRateLimit,
  type SafeDocumentRates,
} from "ark-of-atrahasis";
```

Remove `quotas` and `rates` from every `SafeDocumentOptions` object. A 1.0
bootstrap contains the required `harden` own data property and only the
security policies the host actually grants:

```ts
const safeDocument = createSafeDocument(root, {
  harden,
  formControlPolicy: { allowNonCredentialFormElements: true },
  stylePolicy: { allowedProperties: ["color"] },
  urlPolicy,
});
```

TypeScript rejects `quotas` and `rates` as excess properties. JavaScript callers
must also remove them: an own legacy property fails with `ERR_INVALID_POLICY`
at `createSafeDocument.options.quotas` or
`createSafeDocument.options.rates` before the root is claimed. This explicit
failure prevents an obsolete configuration from being mistaken for active
protection, and corrected initialization may retry with the same root.

Update error handling so it no longer branches on the four removed codes:

- `INVALID_QUOTA`;
- `INVALID_RATE`;
- `QUOTA_EXCEEDED`;
- `RATE_LIMIT_EXCEEDED`.

`SafeDOMErrorCode` continues to cover authority, policy, argument, platform,
placement, and terminal lifecycle failures. Do not replace the removed branches
with a generic retry: Ark 1.0 no longer reports quota or fixed-window
exhaustion.

## Resource and availability responsibility

Ark 1.0 does not impose package-managed ceilings on wrapper count, listeners,
calls, text/attribute/style bytes, URL attempts or slots, identifiers, IDREF
occurrences, or aggregate canvas area. If an integration relied on those limits,
move the requirement to a host-owned boundary with an explicit policy and
deployment test.

Ark also does not schedule or preempt guest JavaScript and does not provide a
Worker termination guarantee. Same-agent SES code can block its agent. Hosts
that require availability must isolate untrusted work behind a Worker, process,
or RPC boundary and validate its limits, cancellation, and termination behavior
for the deployed runtime.

Two former availability caps now have positive behavior:

- IDREF-list setters accept and canonicalize the complete ASCII-whitespace
  separated input, including lists beyond the former 256 and 8,192 occurrence
  thresholds. Logical identifiers remain opaque in the physical DOM.
- Canvas width and height retain unsigned-32-bit validation and transactional
  DOM readback, but Ark no longer enforces a per-canvas or aggregate pixel-area
  ceiling.

## Security contracts that remain

The removal is not a relaxation of the capability boundary. Ark 1.0 retains:

- one claimed, paint-contained `ShadowRoot` and canonical owner-branded
  wrappers;
- cross-owner rejection and placement auditing;
- deny-by-default URL and inline-style policy plus explicit form-surface opt-in;
- the exclusion of `animation-name`, `animation-duration`, `display`,
  `font-family`, `font-style`, and `font-weight` from the grantable style
  ceiling;
- captured owner-realm DOM operations and normalized frozen error records;
- transactional mutation rollback and retryable cleanup after an unproven
  write;
- listener abort, logical namespace release, owned-effect cleanup, canvas
  zeroing, irreversible/idempotent disposal, and stable terminal errors; and
- physically non-mutating revocation after the trusted host moves a raw node
  outside the mount.

## Verification

The following commands are defined by `package.json`:

| Command | Migration signal |
| --- | --- |
| `npm run typecheck` | Removed imports, options, and error-code branches no longer typecheck as 0.5 API |
| `npm run test:unit` | Unit/property/lifecycle behavior matches the 1.0 source contract |
| `npm run test:api` | Built ESM namespace and removed legacy error records match 1.0 |
| `npm run test:release` | README namespace and 1.0 release metadata stay synchronized |
| `npm run test:browser` | Browser capability, policy, event, lifecycle, and Autofill-limitation coverage |
| `npm run test:ses` | Post-lockdown compartment and pass-style coverage |
| `npm run test:package` | Pristine packed artifact, declarations, namespace, and README examples |
| `npm run check` | Complete project gate |

The live acceptance disposition is recorded in
[Issue #29 Ark 1.0 traceability](./issue-29-ark-1.0-traceability.md). The old
[Issue #1 map](./issue-1-traceability.md) is retained only as a frozen 0.4/0.5
historical record.
