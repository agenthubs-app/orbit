/**
 * Agent 页 route adapter。
 *
 * route 只负责挂载样式/runtime，并把 live-capable Orbit AI 聊天入口挂到 `/app/agent`。
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
} from "../chat/compose-app-chat-from-previously-approved-mock-first-capabilities/chat-route-view-model";
import { chatRouteToOrbitAgentViewModel } from "../chat/compose-app-chat-from-previously-approved-mock-first-capabilities/chat-view-model-adapter";
import { OrbitRealAgent } from "./orbit-real-agent";

export type AppAgentSearchParams = AppChatSearchParams;

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

function AgentRouteStateBoundary({
  routeState,
}: {
  routeState: AppChatRouteStateViewModel;
}) {
  return (
    <main
      className="orbit-page"
      data-orbit-route="app-agent-route-state"
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
            href: "/app/agent",
            id: "agent-recovery-reload",
            label: "Reload Orbit AI",
            recoveryCopy: routeState.copy.nextStep,
          },
          {
            href: "/app/chat",
            id: "agent-recovery-chat",
            label: "Open chat workspace",
            recoveryCopy:
              "Use the Chat workspace to review conversation records and privacy controls directly.",
          },
        ]}
        title={routeState.copy.title}
      />
    </main>
  );
}

export default async function AppAgentPage({
  searchParams,
}: {
  searchParams?: Promise<AppAgentSearchParams>;
} = {}) {
  const routeModel = await loadAppChatRouteViewModel(await searchParams);
  const language =
    routeModel.state === "success" ? await getAgentPageLanguage() : "zh";

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      {routeModel.state === "success" ? (
        <div data-orbit-route="app-agent-route">
          <OrbitRealAgent
            viewModel={localizeOrbitTree(
              chatRouteToOrbitAgentViewModel(routeModel),
              language,
            )}
          />
        </div>
      ) : (
        <AgentRouteStateBoundary routeState={routeModel.routeState} />
      )}
    </>
  );
}
