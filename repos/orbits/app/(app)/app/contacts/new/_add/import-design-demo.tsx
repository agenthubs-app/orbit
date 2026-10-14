/**
 * R16 像素门禁的只读演示（交接表 G08 / 决定表 Q4）：本机开 `ORBIT_REDESIGN_MOCK=add-scan|add-import` 时，
 * `/app/contacts/new/import/design-<状态>` 用设计稿画板的示例数据渲染导入各页（b9 A3 ② ③ ④、b12 W-R16-11a～c），
 * 不读写库；动作全部是空操作。生产环境永远关闭。
 */
"use client";

import type { ContactImportBatchView, ContactImportMapping, ContactImportRowView } from "../../../../../../shared/contract/contact-import";
import { IMPORT_DESIGN_SAMPLE as S } from "../../../../../../features/contacts/import/design-samples";
import { ImportBatchScreen, ImportStartScreen, type ImportBatchActions, type ReviewOverride } from "../../../orbit-2026/add/import/ImportScreens";

import type { ImportDesignFixture } from "./import-design-gate";

const NOOP: ImportBatchActions = { remap: async () => undefined, commit: async () => undefined };

const EMPTY_MAPPING: ContactImportMapping = { name: null, firstName: null, lastName: null, organization: null, role: null, email: null, phone: null, location: null, country: null, linkedinUrl: null, connectedOn: null, notes: null };

function batch(patch: Partial<ContactImportBatchView>): ContactImportBatchView {
  return {
    id: "design", kind: "csv", format: "linkedin", status: "reviewing", failureReason: null, fileName: S.linkedinFile.name, sourceEventId: null,
    rowCount: S.linkedin.rows, headers: [], mapping: EMPTY_MAPPING, counts: { created: 0, merged: 0, skipped: 0, failed: 0 }, review: null,
    followUp: { state: "none", enrichmentDeferredUntil: null }, createdAt: "2026-10-07T10:00:00Z", completedAt: null, expiresAt: "2026-10-14T10:00:00Z", ...patch,
  };
}

function row(seq: number, fields: Partial<ContactImportRowView["fields"]>): ContactImportRowView {
  return {
    seq, issues: [], inFileDuplicateOf: null, candidate: null, decision: "create", mergeIntoContactId: null, status: "pending", contactId: null,
    fields: { displayName: "", organization: "", role: "", email: "", phone: "", location: "", linkedinUrl: "", connectedOn: "", notes: "", ...fields },
  };
}

/** b9 A3 ③: 341 rows, 12 with an email; the first three are the board's people. */
function linkedinRows(): ContactImportRowView[] {
  return Array.from({ length: S.linkedin.rows }, (_, index) => {
    const person = S.linkedin.people[index % S.linkedin.people.length]!;
    return row(index + 1, {
      displayName: person.name,
      organization: person.organization,
      role: person.role,
      connectedOn: S.linkedin.first.connectedOn,
      linkedinUrl: S.linkedin.first.url,
      email: index >= 3 && index < 3 + S.linkedin.emails ? `p${index}@example.com` : "",
    });
  });
}

function csvRows(): ContactImportRowView[] {
  return Array.from({ length: S.csv.rows }, (_, index) => {
    const person = S.csv.people[index % S.csv.people.length]!;
    return row(index + 1, {
      displayName: person.name,
      organization: person.organization,
      role: person.role,
      email: index === 0 ? S.csv.first.email : `p${index}@example.com`,
      phone: index === 0 ? S.csv.first.phone : "03-0000-0000",
    });
  });
}

/** 例外 32 (b9 A3 ③) / 6 (W-R16-11b): tag the trailing rows as duplicates and 要確認 the way the boards count them. */
function withExceptions(rows: ContactImportRowView[], auto: number, dups: number, issues: number): ContactImportRowView[] {
  const candidate = (identical: boolean, name: string) => ({ contactId: "p", displayName: name, organization: "", role: "", email: "", phone: "", address: "", matchedOn: ["email"] as const, identical });
  return rows.map((entry, index) => {
    const from = rows.length - auto - dups - issues;
    if (index < from) return entry;
    if (index < from + auto) return { ...entry, candidate: candidate(true, entry.fields.displayName), decision: "merge" };
    if (index < from + auto + dups) return { ...entry, candidate: candidate(false, entry.fields.displayName), decision: null };
    return { ...entry, issues: ["invalid_email"] };
  });
}

const REVIEW: ReviewOverride = {
  autoMerged: S.review.autoMerged,
  duplicates: S.review.duplicates.map((entry) => ({ ...entry })),
  groups: S.review.groups.map((entry) => ({ ...entry, tone: "mid" as const })),
  asIs: S.review.asIs,
  addCount: S.review.add,
  emails: S.linkedin.emails,
  reviewSub: S.review.reviewSub,
};

export function ImportDesignFixtureClient({ name }: { name: ImportDesignFixture }) {
  if (name === "design-linkedin-upload") return <ImportStartScreen method="linkedin" preset={{ file: { ...S.linkedinFile } }} />;
  if (name === "design-vcard-upload") return <ImportStartScreen method="contacts" preset={{ file: { ...S.vcardFile } }} />;
  if (name === "design-event") {
    return <ImportStartScreen method="event" preset={{ event: {
      events: S.event.events.map((entry) => ({ ...entry })),
      selected: S.event.events[0].eventId,
      people: S.event.people.map((entry, index) => ({ ...entry, seq: index + 1, checked: !entry.inNetwork })),
    } }} />;
  }
  if (name === "design-linkedin-mapping") {
    const mapping = { ...EMPTY_MAPPING, firstName: 0, lastName: 1, organization: 2, role: 3, connectedOn: 4, email: 5, linkedinUrl: 6 };
    return <ImportBatchScreen data={{ phase: "ready", batch: batch({ headers: [...S.linkedin.headers], mapping }), rows: withExceptions(linkedinRows(), 5, 4, 23) }} step="mapping" actions={NOOP} />;
  }
  if (name === "design-csv-mapping") {
    const mapping = { ...EMPTY_MAPPING, name: 0, organization: 2, role: 3, email: 4, phone: 5 };
    return <ImportBatchScreen data={{ phase: "ready", batch: batch({ format: "generic", fileName: S.csv.fileName, rowCount: S.csv.rows, headers: [...S.csv.headers], mapping }), rows: withExceptions(csvRows(), 1, 1, 4) }} step="mapping" actions={NOOP} />;
  }
  return <ImportBatchScreen data={{ phase: "ready", batch: batch({}), rows: linkedinRows() }} step="review" actions={NOOP} review={REVIEW} />;
}
