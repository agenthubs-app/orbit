import assert from "node:assert/strict";
import test from "node:test";
import { createOrbitApiClient } from "../src/api/client";
import { demoAccountProfiles } from "../../orbits/shared/mock/demo-world/account";

test("R18a seek candidate acceptance writes only the selected value with CAS; rejection has no write", async () => {
  const module = await import("../src/screens/me/account-api").catch(() => null);
  assert.ok(module, "account API is missing");
  const writes: unknown[] = [];
  const profile = demoAccountProfiles.regular.profile!;
  const client = createOrbitApiClient({ baseUrl: "http://localhost:3400", fetchImpl: async (_url, init) => {
    writes.push(JSON.parse(String(init?.body)));
    return Response.json({ success: true, data: { ...demoAccountProfiles.complete, mutationId: "candidate-1", profile: { ...profile, seeking: ["協業"], updatedAt: "2026-10-18T12:00:01.000Z" }, editor: { ...demoAccountProfiles.complete.editor, lastSavedAt: "2026-10-18T12:00:01.000Z" } } });
  } });
  const api = module.createAccountApi(client, "/api/profile?design=50");
  assert.equal(module.candidateSeeking(profile.seeking, "協業", false), null);
  assert.equal(writes.length, 0);
  const result = await api.acceptCandidate(profile, "協業", "candidate-1");
  assert.ok(result);
  assert.deepEqual(writes, [{ seeking: ["協業"], expectedUpdatedAt: profile.updatedAt, mutationId: "candidate-1" }]);
  assert.equal(module.candidateSeeking(["1","2","3","4","5"], "6", true), null);
});

test("R18a candidate receipt rejects wrong actor/profile or stale revision", async () => {
  const module = await import("../src/screens/me/account-api").catch(() => null);
  assert.ok(module);
  const client = createOrbitApiClient({ baseUrl: "http://localhost:3400", fetchImpl: async () => Response.json({ success: true, data: demoAccountProfiles.regular }) });
  assert.equal(await module.createAccountApi(client).acceptCandidate(demoAccountProfiles.regular.profile!, "協業", "candidate-1"), null);
});

test("R18a live candidate request supplies the existing seeker labels in the requested language", async () => {
  const module = await import("../src/screens/me/account-api");
  const requests: Record<string, unknown>[] = [];
  const client = createOrbitApiClient({ baseUrl: "http://localhost:3400", fetchImpl: async (_url, init) => {
    requests.push(JSON.parse(String(init?.body)));
    return Response.json({ success: true, data: { suggestions: ["Investors"] } });
  } });
  assert.deepEqual(await module.createAccountApi(client).seekCandidates("en"), ["Investors"]);
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.language, "en");
  assert.ok(Array.isArray(requests[0]?.candidates));
  assert.ok((requests[0]?.candidates as string[]).includes("Investors"));
  assert.ok(!(requests[0]?.candidates as string[]).includes("投资人"));
});
