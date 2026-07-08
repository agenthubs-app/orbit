import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

async function importProjectModule<TModule>(
  pathFromRoot: string,
): Promise<TModule> {
  const absolutePath = join(projectRoot, pathFromRoot);

  assert.equal(
    existsSync(absolutePath),
    true,
    `${pathFromRoot} must exist for the Sprint 87 event recommendation evaluation`,
  );

  return (await import(pathToFileURL(absolutePath).href)) as TModule;
}

type EventRecommendationSignal =
  | "attendee_intent"
  | "event_topic"
  | "profile_fit"
  | "relationship_opportunity"
  | "schedule_timing";

interface EventRecommendationEvaluationCase {
  expectedTopEventId?: string;
  goal: string;
  id: string;
  locale?: "en" | "zh";
  maxRecommendations?: number;
  shouldBeReady: boolean;
  toolArguments?: Record<string, unknown>;
}

interface EventRecommendationResult {
  evidenceCoverage: Record<EventRecommendationSignal, number>;
  goalConcepts: readonly string[];
  recommendations: readonly {
    confidence: "high" | "medium";
    detailHref: string;
    eventId: string;
    evidenceSnippets: readonly {
      evidenceId: string;
      signal: EventRecommendationSignal;
      snippet: string;
      sourceLabel: string;
    }[];
    peopleToMeet: readonly {
      name: string;
      organization: string;
      reason: string;
      role: string;
    }[];
    score: number;
    sourceBackedReasons: readonly string[];
    timing: string;
    whyThisEvent: string;
  }[];
  rejectedEvents: readonly {
    eventId: string;
    popular: boolean;
    reason: string;
    score: number;
    title: string;
  }[];
  readiness: {
    minimumReadyScore: number;
    state: "ready" | "needs_more_context" | "no_recommendation";
  };
}

test("event recommendation service evaluates ten named relationship and business-development goals", async () => {
  const module = await importProjectModule<{
    ORBIT_AI_EVENT_RECOMMENDATION_EVALUATION_CASES: readonly EventRecommendationEvaluationCase[];
    ORBIT_AI_EVENT_RECOMMENDATION_READY_SCORE_THRESHOLD: number;
    createOrbitAiEventRecommendationService: () => {
      recommendEvents: (
        input: EventRecommendationEvaluationCase,
      ) => EventRecommendationResult;
    };
  }>("features/orbit-ai/event-recommendation-service.ts");

  assert.deepEqual(
    module.ORBIT_AI_EVENT_RECOMMENDATION_EVALUATION_CASES.map(
      (item) => item.id,
    ),
    [
      "meeting_investors",
      "china_market_partners",
      "hiring_ai_talent",
      "restaurant_expansion",
      "organizer_networking",
      "language_preference",
      "schedule_conflict",
      "negative_event_filtering",
      "chinese_input",
      "english_input",
    ],
  );

  const service = module.createOrbitAiEventRecommendationService();

  for (const evaluationCase of module.ORBIT_AI_EVENT_RECOMMENDATION_EVALUATION_CASES) {
    const result = service.recommendEvents(evaluationCase);

    assert.equal(
      result.readiness.minimumReadyScore,
      module.ORBIT_AI_EVENT_RECOMMENDATION_READY_SCORE_THRESHOLD,
      `${evaluationCase.id} must report the documented readiness threshold`,
    );

    if (evaluationCase.shouldBeReady) {
      assert.equal(result.readiness.state, "ready", evaluationCase.id);
      assert.equal(
        result.recommendations[0]?.eventId,
        evaluationCase.expectedTopEventId,
        `${evaluationCase.id} should rank the expected event first`,
      );
      assert.ok(
        (result.recommendations[0]?.score ?? 0) >=
          module.ORBIT_AI_EVENT_RECOMMENDATION_READY_SCORE_THRESHOLD,
        `${evaluationCase.id} top score must clear threshold`,
      );
    } else {
      assert.notEqual(result.readiness.state, "ready", evaluationCase.id);
      assert.equal(
        result.recommendations.length,
        0,
        `${evaluationCase.id} should not expose low-confidence event recommendations`,
      );
    }
  }
});

test("ready event recommendations carry all five ranking signal families", async () => {
  const module = await importProjectModule<{
    createOrbitAiEventRecommendationService: () => {
      recommendEvents: (input: {
        goal: string;
        locale?: "en" | "zh";
      }) => EventRecommendationResult;
    };
  }>("features/orbit-ai/event-recommendation-service.ts");

  const result = module
    .createOrbitAiEventRecommendationService()
    .recommendEvents({
      goal: "Recommend events where I can meet investors for seed fundraising and founder feedback.",
      locale: "en",
    });
  const top = result.recommendations[0];

  assert.equal(top?.eventId, "event_001");
  assert.deepEqual(Object.keys(result.evidenceCoverage).sort(), [
    "attendee_intent",
    "event_topic",
    "profile_fit",
    "relationship_opportunity",
    "schedule_timing",
  ]);
  assert.ok(result.evidenceCoverage.attendee_intent >= 1);
  assert.ok(result.evidenceCoverage.event_topic >= 1);
  assert.ok(result.evidenceCoverage.profile_fit >= 1);
  assert.ok(result.evidenceCoverage.relationship_opportunity >= 1);
  assert.ok(result.evidenceCoverage.schedule_timing >= 1);
  assert.equal(top?.detailHref, "/app/events/demo-event-1?sourceEventId=event_001");
  assert.match(top?.whyThisEvent ?? "", /why this event|investor|founder/i);
  assert.match(top?.timing ?? "", /July 9|2026-07-09|morning/i);
  assert.ok((top?.peopleToMeet.length ?? 0) >= 2);
  assert.ok((top?.sourceBackedReasons.length ?? 0) >= 3);
  assert.ok((top?.evidenceSnippets.length ?? 0) >= 5);
});

test("event recommendations reject irrelevant popular events without attendee or topic evidence", async () => {
  const module = await importProjectModule<{
    ORBIT_AI_EVENT_RECOMMENDATION_READY_SCORE_THRESHOLD: number;
    createOrbitAiEventRecommendationService: () => {
      recommendEvents: (input: {
        goal: string;
        locale?: "en" | "zh";
      }) => EventRecommendationResult;
    };
  }>("features/orbit-ai/event-recommendation-service.ts");

  const result = module
    .createOrbitAiEventRecommendationService()
    .recommendEvents({
      goal: "Find healthcare reimbursement policy buyers for hospital procurement.",
      locale: "en",
    });
  const rejectedPopular = result.rejectedEvents.find(
    (event) => event.popular === true,
  );

  assert.equal(result.readiness.state, "no_recommendation");
  assert.equal(result.recommendations.length, 0);
  assert.ok(rejectedPopular, "popular but irrelevant event should be rejected");
  assert.equal(rejectedPopular?.eventId, "event_900");
  assert.ok(
    (rejectedPopular?.score ?? 0) <
      module.ORBIT_AI_EVENT_RECOMMENDATION_READY_SCORE_THRESHOLD,
  );
  assert.match(rejectedPopular?.reason ?? "", /attendee|topic|missing|below/i);
});

test("event recommendations reject blank event-discovery goals before ranking events", async () => {
  const module = await importProjectModule<{
    createOrbitAiEventRecommendationService: () => {
      recommendEvents: (input: {
        goal: string;
        locale?: "en" | "zh";
      }) => EventRecommendationResult;
    };
  }>("features/orbit-ai/event-recommendation-service.ts");

  const result = module
    .createOrbitAiEventRecommendationService()
    .recommendEvents({
      goal: "   ",
      locale: "en",
    });

  assert.equal(result.readiness.state, "needs_more_context");
  assert.deepEqual(result.goalConcepts, []);
  assert.equal(result.recommendations.length, 0);
  assert.ok(result.rejectedEvents.length > 0);
  assert.match(result.summary, /too ambiguous/i);
  assert.match(result.rejectedEvents[0]?.reason ?? "", /missing concrete/i);
});

test("schedule conflict evidence lowers a conflicting event below a viable alternative", async () => {
  const module = await importProjectModule<{
    createOrbitAiEventRecommendationService: () => {
      recommendEvents: (input: {
        goal: string;
        locale?: "en" | "zh";
        toolArguments?: Record<string, unknown>;
      }) => EventRecommendationResult;
    };
  }>("features/orbit-ai/event-recommendation-service.ts");

  const result = module
    .createOrbitAiEventRecommendationService()
    .recommendEvents({
      goal: "I need investor introductions, but I cannot attend July 9 morning events.",
      locale: "en",
      toolArguments: {
        unavailableWindows: ["2026-07-09T08:00:00+09:00/2026-07-09T12:00:00+09:00"],
      },
    });
  const conflicting = result.rejectedEvents.find(
    (event) => event.eventId === "event_001",
  );

  assert.equal(result.readiness.state, "ready");
  assert.equal(result.recommendations[0]?.eventId, "event_006");
  assert.ok(conflicting);
  assert.match(conflicting?.reason ?? "", /schedule|conflict|below/i);
});
