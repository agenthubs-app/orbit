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
const V1_TO_V9_CHECKSUMS = [
  "cca6a82784aec67b23a682594bbf2cd822acd6fbd3aa574174f11e25714f6914",
  "e231071fd30532d4c8a2959a32a64ae57bd46e06e98fb0b7cd690cd32e3e4241",
  "e0a84549a12835fe3a8da9991d310bafbeaac97bf7a4c46c830f376351513f0e",
  "fa787dacf55b6346bfbf887e3f14ebef8f565c10cb9d215c4c643dff651e47c3",
  "1e4c121828645434418e542849f081ef4fbb4bb10f8de9aab7118d588da7ade1",
  "859073ce53daab6ddc5d5237824f420e6a026b6749e502d381bdd1bffb98be23",
  "101a1309c3c82d674c03058e7ce35ae28357bcee3f986455952e2c0cee1dfc59",
  "4c9cf2ae167b9178f4358691b6226b7fefc15112c20c7a0ea565646049f7f4c0",
  "adee210d1bcf0f85bc63d12c943766ff29073dd248caa003b6adafc0f9765465",
] as const;

test("admission bridge v10 appends without changing v1-v9 migration checksums", () => {
  assert.deepEqual(
    EVENT_OPERATIONS_SCHEMA_MIGRATIONS.slice(0, 9).map((item) => item.checksum),
    V1_TO_V9_CHECKSUMS,
  );
  assert.equal(EVENT_OPERATIONS_SCHEMA_MIGRATIONS.at(-1)?.version, 10);
  assert.equal(
    EVENT_OPERATIONS_SCHEMA_MIGRATIONS.at(-1)?.name,
    "event-operations-v10-admission-membership-bridge",
  );
});

function profile(actorId: string) {
  const answers = {
    desiredOutcome: `Secure two qualified follow-up meetings for ${actorId}`,
    energyStyle: "Thoughtful small-group discussion with direct questions",
    experienceHighlight: "Scaled a bilingual product team across three markets",
    followUpPreference: "日本語, English, 中文; email within three business days",
    industry: "Climate technology and enterprise software",
    positioning: `Partnership lead @ ${actorId} Ventures`,
    targetAttendees: "Regional distributors and applied-AI product leaders",
    valueOffered: "Cross-border go-to-market experiments and introductions",
  };
  const adaptive = (field: "positioning" | "targetAttendees", index: number) => ({
    answer: { customText: answers[field], displayText: answers[field], selectedOptionIds: [] },
    answerSource: "participant" as const,
    answeredAt: `2026-08-04T00:0${index}:00.000Z`,
    field,
    generation: {
      method: "orbit-agent-model-adaptive" as const,
      model: "gemini-2.5-pro",
      promptVersion: 3,
      provider: "google",
    },
    question: {
      fieldLabel: { en: field, zh: field === "positioning" ? "个人定位" : "希望认识的人" },
      inputKind: "single_choice_with_custom" as const,
      language: "zh" as const,
      options: [{ id: `option:${field}`, label: "Other" }],
      prompt: `Adaptive question for ${field} and ${actorId}`,
    },
    questionId: `question:${actorId}:${field}`,
    questionSource: "ai_adaptive" as const,
    responseId: `response:${actorId}:${field}`,
    visibility: "matching_only" as const,
  });
  return {
    answers,
    displayName: `Participant ${actorId}`,
    interviewResponses: [adaptive("positioning", 1), adaptive("targetAttendees", 2)],
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
      assert.equal(migrations.rows.length, 10);
      assert.deepEqual(migrations.rows.slice(0, 9).map((item) => item.checksum), V1_TO_V9_CHECKSUMS);

      for (const eventId of [
        "event:instant", "event:approval", "event:no-waitlist",
        "event:rollback", "event:legacy-policy",
      ]) {
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
        profileEditDeadlineAt: "2099-01-01T00:00:00.000Z",
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
          eventId: "event:instant",
          profilePayload: { answers: { positioning: "Changed profile" } },
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
      const beforePromotionMembership = await operationPool.query<{ actor_id: string }>(
        `select actor_id from event_ops_membership_heads
         where workspace_id = $1 and event_id = 'event:instant'
         order by actor_id`,
        [workspaceId],
      );
      assert.deepEqual(beforePromotionMembership.rows.map((item) => item.actor_id), ["actor:A", "actor:B"]);
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
      const instantMembership = await operationPool.query<{
        actor_id: string; admission_application_version: number;
        origin: string; status: string;
      }>(
        `select head.actor_id, head.status, version.origin,
                version.admission_application_version::int as admission_application_version
         from event_ops_membership_heads head
         join event_ops_membership_versions version
           on version.workspace_id = head.workspace_id and version.event_id = head.event_id
          and version.actor_id = head.actor_id and version.membership_version = head.membership_version
         where head.workspace_id = $1 and head.event_id = 'event:instant'
         order by head.actor_id`,
        [workspaceId],
      );
      assert.deepEqual(instantMembership.rows, [
        { actor_id: "actor:A", admission_application_version: 2, origin: "admission_application", status: "cancelled" },
        { actor_id: "actor:B", admission_application_version: 1, origin: "admission_application", status: "rsvped" },
        { actor_id: "actor:C", admission_application_version: 2, origin: "admission_application", status: "rsvped" },
      ]);
      const storedProfile = await operationPool.query<{
        profile_payload: { registrationProfile: { answers: unknown; interviewResponses: unknown } };
      }>(
        `select version.profile_payload
         from event_ops_profile_heads head
         join event_ops_profile_versions version
           on version.workspace_id = head.workspace_id and version.event_id = head.event_id
          and version.participant_id = head.participant_id and version.profile_version = head.profile_version
         where head.workspace_id = $1 and head.event_id = 'event:instant'
           and head.actor_id = 'actor:B'`,
        [workspaceId],
      );
      assert.deepEqual(storedProfile.rows[0]?.profile_payload.registrationProfile.answers, profile("actor:B").answers);
      assert.deepEqual(storedProfile.rows[0]?.profile_payload.registrationProfile.interviewResponses, profile("actor:B").interviewResponses);
      const storedResponses = await operationPool.query<{ response_payload: unknown }>(
        `select response_payload from event_ops_profile_response_versions
         where workspace_id = $1 and event_id = 'event:instant'
           and participant_id = $2 order by response_id`,
        [workspaceId, `event-participant-profile:${encodeURIComponent("event:instant")}:${encodeURIComponent("actor:B")}`],
      );
      assert.deepEqual(
        storedResponses.rows.map((item) => item.response_payload),
        [...(profile("actor:B").interviewResponses ?? [])].sort((left, right) => left.responseId.localeCompare(right.responseId)),
      );

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
      assert.equal((await operationPool.query<{ count: number }>(
        `select count(*)::int count from event_ops_membership_heads
         where workspace_id = $1 and event_id = 'event:approval'`,
        [workspaceId],
      )).rows[0]?.count, 0);
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
      const approvalMembership = await operationPool.query<{ actor_id: string; status: string }>(
        `select actor_id, status from event_ops_membership_heads
         where workspace_id = $1 and event_id = 'event:approval' order by actor_id`,
        [workspaceId],
      );
      assert.deepEqual(approvalMembership.rows, [
        { actor_id: "actor:P1", status: "cancelled" },
        { actor_id: "actor:P2", status: "rsvped" },
      ]);

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
        profileEditDeadlineAt: "2000-06-01T00:00:00.000Z",
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

      await operationPool.query(
        `insert into event_ops_admission_policy_versions (
           workspace_id, event_id, policy_version, capacity, admission_mode,
           waitlist_enabled, registration_opens_at, registration_closes_at,
           profile_edit_deadline_at, updated_at
         ) values ($1, 'event:legacy-policy', 1, 1, 'instant', false,
           '2000-01-01', '2100-01-01', null, now())`,
        [workspaceId],
      );
      await operationPool.query(
        `insert into event_ops_admission_policy_heads (
           workspace_id, event_id, policy_version, updated_at
         ) values ($1, 'event:legacy-policy', 1, now())`,
        [workspaceId],
      );
      await assert.rejects(
        service.submitApplication("actor:legacy", {
          eventId: "event:legacy-policy",
          profilePayload: profile("actor:legacy"),
        }),
        (error: unknown) =>
          error instanceof EventAdmissionError && error.code === "DATA_INVALID",
      );
      assert.equal((await service.configurePolicy(managerId, {
        ...openWindow,
        admissionMode: "instant",
        capacity: 1,
        eventId: "event:legacy-policy",
        waitlistEnabled: false,
      })).policyVersion, 2);
      assert.equal((await service.submitApplication("actor:legacy", {
        eventId: "event:legacy-policy",
        profilePayload: profile("actor:legacy"),
      })).status, "admitted");

      await service.configurePolicy(managerId, {
        ...openWindow,
        admissionMode: "instant",
        capacity: 1,
        eventId: "event:rollback",
        waitlistEnabled: false,
      });
      await operationPool.query(
        `alter table event_ops_membership_versions
         add constraint event_admission_test_projection_failure
         check (actor_id <> 'actor:ROLLBACK')`,
      );
      await assert.rejects(
        service.submitApplication("actor:ROLLBACK", {
          eventId: "event:rollback",
          profilePayload: profile("actor:ROLLBACK"),
        }),
        (error: unknown) =>
          error instanceof EventAdmissionError && error.code === "DATA_INVALID",
      );
      const rollbackRows = await operationPool.query<{ applications: number; memberships: number; profiles: number }>(
        `select
           (select count(*)::int from event_ops_admission_application_versions
             where workspace_id = $1 and event_id = 'event:rollback') applications,
           (select count(*)::int from event_ops_membership_versions
             where workspace_id = $1 and event_id = 'event:rollback') memberships,
           (select count(*)::int from event_ops_profile_versions
             where workspace_id = $1 and event_id = 'event:rollback') profiles`,
        [workspaceId],
      );
      assert.deepEqual(rollbackRows.rows[0], { applications: 0, memberships: 0, profiles: 0 });

      const projectionConsistency = await operationPool.query<{
        membership_audits: number; membership_versions: number; outbox_rows: number;
      }>(
        `select
           (select count(*)::int from event_ops_membership_versions
             where workspace_id = $1 and origin = 'admission_application') membership_versions,
           (select count(*)::int from event_ops_audit_log
             where workspace_id = $1 and aggregate_type = 'event_registration') membership_audits,
           (select count(*)::int from event_ops_outbox
             where workspace_id = $1 and aggregate_type = 'event_registration') outbox_rows`,
        [workspaceId],
      );
      assert.equal(projectionConsistency.rows[0]?.membership_versions, projectionConsistency.rows[0]?.membership_audits);
      assert.equal(projectionConsistency.rows[0]?.membership_versions, projectionConsistency.rows[0]?.outbox_rows);
    } finally {
      await client.close();
      await adminPool.query(`drop schema if exists ${schema} cascade`);
      await adminPool.end();
    }
  },
);
