export type AgentSignalStatus =
  | "new"
  | "acknowledged"
  | "snoozed"
  | "dismissed"
  | "resolved";

export interface AgentTodaySignalView {
  signalId: string;
  type: "followup_due" | "event_upcoming" | "relationship_stale";
  title: string;
  summary: string;
  reason: string;
  severity: "critical" | "high" | "medium" | "low";
  confidence: number;
  status: AgentSignalStatus;
  lastObservedAt: string;
  resolvedAt?: string;
  changes: readonly { field: string; before?: string; after?: string }[];
  sources: readonly {
    sourceLabel: string;
    capturedAt: string;
  }[];
  actions: readonly {
    actionId: "open" | "ask_agent" | "mark_done";
    label: string;
    href: string;
    prompt?: string;
  }[];
}

export interface AgentNextActionView {
  href?: string;
  kind: "navigate" | "ask";
  label: string;
  prompt?: string;
}

export interface AgentNextActionRowView {
  actions: readonly AgentNextActionView[];
  completed: boolean;
  context: string;
  index: number;
  signal: AgentTodaySignalView;
  title: string;
}

export function agentSignalsToNextActionRows(
  signals: readonly AgentTodaySignalView[],
  language: "en" | "zh",
): readonly AgentNextActionRowView[] {
  return signals
    .filter(
      (signal) =>
        signal.status === "new" ||
        signal.status === "acknowledged" ||
        signal.status === "resolved",
    )
    .slice(0, 4)
    .map((signal, itemIndex) => {
    const completed = signal.status === "resolved";
    const actions = completed
      ? []
      : signal.actions
          .filter(
            (action) =>
              action.actionId === "open" ||
              (action.actionId === "ask_agent" && Boolean(action.prompt)),
          )
          .slice(0, 2)
          .map((action): AgentNextActionView =>
            action.actionId === "ask_agent"
              ? {
                  kind: "ask",
                  label: language === "zh" ? "交给 iOrbit" : "Ask iOrbit",
                  prompt: action.prompt,
                }
              : {
                  href: action.href,
                  kind: "navigate",
                  label: action.label,
                },
          );

      return {
        actions,
        completed,
        context: completed
          ? language === "zh"
            ? "已完成"
            : "Completed"
          : signal.reason,
        index: itemIndex + 1,
        signal,
        title: signal.title,
      };
    });
}
