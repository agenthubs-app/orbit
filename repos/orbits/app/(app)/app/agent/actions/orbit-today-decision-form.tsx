"use client";

import { useState } from "react";

import { useOrbitLanguage } from "../../orbit-language-context";
import type {
  AgentLedgerEntryStatus,
  AgentLedgerOperation,
} from "../../../../../features/agent/ledger/contract";
import {
  agentLedgerErrorMessage,
  agentLedgerReviewTransitionsForStatus,
} from "../../../../../features/agent/ledger/presentation";

type EditableOperationValues = {
  text?: string;
  title?: string;
  dueAt?: string;
};

type EditableDraftUpdate = {
  operationId: string;
  field: "draftText" | "goal" | "title" | "dueAt";
  draftText: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isLedgerSuccess(body: unknown): boolean {
  return isRecord(body) && body.success === true;
}

function toLocalDateTimeValue(value: unknown): string {
  if (typeof value !== "string") return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

function editableOperationValues(
  operation: AgentLedgerOperation,
): EditableOperationValues | null {
  switch (operation.operationType) {
    case "save_message_draft":
      return {
        text:
          typeof operation.payload?.draftText === "string"
            ? operation.payload.draftText
            : operation.draftPreview ?? "",
      };
    case "save_event_goal":
      return {
        text:
          typeof operation.payload?.goal === "string"
            ? operation.payload.goal
            : "",
      };
    case "create_followup_task":
    case "create_followup_reminder":
      return {
        title:
          typeof operation.payload?.title === "string"
            ? operation.payload.title
            : "",
        dueAt: toLocalDateTimeValue(operation.payload?.dueAt),
      };
    default:
      return null;
  }
}

/**
 * 决策写入口。勾选子操作后确认，或整条稍后处理。
 * 这里没有、也不允许有任何"发送"路径：消息类子操作只落草稿。
 */
export function OrbitTodayDecisionForm({
  entryId,
  operations,
  status,
}: {
  entryId: string;
  operations: readonly AgentLedgerOperation[];
  status: AgentLedgerEntryStatus;
}) {
  const { language, t } = useOrbitLanguage();
  const reviewTransitions = agentLedgerReviewTransitionsForStatus(status);
  const [selected, setSelected] = useState<readonly string[]>(
    operations
      .filter((operation) => operation.selectedByDefault)
      .map((operation) => operation.operationId),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editableValues, setEditableValues] = useState<
    Readonly<Record<string, EditableOperationValues>>
  >(() =>
    Object.fromEntries(
      operations.flatMap((operation) => {
        const values = editableOperationValues(operation);
        return values ? [[operation.operationId, values]] : [];
      }),
    ),
  );

  function editableDraftUpdates(): readonly EditableDraftUpdate[] {
    const updates: EditableDraftUpdate[] = [];
    for (const operation of operations) {
      if (!selected.includes(operation.operationId)) continue;
      const values = editableValues[operation.operationId];
      if (!values) continue;
      if (
        operation.operationType === "save_event_goal" ||
        operation.operationType === "save_message_draft"
      ) {
        const value = values.text?.trim() ?? "";
        if (!value) {
          throw new Error(
            operation.operationType === "save_event_goal"
              ? t({ ja: "このイベントの目標を入力してください。", zh: "请先填写本场活动目标。", en: "Enter a goal for this event first." })
              : t({ ja: "メッセージの下書きが空です。", zh: "消息草稿不能为空。", en: "The message draft can't be empty." }),
          );
        }
        updates.push({
          operationId: operation.operationId,
          field:
            operation.operationType === "save_event_goal"
              ? "goal"
              : "draftText",
          draftText: value,
        });
      }
      if (
        operation.operationType === "create_followup_task" ||
        operation.operationType === "create_followup_reminder"
      ) {
        const title = values.title?.trim() ?? "";
        if (!title) throw new Error(t({ ja: "タスクまたはリマインダーのタイトルを入力してください。", zh: "任务或提醒标题不能为空。", en: "Task or reminder title can't be empty." }));
        if (
          operation.operationType === "create_followup_reminder" &&
          !values.dueAt
        ) {
          throw new Error(t({ ja: "リマインド日時を設定してください。", zh: "请先设置提醒时间。", en: "Set a reminder time first." }));
        }
        updates.push({
          operationId: operation.operationId,
          field: "title",
          draftText: title,
        });
        updates.push({
          operationId: operation.operationId,
          field: "dueAt",
          draftText: values.dueAt
            ? new Date(values.dueAt).toISOString()
            : "",
        });
      }
    }
    return updates;
  }

  // 网络异常或非 JSON 响应都必须复位 pending，否则按钮会永久禁用。
  async function applyTransition(
    transition: "confirm" | "defer" | "reject",
  ): Promise<void> {
    setPending(true);
    setError(null);

    try {
      const draftUpdates =
        transition === "confirm" ? editableDraftUpdates() : undefined;
      const response = await fetch(
        `/api/agent/ledger/${encodeURIComponent(entryId)}/transition`,
        {
          body: JSON.stringify({
            draftUpdates,
            selectedOperationIds: transition === "confirm" ? selected : undefined,
            transition,
          }),
          headers: { "content-type": "application/json" },
          method: "POST",
        },
      );
      const body = (await response.json()) as unknown;

      if (!isLedgerSuccess(body)) {
        setError(
          language === "ja"
            ? t({ ja: "操作を完了できませんでした。状態を更新してからもう一度お試しください。", zh: "操作没有完成，请刷新状态后重试。", en: "The action did not complete. Refresh its status and try again." })
            : agentLedgerErrorMessage(body, language),
        );
        setPending(false);
        return;
      }

      window.location.reload();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : t({ ja: "ネットワークエラーのため実行されませんでした。もう一度お試しください。", zh: "网络错误，操作未执行。请重试。", en: "Network error — nothing was run. Please try again." }),
      );
      setPending(false);
    }
  }

  return (
    <div data-orbit-today-decision-form style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {operations.map((operation) => (
          <div key={operation.operationId}>
            <label
              style={{ alignItems: "flex-start", cursor: "pointer", display: "flex", gap: 8 }}
            >
              {/* globals.css 把裸 input 当文本框重置（width:100%、边框、min-height），
                  这里显式覆盖回正常的复选框尺寸。 */}
              <input
                checked={selected.includes(operation.operationId)}
                onChange={(event) =>
                  setSelected((current) =>
                    event.target.checked
                      ? [...current, operation.operationId]
                      : current.filter((id) => id !== operation.operationId),
                  )
                }
                style={{ flexShrink: 0, height: 16, marginTop: 2, width: 16 }}
                type="checkbox"
              />
              <span>
                <span style={{ color: "var(--ink)", fontSize: 14, fontWeight: 500 }}>
                  {operation.title}
                </span>
                <span style={{ color: "var(--ink-3-text)", display: "block", fontSize: 13 }}>
                  {operation.effectSummary}
                </span>
              </span>
            </label>
            {(operation.operationType === "save_event_goal" ||
              operation.operationType === "save_message_draft") &&
            selected.includes(operation.operationId) ? (
              <label
                style={{
                  color: "var(--ink-2)",
                  display: "block",
                  fontSize: 13,
                  margin: "10px 0 2px 24px",
                }}
              >
                {operation.operationType === "save_event_goal"
                  ? t({ ja: "このイベントの目標", zh: "本场活动目标", en: "Goal for this event" })
                  : t({ ja: "メッセージの下書き", zh: "消息草稿", en: "Message draft" })}
                <textarea
                  aria-label={
                    operation.operationType === "save_event_goal"
                      ? t({ ja: "このイベントの目標", zh: "本场活动目标", en: "Goal for this event" })
                      : t({ ja: "メッセージの下書き", zh: "消息草稿", en: "Message draft" })
                  }
                  className="field"
                  maxLength={
                    operation.operationType === "save_event_goal" ? 240 : 2_000
                  }
                  onChange={(event) =>
                    setEditableValues((current) => ({
                      ...current,
                      [operation.operationId]: {
                        ...current[operation.operationId],
                        text: event.target.value,
                      },
                    }))
                  }
                  placeholder={
                    operation.operationType === "save_event_goal"
                      ? t({ ja: "例：蓄電池実証の決裁者と次の日程を確認する", zh: "例如：确认储能试点的决策人和下一步时间", en: "e.g. Confirm the decision-maker for the storage pilot and the next date" })
                      : t({ ja: "下書きを編集できます。Orbit が自動で送ることはありません", zh: "编辑草稿内容；Orbit 不会自动发送", en: "Edit the draft — Orbit never sends it automatically" })
                  }
                  rows={3}
                  style={{ display: "block", marginTop: 6, resize: "vertical", width: "100%" }}
                  value={editableValues[operation.operationId]?.text ?? ""}
                />
                <span style={{ color: "var(--ink-3-text)", display: "block", marginTop: 4 }}>
                  {operation.operationType === "save_event_goal"
                    ? t({ ja: "確定すると、編集した目標を保存してから反映します。", zh: "确认时会先保存你编辑后的目标，再执行写入。", en: "Confirming saves your edited goal first, then applies the change." })
                    : t({ ja: "確定しても下書きの保存だけで、送信はしません。", zh: "确认只会保存草稿，不会发送消息。", en: "Confirming only saves the draft — no message is sent." })}
                </span>
              </label>
            ) : null}
            {(operation.operationType === "create_followup_task" ||
              operation.operationType === "create_followup_reminder") &&
            selected.includes(operation.operationId) ? (
              <div
                style={{
                  display: "grid",
                  gap: 8,
                  gridTemplateColumns:
                    "repeat(auto-fit, minmax(min(100%, 220px), 1fr))",
                  margin: "10px 0 2px 24px",
                }}
              >
                <label style={{ color: "var(--ink-2)", fontSize: 13 }}>
                  {operation.operationType === "create_followup_task"
                    ? t({ ja: "タスク名", zh: "任务标题", en: "Task title" })
                    : t({ ja: "リマインダー名", zh: "提醒标题", en: "Reminder title" })}
                  <input
                    aria-label={
                      operation.operationType === "create_followup_task"
                        ? t({ ja: "タスク名", zh: "任务标题", en: "Task title" })
                        : t({ ja: "リマインダー名", zh: "提醒标题", en: "Reminder title" })
                    }
                    className="field"
                    maxLength={160}
                    onChange={(event) =>
                      setEditableValues((current) => ({
                        ...current,
                        [operation.operationId]: {
                          ...current[operation.operationId],
                          title: event.target.value,
                        },
                      }))
                    }
                    style={{ display: "block", marginTop: 6, width: "100%" }}
                    value={editableValues[operation.operationId]?.title ?? ""}
                  />
                </label>
                <label style={{ color: "var(--ink-2)", fontSize: 13 }}>
                  {operation.operationType === "create_followup_task"
                    ? t({ ja: "期限（任意）", zh: "截止时间（可不填）", en: "Due (optional)" })
                    : t({ ja: "リマインド日時", zh: "提醒时间", en: "Reminder time" })}
                  <input
                    aria-label={
                      operation.operationType === "create_followup_task"
                        ? t({ ja: "タスクの期限", zh: "任务截止时间", en: "Task due date" })
                        : t({ ja: "リマインド日時", zh: "提醒时间", en: "Reminder time" })
                    }
                    className="field"
                    onChange={(event) =>
                      setEditableValues((current) => ({
                        ...current,
                        [operation.operationId]: {
                          ...current[operation.operationId],
                          dueAt: event.target.value,
                        },
                      }))
                    }
                    style={{ display: "block", marginTop: 6, width: "100%" }}
                    type="datetime-local"
                    value={editableValues[operation.operationId]?.dueAt ?? ""}
                  />
                </label>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {error ? (
        <p role="alert" style={{ color: "var(--coral-text, #b4413c)", fontSize: 13, margin: 0 }}>
          {error}
        </p>
      ) : null}

      <div style={{ display: "flex", gap: 8 }}>
        {reviewTransitions.includes("confirm") ? (
          <button
            className="btn btn-primary"
            disabled={pending || selected.length === 0}
            onClick={() => void applyTransition("confirm")}
            type="button"
          >
            {t({ ja: "確定して実行", zh: "确认执行", en: "Confirm and run" })}
          </button>
        ) : null}
        {reviewTransitions.includes("defer") ? (
          <button
            className="btn btn-quiet"
            disabled={pending}
            onClick={() => void applyTransition("defer")}
            type="button"
          >
            {t({ ja: "あとで", zh: "稍后处理", en: "Later" })}
          </button>
        ) : null}
        {reviewTransitions.includes("reject") ? (
          <button
            className="btn btn-quiet"
            disabled={pending}
            onClick={() => void applyTransition("reject")}
            type="button"
          >
            {t({ ja: "無視", zh: "忽略", en: "Dismiss" })}
          </button>
        ) : null}
      </div>
    </div>
  );
}
