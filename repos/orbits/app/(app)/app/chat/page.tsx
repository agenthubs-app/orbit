/**
 * Chat 页 route adapter。
 *
 * route 只负责加载 live-capable chat view model、挂载独立会话工作区和失败边界。
 * Agent 保持自己的交互壳，两条路由共享数据服务但不再混用页面组件。
 */
import { getOrbitServerLanguage, localizeOrbitTree } from "../orbit-language-server";
import type { OrbitLanguage } from "../orbit-language-core";
import { OrbitReferenceStyles } from "../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../orbit-visual-freeze-runtime";
import { StateView } from "../../../../shared/ui/state-view";
import {
  loadAppChatRouteViewModel,
  type AppChatRouteStateViewModel,
  type AppChatSearchParams,
} from "./compose-app-chat-from-previously-approved-mock-first-capabilities/chat-route-view-model";
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

function ChatRouteStateBoundary({
  routeState,
}: {
  routeState: AppChatRouteStateViewModel;
}) {
  return (
    <main
      className="orbit-page"
      data-orbit-route="app-chat-route-state"
      style={{ background: "var(--bg)", minHeight: "100dvh", padding: 24 }}
    >
      <StateView
        description={routeState.copy.description}
        emptyState={routeState.copy.emptyState}
        evidence={Array.from(routeState.evidenceIds)}
        eyebrow="Orbit AI"
        guardrail={routeState.copy.guardrail}
        nextStep={routeState.copy.nextStep}
        purpose={routeState.copy.purpose}
        recoveryActions={[
          {
            href: "/app/chat",
            id: "chat-recovery-reload",
            label: "Reload Orbit AI",
            recoveryCopy: routeState.copy.nextStep,
          },
          {
            href: "/app/agent",
            id: "chat-recovery-agent",
            label: "Open Orbit AI agent",
            recoveryCopy:
              "Use the Orbit AI agent to explore contacts, events, and next steps directly.",
          },
        ]}
        title={routeState.copy.title}
      />
    </main>
  );
}

export default async function AppChatPage({
  searchParams,
}: {
  searchParams?: Promise<AppChatSearchParams>;
} = {}) {
  const resolvedSearchParams = await searchParams;
  const routeModel = await loadAppChatRouteViewModel(resolvedSearchParams);
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
