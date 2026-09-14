import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/screens/contacts/ContactDetailScreen.tsx", "utf8");

test("contact detail shows server eligibility and only opens a verified conversation", () => {
  assert.match(source, /relationshipCommunicationEligibilityPath/u);
  assert.match(source, /relationshipCommunicationEligibilityToView/u);
  assert.match(source, /isRelationshipEligibility/u);
  assert.match(source, /聊天资格/u);
  assert.match(source, /创建邀请链接/u);
  assert.match(source, /router\.push\(`\/chat\/\$\{encodeURIComponent\(view\.conversationId\)\}` as Href\)/u);
});
