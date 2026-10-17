import type { OrbitApiClient } from "../../api/client";
import type { ManualProfileContract } from "../../api/contract/profile";
import { profileDetailSchema, profileExtractionReceiptSchema, profileSaveReceiptSchema, profileSuggestionDismissReceiptSchema, profileSuggestionReceiptSchema, profileSuggestionsSchema, type ProfileDetail, type ProfileSaveRequest, type ProfileSuggestion } from "../../api/profile-detail-contract";
import { selectedAccountPatch, type AccountSuggestionCard } from "./suggestions-model";

export function createAccountSuggestionsApi(client: OrbitApiClient, profilePath = "/api/profile") {
  async function decision(item: ProfileSuggestion, action: "accept" | "dismiss", mutationId: string, language: string, signal?: AbortSignal): Promise<boolean> {
    const result = await client.post<unknown>(`/api/profile/update-suggestions/${encodeURIComponent(item.id)}/${action}?language=${encodeURIComponent(language)}`, { body: { mutationId }, ...(signal ? { signal } : {}) });
    return result.success && (action === "accept" ? profileSuggestionReceiptSchema(item, mutationId) : profileSuggestionDismissReceiptSchema(item, mutationId)).safeParse(result.data).success;
  }
  return {
    async list(language: string, signal?: AbortSignal) {
      const result = await client.get<unknown>(`/api/profile/update-suggestions?language=${encodeURIComponent(language)}`, signal ? { signal } : {});
      const raw = result.success && result.data && typeof result.data === "object" ? result.data as Record<string, unknown> : null;
      const readable = raw && Array.isArray(raw.suggestions) ? { ...raw, suggestions: raw.suggestions.filter(item => item && typeof item === "object" && ["chat", "activity", "contact"].includes(String(item.sourceKind))) } : raw;
      const parsed = readable ? profileSuggestionsSchema.safeParse(readable) : null;
      return parsed?.success ? parsed.data.suggestions : null;
    },
    async extract(kind: "business-card" | "resume", text: string, signal?: AbortSignal) {
      const result = await client.post<unknown>(`/api/profile/extractions/${kind}`, { body: { text }, ...(signal ? { signal } : {}) });
      const parsed = result.success ? profileExtractionReceiptSchema(kind).safeParse(result.data) : null;
      return parsed?.success ? parsed.data : null;
    },
    dismiss: (item: ProfileSuggestion, mutationId: string, language: string, signal?: AbortSignal) => decision(item, "dismiss", mutationId, language, signal),
    async apply(cards: readonly AccountSuggestionCard[], selected: ReadonlySet<string>, profile: ManualProfileContract, mutationId: () => string, language: string, signal?: AbortSignal): Promise<{ receipt: ProfileDetail | null; decisionFailures: string[] }> {
      const patch = selectedAccountPatch(cards, selected, profile);
      if (!Object.keys(patch).length) return { receipt: null, decisionFailures: [] };
      const body = { displayName: profile.displayName, ...patch, expectedUpdatedAt: profile.updatedAt, mutationId: mutationId() };
      const result = await client.put<unknown>(profilePath, { body, ...(signal ? { signal } : {}) });
      const parsed = result.success ? profileSaveReceiptSchema(profile.id, body as ProfileSaveRequest).safeParse(result.data) : null;
      if (!parsed?.success) return { receipt: null, decisionFailures: [] };
      const decisionFailures: string[] = [];
      for (const field of cards.flatMap(card => card.fields)) {
        if (!selected.has(field.id) || !field.live) continue;
        if (!await decision(field.live, "accept", mutationId(), language, signal)) decisionFailures.push(field.id);
      }
      return { receipt: profileDetailSchema.parse(parsed.data), decisionFailures };
    },
  };
}
