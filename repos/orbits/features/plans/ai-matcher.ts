/**
 * 人脉需求匹配的第二轮（AI 层，RW-11，Sprint W0010；决定 D5）。
 *
 * 规则层只看行业；这一轮把本批联系人的公司、职位和本计划的人脉需求（标题、描述、职位关键词、
 * 行业）交给文本模型，一次调用给出补充配对。计费沿用名片识别：同一个 DeepSeek 账号与
 * 文本模型配置（`DEEPSEEK_API_KEY`、`ORBIT_BUSINESS_CARD_OCR_TEXT_MODEL`，默认
 * `deepseek-v4-flash`），不另设累计上限；每个任务最多一次调用由 `match-worker.ts` 保证
 * （`ai_state` 先落库再调用），用量记在任务行上。
 *
 * 模块边界：worker 只依赖 `PlanAiMatcher` 接口；`createConfiguredPlanAiMatcher` 是 provider
 * factory——没有配置密钥时返回 null（worker 记为 skipped，不回落到别的 provider）。
 * 输出用 `json_object`；越界 id 的丢弃在 `matching.ts` 的 `acceptedAiPairs`，这里只负责请求与解析。
 * 提示词里只有联系人 id、姓名、公司、职位与需求文字，不含邮箱、电话等联系方式。
 */
import { DEFAULT_BUSINESS_CARD_TEXT_MODEL } from "../acquisition/deepseek-business-card-ocr-provider";
import { industryLabel, secondaryIndustryLabel } from "../../shared/domain/industries";
import type { PlanMatchContact, PlanMatchNeed } from "./matching";

export interface PlanAiMatchProposal {
  contactId: unknown;
  needId: unknown;
  reason?: unknown;
}

export interface PlanAiMatchUsage {
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}

export interface PlanAiMatchResult {
  proposals: PlanAiMatchProposal[];
  usage: PlanAiMatchUsage;
  model: string;
}

export interface PlanAiMatcher {
  readonly model: string;
  readonly providerName: string;
  match(input: {
    contacts: readonly PlanMatchContact[];
    needs: readonly PlanMatchNeed[];
    signal?: AbortSignal;
  }): Promise<PlanAiMatchResult>;
}

export class PlanAiMatcherError extends Error {
  constructor(
    readonly code: "PROVIDER_TIMEOUT" | "PROVIDER_REQUEST_FAILED" | "INVALID_OUTPUT",
    message: string,
    /** 请求已经返回、只是结果不可用时，仍然记下用量（计费已经发生）。 */
    readonly usage: PlanAiMatchUsage | null = null,
  ) {
    super(message);
    this.name = "PlanAiMatcherError";
  }
}

const DEEPSEEK_CHAT_COMPLETIONS_ENDPOINT = "https://api.deepseek.com/chat/completions";
/** 真实调用的上限；在请求内执行时由调用方传入更短的 signal。 */
export const PLAN_AI_MATCH_TIMEOUT_MS = 30_000;
/**
 * 一次调用覆盖本人**所有**生效人脉需求（RW-11 不设人数上限）；200 条只是防止 token 失控的安全上限，
 * 远高于生成器给出的需求数（每条紧凑编码约 30–60 token）。联系人不另设上限：只受任务本身约束
 * （一批最多 50 张名片，当天聚合的任务最多 `PLAN_MATCH_MAX_CONTACTS` = 200 人）。
 */
export const PLAN_AI_MATCH_LIMITS = { needs: 200, proposals: 400 } as const;

/** R24（C12）：v2 人物类型的描述是「役割 × 状況」一句、关键词是「見分け方」；提示词版本 +1（输出形状不变）。 */
export const PLAN_AI_MATCH_PROMPT_VERSION = "plan-match-2026-11-v2";

export const PLAN_AI_MATCH_SYSTEM_PROMPT = [
  "You match newly added business contacts to the network needs in the user's plan.",
  "Each contact has an id, name, and optionally company and job title. Each need has an id, a title, and optionally a description, title keywords and an industry; absent fields are omitted.",
  "Propose a pair only when the contact's company or job title makes them a plausible fit for the need. Industry alone is already handled elsewhere; focus on company and title.",
  "A description may be a 'role × situation' sentence (for example, a founder who raised a Series A within three years): match the situation as well as the role, and use the keywords as signs to recognise such a person.",
  "Use only the ids given in the input. Never invent ids. It is fine to return no pairs.",
  'Respond with a single JSON object: {"matches":[{"contactId":"...","needId":"...","reason":"one short sentence in the language of the need title"}]}.',
].join(" ");

function text(value: string | null | undefined): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** 紧凑编码：空字段不出现。 */
function compact<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== null && entry !== undefined && !(Array.isArray(entry) && entry.length === 0)),
  ) as Partial<T>;
}

/** 送给模型的输入（纯函数，测试与真实调用共用）。需求按新添加的在前（与读取顺序一致）。 */
export function buildPlanAiMatchInput(contacts: readonly PlanMatchContact[], needs: readonly PlanMatchNeed[]) {
  return {
    contacts: contacts.map((contact) =>
      compact({ company: text(contact.organization), id: contact.id, name: contact.displayName, title: text(contact.role) }),
    ),
    needs: needs.slice(0, PLAN_AI_MATCH_LIMITS.needs).map((need) =>
      compact({
        description: text(need.criteria?.description ?? null),
        id: need.id,
        industry: need.criteria?.secondaryIndustryId
          ? secondaryIndustryLabel(need.criteria.secondaryIndustryId, "en")
          : need.criteria?.primaryIndustryId
            ? industryLabel(need.criteria.primaryIndustryId, "en")
            : null,
        keywords: need.criteria?.titleKeywords ?? [],
        title: need.title,
      }),
    ),
  };
}

/** 解析模型输出：只要 `{ matches: [...] }` 里的对象；形状不对就是 INVALID_OUTPUT。 */
export function parsePlanAiMatchContent(content: string): PlanAiMatchProposal[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new PlanAiMatcherError("INVALID_OUTPUT", "The matcher returned invalid JSON.");
  }
  const matches = typeof parsed === "object" && parsed !== null ? (parsed as { matches?: unknown }).matches : undefined;
  if (!Array.isArray(matches)) throw new PlanAiMatcherError("INVALID_OUTPUT", "The matcher output has no matches array.");
  return matches
    .filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null && !Array.isArray(entry))
    .slice(0, PLAN_AI_MATCH_LIMITS.proposals)
    .map((entry) => ({ contactId: entry.contactId, needId: entry.needId, reason: entry.reason }));
}

function usageOf(payload: unknown, latencyMs: number): PlanAiMatchUsage {
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

export interface DeepseekPlanAiMatcherOptions {
  apiKey: string;
  model?: string;
  fetchImplementation?: typeof fetch;
  timeoutMs?: number;
  nowMs?: () => number;
}

export function createDeepseekPlanAiMatcher({
  apiKey,
  model = DEFAULT_BUSINESS_CARD_TEXT_MODEL,
  fetchImplementation = fetch,
  timeoutMs = PLAN_AI_MATCH_TIMEOUT_MS,
  nowMs = Date.now,
}: DeepseekPlanAiMatcherOptions): PlanAiMatcher {
  return {
    model,
    providerName: "deepseek-chat-completions",
    async match({ contacts, needs, signal }) {
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
                { content: PLAN_AI_MATCH_SYSTEM_PROMPT, role: "system" },
                { content: JSON.stringify(buildPlanAiMatchInput(contacts, needs)), role: "user" },
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
          if (controller.signal.aborted) throw new PlanAiMatcherError("PROVIDER_TIMEOUT", "The matcher request timed out.");
          throw new PlanAiMatcherError("PROVIDER_REQUEST_FAILED", "The matcher request failed.");
        }
        if (!response.ok) {
          throw new PlanAiMatcherError("PROVIDER_REQUEST_FAILED", `The matcher request failed with status ${response.status}.`);
        }
        let payload: unknown;
        try {
          payload = await response.json();
        } catch {
          if (controller.signal.aborted) throw new PlanAiMatcherError("PROVIDER_TIMEOUT", "The matcher request timed out.");
          throw new PlanAiMatcherError("INVALID_OUTPUT", "The matcher returned an unreadable response.");
        }
        const usage = usageOf(payload, Math.max(0, nowMs() - startedAt));
        const content = contentOf(payload);
        if (!content?.trim()) throw new PlanAiMatcherError("INVALID_OUTPUT", "The matcher returned no content.", usage);
        try {
          return { model, proposals: parsePlanAiMatchContent(content), usage };
        } catch (error) {
          throw error instanceof PlanAiMatcherError ? new PlanAiMatcherError(error.code, error.message, usage) : error;
        }
      } finally {
        clearTimeout(timeout);
        signal?.removeEventListener("abort", onAbort);
      }
    },
  };
}

/**
 * provider factory：复用名片识别的 DeepSeek 文本模型配置。没有密钥返回 null
 * （worker 把 AI 层记为 skipped，只保留规则结果）。
 */
export function createConfiguredPlanAiMatcher(
  options: { env?: Record<string, string | undefined>; fetchImplementation?: typeof fetch } = {},
): PlanAiMatcher | null {
  const env = options.env ?? process.env;
  const apiKey = text(env.DEEPSEEK_API_KEY);
  if (!apiKey) return null;
  return createDeepseekPlanAiMatcher({
    apiKey,
    fetchImplementation: options.fetchImplementation,
    model: text(env.ORBIT_BUSINESS_CARD_OCR_TEXT_MODEL) ?? DEFAULT_BUSINESS_CARD_TEXT_MODEL,
  });
}
