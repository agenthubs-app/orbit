import assert from "node:assert/strict";
import test from "node:test";

import type { OrbitApiClient } from "../src/api/client";
import { DEFAULT_HOME_LAYOUT } from "../src/api/schema/home-layout";
import { reconcileHomeLayoutDraft } from "../src/screens/home/home-layout-sync";

const meta = { featureMode: "live", privacy: null, runtimeBoundary: null };
const draft = { baseRevision: 4, app: [{ key: "memo" as const, size: "m" as const }], mutationId: "offline-1", savedAt: "2026-10-20T00:00:00Z" };
const server = { ...DEFAULT_HOME_LAYOUT, revision: 4, web: [{ key: "network" as const, size: "m" as const }] };

test("offline App draft replays with its original id and the server's Web array", async () => {
  let sent: unknown;
  const put = (async (_path: string, options?: { body?: unknown }) => {
    sent = options?.body;
    return { success: true, data: { ...server, revision: 5, app: draft.app }, status: 200, meta };
  }) as OrbitApiClient["put"];
  const result = await reconcileHomeLayoutDraft(server, draft, { put });
  assert.deepEqual(sent, { expectedRevision: 4, mutationId: "offline-1", app: draft.app, web: server.web });
  assert.equal(result.kind, "saved");
  assert.deepEqual(result.layout.web, server.web);
});

test("newer revision discards the local draft before a write", async () => {
  let calls = 0;
  const put = (async () => { calls++; throw new Error("must not write"); }) as OrbitApiClient["put"];
  const newer = { ...server, revision: 5 };
  assert.deepEqual(await reconcileHomeLayoutDraft(newer, draft, { put }), { kind: "conflict", layout: newer });
  assert.equal(calls, 0);
});

test("a raced 409 adopts the whole current server layout; an outage retains the draft", async () => {
  const newer = { ...server, revision: 5, app: [{ key: "today" as const, size: "s" as const }] };
  const conflict = (async () => ({ success: false, status: 409, meta, error: { code: "CONFLICT", message: "changed", context: { currentLayout: JSON.stringify(newer) } } })) as OrbitApiClient["put"];
  assert.deepEqual(await reconcileHomeLayoutDraft(server, draft, { put: conflict }), { kind: "conflict", layout: newer });
  const unavailable = (async () => ({ success: false, status: 0, meta, error: { code: "ORBIT_APP_NETWORK_ERROR", message: "offline" } })) as OrbitApiClient["put"];
  assert.deepEqual(await reconcileHomeLayoutDraft(server, draft, { put: unavailable }), { kind: "pending", layout: server });
});
