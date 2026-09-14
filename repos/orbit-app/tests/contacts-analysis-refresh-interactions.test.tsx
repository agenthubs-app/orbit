import assert from "node:assert/strict";
import test from "node:test";

import { mobileContactsDashboardPayloadSchema } from "../src/api/schema/mobile-contacts-dashboard";
import {
  acceptRelationshipGoalSaveReceipt,
  createRelationshipGoalSaveAttempt,
} from "../src/api/relationship-goal";
import {
  consumeAiTemplatePrefill,
  contactsAnalysisTemplate,
  registerAiTemplatePrefill,
} from "../src/data/ai-template-prefill";
import { contactsAnalysisReportToView } from "../src/view-models/contacts-analysis";

const sourceDataVersion = "a".repeat(64);
const changedSourceDataVersion = "b".repeat(64);
const current = {
  analysisVersion: "contacts.analysis@1" as const,
  sourceDataVersion,
};
const report = {
  analysisVersion: "contacts.analysis@1" as const,
  body: "人脉结构稳定，建议补充投资人联系。",
  generatedAt: "2026-09-15T01:00:01.000Z",
  messageId: "message:analysis:1",
  sessionId: "session:analysis:1",
  sourceDataVersion,
};

function dashboardPayload() {
  return {
    schemaVersion: 1,
    generatedAt: "2026-09-15T02:00:00.000Z",
    aggregate: {
      state: "success",
      relationshipAssetTotals: {
        contacts: 1,
        connections: 1,
        evidenceBackedRelationships: 1,
        eventsRepresented: 0,
      },
      newContacts: { count: 0, windowLabel: "30 days", contacts: [] },
      highValueCount: 0,
      highValueRelationships: [],
      pendingFollowups: { count: 0, tasks: [] },
      dormantContacts: { count: 0, contacts: [] },
      recentActivity: [],
      summary: "当前人脉概览",
      nextAction: "查看人脉",
    },
    summary: null,
    opportunities: null,
    gaps: null,
    distributions: null,
    profile: null,
    contacts: null,
    unavailableSections: ["summary", "opportunities", "gaps", "distributions", "profile", "contacts"],
  };
}

test("dashboard analysis schema preserves stored metadata and rejects a false fresh claim", () => {
  const parsed = mobileContactsDashboardPayloadSchema.safeParse({
    ...dashboardPayload(),
    analysis: { current, report, stale: false },
  });
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.analysis?.report?.body, report.body);
    assert.equal(parsed.data.analysis?.report?.generatedAt, report.generatedAt);
    assert.equal(parsed.data.analysis?.report?.analysisVersion, "contacts.analysis@1");
  }

  const contradiction = mobileContactsDashboardPayloadSchema.safeParse({
    ...dashboardPayload(),
    analysis: {
      current,
      report: { ...report, sourceDataVersion: changedSourceDataVersion },
      stale: false,
    },
  });
  assert.equal(contradiction.success, false);
});

test("analysis view distinguishes unavailable, never generated, current and stale reports", () => {
  assert.equal(
    contactsAnalysisReportToView(undefined, []).state,
    "unavailable",
    "an older server must not be presented as a user who never generated a report",
  );
  assert.equal(
    contactsAnalysisReportToView(null, ["analysis"]).state,
    "unavailable",
  );
  assert.deepEqual(contactsAnalysisReportToView({ current, report: null, stale: false }, []), {
    actionLabel: "开始分析",
    analysisVersion: "contacts.analysis@1",
    body: null,
    generatedAt: null,
    sourceDataVersion,
    stale: false,
    state: "empty",
  });
  assert.deepEqual(contactsAnalysisReportToView({
    current,
    report: { ...report, sourceDataVersion: changedSourceDataVersion },
    stale: true,
  }, []), {
    actionLabel: "重新分析",
    analysisVersion: "contacts.analysis@1",
    body: report.body,
    generatedAt: report.generatedAt,
    sourceDataVersion,
    stale: true,
    state: "ready",
  });
});

test("explicit analysis action registers one actor/server-scoped editable IORBIT prefill", () => {
  const template = contactsAnalysisTemplate(sourceDataVersion);
  const intentId = registerAiTemplatePrefill({
    actorId: "actor:one",
    baseUrl: "https://orbit.test",
    ...template,
  });

  assert.equal(template.entryPointId, "contacts.analysis");
  assert.equal(template.sourceDataVersion, sourceDataVersion);
  assert.equal(template.template.id, "contacts.analysis");
  assert.equal(template.template.version, 1);
  assert.equal(template.references.length, 0);
  assert.equal(
    consumeAiTemplatePrefill({ id: intentId, actorId: "actor:other", baseUrl: "https://orbit.test" }),
    null,
  );
  assert.equal(
    consumeAiTemplatePrefill({ id: intentId, actorId: "actor:one", baseUrl: "https://orbit.test" }),
    null,
    "a wrong-actor attempt consumes the one-time intent instead of leaking it",
  );

  const validIntent = registerAiTemplatePrefill({
    actorId: "actor:one",
    baseUrl: "https://orbit.test",
    ...contactsAnalysisTemplate(sourceDataVersion),
  });
  const consumed = consumeAiTemplatePrefill({
    id: validIntent,
    actorId: "actor:one",
    baseUrl: "https://orbit.test",
  });
  assert.equal(consumed?.origin.entryPointId, "contacts.analysis");
  assert.equal(consumed?.origin.sourceDataVersion, sourceDataVersion);
  assert.match(consumed?.message ?? "", /人脉分析/u);
  assert.equal(
    consumeAiTemplatePrefill({ id: validIntent, actorId: "actor:one", baseUrl: "https://orbit.test" }),
    null,
  );
});

test("goal save sends only the trimmed goal and concurrency fields while reusing one failed attempt", () => {
  const scope = {
    actorId: "actor:one",
    baseUrl: "https://orbit.test",
    expectedUpdatedAt: "2026-09-15T00:00:00.000Z",
    profileId: "profile:one",
  };
  const first = createRelationshipGoalSaveAttempt(
    { ...scope, relationshipGoal: "  认识东京制造业伙伴  " },
    null,
    () => "first",
  );
  const retry = createRelationshipGoalSaveAttempt(
    { ...scope, relationshipGoal: "认识东京制造业伙伴" },
    first,
    () => "must-not-be-used",
  );

  assert.deepEqual(first.body, {
    expectedUpdatedAt: scope.expectedUpdatedAt,
    mutationId: "ios:relationship-goal:first",
    relationshipGoal: "认识东京制造业伙伴",
  });
  assert.deepEqual(Object.keys(first.body).sort(), ["expectedUpdatedAt", "mutationId", "relationshipGoal"]);
  assert.equal(retry.mutationId, first.mutationId);

  const cleared = createRelationshipGoalSaveAttempt(
    { ...scope, relationshipGoal: "   " },
    first,
    () => "clear",
  );
  assert.equal(cleared.body.relationshipGoal, "");
  assert.equal(cleared.mutationId, "ios:relationship-goal:clear");
});

test("goal save accepts only a newer exact receipt in the initiating actor/server scope", () => {
  const attempt = createRelationshipGoalSaveAttempt({
    actorId: "actor:one",
    baseUrl: "https://orbit.test",
    expectedUpdatedAt: "2026-09-15T00:00:00.000Z",
    profileId: "profile:one",
    relationshipGoal: "新目标",
  }, null, () => "app:relationship-goal:one");
  const receipt = {
    editor: { lastSavedAt: "2026-09-15T00:00:01.000Z" },
    mutationId: attempt.mutationId,
    profile: {
      id: "profile:one",
      relationshipGoal: "新目标",
      updatedAt: "2026-09-15T00:00:01.000Z",
    },
  };
  const scope = {
    actorId: "actor:one",
    baseUrl: "https://orbit.test",
    profileId: "profile:one",
  };

  assert.deepEqual(acceptRelationshipGoalSaveReceipt(attempt, receipt, scope), {
    ok: true,
    relationshipGoal: "新目标",
    updatedAt: "2026-09-15T00:00:01.000Z",
  });
  for (const [label, candidate, currentScope] of [
    ["wrong actor", receipt, { ...scope, actorId: "actor:other" }],
    ["wrong server", receipt, { ...scope, baseUrl: "https://other.test" }],
    ["wrong profile", { ...receipt, profile: { ...receipt.profile, id: "profile:other" } }, scope],
    ["wrong value", { ...receipt, profile: { ...receipt.profile, relationshipGoal: "别的目标" } }, scope],
    ["wrong mutation", { ...receipt, mutationId: "another" }, scope],
    ["nonadvancing version", { ...receipt, editor: { lastSavedAt: attempt.body.expectedUpdatedAt }, profile: { ...receipt.profile, updatedAt: attempt.body.expectedUpdatedAt } }, scope],
    ["mismatched saved time", { ...receipt, editor: { lastSavedAt: "2026-09-15T00:00:02.000Z" } }, scope],
    ["fake 2xx body", { relationshipGoal: "新目标" }, scope],
  ] as const) {
    assert.deepEqual(
      acceptRelationshipGoalSaveReceipt(attempt, candidate, currentScope),
      { ok: false },
      label,
    );
  }
});
