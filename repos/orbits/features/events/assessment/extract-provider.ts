/**
 * R26 E1 / E2：活动事实抽取（events DESIGN §5）。Owner: 甲 (R26).
 *
 * - E1（URL 正文 / 贴正文 → 事实）：文本模型，提示词 `event-facts-2026-10-v1`；JSON-LD 已有的字段不交给 AI（调用方只传缺的）。
 * - E2（海报 / 截图 → 事实）：复用名片 vision 管线的两段结构——vision 模型转录（≤3 张合并成一次请求，复核 M4）→
 *   文本模型结构化，提示词 `event-poster-2026-10-v1`，禁用 thinking。
 * - AI 只填事实，不打分（分数一律 `scoreEvent`）；输出过 schema，不过就修复 1 次，还不过 → `unreadable`。
 * - 每次 HTTP 前调用方的 `beginCall`（账本子账，超过 `max_calls` 不发请求），之后 `endCall` 记 token。
 * - 只有 `DEEPSEEK_API_KEY` 配置时才可用；否则 provider 为 null（`ai_unavailable`）。
 */
import { z } from "zod";

import type { EventAssessmentFacts, EventAssessmentPageCandidate } from "../../../shared/contract/event-assessment";

export const EVENT_FACTS_PROMPT_VERSION = "event-facts-2026-10-v1";
export const EVENT_POSTER_PROMPT_VERSION = "event-poster-2026-10-v1";
const DEEPSEEK_ENDPOINT = "https://api.deepseek.com/chat/completions";
export const DEFAULT_EVENT_TEXT_MODEL = "deepseek-v4-flash";
export const DEFAULT_EVENT_VISION_MODEL = "deepseek-v4-flash-vision-exp";
/** E2 单次总超时 90 秒（DESIGN §5）；单次请求 60 秒（名片实测 vision 约 25 秒）。 */
export const EVENT_POSTER_TOTAL_TIMEOUT_MS = 90_000;
const REQUEST_TIMEOUT_MS = 60_000;
const THINKING_DISABLED = { type: "disabled" } as const;

const factValue = {
  title: z.string().min(1).max(200).nullish(),
  startsAt: z.string().max(40).nullish(),
  endsAt: z.string().max(40).nullish(),
  venue: z.string().max(200).nullish(),
  area: z.string().max(120).nullish(),
  organizer: z.string().max(200).nullish(),
  price: z.string().max(60).nullish(),
  speakers: z.array(z.object({ name: z.string().min(1).max(120), org: z.string().max(160).nullish(), role: z.string().max(160).nullish() })).max(40).nullish(),
  exhibitorCount: z.number().int().min(0).max(100000).nullish(),
  expectedAttendees: z.number().int().min(0).max(1000000).nullish(),
  format: z.object({ networking: z.boolean(), tableTalk: z.boolean().nullish(), matching: z.boolean().nullish() }).nullish(),
  agenda: z.array(z.object({ at: z.string().min(1).max(40), title: z.string().min(1).max(200), minutes: z.number().int().min(0).max(1440).nullish() })).max(40).nullish(),
};
const FIELD_NAMES = Object.keys(factValue) as (keyof typeof factValue)[];

export const extractionOutputSchema = z.object({
  isEventPage: z.boolean(),
  facts: z.object(factValue),
  guessed: z.array(z.string()).max(20).default([]),
  unreadable: z.array(z.string()).max(20).default([]),
  events: z.array(z.object({ title: z.string().min(1).max(200), url: z.string().max(2048).nullish(), startsAt: z.string().max(40).nullish() })).max(5).default([]),
});
export type ExtractionOutput = z.infer<typeof extractionOutputSchema>;

const SCHEMA_TEXT = JSON.stringify({
  isEventPage: "boolean — true only if the text describes one specific event (date + what happens)",
  facts: {
    title: "string|null", startsAt: "ISO 8601 with +09:00 when the page is Japanese and has no zone|null", endsAt: "same|null",
    venue: "venue name|null", area: "prefecture + city, e.g. 東京都千代田区, or オンライン|null", organizer: "string|null",
    price: "price text as printed, e.g. ¥15,000 / 無料 / 3,000〜5,000円|null",
    speakers: "[{name, org, role}] — people listed as speakers/panelists|null", exhibitorCount: "integer — number of exhibitors/sponsors booths|null",
    expectedAttendees: "integer — capacity or expected attendees if printed|null",
    format: "{networking: boolean (a networking / 交流 / 懇親会 slot exists), tableTalk, matching}|null",
    agenda: "[{at: 'HH:MM', title, minutes}]|null",
  },
  guessed: "field names you inferred instead of reading verbatim",
  unreadable: "field names present on the page/poster but not legible",
  events: "when isEventPage is false: up to 5 events listed on the page [{title, url, startsAt}]",
});

export function eventFactsPrompt(): string {
  return [
    `You extract facts about an event from text (prompt ${EVENT_FACTS_PROMPT_VERSION}).`,
    "Use only what the text states. Never score or judge the event, never recommend.",
    "Leave a field null when the text does not state it. Put a field name in guessed when you inferred it.",
    "If the text is a list of several events or not an event page, set isEventPage false, leave facts empty, and list up to 5 events.",
    "Respond with one JSON object exactly in this shape:",
    SCHEMA_TEXT,
  ].join(" ");
}

export const EVENT_POSTER_TRANSCRIPTION_PROMPT = [
  `Transcribe every piece of text visibly printed on this event poster or screenshot (prompt ${EVENT_POSTER_PROMPT_VERSION}).`,
  "When several images are given they are pages of the same event; transcribe each in order.",
  "Preserve dates, times, prices, venue, organizer, speaker names with their company and title, and the timetable.",
  "When a character or number is too small or blurry to read with confidence, write [unreadable] instead of guessing.",
  "Do not translate, summarize, or invent text.",
].join(" ");

export function eventPosterStructuringPrompt(): string {
  return [
    `You convert a raw event-poster transcription into JSON (prompt ${EVENT_POSTER_PROMPT_VERSION}).`,
    "Use only text present in the transcription. Never score or judge the event.",
    "A field marked [unreadable] goes in unreadable and stays null. A field you inferred goes in guessed.",
    "Respond with one JSON object exactly in this shape:",
    SCHEMA_TEXT,
  ].join(" ");
}

export interface AiCallMeter {
  /** 发请求前（账本子账；超过 max_calls 抛错 → 不发请求）。 */
  begin(model: string): Promise<string>;
  end(callId: string, usage: { inputTokens: number; outputTokens: number } | null): Promise<void>;
}

export class EventExtractionError extends Error {
  constructor(readonly code: "AI_UNAVAILABLE" | "UNREADABLE" | "TIMEOUT", message: string) {
    super(message);
    this.name = "EventExtractionError";
  }
}

export interface EventFactsExtraction {
  facts: EventAssessmentFacts;
  guessed: (keyof EventAssessmentFacts)[];
  unreadable: (keyof EventAssessmentFacts)[];
  isEventPage: boolean;
  pageCandidates: EventAssessmentPageCandidate[];
  promptVersion: string;
  usage: { inputTokens: number; outputTokens: number; calls: number };
}

export interface EventFactsProvider {
  readonly model: string;
  extractFromText(input: { text: string; knownFacts?: EventAssessmentFacts; meter: AiCallMeter }): Promise<EventFactsExtraction>;
  extractFromImages(input: { images: { mimeType: string; base64: string }[]; meter: AiCallMeter }): Promise<EventFactsExtraction>;
}

type Env = Record<string, string | undefined>;

interface ChatResult { content: string; inputTokens: number; outputTokens: number }

async function postChat(input: { apiKey: string; body: Record<string, unknown>; fetchImpl: typeof fetch; timeoutMs: number; meter: AiCallMeter; model: string }): Promise<ChatResult> {
  const callId = await input.meter.begin(input.model);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs);
  try {
    const response = await input.fetchImpl(DEEPSEEK_ENDPOINT, {
      body: JSON.stringify(input.body),
      headers: { Authorization: `Bearer ${input.apiKey}`, "Content-Type": "application/json" },
      method: "POST",
      signal: controller.signal,
    });
    if (!response.ok) {
      await input.meter.end(callId, null);
      throw new EventExtractionError("AI_UNAVAILABLE", `Event extraction request failed with status ${response.status}.`);
    }
    const payload = (await response.json()) as { choices?: Array<{ message?: { content?: unknown } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } };
    const usage = { inputTokens: Number(payload.usage?.prompt_tokens ?? 0) || 0, outputTokens: Number(payload.usage?.completion_tokens ?? 0) || 0 };
    await input.meter.end(callId, usage);
    const content = payload.choices?.[0]?.message?.content;
    return { content: typeof content === "string" ? content : "", ...usage };
  } catch (error) {
    if (error instanceof EventExtractionError) throw error;
    await input.meter.end(callId, null).catch(() => undefined);
    if (controller.signal.aborted) throw new EventExtractionError("TIMEOUT", "Event extraction timed out.");
    throw new EventExtractionError("AI_UNAVAILABLE", "Event extraction request failed.");
  } finally {
    clearTimeout(timer);
  }
}

const isField = (name: string): name is keyof EventAssessmentFacts => (FIELD_NAMES as string[]).includes(name);

/** schema 通过的输出 → 契约事实（null 去掉、可选字段规范化）。 */
export function toContractFacts(output: ExtractionOutput): EventAssessmentFacts {
  const facts: EventAssessmentFacts = {};
  const f = output.facts;
  if (f.title) facts.title = f.title;
  if (f.startsAt && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(f.startsAt)) facts.startsAt = withZone(f.startsAt);
  if (f.endsAt && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(f.endsAt)) facts.endsAt = withZone(f.endsAt);
  if (f.venue) facts.venue = f.venue;
  if (f.area) facts.area = f.area;
  if (f.organizer) facts.organizer = f.organizer;
  if (f.price) facts.price = f.price;
  if (f.speakers?.length) facts.speakers = f.speakers.map((s) => ({ name: s.name, ...(s.org ? { org: s.org } : {}), ...(s.role ? { role: s.role } : {}) }));
  if (typeof f.exhibitorCount === "number") facts.exhibitorCount = f.exhibitorCount;
  if (typeof f.expectedAttendees === "number") facts.expectedAttendees = f.expectedAttendees;
  if (f.format) facts.format = { networking: f.format.networking, ...(typeof f.format.tableTalk === "boolean" ? { tableTalk: f.format.tableTalk } : {}), ...(typeof f.format.matching === "boolean" ? { matching: f.format.matching } : {}) };
  if (f.agenda?.length) facts.agenda = f.agenda.map((a) => ({ at: a.at, title: a.title, ...(typeof a.minutes === "number" ? { minutes: a.minutes } : {}) }));
  return facts;
}

function withZone(value: string): string {
  const base = value.length === 16 ? `${value}:00` : value.slice(0, 19);
  const zone = /(Z|[+-]\d{2}:\d{2})$/.exec(value)?.[1];
  return `${base}${zone ?? "+09:00"}`;
}

function parseOutput(content: string): ExtractionOutput | null {
  try {
    const json = JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g, ""));
    const parsed = extractionOutputSchema.safeParse(json);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function toExtraction(output: ExtractionOutput, promptVersion: string, usage: EventFactsExtraction["usage"]): EventFactsExtraction {
  return {
    facts: output.isEventPage ? toContractFacts(output) : {},
    guessed: output.guessed.filter(isField),
    isEventPage: output.isEventPage,
    pageCandidates: output.events.map((event) => ({ title: event.title, ...(event.url && /^https?:\/\//.test(event.url) ? { url: event.url } : {}), ...(event.startsAt ? { startsAt: event.startsAt } : {}) })),
    promptVersion,
    unreadable: output.unreadable.filter(isField),
    usage,
  };
}

/** 结构化 + 修复 1 次（不过 schema → UNREADABLE）。 */
async function structured(input: { apiKey: string; fetchImpl: typeof fetch; meter: AiCallMeter; model: string; system: string; user: string; promptVersion: string; usage: EventFactsExtraction["usage"]; timeoutMs: number }): Promise<EventFactsExtraction> {
  const messages = [{ content: input.system, role: "system" }, { content: input.user, role: "user" }];
  const first = await postChat({ apiKey: input.apiKey, body: { messages, model: input.model, response_format: { type: "json_object" }, thinking: THINKING_DISABLED }, fetchImpl: input.fetchImpl, meter: input.meter, model: input.model, timeoutMs: input.timeoutMs });
  input.usage.calls += 1; input.usage.inputTokens += first.inputTokens; input.usage.outputTokens += first.outputTokens;
  const parsed = parseOutput(first.content);
  if (parsed) return toExtraction(parsed, input.promptVersion, input.usage);
  const repair = await postChat({
    apiKey: input.apiKey,
    body: { messages: [...messages, { content: first.content.slice(0, 8000), role: "assistant" }, { content: "That output did not match the required JSON shape. Reply again with only the JSON object in exactly the required shape.", role: "user" }], model: input.model, response_format: { type: "json_object" }, thinking: THINKING_DISABLED },
    fetchImpl: input.fetchImpl, meter: input.meter, model: input.model, timeoutMs: input.timeoutMs,
  });
  input.usage.calls += 1; input.usage.inputTokens += repair.inputTokens; input.usage.outputTokens += repair.outputTokens;
  const repaired = parseOutput(repair.content);
  if (repaired) return toExtraction(repaired, input.promptVersion, input.usage);
  throw new EventExtractionError("UNREADABLE", "The extraction did not match the schema after one repair.");
}

export function createConfiguredEventFactsProvider(options: { env?: Env; fetchImpl?: typeof fetch; nowMs?: () => number } = {}): EventFactsProvider | null {
  const env = options.env ?? process.env;
  const apiKey = env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) return null;
  const fetchImpl = options.fetchImpl ?? fetch;
  const nowMs = options.nowMs ?? Date.now;
  const textModel = env.ORBIT_EVENT_FACTS_TEXT_MODEL?.trim() || DEFAULT_EVENT_TEXT_MODEL;
  const visionModel = env.ORBIT_EVENT_FACTS_VISION_MODEL?.trim() || DEFAULT_EVENT_VISION_MODEL;
  return {
    model: `${visionModel}+${textModel}`,
    async extractFromText({ text, knownFacts, meter }) {
      const known = knownFacts && Object.keys(knownFacts).length ? `\n\nAlready known from structured data (do not repeat, only fill what is missing): ${JSON.stringify(knownFacts)}` : "";
      return structured({ apiKey, fetchImpl, meter, model: textModel, promptVersion: EVENT_FACTS_PROMPT_VERSION, system: eventFactsPrompt(), timeoutMs: REQUEST_TIMEOUT_MS, usage: { calls: 0, inputTokens: 0, outputTokens: 0 }, user: `${text}${known}` });
    },
    async extractFromImages({ images, meter }) {
      const started = nowMs();
      const usage = { calls: 0, inputTokens: 0, outputTokens: 0 };
      const transcription = await postChat({
        apiKey,
        body: { messages: [{ content: [{ text: EVENT_POSTER_TRANSCRIPTION_PROMPT, type: "text" }, ...images.slice(0, 3).map((image) => ({ image_url: { url: `data:${image.mimeType};base64,${image.base64}` }, type: "image_url" }))], role: "user" }], model: visionModel, thinking: THINKING_DISABLED },
        fetchImpl, meter, model: visionModel, timeoutMs: REQUEST_TIMEOUT_MS,
      });
      usage.calls += 1; usage.inputTokens += transcription.inputTokens; usage.outputTokens += transcription.outputTokens;
      if (!transcription.content.trim()) throw new EventExtractionError("UNREADABLE", "Nothing was transcribed from the poster.");
      const left = EVENT_POSTER_TOTAL_TIMEOUT_MS - (nowMs() - started);
      if (left <= 1000) throw new EventExtractionError("TIMEOUT", "The poster read ran out of time.");
      return structured({ apiKey, fetchImpl, meter, model: textModel, promptVersion: EVENT_POSTER_PROMPT_VERSION, system: eventPosterStructuringPrompt(), timeoutMs: Math.min(REQUEST_TIMEOUT_MS, left), usage, user: transcription.content });
    },
  };
}
