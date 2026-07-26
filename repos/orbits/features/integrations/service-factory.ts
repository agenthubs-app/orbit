import { createConfiguredPostgresLiveRecordStore } from "../../shared/storage/configured-live-record-store";
import type { OrbitIntegrationProvider } from "./contract";
import { createOrbitIntegrationService, type OrbitIntegrationProviderConfig, type OrbitIntegrationService } from "./service";
import { createEncryptedIntegrationTokenVault } from "./token-vault";
import {
  createIntegrationOAuthStateStore,
  createPostgresIntegrationOAuthStateAtomicConsume,
} from "./oauth-state-store";
import { createIntegrationHealthStore } from "./health-store";

const cachedServices = new Map<string, OrbitIntegrationService>();

export function validateIntegrationScopes(
  provider: OrbitIntegrationProvider,
  scopes: readonly string[],
): readonly string[] {
  const normalizedScopes = scopes.map((scope) =>
    scope
      .toLowerCase()
      .replace(/^https?:\/\/[^/]+\//, "")
      .replace(/^auth\//, ""),
  );
  const allowed = {
    google_calendar: new Set([
      "calendar.events.readonly",
      "calendar.events",
      "calendar.events.write",
    ]),
    gmail: new Set(["gmail.metadata", "gmail.metadata.readonly"]),
    microsoft_graph: new Set([
      "calendar.read",
      "calendar.readwrite",
      "calendars.read",
      "calendars.readwrite",
      "mail.readbasic",
      "offline_access",
    ]),
  }[provider];
  if (normalizedScopes.some((scope) => !allowed.has(scope))) {
    throw new Error(
      `${provider} scopes exceed Orbit's metadata/calendar-only integration policy.`,
    );
  }
  return normalizedScopes;
}

function configFor(
  provider: OrbitIntegrationProvider,
  env: NodeJS.ProcessEnv,
): OrbitIntegrationProviderConfig | null {
  const prefix =
    provider === "google_calendar"
      ? "ORBIT_GOOGLE_CALENDAR"
      : provider === "gmail"
        ? "ORBIT_GMAIL"
        : "ORBIT_MICROSOFT_GRAPH";
  const authorizationEndpoint = env[`${prefix}_AUTHORIZATION_ENDPOINT`]?.trim();
  const tokenEndpoint = env[`${prefix}_TOKEN_ENDPOINT`]?.trim();
  const apiBaseUrl = env[`${prefix}_API_BASE_URL`]?.trim();
  const clientId = env[`${prefix}_CLIENT_ID`]?.trim();
  const clientSecret = env[`${prefix}_CLIENT_SECRET`]?.trim();
  const redirectUri = env[`${prefix}_REDIRECT_URI`]?.trim();
  const scopes = env[`${prefix}_SCOPES`]
    ?.split(/\s+/)
    .map((value) => value.trim())
    .filter(Boolean);
  if (
    !authorizationEndpoint ||
    !tokenEndpoint ||
    !apiBaseUrl ||
    !clientId ||
    !clientSecret ||
    !redirectUri ||
    !scopes?.length
  ) {
    return null;
  }
  validateIntegrationScopes(provider, scopes);
  return {
    authorizationEndpoint,
    tokenEndpoint,
    apiBaseUrl,
    clientId,
    clientSecret,
    redirectUri,
    scopes,
  };
}

export function createConfiguredOrbitIntegrationService(
  input: {
    actorId?: string;
    env?: NodeJS.ProcessEnv;
  } = {},
): OrbitIntegrationService | null {
  const actorId = input.actorId?.trim();
  if (!actorId) return null;
  const env = input.env ?? process.env;
  const configuredStore = createConfiguredPostgresLiveRecordStore({ env });
  const encryptionKeyBase64 = env.ORBIT_INTEGRATION_TOKEN_KEY?.trim();
  if (!configuredStore || !encryptionKeyBase64) return null;
  const cacheKey = `${configuredStore.workspaceId}\u0000${actorId}`;
  if (env === process.env) {
    const cached = cachedServices.get(cacheKey);
    if (cached) return cached;
  }
  const configs = Object.fromEntries(
    (
      [
        "google_calendar",
        "gmail",
        "microsoft_graph",
      ] as const
    ).flatMap((provider) => {
      const config = configFor(provider, env);
      return config ? [[provider, config]] : [];
    }),
  );
  const service = createOrbitIntegrationService({
    configs,
    healthStore: createIntegrationHealthStore({
      store: configuredStore.store,
      workspaceId: configuredStore.workspaceId,
      userId: actorId,
    }),
    oauthStates: createIntegrationOAuthStateStore({
      store: configuredStore.store,
      workspaceId: configuredStore.workspaceId,
      userId: actorId,
      atomicConsume: createPostgresIntegrationOAuthStateAtomicConsume({
        client: configuredStore.client,
        workspaceId: configuredStore.workspaceId,
      }),
    }),
    vault: createEncryptedIntegrationTokenVault({
      encryptionKeyBase64,
      store: configuredStore.store,
      workspaceId: configuredStore.workspaceId,
      userId: actorId,
    }),
  });
  if (env === process.env) cachedServices.set(cacheKey, service);
  return service;
}
