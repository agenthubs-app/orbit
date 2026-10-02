/**
 * W0045：按文字补全（行业／职级／规范地区）。W0045 回填（本机演练）、W0048a 三层更新入口与 W0053 导入复用。
 *
 * - 输入：联系人 id + 公司／职位／原始地址／名片备注文字；**不送邮箱、电话**（备注里含邮箱或电话的行整行去掉）。
 * - 每次调用 ≤20 人（TEXT_ENRICHMENT_MAX_CONTACTS）；超出直接拒绝，由调用方分批。
 * - DeepSeek 文本模型，配置同名片识别与 ai-matcher（`DEEPSEEK_API_KEY`、`ORBIT_BUSINESS_CARD_OCR_TEXT_MODEL`），
 *   `json_object` 输出、thinking 关闭；没有密钥时 factory 返回 null。
 * - 每次供应商 HTTP 返回一份 usage，供调用方逐次登记成本子账。模块本身**不扣额度**：
 *   W0048a 三层入口按操作记后台池（一批 ≤20 人 = 1 次操作），W0055 回填记 `system`。
 * - 模型输出一律清洗：行业按分类、职级六档、国家码 ISO；不合法清成 null；越界 id 丢弃。
 */
import { DEFAULT_BUSINESS_CARD_TEXT_MODEL } from "../../acquisition/deepseek-business-card-ocr-provider";
import { businessCardIndustryInstruction } from "../../acquisition/business-card-industry-prompt";
import { businessCardEnrichmentInstruction, sanitizeCardEnrichment } from "../../acquisition/business-card-enrichment-prompt";
import type { IndustryIdCode, SecondaryIndustryIdCode } from "../../../shared/contract/industries";
import type { ContactRegionDTO } from "../../../shared/domain/contracts";
import { sanitizeIndustryPair } from "../../../shared/domain/industries";
import type { SeniorityLevelValue } from "../../../shared/domain/seniority";

export const TEXT_ENRICHMENT_MAX_CONTACTS = 20;
export const TEXT_ENRICHMENT_TIMEOUT_MS = 45_000;
const TEXT_LIMIT = 400;
const DEEPSEEK_CHAT_COMPLETIONS_ENDPOINT = "https://api.deepseek.com/chat/completions";

export interface TextEnrichmentContactInput {
  contactId: string;
  organization?: string | null;
  role?: string | null;
  /** 原始地址／location 文字。 */
  location?: string | null;
  /** 名片备注；含邮箱或电话的行会被整行去掉。 */
  cardNotes?: string | null;
}

export interface TextEnrichmentProposal {
  contactId: string;
  primaryIndustryId: IndustryIdCode | null;
  secondaryIndustryId: SecondaryIndustryIdCode | null;
  seniorityLevel: SeniorityLevelValue | null;
  region: ContactRegionDTO | null;
}

export interface TextEnrichmentUsage {
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}

export interface TextEnrichmentResult {
  model: string;
  proposals: TextEnrichmentProposal[];
  /** 本次（唯一一次）供应商 HTTP 的用量。 */
  usage: TextEnrichmentUsage;
}

export interface TextEnricher {
  readonly model: string;
  readonly providerName: string;
  enrich(input: { contacts: readonly TextEnrichmentContactInput[]; signal?: AbortSignal }): Promise<TextEnrichmentResult>;
}

export type TextEnrichmentErrorCode = "TOO_MANY_CONTACTS" | "PROVIDER_REQUEST_FAILED" | "PROVIDER_TIMEOUT" | "INVALID_OUTPUT";

export class TextEnrichmentError extends Error {
  constructor(readonly code: TextEnrichmentErrorCode, message: string, readonly usage: TextEnrichmentUsage | null = null) {
    super(message);
    this.name = "TextEnrichmentError";
  }
}

const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/g;
const PHONE_RUN = /\+?\d[\d\s().-]*\d/g;

/** 9 位以上数字连成的一串视为电话／传真号（邮编 7 位、门牌号不算）。 */
function phoneRuns(text: string): string[] {
  return (text.match(PHONE_RUN) ?? []).filter((run) => run.replace(/\D/g, "").length >= 9);
}

function hasContactPoint(line: string): boolean {
  return new RegExp(EMAIL.source).test(line) || phoneRuns(line).length > 0;
}

/** 地址文字里去掉邮箱与电话号码本身，保留其余地址内容。 */
function stripContactPoints(text: string): string {
  let result = text.replace(EMAIL, " ");
  for (const run of phoneRuns(result)) result = result.replace(run, " ");
  return result;
}

function clean(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim().slice(0, TEXT_LIMIT);
}

/** 备注里含邮箱或电话号码的行整行丢弃（含「传真」「微信」等联系方式行的号码部分）。 */
export function scrubContactPoints(text: string | null | undefined): string {
  return (text ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !hasContactPoint(line) && !/^(正面|反面) · /.test(line))
    .join("\n")
    .slice(0, TEXT_LIMIT);
}

/** 送给模型的输入：只有 id 与四段文字。 */
export function buildTextEnrichmentInput(contacts: readonly TextEnrichmentContactInput[]) {
  if (contacts.length > TEXT_ENRICHMENT_MAX_CONTACTS) {
    throw new TextEnrichmentError("TOO_MANY_CONTACTS", `At most ${TEXT_ENRICHMENT_MAX_CONTACTS} contacts per call.`);
  }
  return {
    contacts: contacts.map((contact) => ({
      id: contact.contactId,
      organization: clean(contact.organization),
      title: clean(contact.role),
      address: clean(stripContactPoints(contact.location ?? "")),
      cardNotes: scrubContactPoints(contact.cardNotes),
    })),
  };
}

export function textEnrichmentSystemPrompt(): string {
  return [
    "You enrich business contacts from the text you are given: organization, title, address, and card notes.",
    "For every contact in the input, return one entry with its id.",
    businessCardIndustryInstruction(),
    businessCardEnrichmentInstruction(),
    "Use null for any field the text gives no reasonable basis for; never invent.",
    "Respond with a single JSON object: {\"contacts\": [{\"id\": string, \"primaryIndustryId\": string|null, \"secondaryIndustryId\": string|null, \"seniorityLevel\": string|null, \"regionCountryCode\": string|null, \"regionCity\": string|null}]}.",
  ].join(" ");
}

export function parseTextEnrichmentContent(content: string, allowedIds: readonly string[]): TextEnrichmentProposal[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new TextEnrichmentError("INVALID_OUTPUT", "The enrichment output is not JSON.");
  }
  const entries = typeof parsed === "object" && parsed !== null ? (parsed as { contacts?: unknown }).contacts : undefined;
  if (!Array.isArray(entries)) throw new TextEnrichmentError("INVALID_OUTPUT", "The enrichment output has no contacts array.");
  const allowed = new Set(allowedIds);
  const seen = new Set<string>();
  const proposals: TextEnrichmentProposal[] = [];
  for (const entry of entries) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id : "";
    if (!allowed.has(id) || seen.has(id)) continue;
    seen.add(id);
    const industry = sanitizeIndustryPair(record.primaryIndustryId, record.secondaryIndustryId);
    const enrichment = sanitizeCardEnrichment(record.seniorityLevel, record.regionCountryCode, record.regionCity);
    proposals.push({
      contactId: id,
      ...industry,
      seniorityLevel: enrichment.seniorityLevel,
      region: enrichment.regionCountryCode ? { countryCode: enrichment.regionCountryCode, city: enrichment.regionCity } : null,
    });
  }
  return proposals;
}

function usageOf(payload: unknown, latencyMs: number): TextEnrichmentUsage {
  const usage = typeof payload === "object" && payload !== null ? (payload as { usage?: Record<string, unknown> }).usage : undefined;
  return {
    inputTokens: typeof usage?.prompt_tokens === "number" ? usage.prompt_tokens : 0,
    latencyMs,
    outputTokens: typeof usage?.completion_tokens === "number" ? usage.completion_tokens : 0,
  };
}

function contentOf(payload: unknown): string | null {
  const choices = typeof payload === "object" && payload !== null ? (payload as { choices?: unknown }).choices : undefined;
  if (!Array.isArray(choices)) return null;
  const message = (choices[0] as { message?: { content?: unknown } } | undefined)?.message;
  return typeof message?.content === "string" ? message.content : null;
}

export interface DeepseekTextEnricherOptions {
  apiKey: string;
  model?: string;
  fetchImplementation?: typeof fetch;
  timeoutMs?: number;
  nowMs?: () => number;
}

export function createDeepseekTextEnricher({
  apiKey,
  model = DEFAULT_BUSINESS_CARD_TEXT_MODEL,
  fetchImplementation = fetch,
  timeoutMs = TEXT_ENRICHMENT_TIMEOUT_MS,
  nowMs = Date.now,
}: DeepseekTextEnricherOptions): TextEnricher {
  return {
    model,
    providerName: "deepseek-chat-completions",
    async enrich({ contacts, signal }) {
      const input = buildTextEnrichmentInput(contacts);
      if (!input.contacts.length) return { model, proposals: [], usage: { inputTokens: 0, latencyMs: 0, outputTokens: 0 } };
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const onAbort = () => controller.abort();
      signal?.addEventListener("abort", onAbort, { once: true });
      if (signal?.aborted) controller.abort();
      const startedAt = nowMs();
      try {
        let response: Response;
        try {
          response = await fetchImplementation(DEEPSEEK_CHAT_COMPLETIONS_ENDPOINT, {
            body: JSON.stringify({
              messages: [
                { content: textEnrichmentSystemPrompt(), role: "system" },
                { content: JSON.stringify(input), role: "user" },
              ],
              model,
              response_format: { type: "json_object" },
              thinking: { type: "disabled" },
            }),
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            method: "POST",
            signal: controller.signal,
          });
        } catch {
          if (controller.signal.aborted) throw new TextEnrichmentError("PROVIDER_TIMEOUT", "The enrichment request timed out.");
          throw new TextEnrichmentError("PROVIDER_REQUEST_FAILED", "The enrichment request failed.");
        }
        if (!response.ok) throw new TextEnrichmentError("PROVIDER_REQUEST_FAILED", `The enrichment request failed with status ${response.status}.`);
        let payload: unknown;
        try {
          payload = await response.json();
        } catch {
          throw new TextEnrichmentError("INVALID_OUTPUT", "The enrichment response is unreadable.");
        }
        const usage = usageOf(payload, Math.max(0, nowMs() - startedAt));
        const content = contentOf(payload);
        if (!content?.trim()) throw new TextEnrichmentError("INVALID_OUTPUT", "The enrichment returned no content.", usage);
        try {
          return { model, proposals: parseTextEnrichmentContent(content, input.contacts.map((contact) => contact.id)), usage };
        } catch (error) {
          throw error instanceof TextEnrichmentError ? new TextEnrichmentError(error.code, error.message, usage) : error;
        }
      } finally {
        clearTimeout(timeout);
        signal?.removeEventListener("abort", onAbort);
      }
    },
  };
}

/** provider factory：没有 DEEPSEEK_API_KEY 返回 null（调用方跳过 AI 层）。 */
export function createConfiguredTextEnricher(
  options: { env?: Record<string, string | undefined>; fetchImplementation?: typeof fetch } = {},
): TextEnricher | null {
  const env = options.env ?? process.env;
  const apiKey = env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) return null;
  return createDeepseekTextEnricher({
    apiKey,
    fetchImplementation: options.fetchImplementation,
    model: env.ORBIT_BUSINESS_CARD_OCR_TEXT_MODEL?.trim() || DEFAULT_BUSINESS_CARD_TEXT_MODEL,
  });
}
