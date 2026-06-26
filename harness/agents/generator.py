from __future__ import annotations

import asyncio
import json
import time
from pathlib import Path

from harness.claude_runner import build_claude_options
from harness.codex_runner import run_codex_in_isolated_app
from harness.config import HarnessConfig, SingleAgentConfig
from harness.git_safety import app_changed_files, sprint_committed_files
from harness.json_output import parse_first_json_object
from harness import log
from harness.models.state import HandoffState, SprintContract, format_handoff_for_prompt
from harness.workspace import path_protected


class SelfAssessResult(tuple):
    reviewer_failed: bool

    def __new__(cls, confident: bool, concerns: list[str], reviewer_failed: bool = False):
        result = super().__new__(cls, (confident, concerns))
        result.reviewer_failed = reviewer_failed
        return result


def _run_async(coro, timeout: int):
    return asyncio.run(asyncio.wait_for(coro, timeout=timeout))


def build_generator_prompt(
    spec: str,
    contract: SprintContract,
    handoff: HandoffState | None,
    strategic_framing: str | None,
    cfg: HarnessConfig,
) -> str:
    prompt_path = Path(__file__).parents[1] / "prompts" / "generator.md"
    criteria = "\n".join(f"- {item.id}: {item.description}" for item in contract.success_criteria)
    out_of_scope = "\n".join(f"- {item}" for item in contract.out_of_scope) or "- none"
    evidence = json.dumps(contract.evidence or {}, indent=2, ensure_ascii=False)
    file_boundary = json.dumps(contract.file_boundary or {}, indent=2, ensure_ascii=False)
    allowlist = "\n".join(f"- {item}" for item in cfg.workspace.write_allowlist)
    protected = "\n".join(f"- {item}" for item in cfg.workspace.protected_paths)
    handoff_text = f"\n\n{format_handoff_for_prompt(handoff)}" if handoff else ""
    framing = f"\n\n## Strategic Framing\n{strategic_framing}" if strategic_framing else ""
    return (
        f"{prompt_path.read_text()}\n\n"
        f"## SPEC\n{spec}\n\n"
        f"## Sprint Contract Enforcement\n"
        f"Sprint {contract.sprint_number}: {contract.goal}\n\n"
        f"SUCCESS CRITERIA:\n{criteria}\n\n"
        f"OUT OF SCOPE:\n{out_of_scope}\n\n"
        f"EVIDENCE SURFACES:\n```json\n{evidence}\n```\n\n"
        f"FILE BOUNDARY:\n```json\n{file_boundary}\n```\n\n"
        f"## Workspace mode: {cfg.workspace.mode}\n"
        f"App root: {cfg.workspace.app_root}\n\n"
        f"Generator cwd is already the app root ({cfg.workspace.app_root}). Use app-relative paths "
        f"such as package.json, app/page.jsx, or src/... when editing files. "
        f"Do not create a nested {cfg.workspace.app_root} directory inside the app repo. "
        f"Allowlist entries are project-relative for harness enforcement; because your cwd is already "
        f"{cfg.workspace.app_root}, do not prefix edited paths with {cfg.workspace.app_root}.\n\n"
        f"You may edit only these paths:\n{allowlist}\n\n"
        f"You must never edit these paths:\n{protected}\n\n"
        f"reference-only repo: repos/tokyo-business-connect may be read for patterns, "
        f"but it is protected and must not receive implementation changes.\n\n"
        f"The harness collects iteration artifacts under {cfg.workspace.artifact_root}/runs/<run-id>/"
        f"sprint-{contract.sprint_number}/iter-M/ and writes logs under {cfg.workspace.log_root}. "
        f"Do not write harness artifacts yourself: no screenshots, browser "
        f"traces, reports, temp files, eval JSON, verification JSON, or manifests in app source, docs, "
        f"public assets, the repo root, {cfg.workspace.artifact_root}, {cfg.workspace.tmp_root}, or "
        f"{cfg.workspace.log_root}.{handoff_text}{framing}\n\n"
        f"Implement Sprint {contract.sprint_number}: {contract.goal}"
    )


def run_generator(
    spec: str,
    contract: SprintContract,
    project_dir: Path,
    handoff: HandoffState | None = None,
    strategic_framing: str | None = None,
    cfg: HarnessConfig | None = None,
) -> str:
    cfg = cfg or HarnessConfig.load(Path(__file__).parents[1] / "config.yaml")
    app_dir = project_dir / cfg.workspace.app_root
    app_dir.mkdir(parents=True, exist_ok=True)
    prompt = build_generator_prompt(spec, contract, handoff, strategic_framing, cfg)
    logger = log.get()
    logger.info(
        "[Generator] start sprint=%s backend=%s model=%s cwd=%s prompt_chars=%s",
        contract.sprint_number,
        cfg.agents.generator.backend,
        cfg.agents.generator.model or "<sdk-default>",
        app_dir,
        len(prompt),
    )
    if cfg.agents.generator.backend == "codex":
        return run_codex_in_isolated_app(prompt, cfg.agents.generator, app_dir=app_dir, timeout=cfg.loop.generator_timeout_seconds)
    if cfg.agents.generator.backend not in {"claude", "deepcode"}:
        raise NotImplementedError(f"Unsupported generator backend: {cfg.agents.generator.backend}")
    return _run_async(_run_generator_claude(prompt, app_dir, cfg), timeout=cfg.loop.generator_timeout_seconds)


async def _run_generator_claude(prompt: str, app_dir: Path, cfg: HarnessConfig) -> str:
    from claude_agent_sdk import AssistantMessage, ResultMessage, query

    options = build_claude_options(
        cfg.agents.generator,
        "You are the Generator agent. Follow the prompt and report a concise summary.",
        allowed_tools=["Write", "Read", "Edit", "Bash", "Glob"],
        permission_mode="bypassPermissions",
        cwd=str(app_dir),
        max_turns=cfg.loop.generator_max_turns,
    )
    summary = ""
    started_at = time.monotonic()
    async for message in query(prompt=prompt, options=options):
        if isinstance(message, AssistantMessage):
            for block in message.content:
                text = getattr(block, "text", "")
                if text:
                    summary = text
        elif isinstance(message, ResultMessage):
            summary = getattr(message, "result", "") or summary
    log.get().info("[Generator:sdk] complete elapsed=%.1fs summary=%s", time.monotonic() - started_at, log.compact(summary, 500))
    return summary


def build_handoff(sprint_number: int, project_dir: Path, generator_summary: str, cfg: HarnessConfig) -> HandoffState:
    app_dir = project_dir / cfg.workspace.app_root
    files_changed = sorted(
        set(app_changed_files(project_dir, cfg))
        | set(sprint_committed_files(project_dir, cfg, sprint_number))
    )
    return HandoffState(
        sprint_number=sprint_number,
        project_dir=str(app_dir),
        partial_features=[generator_summary[:2000]],
        files_changed=files_changed,
        run_commands=["npm run dev", "npm run build", "npm test"],
    )


def build_self_assess_prompt(
    spec: str,
    contract: SprintContract,
    files_changed: list[str],
    generator_summary: str,
    deterministic_concerns: list[str],
    cfg: HarnessConfig,
) -> str:
    criteria = "\n".join(f"- {item.id}: {item.description}" for item in contract.success_criteria)
    changed = "\n".join(f"- {path}" for path in files_changed) or "- none"
    concerns = "\n".join(f"- {item}" for item in deterministic_concerns) or "- none"
    return (
        "You are the Generator self-assessment reviewer. Independently inspect whether the "
        "Generator output is ready for Evaluator review.\n\n"
        f"App root: {cfg.workspace.app_root}\n"
        "You may read files, but must not run shell commands or edit files.\n\n"
        f"## SPEC\n{spec[:8000]}\n\n"
        f"## Sprint {contract.sprint_number}: {contract.goal}\n"
        f"SUCCESS CRITERIA:\n{criteria}\n\n"
        f"## Files Changed\n{changed}\n\n"
        f"## Generator Summary\n{generator_summary[:4000]}\n\n"
        f"## Deterministic Harness Concerns\n{concerns}\n\n"
        "## Gate Scope\n"
        "- Do not require command output, API/browser probes, git diffs, commit hashes, or test logs in the Generator summary; "
        "the harness collects that deterministic evidence after this self-assessment.\n"
        "- Files Changed is the current sprint file set: uncommitted app changes plus files from local WIP/complete commits "
        "for this same sprint. Treat it as cumulative across sprint iterations, not only the latest diff.\n"
        "- File boundary and owned paths are an allowlist, not a required edit list. "
        "Do not mark confident=false only because an allowed file was not changed, omitted from the summary, "
        "or explicitly preserved when the satisfied criteria did not require edits to that file.\n"
        "- Mark confident=false only for concrete missing implementation, contract boundary violations, protected-file changes, "
        "or source-level issues that must be fixed before evidence collection.\n"
        "- Non-blocking notes, acceptable mock-first gaps, and evidence-timing concerns should not appear in concerns.\n\n"
        "Return only this JSON block:\n"
        "```json\n"
        "{\n"
        '  "confident": false,\n'
        '  "concerns": ["specific missing implementation, evidence, command, or boundary issue"]\n'
        "}\n"
        "```"
    )


def _is_nonblocking_self_assess_concern(concern: str) -> bool:
    text = concern.lower()
    evidence_timing_phrases = (
        "explicit exit-code evidence",
        "does not provide explicit",
        "did not attach a git diff",
        "git diff or commit hash",
        "commit hash",
        "no-op handoff",
        "must be verified against the actual repo state",
        "independently confirmed",
        "test count claim",
        "cannot reproduce without re-running",
        "no test output is included",
        "only restated summary claims",
        "generator summary's 'files changed' omits",
        "generator summary omits",
        "missing summary coverage",
        "generator summary claims only",
        "without inspecting diffs it cannot be verified",
        "cannot verify files exist without shell access",
        "all summary claims are self-reported with no verifiable evidence",
        "self-reported with no verifiable evidence",
        "/private/tmp/orbit-codex-app",
        "worktree mirror",
        "different temp worktree",
        "temporary worktree",
    )
    if any(phrase in text for phrase in evidence_timing_phrases):
        return True
    if (
        "contract file boundary includes" in text
        and ("no changes were needed" in text or "omitting the file" in text)
    ):
        return True
    if (
        "spec 'files changed' lists" in text
        and ("generator summary claims" in text or "generator summary" in text)
        and ("unaddressed" in text or "omits" in text or "omitting" in text)
    ):
        return True
    if "appears satisfied" in text:
        return True
    if "acceptable" in text and "worth flagging" in text:
        return True
    if "is met" in text and "reviewer should note" in text:
        return True
    return False


def parse_self_assess_review(output: str) -> tuple[bool, list[str]]:
    try:
        review = parse_first_json_object(output, "confident")
    except ValueError:
        raise RuntimeError(f"Self-assessment did not return parseable JSON. Output tail:\n{output[-1000:]}")
    concerns = [str(item) for item in (review.get("concerns") or []) if str(item).strip()]
    return bool(review.get("confident", False)), concerns


def _self_assess_agent_config(cfg: HarnessConfig) -> SingleAgentConfig:
    return SingleAgentConfig(
        backend="claude",
        model=cfg.agents.generator.self_assess_model or cfg.agents.planner.model,
        max_tokens=2048,
    )


def _run_self_assess_claude(prompt: str, agent_cfg: SingleAgentConfig, app_dir: Path, timeout: int) -> str:
    return _run_async(_run_self_assess_claude_async(prompt, agent_cfg, app_dir), timeout=timeout)


async def _run_self_assess_claude_async(prompt: str, agent_cfg: SingleAgentConfig, app_dir: Path) -> str:
    from claude_agent_sdk import AssistantMessage, ResultMessage, query

    options = build_claude_options(
        agent_cfg,
        "You are the Generator self-assessment reviewer. Return only the requested JSON block.",
        allowed_tools=["Read", "Glob"],
        disallowed_tools=["Bash"],
        permission_mode="bypassPermissions",
        cwd=str(app_dir),
        max_turns=30,
    )
    output = ""
    async for message in query(prompt=prompt, options=options):
        if isinstance(message, AssistantMessage):
            for block in message.content:
                text = getattr(block, "text", "")
                if text:
                    output = text
        elif isinstance(message, ResultMessage):
            output = getattr(message, "result", "") or output
    return output


def self_assess(
    spec: str,
    contract: SprintContract,
    files_changed: list[str],
    generator_summary: str,
    cfg: HarnessConfig,
    project_dir: Path,
) -> SelfAssessResult:
    concerns: list[str] = []
    app_dir = project_dir / cfg.workspace.app_root
    if not (app_dir / "package.json").exists():
        concerns.append(f"Missing {cfg.workspace.app_root}/package.json.")
    for changed in files_changed:
        if path_protected(changed, cfg.workspace.protected_paths):
            concerns.append(f"Changed protected path: {changed}")
    if not files_changed:
        concerns.append("No changed app files were reported for this sprint.")
    prompt = build_self_assess_prompt(spec, contract, files_changed, generator_summary, concerns, cfg)
    agent_cfg = _self_assess_agent_config(cfg)
    reviewer_failed = False
    try:
        review_confident, review_concerns = parse_self_assess_review(
            _run_self_assess_claude(prompt, agent_cfg, app_dir, timeout=cfg.loop.self_assess_timeout_seconds)
        )
    except Exception as exc:
        review_confident = True
        review_concerns = []
        reviewer_failed = True
        log.get().info("[SelfAssess] reviewer_failed_nonblocking=%s: %s", type(exc).__name__, exc)
    ignored_review_concerns = [item for item in review_concerns if _is_nonblocking_self_assess_concern(item)]
    blocking_review_concerns = [
        item for item in review_concerns if item not in ignored_review_concerns and item not in concerns
    ]
    all_concerns = concerns + blocking_review_concerns
    review_gate_passed = review_confident or not blocking_review_concerns
    confident = not concerns and review_gate_passed and not blocking_review_concerns
    log.get().info(
        "[SelfAssess] sprint=%s confident=%s concerns=%s",
        contract.sprint_number,
        confident,
        all_concerns,
    )
    if ignored_review_concerns:
        log.get().info("[SelfAssess] ignored_nonblocking_concerns=%s", ignored_review_concerns)
    return SelfAssessResult(confident, all_concerns, reviewer_failed=reviewer_failed)
