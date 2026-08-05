import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";

import {
  applyEventCoreBackfillPlan,
  buildEventCoreBackfillPlan,
} from "../../features/events/core/backfill";
import { EventCapabilityDeniedError, requireEventCapability } from "../../features/events/event-access/guard";
import { createEventAccessService } from "../../features/events/event-access/service";
import { createPostgresEventAccessRepository } from "../../features/events/event-access/storage/postgres-repository";
import { EventAdmissionError } from "../../features/events/admission/contract";
import { createEventAdmissionService } from "../../features/events/admission/service";
import { createPostgresEventAdmissionRepository } from "../../features/events/admission/storage/postgres-repository";
import { runEventOperationsMigrations } from "../../features/events/event-operations/storage/migrations";
import { createEventOperationsPostgresClient } from "../../features/events/event-operations/storage/postgres-client";
import type { EventParticipantProfileAnswers, EventParticipantProfileField } from "../../features/events/registration/contract";
import { loadLocalEnv } from "../../scripts/load-local-env";

loadLocalEnv();
const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;

function schemaUrl(value: string, searchPath: string): string {
  const url = new URL(value);
  url.searchParams.set("options", `-c search_path=${searchPath}`);
  return url.toString();
}

async function insertOperationsConfiguration(input: {
  eventId: string;
  pool: Pool;
  profileEditDeadlineAt: string;
  registrationCutoffAt: string;
  workspaceId: string;
}): Promise<void> {
  const updatedAt = "2099-01-01T00:00:00.000Z";
  await input.pool.query(
    `insert into event_ops_configurations (
       workspace_id, event_id, configuration_version,
       check_in_opens_at, event_starts_at, event_ends_at,
       profile_edit_deadline_at, registration_cutoff_at,
       results_available_at, round_one_starts_at, round_two_starts_at,
       recommendation_count, table_size, shard_size,
       max_attempts_per_task, created_at, updated_at
     ) values (
       $1, $2, 1, '2027-09-01T08:00:00.000Z',
       '2027-09-01T09:00:00.000Z', '2101-01-05T00:00:00.000Z',
       $3, $4, '2100-01-02T09:30:00.000Z',
       '2100-01-03T10:00:00.000Z', '2100-01-04T11:00:00.000Z',
       3, 6, 24, 2, $5, $5
     )`,
    [
      input.workspaceId,
      input.eventId,
      input.profileEditDeadlineAt,
      input.registrationCutoffAt,
      updatedAt,
    ],
  );
  await input.pool.query(
    `insert into event_ops_configuration_heads (
       workspace_id, event_id, configuration_version, revision, updated_at
     ) values ($1, $2, 1, 1, $3)`,
    [input.workspaceId, input.eventId, updatedAt],
  );
}

function profile(actorId: string) {
  const answers: Required<EventParticipantProfileAnswers> = {
    desiredOutcome: `为 ${actorId} 找到两位可以共同验证日本市场渠道假设的长期伙伴`,
    energyStyle: "偏好先听清背景，再用具体案例小组深聊；不喜欢泛泛交换名片",
    experienceHighlight: "带领中日双语团队把工业 AI 产品从试点推进到三家制造集团正式采购",
    followUpPreference: "会后 48 小时内用邮件同步纪要，下一周安排 30 分钟线上复盘",
    industry: "工业人工智能、气候科技与跨境企业软件",
    positioning: `负责跨境增长与生态合作的产品负责人（${actorId}）`,
    targetAttendees: "在日本拥有制造业渠道、正在落地边缘 AI 或企业减碳项目的负责人",
    valueOffered: "可分享中日市场进入实验、企业采购决策链经验与相关产业伙伴引荐",
  };
  const adaptive = (field: EventParticipantProfileField, index: number) => ({
    answer: {
      customText: answers[field],
      displayText: answers[field],
      selectedOptionIds: [`option:${field}:custom`],
    },
    answerSource: "participant" as const,
    answeredAt: `2026-08-04T00:${String(index).padStart(2, "0")}:00.000Z`,
    field,
    generation: {
      method: "orbit-agent-model-adaptive" as const,
      model: "gemini-2.5-pro",
      promptVersion: 3,
      provider: "google",
    },
    question: {
      fieldLabel: { en: field, zh: `画像问题 ${index}` },
      inputKind: "single_choice_with_custom" as const,
      language: "zh" as const,
      options: [{ id: `option:${field}:custom`, label: "结合经历补充" }],
      prompt: `请结合一个真实项目，说明 ${answers[field]}`,
    },
    questionId: `question:${actorId}:${field}`,
    questionSource: "ai_adaptive" as const,
    responseId: `response:${actorId}:${field}`,
    visibility: index % 2 === 0 ? "event_attendees" as const : "matching_only" as const,
  });
  return {
    answers,
    displayName: `${actorId} · 跨境产品负责人`,
    interviewResponses: [
      adaptive("positioning", 1),
      adaptive("targetAttendees", 2),
      adaptive("valueOffered", 3),
      adaptive("desiredOutcome", 4),
    ],
  };
}

test(
  "reviewer workspace uses canonical Event Core and event-scoped access for complete PG review decisions",
  {
    skip: databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured",
    timeout: 120_000,
  },
  async () => {
    assert.ok(databaseUrl);
    const suffix = randomUUID().replaceAll("-", "");
    const schema = `event_admission_review_${suffix}`;
    const workspaceId = `workspace:admission-review:${suffix}`;
    const ownerId = "actor:owner:admission-review";
    const reviewerA = "actor:reviewer:a";
    const reviewerB = "actor:reviewer:b";
    const operator = "actor:operator:no-review";
    const eventA = "event:canonical:review-a";
    const eventB = "event:canonical:review-b";
    const admin = new Pool({ connectionString: databaseUrl, max: 1 });
    const connectionString = schemaUrl(databaseUrl, schema);
    const pool = new Pool({ connectionString, max: 10 });
    const client = createEventOperationsPostgresClient({
      connectionString,
      max: 10,
      pool,
    });

    try {
      await admin.query(`create schema ${schema}`);
      await runEventOperationsMigrations(client);
      const plan = buildEventCoreBackfillPlan(
        [eventA, eventB].map((eventId, index) => ({
          description: `完整 canonical 报名审核测试活动 ${index + 1}`,
          endsAt: `2027-09-${String(index + 11).padStart(2, "0")}T12:00:00.000Z`,
          eventId,
          lifecycleState: "published" as const,
          organizerActorId: ownerId,
          publicCode: `REVIEW${index + 1}`,
          source: "admission-review-test-fixture",
          sourcePayload: { fixture: "diverse-admission-review", sequence: index + 1 },
          startsAt: `2027-09-${String(index + 11).padStart(2, "0")}T09:00:00.000Z`,
          timezone: "Asia/Tokyo",
          title: `跨境产业合作审核专场 ${index + 1}`,
          venue: index === 0 ? "东京丸之内会议中心" : "横滨创新港",
        })),
        { migrationId: `admission-review:${suffix}`, resolutions: [], schemaVersion: 1 },
      );
      await applyEventCoreBackfillPlan({ client, plan, workspaceId });

      const access = createEventAccessService(
        createPostgresEventAccessRepository({ client, workspaceId }),
      );
      await access.grant({
        actingActorId: ownerId,
        eventId: eventA,
        expectedRevision: 0,
        reason: "负责本活动报名画像的逐项审核",
        role: "reviewer",
        subjectActorId: reviewerA,
      });
      await access.grant({
        actingActorId: ownerId,
        eventId: eventA,
        expectedRevision: 0,
        reason: "与第一位审核员并行处理真实申请",
        role: "reviewer",
        subjectActorId: reviewerB,
      });
      await access.grant({
        actingActorId: ownerId,
        eventId: eventA,
        expectedRevision: 0,
        reason: "只负责现场运营，不应看到报名画像",
        role: "operations",
        subjectActorId: operator,
      });

      const admission = createEventAdmissionService({
        repository: createPostgresEventAdmissionRepository({ client, workspaceId }),
        requireCapability: (actorId, eventId, capability) =>
          requireEventCapability({ actorId, capability, eventId, service: access }),
      });
      const openPolicy = {
        admissionMode: "approval_required" as const,
        capacity: 10,
        profileEditDeadlineAt: "2099-06-01T00:00:00.000Z",
        registrationClosesAt: "2100-01-01T00:00:00.000Z",
        registrationOpensAt: "2000-01-01T00:00:00.000Z",
        waitlistEnabled: true,
      };
      for (const eventId of [eventA, eventB]) {
        await insertOperationsConfiguration({
          eventId,
          pool,
          profileEditDeadlineAt: openPolicy.profileEditDeadlineAt,
          registrationCutoffAt: openPolicy.registrationClosesAt,
          workspaceId,
        });
      }
      await admission.configurePolicy(ownerId, { ...openPolicy, eventId: eventA });
      await admission.configurePolicy(ownerId, { ...openPolicy, eventId: eventB });

      for (const applicant of ["actor:founder:climate", "actor:buyer:manufacturing", "actor:investor:deeptech"]) {
        const submitted = await admission.submitApplication(applicant, {
          eventId: eventA,
          profilePayload: profile(applicant),
        });
        assert.equal(submitted.status, "pending_review");
      }
      await admission.submitApplication("actor:event-b:applicant", {
        eventId: eventB,
        profilePayload: profile("actor:event-b:applicant"),
      });

      const firstPage = await admission.listApplications(reviewerA, {
        bucket: "pending",
        cursor: null,
        eventId: eventA,
        limit: 2,
      });
      assert.equal(firstPage.total, 3);
      assert.equal(firstPage.items.length, 2);
      assert.ok(firstPage.nextCursor);
      const secondPage = await admission.listApplications(reviewerA, {
        bucket: "pending",
        cursor: firstPage.nextCursor,
        eventId: eventA,
        limit: 2,
      });
      assert.equal(secondPage.items.length, 1);
      assert.equal(new Set([...firstPage.items, ...secondPage.items].map((item) => item.actorId)).size, 3);

      const detail = await admission.getApplicationForReview(
        reviewerA,
        eventA,
        "actor:founder:climate",
      );
      assert.deepEqual(detail?.profilePayload, profile("actor:founder:climate"));
      assert.equal(Object.keys(detail?.profilePayload.answers ?? {}).length, 8);
      assert.equal(detail?.profilePayload.interviewResponses?.length, 4);

      await assert.rejects(
        admission.listApplications(operator, {
          bucket: "pending", cursor: null, eventId: eventA, limit: 30,
        }),
        EventCapabilityDeniedError,
      );
      await assert.rejects(
        admission.listApplications(reviewerA, {
          bucket: "pending", cursor: null, eventId: eventB, limit: 30,
        }),
        EventCapabilityDeniedError,
      );
      await assert.rejects(
        admission.decideApplication(reviewerA, {
          actorId: "actor:event-b:applicant",
          decision: "approve",
          eventId: eventB,
          expectedApplicationVersion: 1,
        }),
        EventCapabilityDeniedError,
      );

      const firstDecision = await admission.decideApplication(reviewerA, {
        actorId: "actor:founder:climate",
        decision: "approve",
        eventId: eventA,
        expectedApplicationVersion: 1,
      });
      const idempotentRetry = await admission.decideApplication(reviewerA, {
        actorId: "actor:founder:climate",
        decision: "approve",
        eventId: eventA,
        expectedApplicationVersion: 1,
      });
      assert.deepEqual(idempotentRetry, firstDecision);
      assert.equal(firstDecision.applicationVersion, 2);

      const race = await Promise.allSettled([
        admission.decideApplication(reviewerA, {
          actorId: "actor:buyer:manufacturing",
          decision: "approve",
          eventId: eventA,
          expectedApplicationVersion: 1,
        }),
        admission.decideApplication(reviewerB, {
          actorId: "actor:buyer:manufacturing",
          decision: "reject",
          eventId: eventA,
          expectedApplicationVersion: 1,
        }),
      ]);
      assert.equal(race.filter((result) => result.status === "fulfilled").length, 1);
      assert.equal(race.filter((result) => result.status === "rejected").length, 1);
      const rejectedRace = race.find((result) => result.status === "rejected");
      assert.ok(rejectedRace?.status === "rejected");
      assert.ok(rejectedRace.reason instanceof EventAdmissionError);
      assert.equal(rejectedRace.reason.code, "INVALID_TRANSITION");

      const ownerDecision = await admission.decideApplication(ownerId, {
        actorId: "actor:investor:deeptech",
        decision: "reject",
        eventId: eventA,
        expectedApplicationVersion: 1,
      });
      assert.equal(ownerDecision.status, "rejected");

      const processed = await admission.listApplications(ownerId, {
        bucket: "processed",
        cursor: null,
        eventId: eventA,
        limit: 30,
      });
      assert.equal(processed.total, 3);
      assert.equal(processed.items.every((item) => item.status !== "pending_review"), true);
      assert.equal((await admission.listApplications(ownerId, {
        bucket: "pending", cursor: null, eventId: eventA, limit: 30,
      })).total, 0);

      const evidence = await pool.query<{ audits: number; versions: number }>(
        `select
           (select count(*)::int from event_ops_admission_application_versions
             where workspace_id=$1 and event_id=$2 and actor_id='actor:founder:climate') versions,
           (select count(*)::int from event_ops_audit_log
             where workspace_id=$1 and event_id=$2
               and aggregate_type='admission_application'
               and aggregate_id=$2 || ':actor:founder:climate'
               and action='admission.application.admitted') audits`,
        [workspaceId, eventA],
      );
      assert.deepEqual(evidence.rows[0], { audits: 1, versions: 2 });
    } finally {
      await client.close().catch(() => undefined);
      await admin.query(`drop schema if exists ${schema} cascade`);
      await admin.end();
    }
  },
);
