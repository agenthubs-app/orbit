import type { ProfileResult } from "./contract";
import { createProfileService } from "./service-factory";
import { profileIntroModelInput } from "./intro-draft-service";
import {
  runOrbitAgentModelText,
  type GeminiOrbitAgentProviderConfig,
} from "../orbit-ai/gemini-provider";

// 新用户引导「我在寻找」的 ✦ 建议：让模型根据已保存的资料（行业、职位、目标、能提供）
// 从客户端给出的候选选项里挑 2–4 个。只接受候选列表里的原文，模型编出来的一律丢弃。

export const SEEK_SUGGESTION_MAX = 4;
const CANDIDATE_LIMIT = 60;
const CANDIDATE_LENGTH = 24;

export type SeekSuggestionErrorCode =
  | "ACTOR_REQUIRED"
  | "CANDIDATES_REQUIRED"
  | "PROFILE_REQUIRED"
  | "MODEL_API_KEY_MISSING"
  | "MODEL_REQUEST_FAILED"
  | "MODEL_OUTPUT_INVALID";

export type SeekSuggestionResult =
  | { success: true; data: { suggestions: string[] } }
  | { success: false; error: { code: SeekSuggestionErrorCode; message: string } };

export interface SeekSuggestionServiceOptions {
  modelConfig?: GeminiOrbitAgentProviderConfig;
  readProfile?: (actorId: string) => Promise<ProfileResult>;
  runModel?: typeof runOrbitAgentModelText;
}

export function normalizeSeekCandidates(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const text = item.trim();
    if (!text || text.length > CANDIDATE_LENGTH || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
    if (out.length >= CANDIDATE_LIMIT) break;
  }
  return out;
}

export function parseSeekSuggestions(text: string, candidates: readonly string[]): string[] | null {
  const unwrapped = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(unwrapped);
  } catch {
    return null;
  }
  const list = parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as { suggestions?: unknown }).suggestions
    : parsed;
  if (!Array.isArray(list)) return null;
  const allowed = new Set(candidates);
  const picked = [...new Set(list.filter((item): item is string => typeof item === "string").map(item => item.trim()))]
    .filter(item => allowed.has(item))
    .slice(0, SEEK_SUGGESTION_MAX);
  return picked.length ? picked : null;
}

const SYSTEM_INSTRUCTION = [
  "You help a professional on a business networking app decide which kinds of people to look for.",
  "Read their saved profile (industry, title, company, current goal, what they can offer) and choose the 2 to 4 candidate labels that would most directly help them reach their current goal.",
  "Choose only from the supplied candidates and copy each label exactly as written. Do not invent labels.",
  'Return strict JSON only: {"suggestions":["label", "..."]}.',
].join(" ");

export function createSeekSuggestionService(options: SeekSuggestionServiceOptions = {}) {
  const modelConfig: GeminiOrbitAgentProviderConfig = { deepseekThinking: false, requestTimeoutMs: 30_000, ...options.modelConfig };
  const runModel = options.runModel ?? runOrbitAgentModelText;
  const readProfile = options.readProfile ?? ((actorId: string) => createProfileService().getProfile({ actorId }));

  return {
    async suggest(input: { actorId: string; candidates: unknown; language?: string | null }): Promise<SeekSuggestionResult> {
      const actorId = input.actorId.trim();
      if (!actorId) return { success: false, error: { code: "ACTOR_REQUIRED", message: "Sign in before requesting suggestions." } };
      const candidates = normalizeSeekCandidates(input.candidates);
      if (!candidates.length) return { success: false, error: { code: "CANDIDATES_REQUIRED", message: "No candidate labels were supplied." } };
      const profileResult = await readProfile(actorId);
      const profile = profileResult.success ? profileResult.data.profile : null;
      if (!profile || !profile.relationshipGoal?.trim()) {
        return { success: false, error: { code: "PROFILE_REQUIRED", message: "Save a current goal before requesting suggestions." } };
      }
      const language = input.language === "en" ? "en" : "zh";
      const userText = JSON.stringify({ profile: JSON.parse(profileIntroModelInput(profile, language)).profile, candidates }, null, 2);

      for (let attempt = 1; attempt <= 2; attempt += 1) {
        const result = await runModel({
          config: modelConfig,
          systemInstruction: attempt === 1 ? SYSTEM_INSTRUCTION : `${SYSTEM_INSTRUCTION} The previous answer was rejected: it was not JSON or used labels outside the candidates.`,
          userText,
        });
        if (result.success === false) {
          console.warn("[seek-suggestions] model_failed", { attempt, code: result.error.code });
          return { success: false, error: { code: result.error.code, message: result.error.message } };
        }
        const suggestions = parseSeekSuggestions(result.text, candidates);
        if (suggestions) return { success: true, data: { suggestions } };
        console.warn("[seek-suggestions] output_rejected", { attempt });
      }
      return { success: false, error: { code: "MODEL_OUTPUT_INVALID", message: "The AI response did not contain usable suggestions." } };
    },
  };
}
