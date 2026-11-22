/**
 * compare() (设计稿 §3.5 首版可组合的整理操作 "比较"; agent-design AG10, AE-FN-014): the records the user chose, side by side
 * on the dimensions asked for — by code, from the stored fields only. A fee the organizer did not state is "no price
 * listed", never free; a start time that is not announced is said so; topics are the record's own.
 */
import type { EventFacts } from "../domains/event/read";
import { feeWords, quoted, whenWordsOf, type Language } from "./copy";

export interface ComparedEvent {
  id: string;
  ref: string;
  title: string;
  startsAt: string | null;
  venue: string | null;
  facts: EventFacts;
}

export type CompareDimension = "time" | "fee" | "topics" | "place";

/** The dimensions the words ask about (all of time, fee and topics when none is named). */
export function dimensionsIn(words: string): CompareDimension[] {
  const out: CompareDimension[] = [];
  if (/(时间|日期|几点|什么时候|日時|時間|いつ|time|date|when)/iu.test(words)) out.push("time");
  if (/(费用|价格|多少钱|收费|免费|门票|料金|費用|値段|無料|fee|price|cost|free)/iu.test(words)) out.push("fee");
  if (/(主题|内容|话题|テーマ|内容|topic|theme|about)/iu.test(words)) out.push("topics");
  if (/(地点|在哪|场地|場所|会場|where|place|venue)/iu.test(words)) out.push("place");
  return out.length ? out : ["time", "fee", "topics"];
}

const LABEL: Record<CompareDimension, Record<Language, string>> = {
  fee: { en: "fee", ja: "料金", zh: "费用" },
  place: { en: "place", ja: "場所", zh: "地点" },
  time: { en: "time", ja: "日時", zh: "时间" },
  topics: { en: "topics", ja: "テーマ", zh: "主题" },
};

function valueOf(event: ComparedEvent, dimension: CompareDimension, language: Language, timeZone: string): string {
  if (dimension === "time") return event.startsAt ? whenWordsOf(event.startsAt, timeZone, language) : { en: "not announced", ja: "未公開", zh: "未公布" }[language];
  if (dimension === "fee") return feeWords(event.facts.fee, language);
  if (dimension === "topics") return event.facts.topics.length ? event.facts.topics.join(language === "en" ? ", " : "、") : { en: "not stated", ja: "記載なし", zh: "没有写" }[language];
  return event.venue ?? { en: "not stated", ja: "記載なし", zh: "没有写" }[language];
}

export function compare(events: readonly ComparedEvent[], dimensions: readonly CompareDimension[], language: Language, timeZone: string): { text: string; cites: string[] } {
  const lines = events.map((event) => {
    const values = dimensions.map((dimension) => `${LABEL[dimension][language]}${language === "en" ? ": " : "："}${valueOf(event, dimension, language, timeZone)}`).join(language === "en" ? "; " : "；");
    return `- ${quoted(language, event.title)}${language === "en" ? ": " : "："}${values}`;
  });
  const head = { en: `Side by side (${dimensions.map((dimension) => LABEL[dimension].en).join(", ")}), from the event records:`, ja: `イベントの記録から並べました（${dimensions.map((dimension) => LABEL[dimension].ja).join("・")}）：`, zh: `按活动记录对比（${dimensions.map((dimension) => LABEL[dimension].zh).join("、")}）：` }[language];
  const unpriced = events.filter((event) => event.facts.fee.kind === "unstated");
  const note = dimensions.includes("fee") && unpriced.length ? [{ en: `${unpriced.map((event) => `"${event.title}"`).join(", ")} lists no price; that does not mean it is free.`, ja: `${unpriced.map((event) => `「${event.title}」`).join("、")}は料金が書かれていません。無料という意味ではありません。`, zh: `${unpriced.map((event) => `「${event.title}」`).join("、")}没有标价，不能当成免费。` }[language]] : [];
  return { cites: events.map((event) => event.ref), text: [head, ...lines, ...note].join("\n") };
}
