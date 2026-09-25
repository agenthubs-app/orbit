import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url).pathname;
const appLayoutSource = readFileSync(
  join(repoRoot, "app", "(app)", "_layout.tsx"),
  "utf8"
);
const aiScreenSource = readFileSync(
  join(repoRoot, "src", "screens", "ai", "AiScreen.tsx"),
  "utf8"
);
const badgeHookSource = readFileSync(
  join(repoRoot, "src", "hooks", "useRelationshipInboxBadgeCount.ts"),
  "utf8"
);
const appInboxPath = join(repoRoot, "app", "(app)", "inbox.tsx");
const rootInboxPath = join(repoRoot, "app", "inbox.tsx");
const tabGroupPath = join(repoRoot, "app", "(tabs)");

test("app destinations live in a stack group without bottom tabs", () => {
  assert.equal(existsSync(tabGroupPath), false);
  assert.match(appLayoutSource, /Stack/u);
  assert.doesNotMatch(appLayoutSource, /Tabs|tabBar/u);
});

test("the Orbit AI drawer exposes the relationship inbox with its unread badge", () => {
  assert.match(aiScreenSource, /accessibilityLabel=\{locale\.t\("ai\.openInbox"\)\}/u);
  assert.match(aiScreenSource, /onOpenCapability\("\/inbox" as Href\)/u);
  assert.match(aiScreenSource, /file-tray-full-outline/u);
  assert.match(aiScreenSource, /useRelationshipInboxBadgeCount/u);
  assert.match(aiScreenSource, /inboxBadge \? <View style=\{styles\.drawerInboxDot\}/u);
});

test("the Orbit AI drawer links Today to its canonical open task count", () => {
  assert.match(aiScreenSource, /href: "\/today" as Href/u);
  assert.match(aiScreenSource, /todayBadge=\{todaySummary\.openTaskCount\}/u);
  assert.match(aiScreenSource, /badge=\{entry\.href === "\/today" \? todayBadge : undefined\}/u);
  assert.doesNotMatch(aiScreenSource, /entry\.href === "\/schedule"/u);
});

test("the inbox badge delegates native lifecycle wiring to the shared scoped resource", () => {
  // Native subscription wiring only. Count-only HTTP reads, refresh and late
  // responses are exercised in home-dashboard-interactions and inbox-summary.
  assert.match(badgeHookSource, /subscribeInboxBadge/u);
  assert.match(badgeHookSource, /AppState\.addEventListener/u);
  assert.match(badgeHookSource, /server\.baseUrl, actorId, auth\.cookieHeader/u);
  assert.doesNotMatch(badgeHookSource, /ORBIT_API_ENDPOINTS\.proactiveTurns/u);
  assert.doesNotMatch(badgeHookSource, /relationshipCommunicationConversationsPath|ORBIT_API_ENDPOINTS\.notifications/u);
});

test("inbox route lives inside the app group without a duplicate root route", () => {
  assert.equal(existsSync(appInboxPath), true);
  assert.equal(existsSync(rootInboxPath), false);

  const appInboxSource = readFileSync(appInboxPath, "utf8");
  assert.match(appInboxSource, /RelationshipInboxScreen/u);
});
