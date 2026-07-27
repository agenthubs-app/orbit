import {
  getOrbitAccountAuthViewModel,
  type OrbitAccountAuthMode,
  type OrbitAccountAuthViewModel,
} from "../../orbit-account-auth-route-view-model";
import { normalizeOrbitAuthReturnPath } from "../../../../../features/auth/app-auth-routing";

export type AppAccountAuthSearchParams = Record<
  string,
  string | string[] | undefined
>;
export type AppAccountAuthRouteScenario = "empty" | "pending" | "failure";

export interface AppAccountAuthRouteInput {
  authMode: OrbitAccountAuthMode;
  mode?: string | null;
  searchParams?: AppAccountAuthSearchParams;
}

export interface AppAccountAuthRouteStateViewModel {
  copy: {
    description: string;
    emptyState: string;
    eyebrow: string;
    guardrail: string;
    nextStep: string;
    purpose: string;
    title: string;
  };
  errorCode: string | null;
  evidenceIds: readonly string[];
  recoveryActions: readonly {
    id: string;
    href: string;
    label: string;
    recoveryCopy: string;
  }[];
  scenario: AppAccountAuthRouteScenario;
}

export type AppAccountAuthRouteViewModel =
  | {
      state: "success";
      auth: OrbitAccountAuthViewModel;
    }
  | {
      state: "route-state";
      routeState: AppAccountAuthRouteStateViewModel;
    };

export async function loadAppAccountAuthRouteViewModel({
  authMode,
  searchParams,
}: AppAccountAuthRouteInput): Promise<AppAccountAuthRouteViewModel> {
  const auth = getOrbitAccountAuthViewModel(authMode);

  return {
    auth: {
      ...auth,
      defaultNext: normalizeOrbitAuthReturnPath(
        searchParams?.next,
        auth.defaultNext,
      ),
    },
    state: "success",
  };
}
