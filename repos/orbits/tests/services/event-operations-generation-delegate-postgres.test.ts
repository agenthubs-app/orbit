import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";

import { createEventAccessService } from "../../features/events/event-access/service";
import { createPostgresEventAccessRepository } from "../../features/events/event-access/storage/postgres-repository";
import type {
  EventOperationsAiProvider,
  EventOperationsConfiguration,
  EventOperationsPublishedResult,
} from "../../features/events/event-operations/contract";
import { createEventOperationsEngine } from "../../features/events/event-operations/engine";
import { runEventOperationsMigrations } from "../../features/events/event-operations/storage/migrations";
import { createEventOperationsPostgresClient } from "../../features/events/event-operations/storage/postgres-client";
import { createPostgresEventOperationsRepository } from "../../features/events/event-operations/storage/postgres-repository";
import type { EventRegistration } from "../../features/events/registration/contract";
import { loadLocalEnv } from "../../scripts/load-local-env";

loadLocalEnv();
const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;

const ownerId = "actor:generation-owner";
const delegateId = "actor:generation-operations";

function at(base: number, minutes: number): string {
  return new Date(base + minutes * 60_000).toISOString();
}

function configuration(eventId: string, base: number): EventOperationsConfiguration {
  return {
    checkInOpensAt: at(base, -20),
    eventEndsAt: at(base, 180),
    eventId,
    eventStartsAt: at(base, 20),
    maxAttemptsPerTask: 2,
    organizerActorId: ownerId,
    profileEditDeadlineAt: at(base, -10),
    recommendationCount: 1,
    registrationCutoffAt: at(base, -5),
    resultsAvailableAt: at(base, 10),
    roundOneStartsAt: at(base, 30),
    roundTwoStartsAt: at(base, 90),
    shardSize: 2,
    tableSize: 4,
    updatedAt: at(base, 0),
  };
}

function registration(
  eventId: string,
  actorId: string,
  displayName: string,
  industry: string,
  registeredAt: string,
): EventRegistration {
  const participantProfileId = `participant:${eventId}:${actorId}`;
  return {
    cancelledAt: null,
    eventId,
    id: `registration:${eventId}:${actorId}`,
    participantProfile: {
      answers: {
        desiredOutcome: `Meet a thoughtful ${industry} collaborator`,
        industry,
        positioning: `${displayName} builds practical ${industry} systems`,
        valueOffered: `A concrete ${industry} perspective`,
      },
      createdAt: registeredAt,
      displayName,
      eventId,
      id: participantProfileId,
      updatedAt: registeredAt,
      userId: actorId,
    },
    participantProfileId,
    reactivatedAt: null,
    registeredAt,
    sideEffects: {
      calendarUpdateExecuted: false,
      emailSent: false,
      globalProfileWriteExecuted: false,
      notificationDelivered: false,
      organizerMessageSent: false,
      refundRequested: false,
    },
    status: "rsvped",
    updatedAt: registeredAt,
    userId: actorId,
  };
}

const unusedAiProvider: EventOperationsAiProvider = {
  async generateGroupingFeatures() {
    throw new Error("AI is not used by this authorization integration test.");
  },
  async generateRecommendations() {
    throw new Error("AI is not used by this authorization integration test.");
  },
  async generateTableContent() {
    throw new Error("AI is not used by this authorization integration test.");
  },
};

async function counts(pool: Pool, workspaceId: string, eventId: string) {
  return (
    await pool.query<{
      audits: string;
      generations: string;
      publications: string;
      tasks: string;
    }>(
      `select
        (select count(*)::text from event_ops_generations
          where workspace_id=$1 and event_id=$2) as generations,
        (select count(*)::text from event_ops_tasks task join event_ops_generations generation
          on generation.workspace_id=task.workspace_id and generation.generation_id=task.generation_id
          where task.workspace_id=$1 and generation.event_id=$2) as tasks,
        (select count(*)::text from event_ops_publications
          where workspace_id=$1 and event_id=$2) as publications,
        (select count(*)::text from event_ops_audit_log
          where workspace_id=$1 and event_id=$2) as audits`,
      [workspaceId, eventId],
    )
  ).rows[0]!;
}

test(
  "PostgreSQL operations delegate keeps Event Core ownership while generation mutations recheck assignment state",
  { skip: databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured", timeout: 120_000 },
  async () => {
    assert.ok(databaseUrl);
    const schema = `event_ops_generation_delegate_${randomUUID().replaceAll("-", "")}`;
    const admin = new Pool({ connectionString: databaseUrl, max: 1 });
    const pool = new Pool({
      connectionString: databaseUrl,
      max: 6,
      options: `-c search_path=${schema}`,
    });
    const client = createEventOperationsPostgresClient({
      connectionString: databaseUrl,
      pool,
    });
    const workspaceId = "workspace:generation-delegate";
    const eventId = "event:generation-delegate";
    const repository = createPostgresEventOperationsRepository({ client, workspaceId });
    const eventAccess = createEventAccessService(
      createPostgresEventAccessRepository({ client, workspaceId }),
    );
    const engine = createEventOperationsEngine({
      aiProvider: unusedAiProvider,
      repository,
      token: () => "unused",
    });

    try {
      await admin.query(`create schema ${schema}`);
      await runEventOperationsMigrations(client);
      const now = await pool.query<{ value: Date }>("select statement_timestamp() as value");
      const base = now.rows[0]!.value.getTime();
      const config = configuration(eventId, base);
      await repository.saveConfiguration(config);
      await pool.query(
        `update event_ops_events
            set lifecycle_state_v2 = 'published'
          where workspace_id = $1 and event_id = $2`,
        [workspaceId, eventId],
      );
      await repository.activateCanonicalRegistrations(eventId, [
        registration(eventId, "actor:mei", "Mei Lin", "climate finance", at(base, -90)),
        registration(eventId, "actor:akio", "秋山 明", "robotics", at(base, -90)),
        registration(eventId, "actor:elodie", "Élodie Martin", "health policy", at(base, -90)),
        registration(eventId, "actor:kofi", "Kofi Mensah", "supply-chain analytics", at(base, -90)),
      ]);

      await eventAccess.grant({
        actingActorId: ownerId,
        eventId,
        expectedRevision: 0,
        reason: "Operations lead initializes the event topology.",
        role: "operations",
        subjectActorId: delegateId,
      });
      const authorization = {
        actingActorId: delegateId,
        capability: "generation.run" as const,
        eventId,
        ownerOrganizerActorId: ownerId,
      };
      const snapshot = await repository.captureGenerationSnapshotAsOperator(authorization);
      const [first, concurrentReplay] = await Promise.all([
        engine.createGeneration({
          actorId: delegateId,
          capturedSnapshot: snapshot,
          idempotencyKey: "delegate-and-owner-replay",
        }),
        engine.createGeneration({
          actorId: delegateId,
          capturedSnapshot: snapshot,
          idempotencyKey: "delegate-and-owner-replay",
        }),
      ]);
      const replay = await engine.createGeneration({
        actorId: ownerId,
        capturedSnapshot: snapshot,
        idempotencyKey: "delegate-and-owner-replay",
      });
      assert.equal(first.generationId, concurrentReplay.generationId);
      assert.equal(first.generationId, replay.generationId);
      assert.equal(first.organizerActorId, ownerId);
      assert.equal(first.snapshot.participants.length, 4);
      const initialized = await pool.query<{ actor_id: string; count: string }>(
        `select actor_id,count(*)::text as count from event_ops_audit_log
          where workspace_id=$1 and event_id=$2 and action='generation_initialized'
          group by actor_id`,
        [workspaceId, eventId],
      );
      assert.deepEqual(initialized.rows, [{ actor_id: delegateId, count: "1" }]);
      const topology = await counts(pool, workspaceId, eventId);
      assert.equal(topology.generations, "1");
      assert.equal(topology.tasks, String(first.expectedTaskCount));

      const postSnapshot = await repository.captureGenerationSnapshotAsOperator(authorization);
      await eventAccess.revoke({
        actingActorId: ownerId,
        eventId,
        expectedRevision: 1,
        reason: "Delegate lost generation authority before initialization.",
        subjectActorId: delegateId,
      });
      const beforeRevokedInitialize = await counts(pool, workspaceId, eventId);
      await assert.rejects(
        () => engine.createGeneration({
          actorId: delegateId,
          capturedSnapshot: postSnapshot,
          idempotencyKey: "revoked-before-initialize",
        }),
        /access|denied|forbidden/i,
      );
      assert.deepEqual(await counts(pool, workspaceId, eventId), beforeRevokedInitialize);

      await eventAccess.grant({
        actingActorId: ownerId,
        eventId,
        expectedRevision: 2,
        reason: "Delegate temporarily regains generation authority for recovery.",
        role: "operations",
        subjectActorId: delegateId,
      });
      await pool.query(
        `update event_ops_generations set status='failed', error_code='TEST_FAILED'
          where workspace_id=$1 and generation_id=$2`,
        [workspaceId, first.generationId],
      );
      await pool.query(
        `update event_ops_tasks set status='failed', error_code='TEST_FAILED'
          where workspace_id=$1 and generation_id=$2`,
        [workspaceId, first.generationId],
      );
      await repository.retryFailedGeneration(first.generationId, at(base, 1), authorization);
      const retried = await pool.query<{ actor_id: string }>(
        `select actor_id from event_ops_audit_log where workspace_id=$1 and event_id=$2
          and action='generation_retried'`,
        [workspaceId, eventId],
      );
      assert.deepEqual(retried.rows, [{ actor_id: delegateId }]);

      await pool.query(
        `update event_ops_generations set status='completed', completed_at=statement_timestamp()
          where workspace_id=$1 and generation_id=$2`,
        [workspaceId, first.generationId],
      );
      await pool.query(
        `update event_ops_tasks set status='completed', attempts=1, completed_at=statement_timestamp()
          where workspace_id=$1 and generation_id=$2`,
        [workspaceId, first.generationId],
      );
      await pool.query(
        `insert into event_ops_ai_artifacts (
           workspace_id,artifact_id,generation_id,task_id,attempt,artifact_kind,provider,model,
           request_hash,response_hash,schema_version,evidence_metadata,validated_payload,created_at
         ) select task.workspace_id, 'artifact:' || task.task_id, task.generation_id, task.task_id, 1,
           'test','test','test','request','response',1,
           jsonb_build_object('aiRequestFingerprint',generation.ai_request_fingerprint),'{}'::jsonb,
           statement_timestamp()
         from event_ops_tasks task join event_ops_generations generation
           on generation.workspace_id=task.workspace_id and generation.generation_id=task.generation_id
         where task.workspace_id=$1 and task.generation_id=$2`,
        [workspaceId, first.generationId],
      );
      const publishedValue: EventOperationsPublishedResult = {
        directory: first.snapshot.participants,
        eventId,
        generationId: first.generationId,
        graph: { edges: [], nodes: [] },
        grouping: { roundOne: [], roundTwo: [] },
        profileEditDeadlineAt: config.profileEditDeadlineAt,
        publishedAt: at(base, 2),
        recommendations: [],
        resultsAvailableAt: config.resultsAvailableAt,
        snapshotHash: first.snapshot.hash,
      };
      await repository.publishGenerationAtomically(publishedValue, ownerId, {
        ...authorization,
        capability: "generation.publish",
      });
      const publication = await pool.query<{ actor_id: string; published_by_actor_id: string }>(
        `select audit.actor_id, publication.published_by_actor_id
          from event_ops_audit_log audit join event_ops_publications publication
            on publication.workspace_id=audit.workspace_id and publication.event_id=audit.event_id
          where audit.workspace_id=$1 and audit.event_id=$2 and audit.action='generation_published'`,
        [workspaceId, eventId],
      );
      assert.deepEqual(publication.rows, [{ actor_id: delegateId, published_by_actor_id: delegateId }]);

      await eventAccess.revoke({
        actingActorId: ownerId,
        eventId,
        expectedRevision: 3,
        reason: "Delegate is revoked after publication.",
        subjectActorId: delegateId,
      });
      const beforeRevokedReplay = await counts(pool, workspaceId, eventId);
      await assert.rejects(
        () => repository.publishGenerationAtomically(publishedValue, ownerId, {
          ...authorization,
          capability: "generation.publish",
        }),
        /access|denied|forbidden/i,
      );
      assert.deepEqual(await counts(pool, workspaceId, eventId), beforeRevokedReplay);
    } finally {
      await client.close();
      await admin.query(`drop schema if exists ${schema} cascade`);
      await admin.end();
    }
  },
);
