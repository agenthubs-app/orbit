import assert from "node:assert/strict";
import test from "node:test";

import type { ApiResult } from "../src/api/types";
import type { InboxFeedItem, InboxFeedReadAction } from "../src/view-models/inbox-feed";
import { runInboxReadBatch } from "../src/view-models/inbox-read-batch";

const meta = { featureMode: null, privacy: null, runtimeBoundary: null };
const receiptAt = "2026-09-15T10:01:00.000Z";

function item(id: string, action?: InboxFeedReadAction, read = false): InboxFeedItem {
  return {
    category: "task",
    id,
    occurredAt: "2026-09-15T10:00:00.000Z",
    read,
    ...(action ? { readAction: action } : {}),
    subtitle: "来源",
    title: id,
  };
}

function notificationAction(id: string): InboxFeedReadAction {
  return {
    body: { state: "read" },
    endpoint: `/api/notifications/${encodeURIComponent(id)}/state`,
    expected: { notificationId: id, state: "read" },
  };
}

function conversationAction(id: string, messageId: string): InboxFeedReadAction {
  return {
    body: { lastReadMessageId: messageId },
    endpoint: `/api/relationship-communication/conversations/${encodeURIComponent(id)}/read`,
    expected: { conversationId: id, lastReadMessageId: messageId },
  };
}

function success(data: unknown): ApiResult<unknown> {
  return { data, meta, status: 200, success: true };
}

test("an empty or already-read snapshot performs no writes", async () => {
  let calls = 0;
  const execute = async () => { calls += 1; return success({}); };

  assert.deepEqual(await runInboxReadBatch({ execute, isCurrent: () => true, items: [] }), {
    confirmedIds: [], failedIds: [], stale: false,
  });
  assert.deepEqual(await runInboxReadBatch({ execute, isCurrent: () => true, items: [item("read", notificationAction("read"), true), item("no-action")] }), {
    confirmedIds: [], failedIds: [], stale: false,
  });
  assert.equal(calls, 0);
});

test("notification and conversation actions require their exact timestamped receipts", async () => {
  const items = [
    item("notification", notificationAction("notice:one")),
    item("conversation", conversationAction("thread:one", "message:one")),
  ];
  const result = await runInboxReadBatch({
    execute: async action => action.expected.notificationId
      ? success({ notificationId: "notice:one", state: "read", updatedAt: "2026-09-15T10:01:00.000Z" })
      : success({ conversationId: "thread:one", lastReadMessageId: "message:one", readAt: "2026-09-15T10:01:00.000Z" }),
    isCurrent: () => true,
    items,
  });

  assert.deepEqual(result, { confirmedIds: ["notification", "conversation"], failedIds: [], stale: false });
});

for (const [name, receipt] of [
  ["wrong notification id", { notificationId: "notice:other", state: "read", updatedAt: "2026-09-15T10:01:00.000Z" }],
  ["wrong notification state", { notificationId: "notice:one", state: "ignored", updatedAt: "2026-09-15T10:01:00.000Z" }],
  ["missing notification timestamp", { notificationId: "notice:one", state: "read" }],
  ["invalid notification timestamp", { notificationId: "notice:one", state: "read", updatedAt: "not-a-date" }],
] as const) test(`${name} remains failed`, async () => {
  const result = await runInboxReadBatch({
    execute: async () => success(receipt),
    isCurrent: () => true,
    items: [item("notification", notificationAction("notice:one"))],
  });
  assert.deepEqual(result, { confirmedIds: [], failedIds: ["notification"], stale: false });
});

for (const [name, receipt] of [
  ["wrong conversation id", { conversationId: "thread:other", lastReadMessageId: "message:one", readAt: "2026-09-15T10:01:00.000Z" }],
  ["wrong last read message", { conversationId: "thread:one", lastReadMessageId: "message:other", readAt: "2026-09-15T10:01:00.000Z" }],
  ["missing conversation timestamp", { conversationId: "thread:one", lastReadMessageId: "message:one" }],
] as const) test(`${name} remains failed`, async () => {
  const result = await runInboxReadBatch({
    execute: async () => success(receipt),
    isCurrent: () => true,
    items: [item("conversation", conversationAction("thread:one", "message:one"))],
  });
  assert.deepEqual(result, { confirmedIds: [], failedIds: ["conversation"], stale: false });
});

test("duplicate endpoint and body pairs execute once and confirm every matching item", async () => {
  const action = notificationAction("notice:one");
  let calls = 0;
  const result = await runInboxReadBatch({
    execute: async () => {
      calls += 1;
      return success({ notificationId: "notice:one", state: "read", updatedAt: "2026-09-15T10:01:00.000Z" });
    },
    isCurrent: () => true,
    items: [item("first", action), item("second", action)],
  });
  assert.equal(calls, 1);
  assert.deepEqual(result, { confirmedIds: ["first", "second"], failedIds: [], stale: false });
});

test("execution never exceeds four concurrent requests", async () => {
  let active = 0;
  let maximum = 0;
  const releases: Array<() => void> = [];
  const items = Array.from({ length: 9 }, (_, index) => item(`item:${index}`, notificationAction(`notice:${index}`)));
  const pending = runInboxReadBatch({
    execute: async action => {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise<void>(resolve => releases.push(resolve));
      active -= 1;
      return success({ ...action.expected, updatedAt: "2026-09-15T10:01:00.000Z" });
    },
    isCurrent: () => true,
    items,
  });

  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(active, 4);
  while (releases.length) {
    releases.shift()?.();
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  const result = await pending;
  assert.equal(maximum, 4);
  assert.equal(result.confirmedIds.length, 9);
});

test("partial HTTP, receipt and thrown failures remain individually retryable", async () => {
  const items = ["ok", "http", "receipt", "throw"].map(id => item(id, notificationAction(id)));
  const result = await runInboxReadBatch({
    execute: async action => {
      const id = action.expected.notificationId;
      if (id === "http") return { error: { code: "FAILED", message: "failed" }, meta, status: 503, success: false };
      if (id === "receipt") return success({ notificationId: "other", state: "read", updatedAt: receiptAt });
      if (id === "throw") throw new Error("network failed");
      return success({ ...action.expected, updatedAt: receiptAt });
    },
    isCurrent: () => true,
    items,
  });
  assert.deepEqual(result, { confirmedIds: ["ok"], failedIds: ["http", "receipt", "throw"], stale: false });
});

test("a route or account scope change makes the whole completion stale", async () => {
  let current = true;
  let release!: () => void;
  const pending = runInboxReadBatch({
    execute: async action => {
      await new Promise<void>(resolve => { release = resolve; });
      return success({ ...action.expected, updatedAt: receiptAt });
    },
    isCurrent: () => current,
    items: [item("one", notificationAction("one"))],
  });
  await new Promise(resolve => setTimeout(resolve, 0));
  current = false;
  release();

  assert.deepEqual(await pending, { confirmedIds: [], failedIds: [], stale: true });
});

test("batch completion is never optimistic", async () => {
  let release!: () => void;
  let settled = false;
  const pending = runInboxReadBatch({
    execute: async action => {
      await new Promise<void>(resolve => { release = resolve; });
      return success({ ...action.expected, updatedAt: receiptAt });
    },
    isCurrent: () => true,
    items: [item("one", notificationAction("one"))],
  }).then(result => { settled = true; return result; });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(settled, false);
  release();
  assert.deepEqual(await pending, { confirmedIds: ["one"], failedIds: [], stale: false });
});
