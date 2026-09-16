import assert from "node:assert/strict";
import test from "node:test";

import type { ContactNeedsMatchesPayloadContract } from "../src/api/contract/contact-needs";
import { contactNeedsToView } from "../src/view-models/contact-needs";
import { contactsAnalysisReportToView } from "../src/view-models/contacts-analysis";

function payload(overrides: Partial<ContactNeedsMatchesPayloadContract> = {}): ContactNeedsMatchesPayloadContract {
  return {
    schemaVersion: 1,
    state: "ready",
    goal: "寻找日本制造业合作伙伴",
    goalVersion: "2026-09-15T00:00:00.000Z",
    dataVersion: "a".repeat(64),
    scoringVersion: "needs-lexical-v1",
    generatedAt: "2026-09-15T00:00:01.000Z",
    criteria: [
      { id: "location:japan", label: "日本", type: "location" },
      { id: "industry:manufacturing_supply_chain", label: "制造与供应链", type: "industry" },
    ],
    matches: [
      {
        contactId: "contact:high", displayName: "田中健", role: "采购负责人", organization: "关东精工", location: "东京",
        score: 100, status: "matched", reason: "匹配：日本、制造与供应链", missingFields: [],
        criteria: [
          { id: "location:japan", label: "日本", type: "location", matched: true, evidenceField: "location", evidenceExcerpt: "日本东京" },
          { id: "industry:manufacturing_supply_chain", label: "制造与供应链", type: "industry", matched: true, evidenceField: "industry", evidenceExcerpt: "manufacturing_supply_chain" },
        ],
      },
      {
        contactId: "contact:none", displayName: "Alex", role: "Investor", organization: "Northstar", location: "美国",
        score: 0, status: "no_match", reason: "现有资料未命中当前需求条件。", missingFields: [],
        criteria: [
          { id: "location:japan", label: "日本", type: "location", matched: false, evidenceField: null, evidenceExcerpt: null },
          { id: "industry:manufacturing_supply_chain", label: "制造与供应链", type: "industry", matched: false, evidenceField: null, evidenceExcerpt: null },
        ],
      },
      {
        contactId: "contact:sparse", displayName: "林悦", role: "", organization: "", location: "",
        score: null, status: "insufficient_data", reason: "缺少评估当前需求所需的联系人资料。", missingFields: ["location", "industry"], criteria: [],
      },
    ],
    provenance: {
      generationMethod: "rule-based-contact-needs-ranking",
      databaseQueryExecuted: true,
      aiProviderRequested: false,
      externalNetworkRequested: false,
      businessDataWritten: false,
    },
    ...overrides,
  };
}

test("contact needs view preserves server order and separates insufficient data", () => {
  const view = contactNeedsToView(payload());
  assert.deepEqual(view.scored.map((item) => [item.contactId, item.score]), [
    ["contact:high", 100],
    ["contact:none", 0],
  ]);
  assert.deepEqual(view.insufficient.map((item) => [item.contactId, item.score]), [["contact:sparse", null]]);
  assert.deepEqual(view.criteria, [
    { id: "location:japan", label: "日本" },
    { id: "industry:manufacturing_supply_chain", label: "制造与供应链" },
  ]);
  assert.deepEqual(view.scored[0]?.matchedCriteria, [
    { id: "location:japan", label: "日本" },
    { id: "industry:manufacturing_supply_chain", label: "制造与供应链" },
  ]);
  assert.deepEqual(view.scored[0]?.evidence, [
    { id: "location:japan", label: "日本", excerpt: "日本东京" },
    { id: "industry:manufacturing_supply_chain", label: "制造与供应链", excerpt: "manufacturing_supply_chain" },
  ]);
  assert.deepEqual(view.scored[0]?.unmatchedCriteria, []);
  assert.deepEqual(view.scored[1]?.unmatchedCriteria, [
    { id: "location:japan", label: "日本" },
    { id: "industry:manufacturing_supply_chain", label: "制造与供应链" },
  ]);
});

test("contact needs view keeps unconfigured and clarification states explicit", () => {
  const unconfigured = contactNeedsToView(payload({ state: "unconfigured", goal: "", goalVersion: null, criteria: [], matches: [] }));
  assert.equal(unconfigured.state, "unconfigured");
  assert.deepEqual(unconfigured.scored, []);
  const clarification = contactNeedsToView(payload({ state: "needs_clarification", criteria: [], matches: [] }));
  assert.equal(clarification.state, "needs_clarification");
});

test("v2 preserves actual components and original evidence; v1 never invents a v2 breakdown", () => {
  const old = payload();
  const criterion = { id: "scenario:restaurant", label: "餐饮业务", type: "industry" as const, dimension: "scenario" as const, matched: true, strength: "direct" as const, evidenceField: "profile", evidenceExcerpt: "Builds restaurant ordering systems" };
  const components = [{ dimension: "scenario" as const, baseWeight: 35, weight: 100, points: 100, criterionIds: [criterion.id] }];
  const summary = { code: "evidence" as const, criterionIds: [criterion.id] };
  const view = contactNeedsToView({ ...old, scoringVersion: "needs-evidence-v2", matches: [{ ...old.matches[0]!, criteria: [criterion], components, summary }] } as any);
  assert.deepEqual((view.scored[0] as any).components, components);
  assert.deepEqual((view.scored[0] as any).summary, summary);
  assert.equal(view.scored[0]?.evidence[0]?.excerpt, criterion.evidenceExcerpt);
  const legacy = contactNeedsToView({ ...old, matches: [{ ...old.matches[0]!, components, summary }] } as any);
  assert.deepEqual((legacy.scored[0] as any).components, []);
  assert.equal((legacy.scored[0] as any).summary, null);
});

test("saved analysis exposes stable action codes for empty, current, stale, and unavailable states", () => {
  const current = {
    analysisVersion: "contacts.analysis@1" as const,
    sourceDataVersion: "current-version",
  };
  assert.deepEqual(contactsAnalysisReportToView({ current, report: null, stale: false }, []), {
    action: "analyze",
    analysisVersion: "contacts.analysis@1",
    body: null,
    generatedAt: null,
    sourceDataVersion: "current-version",
    stale: false,
    state: "empty",
  });

  const report = {
    analysisVersion: "contacts.analysis@1" as const,
    body: "已保存的分析正文",
    generatedAt: "2026-09-15T00:00:00.000Z",
    messageId: "message:one",
    sessionId: "session:one",
    sourceDataVersion: "old-version",
  };
  const ready = contactsAnalysisReportToView({ current, report, stale: false }, []);
  assert.equal(ready.action, "reanalyze");
  assert.equal(ready.state, "ready");
  assert.equal(ready.stale, false);
  assert.equal(ready.sourceDataVersion, "current-version");

  const stale = contactsAnalysisReportToView({ current, report, stale: true }, []);
  assert.equal(stale.state, "ready");
  assert.equal(stale.stale, true);

  assert.deepEqual(contactsAnalysisReportToView({ current, report, stale: false }, ["analysis"]), {
    action: null,
    analysisVersion: null,
    body: null,
    generatedAt: null,
    sourceDataVersion: null,
    stale: false,
    state: "unavailable",
  });
});
