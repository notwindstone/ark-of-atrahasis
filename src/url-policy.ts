import { createSafeDOMError, invalidPolicy, type SafeDOMError } from "./errors.ts";

export const URL_SINKS = [
  "anchor.href",
  "image.src",
  "video.src",
  "video.poster",
  "audio.src",
  "source.src",
  "track.src",
] as const;

export type URLSink = (typeof URL_SINKS)[number];
export type URLProtocol = "https:" | "http:";

export interface URLSinkPolicy {
  /** Exact origins after URL canonicalization, including any non-default port. */
  readonly allowedOrigins: readonly string[];
  /** Defaults to https only. */
  readonly allowedProtocols?: readonly URLProtocol[];
  /** Userinfo is denied unless explicitly enabled. */
  readonly allowCredentials?: boolean;
  /** Query strings are denied unless explicitly enabled. */
  readonly allowQuery?: boolean;
  /** Fragments are denied unless explicitly enabled. */
  readonly allowFragment?: boolean;
  /** Defaults to 2048 canonical URL code units. */
  readonly maxLength?: number;
}

export interface SafeURLPolicy {
  /** Explicit, host-selected base. document.baseURI is never consulted. */
  readonly baseURL: string;
  /** A missing sink is denied. */
  readonly sinks: Readonly<Partial<Record<URLSink, URLSinkPolicy>>>;
}

export type SafeURLDecision =
  | Readonly<{ allowed: true; url: string }>
  | Readonly<{ allowed: false; error: SafeDOMError }>;

export interface URLPolicyEngine {
  readonly decide: (sink: URLSink, input: unknown) => SafeURLDecision;
}

interface CompiledSinkPolicy {
  readonly origins: ReadonlySet<string>;
  readonly protocols: ReadonlySet<URLProtocol>;
  readonly allowCredentials: boolean;
  readonly allowQuery: boolean;
  readonly allowFragment: boolean;
  readonly maxLength: number;
}

export type URLConstructor = new (url: string, base?: string | URL) => URL;

const URL_SINK_SET: ReadonlySet<string> = new Set(URL_SINKS);
const DEFAULT_MAX_URL_LENGTH = 2048;
const DEFAULT_URL_CONSTRUCTOR: URLConstructor = URL;

function readPolicyField(record: object, key: PropertyKey, operation: string): unknown {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    if (!descriptor) return undefined;
    if (!("value" in descriptor)) throw invalidPolicy(operation);
    return descriptor.value;
  } catch {
    // Accessor/Proxy exceptions and the values they throw never cross the API.
    throw invalidPolicy(operation);
  }
}

function policyString(value: unknown, operation: string): string {
  if (typeof value !== "string") throw invalidPolicy(operation);
  return value;
}

function policyBoolean(value: unknown, fallback: boolean, operation: string): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") throw invalidPolicy(operation);
  return value;
}

function policyInteger(value: unknown, fallback: number, operation: string): number {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) {
    throw invalidPolicy(operation);
  }
  return value;
}

function deny(operation: string): SafeURLDecision {
  return Object.freeze({
    allowed: false as const,
    error: createSafeDOMError("ERR_URL_DENIED", operation),
  });
}

function compileRule(
  rule: URLSinkPolicy,
  URLImpl: URLConstructor,
  operation: string,
): CompiledSinkPolicy {
  if (rule === null || typeof rule !== "object") {
    throw invalidPolicy(operation);
  }

  const rawOrigins = readPolicyField(rule, "allowedOrigins", operation);
  if (!Array.isArray(rawOrigins)) throw invalidPolicy(operation);
  const origins = new Set<string>();
  for (const rawOrigin of rawOrigins) {
    const originInput = policyString(rawOrigin, operation);
    try {
      const parsed = new URLImpl(originInput);
      if (
        (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
        parsed.username !== "" ||
        parsed.password !== "" ||
        parsed.pathname !== "/" ||
        parsed.search !== "" ||
        parsed.hash !== ""
      ) {
        throw invalidPolicy(operation);
      }
      origins.add(parsed.origin);
    } catch {
      // Never propagate a URL implementation/native exception.
      throw invalidPolicy(operation);
    }
  }
  if (origins.size === 0) throw invalidPolicy(operation);

  const protocols = new Set<URLProtocol>();
  const configuredProtocols = readPolicyField(rule, "allowedProtocols", operation) ?? (["https:"] as const);
  if (!Array.isArray(configuredProtocols) || configuredProtocols.length === 0) {
    throw invalidPolicy(operation);
  }
  for (const protocol of configuredProtocols) {
    if (protocol !== "https:" && protocol !== "http:") throw invalidPolicy(operation);
    protocols.add(protocol);
  }

  const maxLength = policyInteger(
    readPolicyField(rule, "maxLength", operation),
    DEFAULT_MAX_URL_LENGTH,
    operation,
  );
  if (maxLength < 1 || maxLength > 65_536) throw invalidPolicy(operation);

  return Object.freeze({
    origins,
    protocols,
    allowCredentials: policyBoolean(readPolicyField(rule, "allowCredentials", operation), false, operation),
    allowQuery: policyBoolean(readPolicyField(rule, "allowQuery", operation), false, operation),
    allowFragment: policyBoolean(readPolicyField(rule, "allowFragment", operation), false, operation),
    maxLength,
  });
}

/**
 * Compile a declarative, per-sink URL policy. With no policy every sink is
 * denied. For an enabled sink, each runtime input is passed to the captured URL
 * constructor exactly once and only that canonical result reaches the caller.
 *
 * URLImpl is an explicit test/realm hook; production callers should omit it or
 * pass the root owner's captured URL constructor.
 */
export function createURLPolicy(
  policy?: SafeURLPolicy,
  URLImpl: URLConstructor = DEFAULT_URL_CONSTRUCTOR,
): URLPolicyEngine {
  const compiled = new Map<URLSink, CompiledSinkPolicy>();
  let baseURL = "https://invalid.invalid/";

  if (policy !== undefined) {
    if (policy === null || typeof policy !== "object") {
      throw invalidPolicy("urlPolicy");
    }

    const rawBaseURL = policyString(
      readPolicyField(policy, "baseURL", "urlPolicy.baseURL"),
      "urlPolicy.baseURL",
    );
    try {
      const parsedBase = new URLImpl(rawBaseURL);
      if (
        (parsedBase.protocol !== "https:" && parsedBase.protocol !== "http:") ||
        parsedBase.username !== "" ||
        parsedBase.password !== ""
      ) {
        throw invalidPolicy("urlPolicy.baseURL");
      }
      baseURL = parsedBase.href;
    } catch {
      throw invalidPolicy("urlPolicy.baseURL");
    }

    const sinks = readPolicyField(policy, "sinks", "urlPolicy.sinks");
    if (sinks === null || typeof sinks !== "object") {
      throw invalidPolicy("urlPolicy.sinks");
    }
    for (const sink of URL_SINKS) {
      const rule = readPolicyField(sinks, sink, `urlPolicy.sinks.${sink}`);
      if (rule !== undefined) {
        const operation = `urlPolicy.sinks.${sink}`;
        try {
          compiled.set(sink, compileRule(rule as URLSinkPolicy, URLImpl, operation));
        } catch {
          throw invalidPolicy(operation);
        }
      }
    }
  }

  return Object.freeze({
    decide(sink: URLSink, input: unknown): SafeURLDecision {
      const operation = URL_SINK_SET.has(sink) ? sink : "url.unknown-sink";

      // Reject before parsing or coercion. This is important for objects with a
      // stateful toString/Symbol.toPrimitive.
      if (typeof input !== "string" || !URL_SINK_SET.has(sink)) return deny(operation);

      const rule = compiled.get(sink);
      if (!rule) return deny(operation);

      let parsed: URL;
      try {
        // The sole runtime normalization of input.
        parsed = new URLImpl(input, baseURL);
      } catch {
        return deny(operation);
      }

      const canonicalURL = parsed.href;
      if (canonicalURL.length > rule.maxLength) return deny(operation);
      if (!rule.protocols.has(parsed.protocol as URLProtocol)) return deny(operation);
      if (!rule.origins.has(parsed.origin)) return deny(operation);
      if (!rule.allowCredentials && (parsed.username !== "" || parsed.password !== "")) {
        return deny(operation);
      }
      if (!rule.allowQuery && parsed.search !== "") return deny(operation);
      if (!rule.allowFragment && parsed.hash !== "") return deny(operation);

      return Object.freeze({ allowed: true as const, url: canonicalURL });
    },
  });
}
