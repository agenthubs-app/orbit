import assert from "node:assert/strict";
import test from "node:test";
import { relationshipAlertsToView, relationshipInboxBadgeCount, relationshipInboxToView } from "../src/view-models/relationship-inbox";
import { inboxNotificationActions } from "../src/view-models/inbox-notification-actions";

const reminder = { reminderId: "notice:one", title: "准备资料", organization: "Example", dueAt: "2026-09-13T10:00:00Z", priority: "normal", href: "/tasks/task%3Aone" };
const inbox = relationshipInboxToView({ inbox: { conversations: [{ conversationId: "thread:one", unreadCount: 2 }] } });

test("server-read reminders stay visible but stop contributing to the unread badge", () => {
  const view = relationshipAlertsToView({ state: "success", reminders: [reminder, { ...reminder, reminderId: "notice:two" }, { ...reminder, reminderId: "notice:three" }], notificationInteractions: { "notice:one": "read", "notice:two": "ignored" } });
  assert.deepEqual(view.alerts.map(alert => alert.id), ["notice:one", "notice:three"]);
  assert.equal((view.alerts[0] as any).read, true);
  assert.equal((view.alerts[0] as any).canPersistState, true);
  assert.equal((view.alerts[1] as any).read, false);
  assert.equal(relationshipInboxBadgeCount(inbox, view), 3);
});

test("a legacy reminder remains unpersisted and retains the existing badge count", () => {
  const view = relationshipAlertsToView({ reminders: [reminder] });
  assert.notEqual((view.alerts[0] as any).canPersistState, true);
  assert.notEqual((view.alerts[0] as any).read, true);
  assert.equal(relationshipInboxBadgeCount(inbox, view), 3);
});

test("a legacy task reminder without href opens its canonical followup task", () => {
  const actions = inboxNotificationActions({
    state: "success",
    reminders: [{ ...reminder, href: undefined, followupTaskId: "task:canonical one" }],
    notificationInteractions: {},
  });

  assert.equal(actions.get("notice:one")?.href, "/tasks/task%3Acanonical%20one");
});

for (const [href, expected] of [
  ["/tasks/task%3Aone", "/tasks/task%3Aone"],
  ["orbit://tasks/task%3Aone", "/tasks/task%3Aone"],
  ["/app/tasks/task%3Aone", "/tasks/task%3Aone"],
  ["/schedule/events/event%3Aone", "/schedule/events/event%3Aone"],
  ["/app/contacts/contact%3Aone", "/contacts/contact%3Aone"],
  ["/app/events/event%3Aone", "/events/event%3Aone"],
  ["https://outside.example/tasks/one", undefined],
  ["//outside.example/tasks/one", undefined],
  ["/tasks/../admin", undefined],
  ["/tasks/%2e%2e", undefined],
  ["/tasks/task%252Fsecret", undefined],
  ["/tasks/task%2Fsecret", undefined],
  ["/tasks/task%5Csecret", undefined],
  ["/tasks/task%3Fsecret", undefined],
  ["/tasks/task%00secret", undefined],
  ["/contacts/new", undefined],
  ["/events/center", undefined],
  ["/account/login", undefined],
  ["/app/events/event%3Aone?participant=one#event-matchmaking-title", undefined],
  ["/tasks/task%3Aone?next=https://outside.example", undefined],
  [undefined, undefined],
] as const) test(`reminder target maps only an exact supported destination: ${href}`, () => {
  const view = relationshipAlertsToView({ state: "success", reminders: [{ ...reminder, href, followupTaskId: undefined }], notificationInteractions: {} });
  assert.equal((view.alerts[0] as any).href, expected);
});

for (const patch of [
  { notificationInteractions: null },
  { notificationInteractions: [] },
  { notificationInteractions: { "notice:one": "invented" } },
  { state: "pending", notificationInteractions: {} },
  { state: "success", notificationInteractions: {}, reminders: [{ ...reminder, reminderId: "" }] },
  { state: "success", notificationInteractions: {}, reminders: [reminder, reminder] },
]) test(`uncertain notification identity or capability never grants persistent actions: ${JSON.stringify(patch)}`, () => {
  const view = relationshipAlertsToView({ state: "success", reminders: [reminder], ...patch });
  assert.equal(view.alerts.some(alert => (alert as any).canPersistState === true), false);
});
