"use client";

import { useState } from "react";
import type { AgentLedgerOperation } from "../../../../features/agent/ledger/contract";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isLedgerSuccess(body: unknown): boolean {
  return isRecord(body) && body.success === true;
}

function readLedgerError(body: unknown): string {
  if (isRecord(body) && isRecord(body.error) && typeof body.error.message === "string") {
    return body.error.message;
  }

  return "操作没有完成，请重试。";
}

/**
 * 决策写入口。勾选子操作后确认，或整条稍后处理。
 * 这里没有、也不允许有任何"发送"路径：消息类子操作只落草稿。
 */
export function OrbitTodayDecisionForm({
  entryId,
  operations,
}: {
  entryId: string;
  operations: readonly AgentLedgerOperation[];
}) {
  const [selected, setSelected] = useState<readonly string[]>(
    operations
      .filter((operation) => operation.selectedByDefault)
      .map((operation) => operation.operationId),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editableValues, setEditableValues] = useState<
    Readonly<Record<string, string>>
  >(() =>
    Object.fromEntries(
      operations.flatMap((operation) =>
        operation.operationType === "save_event_goal"
          ? [
              [
                operation.operationId,
                typeof operation.payload?.goal === "string"
                  ? operation.payload.goal
                  : "",
              ],
            ]
          : [],
      ),
    ),
  );

  async function saveEditableOperations(): Promise<void> {
    for (const operation of operations) {
      if (
        operation.operationType !== "save_event_goal" ||
        !selected.includes(operation.operationId)
      ) {
        continue;
      }
      const value = editableValues[operation.operationId]?.trim() ?? "";
      if (!value) {
        throw new Error("请先填写本场活动目标。");
      }
      const response = await fetch(
        `/api/agent/ledger/${encodeURIComponent(entryId)}/draft`,
        {
          body: JSON.stringify({
            draftText: value,
            operationId: operation.operationId,
          }),
          headers: { "content-type": "application/json" },
          method: "PATCH",
        },
      );
      const body = (await response.json()) as unknown;
      if (!isLedgerSuccess(body)) {
        throw new Error(readLedgerError(body));
      }
    }
  }

  // 网络异常或非 JSON 响应都必须复位 pending，否则按钮会永久禁用。
  async function applyTransition(
    transition: "confirm" | "defer" | "reject",
  ): Promise<void> {
    setPending(true);
    setError(null);

    try {
      if (transition === "confirm") {
        await saveEditableOperations();
      }
      const response = await fetch(
        `/api/agent/ledger/${encodeURIComponent(entryId)}/transition`,
        {
          body: JSON.stringify({
            selectedOperationIds: transition === "confirm" ? selected : undefined,
            transition,
          }),
          headers: { "content-type": "application/json" },
          method: "POST",
        },
      );
      const body = (await response.json()) as unknown;

      if (!isLedgerSuccess(body)) {
        setError(readLedgerError(body));
        setPending(false);
        return;
      }

      window.location.reload();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "网络错误，操作未执行。请重试。",
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
                <span style={{ color: "var(--text)", fontSize: 14, fontWeight: 500 }}>
                  {operation.title}
                </span>
                <span style={{ color: "var(--text-3)", display: "block", fontSize: 13 }}>
                  {operation.effectSummary}
                </span>
              </span>
            </label>
            {operation.operationType === "save_event_goal" &&
            selected.includes(operation.operationId) ? (
              <label
                style={{
                  color: "var(--text-2)",
                  display: "block",
                  fontSize: 13,
                  margin: "10px 0 2px 24px",
                }}
              >
                本场活动目标
                <textarea
                  aria-label="本场活动目标"
                  className="field"
                  maxLength={240}
                  onChange={(event) =>
                    setEditableValues((current) => ({
                      ...current,
                      [operation.operationId]: event.target.value,
                    }))
                  }
                  placeholder="例如：确认储能试点的决策人和下一步时间"
                  rows={3}
                  style={{ display: "block", marginTop: 6, resize: "vertical", width: "100%" }}
                  value={editableValues[operation.operationId] ?? ""}
                />
                <span style={{ color: "var(--text-4)", display: "block", marginTop: 4 }}>
                  确认时会先保存你编辑后的目标，再执行写入。
                </span>
              </label>
            ) : null}
          </div>
        ))}
      </div>

      {error ? (
        <p role="alert" style={{ color: "var(--danger, #b4413c)", fontSize: 13, margin: 0 }}>
          {error}
        </p>
      ) : null}

      <div style={{ display: "flex", gap: 8 }}>
        <button
          className="btn btn-primary"
          disabled={pending || selected.length === 0}
          onClick={() => void applyTransition("confirm")}
          type="button"
        >
          确认执行
        </button>
        <button
          className="btn btn-quiet"
          disabled={pending}
          onClick={() => void applyTransition("defer")}
          type="button"
        >
          稍后处理
        </button>
        <button
          className="btn btn-quiet"
          disabled={pending}
          onClick={() => void applyTransition("reject")}
          type="button"
        >
          忽略
        </button>
      </div>
    </div>
  );
}
