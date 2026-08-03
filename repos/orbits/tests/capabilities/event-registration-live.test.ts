import assert from "node:assert/strict";
import test from "node:test";

import {
  createEventRegistrationService,
  createMemoryEventRegistrationProvider,
} from "../../features/events/registration/service";
import { createEventRegistrationLiveRecordProvider } from "../../features/events/registration/storage/live-record-provider";
import {
  generateEventRegistrationQuestions,
  type EventRegistrationModelRunner,
} from "../../features/events/registration/question-generator";
import { mockEventRecords } from "../../features/events/event-crud-and-import/fixtures";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

function registerableEvent() {
  const event = mockEventRecords.find((candidate) => candidate.id === "demo-event-1");

  assert.ok(event);

  return event;
}

test("registration question generation uses the Orbit Agent model boundary and validates event-specific output", async () => {
  const modelConfig = {
    apiKey: "test-key",
    model: "orbit-shared-model",
    provider: "gemini",
    requestTimeoutMs: 12_345,
  } as const;
  const requests: Parameters<EventRegistrationModelRunner>[0][] = [];
  const modelRunner: EventRegistrationModelRunner = async (input) => {
    requests.push(input);

    return {
      model: "orbit-shared-model",
      provider: "gemini",
      source: "provider:gemini-interactions-api",
      success: true,
      text: JSON.stringify({
        questions: [
          {
            id: "positioning",
            intent: "positioning",
            participantProfileField: "positioning",
            prompt: "在 Climate founders dinner 上，你希望别人如何理解你目前的工作重点？",
            options: ["正在验证方向", "正在寻找合作伙伴", "正在扩大影响力"],
          },
          {
            id: "target_attendees",
            intent: "target_attendees",
            participantProfileField: "targetAttendees",
            prompt: "这场 Climate founders dinner 中，你最希望遇见哪类参与者？",
            options: ["气候创业者", "运营型投资人", "活动组织者"],
          },
        ],
      }),
    };
  };

  const result = await generateEventRegistrationQuestions({
    event: registerableEvent(),
    language: "zh",
    modelConfig,
    modelRunner,
  });

  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.config, modelConfig);
  assert.match(requests[0]?.systemInstruction ?? "", /Orbit AI.*provider.*model/i);
  assert.match(requests[0]?.userText ?? "", /Climate founders dinner/);
  assert.equal(result.questions.length, 2);
  assert.equal(result.questions[0]?.intent, "positioning");
  assert.equal(result.questions[1]?.participantProfileField, "targetAttendees");
  assert.equal(result.provenance.generationMethod, "orbit-agent-model-customized");
  assert.equal(result.provenance.provider, "gemini");
  assert.equal(result.provenance.model, "orbit-shared-model");
});

test("invalid or unavailable model output returns no substitute questions", async () => {
  const result = await generateEventRegistrationQuestions({
    event: registerableEvent(),
    language: "en",
    modelRunner: async () => ({
      error: {
        code: "MODEL_REQUEST_FAILED",
        message: "provider unavailable",
        provider: "openai",
        source: "provider:openai-responses-api",
      },
      success: false,
    }),
  });

  assert.equal(result.questions.length, 0);
  assert.equal(result.provenance.generationMethod, "orbit-agent-model-failed");
  assert.equal(result.provenance.fallbackReason, "MODEL_REQUEST_FAILED");
  assert.equal(result.provenance.externalNetworkRequested, true);
});

test("register cancel and re-register reuse one registration and participant profile", async () => {
  const provider = createMemoryEventRegistrationProvider();
  const timestamps = [
    "2026-07-24T01:00:00.000Z",
    "2026-07-24T02:00:00.000Z",
    "2026-07-24T03:00:00.000Z",
  ];
  const service = createEventRegistrationService({
    now: () => timestamps.shift() ?? "2026-07-24T04:00:00.000Z",
    provider,
  });

  const registered = await service.register({
    answers: {
      desiredOutcome: "Meet one climate operator",
      positioning: "Building relationship infrastructure",
    },
    eventId: "demo-event-1",
    userId: "profile_ari_lane",
  });
  const duplicate = await service.register({
    answers: {
      desiredOutcome: "Meet one climate operator",
      positioning: "Building relationship infrastructure",
    },
    eventId: "demo-event-1",
    userId: "profile_ari_lane",
  });

  assert.equal(duplicate.id, registered.id);
  assert.equal(duplicate.updatedAt, registered.updatedAt);
  assert.equal(duplicate.participantProfileId, registered.participantProfileId);
  assert.equal(duplicate.status, "rsvped");

  const cancelled = await service.cancel({
    eventId: "demo-event-1",
    userId: "profile_ari_lane",
  });
  const cancelledAgain = await service.cancel({
    eventId: "demo-event-1",
    userId: "profile_ari_lane",
  });

  assert.ok(cancelled);
  assert.ok(cancelledAgain);
  assert.equal(cancelledAgain.id, registered.id);
  assert.equal(cancelledAgain.cancelledAt, cancelled.cancelledAt);
  assert.equal(cancelledAgain.status, "cancelled");

  const reactivated = await service.register({
    answers: {
      desiredOutcome: "Meet two climate operators",
      positioning: "Building relationship infrastructure",
    },
    eventId: "demo-event-1",
    userId: "profile_ari_lane",
  });

  assert.equal(reactivated.id, registered.id);
  assert.equal(reactivated.participantProfileId, registered.participantProfileId);
  assert.equal(reactivated.registeredAt, registered.registeredAt);
  assert.equal(reactivated.status, "rsvped");
  assert.equal(reactivated.reactivatedAt, "2026-07-24T03:00:00.000Z");
  assert.equal(
    reactivated.participantProfile.answers.desiredOutcome,
    "Meet two climate operators",
  );
  assert.equal(reactivated.sideEffects.emailSent, false);
  assert.equal(reactivated.sideEffects.notificationDelivered, false);
});

test("registration answers stay in the event participant profile and never mutate a global profile", async () => {
  const service = createEventRegistrationService({
    now: () => "2026-07-24T05:00:00.000Z",
    provider: createMemoryEventRegistrationProvider(),
  });

  const firstEvent = await service.register({
    answers: { positioning: "Climate positioning" },
    eventId: "demo-event-1",
    userId: "profile_ari_lane",
  });
  const secondEvent = await service.register({
    answers: { positioning: "Storage positioning" },
    eventId: "demo-event-2",
    userId: "profile_ari_lane",
  });

  assert.notEqual(firstEvent.participantProfileId, secondEvent.participantProfileId);
  assert.equal(
    firstEvent.participantProfile.answers.positioning,
    "Climate positioning",
  );
  assert.equal(
    secondEvent.participantProfile.answers.positioning,
    "Storage positioning",
  );
  assert.equal(firstEvent.sideEffects.globalProfileWriteExecuted, false);
  assert.equal(secondEvent.sideEffects.globalProfileWriteExecuted, false);
});

test("registration provider persists one live record per event and user", async () => {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const provider = createEventRegistrationLiveRecordProvider({
    store,
    workspaceId: "workspace:test",
  });
  const service = createEventRegistrationService({
    now: () => "2026-07-24T06:00:00.000Z",
    provider,
  });
  const interviewResponse = {
    answer: {
      customText: null,
      displayText: "Find a pilot partner",
      selectedOptionIds: ["option-1"],
    },
    answerSource: "participant" as const,
    answeredAt: "2026-07-24T05:59:00.000Z",
    field: "desiredOutcome" as const,
    generation: {
      method: "orbit-agent-model-adaptive" as const,
      model: "test-model",
      promptVersion: 1,
      provider: "test-provider",
    },
    question: {
      fieldLabel: { en: "Desired outcome", zh: "期待结果" },
      inputKind: "single_choice_with_custom" as const,
      language: "en" as const,
      options: [
        { id: "option-1", label: "Find a pilot partner" },
        { id: "option-2", label: "Meet investors" },
      ],
      prompt: "What result would make this event worthwhile?",
    },
    questionId: "question:desired-outcome",
    questionSource: "ai_adaptive" as const,
    responseId: "response:desired-outcome",
    visibility: "event_attendees" as const,
  };

  const registration = await service.register({
    answers: { desiredOutcome: "Find a pilot partner" },
    eventId: "demo-event-2",
    interviewResponses: [interviewResponse],
    userId: "profile_ari_lane",
  });
  const stored = await provider.getRegistration(
    "demo-event-2",
    "profile_ari_lane",
  );
  const records = store.listRecords({
    collectionName: "event_registrations",
    workspaceId: "workspace:test",
  });

  assert.deepEqual(stored, registration);
  assert.equal(records.length, 1);
  assert.equal(records[0]?.userId, "profile_ari_lane");
  assert.equal(records[0]?.targetId, "demo-event-2");
  assert.equal(records[0]?.payload.registrationId, registration.id);
  assert.equal(
    stored?.participantProfile.interviewResponses?.[0]?.question?.prompt,
    "What result would make this event worthwhile?",
  );
});

test("registration replay ignores JSON object key order", async () => {
  const memoryProvider = createMemoryEventRegistrationProvider();
  const firstService = createEventRegistrationService({
    now: () => "2026-07-24T07:00:00.000Z",
    provider: memoryProvider,
  });
  const input = {
    answers: {
      positioning: "Building relationship infrastructure",
      desiredOutcome: "Meet one climate operator",
    },
    eventId: "demo-event-1",
    userId: "profile_jsonb_order",
  };
  const registered = await firstService.register(input);
  let saves = 0;
  const jsonbOrderedRegistration = {
    ...registered,
    participantProfile: {
      ...registered.participantProfile,
      answers: {
        desiredOutcome: registered.participantProfile.answers.desiredOutcome,
        positioning: registered.participantProfile.answers.positioning,
      },
    },
  };
  const replayService = createEventRegistrationService({
    now: () => "2026-07-24T08:00:00.000Z",
    provider: {
      async getRegistration() {
        return jsonbOrderedRegistration;
      },
      async listRegistrations() {
        return [jsonbOrderedRegistration];
      },
      async saveRegistration(registration) {
        saves += 1;
        return registration;
      },
    },
  });

  const replayed = await replayService.register(input);

  assert.equal(saves, 0);
  assert.equal(replayed.updatedAt, registered.updatedAt);
  assert.equal(
    replayed.participantProfile.updatedAt,
    registered.participantProfile.updatedAt,
  );
});
