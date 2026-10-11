// R12 人脈を追加: the few things the add screens keep on this device only (DESIGN §2.2
// step 1, IMPLEMENTATION-PLAN D-m): how often はじめての方へ was shown and whether it was
// turned off, which batch cards went in automatically or were merged (the 完成 counts
// after a reopen), and the drafts the person discarded. A lost value only changes a
// hint or a count, never what is saved on the server, so every read falls back quietly.
export interface AddStorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

// Loaded on first use, so the pure rules here can be tested without the native module.
const asyncStorage = () => import("@react-native-async-storage/async-storage").then((module) => module.default);
const defaultAdapter: AddStorageAdapter = {
  getItem: async (key) => (await asyncStorage()).getItem(key),
  setItem: async (key, value) => (await asyncStorage()).setItem(key, value),
};

let adapter: AddStorageAdapter = defaultAdapter;

/** Test seam: swap the device store (null restores AsyncStorage). */
export function setAddStorageAdapter(next: AddStorageAdapter | null): void {
  adapter = next ?? defaultAdapter;
}

async function readJson<T>(key: string, accept: (value: unknown) => value is T): Promise<T | null> {
  try {
    const raw = await adapter.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return accept(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  try { await adapter.setItem(key, JSON.stringify(value)); } catch { /* best effort */ }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isStringList = (value: unknown): value is string[] => Array.isArray(value) && value.every((entry) => typeof entry === "string");

// ── はじめての方へ ──

export const GUIDE_AUTO_SHOW_LIMIT = 3;
export interface ScanGuideState { shown: number; hidden: boolean }
const GUIDE_KEY = "orbit:add:scan-guide:v1";
const isGuide = (value: unknown): value is ScanGuideState => isRecord(value) && Number.isSafeInteger(value.shown) && typeof value.hidden === "boolean";

export async function readScanGuide(): Promise<ScanGuideState> {
  return (await readJson(GUIDE_KEY, isGuide)) ?? { shown: 0, hidden: false };
}

/** The guide opens by itself only the first three times and never after 次回から表示しない. */
export function shouldAutoShowGuide(state: ScanGuideState): boolean {
  return !state.hidden && state.shown < GUIDE_AUTO_SHOW_LIMIT;
}

export async function recordScanGuideShown(state: ScanGuideState): Promise<ScanGuideState> {
  const next = { ...state, shown: state.shown + 1 };
  await writeJson(GUIDE_KEY, next);
  return next;
}

export async function hideScanGuide(state: ScanGuideState): Promise<ScanGuideState> {
  const next = { ...state, hidden: true };
  await writeJson(GUIDE_KEY, next);
  return next;
}

// ── batch ledger (which cards went in automatically / were merged) ──

export interface ScanLedger { auto: string[]; merged: string[]; user: string[] }
export const EMPTY_LEDGER: ScanLedger = { auto: [], merged: [], user: [] };
const ledgerKey = (batchId: string) => `orbit:add:scan-ledger:v1:${encodeURIComponent(batchId)}`;
const isLedger = (value: unknown): value is ScanLedger => isRecord(value) && isStringList(value.auto) && isStringList(value.merged) && isStringList(value.user);

export async function readScanLedger(batchId: string): Promise<ScanLedger> {
  return (await readJson(ledgerKey(batchId), isLedger)) ?? EMPTY_LEDGER;
}

export async function writeScanLedger(batchId: string, ledger: ScanLedger): Promise<void> {
  await writeJson(ledgerKey(batchId), ledger);
}

// ── discarded drafts (the draft service has no discard; 破棄 hides it on this device) ──

const discardedKey = (accountId: string) => `orbit:add:discarded-drafts:v1:${encodeURIComponent(accountId)}`;

export async function readDiscardedDrafts(accountId: string): Promise<string[]> {
  return (await readJson(discardedKey(accountId), isStringList)) ?? [];
}

export async function discardDraft(accountId: string, draftId: string): Promise<string[]> {
  const current = await readDiscardedDrafts(accountId);
  const next = [...new Set([...current, draftId])].slice(-500);
  await writeJson(discardedKey(accountId), next);
  return next;
}

// ── R15 招待コード: 説明 is shown the first time only; after that the page opens on 共有 (DESIGN §2.4) ──

export const INVITE_GUIDE_KEY = "orbit:add:invite-guide:v1";

export async function readInviteGuideSeen(): Promise<boolean> {
  return (await readJson(INVITE_GUIDE_KEY, (value): value is true => value === true)) === true;
}

export async function markInviteGuideSeen(): Promise<void> {
  await writeJson(INVITE_GUIDE_KEY, true);
}
