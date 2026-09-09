export interface AgentTaskInteractionView {
  // dismissed/unavailable are page states, not additions to the AI API contract.
  state: "created" | "suggested" | "failed" | "dismissed" | "unavailable";
  title: string;
  category: string;
  reason?: string;
  dueAt?: string;
  taskId?: string;
  suggestionId?: string;
}

/** Decode both new replies and persisted message metadata at the page boundary. */
export function parseAgentTaskInteraction(value: unknown): AgentTaskInteractionView | undefined {
  if (value == null) return undefined;
  const record = typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
  const string = (key: string) => typeof record[key] === "string" ? record[key].trim() : "";
  const title = string("title");
  const category = string("category") || "other";
  const state = record.state;
  const taskId = string("taskId");
  const suggestionId = string("suggestionId");
  if (!title || typeof state !== "string" || !["created", "suggested", "failed", "dismissed"].includes(state) ||
    (state === "created" && !taskId) ||
    ((state === "suggested" || state === "dismissed") && !suggestionId)) {
    return { state: "unavailable", title, category };
  }
  const dueAt = string("dueAt");
  const reason = string("reason");
  return {
    state: state as AgentTaskInteractionView["state"], title, category,
    ...(reason ? { reason } : {}),
    ...(dueAt && Number.isFinite(Date.parse(dueAt)) ? { dueAt } : {}),
    ...(state === "created" ? { taskId } : {}),
    ...(state === "suggested" || state === "dismissed" ? { suggestionId } : {}),
  };
}
