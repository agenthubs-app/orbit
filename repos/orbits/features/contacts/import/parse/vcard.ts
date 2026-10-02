/**
 * W0053：vCard 2.1／3.0／4.0 解析（一个文件多张卡）。
 *
 * - 行折叠：CRLF／LF 后跟空格或 Tab 的行并入上一行；2.1 的 QUOTED-PRINTABLE 软换行（行尾 `=`）并入下一行；
 * - 2.1 的 `ENCODING=QUOTED-PRINTABLE`（或裸 `QUOTED-PRINTABLE` 参数）与 `CHARSET=…`；3.0／4.0 的 `\n \, \; \\` 转义；
 * - 取 FN（缺则 N 拼）、ORG 第一段、TITLE、第一个 EMAIL、第一个 TEL（`tel:` URI 去前缀）、第一个 ADR（国家 → ISO 码）、
 *   NOTE、LinkedIn URL。
 */
import { CONTACT_IMPORT_MAX_FIELD_LENGTH, CONTACT_IMPORT_MAX_NOTES_LENGTH } from "../limits";
import { emptyImportFields, type ContactImportParseIssue, type ParsedImportRow } from "../types";
import { countryCodeFromText } from "./country";
import { decodeWithCharset } from "./decode";
import { joinName, normalizeEmail } from "./mapping";

export class VcardTooManyCardsError extends Error {
  constructor(readonly limit: number) {
    super(`vCard file has more than ${limit} cards.`);
  }
}

interface VcardProperty {
  name: string;
  params: Map<string, string[]>;
  rawValue: string;
}

function isQuotedPrintable(line: string): boolean {
  const head = line.slice(0, line.indexOf(":") >= 0 ? line.indexOf(":") : line.length).toUpperCase();
  return /(^|;)(ENCODING=)?QUOTED-PRINTABLE(;|$)/.test(head);
}

function unfold(text: string): string[] {
  const physical = text.split(/\r\n|\n|\r/);
  const logical: string[] = [];
  for (let index = 0; index < physical.length; index += 1) {
    let line = physical[index]!;
    if ((line.startsWith(" ") || line.startsWith("\t")) && logical.length) {
      logical[logical.length - 1] += line.slice(1);
      continue;
    }
    // 2.1 QP 软换行：行尾 `=` 表示值在下一物理行继续（下一行不带前导空格）。
    while (isQuotedPrintable(line) && line.endsWith("=") && index + 1 < physical.length) {
      index += 1;
      line = line.slice(0, -1) + physical[index]!;
    }
    logical.push(line);
  }
  return logical;
}

function splitUnescaped(value: string, separator: string): string[] {
  const parts: string[] = [];
  let current = "";
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]!;
    if (char === "\\" && index + 1 < value.length) {
      current += char + value[index + 1];
      index += 1;
      continue;
    }
    if (char === separator) {
      parts.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  parts.push(current);
  return parts;
}

function unescapeText(value: string): string {
  return value.replace(/\\([nN,;:\\])/g, (_match, char: string) => (char === "n" || char === "N" ? "\n" : char));
}

function parseProperty(line: string): VcardProperty | null {
  const colon = line.indexOf(":");
  if (colon <= 0) return null;
  const head = line.slice(0, colon);
  const rawValue = line.slice(colon + 1);
  const [nameWithGroup, ...paramParts] = splitUnescaped(head, ";");
  const name = (nameWithGroup ?? "").split(".").pop()!.trim().toUpperCase();
  const params = new Map<string, string[]>();
  for (const part of paramParts) {
    const eq = part.indexOf("=");
    if (eq < 0) {
      // 2.1 裸参数：QUOTED-PRINTABLE、CELL、WORK…
      const bare = part.trim().toUpperCase();
      if (bare === "QUOTED-PRINTABLE" || bare === "BASE64" || bare === "8BIT") params.set("ENCODING", [bare]);
      else params.set("TYPE", [...(params.get("TYPE") ?? []), bare]);
      continue;
    }
    const key = part.slice(0, eq).trim().toUpperCase();
    const values = part.slice(eq + 1).replace(/^"|"$/g, "").split(",").map((value) => value.trim());
    params.set(key, [...(params.get(key) ?? []), ...values]);
  }
  return { name, params, rawValue };
}

function quotedPrintableBytes(value: string): Uint8Array {
  const bytes: number[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]!;
    if (char === "=" && /^[0-9A-Fa-f]{2}$/.test(value.slice(index + 1, index + 3))) {
      bytes.push(Number.parseInt(value.slice(index + 1, index + 3), 16));
      index += 2;
      continue;
    }
    for (const byte of new TextEncoder().encode(char)) bytes.push(byte);
  }
  return Uint8Array.from(bytes);
}

/** 解出属性值的文字（处理 QP + CHARSET）；失败返回 null。结构化值（N／ADR／ORG）由调用方再按 `;` 切。 */
function decodedValue(property: VcardProperty): string | null {
  const encoding = property.params.get("ENCODING")?.[0]?.toUpperCase();
  const charset = property.params.get("CHARSET")?.[0];
  if (encoding === "QUOTED-PRINTABLE") return decodeWithCharset(quotedPrintableBytes(property.rawValue), charset);
  if (encoding === "BASE64" || encoding === "B") return null;
  return property.rawValue;
}

function clip(value: string, limit: number, issues: Set<ContactImportParseIssue>): string {
  const trimmed = value.trim();
  if (trimmed.length <= limit) return trimmed;
  issues.add("field_truncated");
  return trimmed.slice(0, limit);
}

function cardFromProperties(properties: readonly VcardProperty[]): ParsedImportRow {
  const issues = new Set<ContactImportParseIssue>();
  const fields = emptyImportFields();
  const first = (name: string) => properties.filter((property) => property.name === name);
  const text = (property: VcardProperty | undefined): string | null => {
    if (!property) return "";
    const value = decodedValue(property);
    if (value === null) {
      issues.add("decode_failed");
      return null;
    }
    return value;
  };
  const components = (property: VcardProperty | undefined): string[] => {
    const value = text(property);
    return value ? splitUnescaped(value, ";").map((part) => unescapeText(part).trim()) : [];
  };

  const fn = text(first("FN")[0]);
  const n = components(first("N")[0]);
  fields.displayName = clip(fn ? unescapeText(fn) : joinName(n[1] ?? "", n[0] ?? ""), CONTACT_IMPORT_MAX_FIELD_LENGTH, issues);
  fields.organization = clip(components(first("ORG")[0])[0] ?? "", CONTACT_IMPORT_MAX_FIELD_LENGTH, issues);
  fields.role = clip(unescapeText(text(first("TITLE")[0]) ?? ""), CONTACT_IMPORT_MAX_FIELD_LENGTH, issues);
  fields.email = normalizeEmail(unescapeText(text(first("EMAIL")[0]) ?? ""), issues);
  const tels = first("TEL");
  const preferredTel = tels.find((tel) => (tel.params.get("TYPE") ?? []).some((type) => /cell|mobile|pref/i.test(type))) ?? tels[0];
  fields.phone = clip(unescapeText(text(preferredTel) ?? "").replace(/^tel:/i, ""), CONTACT_IMPORT_MAX_FIELD_LENGTH, issues);
  const adr = components(first("ADR")[0]);
  if (adr.length) {
    // ADR = 邮政信箱;扩展;街道;城市;省州;邮编;国家
    const [, , street = "", locality = "", region = "", postal = "", country = ""] = adr;
    fields.location = clip([street, locality, region, postal, country].filter(Boolean).join(", "), CONTACT_IMPORT_MAX_FIELD_LENGTH, issues);
    if (country) {
      const code = countryCodeFromText(country);
      if (code) {
        fields.countryCode = code;
        if (locality) fields.city = locality;
      } else {
        issues.add("unknown_country");
      }
    }
  }
  const linkedin = first("URL").map((property) => unescapeText(text(property) ?? "")).find((url) => /linkedin\.com/i.test(url))
    ?? first("X-SOCIALPROFILE").map((property) => unescapeText(text(property) ?? "")).find((url) => /linkedin\.com/i.test(url));
  if (linkedin) fields.linkedinUrl = clip(linkedin, CONTACT_IMPORT_MAX_FIELD_LENGTH, issues);
  fields.notes = clip(unescapeText(text(first("NOTE")[0]) ?? ""), CONTACT_IMPORT_MAX_NOTES_LENGTH, issues);
  if (!fields.displayName && !issues.has("decode_failed")) issues.add("missing_name");
  return { cells: null, fields, issues: [...issues] };
}

export function parseVcards(text: string, options: { maxCards: number }): ParsedImportRow[] {
  const cards: ParsedImportRow[] = [];
  let current: VcardProperty[] | null = null;
  for (const line of unfold(text)) {
    const upper = line.trim().toUpperCase();
    if (upper === "BEGIN:VCARD") {
      current = [];
      continue;
    }
    if (upper === "END:VCARD") {
      if (current) {
        cards.push(cardFromProperties(current));
        if (cards.length > options.maxCards) throw new VcardTooManyCardsError(options.maxCards);
      }
      current = null;
      continue;
    }
    if (!current) continue;
    const property = parseProperty(line);
    if (property) current.push(property);
  }
  return cards;
}
