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

test("Orbit Agent chat session deletion is idempotent", async () => {
  const workspaceId = "workspace:orbit-agent-chat-session-delete-idempotency";
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const provider = createStorageOrbitAgentChatSessionProvider({
    actorId: "account:delete-owner",
    store,
    workspaceId,
  });

  await provider.upsertSession({
    createdAt: "2026-07-30T18:52:05.854Z",
    id: "delete-once-session",
    messages: [
      { role: "user", text: "删除这段对话" },
      { role: "assistant", text: "删除后重复请求应保持收敛。" },
    ],
    title: "删除幂等",
    updatedAt: "2026-07-30T18:52:05.854Z",
  });

  assert.equal(await provider.deleteSession("delete-once-session"), true);
  assert.equal(await provider.deleteSession("delete-once-session"), false);
  assert.equal(await provider.getSession("delete-once-session"), null);
  assert.deepEqual(await provider.listSessions(), []);
});

test("Orbit Agent chat session provider rejects a stale shorter snapshot without deleting newer messages", async () => {
  const provider = createStorageOrbitAgentChatSessionProvider({
    actorId: "account:stale-writer",
    store: createMemoryLiveRecordStore<Record<string, unknown>>(),
    workspaceId: "workspace:orbit-agent-chat-session-stale-write",
  });
  const id = "shared-session";

  await provider.upsertSession({
    createdAt: "2026-09-14T00:00:00.000Z",
    id,
    messages: [
      { id: "message-1", role: "user", text: "第一问" },
      { id: "message-2", role: "assistant", text: "第一答" },
      { id: "message-3", role: "user", text: "第二问" },
      { id: "message-4", role: "assistant", text: "第二答" },
    ],
    title: "可靠会话",
    updatedAt: "2026-09-14T00:02:00.000Z",
  });

  await assert.rejects(
    provider.upsertSession({
      createdAt: "2026-09-14T00:00:00.000Z",
      id,
      messages: [
        { id: "message-1", role: "user", text: "第一问" },
        { id: "message-2", role: "assistant", text: "第一答" },
      ],
      title: "可靠会话",
      updatedAt: "2026-09-14T00:01:00.000Z",
    }),
    /stale session snapshot/i,
  );

  assert.deepEqual(
    (await provider.getSession(id))?.messages.map((message) => message.id),
    ["message-1", "message-2", "message-3", "message-4"],
  );
});

test("Orbit Agent chat session provider rejects late saves after deletion", async () => {
  const provider = createStorageOrbitAgentChatSessionProvider({
    actorId: "account:deleted-session-owner",
    store: createMemoryLiveRecordStore<Record<string, unknown>>(),
    workspaceId: "workspace:orbit-agent-chat-session-delete-race",
  });
  const session = {
    createdAt: "2026-09-14T00:00:00.000Z",
    id: "deleted-session",
    messages: [{ id: "message-1", role: "user" as const, text: "不要复活" }],
    title: "删除保护",
    updatedAt: "2026-09-14T00:01:00.000Z",
  };

  await provider.upsertSession(session);
  assert.equal(await provider.deleteSession(session.id), true);

  await assert.rejects(
    provider.upsertSession({
      ...session,
      messages: [
        ...session.messages,
        { id: "message-2", role: "assistant", text: "晚到回复" },
      ],
      updatedAt: "2026-09-14T00:02:00.000Z",
    }),
    /deleted session/i,
  );
  assert.equal(await provider.getSession(session.id), null);
});

test("Orbit Agent chat session provider retains more than one hundred immutable messages", async () => {
  const provider = createStorageOrbitAgentChatSessionProvider({
    actorId: "account:long-history-owner",
    store: createMemoryLiveRecordStore<Record<string, unknown>>(),
    workspaceId: "workspace:orbit-agent-chat-session-long-history",
  });
  const messages = Array.from({ length: 101 }, (_, index) => ({
    id: `message-${index + 1}`,
    role: index % 2 === 0 ? "user" as const : "assistant" as const,
    text: `消息 ${index + 1}`,
  }));

  await provider.upsertSession({
    createdAt: "2026-09-14T00:00:00.000Z",
    id: "long-session",
    messageRevision: messages.length,
    messages,
    title: "完整历史",
    updatedAt: "2026-09-14T00:10:00.000Z",
  });

  const restored = await provider.getSession("long-session");
  assert.equal(restored?.messages.length, 101);
  assert.deepEqual(restored?.messages.map((message) => message.id), messages.map((message) => message.id));
});
