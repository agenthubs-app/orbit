/**
 * Agent 页 route adapter。
 *
 * route 只负责挂载样式/runtime，并把 live-capable Orbit AI 聊天入口挂到 `/app/agent`。
 * 欢迎区的示例问题来自固定的 starter view model（旧 chat 已于 Sprint 0104 退役，
 * 服务端不再读取旧 chat 数据）；视觉组件采用 Orbit_0918 的 iOrbit 壳
 * （`agent/iorbit-0918/iorbit-shell.tsx`）：home 分支渲染 `iorbit-home.tsx`，chat 分支渲染
 * `iorbit-chat.tsx`。旧的 `OrbitRealAgent` 已于任务 6a 删除。
 *
 * 2026-10-30：引导期也渲染真实的 iOrbit 2026（W0004 / W0014 / W0036 / W0037 的旧示例壳不再挂载）；
 * 引导进度由 Task 横条与 `/app/start` 负责。
 * R25：W0008 的 `?plan=<id>` 计划回答卡片随 v1 计划删除；带 `?plan=` 的旧链接落在概览（计划在 Task › プラン）。
 */
import { getOrbitServerLanguage, localizeOrbitTree } from "../orbit-language-server";
import type { OrbitLanguage } from "../orbit-language-core";
import { OrbitReferenceStyles } from "../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../orbit-visual-freeze-runtime";
import { auth } from "../../../../auth";
import { resolveAuthenticatedApiActorFromSession } from "../../../api/_shared/authenticated-actor";
import { redirect } from "next/navigation";
import { IOrbit2026 } from "./iorbit-2026/IOrbit2026";
import { loadAppProfileRouteViewModel } from "../profile/compose-app-profile-from-previously-approved-mock-first-capabilities/profile-route-view-model";

export type AppAgentSearchParams = {
  /** 历史会话深链（由 iOrbit 壳在客户端读取）。 */
  session?: string | string[];
  /** `?history=1`：strategy / contacts 两屏页头的「◷ 历史记录」落点（任务 5）。 */
  history?: string | string[];
  lang?: string | string[];
  /** R25 前的 `?plan=<id>`（v1 计划回答卡片）：已不再读取，落在概览。 */
  plan?: string | string[];
  q?: string | string[];
  reveal?: string | string[];
};

async function getAgentPageLanguage(): Promise<OrbitLanguage> {
  try {
    return await getOrbitServerLanguage();
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("outside a request scope")
    ) {
      return "zh";
    }

    throw error;
  }
}

function firstSearchParam(
  searchParams: AppAgentSearchParams | undefined,
  key: string,
): string | null {
  const value = searchParams?.[key];
  const first = Array.isArray(value) ? value[0] : value;

  return typeof first === "string" && first.trim() ? first.trim() : null;
}

function languageSearchParam(
  searchParams: AppAgentSearchParams | undefined,
): OrbitLanguage | null {
  const value = firstSearchParam(searchParams, "lang");

  return value === "en" || value === "zh" ? value : null;
}

export default async function AppAgentPage({
  searchParams,
}: {
  searchParams?: Promise<AppAgentSearchParams>;
} = {}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/app/account/login?next=%2Fapp%2Fagent");
  }
  const actor = await resolveAuthenticatedApiActorFromSession({
    email: session.user.email,
    name: session.user.name,
    userId: session.user.id,
  });
  if (!actor) {
    throw new Error("Authenticated Orbit account membership is unavailable.");
  }
  const actorId = actor.id;

  const resolvedSearchParams = await searchParams;
  const requestedLanguage = languageSearchParam(resolvedSearchParams);
  // The live iOrbit 2026 screen greets by name and reads nothing else from the server
  // (not the whole home model — events, recommendations, readiness).
  const profileModel = await loadAppProfileRouteViewModel(
    { displayName: session.user.name?.trim() || session.user.email?.trim() || "Orbit member", email: session.user.email, id: actorId },
    { suggestions: "skip" },
  );
  const language = requestedLanguage ?? (await getAgentPageLanguage());
  const accountName = profileModel.state === "success"
    ? localizeOrbitTree(profileModel.profile.profile.displayName || "Orbit operator", language)
    : null;

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      <div data-orbit-route="app-agent-route">
          <IOrbit2026
            accountName={accountName}
            initialHistoryOpen={
              firstSearchParam(resolvedSearchParams, "history") === "1"
            }
          />
      </div>
    </>
  );
}
