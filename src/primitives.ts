import { invalidArgument } from "./errors.ts";

/** Runtime guards intentionally do not coerce boxed/stateful values. */
export function requirePrimitiveString(value: unknown, operation: string): string {
  if (typeof value !== "string") throw invalidArgument(operation);
  return value;
}

export function requirePrimitiveBoolean(value: unknown, operation: string): boolean {
  if (typeof value !== "boolean") throw invalidArgument(operation);
  return value;
}

export function requireFiniteNumber(value: unknown, operation: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw invalidArgument(operation);
  }
  return value;
}

export function requireInteger(value: unknown, operation: string): number {
  const number = requireFiniteNumber(value, operation);
  if (!Number.isInteger(number)) throw invalidArgument(operation);
  return number;
}
