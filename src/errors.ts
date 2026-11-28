export function hasOwn(object: object, key: PropertyKey) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

const messages = Object.freeze({
  INVALID_ARGUMENT: "Check the argument type and permitted values.",
  INVALID_POLICY: "Check the policy keys and values.",
  INVALID_ROOT: "Supply a live root in the domain document.",
  INVALID_HARDENER: "Supply an identity-preserving recursive hardener.",
  ROOT_ALREADY_CLAIMED: "Dispose the existing mount before mounting this root.",
  DOCUMENT_DISPOSED: "The document or domain has been disposed.",
  NODE_DISPOSED: "The node has been disposed.",
  CROSS_OWNER_NODE: "Supply a node created by this domain.",
  EXTERNAL_NODE: "The node has left this domain's owned tree.",
  UNSUPPORTED_EVENT: "Choose an event from PUBLIC_EVENT_CATALOG.",
  URL_DENIED: "The URL or CSS resource is denied.",
  POLICY_DENIED: "The host has disabled this capability.",
  DOM_OPERATION_FAILED: "The owner realm could not complete the DOM operation.",
});
export type SafeDOMErrorCode = keyof typeof messages;
export interface SafeDOMError {
  readonly code: SafeDOMErrorCode;
  readonly message: string;
  readonly operation: string;
}
export function error(code: SafeDOMErrorCode, operation: string): SafeDOMError {
  return Object.freeze({
    code,
    message: messages[code],
    operation: typeof operation === "string" ? operation : "validation",
  });
}
export function isSafeDOMError(value: unknown): value is SafeDOMError {
  try {
    if (
      !value ||
      Object.getPrototypeOf(value) !== Object.prototype ||
      !Object.isFrozen(value) ||
      Reflect.ownKeys(value as object).length !== 3
    )
      return false;
    const data = Object.getOwnPropertyDescriptors(value);
    return (
      ["code", "operation", "message"].every(
        (key) => data[key]?.enumerable && typeof data[key].value === "string",
      ) &&
      hasOwn(messages, data.code!.value) &&
      data.message!.value === messages[data.code!.value as SafeDOMErrorCode]
    );
  } catch {
    return false;
  }
}
