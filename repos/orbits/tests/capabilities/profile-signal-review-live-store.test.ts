import assert from "node:assert/strict";
import test from "node:test";

import { createLiveProfileSignalReviewQueueService } from "../../features/profile/live-signal-service";
import { createStorageProfileSignalProvider } from "../../features/profile/storage/profile-signal-live-record-provider";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { seedGeneratedRelationshipFixturesIntoLiveStore } from "../../shared/storage/seed-generated-fixtures";

test("live profile signal review queue derives sourced suggestions without profile writes", async () => {
  const actorId = "account_orbit_generated";
  const workspaceId = "workspace:profile-signal-live";
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();

  await seedGeneratedRelationshipFixturesIntoLiveStore({
    now: () => "2026-07-02T05:00:00.000Z",
    store,
    workspaceId,
  });

  const originalProfile = store.getRecord({
    collectionName: "profiles",
    recordId: "profile_orbit_generated_operator",
    workspaceId,
  });
  const provider = createStorageProfileSignalProvider({
    sourceLabel: "Profile signal memory live storage",
    store,
    workspaceId,
  });
  const service = createLiveProfileSignalReviewQueueService({
    now: () => "2026-07-02T05:05:00.000Z",
    provider,
  });

  const queue = await service.listUpdateSuggestions({ actorId });

  assert.equal(queue.success, true);
  assert.equal(queue.data.state, "success");
  assert.equal(queue.data.suggestions.length, 3);
  assert.deepEqual(
    queue.data.suggestions.map((suggestion) => suggestion.sourceKind),
    ["chat", "activity", "contact"],
  );
  assert.deepEqual(
    queue.data.suggestions.map((suggestion) => suggestion.status),
    ["pending", "pending", "pending"],
  );
  assert.deepEqual(
    queue.data.suggestions.map((suggestion) => suggestion.targetProfileField),
    ["seeking", "bio", "offering"],
  );
  assert.deepEqual(queue.data.suggestions[0]?.suggestedValue, ["能一起推进跟进的伙伴"]);
  assert.equal(queue.data.suggestions[0]?.evidence[0]?.sourceKind, "chat");
  assert.match(queue.data.suggestions[1]?.suggestedValue as string, /关系跟进/u);
  assert.equal(queue.data.suggestions[1]?.evidence[0]?.sourceKind, "activity");
  assert.deepEqual(queue.data.suggestions[2]?.suggestedValue, ["以活动为由的引荐"]);
  assert.equal(queue.data.suggestions[2]?.evidence[0]?.sourceKind, "contact");
  assert.equal(
    queue.data.provenance.source,
    `live-record-store:profile-signals:${workspaceId}`,
  );
  assert.equal(
    queue.data.provenance.sourceLabel,
    "Profile signal memory live storage",
  );
  assert.equal(queue.data.provenance.generationMethod, "rule-based-signal-match");
  assert.equal(queue.data.provenance.privacy, "actor-scoped-profile-signals");
  assert.ok(queue.data.provenance.evidenceIds.length >= 3);

  const accepted = await service.acceptUpdateSuggestion(
    queue.data.suggestions[0]?.id ?? "",
    { actorId },
  );

  assert.equal(accepted.success, true);
  assert.equal(accepted.data.acceptedSuggestion.status, "accepted");
  assert.deepEqual(accepted.data.appliedFields, ["seeking"]);
  assert.deepEqual(accepted.data.profilePatch, {
    seeking: queue.data.suggestions[0]?.suggestedValue,
  });
  assert.equal(
    accepted.data.nextAction,
    "确认保存资料后，这条修改才会生效。",
  );

  const missing = await service.acceptUpdateSuggestion("missing-suggestion", {
    actorId,
  });

  assert.equal(missing.success, false);
  assert.equal(missing.error.code, "PROFILE_SIGNAL_SUGGESTION_NOT_FOUND");
  assert.deepEqual(missing.error.evidenceIds, [
    "evidence:profile-signal-suggestion-not-found:missing-suggestion",
  ]);

  const storedProfile = store.getRecord({
    collectionName: "profiles",
    recordId: "profile_orbit_generated_operator",
    workspaceId,
  });

  assert.deepEqual(storedProfile?.payload, originalProfile?.payload);
});

test("live profile signal review queue requires an actor and isolates unknown actors", async () => {
  const workspaceId = "workspace:profile-signal-actor-boundary";
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  await seedGeneratedRelationshipFixturesIntoLiveStore({ store, workspaceId });
  const service = createLiveProfileSignalReviewQueueService({
    provider: createStorageProfileSignalProvider({ store, workspaceId }),
  });

  const missingActor = await service.listUpdateSuggestions();
  const otherActor = await service.listUpdateSuggestions({
    actorId: "account:other",
  });

  assert.equal(missingActor.success, false);
  assert.equal(missingActor.error.code, "PROFILE_SIGNAL_ACTOR_REQUIRED");
  assert.equal(otherActor.success, true);
  assert.equal(otherActor.data.state, "empty");
  assert.deepEqual(otherActor.data.suggestions, []);
});

// Sprint 0083: composed rule copy must exist in every account language. Evidence
// excerpts are source data and deliberately keep their original wording.
const LATIN_SENTENCE = /[A-Za-z]{4,}\s+[A-Za-z]{4,}\s+[A-Za-z]{4,}/u;

async function localizedQueue(language: string | undefined) {
  const workspaceId = "workspace:profile-signal-language";
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  await seedGeneratedRelationshipFixturesIntoLiveStore({ now: () => "2026-07-02T05:00:00.000Z", store, workspaceId });
  const service = createLiveProfileSignalReviewQueueService({
    now: () => "2026-07-02T05:05:00.000Z",
    provider: createStorageProfileSignalProvider({ sourceLabel: "Profile signal memory live storage", store, workspaceId }),
  });
  const result = await service.listUpdateSuggestions({ actorId: "account_orbit_generated", ...(language === undefined ? {} : { language }) });
  assert.equal(result.success, true);
  return result.data;
}

test("profile suggestion copy follows the account language and never leaves English prose in zh or ja", async () => {
  for (const language of ["zh", "ja"] as const) {
    const data = await localizedQueue(language);
    assert.equal(data.suggestions.length, 3, language);
    const composed = [
      data.summary,
      data.nextAction,
      ...data.suggestions.flatMap((suggestion) => [
        suggestion.rationale,
        suggestion.sourceLabel,
        ...(Array.isArray(suggestion.suggestedValue) ? suggestion.suggestedValue : [String(suggestion.suggestedValue)]),
      ]),
    ];
    for (const text of composed) {
      assert.doesNotMatch(text, LATIN_SENTENCE, `${language} copy still reads as English: ${text}`);
      assert.ok(text.trim().length > 0, `${language} copy is empty`);
    }
    assert.match(data.summary, /3/u, "the summary still reports the suggestion count");
  }
});

test("an unknown or missing language falls back to zh, and en still returns English", async () => {
  for (const language of [undefined, "", "fr", "klingon"]) {
    const data = await localizedQueue(language as string | undefined);
    assert.doesNotMatch(data.nextAction, LATIN_SENTENCE, `fallback for ${String(language)} should be zh`);
  }
  const english = await localizedQueue("en");
  assert.match(english.nextAction, LATIN_SENTENCE);
  assert.match(english.summary, /3 sourced profile suggestions/u);
});

test("accepting a suggestion writes a localized patch value, not an English phrase", async () => {
  const workspaceId = "workspace:profile-signal-accept-language";
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  await seedGeneratedRelationshipFixturesIntoLiveStore({ now: () => "2026-07-02T05:00:00.000Z", store, workspaceId });
  const service = createLiveProfileSignalReviewQueueService({
    now: () => "2026-07-02T05:05:00.000Z",
    provider: createStorageProfileSignalProvider({ sourceLabel: "Profile signal memory live storage", store, workspaceId }),
  });
  const queue = await service.listUpdateSuggestions({ actorId: "account_orbit_generated", language: "zh" });
  assert.equal(queue.success, true);
  const target = queue.data.suggestions[0]!;
  const accepted = await service.acceptUpdateSuggestion(target.id, { actorId: "account_orbit_generated", language: "zh", mutationId: "mutation-zh-1" });
  assert.equal(accepted.success, true);
  const patched = Object.values(accepted.data.profilePatch).flatMap((value) => Array.isArray(value) ? value : [String(value)]);
  for (const value of patched) assert.doesNotMatch(value, LATIN_SENTENCE, `accepted patch value is English: ${value}`);
  assert.doesNotMatch(accepted.data.nextAction, LATIN_SENTENCE);
});
