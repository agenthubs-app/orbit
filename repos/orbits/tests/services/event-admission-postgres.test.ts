import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";

import { EventAdmissionError } from "../../features/events/admission/contract";
import { createPostgresEventAdmissionRepository } from "../../features/events/admission/storage/postgres-repository";
import { createEventAdmissionService } from "../../features/events/admission/service";
import {
  EVENT_OPERATIONS_SCHEMA_MIGRATIONS,
  runEventOperationsMigrations,
} from "../../features/events/event-operations/storage/migrations";
import { createEventOperationsPostgresClient } from "../../features/events/event-operations/storage/postgres-client";

const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
const V1_TO_V8_CHECKSUMS = [
  "cca6a82784aec67b23a682594bbf2cd822acd6fbd3aa574174f11e25714f6914",
  "e231071fd30532d4c8a2959a32a64ae57bd46e06e98fb0b7cd690cd32e3e4241",
  "e0a84549a12835fe3a8da9991d310bafbeaac97bf7a4c46c830f376351513f0e",
  "fa787dacf55b6346bfbf887e3f14ebef8f565c10cb9d215c4c643dff651e47c3",
  "1e4c121828645434418e542849f081ef4fbb4bb10f8de9aab7118d588da7ade1",
  "859073ce53daab6ddc5d5237824f420e6a026b6749e502d381bdd1bffb98be23",
  "101a1309c3c82d674c03058e7ce35ae28357bcee3f986455952e2c0cee1dfc59",
  "4c9cf2ae167b9178f4358691b6226b7fefc15112c20c7a0ea565646049f7f4c0",
] as const;

test("admission v9 appends without changing v1-v8 migration checksums", () => {
  assert.deepEqual(
    EVENT_OPERATIONS_SCHEMA_MIGRATIONS.slice(0, 8).map((item) => item.checksum),
    V1_TO_V8_CHECKSUMS,
  );
  assert.equal(EVENT_OPERATIONS_SCHEMA_MIGRATIONS.at(-1)?.version, 9);
  assert.equal(
    EVENT_OPERATIONS_SCHEMA_MIGRATIONS.at(-1)?.name,
    "event-operations-v9-canonical-admission",
  );
});

function profile(actorId: string) {
  return {
    actorId,
    goals: ["Find a distribution partner", "Compare operational playbooks"],
    nested: {
      languages: ["中文", "日本語", "English"],
      note: `Preserve this profile verbatim for ${actorId}.`,
    },
  };
}

test(
  "canonical admission atomically enforces capacity, approval, waitlist, windows, versions, and audit",
  { skip: databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured", timeout: 90_000 },
  async () => {
    assert.ok(databaseUrl);
    const suffix = randomUUID().replaceAll("-", "");
    const schema = `event_admission_${suffix}`;
    const workspaceId = `workspace:admission:${suffix}`;
    const managerId = "actor:admission-manager";
    const adminPool = new Pool({ connectionString: databaseUrl, max: 1 });
    const operationPool = new Pool({
      connectionString: databaseUrl,
      max: 8,
      options: `-c search_path=${schema}`,
    });
    const client = createEventOperationsPostgresClient({
      connectionString: databaseUrl,
      max: 8,
      pool: operationPool,
    });
    try {
      await adminPool.query(`create schema ${schema}`);
      await runEventOperationsMigrations(operationPool);
      await runEventOperationsMigrations(operationPool);
      const migrations = await operationPool.query<{ checksum: string }>(
        "select checksum from event_ops_schema_migrations order by version",
      );
      assert.equal(migrations.rows.length, 9);
      assert.deepEqual(migrations.rows.slice(0, 8).map((item) => item.checksum), V1_TO_V8_CHECKSUMS);

      for (const eventId of ["event:instant", "event:approval", "event:no-waitlist"]) {
        await operationPool.query(
          `insert into event_ops_events (
             workspace_id, event_id, organizer_actor_id, lifecycle_state,
             revision, created_at, updated_at
           ) values ($1, $2, $3, 'active', 1, now(), now())`,
          [workspaceId, eventId, managerId],
        );
      }
      const repository = createPostgresEventAdmissionRepository({ client, workspaceId });
      const service = createEventAdmissionService({
        async canManageEvent(actorId) { return actorId === managerId; },
        repository,
      });
      const openWindow = {
        registrationClosesAt: "2100-01-01T00:00:00.000Z",
        registrationOpensAt: "2000-01-01T00:00:00.000Z",
      };
      const instantPolicy = {
        ...openWindow,
        admissionMode: "instant" as const,
        capacity: 2,
        eventId: "event:instant",
        waitlistEnabled: true,
      };
      assert.equal((await service.configurePolicy(managerId, instantPolicy)).policyVersion, 1);
      assert.equal((await service.configurePolicy(managerId, instantPolicy)).policyVersion, 2);

      const a = await service.submitApplication("actor:A", {
        eventId: "event:instant", profilePayload: profile("actor:A"),
      });
      const duplicateA = await service.submitApplication("actor:A", {
        eventId: "event:instant", profilePayload: profile("actor:A"),
      });
      assert.deepEqual(duplicateA, a);
      await assert.rejects(
        service.submitApplication("actor:A", {
          eventId: "event:instant", profilePayload: { changed: true },
        }),
        (error: unknown) =>
          error instanceof EventAdmissionError && error.code === "INVALID_TRANSITION",
      );
      assert.deepEqual(a.profilePayload, profile("actor:A"));
      assert.equal(a.policyVersion, 2);
      assert.equal(a.status, "admitted");
      assert.equal((await service.submitApplication("actor:B", {
        eventId: "event:instant", profilePayload: profile("actor:B"),
      })).status, "admitted");
      assert.equal((await service.submitApplication("actor:C", {
        eventId: "event:instant", profilePayload: profile("actor:C"),
      })).status, "waitlisted");
      assert.equal((await service.submitApplication("actor:D", {
        eventId: "event:instant", profilePayload: profile("actor:D"),
      })).status, "waitlisted");
      await Promise.all([
        service.withdrawApplication("actor:A", "event:instant"),
        service.submitApplication("actor:E", {
          eventId: "event:instant", profilePayload: profile("actor:E"),
        }),
      ]);
      assert.equal((await service.getApplication("actor:C", "event:instant"))?.status, "admitted");
      const instantHeads = await operationPool.query<{ status: string }>(
        `select status from event_ops_admission_application_heads
         where workspace_id = $1 and event_id = 'event:instant'`,
        [workspaceId],
      );
      assert.equal(instantHeads.rows.filter((item) => item.status === "admitted").length, 2);

      await service.configurePolicy(managerId, {
        ...openWindow, admissionMode: "approval_required", capacity: 1,
        eventId: "event:approval", waitlistEnabled: true,
      });
      assert.equal((await service.submitApplication("actor:P1", {
        eventId: "event:approval", profilePayload: profile("actor:P1"),
      })).status, "pending_review");
      assert.equal((await service.submitApplication("actor:P2", {
        eventId: "event:approval", profilePayload: profile("actor:P2"),
      })).status, "pending_review");
      assert.equal((await service.submitApplication("actor:P3", {
        eventId: "event:approval", profilePayload: profile("actor:P3"),
      })).status, "pending_review");
      await service.configurePolicy(managerId, {
        ...openWindow, admissionMode: "instant", capacity: 1,
        eventId: "event:approval", waitlistEnabled: true,
      });
      await assert.rejects(
        service.decideApplication("actor:not-manager", {
          actorId: "actor:P1", decision: "approve", eventId: "event:approval",
        }),
        (error: unknown) => error instanceof EventAdmissionError && error.code === "FORBIDDEN",
      );
      assert.equal((await service.decideApplication(managerId, {
        actorId: "actor:P1", decision: "approve", eventId: "event:approval",
      })).status, "admitted");
      assert.equal((await service.decideApplication(managerId, {
        actorId: "actor:P2", decision: "approve", eventId: "event:approval",
      })).status, "waitlisted");
      assert.equal((await service.decideApplication(managerId, {
        actorId: "actor:P3", decision: "reject", eventId: "event:approval",
      })).status, "rejected");
      await service.withdrawApplication("actor:P1", "event:approval");
      assert.equal((await service.getApplication("actor:P2", "event:approval"))?.status, "admitted");

      await service.configurePolicy(managerId, {
        ...openWindow, admissionMode: "instant", capacity: 1,
        eventId: "event:no-waitlist", waitlistEnabled: false,
      });
      await service.submitApplication("actor:F1", {
        eventId: "event:no-waitlist", profilePayload: profile("actor:F1"),
      });
      await assert.rejects(
        service.submitApplication("actor:F2", {
          eventId: "event:no-waitlist", profilePayload: profile("actor:F2"),
        }),
        (error: unknown) => error instanceof EventAdmissionError && error.code === "CAPACITY_FULL",
      );
      await assert.rejects(
        service.configurePolicy(managerId, {
          ...openWindow, admissionMode: "instant", capacity: 0,
          eventId: "event:no-waitlist", waitlistEnabled: false,
        }),
        (error: unknown) => error instanceof EventAdmissionError && error.code === "DATA_INVALID",
      );
      await service.configurePolicy(managerId, {
        admissionMode: "instant", capacity: 1, eventId: "event:no-waitlist",
        registrationClosesAt: "2001-01-01T00:00:00.000Z",
        registrationOpensAt: "2000-01-01T00:00:00.000Z", waitlistEnabled: false,
      });
      await assert.rejects(
        service.submitApplication("actor:F3", {
          eventId: "event:no-waitlist", profilePayload: profile("actor:F3"),
        }),
        (error: unknown) => error instanceof EventAdmissionError && error.code === "WINDOW_CLOSED",
      );

      const consistency = await operationPool.query<{
        audit_count: number; head_count: number; policy_head_count: number;
        policy_version_count: number; version_count: number;
      }>(
        `select
           (select count(*)::int from event_ops_admission_policy_versions where workspace_id = $1) policy_version_count,
           (select count(*)::int from event_ops_admission_policy_heads where workspace_id = $1) policy_head_count,
           (select count(*)::int from event_ops_admission_application_versions where workspace_id = $1) version_count,
           (select count(*)::int from event_ops_admission_application_heads where workspace_id = $1) head_count,
           (select count(*)::int from event_ops_audit_log where workspace_id = $1 and aggregate_type like 'admission_%') audit_count`,
        [workspaceId],
      );
      assert.deepEqual(consistency.rows[0], {
        audit_count: 22, head_count: 9, policy_head_count: 3,
        policy_version_count: 6, version_count: 16,
      });
      const auditActions = await operationPool.query<{ action: string }>(
        `select distinct action from event_ops_audit_log
         where workspace_id = $1 and aggregate_type like 'admission_%' order by action`,
        [workspaceId],
      );
      assert.deepEqual(auditActions.rows.map((item) => item.action), [
        "admission.application.admitted", "admission.application.promoted",
        "admission.application.rejected", "admission.application.submitted",
        "admission.application.waitlisted",
        "admission.application.withdrawn", "admission.policy.configured",
      ]);
      const brokenHeads = await operationPool.query<{ count: number }>(
        `select count(*)::int count
         from event_ops_admission_application_heads head
         left join event_ops_admission_application_versions version
           on version.workspace_id = head.workspace_id and version.event_id = head.event_id
          and version.actor_id = head.actor_id and version.application_version = head.application_version
          and version.policy_version = head.policy_version
         where head.workspace_id = $1 and version.actor_id is null`,
        [workspaceId],
      );
      assert.equal(brokenHeads.rows[0]?.count, 0);
    } finally {
      await client.close();
      await adminPool.query(`drop schema if exists ${schema} cascade`);
      await adminPool.end();
    }
  },
);
