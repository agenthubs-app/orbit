/**
 * R26 活动页的规则抽取（events DESIGN §5、§9 #2 / #10 / #11）。Owner: 甲 (R26).
 *
 * 顺序：JSON-LD `Event` → OpenGraph / meta → 正文（交给 E1）。JSON-LD 里已有的事实直接用，不交给 AI。
 * - 登录页判定（规则，不调 AI）：最终 URL 路径含 login / signin / members 且正文短于 600 字；或页面有密码输入框。
 *   （401 / 403 在 `url-fetch.ts` 已判。）
 * - 正文：去 script / style / 注释，按 `<main>` / `<article>` 优先，折叠空白，截断到 12k 字。
 * - 页内有 2 个以上 `Event`：列为 `pageCandidates`（≤5），由调用方决定是「不是活动页」还是逐个评估。
 * 没有 HTML 解析库：用保守的正则，只读结构化数据与可见文字。
 */
import type { EventAssessmentAgendaItem, EventAssessmentFacts, EventAssessmentPageCandidate, EventAssessmentSpeaker } from "../../../shared/contract/event-assessment";

export const PAGE_TEXT_LIMIT = 12_000;
export const LOGIN_TEXT_THRESHOLD = 600;

export interface PageExtract {
  /** JSON-LD / meta 里读到的事实（basis = read）。 */
  facts: EventAssessmentFacts;
  /** 页面里找到的 `Event` 数。 */
  eventCount: number;
  pageCandidates: EventAssessmentPageCandidate[];
  /** 给 E1 的正文（≤12k）。 */
  text: string;
  title: string | null;
  description: string | null;
  loginRequired: boolean;
}

const decodeEntities = (text: string) => text
  .replace(/&nbsp;/gi, " ")
  .replace(/&amp;/gi, "&")
  .replace(/&lt;/gi, "<")
  .replace(/&gt;/gi, ">")
  .replace(/&quot;/gi, "\"")
  .replace(/&#39;|&apos;/gi, "'")
  .replace(/&#(\d+);/g, (_m, code) => String.fromCodePoint(Number(code)))
  .replace(/&#x([0-9a-f]+);/gi, (_m, code) => String.fromCodePoint(parseInt(code, 16)));

const collapse = (text: string) => text.replace(/[ \t\f\v\r]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();

function stripTags(html: string): string {
  return collapse(decodeEntities(html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article|header|footer|dt|dd)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")));
}

function metaContent(html: string, key: string): string | null {
  const pattern = new RegExp(`<meta\\b[^>]*(?:property|name)=["']${key.replace(/[.:]/g, "\\$&")}["'][^>]*>`, "i");
  const tag = pattern.exec(html)?.[0];
  if (!tag) return null;
  const content = /content=["']([^"']*)["']/i.exec(tag)?.[1];
  return content ? collapse(decodeEntities(content)) : null;
}

// ── JSON-LD ───────────────────────────────────────────────────────────────

type Json = Record<string, unknown>;
const EVENT_TYPES = /Event$/;

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
}

function typeNames(node: Json): string[] {
  return asArray(node["@type"]).filter((type): type is string => typeof type === "string");
}

function collectEvents(node: unknown, out: Json[]): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) { node.forEach((item) => collectEvents(item, out)); return; }
  const json = node as Json;
  if (typeNames(json).some((type) => EVENT_TYPES.test(type))) out.push(json);
  for (const key of ["@graph", "itemListElement", "item", "subEvent", "event", "events"]) collectEvents(json[key], out);
}

function text(value: unknown): string | undefined {
  if (typeof value === "string") return collapse(decodeEntities(value)) || undefined;
  if (typeof value === "number") return String(value);
  if (value && typeof value === "object" && "name" in (value as Json)) return text((value as Json).name);
  return undefined;
}

/** JSON-LD 日期 → 带时区的 ISO（没有时区按东京）。 */
export function normalizeEventDate(value: unknown): string | undefined {
  const raw = text(value);
  if (!raw) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/.exec(raw);
  if (!match) return undefined;
  const [, y, m, d, hh = "00", mm = "00", ss = "00", zone] = match;
  const offset = zone ? (zone === "Z" ? "Z" : zone.includes(":") ? zone : `${zone.slice(0, 3)}:${zone.slice(3)}`) : "+09:00";
  return `${y}-${m}-${d}T${hh}:${mm}:${ss}${offset}`;
}

function priceText(offers: unknown): string | undefined {
  const list = asArray(offers).filter((item): item is Json => Boolean(item) && typeof item === "object");
  const prices = list.flatMap((offer) => {
    const values = [offer.price, offer.lowPrice, offer.highPrice].map((value) => (typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value.replace(/,/g, "")) : NaN)).filter(Number.isFinite);
    return values;
  });
  if (prices.length === 0) return undefined;
  const max = Math.max(...prices);
  return max === 0 ? "無料" : `¥${max.toLocaleString("en-US")}`;
}

function areaOf(location: unknown): string | undefined {
  for (const place of asArray(location)) {
    if (!place || typeof place !== "object") continue;
    const json = place as Json;
    if (typeNames(json).includes("VirtualLocation")) return "オンライン";
    const address = json.address;
    if (typeof address === "string") return collapse(address);
    if (address && typeof address === "object") {
      const a = address as Json;
      const parts = [text(a.addressRegion), text(a.addressLocality), text(a.streetAddress)].filter(Boolean);
      if (parts.length) return parts.join("");
    }
  }
  return undefined;
}

function eventFacts(node: Json, pageUrl: string | null): EventAssessmentFacts {
  const facts: EventAssessmentFacts = {};
  const title = text(node.name);
  if (title) facts.title = title.slice(0, 200);
  const startsAt = normalizeEventDate(node.startDate);
  if (startsAt) facts.startsAt = startsAt;
  const endsAt = normalizeEventDate(node.endDate);
  if (endsAt) facts.endsAt = endsAt;
  const location = asArray(node.location)[0];
  const venue = text(location);
  const online = typeof node.eventAttendanceMode === "string" && /Online/i.test(node.eventAttendanceMode) && !/Mixed/i.test(node.eventAttendanceMode);
  if (online) facts.area = "オンライン";
  if (venue) facts.venue = venue.slice(0, 200);
  const area = areaOf(node.location);
  if (area && !facts.area) facts.area = area.slice(0, 120);
  const price = priceText(node.offers) ?? (node.isAccessibleForFree === true ? "無料" : undefined);
  if (price) facts.price = price;
  const organizer = text(asArray(node.organizer)[0]);
  if (organizer) facts.organizer = organizer.slice(0, 200);
  const speakers: EventAssessmentSpeaker[] = asArray(node.performer).flatMap((person) => {
    const name = text(person);
    if (!name) return [];
    const json = (person && typeof person === "object" ? person : {}) as Json;
    const org = text(json.affiliation ?? json.worksFor ?? json.memberOf);
    const role = text(json.jobTitle);
    return [{ name: name.slice(0, 120), ...(org ? { org: org.slice(0, 160) } : {}), ...(role ? { role: role.slice(0, 160) } : {}) }];
  }).slice(0, 40);
  if (speakers.length) facts.speakers = speakers;
  const capacity = typeof node.maximumAttendeeCapacity === "number" ? node.maximumAttendeeCapacity : undefined;
  if (capacity && capacity > 0) facts.expectedAttendees = Math.round(capacity);
  const url = text(node.url) ?? pageUrl ?? undefined;
  if (url && /^https?:\/\//.test(url)) facts.url = url;
  const agenda: EventAssessmentAgendaItem[] = asArray(node.subEvent).flatMap((sub) => {
    if (!sub || typeof sub !== "object") return [];
    const at = normalizeEventDate((sub as Json).startDate);
    const name = text((sub as Json).name);
    return at && name ? [{ at, title: name.slice(0, 200) }] : [];
  });
  if (agenda.length) facts.agenda = agenda.slice(0, 40);
  return facts;
}

function jsonLdBlocks(html: string): unknown[] {
  const out: unknown[] = [];
  const pattern = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(pattern)) {
    try {
      out.push(JSON.parse(match[1]!.trim()));
    } catch {
      // 坏掉的 JSON-LD 忽略。
    }
  }
  return out;
}

function mainHtml(html: string): string {
  const main = /<main\b[\s\S]*?<\/main>/i.exec(html)?.[0];
  // 没有 main / article 时去掉导航、页头、页脚（Peatix 等页面正文被站点导航挤出 12k 截断，真实验证发现）。
  const withoutChrome = (source: string) => source.replace(/<(nav|header|footer|aside)\b[\s\S]*?<\/\1>/gi, " ");
  if (main) return main;
  const articles = [...html.matchAll(/<article\b[\s\S]*?<\/article>/gi)].map((match) => match[0]);
  if (articles.length) return articles.join("\n");
  return withoutChrome(/<body\b[\s\S]*<\/body>/i.exec(html)?.[0] ?? html);
}

export function isLoginPage(input: { finalUrl: string; html: string; text: string }): boolean {
  if (/<input\b[^>]*type=["']?password/i.test(input.html)) return true;
  let path = "";
  try {
    path = new URL(input.finalUrl).pathname.toLowerCase();
  } catch {
    path = "";
  }
  return /(login|signin|sign-in|sign_in|members)/.test(path) && input.text.length < LOGIN_TEXT_THRESHOLD;
}

export function extractEventPage(html: string, finalUrl: string): PageExtract {
  const events: Json[] = [];
  for (const block of jsonLdBlocks(html)) collectEvents(block, events);
  const distinct = new Map<string, Json>();
  for (const event of events) {
    const key = `${text(event.name) ?? ""}|${text(event.startDate) ?? ""}`;
    if (!distinct.has(key)) distinct.set(key, event);
  }
  const list = [...distinct.values()];
  const title = metaContent(html, "og:title") ?? (/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ? collapse(decodeEntities(/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)![1]!)) : null);
  const description = metaContent(html, "og:description") ?? metaContent(html, "description");
  const bodyText = stripTags(mainHtml(html));
  const textForAi = [title, description, bodyText].filter(Boolean).join("\n").slice(0, PAGE_TEXT_LIMIT);
  const facts: EventAssessmentFacts = list.length === 1 ? eventFacts(list[0]!, finalUrl) : {};
  if (list.length !== 1) {
    // 没有（或有多个）结构化活动时，meta 只给标题与链接，其余交给 E1。
    if (title && list.length === 0) facts.title = title.slice(0, 200);
    facts.url = finalUrl;
  }
  const pageCandidates: EventAssessmentPageCandidate[] = list.length > 1
    ? list.slice(0, 5).flatMap((event) => {
      const name = text(event.name);
      if (!name) return [];
      const url = text(event.url);
      const startsAt = normalizeEventDate(event.startDate);
      return [{ title: name.slice(0, 200), ...(url && /^https?:\/\//.test(url) ? { url } : {}), ...(startsAt ? { startsAt } : {}) }];
    })
    : [];
  return {
    description,
    eventCount: list.length,
    facts,
    loginRequired: isLoginPage({ finalUrl, html, text: bodyText }),
    pageCandidates,
    text: textForAi,
    title,
  };
}
