export type PlatformFunction = (...arguments_: unknown[]) => unknown;

function isReflectable(value: unknown): value is object {
  return (typeof value === "object" && value !== null) || typeof value === "function";
}

/** Read one constructor prototype without letting hostile realm access escape. */
export function getRealmConstructorPrototype(realm: unknown, name: string): unknown {
  if (!isReflectable(realm)) return undefined;
  try {
    const realmConstructor = (realm as Record<string, unknown>)[name];
    if (typeof realmConstructor !== "function") return undefined;
    return (realmConstructor as { prototype?: unknown }).prototype;
  } catch {
    return undefined;
  }
}

/** Capture an own accessor or method without invoking user-controlled properties. */
export function getOwnPlatformFunction(
  prototype: unknown,
  property: string,
  kind: "getter" | "method",
): PlatformFunction | undefined {
  if (!isReflectable(prototype)) return undefined;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, property);
    const candidate = kind === "getter" ? descriptor?.get : descriptor?.value;
    return typeof candidate === "function" ? candidate as PlatformFunction : undefined;
  } catch {
    return undefined;
  }
}

/** Capture and freeze a named set of own realm functions as a null-prototype record. */
export function captureRealmPlatformFunctions<const Names extends readonly string[]>(
  realm: unknown,
  constructorName: string,
  names: Names,
  kind: "getter" | "method",
): Readonly<Record<Names[number], PlatformFunction | undefined>> {
  const prototype = getRealmConstructorPrototype(realm, constructorName);
  const result = Object.create(null) as Record<string, PlatformFunction | undefined>;
  for (const name of names) result[name] = getOwnPlatformFunction(prototype, name, kind);
  return Object.freeze(result) as Readonly<
    Record<Names[number], PlatformFunction | undefined>
  >;
}
