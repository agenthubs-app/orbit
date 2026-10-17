/**
 * R17-18：编组发布成功、通知那一步失败后，同一 generation 重试 → 不再发布，只补写「テーブル編成を公開しました」（幂等，不重复）。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createPostgresEventAdmissionRepository } from "../../features/events/admission/storage/postgres-repository";
import { createHostLiveService } from "../../features/events/host/live";
import { hostDatabaseTest, withHostDatabase } from "../support/host-harness";
import { lockedFixtureQuery } from "../support/sync-revision-fixture";

const HOST = "actor:host";

test("retrying a published generation only backfills the participant notices", hostDatabaseTest, async () => {
  await withHostDatabase(async ({ client, pool, workspaceId }) => {
    await lockedFixtureQuery(pool, `insert into orbit_records (workspace_id, collection_name, record_id, source_type, source_id, payload, created_at, updated_at) values ($1, 'auth_users', $2, 'auth', $3, $4::jsonb, now(), now())`, [workspaceId, "auth_user:host@example.com", HOST, JSON.stringify({ displayName: "佐藤 健一", email: "host@example.com", id: HOST })]);
    let publishCalls = 0;
    const operations = {
      checkInParticipant: async () => { throw new Error("unused"); },
      latestGeneration: async () => ({ generationId: "gen_1", grouping: { roundOne: [], roundTwo: [] }, participants: [], status: "published", tableSize: 5 }),
      publishGeneration: async () => { publishCalls += 1; return {}; },
      startGeneration: async () => { throw new Error("unused"); },
    };
    const service = createHostLiveService({ client, operations: operations as never, workspaceId });
    const profile = await service.createProfile(HOST, { displayName: "CFO Night 実行委員会", emoji: "🥂" });
    const start = new Date(Date.now() + 3 * 86_400_000);
    const created = await service.createEvent(HOST, { capacity: 30, endsAt: new Date(start.getTime() + 2 * 3600_000).toISOString(), feeKind: "free", organizerProfileId: profile.profileId, startsAt: start.toISOString(), title: "CFO Night Tokyo vol.19" });
    const eventId = created.event.eventId;
    const setup = await service.setup(HOST, eventId);
    await service.saveSetup(HOST, eventId, { admissionMode: "review", capacity: 30, description: "説明", expectedRevision: setup!.revision, questions: [], registrationClosesAt: new Date(start.getTime() - 3600_000).toISOString() });
    await service.publishEvent(HOST, eventId, { expectedVersion: created.event.version });
    const admission = createPostgresEventAdmissionRepository({ client, workspaceId });
    await admission.submitApplication({ actorId: "actor:p1", eventId, profilePayload: { answers: { desiredOutcome: "x", energyStyle: "x", experienceHighlight: "x", followUpPreference: "x", industry: "x", positioning: "CFO @ ノードワークス", targetAttendees: "x", valueOffered: "x" }, displayName: "井上 早紀" } });
    await service.decide(HOST, eventId, "actor:p1", { decision: "approve", expectedVersion: 1 });

    const notices = async () => (await pool.query<{ actor_id: string }>(`select actor_id from event_host_notice_outbox where workspace_id = $1 and event_id = $2 and kind = 'matching_published'`, [workspaceId, eventId])).rows.map((row) => row.actor_id);
    assert.deepEqual(await notices(), []);
    await service.publishMatching(HOST, eventId, { generationId: "gen_1", overridesVersion: 0 });
    assert.deepEqual(await notices(), ["actor:p1"], "the retry writes the missing notice");
    await service.publishMatching(HOST, eventId, { generationId: "gen_1", overridesVersion: 0 });
    assert.deepEqual(await notices(), ["actor:p1"], "and a second retry does not duplicate it");
    assert.equal(publishCalls, 0, "an already-published generation is not published again");
  });
});
