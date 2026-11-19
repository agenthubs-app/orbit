/**
 * ORBIT_AGENT_V1_MODE（CONVENTIONS §2）：新入口的总开关，缺省 off。
 * AG01 只有 off 与 on 两种行为：shadow 的对比在 AG18 才做，本 sprint 按 off 处理。
 */
export type AgentV1Mode = "off" | "shadow" | "on";

export function readAgentV1Mode(env: Record<string, string | undefined> = process.env): AgentV1Mode {
  const value = env.ORBIT_AGENT_V1_MODE?.trim().toLowerCase();
  return value === "on" || value === "shadow" ? value : "off";
}

/** 协议版本 3 的入口、结果文档读取、实时通道和按 requestId 停止是否开放。 */
export function agentV1EntryEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return readAgentV1Mode(env) === "on";
}
