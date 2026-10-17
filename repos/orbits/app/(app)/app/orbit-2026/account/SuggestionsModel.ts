import type { ManualProfileUpdateInput } from "../../../../../features/profile/contract";
import type { ProfileDocumentExtractionDraft } from "../../../../../features/profile/extraction-contract";
import type { ProfileSignalSourceKind, ProfileUpdateSuggestion } from "../../../../../features/profile/signal-contract";
import { profileBioWithinLimit } from "../../../../../shared/api-schema/profile-bio";
import type { ManualProfileContract } from "../../../../../shared/contract/profile";

export type SuggestionSource = ProfileSignalSourceKind | "business-card" | "resume";
export type SuggestionDecision = "pending" | "yes" | "no";
export type SuggestionField =
  | "displayName" | "organization" | "role" | "headline" | "bio" | "offering" | "seeking"
  | "homeMarket" | "relationshipGoal" | "targetRelationshipTypes" | "preferredFollowUpWindow" | "preferredIntroChannels";
export type SuggestionValue = string | readonly string[];
export type SuggestionRow = {
  id: string;
  field: SuggestionField;
  currentValue: SuggestionValue;
  suggestedValue: SuggestionValue;
  decision: SuggestionDecision;
  rationale?: string;
  liveId?: string;
};
export type SuggestionCard = {
  id: string;
  source: SuggestionSource;
  sourceLabel: string;
  createdAt: string;
  rows: SuggestionRow[];
  sample?: boolean;
};

const liveSources: readonly string[] = ["chat", "activity", "contact"];
const liveFields: readonly string[] = [
  "bio", "offering", "seeking", "headline", "homeMarket", "relationshipGoal",
  "targetRelationshipTypes", "preferredFollowUpWindow", "preferredIntroChannels",
];
const extractionFields: readonly SuggestionField[] = [
  "displayName", "organization", "role", "headline", "homeMarket", "relationshipGoal",
  "targetRelationshipTypes", "preferredFollowUpWindow", "preferredIntroChannels",
];

function sameValue(a: SuggestionValue | undefined, b: SuggestionValue | undefined): boolean {
  return JSON.stringify(a ?? "") === JSON.stringify(b ?? "");
}

export function buildLiveCards(suggestions: readonly ProfileUpdateSuggestion[]): SuggestionCard[] {
  return suggestions.filter((item) => item.status === "pending" && liveSources.includes(item.sourceKind)
    && liveFields.includes(item.targetProfileField) && typeof item.id === "string"
    && (typeof item.suggestedValue === "string" || (Array.isArray(item.suggestedValue) && item.suggestedValue.every((value) => typeof value === "string")))
    && (typeof item.currentValue === "string" || (Array.isArray(item.currentValue) && item.currentValue.every((value) => typeof value === "string")))).map((item) => ({
    id: `live:${item.sourceKind}:${item.id}`,
    source: item.sourceKind,
    sourceLabel: item.sourceLabel,
    createdAt: item.createdAt,
    rows: [{
      id: item.id, liveId: item.id, field: item.targetProfileField,
      currentValue: item.currentValue, suggestedValue: item.suggestedValue,
      decision: "pending", rationale: item.rationale,
    }],
  }));
}

export function buildExtractionCard(draft: ProfileDocumentExtractionDraft, profile: ManualProfileContract): SuggestionCard | null {
  const proposed: Partial<Record<SuggestionField, SuggestionValue>> = {
    ...(draft.displayName ? { displayName: draft.displayName } : {}),
    ...(draft.organization ? { organization: draft.organization } : {}),
    ...(draft.role ? { role: draft.role } : {}),
    ...draft.suggestedProfileFields,
  };
  const rows = extractionFields.flatMap((field): SuggestionRow[] => {
    const next = proposed[field];
    const current = profile[field] as SuggestionValue | undefined;
    if (next === undefined || next === "" || (Array.isArray(next) && next.length === 0) || sameValue(current, next)) return [];
    return [{ id: `${draft.id}:${field}`, field, currentValue: current ?? "", suggestedValue: next, decision: "pending" }];
  });
  return rows.length ? { id: `${draft.kind}:${draft.id}`, source: draft.kind, sourceLabel: draft.kind, createdAt: draft.extractedAt, rows } : null;
}

export function setDecision(cards: readonly SuggestionCard[], cardId: string, rowId: string, decision: SuggestionDecision): SuggestionCard[] {
  return cards.map((card) => card.id === cardId
    ? { ...card, rows: card.rows.map((row) => row.id === rowId ? { ...row, decision } : row) }
    : card);
}

export function selectCard(cards: readonly SuggestionCard[], cardId: string): SuggestionCard[] {
  return cards.map((card) => card.id === cardId
    ? { ...card, rows: card.rows.map((row) => ({ ...row, decision: "yes" as const })) }
    : card);
}

export function filterCounts(cards: readonly SuggestionCard[]): Partial<Record<SuggestionSource, number>> {
  const counts: Partial<Record<SuggestionSource, number>> = {};
  for (const card of cards) counts[card.source] = (counts[card.source] ?? 0) + 1;
  return counts;
}

export function selectedProfilePatch(cards: readonly SuggestionCard[]): ManualProfileUpdateInput {
  const patch: Record<string, SuggestionValue> = {};
  for (const row of cards.flatMap((card) => card.rows)) {
    if (row.decision !== "yes") continue;
    if (row.field === "bio" && typeof row.suggestedValue === "string" && !profileBioWithinLimit(row.suggestedValue)) {
      throw new Error("bio exceeds the profile limit");
    }
    if (row.field in patch && !sameValue(patch[row.field], row.suggestedValue)) throw new Error(`Conflicting ${row.field} suggestions`);
    patch[row.field] = row.suggestedValue;
  }
  return patch as ManualProfileUpdateInput;
}
