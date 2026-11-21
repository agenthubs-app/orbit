import { evalSetting } from "../observability/trace";

/**
 * ORBIT_AGENT_V1_MODE（CONVENTIONS §2）：新入口的总开关，缺省 off。
 * - off：只有旧通路（协议 2 与不带版本），与 AG01 之前完全相同。
 * - shadow（AG18）：用户拿到旧通路的回答；新通路在应答之后对同一条消息只读地跑一遍，只留比较记录（rollout/shadow.ts）。
 *   协议 3 不开放，新版客户端照旧退回协议 2。
 * - on：协议 3 开放；协议 2 和不带版本的旧客户端也交给新流程，由服务端代为等待（rollout/legacy-client.ts）。
 * 评测里一个用例可以用 `settings: { shadow: on }` 把它换成 shadow（只在 ORBIT_AGENT_EVAL 下有 evalSetting）。
 */
export type AgentV1Mode = "off" | "shadow" | "on";

export function readAgentV1Mode(env: Record<string, string | undefined> = process.env): AgentV1Mode {
  const override = evalSetting("agent_v1_mode");
  const value = (typeof override === "string" ? override : env.ORBIT_AGENT_V1_MODE)?.trim().toLowerCase();
  return value === "on" || value === "shadow" ? value : "off";
}

/** 协议版本 3 的入口、结果文档读取、实时通道和按 requestId 停止是否开放。 */
export function agentV1EntryEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return readAgentV1Mode(env) === "on";
}
