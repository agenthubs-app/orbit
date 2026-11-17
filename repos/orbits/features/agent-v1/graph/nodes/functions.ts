/**
 * functions (code, plus at most one judgment request per part): the minimal "pick and order" step of AG08
 * (设计稿 §3.5 排序, §3.8 先过滤再判断; agent-design AG08-1, AG08-2, AG08-4). AG10 replaces it in the same node
 * with rankCandidates().
 *
 * A part routed to read that ranks contacts or events (fn.rank, no particular record named) is done here:
 *   - the candidates are the account's contacts, or the events it may see, read in SQL under the account's scope;
 *   - hard conditions by code: the place and the industry the user named outside the ranking basis, the dates
 *     of readFilter, "with a recorded interaction" when ordering by the last one;
 *   - funnel(): rule ranking, the cut (50 a conversation request), one match.level request for all that are left;
 *   - only a field to order by (a start time, the last interaction): no judgment at all.
 * The answer is written by code from the records' own fields (no main model call): what it ranked by, the
 * coverage ("细看了 N 位、还有 M 位没细看"), and when the judgment was not there, that no topic matching was done.
 * The fields sent to the judgment are the ones the question needs; e-mail and phone are never read into it.
 */
import { readSourceOf } from "../../answer/basis";
import type { RecordView } from "../../domains/types";
import { askJudgment } from "../../judgment/ask";
import { funnel, rankJudgmentInput, type FunnelCandidate, type FunnelResult } from "../../judgment/funnel";
import { gapWords } from "../../answer/gap-copy";
import { emitTrace, evalDeniedReads } from "../../observability/trace";
import { localDay } from "../../views/recent-interaction";
import type { CanonicalEventRecord } from "../../../events/core/contract";
import type { RankField } from "../../understand/schema";
import type { AgentRecordAccess, GraphNode, NodeScope } from "../deps";
import type { AgentGraphState, GraphPart } from "../state";
import { localMidnight } from "./resolve";

type Language = "zh" | "ja" | "en";
type Domain = "contact" | "event";

/** At most this many in a list ordered only by a field (the rest are counted). */
export const FIELD_LIST_LIMIT = 20;
const PAGE = 500;
const MAX_ROWS = 6_000;

/**
 * A contact clue that names the set to pick from, not a person ("联系人", "东京做零售的联系人", "my contacts based in
 * Singapore", "連絡先"): it holds a word for contacts in general (stab2: "my contacts based in Singapore").
 */
const GENERIC_CONTACT_CLUE = /(?:联系人|聯絡人|人脉|連絡先|コンタクト|\bcontacts\b|\bpeople\b)|^(?:人|persons?|contact)$/iu;
const RANK_WORDS = /(挑|选出|选几|排序|排一下|排个序|并べ|並べ|選んで|順に|順番|\bpick\b|\bchoose\b|\brank\b|\bsort\b|\border\b|\blist the\b)/iu;

/** The kind of records a part ranks, or null when it is not a ranking this node does. */
export function rankDomainOf(part: GraphPart, message: string): Domain | null {
  if (part.route !== "read" || !part.capabilities.includes("fn.rank")) return null;
  const quote = message.slice(part.quote[0], part.quote[1]);
  if (!part.plan.rank && !RANK_WORDS.test(quote)) return null;
  const contact = part.capabilities.includes("contact.read") || part.capabilities.includes("view.recentInteraction");
  const event = part.capabilities.includes("event.read");
  // Reading other records is another kind of task — except a memo attached with @ (its topics are the basis).
  const memoBasis = part.refs.filter((ref) => ref.entity === "memo");
  const readsMemoBasis = memoBasis.length > 0 && memoBasis.every((ref) => ref.recordId);
  if (part.capabilities.some((capability) => ["todo.read", "schedule.read"].includes(capability) || (capability === "memo.read" && !readsMemoBasis))) return null;
  const said = (ref: GraphPart["refs"][number]) => (ref.quote ? message.slice(ref.quote[0], ref.quote[1]) : "").replace(/^@/u, "").trim();
  if (event && !contact) return part.refs.some((ref) => ref.entity === "event" && ref.recordId) ? null : "event";
  if (contact && !event) return part.refs.some((ref) => ref.entity === "contact" && (ref.recordId || (said(ref) && !GENERIC_CONTACT_CLUE.test(said(ref))))) ? null : "contact";
  return null;
}

/** Parts this pass ranks here. */
export function functionsDue(state: AgentGraphState, message: string): boolean {
  return state.parts.some((part) => part.status === "answered" && !part.reads && !part.gaps && rankDomainOf(part, message) !== null && (state.touched === null || state.touched.includes(part.localId)));
}

/* ── words ─────────────────────────────────────────────────────────── */

const INDUSTRY_WORDS: Record<string, string[]> = {
  软件: ["software", "ソフトウェア", "软件", "ソフト"], 贸易: ["trade", "trading", "貿易", "商社"], 摄影: ["photography", "写真", "攝影"], 出版: ["publishing", "出版"],
  设计: ["design", "デザイン"], 物流: ["logistics", "物流"], 金融: ["finance", "金融"], 教育: ["education", "教育"], 零售: ["retail", "小売", "零售"],
  半导体: ["semiconductor", "semiconductors", "半導体"], 陶艺: ["ceramics", "pottery", "陶芸"], 机器人: ["robotics", "ロボット"], 餐饮: ["restaurant", "food", "飲食"], 媒体: ["media", "メディア"],
};
const PLACE_WORDS: Record<string, string[]> = { 东京: ["東京", "tokyo"], 大阪: ["osaka"], 横滨: ["横浜", "yokohama"], 京都: ["kyoto"], 上海: ["shanghai"], 新加坡: ["シンガポール", "singapore"], 北京: ["beijing"], 深圳: ["shenzhen"], 杭州: ["hangzhou"], 苏州: ["suzhou"], 台北: ["taipei"], 栃木: ["tochigi"], 茨城: ["ibaraki"], 神奈川: ["kanagawa"] };

const said = (text: string, word: string) => (/^[a-z]+$/iu.test(word) ? new RegExp(`\\b${word}\\b`, "iu").test(text) : text.includes(word));
const outside = (message: string, span: [number, number] | undefined) => (span ? message.slice(0, span[0]) + " ".repeat(span[1] - span[0]) + message.slice(span[1]) : message);

interface ContactCandidate extends FunnelCandidate {
  view: RecordView;
  name: string;
  company: string | null;
  role: string | null;
  place: string | null;
  city: string | null;
  industry: string | null;
  tags: string[];
  notes: string | null;
  lastInteraction: string | null;
}

interface EventCandidate extends FunnelCandidate {
  view: RecordView;
  title: string;
  startsAt: string | null;
  venue: string | null;
  topics: string | null;
}

const str = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);

async function readAll(records: AgentRecordAccess, scope: { accountId: string; workspaceId: string }, spec: Parameters<AgentRecordAccess["source"]["page"]>[1]): Promise<Awaited<ReturnType<AgentRecordAccess["source"]["page"]>>> {
  const rows: Awaited<ReturnType<AgentRecordAccess["source"]["page"]>> = [];
  let after: { key: string; id: string } | null = null;
  while (rows.length < MAX_ROWS) {
    const page = await records.source.page(scope, spec, after, PAGE);
    rows.push(...page);
    if (page.length < PAGE) break;
    const last = page[page.length - 1];
    after = { id: last.id, key: last.sortKey };
  }
  return rows;
}

async function contactCandidates(records: AgentRecordAccess, actorId: string, timeZone: string, withInteractions: boolean): Promise<ContactCandidate[]> {
  const scope = records.scope(actorId);
  const where = { accountId: scope.accountId, workspaceId: scope.workspaceId };
  const denied = [...evalDeniedReads()];
  const rows = await readAll(records, where, { collection: "contacts", denied, order: { direction: "asc", paths: [["displayName"]] } });
  const last = new Map<string, string>();
  if (withInteractions) {
    const notes = await readAll(records, where, { collection: "notes", denied, order: { direction: "desc", paths: [["note", "interaction", "occurredOn"]] }, present: [["note", "interaction", "occurredOn"]] });
    for (const row of notes) {
      const interaction = (row.payload.note as { interaction?: { actualContactIds?: unknown; occurredOn?: unknown } } | undefined)?.interaction;
      const day = str(interaction?.occurredOn);
      const ids = Array.isArray(interaction?.actualContactIds) ? interaction!.actualContactIds.filter((id): id is string => typeof id === "string") : [];
      if (!day) continue;
      for (const id of ids) if (!last.has(id) || last.get(id)! < day) last.set(id, day);
    }
  }
  const out: ContactCandidate[] = [];
  for (const row of rows) {
    const payload = row.payload;
    const name = str(payload.displayName);
    if (!name || payload.stage === "archived") continue;
    const tags = Array.isArray(payload.customTags) ? payload.customTags.filter((tag): tag is string => typeof tag === "string") : [];
    const industry = tags.find((tag) => tag.startsWith("行业:"))?.slice(3) ?? null;
    const plainTags = tags.filter((tag) => !tag.startsWith("行业:"));
    const region = typeof payload.region === "object" && payload.region !== null ? (payload.region as { city?: unknown }) : null;
    const candidate: ContactCandidate = {
      city: str(region?.city),
      company: str(payload.organization) ?? str(payload.company),
      id: row.id,
      industry,
      lastInteraction: last.get(row.id) ?? null,
      name,
      notes: str(payload.notes),
      place: str(payload.location),
      role: str(payload.role) ?? str(payload.headline),
      tags: plainTags,
      view: { fields: { company: str(payload.organization) ?? undefined, displayName: name, headline: str(payload.role) ?? undefined }, id: row.id, kind: "contact", ref: `contact:${row.id}`, updatedAt: row.updatedAt, version: str(payload.updatedAt) ?? row.updatedAt },
      words: "",
    };
    candidate.words = [name, candidate.company, candidate.role, candidate.place, candidate.city, industry, ...(industry ? INDUSTRY_WORDS[industry] ?? [] : []), ...plainTags, candidate.notes].filter(Boolean).join(" ");
    out.push(candidate);
  }
  void timeZone;
  return out;
}

function eventCandidates(events: readonly CanonicalEventRecord[], actorId: string): EventCandidate[] {
  return events
    .filter((event) => !event.archivedAt && !event.cancelledAt && (event.lifecycleState === "published" || event.organizerActorId === actorId))
    .map((event) => {
      const topics = event.description?.match(/(?:主题|テーマ|topics?)[：:]\s*([^\n]+)/iu)?.[1]?.trim() ?? null;
      const title = event.title ?? "";
      return {
        id: event.eventId,
        startsAt: event.startsAt,
        title,
        topics,
        venue: event.venue,
        view: { fields: { location: event.venue ?? undefined, startsAt: event.startsAt ?? undefined, title }, id: event.eventId, kind: "event", ref: `event:${event.eventId}`, updatedAt: event.startsAt ?? "", version: String(event.eventVersion) },
        words: [title, topics, event.venue, event.description].filter(Boolean).join(" "),
      } satisfies EventCandidate;
    });
}

/* ── copy ──────────────────────────────────────────────────────────── */

const WEEKDAY: Record<Language, string[]> = { en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], ja: ["日", "月", "火", "水", "木", "金", "土"], zh: ["周日", "周一", "周二", "周三", "周四", "周五", "周六"] };
const MONTH_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function dayWords(day: string, language: Language): string {
  const [year, month, date] = day.split("-").map(Number);
  const weekday = WEEKDAY[language][new Date(Date.UTC(year, month - 1, date)).getUTCDay()];
  if (language === "en") return `${weekday}, ${MONTH_EN[month - 1]} ${date}, ${year}`;
  return `${year === 2026 ? "" : `${year}年`}${month}月${date}日（${weekday}）`;
}

function whenWords(iso: string, timeZone: string, language: Language): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { day: "2-digit", hour: "2-digit", hourCycle: "h23", minute: "2-digit", month: "2-digit", timeZone, year: "numeric" }).formatToParts(new Date(iso)).map((part) => [part.type, part.value]));
  return `${dayWords(`${parts.year}-${parts.month}-${parts.day}`, language)} ${parts.hour}:${parts.minute}`;
}

const LEVEL_WORDS: Record<Language, Record<"insufficient" | "partial" | "match", string>> = {
  en: { insufficient: "nothing in the record ties it to this directly", match: "the record fits directly", partial: "partly related" },
  ja: { insufficient: "記録からは直接の関係は読み取れません", match: "記録が直接合っています", partial: "一部関連があります" },
  zh: { insufficient: "记录里看不出和这个主题直接相关", match: "记录直接对得上", partial: "部分相关" },
};

function contactLine(item: ContactCandidate, language: Language, level: string | null): string {
  const sep = language === "en" ? ", " : "，";
  const facts: string[] = [];
  const head = [item.company, item.role].filter(Boolean).join(" · ");
  if (head) facts.push(head);
  if (item.place) facts.push(item.place);
  if (item.industry) facts.push(language === "en" ? `industry: ${item.industry}${INDUSTRY_WORDS[item.industry]?.[0] ? ` (${INDUSTRY_WORDS[item.industry][0]})` : ""}` : language === "ja" ? `業種：${item.industry}` : `行业：${item.industry}`);
  if (item.tags.length) facts.push(language === "en" ? `tags: ${item.tags.join(", ")}` : language === "ja" ? `タグ：${item.tags.join("、")}` : `标签：${item.tags.join("、")}`);
  if (item.notes) facts.push(language === "en" ? `note: ${item.notes}` : language === "ja" ? `メモ：${item.notes}` : `备注：${item.notes}`);
  if (item.lastInteraction) facts.push(language === "en" ? `last recorded interaction: ${dayWords(item.lastInteraction, language)}` : language === "ja" ? `最後のやり取り：${dayWords(item.lastInteraction, language)}` : `最近一次往来：${dayWords(item.lastInteraction, language)}`);
  const open = language === "en" ? " (" : "（";
  const close = language === "en" ? ")" : "）";
  const levelText = level ? `${language === "en" ? " — " : "——"}${LEVEL_WORDS[language][level as keyof (typeof LEVEL_WORDS)["zh"]]}` : "";
  return `${item.name}${facts.length ? `${open}${facts.join(sep)}${close}` : ""}${levelText}`;
}

function eventLine(item: EventCandidate, language: Language, level: string | null, timeZone: string): string {
  const sep = language === "en" ? ", " : "，";
  const facts = [item.startsAt ? whenWords(item.startsAt, timeZone, language) : null, item.venue, item.topics ? (language === "en" ? `topics: ${item.topics}` : language === "ja" ? `テーマ：${item.topics}` : `主题：${item.topics}`) : null].filter(Boolean);
  const open = language === "en" ? " (" : "（";
  const close = language === "en" ? ")" : "）";
  const levelText = level ? `${language === "en" ? " — " : "——"}${LEVEL_WORDS[language][level as keyof (typeof LEVEL_WORDS)["zh"]]}` : "";
  return `${item.title}${facts.length ? `${open}${facts.join(sep)}${close}` : ""}${levelText}`;
}

const UNIT: Record<Domain, Record<Language, string>> = { contact: { en: "contacts", ja: "人", zh: "位" }, event: { en: "events", ja: "件", zh: "场" } };
const NOUN: Record<Domain, Record<Language, string>> = { contact: { en: "contacts", ja: "連絡先", zh: "联系人" }, event: { en: "events", ja: "イベント", zh: "活动" } };

function unmatchedWhy(reason: string | null, language: Language): string {
  const words: Record<string, Record<Language, string>> = {
    not_enabled: { en: "that step is not switched on yet", ja: "その判定はまだ使えない状態です", zh: "这一步的判断还没有启用" },
    timeout: { en: "the matching step did not answer in time", ja: "判定が時間内に返ってきませんでした", zh: "判断没有及时回应" },
  };
  return (words[reason ?? ""] ?? { en: "the matching step was not available", ja: "判定が使えませんでした", zh: "判断暂时不可用" })[language];
}

function fieldWords(field: RankField | null, direction: "asc" | "desc", language: Language): string {
  const names: Record<RankField, Record<Language, string>> = {
    dueAt: { en: "deadline", ja: "期限", zh: "截止时间" },
    lastInteraction: { en: "the date of your last recorded interaction", ja: "最後に記録されたやり取りの日付", zh: "最近一次往来的日期" },
    plannedDate: { en: "planned date", ja: "予定日", zh: "计划日" },
    startsAt: { en: "start time", ja: "開始時間", zh: "开始时间" },
  };
  const name = names[field ?? "startsAt"][language];
  if (language === "en") return `${name}, ${direction === "asc" ? (field === "lastInteraction" ? "oldest first" : "earliest first") : "latest first"}`;
  if (language === "ja") return `${name}の${direction === "asc" ? (field === "lastInteraction" ? "古い順" : "早い順") : (field === "lastInteraction" ? "新しい順" : "遅い順")}`;
  return `${name}${direction === "asc" ? "从远到近（由早到晚）" : "由近到远"}`;
}

interface Written {
  text: string;
  cites: string[];
}

/** "11月21日到11月22日的活动", "the events of Nov 21–Nov 22": the dates the events were kept by. */
function periodWords(period: { from?: string; to?: string } | null, language: Language): string | null {
  if (!period?.from && !period?.to) return null;
  const short = (day: string) => {
    const [, month, date] = day.split("-").map(Number);
    return language === "en" ? `${MONTH_EN[month - 1]} ${date}` : `${month}月${date}日`;
  };
  const from = period.from ? short(period.from) : null;
  const to = period.to ? short(period.to) : null;
  if (language === "en") return from && to ? (from === to ? `on ${from}` : `from ${from} to ${to}`) : from ? `from ${from}` : `until ${to}`;
  if (language === "ja") return from && to ? (from === to ? `${from}の` : `${from}から${to}までの`) : from ? `${from}以降の` : `${to}までの`;
  return from && to ? (from === to ? `${from}的` : `${from}到${to}的`) : from ? `${from}以后的` : `${to}之前的`;
}

function writeAnswer(input: { domain: Domain; language: Language; basis: string | null; basisMemo: string | null; within: string | null; period: { from?: string; to?: string } | null; field: RankField | null; direction: "asc" | "desc"; result: FunnelResult<ContactCandidate | EventCandidate>; timeZone: string }): Written {
  const { domain, language, result } = input;
  const unit = UNIT[domain][language];
  const noun = NOUN[domain][language];
  const n = result.ordered.length;
  const lines: string[] = [];
  // Events are Orbit's public directory, not the user's own: they are named by the dates they were kept by.
  const period = domain === "event" ? periodWords(input.period, language) : null;
  const scope = input.within
    ? (language === "en" ? `your ${noun} ${input.within}` : language === "ja" ? `${input.within}${noun}` : `${input.within.replace(/的$/u, "")}的${noun}`)
    : domain === "event"
      ? (language === "en" ? `the public events${period ? ` ${period}` : ""}` : language === "ja" ? `${period ?? "公開中の"}イベント` : `${period ?? "公开的"}活动`)
      : language === "en" ? `your ${noun}` : language === "ja" ? `あなたの${noun}` : `你的${noun}`;
  const topic = input.basisMemo ? (language === "en" ? `the topics of your note "${input.basisMemo}"` : language === "ja" ? `メモ「${input.basisMemo}」のテーマ` : `你的笔记「${input.basisMemo}」的主题`) : input.basis ? (language === "en" ? `"${input.basis}"` : `「${input.basis}」`) : null;
  const { afterHardConditions, judged, truncated } = result.coverage;
  if (result.semantic && result.matched) {
    lines.push(language === "en" ? `From ${scope}, picked by ${topic}: ${n} ${unit}.` : language === "ja" ? `${scope}の中から、${topic}に合うものを${n}${unit}選びました。` : `在${scope}里，按${topic}这个主题挑了${n}${unit}：`);
    if (truncated > 0) {
      lines.push(language === "en"
        ? `I looked closely at ${judged} of them; ${truncated} more were not looked at closely (${afterHardConditions} in all), so these are the best fits among the ones looked at, not necessarily among all ${noun}.`
        : language === "ja"
          ? `今回詳しく見たのは${judged}${unit}で、残りの${truncated}${unit}は詳しく見ていません（全部で${afterHardConditions}${unit}）。詳しく見た範囲での結果で、すべての${noun}の中で最適という意味ではありません。`
          : `这次细看了${judged}${unit}，还有${truncated}${unit}没有细看（共${afterHardConditions}${unit}），所以这是细看过的范围里的结果，不代表全部${noun}里最合适。`);
    } else {
      lines.push(language === "en" ? `All ${afterHardConditions} of them were looked at closely; this is within those ${afterHardConditions}, not all of your ${noun}.` : language === "ja" ? `対象の${afterHardConditions}${unit}はすべて詳しく見ました（その範囲での結果です）。` : `符合条件的共${afterHardConditions}${unit}，都细看过了；这是在这${afterHardConditions}${unit}里挑的，不是在全部${noun}里。`);
    }
  } else if (result.semantic) {
    if (input.basisMemo) lines.push(language === "en" ? `Based on ${topic}.` : language === "ja" ? `${topic}をもとにしています。` : `依据是${topic}。`);
    const why = unmatchedWhy(result.unmatchedReason, language);
    const order = input.basisMemo
      ? (language === "en" ? "the overlap of the note's words with each event's title and topics, then start time" : language === "ja" ? "メモの言葉とイベントのタイトル・テーマの重なり、その次に開始時間" : "笔记里的词和活动标题、标签的重合，再按开始时间")
      : domain === "event"
        ? (language === "en" ? `the overlap of ${topic} with each event's title and topics, then start time` : language === "ja" ? `${topic}とイベントのタイトル・テーマの重なり、その次に開始時間` : `${topic}和活动标题、标签的重合，再按开始时间`)
        : (language === "en" ? `the overlap of ${topic} with each contact's industry, company, role and notes` : language === "ja" ? `${topic}と連絡先の業種・会社・役職・メモの重なり` : `${topic}和联系人行业、机构、职位、备注的重合`);
    lines.push(language === "en"
      ? `This time no topic matching was done (${why}); the order below is by record fields only: ${order}. It does not mean nothing fits. ${n} ${unit} from ${scope}:`
      : language === "ja"
        ? `今回はテーマとの照合をしていません（${why}）。以下は記録の項目だけで並べた順です：${order}。合うものがないという意味ではありません。${scope}から${n}${unit}：`
        : `这次没有做主题匹配（${why}），下面的顺序只按记录里的字段排：${order}。这不代表没有合适的。从${scope}里列出${n}${unit}：`);
  } else {
    const total = result.coverage.afterHardConditions;
    lines.push(language === "en"
      ? `Sorted by ${fieldWords(input.field, input.direction, language)}: ${n} of ${total} ${noun}.`
      : language === "ja"
        ? `${fieldWords(input.field, input.direction, language)}に並べました（${total}${unit}中${n}${unit}）。`
        : `按${fieldWords(input.field, input.direction, language)}排（共${total}${unit}，列出${n}${unit}）：`);
  }
  result.ordered.forEach((item, index) => {
    const line = domain === "contact" ? contactLine(item.candidate as ContactCandidate, language, result.matched ? item.level : null) : eventLine(item.candidate as EventCandidate, language, result.matched ? item.level : null, input.timeZone);
    lines.push(`${index + 1}. ${line}`);
  });
  return { cites: result.ordered.map((item) => (item.candidate as ContactCandidate | EventCandidate).view.ref), text: lines.join("\n") };
}

/* ── the node ──────────────────────────────────────────────────────── */

const LAST_INTERACTION_WORDS = /(最久没|很久没|多久没|最近一次往来|最后一次联系|上次联系|しばらく連絡|連絡していない|最後に(連絡|話)|longest without|haven'?t talked|last (recorded )?interaction|gone the longest)/iu;
const START_WORDS = /(开始时间|按时间|时间顺序|開始時間|開始時刻|日付順|時間順|start time|starting time|by date|soonest|earliest first)/iu;

const COUNT_WORDS: Record<string, number> = { 一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

/** "挑三个", "the ten", "3つ" — the count said in the words (code's check of the first layer's count). */
export function countSaidIn(words: string): number | null {
  const digit = words.match(/(\d{1,2})\s*(?:个|位|场|条|件|人|つ|名|本)/u) ?? words.match(/\b(?:the |top )?(\d{1,2})\b/iu);
  if (digit) return Number(digit[1]);
  const cjk = words.match(/([一两二三四五六七八九十])\s*(?:个|位|场|条|件|人|つ|名)/u);
  if (cjk) return COUNT_WORDS[cjk[1]] ?? null;
  const latin = words.toLowerCase().match(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\b/u);
  return latin ? COUNT_WORDS[latin[1]] : null;
}

export function functionsNode(scope: NodeScope): GraphNode {
  const { deps, input, run } = scope;
  return async (state: AgentGraphState) => {
    const message = input.message;
    const parts: GraphPart[] = state.parts.map((part) => ({ ...part }));
    const due = parts.filter((part) => part.status === "answered" && !part.reads && !part.gaps && rankDomainOf(part, message) !== null && (state.touched === null || state.touched.includes(part.localId)));
    if (!due.length) return {};
    const language = state.language;
    const timeZone = state.timeZone || "Asia/Tokyo";
    const records = deps.records;
    for (const part of due) {
      const domain = rankDomainOf(part, message)!;
      const quote = message.slice(part.quote[0], part.quote[1]);
      const rank = part.plan.rank ?? {};
      const basisSpan = rank.basis;
      const withinWords = rank.within ? message.slice(rank.within[0], rank.within[1]) : null;
      const field: RankField | null = rank.orderBy ?? (domain === "contact" && LAST_INTERACTION_WORDS.test(quote) ? "lastInteraction" : domain === "event" && START_WORDS.test(quote) ? "startsAt" : null);
      const direction = rank.direction ?? "asc";
      // The basis: the first layer's words; a memo attached with @ gives its own words (its topics).
      let basis = basisSpan ? message.slice(basisSpan[0], basisSpan[1]) : null;
      let basisMemo: string | null = null;
      const memoRef = run.references.find((reference) => reference.type === "memo" || reference.type === "note");
      if (!records) {
        part.status = "unfinished";
        part.reason = "read_failed";
        part.gaps = ["service_error"];
        run.gapLines.set(part.localId, [gapWords(language).serviceError(quote)]);
        continue;
      }
      const accountScope = records.scope(input.actorId);
      if (memoRef && memoRef.accessible !== false && (!basis || basis.includes("@") || !field)) {
        try {
          const view = (await records.reader.read("memo", accountScope, { id: memoRef.id })).items[0];
          const body = view ? String(view.fields.body ?? "") : "";
          if (body) {
            basis = body;
            basisMemo = String(view!.fields.title ?? memoRef.name ?? "");
            run.readSources.set(view!.ref, readSourceOf(view!, timeZone) ?? { id: view!.id, kind: "memo" });
          }
        } catch (error) {
          emitTrace({ error: error instanceof Error ? error.message : String(error), partId: part.localId, type: "read.error", where: "functions.basis_memo" });
        }
      }
      // A ranking with neither a basis nor a field: the words of the part itself are the basis (code does not guess a field).
      if (!basis && !field) basis = quote;
      const count = rank.count ?? countSaidIn(quote) ?? (field && !basis ? FIELD_LIST_LIMIT : 3);
      try {
        let candidates: (ContactCandidate | EventCandidate)[];
        let hard: (candidate: ContactCandidate | EventCandidate) => boolean = () => true;
        // Words outside the ranking basis that name a place or an industry are hard conditions (code).
        const freeWords = (withinWords ?? "") + " " + outside(quote, basisSpan ? [Math.max(0, basisSpan[0] - part.quote[0]), Math.max(0, basisSpan[1] - part.quote[0])] : undefined);
        if (domain === "contact") {
          const list = await contactCandidates(records, input.actorId, timeZone, field === "lastInteraction");
          const places = new Set(Object.entries(PLACE_WORDS).filter(([place, others]) => said(freeWords, place) || others.some((other) => said(freeWords, other))).map(([place]) => place));
          const industries = new Set(Object.entries(INDUSTRY_WORDS).filter(([industry, others]) => said(freeWords, industry) || others.some((other) => said(freeWords, other))).map(([industry]) => industry));
          hard = (candidate) => {
            const item = candidate as ContactCandidate;
            if (places.size && !(item.place && places.has(item.place)) && !(item.city && [...places].some((place) => PLACE_WORDS[place]?.includes(item.city!.toLowerCase())))) return false;
            if (industries.size && !(item.industry && industries.has(item.industry))) return false;
            if (field === "lastInteraction" && !item.lastInteraction) return false;
            return true;
          };
          candidates = list;
          emitTrace({ hard: { industries: [...industries], places: [...places], withInteraction: field === "lastInteraction" }, partId: part.localId, type: "functions.hard_conditions" });
        } else {
          const events = records.listEvents ? await records.listEvents() : [];
          const from = part.plan.readFilter?.from ? localMidnight(part.plan.readFilter.from, timeZone) : null;
          const to = part.plan.readFilter?.to ? localMidnight(new Date(Date.parse(`${part.plan.readFilter.to}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10), timeZone) : null;
          candidates = eventCandidates(events, input.actorId);
          hard = (candidate) => {
            const at = (candidate as EventCandidate).startsAt;
            if ((from || to) && !at) return false;
            if (from && at! < from) return false;
            if (to && at! >= to) return false;
            return true;
          };
          emitTrace({ hard: { from, to }, partId: part.localId, type: "functions.hard_conditions" });
        }
        const orderField = field ?? (domain === "event" ? "startsAt" : null);
        const result = await funnel<ContactCandidate | EventCandidate>({
          basis: field && !rank.basis && !basisMemo ? null : basis,
          candidates,
          count,
          hard,
          judge: async (kept) => askJudgment(deps.judgment, run.judgment, {
            coverage: { afterHardConditions: candidates.filter(hard).length, judged: kept.length, total: candidates.length, truncated: Math.max(0, candidates.filter(hard).length - kept.length) },
            input: rankJudgmentInput(language, basis ?? quote, kept.map(({ candidate, key }) => ({ key, text: domain === "contact" ? contactLine(candidate as ContactCandidate, language, null) : eventLine(candidate as EventCandidate, language, null, timeZone) }))),
            items: kept.map(({ key }) => ({ key, question: "match.level" as const, subject: key })),
            language,
            purpose: "rank",
            requestId: input.requestId,
          }),
          mode: "conversation",
          order: orderField ? { direction: orderField === "startsAt" && !field ? "asc" : direction, value: (candidate) => (domain === "contact" ? (candidate as ContactCandidate).lastInteraction : (candidate as EventCandidate).startsAt) } : undefined,
        });
        const written = writeAnswer({ basis, basisMemo, direction, domain, field, language, period: domain === "event" ? { ...(part.plan.readFilter?.from ? { from: part.plan.readFilter.from } : {}), ...(part.plan.readFilter?.to ? { to: part.plan.readFilter.to } : {}) } : null, result, timeZone, within: withinWords });
        run.answers.set(part.localId, written.text);
        part.cites = written.cites;
        part.reads = result.ordered.map((item) => ({ ref: item.candidate.view.ref, version: item.candidate.view.version }));
        part.coverage = [{ complete: result.coverage.truncated === 0, kind: domain, pagesRead: Math.max(1, Math.ceil(result.coverage.total / PAGE)), seen: result.semantic && result.matched ? result.coverage.judged : result.ordered.length, total: result.coverage.afterHardConditions }];
        part.gaps = [];
        for (const item of result.ordered) {
          const source = readSourceOf(item.candidate.view, timeZone);
          if (source) run.readSources.set(item.candidate.view.ref, source);
          run.readNames.set(item.candidate.view.id, { name: domain === "contact" ? (item.candidate as ContactCandidate).name : (item.candidate as EventCandidate).title, type: domain });
        }
        emitTrace({ coverage: result.coverage, domain, listed: written.cites, matched: result.matched, partId: part.localId, semantic: result.semantic, type: "functions.ranked", unmatchedReason: result.unmatchedReason });
      } catch (error) {
        emitTrace({ error: error instanceof Error ? error.message : String(error), partId: part.localId, type: "read.failed", where: "functions" });
        part.status = "unfinished";
        part.reason = "read_failed";
        part.gaps = ["service_error"];
        run.gapLines.set(part.localId, [gapWords(language).serviceError(quote)]);
      }
    }
    const ordered = [...parts].sort((left, right) => left.quote[0] - right.quote[0]);
    run.sourceRefs = [...new Set(ordered.flatMap((part) => part.cites ?? []))];
    return { parts };
  };
}
