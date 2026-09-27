/**
 * Agent 页 route adapter。
 *
 * route 只负责挂载样式/runtime，并把 live-capable Orbit AI 聊天入口挂到 `/app/agent`。
 * 欢迎区的示例问题来自固定的 starter view model（旧 chat 已于 Sprint 0104 退役，
 * 服务端不再读取旧 chat 数据）；视觉组件采用 Orbit_0918 的 iOrbit 壳
 * （`agent/iorbit-0918/iorbit-shell.tsx`）：home 分支渲染 `iorbit-home.tsx`，chat 分支渲染
 * `iorbit-chat.tsx`。旧的 `OrbitRealAgent` 已于任务 6a 删除。
 */
import { getOrbitServerLanguage, localizeOrbitTree } from "../orbit-language-server";
import type { OrbitLanguage } from "../orbit-language-core";
import { OrbitReferenceStyles } from "../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../orbit-visual-freeze-runtime";
import { auth } from "../../../../auth";
import { resolveAuthenticatedApiActorFromSession } from "../../../api/_shared/authenticated-actor";
import { redirect } from "next/navigation";
import { createOrbitAgentStarterViewModel } from "../orbit-agent-route-view-model";
import { IOrbitShell } from "./iorbit-0918/iorbit-shell";
import { loadAppHomeRouteViewModel } from "../home/compose-app-home-from-previously-approved-mock-first-capabilities/home-route-view-model";
import { presentOrbitEvents } from "../orbit-event-presentation";
import { readRuntimeEventRegistrationStates } from "../../../../features/events/registration/runtime";
import { resolveConfiguredActorEventCanonicalIds } from "../canonical-event-detail-view";

export type AppAgentSearchParams = {
  /** 历史会话深链（由 iOrbit 壳在客户端读取）。 */
  session?: string | string[];
  /** `?history=1`：strategy / contacts 两屏页头的「◷ 历史记录」落点（任务 5）。 */
  history?: string | string[];
  lang?: string | string[];
  q?: string | string[];
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
  // iOrbit 工作台首屏（dashboard）与旧 /app/home 同源的数据：账户、统计、活动旅程。
  const homeModel = await loadAppHomeRouteViewModel(undefined, {
    displayName:
      session?.user?.name?.trim() ||
      session?.user?.email?.trim() ||
      "Orbit member",
    email: session?.user?.email,
    id: actorId,
    rawSubject: session.user.id,
  });
  const registrationEventIds =
    homeModel.state === "success"
      ? homeModel.home.events.map((event) => event.id)
      : [];
  const canonicalEventIdsByRouteId = await resolveConfiguredActorEventCanonicalIds({
    actorId,
    eventIds: registrationEventIds,
  });
  const canonicalRegistrationStates = await readRuntimeEventRegistrationStates({
    eventIds: registrationEventIds.map(
      (routeId) => canonicalEventIdsByRouteId[routeId] ?? routeId,
    ),
    userId: session.user.id,
  });
  const registrationStates = Object.fromEntries(
    registrationEventIds.map((routeId) => {
      const canonicalId = canonicalEventIdsByRouteId[routeId] ?? routeId;
      return [
        routeId,
        canonicalRegistrationStates[canonicalId] ?? {
          availability: "unavailable" as const,
          registered: false,
        },
      ];
    }),
  );
  const viewModel = createOrbitAgentStarterViewModel();
  const language = requestedLanguage ?? (await getAgentPageLanguage());

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      <div data-orbit-route="app-agent-route">
          <IOrbitShell
            initialDeepLink={Boolean(
              firstSearchParam(resolvedSearchParams, "q") ||
                firstSearchParam(resolvedSearchParams, "session"),
            )}
            initialHistoryOpen={
              firstSearchParam(resolvedSearchParams, "history") === "1"
            }
            home={
              homeModel.state === "success"
                ? localizeOrbitTree(
                    {
                      ...homeModel.home,
                      events: presentOrbitEvents(
                        homeModel.home.events.map((event) => {
                          const registered =
                            registrationStates[event.id]?.registered ?? false;
                          return {
                            ...event,
                            stats: {
                              ...event.stats,
                              youRsvped: registered,
                            },
                            youRsvped: registered,
                          };
                        }),
                        language,
                      ),
                    },
                    language,
                  )
                : null
            }
            viewModel={localizeOrbitTree(viewModel, language)}
          />
      </div>
    </>
  );
}
