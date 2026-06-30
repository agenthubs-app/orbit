from __future__ import annotations

import asyncio
import json
import time
from pathlib import Path

from harness.claude_runner import build_claude_options
from harness.codex_runner import run_codex
from harness.config import HarnessConfig
from harness.evidence_citation import resolve_evidence_path_values
from harness import log
from harness.json_output import parse_first_json_object
from harness.models.state import ExperienceIssue, SprintContract, VerificationResult


REQUIRED_EXPERIENCE_KEYS = ("clarity", "trust", "efficiency", "delight")
EVIDENCE_BUCKET_KEYS = ("commands", "navigation", "browser", "axe", "lighthouse", "api", "source_files")
VALID_ISSUE_SEVERITIES = {"low", "medium", "high", "critical"}

# Verifier 是体验维度的只读审查者。
# 和 Evaluator 不同，它不逐条判 sprint contract，而是基于证据给 clarity/trust/efficiency/delight 评分。

def _run_async(coro, timeout: int = 1200):
    return asyncio.run(asyncio.wait_for(coro, timeout=timeout))


def _valid_score(value: object) -> float:
    try:
        score = float(value)
    except (TypeError, ValueError):
        return 0.0
    if 1.0 <= score <= 5.0:
        return score
    return 0.0


def _has_collected_evidence(evidence_data: object) -> bool:
    # 没有 collected evidence 时，Verifier 的主观评分不可信，后面会强制降成失败结果。
    if not isinstance(evidence_data, dict):
        return False
    return any(bool(evidence_data.get(key)) for key in EVIDENCE_BUCKET_KEYS)


def _has_specific_evidence(value: object) -> bool:
    if not isinstance(value, str):
        return False
    normalized = value.strip().lower()
    return bool(normalized) and normalized not in {"no evidence provided.", "no evidence provided", "none", "n/a"}


def _evidence_path_exists(citation: str, evidence_data: object) -> bool:
    return resolve_evidence_path_values(citation, evidence_data) is not None


def _artifact_path_exists(citation: str, evidence_data: object) -> bool:
    if isinstance(evidence_data, dict):
        if evidence_data.get("artifact_path") == citation:
            return True
        return any(_artifact_path_exists(citation, value) for value in evidence_data.values())
    if isinstance(evidence_data, list):
        return any(_artifact_path_exists(citation, value) for value in evidence_data)
    return False


def _evidence_citation_exists(citation: object, evidence_data: object | None) -> bool:
    # issue.evidence 必须能解析到当前 iteration 的 evidence 或 artifact。
    # 这可以防止 reviewer 写“看起来有问题”但没有可复核证据。
    if not _has_specific_evidence(citation):
        return False
    assert isinstance(citation, str)
    if evidence_data is None:
        return True
    stripped = citation.strip()
    return _evidence_path_exists(stripped, evidence_data) or _artifact_path_exists(stripped, evidence_data)


def _normalize_issue_severity(value: object) -> str:
    severity = str(value or "medium").strip().lower()
    if severity in VALID_ISSUE_SEVERITIES:
        return severity
    return "high"


def build_verifier_prompt(
    product_context: str,
    contract: SprintContract,
    app_url: str,
    evidence_text: str,
    artifact_dir: Path | None = None,
) -> str:
    # prompt 中包含 file boundary，是为了让 Verifier 区分“本 sprint 要负责的问题”
    # 和 forbidden route 里的历史 backlog 问题。
    prompt_path = Path(__file__).parents[1] / "prompts" / "verifier.md"
    file_boundary = json.dumps(contract.file_boundary or {}, indent=2, ensure_ascii=False)
    out_of_scope = "\n".join(f"- {item}" for item in contract.out_of_scope) or "- none"
    return (
        f"{prompt_path.read_text()}\n\n"
        f"## App URL\n{app_url}\n\n"
        f"## Product Context\n{product_context[:8000]}\n\n"
        f"## Current Sprint Context\n"
        f"Sprint {contract.sprint_number}: {contract.goal}\n"
        f"This context tells you what changed, but Do not grade sprint success criteria.\n\n"
        f"Out of scope:\n{out_of_scope}\n\n"
        f"File boundary:\n```json\n{file_boundary}\n```\n\n"
        f"Boundary-aware scoring rule:\n"
        f"- Score the user experience of the current sprint's owned_paths and allowed_shared_paths.\n"
        f"- When broad route evidence is collected only to prove shell, navigation, or shared-context consistency, "
        f"treat route-specific content inside forbidden_paths as backlog context, not as a blocking issue for this sprint.\n"
        f"- You may still report forbidden-path issues, but mark them low severity unless the current sprint changed "
        f"that surface or the issue prevents the current sprint's own user task from working.\n"
        f"- Do not fail a narrow sprint solely because an older productization issue remains in a forbidden route; "
        f"that issue belongs in a later sprint with an appropriate file boundary.\n\n"
        f"Primary perspectives to use:\n"
        f"- first-time participant trying to understand an event or relationship prompt\n"
        f"- returning participant checking what to do next\n"
        f"- organizer reviewing whether the system feels credible and actionable\n\n"
        f"## Collected Evidence JSON\n{evidence_text}\n\n"
        f"## Reviewer Artifact Policy\n"
        "Do not write supplemental artifacts. Use only the collected evidence JSON above.\n\n"
        "Output only this JSON block:\n"
        "```json\n"
        "{\n"
        '  "scores": {"clarity": 3, "trust": 3, "efficiency": 3, "delight": 3},\n'
        '  "issues": [{"id": "UX-1", "severity": "low", "user_impact": "...", "evidence": "specific evidence key/path", "recommendation": "..."}],\n'
        '  "feedback": "experience-level assessment"\n'
        "}\n"
        "```"
    )


def build_verification_result_from_review(
    review: dict,
    pass_threshold: float,
    conditional_pass_threshold: float,
    block_on_high_severity: bool = True,
    evidence_available: bool | None = None,
    evidence_data: dict | None = None,
) -> VerificationResult:
    # 把 reviewer JSON 转成稳定 VerificationResult。
    # 这里会二次校验 evidence citation，并根据阈值和高危 issue 计算 verdict。
    raw_scores = review.get("scores") or {}
    scores = {key: _valid_score(raw_scores.get(key)) for key in REQUIRED_EXPERIENCE_KEYS}
    if evidence_available is False:
        scores = {key: 0.0 for key in REQUIRED_EXPERIENCE_KEYS}
    average = sum(scores.values()) / len(scores) if scores else 0.0
    issues = [
        ExperienceIssue(
            id=str(item.get("id", f"UX-{index}")),
            severity=_normalize_issue_severity(item.get("severity", "medium")),
            user_impact=str(item.get("user_impact", "")),
            evidence=str(item.get("evidence", "No evidence provided.")),
            recommendation=str(item.get("recommendation", "")),
        )
        for index, item in enumerate(review.get("issues", []) or [], start=1)
    ]
    if evidence_available is False:
        issues.insert(
            0,
            ExperienceIssue(
                id="UX-EVIDENCE",
                severity="high",
                user_impact="Verifier cannot judge the user experience because no collected evidence was available.",
                evidence="harness-state/evidence/current-iteration/evidence.json",
                recommendation="Collect browser, API, command, source, or smoke evidence before accepting verifier scores.",
            ),
        )
    invalid_issue_citations = [
        item
        for item in issues
        if not _evidence_citation_exists(item.evidence, evidence_data)
    ]
    if evidence_available is not False and invalid_issue_citations:
        scores = {key: 0.0 for key in REQUIRED_EXPERIENCE_KEYS}
        average = 0.0
        issues.insert(
            0,
            ExperienceIssue(
                id="UX-EVIDENCE-CITATION",
                severity="high",
                user_impact="Verifier cited issue evidence that does not resolve to the current iteration evidence.",
                evidence=", ".join(item.evidence for item in invalid_issue_citations),
                recommendation="Cite a valid evidence JSON key path or recorded artifact_path from the current iteration.",
            ),
        )
    has_blocking_issue = block_on_high_severity and any(item.severity in {"high", "critical"} for item in issues)
    if has_blocking_issue:
        verdict = "fail"
    elif average >= pass_threshold:
        verdict = "pass"
    elif average >= conditional_pass_threshold:
        verdict = "conditional_pass"
    else:
        verdict = "fail"
    return VerificationResult(
        verdict=verdict,
        experience_average=round(average, 2),
        scores=scores,
        issues=issues,
        feedback=review.get("feedback", ""),
    )


def parse_verification_review(output: str) -> dict:
    try:
        return parse_first_json_object(output, "scores")
    except ValueError:
        raise RuntimeError(f"Verifier did not return parseable JSON. Output tail:\n{output[-1000:]}") from None


def run_verifier(
    product_context: str,
    contract: SprintContract,
    app_url: str,
    cfg: HarnessConfig | None = None,
    project_dir: Path | None = None,
    evidence_dir: Path | None = None,
) -> VerificationResult:
    # run_verifier 只读取已采集 evidence，不自己跑浏览器或命令。
    # 证据缺失时仍生成结构化失败，避免长跑流程静默接受空审查。
    cfg = cfg or HarnessConfig.load(Path(__file__).parents[1] / "config.yaml")
    project_dir = project_dir or Path.cwd()
    evidence_dir = evidence_dir or project_dir / cfg.workspace.evidence_root / f"sprint-{contract.sprint_number}"
    evidence_path = evidence_dir / "evidence.json"
    evidence_text = evidence_path.read_text() if evidence_path.exists() else "{}"
    try:
        evidence_data = json.loads(evidence_text)
    except json.JSONDecodeError:
        evidence_data = {}
    prompt = build_verifier_prompt(product_context, contract, app_url, evidence_text)
    logger = log.get()
    logger.info(
        "[Verifier] start sprint=%s backend=%s model=%s evidence=%s prompt_chars=%s",
        contract.sprint_number,
        cfg.agents.verifier.backend,
        cfg.agents.verifier.model or "<sdk-default>",
        evidence_path,
        len(prompt),
    )
    if cfg.agents.verifier.backend == "codex":
        output = run_codex(prompt, cfg.agents.verifier, cwd=project_dir / cfg.workspace.app_root, timeout=900)
    elif cfg.agents.verifier.backend in {"claude", "deepcode"}:
        output = _run_async(_run_verifier_claude(prompt, project_dir / cfg.workspace.app_root, cfg))
    else:
        raise NotImplementedError(f"Unsupported verifier backend: {cfg.agents.verifier.backend}")
    result = build_verification_result_from_review(
        parse_verification_review(output),
        pass_threshold=cfg.verification.pass_threshold,
        conditional_pass_threshold=cfg.verification.conditional_pass_threshold,
        block_on_high_severity=cfg.verification.block_on_high_severity,
        evidence_available=_has_collected_evidence(evidence_data),
        evidence_data=evidence_data,
    )
    logger.info("[Verifier] result sprint=%s verdict=%s average=%.2f", contract.sprint_number, result.verdict, result.experience_average)
    return result


async def _run_verifier_claude(prompt: str, app_dir: Path, cfg: HarnessConfig) -> str:
    # Claude Verifier 不开放工具；它只能根据 prompt 中的 evidence JSON 做判断。
    from claude_agent_sdk import AssistantMessage, ResultMessage, query

    options = build_claude_options(
        cfg.agents.verifier,
        "You are the user experience verifier. Return only the requested JSON block.",
        allowed_tools=[],
        permission_mode="bypassPermissions",
        cwd=str(app_dir),
        max_turns=90,
    )
    output = ""
    started_at = time.monotonic()
    async for message in query(prompt=prompt, options=options):
        if isinstance(message, AssistantMessage):
            for block in message.content:
                text = getattr(block, "text", "")
                if text:
                    output = text
        elif isinstance(message, ResultMessage):
            output = getattr(message, "result", "") or output
    log.get().info("[Verifier:sdk] complete elapsed=%.1fs output=%s", time.monotonic() - started_at, log.compact(output, 500))
    return output
