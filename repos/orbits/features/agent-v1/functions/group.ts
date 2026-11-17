/**
 * group() (设计稿 §3.5 首版可组合的整理操作 "分组与汇总"; agent-design AG10, AE-FN-014): records sorted into groups by a
 * field, by code. Each record is counted once (by id) — a record that belongs to several groups appears in each, and the
 * total counts unique records. Events by fee: free, paid (with the amount), and "no price listed" on its own — a fee the
 * organizer did not state is never put with the free ones.
 */
import type { ComparedEvent } from "./compare";
import { feeWords, quoted, whenWordsOf, type Language } from "./copy";

export interface Group<T> {
  key: string;
  label: string;
  items: T[];
}

/** Records into groups by a key function (a record may return several keys); total = unique records. */
export function group<T extends { id: string }>(items: readonly T[], keysOf: (item: T) => readonly string[], order: readonly string[]): { groups: { key: string; items: T[] }[]; total: number } {
  const unique = [...new Map(items.map((item) => [item.id, item])).values()];
  const groups = new Map<string, T[]>(order.map((key) => [key, []]));
  for (const item of unique) {
    for (const key of new Set(keysOf(item))) {
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
    }
  }
  return { groups: [...groups.entries()].map(([key, list]) => ({ items: list, key })), total: unique.length };
}

export function feeGroupOf(event: ComparedEvent): "free" | "paid" | "unpriced" {
  if (event.facts.fee.kind === "free") return "free";
  if (event.facts.fee.kind === "amount") return "paid";
  return "unpriced";
}

const LABEL: Record<"free" | "paid" | "unpriced", Record<Language, string>> = {
  free: { en: "Free", ja: "無料", zh: "免费" },
  paid: { en: "Paid", ja: "有料", zh: "收费" },
  unpriced: { en: "No price listed (not counted as free)", ja: "料金未記載（無料には入れていません）", zh: "未标价（不算免费）" },
};

export function groupEventsByFee(events: readonly ComparedEvent[], language: Language, timeZone: string, period: string | null): { text: string; cites: string[] } {
  const sorted = [...events].sort((left, right) => (left.startsAt ?? "~").localeCompare(right.startsAt ?? "~") || left.id.localeCompare(right.id));
  const { groups, total } = group(sorted, (event) => [feeGroupOf(event)], ["free", "paid", "unpriced"]);
  const head = { en: `${period ? `${period}: ` : ""}${total} events, by fee:`, ja: `${period ?? ""}のイベント${total}件を料金で分けました：`, zh: `${period ?? ""}的活动共${total}场，按费用分组：` }[language];
  const lines: string[] = [head];
  for (const { items, key } of groups) {
    if (!items.length) continue;
    const label = LABEL[key as keyof typeof LABEL][language];
    lines.push(`${label}${language === "en" ? ` (${items.length}):` : `（${items.length}${language === "ja" ? "件" : "场"}）：`}`);
    for (const event of items) lines.push(`- ${quoted(language, event.title)}，${event.startsAt ? whenWordsOf(event.startsAt, timeZone, language) : { en: "time not announced", ja: "日時未公開", zh: "时间未公布" }[language]}${key === "paid" ? `，${feeWords(event.facts.fee, language)}` : ""}`.replace(/，/gu, language === "en" ? ", " : "，"));
  }
  return { cites: sorted.map((event) => event.ref), text: lines.join("\n") };
}
