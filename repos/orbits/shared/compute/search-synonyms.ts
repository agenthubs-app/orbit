// R30 「意味検索 lite」（search/DESIGN.md §5.2 末行，决定表 §50）：静态同义词表，作为意味検索 ON 的第一阶段。
// 零成本、可解释：查询里出现某个概念的词（投資家 / 決裁者 / 製造業 …），就把这个概念的同义词也算作命中；
// 只靠同义词命中的人标「関連」，理由行由规则生成（役職「パートナー」· VC）。不调任何 AI。Pure: no clock, no locale, no IO.
// App 有同一份（sync:contract 同步到 src/api/compute）。
import { normalizeSearchText } from "./search-normalize";

export interface SynonymConcept {
  id: "investor" | "decision_maker" | "manufacturing" | "lawyer" | "engineer";
  /** Words that name the concept in a query (any language). */
  heads: readonly string[];
  /** Words that, found in a contact, count as the concept. */
  synonyms: readonly string[];
  /** A company whose name holds one of these is「会社が {label}」. */
  orgMarkers?: readonly string[];
  orgLabel?: string;
}

export const SEARCH_SYNONYM_CONCEPTS: readonly SynonymConcept[] = [
  {
    id: "investor",
    heads: ["投資家", "投資者", "投资人", "投资者", "investor", "investors"],
    synonyms: ["投资", "合伙人", "VC", "CVC", "エンジェル", "ベンチャーキャピタル", "キャピタル", "ベンチャーズ", "パートナー", "投資", "ファンド", "partner", "angel", "venture", "capital", "fund", "天使投资", "风投", "基金"],
    orgMarkers: ["キャピタル", "ベンチャーズ", "ventures", "capital", "VC", "CVC", "ファンド", "fund", "投資"],
    orgLabel: "VC",
  },
  {
    id: "decision_maker",
    heads: ["決裁者", "意思決定者", "決定権者", "决策者", "decisionmaker", "decision-maker"],
    synonyms: ["社長", "代表取締役", "取締役", "役員", "執行役員", "本部長", "部長", "CEO", "COO", "CFO", "CTO", "CXO", "総経理", "总经理", "董事", "总监", "总裁", "director", "president"],
  },
  {
    id: "manufacturing",
    heads: ["製造業", "製造", "メーカー", "制造业", "manufacturing", "manufacturer"],
    synonyms: ["メーカー", "製作所", "精機", "工業", "工場", "生産技術", "ものづくり", "製造", "manufacturing", "factory", "工厂", "制造"],
    orgMarkers: ["製作所", "精機", "工業", "メーカー", "manufacturing", "工厂", "制造"],
    orgLabel: "メーカー",
  },
  {
    id: "lawyer",
    heads: ["弁護士", "法律家", "律师", "lawyer", "attorney"],
    synonyms: ["弁護士", "法律事務所", "リーガル", "法務", "legal", "law", "律师事务所", "法务"],
    orgMarkers: ["法律事務所", "lawfirm", "律师事务所"],
    orgLabel: "法律事務所",
  },
  {
    id: "engineer",
    heads: ["エンジニア", "技術者", "工程师", "engineer", "engineers"],
    synonyms: ["エンジニア", "開発", "技術", "CTO", "developer", "engineering", "工程师", "开发"],
  },
];

const fold = (value: string) => normalizeSearchText(value);
const FOLDED = SEARCH_SYNONYM_CONCEPTS.map((concept) => ({
  concept,
  heads: concept.heads.map(fold),
  synonyms: concept.synonyms.map(fold),
  orgMarkers: (concept.orgMarkers ?? []).map(fold),
}));

/** The concepts a folded query term names (「製造業の決裁者」 → manufacturing + decision_maker). */
export function conceptsInTerm(term: string): SynonymConcept[] {
  return FOLDED.filter((entry) => entry.heads.some((head) => term.includes(head))).map((entry) => entry.concept);
}

/** True when at least one term of the query names a concept — i.e. lite has something to add. */
export function liteCanExpand(terms: readonly string[]): boolean {
  return terms.some((term) => conceptsInTerm(term).length > 0);
}

/** Every word lite would search for this query: the terms themselves plus each named concept's heads and synonyms. */
export function liteRecallWords(terms: readonly string[]): string[] {
  const words = new Set<string>(terms);
  for (const term of terms) {
    for (const concept of conceptsInTerm(term)) {
      const entry = FOLDED.find((item) => item.concept === concept)!;
      for (const word of [...entry.heads, ...entry.synonyms]) words.add(word);
    }
  }
  // Recall is a substring match, so a word that contains another listed word finds nobody new (「投资人」 ⊃ 「投资」);
  // dropping those keeps the capped word list for words that add people.
  const list = [...words];
  return list.filter((word) => !list.some((other) => other !== word && other.length > 0 && word.includes(other)));
}

export interface LitePerson {
  name: string;
  org?: string | null;
  role?: string | null;
  other?: readonly (string | null | undefined)[];
}

export type LiteReasonCopy = {
  role: (text: string) => string;
  company: (label: string) => string;
  note: (text: string) => string;
  quote: (text: string) => string;
  join: string;
};

export const LITE_REASON_COPY: Record<"ja" | "zh" | "en", LiteReasonCopy> = {
  ja: { company: (label) => `会社が ${label}`, join: " · ", note: (text) => `メモ「${text}」`, quote: (text) => `「${text}」`, role: (text) => `役職「${text}」` },
  zh: { company: (label) => `公司是 ${label}`, join: " · ", note: (text) => `备注「${text}」`, quote: (text) => `「${text}」`, role: (text) => `职务「${text}」` },
  en: { company: (label) => `Company is ${label}`, join: " · ", note: (text) => `Note “${text}”`, quote: (text) => `“${text}”`, role: (text) => `Role “${text}”` },
};

const SNIPPET = 14;
const clip = (text: string) => (Array.from(text).length > SNIPPET ? `${Array.from(text).slice(0, SNIPPET - 1).join("")}…` : text);

export interface LiteMatch {
  /** literal: every query term appears as typed; related: only through a concept's words. */
  kind: "literal" | "related";
  reason: string | null;
}

/**
 * Does this person answer the query under lite? Each term must hit: literally (the folded term in any field) or, when
 * the term names concepts, through every named concept (a head or a synonym in any field). The reason names the
 * field that carried the hit, in the board's order: role, then company, then the first other field.
 */
export function liteMatch(person: LitePerson, terms: readonly string[], language: "ja" | "zh" | "en" = "ja"): LiteMatch | null {
  if (!terms.length) return null;
  const role = person.role ?? "";
  const org = person.org ?? "";
  const others = (person.other ?? []).filter((value): value is string => Boolean(value && value.trim()));
  const fields = [person.name, org, role, ...others].map(fold);
  const all = fields.join(" ");
  let literal = true;
  const hitWords: string[] = [];
  for (const term of terms) {
    if (all.includes(term)) { hitWords.push(term); continue; }
    literal = false;
    const concepts = conceptsInTerm(term);
    if (!concepts.length) return null;
    for (const concept of concepts) {
      const entry = FOLDED.find((item) => item.concept === concept)!;
      const words = [...entry.heads, ...entry.synonyms].filter((candidate) => all.includes(candidate));
      if (!words.length) return null;
      hitWords.push(...words);
    }
  }
  const copy = LITE_REASON_COPY[language];
  const has = (value: string) => hitWords.some((word) => fold(value).includes(word));
  const parts: string[] = [];
  if (role && has(role)) parts.push(copy.role(clip(role)));
  const label = FOLDED.find((entry) => entry.concept.orgLabel && entry.orgMarkers.some((marker) => fold(org).includes(marker)) && hitWords.some((word) => entry.synonyms.includes(word) || entry.heads.includes(word)))?.concept.orgLabel;
  if (org && label) parts.push(parts.length ? label : copy.company(label));
  if (!parts.length) {
    const note = others.find((value) => has(value));
    if (note) parts.push(literal ? copy.quote(clip(note)) : copy.note(clip(note)));
    else if (org && has(org)) parts.push(copy.quote(clip(org)));
  }
  // 「役職「パートナー」· VC」：closing brackets already end the part, so the separator loses its leading space there.
  const reason = parts.reduce((text, part) => (text ? `${text}${/[」”]$/u.test(text) ? copy.join.trimStart() : copy.join}${part}` : part), "");
  return { kind: literal ? "literal" : "related", reason: reason || null };
}
