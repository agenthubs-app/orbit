import type { RouteState } from "../view-models/route-state";
import { currentTranslator } from "../i18n/messages";

type SafeParseResult<TData> =
  | { success: true; data: TData }
  | { success: false; error?: unknown };

export type RuntimeSchema<TData> = {
  safeParse: (input: unknown) => SafeParseResult<TData>;
};

type ResourceControls = {
  refresh: () => void;
  refreshing: boolean;
};

export type ValidatedApiResourceInputState = RouteState<unknown> &
  ResourceControls;

export function validateApiResourceState<TData>(
  state: ValidatedApiResourceInputState,
  schema: RuntimeSchema<TData>
): RouteState<TData> & ResourceControls {
  if (state.kind !== "success" && state.kind !== "empty") {
    return state;
  }

  const parsed = schema.safeParse(state.data);

  if (!parsed.success) {
    return {
      kind: "failure",
      error: {
        code: "ORBIT_APP_CONTRACT_MISMATCH",
        message: currentTranslator()("common.api.contractMismatch")
      },
      meta: state.meta,
      status: state.status,
      refresh: state.refresh,
      refreshing: state.refreshing
    };
  }

  return {
    ...state,
    data: parsed.data
  };
}
