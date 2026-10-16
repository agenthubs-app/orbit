/**
 * R17 SC-R17-05 / 14：审核加「待ち」与对候补的决定；三条进入路径（先着順、批准、递补）都在 admitted 的同一事务里
 * 分配受付番号（A-001…，取消不回收）并写定型通知 outbox（先着順不发通知）；同人同类只写一次。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { EventAdmissionError } from "../../features/events/admission/contract";
import { createPostgresEventAdmissionRepository } from "../../features/events/admission/storage/postgres-repository";
import { createHostLifecycle } from "../../features/events/host/storage/lifecycle";
import { hostDatabaseTest, withHostDatabase } from "../support/host-harness";

const HOST = "actor:host";
const answers = (id: string) => ({
  desiredOutcome: `Two follow-up meetings for ${id}`,
  energyStyle: "Small-group discussion",
  experienceHighlight: "Scaled a team across three markets",
  followUpPreference: "日本語; email within three days",
  industry: "Enterprise software",
  positioning: `CFO @ ${id}`,
  targetAttendees: "Investors and CFOs",
  valueOffered: "Introductions",
});
const payload = (id: string) => ({ answers: answers(id), displayName: `Person ${id}` });

test("waitlist decisions, decisions on waitlisted people, reception numbers and outbox on all three paths", hostDatabaseTest, async () => {
  await withHostDatabase(async ({ client, pool, workspaceId }) => {
    await pool.query(`insert into organizer_profiles (workspace_id, profile_id, owner_actor_id, slug, display_name) values ($1, 'prof', $2, 'org', 'Org')`, [workspaceId, HOST]);
    let n = 0;
    const lifecycle = createHostLifecycle({ client, newEventId: () => `evt_${++n}`, randomBytes: () => Uint8Array.from([n, 2, 3, 4, 5, 6, 7, 8]), workspaceId });
    const window = { profileEditDeadlineAt: "2100-01-01T00:00:00.000Z", registrationClosesAt: "2100-01-01T00:00:00.000Z", registrationOpensAt: "2000-01-01T00:00:00.000Z" };
    const make = async () => {
      const draft = await lifecycle.create(HOST, { endsAt: "2100-01-02T12:00:00.000Z", feeKind: "free", organizerProfileId: "prof", startsAt: "2100-01-02T10:00:00.000Z", title: `Event number ${n}` });
      await lifecycle.publish(HOST, draft.eventId, draft.version, { registrationClosesAt: window.registrationClosesAt });
      return draft.eventId;
    };
    const repo = createPostgresEventAdmissionRepository({ client, workspaceId });
    const outbox = async (eventId: string) => (await pool.query<{ kind: string; actor_id: string }>(`select kind, actor_id from event_host_notice_outbox where workspace_id = $1 and event_id = $2 order by created_at, actor_id`, [workspaceId, eventId])).rows.map((row) => `${row.kind}:${row.actor_id}`);
    const number = async (eventId: string, actorId: string) => (await pool.query<{ reception_no: string }>(`select reception_no from event_reception_numbers where workspace_id = $1 and event_id = $2 and actor_id = $3`, [workspaceId, eventId, actorId])).rows[0]?.reception_no ?? null;

    // 先着順：直接 admitted → 番号，不发通知。
    const instant = await make();
    await repo.configurePolicy({ ...window, admissionMode: "instant", capacity: 10, eventId: instant, updatedByActorId: HOST, waitlistEnabled: true });
    await repo.submitApplication({ actorId: "actor:i1", eventId: instant, profilePayload: payload("i1") });
    await repo.submitApplication({ actorId: "actor:i2", eventId: instant, profilePayload: payload("i2") });
    assert.deepEqual([await number(instant, "actor:i1"), await number(instant, "actor:i2")], ["A-001", "A-002"]);
    assert.deepEqual(await outbox(instant), []);

    // 審査制：承認 / 待ち / 見送り；对候补再批准（有名额才 admitted）；满员时对候补批准 → CAPACITY_FULL。
    const review = await make();
    await repo.configurePolicy({ ...window, admissionMode: "approval_required", capacity: 2, eventId: review, updatedByActorId: HOST, waitlistEnabled: true });
    for (const id of ["r1", "r2", "r3", "r4"]) await repo.submitApplication({ actorId: `actor:${id}`, eventId: review, profilePayload: payload(id) });
    const approved = await repo.decideApplication({ actorId: "actor:r1", decision: "approve", decisionActorId: HOST, eventId: review, expectedApplicationVersion: 1 });
    assert.equal(approved.status, "admitted");
    const waited = await repo.decideApplication({ actorId: "actor:r2", decision: "waitlist", decisionActorId: HOST, eventId: review, expectedApplicationVersion: 1 });
    assert.equal(waited.status, "waitlisted");
    const replay = await repo.decideApplication({ actorId: "actor:r2", decision: "waitlist", decisionActorId: HOST, eventId: review, expectedApplicationVersion: 1 });
    assert.equal(replay.applicationVersion, waited.applicationVersion, "the same decision replays");
    const rejected = await repo.decideApplication({ actorId: "actor:r3", decision: "reject", decisionActorId: HOST, eventId: review, expectedApplicationVersion: 1 });
    assert.equal(rejected.status, "rejected");
    const fromWaitlist = await repo.decideApplication({ actorId: "actor:r2", decision: "approve", decisionActorId: HOST, eventId: review, expectedApplicationVersion: waited.applicationVersion });
    assert.equal(fromWaitlist.status, "admitted", "approving a waitlisted person admits them while there is room");
    const r4wait = await repo.decideApplication({ actorId: "actor:r4", decision: "waitlist", decisionActorId: HOST, eventId: review, expectedApplicationVersion: 1 });
    await assert.rejects(repo.decideApplication({ actorId: "actor:r4", decision: "approve", decisionActorId: HOST, eventId: review, expectedApplicationVersion: r4wait.applicationVersion }), (error: unknown) => error instanceof EventAdmissionError && error.code === "CAPACITY_FULL", "approving from the waitlist never goes over capacity");
    await assert.rejects(repo.decideApplication({ actorId: "actor:r4", decision: "waitlist", decisionActorId: HOST, eventId: review, expectedApplicationVersion: r4wait.applicationVersion }), (error: unknown) => error instanceof EventAdmissionError && error.code === "INVALID_TRANSITION");
    assert.deepEqual([await number(review, "actor:r1"), await number(review, "actor:r2"), await number(review, "actor:r3")], ["A-001", "A-002", null]);

    // 递补：admitted 的人退出 → 最早的候补 admitted → 番号 + 「繰り上げ」通知；取消的人番号不回收。
    const r1 = await repo.getApplication(review, "actor:r1");
    await repo.withdrawApplication({ actorId: "actor:r1", eventId: review, expectedApplicationVersion: r1!.applicationVersion });
    assert.equal((await repo.getApplication(review, "actor:r4"))?.status, "admitted");
    assert.equal(await number(review, "actor:r4"), "A-003", "numbers are never reused");
    assert.deepEqual(await outbox(review), ["admission_approved:actor:r1", "admission_waitlisted:actor:r2", "admission_rejected:actor:r3", "admission_approved:actor:r2", "admission_waitlisted:actor:r4", "admission_promoted:actor:r4"]);
    const countKinds = await pool.query(`select count(*)::int as n from event_host_notice_outbox where workspace_id = $1 and event_id = $2 and actor_id = 'actor:r2' and kind = 'admission_approved'`, [workspaceId, review]);
    assert.equal(countKinds.rows[0]?.n, 1, "r2's approval after the waitlist is one approval notice");
  });
});
