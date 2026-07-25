import { stablePayloadHash } from "../../agent/runtime/hash";

export function workflowId(prefix: string, value: unknown): string {
  return `${prefix}:${stablePayloadHash(value).replace("fnv1a:", "")}`;
}
