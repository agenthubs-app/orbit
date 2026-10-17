import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { OFFER_OPTIONS, SEEK_OPTIONS, TOPIC_OPTIONS } from "../../app/(app)/app/profile/profile-tag-options";
import { OFFER_OPTIONS as legacyOffer, SEEK_OPTIONS as legacySeek, TOPIC_OPTIONS as legacyTopic } from "../../app/(app)/app/profile/profile-0918/profile-model";

const root = join(fileURLToPath(import.meta.url), "../../..");
const app = "app/(app)/app";
const file = (path: string) => join(root, path);

test("R28 onboarding options survive legacy screen retirement through a thin compatibility export", () => {
  assert.equal(OFFER_OPTIONS.length, 22);
  assert.equal(SEEK_OPTIONS.length, 20);
  assert.equal(TOPIC_OPTIONS.length, 20);
  assert.equal(legacyOffer, OFFER_OPTIONS);
  assert.equal(legacySeek, SEEK_OPTIONS);
  assert.equal(legacyTopic, TOPIC_OPTIONS);
  assert.match(readFileSync(file(`${app}/profile/profile-0918/profile-model.ts`), "utf8").trim(), /^export \{ OFFER_OPTIONS, SEEK_OPTIONS, TOPIC_OPTIONS \} from "\.\.\/profile-tag-options";$/);
});

test("obsolete profile and agent settings UI modules are gone while the new routes remain", () => {
  for (const name of [
    "business-card-preview.tsx", "load-profile-editor-page.tsx", "profile-basic.tsx", "profile-connect.tsx",
    "profile-editor-draft.ts", "profile-legacy-settings.tsx", "profile-overview.tsx", "profile-persona.tsx",
    "profile-screens.tsx", "profile-settings.tsx", "profile-shell.tsx", "use-profile-editor-session.ts",
  ]) assert.equal(existsSync(file(`${app}/profile/profile-0918/${name}`)), false, name);
  for (const name of [
    "orbit-agent-automation-settings.tsx", "orbit-agent-execution-settings.tsx", "orbit-agent-feedback-settings.tsx",
    "orbit-agent-memory-settings.tsx", "orbit-appearance-settings.tsx",
  ]) assert.equal(existsSync(file(`${app}/settings/${name}`)), false, name);
  const profile = readFileSync(file(`${app}/profile/page.tsx`), "utf8");
  const settings = readFileSync(file(`${app}/settings/page.tsx`), "utf8");
  assert.match(profile, /AccountProfilePage/);
  assert.match(settings, /AccountProfilePage/);
  assert.doesNotMatch(profile + settings, /profile-0918|orbit-agent-.*settings/);
});
