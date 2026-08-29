import assert from "node:assert/strict";
import test from "node:test";

import { createOpportunityActionBrief } from "../../features/dashboard/opportunity-action-brief";
import type {
  ConnectionDTO,
  ContactDTO,
  TaskDTO,
} from "../../shared/domain/contracts";

const source = {
  id: "source:test",
  type: "manual" as const,
};

const contact: ContactDTO = {
  id: "contact:test",
  displayName: "佐藤健一",
  organization: "北星餐饮",
  role: "创始人",
  stage: "nurture",
  source,
  evidenceIds: ["evidence:contact"],
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-20T00:00:00.000Z",
};

const connection: ConnectionDTO = {
  id: "connection:test",
  accountId: "account:test",
  contactId: contact.id,
  stage: "nurture",
  valueTypes: ["commercial_opportunity"],
  summary: "对日本连锁零售合作有明确价值。",
  relationshipStrength: 80,
  businessRelevanceScore: 92,
  suggestedActions: ["确认关西门店合作时间"],
  source,
  evidenceIds: ["evidence:connection"],
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-20T00:00:00.000Z",
};

function task(dueAt?: string): TaskDTO {
  return {
    id: "task:test",
    title: "确认关西门店合作时间",
    status: "open",
    contactId: contact.id,
    connectionId: connection.id,
    ...(dueAt ? { dueAt } : {}),
    source,
    evidenceIds: ["evidence:task"],
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-20T00:00:00.000Z",
  };
}

test("createOpportunityActionBrief returns a deterministic evidence-backed brief", () => {
  const input = {
    connection,
    contact,
    now: "2026-08-25T08:00:00.000Z",
    task: task("2026-08-25T10:00:00.000Z"),
  };

  const first = createOpportunityActionBrief(input);
  const second = createOpportunityActionBrief(input);

  assert.deepEqual(first, second);
  assert.equal(first.ruleVersion, "opportunity-brief-v1");
  assert.equal(first.type, "follow_up");
  assert.equal(first.evaluatedAt, input.now);
  assert.deepEqual(first.priority, {
    total: 98,
    urgency: 30,
    relationshipValue: 23,
    goalRelevance: 20,
    evidenceCompleteness: 15,
    dormantRisk: 10,
  });
  assert.deepEqual(first.evidenceIds, [
    "evidence:task",
    "evidence:connection",
    "evidence:contact",
  ]);
  assert.equal(first.evidence.length, 3);
  assert.equal(first.evidence[2], "北星餐饮 · 创始人");
  assert.equal(first.steps.length, 3);
  assert.deepEqual(first.primaryAction, {
    contactId: contact.id,
    kind: "open_contact",
    label: "开始联系",
  });
  assert.deepEqual(first.secondaryAction, {
    contactId: contact.id,
    kind: "open_contact",
    label: "查看联系人",
  });
});

test("createOpportunityActionBrief handles missing and invalid dates without inventing evidence", () => {
  const withoutDate = createOpportunityActionBrief({
    connection: {
      ...connection,
      summary: "",
      suggestedActions: [],
      valueTypes: [],
    },
    contact,
    now: "2026-08-25T08:00:00.000Z",
    task: task(),
  });
  const invalidDate = createOpportunityActionBrief({
    connection,
    contact,
    now: "2026-08-25T08:00:00.000Z",
    task: task("not-a-date"),
  });

  assert.equal(withoutDate.priority.urgency, 5);
  assert.equal(withoutDate.priority.goalRelevance, 0);
  assert.match(withoutDate.judgment, /还没有设置时间/u);
  assert.ok(withoutDate.evidence.includes("还没有设置跟进时间"));
  assert.equal(
    withoutDate.evidence.some((item) => item.includes("明确价值")),
    false,
  );
  assert.equal(invalidDate.priority.urgency, 5);
  assert.ok(invalidDate.evidence.includes("还没有设置跟进时间"));
});

test("createOpportunityActionBrief caps all score components", () => {
  const brief = createOpportunityActionBrief({
    connection: {
      ...connection,
      businessRelevanceScore: 400,
    },
    contact,
    now: "2026-08-25T08:00:00.000Z",
    task: task("2026-08-20T08:00:00.000Z"),
  });

  assert.equal(brief.priority.relationshipValue, 25);
  assert.equal(brief.priority.total, 100);
});
