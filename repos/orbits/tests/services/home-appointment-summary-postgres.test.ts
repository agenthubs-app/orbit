import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import { createHomeAppointmentSummaryReader } from "../../features/appointments/home-summary-reader";
import { createAppointmentService } from "../../features/appointments/service";
import { createPostgresAppointmentRepository } from "../../features/appointments/postgres-repository";
import { runAppointmentMigrations } from "../../features/appointments/storage/migrations";
import { createEventOperationsPostgresClient } from "../../features/events/event-operations/storage/postgres-client";
import { loadHomeFacts } from "../../app/(app)/app/agent/home-facts-route-service";

const databaseUrl = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
const window = { from: "2026-09-26T00:00:00.000Z", to: "2026-10-03T00:00:00.000Z" };

test("home appointment summary returns only three participant-scoped previews as history grows", { skip: !databaseUrl, timeout: 60_000 }, async () => {
  const url = new URL(databaseUrl!);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
  assert.match(url.pathname, /test|audit/);
  assert.equal(url.search, "", "connection-string overrides are not allowed");
  const schema = `home_appointment_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, max: 2, options: `-c search_path=${schema}` });
  const client = createEventOperationsPostgresClient({ connectionString: databaseUrl!, pool });
  const workspaceId = "workspace:summary", actor = "actor:owner", invitee = "actor:invitee";
  const reads: { rows: number; bytes: number }[] = [];
  const reader = createHomeAppointmentSummaryReader({ workspaceId, client: {
    async query<T>(sql: string, values?: readonly unknown[]) {
      const result = await client.query<T>(sql, values);
      reads.push({ rows: result.rows.length, bytes: Buffer.byteLength(JSON.stringify(result.rows)) });
      return result;
    },
  } });
  try {
    await admin.query(`create schema ${schema}`);
    await runAppointmentMigrations(client);
    const service = createAppointmentService({ repository: createPostgresAppointmentRepository({ client, workspaceId }),
      now: () => "2026-09-25T00:00:00.000Z", authorityVerifier: { async resolveAcceptedBilateralContact() {
        return { authorityRequestId: "request:1", relationshipPairId: "pair:1", counterpartyActorId: invitee,
          contactIdsByActor: { [actor]: "contact:mine", [invitee]: "contact:theirs" } };
      } } });
    const draft = await service.createDraft({ actorId: actor, appointmentId: "a", authorityReference: "request:1", eventId: null, idempotencyKey: "draft" });
    const proposal = await service.command({ command: "propose", actorId: actor, appointmentId: "a", expectedVersion: draft.appointment.version, idempotencyKey: "propose",
      proposal: { candidateTimes: [1, 2, 3].map(n => ({ candidateId: `time:${n}`, startsAtUtc: `2026-09-2${n + 6}T10:00:00.000Z` })), durationMinutes: 60,
        timezone: "UTC", medium: { kind: "video", provider: "other", joinUrl: null } } });
    await service.command({ command: "accept", actorId: invitee, appointmentId: "a", expectedVersion: proposal.appointment.version, idempotencyKey: "accept", candidateId: "time:1" });
    const one = await reader.read(actor, window);
    assert.equal(one.count, 1);
    assert.equal(one.items[0]?.appointmentId, "a");
    assert.equal(one.items[0]?.contactId, "contact:mine");
    assert.equal((await reader.read(invitee, window)).items[0]?.contactId, "contact:theirs");
    assert.deepEqual(await reader.read("stranger", window), { count: 0, items: [] });
    const dependencies = { taskService: null, followupLoader: null, personalScheduleService: null };
    const legacyHome = await loadHomeFacts({ actorId: actor, snapshotAt: window.from, dependencies: { ...dependencies, appointmentService: service } });
    const boundedHome = await loadHomeFacts({ actorId: actor, snapshotAt: window.from, dependencies: { ...dependencies, appointmentSummaryReader: reader } });
    assert.deepEqual(boundedHome.appointments, legacyHome.appointments, "actual Home adapter keeps the same visible confirmation");
    let fallbackCalls = 0;
    const failedHome = await loadHomeFacts({ actorId: actor, snapshotAt: window.from, dependencies: { ...dependencies,
      appointmentSummaryReaderFactory: () => { throw Error("storage unavailable"); },
      appointmentServiceFactory: () => { fallbackCalls++; return service; },
    } });
    assert.equal(failedHome.appointments.state, "unavailable");
    assert.equal(fallbackCalls, 0, "a summary failure must not trigger full aggregate downloads");
    for (const blankId of ["\u00a0\ufeff", "\u2003", "\t\r\n", "\u1680\u2028\u2029\u202f\u205f\u3000"]) {
      await client.query(`insert into appointment_aggregates (workspace_id,appointment_id,owner_actor_id,invitee_actor_id,
      relationship_pair_id,authority_request_id,contact_ids_by_actor,event_id,status,version,payload,created_at,updated_at)
      select workspace_id,$1,owner_actor_id,invitee_actor_id,'pair:blank',authority_request_id,contact_ids_by_actor,event_id,status,version,
        payload||jsonb_build_object('appointmentId',$1::text),created_at,updated_at
      from appointment_aggregates where appointment_id='a'`, [blankId]);
      await assert.rejects(reader.read(actor, window), /HOME_APPOINTMENT_SUMMARY_INVALID/, "Unicode-only whitespace IDs fail just like the original Home adapter");
      await client.query(`delete from appointment_aggregates where appointment_id=$1`, [blankId]);
    }
    await client.query(`insert into appointment_aggregates (workspace_id,appointment_id,owner_actor_id,invitee_actor_id,
      relationship_pair_id,authority_request_id,contact_ids_by_actor,event_id,status,version,payload,created_at,updated_at)
      select workspace_id,'clone:'||n,owner_actor_id,invitee_actor_id,'pair:'||n,authority_request_id,contact_ids_by_actor,event_id,status,version,
        payload||jsonb_build_object('appointmentId','clone:'||n,'relationshipPairId','pair:'||n,
          'details',repeat('private body',1000),'history',jsonb_build_array(jsonb_build_object('detail',repeat('history',1000)))),created_at,updated_at
      from appointment_aggregates cross join generate_series(2,10001) n where appointment_id='a'`);
    const many = await reader.read(actor, window);
    assert.equal(many.count, 10001);
    assert.deepEqual(many.items.map(item => item.appointmentId), ["a", "clone:10", "clone:100"]);
    assert.equal(reads.at(-1)?.rows, 1);
    assert.ok(reads.at(-1)!.bytes < 2500);
    assert.ok(!JSON.stringify(many).includes("private body"));
    console.info("home_appointment_summary_cost", { appointments: 10001, ...reads.at(-1) });
    await client.query(`delete from appointment_aggregates where appointment_id<>'a'`);
    await client.query(`update appointment_aggregates set payload=jsonb_set(payload,'{confirmed,startsAtUtc}',to_jsonb($1::text))`, ["2026-09-26T01:00:00+02:00"]);
    assert.equal((await reader.read(actor, window)).count, 0, "offset instant before window is excluded");
    await client.query(`update appointment_aggregates set payload=jsonb_set(payload,'{confirmed,startsAtUtc}',to_jsonb($1::text))`, ["2026-09-26T02:00:00+02:00"]);
    assert.equal((await reader.read(actor, window)).count, 1, "inclusive lower boundary");
    await client.query(`update appointment_aggregates set payload=jsonb_set(payload,'{confirmed,startsAtUtc}',to_jsonb($1::text))`, [window.to]);
    assert.equal((await reader.read(actor, window)).count, 0, "exclusive upper boundary");
    for (const startsAt of ["2026-09-26T24:00:00Z", "2026-09-27T00:00:00.999999Z", "2026-09-27T23:59:00+23:59"]) {
      await client.query(`update appointment_aggregates set payload=jsonb_set(payload,'{confirmed,startsAtUtc}',to_jsonb($1::text))`, [startsAt]);
      assert.equal((await reader.read(actor, window)).items[0]?.startsAtUtc, new Date(startsAt).toISOString());
    }
    await client.query(`update appointment_aggregates set status='reschedule_pending',payload=jsonb_set(payload,'{status}','"reschedule_pending"')`);
    assert.equal((await reader.read(actor, window)).items[0]?.status, "reschedule_pending", "saved confirmation remains visible while rescheduling");
    for (const status of ["cancelled", "completed", "negotiating", "draft"]) {
      await client.query(`update appointment_aggregates set status=$1,payload=jsonb_set(payload,'{status}',to_jsonb($1::text))`, [status]);
      assert.equal((await reader.read(actor, window)).count, 0);
    }
    await client.query(`update appointment_aggregates set status='confirmed',payload=jsonb_set(payload,'{status}','"confirmed"')`);
    await client.query(`update appointment_aggregates set payload=jsonb_set(payload,'{confirmed,startsAtUtc}',to_jsonb($1::text))`, ["2026-02-31T00:00:00Z"]);
    await assert.rejects(reader.read(actor, window), /HOME_APPOINTMENT_SUMMARY_INVALID/);
    await client.query(`update appointment_aggregates set payload=jsonb_set(payload,'{confirmed,startsAtUtc}',to_jsonb($1::text))`, [window.from]);
    const snapshot = (await client.query<{ payload: unknown }>(`select payload from appointment_aggregates where appointment_id='a'`)).rows[0]!.payload;
    for (const patch of [
      { confirmed: null },
      { appointmentId: "other" },
      { status: "draft" },
      { confirmed: { startsAtUtc: window.from, durationMinutes: "60", medium: { kind: "phone" } } },
      { confirmed: { startsAtUtc: window.from, durationMinutes: 0, medium: { kind: "phone" } } },
      { confirmed: { startsAtUtc: window.from, durationMinutes: 60, medium: { kind: "invalid" } } },
    ]) {
      await client.query(`update appointment_aggregates set payload=$1::jsonb||$2::jsonb`, [snapshot, patch]);
      await assert.rejects(reader.read(actor, window), /HOME_APPOINTMENT_SUMMARY_INVALID/);
    }
    await client.query(`update appointment_aggregates set payload=$1`, [snapshot]);
    await client.query(`update appointment_aggregates set payload=jsonb_set(payload,'{ownerActorId}',to_jsonb('foreign'::text))`);
    await assert.rejects(reader.read(actor, window), /HOME_APPOINTMENT_SUMMARY_INVALID/);
    assert.equal((await reader.read("foreign", window)).count, 0, "payload alone never grants membership");
    await assert.rejects(reader.read("", window), /ACTOR_REQUIRED/);
  } finally {
    await client.close();
    await admin.query(`drop schema if exists ${schema} cascade`);
    await admin.end();
  }
});
