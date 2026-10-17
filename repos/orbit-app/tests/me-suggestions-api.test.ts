import assert from "node:assert/strict";
import test from "node:test";
import { createOrbitApiClient } from "../src/api/client";
import { profilePayload, readyProfileSuggestionsPayload, acceptedProfileSuggestionPayload } from "./helpers/profile-detail-fixtures";
import type { ManualProfileContract } from "../src/api/contract/profile";
test("R18a suggestions save with CAS before acknowledging selected live decisions", async () => {
  const module = await import("../src/screens/me/suggestions-api").catch(() => null); assert.ok(module);
  const model = await import("../src/screens/me/suggestions-model");
  const calls: { path: string; body: Record<string, unknown> }[] = [];
  const client = createOrbitApiClient({ baseUrl: "http://localhost:3400", fetchImpl: async (url, init) => {
    const body = JSON.parse(String(init?.body)); calls.push({ path: new URL(String(url)).pathname, body });
    const at = "2026-10-18T01:01:01Z";
    return Response.json({ success: true, data: init?.method === "PUT" ? { ...profilePayload, mutationId: body.mutationId, onboarding: { policyVersion: 1, status: "complete", missingFields: [] }, profile: { ...profilePayload.profile, ...body, updatedAt: at }, editor: { ...profilePayload.editor, lastSavedAt: at } } : { ...acceptedProfileSuggestionPayload, mutationId: body.mutationId } });
  } });
  const api = module.createAccountSuggestionsApi(client, "/api/profile");
  const suggestions = (await import("../src/api/profile-detail-contract")).profileSuggestionsSchema.parse(readyProfileSuggestionsPayload).suggestions;
  const cards = model.accountLiveSuggestions(suggestions, "自分");
  const result = await api.apply(cards, new Set([cards[0]!.fields[0]!.id]), profilePayload.profile as ManualProfileContract, () => "apply-1", "en");
  assert.ok(result.receipt); assert.deepEqual(result.decisionFailures, []);
  assert.equal(calls[0]?.path, "/api/profile"); assert.equal(calls[0]?.body.expectedUpdatedAt, profilePayload.profile.updatedAt);
  assert.ok(calls[1]?.path.endsWith("/accept"));
});
test("R18a suggestions reject malformed save receipt and do not consume the live queue", async () => {
  const module = await import("../src/screens/me/suggestions-api").catch(() => null); assert.ok(module);
  const model = await import("../src/screens/me/suggestions-model"); let calls = 0;
  const client = createOrbitApiClient({ baseUrl: "http://localhost:3400", fetchImpl: async () => { calls++; return Response.json({ success: true, data: { mutationId: "apply-1" } }); } });
  const suggestions = (await import("../src/api/profile-detail-contract")).profileSuggestionsSchema.parse(readyProfileSuggestionsPayload).suggestions;
  const cards = model.accountLiveSuggestions(suggestions, "自分");
  const result = await module.createAccountSuggestionsApi(client).apply(cards, new Set([cards[0]!.fields[0]!.id]), profilePayload.profile as ManualProfileContract, () => "apply-1", "en");
  assert.equal(result.receipt, null); assert.equal(calls, 1);
});
test("R18a suggestion reads retain known rows when a future source is returned", async () => {
  const module = await import("../src/screens/me/suggestions-api");
  const client = createOrbitApiClient({ baseUrl: "http://localhost:3400", fetchImpl: async () => Response.json({ success: true, data: { ...readyProfileSuggestionsPayload, suggestions: [...readyProfileSuggestionsPayload.suggestions, { ...readyProfileSuggestionsPayload.suggestions[0], id: "future", sourceKind: "future" }] } }) });
  assert.equal((await module.createAccountSuggestionsApi(client).list("en"))?.length, 1);
});
