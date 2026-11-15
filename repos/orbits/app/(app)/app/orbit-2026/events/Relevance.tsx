// 2026-11-15 活动不再打分：「あなたに関係すること」——只列跟你有关的事实（docs/designs/redesign-2026-10/event-relevance-proposal.html）。
// 一个文件两样东西：卡片 / 表格行上的标签（`relevanceChips`，纯函数，可单测）和事实卡（`RelevanceCard`，一行一件事 + 小字依据）。
// 用在：探す卡片与右栏、活动详情、外部活动评估（評価 tab）、计划页活动表。文字全在 copy/events.ts 的 rel* 键。
import type { EventRelevance, EventRelevancePeople, EventRelevanceWarning } from "../../../../../shared/contract/event-relevance";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { eventsCopy as c } from "../copy/events";
import { pickCopy } from "../copy/types";
import styles from "./events.module.css";

type Key = keyof typeof c;
function say(language: OrbitLanguage, key: Key, values: Record<string, string | number> = {}): string {
  let text = pickCopy(c[key], language);
  for (const [name, value] of Object.entries(values)) text = text.replaceAll(`{${name}}`, String(value));
  return text;
}
const yen = (n: number) => n.toLocaleString("en-US");

export type RelevanceTone = "lav" | "teal" | "blue" | "warn";
export interface RelevanceChip { key: string; tone: RelevanceTone; text: string }

/** 「CFO 3名」「VC 2名（登壇）」「製造業 DX 責任者 12社」。 */
export function peopleText(item: EventRelevancePeople, language: OrbitLanguage): string {
  const key: Key = item.source === "speakers" ? "relPeopleSpeakers" : item.source === "exhibitors" ? "relPeopleExhibitors" : "relPeopleRegistrants";
  return say(language, key, { label: item.label, n: item.count });
}

function warningChip(warning: EventRelevanceWarning, index: number, language: OrbitLanguage): RelevanceChip {
  return { key: `warn-${warning.kind}-${index}`, text: say(language, warning.kind === "budget" ? "relBudgetChip" : "relTravelChip"), tone: "warn" };
}

/** 卡片上最多 3 个标签：想见的人（≤2）→ 认识的人 → 主题 → 提醒；有提醒时总留一个位置给它。没有 relevance → 空。 */
export function relevanceChips(relevance: EventRelevance | null | undefined, language: OrbitLanguage, max = 3): RelevanceChip[] {
  if (!relevance) return [];
  const facts: RelevanceChip[] = [
    ...relevance.people.slice(0, 2).map((item, index): RelevanceChip => ({ key: `people-${item.typeKey}-${index}`, text: peopleText(item, language), tone: "lav" })),
    ...(relevance.known && relevance.known.count > 0 ? [{ key: "known", text: say(language, "relKnownChip", { n: relevance.known.count }), tone: "teal" as const }] : []),
    ...(relevance.people.length === 0 && relevance.topic && relevance.topic.labels.length ? [{ key: "topic", text: say(language, "relTopicChip"), tone: "blue" as const }] : []),
  ];
  const warnings = relevance.warnings.map((warning, index) => warningChip(warning, index, language));
  const keepFacts = Math.min(facts.length, max - Math.min(1, warnings.length));
  return [...facts.slice(0, keepFacts), ...warnings.slice(0, max - keepFacts)];
}

/** 「申込 128名」：报名 10 人以上才显示（探す卡片右上，灰色）。 */
export function registrationChipText(count: number | null | undefined, language: OrbitLanguage): string | null {
  return typeof count === "number" && count >= 10 ? say(language, "relRegistered", { n: count }) : null;
}

export interface RelevanceRow { key: string; tone: RelevanceTone; icon: string; main: string; basis: string | null }

/** 事实卡的行（一行一件事 + 依据）。没有任何一行 → 空数组（卡片整张不出）。 */
export function relevanceRows(relevance: EventRelevance | null | undefined, language: OrbitLanguage): RelevanceRow[] {
  if (!relevance) return [];
  const rows: RelevanceRow[] = [];
  const sep = say(language, "relItemSep");
  if (relevance.people.length) {
    const sources = [...new Set(relevance.people.map((item) => item.source))];
    const basis = sources.map((source) => say(language, source === "speakers" ? "relFromSpeakers" : source === "exhibitors" ? "relFromExhibitors" : "relFromRegistrants")).join(sep);
    rows.push({ basis, icon: "👥", key: "people", main: say(language, "relPeopleMain", { items: relevance.people.map((item) => peopleText(item, language)).join(sep) }), tone: "lav" });
  }
  if (relevance.known && relevance.known.count > 0) {
    const names = relevance.known.names.filter(Boolean);
    rows.push({ basis: names.length ? names.join(say(language, "nameJoin")) : null, icon: "🤝", key: "known", main: say(language, "relKnownMain", { n: relevance.known.count }), tone: "teal" });
  }
  if (relevance.people.length === 0 && relevance.topic && relevance.topic.labels.length) {
    const labels = relevance.topic.labels.map((v) => say(language, "relQuote", { v })).join(language === "en" ? ", " : "");
    rows.push({ basis: say(language, "relTopicBasis"), icon: "#", key: "topic", main: say(language, "relTopicMain", { labels }), tone: "blue" });
  }
  relevance.warnings.forEach((warning, index) => {
    rows.push(warning.kind === "budget"
      ? { basis: say(language, "relBudgetBasis", { fee: yen(warning.feeYen) }), icon: "!", key: `budget-${index}`, main: say(language, "relBudgetMain", { limit: yen(warning.limitYen) }), tone: "warn" }
      : { basis: null, icon: "!", key: `travel-${index}`, main: say(language, "relTravelMain", { limit: warning.limitMinutes, m: warning.minutes }), tone: "warn" });
  });
  return rows;
}

const CHIP_TONE: Record<RelevanceTone, string | undefined> = { blue: styles.c_blue, lav: styles.c_lav, teal: styles.c_teal, warn: styles.c_warn };
const ICON_TONE: Record<RelevanceTone, string | undefined> = { blue: styles.t_blue, lav: styles.t_lav, teal: styles.t_teal, warn: styles.t_warn };

/** 标签行；没有标签 → 不渲染。 */
export function RelevanceChips({ relevance, language, className }: { relevance: EventRelevance | null | undefined; language: OrbitLanguage; className?: string }) {
  const chips = relevanceChips(relevance, language);
  if (chips.length === 0) return null;
  return (
    <div className={`${styles.chips} ${className ?? ""}`} data-relevance-chips="">
      {chips.map((chip) => <span key={chip.key} className={`${styles.chip} ${CHIP_TONE[chip.tone] ?? ""}`} data-relevance-chip={chip.tone}>{chip.tone === "warn" ? null : <i className={styles.relDot} aria-hidden />}{chip.text}</span>)}
    </div>
  );
}

/**
 * 「あなたに関係すること」卡：左边图标块，主句 + 灰色小字依据；提醒行用珊瑚色。一行都没有 → 返回 null（整张卡不出）。
 * `heading`：卡内标题（详情页 / 评估页）；右栏等外面已有标题时传 false。
 */
export function RelevanceCard({ relevance, language, className, heading = true }: { relevance: EventRelevance | null | undefined; language: OrbitLanguage; className?: string; heading?: boolean }) {
  const rows = relevanceRows(relevance, language);
  if (rows.length === 0) return null;
  return (
    <div className={`${styles.card} ${styles.relCard} ${className ?? ""}`} data-relevance-card="">
      {heading ? <div className={styles.lbl}>{say(language, "relTitle")}</div> : null}
      {rows.map((row) => (
        <div key={row.key} className={`${styles.relRow} ${row.tone === "warn" ? styles.relWarn : ""}`} data-relevance-row={row.key}>
          <span className={`${styles.relIc} ${ICON_TONE[row.tone] ?? ""}`} aria-hidden>{row.icon}</span>
          <div className={styles.relText}>{row.main}{row.basis ? <small>{row.basis}</small> : null}</div>
        </div>
      ))}
    </div>
  );
}

/** 右栏 / 外面的小标题「あなたに関係すること」。 */
export function relevanceTitle(language: OrbitLanguage): string {
  return say(language, "relTitle");
}
