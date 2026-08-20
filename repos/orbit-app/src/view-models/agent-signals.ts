export type AgentSignalStatus =
  | "new"
  | "acknowledged"
  | "snoozed"
  | "dismissed"
  | "resolved";

export interface AgentSignalPayload {
  actions: readonly {
    actionId: "open" | "ask_agent" | "mark_done";
    href: string;
    label: string;
    prompt?: string;
  }[];
  reason: string;
  signalId: string;
  status: AgentSignalStatus;
  targetId: string;
  targetType: "contact" | "event" | "task";
  title: string;
  type: "event_upcoming" | "followup_due" | "relationship_stale";
}

export interface AgentSignalActionView {
  kind: "ask" | "navigate";
  label: string;
  prompt?: string;
  route?: string;
}

export interface AgentSignalNextActionView {
  actions: readonly AgentSignalActionView[];
  completed: boolean;
  context: string;
  id: string;
  index: number;
  title: string;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(record: UnknownRecord, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value.trim() : "";
}

function nativeTargetRoute(
  targetType: AgentSignalPayload["targetType"],
  targetId: string
): string {
  if (targetType === "event") {
    return `/events/${encodeURIComponent(targetId)}`;
  }
  if (targetType === "contact") {
    return `/contacts/${encodeURIComponent(targetId)}`;
  }
  return "/followups";
}

function signalActions(
  record: UnknownRecord,
  targetType: AgentSignalPayload["targetType"],
  targetId: string
): readonly AgentSignalActionView[] {
  const actions = Array.isArray(record.actions) ? record.actions : [];

  return actions
    .filter(isRecord)
    .flatMap((action): AgentSignalActionView[] => {
      const actionId = stringField(action, "actionId");
      if (actionId === "open") {
        return [
          {
            kind: "navigate",
            label: stringField(action, "label") || "查看",
            route: nativeTargetRoute(targetType, targetId)
          }
        ];
      }
      const prompt = stringField(action, "prompt");
      if (actionId === "ask_agent" && prompt) {
        return [
          {
            kind: "ask",
            label: "交给 iOrbit",
            prompt
          }
        ];
      }
      return [];
    })
    .slice(0, 2);
}

export function agentSignalsToNextActions(
  payload: unknown
): readonly AgentSignalNextActionView[] {
  if (!isRecord(payload) || !Array.isArray(payload.signals)) {
    return [];
  }

  return payload.signals
    .filter(isRecord)
    .flatMap((record): Omit<AgentSignalNextActionView, "index">[] => {
      const id = stringField(record, "signalId");
      const title = stringField(record, "title");
      const status = stringField(record, "status") as AgentSignalStatus;
      const targetId = stringField(record, "targetId");
      const targetType = stringField(
        record,
        "targetType"
      ) as AgentSignalPayload["targetType"];
      if (
        !id ||
        !title ||
        !targetId ||
        !["contact", "event", "task"].includes(targetType) ||
        !["new", "acknowledged", "resolved"].includes(status)
      ) {
        return [];
      }
      const completed = status === "resolved";
      return [
        {
          actions: completed
            ? []
            : signalActions(record, targetType, targetId),
          completed,
          context: completed
            ? "已完成"
            : stringField(record, "reason") || "建议现在处理。",
          id,
          title
        }
      ];
    })
    .slice(0, 4)
    .map((row, index) => ({ ...row, index: index + 1 }));
}
