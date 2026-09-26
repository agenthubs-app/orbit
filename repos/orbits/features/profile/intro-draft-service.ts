import type { ManualProfile, ProfileResult } from "./contract";
import { createProfileService } from "./service-factory";
import {
  industryLabel,
  isIndustryIdCode,
  secondaryIndustryLabel,
} from "../../shared/domain/industries";
import type { SecondaryIndustryIdCode } from "../../shared/contract/industries";
import {
  runOrbitAgentModelText,
  type GeminiOrbitAgentProviderConfig,
  type OrbitAgentModelTextResult,
} from "../orbit-ai/gemini-provider";

// 新用户引导第 4 步：根据已保存的资料（姓名/行业/职位/公司/目标/画像）
// 起草「关于我」(bio) 与「一句话介绍」(headline)。只生成草稿、不写库——
// 用户在引导里确认或修改后，仍经 PUT /api/profile 保存。
// 输入只取服务端已保存的资料（不信任客户端传来的画像），与邮件草稿同一口径。

export const PROFILE_INTRO_BIO_LIMIT = 80;
export const PROFILE_INTRO_HEADLINE_LIMIT = 40;

export const PROFILE_INTRO_MODEL_DEFAULTS = {
  deepseekThinking: false,
  requestTimeoutMs: 45_000,
} as const satisfies GeminiOrbitAgentProviderConfig;

export type ProfileIntroDraftErrorCode =
  | "ACTOR_REQUIRED"
  | "PROFILE_REQUIRED"
  | "MODEL_API_KEY_MISSING"
  | "MODEL_REQUEST_FAILED"
  | "MODEL_OUTPUT_INVALID";

export type ProfileIntroDraftResult =
  | { success: true; data: { bio: string; headline: string; model: string; provider: string } }
  | { success: false; error: { code: ProfileIntroDraftErrorCode; message: string } };

export interface ProfileIntroDraftServiceOptions {
  modelConfig?: GeminiOrbitAgentProviderConfig;
  readProfile?: (actorId: string) => Promise<ProfileResult>;
  runModel?: typeof runOrbitAgentModelText;
}

export function visibleLength(text: string): number {
  const Segmenter = (Intl as unknown as {
    Segmenter?: new (locale?: string, options?: { granularity: "grapheme" }) => { segment(input: string): Iterable<unknown> };
  }).Segmenter;
  return Segmenter
    ? Array.from(new Segmenter(undefined, { granularity: "grapheme" }).segment(text)).length
    : Array.from(text).length;
}

function clean(value: unknown): string {
  return typeof value === "string"
    ? value.replace(/\u0000/g, "").replace(/\s+/g, " ").trim().replace(/^["“「]+|["”」]+$/g, "")
    : "";
}

export function parseProfileIntroDraft(text: string): { bio: string; headline: string } | null {
  const unwrapped = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(unwrapped);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  const bio = clean(record.bio);
  const headline = clean(record.headline);
  if (!bio || !headline) return null;
  if (visibleLength(bio) > PROFILE_INTRO_BIO_LIMIT || visibleLength(headline) > PROFILE_INTRO_HEADLINE_LIMIT) {
    return null;
  }
  return { bio, headline };
}

function describeRejection(text: string): string {
  try {
    const record = JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")) as Record<string, unknown>;
    return `headline ${visibleLength(clean(record.headline))}/${PROFILE_INTRO_HEADLINE_LIMIT}, bio ${visibleLength(clean(record.bio))}/${PROFILE_INTRO_BIO_LIMIT}`;
  } catch {
    return "not valid JSON";
  }
}

/** 模型输入：只含用户自己填写的资料字段，空字段省略。 */
export function profileIntroModelInput(profile: ManualProfile, language: "zh" | "en"): string {
  const primary = isIndustryIdCode(profile.primaryIndustryId) ? industryLabel(profile.primaryIndustryId, language) : "";
  const secondary = profile.secondaryIndustryId
    ? secondaryIndustryLabel(profile.secondaryIndustryId as SecondaryIndustryIdCode, language)
    : "";
  const record: Record<string, unknown> = {
    name: profile.displayName,
    title: profile.role,
    company: profile.organization,
    industry: [primary, secondary].filter(Boolean).join(" / "),
    currentGoal: profile.relationshipGoal,
    canOffer: profile.offering ?? [],
    seeking: profile.seeking ?? [],
    topics: profile.topics ?? [],
  };
  const compact = Object.fromEntries(
    Object.entries(record).filter(([, value]) => (Array.isArray(value) ? value.length > 0 : Boolean(value))),
  );
  return JSON.stringify({ outputLanguage: language === "en" ? "English" : "Simplified Chinese", profile: compact }, null, 2);
}

// 模型常把「关于我」写到 82–93 字（实测 10 次中 2 次超 80）。提示里给更紧的目标长度，
// 硬上限仍由 parseProfileIntroDraft 按可见字符校验。
const HEADLINE_TARGET = 28;
const BIO_TARGET = 60;
const MAX_ATTEMPTS = 3;

function systemInstruction(language: "zh" | "en"): string {
  const units = language === "en" ? "characters" : "Chinese characters";
  return [
    "You write the self-introduction shown on a business networking profile, in the first person.",
    "Use only facts from the supplied profile. Do not invent employers, achievements, numbers, years of experience, clients or credentials.",
    `"headline" is one short line of about ${HEADLINE_TARGET} ${units} (never more than ${PROFILE_INTRO_HEADLINE_LIMIT}) saying who the person is and what they focus on.`,
    `"bio" is "About me": about ${BIO_TARGET} ${units} (never more than ${PROFILE_INTRO_BIO_LIMIT}), one or two sentences: what they do, what they can help with and who they want to meet. Pick the most important points instead of listing everything.`,
    "Plain, specific and friendly; no emoji, no hashtags, no marketing superlatives.",
    'Return strict JSON only: {"headline":"...","bio":"..."}.',
  ].join(" ");
}

export function createProfileIntroDraftService(options: ProfileIntroDraftServiceOptions = {}) {
  const modelConfig: GeminiOrbitAgentProviderConfig = { ...PROFILE_INTRO_MODEL_DEFAULTS, ...options.modelConfig };
  const runModel = options.runModel ?? runOrbitAgentModelText;
  const readProfile = options.readProfile ?? ((actorId: string) => createProfileService().getProfile({ actorId }));

  return {
    async createDraft(input: { actorId: string; language?: string | null }): Promise<ProfileIntroDraftResult> {
      const actorId = input.actorId.trim();
      if (!actorId) {
        return { success: false, error: { code: "ACTOR_REQUIRED", message: "Sign in before generating an introduction." } };
      }
      const language = input.language === "en" ? "en" : "zh";
      const profileResult = await readProfile(actorId);
      const profile = profileResult.success ? profileResult.data.profile : null;
      if (!profile || !profile.displayName.trim()) {
        return {
          success: false,
          error: { code: "PROFILE_REQUIRED", message: "Save your name and basic profile before generating an introduction." },
        };
      }

      const userText = profileIntroModelInput(profile, language);
      const instruction = systemInstruction(language);
      let lastRejection = "";
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        // 超长或非 JSON：带上被拒原因重试，不截断半句话。
        const modelResult: OrbitAgentModelTextResult = await runModel({
          config: modelConfig,
          systemInstruction: attempt === 1
            ? instruction
            : `${instruction} A previous answer was rejected (${lastRejection}). Write noticeably shorter and keep both fields strictly within the limits.`,
          userText,
        });
        if (modelResult.success === false) {
          console.warn("[profile-intro-draft] model_failed", { attempt, code: modelResult.error.code });
          return { success: false, error: { code: modelResult.error.code, message: modelResult.error.message } };
        }
        const draft = parseProfileIntroDraft(modelResult.text);
        if (draft) {
          return { success: true, data: { ...draft, model: modelResult.model, provider: modelResult.provider } };
        }
        lastRejection = describeRejection(modelResult.text);
        // 只记长度/原因，不记用户资料与生成内容。
        console.warn("[profile-intro-draft] output_rejected", { attempt, reason: lastRejection });
      }
      return { success: false, error: { code: "MODEL_OUTPUT_INVALID", message: "The AI response did not contain a usable introduction." } };
    },
  };
}
