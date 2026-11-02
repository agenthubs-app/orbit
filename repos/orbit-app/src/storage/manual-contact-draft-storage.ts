// 0146 手入力の下書き: what was typed on the manual-add form, kept on this device only and
// scoped by server + account (the same way as note drafts). It never takes part in the
// duplicate check or the idempotency key: after a restore both are worked out again.
// Sign-out removes it (src/data/account-local-caches.ts).
import AsyncStorage from "@react-native-async-storage/async-storage";

import { INDUSTRY_IDS } from "../api/domain/industries";
import type { ManualForm } from "../screens/add/manual-model";

export type ManualDraftExtra = "met" | "note" | "contact";
const EXTRAS: readonly ManualDraftExtra[] = ["met", "note", "contact"];

export interface ManualContactDraft {
  form: ManualForm;
  /** The あるといいもの fields that were open (they open again on restore). */
  open: readonly ManualDraftExtra[];
  savedAt: string;
}

export interface ManualContactDraftAdapter {
  getItem(key: string): Promise<string | null>;
  removeItem(key: string): Promise<void>;
  setItem(key: string, value: string): Promise<void>;
}

export type ManualContactDraftScope = { accountId: string; server: string };

export function manualContactDraftKey(scope: ManualContactDraftScope): string {
  return `orbit:manual-contact-draft:v1:${encodeURIComponent(scope.server)}:${encodeURIComponent(scope.accountId)}`;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

function isForm(value: unknown): value is ManualForm {
  if (!isRecord(value)) return false;
  const texts = ["displayName", "organization", "role", "email", "phone", "note"] as const;
  if (!texts.every((field) => typeof value[field] === "string")) return false;
  if (value.primaryIndustryId !== null && !(INDUSTRY_IDS as readonly unknown[]).includes(value.primaryIndustryId)) return false;
  const met = value.met;
  if (met === null) return true;
  return isRecord(met) && (met.kind === "event" || met.kind === "intro" || met.kind === "other")
    && (met.eventId === undefined || typeof met.eventId === "string")
    && (met.label === undefined || typeof met.label === "string");
}

function isDraft(value: unknown): value is ManualContactDraft {
  return isRecord(value) && isForm(value.form)
    && Array.isArray(value.open) && value.open.every((extra) => (EXTRAS as readonly unknown[]).includes(extra))
    && typeof value.savedAt === "string" && Number.isFinite(Date.parse(value.savedAt));
}

export function createManualContactDraftStorage(adapter: ManualContactDraftAdapter = {
  getItem: (draftKey) => AsyncStorage.getItem(draftKey),
  removeItem: (draftKey) => AsyncStorage.removeItem(draftKey),
  setItem: (draftKey, value) => AsyncStorage.setItem(draftKey, value),
}) {
  // Writes to one key run in order, so a late autosave cannot bring back a cleared draft.
  const writes = new Map<string, Promise<void>>();
  const enqueue = (draftKey: string, operation: () => Promise<void>): Promise<void> => {
    const next = (writes.get(draftKey) ?? Promise.resolve()).catch(() => {}).then(operation);
    writes.set(draftKey, next);
    void next.finally(() => { if (writes.get(draftKey) === next) writes.delete(draftKey); }).catch(() => {});
    return next;
  };
  return {
    async load(scope: ManualContactDraftScope): Promise<ManualContactDraft | null> {
      const raw = await adapter.getItem(manualContactDraftKey(scope));
      if (!raw) return null;
      try { const parsed: unknown = JSON.parse(raw); return isDraft(parsed) ? parsed : null; }
      catch { return null; }
    },
    async save(scope: ManualContactDraftScope, draft: ManualContactDraft): Promise<void> {
      if (!isDraft(draft)) throw new Error("Manual contact draft is invalid");
      const serialized = JSON.stringify(draft);
      await enqueue(manualContactDraftKey(scope), () => adapter.setItem(manualContactDraftKey(scope), serialized));
    },
    async clear(scope: ManualContactDraftScope): Promise<void> {
      await enqueue(manualContactDraftKey(scope), () => adapter.removeItem(manualContactDraftKey(scope)));
    },
  };
}

export const manualContactDraftStorage = createManualContactDraftStorage();
