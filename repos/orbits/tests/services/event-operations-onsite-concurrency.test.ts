import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";

import {
  createPostgresEventAccessRepository,
  EventAccessRepositoryError,
} from "../../features/events/event-access/storage/postgres-repository";
import type { EventOperationsConfiguration } from "../../features/events/event-operations/contract";
import { runEventOperationsMigrations } from "../../features/events/event-operations/storage/migrations";
import { createEventOperationsPostgresClient } from "../../features/events/event-operations/storage/postgres-client";
import { createPostgresEventOperationsRepository } from "../../features/events/event-operations/storage/postgres-repository";
import type { EventRegistration } from "../../features/events/registration/contract";
import { createEventOperationsOutboxProjector } from "../../features/events/event-operations/outbox-projector";
import type { EventOperationsOutboxMessage } from "../../features/events/event-operations/storage/postgres-outbox-repository";
import { createStorageBusinessCardContactWriteProvider } from "../../features/contacts/storage/contact-write-live-record-provider";
import { createEventRegistrationLiveRecordProvider } from "../../features/events/registration/storage/live-record-provider";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createTransactionalPostgresClient } from "../../shared/storage/transactional-postgres";
import { runRelationshipLifecycleMigrations } from "../../features/connections/lifecycle/migrations";
import { createRelationshipInitializationService } from "../../features/connections/lifecycle/initialization";
import { assessRelationshipLifecycleMigration } from "../../features/connections/lifecycle/migration-preflight";

const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;

function at(base: number, minutes: number): string {
  return new Date(base + minutes * 60_000).toISOString();
}

function registration(
  eventId: string,
  actorId: string,
  registeredAt: string,
): EventRegistration {
  const participantProfileId = `participant:${eventId}:${actorId}`;
  return {
    cancelledAt: null,
    eventId,
    id: `registration:${eventId}:${actorId}`,
    participantProfile: {
      answers: {
        desiredOutcome: `Meet collaborators for ${actorId}`,
        industry: `Industry ${actorId}`,
        valueOffered: `Offer ${actorId}`,
      },
      createdAt: registeredAt,
      displayName: `Person ${actorId}`,
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

function configuration(
  eventId: string,
  base: number,
): EventOperationsConfiguration {
  return {
    checkInOpensAt: at(base, -5),
    eventEndsAt: at(base, 180),
    eventId,
    eventStartsAt: at(base, 30),
    maxAttemptsPerTask: 3,
    organizerActorId: "actor:onsite-organizer",
    profileEditDeadlineAt: at(base, 10),
    recommendationCount: 3,
    registrationCutoffAt: at(base, 20),
    resultsAvailableAt: at(base, 25),
    roundOneStartsAt: at(base, 45),
    roundTwoStartsAt: at(base, 90),
    shardSize: 4,
    tableSize: 4,
    updatedAt: at(base, 0),
  };
}

test(
  "onsite writes are database-clock idempotent, CAS-terminal, owner-safe, and fully atomic",
  {
    skip: databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured",
    timeout: 120_000,
  },
  async () => {
    assert.ok(databaseUrl);
    const schema = `event_ops_onsite_${randomUUID().replaceAll("-", "")}`;
    const adminPool = new Pool({ connectionString: databaseUrl, max: 1 });
    const scopedPool = new Pool({
      connectionString: databaseUrl,
      max: 32,
      options: `-c search_path=${schema}`,
    });
    const client = createEventOperationsPostgresClient({
      connectionString: databaseUrl,
      pool: scopedPool,
    });
    const workspaceId = "workspace-onsite-concurrency";
    const repository = createPostgresEventOperationsRepository({
      client,
      workspaceId,
    });
    const eventAccess = createPostgresEventAccessRepository({
      client,
      workspaceId,
    });

    try {
      await adminPool.query(`create schema ${schema}`);
      await runEventOperationsMigrations(client);
      const clock = await scopedPool.query<{ now: Date }>(
        "select statement_timestamp() as now",
      );
      const base = clock.rows[0]!.now.getTime();
      const bootstrapEventId = "event-onsite-owner-bootstrap";
      await scopedPool.query(
        `insert into event_ops_events (
           workspace_id,event_id,organizer_actor_id,lifecycle_state,
           registration_migration_state,revision,created_at,updated_at
         ) values ($1,$2,$3,'active','importing',1,statement_timestamp(),statement_timestamp())`,
        [workspaceId, bootstrapEventId, "actor:onsite-organizer"],
      );
      const bootstrappedConfiguration =
        await repository.saveConfigurationAsOperator({
          actorId: "actor:onsite-organizer",
          capability: "operations.configure",
          configuration: configuration(bootstrapEventId, base),
        });
      assert.equal(
        bootstrappedConfiguration.organizerActorId,
        "actor:onsite-organizer",
      );
      const bootstrapAudit = await scopedPool.query<{
        action: string;
        actor_id: string;
      }>(
        `select actor_id,action from event_ops_audit_log
          where event_id=$1 and action='event_configuration_created'`,
        [bootstrapEventId],
      );
      assert.deepEqual(bootstrapAudit.rows, [
        {
          action: "event_configuration_created",
          actor_id: "actor:onsite-organizer",
        },
      ]);
      const eventId = "event-onsite-concurrency";
      const people = [
        ["actor:a", "李 明"],
        ["actor:b", "佐藤 葵"],
        ["actor:c", "Élodie Martin"],
        ["actor:d", "Daria Popov"],
        ["actor:e", "Kofi Mensah"],
        ["actor:f", "María García"],
      ].map(([actorId, displayName]) => {
        const value = registration(eventId, actorId!, at(base, -60));
        return {
          ...value,
          participantProfile: {
            ...value.participantProfile,
            answers: {
              ...value.participantProfile.answers,
              sensitiveMarker: `NEVER_EXPOSE_${actorId}`,
            },
            displayName,
          },
        };
      });
      await repository.saveConfiguration(configuration(eventId, base));
      await scopedPool.query(
        `update event_ops_events
            set lifecycle_state_v2 = 'published'
          where workspace_id = $1 and event_id = $2`,
        [workspaceId, eventId],
      );
      await repository.activateCanonicalRegistrations(eventId, people);

      const checkIns = await Promise.all(
        Array.from({ length: 100 }, () =>
          repository.checkInAtomically({
            actorId: "actor:a",
            eventId,
            kind: "self",
          }),
        ),
      );
      assert.equal(
        new Set(checkIns.map((value) => value.checkedInAt)).size,
        1,
        "every concurrent replay must return the first database timestamp",
      );
      assert.equal(
        new Set(checkIns.map((value) => value.evidenceId)).size,
        1,
      );
      const checkInCounts = await scopedPool.query<{
        audit_count: string;
        checkin_count: string;
        outbox_count: string;
      }>(`
        select
          (select count(*) from event_ops_checkins
            where event_id = '${eventId}' and actor_id = 'actor:a')::text
            as checkin_count,
          (select count(*) from event_ops_audit_log
            where event_id = '${eventId}' and action = 'event_checkin_created'
              and actor_id = 'actor:a')::text as audit_count,
          (select count(*) from event_ops_outbox
            where event_id = '${eventId}' and event_type = 'event.checkin.created'
              and aggregate_id = '${eventId}:actor:a')::text as outbox_count
      `);
      assert.deepEqual(checkInCounts.rows[0], {
        audit_count: "1",
        checkin_count: "1",
        outbox_count: "1",
      });

      const participantB = people[1]!.participantProfileId;
      const participantC = people[2]!.participantProfileId;
      const manualCheckIns = await Promise.all(
        Array.from({ length: 100 }, (_, index) =>
          repository.checkInAtomically({
            actorId: "actor:onsite-organizer",
            capability: "check_in.roster.write",
            eventId,
            kind: "staff",
            participantId: index % 2 === 0 ? participantB : participantC,
          }),
        ),
      );
      assert.equal(
        new Set(
          manualCheckIns
            .filter((value) => value.participantId === participantB)
            .map((value) => value.checkedInAt),
        ).size,
        1,
      );
      assert.equal(
        new Set(
          manualCheckIns
            .filter((value) => value.participantId === participantC)
            .map((value) => value.checkedInAt),
        ).size,
        1,
      );
      assert.equal(
        (
          await repository.checkInAtomically({
            actorId: "actor:b",
            eventId,
            kind: "self",
          })
        ).checkedInAt,
        manualCheckIns.find((value) => value.participantId === participantB)
          ?.checkedInAt,
        "self check-in must replay the organizer-created canonical arrival",
      );
      await assert.rejects(
        repository.checkInAtomically({
          actorId: "actor:a",
          capability: "check_in.roster.write",
          eventId,
          kind: "staff",
          participantId: people[3]!.participantProfileId,
        }),
        /check-in access is denied/u,
      );
      const manualCounts = await scopedPool.query<{
        audit_count: string;
        checkin_count: string;
        outbox_count: string;
      }>(`
        select
          (select count(*) from event_ops_checkins
            where event_id = '${eventId}' and actor_id in ('actor:b', 'actor:c'))::text
            as checkin_count,
          (select count(*) from event_ops_audit_log
            where event_id = '${eventId}'
              and action = 'event_checkin_marked_by_staff'
              and actor_id = 'actor:onsite-organizer')::text as audit_count,
          (select count(*) from event_ops_outbox
            where event_id = '${eventId}' and event_type = 'event.checkin.created'
              and aggregate_id in ('${eventId}:actor:b', '${eventId}:actor:c'))::text
            as outbox_count
      `);
      assert.deepEqual(manualCounts.rows[0], {
        audit_count: "2",
        checkin_count: "2",
        outbox_count: "2",
      });

      async function grantRole(
        subjectActorId: string,
        role: "operations" | "check_in" | "reviewer" | "read_only_analyst",
      ) {
        return eventAccess.grant({
          actingActorId: "actor:onsite-organizer",
          eventId,
          expectedRevision: 0,
          reason: `Onsite test assignment for ${subjectActorId}`,
          role,
          subjectActorId,
        });
      }

      await grantRole("actor:configuration-operator", "operations");
      const currentConfiguration = await repository.getConfiguration(eventId);
      assert.ok(currentConfiguration);
      const delegatedConfiguration = await repository.saveConfigurationAsOperator({
        actorId: "actor:configuration-operator",
        capability: "operations.configure",
        configuration: {
          ...currentConfiguration,
          recommendationCount: currentConfiguration.recommendationCount + 1,
          updatedAt: at(base, 1),
        },
      });
      assert.equal(
        delegatedConfiguration.organizerActorId,
        "actor:onsite-organizer",
      );
      const configurationAudit = await scopedPool.query<{
        action: string;
        actor_id: string;
      }>(
        `select actor_id, action
           from event_ops_audit_log
          where event_id = $1 and action = 'event_configuration_updated'`,
        [eventId],
      );
      assert.deepEqual(configurationAudit.rows, [
        {
          action: "event_configuration_updated",
          actor_id: "actor:configuration-operator",
        },
      ]);
      await eventAccess.revoke({
        actingActorId: "actor:onsite-organizer",
        eventId,
        expectedRevision: 1,
        reason: "Verify configuration writes fail closed after revocation",
        subjectActorId: "actor:configuration-operator",
      });
      await assert.rejects(
        repository.saveConfigurationAsOperator({
          actorId: "actor:configuration-operator",
          capability: "operations.configure",
          configuration: {
            ...delegatedConfiguration,
            updatedAt: at(base, 2),
          },
        }),
        /configuration access is denied/u,
      );

      await grantRole("actor:reviewer", "reviewer");
      await grantRole("actor:analyst", "read_only_analyst");
      await grantRole("actor:revoked-check-in", "check_in");
      await eventAccess.revoke({
        actingActorId: "actor:onsite-organizer",
        eventId,
        expectedRevision: 1,
        reason: "Revoked before onsite access",
        subjectActorId: "actor:revoked-check-in",
      });
      for (const deniedActorId of [
        "actor:reviewer",
        "actor:analyst",
        "actor:revoked-check-in",
        "actor:unassigned",
      ]) {
        await assert.rejects(
          repository.checkInAtomically({
            actorId: deniedActorId,
            capability: "check_in.roster.write",
            eventId,
            kind: "staff",
            participantId: people[3]!.participantProfileId,
          }),
          /check-in access is denied/u,
        );
      }
      assert.equal(
        (
          await scopedPool.query<{ count: string }>(`
            select count(*)::text as count
              from event_ops_checkins
             where event_id = '${eventId}' and actor_id = 'actor:d'
          `)
        ).rows[0]?.count,
        "0",
      );

      await grantRole("actor:operations-staff", "operations");
      await grantRole("actor:check-in-staff", "check_in");
      await repository.checkInAtomically({
        actorId: "actor:operations-staff",
        capability: "check_in.roster.write",
        eventId,
        kind: "staff",
        participantId: people[3]!.participantProfileId,
      });
      await repository.checkInAtomically({
        actorId: "actor:check-in-staff",
        capability: "check_in.roster.write",
        eventId,
        kind: "staff",
        participantId: people[4]!.participantProfileId,
      });
      const delegatedAudit = await scopedPool.query<{
        actor_id: string;
        after_payload: {
          authorization: {
            capability: string;
            kind: string;
            owner: boolean;
            revision: number;
            role: string;
            state: string;
          };
        };
      }>(`
        select actor_id, after_payload
          from event_ops_audit_log
         where event_id = '${eventId}'
           and action = 'event_checkin_marked_by_staff'
           and actor_id in ('actor:operations-staff','actor:check-in-staff')
         order by actor_id
      `);
      assert.deepEqual(
        delegatedAudit.rows.map((row) => ({
          actorId: row.actor_id,
          authorization: row.after_payload.authorization,
        })),
        [
          {
            actorId: "actor:check-in-staff",
            authorization: {
              capability: "check_in.roster.write",
              kind: "staff",
              owner: false,
              revision: 1,
              role: "check_in",
              state: "active",
            },
          },
          {
            actorId: "actor:operations-staff",
            authorization: {
              capability: "check_in.roster.write",
              kind: "staff",
              owner: false,
              revision: 1,
              role: "operations",
              state: "active",
            },
          },
        ],
      );

      await Promise.all(
        Array.from({ length: 100 }, (_, index) =>
          repository.checkInAtomically({
            actorId:
              index % 2 === 0
                ? "actor:operations-staff"
                : "actor:check-in-staff",
            capability: "check_in.roster.write",
            eventId,
            kind: "staff",
            participantId: people[5]!.participantProfileId,
          }),
        ),
      );
      const contestedCheckIn = await scopedPool.query<{
        actor_id: string;
        audit_count: string;
        checkin_count: string;
        outbox_count: string;
      }>(`
        select
          max(audit.actor_id) as actor_id,
          count(distinct audit.audit_id)::text as audit_count,
          (select count(*) from event_ops_checkins
            where event_id = '${eventId}' and actor_id = 'actor:f')::text
            as checkin_count,
          (select count(*) from event_ops_outbox
            where event_id = '${eventId}'
              and aggregate_id = '${eventId}:actor:f'
              and event_type = 'event.checkin.created')::text as outbox_count
        from event_ops_audit_log audit
        where audit.event_id = '${eventId}'
          and audit.aggregate_id = '${eventId}:actor:f'
          and audit.action = 'event_checkin_marked_by_staff'
      `);
      assert.ok(
        ["actor:operations-staff", "actor:check-in-staff"].includes(
          contestedCheckIn.rows[0]!.actor_id,
        ),
      );
      assert.deepEqual(
        {
          audit_count: contestedCheckIn.rows[0]!.audit_count,
          checkin_count: contestedCheckIn.rows[0]!.checkin_count,
          outbox_count: contestedCheckIn.rows[0]!.outbox_count,
        },
        { audit_count: "1", checkin_count: "1", outbox_count: "1" },
      );

      await grantRole("actor:limited-roster-reader", "check_in");
      const limitedRoster = await repository.listLimitedCheckInRoster({
        actorId: "actor:limited-roster-reader",
        capability: "check_in.roster.read_limited",
        eventId,
      });
      assert.equal(limitedRoster.length, people.length);
      assert.ok(
        limitedRoster.some((participant) => participant.displayName === "李 明"),
      );
      assert.ok(
        limitedRoster.some(
          (participant) => participant.displayName === "佐藤 葵",
        ),
      );
      assert.ok(
        limitedRoster.some(
          (participant) => participant.displayName === "Élodie Martin",
        ),
      );
      for (const participant of limitedRoster) {
        assert.deepEqual(Object.keys(participant).sort(), [
          "checkedIn",
          "checkedInAt",
          "displayName",
          "participantId",
        ]);
      }
      assert.doesNotMatch(JSON.stringify(limitedRoster), /NEVER_EXPOSE_/u);
      await eventAccess.revoke({
        actingActorId: "actor:onsite-organizer",
        eventId,
        expectedRevision: 1,
        reason: "Verify roster reads fail closed after revocation",
        subjectActorId: "actor:limited-roster-reader",
      });
      await assert.rejects(
        repository.listLimitedCheckInRoster({
          actorId: "actor:limited-roster-reader",
          capability: "check_in.roster.read_limited",
          eventId,
        }),
        /roster access is denied/u,
      );

      const concurrentRequests = await Promise.all(
        Array.from({ length: 100 }, () =>
          repository.createContactRequestAtomically({
            expectedRevision: null,
            eventId,
            requesterActorId: "actor:a",
            targetParticipantId: participantB,
          }),
        ),
      );
      assert.equal(
        new Set(concurrentRequests.map((value) => value.requestId)).size,
        1,
      );
      assert.ok(concurrentRequests.every((value) => value.contactId === null));
      const contestedRequest = concurrentRequests[0]!;
      const requestCounts = await scopedPool.query<{
        audit_count: string;
        outbox_count: string;
        request_count: string;
      }>(`
        select
          (select count(*) from event_ops_contact_requests
            where event_id = '${eventId}'
              and request_id = '${contestedRequest.requestId}')::text
            as request_count,
          (select count(*) from event_ops_audit_log
            where aggregate_id = '${contestedRequest.requestId}'
              and action = 'event_contact_request_created')::text
            as audit_count,
          (select count(*) from event_ops_outbox
            where aggregate_id = '${contestedRequest.requestId}'
              and event_type = 'event.contact_request.created')::text
            as outbox_count
      `);
      assert.deepEqual(requestCounts.rows[0], {
        audit_count: "1",
        outbox_count: "1",
        request_count: "1",
      });

      const terminalResponses = await Promise.all([
        repository.respondToContactRequestAtomically({
          accept: true,
          expectedRevision: contestedRequest.revision,
          eventId,
          requestId: contestedRequest.requestId,
          targetActorId: "actor:b",
        }),
        repository.respondToContactRequestAtomically({
          accept: true,
          expectedRevision: contestedRequest.revision,
          eventId,
          requestId: contestedRequest.requestId,
          targetActorId: "actor:b",
        }),
      ]);
      assert.equal(
        new Set(terminalResponses.map((value) => value.status)).size,
        1,
        "accept and decline races must observe one committed terminal state",
      );
      const contestedStatus = terminalResponses[0]!.status;
      assert.ok(contestedStatus === "accepted" || contestedStatus === "declined");
      const terminalCounts = await scopedPool.query<{
        accepted_audits: string;
        declined_audits: string;
        pair_count: string;
      }>(`
        select
          (select count(*) from event_ops_relationship_pairs
            where request_id = '${contestedRequest.requestId}')::text as pair_count,
          (select count(*) from event_ops_audit_log
            where aggregate_id = '${contestedRequest.requestId}'
              and action = 'event_contact_request_accepted')::text
            as accepted_audits,
          (select count(*) from event_ops_audit_log
            where aggregate_id = '${contestedRequest.requestId}'
              and action = 'event_contact_request_declined')::text
            as declined_audits
      `);
      assert.equal(
        Number(terminalCounts.rows[0]!.accepted_audits) +
          Number(terminalCounts.rows[0]!.declined_audits),
        1,
      );
      assert.equal(
        terminalCounts.rows[0]!.pair_count,
        contestedStatus === "accepted" ? "1" : "0",
      );

      const withdrawableRequest = await repository.createContactRequestAtomically({
        expectedRevision: null,
        eventId,
        requesterActorId: "actor:a",
        targetParticipantId: people[3]!.participantProfileId,
      });
      await assert.rejects(
        repository.withdrawContactRequestAtomically({
          expectedRevision: withdrawableRequest.revision,
          eventId,
          requestId: withdrawableRequest.requestId,
          requesterActorId: "actor:d",
        }),
        /Only the requester/u,
      );
      const withdrawals = await Promise.all(
        Array.from({ length: 20 }, () =>
          repository.withdrawContactRequestAtomically({
            expectedRevision: withdrawableRequest.revision,
            eventId,
            requestId: withdrawableRequest.requestId,
            requesterActorId: "actor:a",
          }),
        ),
      );
      assert.ok(withdrawals.every((request) => request.status === "withdrawn"));
      assert.ok(withdrawals.every((request) => request.withdrawnAt !== null));
      await assert.rejects(
        repository.createContactRequestAtomically({
          eventId,
          expectedRevision: null,
          requesterActorId: "actor:a",
          targetParticipantId: people[3]!.participantProfileId,
        }),
        /unsupported state|lifecycle changed/u,
        "a delayed create from the original lifecycle cannot reopen a withdrawn request",
      );
      const reopenedRequest = await repository.createContactRequestAtomically({
        expectedRevision: withdrawals[0]!.revision,
        eventId,
        requesterActorId: "actor:a",
        targetParticipantId: people[3]!.participantProfileId,
      });
      assert.equal(reopenedRequest.requestId, withdrawableRequest.requestId);
      assert.equal(reopenedRequest.status, "awaiting_target_consent");
      assert.equal(reopenedRequest.withdrawnAt, null);
      await assert.rejects(
        repository.withdrawContactRequestAtomically({
          eventId,
          expectedRevision: withdrawableRequest.revision,
          requestId: withdrawableRequest.requestId,
          requesterActorId: "actor:a",
        }),
        /pending business-card request|lifecycle changed/u,
        "a delayed withdrawal cannot affect a reopened lifecycle",
      );
      await assert.rejects(
        repository.respondToContactRequestAtomically({
          accept: true,
          eventId,
          expectedRevision: withdrawableRequest.revision,
          requestId: withdrawableRequest.requestId,
          targetActorId: "actor:d",
        }),
        /unsupported state|lifecycle changed/u,
        "a delayed target response cannot affect a reopened lifecycle",
      );
      const withdrawalArtifacts = await scopedPool.query<{
        audit_count: string;
        outbox_count: string;
      }>(`
        select
          (select count(*) from event_ops_audit_log
            where aggregate_id = '${withdrawableRequest.requestId}'
              and action = 'event_contact_request_withdrawn')::text as audit_count,
          (select count(*) from event_ops_outbox
            where aggregate_id = '${withdrawableRequest.requestId}'
              and event_type = 'event.contact_request.withdrawn')::text as outbox_count
      `);
      assert.deepEqual(withdrawalArtifacts.rows[0], {
        audit_count: "1",
        outbox_count: "1",
      });

      const acceptedRequest = await repository.createContactRequestAtomically({
        expectedRevision: null,
        eventId,
        requesterActorId: "actor:a",
        targetParticipantId: people[2]!.participantProfileId,
      });
      const targetAccepted = await repository.respondToContactRequestAtomically({
        accept: true,
        expectedRevision: acceptedRequest.revision,
        eventId,
        requestId: acceptedRequest.requestId,
        targetActorId: "actor:c",
      });
      assert.equal(targetAccepted.status, "accepted");
      assert.ok(targetAccepted.contactId);
      const requesterAccepted = (
        await repository.listContactRequests(eventId, "actor:a")
      ).find((value) => value.requestId === acceptedRequest.requestId);
      const targetAcceptedFromList = (
        await repository.listContactRequests(eventId, "actor:c")
      ).find((value) => value.requestId === acceptedRequest.requestId);
      const adminAccepted = (
        await repository.listContactRequests(eventId, null)
      ).find((value) => value.requestId === acceptedRequest.requestId);
      assert.ok(requesterAccepted?.contactId);
      assert.equal(targetAcceptedFromList?.contactId, targetAccepted.contactId);
      assert.notEqual(requesterAccepted.contactId, targetAccepted.contactId);
      assert.equal(adminAccepted?.contactId, null);
      assert.equal(
        (await repository.listContactRequests(eventId, "actor:d")).some(
          (request) => request.requestId === acceptedRequest.requestId,
        ),
        false,
      );
      const safeKeys = [
        "acceptedAt",
        "contactId",
        "createdAt",
        "declinedAt",
        "eventId",
        "requestId",
        "requesterParticipantId",
        "revision",
        "status",
        "targetParticipantId",
        "updatedAt",
        "withdrawnAt",
      ];
      assert.deepEqual(Object.keys(targetAccepted).sort(), safeKeys);
      for (const forbidden of [
        "requesterActorId",
        "targetActorId",
        "contactEvidenceIds",
        "evidenceIds",
      ]) {
        assert.equal(JSON.stringify(targetAccepted).includes(forbidden), false);
      }
      const acceptedArtifacts = await scopedPool.query<{
        audit_count: string;
        evidence_count: string;
        pair_count: string;
        projection_outbox_count: string;
        side_count: string;
      }>(`
        select
          (select count(*) from event_ops_relationship_pairs
            where request_id = '${acceptedRequest.requestId}')::text as pair_count,
          (select count(*) from event_ops_relationship_sides side
            join event_ops_relationship_pairs pair
              on pair.relationship_pair_id = side.relationship_pair_id
            where pair.request_id = '${acceptedRequest.requestId}')::text
            as side_count,
          (select count(*) from event_ops_relationship_evidence evidence
            join event_ops_relationship_pairs pair
              on pair.relationship_pair_id = evidence.relationship_pair_id
            where pair.request_id = '${acceptedRequest.requestId}')::text
            as evidence_count,
          (select count(*) from event_ops_outbox
            where event_type = 'event.relationship_side.project'
              and payload ->> 'requestId' = '${acceptedRequest.requestId}')::text
            as projection_outbox_count,
          (select count(*) from event_ops_audit_log
            where aggregate_id = '${acceptedRequest.requestId}'
              and action = 'event_contact_request_accepted')::text
            as audit_count
      `);
      assert.deepEqual(acceptedArtifacts.rows[0], {
        audit_count: "1",
        evidence_count: "2",
        pair_count: "1",
        projection_outbox_count: "2",
        side_count: "2",
      });
      const pendingSides = await scopedPool.query<{ side_payload: Record<string, Record<string, unknown>> }>(
        `select side_payload from event_ops_relationship_sides side
         join event_ops_relationship_pairs pair
           on pair.relationship_pair_id = side.relationship_pair_id
          and pair.workspace_id = side.workspace_id
         where pair.request_id = $1`,
        [acceptedRequest.requestId],
      );
      assert.equal(pendingSides.rows.length, 2);
      for (const { side_payload: side } of pendingSides.rows) {
        for (const shell of [side.contact, side.connection]) {
          assert.equal(shell.stage, "captured");
          assert.equal(shell.version, 1);
          assert.equal(shell.lifecycleInitialization, "pending");
          assert.equal(shell.activeGoal, undefined);
          assert.equal(shell.nextFollowup, undefined);
          assert.equal(shell.suggestedActions, undefined);
          assert.equal(shell.relationshipStrength, undefined);
        }
        assert.deepEqual(side.connection.valueTypes, ["community_context"]);
      }

      // One real PostgreSQL chain: accepted writer -> durable outbox -> private
      // acquisition projections -> explicit owner choice -> late outbox replay.
      await scopedPool.query(ORBIT_RECORDS_SCHEMA_SQL);
      await runRelationshipLifecycleMigrations(scopedPool);
      const store = createPostgresLiveRecordStore({ client });
      const projector = createEventOperationsOutboxProjector({
        contactRequestNotifications: null,
        relationshipProvider: createStorageBusinessCardContactWriteProvider({ store, workspaceId }),
        registrationProvider: createEventRegistrationLiveRecordProvider({ store, workspaceId }),
      });
      const messages = await scopedPool.query<{ outbox_id: string; aggregate_id: string; payload: Record<string, unknown> }>(
        "select outbox_id, aggregate_id, payload from event_ops_outbox where workspace_id=$1 and event_type='event.relationship_side.project' and payload ->> 'requestId'=$2 order by outbox_id", [workspaceId, acceptedRequest.requestId]);
      const projectionMessages: EventOperationsOutboxMessage[] = messages.rows.map(row => ({
        outboxId: row.outbox_id, aggregateId: row.aggregate_id, aggregateType: "event_relationship_side", eventId,
        eventType: "event.relationship_side.project", payload: row.payload, attempts: 1, leaseEpoch: 1,
        leaseToken: "test:projection", leaseExpiresAt: at(base, 10), workerId: "worker:integration",
      }));
      for (const message of projectionMessages) await projector.project(message);
      const transactional = createTransactionalPostgresClient({ connectionString: databaseUrl, pool: scopedPool });
      const initialization = createRelationshipInitializationService({ client: transactional, workspaceId });
      const ownerChoices = [
        { actor: "actor:a", contactId: requesterAccepted.contactId!, choice: { stage: "active" as const, activeGoal: "确认产品联调合作范围" } },
        { actor: "actor:c", contactId: targetAccepted.contactId!, choice: { stage: "needs_follow_up" as const, nextTask: { taskId: "relationship-task:integration", title: "梳理双方的合作需求", dueAt: at(base, 1440) } } },
      ];
      for (const [index, owner] of ownerChoices.entries()) {
        const pending = await initialization.read(owner.actor, owner.contactId);
        assert.equal(pending.state, "pending");
        if (pending.state !== "pending") throw new Error("Expected pending exchange");
        const input = { expectedRevision: pending.revision, idempotencyKey: `integration:${owner.actor}`, choice: owner.choice };
        const initialized = await initialization.initialize(owner.actor, owner.contactId, input);
        assert.equal(initialized.snapshot.connection.version, 2);
        if (index === 0) assert.equal((await initialization.read(ownerChoices[1].actor, ownerChoices[1].contactId)).state, "pending");
        for (const message of projectionMessages) await projector.project(message);
        assert.deepEqual(await initialization.read(owner.actor, owner.contactId), { state: "initialized", snapshot: initialized.snapshot });
        assert.deepEqual(await initialization.initialize(owner.actor, owner.contactId, input), { ...initialized, replayed: true });
        const records = (await Promise.all(["contacts", "connections", "tasks"].map(collectionName => store.listRecords({ limit: "unbounded", workspaceId, collectionName, userId: owner.actor })))).flat();
        assert.deepEqual(assessRelationshipLifecycleMigration({ actorId: owner.actor, workspaceId, records }).issues, []);
      }
      assert.equal((await store.listRecords({ limit: "unbounded", workspaceId, collectionName: "tasks" })).length, 1);

      const rollbackRequest = await repository.createContactRequestAtomically({
        expectedRevision: null,
        eventId,
        requesterActorId: "actor:c",
        targetParticipantId: people[3]!.participantProfileId,
      });
      await scopedPool.query(`
        create function reject_actor_d_relationship_evidence() returns trigger
        language plpgsql as $$
        begin
          if new.owner_actor_id = 'actor:d' then
            raise exception 'deliberate relationship evidence failure';
          end if;
          return new;
        end
        $$;
        create trigger reject_actor_d_relationship_evidence_trigger
          before insert on event_ops_relationship_evidence
          for each row execute function reject_actor_d_relationship_evidence();
      `);
      await assert.rejects(
        repository.respondToContactRequestAtomically({
          accept: true,
          expectedRevision: rollbackRequest.revision,
          eventId,
          requestId: rollbackRequest.requestId,
          targetActorId: "actor:d",
        }),
        /deliberate relationship evidence failure/i,
      );
      const rollbackState = await scopedPool.query<{
        accepted_audit_count: string;
        accepted_outbox_count: string;
        evidence_count: string;
        pair_count: string;
        projection_outbox_count: string;
        relationship_pair_id: string | null;
        side_count: string;
        status: string;
      }>(`
        select
          request.status,
          request.relationship_pair_id,
          (select count(*) from event_ops_relationship_pairs pair
            where pair.request_id = request.request_id)::text as pair_count,
          (select count(*) from event_ops_relationship_sides side
            join event_ops_relationship_pairs pair
              on pair.relationship_pair_id = side.relationship_pair_id
            where pair.request_id = request.request_id)::text as side_count,
          (select count(*) from event_ops_relationship_evidence evidence
            join event_ops_relationship_pairs pair
              on pair.relationship_pair_id = evidence.relationship_pair_id
            where pair.request_id = request.request_id)::text as evidence_count,
          (select count(*) from event_ops_outbox
            where event_type = 'event.relationship_side.project'
              and payload ->> 'requestId' = request.request_id)::text
            as projection_outbox_count,
          (select count(*) from event_ops_outbox
            where event_type = 'event.contact_request.accepted'
              and aggregate_id = request.request_id)::text
            as accepted_outbox_count,
          (select count(*) from event_ops_audit_log
            where action = 'event_contact_request_accepted'
              and aggregate_id = request.request_id)::text
            as accepted_audit_count
        from event_ops_contact_requests request
        where request.request_id = '${rollbackRequest.requestId}'
      `);
      assert.deepEqual(rollbackState.rows[0], {
        accepted_audit_count: "0",
        accepted_outbox_count: "0",
        evidence_count: "0",
        pair_count: "0",
        projection_outbox_count: "0",
        relationship_pair_id: null,
        side_count: "0",
        status: "awaiting_target_consent",
      });

      await repository.cancelCanonicalRegistration({
        eventId,
        userId: "actor:a",
      });
      assert.equal(
        (
          await repository.listLimitedCheckInRoster({
            actorId: "actor:onsite-organizer",
            capability: "check_in.roster.read_limited",
            eventId,
          })
        ).some(
          (participant) => participant.participantId === people[0]!.participantProfileId,
        ),
        false,
      );
      await assert.rejects(
        repository.checkInAtomically({
          actorId: "actor:a",
          eventId,
          kind: "self",
        }),
        /active canonical registration is required/i,
        "even an idempotent replay must remain scoped to an active membership",
      );

      const futureEventId = "event-onsite-future-window";
      await repository.saveConfiguration({
        ...configuration(futureEventId, base),
        checkInOpensAt: at(base, 60),
      });
      await repository.activateCanonicalRegistrations(futureEventId, [
        registration(futureEventId, "actor:future", at(base, -60)),
      ]);
      await assert.rejects(
        repository.checkInAtomically({
          actorId: "actor:future",
          eventId: futureEventId,
          kind: "self",
        }),
        /outside its configured time window/i,
      );
      assert.equal(
        (
          await scopedPool.query<{ count: string }>(`
            select count(*)::text as count from event_ops_checkins
            where event_id = '${futureEventId}'
          `)
        ).rows[0]?.count,
        "0",
      );

      const foreignWorkspaceRepository =
        createPostgresEventOperationsRepository({
          client,
          workspaceId: "workspace:foreign-onsite",
        });
      await assert.rejects(
        foreignWorkspaceRepository.checkInAtomically({
          actorId: "actor:onsite-organizer",
          capability: "check_in.roster.write",
          eventId,
          kind: "staff",
          participantId: people[3]!.participantProfileId,
        }),
        /not configured/u,
      );
      await assert.rejects(
        foreignWorkspaceRepository.listLimitedCheckInRoster({
          actorId: "actor:onsite-organizer",
          capability: "check_in.roster.read_limited",
          eventId,
        }),
        /roster access is denied/u,
      );

      const notReadyEventId = "event-onsite-access-not-ready";
      await repository.saveConfiguration(
        configuration(notReadyEventId, base),
      );
      await repository.activateCanonicalRegistrations(notReadyEventId, [
        registration(notReadyEventId, "actor:not-ready-target", at(base, -60)),
      ]);
      await scopedPool.query(
        "drop table event_ops_event_role_assignment_heads",
      );
      await assert.rejects(
        repository.checkInAtomically({
          actorId: "actor:onsite-organizer",
          capability: "check_in.roster.write",
          eventId: notReadyEventId,
          kind: "staff",
          participantId: `participant:${notReadyEventId}:actor:not-ready-target`,
        }),
        (error: unknown) =>
          error instanceof EventAccessRepositoryError &&
          error.code === "EVENT_ACCESS_NOT_READY",
      );
      assert.equal(
        (
          await scopedPool.query<{ count: string }>(`
            select count(*)::text as count from event_ops_checkins
             where event_id = '${notReadyEventId}'
          `)
        ).rows[0]?.count,
        "0",
      );
    } finally {
      await client.close();
      await adminPool.query(`drop schema if exists ${schema} cascade`);
      await adminPool.end();
    }
  },
);
