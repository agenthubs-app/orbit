/**
 * Chat 页 route adapter — iOrbit 工作台合并后收窄成纯重定向。
 *
 * chat 与 agent 早已共享同一份 chat route view model，只剩两层不同的壳；
 * 工作台合并（dashboard ⇄ 对话）后对话壳统一到 /app/agent。这里保留深链
 * 重定向并透传 q / lang 查询参数——同 followups → today 的先例。原对话壳组件与
 * chat route view model 留在原处不删除：view model 仍被 agent 页复用。
 */
import { redirect } from "next/navigation";

import type { AppChatSearchParams } from "./compose-app-chat-from-previously-approved-mock-first-capabilities/chat-route-view-model";

type ChatRedirectSearchParams = AppChatSearchParams & {
  lang?: string | string[];
  q?: string | string[];
};

function firstParam(value: string | string[] | undefined): string | null {
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === "string" && first.trim() ? first.trim() : null;
}

export default async function AppChatPage({
  searchParams,
}: {
  searchParams?: Promise<ChatRedirectSearchParams>;
} = {}) {
  const resolved = await searchParams;
  const forwarded = new URLSearchParams();
  const q = firstParam(resolved?.q);
  const lang = firstParam(resolved?.lang);
  if (q) forwarded.set("q", q);
  if (lang) forwarded.set("lang", lang);
  const suffix = forwarded.size ? `?${forwarded.toString()}` : "";
  redirect(`/app/agent${suffix}`);
}
