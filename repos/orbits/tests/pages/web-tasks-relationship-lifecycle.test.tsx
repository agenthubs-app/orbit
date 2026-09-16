import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { create } from "react-test-renderer";
import {
  loadRelationshipLifecycleTasks,
  type RelationshipLifecycleTaskReadModel,
} from "../../app/(app)/app/tasks/relationship-lifecycle-tasks";
import { RelationshipLifecycleTasksSection } from "../../app/(app)/app/tasks/relationship-lifecycle-tasks-section";
import type { LiveFollowupGraph } from "../../features/followups/storage/followup-live-record-provider";

const source = { type: "manual" as const, id: "source:relationship" };
const evidenceIds = ["evidence:relationship"] as const;

const graph: LiveFollowupGraph = {
  connections: [
    {
      id: "connection_for_contact:ren",
      accountId: "actor:one",
      contactId: "contact:ren",
      stage: "needs_follow_up",
      valueTypes: ["community_context"],
      summary: "Shared relationship context",
      suggestedActions: ["Review the relationship context"],
      source,
      evidenceIds,
      createdAt: "2026-09-07T00:00:00.000Z",
      updatedAt: "2026-09-07T00:00:00.000Z",
    },
  ],
  contacts: [
    {
      id: "contact:ren",
      displayName: "Ren Ito",
      organization: "Orbit Labs",
      stage: "needs_follow_up",
      source,
      evidenceIds,
      createdAt: "2026-09-07T00:00:00.000Z",
      updatedAt: "2026-09-07T00:00:00.000Z",
    },
  ],
  evidence: [
    {
      id: "evidence:relationship",
      sourceType: "manual",
      sourceId: "source:relationship",
      summary: "Shared relationship context",
      occurredAt: "2026-09-07T00:00:00.000Z",
      confidence: 1,
      createdBy: "actor:one",
    },
  ],
  generatedAt: "2026-09-07T00:00:00.000Z",
  tasks: [
    {
      id: "legacy:open",
      title: "确认会面后的下一步",
      status: "open",
      contactId: "contact:ren",
      connectionId: "connection_for_contact:ren",
      dueAt: "2026-09-10T00:00:00.000Z",
      source,
      evidenceIds,
      createdAt: "2026-09-07T00:00:00.000Z",
      updatedAt: "2026-09-07T00:00:00.000Z",
    },
    {
      id: "legacy:scheduled",
      title: "发送资料并确认时间",
      status: "scheduled",
      connectionId: "connection_for_contact:ren",
      dueAt: "2026-09-11T00:00:00.000Z",
      source,
      evidenceIds,
      createdAt: "2026-09-07T00:00:00.000Z",
      updatedAt: "2026-09-07T00:00:00.000Z",
    },
    {
      id: "legacy:unlinked",
      title: "普通历史任务",
      status: "open",
      source,
      evidenceIds,
      createdAt: "2026-09-07T00:00:00.000Z",
      updatedAt: "2026-09-07T00:00:00.000Z",
    },
    {
      id: "legacy:completed",
      title: "已完成的关系回顾",
      status: "completed",
      contactId: "contact:ren",
      connectionId: "connection_for_contact:ren",
      dueAt: "2026-09-06T00:00:00.000Z",
      source,
      evidenceIds,
      createdAt: "2026-09-06T00:00:00.000Z",
      updatedAt: "2026-09-07T00:00:00.000Z",
    },
    {
      id: "legacy:dismissed",
      title: "已忽略的关系提醒",
      status: "dismissed",
      connectionId: "connection_for_contact:ren",
      source,
      evidenceIds,
      createdAt: "2026-09-06T00:00:00.000Z",
      updatedAt: "2026-09-07T00:00:00.000Z",
    },
    {
      id: "legacy:orphan-contact",
      title: "缺失联系人的跟进",
      status: "open",
      contactId: "contact:missing",
      source,
      evidenceIds,
      createdAt: "2026-09-07T00:00:00.000Z",
      updatedAt: "2026-09-07T00:00:00.000Z",
    },
    {
      id: "legacy:orphan-connection",
      title: "缺失连接的跟进",
      status: "scheduled",
      connectionId: "connection:missing",
      source,
      evidenceIds,
      createdAt: "2026-09-07T00:00:00.000Z",
      updatedAt: "2026-09-07T00:00:00.000Z",
    },
  ],
};

test("relationship task read stays actor-scoped and keeps legacy lifecycle semantics", async () => {
  let requestedActor: string | null = null;
  const result = await loadRelationshipLifecycleTasks({
    actorId: "actor:one",
    provider: {
      source: "test:followups",
      sourceLabel: "Test followups",
      readFollowupGraph: async (actorId) => {
        requestedActor = actorId;
        return graph;
      },
    },
  });

  assert.equal(requestedActor, "actor:one");
  assert.equal(result.state, "success");
  assert.deepEqual(result.currentTasks.map((task) => task.id), ["legacy:open", "legacy:scheduled"]);
  assert.deepEqual(result.historyTasks.map((task) => task.id), ["legacy:completed", "legacy:dismissed"]);
  assert.equal(result.currentCount, 2);
  assert.equal(result.historyCount, 2);
  assert.equal(result.orphanCount, 3);
  assert.equal(result.currentTasks[0]?.status, "open");
  assert.equal(result.currentTasks[1]?.status, "scheduled");
  assert.equal(result.historyTasks[0]?.status, "completed");
  assert.equal(result.historyTasks[1]?.status, "dismissed");
  assert.equal(result.currentTasks[1]?.dueAt, "2026-09-11T00:00:00.000Z");
  assert.equal(result.currentTasks[0]?.contactName, "Ren Ito");
  assert.equal(result.currentTasks[0]?.operationHref, "/app/contacts/contact%3Aren");
  assert.equal(result.orphanTasks[0]?.operationHref, null);
  assert.match(result.orphanTasks[0]?.issue ?? "", /联系人|关系连接/);
});

test("unconfigured relationship storage produces an explicit empty read state", async () => {
  const result = await loadRelationshipLifecycleTasks({
    actorId: "actor:one",
    provider: null,
  });

  assert.equal(result.state, "unavailable");
  assert.deepEqual(result.currentTasks, []);
  assert.deepEqual(result.historyTasks, []);
  assert.deepEqual(result.orphanTasks, []);
});

test("relationship task counts keep the expected 66 current and 14 history split", async () => {
  const currentTasks = Array.from({ length: 66 }, (_, index) => ({
    ...graph.tasks[0]!,
    id: `legacy:current:${index}`,
    status: (index < 49 ? "open" : "scheduled") as "open" | "scheduled",
  }));
  const historyTasks = Array.from({ length: 14 }, (_, index) => ({
    ...graph.tasks[0]!,
    id: `legacy:history:${index}`,
    status: (index < 7 ? "completed" : "dismissed") as "completed" | "dismissed",
  }));
  const result = await loadRelationshipLifecycleTasks({
    actorId: "actor:one",
    provider: {
      source: "test:followups",
      sourceLabel: "Test followups",
      readFollowupGraph: async () => ({
        ...graph,
        tasks: [...currentTasks, ...historyTasks],
      }),
    },
  });

  assert.equal(result.state, "success");
  assert.equal(result.currentCount, 66);
  assert.equal(result.historyCount, 14);
  assert.equal(result.orphanCount, 0);
});

test("relationship section stays honest and sends the user to contact review", () => {
  const model: RelationshipLifecycleTaskReadModel = {
    state: "success",
    sourceLabel: "Test followups",
    currentTasks: [
      {
        id: "legacy:open",
        title: "确认会面后的下一步",
        status: "open",
        dueAt: "2026-09-10T00:00:00.000Z",
        contactId: "contact:ren",
        connectionId: "connection_for_contact:ren",
        contactName: "Ren Ito",
        organization: "Orbit Labs",
        relationshipStage: "needs_follow_up",
        operationHref: "/app/contacts/contact%3Aren",
        updatedAt: "2026-09-07T00:00:00.000Z",
      },
    ],
    historyTasks: [
      {
        id: "legacy:dismissed",
        title: "已忽略的关系提醒",
        status: "dismissed",
        contactId: "contact:ren",
        connectionId: "connection_for_contact:ren",
        contactName: "Ren Ito",
        organization: "Orbit Labs",
        relationshipStage: "needs_follow_up",
        operationHref: "/app/contacts/contact%3Aren",
        updatedAt: "2026-09-07T00:00:00.000Z",
      },
    ],
    orphanTasks: [
      {
        id: "legacy:orphan-contact",
        title: "缺失联系人的跟进",
        status: "open",
        contactId: "contact:missing",
        connectionId: null,
        contactName: "未关联联系人",
        organization: "",
        relationshipStage: null,
        operationHref: null,
        issue: "联系人未在关系图中找到",
        updatedAt: "2026-09-07T00:00:00.000Z",
      },
    ],
    currentCount: 1,
    historyCount: 1,
    orphanCount: 1,
  };
  const root = create(<RelationshipLifecycleTasksSection model={model} />);
  const rendered = JSON.stringify(root.toJSON());

  assert.match(rendered, /人脉跟进/);
  assert.match(rendered, /跟进完成操作尚未接入此页面；当前仅查看记录。/);
  assert.match(rendered, /2026/);
  assert.match(rendered, /当前跟进（1）/);
  assert.match(rendered, /历史跟进（1）/);
  assert.match(rendered, /未关联，暂不可查看/);
  assert.doesNotMatch(rendered, /outcome|通用 API|真实记录/iu);
  assert.equal(root.root.findAllByProps({ href: "/app/contacts/contact%3Aren" }).length, 2);
  assert.equal(root.root.findAllByProps({ href: "/app/contacts/contact%3Amissing" }).length, 0);
  assert.equal(root.root.findAllByType("button").length, 0);
  assert.equal(root.root.findAllByType("input").length, 0);
});

test("contact detail currently exposes review-only relationship entry, not completion or next-step controls", () => {
  const source = readFileSync(new URL("../../app/(app)/app/contacts/orbit-real-card-connection.tsx", import.meta.url), "utf8");

  assert.match(source, /Source-backed · read only/);
  assert.match(source, /View relationship progress/);
  assert.doesNotMatch(source, /Complete follow-up|Confirm next step|选择下一步/iu);
});
