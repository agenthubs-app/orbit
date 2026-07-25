import type {
  ExternalCalendarEventSummary,
  ExternalRelationshipSignal,
  IntegrationAuthorization,
  IntegrationToken,
  OrbitIntegrationProvider,
} from "./contract";
import { createHash } from "node:crypto";
import { ORBIT_INTEGRATION_PROVIDERS } from "./contract";
import type { IntegrationTokenVault } from "./token-vault";
import type { IntegrationOAuthStateStore } from "./oauth-state-store";

export interface OrbitIntegrationProviderConfig {
  authorizationEndpoint: string;
  tokenEndpoint: string;
  apiBaseUrl: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: readonly string[];
}

export interface OrbitIntegrationService {
  authorizationUrl: (input: {
    provider: OrbitIntegrationProvider;
    state: string;
  }) => string;
  registerOAuthState: (input: {
    provider: OrbitIntegrationProvider;
    state: string;
    expiresAt: string;
    now: string;
  }) => Promise<void>;
  consumeOAuthState: (input: {
    provider: OrbitIntegrationProvider;
    state: string;
    now: string;
  }) => Promise<boolean>;
  exchangeCode: (input: {
    provider: OrbitIntegrationProvider;
    code: string;
    now: string;
  }) => Promise<void>;
  listCalendarEvents: (input: {
    provider: "google_calendar" | "microsoft_graph";
    timeMin: string;
    timeMax: string;
  }) => Promise<readonly ExternalCalendarEventSummary[]>;
  listRelationshipSignals: (input: {
    provider: OrbitIntegrationProvider;
    since: string;
  }) => Promise<readonly ExternalRelationshipSignal[]>;
  createCalendarEvent: (input: {
    provider: "google_calendar" | "microsoft_graph";
    payload: Readonly<Record<string, unknown>>;
    idempotencyKey: string;
  }) => Promise<{ providerRecordId: string }>;
  listAuthorizations: (
    now?: string,
  ) => Promise<readonly IntegrationAuthorization[]>;
  revoke: (provider: OrbitIntegrationProvider, now: string) => Promise<void>;
}

function isProvider(value: string): value is OrbitIntegrationProvider {
  return (ORBIT_INTEGRATION_PROVIDERS as readonly string[]).includes(value);
}

function object(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function createOrbitIntegrationService(input: {
  configs: Partial<
    Record<OrbitIntegrationProvider, OrbitIntegrationProviderConfig>
  >;
  vault: IntegrationTokenVault;
  oauthStates: IntegrationOAuthStateStore;
}): OrbitIntegrationService {
  function config(provider: OrbitIntegrationProvider) {
    const value = input.configs[provider];
    if (!value) throw new Error(`${provider} integration is not configured.`);
    return value;
  }

  async function token(provider: OrbitIntegrationProvider) {
    const value = await input.vault.get(provider);
    if (!value) {
      throw new Error(
        `${provider} is not authorized. Connect it separately from sign-in.`,
      );
    }
    const expiresAt = value.expiresAt
      ? Date.parse(value.expiresAt)
      : Number.POSITIVE_INFINITY;
    if (
      expiresAt > Date.now() + 60_000 ||
      !value.refreshToken
    ) {
      return value;
    }
    const providerConfig = config(provider);
    const response = await fetch(providerConfig.tokenEndpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: providerConfig.clientId,
        client_secret: providerConfig.clientSecret,
        refresh_token: value.refreshToken,
        grant_type: "refresh_token",
      }),
    });
    const body = object(await response.json().catch(() => ({})));
    const accessToken = text(body.access_token);
    if (!response.ok || !accessToken) {
      throw new Error(`${provider} token refresh failed.`);
    }
    const expiresIn =
      typeof body.expires_in === "number" ? body.expires_in : undefined;
    const refreshed: IntegrationToken = {
      accessToken,
      refreshToken: text(body.refresh_token) ?? value.refreshToken,
      expiresAt: expiresIn
        ? new Date(Date.now() + expiresIn * 1_000).toISOString()
        : value.expiresAt,
      scopes: text(body.scope)?.split(/\s+/) ?? value.scopes,
      tokenType: text(body.token_type) ?? value.tokenType,
    };
    await input.vault.save(provider, refreshed, new Date().toISOString());
    return refreshed;
  }

  async function api(
    provider: OrbitIntegrationProvider,
    path: string,
    init?: RequestInit,
  ): Promise<unknown> {
    const providerConfig = config(provider);
    const providerToken = await token(provider);
    const response = await fetch(
      `${providerConfig.apiBaseUrl.replace(/\/$/, "")}${path}`,
      {
        ...init,
        headers: {
          authorization: `Bearer ${providerToken.accessToken}`,
          "content-type": "application/json",
          ...init?.headers,
        },
      },
    );
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`${provider} API returned HTTP ${response.status}.`);
    }
    return body;
  }

  return {
    authorizationUrl({ provider, state }) {
      if (!isProvider(provider)) throw new Error("Unknown provider.");
      const providerConfig = config(provider);
      const url = new URL(providerConfig.authorizationEndpoint);
      url.searchParams.set("client_id", providerConfig.clientId);
      url.searchParams.set("redirect_uri", providerConfig.redirectUri);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("scope", providerConfig.scopes.join(" "));
      url.searchParams.set("state", state);
      url.searchParams.set("access_type", "offline");
      return url.toString();
    },
    registerOAuthState: input.oauthStates.register,
    consumeOAuthState: input.oauthStates.consume,
    async exchangeCode({ provider, code, now }) {
      const providerConfig = config(provider);
      const response = await fetch(providerConfig.tokenEndpoint, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: providerConfig.clientId,
          client_secret: providerConfig.clientSecret,
          code,
          grant_type: "authorization_code",
          redirect_uri: providerConfig.redirectUri,
        }),
      });
      const body = object(await response.json().catch(() => ({})));
      const accessToken = text(body.access_token);
      if (!response.ok || !accessToken) {
        throw new Error(
          `${provider} token exchange returned HTTP ${response.status}.`,
        );
      }
      const expiresIn =
        typeof body.expires_in === "number" ? body.expires_in : undefined;
      const integrationToken: IntegrationToken = {
        accessToken,
        refreshToken: text(body.refresh_token),
        expiresAt: expiresIn
          ? new Date(Date.parse(now) + expiresIn * 1_000).toISOString()
          : undefined,
        scopes: text(body.scope)?.split(/\s+/) ?? providerConfig.scopes,
        tokenType: text(body.token_type) ?? "Bearer",
      };
      await input.vault.save(provider, integrationToken, now);
    },
    async listCalendarEvents({ provider, timeMin, timeMax }) {
      const path =
        provider === "google_calendar"
          ? `/calendar/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`
          : `/calendarView?startDateTime=${encodeURIComponent(timeMin)}&endDateTime=${encodeURIComponent(timeMax)}`;
      const body = object(await api(provider, path));
      const items = array(body.items ?? body.value);
      return items.flatMap((value) => {
        const item = object(value);
        const start = object(item.start);
        const end = object(item.end);
        const id = text(item.id);
        const startsAt =
          text(start.dateTime) ?? text(start.date) ?? text(item.startDateTime);
        if (!id || !startsAt) return [];
        return [
          {
            providerRecordId: id,
            title: text(item.summary) ?? text(item.subject) ?? "Calendar event",
            startsAt,
            endsAt:
              text(end.dateTime) ?? text(end.date) ?? text(item.endDateTime),
            location:
              text(item.location) ?? text(object(item.location).displayName),
            attendeeCount: array(item.attendees).length,
            evidenceId: `evidence:${provider}:calendar:${id}`,
          },
        ];
      });
    },
    async listRelationshipSignals({ provider, since }) {
      const path =
        provider === "gmail"
          ? `/messages/metadata?since=${encodeURIComponent(since)}`
          : provider === "google_calendar"
            ? `/calendar/events/metadata?since=${encodeURIComponent(since)}`
            : `/relationship-signals?since=${encodeURIComponent(since)}`;
      const body = object(await api(provider, path));
      return array(body.items ?? body.value).flatMap((value) => {
        const item = object(value);
        const id = text(item.id);
        const occurredAt =
          text(item.occurredAt) ??
          text(item.receivedDateTime) ??
          text(object(item.start).dateTime);
        if (!id || !occurredAt) return [];
        return [
          {
            providerRecordId: id,
            kind:
              provider === "google_calendar"
                ? ("calendar_metadata" as const)
                : ("email_metadata" as const),
            occurredAt,
            counterpartDomain: text(item.counterpartDomain),
            subjectHint: text(item.subjectHint) ?? text(item.subject),
            evidenceId: `evidence:${provider}:signal:${id}`,
            messageBodyPersisted: false as const,
          },
        ];
      });
    },
    async createCalendarEvent({ provider, payload, idempotencyKey }) {
      const providerKey = createHash("sha256")
        .update(idempotencyKey)
        .digest("hex");
      const idempotentPayload =
        provider === "google_calendar"
          ? { ...payload, id: `orbit${providerKey}` }
          : { ...payload, transactionId: providerKey };
      const body = object(
        await api(
          provider,
          provider === "google_calendar" ? "/calendar/events" : "/events",
          {
            method: "POST",
            body: JSON.stringify(idempotentPayload),
            headers: { "idempotency-key": idempotencyKey },
          },
        ),
      );
      const id = text(body.id);
      if (!id) throw new Error(`${provider} returned no event id.`);
      return { providerRecordId: id };
    },
    async listAuthorizations(now = new Date().toISOString()) {
      return Promise.all(
        ORBIT_INTEGRATION_PROVIDERS.map(async (provider) => {
          const configured = Boolean(input.configs[provider]);
          const providerToken = configured
            ? await input.vault.get(provider)
            : null;
          const expired =
            Boolean(providerToken?.expiresAt) &&
            Date.parse(providerToken?.expiresAt ?? "") <= Date.parse(now) &&
            !providerToken?.refreshToken;
          return {
            authorizationId: `integration:${provider}`,
            provider,
            scopes:
              providerToken?.scopes ?? input.configs[provider]?.scopes ?? [],
            status: !configured
              ? "unavailable"
              : !providerToken
                ? "pending"
                : expired
                  ? "expired"
                  : "active",
            createdAt: now,
            updatedAt: now,
            expiresAt: providerToken?.expiresAt,
          };
        }),
      );
    },
    revoke: (provider, now) => input.vault.revoke(provider, now),
  };
}
