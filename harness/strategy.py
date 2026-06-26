from __future__ import annotations

from typing import Any


def _combined_score(entry: dict[str, Any]) -> float:
    evaluator = float(entry.get("evaluator_average", 0.0))
    verifier = float(entry.get("verifier_average", 0.0))
    return (evaluator + verifier) / 2


def _clean_blocking_items(blocking_items: list[str] | None) -> list[str]:
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
