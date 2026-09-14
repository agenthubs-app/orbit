import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/screens/contacts/RelationshipInvitationScreen.tsx", "utf8");
const route = readFileSync("app/invitations/[token].tsx", "utf8");

test("native invitation route previews and accepts only after an explicit press", () => {
  assert.match(route, /withOrbitPrivateRoute\(RelationshipInvitationScreen\)/u);
  assert.match(source, /relationshipCommunicationInvitationPath/u);
  assert.match(source, /relationshipCommunicationInvitationAcceptPath/u);
  assert.match(source, /confirmed: true/u);
  assert.match(source, /acceptInvitation/u);
  assert.match(source, /onPress=\{\(\) => void acceptInvitation\(\)\}/u);
  assert.match(source, /locale\.t\("invitation\.accept"\)/u);
});
