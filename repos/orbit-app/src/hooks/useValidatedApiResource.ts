import {
  validateApiResourceState,
  type RuntimeSchema
} from "../api/validated-resource-state";
import type { ApiResourceState } from "./useApiResource";
import { useApiResource } from "./useApiResource";

export function useValidatedApiResource<TData>(
  path: string,
  schema: RuntimeSchema<TData>,
  isEmpty: (data: TData) => boolean
): ApiResourceState<TData> {
  const state = useApiResource<unknown>(path, (data) => {
    const parsed = schema.safeParse(data);
    return parsed.success ? isEmpty(parsed.data) : false;
  });

  return validateApiResourceState(state, schema);
}
