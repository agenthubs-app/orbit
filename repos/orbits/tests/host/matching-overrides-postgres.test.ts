/**
 * R17 SC-R17-04 / 复核：编组 overrides 按 (generation, 活动) 存，带版本；别的活动的 generationId 写不进来、也读不到。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createHostMatchingStore } from "../../features/events/host/storage/matching";
import { hostDatabaseTest, withHostDatabase } from "../support/host-harness";
import { lockedFixtureQuery } from "../support/sync-revision-fixture";

test("overrides are versioned and bound to their event", hostDatabaseTest, async () => {
  await withHostDatabase(async ({ client, pool, workspaceId }) => {
    for (const id of ["evt_a", "evt_b"]) {
      await lockedFixtureQuery(pool, `insert into event_ops_events (workspace_id, event_id, organizer_actor_id, created_at, updated_at, lifecycle_state_v2, created_by) values ($1, $2, 'host', now(), now(), 'published', 'host')`, [workspaceId, id]);
    }
    const store = createHostMatchingStore({ client, workspaceId });
    const move = { from: { round: 1, table: "A" }, participantId: "p1", round: 1, to: { table: "B" } } as never;
    assert.equal(await store.saveOverrides("host", "evt_b", "gen_b", 0, [move]), 1);
    await assert.rejects(store.saveOverrides("host", "evt_b", "gen_b", 0, [move]), /VERSION_CONFLICT/u, "stale version");
    await assert.rejects(store.saveOverrides("host", "evt_a", "gen_b", 1, [move]), (error: { code?: string }) => error.code === "FORBIDDEN", "evt_a cannot write evt_b's draft");
    assert.deepEqual(await store.overrides("evt_a", "gen_b"), { moves: [], version: 0 }, "and cannot read it");
    assert.equal((await store.overrides("evt_b", "gen_b")).version, 1);
  });
});
