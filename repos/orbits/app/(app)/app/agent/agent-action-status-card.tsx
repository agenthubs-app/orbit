"use client";

import { useEffect, useMemo, useState } from "react";

type AgentActionStatusLanguage = "en" | "zh";

export interface AgentChatLinkedAction {
  actionId: string;
  operationIds: readonly string[];
  status: string;
  title: string;
}

interface AgentActionStatusCardProps {
  actionIds: readonly string[];
  language: AgentActionStatusLanguage;
  navigate: (href: string) => void;
  runId: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.flatMap((item) => {
        const text = readString(item);
        return text ? [text] : [];
      })
    : [];
}

/**
 * The run route is the source of truth for Chat action state. The response is
 * deliberately narrowed here so the UI never creates or persists a second
 * action model.
 */
export function parseAgentChatRunActions(
  value: unknown,
  requestedActionIds: readonly string[],
): AgentChatLinkedAction[] {
  if (!isRecord(value) || value.success !== true || !isRecord(value.data)) {
    return [];
  }

  const requested = new Set(requestedActionIds);
  const actions = Array.isArray(value.data.actions) ? value.data.actions : [];

  return actions.flatMap((candidate) => {
    if (!isRecord(candidate)) return [];
    const actionId = readString(candidate.actionId);
    if (!actionId || !requested.has(actionId)) return [];

    const operations = Array.isArray(candidate.operations)
      ? candidate.operations
      : [];
    const operationIds = operations.flatMap((operation) =>
      isRecord(operation) ? readStringArray([operation.operationId]) : [],
    );

    return [
      {
        actionId,
        operationIds,
        status: readString(candidate.status) ?? "unknown",
        title: readString(candidate.title) ?? actionId,
      },
    ];
  });
}

function parseTransitionedAction(value: unknown): AgentChatLinkedAction | null {
  if (
    !isRecord(value) ||
    value.success !== true ||
    !isRecord(value.data) ||
    !isRecord(value.data.entry)
  ) {
    return null;
  }

  const actionId = readString(value.data.entry.entryId);
  if (!actionId) return null;

  const operations = Array.isArray(value.data.entry.operations)
    ? value.data.entry.operations
    : [];

  return {
    actionId,
    operationIds: operations.flatMap((operation) =>
      isRecord(operation) ? readStringArray([operation.operationId]) : [],
    ),
    status: readString(value.data.entry.status) ?? "unknown",
    title: readString(value.data.entry.title) ?? actionId,
  };
}

export function agentChatActionStatusLabel(
  status: string,
  language: AgentActionStatusLanguage,
): string {
  const labels: Record<string, { en: string; zh: string }> = {
    approved: { en: "Approved", zh: "已确认" },
    awaiting_confirmation: { en: "Needs confirmation", zh: "等待确认" },
    canceled: { en: "Canceled", zh: "已取消" },
    completed: { en: "Completed", zh: "已完成" },
    deferred: { en: "Later", zh: "稍后处理" },
    executing: { en: "Running", zh: "执行中" },
    failed: { en: "Failed", zh: "执行失败" },
    partially_failed: { en: "Partially failed", zh: "部分失败" },
    rejected: { en: "Ignored", zh: "已忽略" },
    undone: { en: "Undone", zh: "已撤销" },
    unknown: { en: "Checking", zh: "正在同步" },
  };

  return (labels[status] ?? labels.unknown)[language];
}

function transitionError(value: unknown, language: AgentActionStatusLanguage) {
  if (
    isRecord(value) &&
    isRecord(value.error) &&
    typeof value.error.message === "string"
  ) {
    return value.error.message;
  }

  return language === "zh"
    ? "操作没有完成，请重试。"
    : "The action did not complete. Please try again.";
}

export function AgentActionStatusCard({
  actionIds,
  language,
  navigate,
  runId,
}: AgentActionStatusCardProps) {
  const stableActionIds = useMemo(
    () => Array.from(new Set(actionIds.filter(Boolean))),
    [actionIds],
  );
  const [actions, setActions] = useState<AgentChatLinkedAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      setLoading(true);
      try {
        const response = await fetch(
          `/api/ai/runs/${encodeURIComponent(runId)}`,
          { cache: "no-store" },
        );
        const body = (await response.json().catch(() => null)) as unknown;
        if (!cancelled) {
          setActions(parseAgentChatRunActions(body, stableActionIds));
          setError(
            response.ok
              ? null
              : language === "zh"
                ? "暂时无法同步操作状态。"
                : "Action status could not be synced.",
          );
        }
      } catch {
        if (!cancelled) {
          setError(
            language === "zh"
              ? "暂时无法同步操作状态。"
              : "Action status could not be synced.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void refresh();
    return () => {
      cancelled = true;
    };
  }, [language, runId, stableActionIds]);

  async function applyTransition(
    action: AgentChatLinkedAction,
    transition: "confirm" | "defer" | "reject",
  ) {
    setPendingActionId(action.actionId);
    setError(null);

    try {
      const response = await fetch(
        `/api/agent/ledger/${encodeURIComponent(action.actionId)}/transition`,
        {
          body: JSON.stringify({
            selectedOperationIds:
              transition === "confirm" ? action.operationIds : undefined,
            transition,
          }),
          headers: { "content-type": "application/json" },
          method: "POST",
        },
      );
      const body = (await response.json().catch(() => null)) as unknown;
      const updated = parseTransitionedAction(body);

      if (!response.ok || !updated) {
        setError(transitionError(body, language));
        return;
      }

      setActions((current) =>
        current.map((item) =>
          item.actionId === updated.actionId ? updated : item,
        ),
      );
    } catch {
      setError(
        language === "zh"
          ? "网络错误，操作未执行。"
          : "Network error. The action was not changed.",
      );
    } finally {
      setPendingActionId(null);
    }
  }

  const visibleActions =
    actions.length > 0
      ? actions
      : stableActionIds.map((actionId) => ({
          actionId,
          operationIds: [],
          status: "unknown",
          title: actionId,
        }));

  return (
    <section
      aria-label={language === "zh" ? "本次 Agent 操作" : "Agent actions from this turn"}
      data-agent-run-id={runId}
      style={{
        background: "var(--bg-soft)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-md)",
        display: "grid",
        gap: 10,
        marginTop: 10,
        padding: 12,
      }}
    >
      <div style={{ alignItems: "center", display: "flex", gap: 8, justifyContent: "space-between" }}>
        <strong style={{ fontSize: 13 }}>
          {language === "zh" ? "本次产生的操作" : "Actions from this turn"}
        </strong>
        <span style={{ color: "var(--text-3)", fontSize: 11 }}>
          {language === "zh" ? "与 Today 共用同一状态" : "Same state as Today"}
        </span>
      </div>

      {visibleActions.map((action) => {
        const editable =
          action.status === "awaiting_confirmation" ||
          action.status === "deferred";
        const pending = pendingActionId === action.actionId;

        return (
          <article
            data-agent-action-id={action.actionId}
            key={action.actionId}
            style={{ borderTop: "1px solid var(--border)", display: "grid", gap: 8, paddingTop: 10 }}
          >
            <div style={{ alignItems: "flex-start", display: "flex", gap: 10, justifyContent: "space-between" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{action.title}</div>
                <code style={{ color: "var(--text-3)", fontSize: 10, overflowWrap: "anywhere" }}>
                  {action.actionId}
                </code>
              </div>
              <span className="chip" data-agent-action-status={action.status} style={{ flexShrink: 0, fontSize: 11 }}>
                {loading && action.status === "unknown"
                  ? language === "zh"
                    ? "正在同步"
                    : "Syncing"
                  : agentChatActionStatusLabel(action.status, language)}
              </span>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {action.status !== "deferred" ? (
                <button
                  className="btn btn-quiet"
                  onClick={() =>
                    navigate(`/today?entry=${encodeURIComponent(action.actionId)}`)
                  }
                  type="button"
                >
                  {language === "zh" ? "在 Today 查看" : "Open in Today"}
                </button>
              ) : null}
              <button
                className="btn btn-quiet"
                onClick={() =>
                  navigate(
                    `/contacts/all-actions?entry=${encodeURIComponent(action.actionId)}`,
                  )
                }
                type="button"
              >
                {language === "zh" ? "全部操作" : "All actions"}
              </button>
              {editable && action.operationIds.length > 0 ? (
                <button
                  className="btn btn-primary"
                  disabled={pending}
                  onClick={() => void applyTransition(action, "confirm")}
                  type="button"
                >
                  {language === "zh" ? "确认执行" : "Confirm"}
                </button>
              ) : null}
              {editable ? (
                <>
                  <button
                    className="btn btn-quiet"
                    disabled={pending}
                    onClick={() => void applyTransition(action, "defer")}
                    type="button"
                  >
                    {language === "zh" ? "稍后处理" : "Later"}
                  </button>
                  <button
                    className="btn btn-quiet"
                    disabled={pending}
                    onClick={() => void applyTransition(action, "reject")}
                    type="button"
                  >
                    {language === "zh" ? "忽略" : "Ignore"}
                  </button>
                </>
              ) : null}
            </div>
          </article>
        );
      })}

      {error ? (
        <p role="alert" style={{ color: "var(--danger, #b4413c)", fontSize: 12, margin: 0 }}>
          {error}
        </p>
      ) : null}
    </section>
  );
}
