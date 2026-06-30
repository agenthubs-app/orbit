from __future__ import annotations

import argparse
import json
import os
import re
import signal
import socket
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit
from urllib.request import urlopen

from harness.agents.planner import run_planner
from harness.agents.evaluator import run_evaluator
from harness.agents.generator import build_handoff, fingerprint_app_changed_files, run_generator, self_assess
from harness.agents.verifier import run_verifier
from harness.config import HarnessConfig
from harness.contract_review import assert_contract_reviewed
from harness.evidence import collect_evidence, run_recorded
from harness.git_safety import (
    app_status_files,
    commit_app_changes,
    ensure_app_branch,
    ensure_app_remote,
    protected_repo_violations,
    push_app_changes,
    record_app_git_evidence,
)
from harness.json_output import parse_first_json_contract_seed_value
from harness import log
from harness.models.state import (
    EvalResult,
    ExperienceIssue,
    HandoffState,
    SprintContract,
    SuccessCriterion,
    VerificationResult,
)
from harness.preflight import run_preflight, write_preflight_report
from harness.strategy import decide_strategy
from harness.workspace import (
    apply_retention,
    clean_tmp,
    ensure_project_layout,
    file_fingerprint,
    find_artifact_hygiene_violations,
    path_protected,
    protected_workspace_changes,
    protected_workspace_snapshot,
    path_allowed,
    workspace_path_issues,
)

PROJECT_DIR = Path(__file__).resolve().parents[1]
DESIGN_SPEC_RELATIVE = Path("docs") / "designs" / "inital_design.md"

# harness.py 是长跑 agent 系统的主编排层。
# 主要流程是：Planner 产出 SPEC 和 sprint contract seeds，
# Generator 按 contract 改 app，Evaluator/Verifier 只读审查，
# Evidence/Git 层负责把可复核证据和 app repo 提交边界固定下来。

def new_run_id() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f")


def load_product_context(project_dir: Path) -> str:
    design = project_dir / DESIGN_SPEC_RELATIVE
    if design.exists():
        return design.read_text()
    return "Orbit is a relationship-management web service for event-grounded business connections."


def save_bootstrap_product_context(project_dir: Path, cfg: HarnessConfig, product_context: str) -> None:
    paths = ensure_project_layout(project_dir, cfg)
    paths["state"].joinpath("bootstrap-product-context.md").write_text(product_context.strip())


def strip_spec_complete(spec: str) -> str:
    return spec.replace("SPEC_COMPLETE", "").strip()


def extract_sprint_plan(spec: str) -> str:
    clean = strip_spec_complete(spec)
    marker = "## Sprint Definitions"
    index = clean.find(marker)
    if index < 0:
        return clean
    contract_marker = "\n## Sprint Contract Seeds"
    contract_index = clean.find(contract_marker, index)
    if contract_index < 0:
        return clean[index:].strip()
    return clean[index:contract_index].strip()


def extract_spec_overview(spec: str) -> str:
    # spec.md 只保存执行概览；每个 sprint 的细节以 contract JSON 为准。
    # 这样可以避免 Generator 误把长篇规划文本当作权威需求来源。
    clean = strip_spec_complete(spec)
    marker = "## Sprint Definitions"
    index = clean.find(marker)
    if index < 0:
        contract_marker = "\n## Sprint Contract Seeds"
        contract_index = clean.find(contract_marker)
        if contract_index < 0:
            return clean
        return clean[:contract_index].strip()
    overview = clean[:index].strip()
    boundary = (
        "## Sprint Execution Boundary\n\n"
        "`harness-state/spec.md` is intentionally a concise execution overview. "
        "Do not use it as the source of detailed sprint implementation requirements. "
        "Use `harness-state/contracts/contract-sprint-N.json` as the authoritative "
        "contract for each sprint, including success criteria, evidence, file "
        "boundaries, and mock-to-live replacement docs. Use `harness-state/sprints.md` "
        "only as a human-readable sprint index."
    )
    if not overview:
        return boundary
    return f"{overview}\n\n{boundary}"


def extract_contract_seed_payload(spec: str) -> list[dict]:
    # Planner 必须在固定标题下输出 JSON contract seeds。
    # 这里做结构化解析，禁止后续流程从自由文本里猜 sprint 范围。
    marker = "## Sprint Contract Seeds"
    index = spec.find(marker)
    if index < 0:
        raise ValueError("Planner output must include ## Sprint Contract Seeds.")
    section = spec[index:]
    try:
        data = parse_first_json_contract_seed_value(section)
    except ValueError as exc:
        raise ValueError("Planner output must include a JSON contract seed block under ## Sprint Contract Seeds.") from exc
    if isinstance(data, dict):
        raw_contracts = data.get("contracts")
    else:
        raw_contracts = data
    if not isinstance(raw_contracts, list):
        raise ValueError("Sprint Contract Seeds JSON must be a list or an object with a contracts list.")
    return raw_contracts


def _criteria_from_raw_contract(raw: dict, sprint_number: int) -> list[SuccessCriterion]:
    raw_criteria = raw.get("success_criteria", [])
    if raw_criteria is None:
        raw_criteria = []
    if not isinstance(raw_criteria, list):
        raise ValueError(f"Planner contract for sprint {sprint_number} success_criteria must be a list.")
    criteria: list[SuccessCriterion] = []
    for index, item in enumerate(raw_criteria, start=1):
        if not isinstance(item, dict):
            raise ValueError(f"Planner contract for sprint {sprint_number} success_criteria[{index}] must be an object.")
        try:
            description = item["description"]
        except KeyError as exc:
            raise ValueError(f"Planner contract for sprint {sprint_number} success_criteria[{index}] must include description.") from exc
        criteria.append(
            SuccessCriterion(
                id=item.get("id") or f"SC-{index}",
                description=description,
            )
        )
    return criteria


def _parse_sprint_number(raw: dict) -> int:
    value = raw.get("sprint_number")
    if isinstance(value, bool):
        raise ValueError("sprint_number must be a positive integer.")
    if isinstance(value, int):
        sprint_number = value
    elif isinstance(value, str) and value.strip().isdigit():
        sprint_number = int(value)
    else:
        raise ValueError("sprint_number must be a positive integer.")
    if sprint_number <= 0:
        raise ValueError("sprint_number must be a positive integer.")
    return sprint_number


def contracts_from_planner_spec(spec: str) -> list[SprintContract]:
    # 将 Planner 的原始 JSON 转成强类型 SprintContract，并立即做 contract review。
    # 只有被确认的 contract 才能进入 generator/evaluator/verifier loop。
    contracts: list[SprintContract] = []
    raw_contracts = extract_contract_seed_payload(spec)
    if not raw_contracts:
        raise ValueError("Planner output must include at least one sprint contract.")
    seen_sprints: set[int] = set()
    for raw_index, raw in enumerate(raw_contracts, start=1):
        if not isinstance(raw, dict):
            raise ValueError(f"Planner contract seeds contracts[{raw_index}] must be an object.")
        sprint_number = _parse_sprint_number(raw)
        if sprint_number in seen_sprints:
            raise ValueError(f"Duplicate sprint_number in Planner contract seeds: {sprint_number}.")
        seen_sprints.add(sprint_number)
        criteria = _criteria_from_raw_contract(raw, sprint_number)
        if not criteria:
            raise ValueError(f"Planner contract for sprint {raw.get('sprint_number')} has no success criteria.")
        contract = SprintContract(
            sprint_number=sprint_number,
            goal=raw.get("goal"),
            success_criteria=criteria,
            out_of_scope=raw.get("out_of_scope", []),
            evidence=raw.get("evidence", {}),
            file_boundary=raw.get("file_boundary", {}),
            confirmed=True,
        )
        assert_contract_reviewed(contract)
        contracts.append(contract)
    return sorted(contracts, key=lambda contract: contract.sprint_number)


def assert_unique_positive_sprint_numbers(contracts: list[SprintContract]) -> None:
    seen_sprints: set[int] = set()
    for contract in contracts:
        if not isinstance(contract.sprint_number, int) or isinstance(contract.sprint_number, bool) or contract.sprint_number <= 0:
            raise ValueError("sprint_number must be a positive integer.")
        if contract.sprint_number in seen_sprints:
            raise ValueError(f"Duplicate sprint_number in plan state: {contract.sprint_number}.")
        seen_sprints.add(contract.sprint_number)


def save_planned_state(project_dir: Path, cfg: HarnessConfig, spec: str, contracts: list[SprintContract]) -> None:
    if not contracts:
        raise ValueError("Planner state requires at least one sprint contract.")
    assert_unique_positive_sprint_numbers(contracts)
    for contract in contracts:
        assert_contract_reviewed(contract)
    paths = ensure_project_layout(project_dir, cfg)
    clean_spec = strip_spec_complete(spec)
    paths["state"].joinpath("spec.md").write_text(extract_spec_overview(clean_spec))
    paths["state"].joinpath("sprints.md").write_text(extract_sprint_plan(spec))
    for old_contract in paths["contracts"].glob("contract-sprint-*.json"):
        old_contract.unlink()
    contract_paths: list[str] = []
    for contract in contracts:
        contract_path = paths["contracts"] / f"contract-sprint-{contract.sprint_number}.json"
        contract.save(contract_path)
        contract_paths.append(contract_path.relative_to(project_dir).as_posix())
    manifest = {
        "source": "planner",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "spec_path": paths["state"].joinpath("spec.md").relative_to(project_dir).as_posix(),
        "sprints_path": paths["state"].joinpath("sprints.md").relative_to(project_dir).as_posix(),
        "contracts": contract_paths,
        "contract_count": len(contract_paths),
    }
    paths["state"].joinpath("plan-manifest.json").write_text(json.dumps(manifest, indent=2))


def _manifest_project_path(project_dir: Path, value: object) -> Path | None:
    if not isinstance(value, str) or not value.strip():
        return None
    relative = Path(value)
    if relative.is_absolute() or ".." in relative.parts:
        return None
    root = project_dir.resolve()
    candidate = (project_dir / relative).resolve()
    try:
        candidate.relative_to(root)
    except ValueError:
        return None
    return candidate


def _manifest_relative_path(project_dir: Path, path: Path) -> str:
    return path.relative_to(project_dir).as_posix()


def _manifest_contract_valid(project_dir: Path, cfg: HarnessConfig, path: Path) -> bool:
    paths = ensure_project_layout(project_dir, cfg)
    try:
        contract_rel = path.relative_to(paths["contracts"].resolve())
    except ValueError:
        return False
    if contract_rel.parent != Path(".") or not re.fullmatch(r"contract-sprint-\d+\.json", contract_rel.name):
        return False
    try:
        contract = SprintContract.load(path)
    except (KeyError, TypeError, ValueError, json.JSONDecodeError):
        return False
    if not contract.confirmed:
        return False
    expected_name = f"contract-sprint-{contract.sprint_number}.json"
    if contract_rel.name != expected_name:
        return False
    try:
        assert_contract_reviewed(contract)
    except ValueError:
        return False
    return True


def plan_manifest_valid(project_dir: Path, cfg: HarnessConfig) -> bool:
    # manifest 是“当前计划可复用”的信任根。
    # 如果 spec、sprints 或 contract 文件缺失/越界/未 review，就必须重新规划。
    paths = ensure_project_layout(project_dir, cfg)
    manifest_path = paths["state"] / "plan-manifest.json"
    if not manifest_path.exists():
        return False
    try:
        manifest = json.loads(manifest_path.read_text())
    except json.JSONDecodeError:
        return False
    if manifest.get("source") != "planner":
        return False
    spec_path = _manifest_project_path(project_dir, manifest.get("spec_path"))
    if spec_path is None or not spec_path.exists():
        return False
    sprints_path = _manifest_project_path(project_dir, manifest.get("sprints_path"))
    if sprints_path is None or not sprints_path.exists():
        return False
    contracts = manifest.get("contracts", [])
    if not isinstance(contracts, list) or not contracts:
        return False
    if manifest.get("contract_count") != len(contracts):
        return False
    contract_paths = [_manifest_project_path(project_dir, path) for path in contracts]
    return all(
        path is not None
        and path.exists()
        and _manifest_contract_valid(project_dir, cfg, path)
        for path in contract_paths
    )


def planner_manifest_contract_paths(project_dir: Path, cfg: HarnessConfig) -> set[str]:
    if not plan_manifest_valid(project_dir, cfg):
        return set()
    paths = ensure_project_layout(project_dir, cfg)
    manifest_path = paths["state"] / "plan-manifest.json"
    if not manifest_path.exists():
        return set()
    try:
        manifest = json.loads(manifest_path.read_text())
    except json.JSONDecodeError:
        return set()
    contracts = manifest.get("contracts", [])
    if not isinstance(contracts, list):
        return set()
    contract_paths = [_manifest_project_path(project_dir, path) for path in contracts]
    return {
        _manifest_relative_path(project_dir, path)
        for path in contract_paths
        if path is not None and _manifest_contract_valid(project_dir, cfg, path)
    }


def build_planner_brief(project_dir: Path, cfg: HarnessConfig, brief: str | None = None) -> str:
    design_path = project_dir / DESIGN_SPEC_RELATIVE
    product_context = load_product_context(project_dir)
    return (
        f"User brief:\n{brief or 'Plan the Orbits web service from the current Orbit product design.'}\n\n"
        f"Project context source: {DESIGN_SPEC_RELATIVE.as_posix()}\n"
        f"Development target: {cfg.workspace.app_root}\n"
        f"Reference-only repo: repos/tokyo-business-connect\n"
        f"Artifact roots: {cfg.workspace.artifact_root}, {cfg.workspace.log_root}\n\n"
        f"Current product context from {design_path}:\n{product_context[:24000]}\n\n"
        "Write the complete SPEC and Sprint Contract Seeds now. End with SPEC_COMPLETE."
    )


def run_planning_loop(
    project_dir: Path,
    cfg: HarnessConfig,
    brief: str | None = None,
    planner_func=run_planner,
) -> list[SprintContract]:
    # Planner loop 只允许有限轮修正：缺 SPEC_COMPLETE 或 contract JSON 不合法时，
    # 把失败原因反馈给 Planner，让它重新输出完整 SPEC，而不是让 harness 猜补。
    paths = ensure_project_layout(project_dir, cfg)
    ensure_development_repo(project_dir, cfg)
    prompt = build_planner_brief(project_dir, cfg, brief)
    reply, session_id = planner_func(prompt, session_id=None, cfg=cfg)
    replies = [reply]
    full_reply = "\n\n".join(part.strip() for part in replies if part.strip())
    attempts = 1
    max_attempts = 1 + cfg.loop.contract_review_rounds
    while attempts <= max_attempts:
        if "SPEC_COMPLETE" not in full_reply:
            if attempts >= max_attempts:
                raise RuntimeError(f"Planner did not produce SPEC_COMPLETE after {max_attempts} attempts.")
            if sys.stdin.isatty():
                continuation = input("[Planner asks]: ").strip()
            else:
                continuation = "Continue the SPEC. Include Sprint Contract Seeds JSON and end with SPEC_COMPLETE."
            attempts += 1
            reply, session_id = planner_func(continuation, session_id=session_id, cfg=cfg)
            replies.append(reply)
            full_reply = "\n\n".join(part.strip() for part in replies if part.strip())
            continue
        try:
            contracts = contracts_from_planner_spec(full_reply)
        except ValueError as exc:
            if attempts >= max_attempts:
                raise
            invalid_path = paths["tmp"] / f"planner-invalid-attempt-{attempts}.md"
            invalid_path.write_text(full_reply)
            invalid_excerpt = full_reply[-12000:] if len(full_reply) > 12000 else full_reply
            continuation = (
                "Planner output failed contract parsing/review:\n"
                f"{exc}\n\n"
                "Previous invalid Planner output:\n"
                "```markdown\n"
                f"{invalid_excerpt}\n"
                "```\n\n"
                "Return the complete corrected SPEC again, not a patch. Include the exact "
                "`## Sprint Contract Seeds` heading, exactly one fenced JSON contract block, "
                "valid reviewed contracts, and end with SPEC_COMPLETE."
            )
            attempts += 1
            reply, session_id = planner_func(continuation, session_id=session_id, cfg=cfg)
            replies = [reply]
            full_reply = "\n\n".join(part.strip() for part in replies if part.strip())
            continue
        save_planned_state(project_dir, cfg, full_reply, contracts)
        return contracts
    raise RuntimeError(f"Planner did not produce a reviewed plan after {max_attempts} attempts.")


def ensure_development_repo(project_dir: Path, cfg: HarnessConfig) -> Path:
    # app repo 是真正被 Generator 修改和提交的边界。
    # harness 自身、harness-state 和 reference-only repo 不属于实现写入面。
    app_dir = project_dir / cfg.workspace.app_root
    app_dir.mkdir(parents=True, exist_ok=True)

    readme = app_dir / "README.md"
    if not readme.exists():
        readme.write_text(
            "# Orbits\n\n"
            "This is the Git-maintained application repository built by the Orbit long-run harness.\n\n"
            "The harness itself lives outside this repo at the project root.\n"
        )

    gitignore = app_dir / ".gitignore"
    if not gitignore.exists():
        gitignore.write_text(
            "node_modules\n"
            ".next\n"
            "dist\n"
            "build\n"
            ".env\n"
            ".env.*\n"
            "npm-debug.log*\n"
        )

    if not (app_dir / ".git").exists():
        subprocess.run(["git", "init"], cwd=app_dir, check=True, capture_output=True, text=True)
    ensure_app_branch(project_dir, cfg)
    ensure_app_remote(project_dir, cfg)
    return app_dir


def seed_contracts(project_dir: Path, cfg: HarnessConfig) -> list[SprintContract]:
    contracts = [
        SprintContract(
            sprint_number=1,
            goal="Participant entry clarity",
            success_criteria=[
                SuccessCriterion(id="SC-1", description="Opening / shows a clear event-code or access-code entry path."),
                SuccessCriterion(id="SC-2", description="A participant can tell whether they are starting registration or returning to an event."),
                SuccessCriterion(id="SC-3", description="The entry flow preserves the event-scoped participant model described in the README."),
            ],
            out_of_scope=["billing", "new global person identity model", "organizer analytics redesign"],
            evidence={
                "routes": ["/", "/register", "/party"],
                "commands": [{"name": "test", "cmd": ["npm", "test"]}],
                "source_files": ["README.md", "app/page.jsx", "app/register/page.jsx"],
            },
            confirmed=True,
        ),
        SprintContract(
            sprint_number=2,
            goal="Relationship context depth",
            success_criteria=[
                SuccessCriterion(id="SC-1", description="Participant relationship surfaces explain why a connection exists."),
                SuccessCriterion(id="SC-2", description="Follow-up or next-action cues are visible in participant-facing relationship views."),
                SuccessCriterion(id="SC-3", description="Existing match, introduction, and connection APIs remain event scoped."),
            ],
            out_of_scope=["admin-only analytics", "calendar or email integrations"],
            evidence={
                "routes": ["/party", "/party/graph", "/home/cards"],
                "commands": [{"name": "test", "cmd": ["npm", "test"]}],
                "source_files": ["lib/matching.js", "lib/introductions.js", "lib/connections.js"],
            },
            confirmed=True,
        ),
        SprintContract(
            sprint_number=3,
            goal="Organizer trust and readiness",
            success_criteria=[
                SuccessCriterion(id="SC-1", description="Admin event management clearly communicates current event scope."),
                SuccessCriterion(id="SC-2", description="Organizer workflows handle missing or incomplete event data without a crash."),
                SuccessCriterion(id="SC-3", description="Build and test commands pass after the sprint."),
            ],
            out_of_scope=["new payment flows", "external CRM sync"],
            evidence={
                "routes": ["/admin/events", "/admin"],
                "commands": [{"name": "build", "cmd": ["npm", "run", "build"]}, {"name": "test", "cmd": ["npm", "test"]}],
                "source_files": ["app/admin/events/page.jsx", "lib/event-admin.js", "lib/admin-session.js"],
            },
            confirmed=True,
        ),
    ]
    paths = ensure_project_layout(project_dir, cfg)
    for contract in contracts:
        contract.save(paths["contracts"] / f"contract-sprint-{contract.sprint_number}.json")
    return contracts


def init(project_dir: Path, cfg: HarnessConfig) -> None:
    clean_tmp(project_dir, cfg)
    ensure_project_layout(project_dir, cfg)
    ensure_development_repo(project_dir, cfg)
    save_bootstrap_product_context(project_dir, cfg, load_product_context(project_dir))
    seed_contracts(project_dir, cfg)
    manifest = project_dir / cfg.workspace.artifact_root / "plan-manifest.json"
    if manifest.exists():
        manifest.unlink()
    for planner_output in ["spec.md", "sprints.md"]:
        path = project_dir / cfg.workspace.artifact_root / planner_output
        if path.exists():
            path.unlink()


def prepare_run_state(project_dir: Path, cfg: HarnessConfig, planner_func=run_planner, brief: str | None = None) -> None:
    # 每次 run 前先确认 plan state 是否可信；不可信则重新走 Planner。
    # 可信时只清理 tmp，保留已确认的 contracts 和历史证据。
    paths = ensure_project_layout(project_dir, cfg)
    ensure_development_repo(project_dir, cfg)
    if (
        brief is not None
        or not (paths["state"] / "spec.md").exists()
        or not any(paths["contracts"].glob("contract-sprint-*.json"))
        or not plan_manifest_valid(project_dir, cfg)
    ):
        run_planning_loop(project_dir, cfg, planner_func=planner_func, brief=brief)
        return
    clean_tmp(project_dir, cfg)


def load_contract(project_dir: Path, cfg: HarnessConfig, sprint: int) -> SprintContract:
    paths = ensure_project_layout(project_dir, cfg)
    contract_path = paths["contracts"] / f"contract-sprint-{sprint}.json"
    rel_path = contract_path.relative_to(project_dir).as_posix()
    if rel_path not in planner_manifest_contract_paths(project_dir, cfg):
        raise RuntimeError(f"{rel_path} is not listed in Planner manifest.")
    return SprintContract.load(contract_path)


def save_eval_result(
    project_dir: Path,
    cfg: HarnessConfig,
    sprint: int,
    iteration: int,
    result: EvalResult,
    run_id: str | None = None,
) -> None:
    paths = ensure_project_layout(project_dir, cfg, sprint=sprint, iteration=iteration if run_id else None, run_id=run_id)
    result.save(paths.get("eval_result", paths["evals"] / f"eval-sprint-{sprint}-iter-{iteration}.json"))


def save_verification_result(
    project_dir: Path,
    cfg: HarnessConfig,
    sprint: int,
    iteration: int,
    result: VerificationResult,
    run_id: str | None = None,
) -> None:
    paths = ensure_project_layout(project_dir, cfg, sprint=sprint, iteration=iteration if run_id else None, run_id=run_id)
    result.save(paths.get("verification_result", paths["verifications"] / f"verify-sprint-{sprint}-iter-{iteration}.json"))


def save_iteration_handoff(paths: dict[str, Path], contract: SprintContract, handoff: HandoffState) -> None:
    handoff.save(paths.get("handoff_result", paths["handoffs"] / f"handoff-sprint-{contract.sprint_number}.json"))


def failed_eval_result(contract: SprintContract, role: str, exc: Exception) -> EvalResult:
    failure = f"{role} failed: {type(exc).__name__}: {exc}"
    return EvalResult(
        verdict="fail",
        rubric_average=0.0,
        contract_results=[
            SuccessCriterion(
                id=criterion.id,
                description=criterion.description,
                status="fail",
                evidence=failure,
            )
            for criterion in contract.success_criteria
        ],
        feedback=failure,
    )


def failed_verification_result(role: str, exc: Exception) -> VerificationResult:
    failure = f"{role} failed: {type(exc).__name__}: {exc}"
    return VerificationResult(
        verdict="fail",
        experience_average=0.0,
        scores={},
        issues=[
            ExperienceIssue(
                id="UX-RUNTIME",
                severity="critical",
                user_impact="The harness could not complete user experience verification for this iteration.",
                evidence=failure,
                recommendation="Fix the verifier runtime, timeout, or JSON-output issue, then rerun the sprint.",
            )
        ],
        feedback=failure,
    )


def record_evidence_failure(
    contract: SprintContract,
    app_url: str,
    paths: dict[str, Path],
    exc: Exception,
) -> dict:
    failure = f"Evidence collection failed: {type(exc).__name__}: {exc}"
    record = {
        "sprint": contract.sprint_number,
        "goal": contract.goal,
        "app_url": app_url,
        "collection_failed": True,
        "error": failure,
        "commands": {},
        "navigation": {},
        "browser": {},
        "axe": {},
        "lighthouse": {},
        "api": {},
        "source_files": {},
        "notes": [failure],
    }
    paths["sprint_evidence"].mkdir(parents=True, exist_ok=True)
    (paths["sprint_evidence"] / "evidence.json").write_text(json.dumps(record, indent=2, ensure_ascii=False))
    return record


def save_git_operation(paths: dict[str, Path], name: str, result: dict) -> None:
    paths["git"].mkdir(parents=True, exist_ok=True)
    (paths["git"] / f"{name}.json").write_text(json.dumps(result, indent=2))


def assert_reviewer_artifact_boundary(
    project_dir: Path,
    cfg: HarnessConfig,
    paths: dict[str, Path],
    before: dict[str, str],
    after: dict[str, str],
    role: str,
    protected_app_before: dict[str, str] | None = None,
    protected_app_after: dict[str, str] | None = None,
    ignored_app_before: dict[str, str] | None = None,
    ignored_app_after: dict[str, str] | None = None,
    allowed_workspace_paths: set[str] | None = None,
    allowed_workspace_roots: list[str] | None = None,
) -> None:
    # Evaluator/Verifier 只能读 app 并写入受控证据目录。
    # 这个断言捕获任何越权文件写入，避免 reviewer 角色偷偷修改产品代码。
    changes = workspace_changes_except_paths(
        protected_workspace_changes(before, after),
        allowed_workspace_paths or set(),
        allowed_roots=allowed_workspace_roots,
    )
    protected_app_changes = protected_workspace_changes(protected_app_before or {}, protected_app_after or {})
    ignored_app_changes = protected_workspace_changes(ignored_app_before or {}, ignored_app_after or {})
    # Evaluator and Verifier are evidence-only reviewers. They may emit logs via the configured
    # log root, but they must not create supplemental evidence files.
    if (
        changes["added"]
        or changes["modified"]
        or changes["deleted"]
        or any(protected_app_changes.values())
        or any(ignored_app_changes.values())
    ):
        raise RuntimeError(
            f"{role} wrote outside allowed artifacts: "
            + json.dumps(
                {"workspace": changes, "protected_app": protected_app_changes, "ignored_app": ignored_app_changes},
                sort_keys=True,
            )
        )


def assert_no_workspace_changes(
    before: dict[str, str],
    after: dict[str, str],
    role: str,
    protected_app_before: dict[str, str] | None = None,
    protected_app_after: dict[str, str] | None = None,
    ignored_app_before: dict[str, str] | None = None,
    ignored_app_after: dict[str, str] | None = None,
    allowed_workspace_paths: set[str] | None = None,
    allowed_workspace_roots: list[str] | None = None,
) -> None:
    changes = workspace_changes_except_paths(
        protected_workspace_changes(before, after),
        allowed_workspace_paths or set(),
        allowed_roots=allowed_workspace_roots,
    )
    protected_app_changes = protected_workspace_changes(protected_app_before or {}, protected_app_after or {})
    ignored_app_changes = protected_workspace_changes(ignored_app_before or {}, ignored_app_after or {})
    if (
        changes["added"]
        or changes["modified"]
        or changes["deleted"]
        or any(protected_app_changes.values())
        or any(ignored_app_changes.values())
    ):
        raise RuntimeError(
            f"{role} modified workspace: "
            + json.dumps(
                {"workspace": changes, "protected_app": protected_app_changes, "ignored_app": ignored_app_changes},
                sort_keys=True,
            )
        )


def run_self_assess_read_only(
    spec: str,
    contract: SprintContract,
    files_changed: list[str],
    summary: str,
    cfg: HarnessConfig,
    project_dir: Path,
    allowed_workspace_roots: list[str] | None = None,
) -> tuple[bool, list[str]]:
    before = protected_workspace_snapshot(project_dir, cfg, excluded_roots=[cfg.workspace.log_root])
    protected_app_before = protected_app_snapshot(project_dir, cfg)
    ignored_app_before = ignored_app_snapshot(project_dir, cfg)
    result = self_assess(spec, contract, files_changed, summary, cfg, project_dir)
    after = protected_workspace_snapshot(project_dir, cfg, excluded_roots=[cfg.workspace.log_root])
    protected_app_after = protected_app_snapshot(project_dir, cfg)
    ignored_app_after = ignored_app_snapshot(project_dir, cfg)
    assert_no_workspace_changes(
        before,
        after,
        "Self-assessment",
        protected_app_before,
        protected_app_after,
        ignored_app_before,
        ignored_app_after,
        allowed_workspace_paths=concurrent_product_context_paths(cfg),
        allowed_workspace_roots=allowed_workspace_roots,
    )
    return result


class EvidenceBoundaryViolation(RuntimeError):
    """Raised when evidence collection mutates anything outside its iteration artifact root."""


def run_evidence_collection_bounded(
    project_dir: Path,
    app_url: str,
    contract: SprintContract,
    cfg: HarnessConfig,
    paths: dict[str, Path],
) -> dict:
    evidence_root = paths["sprint_evidence"].relative_to(project_dir).as_posix()
    allowed_roots = [cfg.workspace.log_root, evidence_root]
    before = protected_workspace_snapshot(project_dir, cfg, excluded_roots=allowed_roots)
    protected_app_before = protected_app_snapshot(project_dir, cfg)
    ignored_app_before = ignored_app_snapshot(project_dir, cfg)
    try:
        return collect_evidence(project_dir, app_url, contract, paths)
    finally:
        after = protected_workspace_snapshot(project_dir, cfg, excluded_roots=allowed_roots)
        protected_app_after = protected_app_snapshot(project_dir, cfg)
        ignored_app_after = ignored_app_snapshot(project_dir, cfg)
        changes = protected_workspace_changes(before, after)
        app_changes = protected_app_snapshot_changes(protected_app_before, protected_app_after)
        ignored_app_changes = protected_workspace_changes(ignored_app_before, ignored_app_after)
        if (
            changes["added"]
            or changes["modified"]
            or changes["deleted"]
            or any(app_changes.values())
            or any(ignored_app_changes.values())
        ):
            raise EvidenceBoundaryViolation(
                "Evidence collection modified workspace outside current evidence root: "
                + json.dumps(
                    {"workspace": changes, "protected_app": app_changes, "ignored_app": ignored_app_changes},
                    sort_keys=True,
                )
            )


class ManagedDevServer:
    def __init__(self, process: subprocess.Popen, log_handle, log_path: Path, app_url: str):
        self.process = process
        self.log_handle = log_handle
        self.log_path = log_path
        self.app_url = app_url


def prepare_app_dependencies(project_dir: Path, cfg: HarnessConfig, paths: dict[str, Path]) -> dict:
    app_dir = project_dir / cfg.workspace.app_root
    package_json = app_dir / "package.json"
    if not package_json.exists():
        return {"skipped": True, "reason": "package.json missing"}
    if (app_dir / "node_modules").exists():
        return {"skipped": True, "reason": "node_modules already exists"}
    return run_recorded(["npm", "install"], app_dir, paths["commands"], "dependency-install", timeout=900)


def app_url_ready(app_url: str, timeout_seconds: int = 60) -> bool:
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        try:
            with urlopen(app_url, timeout=5) as response:
                if 200 <= response.status < 500:
                    return True
        except Exception:
            time.sleep(1)
    return False


def _parse_lsof_listeners(output: str) -> list[dict[str, object]]:
    listeners: list[dict[str, object]] = []
    current: dict[str, object] | None = None
    for raw_line in output.splitlines():
        if not raw_line:
            continue
        tag = raw_line[0]
        value = raw_line[1:]
        if tag == "p":
            if current is not None:
                listeners.append(current)
            try:
                pid = int(value)
            except ValueError:
                current = None
            else:
                current = {"pid": pid, "command": "", "port": None}
        elif current is not None and tag == "c":
            current["command"] = value
        elif current is not None and tag == "n":
            match = re.search(r":(\d+)(?:\s|$)", value)
            if match:
                current["port"] = int(match.group(1))
    if current is not None:
        listeners.append(current)
    return [listener for listener in listeners if listener.get("port") is not None]


def _process_cwd(pid: int) -> str | None:
    try:
        result = subprocess.run(
            ["lsof", "-a", "-p", str(pid), "-d", "cwd", "-Fn"],
            text=True,
            capture_output=True,
        )
    except FileNotFoundError:
        return None
    if result.returncode != 0:
        return None
    for line in result.stdout.splitlines():
        if line.startswith("n"):
            return line[1:]
    return None


def _process_ppid(pid: int) -> int | None:
    try:
        result = subprocess.run(["ps", "-p", str(pid), "-o", "ppid="], text=True, capture_output=True)
    except FileNotFoundError:
        return None
    if result.returncode != 0:
        return None
    value = result.stdout.strip()
    if not value:
        return None
    try:
        return int(value)
    except ValueError:
        return None


def _process_command(pid: int) -> str:
    try:
        result = subprocess.run(["ps", "-p", str(pid), "-o", "command="], text=True, capture_output=True)
    except FileNotFoundError:
        return ""
    if result.returncode != 0:
        return ""
    return result.stdout.strip()


def _dev_server_process_tree(pid: int, cwd: str) -> list[int]:
    cwd_realpath = Path(cwd).resolve()
    pids = [pid]
    current = _process_ppid(pid)
    while current and current > 1 and current != os.getpid():
        parent_cwd = _process_cwd(current)
        if parent_cwd is None or Path(parent_cwd).resolve() != cwd_realpath:
            break
        command = _process_command(current).lower()
        if not any(token in command for token in ("next", "vite", "npm", "pnpm", "yarn", "node")):
            break
        pids.append(current)
        current = _process_ppid(current)
    return list(reversed(pids))


def _tcp_listeners() -> list[dict[str, object]]:
    try:
        result = subprocess.run(
            ["lsof", "-nP", "-iTCP", "-sTCP:LISTEN", "-Fpcn"],
            text=True,
            capture_output=True,
        )
    except FileNotFoundError:
        return []
    if result.returncode != 0:
        return []
    return _parse_lsof_listeners(result.stdout)


def _listener_cwd(listener: dict[str, object]) -> str | None:
    return _process_cwd(int(listener["pid"]))


def _listener_matches_app(listener: dict[str, object], app_realpath: Path) -> bool:
    cwd = _listener_cwd(listener)
    return cwd is not None and Path(cwd).resolve() == app_realpath


def _port_has_foreign_listener(app_dir: Path, port: int, listeners: list[dict[str, object]]) -> bool:
    app_realpath = app_dir.resolve()
    for listener in listeners:
        if int(listener["port"]) != port:
            continue
        if not _listener_matches_app(listener, app_realpath):
            return True
    return False


def _port_is_available(host: str, port: int) -> bool:
    bind_host = "::1" if ":" in host and host != "localhost" else host
    if bind_host == "localhost":
        bind_host = "127.0.0.1"
    with socket.socket(socket.AF_INET6 if ":" in bind_host else socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            sock.bind((bind_host, port))
        except OSError:
            return False
    return True


def _find_available_port(host: str, preferred_port: int) -> int:
    for candidate in range(preferred_port, preferred_port + 100):
        if _port_is_available(host, candidate):
            return candidate
    raise RuntimeError(f"No available app dev server port found near {preferred_port}.")


def _url_with_port(app_url: str, host: str, port: int) -> str:
    parsed = urlsplit(app_url)
    display_host = f"[{host}]" if ":" in host and not host.startswith("[") else host
    return urlunsplit((parsed.scheme or "http", f"{display_host}:{port}", parsed.path or "", parsed.query, parsed.fragment))


def stop_stale_app_dev_servers(app_dir: Path, target_port: int, paths: dict[str, Path]) -> list[dict[str, object]]:
    app_realpath = app_dir.resolve()
    stopped: list[dict[str, object]] = []
    seen: set[int] = set()
    for listener in _tcp_listeners():
        pid = int(listener["pid"])
        port = int(listener["port"])
        if pid in seen:
            continue
        cwd = _process_cwd(pid)
        if cwd is None:
            continue
        cwd_realpath = Path(cwd).resolve()
        same_app = cwd_realpath == app_realpath
        same_app_other_port = port != target_port and same_app
        if not same_app_other_port:
            continue
        kill_pids = [pid]
        for kill_pid in kill_pids:
            try:
                os.kill(kill_pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
            seen.add(kill_pid)
        stopped.append(
            {
                "pid": pid,
                "port": port,
                "cwd": cwd,
                "command": str(listener.get("command") or ""),
                "signal": "SIGTERM",
                "reason": "same-app-other-port",
                "killed_pids": kill_pids,
            }
        )

    if stopped:
        artifact_dir = paths["artifacts"]
        artifact_dir.mkdir(parents=True, exist_ok=True)
        (artifact_dir / "stale-dev-servers.json").write_text(
            json.dumps({"target_port": target_port, "stopped": stopped}, indent=2)
        )
    return stopped


def start_app_dev_server(
    project_dir: Path,
    cfg: HarnessConfig,
    app_url: str,
    paths: dict[str, Path],
) -> ManagedDevServer | None:
    app_dir = project_dir / cfg.workspace.app_root
    if not (app_dir / "package.json").exists():
        return None

    parsed = urlsplit(app_url)
    host = parsed.hostname or "127.0.0.1"
    port = parsed.port or (443 if parsed.scheme == "https" else 3000)
    paths["artifacts"].mkdir(parents=True, exist_ok=True)
    listeners = _tcp_listeners()
    actual_port = port
    actual_app_url = app_url
    port_conflict: dict[str, object] | None = None
    if _port_has_foreign_listener(app_dir, port, listeners):
        actual_port = _find_available_port(host, port + 1)
        actual_app_url = _url_with_port(app_url, host, actual_port)
        port_conflict = {
            "requested_app_url": app_url,
            "requested_port": port,
            "actual_app_url": actual_app_url,
            "actual_port": actual_port,
            "reason": "requested port is already owned by another project",
        }
        (paths["artifacts"] / "dev-server-port-conflict.json").write_text(json.dumps(port_conflict, indent=2))

    stop_stale_app_dev_servers(app_dir, actual_port, paths)
    if app_url_ready(actual_app_url, timeout_seconds=2):
        return None

    log_path = paths["artifacts"] / "dev-server.log"
    log_handle = log_path.open("a")
    cmd = ["npm", "run", "dev", "--", "--hostname", host, "--port", str(actual_port)]
    process = subprocess.Popen(
        cmd,
        cwd=app_dir,
        stdout=log_handle,
        stderr=subprocess.STDOUT,
        text=True,
    )
    server = ManagedDevServer(process, log_handle, log_path, actual_app_url)
    ready = app_url_ready(actual_app_url, timeout_seconds=90)
    record = {
        "cmd": cmd,
        "cwd": str(app_dir),
        "log_path": str(log_path),
        "ready": ready,
        "app_url": actual_app_url,
        "requested_app_url": app_url,
        "port_conflict": port_conflict,
        "returncode": process.poll(),
    }
    (paths["artifacts"] / "dev-server.json").write_text(json.dumps(record, indent=2))
    return server


def stop_app_dev_server(server: ManagedDevServer | object | None) -> None:
    if server is None:
        return
    process = getattr(server, "process", server)
    if isinstance(process, subprocess.Popen) and process.poll() is None:
        process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=10)
    log_handle = getattr(server, "log_handle", None)
    if log_handle is not None:
        try:
            log_handle.close()
        except Exception:
            pass


def assert_no_protected_app_changes(handoff: HandoffState, cfg: HarnessConfig) -> None:
    app_root = Path(cfg.workspace.app_root).as_posix().strip("/")
    if app_root and app_root != ".":
        nested_prefix = f"{app_root}/{app_root}/"
        nested_changes = sorted(path for path in handoff.files_changed if path.startswith(nested_prefix))
        if nested_changes:
            raise RuntimeError("Nested app root changed: " + ", ".join(nested_changes))

    protected_changes = sorted(
        path
        for path in handoff.files_changed
        if path_protected(path, cfg.workspace.protected_paths)
    )
    if protected_changes:
        raise RuntimeError("Protected app path changed: " + ", ".join(protected_changes))

    outside_allowlist = sorted(
        path
        for path in handoff.files_changed
        if not path_allowed(path, cfg.workspace.write_allowlist)
    )
    if outside_allowlist:
        raise RuntimeError("Outside write allowlist changed: " + ", ".join(outside_allowlist))


def _app_relative_changed_path(path: str, cfg: HarnessConfig) -> str | None:
    normalized = path.strip("/")
    app_root = Path(cfg.workspace.app_root).as_posix().strip("/")
    if not app_root or app_root == ".":
        return normalized
    if normalized == app_root:
        return ""
    prefix = f"{app_root}/"
    if normalized.startswith(prefix):
        return normalized[len(prefix) :]
    return None


def _file_boundary_matches(pattern: str, path: str) -> bool:
    normalized_pattern = pattern.strip("/")
    normalized_path = path.strip("/")
    if normalized_pattern.endswith("/**"):
        prefix = normalized_pattern[:-3].rstrip("/")
        return normalized_path == prefix or normalized_path.startswith(f"{prefix}/")
    return normalized_path == normalized_pattern


def _file_boundary_list(file_boundary: dict, key: str) -> list[str]:
    values = file_boundary.get(key, [])
    if not isinstance(values, list):
        return []
    return [value for value in values if isinstance(value, str) and value.strip()]


def contract_file_boundary_violations(
    contract: SprintContract,
    files_changed: list[str],
    cfg: HarnessConfig,
) -> list[str]:
    file_boundary = contract.file_boundary or {}
    if not isinstance(file_boundary, dict) or not file_boundary:
        return []
    owned_paths = _file_boundary_list(file_boundary, "owned_paths")
    shared_paths = _file_boundary_list(file_boundary, "allowed_shared_paths")
    forbidden_paths = _file_boundary_list(file_boundary, "forbidden_paths")
    allowed_paths = owned_paths + shared_paths
    if not allowed_paths:
        return []

    violations: list[str] = []
    for changed in files_changed:
        if runtime_app_artifact_path(changed, cfg):
            continue
        app_relative = _app_relative_changed_path(changed, cfg)
        if app_relative is None or not app_relative:
            continue
        if any(_file_boundary_matches(pattern, app_relative) for pattern in forbidden_paths):
            violations.append(f"{changed} ({app_relative}) is forbidden by sprint file_boundary.")
            continue
        if not any(_file_boundary_matches(pattern, app_relative) for pattern in allowed_paths):
            violations.append(f"{changed} ({app_relative}) is outside sprint file boundary.")
    return sorted(violations)


def assert_contract_file_boundary_changes(
    contract: SprintContract,
    handoff: HandoffState,
    cfg: HarnessConfig,
) -> None:
    violations = contract_file_boundary_violations(contract, handoff.files_changed, cfg)
    if violations:
        raise RuntimeError("Outside sprint file boundary changed: " + "; ".join(violations))


def runtime_app_artifact_path(path: str, cfg: HarnessConfig) -> bool:
    app_root = Path(cfg.workspace.app_root).as_posix().strip("/")
    if not app_root:
        return False
    normalized = Path(path).as_posix().strip("/")
    allowed_roots = [
        f"{app_root}/node_modules",
        f"{app_root}/.next",
        f"{app_root}/.turbo",
        f"{app_root}/next-env.d.ts",
    ]
    return any(normalized == root or normalized.startswith(f"{root}/") for root in allowed_roots)


def protected_app_status_paths(project_dir: Path, cfg: HarnessConfig) -> list[str]:
    return sorted(
        path
        for path in app_status_files(project_dir, cfg, include_ignored=True)
        if path_protected(path, cfg.workspace.protected_paths)
        and not runtime_app_artifact_path(path, cfg)
    )


def ignored_app_status_paths(project_dir: Path, cfg: HarnessConfig) -> list[str]:
    normal_status = set(app_status_files(project_dir, cfg))
    ignored_status = set(app_status_files(project_dir, cfg, include_ignored=True)) - normal_status
    return sorted(path for path in ignored_status if not path_protected(path, cfg.workspace.protected_paths) and not runtime_app_artifact_path(path, cfg))


def app_path_snapshot(paths: list[str], project_dir: Path) -> dict[str, str]:
    snapshot: dict[str, str] = {}
    for rel in paths:
        candidate = project_dir / rel.rstrip("/")
        if candidate.is_file():
            try:
                fingerprint = file_fingerprint(candidate)
            except FileNotFoundError:
                continue
            snapshot[rel.rstrip("/")] = fingerprint
            continue
        if not candidate.is_dir():
            continue
        for path in candidate.rglob("*"):
            if not path.is_file():
                continue
            try:
                fingerprint = file_fingerprint(path)
            except FileNotFoundError:
                continue
            snapshot[path.relative_to(project_dir).as_posix()] = fingerprint
    return snapshot


def protected_app_snapshot(project_dir: Path, cfg: HarnessConfig) -> dict[str, str]:
    return app_path_snapshot(protected_app_status_paths(project_dir, cfg), project_dir)


def ignored_app_snapshot(project_dir: Path, cfg: HarnessConfig) -> dict[str, str]:
    return app_path_snapshot(ignored_app_status_paths(project_dir, cfg), project_dir)


def protected_app_snapshot_changes(
    before: dict[str, str],
    after: dict[str, str],
) -> dict[str, list[str]]:
    return protected_workspace_changes(before, after)


def assert_no_protected_app_snapshot_changes(
    before: dict[str, str],
    after: dict[str, str],
) -> None:
    changes = protected_app_snapshot_changes(before, after)
    changed = changes["added"] + changes["modified"] + changes["deleted"]
    if changed:
        raise RuntimeError("Protected app path changed: " + ", ".join(sorted(changed)))


def assert_no_ignored_app_snapshot_changes(
    before: dict[str, str],
    after: dict[str, str],
) -> None:
    changes = protected_workspace_changes(before, after)
    changed = changes["added"] + changes["modified"] + changes["deleted"]
    if changed:
        raise RuntimeError("Ignored app path changed: " + ", ".join(sorted(changed)))


def project_relative_recorded_git_paths(project_dir: Path, record: dict) -> set[str]:
    allowed: set[str] = set()
    for key in ("status_path", "diff_name_only_path", "diff_patch_path"):
        value = record.get(key)
        if not isinstance(value, str) or not value:
            continue
        path = Path(value)
        try:
            allowed.add(path.resolve().relative_to(project_dir.resolve()).as_posix())
        except ValueError:
            continue
    return allowed


def concurrent_product_context_paths(cfg: HarnessConfig) -> set[str]:
    if cfg.agents.generator.backend != "codex":
        return set()
    return {DESIGN_SPEC_RELATIVE.as_posix()}


def reviewer_runtime_failure_artifact_path(paths: dict[str, Path]) -> Path:
    return paths["artifacts"] / "reviewer-runtime-failures.json"


def reviewer_runtime_allowed_paths(project_dir: Path, cfg: HarnessConfig, paths: dict[str, Path]) -> set[str]:
    allowed = concurrent_product_context_paths(cfg)
    try:
        allowed.add(reviewer_runtime_failure_artifact_path(paths).relative_to(project_dir).as_posix())
    except ValueError:
        pass
    return allowed


def concurrent_root_development_roots(cfg: HarnessConfig) -> list[str]:
    if cfg.agents.generator.backend != "codex":
        return []
    return ["harness", "tests"]


def preflight_runtime_roots(cfg: HarnessConfig) -> list[str]:
    artifact_root = Path(cfg.workspace.artifact_root).as_posix().strip("/")
    if not artifact_root:
        return []
    return [f"{artifact_root}/preflight"]


def stale_run_artifact_roots(project_dir: Path, cfg: HarnessConfig, current_run_id: str) -> list[str]:
    runs_dir = project_dir / cfg.workspace.artifact_root / "runs"
    if not runs_dir.exists():
        return []
    roots: list[str] = []
    for path in runs_dir.iterdir():
        if path.is_dir() and path.name != current_run_id:
            roots.append(path.relative_to(project_dir).as_posix())
    return sorted(roots)


def _under_allowed_root(path: str, allowed_roots: list[str]) -> bool:
    normalized = Path(path).as_posix().rstrip("/")
    return any(
        normalized == root.rstrip("/") or normalized.startswith(f"{root.rstrip('/')}/")
        for root in allowed_roots
        if root
    )


def workspace_changes_except_paths(
    changes: dict[str, list[str]],
    allowed_paths: set[str],
    allowed_roots: list[str] | None = None,
    allowed_modified_roots: list[str] | None = None,
    allowed_deleted_roots: list[str] | None = None,
) -> dict[str, list[str]]:
    allowed_roots = allowed_roots or []
    allowed_modified_roots = allowed_modified_roots or []
    allowed_deleted_roots = allowed_deleted_roots or []
    filtered: dict[str, list[str]] = {}
    for key, paths in changes.items():
        kept: list[str] = []
        for path in paths:
            if path in allowed_paths or _under_allowed_root(path, allowed_roots):
                continue
            if key == "modified" and _under_allowed_root(path, allowed_modified_roots):
                continue
            if key == "deleted" and _under_allowed_root(path, allowed_deleted_roots):
                continue
            kept.append(path)
        filtered[key] = kept
    return filtered


def promote_verified_handoff(handoff: HandoffState) -> HandoffState:
    promoted = [item for item in handoff.partial_features if item not in handoff.completed_features]
    handoff.completed_features.extend(promoted)
    handoff.partial_features = []
    return handoff


def quality_improvement_strategy(iteration: int, cfg: HarnessConfig, last_eval: EvalResult, last_verify: VerificationResult) -> dict[str, str]:
    reason = (
        f"Iteration {iteration} passed both gates, but loop.min_iterations={cfg.loop.min_iterations} "
        "requires another quality pass."
    )
    directive = (
        "## Strategic directive - QUALITY IMPROVEMENT\n\n"
        f"Reason: {reason}\n\n"
        "Preserve the verified baseline. Do not rewrite working flows or regress passed criteria. "
        "Use the next pass only for incremental clarity, resilience, accessibility, and polish.\n\n"
        f"Evaluator feedback:\n{last_eval.feedback}\n\n"
        f"Verifier feedback:\n{last_verify.feedback}"
    )
    return {"decision": "quality_improvement", "reason": reason, "directive": directive}


def reviewer_blocking_items(last_eval: EvalResult, last_verify: VerificationResult, limit: int = 6) -> list[str]:
    items: list[str] = []
    for criterion in last_eval.contract_results:
        if criterion.status != "fail":
            continue
        evidence = criterion.evidence.strip()
        items.append(f"Evaluator {criterion.id}: {evidence or criterion.description}")
    severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    issues = sorted(
        last_verify.issues,
        key=lambda issue: severity_order.get(issue.severity, 4),
    )
    for issue in issues:
        recommendation = issue.recommendation.strip()
        evidence = issue.evidence.strip()
        items.append(
            f"Verifier {issue.id} ({issue.severity}): {recommendation or issue.user_impact}"
            + (f" Evidence: {evidence}" if evidence else "")
        )
    return items[:limit]


def sprint_passed(eval_result: EvalResult, verify_result: VerificationResult) -> bool:
    return eval_result.verdict in {"pass", "conditional_pass"} and verify_result.verdict in {"pass", "conditional_pass"}


def raise_if_sprint_failed(sprint_number: int, eval_result: EvalResult, verify_result: VerificationResult) -> None:
    if sprint_passed(eval_result, verify_result):
        return
    raise SystemExit(
        f"Sprint {sprint_number} failed: evaluator={eval_result.verdict}, verifier={verify_result.verdict}"
    )


def save_reviewer_runtime_failure(artifact_path: Path, label: str, attempt: int, max_retries: int, exc: Exception, retrying: bool) -> None:
    artifact_path.parent.mkdir(parents=True, exist_ok=True)
    if artifact_path.exists():
        try:
            records = json.loads(artifact_path.read_text())
        except json.JSONDecodeError:
            records = []
    else:
        records = []
    if not isinstance(records, list):
        records = []
    records.append(
        {
            "label": label,
            "attempt": attempt,
            "max_retries": max_retries,
            "retrying": retrying,
            "error_type": type(exc).__name__,
            "message": str(exc),
        }
    )
    artifact_path.write_text(json.dumps(records, indent=2, ensure_ascii=False))


def run_reviewer_with_runtime_retries(label: str, cfg: HarnessConfig, call, failure_artifact_path: Path | None = None):
    retries = max(0, cfg.loop.reviewer_runtime_retries)
    attempts = 0
    while True:
        try:
            return call()
        except Exception as exc:
            next_attempt = attempts + 1
            retrying = attempts < retries
            if failure_artifact_path is not None:
                save_reviewer_runtime_failure(failure_artifact_path, label, next_attempt, retries, exc, retrying)
            if not retrying:
                raise
            attempts = next_attempt
            log.get().info(
                "[Harness] %s runtime failed; retrying reviewer call %s/%s: %s",
                label,
                attempts,
                retries,
                exc,
            )


def startup_log_root(cfg: HarnessConfig) -> str:
    if workspace_path_issues(cfg):
        return "harness-logs"
    return cfg.workspace.log_root


def enforce_preflight(project_dir: Path, cfg: HarnessConfig, **preflight_kwargs) -> dict:
    report = run_preflight(project_dir, cfg, **preflight_kwargs)
    report_path = write_preflight_report(project_dir, cfg, report)
    if report["status"] == "fail":
        raise RuntimeError(f"Preflight failed. See {report_path}")
    return report


def run_sprint(
    spec: str,
    contract: SprintContract,
    project_dir: Path,
    cfg: HarnessConfig,
    app_url: str,
    run_id: str | None = None,
) -> tuple[EvalResult, VerificationResult, HandoffState]:
    assert_contract_reviewed(contract)
    logger = log.get()
    run_id = run_id or new_run_id()
    handoff: HandoffState | None = None
    strategic_framing: str | None = None
    last_eval: EvalResult | None = None
    last_verify: VerificationResult | None = None
    product_context = load_product_context(project_dir)
    score_history: list[dict] = []
    self_assess_repairs_used = 0
    self_assess_runtime_failed = False
    baseline_app_fingerprints = fingerprint_app_changed_files(project_dir, cfg)

    for iteration in range(1, cfg.loop.max_iterations + 1):
        logger.info("[Harness] Sprint %s iteration %s", contract.sprint_number, iteration)
        paths = ensure_project_layout(project_dir, cfg, sprint=contract.sprint_number, iteration=iteration, run_id=run_id)
        pre_git_record = record_app_git_evidence(project_dir, cfg, paths, phase=f"iter-{iteration}-pre")
        allowed_pre_git_paths = project_relative_recorded_git_paths(project_dir, pre_git_record)
        current_iteration_artifact_roots = [paths["iteration"].relative_to(project_dir).as_posix()]
        allowed_runtime_modified_roots = preflight_runtime_roots(cfg)
        allowed_runtime_deleted_roots = stale_run_artifact_roots(project_dir, cfg, run_id)
        workspace_before = protected_workspace_snapshot(project_dir, cfg)
        protected_app_before = protected_app_snapshot(project_dir, cfg)
        ignored_app_before = ignored_app_snapshot(project_dir, cfg)
        try:
            summary = run_generator(spec, contract, project_dir, handoff, strategic_framing, cfg)
        except Exception as exc:
            logger.info("[Harness] Generator crashed; evaluating current state: %s", exc)
            summary = f"Generator crashed: {type(exc).__name__}: {exc}"
        workspace_after = protected_workspace_snapshot(project_dir, cfg)
        protected_app_after = protected_app_snapshot(project_dir, cfg)
        ignored_app_after = ignored_app_snapshot(project_dir, cfg)
        assert_no_protected_app_snapshot_changes(protected_app_before, protected_app_after)
        assert_no_ignored_app_snapshot_changes(ignored_app_before, ignored_app_after)
        workspace_changes = workspace_changes_except_paths(
            protected_workspace_changes(workspace_before, workspace_after),
            allowed_pre_git_paths | concurrent_product_context_paths(cfg),
            allowed_roots=concurrent_root_development_roots(cfg),
            allowed_modified_roots=allowed_runtime_modified_roots,
            allowed_deleted_roots=allowed_runtime_deleted_roots,
        )
        changed_outside_app = workspace_changes["added"] or workspace_changes["modified"] or workspace_changes["deleted"]
        if changed_outside_app:
            raise RuntimeError("Protected workspace changed: " + json.dumps(workspace_changes, sort_keys=True))
        prepare_app_dependencies(project_dir, cfg, paths)

        handoff = build_handoff(contract.sprint_number, project_dir, summary, cfg, baseline_app_fingerprints)
        assert_no_protected_app_changes(handoff, cfg)
        assert_contract_file_boundary_changes(contract, handoff, cfg)
        protected_violations = protected_repo_violations(project_dir, cfg)
        if protected_violations:
            raise RuntimeError("Protected repository changed: " + "; ".join(protected_violations))
        record_app_git_evidence(project_dir, cfg, paths, phase=f"iter-{iteration}-post")
        save_iteration_handoff(paths, contract, handoff)

        if self_assess_runtime_failed:
            logger.info(
                "[Harness] Self-assessment skipped after prior runtime failure sprint=%s iteration=%s.",
                contract.sprint_number,
                iteration,
            )
            confident, concerns = True, []
        else:
            self_assess_result = run_self_assess_read_only(
                spec,
                contract,
                handoff.files_changed,
                summary,
                cfg,
                project_dir,
            )
            confident, concerns = self_assess_result
            if getattr(self_assess_result, "reviewer_failed", False):
                self_assess_runtime_failed = True
        repair_budget = max(0, cfg.loop.self_assess_max_repair_passes)
        if not confident and iteration < cfg.loop.max_iterations and self_assess_repairs_used < repair_budget:
            self_assess_repairs_used += 1
            handoff.known_broken.extend(concerns)
            repair_framing = (
                "## Self-assessment repair pass\n\n"
                "Fix these gaps before evaluation:\n"
                + "\n".join(f"- {concern}" for concern in concerns)
                + "\n\nDo not change protected paths or write harness artifacts."
            )
            workspace_before = protected_workspace_snapshot(project_dir, cfg)
            protected_app_before = protected_app_snapshot(project_dir, cfg)
            ignored_app_before = ignored_app_snapshot(project_dir, cfg)
            try:
                summary = run_generator(spec, contract, project_dir, handoff, repair_framing, cfg)
            except Exception as exc:
                logger.info("[Harness] Generator crashed on self-assessment repair pass: %s", exc)
                summary = f"Generator crashed on repair pass: {type(exc).__name__}: {exc}"
            workspace_after = protected_workspace_snapshot(project_dir, cfg)
            protected_app_after = protected_app_snapshot(project_dir, cfg)
            ignored_app_after = ignored_app_snapshot(project_dir, cfg)
            assert_no_protected_app_snapshot_changes(protected_app_before, protected_app_after)
            assert_no_ignored_app_snapshot_changes(ignored_app_before, ignored_app_after)
            workspace_changes = protected_workspace_changes(workspace_before, workspace_after)
            workspace_changes = workspace_changes_except_paths(
                workspace_changes,
                concurrent_product_context_paths(cfg),
                allowed_roots=concurrent_root_development_roots(cfg),
                allowed_modified_roots=allowed_runtime_modified_roots,
                allowed_deleted_roots=allowed_runtime_deleted_roots,
            )
            changed_outside_app = workspace_changes["added"] or workspace_changes["modified"] or workspace_changes["deleted"]
            if changed_outside_app:
                raise RuntimeError("Protected workspace changed: " + json.dumps(workspace_changes, sort_keys=True))
            prepare_app_dependencies(project_dir, cfg, paths)

            handoff = build_handoff(contract.sprint_number, project_dir, summary, cfg, baseline_app_fingerprints)
            assert_no_protected_app_changes(handoff, cfg)
            assert_contract_file_boundary_changes(contract, handoff, cfg)
            protected_violations = protected_repo_violations(project_dir, cfg)
            if protected_violations:
                raise RuntimeError("Protected repository changed: " + "; ".join(protected_violations))
            record_app_git_evidence(project_dir, cfg, paths, phase=f"iter-{iteration}-repair-post")
            confident, concerns = run_self_assess_read_only(
                spec,
                contract,
                handoff.files_changed,
                summary,
                cfg,
                project_dir,
            )
        elif not confident and iteration < cfg.loop.max_iterations and repair_budget <= self_assess_repairs_used:
            logger.info(
                "[Harness] Self-assessment repair budget exhausted sprint=%s used=%s budget=%s; continuing to evaluator/verifier.",
                contract.sprint_number,
                self_assess_repairs_used,
                repair_budget,
            )
        if not confident:
            handoff.known_broken.extend(concerns)
        save_iteration_handoff(paths, contract, handoff)

        evidence_collected = False
        dev_server = start_app_dev_server(project_dir, cfg, app_url, paths)
        effective_app_url = getattr(dev_server, "app_url", app_url)
        try:
            try:
                run_evidence_collection_bounded(project_dir, effective_app_url, contract, cfg, paths)
            except EvidenceBoundaryViolation:
                raise
            except Exception as exc:
                logger.info("[Harness] Evidence collection failed; recording failed iteration: %s", exc)
                record_evidence_failure(contract, effective_app_url, paths, exc)
                last_eval = failed_eval_result(contract, "Evidence collection", exc)
                last_verify = failed_verification_result("Evidence collection", exc)
                save_eval_result(project_dir, cfg, contract.sprint_number, iteration, last_eval, run_id=run_id)
                save_verification_result(project_dir, cfg, contract.sprint_number, iteration, last_verify, run_id=run_id)
            else:
                evidence_collected = True
        finally:
            stop_app_dev_server(dev_server)

        if evidence_collected:
            reviewer_before = protected_workspace_snapshot(project_dir, cfg, excluded_roots=[cfg.workspace.log_root])
            reviewer_protected_app_before = protected_app_snapshot(project_dir, cfg)
            reviewer_ignored_app_before = ignored_app_snapshot(project_dir, cfg)
            try:
                last_eval = run_reviewer_with_runtime_retries(
                    "Evaluator",
                    cfg,
                    lambda: run_evaluator(
                        spec,
                        contract,
                        effective_app_url,
                        cfg=cfg,
                        project_dir=project_dir,
                        evidence_dir=paths["sprint_evidence"],
                    ),
                    failure_artifact_path=reviewer_runtime_failure_artifact_path(paths),
                )
            except Exception as exc:
                logger.info("[Harness] Evaluator failed; recording failed eval result: %s", exc)
                last_eval = failed_eval_result(contract, "Evaluator", exc)
            reviewer_after = protected_workspace_snapshot(project_dir, cfg, excluded_roots=[cfg.workspace.log_root])
            reviewer_protected_app_after = protected_app_snapshot(project_dir, cfg)
            reviewer_ignored_app_after = ignored_app_snapshot(project_dir, cfg)
            assert_reviewer_artifact_boundary(
                project_dir,
                cfg,
                paths,
                reviewer_before,
                reviewer_after,
                "Evaluator",
                reviewer_protected_app_before,
                reviewer_protected_app_after,
                reviewer_ignored_app_before,
                reviewer_ignored_app_after,
                allowed_workspace_paths=reviewer_runtime_allowed_paths(project_dir, cfg, paths),
                allowed_workspace_roots=concurrent_root_development_roots(cfg),
            )
            save_eval_result(project_dir, cfg, contract.sprint_number, iteration, last_eval, run_id=run_id)
            reviewer_before = protected_workspace_snapshot(project_dir, cfg, excluded_roots=[cfg.workspace.log_root])
            reviewer_protected_app_before = protected_app_snapshot(project_dir, cfg)
            reviewer_ignored_app_before = ignored_app_snapshot(project_dir, cfg)
            try:
                last_verify = run_reviewer_with_runtime_retries(
                    "Verifier",
                    cfg,
                    lambda: run_verifier(
                        product_context,
                        contract,
                        effective_app_url,
                        cfg=cfg,
                        project_dir=project_dir,
                        evidence_dir=paths["sprint_evidence"],
                    ),
                    failure_artifact_path=reviewer_runtime_failure_artifact_path(paths),
                )
            except Exception as exc:
                logger.info("[Harness] Verifier failed; recording failed verification result: %s", exc)
                last_verify = failed_verification_result("Verifier", exc)
            reviewer_after = protected_workspace_snapshot(project_dir, cfg, excluded_roots=[cfg.workspace.log_root])
            reviewer_protected_app_after = protected_app_snapshot(project_dir, cfg)
            reviewer_ignored_app_after = ignored_app_snapshot(project_dir, cfg)
            assert_reviewer_artifact_boundary(
                project_dir,
                cfg,
                paths,
                reviewer_before,
                reviewer_after,
                "Verifier",
                reviewer_protected_app_before,
                reviewer_protected_app_after,
                reviewer_ignored_app_before,
                reviewer_ignored_app_after,
                allowed_workspace_paths=reviewer_runtime_allowed_paths(project_dir, cfg, paths),
                allowed_workspace_roots=concurrent_root_development_roots(cfg),
            )
            save_verification_result(project_dir, cfg, contract.sprint_number, iteration, last_verify, run_id=run_id)
        score_history.append(
            {
                "iteration": iteration,
                "verdict": f"evaluator={last_eval.verdict}, verifier={last_verify.verdict}",
                "evaluator_average": last_eval.rubric_average,
                "verifier_average": last_verify.experience_average,
                "failing_criteria": [item.id for item in last_eval.contract_results if item.status == "fail"],
            }
        )

        eval_ok = last_eval.verdict in {"pass", "conditional_pass"}
        verify_ok = last_verify.verdict in {"pass", "conditional_pass"}
        if eval_ok and verify_ok and iteration >= cfg.loop.min_iterations:
            promote_verified_handoff(handoff)
            save_iteration_handoff(paths, contract, handoff)
            commit_result = commit_app_changes(
                project_dir,
                cfg,
                f"feat: sprint {contract.sprint_number} complete",
                allow_empty=True,
            )
            save_git_operation(paths, f"iter-{iteration}-commit", commit_result)
            push_result = push_app_changes(project_dir, cfg)
            save_git_operation(paths, f"iter-{iteration}-push", push_result)
            return last_eval, last_verify, handoff

        commit_result = commit_app_changes(project_dir, cfg, f"wip: sprint {contract.sprint_number} iteration {iteration}")
        save_git_operation(paths, f"iter-{iteration}-commit", commit_result)

        if eval_ok and verify_ok:
            promote_verified_handoff(handoff)
            save_iteration_handoff(paths, contract, handoff)
            strategy = quality_improvement_strategy(iteration, cfg, last_eval, last_verify)
        else:
            strategy = decide_strategy(
                score_history,
                (
                    f"Evaluator verdict: {last_eval.verdict} ({last_eval.rubric_average:.2f}/5)\n"
                    f"Evaluator feedback:\n{last_eval.feedback}\n\n"
                    f"Verifier verdict: {last_verify.verdict} ({last_verify.experience_average:.2f}/5)\n"
                    f"Verifier feedback:\n{last_verify.feedback}\n\n"
                    "Improve the implementation without changing protected paths or scattering artifacts."
                ),
                blocking_items=reviewer_blocking_items(last_eval, last_verify),
            )
        strategy_path = paths["sprint_evidence"] / f"strategy-iter-{iteration}.json"
        strategy_path.write_text(json.dumps({**strategy, "score_history": score_history}, indent=2))
        strategic_framing = strategy["directive"]
        if handoff:
            if strategy["decision"] == "quality_improvement":
                handoff.next_steps.append(strategic_framing[:1000])
            else:
                handoff.known_broken.append(strategic_framing[:1000])

    if last_eval is None or last_verify is None or handoff is None:
        raise RuntimeError("Sprint ended without evaluation and verification results.")
    return last_eval, last_verify, handoff


def main() -> None:
    parser = argparse.ArgumentParser(description="Long-running harness for Orbit.")
    parser.add_argument("command", choices=["init", "plan", "run", "run-sprint", "hygiene", "doctor"], help="Harness command")
    parser.add_argument("--sprint", type=int, default=1, help="Sprint number for run-sprint")
    parser.add_argument("--app-url", default="http://localhost:3000", help="Running app URL")
    parser.add_argument("--brief", default=None, help="Optional planning brief for the Planner phase")
    args = parser.parse_args()

    cfg = HarnessConfig.load(Path(__file__).parent / "config.yaml")
    if args.command == "doctor":
        log.setup(PROJECT_DIR, log_root=startup_log_root(cfg))
        report = run_preflight(PROJECT_DIR, cfg)
        report_path = write_preflight_report(PROJECT_DIR, cfg, report)
        log.get().info("[Harness] Doctor status=%s report=%s", report["status"], report_path)
        for check in report["checks"]:
            if check["status"] != "pass":
                log.get().info("[Harness] Doctor %s: %s - %s", check["status"], check["name"], check["message"])
        if report["status"] == "fail":
            raise SystemExit(f"Doctor failed. See {report_path}")
        return

    apply_retention(PROJECT_DIR, cfg)
    log.setup(PROJECT_DIR, log_root=cfg.workspace.log_root)
    if args.command == "init":
        init(PROJECT_DIR, cfg)
        log.get().info("[Harness] Initialized harness-state.")
        return
    if args.command == "plan":
        contracts = run_planning_loop(PROJECT_DIR, cfg, brief=args.brief)
        log.get().info("[Harness] Planner wrote %s sprint contracts.", len(contracts))
        return
    if args.command == "hygiene":
        violations = find_artifact_hygiene_violations(PROJECT_DIR, cfg)
        if violations:
            raise SystemExit("\n".join(violations))
        log.get().info("[Harness] Hygiene check passed.")
        return
    if args.command == "run":
        contracts = run_planning_loop(PROJECT_DIR, cfg, brief=args.brief)
        enforce_preflight(PROJECT_DIR, cfg)
        spec = (PROJECT_DIR / cfg.workspace.artifact_root / "spec.md").read_text()
        for contract in contracts:
            eval_result, verify_result, _handoff = run_sprint(spec, contract, PROJECT_DIR, cfg, args.app_url)
            log.get().info(
                "[Harness] Sprint %s evaluator=%s verifier=%s",
                contract.sprint_number,
                eval_result.verdict,
                verify_result.verdict,
            )
            raise_if_sprint_failed(contract.sprint_number, eval_result, verify_result)
        return

    if not plan_manifest_valid(PROJECT_DIR, cfg) and not args.brief:
        raise SystemExit("run-sprint requires a valid Planner manifest or an explicit --brief to replan.")
    prepare_run_state(PROJECT_DIR, cfg, brief=args.brief)
    enforce_preflight(PROJECT_DIR, cfg)
    paths = ensure_project_layout(PROJECT_DIR, cfg)
    spec = (paths["state"] / "spec.md").read_text()
    contract = load_contract(PROJECT_DIR, cfg, args.sprint)
    eval_result, verify_result, _handoff = run_sprint(spec, contract, PROJECT_DIR, cfg, args.app_url)
    log.get().info(
        "[Harness] Sprint %s evaluator=%s verifier=%s",
        args.sprint,
        eval_result.verdict,
        verify_result.verdict,
    )
    raise_if_sprint_failed(args.sprint, eval_result, verify_result)


if __name__ == "__main__":
    main()
