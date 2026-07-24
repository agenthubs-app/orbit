"use client";

import { useState } from "react";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isLedgerSuccess(body: unknown): boolean {
  return isRecord(body) && body.success === true;
}

export function readLedgerError(body: unknown): string {
  if (isRecord(body) && isRecord(body.error) && typeof body.error.message === "string") {
    return body.error.message;
  }

  return "操作没有完成，请重试。";
}

/**
 * All actions 的写入口：撤销已完成的操作、重试失败项。
 * 重试是幂等的——成功项不会重复执行（由 ledger service 保证）。
 */
export function OrbitAllActionsControls({
  canRetry,
  canUndo,
  entryId,
}: {
  canRetry: boolean;
  canUndo: boolean;
  entryId: string;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 网络异常或非 JSON 响应都必须复位 pending，否则按钮会永久禁用。
  async function applyTransition(transition: "undo" | "retry"): Promise<void> {
    setPending(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/agent/ledger/${encodeURIComponent(entryId)}/transition`,
        {
          body: JSON.stringify({ transition }),
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

  if (!canUndo && !canRetry) return null;

  return (
    <span style={{ alignItems: "center", display: "inline-flex", gap: 8 }}>
      {error ? (
        <span role="alert" style={{ color: "var(--danger, #b4413c)", fontSize: 12 }}>
          {error}
        </span>
      ) : null}
      {canRetry ? (
        <button
          className="btn"
          disabled={pending}
          onClick={() => void applyTransition("retry")}
          type="button"
        >
          重试失败项
        </button>
      ) : null}
      {canUndo ? (
        <button
          className="btn"
          disabled={pending}
          onClick={() => void applyTransition("undo")}
          type="button"
        >
          撤销
        </button>
      ) : null}
    </span>
  );
}
