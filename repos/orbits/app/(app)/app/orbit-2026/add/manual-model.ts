// R12 手入力 (DESIGN §2.3, b11 A3 Web): the drawer's pure rules — request bodies, the
// fields that differ from a candidate (統合 lists only those), the signature split
// applied to the form, the 出会った場所 event chips and the density preview. No React.
import type { IngestContactCandidateContract } from "../../../../../shared/contract/business-card-batch";
import type {
  ManualContactCreateInput,
  ManualContactDuplicateCheckInput,
  ManualContactFieldChoice,
  ManualContactMergeField,
  ManualContactMetContext,
} from "../../../../../shared/contract/manual-contact";
import { contactDensity, type ContactDensityLevel } from "../../../../../shared/compute/contact-density";
import { normalizePersonName } from "../../../../../shared/compute/contact-name-match";
import type { SignatureField, SignatureSpan } from "../../../../../shared/compute/signature-split";

export type ManualForm = {
  displayName: string;
  organization: string;
  role: string;
  email: string;
  phone: string;
  note: string;
  met: ManualContactMetContext | null;
};

export const EMPTY_MANUAL_FORM: ManualForm = { displayName: "", organization: "", role: "", email: "", phone: "", note: "", met: null };

export const MERGE_FIELDS: readonly ManualContactMergeField[] = ["displayName", "organization", "role", "email", "phone"];

const clean = (value: string) => value.trim();
const optional = (value: string) => (clean(value) ? clean(value) : undefined);

/** Body of POST /api/contacts/manual/duplicates; null while the name is empty (nothing to check). */
export function duplicateCheckBody(form: ManualForm): ManualContactDuplicateCheckInput | null {
  const displayName = clean(form.displayName);
  if (!displayName) return null;
  return {
    displayName,
    ...(optional(form.organization) ? { organization: optional(form.organization) } : {}),
    ...(optional(form.email) ? { email: optional(form.email) } : {}),
    ...(optional(form.phone) ? { phone: optional(form.phone) } : {}),
  };
}

export type ManualDecision =
  | { kind: "none" }
  | { kind: "separate" }
  | { kind: "merge"; contactId: string; choices: Partial<Record<ManualContactMergeField, ManualContactFieldChoice>> };

/** Body of POST /api/contacts/manual for the form and the person's decision about a candidate. */
export function createBody(form: ManualForm, decision: ManualDecision, idempotencyKey: string): ManualContactCreateInput {
  const met = form.met ? { kind: form.met.kind, ...(form.met.eventId ? { eventId: form.met.eventId } : {}), ...(optional(form.met.label ?? "") ? { label: optional(form.met.label ?? "") } : {}) } : undefined;
  return {
    displayName: clean(form.displayName),
    ...(optional(form.organization) ? { organization: optional(form.organization) } : {}),
    ...(optional(form.role) ? { role: optional(form.role) } : {}),
    ...(optional(form.email) ? { email: optional(form.email) } : {}),
    ...(optional(form.phone) ? { phone: optional(form.phone) } : {}),
    ...(met ? { metContext: met } : {}),
    ...(optional(form.note) ? { note: optional(form.note) } : {}),
    ...(decision.kind === "merge" ? { mergeIntoContactId: decision.contactId, fieldChoices: decision.choices } : {}),
    ...(decision.kind === "separate" ? { allowDuplicate: true } : {}),
    idempotencyKey,
  };
}

function comparable(field: ManualContactMergeField, value: string): string {
  if (field === "displayName") return normalizePersonName(value);
  const base = value.normalize("NFKC").trim().toLowerCase();
  return field === "phone" ? base.replace(/[^0-9+]/g, "") : base.replace(/\s+/g, " ");
}

/** 統合: only the fields where both sides have a value and the values differ (DESIGN §2.3). */
export function differingFields(candidate: IngestContactCandidateContract, form: ManualForm): ManualContactMergeField[] {
  return MERGE_FIELDS.filter((field) => {
    const existing = candidate[field] ?? "";
    const incoming = form[field];
    return Boolean(clean(existing)) && Boolean(clean(incoming)) && comparable(field, existing) !== comparable(field, incoming);
  });
}

/** Default choice for a differing field: the newer, non-empty side (b1 B6 note). */
export function defaultChoices(fields: readonly ManualContactMergeField[]): Partial<Record<ManualContactMergeField, ManualContactFieldChoice>> {
  return Object.fromEntries(fields.map((field) => [field, "incoming" as const]));
}

const FORM_FIELD: Partial<Record<SignatureField, keyof Omit<ManualForm, "note" | "met">>> = {
  displayName: "displayName",
  organization: "organization",
  role: "role",
  email: "email",
  phone: "phone",
};

/**
 * The signature's spans into the form: the first span of each field fills that field when it
 * is still empty (what the person typed wins); 郵便番号 / 住所 / URL have no field and are
 * added to the note on their own lines, so nothing pasted is lost.
 */
export function applySignature(form: ManualForm, spans: readonly SignatureSpan[]): ManualForm {
  const next: ManualForm = { ...form };
  const extra: string[] = [];
  const used = new Set<string>();
  for (const span of spans) {
    const field = FORM_FIELD[span.field];
    if (field) {
      if (used.has(field)) continue;
      used.add(field);
      if (!clean(next[field])) next[field] = span.value;
    } else if (!form.note.includes(span.value)) {
      extra.push(span.value);
    }
  }
  if (extra.length) next.note = [clean(form.note), ...extra].filter(Boolean).join("\n");
  return next;
}

/** Highlight runs over the original text: plain text and marked spans in order. */
export function signatureRuns(text: string, spans: readonly SignatureSpan[]): { text: string; field: SignatureField | null }[] {
  const runs: { text: string; field: SignatureField | null }[] = [];
  let at = 0;
  for (const span of [...spans].sort((a, b) => a.start - b.start)) {
    if (span.start < at) continue;
    if (span.start > at) runs.push({ text: text.slice(at, span.start), field: null });
    runs.push({ text: text.slice(span.start, span.end), field: span.field });
    at = span.end;
  }
  if (at < text.length) runs.push({ text: text.slice(at), field: null });
  return runs;
}

export type EventChip = { eventId: string; title: string; startsAt: string };

const DAY = 86_400_000;

/**
 * 出会った場所 chips: the person's events that started in the last 30 days (最近参加; an upcoming
 * event is not where you met — R12 review M3), nearest first, at most `limit`. `now` comes from the caller (no clock here).
 */
export function eventChips(events: readonly { id?: unknown; title?: unknown; startsAt?: unknown }[], now: Date, limit = 3): EventChip[] {
  const from = now.getTime() - 30 * DAY;
  // R12 review M3: only events that have already started — the server also refuses a future one as 会った場所.
  const to = now.getTime();
  return events
    .flatMap((event) => {
      if (typeof event.id !== "string" || typeof event.title !== "string" || typeof event.startsAt !== "string") return [];
      const at = Date.parse(event.startsAt);
      return Number.isFinite(at) && at >= from && at <= to && event.title.trim() ? [{ eventId: event.id, title: event.title.trim(), startsAt: event.startsAt, distance: Math.abs(at - now.getTime()) }] : [];
    })
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit)
    .map(({ eventId, title, startsAt }) => ({ eventId, title, startsAt }));
}

/** M/D in the viewer's calendar (chip suffix). */
export function monthDay(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : `${date.getMonth() + 1}/${date.getDate()}`;
}

/** 保存すると ●○○ / ●●○: the D-10 level of what is in the form. */
export function formDensity(form: ManualForm): ContactDensityLevel {
  return contactDensity({
    hasIdentity: Boolean(clean(form.displayName)),
    hasContactPoint: Boolean(clean(form.email) || clean(form.phone)),
    hasMetContext: Boolean(form.met),
    hasGoalRelation: false,
    hasInteraction: false,
    selfReported: false,
  }).level;
}

/** A stable fingerprint of what would be saved: a new idempotency key when it changes. */
export function formFingerprint(form: ManualForm, decision: ManualDecision): string {
  return JSON.stringify([form, decision]);
}
