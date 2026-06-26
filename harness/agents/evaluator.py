from __future__ import annotations

import asyncio
import json
import re
import time
from pathlib import Path

from harness.claude_runner import build_claude_options
from harness.codex_runner import run_codex
from harness.config import HarnessConfig
from harness.evidence_citation import resolve_evidence_path_values
from harness import log
from harness.json_output import parse_first_json_object
from harness.models.state import EvalResult, SprintContract, SuccessCriterion


REQUIRED_RUBRIC_KEYS = ("C1", "C2", "C3", "C4", "C5")


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


def _has_specific_evidence(value: object) -> bool:
    if not isinstance(value, str):
        return False
    normalized = value.strip().lower()
    return bool(normalized) and normalized not in {"no evidence provided.", "no evidence provided", "none", "n/a"}


def _evidence_record_supports_pass(value: object, *, include_children: bool = False) -> bool:
    if isinstance(value, list):
        return not include_children or all(
            _evidence_record_supports_pass(item, include_children=True) for item in value
        )
    if not isinstance(value, dict):
        return True
    if value.get("collection_failed") is True:
        return False
    if value.get("rejected") is True:
        return False
    if value.get("missing") is True:
        return False
    if value.get("available") is False:
        return False
    if value.get("passed") is False:
        return False
    if value.get("timed_out") is True:
        return False
    if value.get("missing_executable") is True:
        return False
    returncode = value.get("returncode")
    if returncode is not None and returncode != 0:
        return False
    status = value.get("status")
    if isinstance(status, int) and status >= 400 and value.get("passed") is not True:
        return False
    if value.get("error") and value.get("passed") is not True:
        return False
    if include_children:
        return all(
            _evidence_record_supports_pass(child, include_children=True)
            for child in value.values()
        )
    return True


def _evidence_path_supports_pass(citation: str, evidence_data: object) -> bool:
    values = resolve_evidence_path_values(citation, evidence_data)
    if values is None:
        return False
    return all(_evidence_record_supports_pass(value) for value in values[:-1]) and _evidence_record_supports_pass(
        values[-1],
        include_children=True,
    )


def _artifact_path_supports_pass(citation: str, evidence_data: object) -> bool:
    if isinstance(evidence_data, dict):
        if evidence_data.get("artifact_path") == citation:
            return _evidence_record_supports_pass(evidence_data, include_children=True)
        return any(_artifact_path_supports_pass(citation, value) for value in evidence_data.values())
    if isinstance(evidence_data, list):
        return any(_artifact_path_supports_pass(citation, value) for value in evidence_data)
    return False


def _evidence_key_mentioned(citation: str, key: str) -> bool:
    pattern = rf"(?<![A-Za-z0-9_/@.\-]){re.escape(key)}(?![A-Za-z0-9_/@.\-])"
    return re.search(pattern, citation) is not None


def _embedded_evidence_paths(citation: str, evidence_data: object) -> list[str]:
    if not isinstance(evidence_data, dict):
        return []
    paths: list[str] = []
    for root, records in evidence_data.items():
        if not isinstance(root, str) or not isinstance(records, dict):
            continue
        for key in sorted(records, key=len, reverse=True):
            if isinstance(key, str) and _evidence_key_mentioned(citation, key):
                paths.append(f"{root}.{key}")
    seen: set[str] = set()
    unique: list[str] = []
    for path in paths:
        if path not in seen:
            unique.append(path)
            seen.add(path)
    return unique


def _evidence_citation_supports_pass(citation: object, evidence_data: object | None) -> bool:
    if not _has_specific_evidence(citation):
        return False
    assert isinstance(citation, str)
    if evidence_data is None:
        return True
    stripped = citation.strip()
    if _evidence_path_supports_pass(stripped, evidence_data) or _artifact_path_supports_pass(stripped, evidence_data):
        return True
    embedded_paths = _embedded_evidence_paths(stripped, evidence_data)
    return bool(embedded_paths) and all(_evidence_path_supports_pass(path, evidence_data) for path in embedded_paths)


def _evidence_claims_deterministic_pass(evidence: object, feedback: object) -> bool:
    if not isinstance(evidence, str):
        return False
    text = f"{evidence}\n{feedback if isinstance(feedback, str) else ''}".lower()
    compact = re.sub(r"\s+", "", text)
    if "passed:true" in compact:
        return True
    if re.search(r"\breturncode\s*=?\s*0\b", text) and "all success criteria pass" in text:
        return True
    deterministic_pass_phrases = (
        "all success criteria pass",
        "all success criteria passed",
        "all success criteria satisfied",
        "all success criteria are satisfied",
        "all five success criteria pass",
        "all five success criteria passed",
        "all five success criteria satisfied",
        "all five success criteria are satisfied",
        "all criteria pass",
        "all criteria passed",
        "all criteria satisfied",
        "sprint contract satisfied",
    )
    if any(phrase in text for phrase in deterministic_pass_phrases):
        return True
    return False


def _expects_mock_no_side_effect_boundary(*values: object) -> bool:
    text = "\n".join(value for value in values if isinstance(value, str)).lower()
    if not text:
        return False
    boundary_terms = (
        "mock",
        "external side effect",
        "external side effects",
        "external provider",
        "external providers",
        "external services",
        "live provider",
        "live providers",
        "no external",
        "without external",
    )
    no_side_effect_terms = (
        "records no external side effects",
        "no external side effects",
        "does not call external",
        "does not connect",
        "does not contact",
        "do not contact",
        "never calls external",
    )
    return any(term in text for term in boundary_terms) and any(term in text for term in no_side_effect_terms)


def _strip_expected_no_side_effect_phrases(evidence: str) -> str:
    text = evidence.lower()
    no_side_effect_patterns = (
        r"\bdoes\s+not\s+save\b[^.;]*(?:external\s+(?:providers|services)|side\s+effects?|live\s+providers?)",
        r"\bdoes\s+not\s+(?:call|connect|contact|invoke|use)\b[^.;]*(?:external|providers?|services?|auth|storage|ocr|ai|notifications?|email|calendar|message|database|supabase)",
        r"\bdo\s+not\s+(?:call|connect|contact|invoke|use|write|save)\b[^.;]*(?:external|providers?|services?|auth|storage|ocr|ai|notifications?|email|calendar|message|database|supabase)",
        r"\bnever\s+(?:calls?|connects?|contacts?|invokes?|uses?|writes?|saves?)\b[^.;]*(?:external|providers?|services?|auth|storage|ocr|ai|notifications?|email|calendar|message|database|supabase)",
    )
    for pattern in no_side_effect_patterns:
        text = re.sub(pattern, "", text)
    return text


def _evidence_text_has_explicit_failure(evidence: str, *, allow_expected_no_side_effects: bool = False) -> bool:
    text = evidence.lower()
    if allow_expected_no_side_effects:
        text = _strip_expected_no_side_effect_phrases(text)
    failure_patterns = (
        r"\bno\s+evidence\s+(?:provided|available|collected|found)\b",
        r"\bmissing\b",
        r"\bnot\s+(?:present|rendered|implemented|available|found|working|wired|exposed|documented)\b",
        r"\bdoes\s+not\b",
        r"\bdid\s+not\b",
        r"\bunable\b",
        r"\btimed\s+out\b",
        r"\breturncode\s*[=:]\s*(?!0\b)\d+\b",
        r"\bpassed\s*[=:]\s*false\b",
        r"\bavailable\s*[=:]\s*false\b",
        r"\bcollection_failed\s*[=:]\s*true\b",
        r"\bmissing_executable\s*[=:]\s*true\b",
    )
    return any(re.search(pattern, text) for pattern in failure_patterns)


def _prose_evidence_supports_pass(
    evidence: object,
    evidence_data: object,
    *,
    allow_expected_no_side_effects: bool = False,
) -> bool:
    if not isinstance(evidence, str) or _evidence_text_has_explicit_failure(
        evidence,
        allow_expected_no_side_effects=allow_expected_no_side_effects,
    ):
        return False

    evidence_index = json.dumps(evidence_data, ensure_ascii=False, sort_keys=True).lower()
    tokens: set[str] = set()
    for match in re.finditer(r"""["']([^"']{4,120})["']""", evidence):
        tokens.add(match.group(1).strip().lower())
    for match in re.finditer(r"\b([A-Za-z][A-Za-z0-9]*(?:[A-Z][A-Za-z0-9]*)+[A-Za-z0-9]*)\b", evidence):
        tokens.add(match.group(1).lower())
    for match in re.finditer(r"\b([A-Z][A-Z0-9_]{3,})\b", evidence):
        tokens.add(match.group(1).lower())

    common_words = {
        "api",
        "auth",
        "ocr",
        "supabase",
        "database",
        "email",
        "calendar",
        "notifications",
    }
    meaningful_tokens = {token for token in tokens if len(token) >= 4 and token not in common_words}
    matches = [token for token in meaningful_tokens if token in evidence_index]
    return len(set(matches)) >= 2


def _collect_evidence_paths(value: object) -> list[str]:
    paths: list[str] = []
    if isinstance(value, dict):
        for key, child in value.items():
            if isinstance(child, str) and key.endswith("_path"):
                paths.append(child)
            paths.extend(_collect_evidence_paths(child))
    elif isinstance(value, list):
        for child in value:
            paths.extend(_collect_evidence_paths(child))
    return paths


def _artifact_hygiene_evidence_supports_pass(evidence: object, evidence_data: object) -> bool:
    if not isinstance(evidence, str):
        return False
    text = evidence.lower()
    if "harness-state/runs" not in text:
        return False
    if not re.search(
        r"\bno\b[^.;]{0,160}\b(?:evidence\s+)?artifacts?\b[^.;]{0,160}\b(?:repos/orbits|app repo|application repo)",
        text,
    ):
        return False
    if not re.search(r"\b(?:all|every)\b[^.;]{0,120}\b(?:evidence|artifact)", text):
        return False

    evidence_paths = _collect_evidence_paths(evidence_data)
    if not evidence_paths:
        return False
    return any("harness-state/runs" in path for path in evidence_paths) and not any(
        "repos/orbits" in path for path in evidence_paths
    )


def _should_correct_fail_to_pass(
    evidence: object,
    feedback: object,
    evidence_data: object | None,
    criterion_description: object = "",
) -> bool:
    if evidence_data is None:
        return False
    if not _evidence_claims_deterministic_pass(evidence, feedback):
        return False
    if _artifact_hygiene_evidence_supports_pass(evidence, evidence_data):
        return True
    allow_expected_no_side_effects = _expects_mock_no_side_effect_boundary(
        criterion_description,
        evidence,
        feedback,
    )
    return _evidence_citation_supports_pass(evidence, evidence_data) or _prose_evidence_supports_pass(
        evidence,
        evidence_data,
        allow_expected_no_side_effects=allow_expected_no_side_effects,
    )


def build_eval_result_from_grade(
    grade: dict,
    contract: SprintContract,
    pass_threshold: float,
    conditional_pass_threshold: float,
    evidence_data: dict | None = None,
) -> EvalResult:
    by_id = {item.get("id"): item for item in grade.get("contract_results", [])}
    contract_results: list[SuccessCriterion] = []
    for criterion in contract.success_criteria:
        raw = by_id.get(criterion.id, {})
        status = raw.get("status", "fail")
        if status not in {"pass", "fail"}:
            status = "fail"
        evidence = raw.get("evidence", "No evidence provided.")
        if (
            status == "pass"
            and not _evidence_citation_supports_pass(evidence, evidence_data)
            and not _should_correct_fail_to_pass(
                evidence,
                grade.get("feedback", ""),
                evidence_data,
                criterion.description,
            )
        ):
            status = "fail"
        elif status == "fail" and _should_correct_fail_to_pass(
            evidence,
            grade.get("feedback", ""),
            evidence_data,
            criterion.description,
        ):
            status = "pass"
        contract_results.append(
            SuccessCriterion(
                id=criterion.id,
                description=criterion.description,
                status=status,
                evidence=evidence,
            )
        )

    scores = grade.get("rubric_scores", {}) or {}
    numeric_scores = [_valid_score(scores.get(key)) for key in REQUIRED_RUBRIC_KEYS]
    average = sum(numeric_scores) / len(numeric_scores) if numeric_scores else 0.0
    all_pass = all(item.status == "pass" for item in contract_results)
    if not all_pass:
        verdict = "fail"
    elif average >= pass_threshold:
        verdict = "pass"
    elif average >= conditional_pass_threshold:
        verdict = "conditional_pass"
    else:
        verdict = "fail"
    return EvalResult(
        verdict=verdict,
        rubric_average=round(average, 2),
        contract_results=contract_results,
        feedback=grade.get("feedback", ""),
    )


def parse_grade(output: str) -> dict:
    try:
        return parse_first_json_object(output, "contract_results")
    except ValueError:
        raise RuntimeError(f"Evaluator did not return parseable JSON. Output tail:\n{output[-1000:]}") from None


def build_evaluator_prompt(
    spec: str,
    contract: SprintContract,
    app_url: str,
    evidence_text: str,
    artifact_dir: Path | None = None,
) -> str:
    prompt_path = Path(__file__).parents[1] / "prompts" / "evaluator.md"
    criteria = "\n".join(f"- {item.id}: {item.description}" for item in contract.success_criteria)
    return (
        f"{prompt_path.read_text()}\n\n"
        f"## App URL\n{app_url}\n\n"
        f"## Product Spec\n{spec[:8000]}\n\n"
        f"## Sprint {contract.sprint_number}: {contract.goal}\n{criteria}\n\n"
        f"## Collected Evidence JSON\n{evidence_text}\n\n"
        f"## Reviewer Artifact Policy\n"
        "Do not write supplemental artifacts. Use only the collected evidence JSON above.\n\n"
        "Output only this JSON block:\n"
        "```json\n"
        "{\n"
        '  "contract_results": [{"id": "SC-1", "status": "pass", "evidence": "specific evidence key/path"}],\n'
        '  "rubric_scores": {"C1": 3, "C2": 3, "C3": 3, "C4": 3, "C5": 3},\n'
        '  "feedback": "specific failures and fixes"\n'
        "}\n"
        "```"
    )


def run_evaluator(
    spec: str,
    contract: SprintContract,
    app_url: str,
    rubric_track: str = "A",
    cfg: HarnessConfig | None = None,
    project_dir: Path | None = None,
    evidence_dir: Path | None = None,
) -> EvalResult:
    cfg = cfg or HarnessConfig.load(Path(__file__).parents[1] / "config.yaml")
    project_dir = project_dir or Path.cwd()
    evidence_dir = evidence_dir or project_dir / cfg.workspace.evidence_root / f"sprint-{contract.sprint_number}"
    evidence_path = evidence_dir / "evidence.json"
    evidence_text = evidence_path.read_text() if evidence_path.exists() else "{}"
    try:
        evidence_data = json.loads(evidence_text)
    except json.JSONDecodeError:
        evidence_data = {}
    prompt = build_evaluator_prompt(spec, contract, app_url, evidence_text)
    logger = log.get()
    logger.info(
        "[Evaluator] start sprint=%s backend=%s model=%s evidence=%s prompt_chars=%s",
        contract.sprint_number,
        cfg.agents.evaluator.backend,
        cfg.agents.evaluator.model or "<sdk-default>",
        evidence_path,
        len(prompt),
    )
    if cfg.agents.evaluator.backend == "codex":
        output = run_codex(prompt, cfg.agents.evaluator, cwd=project_dir / cfg.workspace.app_root, timeout=900)
    elif cfg.agents.evaluator.backend in {"claude", "deepcode"}:
        output = _run_async(_run_evaluator_claude(prompt, project_dir / cfg.workspace.app_root, cfg))
    else:
        raise NotImplementedError(f"Unsupported evaluator backend: {cfg.agents.evaluator.backend}")
    result = build_eval_result_from_grade(
        parse_grade(output),
        contract,
        pass_threshold=cfg.verdict.pass_threshold,
        conditional_pass_threshold=cfg.verdict.conditional_pass_threshold,
        evidence_data=evidence_data,
    )
    logger.info("[Evaluator] result sprint=%s verdict=%s average=%.2f", contract.sprint_number, result.verdict, result.rubric_average)
    return result


async def _run_evaluator_claude(prompt: str, app_dir: Path, cfg: HarnessConfig) -> str:
    from claude_agent_sdk import AssistantMessage, ResultMessage, query

    options = build_claude_options(
        cfg.agents.evaluator,
        "You are the Evaluator agent. Return only the requested JSON block.",
        allowed_tools=[],
        permission_mode="bypassPermissions",
        cwd=str(app_dir),
        max_turns=110,
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
    log.get().info("[Evaluator:sdk] complete elapsed=%.1fs output=%s", time.monotonic() - started_at, log.compact(output, 500))
    return output
