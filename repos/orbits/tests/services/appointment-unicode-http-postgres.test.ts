import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import test from "node:test";

import { Pool } from "pg";

import { createAppointmentActionIdempotencyRegistry } from "../../features/appointments/client-idempotency";
import { createPostgresAppointmentRepository } from "../../features/appointments/postgres-repository";
import { createAppointmentService } from "../../features/appointments/service";
import { runAppointmentMigrations } from "../../features/appointments/storage/migrations";
import { createEventOperationsPostgresClient } from "../../features/events/event-operations/storage/postgres-client";
import { loadLocalEnv } from "../../scripts/load-local-env";

loadLocalEnv();
const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;

test("Unicode proposal crosses a real HTTP boundary and persists once in PostgreSQL", { skip: databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured" }, async () => {
  assert.ok(databaseUrl);
  const schema = `appointment_unicode_${randomUUID().replaceAll("-", "")}`;
  const workspaceId = `workspace:${randomUUID()}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, max: 4, options: `-c search_path=${schema}` });
  const runtime = { client: createEventOperationsPostgresClient({ connectionString: databaseUrl, pool }), workspaceId };
  const actorA = "actor:aiko";
  const actorB = "actor:ren";
  let server: ReturnType<typeof createServer> | null = null;
  try {
    await admin.query(`create schema ${schema}`);
    await runAppointmentMigrations(runtime.client);
    const service = createAppointmentService({
      authorityVerifier: { async resolveAcceptedBilateralContact(input) {
        if (input.actorId !== actorA || input.authorityReference !== "request:aiko-ren") return null;
        return { authorityRequestId: "request:aiko-ren", contactIdsByActor: { [actorA]: "contact:ren", [actorB]: "contact:aiko" }, counterpartyActorId: actorB, relationshipPairId: "pair:aiko-ren" };
      } },
      now: () => "2026-08-04T07:00:00.000Z",
      repository: createPostgresAppointmentRepository(runtime),
    });
    const created = await service.createDraft({ actorId: actorA, appointmentId: "appointment:unicode", authorityReference: "request:aiko-ren", eventId: "event:tokyo-ai-night", idempotencyKey: "appointment:create:unicode" });

    server = createServer(async (request, response) => {
      try {
        const chunks: Buffer[] = [];
        for await (const chunk of request) chunks.push(Buffer.from(chunk));
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
        const result = await service.command({
          actorId: actorA,
          appointmentId: created.appointment.appointmentId,
          command: "propose",
          expectedVersion: Number(body.expectedVersion),
          idempotencyKey: String(request.headers["idempotency-key"] ?? ""),
          proposal: body.proposal as Parameters<typeof service.command>[0]["proposal"],
        });
        response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ replayed: result.replayed, status: result.appointment.status, version: result.appointment.version }));
      } catch (error) {
        response.writeHead(500, { "content-type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
      }
    });
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const proposal = {
      candidateTimes: [
        { startsAtUtc: "2026-08-07T10:00:00.000Z" },
        { startsAtUtc: "2026-08-08T01:30:00.000Z" },
        { startsAtUtc: "2026-08-10T09:30:00.000Z" },
      ],
      durationMinutes: 45,
      medium: { joinUrl: null, kind: "video", provider: "google_meet" },
      note: "讨论合作の次のステップと東京での実証実験",
      timezone: "Asia/Tokyo",
    };
    const registry = createAppointmentActionIdempotencyRegistry(() => "00000000-0000-4000-8000-000000000099");
    const key = registry.keyFor(`appointment:unicode:1:propose:${JSON.stringify(proposal)}`);
    const send = () => fetch(`http://127.0.0.1:${address.port}/appointments/appointment%3Aunicode/commands`, {
      body: JSON.stringify({ command: "propose", expectedVersion: 1, proposal }),
      headers: { "content-type": "application/json", "Idempotency-Key": key },
      method: "POST",
    });
    const first = await send();
    assert.equal(first.status, 200);
    assert.deepEqual(await first.json(), { replayed: false, status: "awaiting_response", version: 2 });
    const replay = await send();
    assert.equal(replay.status, 200);
    assert.deepEqual(await replay.json(), { replayed: true, status: "awaiting_response", version: 2 });

    const aggregate = await runtime.client.query<{ payload: Record<string, unknown>; status: string; version: string }>("select payload, status, version::text from appointment_aggregates where workspace_id = $1 and appointment_id = $2", [workspaceId, "appointment:unicode"]);
    assert.equal(aggregate.rows[0]?.status, "awaiting_response");
    assert.equal(aggregate.rows[0]?.version, "2");
    assert.match(JSON.stringify(aggregate.rows[0]?.payload), /讨论合作の次のステップと東京での実証実験/);
    const receipts = await runtime.client.query<{ command: string; request_hash: string; response_snapshot: Record<string, unknown> }>("select command, request_hash, response_snapshot from appointment_command_receipts where workspace_id = $1 and actor_id = $2 and idempotency_key = $3", [workspaceId, actorA, key]);
    assert.equal(receipts.rows.length, 1);
    assert.equal(receipts.rows[0]?.command, "propose");
    assert.match(receipts.rows[0]?.request_hash ?? "", /^[a-f0-9]{64}$/);
    assert.match(JSON.stringify(receipts.rows[0]?.response_snapshot), /讨论合作の次のステップと東京での実証実験/);
  } finally {
    if (server) await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
    await runtime.client.close();
    await admin.query(`drop schema if exists ${schema} cascade`);
    await admin.end();
  }
});
