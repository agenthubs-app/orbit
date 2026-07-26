"use client";

import { useEffect, useState } from "react";
import type { AgentFeedback } from "../../../../features/agent/feedback/contract";
import { useOrbitLanguage } from "../orbit-language-context";
import { Icon } from "../orbit-reference-primitives";

function errorMessage(value: unknown, fallback: string) {
  if (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof value.error === "object" &&
    value.error !== null &&
    "message" in value.error &&
    typeof value.error.message === "string"
  ) {
    return value.error.message;
  }
  return fallback;
}

export function OrbitAgentFeedbackSettings() {
  const { t } = useOrbitLanguage();
  const [feedback, setFeedback] = useState<AgentFeedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingRunId, setPendingRunId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let canceled = false;
    void fetch("/api/agent/feedback", { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as {
          data?: { feedback?: AgentFeedback[] };
        } | null;
        if (!response.ok) {
          throw new Error(
            errorMessage(
              body,
              t({
                en: "Agent learning history could not be loaded.",
                zh: "Agent 学习记录暂时无法读取。",
              }),
            ),
          );
        }
        if (!canceled) {
          setFeedback(
            Array.isArray(body?.data?.feedback)
              ? body.data.feedback
              : [],
          );
        }
      })
      .catch((caught) => {
        if (!canceled) {
          setError(
            caught instanceof Error
              ? caught.message
              : t({
                  en: "Agent learning history could not be loaded.",
                  zh: "Agent 学习记录暂时无法读取。",
                }),
          );
        }
      })
      .finally(() => {
        if (!canceled) setLoading(false);
      });
    return () => {
      canceled = true;
    };
  }, [t]);

  async function remove(runId: string) {
    setPendingRunId(runId);
    setError(null);
    try {
      const response = await fetch(
        `/api/agent/feedback/${encodeURIComponent(runId)}`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        throw new Error(
          errorMessage(
            await response.json().catch(() => null),
            t({
              en: "The learning record was not deleted.",
              zh: "这条学习记录没有删除成功。",
            }),
          ),
        );
      }
      setFeedback((current) =>
        current.filter((item) => item.runId !== runId),
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : t({
              en: "The learning record was not deleted.",
              zh: "这条学习记录没有删除成功。",
            }),
      );
    } finally {
      setPendingRunId(null);
    }
  }

  const ratingLabel = (value: AgentFeedback["rating"]) =>
    value === "helpful"
      ? t({ en: "Helpful", zh: "有帮助" })
      : value === "not_relevant"
        ? t({ en: "Not relevant", zh: "不相关" })
        : t({ en: "No rating", zh: "未评价" });
  const outcomeLabel = (value: AgentFeedback["outcome"]) =>
    value === "contacted"
      ? t({ en: "Contacted", zh: "已联系" })
      : value === "meeting_booked"
        ? t({ en: "Meeting booked", zh: "已约见" })
        : value === "goal_advanced"
          ? t({ en: "Goal advanced", zh: "目标有推进" })
          : t({ en: "No outcome yet", zh: "暂无后续结果" });

  return (
    <section
      aria-labelledby="orbit-agent-feedback-title"
      className="card"
      data-orbit-agent-feedback-settings
      style={{ marginTop: 16, padding: 24 }}
    >
      <div style={{ alignItems: "flex-start", display: "flex", gap: 14 }}>
        <span
          aria-hidden
          style={{
            alignItems: "center",
            background: "var(--accent-soft)",
            borderRadius: 12,
            color: "var(--accent)",
            display: "inline-flex",
            height: 42,
            justifyContent: "center",
            width: 42,
          }}
        >
          <Icon name="check" size={20} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 id="orbit-agent-feedback-title" style={{ fontSize: 18, margin: 0 }}>
            {t({ en: "Result learning", zh: "结果学习" })}
          </h2>
          <p style={{ color: "var(--text-3)", fontSize: 13.5, lineHeight: 1.6 }}>
            {t({
              en: "Only feedback and outcomes you explicitly record may influence later recommendations. Delete any record to stop using it.",
              zh: "只有你主动记录的评价和业务结果会影响后续推荐；删除后将不再使用。",
            })}
          </p>
          {error ? (
            <p role="alert" style={{ color: "var(--danger)", fontSize: 13 }}>
              {error}
            </p>
          ) : null}
          {loading ? (
            <p style={{ color: "var(--text-3)", fontSize: 13 }}>
              {t({ en: "Loading…", zh: "正在加载…" })}
            </p>
          ) : feedback.length === 0 ? (
            <p style={{ color: "var(--text-3)", fontSize: 13 }}>
              {t({
                en: "No result learning records yet.",
                zh: "还没有结果学习记录。",
              })}
            </p>
          ) : (
            <div style={{ display: "grid", gap: 9 }}>
              {feedback.map((item) => (
                <article
                  data-agent-feedback-run-id={item.runId}
                  key={item.feedbackId}
                  style={{
                    background: "var(--bg-soft)",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    display: "grid",
                    gap: 7,
                    padding: 13,
                  }}
                >
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    <span className="chip">{ratingLabel(item.rating)}</span>
                    <span className="chip">{outcomeLabel(item.outcome)}</span>
                    {item.sourceModules.map((source) => (
                      <span className="chip" key={source}>{source}</span>
                    ))}
                  </div>
                  <span className="mono" style={{ color: "var(--text-3)", fontSize: 11, overflowWrap: "anywhere" }}>
                    {item.runId}
                  </span>
                  <div>
                    <button
                      className="btn btn-sm btn-quiet"
                      disabled={pendingRunId === item.runId}
                      onClick={() => void remove(item.runId)}
                      type="button"
                    >
                      {pendingRunId === item.runId
                        ? t({ en: "Deleting…", zh: "正在删除…" })
                        : t({ en: "Delete learning record", zh: "删除学习记录" })}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
