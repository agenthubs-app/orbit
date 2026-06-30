from __future__ import annotations

import importlib.util
import json
import os
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from harness.config import HarnessConfig
from harness.codex_runner import codex_extra_args_issues
from harness.git_safety import app_changed_files, app_git_identity_status, app_git_sync_status, protected_repo_violations
from harness.workspace import find_artifact_hygiene_violations, workspace_path_issues


PreflightCheck = dict[str, Any]
BrowserCheck = Callable[[], dict[str, Any]]
RunnerCheck = Callable[[HarnessConfig], dict[str, Any]]

# preflight 在长跑开始前做一次“环境和边界体检”。
# 它不修改产品代码，只把配置错误、runtime 缺失、git 风险和证据目录污染提前暴露出来。
_ALLOWED_AGENT_BACKENDS = {"claude", "codex", "deepcode"}
_ALLOWED_CODEX_APPROVAL_MODES = {"full-auto", "read-only", "workspace-write", "danger-full-access"}
_ALLOWED_CODEX_REASONING_EFFORTS = {"low", "medium", "high", "xhigh"}


def _check(name: str, status: str, message: str, details: dict[str, Any] | None = None) -> PreflightCheck:
    return {
        "name": name,
        "status": status,
        "message": message,
        "details": details or {},
    }


def _overall_status(checks: list[PreflightCheck]) -> str:
    # 任一 fail 都阻断；没有 fail 但有 warning 时允许继续，但调用方应该把风险展示出来。
    statuses = {check["status"] for check in checks}
    if "fail" in statuses:
        return "fail"
    if "warning" in statuses:
        return "warning"
    return "pass"


def check_playwright_runtime() -> dict[str, Any]:
    # 浏览器证据采集依赖 Chromium；这里用最小页面启动测试，不触碰 app server。
    try:
        from playwright.sync_api import sync_playwright

        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            page = browser.new_page(viewport={"width": 800, "height": 600})
            page.set_content("<!doctype html><title>preflight</title><body>ok</body>")
            title = page.title()
            browser.close()
        return {"available": title == "preflight", "message": "chromium ok", "engine": "chromium"}
    except Exception as exc:
        return {"available": False, "message": f"{type(exc).__name__}: {exc}", "engine": "chromium"}


def _module_available(module_name: str) -> bool:
    try:
        return importlib.util.find_spec(module_name) is not None
    except (ImportError, ValueError):
        return False


def _agent_configs(cfg: HarnessConfig) -> list[tuple[str, Any]]:
    return [
        ("planner", cfg.agents.planner),
        ("generator", cfg.agents.generator),
        ("evaluator", cfg.agents.evaluator),
        ("verifier", cfg.agents.verifier),
    ]


def _runtime_entry(role: str, backend: str, runtime: str, available: bool, **extra: Any) -> dict[str, Any]:
    entry = {
        "role": role,
        "backend": backend,
        "runtime": runtime,
        "available": available,
    }
    entry.update(extra)
    return entry


def _allowed_values(values: set[str]) -> str:
    return ", ".join(sorted(values))


def _positive_int_issue(name: str, value: Any) -> str | None:
    if isinstance(value, bool) or not isinstance(value, int) or value < 1:
        return f"{name} must be a positive integer; got {value!r}"
    return None


def _temperature_issue(name: str, value: Any, thinking_enabled: bool) -> str | None:
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return f"{name} must be a number from 0 to 1; got {value!r}"
    if not 0 <= float(value) <= 1:
        return f"{name} must be a number from 0 to 1; got {value!r}"
    if thinking_enabled and float(value) != 1.0:
        return f"{name} must be omitted or 1.0 when thinking.enabled is true; got {value!r}"
    return None


def _agent_config_issues(cfg: HarnessConfig) -> list[str]:
    # 这层只检查“配置是否自洽”，不检查实际 CLI/SDK 是否存在。
    # runtime 是否可用由 check_agent_runtimes 单独负责。
    issues: list[str] = []
    for role, agent_cfg in _agent_configs(cfg):
        backend = agent_cfg.backend
        if backend not in _ALLOWED_AGENT_BACKENDS:
            issues.append(
                f"{role}.backend={backend!r} is unsupported; allowed: {_allowed_values(_ALLOWED_AGENT_BACKENDS)}"
            )
            continue
        if backend in {"claude", "deepcode"}:
            max_tokens_issue = _positive_int_issue(f"{role}.max_tokens", agent_cfg.max_tokens)
            if max_tokens_issue:
                issues.append(max_tokens_issue)
            if agent_cfg.thinking.enabled:
                budget_issue = _positive_int_issue(f"{role}.thinking.budget_tokens", agent_cfg.thinking.budget_tokens)
                if budget_issue:
                    issues.append(budget_issue)
            temperature_issue = _temperature_issue(f"{role}.temperature", agent_cfg.temperature, agent_cfg.thinking.enabled)
            if temperature_issue:
                issues.append(temperature_issue)
        if backend == "deepcode":
            if not isinstance(agent_cfg.deepcode.cli_path, str) or not agent_cfg.deepcode.cli_path.strip():
                issues.append(f"{role}.deepcode.cli_path must be a non-empty string")
            if not isinstance(agent_cfg.deepcode.env, dict) or any(
                not isinstance(key, str) or not isinstance(value, str)
                for key, value in getattr(agent_cfg.deepcode, "env", {}).items()
            ):
                issues.append(f"{role}.deepcode.env must be a dict of string keys and string values")
        if backend == "codex":
            approval_mode = agent_cfg.codex.approval_mode
            if approval_mode not in _ALLOWED_CODEX_APPROVAL_MODES:
                issues.append(
                    f"{role}.codex.approval_mode={approval_mode!r} is unsupported; "
                    f"allowed: {_allowed_values(_ALLOWED_CODEX_APPROVAL_MODES)}"
                )
            elif role in {"evaluator", "verifier"} and approval_mode != "read-only":
                issues.append(
                    f"{role}.codex.approval_mode must be read-only for evidence-only reviewer roles; "
                    f"got {approval_mode!r}"
                )
            reasoning_effort = agent_cfg.codex.reasoning_effort
            if reasoning_effort and reasoning_effort not in _ALLOWED_CODEX_REASONING_EFFORTS:
                issues.append(
                    f"{role}.codex.reasoning_effort={reasoning_effort!r} is unsupported; "
                    f"allowed: {_allowed_values(_ALLOWED_CODEX_REASONING_EFFORTS)}"
                )
            extra_args = agent_cfg.codex.extra_args
            if not isinstance(extra_args, list) or any(not isinstance(arg, str) for arg in extra_args):
                issues.append(f"{role}.codex.extra_args must be a list of strings")
            else:
                issues.extend(
                    issue.replace("codex.extra_args", f"{role}.codex.extra_args", 1)
                    for issue in codex_extra_args_issues(extra_args)
                )
    return issues


def _agent_config_check(cfg: HarnessConfig) -> PreflightCheck:
    issues = _agent_config_issues(cfg)
    details = {
        "allowed_backends": sorted(_ALLOWED_AGENT_BACKENDS),
        "allowed_codex_approval_modes": sorted(_ALLOWED_CODEX_APPROVAL_MODES),
        "allowed_codex_reasoning_efforts": sorted(_ALLOWED_CODEX_REASONING_EFFORTS),
        "issues": issues,
    }
    if issues:
        return _check(
            "agent_config",
            "fail",
            "Agent configuration is invalid: " + "; ".join(issues),
            details,
        )
    return _check("agent_config", "pass", "Agent configuration values are supported.", details)


def check_agent_runtimes(cfg: HarnessConfig) -> dict[str, Any]:
    # 根据每个 agent 的 backend 收集必需 runtime。
    # Generator self-assess 固定需要 Claude SDK，所以无论 Generator backend 是什么都要检查。
    required: list[dict[str, Any]] = []
    missing: list[dict[str, Any]] = []

    def require_claude_sdk(role: str, backend: str) -> None:
        available = _module_available("claude_agent_sdk")
        entry = _runtime_entry(role, backend, "claude_agent_sdk", available)
        required.append(entry)
        if not available:
            missing.append({**entry, "message": "claude_agent_sdk is not importable in the uv environment"})

    def require_codex_cli(role: str, backend: str) -> None:
        path = shutil.which("codex")
        entry = _runtime_entry(role, backend, "codex", path is not None, path=path)
        required.append(entry)
        if path is None:
            missing.append({**entry, "message": "codex CLI not found on PATH"})

    def require_deepcode_cli(role: str, backend: str, cli_path: str) -> None:
        path = Path(cli_path).expanduser()
        available = path.is_file() and os.access(path, os.X_OK)
        entry = _runtime_entry(role, backend, "deepcode", available, path=str(path))
        required.append(entry)
        if not available:
            missing.append({**entry, "message": "deepcode CLI path is missing or not executable"})

    for role, agent_cfg in _agent_configs(cfg):
        backend = agent_cfg.backend
        if backend == "claude":
            require_claude_sdk(role, backend)
        elif backend == "codex":
            require_codex_cli(role, backend)
        elif backend == "deepcode":
            require_claude_sdk(role, backend)
            require_deepcode_cli(role, backend, agent_cfg.deepcode.cli_path)
        else:
            entry = _runtime_entry(role, backend, "backend", False)
            required.append(entry)
            missing.append({**entry, "message": f"Unsupported agent backend: {backend}"})

    require_claude_sdk("generator_self_assess", "claude")

    return {
        "available": not missing,
        "required": required,
        "missing": missing,
    }


def _plan_manifest_check(project_dir: Path, cfg: HarnessConfig) -> PreflightCheck:
    # plan manifest 是 Planner 输出可复用的证明。
    # 缺失或过期只是 warning，因为 run_sprint 前还可以重新规划。
    from harness.harness import plan_manifest_valid

    manifest_path = project_dir / cfg.workspace.artifact_root / "plan-manifest.json"
    if plan_manifest_valid(project_dir, cfg):
        return _check(
            "planner_manifest",
            "pass",
            "Planner manifest is present and references existing plan artifacts.",
            {"path": manifest_path.relative_to(project_dir).as_posix()},
        )
    return _check(
        "planner_manifest",
        "warning",
        "Planner manifest is missing or stale; the Planner must run before sprint execution.",
        {"path": manifest_path.relative_to(project_dir).as_posix()},
    )


def _app_repo_check(project_dir: Path, cfg: HarnessConfig) -> PreflightCheck:
    # app root 只要处于某个 git worktree 内即可通过；
    # 它不一定要是独立 repo，这支持把整个项目放在一个大仓库里开发。
    app_dir = project_dir / cfg.workspace.app_root
    status = app_git_sync_status(project_dir, cfg)
    if status["repo_exists"]:
        return _check(
            "app_repo",
            "pass",
            "Application root is inside a git worktree.",
            {"path": cfg.workspace.app_root, **status},
        )
    return _check(
        "app_repo",
        "fail",
        "Application repo is missing; run init before generation.",
        {"path": cfg.workspace.app_root},
    )


def _app_git_config_check(cfg: HarnessConfig) -> PreflightCheck:
    # git.enabled、strategy、push 三者必须一致。
    # 例如 push=true 但 commit disabled 会导致后续无法保证远端包含完整实现。
    strategy = cfg.workspace.git.strategy
    details = {
        "git_enabled": cfg.workspace.git.enabled,
        "strategy": strategy,
        "push_enabled": cfg.workspace.git.push,
        "allowed_strategies": ["disabled", "path-scoped", "all"],
    }
    if strategy not in {"disabled", "path-scoped", "all"}:
        return _check(
            "app_git_config",
            "fail",
            f"Unsupported git strategy: {strategy}.",
            details,
        )
    if cfg.workspace.git.enabled and strategy == "disabled":
        return _check(
            "app_git_config",
            "fail",
            "enabled git commit requires strategy path-scoped or all.",
            details,
        )
    if cfg.workspace.git.push and (not cfg.workspace.git.enabled or strategy == "disabled"):
        return _check(
            "app_git_config",
            "fail",
            "push requires git commit to be enabled with strategy path-scoped or all.",
            details,
        )
    return _check(
        "app_git_config",
        "pass",
        "App git commit and push settings are internally consistent.",
        details,
    )


def _app_git_remote_check(project_dir: Path, cfg: HarnessConfig) -> PreflightCheck:
    # remote 不一致在 push 模式下是 fail；只本地运行时降级为 warning。
    status = app_git_sync_status(project_dir, cfg)
    if not status["repo_exists"]:
        return _check("app_git_remote", "fail", "Cannot inspect remote because the app repo is missing.")

    actual_remote = status["actual_remote_url"]
    configured_remote = status["configured_remote_url"]
    if status["push_enabled"] and not configured_remote:
        return _check(
            "app_git_remote",
            "fail",
            "workspace.git.remote_url must be set when GitHub push is enabled.",
            status,
        )
    if configured_remote and actual_remote and actual_remote != configured_remote:
        severity = "fail" if status["push_enabled"] else "warning"
        return _check(
            "app_git_remote",
            severity,
            "App repo origin does not match workspace.git.remote_url.",
            status,
        )
    if status["remote_configured"]:
        return _check("app_git_remote", "pass", "App repo origin remote is configured.", status)
    severity = "fail" if status["push_enabled"] else "warning"
    return _check(
        "app_git_remote",
        severity,
        "App repo has no origin remote; GitHub sync cannot push until remote_url is configured.",
        status,
    )


def _app_git_branch_check(project_dir: Path, cfg: HarnessConfig) -> PreflightCheck:
    # branch mismatch 会让 push 打到错误分支；启用 push 时必须阻断。
    status = app_git_sync_status(project_dir, cfg)
    if not status["repo_exists"]:
        return _check("app_git_branch", "fail", "Cannot inspect branch because the app repo is missing.")
    if status["current_branch"] == status["configured_branch"]:
        return _check("app_git_branch", "pass", "App repo branch matches workspace.git.branch.", status)
    severity = "fail" if status["push_enabled"] else "warning"
    return _check(
        "app_git_branch",
        severity,
        "App repo branch does not match workspace.git.branch; push would target the wrong branch.",
        status,
    )


def _app_git_identity_check(project_dir: Path, cfg: HarnessConfig) -> PreflightCheck:
    # 只有 harness 负责 commit/push 时才要求 user.name 和 user.email。
    status = app_git_identity_status(project_dir, cfg)
    sync_status = app_git_sync_status(project_dir, cfg)
    if not sync_status["repo_exists"]:
        return _check("app_git_identity", "fail", "Cannot inspect git identity because the app repo is missing.")
    if not status["required"]:
        return _check(
            "app_git_identity",
            "pass",
            "Git commit/push is disabled; app git identity is not required.",
            status,
        )
    if status["commit_identity_configured"]:
        return _check("app_git_identity", "pass", "App repo git identity is configured for commits.", status)
    return _check(
        "app_git_identity",
        "fail",
        "Git commit/push is enabled but app repo user.name or user.email is missing.",
        status,
    )


def _app_worktree_check(project_dir: Path, cfg: HarnessConfig) -> PreflightCheck:
    # 预先脏的 app worktree 会混淆“Generator 本轮改了什么”。
    # git disabled 时只 warning；自动 commit/push 打开时必须 fail。
    app_dir = project_dir / cfg.workspace.app_root
    if not app_dir.exists():
        return _check("app_worktree", "fail", "Cannot inspect worktree because the app repo is missing.")
    try:
        changed_files = app_changed_files(project_dir, cfg)
    except RuntimeError as exc:
        return _check(
            "app_worktree",
            "fail",
            "Cannot inspect app repo worktree; git status failed.",
            {"error": str(exc), "git_enabled": cfg.workspace.git.enabled, "push_enabled": cfg.workspace.git.push},
        )
    if changed_files:
        commit_or_push_enabled = cfg.workspace.git.enabled or cfg.workspace.git.push
        return _check(
            "app_worktree",
            "fail" if commit_or_push_enabled else "warning",
            (
                "Git commit/push is enabled and app repo has uncommitted changes; clean the worktree "
                "before generation so pre-existing changes are not auto-committed."
                if commit_or_push_enabled
                else "App repo has uncommitted changes; commit or intentionally carry them before long runs."
            ),
            {"changed_files": changed_files, "git_enabled": cfg.workspace.git.enabled, "push_enabled": cfg.workspace.git.push},
        )
    return _check("app_worktree", "pass", "App repo worktree is clean.", {"changed_files": []})


def _protected_repo_check(project_dir: Path, cfg: HarnessConfig) -> PreflightCheck:
    violations = protected_repo_violations(project_dir, cfg)
    if violations:
        return _check(
            "protected_repos",
            "fail",
            "Protected reference repositories have uncommitted changes.",
            {"violations": violations},
        )
    return _check("protected_repos", "pass", "Protected repositories are clean.", {"violations": []})


def _artifact_hygiene_check(project_dir: Path, cfg: HarnessConfig) -> PreflightCheck:
    # evidence、trace、screenshot 等运行产物必须待在 harness artifact roots。
    # 如果散落到源码树里，Generator 可能把它们误提交为产品代码。
    violations = find_artifact_hygiene_violations(project_dir, cfg)
    if violations:
        return _check(
            "artifact_hygiene",
            "fail",
            "Generated evidence artifacts were found outside harness artifact roots.",
            {"violations": violations},
        )
    return _check("artifact_hygiene", "pass", "No misplaced generated evidence artifacts found.", {"violations": []})


def _workspace_paths_check(cfg: HarnessConfig) -> PreflightCheck:
    issues = workspace_path_issues(cfg)
    if issues:
        return _check(
            "workspace_paths",
            "fail",
            "Workspace root path configuration is unsafe: " + "; ".join(issues),
            {"issues": issues},
        )
    return _check("workspace_paths", "pass", "Workspace root paths are safe.", {"issues": []})


def _loop_config_check(cfg: HarnessConfig) -> PreflightCheck:
    # loop 预算必须是正整数，并且 min_iterations 不能大于 max_iterations。
    # 这是长跑 harness 防止无限循环或立即退出的硬边界。
    issues = [
        issue
        for issue in [
            _positive_int_issue("loop.max_iterations", cfg.loop.max_iterations),
            _positive_int_issue("loop.min_iterations", cfg.loop.min_iterations),
            _positive_int_issue("loop.planner_max_turns", cfg.loop.planner_max_turns),
            _positive_int_issue("loop.planner_timeout_seconds", cfg.loop.planner_timeout_seconds),
            _positive_int_issue("loop.generator_max_turns", cfg.loop.generator_max_turns),
            _positive_int_issue("loop.generator_timeout_seconds", cfg.loop.generator_timeout_seconds),
            _positive_int_issue("loop.self_assess_timeout_seconds", cfg.loop.self_assess_timeout_seconds),
            _positive_int_issue("loop.contract_review_rounds", cfg.loop.contract_review_rounds),
        ]
        if issue
    ]
    if (
        isinstance(cfg.loop.max_iterations, int)
        and not isinstance(cfg.loop.max_iterations, bool)
        and isinstance(cfg.loop.min_iterations, int)
        and not isinstance(cfg.loop.min_iterations, bool)
        and cfg.loop.min_iterations > cfg.loop.max_iterations
    ):
        issues.append("loop.min_iterations must be less than or equal to loop.max_iterations")
    details = {
        "max_iterations": cfg.loop.max_iterations,
        "min_iterations": cfg.loop.min_iterations,
        "planner_max_turns": cfg.loop.planner_max_turns,
        "planner_timeout_seconds": cfg.loop.planner_timeout_seconds,
        "generator_max_turns": cfg.loop.generator_max_turns,
        "generator_timeout_seconds": cfg.loop.generator_timeout_seconds,
        "self_assess_timeout_seconds": cfg.loop.self_assess_timeout_seconds,
        "contract_review_rounds": cfg.loop.contract_review_rounds,
        "issues": issues,
    }
    if issues:
        return _check("loop_config", "fail", "Loop configuration is invalid: " + "; ".join(issues), details)
    return _check("loop_config", "pass", "Loop configuration values are valid.", details)


def _browser_runtime_check(browser_check: BrowserCheck) -> PreflightCheck:
    result = browser_check()
    if result.get("available"):
        return _check("browser_runtime", "pass", "Playwright Chromium runtime is available.", result)
    return _check(
        "browser_runtime",
        "fail",
        "Playwright Chromium runtime is unavailable; browser evidence would be incomplete.",
        result,
    )


def _agent_runtime_check(cfg: HarnessConfig, runner_check: RunnerCheck) -> PreflightCheck:
    result = runner_check(cfg)
    if result.get("available") and not result.get("missing"):
        return _check("agent_runtimes", "pass", "Configured agent runtimes are available.", result)
    return _check(
        "agent_runtimes",
        "fail",
        "One or more configured agent runtimes are unavailable.",
        result,
    )


def run_preflight(
    project_dir: Path,
    cfg: HarnessConfig,
    *,
    browser_check: BrowserCheck = check_playwright_runtime,
    runner_check: RunnerCheck = check_agent_runtimes,
) -> dict[str, Any]:
    # workspace path 配置不安全时，后续检查可能写到错误目录，所以只返回这一项 fail。
    # 路径安全后再并行概念上检查配置、git、artifact、runtime 和 browser。
    workspace_check = _workspace_paths_check(cfg)
    if workspace_check["status"] == "fail":
        checks = [workspace_check]
    else:
        checks = [
            workspace_check,
            _agent_config_check(cfg),
            _loop_config_check(cfg),
            _plan_manifest_check(project_dir, cfg),
            _app_repo_check(project_dir, cfg),
            _app_git_config_check(cfg),
            _app_git_remote_check(project_dir, cfg),
            _app_git_branch_check(project_dir, cfg),
            _app_git_identity_check(project_dir, cfg),
            _app_worktree_check(project_dir, cfg),
            _protected_repo_check(project_dir, cfg),
            _artifact_hygiene_check(project_dir, cfg),
            _agent_runtime_check(cfg, runner_check),
            _browser_runtime_check(browser_check),
        ]
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "status": _overall_status(checks),
        "checks": checks,
    }


def _preflight_report_root(project_dir: Path, cfg: HarnessConfig) -> Path:
    if workspace_path_issues(cfg):
        return project_dir / "harness-state"
    artifact_root = cfg.workspace.artifact_root
    if not isinstance(artifact_root, str) or not artifact_root.strip():
        return project_dir / "harness-state"
    artifact_path = Path(artifact_root)
    if artifact_path.is_absolute() or ".." in artifact_path.parts:
        return project_dir / "harness-state"
    return project_dir / artifact_path


def write_preflight_report(project_dir: Path, cfg: HarnessConfig, report: dict[str, Any]) -> Path:
    report_dir = _preflight_report_root(project_dir, cfg) / "preflight"
    report_dir.mkdir(parents=True, exist_ok=True)
    report_path = report_dir / "preflight.json"
    report_path.write_text(json.dumps(report, indent=2))
    return report_path
