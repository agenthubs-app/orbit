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

test("relationship chat detail stops at drafts and offers no send (10-27)", () => {
  assert.match(screenSource, /relationshipCommunicationConversationPath/u);
  assert.doesNotMatch(screenSource, /TextInput|buildRelationshipMessageDeliveryRequest|relationshipDeliveryReceiptMatches|\.enqueue\(/u);
  assert.doesNotMatch(screenSource, /发送消息|已送达/u);
});
