import assert from "node:assert/strict";
import test from "node:test";

import {
  createContactsAnalysisReportProvider,
  createContactsAnalysisSourceDataVersion,
  verifyContactsAnalysisSourceVersion,
} from "../../features/mobile/contacts-analysis-report-provider";
import {
  createStorageOrbitAgentChatSessionProvider,
  type OrbitAgentChatSessionProvider,
  type OrbitAgentChatSessionSnapshot,
} from "../../features/orbit-ai/storage/orbit-agent-chat-session-live-record-provider";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

const VERSION_A = "a".repeat(64);
const VERSION_B = "b".repeat(64);

const emptySource = {
  aggregate: {
    state: "empty" as const,
    relationshipAssetTotals: { contacts: 0, connections: 0, evidenceBackedRelationships: 0, eventsRepresented: 0 },
    newContacts: { count: 0, windowLabel: "30 days", contacts: [] },
    highValueCount: 0,
    highValueRelationships: [],
    pendingFollowups: { count: 0, tasks: [] },
    dormantContacts: { count: 0, contacts: [] },
    recentActivity: [],
    summary: "暂无联系人",
    nextAction: "添加联系人",
  },
  contacts: null,
  distributions: null,
  gaps: null,
  opportunities: null,
  profile: null,
  summary: null,
};

test("analysis source version is stable across response time and unordered source collections", () => {
  const first = createContactsAnalysisSourceDataVersion({
    generatedAt: "2026-09-15T01:00:00.000Z",
    contacts: [
      { id: "contact:b", tags: ["investor", "tokyo"] },
      { id: "contact:a", tags: ["founder"] },
    ],
    opportunities: {
      actionBrief: { evaluatedAt: "2026-09-15T01:00:00.000Z", title: "联系小林" },
      provenance: { collectedAt: "2026-09-15T01:00:00.000Z", provider: "live-store" },
    },
    profile: { displayName: "小宇", relationshipGoal: "找到合作伙伴" },
  });
  const second = createContactsAnalysisSourceDataVersion({
    profile: { relationshipGoal: "找到合作伙伴", displayName: "小宇" },
    contacts: [
      { tags: ["founder"], id: "contact:a" },
      { tags: ["tokyo", "investor"], id: "contact:b" },
    ],
    opportunities: {
      provenance: { provider: "live-store", collectedAt: "2026-09-15T02:00:00.000Z" },
      actionBrief: { title: "联系小林", evaluatedAt: "2026-09-15T02:00:00.000Z" },
    },
    generatedAt: "2026-09-15T02:00:00.000Z",
  });

  assert.match(first, /^[a-f0-9]{64}$/);
  assert.equal(second, first);
  assert.notEqual(
    createContactsAnalysisSourceDataVersion({ contacts: [{ id: "contact:c" }] }),
    first,
  );
  assert.notEqual(
    createContactsAnalysisSourceDataVersion({ actionBrief: { steps: ["call", "email"] } }),
    createContactsAnalysisSourceDataVersion({ actionBrief: { steps: ["email", "call"] } }),
  );
});

test("analysis provider returns empty without writing or generating when no report exists", async () => {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const sessionProvider = createStorageOrbitAgentChatSessionProvider({
    actorId: "account:empty",
    store,
    workspaceId: "workspace:analysis",
  });
  let writes = 0;
  const provider = createContactsAnalysisReportProvider({
    sessionProvider: {
      ...sessionProvider,
      upsertSession: async (session) => {
        writes += 1;
        return sessionProvider.upsertSession(session);
      },
    },
  });

  const result = await provider.getAnalysis({ source: emptySource });

  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.data.current.analysisVersion, "contacts.analysis@1");
  assert.match(result.data.current.sourceDataVersion, /^[a-f0-9]{64}$/);
  assert.equal(result.data.report, null);
  assert.equal(result.data.stale, false);
  assert.equal(writes, 0);
});

test("server verification accepts only the actor dashboard's current source version", () => {
  const current = createContactsAnalysisSourceDataVersion(emptySource);
  assert.deepEqual(verifyContactsAnalysisSourceVersion({ claimed: current, source: emptySource }), {
    analysisVersion: "contacts.analysis@1",
    kind: "contacts_analysis_execution",
    sourceDataVersion: current,
  });
  assert.equal(verifyContactsAnalysisSourceVersion({ claimed: VERSION_A, source: emptySource }), null);
});

test("analysis provider finds the newest trusted persisted report beyond the default session page", async () => {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const ownerSessions = createStorageOrbitAgentChatSessionProvider({
    actorId: "account:owner",
    store,
    workspaceId: "workspace:analysis",
  });
  const otherSessions = createStorageOrbitAgentChatSessionProvider({
    actorId: "account:other",
    store,
    workspaceId: "workspace:analysis",
  });

  for (let index = 0; index < 13; index += 1) {
    const at = `2026-09-15T02:${String(index).padStart(2, "0")}:00.000Z`;
    await ownerSessions.upsertSession({
      createdAt: at,
      id: `session:decoy:${index}`,
      messages: [{ createdAt: at, id: `message:decoy:${index}`, role: "user", text: "普通问题" }],
      pinned: true,
      title: "普通问题",
      updatedAt: at,
    });
  }
  await persistFixtureSession(ownerSessions, {
    createdAt: "2026-09-15T01:00:00.000Z",
    id: "session:analysis:old",
    messages: [
      { createdAt: "2026-09-15T01:00:00.000Z", id: "message:user:old", role: "user", text: "分析人脉" },
      { createdAt: "2026-09-15T01:00:01.000Z", id: "message:assistant:old", role: "assistant", text: "旧报告" },
      { createdAt: "2026-09-15T01:01:00.000Z", id: "message:user:followup", role: "user", text: "解释第二段" },
      { createdAt: "2026-09-15T01:01:01.000Z", id: "message:assistant:followup", role: "assistant", text: "后续解释，不是报告" },
    ],
    origin: analysisOrigin(VERSION_A, "message:user:old", "2026-09-15T01:00:00.000Z"),
    title: "人脉分析",
    updatedAt: "2026-09-15T01:01:01.000Z",
  });
  await persistFixtureSession(ownerSessions, {
    createdAt: "2026-09-15T04:00:00.000Z",
    id: "session:analysis:cancelled",
    messages: [
      { createdAt: "2026-09-15T04:00:00.000Z", id: "message:user:cancelled", role: "user", text: "分析人脉" },
    ],
    origin: analysisOrigin(VERSION_B, "message:user:cancelled", "2026-09-15T04:00:00.000Z"),
    title: "未完成的人脉分析",
    updatedAt: "2026-09-15T04:00:00.000Z",
  });
  await persistFixtureSession(otherSessions, {
    createdAt: "2026-09-15T03:00:00.000Z",
    id: "session:analysis:other",
    messages: [
      { createdAt: "2026-09-15T03:00:00.000Z", id: "message:user:other", role: "user", text: "分析人脉" },
      { createdAt: "2026-09-15T03:00:01.000Z", id: "message:assistant:other", role: "assistant", text: "别人的报告" },
    ],
    origin: analysisOrigin(VERSION_B, "message:user:other", "2026-09-15T03:00:00.000Z"),
    title: "人脉分析",
    updatedAt: "2026-09-15T03:00:01.000Z",
  });

  const provider = createContactsAnalysisReportProvider({ sessionProvider: ownerSessions });
  const result = await provider.getAnalysis({
    source: {
      ...emptySource,
      aggregate: {
        ...emptySource.aggregate,
        relationshipAssetTotals: {
          ...emptySource.aggregate.relationshipAssetTotals,
          contacts: 1,
        },
      },
    },
  });

  assert.equal(result.success, true);
  if (!result.success) return;
  assert.deepEqual(result.data.report, {
    analysisVersion: "contacts.analysis@1",
    body: "旧报告",
    generatedAt: "2026-09-15T01:00:01.000Z",
    messageId: "message:assistant:old",
    sessionId: "session:analysis:old",
    sourceDataVersion: VERSION_A,
  });
  assert.equal(result.data.stale, true);
});

test("analysis provider reports storage failure as optional-section unavailability", async () => {
  const provider = createContactsAnalysisReportProvider({ sessionProvider: null });

  assert.deepEqual(await provider.getAnalysis({ source: emptySource }), {
    success: false,
    error: "unavailable",
  });
});

test("analysis provider ignores unverified origins and replies after a later user turn", async () => {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const sessions = createStorageOrbitAgentChatSessionProvider({
    actorId: "account:trust-boundary",
    store,
    workspaceId: "workspace:analysis",
  });
  await persistFixtureSession(sessions, {
    createdAt: "2026-09-15T05:00:00.000Z",
    id: "session:unverified",
    messages: [
      { createdAt: "2026-09-15T05:00:00.000Z", id: "message:user:unverified", role: "user", text: "Write a poem" },
      { createdAt: "2026-09-15T05:00:01.000Z", id: "message:assistant:unverified", role: "assistant", text: "A poem" },
    ],
    origin: analysisOrigin(VERSION_A, "message:user:unverified", "2026-09-15T05:00:00.000Z", false),
    title: "Unverified",
    updatedAt: "2026-09-15T05:00:01.000Z",
  });
  await persistFixtureSession(sessions, {
    createdAt: "2026-09-15T06:00:00.000Z",
    id: "session:late-reply",
    messages: [
      { createdAt: "2026-09-15T06:00:00.000Z", id: "message:user:analysis", role: "user", text: "分析人脉" },
      { createdAt: "2026-09-15T06:01:00.000Z", id: "message:user:other", role: "user", text: "讲个笑话" },
      { createdAt: "2026-09-15T06:01:01.000Z", id: "message:assistant:other", role: "assistant", text: "无关回复" },
    ],
    origin: analysisOrigin(VERSION_A, "message:user:analysis", "2026-09-15T06:00:00.000Z", false),
    title: "Interrupted analysis",
    updatedAt: "2026-09-15T06:01:01.000Z",
  });

  const result = await createContactsAnalysisReportProvider({ sessionProvider: sessions }).getAnalysis({ source: emptySource });

  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.data.report, null);
});

function analysisOrigin(sourceDataVersion: string, firstUserMessageId: string, recordedAt: string, verified = true) {
  return {
    entryClient: "app" as const,
    entryPointId: "contacts.analysis" as const,
    firstSentText: "分析人脉",
    firstUserMessageId,
    initialGroupId: null,
    kind: "structured" as const,
    recordedAt,
    references: [],
    schemaVersion: 1 as const,
    sourceDataVersion,
    template: { id: "contacts.analysis", version: 1 },
    ...(verified ? { verification: {
      analysisVersion: "contacts.analysis@1" as const,
      kind: "contacts_analysis_execution" as const,
      sourceDataVersion,
    } } : {}),
  };
}

async function persistFixtureSession(
  provider: OrbitAgentChatSessionProvider,
  session: OrbitAgentChatSessionSnapshot,
) {
  const verification = session.origin?.entryClient !== "unknown"
    ? session.origin?.verification
    : undefined;
  const origin = session.origin?.entryClient !== "unknown"
    ? { ...session.origin, verification: undefined }
    : session.origin;
  const canVerify = verification && session.messages[0]?.role === "user" && session.messages[1]?.role === "assistant";
  const initial = canVerify ? { ...session, messages: session.messages.slice(0, 2), origin } : { ...session, origin };
  await provider.upsertSession(initial);
  if (verification && canVerify) {
    await provider.upsertVerifiedAnalysisSession(initial, verification);
    if (session.messages.length > 2) await provider.upsertSession({ ...session, origin: undefined });
  }
}
