import {
  DEFAULT_DEEPSEEK_ORBIT_AGENT_MODEL,
  DEFAULT_GEMINI_ORBIT_AGENT_MODEL,
  DEFAULT_OPENAI_ORBIT_AGENT_MODEL,
  resolveOrbitAgentModelProviderSelection,
  type GeminiOrbitAgentProviderConfig,
  type OrbitAgentModelProvider,
} from "../../orbit-ai/gemini-provider";

export const ATTENDEE_POST_EVENT_AI_PROMPT_VERSION = 2;

export interface AttendeePostEventAiProviderConfiguration {
  config: GeminiOrbitAgentProviderConfig;
  model: string;
  provider: OrbitAgentModelProvider;
}

export function resolveAttendeePostEventAiProviderConfiguration(
  env: NodeJS.ProcessEnv = process.env,
): AttendeePostEventAiProviderConfiguration | null {
  // 与 gemini-provider 共用 provider 选择：未设置 ORBIT_AGENT_PROVIDER 时按已配置的 key 自动选择。
  const selected = resolveOrbitAgentModelProviderSelection({ env }).provider;
  if (selected === "deepseek") {
    const apiKey = env.DEEPSEEK_API_KEY?.trim();
    if (!apiKey) return null;
    const model = env.ORBIT_DEEPSEEK_MODEL?.trim() || DEFAULT_DEEPSEEK_ORBIT_AGENT_MODEL;
    return { config: { apiKey, jsonOutput: true, model, provider: "deepseek" }, model, provider: "deepseek" };
  }
  if (selected === "openai") {
    const apiKey = env.OPENAI_API_KEY?.trim();
    if (!apiKey) return null;
    const model = env.ORBIT_OPENAI_MODEL?.trim() || DEFAULT_OPENAI_ORBIT_AGENT_MODEL;
    return { config: { apiKey, jsonOutput: true, model, provider: "openai" }, model, provider: "openai" };
  }
  const apiKey = env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;
  const model = env.ORBIT_GEMINI_MODEL?.trim() || DEFAULT_GEMINI_ORBIT_AGENT_MODEL;
  return { config: { apiKey, jsonOutput: true, model, provider: "gemini" }, model, provider: "gemini" };
}
