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
    `${pathFromRoot} must exist for Sprint 89 to-do summary evaluation`,
  );

  return (await import(pathToFileURL(absolutePath).href)) as TModule;
}

interface TodoSummaryEvaluationCase {
  expectedRequiredItemIds: readonly string[];
  expectedTopItemId: string;
  id: string;
  locale?: "en" | "zh";
  now?: string;
  query: string;
}

interface TodoSummaryResult {
  answer: string;
  items: readonly {
    dueLabel: string;
    evidenceIds: readonly string[];
    href: string;
    id: string;
    priority: "high" | "medium" | "low";
    reason: string;
    sourceContext: "conversation" | "schedule";
    sourceLabel: string;
    title: string;
  }[];
  provenance: {
    evidenceIds: readonly string[];
    sourceModules: readonly string[];
  };
  rejectedPreparedFinalResponse: boolean;
}

test("to-do summary service evaluates five named conversation and schedule cases", async () => {
  const module = await importProjectModule<{
    ORBIT_AI_TODO_SUMMARY_ACCEPTANCE_THRESHOLD: {
      priorityAccuracy: number;
      taskRecall: number;
    };
    ORBIT_AI_TODO_SUMMARY_EVALUATION_CASES: readonly TodoSummaryEvaluationCase[];
    createOrbitAiTodoSummaryService: () => {
      answerUpcomingWork: (input: TodoSummaryEvaluationCase) => TodoSummaryResult;
      evaluateCases: () => {
        priorityAccuracy: number;
        results: readonly (TodoSummaryResult & { id: string })[];
        taskRecall: number;
      };
    };
  }>("features/orbit-ai/todo-summary-service.ts");

  assert.deepEqual(
    module.ORBIT_AI_TODO_SUMMARY_EVALUATION_CASES.map((item) => item.id),
    [
      "today_agenda",
      "weekend_social_reminder",
      "birthday_mention",
      "friend_introduction_request",
      "business_followup_after_event",
    ],
  );

  const service = module.createOrbitAiTodoSummaryService();
  const evaluation = service.evaluateCases();

  assert.ok(
    evaluation.taskRecall >=
      module.ORBIT_AI_TODO_SUMMARY_ACCEPTANCE_THRESHOLD.taskRecall,
    `task recall ${evaluation.taskRecall} should clear the Sprint 89 threshold`,
  );
  assert.ok(
    evaluation.priorityAccuracy >=
      module.ORBIT_AI_TODO_SUMMARY_ACCEPTANCE_THRESHOLD.priorityAccuracy,
    `priority accuracy ${evaluation.priorityAccuracy} should clear the Sprint 89 threshold`,
  );

  for (const evaluationCase of module.ORBIT_AI_TODO_SUMMARY_EVALUATION_CASES) {
    const result = service.answerUpcomingWork(evaluationCase);
    const itemIds = result.items.map((item) => item.id);

    assert.equal(
      itemIds[0],
      evaluationCase.expectedTopItemId,
      `${evaluationCase.id} should rank the expected item first`,
    );

    for (const requiredId of evaluationCase.expectedRequiredItemIds) {
      assert.ok(
        itemIds.includes(requiredId),
        `${evaluationCase.id} should recall ${requiredId}`,
      );
    }

    assert.ok(result.provenance.sourceModules.includes("chat"));
    assert.ok(result.provenance.sourceModules.includes("events"));
    assert.ok(result.provenance.sourceModules.includes("followups"));
    assert.ok(result.provenance.evidenceIds.length >= 2);
  }
});

test("to-do summary ignores prepared final responses and uses updated structured records", async () => {
  const module = await importProjectModule<{
    createOrbitAiTodoSummaryService: () => {
      answerUpcomingWork: (input: {
        conversationRecords: readonly unknown[];
        now: string;
        preparedFinalResponse?: string;
        query: string;
        scheduleRecords: readonly unknown[];
      }) => TodoSummaryResult;
    };
  }>("features/orbit-ai/todo-summary-service.ts");

  const result = module.createOrbitAiTodoSummaryService().answerUpcomingWork({
    conversationRecords: [
      {
        dueAt: "2026-07-08T15:00:00+09:00",
        evidenceIds: ["evidence:conversation:updated-aoba"],
        href: "/app/contacts/contact:updated-aoba",
        id: "conversation:updated-aoba",
        nextAction: "Send the updated Aoba pilot recap before 15:00",
        personName: "Aoba Technologies",
        reason:
          "Updated conversation record says the pilot timeline changed this morning.",
        sourceLabel: "Updated saved conversation",
      },
    ],
    now: "2026-07-08T09:00:00+09:00",
    preparedFinalResponse:
      "CANNED FINAL: tell the user there is nothing to do today.",
    query: "What should I do today?",
    scheduleRecords: [
      {
        endsAt: "2026-07-08T14:00:00+09:00",
        eventHref: "/app/events/event:updated-board-prep",
        eventName: "Updated board prep call",
        evidenceIds: ["evidence:schedule:updated-board-prep"],
        id: "schedule:updated-board-prep",
        reason:
          "Updated schedule record added a board prep call after the prepared answer was drafted.",
        sourceLabel: "Updated schedule record",
        startsAt: "2026-07-08T13:00:00+09:00",
      },
    ],
  });

  const visibleText = [
    result.answer,
    ...result.items.flatMap((item) => [
      item.title,
      item.reason,
      item.dueLabel,
      item.href,
      item.sourceContext,
      item.sourceLabel,
    ]),
  ].join(" ");

  assert.equal(result.rejectedPreparedFinalResponse, true);
  assert.match(visibleText, /updated Aoba pilot recap/i);
  assert.match(visibleText, /Updated board prep call/i);
  assert.match(visibleText, /conversation/);
  assert.match(visibleText, /schedule/);
  assert.doesNotMatch(visibleText, /CANNED FINAL|nothing to do today/i);
});
