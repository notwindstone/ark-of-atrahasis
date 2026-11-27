import { hasOwn, error, type SafeDOMError } from "./errors.ts";
import { canonicalizeStyleProperty } from "./validators.ts";

const sinks = [
  "anchor.href",
  "image.src",
  "video.src",
  "video.poster",
  "audio.src",
  "source.src",
  "track.src",
] as const;
export type URLSink = (typeof sinks)[number];
export type URLProtocol = "https:" | "http:";
export interface URLSinkPolicy {
  readonly allowedOrigins: readonly string[];
  readonly allowedProtocols?: readonly URLProtocol[] | undefined;
  readonly allowCredentials?: boolean | undefined;
  readonly allowQuery?: boolean | undefined;
  readonly allowFragment?: boolean | undefined;
  readonly maxLength?: number | undefined;
}
export interface SafeURLPolicy {
  readonly baseURL: string;
  readonly sinks: Readonly<Partial<Record<URLSink, URLSinkPolicy | undefined>>>;
}
export type SafeURLDecision =
  Readonly<{ allowed: true; url: string }> | Readonly<{ allowed: false; error: SafeDOMError }>;
export type SafeStylePolicy =
  | { readonly allowedProperties: readonly string[]; readonly denyAll?: undefined }
  | { readonly denyAll: true; readonly allowedProperties?: undefined };
type URLConstructor = new (url: string, base?: string) => URL;
function invalid(op: string): never {
  throw error("INVALID_POLICY", op);
}

export function checkKeys(record: unknown, allowed: readonly string[], op: string): asserts record is object {
  try {
    if (
      !record ||
      typeof record !== "object" ||
      Array.isArray(record) ||
      Reflect.ownKeys(record).some((k) => typeof k !== "string" || !allowed.includes(k))
    )
      invalid(op);
  } catch {
    invalid(op);
  }
}
export function readOwnDataProperty(record: object, key: PropertyKey, op: string): unknown {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    if (!descriptor) return undefined;
    if (!hasOwn(descriptor, "value")) invalid(op);
    return descriptor.value;
  } catch {
    invalid(op);
  }
}
function* items(input: unknown, op: string) {
  if (!Array.isArray(input)) invalid(op);
  const length = readOwnDataProperty(input, "length", op);
  if (typeof length !== "number" || !Number.isSafeInteger(length) || length < 0) invalid(op);
  for (let i = 0; i < length; i++) yield readOwnDataProperty(input, i, op);
}
function httpURL(value: unknown, URLImpl: URLConstructor, op: string) {
  if (typeof value !== "string") invalid(op);
  const url = new URLImpl(value);
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) invalid(op);
  return url;
}
function compileSink(rule: unknown, URLImpl: URLConstructor, op: string) {
  checkKeys(
    rule,
    ["allowedOrigins", "allowedProtocols", "allowCredentials", "allowQuery", "allowFragment", "maxLength"],
    op,
  );
  const field = (key: string) => readOwnDataProperty(rule, key, op);
  const flag = (key: string) => {
    const value = field(key);
    if (value === undefined) return false;
    if (typeof value !== "boolean") invalid(op);
    return value;
  };
  const origins = new Set<string>();
  for (const value of items(field("allowedOrigins"), op)) {
    const url = httpURL(value, URLImpl, op);
    if (url.href !== url.origin + "/") invalid(op);
    origins.add(url.origin);
  }
  const protocols = new Set<string>();
  const configured = field("allowedProtocols");
  for (const protocol of items(configured === undefined ? ["https:"] : configured, op)) {
    if (protocol !== "https:" && protocol !== "http:") invalid(op);
    protocols.add(protocol);
  }
  if (!protocols.size || !origins.size) invalid(op);
  const length = field("maxLength");
  const maxLength = length === undefined ? 2048 : length;
  if (typeof maxLength !== "number" || !Number.isInteger(maxLength) || maxLength < 1 || maxLength > 65536)
    invalid(op);
  return {
    origins,
    protocols,
    maxLength,
    credentials: flag("allowCredentials"),
    query: flag("allowQuery"),
    fragment: flag("allowFragment"),
  };
}

export function createURLPolicy(policy?: SafeURLPolicy, URLImpl: URLConstructor = URL) {
  const rules = new Map<URLSink, ReturnType<typeof compileSink>>();
  let base: string | undefined;
  if (policy !== undefined) {
    const op = "urlPolicy";
    try {
      checkKeys(policy, ["baseURL", "sinks"], op);
      base = httpURL(readOwnDataProperty(policy, "baseURL", op), URLImpl, op).href;
      const configured = readOwnDataProperty(policy, "sinks", op);
      checkKeys(configured, sinks, op);
      for (const sink of sinks) {
        const rule = readOwnDataProperty(configured, sink, op);
        if (rule !== undefined) rules.set(sink, compileSink(rule, URLImpl, sink));
      }
    } catch {
      invalid(op);
    }
  }
  return Object.freeze({
    decide(sink: URLSink, input: unknown): SafeURLDecision {
      const rule = rules.get(sink);
      const deny = () =>
        Object.freeze({
          allowed: false as const,
          error: error("URL_DENIED", rule ? sink : "urlPolicy"),
        });
      if (!rule || typeof input !== "string") return deny();
      let url: URL;
      try {
        url = new URLImpl(input, base);
      } catch {
        return deny();
      }
      if (
        url.href.length > rule.maxLength ||
        !rule.protocols.has(url.protocol) ||
        !rule.origins.has(url.origin) ||
        (!rule.credentials && (url.username || url.password)) ||
        (!rule.fragment && url.href.includes("#")) ||
        (!rule.query && url.href.split("#", 1)[0]!.includes("?"))
      )
        return deny();
      return Object.freeze({ allowed: true, url: url.href });
    },
  });
}

export function createStylePolicy(policy?: SafeStylePolicy) {
  let allowed: Set<string> | undefined;
  if (policy !== undefined) {
    const op = "stylePolicy";
    try {
      checkKeys(policy, ["allowedProperties", "denyAll"], op);
      allowed = new Set();
      const denyAll = readOwnDataProperty(policy, "denyAll", op);
      const properties = readOwnDataProperty(policy, "allowedProperties", op);
      if (denyAll !== undefined) {
        if (denyAll !== true || properties !== undefined) invalid(op);
      } else {
        for (const value of items(properties, op)) {
          const prop = canonicalizeStyleProperty(value);
          if (!prop) invalid(op);
          allowed.add(prop);
        }
      }
    } catch {
      invalid(op);
    }
  }
  return Object.freeze({
    allows(value: unknown) {
      const prop = canonicalizeStyleProperty(value);
      return !!prop && (!allowed || allowed.has(prop));
    },
  });
}
