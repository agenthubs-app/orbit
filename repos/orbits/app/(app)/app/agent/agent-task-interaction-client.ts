"use client";

import { useEffect, useRef, useState } from "react";
import { createTasksClient, TasksClientError } from "../tasks/tasks-client";
import type { AgentTaskInteractionView } from "./agent-task-interaction-view-model";

/** One controller per conversation page, shared by its desktop and mobile trees. */
export function useAgentTaskSuggestions(
  onResolved: (original: AgentTaskInteractionView, next: AgentTaskInteractionView) => void,
) {
  const [client] = useState(() => createTasksClient());
  const [operations, setOperations] = useState<Record<string, { busy: boolean; error?: unknown }>>({});
  const pending = useRef(new Set<string>());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  async function resolve(interaction: AgentTaskInteractionView, action: "accept" | "dismiss") {
    const id = interaction.suggestionId;
    if (interaction.state !== "suggested" || !id || pending.current.has(id)) return;
    pending.current.add(id);
    setOperations((current) => ({ ...current, [id]: { busy: true } }));
    try {
      const task = await client.resolveSuggestion(id, action);
      if (!mounted.current) return;
      if (action === "accept" && !task) throw new TasksClientError("INVALID_RESPONSE", "Missing accepted task");
      onResolved(interaction, action === "accept" && task
        ? { state: "created", title: task.title, category: task.category, taskId: task.id, ...(task.dueAt ? { dueAt: task.dueAt } : {}) }
        : { ...interaction, state: "dismissed" });
      setOperations((current) => ({ ...current, [id]: { busy: false } }));
    } catch (error) {
      if (mounted.current) setOperations((current) => ({ ...current, [id]: { busy: false, error } }));
    } finally {
      pending.current.delete(id);
    }
  }

  return {
    forInteraction: (interaction: AgentTaskInteractionView) => ({
      busy: operations[interaction.suggestionId ?? ""]?.busy ?? false,
      error: operations[interaction.suggestionId ?? ""]?.error,
      onResolve: (action: "accept" | "dismiss") => resolve(interaction, action),
    }),
  };
}
