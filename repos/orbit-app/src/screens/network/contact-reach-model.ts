// contact-reach R42 (DESIGN D1/D5/D6/D7, mirrors Web R41's ContactReachModal / network-api / contact-reach-draft):
//   path        canSend || canStart → in-app message, anything else (read failures included) → e-mail draft.
//   send        ONE POST …/messages { body, qualificationVersion, proposal? } with an Idempotency-Key per opening;
//               a retry of the same content reuses it. canStart only: POST conversations/start first.
//   draft       what was written but not sent stays on this device (AsyncStorage), keyed by account + contact + path,
//               cleared after a send; every access is try/catch so the screen works without storage.
import AsyncStorage from "@react-native-async-storage/async-storage";

import type { OrbitApiClient } from "../../api/client";
import { relationshipDeliveryReceiptMatches } from "../../api/contact-communication";
import type { RelationshipEligibilityDTO, RelationshipMessageDTO, RelationshipMessageSendRequestDTO } from "../../api/contract/relationship-communication";
import { relationshipCommunicationEligibilityPath, relationshipCommunicationMessagesPath, relationshipCommunicationStartPath } from "../../api/endpoints";
import type { MeetingSlotSelection } from "../calendar/MeetingSlotPickerSheet";

export type ReachPath = "orbit" | "email";

/** The eligibility fields 連絡する reads (R39 交接); anything unexpected reads as "not allowed". */
export interface ReachEligibility {
  canSend: boolean; canStart: boolean; canProposeMeeting: boolean; activeAppointmentId: string | null;
  conversationId: string | null; qualificationVersion: string | null;
}

const text = (value: unknown) => (typeof value === "string" && value ? value : null);

export function readReachEligibility(value: unknown, contactId: string): ReachEligibility | null {
  const raw = value as Partial<RelationshipEligibilityDTO> | null;
  if (!raw || typeof raw !== "object" || raw.contactId !== contactId) return null;
  return {
    canSend: raw.canSend === true, canStart: raw.canStart === true, canProposeMeeting: raw.canProposeMeeting === true,
    activeAppointmentId: raw.canProposeMeeting === true ? text(raw.activeAppointmentId) : null,
    conversationId: text(raw.conversationId), qualificationVersion: text(raw.qualificationVersion),
  };
}

export const reachPathOf = (eligibility: ReachEligibility | null | undefined): ReachPath => (eligibility && (eligibility.canSend || eligibility.canStart) ? "orbit" : "email");

// The contact page reads eligibility for its path line; the compose screen it opens starts from that answer and reads again.
const eligibilityCache = new Map<string, ReachEligibility | null>();
export const cachedReachEligibility = (account: string, contactId: string) => eligibilityCache.get(`${account}:${contactId}`);
export function rememberReachEligibility(account: string, contactId: string, value: ReachEligibility | null) { eligibilityCache.set(`${account}:${contactId}`, value); }

/** null = could not be read (→ e-mail draft, never blocks). */
export async function loadReachEligibility(client: Pick<OrbitApiClient, "get">, contactId: string, signal?: AbortSignal): Promise<ReachEligibility | null> {
  try {
    const result = await client.get<unknown>(relationshipCommunicationEligibilityPath(contactId), { ...(signal ? { signal } : {}), headers: { "Cache-Control": "no-store" } });
    return result.success ? readReachEligibility(result.data, contactId) : null;
  } catch { return null; }
}

const EMAIL = /^[^\s@?&#/]+@[^\s@?&#/]+\.[^\s@?&#/]+$/;
export const usableEmail = (email: string) => EMAIL.test(email.trim());

/** mailto: with the subject and body encoded (line breaks as CRLF, RFC 6068). null without a usable address. */
export function mailtoHref(email: string, subject: string, body: string): string | null {
  const address = email.trim();
  if (!EMAIL.test(address)) return null;
  return `mailto:${address}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body.replace(/\r?\n/g, "\r\n"))}`;
}

// ---- unsent text on this device ----

export interface ReachDraft {
  body: string;
  subject?: string;
  /** Orbit path: the inserted times (sent as the proposal). */
  proposal?: MeetingSlotSelection | null;
  /** E-mail path: the paragraph inserted last, so 時間を選び直す replaces only it. */
  insertedBlock?: string | null;
  /** E-mail path: the last picked times, to reopen the picker with them. */
  picked?: MeetingSlotSelection | null;
}

const PREFIX = "orbit.contactReach.draft:";
export const reachDraftKey = (account: string, contactId: string, path: ReachPath) => `${PREFIX}${account}:${contactId}:${path}`;

export async function readReachDraft(account: string | null, contactId: string, path: ReachPath): Promise<ReachDraft | null> {
  if (!account) return null;
  try {
    const value = JSON.parse((await AsyncStorage.getItem(reachDraftKey(account, contactId, path))) ?? "null") as ReachDraft | null;
    return value && typeof value.body === "string" ? value : null;
  } catch { return null; }
}

export async function saveReachDraft(account: string | null, contactId: string, path: ReachPath, draft: ReachDraft): Promise<void> {
  if (!account) return;
  try { await AsyncStorage.setItem(reachDraftKey(account, contactId, path), JSON.stringify(draft)); } catch { /* the screen keeps working without storage */ }
}

export async function clearReachDraft(account: string | null, contactId: string, path: ReachPath): Promise<void> {
  if (!account) return;
  try { await AsyncStorage.removeItem(reachDraftKey(account, contactId, path)); } catch { /* nothing to clear */ }
}

// ---- sending ----

export type ReachSendFailure =
  | { reason: "active"; appointmentId: string | null }
  | { reason: "meeting_unavailable" | "stale" | "invalid" | "reused" | "unavailable" | "network" };
export type ReachSendResult = { ok: true; message: RelationshipMessageDTO } | ({ ok: false } & ReachSendFailure);
export type ReachStartResult = { ok: true; conversationId: string; qualificationVersion: string } | { ok: false; reason: "stale" | "failed" };

export async function startReachConversation(client: Pick<OrbitApiClient, "post">, contactId: string): Promise<ReachStartResult> {
  try {
    const result = await client.post<{ conversationId?: unknown; qualificationVersion?: unknown }>(relationshipCommunicationStartPath(), { body: { contactId } });
    if (!result.success) return { ok: false, reason: result.status === 403 || result.status === 404 || result.status === 409 || result.status === 400 ? "stale" : "failed" };
    const conversationId = text(result.data?.conversationId), qualificationVersion = text(result.data?.qualificationVersion);
    return conversationId && qualificationVersion ? { ok: true, conversationId, qualificationVersion } : { ok: false, reason: "stale" };
  } catch { return { ok: false, reason: "failed" }; }
}

export function proposalOf(selection: MeetingSlotSelection): NonNullable<RelationshipMessageSendRequestDTO["proposal"]> {
  return { candidateTimes: selection.slots.map((slot) => ({ startsAtUtc: new Date(slot.startsAt).toISOString() })), durationMinutes: selection.durationMinutes, medium: selection.medium, note: "", timezone: selection.timeZone };
}

/** One send: the receipt must name the delivered message (and the meeting when times went with it). */
export async function sendReachMessage(client: Pick<OrbitApiClient, "post">, input: { conversationId: string; senderAccountId: string; request: Omit<RelationshipMessageSendRequestDTO, "requestId">; idempotencyKey: string }): Promise<ReachSendResult> {
  let result: Awaited<ReturnType<OrbitApiClient["post"]>>;
  try {
    result = await client.post<unknown>(relationshipCommunicationMessagesPath(input.conversationId), { body: input.request, headers: { "Idempotency-Key": input.idempotencyKey } });
  } catch { return { ok: false, reason: "network" }; }
  if (result.success) {
    const withProposal = Boolean(input.request.proposal);
    const receipt = result.data as { message?: RelationshipMessageDTO };
    return relationshipDeliveryReceiptMatches(result.data, { body: input.request.body, conversationId: input.conversationId, qualificationVersion: input.request.qualificationVersion, senderAccountId: input.senderAccountId, withProposal }) && receipt.message
      ? { ok: true, message: receipt.message } : { ok: false, reason: "unavailable" };
  }
  const reason = result.error?.context?.reason;
  if (reason === "MEETING_ALREADY_ACTIVE") return { ok: false, reason: "active", appointmentId: text(result.error.context?.appointmentId) };
  if (reason === "MEETING_NOT_AVAILABLE") return { ok: false, reason: "meeting_unavailable" };
  if (reason === "REQUEST_REUSED") return { ok: false, reason: "reused" };
  if (reason === "STALE" || reason === "REVOKED" || reason === "NOT_AVAILABLE" || result.status === 404 || result.status === 403) return { ok: false, reason: "stale" };
  if (result.status === 0) return { ok: false, reason: "network" };
  if (result.status === 400) return { ok: false, reason: "invalid" };
  return { ok: false, reason: "unavailable" };
}
