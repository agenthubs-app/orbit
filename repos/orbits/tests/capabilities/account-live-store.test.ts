import assert from "node:assert/strict";
import test from "node:test";

import {
  ACCOUNT_SESSION_ERROR_DEFINITIONS,
} from "../../features/account/contract";
import { createLiveAccountSessionService } from "../../features/account/live-service";
import {
  createAccountSessionService,
  resolveAccountSessionService,
} from "../../features/account/service-factory";
import {
  createStorageAccountSessionProvider,
} from "../../features/account/storage/account-live-record-provider";
import {
  createMemoryLiveRecordStore,
  type LiveRecord,
} from "../../shared/storage/live-record-store";
import * as meRoute from "../../app/api/account/me/route";

const workspaceId = "workspace:account-live-test";

function liveRecord(
  collectionName: string,
  recordId: string,
  payload: Record<string, unknown>,
): LiveRecord<Record<string, unknown>> {
  return {
    workspaceId,
    collectionName,
    recordId,
    sourceType: "system",
    sourceId: `source:${recordId}`,
    sourceLabel: "Account live store test fixture",
    provider: "account-live-store-test",
    providerRecordId: recordId,
    evidenceIds: [`evidence:${recordId}`],
    targetType: collectionName.slice(0, -1),
    targetId: recordId,
    occurredAt: "2026-06-30T14:14:38.537Z",
    createdAt: "2026-06-30T14:14:38.537Z",
    updatedAt: "2026-07-02T08:00:00.000Z",
    lifecycleState: "active",
    searchText: JSON.stringify(payload),
    payload,
  };
}

function restoreEnv(previous: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

test("account live store maps remote account and profile records into a current session", async () => {
  const store = createMemoryLiveRecordStore([
    liveRecord("accounts", "account_orbit_generated", {
      id: "account_orbit_generated",
      name: "Orbit Generated Relationship Workspace",
      createdAt: "2026-06-30T14:14:38.537Z",
      updatedAt: "2026-07-02T08:00:00.000Z",
    }),
    liveRecord("profiles", "profile_orbit_generated_operator", {
      id: "profile_orbit_generated_operator",
      accountId: "account_orbit_generated",
      displayName: "結城 航太郎",
      role: "Relationship Operations Lead",
      timezone: "Asia/Tokyo",
      createdAt: "2026-06-30T14:14:38.537Z",
      updatedAt: "2026-07-02T08:00:00.000Z",
    }),
  ]);
  const provider = createStorageAccountSessionProvider({
    sourceLabel: "Account live store test",
    store,
    workspaceId,
  });
  const service = createLiveAccountSessionService({ provider });
  const session = await service.getCurrentSession();

  assert.equal(session.success, true);
  assert.equal(session.data.state, "success");
  assert.equal(session.data.session.status, "signed-in");
  assert.equal(session.data.account?.id, "account_orbit_generated");
  assert.equal(
    session.data.account?.displayName,
    "Orbit Generated Relationship Workspace",
  );
  assert.equal(session.data.user?.id, "profile_orbit_generated_operator");
  assert.equal(session.data.user?.displayName, "結城 航太郎");
  assert.equal(session.data.user?.timezone, "Asia/Tokyo");
  assert.equal(session.data.profile?.headline, "Relationship Operations Lead");
  assert.equal(session.data.provenance.privacy, "live-account-session");
  assert.deepEqual(session.data.provenance.evidenceIds, [
    "evidence:account_orbit_generated",
    "evidence:profile_orbit_generated_operator",
  ]);
});

test("account live service fails closed when live storage is unconfigured", async () => {
  const service = createLiveAccountSessionService();
  const session = await service.getCurrentSession();
  const requireAccount = await service.requireAccount();

  assert.equal(
    ACCOUNT_SESSION_ERROR_DEFINITIONS.ACCOUNT_LIVE_STORE_UNCONFIGURED.appCode,
    "SERVICE_UNAVAILABLE",
  );
  assert.equal(session.success, false);
  assert.equal(session.error.code, "ACCOUNT_LIVE_STORE_UNCONFIGURED");
  assert.equal(session.error.provenance.privacy, "live-account-session");
  assert.equal(requireAccount.success, false);
  assert.equal(requireAccount.error.code, "ACCOUNT_LIVE_STORE_UNCONFIGURED");
});

test("account live factory resolves live mode and preserves mock behavior", async () => {
  const liveResolution = resolveAccountSessionService("live");
  const liveService = createAccountSessionService("live");
  const mockService = createAccountSessionService("mock");

  assert.equal(
    liveResolution.success,
    true,
    liveResolution.success === false ? liveResolution.error.message : "",
  );
  assert.equal((await liveService.getCurrentSession()).success, false);
  assert.equal(mockService.getCurrentSession().success, true);
});

test("account API route reports live mode and controlled unconfigured storage failure", async () => {
  const previous = {
    ORBIT_DATABASE_URL: process.env.ORBIT_DATABASE_URL,
    ORBIT_EVENT_DATABASE_URL: process.env.ORBIT_EVENT_DATABASE_URL,
    ORBIT_FEATURE_MODE: process.env.ORBIT_FEATURE_MODE,
    ORBIT_LIVE_DATABASE_URL: process.env.ORBIT_LIVE_DATABASE_URL,
    ORBIT_MODULE_MODE: process.env.ORBIT_MODULE_MODE,
  };

  try {
    delete process.env.ORBIT_DATABASE_URL;
    delete process.env.ORBIT_EVENT_DATABASE_URL;
    delete process.env.ORBIT_FEATURE_MODE;
    delete process.env.ORBIT_LIVE_DATABASE_URL;
    process.env.ORBIT_MODULE_MODE = "live";

    const response = await meRoute.GET(
      new Request("https://orbit.local/api/account/me"),
    );
    const body = await response.json();

    assert.equal(response.status, 503);
    assert.equal(response.headers.get("x-orbit-feature-mode"), "live");
    assert.deepEqual(body, {
      success: false,
      error: {
        code: "SERVICE_UNAVAILABLE",
        message:
          "The account session live store is not configured for this runtime.",
        context: {
          accountErrorCode: "ACCOUNT_LIVE_STORE_UNCONFIGURED",
          boundary: "developer-admin",
          mode: "live",
          privacy: "no-relationship-data",
          provenance:
            "Live account session failure came from configured storage setup.",
          service: "account-session-live",
        },
      },
    });
  } finally {
    restoreEnv(previous);
  }
});
