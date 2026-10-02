/**
 * W0053：导入行的去重核对（纯函数）。
 *
 * - 已有联系人：每批只读一次 `listActorContactRecords`，每行 `findContactCandidate`（同邮箱、同电话 ≥7 位、同姓名+公司；
 *   NFKC、去空白、小写；完全一致优先）；
 * - 文件内重复：同邮箱／同电话／同姓名+公司，后出现的标 `inFileDuplicateOf` 并默认跳过；
 * - 默认决定：解析问题会阻塞的行 → skip（不可改）；文件内重复 → skip；无候选 → create；完全一致 → 预选 merge；
 *   非完全一致 → 留空，必须由用户选（提交时服务端校验）。
 */
import {
  findContactCandidate,
  type CardContactFields,
  type ContactCandidate,
} from "../business-card-contact-match";
import type { LiveRecord } from "../../../shared/storage/live-record-store";
import { isBlockingRow, type ContactImportFields, type ContactImportParseIssue } from "./types";

export type ContactImportDecision = "create" | "merge" | "skip";

export interface ReviewInputRow {
  seq: number;
  fields: ContactImportFields;
  issues: readonly ContactImportParseIssue[];
}

export interface ReviewedRow extends ReviewInputRow {
  inFileDuplicateOf: number | null;
  candidate: ContactCandidate | null;
  decision: ContactImportDecision | null;
  mergeIntoContactId: string | null;
}

export function importCardFields(fields: ContactImportFields): CardContactFields {
  return {
    address: fields.location,
    displayName: fields.displayName,
    email: fields.email,
    organization: fields.organization,
    phone: fields.phone,
    role: fields.role,
  };
}

function normalized(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
}

function inFileKeys(fields: ContactImportFields): string[] {
  const keys: string[] = [];
  if (fields.email) keys.push(`email:${normalized(fields.email)}`);
  const digits = fields.phone.replace(/\D/g, "");
  if (digits.length >= 7) keys.push(`phone:${digits}`);
  if (fields.displayName && fields.organization) {
    keys.push(`name_org:${normalized(fields.displayName).replace(/\s/g, "")}|${normalized(fields.organization)}`);
  }
  return keys;
}

export function reviewImportRows(
  rows: readonly ReviewInputRow[],
  existing: readonly LiveRecord<Record<string, unknown>>[],
  actorId: string,
): ReviewedRow[] {
  const firstSeen = new Map<string, number>();
  return [...rows].sort((a, b) => a.seq - b.seq).map((row) => {
    const blocking = isBlockingRow(row.issues);
    let inFileDuplicateOf: number | null = null;
    if (!blocking) {
      for (const key of inFileKeys(row.fields)) {
        const earlier = firstSeen.get(key);
        if (earlier !== undefined && inFileDuplicateOf === null) inFileDuplicateOf = earlier;
      }
      if (inFileDuplicateOf === null) for (const key of inFileKeys(row.fields)) firstSeen.set(key, row.seq);
    }
    const candidate = blocking ? null : findContactCandidate(existing, actorId, importCardFields(row.fields));
    let decision: ContactImportDecision | null;
    let mergeIntoContactId: string | null = null;
    if (blocking || inFileDuplicateOf !== null) decision = "skip";
    else if (!candidate) decision = "create";
    else if (candidate.identical) {
      decision = "merge";
      mergeIntoContactId = candidate.contactId;
    } else decision = null;
    return { ...row, candidate, decision, inFileDuplicateOf, mergeIntoContactId };
  });
}
