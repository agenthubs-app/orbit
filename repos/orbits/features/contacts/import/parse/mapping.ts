/**
 * W0053：CSV 表头识别与字段对应。
 *
 * - LinkedIn「Connections.csv」：跳过开头 `Notes:` 起的说明段，表头含 First Name／Last Name／URL／Email Address／
 *   Company／Position／Connected On；
 * - 通用表头：中／英／日同义词表（姓名／名前／Name、公司／会社／Company、职位／役職／Title／Position、邮箱／メール／Email、
 *   电话／電話／Phone、地址／住所／Address…），用户可在 UI 上改对应（`normalizeCsvRow` 用新的对应重算）。
 */
import { CONTACT_IMPORT_MAX_FIELD_LENGTH, CONTACT_IMPORT_MAX_NOTES_LENGTH } from "../limits";
import {
  CONTACT_IMPORT_MAPPABLE_FIELDS,
  emptyImportFields,
  type ContactImportFormat,
  type ContactImportMappableField,
  type ContactImportMapping,
  type ContactImportParseIssue,
  type ParsedImportRow,
} from "../types";
import { countryCodeFromText } from "./country";

function headerKey(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/[\s_\-・:：()（）]/g, "");
}

const SYNONYMS: Record<ContactImportMappableField, readonly string[]> = {
  connectedOn: ["connectedon", "连接日期", "連結日期", "つながった日"],
  country: ["country", "countryregion", "国家", "国家地区", "国", "国地域", "国名"],
  email: ["email", "emailaddress", "e-mail", "mail", "邮箱", "电子邮件", "电子邮箱", "邮件", "郵箱", "メール", "メールアドレス", "eメール", "電子メール"],
  firstName: ["firstname", "givenname", "名", "名字(名)"],
  lastName: ["lastname", "familyname", "surname", "姓"],
  linkedinUrl: ["url", "linkedin", "linkedinurl", "profileurl", "领英", "領英"],
  location: ["address", "location", "city", "地址", "所在地", "城市", "住所", "所在城市"],
  name: ["name", "fullname", "displayname", "姓名", "名字", "名前", "氏名", "联系人", "连络人", "お名前"],
  notes: ["notes", "note", "memo", "comment", "comments", "备注", "備註", "備考", "メモ"],
  organization: ["company", "organization", "organisation", "companyname", "公司", "公司名称", "单位", "会社", "会社名", "企業", "企業名", "所属", "組織"],
  phone: ["phone", "phonenumber", "mobile", "mobilephone", "tel", "telephone", "cell", "电话", "手机", "手机号", "手机号码", "電話", "電話番号", "携帯", "携帯電話", "携帯番号"],
  role: ["title", "jobtitle", "position", "role", "职位", "职务", "職位", "頭銜", "头衔", "役職", "肩書き", "肩書"],
};

const SYNONYM_INDEX = new Map<string, ContactImportMappableField>(
  (Object.entries(SYNONYMS) as [ContactImportMappableField, readonly string[]][]).flatMap(([field, words]) => words.map((word) => [headerKey(word), field] as const)),
);

export function emptyMapping(): ContactImportMapping {
  return Object.fromEntries(CONTACT_IMPORT_MAPPABLE_FIELDS.map((field) => [field, null])) as ContactImportMapping;
}

/** 按同义词自动对应；同一字段只取第一列。 */
export function autoMapping(headers: readonly string[]): ContactImportMapping {
  const mapping = emptyMapping();
  headers.forEach((header, index) => {
    const field = SYNONYM_INDEX.get(headerKey(header));
    if (field && mapping[field] === null) mapping[field] = index;
  });
  return mapping;
}

function mappedCount(mapping: ContactImportMapping): number {
  return Object.values(mapping).filter((value) => value !== null).length;
}

const LINKEDIN_HEADERS = ["firstname", "lastname", "connectedon"];

export interface CsvLayout {
  format: Exclude<ContactImportFormat, "vcard" | "event">;
  headers: string[];
  mapping: ContactImportMapping;
  dataRows: string[][];
}

/** 找表头：LinkedIn 说明段之后的表头；否则前 10 条里第一个能认出 ≥1 个字段的记录；都认不出用第一条。 */
export function detectCsvLayout(records: readonly string[][]): CsvLayout {
  const firstCellIsNotes = (record: readonly string[]) => /^notes\s*:?$/i.test((record[0] ?? "").trim());
  for (let index = 0; index < Math.min(records.length, 20); index += 1) {
    const keys = records[index]!.map(headerKey);
    if (LINKEDIN_HEADERS.every((header) => keys.includes(header))) {
      const headers = records[index]!.map((cell) => cell.trim());
      return { dataRows: records.slice(index + 1), format: "linkedin", headers, mapping: autoMapping(headers) };
    }
  }
  let start = 0;
  // 通用文件也可能带说明段：跳过 `Notes:` 起头的记录及其后紧跟的单格记录。
  if (records[0] && firstCellIsNotes(records[0])) {
    start = 1;
    while (records[start] && records[start]!.filter((cell) => cell.trim()).length <= 1) start += 1;
  }
  for (let index = start; index < Math.min(records.length, start + 10); index += 1) {
    const headers = records[index]!.map((cell) => cell.trim());
    const mapping = autoMapping(headers);
    if (mappedCount(mapping) > 0) return { dataRows: records.slice(index + 1), format: "generic", headers, mapping };
  }
  const headers = (records[start] ?? []).map((cell) => cell.trim());
  return { dataRows: records.slice(start + 1), format: "generic", headers, mapping: emptyMapping() };
}

/** 用户提交的对应：只接受已知字段键与表头范围内的列号。 */
export function sanitizeMapping(input: unknown, headerCount: number): ContactImportMapping | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
  const mapping = emptyMapping();
  for (const [field, value] of Object.entries(input as Record<string, unknown>)) {
    if (!(CONTACT_IMPORT_MAPPABLE_FIELDS as readonly string[]).includes(field)) return null;
    if (value === null) continue;
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value >= headerCount) return null;
    mapping[field as ContactImportMappableField] = value;
  }
  return mapping;
}

const CJK = /[぀-ヿ㐀-鿿豈-﫿]/;
const EMAIL = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

function clip(value: string, limit: number, issues: Set<ContactImportParseIssue>): string {
  const trimmed = value.replace(/\s+/g, (space) => (space.includes("\n") ? "\n" : " ")).trim();
  if (trimmed.length <= limit) return trimmed;
  issues.add("field_truncated");
  return trimmed.slice(0, limit);
}

export function joinName(first: string, last: string): string {
  if (!first) return last;
  if (!last) return first;
  // 中日文姓名姓在前；西文名在前。
  return CJK.test(first) || CJK.test(last) ? `${last} ${first}` : `${first} ${last}`;
}

export function normalizeEmail(raw: string, issues: Set<ContactImportParseIssue>): string {
  const value = raw.trim();
  if (!value) return "";
  const first = value.split(/[;,\s]+/).find(Boolean) ?? "";
  if (EMAIL.test(first)) return first.toLowerCase();
  issues.add("invalid_email");
  return "";
}

/** 一行 CSV 单元格 → 归一字段与问题。 */
export function normalizeCsvRow(cells: readonly string[], mapping: ContactImportMapping, options: { malformed?: boolean } = {}): ParsedImportRow {
  const issues = new Set<ContactImportParseIssue>();
  if (options.malformed) issues.add("malformed_row");
  const cell = (field: ContactImportMappableField, limit = CONTACT_IMPORT_MAX_FIELD_LENGTH) => {
    const index = mapping[field];
    return index === null ? "" : clip(cells[index] ?? "", limit, issues);
  };
  const fields = emptyImportFields();
  fields.displayName = cell("name") || joinName(cell("firstName"), cell("lastName"));
  fields.organization = cell("organization");
  fields.role = cell("role");
  fields.email = normalizeEmail(cell("email"), issues);
  fields.phone = cell("phone");
  fields.location = cell("location");
  fields.linkedinUrl = cell("linkedinUrl");
  fields.connectedOn = cell("connectedOn");
  fields.notes = cell("notes", CONTACT_IMPORT_MAX_NOTES_LENGTH);
  const country = cell("country");
  if (country) {
    const code = countryCodeFromText(country);
    if (code) fields.countryCode = code;
    else issues.add("unknown_country");
  }
  if (!fields.displayName) issues.add("missing_name");
  return { cells: [...cells], fields, issues: [...issues] };
}
