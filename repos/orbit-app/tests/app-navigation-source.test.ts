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
  assert.match(aiScreenSource, /href: "\/inbox" as Href/u);
  assert.match(aiScreenSource, /title: "关系收件箱"/u);
  assert.match(aiScreenSource, /file-tray-full-outline/u);
  assert.match(aiScreenSource, /useRelationshipInboxBadgeCount/u);
  assert.match(
    aiScreenSource,
    /badge=\{entry\.href === "\/inbox" \? inboxBadge : undefined\}/u
  );
});

test("the inbox badge count reads only durable inbox and notification sources", () => {
  assert.match(badgeHookSource, /relationshipInboxPath\(\)/u);
  assert.match(badgeHookSource, /ORBIT_API_ENDPOINTS\.notifications/u);
  assert.doesNotMatch(badgeHookSource, /ORBIT_API_ENDPOINTS\.proactiveTurns/u);
  assert.match(badgeHookSource, /relationshipInboxBadgeCount/u);
  assert.match(badgeHookSource, /Math\.min\(count, 99\)/u);
});

test("inbox route lives inside the app group without a duplicate root route", () => {
  assert.equal(existsSync(appInboxPath), true);
  assert.equal(existsSync(rootInboxPath), false);

  const appInboxSource = readFileSync(appInboxPath, "utf8");
  assert.match(appInboxSource, /RelationshipInboxScreen/u);
});
