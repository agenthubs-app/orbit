import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import {
  createIntegrationOAuthState,
  verifyIntegrationOAuthState,
} from "../../features/integrations/oauth-state";
import { createIntegrationOAuthStateStore } from "../../features/integrations/oauth-state-store";
import { createOrbitIntegrationService } from "../../features/integrations/service";
import { validateIntegrationScopes } from "../../features/integrations/service-factory";
import { createEncryptedIntegrationTokenVault } from "../../features/integrations/token-vault";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

test("integration tokens are encrypted at rest and OAuth state is signed, expiring, and one-time", async () => {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const workspaceId = "integration-security";
  const key = randomBytes(32).toString("base64");
  const vault = createEncryptedIntegrationTokenVault({
    encryptionKeyBase64: key,
    store,
    workspaceId,
  });
  await vault.save(
    "gmail",
    {
      accessToken: "secret-access-token",
      refreshToken: "secret-refresh-token",
      scopes: ["gmail.metadata"],
      tokenType: "Bearer",
    },
    "2026-07-25T00:00:00.000Z",
  );
  const raw = await store.getRecord({
    workspaceId,
    collectionName: "integrationTokens",
    recordId: "integration-token:gmail",
  });
  assert.ok(raw);
  assert.equal(JSON.stringify(raw?.payload).includes("secret-access-token"), false);
  assert.equal(raw?.payload.algorithm, "aes-256-gcm");
  assert.equal((await vault.get("gmail"))?.accessToken, "secret-access-token");

  const secret = "oauth-state-secret";
  const state = createIntegrationOAuthState({
    provider: "gmail",
    secret,
    now: 1_000,
    nonce: "nonce-1",
  });
  assert.equal(
    verifyIntegrationOAuthState({
      state,
      provider: "gmail",
      secret,
      now: 2_000,
    }),
    true,
  );
  assert.equal(
    verifyIntegrationOAuthState({
      state: `${state}tampered`,
      provider: "gmail",
      secret,
      now: 2_000,
    }),
    false,
  );
  assert.equal(
    verifyIntegrationOAuthState({
      state,
      provider: "gmail",
      secret,
      now: 10 * 60_000 + 1_001,
    }),
    false,
  );

  const states = createIntegrationOAuthStateStore({
    store,
    workspaceId,
  });
  await states.register({
    provider: "gmail",
    state,
    now: "2026-07-25T00:00:00.000Z",
    expiresAt: "2026-07-25T00:10:00.000Z",
  });
  assert.equal(
    await states.consume({
      provider: "gmail",
      state,
      now: "2026-07-25T00:01:00.000Z",
    }),
    true,
  );
  assert.equal(
    await states.consume({
      provider: "gmail",
      state,
      now: "2026-07-25T00:02:00.000Z",
    }),
    false,
  );
});

test("integration scope policy rejects mail send/body access while accepting metadata and calendars", () => {
  assert.deepEqual(
    validateIntegrationScopes("gmail", [
      "https://www.googleapis.com/auth/gmail.metadata",
    ]),
    ["gmail.metadata"],
  );
  assert.deepEqual(
    validateIntegrationScopes("google_calendar", [
      "https://www.googleapis.com/auth/calendar.events.readonly",
    ]),
    ["calendar.events.readonly"],
  );
  assert.deepEqual(
    validateIntegrationScopes("microsoft_graph", [
      "https://graph.microsoft.com/Calendars.ReadWrite",
      "offline_access",
    ]),
    ["calendars.readwrite", "offline_access"],
  );
  assert.throws(
    () =>
      validateIntegrationScopes("gmail", [
        "https://www.googleapis.com/auth/gmail.send",
      ]),
    /metadata\/calendar-only/,
  );
  assert.throws(
    () => validateIntegrationScopes("microsoft_graph", ["mail.readwrite"]),
    /metadata\/calendar-only/,
  );
});

test("expired provider tokens refresh and email signals never expose message bodies or send capability", async () => {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const workspaceId = "integration-refresh";
  const vault = createEncryptedIntegrationTokenVault({
    encryptionKeyBase64: randomBytes(32).toString("base64"),
    store,
    workspaceId,
  });
  await vault.save(
    "gmail",
    {
      accessToken: "expired-token",
      refreshToken: "refresh-token",
      expiresAt: "2000-01-01T00:00:00.000Z",
      scopes: ["gmail.metadata"],
      tokenType: "Bearer",
    },
    "2026-07-25T00:00:00.000Z",
  );
  const oauthStates = createIntegrationOAuthStateStore({ store, workspaceId });
  const service = createOrbitIntegrationService({
    oauthStates,
    vault,
    configs: {
      gmail: {
        authorizationEndpoint: "https://provider.example/authorize",
        tokenEndpoint: "https://provider.example/token",
        apiBaseUrl: "https://provider.example/api",
        clientId: "client",
        clientSecret: "client-secret",
        redirectUri: "https://orbit.example/callback",
        scopes: ["gmail.metadata"],
      },
    },
  });
  const requests: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (request) => {
    const url = String(request);
    requests.push(url);
    if (url.endsWith("/token")) {
      return Response.json({
        access_token: "refreshed-token",
        expires_in: 3600,
        scope: "gmail.metadata",
        token_type: "Bearer",
      });
    }
    return Response.json({
      items: [
        {
          id: "message-1",
          occurredAt: "2026-07-24T23:00:00.000Z",
          counterpartDomain: "example.com",
          subjectHint: "Partnership follow-up",
          body: "This private body must never enter the Orbit signal.",
        },
      ],
    });
  };
  try {
    const signals = await service.listRelationshipSignals({
      provider: "gmail",
      since: "2026-07-01T00:00:00.000Z",
    });
    assert.equal(requests.length, 2);
    assert.equal(signals.length, 1);
    assert.equal(signals[0].messageBodyPersisted, false);
    assert.equal(JSON.stringify(signals).includes("private body"), false);
    assert.equal("sendEmail" in service, false);
    assert.equal((await vault.get("gmail"))?.accessToken, "refreshed-token");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("calendar replay uses a deterministic provider id derived from the Action idempotency key", async () => {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const workspaceId = "integration-calendar-idempotency";
  const vault = createEncryptedIntegrationTokenVault({
    encryptionKeyBase64: randomBytes(32).toString("base64"),
    store,
    workspaceId,
  });
  await vault.save(
    "google_calendar",
    {
      accessToken: "calendar-token",
      expiresAt: "2099-01-01T00:00:00.000Z",
      scopes: ["calendar.events"],
      tokenType: "Bearer",
    },
    "2026-07-25T00:00:00.000Z",
  );
  const service = createOrbitIntegrationService({
    oauthStates: createIntegrationOAuthStateStore({ store, workspaceId }),
    vault,
    configs: {
      google_calendar: {
        authorizationEndpoint: "https://provider.example/authorize",
        tokenEndpoint: "https://provider.example/token",
        apiBaseUrl: "https://provider.example/api",
        clientId: "client",
        clientSecret: "client-secret",
        redirectUri: "https://orbit.example/callback",
        scopes: ["calendar.events"],
      },
    },
  });
  const requests: { body: Record<string, unknown>; idempotencyKey: string | null }[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_request, init) => {
    requests.push({
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      idempotencyKey: new Headers(init?.headers).get("idempotency-key"),
    });
    return Response.json({ id: "provider-event" });
  };
  try {
    for (let replay = 0; replay < 2; replay += 1) {
      await service.createCalendarEvent({
        provider: "google_calendar",
        idempotencyKey: "action:event-1:v1",
        payload: {
          title: "Founder Summit",
          startsAt: "2026-07-26T01:00:00.000Z",
        },
      });
    }
    assert.equal(requests.length, 2);
    assert.equal(requests[0].body.id, requests[1].body.id);
    assert.match(String(requests[0].body.id), /^orbit[0-9a-f]{64}$/);
    assert.equal(requests[0].idempotencyKey, "action:event-1:v1");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
