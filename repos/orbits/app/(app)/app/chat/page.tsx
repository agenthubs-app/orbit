/**
 * Chat 页 route adapter。
 *
 * route 只负责加载 live-capable chat view model、挂载独立会话工作区和失败边界。
 * Agent 保持自己的交互壳，两条路由共享数据服务但不再混用页面组件。
 */
import { getOrbitServerLanguage, localizeOrbitTree } from "../orbit-language-server";
import type { OrbitLanguage } from "../orbit-language-core";
import { redirect } from "next/navigation";
import { auth } from "../../../../auth";
import { OrbitReferenceStyles } from "../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../orbit-visual-freeze-runtime";
import {
  loadAppChatRouteViewModel,
  type AppChatSearchParams,
} from "./compose-app-chat-from-previously-approved-mock-first-capabilities/chat-route-view-model";
import { ChatRouteStateBoundary } from "./chat-route-state-boundary";
import { ChatWorkspace } from "./chat-workspace";

async function getChatPageLanguage(): Promise<OrbitLanguage> {
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

export default async function AppChatPage({
  searchParams,
}: {
  searchParams?: Promise<AppChatSearchParams>;
} = {}) {
  const session = await auth();
  const actorId = session?.user?.id;
  if (!actorId) {
    redirect("/app/account/login?next=%2Fapp%2Fchat");
  }

  const resolvedSearchParams = await searchParams;
  const routeModel = await loadAppChatRouteViewModel(resolvedSearchParams, {
    actorId,
  });
  const language =
    routeModel.state === "success" ? await getChatPageLanguage() : "zh";

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      {routeModel.state === "success" ? (
        <div data-orbit-route="app-chat-route">
          <ChatWorkspace
            language={language}
            workspace={localizeOrbitTree(routeModel.workspace, language)}
          />
        </div>
      ) : (
        <ChatRouteStateBoundary routeState={routeModel.routeState} />
      )}
    </>
  );
}
