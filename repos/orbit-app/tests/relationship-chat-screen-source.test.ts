import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url).pathname;
const screenSource = readFileSync(
  join(repoRoot, "src", "screens", "chat", "RelationshipChatScreen.tsx"),
  "utf8"
);

test("relationship chat screen opens with an Orbit AI relationship entry", () => {
  const contentStart = screenSource.indexOf("function ChatListContent");
  const metricStart = screenSource.indexOf("function MetricGrid");
  const contentSource = screenSource.slice(contentStart, metricStart);
  const agentEntryIndex = contentSource.indexOf("<RelationshipAgentEntry");
  const listIndex = contentSource.indexOf('title="对话列表"');

  assert.ok(contentStart > -1);
  assert.ok(metricStart > contentStart);
  assert.ok(agentEntryIndex > -1);
  assert.ok(
    listIndex === -1 || agentEntryIndex < listIndex,
    "AI relationship entry should appear before the raw conversation list"
  );
  assert.match(screenSource, /function RelationshipAgentEntry/u);
  assert.match(screenSource, /router\.push\("\/ai" as Href\)/u);
  assert.ok(screenSource.includes("让 Orbit AI 先帮我判断"));
  assert.match(screenSource, /styles\.agentEntry/u);
  assert.match(screenSource, /styles\.agentPrompt/u);
});
