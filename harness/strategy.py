"""Harness 迭代策略决策。

根据 evaluator/verifier 的历史分数、最新反馈和阻塞项，决定下一轮应该继续 refine
还是 pivot。这里的输出会进入下一轮 Generator prompt，所以需要保持明确、可执行。
"""

from __future__ import annotations

from typing import Any


def _combined_score(entry: dict[str, Any]) -> float:
    """把 evaluator 和 verifier 平均分合成一个趋势分数。"""
    evaluator = float(entry.get("evaluator_average", 0.0))
    verifier = float(entry.get("verifier_average", 0.0))
    return (evaluator + verifier) / 2


def _clean_blocking_items(blocking_items: list[str] | None) -> list[str]:
    """清理空白、重复的阻塞项，避免下一轮 prompt 噪声过多。"""
    cleaned: list[str] = []
    seen: set[str] = set()
    for item in blocking_items or []:
        normalized = " ".join(str(item).split())
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        cleaned.append(normalized)
    return cleaned


def decide_strategy(
  score_history: list[dict[str, Any]],
  latest_feedback: str,
  blocking_items: list[str] | None = None,
) -> dict[str, Any]:
    """根据分数趋势和阻塞项生成下一轮策略 directive。"""
    if len(score_history) < 2:
        decision = "refine"
        reason = "Insufficient history; continue with concrete evaluator and verifier feedback."
    else:
        first = _combined_score(score_history[0])
        previous = _combined_score(score_history[-2])
        latest = _combined_score(score_history[-1])
        last_delta = latest - previous
        total_delta = latest - first
        if len(score_history) >= 3 and last_delta < 0.15 and total_delta < 0.25:
            decision = "pivot"
            reason = f"Scores are flat across {len(score_history)} iterations ({total_delta:+.2f} total)."
        else:
            decision = "refine"
            reason = f"Scores are still improving or feedback is actionable ({last_delta:+.2f} last)."
    blockers = _clean_blocking_items(blocking_items)
    blocking_directive = ""
    if blockers:
        blocking_directive = (
            "\n\n## Blocking repair targets\n\n"
            "Resolve these items before broad refactors or polish. The next Generator pass must "
            "change implementation or tests that directly answer each target, then cite evidence.\n"
            + "\n".join(f"- {item}" for item in blockers)
        )
    directive = (
        f"## Strategic directive - {decision.upper()}\n\n"
        f"Reason: {reason}\n\n"
        f"{blocking_directive}\n\n"
        "Use this feedback as the next implementation target:\n"
        f"{latest_feedback}"
    )
    return {"decision": decision, "reason": reason, "directive": directive, "blocking_items": blockers}
