export type SafeDOMErrorCode =
  | "INVALID_ROOT"
  | "ROOT_ALREADY_CLAIMED"
  | "CROSS_OWNER"
  | "DUPLICATE_REGISTRATION"
  | "DUPLICATE_IDENTIFIER"
  | "OWNER_DOCUMENT_MISMATCH"
  | "ERR_INVALID_ARGUMENT"
  | "ERR_INVALID_HARDENER"
  | "ERR_INVALID_POLICY"
  | "ERR_URL_DENIED"
  | "FORM_CONTROL_POLICY_REQUIRED"
  | "DOCUMENT_DISPOSED"
  | "NODE_DISPOSED"
  | "NODE_REVOKED"
  | "PLACEMENT_VIOLATION"
  | "DOM_OPERATION_FAILED";

export interface SafeDOMError {
  readonly name: "SafeDOMError";
  readonly code: SafeDOMErrorCode;
  readonly operation: string;
  readonly message: string;
}

const ERROR_MESSAGES: Readonly<Record<SafeDOMErrorCode, string>> = Object.freeze({
  INVALID_ROOT: "The root capability is invalid",
  ROOT_ALREADY_CLAIMED: "The root capability is already claimed",
  CROSS_OWNER: "The wrapper belongs to a different safe document",
  DUPLICATE_REGISTRATION: "The DOM node already has a different wrapper",
  DUPLICATE_IDENTIFIER: "The local identifier already has an active target",
  OWNER_DOCUMENT_MISMATCH: "The DOM node belongs to a different document",
  ERR_INVALID_ARGUMENT: "The operation received an invalid argument",
  ERR_INVALID_HARDENER: "The host hardener is invalid",
  ERR_INVALID_POLICY: "The host security policy is invalid",
  ERR_URL_DENIED: "The URL was denied by host policy",
  FORM_CONTROL_POLICY_REQUIRED:
    "Non-credential form elements require an explicit host policy",
  DOCUMENT_DISPOSED: "The safe document has been disposed",
  NODE_DISPOSED: "The node wrapper has been disposed",
  NODE_REVOKED: "The node wrapper has been revoked",
  PLACEMENT_VIOLATION: "The node left its assigned mount and was revoked",
  DOM_OPERATION_FAILED: "The platform DOM operation failed",
});

const ERROR_CODES: ReadonlySet<string> = new Set(Object.keys(ERROR_MESSAGES));
const ERROR_RECORD_PROTOTYPE = Object.prototype;

/** Create a primitive-only, pass-by-copy boundary error record. */
export function createSafeDOMError(code: SafeDOMErrorCode, operation: string): SafeDOMError {
  return Object.freeze({
    name: "SafeDOMError" as const,
    code,
    operation,
    message: ERROR_MESSAGES[code],
  });
}

/** Recognize the stable record without consulting getters or prototypes. */
export function isSafeDOMError(value: unknown): value is SafeDOMError {
  if (value === null || typeof value !== "object") return false;
  try {
    if (Object.getPrototypeOf(value) !== ERROR_RECORD_PROTOTYPE) return false;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const readString = (name: string): string | undefined => {
      const descriptor = descriptors[name];
      return descriptor && "value" in descriptor && typeof descriptor.value === "string"
        ? descriptor.value
        : undefined;
    };
    const code = readString("code");
    return (
      Object.isFrozen(value)
      && Reflect.ownKeys(descriptors).length === 4
      && readString("name") === "SafeDOMError"
      && code !== undefined
      && ERROR_CODES.has(code)
      && readString("operation") !== undefined
      && readString("message") === ERROR_MESSAGES[code as SafeDOMErrorCode]
    );
  } catch {
    return false;
  }
}

export function invalidArgument(operation: string): SafeDOMError {
  return createSafeDOMError("ERR_INVALID_ARGUMENT", operation);
}

export function invalidPolicy(operation: string): SafeDOMError {
  return createSafeDOMError("ERR_INVALID_POLICY", operation);
}
