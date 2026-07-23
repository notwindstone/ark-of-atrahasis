import { createSafeDocument } from "../../src/index.ts";
import type {
  SafeDocument,
  SafeDocumentOptions,
  SafeFormControlPolicy,
} from "../../src/types.ts";
import { testHarden } from "./harden.ts";

type TestOptions = Omit<SafeDocumentOptions, "harden">;

/** Explicit opt-in for legacy tests that intentionally exercise native values. */
const TEST_FORM_CONTROL_POLICY = Object.freeze({
  allowNonCredentialFormElements: true,
}) satisfies SafeFormControlPolicy;

/** Inject the deterministic test hardener without eagerly reading hostile fields. */
export function createTestSafeDocument(root: ShadowRoot, options: TestOptions = {}): SafeDocument {
  const withHarden = new Proxy(options, {
    getOwnPropertyDescriptor(target, property) {
      if (property === "harden") {
        return {
          configurable: true,
          enumerable: true,
          value: testHarden,
          writable: false,
        };
      }
      if (property === "formControlPolicy" && !Reflect.has(target, property)) {
        return {
          configurable: true,
          enumerable: true,
          value: TEST_FORM_CONTROL_POLICY,
          writable: false,
        };
      }
      return Reflect.getOwnPropertyDescriptor(target, property);
    },
  }) as SafeDocumentOptions;

  return createSafeDocument(root, withHarden);
}
