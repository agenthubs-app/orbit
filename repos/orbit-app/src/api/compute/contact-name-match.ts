/**
 * R12（DESIGN §2.3、§3.4、§9 #10，复核 M6）：姓名规范化与「同名」规则，两端共用。
 * Owner: 甲 (R12). Used by: 手入力の重複チェック（服务端 /api/contacts/manual*）、名片 v2 `duplicates`（同名候选）、两端界面提示。
 *
 * 「同名」只提示、不自动统合（对标 Google 通讯录「可能重复」）：规范化后姓名相同，且至少一方
 * 除姓名外没有任何可比对的信息（公司 / 邮箱 / 电话都为空）——这样「只填名字 → 以后拍名片」能查到；
 * 两边都有公司 / 邮箱 / 电话时交给 `findContactCandidate`（邮箱 / 电话 / 姓名 + 公司）判断，同名不再额外提示，
 * 免得常见姓名（佐藤、John Smith）在不同公司之间互相误报。纯函数，不碰 IO 与时钟。
 */

/** 姓名之间可能出现的分隔：各种空白（含全角空格，NFKC 后为半角）、中黑点。 */
const NAME_SEPARATORS = /[\s·・･​⁠﻿]+/gu;

/**
 * 姓名规范化：NFKC（全角英数→半角、半角片假名→全角、全角空格→半角）、去掉所有空白与中黑点、转小写。
 * 「山田　太郎」「山田 太郎」「山田太郎」相同；「ＪＯＨＮ Smith」「john smith」相同。
 */
export function normalizePersonName(value: string | null | undefined): string {
  if (!value) return "";
  return value.normalize("NFKC").replace(NAME_SEPARATORS, "").toLowerCase();
}

/** 规范化后相同且不为空。 */
export function isSameNameLoose(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = normalizePersonName(a);
  return left.length > 0 && left === normalizePersonName(b);
}

/** 同名判断用到的联系人字段（缺省 / null / 空白都算没有）。 */
export interface NameMatchContact {
  displayName: string | null | undefined;
  organization?: string | null;
  email?: string | null;
  phone?: string | null;
}

function hasText(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/** 除姓名外有没有可比对的信息（公司 / 邮箱 / 电话之一）。 */
export function hasComparableDetail(contact: NameMatchContact): boolean {
  return hasText(contact.organization) || hasText(contact.email) || hasText(contact.phone);
}

/** 「同名」候选：规范化姓名相同，且至少一方没有公司 / 邮箱 / 电话。 */
export function nameOnlyMatch(existing: NameMatchContact, incoming: NameMatchContact): boolean {
  if (!isSameNameLoose(existing.displayName, incoming.displayName)) return false;
  return !hasComparableDetail(existing) || !hasComparableDetail(incoming);
}
