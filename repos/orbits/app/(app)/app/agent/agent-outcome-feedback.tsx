"use client";

import { useEffect, useState } from "react";

type FeedbackLanguage = "en" | "zh";
type FeedbackRating = "helpful" | "not_relevant";
type FeedbackOutcome = "contacted" | "meeting_booked" | "goal_advanced";

interface FeedbackView {
  rating?: FeedbackRating;
  outcome?: FeedbackOutcome;
}

function parseFeedback(value: unknown): FeedbackView | null {
  if (
    typeof value !== "object" ||
    value === null ||
    !("success" in value) ||
    value.success !== true ||
    !("data" in value) ||
    typeof value.data !== "object" ||
    value.data === null ||
    !("feedback" in value.data)
  ) {
    return null;
  }
  const feedback = value.data.feedback;
  if (feedback === null) return {};
  if (typeof feedback !== "object" || feedback === null) return null;
  const candidate = feedback as Record<string, unknown>;
  return {
    rating:
      candidate.rating === "helpful" ||
      candidate.rating === "not_relevant"
        ? candidate.rating
        : undefined,
    outcome:
      candidate.outcome === "contacted" ||
      candidate.outcome === "meeting_booked" ||
      candidate.outcome === "goal_advanced"
        ? candidate.outcome
        : undefined,
  };
}

export function AgentOutcomeFeedback({
  evidenceIds,
  language,
  runId,
  sourceModules,
}: {
  evidenceIds: readonly string[];
  language: FeedbackLanguage;
  runId: string;
  sourceModules: readonly string[];
}) {
  const [feedback, setFeedback] = useState<FeedbackView>({});
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let canceled = false;
    void fetch(`/api/agent/feedback/${encodeURIComponent(runId)}`, {
      cache: "no-store",
    })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as unknown;
        const next = parseFeedback(body);
        if (!canceled && response.ok && next) setFeedback(next);
      })
      .catch(() => undefined);
    return () => {
      canceled = true;
    };
  }, [runId]);

  async function save(
    patch:
      | { rating: FeedbackRating }
      | { outcome: FeedbackOutcome },
  ) {
    const key = "rating" in patch ? patch.rating : patch.outcome;
    setPending(key);
    setError(null);
    try {
      const response = await fetch("/api/agent/feedback", {
        body: JSON.stringify({
          ...patch,
          evidenceIds,
          runId,
          sourceModules,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const body = (await response.json().catch(() => null)) as unknown;
      const next = parseFeedback(body);
      if (!response.ok || !next) {
        throw new Error("feedback_failed");
      }
      setFeedback(next);
    } catch {
      setError(
        language === "zh"
          ? "反馈没有保存，请重试。"
          : "Feedback was not saved. Please retry.",
      );
    } finally {
      setPending(null);
    }
  }

  const buttonStyle = (selected: boolean) => ({
    background: selected ? "var(--accent-soft)" : "transparent",
    border: "1px solid var(--border)",
    borderRadius: "var(--r-pill)",
    color: selected ? "var(--accent)" : "var(--text-3)",
    cursor: "pointer",
    fontSize: 11,
    padding: "5px 9px",
  });

  return (
    <div
      aria-label={language === "zh" ? "Agent 结果反馈" : "Agent result feedback"}
      data-agent-outcome-feedback
      style={{
        borderTop: "1px solid var(--border)",
        display: "grid",
        gap: 7,
        marginTop: 10,
        paddingTop: 9,
      }}
    >
      <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: 6 }}>
        <span style={{ color: "var(--text-3)", fontSize: 11 }}>
          {language === "zh" ? "这个结果：" : "This result:"}
        </span>
        {(
          [
            ["helpful", language === "zh" ? "有帮助" : "Helpful"],
            ["not_relevant", language === "zh" ? "不相关" : "Not relevant"],
          ] as const
        ).map(([value, label]) => (
          <button
            data-agent-feedback-rating={value}
            disabled={pending !== null}
            key={value}
            onClick={() => void save({ rating: value })}
            style={buttonStyle(feedback.rating === value)}
            type="button"
          >
            {pending === value ? "…" : label}
          </button>
        ))}
      </div>
      {sourceModules.length > 0 ? (
        <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: 6 }}>
          <span style={{ color: "var(--text-3)", fontSize: 11 }}>
            {language === "zh" ? "后续结果：" : "Later outcome:"}
          </span>
          {(
            [
              ["contacted", language === "zh" ? "已联系" : "Contacted"],
              ["meeting_booked", language === "zh" ? "已约见" : "Meeting booked"],
              ["goal_advanced", language === "zh" ? "目标有推进" : "Goal advanced"],
            ] as const
          ).map(([value, label]) => (
            <button
              data-agent-feedback-outcome={value}
              disabled={pending !== null}
              key={value}
              onClick={() => void save({ outcome: value })}
              style={buttonStyle(feedback.outcome === value)}
              type="button"
            >
              {pending === value ? "…" : label}
            </button>
          ))}
        </div>
      ) : null}
      {error ? (
        <span role="alert" style={{ color: "var(--danger)", fontSize: 11 }}>
          {error}
        </span>
      ) : null}
    </div>
  );
}
