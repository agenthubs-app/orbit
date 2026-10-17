/**
 * R17-08（用户 2026-10-17「按主办方资料页」）：关注按资料页；旧的 actor 级关注迁移成该主办方每份资料页的关注（保留关注时间、删旧记录、幂等），
 * 没有资料页的主办方保持 actor 级。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createPostgresActorRecordStore } from "../../features/events/actor-records/store";
import { createHostLiveService } from "../../features/events/host/live";
import { migrateActorFollowsToProfiles } from "../../features/events/host/storage/follow-migration";
import { createOrganizerFollowService } from "../../features/events/journey/attendee-records";
import { eventOrganizerKey, organizerKeyFor, organizerKeyForProfile } from "../../features/events/journey/live-mapping";
import { hostDatabaseTest, withHostDatabase } from "../support/host-harness";

test("keys: an event with a profile is keyed by the profile, a legacy event by its actor", () => {
  assert.match(organizerKeyForProfile("prof_a")!, /^orgp_[0-9a-f]{16}$/u);
  assert.equal(eventOrganizerKey("actor:x", "prof_a"), organizerKeyForProfile("prof_a"));
  assert.equal(eventOrganizerKey("actor:x", null), organizerKeyFor("actor:x"));
  assert.notEqual(organizerKeyForProfile("prof_a"), organizerKeyForProfile("prof_b"));
});

test("legacy actor follows become per-profile follows", hostDatabaseTest, async () => {
  await withHostDatabase(async ({ client, workspaceId }) => {
    const service = createHostLiveService({ client, operations: null, workspaceId });
    const one = await service.createProfile("actor:host", { displayName: "CFO Night 実行委員会", emoji: "🥂" });
    const two = await service.createProfile("actor:host", { displayName: "SaaS 勉強会", emoji: "📚" });
    const query = async (sql: string, values?: readonly unknown[]) => ({ rows: [...(await client.query<Record<string, unknown>>(sql, values as unknown[])).rows] });
    const follows = createOrganizerFollowService({ now: () => new Date("2026-09-01T00:00:00.000Z"), store: createPostgresActorRecordStore({ query, workspaceId }) });
    await follows.follow("actor:fan", organizerKeyFor("actor:host")!);
    await follows.follow("actor:fan", organizerKeyFor("actor:no-profile")!);

    const first = await migrateActorFollowsToProfiles({ client, workspaceId });
    assert.deepEqual(first, { created: 2, kept: 1, legacy: 2, migrated: 1 });
    const keys = await follows.followed("actor:fan");
    assert.deepEqual([...keys].sort(), [organizerKeyFor("actor:no-profile")!, organizerKeyForProfile(one.profileId)!, organizerKeyForProfile(two.profileId)!].sort());
    const rows = await query(`select payload ->> 'followedAt' as at from orbit_records where workspace_id = $1 and collection_name = 'organizerFollows' and lifecycle_state <> 'deleted' and payload ->> 'organizerId' like 'orgp\\_%'`, [workspaceId]);
    assert.deepEqual(rows.rows.map((row) => row.at), ["2026-09-01T00:00:00.000Z", "2026-09-01T00:00:00.000Z"], "the original follow time is kept");
    assert.deepEqual(await migrateActorFollowsToProfiles({ client, workspaceId }), { created: 0, kept: 1, legacy: 1, migrated: 0 }, "idempotent");

    const page = await service.organizerPublic("actor:fan", one.slug);
    assert.deepEqual([page!.organizerKey, page!.following, page!.stats.followers], [organizerKeyForProfile(one.profileId), true, 1]);
    await follows.unfollow("actor:fan", organizerKeyForProfile(one.profileId)!);
    assert.equal((await service.organizerPublic("actor:fan", one.slug))!.following, false, "profiles are followed separately");
    assert.equal((await service.organizerPublic("actor:fan", two.slug))!.following, true);
  });
});
