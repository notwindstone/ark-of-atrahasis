import { expect } from "vitest";
import type { Parameters } from "fast-check";
import { isSafeDOMError, type SafeDOMErrorCode } from "../../src/index.ts";

const DEFAULT_PROPERTY_SEED = 0x0a7a4515;
export const propertyEnvironment: NodeJS.ProcessEnv & {
  FC_COMMAND_REPLAY_PATH?: string;
  FC_END_ON_FAILURE?: string;
  FC_PATH?: string;
  FC_SEED?: string;
} = process.env;

function readSeed(): number {
  const configured = propertyEnvironment.FC_SEED;
  if (configured === undefined || configured === "") return DEFAULT_PROPERTY_SEED;
  const parsed = Number(configured);
  if (!Number.isInteger(parsed) || parsed < -0x8000_0000 || parsed > 0xffff_ffff) {
    throw new Error(`FC_SEED must be a 32-bit integer, received ${JSON.stringify(configured)}`);
  }
  return parsed;
}

export function propertyParameters<T>(numRuns: number): Parameters<T> {
  const path = propertyEnvironment.FC_PATH ?? "";
  return {
    seed: readSeed(),
    path,
    numRuns,
    verbose: true,
    ...(propertyEnvironment.FC_END_ON_FAILURE === "1" ? { endOnFailure: true } : {}),
  };
}

export function commandReplayPath(): string | undefined {
  const replayPath = propertyEnvironment.FC_COMMAND_REPLAY_PATH;
  return replayPath === undefined || replayPath === "" ? undefined : replayPath;
}

export function assertStableBoundaryError(
  value: unknown,
  expectedCode?: SafeDOMErrorCode,
): void {
  expect(isSafeDOMError(value)).toBe(true);
  if (!isSafeDOMError(value)) throw new Error("expected a SafeDOMError boundary record");
  expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
  expect(Reflect.ownKeys(value)).toEqual(["name", "code", "operation", "message"]);
  expect(Object.isFrozen(value)).toBe(true);
  expect(Object.hasOwn(value, "stack")).toBe(false);
  expect(Object.hasOwn(value, "cause")).toBe(false);
  expect(Object.values(value).every((field) => typeof field === "string")).toBe(true);
  if (expectedCode !== undefined) expect(value.code).toBe(expectedCode);
}

export function captureThrown(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }
  throw new Error("expected action to throw");
}
