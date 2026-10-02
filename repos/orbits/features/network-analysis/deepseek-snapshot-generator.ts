/**
 * W0048a：DeepSeek 快照生成器（一次 generate = 一次供应商 HTTP；D42／D43 批准，生产默认仍为 mock，W48-9）。
 *
 * 提示词只含本人已确认联系人的姓名、公司、职位、行业、派生职级、地区、关系档位与每人最近 ≤2 条记录标题，
 * 以及计划里的人脉需求；不含邮箱、电话等联系方式。输出由 `snapshot-validator.ts` 解析校验。
 */
import { DEFAULT_BUSINESS_CARD_TEXT_MODEL } from "../acquisition/deepseek-business-card-ocr-provider";
import { DeepseekJsonChatError, deepseekJsonChat } from "../ai/deepseek-json-chat";
import { SNAPSHOT_PROMPT_VERSION } from "./contract";
import { SnapshotGeneratorError, type NetworkSnapshotGenerator, type SnapshotInput } from "./snapshot-generator";

export const SNAPSHOT_GENERATION_TIMEOUT_MS = 60_000;

export const SNAPSHOT_SYSTEM_PROMPT = [
  "You analyse a professional's network of confirmed business contacts for a relationship-building app.",
  "Input: the user's goal (may be empty), the total contact count, up to 200 contacts (id, name, company, title, industry, seniority group, region, relationship tier, dormant flag, up to 2 recent records with ids), and the network needs in the user's plan (id, title).",
  "Write short, concrete observations grounded only in the input. Never invent people, companies, numbers or ids.",
  "Every block must cite evidence: contactIds and/or recordIds copied exactly from the input. A block without valid evidence is discarded.",
  "Return exactly: 1 block of kind \"diagnosis\" (overall state of the network relative to the goal), 2-3 blocks of kind \"insight\", 0-6 blocks of kind \"gap\" (what is missing for a plan need; set needId to that need's id), and at most 1 block of kind \"plan\" (one suggested next move).",
  "Each block has both a Simplified Chinese text \"zh\" and an English text \"en\" with the same meaning, each at most 2 short sentences. Write zh entirely in Chinese (translate industry names) and en entirely in English; keep people's and companies' names as given.",
  "Never put ids, record references or field names in the text: cite them only in contactIds/recordIds. Do not output scores, percentages or counts other than ones present in the input.",
  'Respond with a single JSON object: {"blocks":[{"kind":"diagnosis","zh":"...","en":"...","contactIds":["..."],"recordIds":["..."],"needId":"optional"}]}.',
].join(" ");

/** 紧凑编码：空字段不出现。 */
function compact<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== null && entry !== undefined && entry !== false && !(Array.isArray(entry) && entry.length === 0)),
  ) as Partial<T>;
}

/** 送给模型的输入（纯函数，测试与真实调用共用）。 */
export function buildSnapshotPromptInput(input: SnapshotInput) {
  return {
    contactTotal: input.contactTotal,
    contacts: input.contacts.map((contact) =>
      compact({
        company: contact.organization,
        dormant: contact.dormant,
        id: contact.id,
        industry: contact.industry,
        name: contact.name,
        records: contact.records.map((record) => compact({ at: record.occurredAt.slice(0, 10), excerpt: record.excerpt, id: record.id, title: record.title })),
        region: contact.region,
        seniority: contact.seniorityGroup === "other" ? null : contact.seniorityGroup,
        tier: contact.tier,
        title: contact.role,
      }),
    ),
    goal: input.goal,
    needs: input.needs.map((need) => compact({ description: need.description, id: need.id, industry: need.industry, title: need.title })),
  };
}

export interface DeepseekSnapshotGeneratorOptions {
  apiKey: string;
  model?: string;
  fetchImplementation?: typeof fetch;
  timeoutMs?: number;
}

export function createDeepseekSnapshotGenerator(options: DeepseekSnapshotGeneratorOptions): NetworkSnapshotGenerator {
  const model = options.model ?? DEFAULT_BUSINESS_CARD_TEXT_MODEL;
  return {
    billable: true,
    model,
    promptVersion: SNAPSHOT_PROMPT_VERSION,
    provider: "deepseek",
    async generate(input, { signal } = {}) {
      try {
        const result = await deepseekJsonChat({
          apiKey: options.apiKey,
          fetchImplementation: options.fetchImplementation,
          model,
          signal,
          system: SNAPSHOT_SYSTEM_PROMPT,
          timeoutMs: options.timeoutMs ?? SNAPSHOT_GENERATION_TIMEOUT_MS,
          user: JSON.stringify(buildSnapshotPromptInput(input)),
        });
        return { content: result.content, usage: { inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens } };
      } catch (error) {
        if (error instanceof DeepseekJsonChatError) {
          throw new SnapshotGeneratorError(error.code, error.message, error.usage ? { inputTokens: error.usage.inputTokens, outputTokens: error.usage.outputTokens } : null);
        }
        throw error;
      }
    },
  };
}

/**
 * provider factory：`ORBIT_NETWORK_ANALYSIS_GENERATOR=deepseek` 且有 `DEEPSEEK_API_KEY` 时用 DeepSeek，
 * 否则 null（调用方用 mock）。生产未设该变量 → mock（W48-9）。
 */
export function createConfiguredDeepseekSnapshotGenerator(env: Record<string, string | undefined> = process.env): NetworkSnapshotGenerator | null {
  if (env.ORBIT_NETWORK_ANALYSIS_GENERATOR?.trim() !== "deepseek") return null;
  const apiKey = env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) return null;
  return createDeepseekSnapshotGenerator({ apiKey, model: env.ORBIT_BUSINESS_CARD_OCR_TEXT_MODEL?.trim() || undefined });
}
