// contact-reach R41 (DESIGN D6): what was written in 連絡する but not sent stays on this browser, keyed by
// account + contact + path, so closing and reopening restores it, another contact never sees it, and a sent
// message clears it. Storage can be missing or throw (private windows): every access is try/catch and the
// dialog works without it. Only the person's own unsent text is kept here — never anything read from the server.
import type { MeetingSlotSelection } from "../calendar/MeetingSlotPicker";

export type ReachPath = "orbit" | "email";
export interface ReachDraft {
  body: string;
  subject?: string;
  /** Orbit path: the inserted times (sent as the proposal). */
  proposal?: MeetingSlotSelection | null;
  /** Email path: the paragraph inserted last, so 時間を選び直す replaces only it. */
  insertedBlock?: string | null;
  /** Email path: the last picked times, to reopen the picker with them. */
  picked?: MeetingSlotSelection | null;
}

const PREFIX = "orbit.contactReach.draft:";
export const reachDraftKey = (account: string, contactId: string, path: ReachPath) => `${PREFIX}${account}:${contactId}:${path}`;

export function readReachDraft(account: string | null, contactId: string, path: ReachPath): ReachDraft | null {
  if (!account) return null;
  try {
    const value = JSON.parse(window.localStorage.getItem(reachDraftKey(account, contactId, path)) ?? "null") as ReachDraft | null;
    return value && typeof value.body === "string" ? value : null;
  } catch { return null; }
}

export function saveReachDraft(account: string | null, contactId: string, path: ReachPath, draft: ReachDraft): void {
  if (!account) return;
  try { window.localStorage.setItem(reachDraftKey(account, contactId, path), JSON.stringify(draft)); } catch { /* the dialog keeps working without storage */ }
}

export function clearReachDraft(account: string | null, contactId: string, path: ReachPath): void {
  if (!account) return;
  try { window.localStorage.removeItem(reachDraftKey(account, contactId, path)); } catch { /* nothing to clear */ }
}
