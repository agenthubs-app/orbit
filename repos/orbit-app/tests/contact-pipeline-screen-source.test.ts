import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(
  new URL("../src/screens/contacts/ContactPipelineScreen.tsx", import.meta.url),
  "utf8"
);

test("contact pipeline renders every available stage action as wrapped controls", () => {
  assert.match(source, /contact\.stageActions/);
  assert.match(source, /\.map\(\(stageAction\)/);
  assert.match(source, /styles\.stageActionsRow/);
  assert.match(source, /relationshipStage: action\.nextRelationshipStage/);
});

test("contact pipeline tracks pending state per stage action", () => {
  assert.match(source, /function stageActionKey/);
  assert.match(source, /pendingStageActionKey/);
  assert.doesNotMatch(source, /pendingConnectionId/);
});
