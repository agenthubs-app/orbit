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

  // 网络异常或非 JSON 响应都必须复位 pending，否则按钮会永久禁用。
  async function applyTransition(
    transition: "confirm" | "defer",
  ): Promise<void> {
    setPending(true);
    setError(null);

    try {
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
    } catch {
      setError("网络错误，操作未执行。请重试。");
      setPending(false);
    }
  }

  return (
    <div data-orbit-today-decision-form style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {operations.map((operation) => (
          <label
            key={operation.operationId}
            style={{ alignItems: "flex-start", cursor: "pointer", display: "flex", gap: 10 }}
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
              style={{ flexShrink: 0, height: 16, marginTop: 2, minHeight: 0, padding: 0, width: 16 }}
              type="checkbox"
            />
            <span>
              <span style={{ color: "var(--text)", fontSize: 14, fontWeight: 500 }}>
                {operation.title}
              </span>
              <span style={{ color: "var(--text-3)", display: "block", fontSize: 12.5 }}>
                {operation.effectSummary}
              </span>
            </span>
          </label>
        ))}
      </div>

      {error ? (
        <p role="alert" style={{ color: "var(--danger, #b4413c)", fontSize: 13, margin: 0 }}>
          {error}
        </p>
      ) : null}

      <div style={{ display: "flex", gap: 10 }}>
        <button
          className="btn btn-primary"
          disabled={pending || selected.length === 0}
          onClick={() => void applyTransition("confirm")}
          type="button"
        >
          确认执行
        </button>
        <button
          className="btn"
          disabled={pending}
          onClick={() => void applyTransition("defer")}
          type="button"
        >
          稍后处理
        </button>
      </div>
    </div>
  );
}
