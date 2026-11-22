/**
 * agent-design AG12-1 (设计稿 §3.2, §3.8 先过滤再判断, 附录 B; PLANNER 易错边界 1): who a new contact may already be.
 *
 * Code, by the existing rules (findManualContactCandidates: same e-mail / phone / name + company, then same name), with
 * two narrowings of the conversation:
 * - the same name at a different company is a different person (both companies known and not the same);
 * - the same name, or a name one or two letters off, at the same company is a possible match ("同名同公司，或只差一两个字").
 * At most 3, the existing order first. The candidates never carry contact methods: what goes on to a question (and so
 * to the answer step) is the id, name, company and role.
 */
import { findManualContactCandidates } from "../../../contacts/contact-duplicate-candidates";
import type { LiveRecord } from "../../../../shared/storage/live-record-store";

export interface DuplicateCandidate {
  id: string;
  name: string;
  organization: string | null;
  role: string | null;
  /** Same name and company (or e-mail / phone): the existing rule; "near": a near name at the same company. */
  basis: "rule" | "near";
}

export interface NewContactFields {
  displayName: string;
  organization?: string;
  role?: string;
  email?: string;
  phone?: string;
}

export const DUPLICATE_LIMIT = 3;

const norm = (value: string | null | undefined) => (value ?? "").normalize("NFKC").toLowerCase().replace(/\s+/gu, "").trim();

function distance(left: string, right: string): number {
  const a = [...left];
  const b = [...right];
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const kept = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = kept;
    }
  }
  return row[b.length];
}

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);

export function duplicateCandidates(records: readonly LiveRecord<Record<string, unknown>>[], actorId: string, incoming: NewContactFields): DuplicateCandidate[] {
  const fields = { address: "", displayName: incoming.displayName, email: incoming.email ?? "", organization: incoming.organization ?? "", phone: incoming.phone ?? "", role: incoming.role ?? "" };
  const org = norm(incoming.organization);
  const base = findManualContactCandidates(records, actorId, fields, DUPLICATE_LIMIT + 2)
    .filter((candidate) => {
      if (!candidate.matchedOn.every((reason) => reason === "name")) return true;
      const theirs = norm(candidate.organization);
      return !org || !theirs || theirs === org;
    })
    .map((candidate): DuplicateCandidate => ({ basis: "rule", id: candidate.contactId, name: candidate.displayName, organization: candidate.organization || null, role: candidate.role || null }));
  const name = norm(incoming.displayName);
  const near: DuplicateCandidate[] = [];
  if (org && name.length >= 2) {
    for (const record of records) {
      if (record.lifecycleState !== "active" || base.some((item) => item.id === record.recordId)) continue;
      const theirName = norm(text(record.payload.displayName));
      if (!theirName || norm(text(record.payload.organization)) !== org) continue;
      // The same name at the same company (one the existing rules leave out when both sides have details), or one
      // or two letters off.
      const gap = distance(theirName, name);
      // Short CJK names (张伟 / 张卫东) are one character apart at most; Latin names one or two letters.
      const cjk = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(name + theirName);
      if (gap <= (cjk ? 1 : 2) && gap < Math.max([...theirName].length, [...name].length)) near.push({ basis: "near", id: record.recordId, name: text(record.payload.displayName)!, organization: text(record.payload.organization), role: text(record.payload.role) });
    }
  }
  near.sort((left, right) => left.id.localeCompare(right.id));
  return [...base, ...near].slice(0, DUPLICATE_LIMIT);
}

/** Choosing an existing one changes nothing when everything the user gave is already its value. */
export function nothingToChange(existing: { organization: string | null; role: string | null }, incoming: NewContactFields): boolean {
  return (!incoming.organization || norm(incoming.organization) === norm(existing.organization)) && (!incoming.role || norm(incoming.role) === norm(existing.role));
}
