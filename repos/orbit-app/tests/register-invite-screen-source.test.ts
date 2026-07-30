import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url).pathname;
const screenSource = readFileSync(
  join(repoRoot, "src", "screens", "register", "RegisterInviteScreen.tsx"),
  "utf8"
);

test("register invite screen routes signed-out users through account auth", () => {
  assert.match(screenSource, /useOrbitAuthSession/u);
  assert.match(screenSource, /auth\.ready/u);
  assert.match(screenSource, /auth\.signedIn/u);
  assert.match(screenSource, /AuthenticatedRegisterInviteEventScreen/u);
  assert.match(screenSource, /authenticated=\{false\}/u);
  assert.match(screenSource, /registerInviteToView\(\{[\s\S]*authenticated/u);
});

test("anonymous register invites do not mount the private profile resource", () => {
  const eventBoundaryStart = screenSource.indexOf(
    "function RegisterInviteEventScreen"
  );
  const authenticatedBoundaryStart = screenSource.indexOf(
    "function AuthenticatedRegisterInviteEventScreen"
  );
  const resourceBoundaryStart = screenSource.indexOf(
    "function RegisterInviteResourceScreen"
  );
  const eventBoundary = screenSource.slice(
    eventBoundaryStart,
    authenticatedBoundaryStart
  );
  const authenticatedBoundary = screenSource.slice(
    authenticatedBoundaryStart,
    resourceBoundaryStart
  );

  assert.ok(eventBoundaryStart > -1);
  assert.ok(authenticatedBoundaryStart > eventBoundaryStart);
  assert.ok(resourceBoundaryStart > authenticatedBoundaryStart);
  assert.match(eventBoundary, /auth\.signedIn \?/u);
  assert.match(eventBoundary, /profileState=\{null\}/u);
  assert.doesNotMatch(eventBoundary, /ORBIT_API_ENDPOINTS\.profile/u);
  assert.match(authenticatedBoundary, /ORBIT_API_ENDPOINTS\.profile/u);
});

test("register invites read public event detail for both auth states", () => {
  assert.match(screenSource, /publicEventDetailPath\(inviteCode\)/u);
  assert.doesNotMatch(screenSource, /\beventDetailPath\(inviteCode\)/u);
});

test("register invite screen opens with registration readiness before detail cards", () => {
  const contentStart = screenSource.indexOf("function RegisterInviteContent");
  const inviteCardStart = screenSource.indexOf("function InviteCard");
  const contentSource = screenSource.slice(contentStart, inviteCardStart);
  const readinessIndex = contentSource.indexOf("<RegistrationReadinessCard");
  const inviteIndex = contentSource.indexOf("<InviteCard");

  assert.ok(contentStart > -1);
  assert.ok(inviteCardStart > contentStart);
  assert.match(screenSource, /function RegistrationReadinessCard/u);
  assert.match(screenSource, /view\.readiness/u);
  assert.match(screenSource, /报名准备/u);
  assert.match(screenSource, /styles\.readinessTimeline/u);
  assert.ok(readinessIndex > -1, "readiness should render in the invite content");
  assert.ok(inviteIndex > readinessIndex, "event detail should follow readiness");
});
