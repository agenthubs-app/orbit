import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import {
  createIntegrationOAuthState,
  verifyIntegrationOAuthState,
} from "../../features/integrations/oauth-state";
import { createIntegrationOAuthStateStore } from "../../features/integrations/oauth-state-store";
import {
  createOrbitIntegrationService,
  integrationCapabilitiesFor,
} from "../../features/integrations/service";
import { createIntegrationHealthStore } from "../../features/integrations/health-store";
import { validateIntegrationScopes } from "../../features/integrations/service-factory";
import { integrationSessionBinding } from "../../features/integrations/session-binding";
import { createEncryptedIntegrationTokenVault } from "../../features/integrations/token-vault";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import {
  createAgentDomainExecutors,
  type AgentDomainExecutorDependencies,
} from "../../features/agent/runtime/domain-executors";
import { createAgentExecutorRegistry } from "../../features/agent/runtime/executor-registry";
import { createMemoryAgentRuntimeRepository } from "../../features/agent/runtime/repository";
import { createAgentRuntimeService } from "../../features/agent/runtime/service";
import { createAgentNaturalLanguageActionProposalService } from "../../features/agent/natural-language-actions/service";

test("OAuth session binding uses only the authenticated session cookie and supports chunking", () => {
  const direct = integrationSessionBinding(
    new Request("https://orbit.example", {
      headers: {
        cookie:
          "unrelated=value; authjs.session-token=session-token; orbit-integration-state-gmail=state",
      },
    }),
  );
  const chunked = integrationSessionBinding(
    new Request("https://orbit.example", {
      headers: {
        cookie:
          "authjs.session-token.1=token; authjs.session-token.0=session-",
      },
    }),
  );
  assert.equal(direct, chunked);
  assert.equal(
    integrationSessionBinding(
      new Request("https://orbit.example", {
        headers: { cookie: "orbit-integration-state-gmail=state" },
      }),
    ),
    null,
  );
});

test("integration tokens are encrypted at rest and OAuth state is signed, expiring, and one-time", async () => {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const workspaceId = "integration-security";
  const userId = "user:integration-security";
  const sessionBinding = "session:integration-security";
  const key = randomBytes(32).toString("base64");
  const vault = createEncryptedIntegrationTokenVault({
    encryptionKeyBase64: key,
    store,
    workspaceId,
    userId,
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
  const raw = (await store.listRecords({
    workspaceId,
    collectionName: "integrationTokens",
  }))[0];
  assert.ok(raw);
  assert.equal(raw?.userId, userId);
  assert.equal(JSON.stringify(raw?.payload).includes("secret-access-token"), false);
  assert.equal(raw?.payload.algorithm, "aes-256-gcm");
  assert.equal((await vault.get("gmail"))?.accessToken, "secret-access-token");

  const secret = "oauth-state-secret";
  const state = createIntegrationOAuthState({
    provider: "gmail",
    actorId: userId,
    sessionBinding,
    secret,
    now: 1_000,
    nonce: "nonce-1",
  });
  assert.equal(
    verifyIntegrationOAuthState({
      state,
      provider: "gmail",
      actorId: userId,
      sessionBinding,
      secret,
      now: 2_000,
    }),
    true,
  );
  assert.equal(
    verifyIntegrationOAuthState({
      state: `${state}tampered`,
      provider: "gmail",
      actorId: userId,
      sessionBinding,
      secret,
      now: 2_000,
    }),
    false,
  );
  assert.equal(
    verifyIntegrationOAuthState({
      state,
      provider: "gmail",
      actorId: userId,
      sessionBinding,
      secret,
      now: 10 * 60_000 + 1_001,
    }),
    false,
  );

  const states = createIntegrationOAuthStateStore({
    store,
    workspaceId,
    userId,
  });
  await states.register({
    provider: "gmail",
    actorId: userId,
    sessionBinding,
    state,
    now: "2026-07-25T00:00:00.000Z",
    expiresAt: "2026-07-25T00:10:00.000Z",
  });
  const attackerStates = createIntegrationOAuthStateStore({
    store,
    workspaceId,
    userId: "user:attacker",
  });
  assert.equal(
    await attackerStates.consume({
      provider: "gmail",
      actorId: "user:attacker",
      sessionBinding,
      state,
      now: "2026-07-25T00:00:30.000Z",
    }),
    false,
  );
  assert.equal(
    await states.consume({
      provider: "gmail",
      actorId: userId,
      sessionBinding: "session:other",
      state,
      now: "2026-07-25T00:00:30.000Z",
    }),
    false,
  );
  const concurrentClaims = await Promise.all([
    states.consume({
      provider: "gmail",
      actorId: userId,
      sessionBinding,
      state,
      now: "2026-07-25T00:01:00.000Z",
    }),
    states.consume({
      provider: "gmail",
      actorId: userId,
      sessionBinding,
      state,
      now: "2026-07-25T00:01:00.001Z",
    }),
  ]);
  assert.deepEqual(
    concurrentClaims.slice().sort(),
    [false, true],
  );
  assert.equal(
    verifyIntegrationOAuthState({
      state,
      provider: "gmail",
      actorId: "user:attacker",
      sessionBinding,
      secret,
      now: 2_000,
    }),
    false,
  );
  assert.equal(
    verifyIntegrationOAuthState({
      state,
      provider: "gmail",
      actorId: userId,
      sessionBinding: "session:other",
      secret,
      now: 2_000,
    }),
    false,
  );
});

test("integration token records are isolated by workspace, user, and provider", async () => {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const encryptionKeyBase64 = randomBytes(32).toString("base64");
  const alice = createEncryptedIntegrationTokenVault({
    encryptionKeyBase64,
    store,
    workspaceId: "workspace:a",
    userId: "user:alice",
  });
  const bob = createEncryptedIntegrationTokenVault({
    encryptionKeyBase64,
    store,
    workspaceId: "workspace:a",
    userId: "user:bob",
  });
  const aliceOtherWorkspace = createEncryptedIntegrationTokenVault({
    encryptionKeyBase64,
    store,
    workspaceId: "workspace:b",
    userId: "user:alice",
  });

  await alice.save(
    "gmail",
    { accessToken: "alice", scopes: ["gmail.metadata"], tokenType: "Bearer" },
    "2026-07-25T00:00:00.000Z",
  );
  await bob.save(
    "gmail",
    { accessToken: "bob", scopes: ["gmail.metadata"], tokenType: "Bearer" },
    "2026-07-25T00:00:00.000Z",
  );
  await aliceOtherWorkspace.save(
    "gmail",
    {
      accessToken: "alice-other-workspace",
      scopes: ["gmail.metadata"],
      tokenType: "Bearer",
    },
    "2026-07-25T00:00:00.000Z",
  );

  assert.equal((await alice.get("gmail"))?.accessToken, "alice");
  assert.equal((await bob.get("gmail"))?.accessToken, "bob");
  assert.equal(
    (await aliceOtherWorkspace.get("gmail"))?.accessToken,
    "alice-other-workspace",
  );
  await bob.revoke("gmail", "2026-07-25T00:01:00.000Z");
  assert.equal(await bob.get("gmail"), null);
  assert.equal((await alice.get("gmail"))?.accessToken, "alice");
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
  assert.deepEqual(
    integrationCapabilitiesFor("google_calendar", [
      "calendar.events.readonly",
    ]),
    ["calendar.read"],
  );
  assert.deepEqual(
    integrationCapabilitiesFor("microsoft_graph", [
      "Calendars.ReadWrite",
      "Mail.ReadBasic",
    ]),
    ["calendar.read", "calendar.write", "mail.metadata.read"],
  );
});

test("integration health is actor-scoped, durable, and uses a read-only provider probe", async () => {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const workspaceId = "integration-health";
  const userId = "user:integration-health";
  const vault = createEncryptedIntegrationTokenVault({
    encryptionKeyBase64: randomBytes(32).toString("base64"),
    store,
    workspaceId,
    userId,
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
  const healthStore = createIntegrationHealthStore({
    store,
    workspaceId,
    userId,
  });
  const service = createOrbitIntegrationService({
    healthStore,
    oauthStates: createIntegrationOAuthStateStore({
      store,
      workspaceId,
      userId,
    }),
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
  const requests: { method: string; url: string }[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (request, init) => {
    requests.push({
      method: init?.method ?? "GET",
      url: String(request),
    });
    return Response.json({ items: [] });
  };
  try {
    const before = (await service.listAuthorizations(
      "2026-07-25T01:00:00.000Z",
    ))[0];
    assert.equal(before.healthStatus, "not_checked");
    assert.deepEqual(before.capabilities, [
      "calendar.read",
      "calendar.write",
    ]);

    const checked = await service.checkHealth(
      "google_calendar",
      "2026-07-25T01:01:00.000Z",
    );
    assert.equal(checked.healthStatus, "healthy");
    assert.equal(checked.lastCheckedAt, "2026-07-25T01:01:00.000Z");
    assert.deepEqual(requests, [
      {
        method: "GET",
        url: "https://provider.example/api/users/me/calendarList?maxResults=1",
      },
    ]);
    assert.equal(
      (await healthStore.get("google_calendar"))?.status,
      "healthy",
    );

    await service.revoke(
      "google_calendar",
      "2026-07-25T01:02:00.000Z",
    );
    assert.equal(await healthStore.get("google_calendar"), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("external calendar writes fail closed before provider access when write scope is missing", async () => {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const workspaceId = "integration-calendar-permissions";
  const userId = "user:integration-calendar-permissions";
  const vault = createEncryptedIntegrationTokenVault({
    encryptionKeyBase64: randomBytes(32).toString("base64"),
    store,
    workspaceId,
    userId,
  });
  await vault.save(
    "google_calendar",
    {
      accessToken: "readonly-token",
      expiresAt: "2099-01-01T00:00:00.000Z",
      scopes: ["calendar.events.readonly"],
      tokenType: "Bearer",
    },
    "2026-07-25T00:00:00.000Z",
  );
  const service = createOrbitIntegrationService({
    oauthStates: createIntegrationOAuthStateStore({
      store,
      workspaceId,
      userId,
    }),
    vault,
    configs: {
      google_calendar: {
        authorizationEndpoint: "https://provider.example/authorize",
        tokenEndpoint: "https://provider.example/token",
        apiBaseUrl: "https://provider.example/api",
        clientId: "client",
        clientSecret: "client-secret",
        redirectUri: "https://orbit.example/callback",
        scopes: ["calendar.events.readonly"],
      },
    },
  });
  let providerRequests = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    providerRequests += 1;
    return Response.json({ id: "must-not-exist" });
  };
  try {
    await assert.rejects(
      service.createCalendarEvent({
        provider: "google_calendar",
        idempotencyKey: "action:readonly:v1",
        payload: {
          title: "Should remain blocked",
          startsAt: "2026-07-26T01:00:00.000Z",
        },
      }),
      /does not grant calendar\.events\.write/,
    );
    assert.equal(providerRequests, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("expired provider tokens refresh and email signals never expose message bodies or send capability", async () => {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const workspaceId = "integration-refresh";
  const userId = "user:integration-refresh";
  const vault = createEncryptedIntegrationTokenVault({
    encryptionKeyBase64: randomBytes(32).toString("base64"),
    store,
    workspaceId,
    userId,
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
  const oauthStates = createIntegrationOAuthStateStore({
    store,
    workspaceId,
    userId,
  });
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
  const userId = "user:integration-calendar";
  const vault = createEncryptedIntegrationTokenVault({
    encryptionKeyBase64: randomBytes(32).toString("base64"),
    store,
    workspaceId,
    userId,
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
    oauthStates: createIntegrationOAuthStateStore({
      store,
      workspaceId,
      userId,
    }),
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

test("confirmed external calendar action executes once through outbox and records a provider receipt", async () => {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const workspaceId = "integration-calendar-runtime";
  const userId = "user:integration-calendar-runtime";
  const vault = createEncryptedIntegrationTokenVault({
    encryptionKeyBase64: randomBytes(32).toString("base64"),
    store,
    workspaceId,
    userId,
  });
  await vault.save(
    "google_calendar",
    {
      accessToken: "calendar-write-token",
      expiresAt: "2099-01-01T00:00:00.000Z",
      scopes: ["calendar.events"],
      tokenType: "Bearer",
    },
    "2026-07-25T00:00:00.000Z",
  );
  const integrations = createOrbitIntegrationService({
    oauthStates: createIntegrationOAuthStateStore({
      store,
      workspaceId,
      userId,
    }),
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
  const executors = createAgentDomainExecutors({
    calendar: {
      createEvent: (payload, idempotencyKey) =>
        integrations.createCalendarEvent({
          provider:
            payload.provider === "microsoft_graph"
              ? "microsoft_graph"
              : "google_calendar",
          payload,
          idempotencyKey,
        }),
    },
  } as AgentDomainExecutorDependencies);
  const runtime = createAgentRuntimeService({
    executors: createAgentExecutorRegistry(executors),
    now: () => "2026-07-25T01:00:00.000Z",
    repository: createMemoryAgentRuntimeRepository(),
  });
  const requests: { body: Record<string, unknown>; url: string }[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (request, init) => {
    requests.push({
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      url: String(request),
    });
    return Response.json({ id: "provider-event-1" });
  };
  try {
    const proposal =
      await createAgentNaturalLanguageActionProposalService({
        permissionGuard: integrations,
        runtime,
      }).propose({
        conversationId: "conversation:external-calendar-runtime",
        message: "在 Google Calendar 创建项目复盘会议。",
        requests: [
          {
            arguments: {
              provider: "google_calendar",
              title: "项目复盘会议",
              startsAt: "2026-07-28T01:00:00.000Z",
              endsAt: "2026-07-28T02:00:00.000Z",
              location: "Tokyo",
            },
            capabilityId: "calendar.syncEvent",
            requiresUserConfirmation: true,
          },
        ],
      });
    const action = proposal.actions[0];
    assert.ok(action);
    assert.equal(action.status, "awaiting_confirmation");
    assert.equal(requests.length, 0);

    await runtime.approveAction({
      actionId: action.actionId,
      actorLabel: "Orbit user",
    });
    assert.equal(requests.length, 0);
    const processed = await runtime.processOutbox({
      actionId: action.actionId,
      workerId: "external-calendar-worker",
    });

    assert.equal(processed.completed, 1);
    assert.equal(requests.length, 1);
    assert.equal(
      requests[0]?.url,
      "https://provider.example/api/calendars/primary/events",
    );
    assert.equal(requests[0]?.body.summary, "项目复盘会议");
    assert.deepEqual(requests[0]?.body.start, {
      dateTime: "2026-07-28T01:00:00.000Z",
    });
    const detail = await runtime.getRun(proposal.runId!);
    assert.equal(detail?.actions[0]?.status, "completed");
    assert.equal(detail?.receipts[0]?.status, "completed");
    assert.equal(
      detail?.receipts[0]?.resultRef,
      "calendar:provider-event-1",
    );
    await runtime.processOutbox({
      actionId: action.actionId,
      workerId: "external-calendar-replay-worker",
    });
    assert.equal(requests.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
