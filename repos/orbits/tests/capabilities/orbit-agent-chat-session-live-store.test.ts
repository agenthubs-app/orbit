import assert from "node:assert/strict";
import test from "node:test";

import {
  ORBIT_AGENT_CHAT_SESSION_LIVE_RECORD_COLLECTIONS,
  createStorageOrbitAgentChatSessionProvider,
  orbitAgentChatSessionActorWorkspaceId,
} from "../../features/orbit-ai/storage/orbit-agent-chat-session-live-record-provider";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

test("Orbit Agent chat session provider persists sessions and messages in live records", async () => {
  const workspaceId = "workspace:orbit-agent-chat-session-test";
  const actorId = "account:session-owner";
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const provider = createStorageOrbitAgentChatSessionProvider({
    actorId,
    store,
    workspaceId,
  });
  const session = {
    createdAt: "2026-07-09T02:00:00.000Z",
    customTitle: "供应链重点人脉",
    id: "agent-session-demo",
    messages: [
      { role: "user" as const, text: "帮我找适合聊供应链的人" },
      {
        items: [],
        kind: "people" as const,
        panelTitle: "人脉推荐",
        role: "assistant" as const,
        text: "可以，先看北星食品附近的联系人。",
      },
    ],
    panel: {
      items: [],
      kind: "people",
      panelTitle: "人脉推荐",
    },
    pinned: true,
    title: "供应链人脉",
    updatedAt: "2026-07-09T02:30:00.000Z",
  };

  await provider.upsertSession(session);

  const listed = await provider.listSessions();
  const restored = await provider.getSession(session.id);
  const sessionRecords = store.listRecords({
    collectionName: ORBIT_AGENT_CHAT_SESSION_LIVE_RECORD_COLLECTIONS.sessions,
    workspaceId: orbitAgentChatSessionActorWorkspaceId(workspaceId, actorId),
  });
  const messageRecords = store.listRecords({
    collectionName: ORBIT_AGENT_CHAT_SESSION_LIVE_RECORD_COLLECTIONS.messages,
    targetId: session.id,
    targetType: "conversation",
    workspaceId: orbitAgentChatSessionActorWorkspaceId(workspaceId, actorId),
  });

  assert.equal(listed.length, 1);
  assert.equal(listed[0].id, session.id);
  assert.equal(listed[0].customTitle, "供应链重点人脉");
  assert.equal(listed[0].pinned, true);
  assert.equal(listed[0].title, "供应链人脉");
  assert.deepEqual(
    listed[0].messages.map((message) => ({
      role: message.role,
      text: message.text,
    })),
    [
      { role: "user", text: "帮我找适合聊供应链的人" },
      { role: "assistant", text: "可以，先看北星食品附近的联系人。" },
    ],
  );
  assert.deepEqual(restored, listed[0]);
  assert.equal(sessionRecords.length, 1);
  assert.equal(sessionRecords[0].createdAt, session.createdAt);
  assert.equal(sessionRecords[0].payload.customTitle, "供应链重点人脉");
  assert.equal(sessionRecords[0].payload.pinned, true);
  assert.equal(sessionRecords[0].payload.messageCount, 2);
  assert.equal(messageRecords.length, 2);
  assert.equal(messageRecords[0].payload.sessionId, session.id);
});

test("Orbit Agent chat session provider lists sessions by initial creation time", async () => {
  const workspaceId = "workspace:orbit-agent-chat-session-order-test";
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const provider = createStorageOrbitAgentChatSessionProvider({
    actorId: "account:session-order-owner",
    store,
    workspaceId,
  });

  await provider.upsertSession({
    createdAt: "2026-07-09T02:00:00.000Z",
    id: "older-session",
    messages: [{ role: "user", text: "第一段对话" }],
    title: "第一段对话",
    updatedAt: "2026-07-09T02:05:00.000Z",
  });
  await provider.upsertSession({
    createdAt: "2026-07-09T03:00:00.000Z",
    id: "newer-session",
    messages: [{ role: "user", text: "第二段对话" }],
    title: "第二段对话",
    updatedAt: "2026-07-09T03:05:00.000Z",
  });
  await provider.upsertSession({
    createdAt: "2026-07-09T02:00:00.000Z",
    id: "older-session",
    messages: [
      { role: "user", text: "第一段对话" },
      {
        items: [],
        kind: "people",
        panelTitle: "",
        role: "assistant",
        text: "重新打开后自动保存",
      },
    ],
    title: "第一段对话",
    updatedAt: "2026-07-09T04:30:00.000Z",
  });
  await provider.upsertSession({
    createdAt: "2026-07-09T01:00:00.000Z",
    id: "pinned-oldest-session",
    messages: [{ role: "user", text: "置顶对话" }],
    pinned: true,
    title: "置顶对话",
    updatedAt: "2026-07-09T01:05:00.000Z",
  });

  const listed = await provider.listSessions();

  assert.deepEqual(
    listed.map((session) => session.id),
    ["pinned-oldest-session", "newer-session", "older-session"],
  );
});

test("Orbit Agent chat session provider isolates the same session id by actor", async () => {
  const workspaceId = "workspace:orbit-agent-chat-session-isolation-test";
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const alice = createStorageOrbitAgentChatSessionProvider({
    actorId: "account:alice",
    store,
    workspaceId,
  });
  const bob = createStorageOrbitAgentChatSessionProvider({
    actorId: "account:bob",
    store,
    workspaceId,
  });

  await alice.upsertSession({
    createdAt: "2026-07-29T08:00:00.000Z",
    id: "shared-client-session-id",
    messages: [{ role: "user", text: "Alice private prompt" }],
    title: "Alice private prompt",
    updatedAt: "2026-07-29T08:00:00.000Z",
  });
  await bob.upsertSession({
    createdAt: "2026-07-29T08:01:00.000Z",
    id: "shared-client-session-id",
    messages: [{ role: "user", text: "Bob private prompt" }],
    title: "Bob private prompt",
    updatedAt: "2026-07-29T08:01:00.000Z",
  });

  assert.equal((await alice.getSession("shared-client-session-id"))?.title, "Alice private prompt");
  assert.equal((await bob.getSession("shared-client-session-id"))?.title, "Bob private prompt");
  assert.deepEqual(
    (await alice.listSessions()).map((session) => session.title),
    ["Alice private prompt"],
  );
  assert.deepEqual(
    (await bob.listSessions()).map((session) => session.title),
    ["Bob private prompt"],
  );

  await bob.deleteSession("shared-client-session-id");

  assert.equal(await bob.getSession("shared-client-session-id"), null);
  assert.equal((await alice.getSession("shared-client-session-id"))?.title, "Alice private prompt");
});
