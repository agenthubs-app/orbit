import { StateView } from "../../../../shared/ui/state-view";
import { AccountTopNav } from "../orbit-account-shell";
import type { AppChatRouteStateViewModel } from "./compose-app-chat-from-previously-approved-mock-first-capabilities/chat-route-view-model";

export function ChatRouteStateBoundary({
  routeState,
}: {
  routeState: AppChatRouteStateViewModel;
}) {
  return (
    <div
      data-orbit-real-page="chat"
      data-orbit-route="app-chat-route-state"
    >
      <AccountTopNav active="agent" />
      <main
        className="orbit-page"
        style={{
          background: "var(--bg)",
          minHeight: "calc(100dvh - 64px)",
          padding: 24,
        }}
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
    </div>
  );
}
