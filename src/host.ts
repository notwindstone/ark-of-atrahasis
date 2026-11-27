import { owners } from "./owner.ts";
import type { SafeDomain } from "./types.ts";
export function getRealNode(domain: SafeDomain, wrapper: object): Node | undefined {
  const owner = owners.get(domain);
  const entry = owner?.byWrapper.get(wrapper);
  if (owner && entry && owner.canDispatch(entry)) return entry.real!;
}
