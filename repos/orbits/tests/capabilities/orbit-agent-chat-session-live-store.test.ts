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

  // 0112: the whole-session list is gone; the sidebar reads bounded summaries.
  const listed = (await provider.listSessionSummariesPage({ limit: 50 })).items;
  const restored = await provider.getSession(session.id);
  const sessionRecords = store.listRecords({
    limit: "unbounded",
    collectionName: ORBIT_AGENT_CHAT_SESSION_LIVE_RECORD_COLLECTIONS.sessions,
    workspaceId: orbitAgentChatSessionActorWorkspaceId(workspaceId, actorId),
  });
  const messageRecords = store.listRecords({
    limit: "unbounded",
    collectionName: ORBIT_AGENT_CHAT_SESSION_LIVE_RECORD_COLLECTIONS.messages,
    targetId: session.id,
    targetType: "conversation",
    workspaceId: orbitAgentChatSessionActorWorkspaceId(workspaceId, actorId),
  });

  assert.equal(listed.length, 1);
  assert.equal(listed[0].id, session.id);
  assert.equal(listed[0].organization.customTitle, "供应链重点人脉");
  assert.equal(listed[0].organization.pinned, true);
  assert.equal(listed[0].title, "供应链人脉");
  assert.equal(restored?.customTitle, "供应链重点人脉");
  assert.equal(restored?.pinned, true);
  assert.deepEqual(
    restored?.messages.map((message) => ({
      role: message.role,
      text: message.text,
    })),
    [
      { role: "user", text: "帮我找适合聊供应链的人" },
      { role: "assistant", text: "可以，先看北星食品附近的联系人。" },
    ],
  );
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

  const listed = (await provider.listSessionSummariesPage({ limit: 50 })).items;

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
    (await alice.listSessionSummariesPage({ limit: 50 })).items.map((session) => session.title),
    ["Alice private prompt"],
  );
  assert.deepEqual(
    (await bob.listSessionSummariesPage({ limit: 50 })).items.map((session) => session.title),
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
  assert.equal(await provider.deleteSession("delete-once-session"), true);
  assert.equal(await provider.getSession("delete-once-session"), null);
  assert.deepEqual((await provider.listSessionSummariesPage({ limit: 50 })).items, []);
});

test("R21 user deletion can be undone for five seconds by the same actor and deletion version", async () => {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  let at = Date.parse("2026-10-18T09:00:00.000Z");
  const options = { store, workspaceId: "workspace:undo", now: () => new Date(at) };
  const alice = createStorageOrbitAgentChatSessionProvider({ ...options, actorId: "actor:alice" });
  const bob = createStorageOrbitAgentChatSessionProvider({ ...options, actorId: "actor:bob" });
  await alice.upsertSession({
    createdAt: "2026-10-17T00:00:00.000Z", id: "session:undo", title: "復元する会話",
    updatedAt: "2026-10-17T00:01:00.000Z",
    messages: [{ id: "u1", role: "user", text: "質問" }, { id: "a1", role: "assistant", text: "回答" }],
  });
  const first = await alice.deleteSessionWithUndo("session:undo");
  assert.equal(first.deleted, true);
  assert.equal(first.undoUntil, "2026-10-18T09:00:05.000Z");
  assert.ok(first.undoToken);
  assert.equal(await alice.getSession("session:undo"), null);
  assert.equal(await bob.restoreDeletedSession("session:undo", first.undoToken!), false);
  assert.equal(await alice.restoreDeletedSession("session:undo", `${first.undoToken}bad`), false);
  at += 4_999;
  assert.equal(await alice.restoreDeletedSession("session:undo", first.undoToken!), true);
  assert.deepEqual((await alice.getSession("session:undo"))?.messages.map((message) => message.text), ["質問", "回答"]);
  const second = await alice.deleteSessionWithUndo("session:undo");
  assert.equal(await alice.restoreDeletedSession("session:undo", first.undoToken!), false, "the previous deletion version cannot restore a later tombstone");
  at += 5_001;
  assert.equal(await alice.restoreDeletedSession("session:undo", second.undoToken!), false);
  assert.equal(await alice.getSession("session:undo"), null);
});

test("R21 retention expires only unpinned sessions after Tokyo day 90 and is idempotent", async () => {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const workspaceId = "workspace:retention";
  const aliceId = "actor:retention-alice";
  const alice = createStorageOrbitAgentChatSessionProvider({ actorId: aliceId, store, workspaceId });
  const bob = createStorageOrbitAgentChatSessionProvider({ actorId: "actor:retention-bob", store, workspaceId });
  const now = new Date("2026-10-18T03:00:00.000Z"); // Tokyo: Oct 18, 12:00.
  const activity = (daysAgo: number) => new Date(now.getTime() - daysAgo * 86_400_000).toISOString();
  for (const [id, daysAgo] of [["day89", 89], ["day90", 90], ["day91", 91], ["pinned91", 91], ["updated", 91]] as const) {
    await alice.upsertSession({ id, title: id, createdAt: activity(daysAgo), updatedAt: activity(daysAgo), pinned: id === "pinned91", messages: [{ id: `${id}:user`, role: "user", text: id }] });
  }
  await alice.upsertSession({ id: "updated", title: "updated", createdAt: activity(91), updatedAt: activity(89), messages: [{ id: "updated:user", role: "user", text: "new activity" }] });
  await bob.upsertSession({ id: "day91", title: "Bob private", createdAt: activity(91), updatedAt: activity(91), messages: [{ id: "bob:user", role: "user", text: "Bob private" }] });

  assert.equal(await alice.deleteExpiredSession("day89", now, async () => false), false);
  assert.equal(await alice.deleteExpiredSession("day90", now, async () => false), false);
  assert.equal(await alice.deleteExpiredSession("updated", now, async () => false), false);
  let pinned = true;
  assert.equal(await alice.deleteExpiredSession("pinned91", now, async () => pinned), false);
  assert.equal(await alice.deleteExpiredSession("day91", now, async () => false), true);
  assert.equal(await alice.deleteExpiredSession("day91", now, async () => false), false);
  pinned = false;
  assert.equal(await alice.deleteExpiredSession("pinned91", now, async () => pinned), true);
  assert.equal(await alice.deleteExpiredSession("pinned91", now, async () => pinned), false);

  assert.deepEqual((await alice.listSessionSummariesPage({ limit: 50 })).items.map((item) => item.id).sort(), ["day89", "day90", "updated"]);
  assert.equal(await alice.getSession("day91"), null);
  assert.equal((await bob.getSession("day91"))?.title, "Bob private");
  assert.equal(store.listRecords({ collectionName: ORBIT_AGENT_CHAT_SESSION_LIVE_RECORD_COLLECTIONS.messages, targetId: "day91", targetType: "conversation", workspaceId: orbitAgentChatSessionActorWorkspaceId(workspaceId, aliceId), limit: "unbounded" }).length, 0);
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

  // 0112: reads are paged (20 by default); walking the cursor returns all 101 in order.
  const pages: string[][] = [];
  let cursor: string | null = null;
  do {
    const page = await provider.getSessionPage("long-session", { cursor });
    assert.ok(page && page.session.messages.length <= 20);
    pages.unshift(page!.session.messages.map((message) => message.id!));
    cursor = page!.page.nextCursor;
  } while (cursor);
  assert.equal(pages.length, 6);
  assert.deepEqual(pages.flat(), messages.map((message) => message.id));
});
