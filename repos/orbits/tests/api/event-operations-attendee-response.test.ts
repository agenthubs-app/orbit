import assert from "node:assert/strict";
import test from "node:test";

import { createEventOperationsGetHandler } from "../../app/api/events/[id]/operations/handlers";
import type { EventOperationsService } from "../../features/events/event-operations/service";

const EVENT_ID = "event:attendee-safe";
const ACTOR_ID = "actor:attendee-safe";

function participant(participantId: string, actorId: string, displayName: string) {
  return {
    actorId,
    company: "Orbit Labs",
    displayName,
    energyStyle: "high-energy",
    evidenceIds: [`evidence:${participantId}`],
    experienceHighlight: "Built a cross-border community",
    industry: "Community",
    languages: ["日本語", "English"],
    lateRegistration: false,
    needs: ["AI operators"],
    offers: ["Community design"],
    participantId,
    profileCompleteness: "complete" as const,
    role: "Founder",
    seniority: "executive",
    topics: ["AI", "Cross-border"],
  };
}

test("participant operations GET emits an attendee field allow-list", async () => {
  const me = participant("participant:me", ACTOR_ID, "Aiko Tanaka");
  const peer = participant("participant:peer", "actor:peer-secret", "Ren Ito");
  const workspace = {
    checkIn: {
      actorId: ACTOR_ID,
      checkedInAt: "2026-08-03T09:00:00.000Z",
      eventId: EVENT_ID,
      evidenceId: "evidence:check-in-secret",
      participantId: me.participantId,
    },
    checkInAvailable: true,
    configuration: {
      checkInOpensAt: "2026-08-03T08:30:00.000Z",
      eventEndsAt: "2026-08-03T13:00:00.000Z",
      eventId: EVENT_ID,
      eventStartsAt: "2026-08-03T09:00:00.000Z",
      maxAttemptsPerTask: 4,
      organizerActorId: "actor:organizer-secret",
      profileEditDeadlineAt: "2026-08-03T07:00:00.000Z",
      recommendationCount: 3,
      registrationCutoffAt: "2026-08-03T07:30:00.000Z",
      resultsAvailableAt: "2026-08-03T08:00:00.000Z",
      roundOneStartsAt: "2026-08-03T10:00:00.000Z",
      roundTwoStartsAt: "2026-08-03T11:00:00.000Z",
      shardSize: 6,
      tableSize: 4,
      updatedAt: "2026-08-03T06:00:00.000Z",
    },
    contactRequests: [{
      acceptedAt: null,
      contactId: null,
      createdAt: "2026-08-03T09:05:00.000Z",
      declinedAt: null,
      eventId: EVENT_ID,
      requestId: "request:1",
      revision: 1,
      requesterParticipantId: me.participantId,
      status: "awaiting_target_consent" as const,
      targetParticipantId: peer.participantId,
      updatedAt: "2026-08-03T09:05:00.000Z",
      withdrawnAt: null,
    }],
    directory: [me, peer],
    eventId: EVENT_ID,
    generationNotice: {
      errorCode: "EVENT_OPERATIONS_AI_TIMEOUT",
      errorMessage: "raw provider diagnostic secret",
      status: "running" as const,
    },
    graph: {
      edges: [{
        fromParticipantId: me.participantId,
        id: "edge:1",
        kind: "recommendation" as const,
        label: "Mutual recommendation",
        toParticipantId: peer.participantId,
      }],
      nodes: [{
        company: me.company,
        displayName: me.displayName,
        participantId: me.participantId,
      }],
    },
    me,
    profileEditable: false,
    publishedGenerationId: "generation:internal-id",
    recommendations: {
      noMatchReason: null,
      recommendations: [{
        icebreakers: ["What are you testing?", "What can you share?"] as const,
        memberHint: "Compare go-to-market experiments",
        reasons: ["Complementary operating experience"] as const,
        score: 93,
        targetParticipantId: peer.participantId,
      }],
      sourceParticipantId: me.participantId,
    },
    resultsState: "ready" as const,
    roundOneTable: {
      icebreakers: ["one", "two", "three"] as const,
      memberPrompts: {
        [me.participantId]: ["prompt one", "prompt two"] as const,
      },
      memberRationales: {
        [me.participantId]: "Aiko brings the community design evidence this table needs.",
      },
      members: [{ participantId: me.participantId, seat: "R1-T1-S1" }],
      rationale: "A complementary evidence exchange.",
      tableNumber: 1,
      theme: "Community evidence",
    },
    roundTwoTable: null,
  };
  const service = {
    attendeeWorkspace: async () => workspace,
  } as unknown as EventOperationsService;
  const handler = createEventOperationsGetHandler({
    createService: () => service,
    registeredAccess: {
      getRegistration: async () => ({
        eventId: EVENT_ID,
        status: "rsvped",
        userId: ACTOR_ID,
      } as never),
      loadEvent: async () => ({ id: EVENT_ID } as never),
      resolveActor: async () => ({ id: ACTOR_ID, name: "Aiko Tanaka" }),
    },
  });

  const response = await handler(
    new Request(`http://localhost/api/events/${EVENT_ID}/operations`),
    { params: Promise.resolve({ id: EVENT_ID }) },
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.deepEqual(Object.keys(body.data).sort(), [
    "checkIn",
    "checkInAvailable",
    "configuration",
    "contactRequests",
    "directory",
    "eventId",
    "graph",
    "me",
    "profileEditable",
    "recommendations",
    "resultsState",
    "roundOneTable",
    "roundTwoTable",
  ]);
  assert.deepEqual(Object.keys(body.data.me).sort(), [
    "company",
    "displayName",
    "experienceHighlight",
    "industry",
    "languages",
    "needs",
    "offers",
    "participantId",
    "role",
    "topics",
  ]);
  assert.deepEqual(Object.keys(body.data.configuration).sort(), [
    "checkInOpensAt",
    "eventEndsAt",
    "eventId",
    "eventStartsAt",
    "profileEditDeadlineAt",
    "resultsAvailableAt",
    "roundOneStartsAt",
    "roundTwoStartsAt",
  ]);
  assert.deepEqual(Object.keys(body.data.checkIn).sort(), [
    "checkedInAt",
    "participantId",
  ]);
  assert.deepEqual(Object.keys(body.data.contactRequests[0]).sort(), [
    "contactId",
    "requestId",
    "requesterParticipantId",
    "revision",
    "status",
    "targetParticipantId",
    "withdrawnAt",
  ]);
  assert.deepEqual(body.data.roundOneTable.memberRationales, {
    [me.participantId]: "Aiko brings the community design evidence this table needs.",
  });

  const serialized = JSON.stringify(body.data);
  for (const secret of [
    ACTOR_ID,
    "actor:peer-secret",
    "actor:organizer-secret",
    "evidence:check-in-secret",
    "evidence:contact-secret",
    "generation:internal-id",
    "raw provider diagnostic secret",
  ]) {
    assert.equal(serialized.includes(secret), false, `leaked ${secret}`);
  }
  for (const forbiddenKey of [
    "actorId",
    "evidenceId",
    "evidenceIds",
    "contactEvidenceIds",
    "organizerActorId",
    "requesterActorId",
    "targetActorId",
  ]) {
    assert.equal(serialized.includes(`\"${forbiddenKey}\"`), false);
  }
});
