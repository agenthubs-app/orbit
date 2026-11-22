"use client";

import { useState } from "react";

import { useOrbitLanguage } from "../../orbit-language-context";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isLedgerSuccess(body: unknown): boolean {
  return isRecord(body) && body.success === true;
}

export function readLedgerError(body: unknown, fallback: string): string {
  if (isRecord(body) && isRecord(body.error) && typeof body.error.message === "string") {
    return body.error.message;
  }

  return fallback;
}

/**
 * All actions 的写入口：撤销已完成的操作、重试失败项。
 * 重试是幂等的——成功项不会重复执行（由 ledger service 保证）。
 */
export function OrbitAllActionsControls({
  canCancel,
  canRetry,
  canUndo,
  entryId,
}: {
  canCancel: boolean;
  canRetry: boolean;
  canUndo: boolean;
  entryId: string;
}) {
  const { t } = useOrbitLanguage();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 网络异常或非 JSON 响应都必须复位 pending，否则按钮会永久禁用。
  async function applyTransition(
    transition: "undo" | "retry" | "cancel",
  ): Promise<void> {
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
        setError(readLedgerError(body, t({ ja: "操作を完了できませんでした。もう一度お試しください。", zh: "操作没有完成，请重试。", en: "The action didn't complete. Please try again." })));
        setPending(false);
        return;
      }

      window.location.reload();
    } catch {
      setError(t({ ja: "ネットワークエラーのため実行されませんでした。もう一度お試しください。", zh: "网络错误，操作未执行。请重试。", en: "Network error — nothing was run. Please try again." }));
      setPending(false);
    }
  }

  if (!canUndo && !canRetry && !canCancel) return null;

  return (
    <span style={{ alignItems: "center", display: "inline-flex", gap: 8 }}>
      {error ? (
        <span role="alert" style={{ color: "var(--coral-text, #b4413c)", fontSize: 12 }}>
          {error}
        </span>
      ) : null}
      {canRetry ? (
        <button
          className="btn btn-quiet"
          disabled={pending}
          onClick={() => void applyTransition("retry")}
          type="button"
        >
          {t({ ja: "失敗分を再試行", zh: "重试失败项", en: "Retry failed items" })}
        </button>
      ) : null}
      {canUndo ? (
        <button
          className="btn btn-quiet"
          disabled={pending}
          onClick={() => void applyTransition("undo")}
          type="button"
        >
          {t({ ja: "元に戻す", zh: "撤销", en: "Undo" })}
        </button>
      ) : null}
      {canCancel ? (
        <button
          className="btn btn-quiet"
          disabled={pending}
          onClick={() => void applyTransition("cancel")}
          type="button"
        >
          {t({ ja: "実行を取り消す", zh: "取消执行", en: "Cancel run" })}
        </button>
      ) : null}
    </span>
  );
}
