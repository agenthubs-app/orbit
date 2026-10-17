import assert from "node:assert/strict";
import test from "node:test";

import { profileLegacyDestination } from "../../app/(app)/app/orbit-2026/account/profile-routes";

test("old profile views land on the new account screens", () => {
  assert.equal(profileLegacyDestination({ view: "connect" }), "/app/settings/integrations");
  assert.equal(profileLegacyDestination({ view: "persona" }), "/app/profile?edit=tags");
  assert.equal(profileLegacyDestination({ view: "basic" }), "/app/profile?edit=card");
  assert.equal(profileLegacyDestination({ view: "profile" }), null);
  assert.equal(profileLegacyDestination({ view: "unknown" }), null);
});

test("legacy onboarding enters the R28 flow and normalizes unsafe next paths", () => {
  assert.equal(
    profileLegacyDestination({ onboarding: "1", next: "/app/events?tab=going" }),
    "/app/profile/onboarding?next=%2Fapp%2Fevents%3Ftab%3Dgoing",
  );
  assert.equal(
    profileLegacyDestination({ onboarding: "1", next: "https://evil.example" }),
    "/app/profile/onboarding?next=%2Fapp%2Fhome",
  );
  assert.equal(
    profileLegacyDestination({ onboarding: "1", next: "/app/profile", view: "basic" }),
    "/app/profile/onboarding?next=%2Fapp%2Fhome",
  );
});
