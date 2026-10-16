/**
 * R17 SC-R17-06：受付 kiosk 的 live 操作。到着 / QR v2（验签、跨活动、过期、旧明文）、幂等重放、撤销（30 分钟内、计分回退、
 * 番号不回收）、当日枠（候补 → admitted，满员要确认并记 over_capacity）、心跳设备数；没配编组也能签到。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createPostgresEventAdmissionRepository } from "../../features/events/admission/storage/postgres-repository";
import { createPostgresEventOperationsRepository } from "../../features/events/event-operations/storage/postgres-repository";
import { issueCheckInToken } from "../../features/events/host/checkin-token-server";
import { HostError } from "../../features/events/host/service";
import { createHostKiosk } from "../../features/events/host/storage/kiosk";
import { createHostLifecycle } from "../../features/events/host/storage/lifecycle";
import { hostDatabaseTest, withHostDatabase } from "../support/host-harness";

const HOST = "actor:host";
const SECRET = "test-secret-test-secret-test-secret-00";
const payload = (id: string) => ({ answers: { desiredOutcome: "x", energyStyle: "x", experienceHighlight: "x", followUpPreference: "x", industry: "x", positioning: `p ${id}`, targetAttendees: "x", valueOffered: "x" }, displayName: `Name ${id}` });
const isHost = (code: string) => (error: unknown) => error instanceof HostError && error.code === code;

test("kiosk check-in, QR v2, undo, walk-in and heartbeat", hostDatabaseTest, async () => {
  await withHostDatabase(async ({ client, pool, workspaceId }) => {
    await pool.query(`insert into organizer_profiles (workspace_id, profile_id, owner_actor_id, slug, display_name) values ($1, 'prof', $2, 'org', 'Org')`, [workspaceId, HOST]);
    const start = new Date(Date.now() + 30 * 60_000);
    const end = new Date(Date.now() + 3 * 3600_000);
    const lifecycle = createHostLifecycle({ client, newEventId: () => "evt_kiosk", workspaceId });
    const draft = await lifecycle.create(HOST, { endsAt: end.toISOString(), feeKind: "free", organizerProfileId: "prof", startsAt: start.toISOString(), title: "Kiosk night" });
    await lifecycle.publish(HOST, draft.eventId, draft.version, { registrationClosesAt: start.toISOString() });
    const admission = createPostgresEventAdmissionRepository({ client, workspaceId });
    await admission.configurePolicy({ admissionMode: "instant", capacity: 2, eventId: draft.eventId, profileEditDeadlineAt: start.toISOString(), registrationClosesAt: start.toISOString(), registrationOpensAt: new Date(Date.now() - 86_400_000).toISOString(), updatedByActorId: HOST, waitlistEnabled: true });
    for (const id of ["u1", "u2", "u3"]) await admission.submitApplication({ actorId: `actor:${id}`, eventId: draft.eventId, profilePayload: payload(id) });
    const pid = async (actor: string) => (await pool.query<{ participant_id: string }>(`select participant_id from event_ops_membership_heads where workspace_id = $1 and event_id = $2 and actor_id = $3`, [workspaceId, draft.eventId, actor])).rows[0]!.participant_id;
    const [p1, p2] = [await pid("actor:u1"), await pid("actor:u2")];

    const operations = createPostgresEventOperationsRepository({ client, workspaceId });
    let clock = new Date();
    const reverted: string[] = [];
    let walkInAllowed = true;
    const kiosk = createHostKiosk({
      admission,
      checkInParticipant: ({ actorId, eventId, participantId }) => operations.checkInAtomically({ actorId, capability: "check_in.roster.write", eventId, kind: "staff", participantId }),
      client,
      now: () => clock,
      requireCapability: async (_actor, _event, capability) => { if (capability === "check_in.walk_in" && !walkInAllowed) throw new HostError("FORBIDDEN"); },
      revertPlanAttendance: async ({ actorId }) => { reverted.push(actorId); },
      tokenSecret: SECRET,
      workspaceId,
    });

    const first = await kiosk.checkIn(HOST, draft.eventId, p1, "key-checkin-1");
    assert.deepEqual([first.status, first.duplicate, first.receptionNumber], ["checked_in", false, "A-001"]);
    assert.equal((await kiosk.checkIn(HOST, draft.eventId, p1, "key-checkin-1")).duplicate, true, "replaying the same key (offline resend)");
    assert.equal((await kiosk.checkIn(HOST, draft.eventId, p1, "key-checkin-other-device")).duplicate, true, "two devices check in the same person once");
    const rows = await pool.query(`select count(*)::int as n from event_ops_checkins where workspace_id = $1 and event_id = $2`, [workspaceId, draft.eventId]);
    assert.equal(rows.rows[0]?.n, 1);

    const token = issueCheckInToken({ eventEndsAt: end.toISOString(), eventId: draft.eventId, participantId: p2 }, SECRET)!;
    const scanned = await kiosk.scan(HOST, draft.eventId, token, "key-scan-1");
    assert.deepEqual([scanned.status, scanned.receptionNumber], ["checked_in", "A-002"]);
    await assert.rejects(kiosk.scan(HOST, draft.eventId, `orbit-checkin:${draft.eventId}:${p2}`, "key-scan-2"), isHost("TOKEN_INVALID"), "old plaintext");
    const other = issueCheckInToken({ eventEndsAt: end.toISOString(), eventId: "evt_other", participantId: p2 }, SECRET)!;
    await assert.rejects(kiosk.scan(HOST, draft.eventId, other, "key-scan-3"), isHost("TOKEN_INVALID"), "another event's token");
    await assert.rejects(kiosk.scan(HOST, draft.eventId, issueCheckInToken({ eventEndsAt: end.toISOString(), eventId: draft.eventId, participantId: p2 }, "another-secret-another-secret-0000")!, "key-scan-4"), isHost("TOKEN_INVALID"), "forged signature");
    clock = new Date(end.getTime() + 25 * 3600_000);
    await assert.rejects(kiosk.scan(HOST, draft.eventId, token, "key-scan-5"), isHost("TOKEN_INVALID"), "expired 24h after the end");
    clock = new Date();

    const undone = await kiosk.undo(HOST, draft.eventId, p1, "key-undo-1");
    assert.deepEqual([undone.status, undone.receptionNumber], ["not_arrived", "A-001"], "the number is kept");
    assert.deepEqual(reverted, ["actor:u1"], "plan score reverted");
    const again = await kiosk.checkIn(HOST, draft.eventId, p1, "key-checkin-2");
    assert.deepEqual([again.status, again.duplicate, again.receptionNumber], ["checked_in", false, "A-001"]);
    clock = new Date(Date.now() + 31 * 60_000);
    await assert.rejects(kiosk.undo(HOST, draft.eventId, p1, "key-undo-2"), isHost("UNDO_EXPIRED"));
    clock = new Date();

    walkInAllowed = false;
    await assert.rejects(kiosk.admitOnSite("actor:viewer", draft.eventId, "actor:u3", { idempotencyKey: "key-walkin-0" }), isHost("FORBIDDEN"));
    walkInAllowed = true;
    await assert.rejects(kiosk.admitOnSite(HOST, draft.eventId, "actor:u3", { idempotencyKey: "key-walkin-1" }), isHost("CAPACITY_FULL"), "full: needs confirmation");
    const walkIn = await kiosk.admitOnSite(HOST, draft.eventId, "actor:u3", { confirmOverCapacity: true, idempotencyKey: "key-walkin-2" });
    assert.deepEqual([walkIn.status, walkIn.overCapacity, walkIn.receptionNumber], ["checked_in", true, "A-003"]);
    const walk = await pool.query(`select over_capacity from event_ops_walk_ins where workspace_id = $1 and event_id = $2 and actor_id = 'actor:u3'`, [workspaceId, draft.eventId]);
    assert.equal(walk.rows[0]?.over_capacity, true);

    await kiosk.heartbeat(HOST, draft.eventId, "device-aaaaaaaa");
    assert.equal((await kiosk.heartbeat(HOST, draft.eventId, "device-bbbbbbbb")).devices, 2);
    clock = new Date(Date.now() + 61_000);
    assert.equal((await kiosk.heartbeat(HOST, draft.eventId, "device-aaaaaaaa")).devices, 1, "a device silent for 60s no longer counts");
  });
});
