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
