import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url).pathname;
const screenSource = readFileSync(
  join(repoRoot, "src", "screens", "chat", "RelationshipChatDetailScreen.tsx"),
  "utf8"
);

test("relationship chat detail loads extraction signals and can request a summary", () => {
  assert.match(screenSource, /chatConversationExtractionsPath/u);
  assert.match(screenSource, /chatConversationSummaryPath/u);
  assert.match(screenSource, /relationshipChatExtractionToView/u);
  assert.match(screenSource, /relationshipChatSummaryToView/u);
  assert.match(
    screenSource,
    /useApiResource<unknown>\(\s*chatConversationExtractionsPath\(conversationId \|\| "missing"\)/u
  );
  assert.match(
    screenSource,
    /client\.post<unknown>\(chatConversationSummaryPath\(view\.conversationId\)\)/u
  );
  assert.match(screenSource, /label="生成摘要"/u);
  assert.match(screenSource, /title="提取结果"/u);
});

test("relationship chat detail can save a review-only reply draft", () => {
  assert.match(screenSource, /TextInput/u);
  assert.match(screenSource, /buildRelationshipChatMessageRequest/u);
  assert.match(screenSource, /relationshipChatMessageSendToView/u);
  assert.match(screenSource, /draftBody/u);
  assert.match(screenSource, /sendMessageDraft/u);
  assert.match(
    screenSource,
    /client\.post<unknown>\(\s*request\.request\.endpoint,\s*request\.request\.options\s*\)/u
  );
  assert.match(screenSource, /title="回复草稿"/u);
  assert.match(screenSource, /保存草稿/u);
  assert.match(screenSource, /本地草稿/u);
  assert.doesNotMatch(screenSource, /发送成功|已发送/u);
});
