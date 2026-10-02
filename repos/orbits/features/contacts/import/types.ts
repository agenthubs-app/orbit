/**
 * W0053：导入行的归一字段、字段对应与解析问题（Web 独有，不进 shared 契约）。
 */
export type ContactImportKind = "csv" | "vcard" | "event";
export type ContactImportFormat = "linkedin" | "generic" | "vcard" | "event";

/** 归一后的一行。空字段一律是空字符串。 */
export interface ContactImportFields {
  displayName: string;
  organization: string;
  role: string;
  email: string;
  phone: string;
  location: string;
  linkedinUrl: string;
  connectedOn: string;
  notes: string;
  /** 文件里明确写出的国家（ISO alpha-2），按 W0045 规则以 `card` 来源写入地区。 */
  countryCode?: string;
  /** 文件里明确写出的城市（vCard ADR 的 locality）。 */
  city?: string;
  /** 活动导入：在哪场活动认识。 */
  metEventId?: string;
  metEventTitle?: string;
}

/** CSV 可对应的目标字段（用户在 UI 上改对应时用的就是这些键）。 */
export const CONTACT_IMPORT_MAPPABLE_FIELDS = [
  "name",
  "firstName",
  "lastName",
  "organization",
  "role",
  "email",
  "phone",
  "location",
  "country",
  "linkedinUrl",
  "connectedOn",
  "notes",
] as const;
export type ContactImportMappableField = (typeof CONTACT_IMPORT_MAPPABLE_FIELDS)[number];

/** 字段 → 表头列号（0 起）；null = 不导入。 */
export type ContactImportMapping = Record<ContactImportMappableField, number | null>;

export type ContactImportParseIssue =
  | "missing_name"
  | "invalid_email"
  | "field_truncated"
  | "unknown_country"
  | "decode_failed";

/** 只缺少会让这一行无法导入的问题（其余是提示，不阻塞）。 */
export const BLOCKING_PARSE_ISSUES: readonly ContactImportParseIssue[] = ["missing_name", "decode_failed"];

export interface ParsedImportRow {
  /** CSV 原始单元格（字段对应改了要据此重算）；vCard 为 null。 */
  cells: readonly string[] | null;
  fields: ContactImportFields;
  issues: ContactImportParseIssue[];
}

export function emptyImportFields(): ContactImportFields {
  return { connectedOn: "", displayName: "", email: "", linkedinUrl: "", location: "", notes: "", organization: "", phone: "", role: "" };
}

export function isBlockingRow(issues: readonly ContactImportParseIssue[]): boolean {
  return issues.some((issue) => BLOCKING_PARSE_ISSUES.includes(issue));
}
