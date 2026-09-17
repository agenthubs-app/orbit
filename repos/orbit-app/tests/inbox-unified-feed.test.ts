import assert from "node:assert/strict";
import test from "node:test";

import {
  filterInboxFeed,
  inboxFeedFromSources,
} from "../src/view-models/inbox-feed";

const now = "2026-09-15T12:00:00.000Z";
const actorId = "actor:a";

test("feed never recreates an unavailable task link or its stale content", () => {
  const input = sources();
  input.notificationsData.reminders = [{ reminderId: "gone", title: "SECRET OLD TITLE", organization: "SECRET OLD ORG", followupTaskId: "task:gone", href: "", priority: "normal", occurredAt: now }];
  const feed = inboxFeedFromSources(input);
  const item = feed.items.find(item => item.id === "notification:gone");
  assert.ok(item);
  assert.equal(item.targetHref, undefined);
  assert.equal(item.title, "来源已不可用");
  assert.equal(item.subtitle, "");
  assert.equal(JSON.stringify(feed).includes("SECRET OLD"), false);
});

interface FeedFixture {
  actorId: string;
  conversationsData: { conversations: Record<string, unknown>[]; refreshedAt: string };
  language: "zh";
  notificationsData: {
    notificationInteractions?: Record<string, string>;
    reminders: Record<string, unknown>[];
    state?: string;
  };
  now: string;
  signalsData: { signals: Record<string, unknown>[]; state?: string };
}

function conversation(input: {
  conversationId?: string;
  contactId?: string;
  participantIds?: readonly [string, string];
  unreadCount?: number;
  updatedAt?: string;
} = {}) {
  const conversationId = input.conversationId ?? "thread:one";
  const remoteId = input.participantIds?.[1] ?? "actor:b";
  const participantIds = input.participantIds ?? [actorId, remoteId] as const;
  return {
    contactId: input.contactId ?? "contact:one",
    conversationId,
    createdAt: "2026-09-10T08:00:00.000Z",
    messages: [
      {
        body: "周四见面，带上资料。",
        conversationId,
        deliveryState: "delivered",
        messageId: "message:one",
        senderAccountId: remoteId,
        senderDisplayName: "曾伟",
        sentAt: input.updatedAt ?? "2026-09-15T09:00:00.000Z",
      },
    ],
    participantAccountIds: participantIds,
    participantDisplayNames: Object.fromEntries(participantIds.map(id => [id, id === actorId ? "我" : "曾伟"])),
    qualificationVersion: "qualification:one",
    status: "active",
    unreadCount: input.unreadCount ?? 1,
    updatedAt: input.updatedAt ?? "2026-09-15T09:00:00.000Z",
  };
}

function sources(): FeedFixture {
  return {
    actorId,
    conversationsData: {
      conversations: [conversation()],
      refreshedAt: now,
    },
    language: "zh" as const,
    notificationsData: {
      notificationInteractions: { "event:one": "read" },
      reminders: [
        {
          href: "/events/event%3Aone",
          occurredAt: "2026-09-15T11:00:00.000Z",
          organization: "Orbit 活动",
          priority: "normal",
          reminderId: "event:one",
          title: "报名已确认",
        },
        {
          href: "/tasks/task%3Aone",
          occurredAt: "2026-09-15T10:00:00.000Z",
          organization: "待办",
          priority: "high",
          reminderId: "task:one",
          title: "准备会面资料",
        },
        {
          occurredAt: "2026-09-15T08:00:00.000Z",
          priority: "normal",
          reminderId: "assistant:one",
          sourceKind: "system",
          title: "IORBIT 已整理今日重点",
        },
      ],
      state: "success",
    },
    now,
    signalsData: {
      signals: [
        {
          confidence: "high",
          confirmation: { required: true, state: "pending" },
          displayName: "Aiko Watanabe",
          evidence: [{ excerpt: "已有交流记录" }],
          id: "signal:one",
          occurredAt: "2026-09-15T07:00:00.000Z",
          organization: "Kumo Grid",
          permission: { state: "granted" },
          role: "Founder",
          signalKind: "email_intro",
          sourceKind: "gmail",
        },
      ],
      state: "success",
    },
  };
}

test("unified feed validates ownership, classifies sources, sorts by occurrence and exposes exact read actions", () => {
  const view = inboxFeedFromSources(sources());

  assert.deepEqual(view.items.map(item => item.category), ["activity", "task", "assistant", "contact"]);
  assert.deepEqual(view.items.map(item => item.occurredAt), [
    "2026-09-15T11:00:00.000Z",
    "2026-09-15T10:00:00.000Z",
    "2026-09-15T08:00:00.000Z",
    "2026-09-15T07:00:00.000Z",
  ]);
  assert.equal(new Set(view.items.map(item => item.id)).size, view.items.length);
  assert.equal(view.unreadCount, 3);
  assert.equal(view.coverageConfirmed, true);
  assert.equal(view.items[0]?.read, true);
  assert.equal(view.items[1]?.targetHref, "/tasks/task%3Aone");
  assert.deepEqual(view.items[1]?.readAction, {
    body: { state: "read" },
    endpoint: "/api/notifications/task%3Aone/state",
    expected: { notificationId: "task:one", state: "read" },
  });
  assert.equal(view.items.some(item => item.id.startsWith("conversation:")), false);
  assert.equal(view.items[3]?.readAction, undefined);
});

test("foreign conversations and duplicate source ids never enter the actor feed", () => {
  const input = sources();
  input.conversationsData.conversations = [
    conversation({ conversationId: "thread:duplicate" }),
    conversation({ conversationId: "thread:duplicate" }),
    conversation({ conversationId: "thread:foreign", participantIds: ["actor:x", "actor:y"] }),
  ];

  const view = inboxFeedFromSources(input);
  assert.equal(view.items.filter(item => item.targetHref?.startsWith("/inbox/")).length, 0);
  assert.equal(view.items.some(item => item.targetHref === "/inbox/thread%3Aforeign"), false);
});

test("same-time records use category and id as a stable tie-break", () => {
  const input = sources();
  input.notificationsData.reminders = input.notificationsData.reminders.map(item => ({ ...item, occurredAt: "2026-09-15T09:00:00.000Z" }));
  input.signalsData.signals = input.signalsData.signals.map(item => ({ ...item, occurredAt: "2026-09-15T09:00:00.000Z" }));

  const first = inboxFeedFromSources(input).items.map(item => `${item.category}:${item.id}`);
  const second = inboxFeedFromSources({ ...input, notificationsData: { ...input.notificationsData, reminders: [...input.notificationsData.reminders].reverse() } }).items.map(item => `${item.category}:${item.id}`);
  assert.deepEqual(first, second);
  assert.deepEqual(first, [...first].sort((left, right) => left.localeCompare(right)));
});

test("tabs retain global order and assistant entries appear only in all", () => {
  const view = inboxFeedFromSources(sources());
  assert.deepEqual(filterInboxFeed(view, "activity").items.map(item => item.category), ["activity"]);
  assert.deepEqual(filterInboxFeed(view, "task").items.map(item => item.category), ["task"]);
  assert.deepEqual(filterInboxFeed(view, "contact").items.map(item => item.category), ["contact"]);
  assert.equal(filterInboxFeed(view, "all").items.some(item => item.category === "assistant"), true);
});

test("only exact safe native targets are exposed", () => {
  const input = sources();
  input.notificationsData.reminders = [
    { ...input.notificationsData.reminders[0]!, reminderId: "unsafe", href: "https://outside.example/events/one" },
    { ...input.notificationsData.reminders[1]!, reminderId: "contact", href: "/app/contacts/contact%3Aone" },
  ];
  input.notificationsData.notificationInteractions = {};
  const view = inboxFeedFromSources(input);

  assert.equal(view.items.find(item => item.id.endsWith("unsafe"))?.targetHref, undefined);
  assert.equal(view.items.find(item => item.id.endsWith("contact"))?.targetHref, "/contacts/contact%3Aone");
});

test("unpersistable notifications stay unread without gaining a read action", () => {
  const input = sources();
  input.notificationsData = { reminders: [input.notificationsData.reminders[1]!] } as typeof input.notificationsData;
  const item = inboxFeedFromSources(input).items.find(item => item.id.endsWith("task:one"));

  assert.equal(item?.read, false);
  assert.equal(item?.readAction, undefined);
});

test("the exact 30-day window excludes old and future occurrences", () => {
  const input = sources();
  input.notificationsData.reminders = [
    { ...input.notificationsData.reminders[0]!, reminderId: "boundary", occurredAt: "2026-08-16T12:00:00.000Z" },
    { ...input.notificationsData.reminders[0]!, reminderId: "old", occurredAt: "2026-08-16T11:59:59.999Z" },
    { ...input.notificationsData.reminders[0]!, reminderId: "future", occurredAt: "2026-09-15T12:00:00.001Z" },
  ];
  input.notificationsData.notificationInteractions = {};
  const view = inboxFeedFromSources(input);

  assert.equal(view.items.some(item => item.id.endsWith("boundary")), true);
  assert.equal(view.items.some(item => item.id.endsWith("old")), false);
  assert.equal(view.items.some(item => item.id.endsWith("future")), false);
  assert.equal(view.coverageConfirmed, true);
});

test("missing or invalid occurrence times remain visible but make 30-day coverage unconfirmed", () => {
  const input = sources();
  input.conversationsData.conversations = [];
  input.notificationsData.reminders = [
    { ...input.notificationsData.reminders[1]!, reminderId: "missing", occurredAt: undefined, dueAt: "2026-10-01T12:00:00.000Z" },
    { ...input.notificationsData.reminders[1]!, reminderId: "invalid", occurredAt: "not-a-date" },
  ];
  input.notificationsData.notificationInteractions = {};
  input.signalsData.signals = [];
  const view = inboxFeedFromSources(input);

  assert.equal(view.items.length, 2);
  assert.deepEqual(view.items.map(item => item.occurredAt), ["", ""]);
  assert.equal(view.coverageConfirmed, false);
});

test("unproven legacy task reminders have no navigation or invented occurrence time", () => {
  const input = sources();
  input.conversationsData.conversations = [];
  input.notificationsData.reminders = [{
    dueAt: "2026-07-29T09:00:00+00:00",
    followupTaskId: "task:legacy",
    priority: "normal",
    reminderId: "reminder:legacy",
    title: "准备跟进",
  }];
  input.notificationsData.notificationInteractions = {};
  input.signalsData.signals = [];

  const view = inboxFeedFromSources(input);
  assert.equal(view.items.length, 1);
  assert.equal(view.items[0]?.category, "task");
  assert.equal(view.items[0]?.targetHref, undefined);
  assert.equal(view.items[0]?.title, "来源已不可用");
  assert.equal(view.items[0]?.occurredAt, "");
  assert.equal(view.coverageConfirmed, false);
});

test("unknown notifications are omitted instead of being mislabeled as IORBIT", () => {
  const input = sources();
  input.conversationsData.conversations = [];
  input.notificationsData.reminders = [{
    occurredAt: "2026-09-15T08:00:00.000Z",
    priority: "normal",
    reminderId: "unknown",
    title: "无来源通知",
  }];
  input.notificationsData.notificationInteractions = {};
  input.signalsData.signals = [];

  assert.deepEqual(inboxFeedFromSources(input).items, []);
});

test("legacy generated reminder titles use the resolved contact name without exposing fixture ids", () => {
  const input = sources();
  input.conversationsData.conversations = [];
  input.notificationsData.reminders = [
    {
      contactName: "佐藤健一",
      occurredAt: "2026-09-15T08:00:00.000Z",
      priority: "normal",
      reminderId: "legacy-named",
      sourceKind: "system",
      title: "Review follow-up for contact_021",
    },
    {
      contactName: "高橋智子",
      occurredAt: "2026-09-15T07:00:00.000Z",
      priority: "normal",
      reminderId: "current-readable",
      sourceKind: "system",
      title: "复核与高橋智子的下一步",
    },
  ];
  input.notificationsData.notificationInteractions = {};
  input.signalsData.signals = [];

  const view = inboxFeedFromSources(input);
  assert.deepEqual(view.items.map(item => item.title), [
    "联系佐藤健一",
    "复核与高橋智子的下一步",
  ]);
  assert.equal(view.items.some(item => /contact_\d+/u.test(item.title)), false);
});
