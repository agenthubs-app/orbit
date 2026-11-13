/**
 * 主催者の連絡先（2026-11-14，测试库）：建活动写进 source_payload.host.contact → 主办方视图读回 → 公开后改连絡先不出 changePreview、
 * 不发通知 → Event Core 读到的活动映射成 JourneyEvent → 详情只给已报名（審査中）的人，未报名 / 未登录拿不到。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createMemoryActorRecordStore } from "../../features/events/actor-records/store";
import { createPostgresEventAdmissionRepository } from "../../features/events/admission/storage/postgres-repository";
import { createPostgresEventCoreRepository } from "../../features/events/core/storage/postgres-repository";
import { createHostLiveService } from "../../features/events/host/live";
import { createHostLifecycle } from "../../features/events/host/storage/lifecycle";
import { createEventFeedbackService, createOrganizerFollowService, createPrepChecklistService, createVenueMemoService } from "../../features/events/journey/attendee-records";
import { journeyEventFromCanonical } from "../../features/events/journey/live-mapping";
import type { JourneyLivePorts, MyEventStatus } from "../../features/events/journey/ports";
import { createJourneyService } from "../../features/events/journey/service";
import { hostDatabaseTest, withHostDatabase } from "../support/host-harness";
import { lockedFixtureQuery } from "../support/sync-revision-fixture";

const HOST = "actor:host";
const CONTACT = { lineId: "cfonight_tokyo", note: "申込後、WeChat にお名前を送ってください。入金を確認したら承認します。", wechatId: "cfonight-tokyo" };

test("host contact: stored with the event, read back, edited without notices, shown only to registrants", hostDatabaseTest, async () => {
  await withHostDatabase(async ({ client, pool, workspaceId }) => {
    await lockedFixtureQuery(pool, `insert into orbit_records (workspace_id, collection_name, record_id, source_type, source_id, payload, created_at, updated_at) values ($1, 'auth_users', 'auth_user:host@example.com', 'auth', $2, $3::jsonb, now(), now())`, [workspaceId, HOST, JSON.stringify({ displayName: "佐藤 健一", email: "host@example.com", id: HOST })]);
    const service = createHostLiveService({ client, operations: null, workspaceId });
    const profile = await service.createProfile(HOST, { displayName: "CFO Night 実行委員会", emoji: "🥂" });
    const start = new Date(Date.now() + 5 * 86_400_000);
    const times = { endsAt: new Date(start.getTime() + 2 * 3600_000).toISOString(), startsAt: start.toISOString() };

    // 建：写进 source_payload.host.contact（规范化：去空白），主办方视图读回。
    const created = await service.createEvent(HOST, { ...times, contact: { ...CONTACT, wechatId: ` ${CONTACT.wechatId} ` }, feeAmountYen: 3000, feeKind: "amount", organizerProfileId: profile.profileId, title: "CFO Night Tokyo vol.20", venueName: "渋谷" });
    const eventId = created.event.eventId;
    assert.deepEqual(created.event.contact, CONTACT);
    const stored = await pool.query<{ contact: unknown }>(`select source_payload #> '{host,contact}' as contact from event_ops_events where workspace_id = $1 and event_id = $2`, [workspaceId, eventId]);
    assert.deepEqual(stored.rows[0]?.contact, CONTACT);
    assert.deepEqual((await service.event(HOST, eventId))?.contact, CONTACT);

    // 没填连絡先的活动：null。
    const plain = await service.createEvent(HOST, { ...times, feeKind: "free", organizerProfileId: profile.profileId, title: "連絡先なし", venueName: "渋谷" });
    assert.equal(plain.event.contact, null);

    // 公开后改连絡先：不出 changePreview、不通知、不写通知发送记录。
    const published = await service.publishEvent(HOST, eventId, { expectedVersion: created.event.version });
    const admission = createPostgresEventAdmissionRepository({ client, workspaceId });
    await admission.submitApplication({ actorId: "actor:p1", eventId, profilePayload: { answers: {}, displayName: "井上 早紀" } });
    const edited = await service.updateEvent(HOST, eventId, { contact: { lineId: null, note: CONTACT.note, wechatId: "cfo-night-new" }, expectedVersion: published.event.version });
    assert.equal(edited.changePreview, null);
    assert.equal(edited.notified, 0);
    assert.deepEqual(edited.event.contact, { lineId: null, note: CONTACT.note, wechatId: "cfo-night-new" });
    const sends = await pool.query(`select count(*)::int as n from event_host_notice_sends where workspace_id = $1 and event_id = $2`, [workspaceId, eventId]);
    assert.equal(sends.rows[0]?.n, 0);
    // 其他字段不动：只改了连絡先。
    assert.deepEqual([edited.event.feeKind, edited.event.feeAmountYen, edited.event.venueName], ["amount", 3000, "渋谷"]);

    // 清空：null → 存为 null。
    const cleared = await service.updateEvent(HOST, eventId, { contact: null, expectedVersion: edited.event.version });
    assert.equal(cleared.event.contact, null);
    const restored = await service.updateEvent(HOST, eventId, { contact: CONTACT, expectedVersion: cleared.event.version });
    assert.deepEqual(restored.event.contact, CONTACT);

    // 读者侧：Event Core 读出的活动（与 journey live 的 ports.event 同一来源）→ JourneyEvent.hostContact。
    const core = createPostgresEventCoreRepository({ client, workspaceId });
    const canonical = await core.getEvent(eventId);
    assert.ok(canonical);
    const journeyEvent = journeyEventFromCanonical({ ...canonical!, endsAt: canonical!.endsAt, startsAt: canonical!.startsAt!, title: canonical!.title ?? "" }, { policy: null, registrationCount: 1 });
    assert.deepEqual(journeyEvent.hostContact, CONTACT);

    // 详情：报名状态取自数据库的申请记录（actor:p1 = 審査中；actor:p2 没报名）。
    const statusOf = async (actorId: string): Promise<MyEventStatus | null> => {
      const row = await pool.query<{ status: string }>(`select status from event_ops_admission_application_heads where workspace_id = $1 and event_id = $2 and actor_id = $3`, [workspaceId, eventId, actorId]);
      const status = row.rows[0]?.status;
      return status === "pending_review" ? "pending_review" : status === "admitted" ? "registered" : status === "waitlisted" ? "waitlisted" : null;
    };
    assert.equal(await statusOf("actor:p1"), "pending_review");
    const ports = {
      contacts: async () => [],
      event: async (id: string) => (id === eventId ? journeyEvent : null),
      judge: async () => ({ goal: null, hasPlan: false, results: {} }),
      myEvents: async (actorId: string) => { const status = await statusOf(actorId); return status ? [{ eventId, organizerKey: journeyEvent.organizerKey, status }] : []; },
      organizerStats: async () => null,
      planTypesFor: async () => ({}),
      publicAttendees: async () => ({ attendees: [], total: 1 }),
      registered: async (actorId: string) => (await statusOf(actorId)) === "registered",
    } as unknown as JourneyLivePorts;
    const store = createMemoryActorRecordStore();
    const journey = createJourneyService({ ports, records: { checklist: createPrepChecklistService({ store }), feedback: createEventFeedbackService({ store }), follows: createOrganizerFollowService({ store }), memos: createVenueMemoService({ store }) } });
    const applicant = await journey.overview("actor:p1", eventId, "ja", "web");
    assert.equal(applicant?.registration.status, "pending_review");
    assert.deepEqual(applicant?.hostContact, CONTACT, "審査中の申込者は見られる");
    const stranger = await journey.overview("actor:p2", eventId, "ja", "web");
    assert.equal(stranger?.registration.status, "none");
    assert.equal("hostContact" in (stranger ?? {}), false, "申込していない人には返さない");
    const anonymous = await journey.overview(null, eventId, "ja", "web");
    assert.equal("hostContact" in (anonymous ?? {}), false, "未ログイン・公開ページには返さない");
    assert.doesNotMatch(JSON.stringify(stranger), /cfonight/u);
    assert.doesNotMatch(JSON.stringify(anonymous), /cfonight/u);
  });
});

test("lifecycle: create keeps a blank contact as null; update without `contact` leaves it alone", hostDatabaseTest, async () => {
  await withHostDatabase(async ({ client, pool, workspaceId }) => {
    await pool.query(`insert into organizer_profiles (workspace_id, profile_id, owner_actor_id, slug, display_name) values ($1, 'prof_cfo', $2, 'cfo-night', 'CFO Night 実行委員会')`, [workspaceId, HOST]);
    const lifecycle = createHostLifecycle({ client, newEventId: () => "evt_contact_1", workspaceId });
    const input = { endsAt: "2026-12-04T12:30:00.000Z", feeKind: "free" as const, organizerProfileId: "prof_cfo", startsAt: "2026-12-04T10:00:00.000Z", title: "勉強会" };
    const blank = await lifecycle.create(HOST, { ...input, contact: { lineId: " ", note: "", wechatId: null } });
    assert.equal(blank.payload.contact, null);
    const withContact = await lifecycle.update(HOST, blank.eventId, { contact: CONTACT, expectedVersion: blank.version });
    assert.deepEqual(withContact.event.payload.contact, CONTACT);
    const titleOnly = await lifecycle.update(HOST, blank.eventId, { expectedVersion: withContact.event.version, title: "勉強会 #2" });
    assert.deepEqual(titleOnly.event.payload.contact, CONTACT, "a PATCH without contact keeps it");
    assert.equal(titleOnly.needsDecision, false);
  });
});
