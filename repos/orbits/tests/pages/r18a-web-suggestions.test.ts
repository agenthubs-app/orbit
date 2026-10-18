import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { ProfileDocumentExtractionDraft } from "../../features/profile/extraction-contract";
import type { ProfileUpdateSuggestion } from "../../features/profile/signal-contract";
import type { ManualProfileContract } from "../../shared/contract/profile";
import { mockProfileFixture, mockManualProfile } from "../../features/profile/fixtures";
import type { AccountDesignSuggestion } from "../../shared/mock/demo-world/account";
import { applyConfirmedSelection } from "../../app/(app)/app/orbit-2026/account/SuggestionsApi";
import { SuggestionsPage } from "../../app/(app)/app/orbit-2026/account/SuggestionsPage";
import {
  buildExtractionCard,
  buildLiveCards,
  filterCounts,
  selectCard,
  selectedProfilePatch,
  setDecision,
} from "../../app/(app)/app/orbit-2026/account/SuggestionsModel";

const root = join(fileURLToPath(import.meta.url), "../../..");
const source = (path: string) => readFileSync(join(root, path), "utf8");

function live(id: string, sourceKind: "chat" | "activity" | "contact", field: "headline" | "bio", value: string): ProfileUpdateSuggestion {
  return {
    id, sourceKind, sourceLabel: sourceKind, targetProfileField: field, currentValue: "old", suggestedValue: value,
    rationale: "From a saved conversation", confidence: "high", status: "pending", createdAt: "2026-10-07T00:00:00Z", evidence: [],
    provenance: { source: "test", sourceLabel: sourceKind, evidenceIds: [], collectedAt: "2026-10-07T00:00:00Z", privacy: "demo-profile-signals-only", generationMethod: "fixture" },
  };
}

test("live cards accept only pending chat/activity/contact suggestions", () => {
  const invalid = { ...live("x", "chat", "headline", "Unsafe"), targetProfileField: "admin" } as unknown as ProfileUpdateSuggestion;
  const cards = buildLiveCards([live("a", "chat", "headline", "New title"), { ...live("b", "contact", "bio", "New bio"), status: "accepted" }, { ...live("c", "activity", "bio", "Another bio") }, invalid]);
  assert.deepEqual(cards.map((card) => card.source), ["chat", "activity"]);
  assert.deepEqual(cards.map((card) => card.rows[0]?.id), ["a", "c"]);
  assert.deepEqual(filterCounts(cards), { chat: 1, activity: 1 });
});

test("document draft becomes an ephemeral self card with changed profile fields only", () => {
  const draft = {
    id: "draft-1", kind: "resume", displayName: "", organization: "New Co", role: "", headline: "Same", homeMarket: "", relationshipGoal: "", targetRelationshipTypes: [], preferredFollowUpWindow: "", preferredIntroChannels: [], confidence: "medium", extractedAt: "2026-10-07T00:00:00Z", evidence: [],
    suggestedProfileFields: { headline: "Same", relationshipGoal: "Meet investors" }, email: "private@example.com",
  } as ProfileDocumentExtractionDraft;
  const profile = { organization: "Old Co", headline: "Same", relationshipGoal: "" } as ManualProfileContract;
  const card = buildExtractionCard(draft, profile);
  assert.ok(card);
  assert.equal(card.source, "resume");
  assert.deepEqual(card.rows.map((row) => row.field), ["organization", "relationshipGoal"]);
  assert.equal(card.rows.every((row) => row.decision === "pending"), true);
  assert.equal(card.rows.some((row) => String(row.field) === "email"), false);
});

test("all-adopt affects one card; only checked fields enter the profile patch", () => {
  const cards = buildLiveCards([live("a", "chat", "headline", "New title"), live("b", "activity", "bio", "New bio")]);
  const one = selectCard(cards, cards[0]!.id);
  assert.deepEqual(one.map((card) => card.rows[0]?.decision), ["yes", "pending"]);
  const two = setDecision(one, cards[1]!.id, "b", "no");
  assert.deepEqual(selectedProfilePatch(two), { headline: "New title" });
  const conflict = selectCard(buildLiveCards([live("a", "chat", "headline", "One"), live("b", "activity", "headline", "Two")]), "live:chat:a");
  assert.throws(() => selectedProfilePatch(selectCard(conflict, "live:activity:b")), /headline/);
});

test("selected seeking tags match the live profile service's normalized save value", () => {
  const suggestion = { ...live("tags", "chat", "bio", "unused"), targetProfileField: "seeking" as const,
    currentValue: [], suggestedValue: ["ＡＢＣ", "ＡＢＣ"] };
  const cards = selectCard(buildLiveCards([suggestion]), "live:chat:tags");
  assert.deepEqual(selectedProfilePatch(cards), { seeking: ["ABC"] });
});

test("confirmed apply writes selected fields with CAS before recording decisions", async () => {
  const calls: { url: string; method: string; body?: Record<string, unknown> }[] = [];
  const fetcher = async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined;
    calls.push({ url, method: init?.method ?? "GET", body });
    if (url === "/api/profile" && init?.method === "PUT") return { ok: true, json: async () => ({ success: true, data: saveReceipt({ headline: "New title" }) }) } as Response;
    if (url === "/api/profile") return { ok: true, json: async () => ({ success: true, data: mockProfileFixture }) } as Response;
    return { ok: true, json: async () => ({ success: true, data: decisionReceipt(url) }) } as Response;
  };
  const cards = selectCard(buildLiveCards([live("a", "chat", "headline", "New title"), live("b", "activity", "bio", "New bio")]), "live:chat:a");
  const result = await applyConfirmedSelection(setDecision(cards, "live:activity:b", "b", "no"), fetcher, () => "m1");
  assert.deepEqual(result, { applied: 1, decisionFailures: [] });
  assert.deepEqual(calls.map((call) => `${call.method} ${call.url}`), [
    "GET /api/profile", "PUT /api/profile", "POST /api/profile/update-suggestions/a/accept", "POST /api/profile/update-suggestions/b/dismiss",
  ]);
  assert.deepEqual(calls[1]?.body, { headline: "New title", expectedUpdatedAt: mockManualProfile.updatedAt, mutationId: "m1" });
});

function saveReceipt(fields: Record<string, unknown>) {
  const updatedAt = "2026-06-24T11:06:00.000Z";
  return { ...mockProfileFixture, state: "success", mutationId: "m1", onboarding: { policyVersion: 1, status: "complete", missingFields: [] },
    profile: { ...mockManualProfile, ...fields, updatedAt }, editor: { ...mockProfileFixture.editor, lastSavedAt: updatedAt } };
}

function decisionReceipt(url: string) {
  const id = url.includes("/a/") ? "a" : "b";
  const accepted = url.endsWith("/accept");
  const suggestion = { ...live(id, id === "a" ? "chat" : "activity", id === "a" ? "headline" : "bio", id === "a" ? "New title" : "New bio"), status: accepted ? "accepted" : "dismissed" };
  return accepted ? { state: "accepted", acceptedSuggestion: suggestion, profilePatch: { [suggestion.targetProfileField]: suggestion.suggestedValue }, appliedFields: [suggestion.targetProfileField], mutationId: "m1" }
    : { state: "dismissed", dismissedSuggestion: suggestion, mutationId: "m1" };
}

test("rejects stale or malformed profile write receipts before deciding suggestions", async () => {
  for (const invalid of [
    { ...saveReceipt({ headline: "New title" }), profile: { ...mockManualProfile, headline: "Old" } },
    { ...saveReceipt({ headline: "New title" }), profile: { ...mockManualProfile, headline: "New title" }, editor: { ...mockProfileFixture.editor, lastSavedAt: mockManualProfile.updatedAt } },
    { ...saveReceipt({ headline: "New title" }), profile: { ...mockManualProfile, id: "other" } },
    { ...saveReceipt({ headline: "New title" }), editor: { ...mockProfileFixture.editor, lastSavedAt: null } },
    { ...saveReceipt({ headline: "New title" }), onboarding: undefined },
  ]) {
    const calls: string[] = [];
    const fetcher = async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${url}`);
      return { ok: true, json: async () => ({ success: true, data: init?.method === "PUT" ? invalid : mockProfileFixture }) } as Response;
    };
    const cards = selectCard(buildLiveCards([live("a", "chat", "headline", "New title")]), "live:chat:a");
    await assert.rejects(() => applyConfirmedSelection(cards, fetcher, () => "m1"));
    assert.deepEqual(calls, ["GET /api/profile", "PUT /api/profile"]);
  }
});

test("rejects a mismatched accept decision receipt visibly", async () => {
  const fetcher = async (url: string, init?: RequestInit) => {
    if (url.endsWith("/accept")) return { ok: true, json: async () => ({ success: true, data: { ...decisionReceipt(url), profilePatch: { headline: "Wrong" } } }) } as Response;
    if (init?.method === "PUT") return { ok: true, json: async () => ({ success: true, data: saveReceipt({ headline: "New title" }) }) } as Response;
    return { ok: true, json: async () => ({ success: true, data: mockProfileFixture }) } as Response;
  };
  const cards = selectCard(buildLiveCards([live("a", "chat", "headline", "New title")]), "live:chat:a");
  assert.deepEqual(await applyConfirmedSelection(cards, fetcher, () => "m1"), { applied: 1, decisionFailures: ["a"] });
});

test("rejects a mismatched dismissal receipt visibly", async () => {
  const fetcher = async (url: string) => ({ ok: true, json: async () => ({ success: true, data: { ...decisionReceipt(url), dismissedSuggestion: { ...live("wrong", "activity", "bio", "New bio"), status: "dismissed" } } }) }) as Response;
  const cards = setDecision(buildLiveCards([live("b", "activity", "bio", "New bio")]), "live:activity:b", "b", "no");
  assert.deepEqual(await applyConfirmedSelection(cards, fetcher, () => "m1"), { applied: 0, decisionFailures: ["b"] });
});

test("failed profile save stops all live decisions", async () => {
  const calls: string[] = [];
  const fetcher = async (url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? "GET"} ${url}`);
    if (init?.method === "PUT") return { ok: false, status: 409, json: async () => ({ success: false }) } as Response;
    return { ok: true, json: async () => ({ success: true, data: mockProfileFixture }) } as Response;
  };
  const cards = selectCard(buildLiveCards([live("a", "chat", "headline", "New title")]), "live:chat:a");
  await assert.rejects(() => applyConfirmedSelection(cards, fetcher, () => "m1"));
  assert.deepEqual(calls, ["GET /api/profile", "PUT /api/profile"]);
});

test("a decision failure is visible after the profile write and can be reconciled", async () => {
  const fetcher = async (url: string, init?: RequestInit) => {
    if (url.endsWith("/accept")) return { ok: false, status: 503, json: async () => ({ success: false }) } as Response;
    if (init?.method === "PUT") return { ok: true, json: async () => ({ success: true, data: saveReceipt({ headline: "New title" }) }) } as Response;
    return { ok: true, json: async () => ({ success: true, data: mockProfileFixture }) } as Response;
  };
  const cards = selectCard(buildLiveCards([live("a", "chat", "headline", "New title")]), "live:chat:a");
  assert.deepEqual(await applyConfirmedSelection(cards, fetcher, () => "m1"), { applied: 1, decisionFailures: ["a"] });
});

test("suggestions route gates contact fixtures to non-production design mode", () => {
  const route = source("app/(app)/app/profile/suggestions/page.tsx");
  assert.match(route, /process\.env\.NODE_ENV !== "production"/);
  assert.match(route, /import\("[\s\S]*demo-world\/account"\)/);
  assert.match(route, /AccountLayout|SuggestionsPage/);
  const client = source("app/(app)/app/orbit-2026/account/SuggestionsPage.tsx");
  assert.doesNotMatch(client, /demoAccountSuggestions|import \{[^}]+\} from "[^"]*demo-world\/account/);
});

test("a design-only contact card renders as a non-actionable sample", () => {
  const sample: AccountDesignSuggestion = {
    id: "sample-contact", target: "contact", name: "Example Person", company: "Example Co", source: "business-card", sourceLabel: "Card", createdAt: "2026-10-07",
    fields: [{ key: "role", label: "Role", current: "Old", proposed: "New" }], sample: true,
  };
  const html = renderToStaticMarkup(createElement(SuggestionsPage, { designCards: [sample] }));
  assert.match(html, /Example Person/);
  assert.match(html, /サンプル|示例|Sample/);
  assert.doesNotMatch(html, /aria-label="采纳 · |aria-label="Accept · |aria-label="採用 · /);
  assert.doesNotMatch(html, /api\/profile\/update-suggestions/);
});
