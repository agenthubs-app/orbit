import assert from "node:assert/strict";
import test from "node:test";

import {
  createEventAdmissionReviewDecisionPostHandler,
  createEventAdmissionReviewDetailGetHandler,
  createEventAdmissionReviewListGetHandler,
} from "../../app/api/events/[id]/admission/reviews/handler";
import type { EventAccessService } from "../../features/events/event-access/service";
import {
  EventAdmissionError,
  type EventAdmissionApplication,
} from "../../features/events/admission/contract";
import type { EventAdmissionService } from "../../features/events/admission/service";

const EVENT_ID = "event:review-api";
const REVIEWER_ID = "actor:review-api";
const APPLICANT_ID = "actor:application-complete";

function accessService(role: "reviewer" | "operations" | null = "reviewer"): EventAccessService {
  return {
    async get(input) {
      const query = input as { eventId: string; subjectActorId: string };
      return {
        eventId: query.eventId,
        owner: false,
        revision: role ? 1 : 0,
        role,
        state: role ? "active" : null,
        subjectActorId: query.subjectActorId,
      };
    },
    async grant() { throw new Error("unused"); },
    async revoke() { throw new Error("unused"); },
  };
}

function application(overrides: Partial<EventAdmissionApplication> = {}): EventAdmissionApplication {
  return {
    actorId: APPLICANT_ID,
    applicationVersion: 1,
    decidedAt: null,
    decisionActorId: null,
    eventId: EVENT_ID,
    policyVersion: 2,
    profilePayload: {
      answers: {
        desiredOutcome: "找到两位可共同验证企业采购路径的伙伴",
        energyStyle: "先倾听背景，再围绕案例深入讨论",
        experienceHighlight: "完成三个中日工业 AI 商业化项目",
        followUpPreference: "48 小时内邮件纪要，再约半小时线上会",
        industry: "工业 AI 与气候科技",
        positioning: "跨境产品与生态合作负责人",
        targetAttendees: "制造业采购负责人和行业渠道伙伴",
        valueOffered: "市场进入经验、采购链洞察与产业引荐",
      },
      displayName: "森爱子",
      interviewResponses: [{
        answer: {
          customText: "希望验证日本制造集团的采购决策路径",
          displayText: "希望验证日本制造集团的采购决策路径",
          selectedOptionIds: [],
        },
        answerSource: "participant",
        answeredAt: "2026-08-05T09:00:00.000Z",
        field: "desiredOutcome",
        generation: {
          method: "orbit-agent-model-adaptive",
          model: "gemini-2.5-pro",
          promptVersion: 3,
          provider: "google",
        },
        question: {
          fieldLabel: { en: "Desired outcome", zh: "期待结果" },
          inputKind: "single_choice_with_custom",
          language: "zh",
          options: [{ id: "custom", label: "补充真实目标" }],
          prompt: "这次活动结束时，什么具体结果会让你觉得值得？",
        },
        questionId: "question:desired-outcome",
        questionSource: "ai_adaptive",
        responseId: "response:desired-outcome",
        visibility: "matching_only",
      }],
    },
    status: "pending_review",
    submittedAt: "2026-08-05T09:05:00.000Z",
    updatedAt: "2026-08-05T09:05:00.000Z",
    ...overrides,
  };
}

function admissionService(input: {
  conflict?: boolean;
  onDecision?: (actingActorId: string, value: unknown) => void;
  onList?: (actingActorId: string, value: unknown) => void;
} = {}): EventAdmissionService {
  return {
    async configurePolicy() { throw new Error("unused"); },
    async decideApplication(actingActorId, value) {
      input.onDecision?.(actingActorId, value);
      if (input.conflict) {
        throw new EventAdmissionError("INVALID_TRANSITION", "Application changed.");
      }
      return application({
        applicationVersion: 2,
        decidedAt: "2026-08-05T09:10:00.000Z",
        decisionActorId: actingActorId,
        status: value.decision === "approve" ? "admitted" : "rejected",
        updatedAt: "2026-08-05T09:10:00.000Z",
      });
    },
    async getApplication() { return application(); },
    async getApplicationForReview(_actingActorId, _eventId, actorId) {
      return actorId === APPLICANT_ID ? application() : null;
    },
    async getPolicy() { return null; },
    async listApplications(actingActorId, value) {
      input.onList?.(actingActorId, value);
      return {
        items: [{
          actorId: APPLICANT_ID,
          applicationVersion: 1,
          decidedAt: null,
          decisionActorId: null,
          displayName: "森爱子",
          status: "pending_review",
          submittedAt: "2026-08-05T09:05:00.000Z",
          updatedAt: "2026-08-05T09:05:00.000Z",
        }],
        nextCursor: {
          actorId: APPLICANT_ID,
          timestamp: "2026-08-05T09:05:00.000Z",
        },
        total: 1,
      };
    },
    async submitApplication() { throw new Error("unused"); },
    async withdrawApplication() { throw new Error("unused"); },
  };
}

function context(actorId?: string, eventId = EVENT_ID) {
  return actorId
    ? { params: Promise.resolve({ actorId, id: eventId }) }
    : { params: Promise.resolve({ id: eventId }) };
}

async function payload(response: Response): Promise<Record<string, unknown>> {
  return response.json() as Promise<Record<string, unknown>>;
}

test("review list authenticates and authorizes before touching admission data", async () => {
  let serviceCalls = 0;
  const unauthenticated = createEventAdmissionReviewListGetHandler({
    createAccessService: () => accessService(),
    createService() { serviceCalls += 1; return admissionService(); },
    resolveActor: async () => null,
  });
  assert.equal((await unauthenticated(
    new Request(`http://orbit.test/api/events/${EVENT_ID}/admission/reviews`),
    context(),
  )).status, 401);
  assert.equal(serviceCalls, 0);

  const forbidden = createEventAdmissionReviewListGetHandler({
    createAccessService: () => accessService("operations"),
    createService() { serviceCalls += 1; return admissionService(); },
    resolveActor: async () => ({ id: REVIEWER_ID }),
  });
  assert.equal((await forbidden(
    new Request(`http://orbit.test/api/events/${EVENT_ID}/admission/reviews`),
    context(),
  )).status, 403);
  assert.equal(serviceCalls, 0);
});

test("review list accepts only exact pagination input and returns an opaque cursor", async () => {
  let observed: unknown;
  const handler = createEventAdmissionReviewListGetHandler({
    createAccessService: () => accessService(),
    createService: () => admissionService({ onList: (_actor, input) => { observed = input; } }),
    resolveActor: async () => ({ id: REVIEWER_ID }),
  });
  const response = await handler(
    new Request(`http://orbit.test/api/events/${EVENT_ID}/admission/reviews?view=pending&limit=20`),
    context(),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(observed, {
    bucket: "pending", cursor: null, eventId: EVENT_ID, limit: 20,
  });
  const data = (await payload(response)).data as { nextCursor: string };
  assert.equal(typeof data.nextCursor, "string");
  assert.doesNotMatch(data.nextCursor, /actor:application-complete/u);

  const extra = await handler(
    new Request(`http://orbit.test/api/events/${EVENT_ID}/admission/reviews?view=pending&debug=1`),
    context(),
  );
  assert.equal(extra.status, 400);
  const invalidCursor = await handler(
    new Request(`http://orbit.test/api/events/${EVENT_ID}/admission/reviews?cursor=not-base64-json`),
    context(),
  );
  assert.equal(invalidCursor.status, 400);
  const duplicateView = await handler(
    new Request(`http://orbit.test/api/events/${EVENT_ID}/admission/reviews?view=pending&view=processed`),
    context(),
  );
  assert.equal(duplicateView.status, 400);
});

test("review detail and decision preserve full answers and enforce exact optimistic command shape", async () => {
  const dependencies = {
    createAccessService: () => accessService(),
    createService: () => admissionService({
      onDecision(actingActorId, value) {
        assert.equal(actingActorId, REVIEWER_ID);
        assert.deepEqual(value, {
          actorId: APPLICANT_ID,
          decision: "approve",
          eventId: EVENT_ID,
          expectedApplicationVersion: 1,
        });
      },
    }),
    resolveActor: async () => ({ id: REVIEWER_ID }),
  };
  const detailHandler = createEventAdmissionReviewDetailGetHandler(dependencies);
  const detailResponse = await detailHandler(
    new Request("http://orbit.test/detail"),
    context(APPLICANT_ID),
  );
  assert.equal(detailResponse.status, 200);
  const detail = (await payload(detailResponse)).data as EventAdmissionApplication;
  assert.equal(Object.keys(detail.profilePayload.answers).length, 8);
  assert.equal(detail.profilePayload.interviewResponses?.length, 1);

  const decisionHandler = createEventAdmissionReviewDecisionPostHandler(dependencies);
  assert.equal((await decisionHandler(
    new Request("http://orbit.test/decision", {
      body: JSON.stringify({ decision: "approve", expectedApplicationVersion: 1 }),
      headers: { "content-type": "text/plain+application/json" },
      method: "POST",
    }),
    context(APPLICANT_ID),
  )).status, 400);
  assert.equal((await decisionHandler(
    new Request("http://orbit.test/decision", {
      body: JSON.stringify({ decision: "approve", expectedApplicationVersion: 1, unexpected: true }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
    context(APPLICANT_ID),
  )).status, 400);
  const decided = await decisionHandler(
    new Request("http://orbit.test/decision", {
      body: JSON.stringify({ decision: "approve", expectedApplicationVersion: 1 }),
      headers: { "content-type": "application/json; charset=utf-8" },
      method: "POST",
    }),
    context(APPLICANT_ID),
  );
  assert.equal(decided.status, 200);
  assert.equal(((await payload(decided)).data as EventAdmissionApplication).status, "admitted");

  const conflict = createEventAdmissionReviewDecisionPostHandler({
    ...dependencies,
    createService: () => admissionService({ conflict: true }),
  });
  const conflictResponse = await conflict(
    new Request("http://orbit.test/decision", {
      body: JSON.stringify({ decision: "reject", expectedApplicationVersion: 1 }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
    context(APPLICANT_ID),
  );
  assert.equal(conflictResponse.status, 409);
  assert.doesNotMatch(JSON.stringify(await payload(conflictResponse)), /actor:application-complete/u);
});
