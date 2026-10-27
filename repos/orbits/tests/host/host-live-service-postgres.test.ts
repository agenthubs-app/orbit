/**
 * R17 live 主催服务（端到端，测试库）：建资料 → 建活动 → 申込設定草稿 → 公開（申込方针随之生效）→ 两人申込（审核制）
 * → 運営センター计数 → 参加者批准 / 待ち（版本冲突映射）→ kiosk 名单 → 报告 <5 抑制 → 资料未完成提醒 ≤2 次
 * → 共同運営者视图 / 权限：閲覧能看概要、不能审核；受付能当日枠。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createPostgresEventAccessRepository } from "../../features/events/event-access/storage/postgres-repository";
import { createPostgresEventAdmissionRepository } from "../../features/events/admission/storage/postgres-repository";
import { createHostLiveService, profileScore } from "../../features/events/host/live";
import { shiftedRegistrationClose } from "../../features/events/host/storage/lifecycle";
import { HostError } from "../../features/events/host/service";
import { hostDatabaseTest, withHostDatabase } from "../support/host-harness";
import { lockedFixtureQuery } from "../support/sync-revision-fixture";

const HOST = "actor:host";
const isHost = (code: string) => (error: unknown) => error instanceof HostError && error.code === code;
const answers = (_full: boolean) => ({ desiredOutcome: "資本政策を話したい", energyStyle: "x", experienceHighlight: "x", followUpPreference: "x", industry: "x", positioning: "CFO @ ノードワークス", targetAttendees: "x", valueOffered: "x" });

test("プロフィール完成度 follows R27's coverage (会社 44 + 14 × answered items)", () => {
  assert.equal(profileScore({ answers: { desiredOutcome: "a", energyStyle: "a", experienceHighlight: "a", followUpPreference: "a", industry: "a", positioning: "a", targetAttendees: "a", valueOffered: "a" } }), 100);
  assert.equal(profileScore({ interviewResponses: [{ answer: { displayText: "CFO" }, field: "positioning" }, { answer: { displayText: "資本政策" }, field: "desiredOutcome" }] }), 58);
  assert.equal(profileScore({ interviewResponses: ["desiredOutcome", "experienceHighlight", "targetAttendees", "valueOffered"].map((field) => ({ answer: { displayText: "x" }, field })) }), 100);
});

test("live host service end to end", hostDatabaseTest, async () => {
  await withHostDatabase(async ({ client, pool, workspaceId }) => {
    for (const [id, email, name] of [[HOST, "host@example.com", "佐藤 健一"], ["actor:viewer", "viewer@example.com", "中村 由紀"], ["actor:staff", "staff@example.com", "小林 誠"]]) {
      await lockedFixtureQuery(pool, `insert into orbit_records (workspace_id, collection_name, record_id, source_type, source_id, payload, created_at, updated_at) values ($1, 'auth_users', $2, 'auth', $3, $4::jsonb, now(), now())`, [workspaceId, `auth_user:${email}`, id, JSON.stringify({ displayName: name, email, id })]);
    }
    const service = createHostLiveService({ client, operations: null, workspaceId });
    const profile = await service.createProfile(HOST, { displayName: "CFO Night 実行委員会", emoji: "🥂" });
    const start = new Date(Date.now() + 3 * 86_400_000);
    const created = await service.createEvent(HOST, { capacity: 30, endsAt: new Date(start.getTime() + 2 * 3600_000).toISOString(), feeKind: "free", organizerProfileId: profile.profileId, startsAt: start.toISOString(), title: "CFO Night Tokyo vol.19" });
    const eventId = created.event.eventId;
    assert.deepEqual([created.event.lifecycle, created.event.myRole, created.event.organizerName], ["draft", "owner", "CFO Night 実行委員会"]);
    const setup = await service.setup(HOST, eventId);
    assert.equal(setup!.suggestion?.count, 3, "質問案 3つ (rules)");
    const saved = await service.saveSetup(HOST, eventId, { admissionMode: "review", capacity: 30, description: "説明", expectedRevision: setup!.revision, questions: setup!.suggestion!.questions, registrationClosesAt: new Date(start.getTime() - 3600_000).toISOString() });
    await assert.rejects(service.saveSetup(HOST, eventId, { admissionMode: "review", capacity: 30, description: "古い版", expectedRevision: setup!.revision, questions: [], registrationClosesAt: null }), isHost("VERSION_CONFLICT"));
    const published = await service.publishEvent(HOST, eventId, { expectedVersion: created.event.version });
    assert.equal(published.event.lifecycle, "published");
    assert.equal(published.event.admissionMode, "review", "the draft registration settings become the policy on publish");
    assert.ok(saved.revision > 0);

    const admission = createPostgresEventAdmissionRepository({ client, workspaceId });
    await admission.submitApplication({ actorId: "actor:p1", eventId, profilePayload: { answers: answers(true), displayName: "井上 早紀" } });
    await admission.submitApplication({ actorId: "actor:p2", eventId, profilePayload: { answers: answers(false), displayName: "森 拓也" } });
    const center = await service.center(HOST, { filter: "all", page: 1, q: "" });
    assert.deepEqual([center.events.length, center.events[0]?.applied, center.events[0]?.note.kind, center.events[0]?.note.count], [1, 2, "review_pending", 2]);
    assert.equal(center.todo[0]?.kind, "review_pending");
    assert.deepEqual(await service.centerSummary(HOST), { activeCount: 1, appliedThisMonth: center.summary.appliedThisMonth, eventCount: 1 });

    const pending = await service.people(HOST, eventId, { bucket: "pending", cursor: null, incomplete: false, q: "" });
    assert.deepEqual(pending!.rows.map((row) => [row.name, row.org, row.profileIncomplete]), [["井上 早紀", "ノードワークス", false], ["森 拓也", "ノードワークス", false]]);
    const approved = await service.decide(HOST, eventId, "actor:p1", { decision: "approve", expectedVersion: 1 });
    assert.deepEqual([approved.status, approved.receptionNumber], ["approved", "A-001"]);
    await assert.rejects(service.decide(HOST, eventId, "actor:p1", { decision: "reject", expectedVersion: 1 }), isHost("VERSION_CONFLICT"), "a stale row shows 他の運営者が先に更新しました");
    await service.decide(HOST, eventId, "actor:p2", { decision: "waitlist", expectedVersion: 1 });
    const counts = (await service.people(HOST, eventId, { bucket: "waitlisted", cursor: null, incomplete: false, q: "" }))!.counts;
    assert.deepEqual(counts, { approved: 1, pending: 0, rejected: 0, waitlisted: 1 });

    const kiosk = await service.kiosk(HOST, eventId, "森");
    assert.deepEqual(kiosk!.rows.map((row) => [row.name, row.status]), [["森 拓也", "waitlisted"]]);
    assert.equal(kiosk!.total, 1);

    const report = await service.report(HOST, eventId, "all");
    assert.equal(report.all?.state, "before");

    const preview = await service.noticePreview(HOST, eventId, "profile_incomplete");
    assert.equal(preview!.recipients, 0, "both profiles are complete");
    assert.equal((await service.sendNotice(HOST, eventId, { idempotencyKey: "send-key-1", kind: "profile_incomplete" })).queued, 0);
    assert.equal((await service.sendNotice(HOST, eventId, { idempotencyKey: "send-key-2", kind: "profile_incomplete" })).queued, 0);
    await assert.rejects(service.sendNotice(HOST, eventId, { idempotencyKey: "send-key-3", kind: "profile_incomplete" }), isHost("RATE_LIMITED"), "at most two reminders per event");

    const access = createPostgresEventAccessRepository({ client, workspaceId });
    await access.grant({ actingActorId: HOST, eventId, expectedRevision: 0, reason: "閲覧", role: "read_only_analyst", subjectActorId: "actor:viewer" });
    await access.grant({ actingActorId: HOST, eventId, expectedRevision: 0, reason: "受付", role: "check_in", subjectActorId: "actor:staff" });
    assert.ok(await service.overview("actor:viewer", eventId), "閲覧 sees the overview (A9)");
    await assert.rejects(service.people("actor:viewer", eventId, { bucket: "pending", cursor: null, incomplete: false, q: "" }), isHost("FORBIDDEN"), "閲覧 cannot review");
    assert.equal((await service.kiosk("actor:staff", eventId, ""))!.canWalkIn, true, "受付 can admit on site (A9)");
    await assert.rejects(service.cancelEvent("actor:staff", eventId, { expectedVersion: published.event.version }), isHost("FORBIDDEN"));
    await assert.rejects(service.overview("actor:stranger", eventId), isHost("NOT_FOUND"), "no role: the event does not exist for them");
    const cohosts = await service.cohosts(HOST, eventId);
    assert.deepEqual(cohosts!.members.map((member) => [member.name, member.role]), [["佐藤 健一", "owner"], ["中村 由紀", "read_only_analyst"], ["小林 誠", "check_in"]]);
    const page = await service.organizerPublic(null, profile.slug);
    assert.deepEqual(page!.upcoming.map((item) => item.title), ["CFO Night Tokyo vol.19"]);
  });
});

test("moving an event keeps its registration close before the start", () => {
  const start = "2026-11-10T10:00:00.000Z";
  assert.equal(shiftedRegistrationClose(null, start, "2026-11-08T10:00:00.000Z"), null);
  assert.equal(shiftedRegistrationClose("2026-11-10T09:00:00.000Z", start, "2026-11-08T10:00:00.000Z"), "2026-11-08T09:00:00.000Z", "earlier: the 1-hour gap is kept");
  assert.equal(shiftedRegistrationClose("2026-11-01T00:00:00.000Z", start, "2026-11-08T10:00:00.000Z"), "2026-11-01T00:00:00.000Z", "a close still before the new start stays");
  assert.equal(shiftedRegistrationClose("2026-11-11T19:00:00.000Z", start, "2026-11-10T08:00:00.000Z"), "2026-11-10T08:00:00.000Z", "a close already after the start is clamped to the new start");
  assert.equal(shiftedRegistrationClose(start, start, "2026-11-12T10:00:00.000Z"), "2026-11-12T10:00:00.000Z", "the default close (= start) follows a later start");
  assert.equal(shiftedRegistrationClose("2026-11-09T10:00:00.000Z", start, "2026-11-12T10:00:00.000Z"), "2026-11-09T10:00:00.000Z", "a later move leaves an explicit close alone");
});

test("event time edits move the registration close; a close after the start is refused", hostDatabaseTest, async () => {
  await withHostDatabase(async ({ client, pool, workspaceId }) => {
    await lockedFixtureQuery(pool, `insert into orbit_records (workspace_id, collection_name, record_id, source_type, source_id, payload, created_at, updated_at) values ($1, 'auth_users', $2, 'auth', $3, $4::jsonb, now(), now())`, [workspaceId, "auth_user:host@example.com", HOST, JSON.stringify({ displayName: "佐藤 健一", email: "host@example.com", id: HOST })]);
    const service = createHostLiveService({ client, operations: null, workspaceId });
    const profile = await service.createProfile(HOST, { displayName: "QA 実行委員会", emoji: "🥂" });
    const start = new Date(Date.now() + 5 * 86_400_000);
    const created = await service.createEvent(HOST, { capacity: 30, endsAt: new Date(start.getTime() + 2 * 3600_000).toISOString(), feeKind: "free", organizerProfileId: profile.profileId, startsAt: start.toISOString(), title: "Move me" });
    const eventId = created.event.eventId;
    const setup = await service.setup(HOST, eventId);
    await assert.rejects(service.saveSetup(HOST, eventId, { admissionMode: "first_come", capacity: 30, description: "", expectedRevision: setup!.revision, questions: [], registrationClosesAt: new Date(start.getTime() + 3600_000).toISOString() }), isHost("VALIDATION"), "a close after the start is refused");
    const closesAt = new Date(start.getTime() - 3600_000).toISOString();
    await service.saveSetup(HOST, eventId, { admissionMode: "first_come", capacity: 30, description: "", expectedRevision: setup!.revision, questions: [], registrationClosesAt: closesAt });
    const published = await service.publishEvent(HOST, eventId, { expectedVersion: created.event.version });
    const admission = createPostgresEventAdmissionRepository({ client, workspaceId });
    assert.equal(Date.parse((await admission.getPolicy(eventId))!.registrationClosesAt), Date.parse(closesAt));

    const newStart = new Date(start.getTime() - 2 * 86_400_000);
    const moved = await service.updateEvent(HOST, eventId, { endsAt: new Date(newStart.getTime() + 2 * 3600_000).toISOString(), expectedVersion: published.event.version, notify: false, startsAt: newStart.toISOString() });
    assert.equal(Date.parse(moved.event.startsAt!), newStart.getTime());
    const policy = (await admission.getPolicy(eventId))!;
    assert.equal(Date.parse(policy.registrationClosesAt), newStart.getTime() - 3600_000, "the close moved with the event, keeping the 1-hour gap");
    assert.equal(Date.parse(policy.profileEditDeadlineAt), newStart.getTime() - 3600_000);
    const config = await pool.query(`select c.registration_cutoff_at from event_ops_configuration_heads h join event_ops_configurations c using (workspace_id, event_id, configuration_version) where h.workspace_id = $1 and h.event_id = $2`, [workspaceId, eventId]);
    assert.equal(new Date(config.rows[0]!.registration_cutoff_at as string).getTime(), newStart.getTime() - 3600_000, "operations configuration matches the policy");
    const after = await service.setup(HOST, eventId);
    assert.equal(Date.parse(after!.registrationClosesAt!), newStart.getTime() - 3600_000, "the saved settings show the moved close");
    await service.publishSetup(HOST, eventId, { expectedRevision: after!.revision });
    assert.equal(Date.parse((await admission.getPolicy(eventId))!.registrationClosesAt), newStart.getTime() - 3600_000, "re-publishing the settings keeps it");
  });
});
