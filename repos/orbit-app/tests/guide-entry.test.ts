import assert from "node:assert/strict";
import test from "node:test";

import { createOrbitApiClient } from "../src/api/client";
import { nextAppGuideStep, readAppGuideEntry } from "../src/api/guide-progress";
import { profilePayload } from "./helpers/profile-detail-fixtures";

const guide = {
  snapshot: { completedAt: null, confirmedContacts: 0, currentStep: 1, grandfathered: false,
    hasActivePlan: false, step1Skipped: false, contactSamples: [] },
  relationshipGoal: "", flags: { contacts: false, goal: false, plan: false }, completed: 0,
};

test("App guide keeps contacts first when a goal is already saved", () => {
  assert.equal(nextAppGuideStep({ contacts: false, goal: true, plan: false }), "contacts");
  assert.equal(nextAppGuideStep({ contacts: true, goal: true, plan: false }), "plan");
  assert.equal(nextAppGuideStep({ contacts: true, goal: true, plan: true }), null);
});

function entryServer(onboarding: unknown, profileStatus = 200) {
  const paths: string[] = [];
  const client = createOrbitApiClient({ baseUrl: "https://orbit.test", fetchImpl: async input => {
    const path = new URL(String(input)).pathname;
    paths.push(path);
    const status = path === "/api/profile" ? profileStatus : 200;
    const data = path === "/api/profile" ? { ...profilePayload, onboarding } : guide;
    return new Response(JSON.stringify(status === 200 ? { success: true, data } :
      { success: false, error: { code: "SERVICE_UNAVAILABLE", message: "down" } }),
    { status, headers: { "content-type": "application/json" } });
  } });
  return { client, paths };
}

test("guide entry redirects an incomplete profile before reading guide progress", async () => {
  const server = entryServer({ policyVersion: 2, status: "incomplete", missingFields: ["primaryIndustryId"] });
  assert.deepEqual(await readAppGuideEntry(server.client), { kind: "onboarding" });
  assert.deepEqual(server.paths, ["/api/profile"]);
});

test("guide entry requires a certified profile completion", async () => {
  const server = entryServer({ policyVersion: 99, status: "complete", missingFields: [] });
  assert.deepEqual(await readAppGuideEntry(server.client), { kind: "onboarding" });
  assert.deepEqual(server.paths, ["/api/profile"]);
});

test("guide entry reads guide progress for a complete profile", async () => {
  const server = entryServer({ policyVersion: 2, status: "complete", missingFields: [] });
  assert.deepEqual(await readAppGuideEntry(server.client), { kind: "ready", guide });
  assert.deepEqual(server.paths, ["/api/profile", "/api/guide/progress"]);
});

test("guide entry reports profile read failure without reading guide progress", async () => {
  const server = entryServer(null, 503);
  assert.deepEqual(await readAppGuideEntry(server.client), { kind: "failed" });
  assert.deepEqual(server.paths, ["/api/profile"]);
});
