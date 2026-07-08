/**
 * Chat 页 route adapter。
 *
 * route 只负责挂载样式/runtime。统一后的视觉里 /app/chat 与 /app/agent 共用
 * OrbitRealAgent；数据仍走 live 的 chat route view model。
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
import { chatRouteToOrbitAgentViewModel } from "./compose-app-chat-from-previously-approved-mock-first-capabilities/chat-view-model-adapter";
import { OrbitRealAgent } from "../agent/orbit-real-agent";

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
          <OrbitRealAgent
            viewModel={localizeOrbitTree(
              chatRouteToOrbitAgentViewModel(routeModel),
              language,
            )}
          />
        </div>
      ) : (
        <ChatRouteStateBoundary routeState={routeModel.routeState} />
      )}
    </>
  );
}
