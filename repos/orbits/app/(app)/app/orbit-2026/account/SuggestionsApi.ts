import type { ProfilePayload } from "../../../../../features/profile/contract";
import type { ProfileDocumentExtractionDraft, ProfileDocumentExtractionKind } from "../../../../../features/profile/extraction-contract";
import type { ProfileUpdateSuggestion } from "../../../../../features/profile/signal-contract";
import type { ManualProfileContract } from "../../../../../shared/contract/profile";
import { selectedProfilePatch, type SuggestionCard } from "./SuggestionsModel";

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;
type Envelope<T> = { success?: boolean; data?: T; error?: { message?: string } };

async function json<T>(response: Response): Promise<Envelope<T>> {
  return await response.json().catch(() => ({})) as Envelope<T>;
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function same(a: unknown, b: unknown): boolean { return JSON.stringify(a) === JSON.stringify(b); }

export function validSaveReceipt(value: unknown, previous: ManualProfileContract, patch: object, mutationId: string): boolean {
  if (!record(value) || value.state !== "success" || value.mutationId !== mutationId || !record(value.profile) || !record(value.editor) || !record(value.onboarding)) return false;
  const next = value.profile;
  const editor = value.editor;
  const onboarding = value.onboarding;
  const revision = typeof next.updatedAt === "string" ? Date.parse(next.updatedAt) : NaN;
  return next.id === previous.id && Number.isFinite(revision) && revision > Date.parse(previous.updatedAt)
    && editor.lastSavedAt === next.updatedAt && editor.canSave === true
    && Array.isArray(editor.dirtyFields) && Array.isArray(editor.validationMessages)
    && onboarding.policyVersion === 1 && (onboarding.status === "complete" || onboarding.status === "incomplete")
    && Array.isArray(onboarding.missingFields) && onboarding.missingFields.every((field) => typeof field === "string")
    && (onboarding.status === "complete") === (onboarding.missingFields.length === 0)
    && Object.entries(patch).every(([field, expected]) => same(next[field], expected));
}

function validDecisionReceipt(value: unknown, row: SuggestionCard["rows"][number], action: "accept" | "dismiss", mutationId: string): boolean {
  if (!record(value) || value.mutationId !== mutationId) return false;
  const accepted = action === "accept";
  const decision = value[accepted ? "acceptedSuggestion" : "dismissedSuggestion"];
  if (!record(decision) || value.state !== (accepted ? "accepted" : "dismissed")
    || decision.id !== row.liveId || decision.status !== (accepted ? "accepted" : "dismissed")
    || decision.targetProfileField !== row.field || !same(decision.suggestedValue, row.suggestedValue)) return false;
  if (!accepted) return true;
  return Array.isArray(value.appliedFields) && value.appliedFields.length === 1 && value.appliedFields[0] === row.field
    && record(value.profilePatch) && Object.keys(value.profilePatch).length === 1
    && same(value.profilePatch[row.field], row.suggestedValue);
}

export async function readSuggestions(language: string, fetcher: Fetcher = fetch): Promise<ProfileUpdateSuggestion[]> {
  const response = await fetcher(`/api/profile/update-suggestions?language=${encodeURIComponent(language)}`, { cache: "no-store" });
  const body = await json<{ suggestions?: unknown }>(response);
  if (!response.ok || body.success !== true || !Array.isArray(body.data?.suggestions)) throw new Error("Suggestions unavailable");
  return body.data.suggestions as ProfileUpdateSuggestion[];
}

export async function readSuggestionProfile(fetcher: Fetcher = fetch): Promise<ProfilePayload> {
  const response = await fetcher("/api/profile", { cache: "no-store" });
  const body = await json<ProfilePayload>(response);
  if (!response.ok || body.success !== true || !body.data?.profile) throw new Error("Profile unavailable");
  return body.data;
}

export async function extractProfileText(kind: ProfileDocumentExtractionKind, text: string, fetcher: Fetcher = fetch): Promise<ProfileDocumentExtractionDraft | null> {
  const response = await fetcher(`/api/profile/extractions/${kind}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
  const body = await json<{ state?: string; draft?: ProfileDocumentExtractionDraft | null }>(response);
  if (!response.ok || body.success !== true || !body.data) throw new Error("Extraction unavailable");
  return body.data.state === "success" ? body.data.draft ?? null : null;
}

export async function applyConfirmedSelection(
  cards: readonly SuggestionCard[], fetcher: Fetcher = fetch,
  mutationId: () => string = () => globalThis.crypto?.randomUUID?.() ?? `suggestion-${Date.now()}`,
): Promise<{ applied: number; decisionFailures: string[] }> {
  const patch = selectedProfilePatch(cards);
  const yes = cards.flatMap((card) => card.rows).filter((row) => row.decision === "yes");
  const live = cards.flatMap((card) => card.rows).filter((row) => row.liveId && row.decision !== "pending");
  if (yes.length) {
    const current = await readSuggestionProfile(fetcher);
    if (!current.profile?.id || !current.profile.updatedAt) throw new Error("Profile unavailable");
    const id = mutationId();
    const response = await fetcher("/api/profile", {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...patch, expectedUpdatedAt: current.profile!.updatedAt, mutationId: id }),
    });
    const receipt = await json<ProfilePayload>(response);
    if (!response.ok || receipt.success !== true || !validSaveReceipt(receipt.data, current.profile, patch, id)) throw new Error("Profile save failed");
  }
  const decisionFailures: string[] = [];
  for (const row of live) {
    const action = row.decision === "yes" ? "accept" : "dismiss";
    try {
      const id = mutationId();
      const response = await fetcher(`/api/profile/update-suggestions/${encodeURIComponent(row.liveId!)}/${action}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mutationId: id }),
      });
      const body = await json<unknown>(response);
      if (!response.ok || body.success !== true || !validDecisionReceipt(body.data, row, action, id)) throw new Error("Suggestion decision failed");
    } catch { decisionFailures.push(row.liveId!); }
  }
  return { applied: yes.length, decisionFailures };
}
