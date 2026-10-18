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
const aiStartSource = readFileSync(
  join(repoRoot, "src", "screens", "ai", "IOrbitStartView.tsx"),
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

test("R21 iOrbit owns a full-screen header and leaves inbox navigation to the app shell", () => {
  assert.match(aiStartSource, /<AppScreen inset="kit"/u);
  assert.match(aiStartSource, /accessibilityLabel="会話リスト"/u);
  assert.match(aiStartSource, /accessibilityLabel="閉じる"/u);
  assert.doesNotMatch(aiStartSource, /drawerInboxDot|inboxBadge/u);
});

test("R21 history separates plan intakes and goals from chat sessions", () => {
  assert.match(aiStartSource, /planIntakes\.map/u);
  assert.match(aiStartSource, /planGoals\.map/u);
  assert.match(aiScreenSource, /planFlowHref\("app", intake\.intakeId\)/u);
  assert.match(aiScreenSource, /planOverviewHref\("app", goal\.planId\)/u);
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
