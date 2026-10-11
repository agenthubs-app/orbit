/**
 * R16（DESIGN add-and-invite §3.3、§3.4、§9 #21）：App 通讯录里选中的人 → vCard 3.0 文本，走现有导入（`kind = vcard`）。
 * Owner: 甲 (R16). Used by: App 連絡先导入（只把选中的人转成文本上传）。与服务端解析器
 * `features/contacts/import/parse/vcard.ts` 互为往返测试（tests/domain/vcard-build.test.ts）。
 *
 * - 一个人一张卡：FN（显示名；没有就按姓名拼：中日文姓在前、西文名在前；再没有用读音、公司名、邮箱 @ 前面的部分——
 *   复核 m5：空 FN 会被服务端标成缺名字挡下；名字里的换行折成空格）、N、读音
 *   （X-PHONETIC-LAST-NAME / X-PHONETIC-FIRST-NAME，与 iOS 导出一致）、ORG（公司;部门）、TITLE、全部 EMAIL、全部 TEL
 *   （手机标 CELL——服务端优先取它）、ADR、URL、NOTE。什么都没有的条目不出卡。
 * - 顺序（复核 M2）：服务端只取第一个 EMAIL、第一个 TEL（有 CELL 时取 CELL），所以生成时排好：邮箱 = 标签是 work 或
 *   域名不是免费邮箱的在前；电话 = 手机 → 公司（非传真）→ 代表 / 其他 → 自宅 → 传真。同一档保持通讯录原顺序，一个都不丢。
 * - 文本值按 RFC 2426 转义（`\` `,` `;` 换行），行按 UTF-8 75 字节折行（续行以空格开头），换行用 CRLF。
 * - 纯函数，不碰 IO 与时钟。
 */

import { emailDomain, isFreeMailDomain } from "./work-contact-likelihood";

export interface DeviceContactLabeledValue {
  /** 系统的标签（mobile / iPhone / work / home / main / fax …）；没有就是 undefined。 */
  label?: string | null;
  value: string;
}

export interface DeviceContactAddress {
  label?: string | null;
  street?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  country?: string | null;
}

/** 与端无关的通讯录条目（App 从 expo-contacts 的 Contact 取出这些字段）。 */
export interface DeviceContactEntry {
  displayName?: string | null;
  familyName?: string | null;
  givenName?: string | null;
  middleName?: string | null;
  namePrefix?: string | null;
  nameSuffix?: string | null;
  phoneticFamilyName?: string | null;
  phoneticGivenName?: string | null;
  organization?: string | null;
  department?: string | null;
  jobTitle?: string | null;
  emails: readonly DeviceContactLabeledValue[];
  phones: readonly DeviceContactLabeledValue[];
  addresses?: readonly DeviceContactAddress[];
  urls?: readonly string[];
  note?: string | null;
}

const CJK = /[぀-ヿ㐀-鿿豈-﫿]/u;
const MAX_LINE_BYTES = 75;

function clean(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

/** 名字一栏：换行折成一个空格。 */
function cleanName(value: string | null | undefined): string {
  return clean(value).replace(/\s*[\r\n]+\s*/gu, " ");
}

function joinFamilyGiven(family: string, given: string): string {
  if (!given) return family;
  if (!family) return given;
  return CJK.test(given) || CJK.test(family) ? `${family} ${given}` : `${given} ${family}`;
}

/** RFC 2426 文本转义。 */
function escapeText(value: string): string {
  return value.replace(/\\/gu, "\\\\").replace(/\r\n|\r|\n/gu, "\\n").replace(/,/gu, "\\,").replace(/;/gu, "\\;");
}

function utf8Length(codePoint: number): number {
  return codePoint < 0x80 ? 1 : codePoint < 0x800 ? 2 : codePoint < 0x10000 ? 3 : 4;
}

/** 按 UTF-8 字节折行：每个物理行（含续行开头的空格）≤75 字节，不切开一个字符。 */
function fold(line: string): string {
  const out: string[] = [];
  let current = "";
  let bytes = 0;
  for (const char of line) {
    const size = utf8Length(char.codePointAt(0) ?? 0);
    if (bytes + size > MAX_LINE_BYTES) {
      out.push(current);
      current = ` ${char}`;
      bytes = 1 + size;
      continue;
    }
    current += char;
    bytes += size;
  }
  out.push(current);
  return out.join("\r\n");
}

/** 与服务端 `joinName` 同一口径：中日文姓在前（空格隔开），西文名在前。再没有：读音 → 公司名 → 邮箱 @ 前面的部分。 */
export function deviceContactDisplayName(entry: DeviceContactEntry): string {
  const explicit = cleanName(entry.displayName);
  if (explicit) return explicit;
  const named = joinFamilyGiven(cleanName(entry.familyName), [cleanName(entry.givenName), cleanName(entry.middleName)].filter(Boolean).join(" "));
  if (named) return named;
  const phonetic = joinFamilyGiven(cleanName(entry.phoneticFamilyName), cleanName(entry.phoneticGivenName));
  if (phonetic) return phonetic;
  const organization = cleanName(entry.organization);
  if (organization) return organization;
  for (const email of entry.emails) {
    const local = clean(email.value).split("@")[0]?.trim() ?? "";
    if (local && clean(email.value).includes("@")) return local;
  }
  return "";
}

function phoneType(label: string | null | undefined): string {
  const value = clean(label).toLowerCase();
  if (/mobile|cell|iphone|携帯|手机|モバイル/u.test(value)) return "CELL";
  if (/fax/u.test(value)) return /home/u.test(value) ? "HOME,FAX" : "WORK,FAX";
  if (/work|office|会社|勤務|办公/u.test(value)) return "WORK";
  if (/home|自宅|家/u.test(value)) return "HOME";
  if (/main|代表/u.test(value)) return "MAIN";
  return "VOICE";
}

function emailType(label: string | null | undefined): string {
  const value = clean(label).toLowerCase();
  if (/work|office|会社|勤務|办公/u.test(value)) return "INTERNET,WORK";
  if (/home|自宅|家|personal|private/u.test(value)) return "INTERNET,HOME";
  return "INTERNET";
}

function addressType(label: string | null | undefined): string {
  const value = clean(label).toLowerCase();
  if (/work|office|会社|勤務|办公/u.test(value)) return "WORK";
  if (/home|自宅|家/u.test(value)) return "HOME";
  return "OTHER";
}

/** 邮箱排序档位：0 = 工作（标签是 work，或域名不是免费邮箱）；1 = 其他。 */
function emailRank(email: DeviceContactLabeledValue): number {
  if (emailType(email.label).endsWith("WORK")) return 0;
  const domain = emailDomain(email.value);
  return domain !== null && !isFreeMailDomain(domain) ? 0 : 1;
}

const PHONE_RANK: Record<string, number> = { CELL: 0, WORK: 1, MAIN: 2, VOICE: 2, HOME: 3 };

/** 电话排序档位：手机 → 公司 → 代表 / 其他 → 自宅 → 传真。 */
function phoneRank(phone: DeviceContactLabeledValue): number {
  return PHONE_RANK[phoneType(phone.label)] ?? 4;
}

/** 稳定排序（同档保持原顺序）。 */
function ranked<T>(items: readonly T[], rank: (item: T) => number): T[] {
  return items.map((item, index) => ({ index, item, rank: rank(item) })).sort((left, right) => left.rank - right.rank || left.index - right.index).map(({ item }) => item);
}

/** 一个人一张卡；什么都没有（名字、公司、邮箱、电话都空）时返回空串。 */
export function buildVcard(entry: DeviceContactEntry): string {
  const name = deviceContactDisplayName(entry);
  const emails = ranked(entry.emails.map((email) => ({ label: email.label ?? null, value: clean(email.value) })).filter((email) => email.value), emailRank);
  const phones = ranked(entry.phones.map((phone) => ({ label: phone.label ?? null, value: clean(phone.value) })).filter((phone) => phone.value), phoneRank);
  const organization = clean(entry.organization);
  if (!name && !organization && !emails.length && !phones.length) return "";

  const lines: string[] = ["BEGIN:VCARD", "VERSION:3.0"];
  lines.push(`FN:${escapeText(name)}`);
  lines.push(`N:${[entry.familyName, entry.givenName, entry.middleName, entry.namePrefix, entry.nameSuffix].map((part) => escapeText(cleanName(part))).join(";")}`);
  const phoneticFamily = clean(entry.phoneticFamilyName);
  const phoneticGiven = clean(entry.phoneticGivenName);
  if (phoneticFamily) lines.push(`X-PHONETIC-LAST-NAME:${escapeText(phoneticFamily)}`);
  if (phoneticGiven) lines.push(`X-PHONETIC-FIRST-NAME:${escapeText(phoneticGiven)}`);
  const department = clean(entry.department);
  if (organization || department) lines.push(`ORG:${escapeText(organization)}${department ? `;${escapeText(department)}` : ""}`);
  const title = clean(entry.jobTitle);
  if (title) lines.push(`TITLE:${escapeText(title)}`);
  for (const email of emails) lines.push(`EMAIL;TYPE=${emailType(email.label)}:${escapeText(email.value)}`);
  for (const phone of phones) lines.push(`TEL;TYPE=${phoneType(phone.label)}:${escapeText(phone.value)}`);
  for (const address of entry.addresses ?? []) {
    const parts = [address.street, address.city, address.region, address.postalCode, address.country].map((part) => escapeText(clean(part)));
    if (parts.every((part) => !part)) continue;
    lines.push(`ADR;TYPE=${addressType(address.label)}:;;${parts.join(";")}`);
  }
  for (const url of entry.urls ?? []) {
    const value = clean(url);
    if (value) lines.push(`URL:${value.replace(/[\r\n]+/gu, "")}`);
  }
  const note = clean(entry.note);
  if (note) lines.push(`NOTE:${escapeText(note)}`);
  lines.push("END:VCARD");
  return `${lines.map(fold).join("\r\n")}\r\n`;
}

/** 多个人 → 一个 .vcf 文本（顺序不变，空条目跳过）。 */
export function buildVcards(entries: readonly DeviceContactEntry[]): string {
  return entries.map(buildVcard).filter(Boolean).join("");
}
