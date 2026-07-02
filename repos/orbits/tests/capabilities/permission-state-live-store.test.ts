import assert from "node:assert/strict";
import test from "node:test";

import {
  PERMISSION_STATE_ERROR_DEFINITIONS,
} from "../../features/permissions/contract";
import { createLivePermissionStateService } from "../../features/permissions/live-service";
import {
  createPermissionStateService,
  resolvePermissionStateService,
} from "../../features/permissions/service-factory";
import {
  createStoragePermissionStateProvider,
} from "../../features/permissions/storage/permission-live-record-provider";
import {
  createMemoryLiveRecordStore,
  type LiveRecord,
} from "../../shared/storage/live-record-store";
import * as permissionsRoute from "../../app/api/permissions/route";

const workspaceId = "workspace:permission-live-test";

function permissionRecord(
  payload: Record<string, unknown>,
): LiveRecord<Record<string, unknown>> {
  const recordId = String(payload.id);

  return {
    workspaceId,
    collectionName: "permissions",
    recordId,
    sourceType: "system",
    sourceId: "source:generated-relationship-fixtures",
    sourceLabel: "Generated relationship mockdata fixture",
    provider: "permission-live-store-test",
    providerRecordId: recordId,
    evidenceIds: ["evidence:permission:relationship-local-remote"],
    targetType: "permission",
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

test("permission live store maps remote permission records into staged authorization state", async () => {
  const store = createMemoryLiveRecordStore([
    permissionRecord({
      id: "permission_relationship_local_remote",
      capability: "relationship_local_remote_database",
      state: "requested",
      updatedAt: "2026-07-02T08:00:00.000Z",
      source: {
        type: "system",
        id: "source:generated-relationship-fixtures",
        label: "Generated relationship mockdata fixture",
      },
      evidenceIds: ["evidence:permission:relationship-local-remote"],
    }),
  ]);
  const provider = createStoragePermissionStateProvider({
    sourceLabel: "Permission live store test",
    store,
    workspaceId,
  });
  const service = createLivePermissionStateService({ provider });
  const result = await service.listPermissionStates();

  assert.equal(result.success, true);
  assert.equal(result.data.state, "pending");
  assert.equal(result.data.permissions.length, 1);
  assert.equal(result.data.permissions[0].capability, "event-data");
  assert.equal(result.data.permissions[0].status, "pending");
  assert.equal(
    result.data.permissions[0].authorizationStage,
    "staged-review",
  );
  assert.equal(
    result.data.permissions[0].provenance.privacy,
    "live-permission-state",
  );
  assert.equal(
    result.data.permissions[0].provenance.generationMethod,
    "live-store-query",
  );
  assert.deepEqual(result.data.provenance.evidenceIds, [
    "evidence:permission:relationship-local-remote",
  ]);
});

test("permission live service fails closed when live storage is unconfigured", async () => {
  const service = createLivePermissionStateService();
  const list = await service.listPermissionStates();
  const request = await service.requestPermission({
    capability: "calendar",
    intent: "connect-event-calendar",
  });

  assert.equal(
    PERMISSION_STATE_ERROR_DEFINITIONS
      .PERMISSION_STATE_LIVE_STORE_UNCONFIGURED.appCode,
    "SERVICE_UNAVAILABLE",
  );
  assert.equal(list.success, false);
  assert.equal(list.error.code, "PERMISSION_STATE_LIVE_STORE_UNCONFIGURED");
  assert.equal(list.error.provenance.privacy, "live-permission-state");
  assert.equal(request.success, false);
  assert.equal(request.error.code, "PERMISSION_STATE_LIVE_STORE_UNCONFIGURED");
});

test("permission live factory resolves live mode and preserves mock behavior", async () => {
  const liveResolution = resolvePermissionStateService("live");
  const liveService = createPermissionStateService("live");
  const mockService = createPermissionStateService("mock");

  assert.equal(
    liveResolution.success,
    true,
    liveResolution.success === false ? liveResolution.error.message : "",
  );
  assert.equal((await liveService.listPermissionStates()).success, false);
  assert.equal(mockService.listPermissionStates().success, true);
});

test("permission API route reports live mode and controlled unconfigured storage failure", async () => {
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

    const response = await permissionsRoute.GET(
      new Request("https://orbit.local/api/permissions"),
    );
    const body = await response.json();

    assert.equal(response.status, 503);
    assert.equal(response.headers.get("x-orbit-feature-mode"), "live");
    assert.deepEqual(body, {
      success: false,
      error: {
        code: "SERVICE_UNAVAILABLE",
        message:
          "The permission state live store is not configured for this runtime.",
        context: {
          boundary: "developer-admin",
          mode: "live",
          permissionStateErrorCode:
            "PERMISSION_STATE_LIVE_STORE_UNCONFIGURED",
          privacy: "no-relationship-data",
          provenance:
            "Live permission state failure came from configured storage setup.",
          service: "permission-state-live",
        },
      },
    });
  } finally {
    restoreEnv(previous);
  }
});
