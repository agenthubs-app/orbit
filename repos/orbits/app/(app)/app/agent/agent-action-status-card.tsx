"use client";

import { useEffect, useMemo, useState } from "react";

type AgentActionStatusLanguage = "en" | "zh";

export interface AgentChatLinkedAction {
  actionId: string;
  operationIds: readonly string[];
  preview: string;
  riskLevel: string;
  status: string;
  title: string;
}

interface AgentChatRunStepView {
  stepId: string;
  name: string;
  sequence: number;
  status: string;
  error?: string;
}

interface AgentChatRunView {
  status: string;
  progress: {
    activeStepId?: string;
    canCancel: boolean;
    canRetry: boolean;
    completedSteps: number;
    failedSteps: number;
    percent: number;
    totalSteps: number;
  };
  steps: readonly AgentChatRunStepView[];
}

interface AgentActionStatusCardProps {
  actionIds: readonly string[];
  language: AgentActionStatusLanguage;
  navigate: (href: string) => void;
  onRetryRequest?: () => Promise<void>;
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
        preview: readString(candidate.preview) ?? "",
        riskLevel: readString(candidate.riskLevel) ?? "unknown",
        status: readString(candidate.status) ?? "unknown",
        title: readString(candidate.title) ?? actionId,
      },
    ];
  });
}

export function parseAgentChatRunView(value: unknown): AgentChatRunView | null {
  if (
    !isRecord(value) ||
    value.success !== true ||
    !isRecord(value.data) ||
    !isRecord(value.data.run) ||
    !isRecord(value.data.progress)
  ) {
    return null;
  }
  const status = readString(value.data.run.status);
  if (!status) return null;
  const progress = value.data.progress;
  const number = (candidate: unknown): number =>
    typeof candidate === "number" && Number.isFinite(candidate)
      ? candidate
      : 0;
  const steps = Array.isArray(value.data.steps)
    ? value.data.steps.flatMap((candidate) => {
        if (!isRecord(candidate)) return [];
        const stepId = readString(candidate.stepId);
        const name = readString(candidate.name);
        const stepStatus = readString(candidate.status);
        if (!stepId || !name || !stepStatus) return [];
        return [
          {
            error: isRecord(candidate.error)
              ? readString(candidate.error.message) ?? undefined
              : undefined,
            name,
            sequence:
              typeof candidate.sequence === "number"
                ? candidate.sequence
                : Number.MAX_SAFE_INTEGER,
            status: stepStatus,
            stepId,
          },
        ];
      })
    : [];
  return {
    progress: {
      activeStepId: readString(progress.activeStepId) ?? undefined,
      canCancel: progress.canCancel === true,
      canRetry: progress.canRetry === true,
      completedSteps: number(progress.completedSteps),
      failedSteps: number(progress.failedSteps),
      percent: Math.max(0, Math.min(100, number(progress.percent))),
      totalSteps: number(progress.totalSteps),
    },
    status,
    steps: steps.sort(
      (left, right) =>
        left.sequence - right.sequence ||
        left.stepId.localeCompare(right.stepId),
    ),
  };
}

function runStepLabel(name: string, language: AgentActionStatusLanguage) {
  const labels: Record<string, { en: string; zh: string }> = {
    local_boundary: { en: "Safety check", zh: "安全边界检查" },
    planner: { en: "Plan", zh: "理解与规划" },
    replan: { en: "Replan from evidence", zh: "根据证据继续规划" },
    tool_mapping: { en: "Choose tools", zh: "选择可信工具" },
    artifact_generation: { en: "Read context", zh: "读取关系上下文" },
    artifact_generation_replan: {
      en: "Read additional context",
      zh: "补充读取上下文",
    },
    synthesis: { en: "Synthesize", zh: "综合证据" },
    final_response: { en: "Prepare response", zh: "生成答复" },
    validate_natural_language_action_proposals: {
      en: "Validate actions",
      zh: "校验操作方案",
    },
  };
  return (labels[name] ?? { en: name, zh: name })[language];
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
    preview: readString(value.data.entry.preview) ?? "",
    riskLevel: readString(value.data.entry.riskLevel) ?? "unknown",
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

export function agentChatActionCanConfirm(
  action: AgentChatLinkedAction,
): boolean {
  const editable =
    action.status === "awaiting_confirmation" || action.status === "deferred";

  return (
    editable &&
    action.operationIds.length > 0 &&
    action.riskLevel !== "external"
  );
}

function actionRiskLabel(
  riskLevel: string,
  language: AgentActionStatusLanguage,
): string {
  const labels: Record<string, { en: string; zh: string }> = {
    draft: { en: "Save draft", zh: "保存草稿" },
    external: { en: "External action", zh: "外部操作" },
    read: { en: "Read only", zh: "只读" },
    write: { en: "Writes to Orbit", zh: "写入 Orbit" },
  };
  return (labels[riskLevel] ?? {
    en: "Review required",
    zh: "需要复核",
  })[language];
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
  onRetryRequest,
  runId,
}: AgentActionStatusCardProps) {
  const stableActionIds = useMemo(
    () => Array.from(new Set(actionIds.filter(Boolean))),
    [actionIds],
  );
  const [actions, setActions] = useState<AgentChatLinkedAction[]>([]);
  const [runView, setRunView] = useState<AgentChatRunView | null>(null);
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
          setRunView(parseAgentChatRunView(body));
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

  const hasPendingExecution = actions.some(
    (action) =>
      action.status === "approved" || action.status === "executing",
  );
  const hasPendingRun =
    runView?.status === "queued" ||
    runView?.status === "running" ||
    runView?.status === "waiting_for_input" ||
    runView?.status === "waiting_for_confirmation";

  useEffect(() => {
    if (!hasPendingExecution && !hasPendingRun) return;
    let cancelled = false;

    async function refreshExecutionStatus() {
      try {
        const response = await fetch(
          `/api/ai/runs/${encodeURIComponent(runId)}`,
          { cache: "no-store" },
        );
        const body = (await response.json().catch(() => null)) as unknown;
        if (!cancelled && response.ok) {
          const updated = parseAgentChatRunActions(body, stableActionIds);
          if (updated.length > 0) {
            setActions(updated);
          }
          setRunView(parseAgentChatRunView(body));
        }
      } catch {
        // Keep the last confirmed state visible. The initial load and explicit
        // transition paths own user-facing errors; transient polling does not.
      }
    }

    void refreshExecutionStatus();
    const interval = window.setInterval(
      () => void refreshExecutionStatus(),
      1_000,
    );
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [hasPendingExecution, hasPendingRun, runId, stableActionIds]);

  async function cancelRun() {
    setPendingActionId("run:cancel");
    setError(null);
    try {
      const response = await fetch(
        `/api/ai/runs/${encodeURIComponent(runId)}/transition`,
        {
          body: JSON.stringify({ action: "cancel" }),
          headers: { "content-type": "application/json" },
          method: "POST",
        },
      );
      const body = (await response.json().catch(() => null)) as unknown;
      const updated = parseAgentChatRunView(body);
      if (!response.ok || !updated) {
        setError(transitionError(body, language));
        return;
      }
      setRunView(updated);
      setActions(parseAgentChatRunActions(body, stableActionIds));
    } catch {
      setError(
        language === "zh"
          ? "网络错误，Run 状态没有改变。"
          : "Network error. The run was not changed.",
      );
    } finally {
      setPendingActionId(null);
    }
  }

  async function retryRequest() {
    if (!onRetryRequest) return;
    setPendingActionId("run:retry-request");
    setError(null);
    try {
      await onRetryRequest();
    } catch {
      setError(
        language === "zh"
          ? "请求没有重新提交，请再试一次。"
          : "The request was not retried. Please try again.",
      );
    } finally {
      setPendingActionId(null);
    }
  }

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
          preview: "",
          riskLevel: "unknown",
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
          {language === "zh" ? "本次 Agent 过程" : "Agent run"}
        </strong>
        <span style={{ color: "var(--text-3)", fontSize: 11 }}>
          {runView
            ? `${runView.progress.completedSteps}/${runView.progress.totalSteps}`
            : language === "zh"
              ? "正在同步"
              : "Syncing"}
        </span>
      </div>

      {runView ? (
        <div
          data-agent-run-status={runView.status}
          style={{ display: "grid", gap: 8 }}
        >
          <div
            aria-label={
              language === "zh"
                ? `Agent 进度 ${runView.progress.percent}%`
                : `Agent progress ${runView.progress.percent}%`
            }
            style={{
              background: "var(--surface-3)",
              borderRadius: "var(--r-pill)",
              height: 6,
              overflow: "hidden",
            }}
          >
            <span
              style={{
                background:
                  runView.progress.failedSteps > 0
                    ? "var(--danger, #b4413c)"
                    : "var(--accent)",
                display: "block",
                height: "100%",
                transition: "width .2s ease",
                width: `${runView.progress.percent}%`,
              }}
            />
          </div>
          <div style={{ display: "grid", gap: 5 }}>
            {runView.steps.map((step) => (
              <div
                data-agent-run-step={step.stepId}
                key={step.stepId}
                style={{
                  alignItems: "center",
                  color:
                    step.status === "failed"
                      ? "var(--danger, #b4413c)"
                      : "var(--text-2)",
                  display: "flex",
                  fontSize: 11,
                  gap: 7,
                }}
              >
                <span aria-hidden>
                  {step.status === "completed"
                    ? "✓"
                    : step.status === "skipped"
                      ? "–"
                      : step.status === "failed"
                        ? "!"
                        : "•"}
                </span>
                <span>{runStepLabel(step.name, language)}</span>
                {step.error ? <span>· {step.error}</span> : null}
              </div>
            ))}
          </div>
          {runView.progress.canCancel || runView.progress.canRetry ? (
            <div style={{ display: "flex", gap: 6 }}>
              {runView.progress.canCancel ? (
                <button
                  className="btn btn-quiet"
                  data-agent-run-cancel
                  disabled={pendingActionId === "run:cancel"}
                  onClick={() => void cancelRun()}
                  type="button"
                >
                  {language === "zh" ? "取消 Run" : "Cancel run"}
                </button>
              ) : null}
              {runView.progress.canRetry && onRetryRequest ? (
                <button
                  className="btn btn-quiet"
                  data-agent-run-retry-request
                  disabled={pendingActionId === "run:retry-request"}
                  onClick={() => void retryRequest()}
                  type="button"
                >
                  {language === "zh" ? "重新提交请求" : "Retry request"}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {visibleActions.map((action) => {
        const editable =
          action.status === "awaiting_confirmation" ||
          action.status === "deferred";
        const confirmableInChat = agentChatActionCanConfirm(action);
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
                <div style={{ color: "var(--text-3)", fontSize: 11, marginTop: 3 }}>
                  {actionRiskLabel(action.riskLevel, language)}
                </div>
              </div>
              <span className="chip" data-agent-action-status={action.status} style={{ flexShrink: 0, fontSize: 11 }}>
                {loading && action.status === "unknown"
                  ? language === "zh"
                    ? "正在同步"
                    : "Syncing"
                  : agentChatActionStatusLabel(action.status, language)}
              </span>
            </div>

            {action.preview ? (
              <p
                style={{
                  color: "var(--text-2)",
                  fontSize: 12,
                  lineHeight: 1.55,
                  margin: 0,
                  overflowWrap: "anywhere",
                }}
              >
                {action.preview}
              </p>
            ) : null}

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
              {confirmableInChat ? (
                <button
                  className="btn btn-primary"
                  disabled={pending}
                  onClick={() => void applyTransition(action, "confirm")}
                  type="button"
                >
                  {language === "zh" ? "确认执行" : "Confirm"}
                </button>
              ) : null}
              {editable && action.riskLevel === "external" ? (
                <span style={{ color: "var(--text-3)", fontSize: 11 }}>
                  {language === "zh"
                    ? "外部操作请在 Today 查看详情后确认"
                    : "Review external action details in Today before confirming"}
                </span>
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
