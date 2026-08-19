import assert from "node:assert/strict";
import test from "node:test";

import {
  createEventAnalyticsAggregateGetHandler,
  createEventAnalyticsAttendeeGetHandler,
} from "../../app/api/events/[id]/analytics/handlers";
import type {
  EventAccessAssignmentState,
  EventAccessRole,
} from "../../features/events/event-access/contract";
import type { EventAccessService } from "../../features/events/event-access/service";
import type {
  EventAnalyticsAttendeeReport,
  EventAnalyticsOrganizerAggregate,
  EventAnalyticsReadModel,
} from "../../features/events/event-analytics/contract";
import { mockEventRecords } from "../../features/events/event-crud-and-import/fixtures";
import type { EventRegistration } from "../../features/events/registration/contract";

const EVENT_ID = "event:analytics:private";
const ATTENDEE_ID = "actor:attendee-private";
const OTHER_ACTOR_ID = "actor:other-private";
const context = { params: Promise.resolve({ id: EVENT_ID }) };

function aggregate(): EventAnalyticsOrganizerAggregate {
  return {
    appointments: {
      awaitingResponse: 1,
      cancelled: 1,
      completed: 2,
      confirmed: 3,
      draft: 1,
      negotiating: 1,
      reschedulePending: 0,
    },
    checkIns: { checkedIn: 4 },
    contactRequests: {
      accepted: 3,
      awaitingTargetConsent: 2,
      declined: 1,
      withdrawn: 1,
    },
    encounters: { captured: 5, projected: 4 },
    eventId: EVENT_ID,
    grouping: {
      published: true,
      roundOne: { assignedParticipants: 4, tables: 2 },
      roundTwo: { assignedParticipants: 4, tables: 2 },
    },
    kind: "organizer_aggregate",
    registrations: { active: 5, cancelled: 1 },
    roi: {
      metrics: {
        attributionCoverage: {
          declaredCompletedOperations: 2,
          stronglyAttributedCompletedOperations: 1,
          rate: { denominator: 2, numerator: 1, value: 0.5 },
        },
        checkedInParticipants: 4,
        completedAttributedAgentOperations: 1,
        effectiveConnectionPairs: 1,
        effectiveConnectionParticipants: 2,
        effectiveConnectionRate: { denominator: 4, numerator: 2, value: 0.5 },
        mutualConnections: {
          acceptedRelationshipPairs: 2,
          distinctConnectedCheckIns: 2,
          mutuallyCheckedInPairs: 1,
          participationRate: { denominator: 4, numerator: 2, value: 0.5 },
        },
        strongActions: {
          appointments: 1,
          followupReminders: 1,
          humanEncounterNotes: 1,
          messageDrafts: 1,
        },
      },
      snapshot: {
        finalizedAt: null,
        formulaHash: "formula:test",
        metricVersion: "event-roi-v1",
        revision: null,
        sourceWatermark: {
          appointmentCount: 0,
          appointmentUpdatedAt: null,
          checkInCount: 4,
          checkInRevision: 1,
          completedAgentReceiptCount: 2,
          completedAgentReceiptUpdatedAt: null,
          configurationVersion: 1,
          membershipCount: 5,
          membershipRevision: 1,
          relationshipPairCount: 2,
          relationshipAcceptedAt: null,
        },
        status: "live",
        windowEndsAt: "2026-08-12T08:00:00.000Z",
      },
    },
  };
}

function attendee(
  status: EventAnalyticsAttendeeReport["aiArtifact"]["status"] = "ready",
): EventAnalyticsAttendeeReport {
  return {
    aiArtifact: {
      artifact:
        status === "ready"
          ? {
              evidenceHash: "hash:my-evidence",
              evidenceIds: ["evidence:my-encounter"],
              generatedAt: "2026-08-05T09:00:00.000Z",
              messageDraft: "Follow up on my own note.",
              model: "gpt-test",
              provider: "test-provider",
              promptVersion: 1,
              summary: "My permitted post-event summary.",
              version: 1,
            }
          : null,
      eventId: EVENT_ID,
      failureCode: status === "failed" ? "AI_GENERATION_FAILED" : null,
      status,
      updatedAt: status === "unconfigured" ? null : "2026-08-05T09:00:00.000Z",
    },
    appointments: {
      awaitingResponse: 0,
      cancelled: 0,
      completed: 1,
      confirmed: 1,
      draft: 0,
      negotiating: 0,
      reschedulePending: 0,
    },
    checkIn: {
      checkedInAt: "2026-08-05T08:00:00.000Z",
      status: "checked_in",
    },
    contactRequests: {
      accepted: 1,
      awaitingTargetConsent: 0,
      declined: 0,
      withdrawn: 0,
    },
    encounters: { captured: 1, projected: 1 },
    eventId: EVENT_ID,
    grouping: {
      roundOneTableNumber: 2,
      roundTwoTableNumber: 4,
      status: "available",
    },
    kind: "attendee_report",
    registration: { status: "active" },
  };
}

function readModel(input: {
  aggregateValue?: EventAnalyticsOrganizerAggregate;
  attendeeValue?: EventAnalyticsAttendeeReport;
  onAggregate?: (value: { eventId: string }) => void;
  onAttendee?: (value: { actorId: string; eventId: string }) => void;
} = {}): EventAnalyticsReadModel {
  return {
    async readAttendeeReport(value) {
      input.onAttendee?.(value);
      return input.attendeeValue ?? attendee();
    },
    async readOrganizerAggregate(value) {
      input.onAggregate?.(value);
      return input.aggregateValue ?? aggregate();
    },
  };
}

function eventAccessService(input: {
  owner: boolean;
  role: EventAccessRole | null;
  state: EventAccessAssignmentState | null;
}): EventAccessService {
  return {
    async get(query) {
      const value = query as { eventId: string; subjectActorId: string };
      return {
        eventId: value.eventId,
        owner: input.owner,
        revision: 1,
        role: input.role,
        state: input.state,
        subjectActorId: value.subjectActorId,
      };
    },
    async grant() {
      throw new Error("unused");
    },
    async revoke() {
      throw new Error("unused");
    },
  };
}

function registration(
  status: EventRegistration["status"] = "rsvped",
): EventRegistration {
  const timestamp = "2026-08-05T08:00:00.000Z";
  return {
    cancelledAt: status === "cancelled" ? timestamp : null,
    eventId: EVENT_ID,
    id: `registration:${EVENT_ID}:${ATTENDEE_ID}`,
    participantProfile: {
      answers: {},
      createdAt: timestamp,
      eventId: EVENT_ID,
      id: `participant:${EVENT_ID}:${ATTENDEE_ID}`,
      updatedAt: timestamp,
      userId: ATTENDEE_ID,
    },
    participantProfileId: `participant:${EVENT_ID}:${ATTENDEE_ID}`,
    reactivatedAt: null,
    registeredAt: timestamp,
    sideEffects: {
      calendarUpdateExecuted: false,
      emailSent: false,
      globalProfileWriteExecuted: false,
      notificationDelivered: false,
      organizerMessageSent: false,
      refundRequested: false,
    },
    status,
    updatedAt: timestamp,
    userId: ATTENDEE_ID,
  };
}

const visibleEvent = {
  ...mockEventRecords[0],
  id: EVENT_ID,
  sourceMetadata: {
    ...mockEventRecords[0].sourceMetadata,
    providerRecordId: EVENT_ID,
  },
};

test("aggregate endpoint allows only analytics principals and allow-lists aggregate fields", async (t) => {
  const cases: readonly [
    string,
    boolean,
    EventAccessRole | null,
    EventAccessAssignmentState | null,
    number,
  ][] = [
    ["owner", true, null, null, 200],
    ["operations", false, "operations", "active", 200],
    ["read-only analyst", false, "read_only_analyst", "active", 200],
    ["check-in staff", false, "check_in", "active", 403],
    ["reviewer", false, "reviewer", "active", 403],
    ["revoked analyst", false, "read_only_analyst", "revoked", 403],
  ];

  for (const [name, owner, role, state, expectedStatus] of cases) {
    await t.test(name, async () => {
      let readModelConstructed = 0;
      let aggregateInput: { eventId: string } | null = null;
      const handler = createEventAnalyticsAggregateGetHandler({
        aggregateAccess: {
          createAccessService: () => eventAccessService({ owner, role, state }),
          resolveActor: async () => ({ id: "actor:analytics-reader" }),
        },
        createReadModel: () => {
          readModelConstructed += 1;
          return readModel({
            // Simulate accidental internal enrichment. The response mapper
            // must not serialize it on an aggregate endpoint.
            aggregateValue: {
              ...aggregate(),
              internalActorId: OTHER_ACTOR_ID,
              internalProfile: { displayName: "Other attendee secret" },
              roi: {
                ...aggregate().roi,
                snapshot: {
                  ...aggregate().roi.snapshot,
                  sourceWatermark: {
                    ...aggregate().roi.snapshot.sourceWatermark,
                    internalActorId: OTHER_ACTOR_ID,
                  },
                },
              },
            } as EventAnalyticsOrganizerAggregate,
            onAggregate: (value) => {
              aggregateInput = value;
            },
          });
        },
      });

      const response = await handler(new Request("http://test"), context);
      assert.equal(response.status, expectedStatus);
      assert.equal(readModelConstructed, expectedStatus === 200 ? 1 : 0);
      assert.deepEqual(
        aggregateInput,
        expectedStatus === 200 ? { eventId: EVENT_ID } : null,
      );
      if (expectedStatus !== 200) return;

      const body = await response.json();
      const serialized = JSON.stringify(body.data);
      assert.equal(body.data.kind, "organizer_aggregate");
      assert.equal(serialized.includes(OTHER_ACTOR_ID), false);
      assert.equal(serialized.includes("Other attendee secret"), false);
      assert.equal("internalActorId" in body.data, false);
      assert.equal("internalProfile" in body.data, false);
      assert.equal(
        "internalActorId" in body.data.roi.snapshot.sourceWatermark,
        false,
      );
    });
  }
});

test("attendee endpoint verifies an exact active registration before constructing the read model", async () => {
  let readModelConstructed = 0;
  const handler = createEventAnalyticsAttendeeGetHandler({
    attendeeAccess: {
      async getRegistration() {
        return registration("cancelled");
      },
      async loadEvent() {
        throw new Error("event metadata must not be loaded without an active registration");
      },
      resolveActor: async () => ({ id: ATTENDEE_ID }),
    },
    createReadModel: () => {
      readModelConstructed += 1;
      return readModel();
    },
  });

  const response = await handler(new Request("http://test"), context);
  assert.equal(response.status, 403);
  assert.equal(readModelConstructed, 0);
});

test("attendee endpoint forwards only the authenticated self scope and preserves every reader AI status", async (t) => {
  const statuses = ["queued", "running", "failed", "unconfigured", "ready"] as const;
  for (const status of statuses) {
    await t.test(status, async () => {
      let attendeeInput: { actorId: string; eventId: string } | null = null;
      const handler = createEventAnalyticsAttendeeGetHandler({
        attendeeAccess: {
          getRegistration: async () => registration(),
          loadEvent: async () => visibleEvent,
          resolveActor: async () => ({ id: ATTENDEE_ID }),
        },
        createReadModel: () =>
          readModel({
            // This extra data must be removed by the attendee response
            // allow-list, even if a future read implementation attaches it.
            attendeeValue: {
              ...attendee(status),
              otherActorId: OTHER_ACTOR_ID,
              otherPrivateNote: "Other attendee encounter note",
            } as EventAnalyticsAttendeeReport,
            onAttendee: (value) => {
              attendeeInput = value;
            },
          }),
      });

      const response = await handler(new Request("http://test"), context);
      assert.equal(response.status, 200);
      assert.deepEqual(attendeeInput, {
        actorId: ATTENDEE_ID,
        eventId: EVENT_ID,
      });
      const body = await response.json();
      const serialized = JSON.stringify(body.data);
      assert.equal(body.data.kind, "attendee_report");
      assert.equal(body.data.aiArtifact.status, status);
      assert.equal(serialized.includes(OTHER_ACTOR_ID), false);
      assert.equal(serialized.includes("Other attendee encounter note"), false);
      assert.equal("otherActorId" in body.data, false);
      assert.equal("otherPrivateNote" in body.data, false);
      if (status === "ready") {
        assert.equal(body.data.aiArtifact.artifact.summary, "My permitted post-event summary.");
      } else {
        assert.equal(body.data.aiArtifact.artifact, null);
      }
    });
  }
});
