import type { Owner, NodeEntry } from "./owner.ts";
import type { SafeStyle } from "./types.ts";
import { canonicalizeStyleProperty, validStyle } from "./validators.ts";

export function style(owner: Owner, entry: NodeEntry): SafeStyle {
  const p = owner.platform;
  const declaration = () => p.call("HTMLElement", "style", owner.authorized(entry));
  const css = (op: string, obj: CSSStyleDeclaration, ...args: string[]) =>
    p.call("CSSStyleDeclaration", op, obj, ...args);
  function property(key: unknown) {
    const name = canonicalizeStyleProperty(key);
    return owner.styles.allows(name) ? name : undefined;
  }
  return {
    get(key) {
      const real = declaration();
      const name = property(key);
      return name ? css("getPropertyValue", real, name) : undefined;
    },
    set(key, value) {
      const real = declaration();
      const name = property(key);
      if (!name || !validStyle(name, value)) return false;
      const scratch = owner.scratch();
      css("setProperty", scratch, name, value);
      let expected, priority;
      try {
        expected = css("getPropertyValue", scratch, name);
        priority = css("getPropertyPriority", scratch, name);
      } finally {
        css("removeProperty", scratch, name);
      }
      if (!expected) return false;
      css("setProperty", real, name, expected, priority);
      return (
        css("getPropertyValue", real, name) === expected &&
        css("getPropertyPriority", real, name) === priority
      );
    },
    remove(key) {
      const real = declaration();
      const name = property(key);
      if (!name) return false;
      css("removeProperty", real, name);
      return true;
    },
  };
}
