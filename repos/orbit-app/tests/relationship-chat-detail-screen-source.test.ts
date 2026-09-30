import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url).pathname;
const screenSource = readFileSync(
  join(repoRoot, "src", "screens", "chat", "RelationshipChatDetailScreen.tsx"),
  "utf8"
);

test("relationship chat detail no longer calls the retired legacy chat extraction or summary endpoints", () => {
  // Sprint 0104: the extraction call used new-system conversation ids against
  // the legacy chat store and always failed; it was removed with that store.
  assert.doesNotMatch(screenSource, /chatConversationExtractionsPath|chatConversationSummaryPath/u);
  assert.doesNotMatch(screenSource, /relationshipChatExtractionToView|relationshipChatSummaryToView/u);
  assert.doesNotMatch(screenSource, /\/api\/chat\//u);
  assert.doesNotMatch(screenSource, /提取结果|生成摘要/u);
});

test("relationship chat detail sends only through a verified delivery receipt", () => {
  assert.match(screenSource, /TextInput/u);
  assert.match(screenSource, /buildRelationshipMessageDeliveryRequest/u);
  assert.match(screenSource, /relationshipDeliveryReceiptMatches/u);
  assert.match(screenSource, /relationshipCommunicationConversationPath/u);
  assert.match(screenSource, /draftBody/u);
  assert.match(screenSource, /sendVerifiedMessage/u);
  assert.match(screenSource, /title="发送消息"/u);
  assert.match(screenSource, /发送消息/u);
  assert.match(screenSource, /已送达/u);
  assert.doesNotMatch(screenSource, /保存草稿/u);
});
