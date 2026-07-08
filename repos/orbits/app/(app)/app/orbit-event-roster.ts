// Deterministic attendee roster generator for the seeded events.
//
// The events capability graph drops the fixtures' per-event attendees, so the
// list->detail fallback surfaces only one representative name. For a believable
// event page we synthesize a stable roster (10-100 people) per event id from
// curated name / title / org pools. Deterministic by event id, so the same
// event always shows the same people. Titles are localized; names stay as-is.

import type { OrbitLanguage } from "./orbit-language-core";
import type { OrbitEventAttendeeView } from "./orbit-landing-route-view-model";

interface RosterName {
  initial: string;
  name: string;
}

// A mixed Tokyo-business pool: Japanese, Chinese and Western names.
const NAMES: readonly RosterName[] = [
  { name: "山田 健太", initial: "山" },
  { name: "佐藤 美咲", initial: "佐" },
  { name: "鈴木 大輔", initial: "鈴" },
  { name: "田中 由美", initial: "田" },
  { name: "王 磊", initial: "王" },
  { name: "李 娜", initial: "李" },
  { name: "张 伟", initial: "张" },
  { name: "陈 静", initial: "陈" },
  { name: "刘 洋", initial: "刘" },
  { name: "林 家豪", initial: "林" },
  { name: "黄 雅婷", initial: "黄" },
  { name: "Emma Clarke", initial: "E" },
  { name: "James Miller", initial: "J" },
  { name: "Sophia Nguyen", initial: "S" },
  { name: "Daniel Park", initial: "D" },
  { name: "Olivia Chen", initial: "O" },
  { name: "高橋 翔", initial: "高" },
  { name: "渡辺 彩", initial: "渡" },
  { name: "中村 拓海", initial: "中" },
  { name: "小林 直樹", initial: "小" },
  { name: "赵 敏", initial: "赵" },
  { name: "周 杰", initial: "周" },
  { name: "吴 桂英", initial: "吴" },
  { name: "徐 强", initial: "徐" },
  { name: "Liam O'Brien", initial: "L" },
  { name: "Grace Kim", initial: "G" },
  { name: "Noah Tanaka", initial: "N" },
  { name: "Mia Suzuki", initial: "M" },
  { name: "松本 一郎", initial: "松" },
  { name: "井上 恵", initial: "井" },
  { name: "孙 丽", initial: "孙" },
  { name: "马 强", initial: "马" },
];

const TITLES: readonly Record<OrbitLanguage, string>[] = [
  { zh: "创始人 / CEO", en: "Founder / CEO", ja: "創業者 / CEO" },
  { zh: "联合创始人", en: "Co-Founder", ja: "共同創業者" },
  { zh: "首席技术官", en: "CTO", ja: "CTO" },
  { zh: "产品负责人", en: "Head of Product", ja: "プロダクト責任者" },
  { zh: "增长负责人", en: "Head of Growth", ja: "グロース責任者" },
  { zh: "商务拓展总监", en: "BD Director", ja: "事業開発ディレクター" },
  { zh: "投资合伙人", en: "Investment Partner", ja: "投資パートナー" },
  { zh: "市场总监", en: "Marketing Director", ja: "マーケティング責任者" },
  { zh: "运营负责人", en: "Head of Operations", ja: "オペレーション責任者" },
  { zh: "设计总监", en: "Design Director", ja: "デザインディレクター" },
  { zh: "海外事业负责人", en: "Head of Global", ja: "海外事業責任者" },
  { zh: "社群运营", en: "Community Lead", ja: "コミュニティ運営" },
];

const ORGS: readonly string[] = [
  "Northstar Labs",
  "Aoba Foods",
  "Sakura Capital",
  "Meridian AI",
  "Rakuten Ventures",
  "TenX Studio",
  "Umeda Partners",
  "Blue Ocean D2C",
  "Kanda Robotics",
  "Civic Guild",
  "Hoshino Tech",
  "Pacific Bridge",
  "Nomura Digital",
  "Bamboo Grove",
  "Lumen Retail",
  "Cedar Technologies",
  "Orbit Demo Co.",
  "Yamato FinTech",
  "Green Field Bio",
  "Nexus Semiconductors",
];

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Deterministic roster for an event: 10-100 people derived from the event id.
 * Same id -> same people/count every render.
 */
export function rosterForEvent(
  eventId: string,
  language: OrbitLanguage,
): OrbitEventAttendeeView[] {
  const seed = hashString(eventId || "orbit-event");
  const count = 10 + (seed % 91); // 10..100 inclusive
  const roster: OrbitEventAttendeeView[] = [];
  for (let index = 0; index < count; index += 1) {
    const person = NAMES[(seed + index * 5) % NAMES.length];
    const title = TITLES[(seed + index * 7) % TITLES.length];
    const org = ORGS[(seed + index * 3) % ORGS.length];
    roster.push({
      initial: person.initial,
      name: person.name,
      role: `${title[language] ?? title.zh} · ${org}`,
    });
  }
  return roster;
}
