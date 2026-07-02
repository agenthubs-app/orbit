/**
 * Chat 页 route adapter。
 *
 * route 只负责挂载样式/runtime，并把 live-capable chat payload 转给真实 Orbit 聊天入口。
 */
import { getOrbitServerLanguage, localizeOrbitTree } from "../orbit-language-server";
import { OrbitReferenceStyles } from "../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../orbit-visual-freeze-runtime";
import { StateView } from "../../../../shared/ui/state-view";
import { OrbitRealAgent } from "../agent/orbit-real-agent";
import {
  loadAppChatRouteViewModel,
  type AppChatRouteStateViewModel,
  type AppChatSearchParams,
} from "./compose-app-chat-from-previously-approved-mock-first-capabilities/chat-route-view-model";
import { chatRouteToOrbitAgentViewModel } from "./compose-app-chat-from-previously-approved-mock-first-capabilities/chat-view-model-adapter";

function ChatRouteStateBoundary({
  routeState,
}: {
  routeState: AppChatRouteStateViewModel;
}) {
  return (
    <div data-orbit-route="app-chat-route-state">
      <StateView
        description={routeState.copy.description}
        emptyState={routeState.copy.emptyState}
        evidence={Array.from(routeState.evidenceIds)}
        eyebrow="Chat"
        guardrail={routeState.copy.guardrail}
        nextStep={routeState.copy.nextStep}
        purpose={routeState.copy.purpose}
        recoveryActions={[
          {
            id: "chat-recovery-reload",
            label: "Reload chat",
            recoveryCopy: routeState.copy.nextStep,
            href: "/app/chat",
          },
        ]}
        title={routeState.copy.title}
      />
    </div>
  );
}

export default async function AppChatPage({
  searchParams,
}: {
  searchParams?: Promise<AppChatSearchParams>;
} = {}) {
  const routeModel = await loadAppChatRouteViewModel(await searchParams);
  const language =
    routeModel.state === "success" ? await getOrbitServerLanguage() : null;

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      {routeModel.state === "success" ? (
        <div data-orbit-route="app-chat-route">
          <OrbitRealAgent
            viewModel={localizeOrbitTree(
              chatRouteToOrbitAgentViewModel(routeModel),
              language ?? "zh",
            )}
          />
        </div>
      ) : (
        <ChatRouteStateBoundary routeState={routeModel.routeState} />
      )}
    </>
  );
}
