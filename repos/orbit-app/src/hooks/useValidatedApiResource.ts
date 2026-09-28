import {
  validateApiResourceState,
  type RuntimeSchema
} from "../api/validated-resource-state";
import type { ApiResourceState } from "./useApiResource";
import { useApiResource } from "./useApiResource";

export function useValidatedApiResource<TData>(
  path: string,
  schema: RuntimeSchema<TData>,
  isEmpty: (data: TData) => boolean,
  options: {
    cachePolicy?: "default" | "network-only";
    scopeKey?: string | null;
    /** Sprint 0117: false keeps the resource inert while the device copy is the source. */
    enabled?: boolean;
  } = {},
): ApiResourceState<TData> {
  const state = useApiResource<unknown>(path, (data) => {
    const parsed = schema.safeParse(data);
    return parsed.success ? isEmpty(parsed.data) : false;
  }, options);

  return validateApiResourceState(state, schema);
}
