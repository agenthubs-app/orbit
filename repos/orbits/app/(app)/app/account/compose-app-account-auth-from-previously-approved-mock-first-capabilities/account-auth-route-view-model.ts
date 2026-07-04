import type {
  AccountSessionErrorDefinition,
  AccountSessionPayload,
  AccountSessionScenario,
} from "../../../../../features/account/contract";
import { createAccountSessionService } from "../../../../../features/account/service-factory";
import type { ModuleMode } from "../../../../../shared/services/module-mode";
import {
  getOrbitAccountAuthViewModel,
  type OrbitAccountAuthMode,
  type OrbitAccountAuthViewModel,
} from "../../orbit-account-auth-route-view-model";

export type AppAccountAuthSearchParams = Record<
  string,
  string | string[] | undefined
>;
export type AppAccountAuthRouteScenario = "empty" | "pending" | "failure";

export interface AppAccountAuthRouteInput {
  authMode: OrbitAccountAuthMode;
  mode?: ModuleMode | string | null;
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
      session: AccountSessionPayload;
    }
  | {
      state: "route-state";
      routeState: AppAccountAuthRouteStateViewModel;
    };

function readSearchParam(
  searchParams: AppAccountAuthSearchParams | undefined,
  key: string,
): string | null {
  const value = searchParams?.[key];

  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function readAccountScenario(
  searchParams: AppAccountAuthSearchParams | undefined,
): AccountSessionScenario | undefined {
  const scenario = readSearchParam(searchParams, "scenario");

  if (
    scenario === "demo-sign-in" ||
    scenario === "signed-out" ||
    scenario === "pending" ||
    scenario === "require-account"
  ) {
    return scenario;
  }

  return undefined;
}

function routeState(input: {
  error: AccountSessionErrorDefinition & {
    evidenceIds?: readonly string[];
  };
}): AppAccountAuthRouteViewModel {
  return {
    routeState: {
      copy: {
        description:
          "Account auth could not load the current account session context.",
        emptyState:
          "The auth form is held until the account session source is configured.",
        eyebrow: "Account",
        guardrail:
          "This route only reads account session context. It does not create accounts, reset passwords, write cookies, send email, call OAuth providers, or contact external services.",
        nextStep:
          "Configure the account live store or switch to mock mode before testing account auth.",
        purpose:
          "Keep account entry tied to the replaceable account-session feature boundary.",
        title: "Account auth could not load",
      },
      errorCode: input.error.code,
      evidenceIds: Array.from(
        new Set([input.error.code, ...(input.error.evidenceIds ?? [])]),
      ),
      recoveryActions: [
        {
          id: "account-auth-return-home",
          href: "/app",
          label: "Return to app",
          recoveryCopy:
            "Return to the app shell before retrying account auth.",
        },
        {
          id: "account-auth-check-profile",
          href: "/app/profile",
          label: "Review profile",
          recoveryCopy:
            "Confirm profile/live storage setup before testing auth in live mode.",
        },
      ],
      scenario: "failure",
    },
    state: "route-state",
  };
}

export async function loadAppAccountAuthRouteViewModel({
  authMode,
  mode,
  searchParams,
}: AppAccountAuthRouteInput): Promise<AppAccountAuthRouteViewModel> {
  const accountService = createAccountSessionService(
    mode ?? readSearchParam(searchParams, "mode") ?? undefined,
  );
  const session = await accountService.getCurrentSession({
    scenario: readAccountScenario(searchParams),
  });

  if (session.success === false) {
    return routeState({ error: session.error });
  }

  return {
    auth: getOrbitAccountAuthViewModel(authMode),
    session: session.data,
    state: "success",
  };
}
