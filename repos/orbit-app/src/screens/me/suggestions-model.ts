import type { ManualProfileContract } from "../../api/contract/profile";
import type { ProfileExtraction, ProfileSuggestion } from "../../api/profile-detail-contract";
import { profileBioWithinLimit } from "../../api/schema/profile-bio";

export type AccountSuggestionSource = "chat" | "activity" | "contact" | "conversation" | "business-card" | "resume";
export type AccountSuggestionField = { id: string; key: string; label: string; current: string; proposed: string; value: string | string[]; live?: ProfileSuggestion };
export type AccountSuggestionCard = { id: string; target: "self" | "contact"; name: string; company: string; source: AccountSuggestionSource; sourceLabel: string; createdAt: string; fields: AccountSuggestionField[]; sample?: boolean };
const display = (value: unknown) => Array.isArray(value) ? value.join("、") : typeof value === "string" ? value : "";
const allowed = ["displayName", "organization", "role", "headline", "bio", "offering", "seeking", "homeMarket", "relationshipGoal", "targetRelationshipTypes", "preferredFollowUpWindow", "preferredIntroChannels"];

export function accountLiveSuggestions(suggestions: readonly ProfileSuggestion[], name: string): AccountSuggestionCard[] {
  return suggestions.filter(item => item.status === "pending" && ["chat", "activity", "contact"].includes(item.sourceKind)).map(item => ({
    id: item.id, target: "self", name, company: "", source: item.sourceKind, sourceLabel: item.sourceLabel, createdAt: item.createdAt,
    fields: [{ id: item.id, key: item.targetProfileField, label: item.targetProfileField, current: display(item.currentValue), proposed: display(item.suggestedValue), value: item.suggestedValue, live: item }],
  }));
}
export function accountExtractionSuggestion(extraction: ProfileExtraction, profile: ManualProfileContract): AccountSuggestionCard | null {
  const draft = extraction.state === "success" ? extraction.draft : null;
  if (!draft) return null;
  const patch = { displayName: draft.displayName, organization: draft.organization, role: draft.role, ...draft.suggestedProfileFields };
  const fields = Object.entries(patch).flatMap(([key, value]): AccountSuggestionField[] => {
    const current = profile[key as keyof ManualProfileContract];
    return allowed.includes(key) && value && JSON.stringify(value) !== JSON.stringify(current)
      ? [{ id: `${draft.id}:${key}`, key, label: key, current: display(current), proposed: display(value), value }] : [];
  });
  return fields.length ? { id: draft.id, target: "self", name: profile.displayName, company: profile.organization, source: extraction.kind, sourceLabel: extraction.kind, createdAt: draft.extractedAt, fields } : null;
}
export function suggestionSourceCounts(cards: readonly AccountSuggestionCard[]): Partial<Record<AccountSuggestionSource, number>> {
  const counts: Partial<Record<AccountSuggestionSource, number>> = {};
  for (const card of cards) counts[card.source] = (counts[card.source] ?? 0) + 1;
  return counts;
}
export function selectedAccountPatch(cards: readonly AccountSuggestionCard[], selected: ReadonlySet<string>, _profile: ManualProfileContract): Record<string, string | string[]> {
  const patch: Record<string, string | string[]> = {};
  for (const card of cards) for (const field of card.fields) {
    if (card.target !== "self" || !selected.has(field.id) || !allowed.includes(field.key)) continue;
    if (field.key === "bio" && !profileBioWithinLimit(String(field.value))) throw new Error("Bio limit exceeded");
    if ((field.key === "offering" || field.key === "seeking") && (!Array.isArray(field.value) || field.value.length > 5)) throw new Error("Tag limit exceeded");
    if (field.key in patch && JSON.stringify(patch[field.key]) !== JSON.stringify(field.value)) throw new Error("Conflicting selected fields");
    patch[field.key] = field.value;
  }
  return patch;
}
