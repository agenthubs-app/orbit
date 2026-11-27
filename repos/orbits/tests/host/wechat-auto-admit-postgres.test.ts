/**
 * 2026-11-27 用户新增「已加群的报名自动通过」：自动通过与主办方「承認」是同一条迁移——同事务的受付番号、承認通知、
 * 正式参加（membership rsvped）、名额校验；满员不超卖（无候补 = 照旧审核中，有候补 = 候补规则）。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createPostgresEventAdmissionRepository } from "../../features/events/admission/storage/postgres-repository";
import { createHostLifecycle } from "../../features/events/host/storage/lifecycle";
import { autoAdmitApplication, WECHAT_AUTO_ADMIT_ACTOR } from "../../features/events/journey/join-live";
import { hostDatabaseTest, withHostDatabase } from "../support/host-harness";

const HOST = "actor:host";
const payload = (id: string) => ({ answers: { desiredOutcome: `Meet ${id}`, targetAttendees: "Investors", valueOffered: "Intros" }, displayName: `Person ${id}` });

test("auto-approval = the host's approval: reception number, approval notice, membership; never over capacity", hostDatabaseTest, async () => {
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
    const member = async (eventId: string, actorId: string) => (await pool.query<{ status: string }>(`select status from event_ops_membership_heads where workspace_id = $1 and event_id = $2 and actor_id = $3`, [workspaceId, eventId, actorId])).rows[0]?.status ?? null;

    // 无候补、名额 1：第一个自动通过，第二个满员 → 照旧审核中（不超卖）。
    const noWaitlist = await make();
    await repo.configurePolicy({ ...window, admissionMode: "approval_required", capacity: 1, eventId: noWaitlist, updatedByActorId: HOST, waitlistEnabled: false });
    for (const id of ["a", "b"]) await repo.submitApplication({ actorId: `actor:${id}`, eventId: noWaitlist, profilePayload: payload(id) });
    assert.equal(await autoAdmitApplication(repo, "actor:a", noWaitlist), "registered");
    const admitted = await repo.getApplication(noWaitlist, "actor:a");
    assert.equal(admitted?.status, "admitted");
    assert.equal(admitted?.decisionActorId, WECHAT_AUTO_ADMIT_ACTOR, "the record says it was the self-report, not a host");
    assert.equal(await number(noWaitlist, "actor:a"), "A-001");
    assert.equal(await member(noWaitlist, "actor:a"), "rsvped");
    assert.equal(await autoAdmitApplication(repo, "actor:b", noWaitlist), "pending_review");
    assert.equal((await repo.getApplication(noWaitlist, "actor:b"))?.status, "pending_review");
    assert.deepEqual(await outbox(noWaitlist), ["admission_approved:actor:a"], "same approval notice as a manual approval; none for the full one");
    assert.equal(await autoAdmitApplication(repo, "actor:a", noWaitlist), "registered", "a repeated submit stays confirmed");

    // 有候补：满员 → 候补（现有规则），对用户仍是「审核中」。
    const withWaitlist = await make();
    await repo.configurePolicy({ ...window, admissionMode: "approval_required", capacity: 1, eventId: withWaitlist, updatedByActorId: HOST, waitlistEnabled: true });
    for (const id of ["c", "d"]) await repo.submitApplication({ actorId: `actor:${id}`, eventId: withWaitlist, profilePayload: payload(id) });
    assert.equal(await autoAdmitApplication(repo, "actor:c", withWaitlist), "registered");
    assert.equal(await autoAdmitApplication(repo, "actor:d", withWaitlist), "pending_review");
    assert.equal((await repo.getApplication(withWaitlist, "actor:d"))?.status, "waitlisted");
  });
});
