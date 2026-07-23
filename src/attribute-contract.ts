import { invalidArgument } from "./errors.ts";
import {
  requireFiniteNumber,
  requireInteger,
  requirePrimitiveBoolean,
  requirePrimitiveString,
} from "./primitives.ts";

export function asciiLowercase(value: string): string {
  let result = "";
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    result += code >= 0x41 && code <= 0x5a ? String.fromCharCode(code + 0x20) : value.charAt(index);
  }
  return result;
}

export function requireString(value: unknown, operation: string): string {
  return requirePrimitiveString(value, operation);
}

export function requireBoolean(value: unknown, operation: string): boolean {
  return requirePrimitiveBoolean(value, operation);
}

export function requireFinite(value: unknown, operation: string): number {
  return requireFiniteNumber(value, operation);
}

export function requireFunction<FunctionType>(
  value: FunctionType,
  operation: string,
): FunctionType {
  if (typeof value !== "function") throw invalidArgument(operation);
  return value;
}

export function requireIntegerInRange(
  value: unknown,
  minimum: number,
  maximum: number,
  operation: string,
): number {
  const integer = requireInteger(value, operation);
  if (integer < minimum || integer > maximum) throw invalidArgument(operation);
  return integer;
}

export function requireExactKeyword<Value extends string>(
  value: unknown,
  vocabulary: readonly Value[],
  operation: string,
): Value {
  const primitive = requirePrimitiveString(value, operation);
  for (const candidate of vocabulary) {
    if (primitive === candidate) return candidate;
  }
  throw invalidArgument(operation);
}

export function requireAsciiKeyword<Value extends string>(
  value: unknown,
  vocabulary: readonly Value[],
  operation: string,
): Value {
  const normalized = asciiLowercase(requirePrimitiveString(value, operation));
  for (const candidate of vocabulary) {
    if (normalized === candidate) return candidate;
  }
  throw invalidArgument(operation);
}

export function requireLineBreakFreeString(value: unknown, operation: string): string {
  const primitive = requirePrimitiveString(value, operation);
  if (primitive.includes("\r") || primitive.includes("\n")) throw invalidArgument(operation);
  return primitive;
}

const MIME_TYPE = /^[!#$%&'*+.^_`|~0-9a-z-]+\/[!#$%&'*+.^_`|~0-9a-z-]+$/;

export function requireMimeType(value: unknown, operation: string): string {
  const normalized = asciiLowercase(requirePrimitiveString(value, operation));
  if (!MIME_TYPE.test(normalized)) throw invalidArgument(operation);
  return normalized;
}
