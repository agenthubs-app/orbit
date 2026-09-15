import assert from "node:assert/strict";
import test from "node:test";

import {
  SYNC_FOREGROUND_THRESHOLD_MS,
  SYNC_FRESHNESS_TTL_MS,
  shouldSynchronize,
} from "../src/data/sync/sync-freshness";

const NOW = Date.parse("2026-09-16T12:00:00.000Z");

test("cold or incomplete bootstrap always synchronizes", () => {
  assert.equal(shouldSynchronize({ cursor: null, now: NOW }), true);
  assert.equal(
    shouldSynchronize({
      cursor: {
        workspaceId: "workspace-a",
        cursor: "cursor-a",
        lastSyncedAt: new Date(NOW - 1_000).toISOString(),
        bootstrapState: "pending",
      },
      now: NOW,
    }),
    true,
  );
});

test("ordinary reads reuse a complete mirror for exactly five minutes", () => {
  const cursor = {
    workspaceId: "workspace-a",
    cursor: "cursor-a",
    lastSyncedAt: new Date(NOW - SYNC_FRESHNESS_TTL_MS + 1).toISOString(),
    bootstrapState: "complete" as const,
  };
  assert.equal(shouldSynchronize({ cursor, now: NOW }), false);
  assert.equal(
    shouldSynchronize({
      cursor: {
        ...cursor,
        lastSyncedAt: new Date(NOW - SYNC_FRESHNESS_TTL_MS).toISOString(),
      },
      now: NOW,
    }),
    true,
  );
  assert.equal(SYNC_FRESHNESS_TTL_MS, 300_000);
});

test("explicit refresh and invalidation bypass the TTL", () => {
  const cursor = {
    workspaceId: "workspace-a",
    cursor: "cursor-a",
    lastSyncedAt: new Date(NOW).toISOString(),
    bootstrapState: "complete" as const,
  };
  assert.equal(
    shouldSynchronize({ cursor, now: NOW, reason: "explicit" }),
    true,
  );
  assert.equal(
    shouldSynchronize({ cursor, now: NOW, reason: "invalidated" }),
    true,
  );
});

test("foreground refresh starts at sixty seconds in background", () => {
  const cursor = {
    workspaceId: "workspace-a",
    cursor: "cursor-a",
    lastSyncedAt: new Date(NOW).toISOString(),
    bootstrapState: "complete" as const,
  };
  assert.equal(
    shouldSynchronize({
      backgroundDurationMs: SYNC_FOREGROUND_THRESHOLD_MS - 1,
      cursor,
      now: NOW,
      reason: "foreground",
    }),
    false,
  );
  assert.equal(
    shouldSynchronize({
      backgroundDurationMs: SYNC_FOREGROUND_THRESHOLD_MS,
      cursor,
      now: NOW,
      reason: "foreground",
    }),
    true,
  );
  assert.equal(SYNC_FOREGROUND_THRESHOLD_MS, 60_000);
});

test("invalid and future sync timestamps cannot suppress recovery", () => {
  const cursor = {
    workspaceId: "workspace-a",
    cursor: "cursor-a",
    lastSyncedAt: "not-a-date",
    bootstrapState: "complete" as const,
  };
  assert.equal(shouldSynchronize({ cursor, now: NOW }), true);
  assert.equal(
    shouldSynchronize({
      cursor: {
        ...cursor,
        lastSyncedAt: new Date(NOW + 1).toISOString(),
      },
      now: NOW,
    }),
    true,
  );
});
