/* eslint-disable no-unused-vars -- The base ESLint config lacks JSX variable usage tracking. */
import { StateView } from "../../../../shared/ui/state-view";
import { AppAgentCommandCenter } from "./compose-app-agent-from-previously-approved-mock-first-capabilities/agent-command-center";

export const metadata = {
  title: "Agent | Orbit",
  description:
    "Compose source-backed agent actions, autonomy settings, confirmations, send checks, and notification queues in Orbit.",
};

type AppAgentSearchParams = Record<string, string | string[] | undefined>;

interface AgentPageProps {
  searchParams?: AppAgentSearchParams | Promise<AppAgentSearchParams>;
}

function isPromiseLike<TValue>(
  value: TValue | Promise<TValue> | undefined,
): value is Promise<TValue> {
  return Boolean(value && typeof (value as Promise<TValue>).then === "function");
}

function LegacyAgentStateBoundary() {
  return (
    <StateView
      description="Agent will list suggested actions and let you approve or reject them before anything external happens."
      emptyState="No suggested action, approval record, sandbox result, or external effect exists."
      evidence={[
        "No agent action is queued.",
        "No external action sandbox is connected.",
      ]}
      eyebrow="Agent"
      guardrail="Agent can show the approval lane, but it cannot execute without evidence."
      nextStep="Keep automation off until each action has evidence and approval."
      purpose="Review proposed agent actions before external effects."
      title="Agent"
    />
  );
}

function renderAgentPage(searchParams: AppAgentSearchParams | undefined) {
  return <AppAgentCommandCenter searchParams={searchParams} />;
}

export default function AgentPage({ searchParams }: AgentPageProps = {}) {
  if (searchParams === undefined) {
    return <LegacyAgentStateBoundary />;
  }

  if (isPromiseLike(searchParams)) {
    return searchParams.then((resolvedSearchParams) =>
      renderAgentPage(resolvedSearchParams),
    );
  }

  return renderAgentPage(searchParams);
}
