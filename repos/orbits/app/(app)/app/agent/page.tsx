/* eslint-disable no-unused-vars -- The base ESLint config lacks JSX variable usage tracking. */
import { StateView } from "../../../../shared/ui/state-view";
import { bilingualText } from "../../../../shared/ui/bilingual";
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
      description={bilingualText(
        "Agent 会列出建议动作，并在任何外部影响发生前让你批准或拒绝。",
        "Agent will list suggested actions and let you approve or reject them before anything external happens.",
      )}
      emptyState={bilingualText(
        "还没有建议动作、审批记录、沙盒结果或外部影响。",
        "No suggested action, approval record, sandbox result, or external effect exists.",
      )}
      evidence={[
        bilingualText("还没有 Agent 动作排队。", "No agent action is queued."),
        bilingualText(
          "还没有连接外部动作沙盒。",
          "No external action sandbox is connected.",
        ),
      ]}
      eyebrow={bilingualText("下一步", "Agent")}
      guardrail={bilingualText(
        "Agent 可以显示审批通道，但没有证据时不能执行。",
        "Agent can show the approval lane, but it cannot execute without evidence.",
      )}
      nextStep={bilingualText(
        "每个动作都有证据和批准之前，保持自动化关闭。",
        "Keep automation off until each action has evidence and approval.",
      )}
      purpose={bilingualText(
        "在产生外部影响前复核建议动作。",
        "Review proposed agent actions before external effects.",
      )}
      title={bilingualText("下一步", "Agent")}
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
