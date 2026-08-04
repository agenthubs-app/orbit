import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";

import { createPostgresEventOperationsRepository } from "../../features/events/event-operations/storage/postgres-repository";
import { createEventOperationsPostgresClient } from "../../features/events/event-operations/storage/postgres-client";
import { runEventOperationsMigrations } from "../../features/events/event-operations/storage/migrations";
import type { EventRegistration } from "../../features/events/registration/contract";
import {
  isCanonicalMembershipMigrationSnapshot,
  withCanonicalMembershipMigrationSnapshot,
  type CanonicalMembershipMigrationSnapshot,
} from "../../features/events/registration/canonical-migration/snapshot-runner";
import {
  profileRepairToken,
  stableProfileRepairValue,
  type ProfileContractRepairEventEvidence,
} from "../../features/events/registration/profile-contract-repair/contract";
import { buildProfileContractRepairPlan } from "../../features/events/registration/profile-contract-repair/planner";
import {
  isTrustedProfileContractRepairSource,
  readProfileContractRepairSource,
} from "../../features/events/registration/profile-contract-repair/source-reader";

const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
const realWorkspaceId = process.env.ORBIT_WORKSPACE_ID;

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function storedPayloadHash(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(stableProfileRepairValue(value)))
    .digest("hex");
}

function connectionStringForSchema(connectionString: string, schema: string): string {
  const value = new URL(connectionString);
  value.searchParams.set("options", `-c search_path=${schema}`);
  return value.toString();
}

async function readSource(connectionString: string, workspaceId: string) {
  const result = await withCanonicalMembershipMigrationSnapshot({
    connectionString,
    operation: async (snapshot) => {
      assert.equal(isCanonicalMembershipMigrationSnapshot(snapshot), true);
      const source = await readProfileContractRepairSource({ snapshot, workspaceId });
      assert.equal(isTrustedProfileContractRepairSource(source), true);
      const plan = buildProfileContractRepairPlan(source);
      return { plan, source };
    },
  });
  assert.equal(isTrustedProfileContractRepairSource(result.source), false);
  return result;
}

function assertDeepFrozen(value: unknown, seen = new WeakSet<object>()): void {
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  assert.equal(Object.isFrozen(value), true);
  if (Array.isArray(value)) {
    for (const item of value) assertDeepFrozen(item, seen);
    return;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype === Object.prototype || prototype === null) {
    for (const item of Object.values(value as Record<string, unknown>)) {
      assertDeepFrozen(item, seen);
    }
  }
}

test("fake TypeScript-cast snapshot is rejected before its first query", async () => {
  let queryCount = 0;
  const fakeSnapshot = Object.freeze({
    executor: {
      async query() {
        queryCount += 1;
        throw new Error("fake query must never execute");
      },
    },
  }) as unknown as CanonicalMembershipMigrationSnapshot;
  assert.equal(isCanonicalMembershipMigrationSnapshot(fakeSnapshot), false);
  await assert.rejects(
    () =>
      readProfileContractRepairSource({
        snapshot: fakeSnapshot,
        workspaceId: "workspace:fake",
      }),
    /runtime-attested database snapshot/u,
  );
  assert.equal(queryCount, 0);
});

test(
  "trusted empty canonical scope fails closed without producing an apply hash",
  { skip: databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured", timeout: 30_000 },
  async () => {
    assert.ok(databaseUrl);
    const schema = `profile_contract_repair_empty_${randomUUID().replaceAll("-", "")}`;
    const workspaceId = `workspace:${schema}`;
    const adminPool = new Pool({ connectionString: databaseUrl, max: 1 });
    const scopedPool = new Pool({
      connectionString: databaseUrl,
      max: 1,
      options: `-c search_path=${schema}`,
    });
    const client = createEventOperationsPostgresClient({
      connectionString: databaseUrl,
      pool: scopedPool,
    });
    try {
      await adminPool.query(`create schema ${schema}`);
      await runEventOperationsMigrations(client);
      let leakedSnapshot: CanonicalMembershipMigrationSnapshot | null = null;
      let pendingRead: ReturnType<typeof readProfileContractRepairSource> | undefined;
      await withCanonicalMembershipMigrationSnapshot({
        connectionString: connectionStringForSchema(databaseUrl, schema),
        operation: async (snapshot) => {
          leakedSnapshot = snapshot;
          pendingRead = readProfileContractRepairSource({ snapshot, workspaceId });
          void pendingRead.catch(() => undefined);
        },
      });
      assert.equal(isCanonicalMembershipMigrationSnapshot(leakedSnapshot), false);
      assert.ok(pendingRead);
      await assert.rejects(
        pendingRead,
        /snapshot is no longer active|runtime-attested database snapshot/u,
      );
      let rolledBackSource:
        | Awaited<ReturnType<typeof readProfileContractRepairSource>>
        | null = null;
      await assert.rejects(
        () =>
          withCanonicalMembershipMigrationSnapshot({
            connectionString: connectionStringForSchema(databaseUrl, schema),
            operation: async (snapshot) => {
              rolledBackSource = await readProfileContractRepairSource({
                snapshot,
                workspaceId,
              });
              assert.equal(
                isTrustedProfileContractRepairSource(rolledBackSource),
                true,
              );
              throw new Error("discard profile repair plan transaction");
            },
          }),
        /discard profile repair plan transaction/u,
      );
      assert.ok(rolledBackSource);
      assert.equal(isTrustedProfileContractRepairSource(rolledBackSource), false);
      const rolledBackPlan = buildProfileContractRepairPlan(rolledBackSource);
      assert.equal(rolledBackPlan.applyEligible, false);
      assert.equal(rolledBackPlan.applyPlanHash, null);
      const { plan, source } = await readSource(
        connectionStringForSchema(databaseUrl, schema),
        workspaceId,
      );
      assert.equal(isTrustedProfileContractRepairSource(source), false);
      assertDeepFrozen(source);
      assert.deepEqual(source.events, []);
      assert.deepEqual(source.inventory, []);
      assert.deepEqual(source.targets, []);
      assert.deepEqual(source.blockers, [
        {
          code: "REPAIR_CANONICAL_SCOPE_EMPTY",
          eventId: null,
          message: "Canonical profile repair requires at least one canonical event.",
          targetToken: null,
        },
      ]);
      assert.equal(plan.eventCount, 0);
      assert.equal(plan.targetCount, 0);
      assert.equal(plan.applyEligible, false);
      assert.equal(plan.applyPlanHash, null);
    } finally {
      await client.close();
      await adminPool.query(`drop schema if exists ${schema} cascade`);
      await adminPool.end();
    }
  },
);

function registration(eventId: string, index: number): EventRegistration {
  const userId = `actor:${eventId}:${index}`;
  const participantProfileId = `event-participant-profile:${encodeURIComponent(eventId)}:${encodeURIComponent(userId)}`;
  const late = index === 11;
  const registeredAt = late
    ? "2026-08-21T10:00:00.000Z"
    : "2026-08-01T10:00:00.000Z";
  const secondCancel = index === 9;
  const cancelled = secondCancel || index === 10;
  const desiredOutcome = `Create a measurable partnership path ${index}`;
  const adaptive = index === 0;
  const answers = adaptive
    ? { desiredOutcome }
    : {
        desiredOutcome,
        energyStyle: index % 2 === 0 ? "Structured workshop" : "Focused one-to-one",
        experienceHighlight: `Led a regional product launch ${index}`,
        industry: index % 2 === 0 ? "Industrial AI" : "Climate infrastructure",
        positioning: `Operator ${index} building cross-border systems`,
        targetAttendees: "Technical partners and strategic investors",
        valueOffered: `Pilot access and operating evidence ${index}`,
      };
  return {
    cancelledAt: cancelled ? "2026-08-22T10:00:00.000Z" : null,
    eventId,
    id: `event-registration:${encodeURIComponent(eventId)}:${encodeURIComponent(userId)}`,
    participantProfile: {
      answers,
      createdAt: registeredAt,
      displayName: `Repair Candidate ${index}`,
      eventId,
      id: participantProfileId,
      ...(adaptive
        ? {
            interviewResponses: [
              {
                answer: {
                  customText: desiredOutcome,
                  displayText: desiredOutcome,
                  selectedOptionIds: [],
                },
                answerSource: "participant" as const,
                answeredAt: registeredAt,
                field: "desiredOutcome" as const,
                generation: {
                  method: "orbit-agent-model-adaptive" as const,
                  model: "gpt-5.6",
                  promptVersion: 2,
                  provider: "openai",
                },
                question: {
                  fieldLabel: { en: "Desired outcome", zh: "期待结果" },
                  inputKind: "single_choice_with_custom" as const,
                  language: "en" as const,
                  options: [{ id: "pilot", label: "Find a pilot partner" }],
                  prompt: "What concrete outcome would make this event valuable?",
                },
                questionId: `repair-question:${index}`,
                questionSource: "ai_adaptive" as const,
                responseId: `response:repair-question:${index}`,
                visibility: "matching_only" as const,
              },
            ],
          }
        : {}),
      updatedAt: registeredAt,
      userId,
    },
    participantProfileId,
    reactivatedAt: secondCancel ? "2026-08-15T10:00:00.000Z" : null,
    registeredAt,
    sideEffects: {
      calendarUpdateExecuted: false,
      emailSent: false,
      globalProfileWriteExecuted: false,
      notificationDelivered: false,
      organizerMessageSent: false,
      refundRequested: false,
    },
    status: cancelled ? "cancelled" : "rsvped",
    updatedAt: cancelled ? "2026-08-22T10:00:00.000Z" : registeredAt,
    userId,
  };
}

test(
  "read-only snapshot plans exactly 24 canonical deletion-only targets across two events",
  { skip: databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured", timeout: 30_000 },
  async () => {
    assert.ok(databaseUrl);
    const schema = `profile_contract_repair_${randomUUID().replaceAll("-", "")}`;
    const workspaceId = `workspace:${schema}`;
    const eventIds = ["repair-event-a", "repair-event-b"] as const;
    const adminPool = new Pool({ connectionString: databaseUrl, max: 1 });
    const scopedPool = new Pool({
      connectionString: databaseUrl,
      max: 5,
      options: `-c search_path=${schema}`,
    });
    const scopedDatabaseUrl = connectionStringForSchema(databaseUrl, schema);
    const client = createEventOperationsPostgresClient({
      connectionString: databaseUrl,
      pool: scopedPool,
    });
    const repository = createPostgresEventOperationsRepository({ client, workspaceId });
    try {
      await adminPool.query(`create schema ${schema}`);
      await runEventOperationsMigrations(client);
      for (const [eventIndex, eventId] of eventIds.entries()) {
        await scopedPool.query(
          `insert into event_ops_events (
             workspace_id, event_id, organizer_actor_id, lifecycle_state,
             revision, created_at, updated_at, public_code, title, timezone,
             starts_at, ends_at, lifecycle_state_v2, source_payload, event_version
           ) values (
             $1, $2, 'organizer-repair', 'active', 1, now(), now(), $2, $2,
             'Asia/Tokyo', '2026-09-01T10:00:00.000Z',
             '2026-09-01T14:00:00.000Z', 'published', '{}'::jsonb, 1
           )`,
          [workspaceId, eventId],
        );
        await scopedPool.query(
          `insert into event_event_versions (
             workspace_id, event_id, event_version, public_code, title,
             timezone, starts_at, ends_at, lifecycle_state_v2, source_payload,
             organizer_actor_id, content_hash, created_at
           ) values (
             $1, $2, 1, $2, $2, 'Asia/Tokyo',
             '2026-09-01T10:00:00.000Z', '2026-09-01T14:00:00.000Z',
             'published', '{}'::jsonb, 'organizer-repair', $3, now()
           )`,
          [workspaceId, eventId, sha256(`repair-event-content-${eventIndex}`)],
        );
        await repository.saveConfiguration({
          checkInOpensAt: "2026-09-01T09:00:00.000Z",
          eventEndsAt: "2026-09-01T14:00:00.000Z",
          eventId,
          eventStartsAt: "2026-09-01T10:00:00.000Z",
          maxAttemptsPerTask: 3,
          organizerActorId: "organizer-repair",
          profileEditDeadlineAt: "2026-08-20T10:00:00.000Z",
          recommendationCount: 4,
          registrationCutoffAt: "2026-08-25T10:00:00.000Z",
          resultsAvailableAt: "2026-08-26T10:00:00.000Z",
          roundOneStartsAt: "2026-09-01T11:00:00.000Z",
          roundTwoStartsAt: "2026-09-01T12:00:00.000Z",
          shardSize: 6,
          tableSize: 6,
          updatedAt: "2026-08-04T10:00:00.000Z",
        });
        await repository.activateCanonicalRegistrations(
          eventId,
          Array.from({ length: 13 }, (_, index) => registration(eventId, index)),
        );
      }
      const currentProfiles = await scopedPool.query<{
        actor_id: string;
        event_id: string;
        participant_id: string;
        profile_payload: Record<string, unknown>;
        profile_version: string;
      }>(
        `select profile_version.actor_id, profile_version.event_id,
                profile_version.participant_id,
                profile_version.profile_version::text, profile_version.profile_payload
         from event_ops_profile_heads profile_head
         join event_ops_profile_versions profile_version
           on profile_version.workspace_id = profile_head.workspace_id
          and profile_version.event_id = profile_head.event_id
          and profile_version.participant_id = profile_head.participant_id
          and profile_version.profile_version = profile_head.profile_version
         where profile_head.workspace_id = $1
         order by profile_version.event_id, profile_version.participant_id`,
        [workspaceId],
      );
      const whitespace = ["", "   ", "\u3000\t"];
      for (const [index, row] of currentProfiles.rows.entries()) {
        if (row.actor_id.endsWith(":12")) continue;
        const payload = structuredClone(row.profile_payload);
        const participant = payload.participant as Record<string, unknown>;
        const registrationProfile = payload.registrationProfile as Record<string, unknown>;
        if (row.actor_id === "actor:repair-event-a:0") {
          delete participant.profileAnswers;
        } else {
          (participant.profileAnswers as Record<string, unknown>).industry =
            whitespace[index % whitespace.length];
        }
        (registrationProfile.answers as Record<string, unknown>).industry =
          whitespace[index % whitespace.length];
        await scopedPool.query(
          `update event_ops_profile_versions
           set profile_payload = $5::jsonb, profile_hash = $6
           where workspace_id = $1 and event_id = $2 and participant_id = $3
             and profile_version = $4`,
          [
            workspaceId,
            row.event_id,
            row.participant_id,
            Number(row.profile_version),
            JSON.stringify(payload),
            storedPayloadHash(payload),
          ],
        );
      }

      const { plan, source } = await readSource(scopedDatabaseUrl, workspaceId);
      assert.equal(isTrustedProfileContractRepairSource(source), false);
      assertDeepFrozen(source);
      assert.deepEqual(source.blockers, []);
      assert.equal(source.events.length, 2);
      assert.equal(source.inventory.length, 26);
      assert.ok(source.events.every((event) => event.inventoryCount === 13));
      assert.equal(source.targets.length, 24);
      assert.equal(
        source.targets.filter((target) => target.deletionPaths.length === 1).length,
        1,
        "an absent legacy participant mirror stays absent and only the registration path is deleted",
      );
      assert.equal(
        source.targets.filter((target) => target.deletionPaths.length === 2).length,
        23,
      );
      assert.equal(plan.applyEligible, true);
      assert.match(plan.applyPlanHash ?? "", /^[a-f0-9]{64}$/u);
      assert.equal(plan.eventCount, 2);
      assert.equal(plan.targetCount, 24);
      for (const forged of [
        structuredClone(source),
        { ...source },
        new Proxy(source, {}),
      ]) {
        const rejected = buildProfileContractRepairPlan(forged);
        assert.equal(rejected.applyEligible, false);
        assert.equal(rejected.applyPlanHash, null);
        assert.equal(rejected.eventCount, 0);
      }
      const planBeforeMutationAttempt = plan.applyPlanHash;
      assert.throws(() => {
        (source.events as ProfileContractRepairEventEvidence[]).push(source.events[0]!);
      }, TypeError);
      const frozenInventoryCount = source.events[0]!.inventoryCount;
      try {
        (source.events[0] as { inventoryCount: number }).inventoryCount = 999;
      } catch (error) {
        assert.ok(error instanceof TypeError);
      }
      assert.equal(source.events[0]!.inventoryCount, frozenInventoryCount);
      assert.throws(() => {
        (source.inventory[0]!.deletionPaths as string[]).push(
          "registrationProfile.answers.industry",
        );
      }, TypeError);
      const expiredSourcePlan = buildProfileContractRepairPlan(source);
      assert.equal(expiredSourcePlan.applyEligible, false);
      assert.equal(expiredSourcePlan.applyPlanHash, null);
      assert.notEqual(expiredSourcePlan.applyPlanHash, planBeforeMutationAttempt);
      const serialized = JSON.stringify(plan);
      for (const secret of [
        "actor:repair-event-a:0",
        "event-participant-profile:repair-event-a",
        "Create a measurable partnership path",
        "Repair Candidate",
      ]) {
        assert.equal(serialized.includes(secret), false);
      }
      const adaptiveToken = profileRepairToken(
        "profile-target",
        `${workspaceId}\0repair-event-a\0event-participant-profile:repair-event-a:actor%3Arepair-event-a%3A0`,
      );
      const plainToken = profileRepairToken(
        "profile-target",
        `${workspaceId}\0repair-event-a\0event-participant-profile:repair-event-a:actor%3Arepair-event-a%3A1`,
      );
      assert.notEqual(
        plan.targets.find((target) => target.targetToken === adaptiveToken)?.responsesHash,
        plan.targets.find((target) => target.targetToken === plainToken)?.responsesHash,
      );
      const cancelledToken = profileRepairToken(
        "profile-target",
        `${workspaceId}\0repair-event-a\0event-participant-profile:repair-event-a:actor%3Arepair-event-a%3A10`,
      );
      assert.notEqual(
        plan.targets.find((target) => target.targetToken === cancelledToken)?.lifecycleHash,
        plan.targets.find((target) => target.targetToken === plainToken)?.lifecycleHash,
      );
      const replay = (await readSource(scopedDatabaseUrl, workspaceId)).plan;
      assert.equal(replay.applyPlanHash, plan.applyPlanHash);

      const unchangedRow = currentProfiles.rows.find(
        (row) => row.actor_id === "actor:repair-event-a:12",
      )!;
      const changedUnchangedPayload = structuredClone(unchangedRow.profile_payload);
      const changedUnchangedParticipant = changedUnchangedPayload.participant as Record<
        string,
        unknown
      >;
      const changedUnchangedRegistration =
        changedUnchangedPayload.registrationProfile as Record<string, unknown>;
      const changedOutcome = "A distinct but still canonical operating partnership outcome";
      (changedUnchangedParticipant.profileAnswers as Record<string, unknown>).desiredOutcome =
        changedOutcome;
      (changedUnchangedRegistration.answers as Record<string, unknown>).desiredOutcome =
        changedOutcome;
      await scopedPool.query(
        `update event_ops_profile_versions
         set profile_payload = $5::jsonb, profile_hash = $6
         where workspace_id = $1 and event_id = $2 and participant_id = $3
           and profile_version = $4`,
        [
          workspaceId,
          unchangedRow.event_id,
          unchangedRow.participant_id,
          Number(unchangedRow.profile_version),
          JSON.stringify(changedUnchangedPayload),
          storedPayloadHash(changedUnchangedPayload),
        ],
      );
      const unchangedDrift = (await readSource(scopedDatabaseUrl, workspaceId)).plan;
      assert.equal(unchangedDrift.applyEligible, true);
      assert.equal(unchangedDrift.targetCount, 24);
      assert.notEqual(unchangedDrift.applyPlanHash, plan.applyPlanHash);
      assert.notEqual(
        unchangedDrift.events.find((event) => event.eventId === "repair-event-a")
          ?.inventoryHash,
        plan.events.find((event) => event.eventId === "repair-event-a")?.inventoryHash,
        "a legal non-candidate payload drift changes the full canonical inventory hash",
      );
      await scopedPool.query(
        `update event_ops_profile_versions
         set profile_payload = $5::jsonb, profile_hash = $6
         where workspace_id = $1 and event_id = $2 and participant_id = $3
           and profile_version = $4`,
        [
          workspaceId,
          unchangedRow.event_id,
          unchangedRow.participant_id,
          Number(unchangedRow.profile_version),
          JSON.stringify(unchangedRow.profile_payload),
          storedPayloadHash(unchangedRow.profile_payload),
        ],
      );

      const secondCancelToken = profileRepairToken(
        "profile-target",
        `${workspaceId}\0repair-event-a\0event-participant-profile:repair-event-a:actor%3Arepair-event-a%3A9`,
      );
      const secondCancelState = await scopedPool.query<{
        cancelled_at: Date;
        reactivated_at: Date;
        registered_at: Date;
        status: string;
      }>(
        `select membership_version.status, membership_version.registered_at,
                membership_version.cancelled_at, membership_version.reactivated_at
         from event_ops_membership_heads membership_head
         join event_ops_membership_versions membership_version
           on membership_version.workspace_id = membership_head.workspace_id
          and membership_version.event_id = membership_head.event_id
          and membership_version.actor_id = membership_head.actor_id
          and membership_version.membership_version = membership_head.membership_version
         where membership_head.workspace_id = $1
           and membership_head.event_id = 'repair-event-a'
           and membership_head.actor_id = 'actor:repair-event-a:9'`,
        [workspaceId],
      );
      assert.equal(secondCancelState.rows[0]?.status, "cancelled");
      assert.equal(
        secondCancelState.rows[0]?.registered_at.toISOString(),
        "2026-08-01T10:00:00.000Z",
      );
      assert.equal(
        secondCancelState.rows[0]?.reactivated_at.toISOString(),
        "2026-08-15T10:00:00.000Z",
      );
      assert.equal(
        secondCancelState.rows[0]?.cancelled_at.toISOString(),
        "2026-08-22T10:00:00.000Z",
      );
      await scopedPool.query(
        `update event_ops_membership_versions membership_version
         set cancelled_at = '2026-08-21T10:00:00.000Z'
         from event_ops_membership_heads membership_head
         where membership_version.workspace_id = membership_head.workspace_id
           and membership_version.event_id = membership_head.event_id
           and membership_version.actor_id = membership_head.actor_id
           and membership_version.membership_version = membership_head.membership_version
           and membership_head.workspace_id = $1
           and membership_head.event_id = 'repair-event-a'
           and membership_head.actor_id = 'actor:repair-event-a:9'`,
        [workspaceId],
      );
      const lifecycleDrift = (await readSource(scopedDatabaseUrl, workspaceId)).plan;
      assert.equal(lifecycleDrift.applyEligible, true);
      assert.notEqual(lifecycleDrift.applyPlanHash, plan.applyPlanHash);
      assert.notEqual(
        lifecycleDrift.targets.find(
          (target) => target.targetToken === secondCancelToken,
        )?.lifecycleHash,
        plan.targets.find((target) => target.targetToken === secondCancelToken)
          ?.lifecycleHash,
      );
      const preservedDrift = await scopedPool.query<{ cancelled_at: Date }>(
        `select membership_version.cancelled_at
         from event_ops_membership_heads membership_head
         join event_ops_membership_versions membership_version
           on membership_version.workspace_id = membership_head.workspace_id
          and membership_version.event_id = membership_head.event_id
          and membership_version.actor_id = membership_head.actor_id
          and membership_version.membership_version = membership_head.membership_version
         where membership_head.workspace_id = $1
           and membership_head.event_id = 'repair-event-a'
           and membership_head.actor_id = 'actor:repair-event-a:9'`,
        [workspaceId],
      );
      assert.equal(
        preservedDrift.rows[0]?.cancelled_at.toISOString(),
        "2026-08-21T10:00:00.000Z",
        "the reader observes but never rewrites second-cancel lifecycle timestamps",
      );
      await scopedPool.query(
        `update event_ops_membership_versions membership_version
         set cancelled_at = '2026-08-22T10:00:00.000Z'
         from event_ops_membership_heads membership_head
         where membership_version.workspace_id = membership_head.workspace_id
           and membership_version.event_id = membership_head.event_id
           and membership_version.actor_id = membership_head.actor_id
           and membership_version.membership_version = membership_head.membership_version
           and membership_head.workspace_id = $1
           and membership_head.event_id = 'repair-event-a'
           and membership_head.actor_id = 'actor:repair-event-a:9'`,
        [workspaceId],
      );

      await scopedPool.query(
        `update event_ops_configurations
         set profile_edit_deadline_at = '2026-08-19T10:00:00.000Z'
         where workspace_id = $1 and event_id = 'repair-event-a'
           and configuration_version = 1`,
        [workspaceId],
      );
      const deadlineDrift = (await readSource(scopedDatabaseUrl, workspaceId)).plan;
      assert.equal(deadlineDrift.applyEligible, true);
      assert.notEqual(deadlineDrift.applyPlanHash, plan.applyPlanHash);

      await scopedPool.query(
        `update event_ops_audit_log
         set after_payload = after_payload - 'profileDeadlineReason'
         where workspace_id = $1 and event_id = 'repair-event-b'
           and action = 'registration_migration_activated'`,
        [workspaceId],
      );
      const { plan: blocked, source: blockedSource } = await readSource(
        scopedDatabaseUrl,
        workspaceId,
      );
      assert.equal(isTrustedProfileContractRepairSource(blockedSource), false);
      assert.equal(blocked.applyEligible, false);
      assert.equal(blocked.applyPlanHash, null);
      assert.ok(
        blocked.blockers.some((value) => value.code === "REPAIR_EVENT_SOURCE_INVALID"),
      );

      await scopedPool.query(
        `insert into event_ops_events (
           workspace_id, event_id, organizer_actor_id, lifecycle_state,
           revision, created_at, updated_at, public_code, title, timezone,
           starts_at, ends_at, lifecycle_state_v2, source_payload, event_version
         ) values (
           $1, 'legacy-audit-event', 'organizer-repair', 'active', 1, now(), now(),
           'legacy-audit-event', 'Legacy audit event', 'Asia/Tokyo',
           '2026-09-01T10:00:00.000Z', '2026-09-01T14:00:00.000Z',
           'published', '{}'::jsonb, 1
         )`,
        [workspaceId],
      );
      await scopedPool.query(
        `insert into event_ops_audit_log (
           workspace_id, audit_id, event_id, actor_id, action,
           aggregate_type, aggregate_id, before_payload, after_payload,
           evidence_ids, occurred_at
         ) values
           ($1, 'audit:legacy-orphan', 'legacy-audit-event', 'operator',
            'registration_migration_activated', 'event', 'legacy-audit-event',
            null, '{}'::jsonb, '{}', now()),
           ($1, 'audit:unknown-orphan', 'missing-audit-event', 'operator',
            'registration_migration_activated', 'event', 'missing-audit-event',
            null, '{}'::jsonb, '{}', now())`,
        [workspaceId],
      );
      const { source: orphanAudits } = await readSource(
        scopedDatabaseUrl,
        workspaceId,
      );
      assert.equal(
        orphanAudits.blockers.filter(
          (value) => value.code === "REPAIR_ACTIVATION_AUDIT_ORPHAN",
        ).length,
        2,
        "legacy/noncanonical and unknown activation audits are both fail-closed",
      );

      const invalidMirrorRow = currentProfiles.rows[1]!;
      const invalidMirrorPayload = structuredClone(invalidMirrorRow.profile_payload);
      const invalidParticipant = invalidMirrorPayload.participant as Record<string, unknown>;
      const invalidRegistration = invalidMirrorPayload.registrationProfile as Record<
        string,
        unknown
      >;
      (invalidParticipant.profileAnswers as Record<string, unknown>).industry = 42;
      (invalidRegistration.answers as Record<string, unknown>).industry = "Robotics";
      await scopedPool.query(
        `update event_ops_profile_versions
         set profile_payload = $5::jsonb, profile_hash = $6
         where workspace_id = $1 and event_id = $2 and participant_id = $3
           and profile_version = $4`,
        [
          workspaceId,
          invalidMirrorRow.event_id,
          invalidMirrorRow.participant_id,
          Number(invalidMirrorRow.profile_version),
          JSON.stringify(invalidMirrorPayload),
          storedPayloadHash(invalidMirrorPayload),
        ],
      );
      const {
        plan: invalidPresentMirror,
        source: invalidPresentMirrorSource,
      } = await readSource(
        scopedDatabaseUrl,
        workspaceId,
      );
      assert.equal(
        isTrustedProfileContractRepairSource(invalidPresentMirrorSource),
        false,
      );
      assert.equal(invalidPresentMirror.applyEligible, false);
      assert.ok(
        invalidPresentMirror.blockers.some(
          (value) => value.code === "ANSWER_VALUE_INVALID",
        ),
        "a present invalid mirror blocks even when its values contain no blank candidate",
      );
    } finally {
      await client.close();
      await adminPool.query(`drop schema if exists ${schema} cascade`);
      await adminPool.end();
    }
  },
);

test(
  "real main profile repair inventory matches the append-only repair ledger state",
  {
    skip:
      databaseUrl && realWorkspaceId
        ? false
        : "ORBIT_EVENT_DATABASE_URL/ORBIT_WORKSPACE_ID is not configured",
    timeout: 30_000,
  },
  async () => {
    assert.ok(databaseUrl);
    assert.ok(realWorkspaceId);
    const { plan, source } = await readSource(databaseUrl, realWorkspaceId);
    assert.equal(isTrustedProfileContractRepairSource(source), false);
    assertDeepFrozen(source);
    assert.deepEqual(source.blockers, []);
    assert.ok(source.inventory.length > 24);
    assert.equal(
      source.events.reduce((sum, event) => sum + event.inventoryCount, 0),
      source.inventory.length,
    );
    assert.equal(plan.eventCount, 2);
    const pool = new Pool({ connectionString: databaseUrl, max: 1 });
    try {
      const presence = await pool.query<{ table_name: string | null }>(
        "select to_regclass('event_ops_data_repair_runs')::text as table_name",
      );
      const applied = presence.rows[0]?.table_name
        ? Boolean((await pool.query<{ applied: boolean }>(`select exists (
            select 1 from event_ops_data_repair_runs
             where workspace_id=$1 and repair_type='canonical_profile_empty_answer_v1'
          ) as applied`, [realWorkspaceId])).rows[0]?.applied)
        : false;
      if (applied) {
        assert.equal(plan.targetCount, 0);
        assert.equal(plan.applyEligible, true);
        assert.match(plan.applyPlanHash ?? "", /^[a-f0-9]{64}$/u);
      } else {
        assert.equal(plan.targetCount, 24);
        assert.equal(plan.applyEligible, true);
        assert.match(plan.applyPlanHash ?? "", /^[a-f0-9]{64}$/u);
      }
    } finally {
      await pool.end();
    }
  },
);
