/** Create the standard paint-contained ShadowRoot used by non-boundary tests. */
export function createContainedRoot(documentValue: Document = document): ShadowRoot {
  const host = documentValue.createElement("div");
  host.style.contain = "paint";
  documentValue.body.appendChild(host);
  return host.attachShadow({ mode: "open" });
}
