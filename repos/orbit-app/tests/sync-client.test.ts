import assert from "node:assert/strict";
import test from "node:test";

import type { OrbitApiClient } from "../src/api/client";
import type { ApiResult } from "../src/api/types";
import {
  createSyncClient,
  SyncRequestError,
  SyncResetRequiredError
} from "../src/data/sync/sync-client";

function apiWithFailure(result: {
  status: number;
  error: { code: string; message: string; context?: Readonly<Record<string, string>> };
}): Pick<OrbitApiClient, "get"> {
  return {
    get: async <TData>() => ({
      success: false as const,
      ...result,
      meta: { featureMode: null, privacy: null, runtimeBoundary: null }
    }) as ApiResult<TData>
  };
}

test("getPage maps reset-required responses through the shared sync error path", async () => {
  const client = createSyncClient(apiWithFailure({
    status: 409,
    error: {
      code: "CONFLICT",
      message: "cursor expired",
      context: { syncErrorCode: "SYNC_RESET_REQUIRED" }
    }
  }));

  await assert.rejects(
    client.getPage({ actorId: "actor:one" }),
    (error: unknown) => error instanceof SyncResetRequiredError
  );
});

test("getPage maps ordinary failures through the shared sync error path", async () => {
  const client = createSyncClient(apiWithFailure({
    status: 503,
    error: { code: "UNAVAILABLE", message: "try again" }
  }));

  await assert.rejects(
    client.getPage({ actorId: "actor:one" }),
    (error: unknown) => error instanceof SyncRequestError && !(error instanceof SyncResetRequiredError)
  );
});
