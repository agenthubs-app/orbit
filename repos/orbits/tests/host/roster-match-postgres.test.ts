/**
 * R17-11（用户 2026-10-17「做，知道也没关系」）：名簿照合——只收邮箱哈希，回 申込済み / Orbit 登録済み / 未登録；
 * 需要主办权限；每人每场每小时 10 次。
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { createPostgresEventAdmissionRepository } from "../../features/events/admission/storage/postgres-repository";
import { createHostLiveService } from "../../features/events/host/live";
import { HostError } from "../../features/events/host/service";
import { hostDatabaseTest, withHostDatabase } from "../support/host-harness";
import { lockedFixtureQuery } from "../support/sync-revision-fixture";

const HOST = "actor:host";
const hash = (email: string) => createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
const answers = { desiredOutcome: "x", energyStyle: "x", experienceHighlight: "x", followUpPreference: "x", industry: "x", positioning: "CFO @ ノードワークス", targetAttendees: "x", valueOffered: "x" };

test("roster match: applied / registered / unregistered, owner only, rate limited", hostDatabaseTest, async () => {
  await withHostDatabase(async ({ client, pool, workspaceId }) => {
    for (const [id, email] of [[HOST, "host@example.com"], ["actor:p1", "Inoue@Example.com"], ["actor:p2", "mori@example.com"]]) {
      await lockedFixtureQuery(pool, `insert into orbit_records (workspace_id, collection_name, record_id, source_type, source_id, payload, created_at, updated_at) values ($1, 'auth_users', $2, 'auth', $3, $4::jsonb, now(), now())`, [workspaceId, `auth_user:${email.toLowerCase()}`, id, JSON.stringify({ displayName: id, email, id })]);
    }
    let t = Date.parse("2026-10-17T03:00:00.000Z");
    const service = createHostLiveService({ client, now: () => new Date(t), operations: null, workspaceId } as never);
    const profile = await service.createProfile(HOST, { displayName: "CFO Night 実行委員会", emoji: "🥂" });
    const start = new Date(Date.now() + 3 * 86_400_000);
    const created = await service.createEvent(HOST, { capacity: 30, endsAt: new Date(start.getTime() + 7_200_000).toISOString(), feeKind: "free", organizerProfileId: profile.profileId, startsAt: start.toISOString(), title: "CFO Night Tokyo vol.19" });
    const eventId = created.event.eventId;
    const setup = await service.setup(HOST, eventId);
    await service.saveSetup(HOST, eventId, { admissionMode: "review", capacity: 30, description: "説明", expectedRevision: setup!.revision, questions: [], registrationClosesAt: new Date(start.getTime() - 3_600_000).toISOString() });
    await service.publishEvent(HOST, eventId, { expectedVersion: created.event.version });
    await createPostgresEventAdmissionRepository({ client, workspaceId }).submitApplication({ actorId: "actor:p1", eventId, profilePayload: { answers, displayName: "井上 早紀" } });

    const csv = [hash(" inoue@example.com "), hash("MORI@example.com"), hash("nobody@example.com")];
    const result = await service.rosterMatch(HOST, eventId, { emailHashes: csv });
    assert.deepEqual(result.results.map((row) => row.status), ["applied", "registered", "unregistered"]);
    assert.deepEqual(result.counts, { applied: 1, registered: 1, unregistered: 1 });
    assert.deepEqual(Object.keys(result.results[0]!).sort(), ["emailHash", "status"], "nothing but the status comes back");

    await assert.rejects(service.rosterMatch("actor:stranger", eventId, { emailHashes: csv }), (error: unknown) => error instanceof HostError && error.code === "NOT_FOUND");
    for (let n = 1; n < 10; n += 1) await service.rosterMatch(HOST, eventId, { emailHashes: csv });
    await assert.rejects(service.rosterMatch(HOST, eventId, { emailHashes: csv }), (error: unknown) => error instanceof HostError && error.code === "RATE_LIMITED", "10 per hour");
    t += 3_601_000;
    assert.equal((await service.rosterMatch(HOST, eventId, { emailHashes: csv })).counts.applied, 1, "the window slides");
  });
});
