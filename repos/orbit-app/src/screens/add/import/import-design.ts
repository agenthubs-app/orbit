// R16 像素门禁的只读演示（同 R12 add-scan）：开发包 + `EXPO_PUBLIC_ORBIT_REDESIGN_MOCK=add-scan` 时，
// `contacts/new/import/design-pick|design-organizing|design-review` 用画板 b9 A2 ② ③ ④ 的人数与人名渲染，
// 不读通讯录、不读写服务器。画板上的人名在 import-design-samples.json（数据，不是文案）。
import type { DeviceContactEntry } from "../../../api/compute/vcard-build";
import type { ContactImportBatchView, ContactImportRowView } from "../../../api/contract/contact-import";
import samples from "./import-design-samples.json";

export const IMPORT_DESIGN_NAMES = ["design-pick", "design-organizing", "design-review"] as const;
export type ImportDesignName = (typeof IMPORT_DESIGN_NAMES)[number];

export function isImportDesignName(value: string): value is ImportDesignName {
  return (IMPORT_DESIGN_NAMES as readonly string[]).includes(value);
}

type Sample = { family?: string; given?: string; name?: string; org?: string; title?: string; phone?: string };

function entry(sample: Sample, email?: string): DeviceContactEntry {
  return {
    displayName: sample.name ?? null, familyName: sample.family ?? null, givenName: sample.given ?? null,
    organization: sample.org ?? null, jobTitle: sample.title ?? null,
    emails: email ? [{ value: email }] : [], phones: sample.phone ? [{ value: sample.phone }] : [],
  };
}

/** b9 A2 ②: 1,284 contacts — 238 look like work (214 with a company, 96 with a work email), 46 family / shops. */
function pickEntries(): DeviceContactEntry[] {
  const totals = samples.pickTotals;
  const fill = samples.fillers;
  const board = samples.pick.map((sample) => entry(sample));
  const people: DeviceContactEntry[] = [...board];
  const boardLikely = 3;
  const boardCompany = 3;
  const boardExcluded = 2;
  // Likely with a company: the rest of the 214; the first 72 of them also have a work email.
  for (let index = 0; index < totals.company - boardCompany; index += 1) {
    people.push(entry({ family: fill.work, given: String(index + 1), org: `${fill.workOrg} ${index + 1}` }, index < 72 ? `p${index}@sample-${index}.co.jp` : undefined));
  }
  // Likely by a work email only (no company): 238 − 214 = 24, which makes 96 work emails.
  for (let index = 0; index < totals.likely - boardLikely - (totals.company - boardCompany); index += 1) {
    people.push(entry({ family: fill.work, given: `m${index + 1}` }, `m${index}@sample-mail-${index}.co.jp`));
  }
  for (let index = 0; index < totals.excluded - boardExcluded; index += 1) {
    people.push(entry({ name: index ? `${fill.shop} ${index + 1}` : fill.family }));
  }
  while (people.length < totals.total) people.push(entry({ family: fill.personal, given: String(people.length) }));
  return people;
}

function row(seq: number, fields: Partial<ContactImportRowView["fields"]>, patch: Partial<ContactImportRowView> = {}): ContactImportRowView {
  return {
    seq, issues: [], inFileDuplicateOf: null, candidate: null, decision: "create", mergeIntoContactId: null, status: "pending", contactId: null,
    fields: { displayName: "", organization: "", role: "", email: "", phone: "", location: "", linkedinUrl: "", connectedOn: "", notes: "", ...fields }, ...patch,
  };
}

function candidate(displayName: string, organization: string, identical: boolean) {
  return { contactId: `c-${displayName}`, displayName, organization, role: "", email: "", phone: "", address: "", matchedOn: ["name" as const], identical };
}

/** b9 A2 ④: 連絡先 · 238件 = 4 auto-merged + 2 similar names / 14 要確認 / 218 as they are. */
function reviewRows(): ContactImportRowView[] {
  const r = samples.review;
  const rows: ContactImportRowView[] = [];
  let seq = 1;
  for (let index = 0; index < r.auto; index += 1) rows.push(row(seq++, { displayName: `${samples.fillers.work} a${index}` }, { candidate: candidate(`${samples.fillers.work} a${index}`, "", true), decision: "merge" }));
  for (const dup of r.duplicates) rows.push(row(seq++, { displayName: dup.name, organization: dup.org }, { candidate: candidate(dup.existing, dup.existingOrg, false), decision: null }));
  const issues = r.groups.reduce((sum, group) => sum + group.count, 0);
  for (let index = 0; index < issues; index += 1) rows.push(row(seq++, { displayName: `${samples.fillers.work} r${index}` }, { issues: ["field_truncated"] }));
  for (let index = 0; index < r.asIs; index += 1) rows.push(row(seq++, { displayName: `${samples.fillers.work} ${index}` }));
  return rows;
}

function reviewBatch(): ContactImportBatchView {
  return {
    id: "design-review", kind: "vcard", format: "vcard", status: "reviewing", failureReason: null, fileName: "contacts.vcf", sourceEventId: null,
    rowCount: samples.review.total, headers: [], mapping: null, counts: { created: 0, merged: 0, skipped: 0, failed: 0 }, review: null,
    followUp: { state: "none", enrichmentDeferredUntil: null }, createdAt: "2026-10-07T10:00:00Z", completedAt: null, expiresAt: "2026-10-14T10:00:00Z",
  };
}

export const IMPORT_DESIGN = {
  get pick() { return pickEntries(); },
  organizing: {
    total: samples.organizing.total,
    matched: samples.organizing.matched,
    normalized: samples.organizing.normalized,
    preview: [entry(samples.pick[0]!), entry(samples.pick[2]!)],
  },
  review: {
    get batch() { return reviewBatch(); },
    get rows() { return reviewRows(); },
    excluded: samples.review.excluded,
    groups: samples.review.groups.map((group) => ({ ...group, tone: "mid" as const })),
  },
};
