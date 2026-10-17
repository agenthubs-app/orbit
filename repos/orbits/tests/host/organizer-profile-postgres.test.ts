/**
 * R17 SC-R17-10：主办方资料一人多份、slug 唯一、公开页只列本资料下 published 的活动（草稿 / 中止不列）、
 * 数字口径（開催回数 = 已结束场次、累計参加者 = 受付人数合计、フォロワー = 关注数）、旧链接按活动 alias 找资料、短链只认已公开。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createPostgresEventAdmissionRepository } from "../../features/events/admission/storage/postgres-repository";
import { createPostgresEventOperationsRepository } from "../../features/events/event-operations/storage/postgres-repository";
import { organizerKeyFor } from "../../features/events/journey/live-mapping";
import { createHostLifecycle } from "../../features/events/host/storage/lifecycle";
import { createHostProfiles, profileSlugBase } from "../../features/events/host/storage/profiles";
import { hostDatabaseTest, withHostDatabase } from "../support/host-harness";
import { lockedFixtureQuery } from "../support/sync-revision-fixture";

const HOST = "actor:host";

test("profile slug base", () => {
  assert.equal(profileSlugBase("CFO Night 実行委員会"), "cfo-night");
  assert.match(profileSlugBase("製造業 朝会"), /^o-[0-9a-f]{8}$/u);
});

test("profiles and the public organizer page", hostDatabaseTest, async () => {
  await withHostDatabase(async ({ client, pool, workspaceId }) => {
    const profiles = createHostProfiles({ client, workspaceId });
    const cfo = await profiles.create(HOST, { displayName: "CFO Night 実行委員会", emoji: "🥂" });
    const twin = await profiles.create(HOST, { displayName: "CFO Night", emoji: "🌙" });
    const mfg = await profiles.create(HOST, { displayName: "製造業 DX 朝会", slug: "mfg-dx-asakai" });
    assert.deepEqual([cfo.slug, twin.slug, mfg.slug], ["cfo-night", "cfo-night-2", "mfg-dx-asakai"]);
    assert.equal((await profiles.list(HOST)).length, 3, "one person, several organizer pages");

    let n = 0;
    const lifecycle = createHostLifecycle({ client, newEventId: () => `evt_${++n}`, randomBytes: () => Uint8Array.from([n, 9, 8, 7, 6, 5, 4, 3]), workspaceId });
    const soon = { endsAt: new Date(Date.now() + 3 * 3600_000).toISOString(), startsAt: new Date(Date.now() + 30 * 60_000).toISOString() };
    const make = async (title: string, profileId: string, publish = true) => {
      const draft = await lifecycle.create(HOST, { ...soon, capacity: 30, feeAmountYen: 5000, feeKind: "amount", organizerProfileId: profileId, title });
      return publish ? (await lifecycle.publish(HOST, draft.eventId, draft.version, { registrationClosesAt: soon.startsAt })).event : draft;
    };
    const ended = await make("CFO Night Tokyo vol.18", cfo.profileId);
    const upcoming = await make("CFO Night Tokyo vol.19", cfo.profileId);
    await make("下書きのまま", cfo.profileId, false);
    const cancelled = await make("中止した回", cfo.profileId);
    const cancelledRow = (await lifecycle.cancel(HOST, cancelled.eventId, cancelled.version, null)).event;
    // R17 复核：中止后再归档（cancelled_at 清空、中止时刻存 payload）也不能出现在公开页。
    await lifecycle.archive(cancelled.eventId, cancelledRow.version, true);
    await make("別のページの回", mfg.profileId);

    const admission = createPostgresEventAdmissionRepository({ client, workspaceId });
    await admission.configurePolicy({ admissionMode: "instant", capacity: 30, eventId: ended.eventId, profileEditDeadlineAt: soon.startsAt, registrationClosesAt: soon.startsAt, registrationOpensAt: new Date(Date.now() - 86_400_000).toISOString(), updatedByActorId: HOST, waitlistEnabled: false });
    const operations = createPostgresEventOperationsRepository({ client, workspaceId });
    for (const id of ["a", "b", "c"]) {
      await admission.submitApplication({ actorId: `actor:${id}`, eventId: ended.eventId, profilePayload: { answers: { desiredOutcome: "x", energyStyle: "x", experienceHighlight: "x", followUpPreference: "x", industry: "x", positioning: "x", targetAttendees: "x", valueOffered: "x" }, displayName: id } });
    }
    const people = await pool.query<{ participant_id: string }>(`select participant_id from event_ops_membership_heads where workspace_id = $1 and event_id = $2 order by actor_id`, [workspaceId, ended.eventId]);
    for (const row of people.rows.slice(0, 2)) await operations.checkInAtomically({ actorId: HOST, capability: "check_in.roster.write", eventId: ended.eventId, kind: "staff", participantId: row.participant_id });
    // 把 vol.18 挪到过去（受付 2 人、申込 3 人）。
    await lockedFixtureQuery(pool, `update event_ops_events set starts_at = now() - interval '2 days', ends_at = now() - interval '2 days' + interval '2 hours' where workspace_id = $1 and event_id = $2`, [workspaceId, ended.eventId]);
    await lockedFixtureQuery(pool, `insert into orbit_records (workspace_id, collection_name, record_id, user_id, source_type, source_id, payload, created_at, updated_at) values ($1, 'organizerFollows', 'ofl:1', 'actor:fan', 'events', 'x', $2::jsonb, now(), now())`, [workspaceId, JSON.stringify({ followedAt: new Date().toISOString(), organizerId: organizerKeyFor(HOST) })]);

    const page = (await profiles.publicPage("cfo-night", "actor:fan"))!;
    assert.deepEqual(page.upcoming.map((item) => item.title), ["CFO Night Tokyo vol.19"], "drafts, cancelled events and other pages are not listed");
    assert.deepEqual(page.past.map((item) => [item.title, item.attended]), [["CFO Night Tokyo vol.18", 2]], "参加 N名 = check-ins, not applications");
    assert.deepEqual(page.stats, { attendeesTotal: 2, eventsHeld: 1, followers: 1 });
    assert.equal(page.following, true);
    assert.equal((await profiles.publicPage("cfo-night", null))?.following, null, "signed out: no follow state");
    assert.equal(page.upcoming[0]?.remainingSeats, 30);
    assert.match(page.upcoming[0]?.href ?? "", /^\/e\/cfo-night-tokyo-vol-19$/u);

    assert.equal(await profiles.slugForEventAlias(ended.eventId), "cfo-night");
    assert.equal(await profiles.slugForEventAlias(upcoming.publicCode!), "cfo-night");
    assert.equal(await profiles.eventIdForSlug("cfo-night-tokyo-vol-19"), upcoming.eventId);
    assert.equal(await profiles.eventIdForSlug("cfo-night-tokyo-vol-18"), ended.eventId);
    await assert.rejects(profiles.update("actor:other", cfo.profileId, { displayName: "x" }));
    const renamed = await profiles.update(HOST, cfo.profileId, { bio: "毎月渋谷で。", displayName: "CFO Night 実行委員会" });
    assert.equal(renamed.slug, "cfo-night", "the slug never changes");
  });
});
