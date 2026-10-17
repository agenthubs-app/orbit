import assert from "node:assert/strict";
import test from "node:test";
import { profileExtractionPayload, profilePayload, readyProfileSuggestionsPayload } from "./helpers/profile-detail-fixtures";
import { profileExtractionReceiptSchema, profileSuggestionsSchema } from "../src/api/profile-detail-contract";
import type { ManualProfileContract } from "../src/api/contract/profile";
test("R18a suggestions only expose live-supported sources and selected self fields", async () => {
  const module = await import("../src/screens/me/suggestions-model").catch(() => null); assert.ok(module);
  const cards = module.accountLiveSuggestions(profileSuggestionsSchema.parse(readyProfileSuggestionsPayload).suggestions, "自分");
  assert.equal(cards.length, 1); assert.equal(cards[0]?.source, "chat");
  assert.deepEqual(module.selectedAccountPatch(cards, new Set(), profilePayload.profile as ManualProfileContract), {});
  const field = cards[0]!.fields[0]!;
  assert.deepEqual(module.selectedAccountPatch(cards, new Set([field.id]), profilePayload.profile as ManualProfileContract), { headline: readyProfileSuggestionsPayload.suggestions[0]!.suggestedValue });
  assert.deepEqual(module.suggestionSourceCounts(cards), { chat: 1 });
});
test("R18a extraction becomes a review card; only selected fields are saved", async () => {
  const module = await import("../src/screens/me/suggestions-model").catch(() => null); assert.ok(module);
  const extraction = profileExtractionReceiptSchema("business-card").parse(profileExtractionPayload);
  const card = module.accountExtractionSuggestion(extraction, profilePayload.profile as ManualProfileContract);
  assert.ok(card); assert.equal(card.source, "business-card");
  const role = card.fields.find(field => field.key === "role")!;
  assert.deepEqual(module.selectedAccountPatch([card], new Set([role.id]), profilePayload.profile as ManualProfileContract), { role: "Product lead" });
});
