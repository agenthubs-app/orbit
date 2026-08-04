import assert from "node:assert/strict";
import test from "node:test";

import { createEventParticipantDetailService } from "../../features/events/event-operations/participant-detail";
import { profileResponsesForAiGeneration } from "../../features/events/event-operations/profile-response-policy";
import { eventOperationsParticipantFromRegistration } from "../../features/events/event-operations/participant";
import type {
  EventOperationsParticipant,
  EventOperationsPublishedResult,
  EventOperationsTable,
} from "../../features/events/event-operations/contract";
import type { EventOperationsAttendeeWorkspace } from "../../features/events/event-operations/service";

function participant(
  participantId: string,
  actorId: string,
  displayName: string,
): EventOperationsParticipant {
  return {
    actorId,
    company: "Orbit Labs",
    displayName,
    energyStyle: "Small-group depth",
    evidenceIds: [`evidence:${participantId}`],
    experienceHighlight: "Built a cross-border founder community",
    industry: "AI",
    languages: ["zh", "en"],
    lateRegistration: false,
    needs: ["Product partners"],
    offers: ["Japan market experience"],
    participantId,
    profileCompleteness: "complete",
    role: "Founder",
    seniority: null,
    topics: ["AI", "Cross-border"],
  };
}

function table(
  roundNumber: 1 | 2,
  members: readonly string[],
): EventOperationsTable {
  return {
    icebreakers: [`Round ${roundNumber} opener 1`, `Round ${roundNumber} opener 2`, `Round ${roundNumber} opener 3`],
    memberPrompts: Object.fromEntries(
      members.map((id) => [id, [`Prompt ${id} A`, `Prompt ${id} B`]]),
    ),
    memberRationales: Object.fromEntries(
      members.map((id) => [id, `Rationale for ${id}`]),
    ),
    members: members.map((participantId, index) => ({
      participantId,
      seat: `T${roundNumber}-S${index + 1}`,
    })),
    rationale: `Round ${roundNumber} table rationale`,
    tableNumber: roundNumber + 2,
    theme: roundNumber === 1 ? "Complementary strengths" : "AI partnerships",
  };
}

test("participant detail applies viewer, target-owner, and AI-only response policy to the published profile", async () => {
  const me = participant("participant:me", "actor:me", "Li Wei");
  const target = participant("participant:target", "actor:target", "Aiko Mori");
  const roundOne = table(1, [me.participantId, target.participantId]);
  const roundTwo = table(2, [target.participantId, "participant:other"]);
  const published: EventOperationsPublishedResult = {
    directory: [me, target],
    eventId: "event:tokyo",
    generationId: "generation:published",
    graph: { edges: [], nodes: [] },
    grouping: { roundOne: [roundOne], roundTwo: [roundTwo] },
    profileEditDeadlineAt: "2026-08-04T08:00:00.000Z",
    publishedAt: "2026-08-04T09:00:00.000Z",
    recommendations: [],
    resultsAvailableAt: "2026-08-04T09:00:00.000Z",
    snapshotHash: "snapshot-hash",
  };
  const workspace = {
    checkIn: null,
    checkInAvailable: true,
    configuration: {
      checkInOpensAt: "2026-08-04T08:00:00.000Z",
      eventEndsAt: "2026-08-04T12:00:00.000Z",
      eventId: "event:tokyo",
      eventStartsAt: "2026-08-04T09:00:00.000Z",
      maxAttemptsPerTask: 3,
      organizerActorId: "actor:organizer",
      profileEditDeadlineAt: "2026-08-04T08:00:00.000Z",
      recommendationCount: 5,
      registrationCutoffAt: "2026-08-04T08:30:00.000Z",
      resultsAvailableAt: "2026-08-04T09:00:00.000Z",
      roundOneStartsAt: "2026-08-04T09:30:00.000Z",
      roundTwoStartsAt: "2026-08-04T10:30:00.000Z",
      shardSize: 10,
      tableSize: 6,
      updatedAt: "2026-08-04T07:00:00.000Z",
    },
    contactRequests: [],
    directory: [me, target],
    eventId: "event:tokyo",
    generationNotice: null,
    graph: null,
    me,
    profileEditable: false,
    publishedGenerationId: published.generationId,
    recommendations: {
      noMatchReason: null,
      recommendations: [
        {
          icebreakers: ["Compare buyer signals", "Discuss Japan entry"],
          memberHint: "Complementary market access",
          rank: 1,
          reasons: ["Aiko's product work complements your network."],
          score: 94,
          targetParticipantId: target.participantId,
        },
      ],
      sourceParticipantId: me.participantId,
    },
    resultsState: "ready",
    roundOneTable: roundOne,
    roundTwoTable: null,
  } satisfies EventOperationsAttendeeWorkspace;
  const detail = await createEventParticipantDetailService({
    operationsService: { async attendeeWorkspace() { return workspace; } },
    repository: { async getPublishedResultForAttendee() { return published; } },
    responseReader: {
      async read(input) {
        assert.equal(input.generationId, published.generationId);
        return {
          profileVersion: 7,
          responses: [
            {
              answer: { customText: null, displayText: "Deep small-group conversations", selectedOptionIds: ["option-1"] },
              answerSource: "participant",
              answeredAt: "2026-08-04T07:30:00.000Z",
              field: "energyStyle",
              generation: { method: "orbit-agent-model-adaptive", model: "gemini", promptVersion: 1, provider: "gemini" },
              question: { fieldLabel: { en: "Conversation style", zh: "交流风格" }, inputKind: "single_choice_with_custom", language: "en", options: [{ id: "option-1", label: "Deep small-group conversations" }], prompt: "How do you prefer to meet people here?" },
              questionId: "question:energy",
              questionSource: "ai_adaptive",
              responseId: "response:energy",
              visibility: "event_attendees",
            },
            {
              answer: { customText: "Coffee chat", displayText: "Coffee chat", selectedOptionIds: [] },
              answerSource: "participant",
              answeredAt: "2026-08-04T07:31:00.000Z",
              field: "followUpPreference",
              generation: { method: "orbit-agent-model-adaptive", model: "gemini", promptVersion: 1, provider: "gemini" },
              question: { fieldLabel: { en: "Follow-up", zh: "后续沟通" }, inputKind: "single_choice_with_custom", language: "en", options: [{ id: "option-1", label: "Message first" }, { id: "option-2", label: "Working session" }], prompt: "How should a promising conversation continue?" },
              questionId: "question:follow-up",
              questionSource: "ai_adaptive",
              responseId: "response:follow-up",
              visibility: "matching_only",
            },
            {
              answer: { customText: "Private acquisition constraint", displayText: "Private acquisition constraint", selectedOptionIds: [] },
              answerSource: "participant",
              answeredAt: "2026-08-04T07:32:00.000Z",
              field: "desiredOutcome",
              generation: { method: "orbit-agent-model-adaptive", model: "gemini", promptVersion: 1, provider: "gemini" },
              question: { fieldLabel: { en: "Desired outcome", zh: "期待结果" }, inputKind: "single_choice_with_custom", language: "en", options: [], prompt: "What outcome is private?" },
              questionId: "question:private-outcome",
              questionSource: "ai_adaptive",
              responseId: "response:private-outcome",
              visibility: "private",
            },
          ],
        };
      },
    },
  }).get({
    eventId: workspace.eventId,
    targetParticipantId: target.participantId,
    viewerActorId: me.actorId,
  });

  assert.ok(detail);
  assert.equal(detail.profileVersion, 7);
  assert.equal(detail.sourceContext, "published_generation");
  assert.deepEqual(detail.responses.map((response) => response.fieldKey), ["energyStyle"]);
  assert.equal(detail.company, null);
  assert.equal(detail.industry, null);
  assert.deepEqual(detail.topics, []);
  assert.deepEqual(
    detail.placements.map((placement) => [placement.roundNumber, placement.tableNumber, placement.seat]),
    [[1, 3, "T1-S2"], [2, 4, "T2-S1"]],
  );
  assert.equal(detail.placements[0]?.icebreakers.length, 3);
  assert.equal(detail.placements[1]?.icebreakers.length, 0);
  assert.equal(detail.recommendation?.score, 94);

  const snapshots = await workspaceResponseSnapshots();
  const ownerWorkspace = {
    ...workspace,
    me: target,
    recommendations: null,
  } satisfies EventOperationsAttendeeWorkspace;
  const ownerDetail = await createEventParticipantDetailService({
    operationsService: { async attendeeWorkspace() { return ownerWorkspace; } },
    repository: { async getPublishedResultForAttendee() { return published; } },
    responseReader: { async read() { return { profileVersion: 7, responses: snapshots }; } },
  }).get({
    eventId: workspace.eventId,
    targetParticipantId: target.participantId,
    viewerActorId: target.actorId,
  });
  assert.ok(ownerDetail);
  assert.deepEqual(ownerDetail.responses.map((response) => response.fieldKey), ["energyStyle", "desiredOutcome"]);
  assert.deepEqual(ownerDetail.topics, ["Private acquisition constraint"]);
  assert.deepEqual(profileResponsesForAiGeneration(snapshots).map((response) => response.field), ["energyStyle", "followUpPreference", "desiredOutcome"]);
});

async function workspaceResponseSnapshots() {
  return [
    {
      answer: { customText: null, displayText: "Deep small-group conversations", selectedOptionIds: ["option-1"] },
      answerSource: "participant" as const,
      answeredAt: "2026-08-04T07:30:00.000Z",
      field: "energyStyle" as const,
      generation: { method: "orbit-agent-model-adaptive" as const, model: "gemini", promptVersion: 1, provider: "gemini" },
      question: { fieldLabel: { en: "Conversation style", zh: "交流风格" }, inputKind: "single_choice_with_custom" as const, language: "en" as const, options: [{ id: "option-1", label: "Deep small-group conversations" }], prompt: "How do you prefer to meet people here?" },
      questionId: "question:energy",
      questionSource: "ai_adaptive" as const,
      responseId: "response:energy",
      visibility: "event_attendees" as const,
    },
    {
      answer: { customText: "Coffee chat", displayText: "Coffee chat", selectedOptionIds: [] },
      answerSource: "participant" as const,
      answeredAt: "2026-08-04T07:31:00.000Z",
      field: "followUpPreference" as const,
      generation: { method: "orbit-agent-model-adaptive" as const, model: "gemini", promptVersion: 1, provider: "gemini" },
      question: { fieldLabel: { en: "Follow-up", zh: "后续沟通" }, inputKind: "single_choice_with_custom" as const, language: "en" as const, options: [], prompt: "How should a promising conversation continue?" },
      questionId: "question:follow-up",
      questionSource: "ai_adaptive" as const,
      responseId: "response:follow-up",
      visibility: "matching_only" as const,
    },
    {
      answer: { customText: "Private acquisition constraint", displayText: "Private acquisition constraint", selectedOptionIds: [] },
      answerSource: "participant" as const,
      answeredAt: "2026-08-04T07:32:00.000Z",
      field: "desiredOutcome" as const,
      generation: { method: "orbit-agent-model-adaptive" as const, model: "gemini", promptVersion: 1, provider: "gemini" },
      question: { fieldLabel: { en: "Desired outcome", zh: "期待结果" }, inputKind: "single_choice_with_custom" as const, language: "en" as const, options: [], prompt: "What outcome is private?" },
      questionId: "question:private-outcome",
      questionSource: "ai_adaptive" as const,
      responseId: "response:private-outcome",
      visibility: "private" as const,
    },
  ];
}

test("AI participant snapshot includes matching-only and migrated legacy-private answers", async () => {
  const responses = await workspaceResponseSnapshots();
  const participant = eventOperationsParticipantFromRegistration({
    cancelledAt: null,
    eventId: "event:tokyo",
    id: "registration:target",
    participantProfile: {
      answers: {
        desiredOutcome: "Private acquisition constraint",
        energyStyle: "Deep small-group conversations",
        followUpPreference: "Coffee chat",
      },
      createdAt: "2026-08-04T07:00:00.000Z",
      eventId: "event:tokyo",
      id: "participant:target",
      interviewResponses: responses,
      updatedAt: "2026-08-04T07:32:00.000Z",
      userId: "actor:target",
    },
    participantProfileId: "participant:target",
    reactivatedAt: null,
    registeredAt: "2026-08-04T07:00:00.000Z",
    sideEffects: { calendarUpdateExecuted: false, emailSent: false, globalProfileWriteExecuted: false, notificationDelivered: false, organizerMessageSent: false, refundRequested: false },
    status: "rsvped",
    updatedAt: "2026-08-04T07:32:00.000Z",
    userId: "actor:target",
  }, { profileEditDeadlineAt: "2026-08-04T08:00:00.000Z" });
  assert.equal(participant.profileAnswers?.energyStyle, "Deep small-group conversations");
  assert.equal(participant.profileAnswers?.followUpPreference, "Coffee chat");
  assert.equal(participant.profileAnswers?.desiredOutcome, "Private acquisition constraint");
});

test("all eight registration profile answers enter the AI participant snapshot", () => {
  const fields = [
    "positioning",
    "industry",
    "targetAttendees",
    "valueOffered",
    "desiredOutcome",
    "energyStyle",
    "experienceHighlight",
    "followUpPreference",
  ] as const;
  const responses = fields.map((field, index) => ({
    answer: { customText: `Detailed answer ${index + 1}`, displayText: `Detailed answer ${index + 1}`, selectedOptionIds: [] },
    answerSource: "participant" as const,
    answeredAt: `2026-08-04T07:${String(index).padStart(2, "0")}:00.000Z`,
    field,
    generation: { method: "orbit-agent-model-adaptive" as const, model: "gemini", promptVersion: 1, provider: "gemini" },
    question: null,
    questionId: `question:${field}`,
    questionSource: "ai_adaptive" as const,
    responseId: `response:${field}`,
    visibility: index === 1 ? "matching_only" as const : index === 4 ? "private" as const : "event_attendees" as const,
  }));
  const participant = eventOperationsParticipantFromRegistration({
    cancelledAt: null,
    eventId: "event:all-eight",
    id: "registration:all-eight",
    participantProfile: { answers: {}, createdAt: "2026-08-04T07:00:00.000Z", eventId: "event:all-eight", id: "participant:all-eight", interviewResponses: responses, updatedAt: "2026-08-04T07:08:00.000Z", userId: "actor:all-eight" },
    participantProfileId: "participant:all-eight",
    reactivatedAt: null,
    registeredAt: "2026-08-04T07:00:00.000Z",
    sideEffects: { calendarUpdateExecuted: false, emailSent: false, globalProfileWriteExecuted: false, notificationDelivered: false, organizerMessageSent: false, refundRequested: false },
    status: "rsvped",
    updatedAt: "2026-08-04T07:08:00.000Z",
    userId: "actor:all-eight",
  }, { profileEditDeadlineAt: "2026-08-04T08:00:00.000Z" });

  assert.deepEqual(Object.keys(participant.profileAnswers ?? {}).sort(), [...fields].sort());
  for (const [index, field] of fields.entries()) {
    assert.equal(participant.profileAnswers?.[field], `Detailed answer ${index + 1}`);
  }
});
