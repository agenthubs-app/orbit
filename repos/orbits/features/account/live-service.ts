import {
  ACCOUNT_SESSION_ERROR_DEFINITIONS,
  type AccountSessionFailure,
  type AccountSessionPayload,
  type AccountSessionResult,
  type AccountSessionScenario,
  type AccountSessionSuccess,
} from "./contract";
import type { AccountSessionService } from "./service";
import type {
  LiveAccountProfileRecord,
  LiveAccountSessionGraph,
  LiveAccountSessionProvider,
} from "./storage/account-live-record-provider";
import type { AccountDTO } from "../../shared/domain/contracts";

export interface LiveAccountSessionServiceOptions {
  now?: () => string;
  provider?: LiveAccountSessionProvider | null;
}

const supportedScenarios = new Set<AccountSessionScenario>([
  "demo-sign-in",
  "signed-out",
  "pending",
  "require-account",
]);

function clonePayload(payload: AccountSessionPayload): AccountSessionPayload {
  return JSON.parse(JSON.stringify(payload)) as AccountSessionPayload;
}

function success(payload: AccountSessionPayload): AccountSessionSuccess {
  return {
    success: true,
    data: clonePayload(payload),
  };
}

function normalizeScenario(
  scenario?: AccountSessionScenario | string | null,
): AccountSessionScenario {
  if (scenario && supportedScenarios.has(scenario as AccountSessionScenario)) {
    return scenario as AccountSessionScenario;
  }

  return "demo-sign-in";
}

function unconfiguredProvenance(now: string) {
  return {
    source: "live-record-store:account-session:unconfigured",
    sourceLabel: "Unconfigured Account live store",
    evidenceIds: ["evidence:account-live-store-unconfigured"],
    collectedAt: now,
    privacy: "live-account-session" as const,
  };
}

function failure(
  code: AccountSessionFailure["error"]["code"],
  provenance = unconfiguredProvenance(new Date(0).toISOString()),
): AccountSessionFailure {
  const definition = ACCOUNT_SESSION_ERROR_DEFINITIONS[code];

  return {
    success: false,
    error: {
      ...definition,
      state: "failure",
      provenance,
      evidenceIds: provenance.evidenceIds,
    },
  };
}

function livePolicyProvenance(now: string, label: string) {
  return {
    source: "live-account-session-policy",
    sourceLabel: label,
    evidenceIds: ["evidence:account-live-session-policy"],
    collectedAt: now,
    privacy: "live-account-session" as const,
  };
}

function profileForAccount(
  graph: LiveAccountSessionGraph,
  account: AccountDTO,
): LiveAccountProfileRecord | null {
  return (
    graph.profiles.find(
      (profile) =>
        profile.id === "profile_orbit_generated_operator" &&
        profile.accountId === account.id,
    ) ??
    graph.profiles.find((profile) => profile.accountId === account.id) ??
    null
  );
}

function selectAccountAndProfile(graph: LiveAccountSessionGraph):
  | {
      account: AccountDTO;
      profile: LiveAccountProfileRecord;
    }
  | null {
  const sortedAccounts = [...graph.accounts].sort((left, right) =>
    left.id.localeCompare(right.id),
  );

  for (const account of sortedAccounts) {
    const profile = profileForAccount(graph, account);

    if (profile) {
      return { account, profile };
    }
  }

  return null;
}

function signedOutPayload(now: string, label: string): AccountSessionPayload {
  return {
    state: "empty",
    session: {
      status: "signed-out",
      mockSessionId: null,
      signedInAt: null,
      signedOutAt: now,
      expiresAt: null,
    },
    account: null,
    user: null,
    profile: null,
    provenance: livePolicyProvenance(now, label),
    nextAction:
      "Configure a live account session provider before entering protected relationship workflows.",
  };
}

function pendingPayload(now: string): AccountSessionPayload {
  return {
    state: "pending",
    session: {
      status: "pending",
      mockSessionId: "live-session-pending-account-context",
      signedInAt: null,
      signedOutAt: null,
      expiresAt: null,
    },
    account: null,
    user: null,
    profile: null,
    provenance: livePolicyProvenance(now, "Live account pending session rule"),
    nextAction:
      "Wait for a remote account session before running protected relationship actions.",
  };
}

function emptyLiveStorePayload(
  graph: LiveAccountSessionGraph,
  provider: LiveAccountSessionProvider,
): AccountSessionPayload {
  return {
    ...signedOutPayload(graph.generatedAt, "Empty Account live store"),
    provenance: {
      source: provider.source,
      sourceLabel: provider.sourceLabel,
      evidenceIds: graph.evidenceIds,
      collectedAt: graph.generatedAt,
      privacy: "live-account-session",
    },
    nextAction:
      "Seed accounts and profiles into live storage before entering protected relationship workflows.",
  };
}

function sessionPayload(
  graph: LiveAccountSessionGraph,
  provider: LiveAccountSessionProvider,
): AccountSessionPayload {
  const selected = selectAccountAndProfile(graph);

  if (!selected) {
    return emptyLiveStorePayload(graph, provider);
  }

  const { account, profile } = selected;
  const headline = profile.headline ?? profile.role ?? "Relationship operator";

  return {
    state: "success",
    session: {
      status: "signed-in",
      mockSessionId: `live-session:${account.id}:${profile.id}`,
      signedInAt: graph.generatedAt,
      signedOutAt: null,
      expiresAt: null,
    },
    account: {
      id: account.id,
      displayName: account.name,
      workspaceName: account.name,
      role: profile.role ?? "operator",
      plan: "live-relationship-os",
    },
    user: {
      id: profile.id,
      displayName: profile.displayName,
      loginLabel: profile.displayName,
      timezone: profile.timezone ?? "UTC",
    },
    profile: {
      headline,
      relationshipGoal:
        profile.relationshipGoal ??
        "Use remote live storage to develop source-backed relationship workflows.",
      homeMarket: profile.homeMarket ?? "Tokyo",
      preferredFollowUpWindow: profile.preferredFollowUpWindow ?? "48 hours",
    },
    provenance: {
      source: provider.source,
      sourceLabel: provider.sourceLabel,
      evidenceIds: graph.evidenceIds,
      collectedAt: graph.generatedAt,
      privacy: "live-account-session",
    },
    nextAction:
      "Use the remote account context while keeping auth tokens outside Orbit feature contracts.",
  };
}

async function currentSession(
  provider: LiveAccountSessionProvider | null,
  now: string,
): Promise<AccountSessionResult> {
  if (!provider) {
    return failure(
      "ACCOUNT_LIVE_STORE_UNCONFIGURED",
      unconfiguredProvenance(now),
    );
  }

  return success(sessionPayload(await provider.readAccountSessionGraph(), provider));
}

export function createLiveAccountSessionService({
  now = () => new Date().toISOString(),
  provider = null,
}: LiveAccountSessionServiceOptions = {}): AccountSessionService {
  const service: AccountSessionService = {
    demoSignIn() {
      return currentSession(provider, now());
    },

    getCurrentSession(options = {}) {
      switch (normalizeScenario(options.scenario)) {
        case "signed-out":
          return service.getSignedOutSession();
        case "pending":
          return service.getPendingDemoSignIn();
        case "require-account":
          return service.requireAccount("signed-out");
        case "demo-sign-in":
        default:
          return service.demoSignIn();
      }
    },

    getPendingDemoSignIn() {
      return success(pendingPayload(now()));
    },

    getSignedOutSession() {
      return success(signedOutPayload(now(), "Live account signed-out rule"));
    },

    async requireAccount(scenario = "demo-sign-in"): Promise<AccountSessionResult> {
      if (!provider) {
        return failure(
          "ACCOUNT_LIVE_STORE_UNCONFIGURED",
          unconfiguredProvenance(now()),
        );
      }

      if (normalizeScenario(scenario) === "demo-sign-in") {
        const result = await service.demoSignIn();

        if (result.success === true && result.data.account) {
          return result;
        }
      }

      return failure(
        "ACCOUNT_REQUIRED",
        livePolicyProvenance(now(), "Live require-account guard rule"),
      );
    },

    signOut() {
      return service.getSignedOutSession();
    },
  };

  return service;
}
