export type TestHardener = <Value>(value: Value) => Value;

function deepHarden<Value>(root: Value): Value {
  const pending: unknown[] = [root];
  const visited = new WeakSet<object>();

  while (pending.length > 0) {
    const value = pending.pop();
    if (
      (typeof value !== "object" && typeof value !== "function") ||
      value === null ||
      visited.has(value)
    ) {
      continue;
    }

    visited.add(value);
    for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
      if ("value" in descriptor) pending.push(descriptor.value);
      else pending.push(descriptor.get, descriptor.set);
    }
    Object.freeze(value);
  }

  return root;
}

export const testHarden: TestHardener = Object.freeze(deepHarden);
