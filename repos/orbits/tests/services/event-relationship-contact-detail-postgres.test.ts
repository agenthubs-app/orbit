import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";

import { loadAppContactDetailRoute } from "../../app/(app)/app/contacts/compose-app-contacts-demo-contact-1-from-previously-approved-mock-first-capabili/contact-detail-route-service";
import { contactDetailRouteToOrbitContactsViewModel } from "../../app/(app)/app/contacts/compose-app-contacts-demo-contact-1-from-previously-approved-mock-first-capabili/contact-detail-view-model-adapter";
import { createStorageContactGraphProvider } from "../../features/contacts/storage/contact-live-record-provider";
import { createEventRelationshipContactGraphReader } from "../../features/contacts/storage/event-relationship-contact-reader";
import { createPostgresHumanEncounterProjectionRepository } from "../../features/encounters/projection-repository";
import { projectPendingHumanEncounters } from "../../features/encounters/projector";
import type { HumanEncounterRecord } from "../../features/encounters/service";
import type { EventOperationsConfiguration } from "../../features/events/event-operations/contract";
import { runEventOperationsMigrations } from "../../features/events/event-operations/storage/migrations";
import { createEventOperationsPostgresClient } from "../../features/events/event-operations/storage/postgres-client";
import { createPostgresEventOperationsRepository } from "../../features/events/event-operations/storage/postgres-repository";
import type { EventRegistration } from "../../features/events/registration/contract";
import { loadLocalEnv } from "../../scripts/load-local-env";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";

loadLocalEnv();
const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;

function registration(
  eventId: string,
  actorId: string,
  displayName: string,
  registeredAt: string,
): EventRegistration {
  const participantProfileId = `participant:${eventId}:${actorId}`;
  return {
    cancelledAt: null,
    eventId,
    id: `registration:${eventId}:${actorId}`,
    participantProfile: {
      answers: {
        desiredOutcome: `${displayName} wants a concrete cross-border pilot partner.`,
        industry: "Mobility and enterprise AI",
        valueOffered: `${displayName} can provide local operator access and procurement insight.`,
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

function configuration(eventId: string): EventOperationsConfiguration {
  return {
    checkInOpensAt: "2026-08-04T05:00:00.000Z",
    eventEndsAt: "2026-08-04T09:00:00.000Z",
    eventId,
    eventStartsAt: "2026-08-04T06:00:00.000Z",
    maxAttemptsPerTask: 3,
    organizerActorId: "actor:organizer",
    profileEditDeadlineAt: "2026-08-04T05:30:00.000Z",
    recommendationCount: 3,
    registrationCutoffAt: "2026-08-04T05:45:00.000Z",
    resultsAvailableAt: "2026-08-04T05:50:00.000Z",
    roundOneStartsAt: "2026-08-04T06:20:00.000Z",
    roundTwoStartsAt: "2026-08-04T07:20:00.000Z",
    shardSize: 4,
    tableSize: 4,
    updatedAt: "2026-08-04T04:00:00.000Z",
  };
}

function encounter(contactId: string): HumanEncounterRecord {
  return {
    actorId: "actor:aiko",
    commitments: ["Aiko sends a bilingual procurement brief"],
    connectionId: null,
    contactId,
    createdAt: "2026-08-04T06:35:00.000Z",
    encounterId: "encounter:aiko-ren:postgres-detail",
    eventId: "event:tokyo-ai-night",
    nextStep: "Friday: review unit economics with the mobility operator",
    noteText: "日本市場の導入条件と中国側のデータ連携について具体的に話した。",
    observedAt: "2026-08-04T06:35:00.000Z",
    privacy: "private",
    projection: {
      attempts: 0,
      availableAt: "2026-08-04T06:35:00.000Z",
      lastError: null,
      leaseExpiresAt: null,
      leaseToken: null,
      status: "pending",
    },
    requestHash: "request-hash:aiko-ren:postgres-detail",
    talked: "yes",
    tags: ["cross-border", "mobility", "enterprise-ai"],
    voiceMemoReference: null,
  };
}

test(
  "accepted canonical event contact bridges to detail without base projection and reads explicit encounter timeline",
  {
    skip: databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured",
    timeout: 120_000,
  },
  async () => {
    assert.ok(databaseUrl);
    const schema = `event_contact_detail_${randomUUID().replaceAll("-", "")}`;
    const workspaceId = `workspace:${randomUUID()}`;
    const admin = new Pool({ connectionString: databaseUrl, max: 1 });
    const pool = new Pool({
      connectionString: databaseUrl,
      max: 8,
      options: `-c search_path=${schema}`,
    });
    const runtime = {
      client: createEventOperationsPostgresClient({
        connectionString: databaseUrl,
        pool,
      }),
      workspaceId,
    };

    try {
      await admin.query(`create schema ${schema}`);
      await runEventOperationsMigrations(runtime.client);
      await pool.query(ORBIT_RECORDS_SCHEMA_SQL);

      const eventId = "event:tokyo-ai-night";
      const participants = [
        registration(eventId, "actor:aiko", "愛子 林", "2026-08-04T04:30:00.000Z"),
        registration(eventId, "actor:ren", "蓮 高橋", "2026-08-04T04:31:00.000Z"),
        registration(eventId, "actor:mei", "美怡 周", "2026-08-04T04:32:00.000Z"),
      ];
      const repository = createPostgresEventOperationsRepository(runtime);
      await repository.saveConfiguration(configuration(eventId));
      await repository.activateCanonicalRegistrations(eventId, participants);
      const request = await repository.createContactRequestAtomically({
        eventId,
        requesterActorId: "actor:aiko",
        targetParticipantId: participants[1]!.participantProfileId,
      });
      const acceptedForRen = await repository.respondToContactRequestAtomically({
        accept: true,
        eventId,
        requestId: request.requestId,
        targetActorId: "actor:ren",
      });
      const acceptedForAiko = (
        await repository.listContactRequests(eventId, "actor:aiko")
      ).find((item) => item.requestId === request.requestId)!;
      assert.ok(acceptedForAiko.contactId);
      assert.ok(acceptedForRen.contactId);
      assert.notEqual(acceptedForAiko.contactId, acceptedForRen.contactId);

      const reader = createEventRelationshipContactGraphReader({
        client: runtime.client,
        workspaceId,
      });
      const acceptedGraph = await reader.readAcceptedContactGraph({
        actorId: "actor:aiko",
        contactId: acceptedForAiko.contactId,
      });
      assert.equal(acceptedGraph?.contacts[0]?.displayName, "蓮 高橋");
      assert.equal(
        await reader.readAcceptedContactGraph({
          actorId: "actor:mei",
          contactId: acceptedForAiko.contactId,
        }),
        null,
        "another participant cannot read Aiko's canonical contact side",
      );

      const record = encounter(acceptedForAiko.contactId);
      await pool.query(
        `insert into orbit_records (
          workspace_id, collection_name, record_id, user_id, source_type,
          source_id, source_label, evidence_ids, target_type, target_id,
          occurred_at, lifecycle_state, search_text, payload, created_at, updated_at
        ) values ($1, 'human_encounters', $2, $3, 'event_import', $4,
          'Explicit human encounter', '{}', 'contact', $5, $6,
          'active', $7, $8::jsonb, $6, $6)`,
        [
          workspaceId,
          record.encounterId,
          record.actorId,
          record.eventId,
          record.contactId,
          record.observedAt,
          record.noteText,
          JSON.stringify(record),
        ],
      );
      const projected = await projectPendingHumanEncounters({
        now: () => "2026-08-04T06:36:00.000Z",
        repository: createPostgresHumanEncounterProjectionRepository(runtime),
        workerId: "worker:contact-detail-pg",
      });
      assert.equal(projected.completed, 1);

      const store = createPostgresLiveRecordStore<Record<string, unknown>>({
        client: {
          async query(text, values) {
            const result = await pool.query(
              text,
              values === undefined ? undefined : [...values],
            );
            return { rows: result.rows };
          },
        },
      });
      const provider = createStorageContactGraphProvider({
        store,
        workspaceId,
      });
      const baseGraph = await provider.readContactGraphForContact!(
        acceptedForAiko.contactId,
        "actor:aiko",
      );
      assert.equal(baseGraph.contacts.length, 0, "outbox contact projection is intentionally absent");

      const route = await loadAppContactDetailRoute({
        actorId: "actor:aiko",
        contactId: acceptedForAiko.contactId,
        eventRelationshipContactGraphReader: reader,
        liveContactGraphProvider: provider,
        mode: "live",
      });
      assert.equal(route.routeState, "success");
      if (route.routeState === "success") {
        const view = contactDetailRouteToOrbitContactsViewModel(route, "zh");
        const timelineNote = view.connections[0]!.notes.at(-1)!;
        assert.match(timelineNote.body, /日本市場の導入条件/u);
        assert.match(timelineNote.body, /Friday: review unit economics/u);
        assert.equal(timelineNote.privacy, "private");
        assert.equal(timelineNote.sourceLabel, "Explicit human encounter");
      }

      await pool.query(
        `update event_ops_contact_requests
         set status = 'awaiting_target_consent', accepted_at = null
         where workspace_id = $1 and request_id = $2`,
        [workspaceId, request.requestId],
      );
      assert.equal(
        await reader.readAcceptedContactGraph({
          actorId: "actor:aiko",
          contactId: acceptedForAiko.contactId,
        }),
        null,
        "a side is not authoritative when its request is no longer accepted",
      );
    } finally {
      await runtime.client.close();
      await admin.query(`drop schema if exists ${schema} cascade`);
      await admin.end();
    }
  },
);
