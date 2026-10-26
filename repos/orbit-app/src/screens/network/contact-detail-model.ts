// R11a 連絡先詳細（App）: pure helpers over the contact detail read (device mirror or GET /api/contacts/:id).
import type { PlanContactFit } from "../../api/contract/plan-v2";
import { regionOptionLabel, type NetworkCityKey } from "./network-model";
import { industryLabel, isIndustryIdCode } from "../../api/domain/industries";
import { COMPLETION_OPTION_LABELS, MEETING_NOTE_PREFIX } from "../../api/compute/completion-question-rules";
import type { OrbitLanguage } from "../../api/contract/language";

export interface DetailFieldHistoryEntry { field: string; previous: string | null; next: string | null; source: string; at: string }

export interface DetailContact {
  id: string;
  connectionId?: string;
  displayName: string;
  organization: string;
  role: string;
  status: string;
  primaryIndustryLabel?: string;
  secondaryIndustryLabel?: string;
  primaryIndustryId?: string;
  secondaryIndustryId?: string;
  seniorityLevel?: string;
  region?: { countryCode: string; city?: string | null };
  primaryEmail: string;
  primaryPhone: string;
  cardNotes?: string;
  nextAction: string;
  tags: string[];
  offering: string[];
  seeking: string[];
  notes: { id: string; body: string; kind: string; createdAt: string; title: string }[];
  lastInteraction: { occurredAt: string; summary: string } | null;
  fieldHistory: DetailFieldHistoryEntry[];
}

const str = (value: unknown) => (typeof value === "string" ? value : "");
const list = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim() !== "") : []);

/** The detail read (`{ state, contact }` or the bare contact) → the fields this screen shows. null when unreadable. */
export function detailContactFrom(payload: Record<string, unknown> | null | undefined): DetailContact | null {
  if (!payload) return null;
  const raw = (typeof payload.contact === "object" && payload.contact !== null ? payload.contact : payload) as Record<string, unknown>;
  if (typeof raw.id !== "string" || typeof raw.displayName !== "string") return null;
  const profile = (typeof raw.publicProfile === "object" && raw.publicProfile !== null ? raw.publicProfile : {}) as Record<string, unknown>;
  const fallback = new Set(list(profile.fallbackFields));
  const last = (typeof raw.lastInteraction === "object" && raw.lastInteraction !== null ? raw.lastInteraction : null) as Record<string, unknown> | null;
  const region = typeof raw.region === "object" && raw.region !== null ? raw.region as { countryCode: string; city?: string | null } : undefined;
  return {
    id: raw.id,
    ...(str(raw.connectionId) ? { connectionId: str(raw.connectionId) } : {}),
    displayName: raw.displayName,
    organization: str(raw.organization),
    role: str(raw.role),
    status: str(raw.status) || "active",
    ...(str(raw.primaryIndustryLabel) ? { primaryIndustryLabel: str(raw.primaryIndustryLabel) } : {}),
    ...(str(raw.secondaryIndustryLabel) ? { secondaryIndustryLabel: str(raw.secondaryIndustryLabel) } : {}),
    ...(str(raw.primaryIndustryId) ? { primaryIndustryId: str(raw.primaryIndustryId) } : {}),
    ...(str(raw.secondaryIndustryId) ? { secondaryIndustryId: str(raw.secondaryIndustryId) } : {}),
    ...(str(raw.seniorityLevel) ? { seniorityLevel: str(raw.seniorityLevel) } : {}),
    ...(region && typeof region.countryCode === "string" ? { region } : {}),
    primaryEmail: str(raw.primaryEmail),
    primaryPhone: str(raw.primaryPhone),
    ...(str(raw.cardNotes) ? { cardNotes: str(raw.cardNotes) } : {}),
    nextAction: str(raw.nextAction),
    tags: list(raw.tags),
    // W0060: relationship fallback values are not the person's own; only real values are shown.
    offering: fallback.has("offering") ? [] : list(profile.offering),
    seeking: fallback.has("seeking") ? [] : list(profile.seeking),
    notes: (Array.isArray(raw.notes) ? raw.notes : []).flatMap((item) => {
      const note = item as Record<string, unknown>;
      const body = str(note.body).trim();
      return body ? [{ id: str(note.noteId) || str(note.id) || body.slice(0, 20), body, kind: str(note.kind), createdAt: str(note.createdAt) || str(note.occurredAt), title: str(note.title) }] : [];
    }),
    lastInteraction: last && str(last.occurredAt) && str(last.summary) ? { occurredAt: str(last.occurredAt), summary: str(last.summary) } : null,
    fieldHistory: (Array.isArray(raw.fieldHistory) ? raw.fieldHistory : []).flatMap((item) => {
      const entry = item as Record<string, unknown>;
      return typeof entry.field === "string" && typeof entry.at === "string"
        ? [{ field: entry.field, previous: typeof entry.previous === "string" ? entry.previous : null, next: typeof entry.next === "string" ? entry.next : null, source: str(entry.source), at: entry.at }]
        : [];
    }),
  };
}

/** Header chips: stage, industry, city (only what the contact has). */
export function detailHeaderChips(contact: DetailContact, cityLabel: (city: NetworkCityKey) => string, language?: OrbitLanguage): { status: string; industry: string | null; city: string | null } {
  const city = contact.region?.city ? regionOptionLabel(contact.region.city, cityLabel, "") : null;
  // QA-C: the stored label is in the language it was saved in; show the catalog label in the UI language when the id is known.
  const industry = language && isIndustryIdCode(contact.primaryIndustryId) ? industryLabel(contact.primaryIndustryId, language) : contact.primaryIndustryLabel ?? null;
  return { status: contact.status, industry, city: city || null };
}

/** Changes the person made themselves in the last 30 days (b9 #21 「…がプロフィールを更新しました」), newest change set first. */
export function recentSelfUpdates(history: readonly DetailFieldHistoryEntry[], nowMs: number): { at: string; entries: DetailFieldHistoryEntry[] } | null {
  const recent = history.filter((entry) => entry.source === "invite_sync" && nowMs - Date.parse(entry.at) <= 30 * 86_400_000);
  if (!recent.length) return null;
  const latest = recent.reduce((max, entry) => (entry.at > max ? entry.at : max), recent[0]!.at);
  return { at: latest, entries: recent.filter((entry) => entry.at === latest) };
}

/** Earlier values of one field, newest first (以前の値). */
export function previousValues(history: readonly DetailFieldHistoryEntry[], field: string): DetailFieldHistoryEntry[] {
  return history.filter((entry) => entry.field === field && entry.previous !== null).slice().reverse();
}

/** The first plan type this contact is a candidate for (人物タイプの確認カード), if any. */
export function fitCandidate(fit: PlanContactFit | null): PlanContactFit["fits"][number] | null {
  return fit?.fits.find((item) => item.status === "candidate") ?? null;
}

/** `M/D` in Tokyo (timeline dates, 「10/8」). */
export function tokyoMonthDay(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  const tokyo = new Date(ms + 9 * 3_600_000);
  return `${tokyo.getUTCMonth() + 1}/${tokyo.getUTCDate()}`;
}

/**
 * QA-C: the 「出会い：…」 line and its fixed answers are stored in Japanese (they are data markers the server parses).
 * Show them in the UI language: the fixed answers map to labels, a typed label stays as typed.
 */
export function localizedMeetingValue(value: string, labels: { intro: string; formerColleague: string; forgot: string }): string {
  const trimmed = value.trim();
  for (const key of ["intro", "formerColleague", "forgot"] as const) {
    const fixed = COMPLETION_OPTION_LABELS[key];
    if (trimmed === fixed) return labels[key];
    if (trimmed.startsWith(fixed)) {
      const rest = trimmed.slice(fixed.length).trim().replace(/^[（(]\s*/u, "").replace(/\s*[）)]$/u, "");
      return rest ? `${labels[key]} (${rest})` : labels[key];
    }
  }
  return trimmed;
}

/** The card-notes body with its 「出会い：…」 line written as "<label>: <value>" in the UI language. */
export function localizedCardNotes(body: string, metLabel: string, labels: { intro: string; formerColleague: string; forgot: string }): string {
  const marker = MEETING_NOTE_PREFIX.slice(0, -1);
  return body.split(/\r?\n/u).map((line) => {
    const match = new RegExp(`^[\\s　]*${marker}[\\s　]*[：:](.*)$`, "u").exec(line);
    return match ? `${metLabel}: ${localizedMeetingValue(match[1]!, labels)}` : line;
  }).join("\n");
}
