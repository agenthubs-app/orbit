// R12 手入力 (DESIGN §2.3, b11 A3, App): the form's pure rules — the duplicate check and
// save bodies, the fields that differ from a candidate (統合 lists only those), the
// 出会った場所 event chips and the density preview. Same rules as the Web drawer
// (orbit-2026/add/manual-model.ts) minus the signature paste (Web only, §9 #12). No React.
import { contactDensity, type ContactDensityLevel } from "../../api/compute/contact-density";
import { normalizePersonName } from "../../api/compute/contact-name-match";
import type { IngestContactCandidateContract } from "../../api/contract/business-card-batch";
import type {
  ManualContactCreateInput,
  ManualContactDuplicateCheckInput,
  ManualContactFieldChoice,
  ManualContactMergeField,
  ManualContactMetContext,
} from "../../api/contract/manual-contact";

export type ManualForm = {
  displayName: string;
  organization: string;
  role: string;
  email: string;
  phone: string;
  note: string;
  met: ManualContactMetContext | null;
};

export const EMPTY_MANUAL_FORM: ManualForm = { displayName: "", email: "", met: null, note: "", organization: "", phone: "", role: "" };

export const MERGE_FIELDS: readonly ManualContactMergeField[] = ["displayName", "organization", "role", "email", "phone"];

const clean = (value: string) => value.trim();

/** Body of POST /api/contacts/manual/duplicates; null while the name is empty. A name alone is checked too (同名). */
export function duplicateCheckBody(form: ManualForm): ManualContactDuplicateCheckInput | null {
  const displayName = clean(form.displayName);
  if (!displayName) return null;
  const body: ManualContactDuplicateCheckInput = { displayName };
  if (clean(form.organization)) body.organization = clean(form.organization);
  if (clean(form.email)) body.email = clean(form.email);
  if (clean(form.phone)) body.phone = clean(form.phone);
  return body;
}

export type ManualDecision =
  | { kind: "none" }
  | { kind: "separate" }
  | { kind: "merge"; contactId: string; choices: Partial<Record<ManualContactMergeField, ManualContactFieldChoice>> };

/** Body of POST /api/contacts/manual for the form and the person's decision about a candidate. */
export function createBody(form: ManualForm, decision: ManualDecision, idempotencyKey: string): ManualContactCreateInput {
  const body: ManualContactCreateInput = { displayName: clean(form.displayName), idempotencyKey };
  for (const field of ["organization", "role", "email", "phone", "note"] as const) {
    if (clean(form[field])) body[field] = clean(form[field]);
  }
  if (form.met) {
    const met: ManualContactMetContext = { kind: form.met.kind };
    if (form.met.eventId) met.eventId = form.met.eventId;
    if (form.met.label && clean(form.met.label)) met.label = clean(form.met.label);
    body.metContext = met;
  }
  if (decision.kind === "merge") {
    body.mergeIntoContactId = decision.contactId;
    body.fieldChoices = decision.choices;
  }
  if (decision.kind === "separate") body.allowDuplicate = true;
  return body;
}

function comparable(field: ManualContactMergeField, value: string): string {
  if (field === "displayName") return normalizePersonName(value);
  const base = value.normalize("NFKC").trim().toLowerCase();
  return field === "phone" ? base.replace(/[^0-9+]/g, "") : base.replace(/\s+/g, " ");
}

/** 統合: only the fields where both sides have a value and the values differ. */
export function differingFields(candidate: IngestContactCandidateContract, form: ManualForm): ManualContactMergeField[] {
  return MERGE_FIELDS.filter((field) => {
    const existing = candidate[field] ?? "";
    const incoming = form[field];
    return Boolean(clean(existing)) && Boolean(clean(incoming)) && comparable(field, existing) !== comparable(field, incoming);
  });
}

/** Default choice for a differing field: what is being typed now (the newer side, b1 B6 note). */
export function defaultChoices(fields: readonly ManualContactMergeField[]): Partial<Record<ManualContactMergeField, ManualContactFieldChoice>> {
  return Object.fromEntries(fields.map((field) => [field, "incoming" as const]));
}

export type EventChip = { eventId: string; title: string; startsAt: string };

const DAY = 86_400_000;

/** 出会った場所 chips: events from 30 days ago to 30 days ahead (参加予定 and 最近参加), nearest first. */
export function eventChips(events: readonly { id?: unknown; title?: unknown; startsAt?: unknown }[], now: Date, limit = 3): EventChip[] {
  const from = now.getTime() - 30 * DAY;
  const to = now.getTime() + 30 * DAY;
  return events
    .flatMap((event) => {
      if (typeof event.id !== "string" || typeof event.title !== "string" || typeof event.startsAt !== "string") return [];
      const at = Date.parse(event.startsAt);
      return Number.isFinite(at) && at >= from && at <= to && event.title.trim() ? [{ distance: Math.abs(at - now.getTime()), eventId: event.id, startsAt: event.startsAt, title: event.title.trim() }] : [];
    })
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit)
    .map(({ eventId, startsAt, title }) => ({ eventId, startsAt, title }));
}

/** M/D in the device calendar (chip suffix). */
export function monthDay(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : `${date.getMonth() + 1}/${date.getDate()}`;
}

/** 保存すると ●○○ / ●●○: the D-10 level of what is in the form. */
export function formDensity(form: ManualForm): ContactDensityLevel {
  return contactDensity({
    hasContactPoint: Boolean(clean(form.email) || clean(form.phone)),
    hasGoalRelation: false,
    hasIdentity: Boolean(clean(form.displayName)),
    hasInteraction: false,
    hasMetContext: Boolean(form.met),
    selfReported: false,
  }).level;
}

/** A stable fingerprint of what would be saved: a new idempotency key when it changes. */
export function formFingerprint(form: ManualForm, decision: ManualDecision): string {
  return JSON.stringify([form, decision]);
}

let sequence = 0;
/** A fresh idempotency key (no crypto needed: uniqueness per device is enough). */
export function newAddKey(operation: string): string {
  sequence += 1;
  return `app:add:${operation}:${Date.now().toString(36)}:${sequence.toString(36)}:${Math.random().toString(36).slice(2, 10)}`;
}
