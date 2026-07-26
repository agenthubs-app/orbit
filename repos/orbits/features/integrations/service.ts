import type {
  ExternalCalendarEventSummary,
  ExternalRelationshipSignal,
  IntegrationAuthorization,
  IntegrationHealthRecord,
  IntegrationToken,
  OrbitIntegrationCapability,
  OrbitIntegrationProvider,
} from "./contract";
import { createHash } from "node:crypto";
import { ORBIT_INTEGRATION_PROVIDERS } from "./contract";
import {
  createMemoryIntegrationHealthStore,
  type IntegrationHealthStore,
} from "./health-store";
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
    actorId: string;
    sessionBinding: string;
    state: string;
    expiresAt: string;
    now: string;
  }) => Promise<void>;
  consumeOAuthState: (input: {
    provider: OrbitIntegrationProvider;
    actorId: string;
    sessionBinding: string;
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
  assertPermission: (input: {
    provider: OrbitIntegrationProvider;
    permission: string;
  }) => Promise<void>;
  checkHealth: (
    provider: OrbitIntegrationProvider,
    now?: string,
  ) => Promise<IntegrationAuthorization>;
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

function emailDomain(value: unknown): string | undefined {
  const address = text(value);
  const match = address?.match(/@([a-z0-9.-]+\.[a-z]{2,})/i);
  return match?.[1]?.toLowerCase();
}

function gmailMetadataHeader(
  item: Record<string, unknown>,
  name: string,
): string | undefined {
  const headers = array(object(item.payload).headers);
  const match = headers
    .map(object)
    .find(
      (header) =>
        text(header.name)?.toLowerCase() === name.toLowerCase(),
    );
  return text(match?.value);
}

function normalizedScope(scope: string): string {
  return scope
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/[^/]+\//, "")
    .replace(/^auth\//, "");
}

export function integrationCapabilitiesFor(
  provider: OrbitIntegrationProvider,
  scopes: readonly string[],
): readonly OrbitIntegrationCapability[] {
  const granted = new Set(scopes.map(normalizedScope));
  if (provider === "gmail") {
    return granted.has("gmail.metadata") ||
      granted.has("gmail.metadata.readonly")
      ? ["mail.metadata.read"]
      : [];
  }
  if (provider === "google_calendar") {
    const canWrite =
      granted.has("calendar.events") ||
      granted.has("calendar.events.write");
    const canRead =
      canWrite || granted.has("calendar.events.readonly");
    return [
      ...(canRead ? (["calendar.read"] as const) : []),
      ...(canWrite ? (["calendar.write"] as const) : []),
    ];
  }
  const canWrite =
    granted.has("calendar.readwrite") ||
    granted.has("calendars.readwrite");
  const canRead =
    canWrite ||
    granted.has("calendar.read") ||
    granted.has("calendars.read");
  return [
    ...(canRead ? (["calendar.read"] as const) : []),
    ...(canWrite ? (["calendar.write"] as const) : []),
    ...(granted.has("mail.readbasic")
      ? (["mail.metadata.read"] as const)
      : []),
  ];
}

export function createOrbitIntegrationService(input: {
  configs: Partial<
    Record<OrbitIntegrationProvider, OrbitIntegrationProviderConfig>
  >;
  vault: IntegrationTokenVault;
  oauthStates: IntegrationOAuthStateStore;
  healthStore?: IntegrationHealthStore;
}): OrbitIntegrationService {
  const healthStore =
    input.healthStore ?? createMemoryIntegrationHealthStore();

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

  async function authorizationFor(
    provider: OrbitIntegrationProvider,
    now: string,
  ): Promise<IntegrationAuthorization> {
    const configured = Boolean(input.configs[provider]);
    const providerToken = configured
      ? await input.vault.get(provider)
      : null;
    const expired =
      Boolean(providerToken?.expiresAt) &&
      Date.parse(providerToken?.expiresAt ?? "") <= Date.parse(now) &&
      !providerToken?.refreshToken;
    const status: IntegrationAuthorization["status"] = !configured
      ? "unavailable"
      : !providerToken
        ? "pending"
        : expired
          ? "expired"
          : "active";
    const lastHealth =
      status === "active" ? await healthStore.get(provider) : null;
    const healthStatus: IntegrationAuthorization["healthStatus"] =
      status === "unavailable"
        ? "unavailable"
        : status === "pending" || status === "expired"
          ? "action_required"
          : lastHealth?.status ?? "not_checked";
    const healthMessage =
      status === "unavailable"
        ? "Provider configuration is unavailable."
        : status === "pending"
          ? "Connect this provider to enable its capabilities."
          : status === "expired"
            ? "Authorization expired and must be renewed."
            : lastHealth?.message ??
              "Connected. Run a read-only health check to verify provider access.";
    return {
      authorizationId: `integration:${provider}`,
      provider,
      scopes:
        providerToken?.scopes ?? input.configs[provider]?.scopes ?? [],
      status,
      capabilities: providerToken
        ? integrationCapabilitiesFor(provider, providerToken.scopes)
        : [],
      healthStatus,
      healthMessage,
      lastCheckedAt: lastHealth?.checkedAt,
      createdAt: now,
      updatedAt: lastHealth?.checkedAt ?? now,
      expiresAt: providerToken?.expiresAt,
    };
  }

  async function assertPermission(inputValue: {
    provider: OrbitIntegrationProvider;
    permission: string;
  }): Promise<void> {
    const providerToken = await token(inputValue.provider);
    const capabilities = integrationCapabilitiesFor(
      inputValue.provider,
      providerToken.scopes,
    );
    const requiredCapability =
      inputValue.permission === "calendar.events.write"
        ? "calendar.write"
        : inputValue.permission.includes("mail")
          ? "mail.metadata.read"
          : "calendar.read";
    if (!capabilities.includes(requiredCapability)) {
      throw new Error(
        `${inputValue.provider} authorization does not grant ${inputValue.permission}. Reconnect with the required scope.`,
      );
    }
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
      await healthStore.remove(provider, now);
    },
    async listCalendarEvents({ provider, timeMin, timeMax }) {
      await assertPermission({
        provider,
        permission: "calendar.events.read",
      });
      const path =
        provider === "google_calendar"
          ? `/calendars/primary/events?singleEvents=true&orderBy=startTime&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`
          : `/me/calendarView?startDateTime=${encodeURIComponent(timeMin)}&endDateTime=${encodeURIComponent(timeMax)}`;
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
      await assertPermission({
        provider,
        permission:
          provider === "google_calendar"
            ? "calendar.events.read"
            : "mail.metadata.read",
      });
      let values: unknown[];
      if (provider === "gmail") {
        const after = Math.max(
          0,
          Math.floor(Date.parse(since) / 1_000),
        );
        const body = object(
          await api(
            provider,
            `/messages?q=${encodeURIComponent(`after:${after}`)}&maxResults=25`,
          ),
        );
        const candidates = array(body.messages ?? body.items).slice(0, 25);
        values = await Promise.all(
          candidates.map(async (candidate) => {
            const item = object(candidate);
            const id = text(item.id);
            if (
              !id ||
              text(item.occurredAt) ||
              text(item.internalDate) ||
              object(item.payload).headers
            ) {
              return item;
            }
            return object(
              await api(
                provider,
                `/messages/${encodeURIComponent(id)}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
              ),
            );
          }),
        );
      } else {
        const path =
          provider === "google_calendar"
            ? `/calendars/primary/events?singleEvents=true&timeMin=${encodeURIComponent(since)}&maxResults=50`
            : `/me/messages?$select=id,receivedDateTime,subject,sender&$filter=${encodeURIComponent(`receivedDateTime ge ${since}`)}&$top=50`;
        const body = object(await api(provider, path));
        values = array(body.items ?? body.value);
      }
      return values.flatMap((value) => {
        const item = object(value);
        const id = text(item.id);
        const gmailInternalDate = text(item.internalDate);
        const gmailDate = gmailMetadataHeader(item, "Date");
        const occurredAt =
          text(item.occurredAt) ??
          text(item.receivedDateTime) ??
          text(object(item.start).dateTime) ??
          (gmailInternalDate &&
          Number.isFinite(Number(gmailInternalDate))
            ? new Date(Number(gmailInternalDate)).toISOString()
            : gmailDate && Number.isFinite(Date.parse(gmailDate))
              ? new Date(gmailDate).toISOString()
              : undefined);
        if (!id || !occurredAt) return [];
        const sender =
          object(object(item.sender).emailAddress).address ??
          gmailMetadataHeader(item, "From");
        return [
          {
            providerRecordId: id,
            kind:
              provider === "google_calendar"
                ? ("calendar_metadata" as const)
                : ("email_metadata" as const),
            occurredAt,
            counterpartDomain:
              text(item.counterpartDomain) ?? emailDomain(sender),
            subjectHint:
              text(item.subjectHint) ??
              text(item.subject) ??
              gmailMetadataHeader(item, "Subject"),
            evidenceId: `evidence:${provider}:signal:${id}`,
            messageBodyPersisted: false as const,
          },
        ];
      });
    },
    async createCalendarEvent({ provider, payload, idempotencyKey }) {
      await assertPermission({
        provider,
        permission: "calendar.events.write",
      });
      const providerKey = createHash("sha256")
        .update(idempotencyKey)
        .digest("hex");
      const title = text(payload.title);
      const startsAt = text(payload.startsAt);
      if (!title || !startsAt || !Number.isFinite(Date.parse(startsAt))) {
        throw new Error(
          "Calendar event title and ISO startsAt are required.",
        );
      }
      const endsAt =
        text(payload.endsAt) ??
        new Date(Date.parse(startsAt) + 60 * 60_000).toISOString();
      if (
        !Number.isFinite(Date.parse(endsAt)) ||
        Date.parse(endsAt) <= Date.parse(startsAt)
      ) {
        throw new Error("Calendar event endsAt must be after startsAt.");
      }
      const location = text(payload.location);
      const idempotentPayload =
        provider === "google_calendar"
          ? {
              id: `orbit${providerKey}`,
              summary: title,
              start: { dateTime: new Date(startsAt).toISOString() },
              end: { dateTime: new Date(endsAt).toISOString() },
              ...(location ? { location } : {}),
            }
          : {
              subject: title,
              start: {
                dateTime: new Date(startsAt).toISOString(),
                timeZone: "UTC",
              },
              end: {
                dateTime: new Date(endsAt).toISOString(),
                timeZone: "UTC",
              },
              ...(location
                ? { location: { displayName: location } }
                : {}),
              transactionId: providerKey,
            };
      const body = object(
        await api(
          provider,
          provider === "google_calendar"
            ? "/calendars/primary/events"
            : "/me/events",
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
    assertPermission,
    async checkHealth(provider, now = new Date().toISOString()) {
      const authorization = await authorizationFor(provider, now);
      if (authorization.status !== "active") return authorization;
      const startedAt = Date.now();
      let record: IntegrationHealthRecord;
      try {
        const path =
          provider === "google_calendar"
            ? "/users/me/calendarList?maxResults=1"
            : provider === "gmail"
              ? "/profile"
              : "/me?$select=id";
        await api(provider, path, { method: "GET" });
        record = {
          provider,
          status: "healthy",
          message: "Provider access verified with a read-only request.",
          checkedAt: now,
          latencyMs: Math.max(0, Date.now() - startedAt),
        };
      } catch (error) {
        record = {
          provider,
          status: "degraded",
          message:
            error instanceof Error
              ? error.message
              : "Provider health check failed.",
          checkedAt: now,
          latencyMs: Math.max(0, Date.now() - startedAt),
        };
      }
      await healthStore.save(record);
      return authorizationFor(provider, now);
    },
    async listAuthorizations(now = new Date().toISOString()) {
      return Promise.all(
        ORBIT_INTEGRATION_PROVIDERS.map((provider) =>
          authorizationFor(provider, now),
        ),
      );
    },
    async revoke(provider, now) {
      await input.vault.revoke(provider, now);
      await healthStore.remove(provider, now);
    },
  };
}
