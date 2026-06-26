from __future__ import annotations

import fnmatch
import hashlib
import shutil
from pathlib import Path

from harness.config import HarnessConfig


WORKSPACE_ROOT_FIELDS = ("app_root", "artifact_root", "log_root", "evidence_root", "tmp_root")
ARTIFACT_ROOT_FIELDS = ("artifact_root", "log_root", "evidence_root", "tmp_root")


def _normalized_workspace_root(value: object) -> str | None:
    if not isinstance(value, str) or not value.strip():
        return None
    path = Path(value)
    if path.is_absolute() or ".." in path.parts:
        return None
    return path.as_posix().rstrip("/") or "."


def _root_contains(root: str, candidate: str) -> bool:
    root = root.rstrip("/") or "."
    candidate = candidate.rstrip("/") or "."
    if root == ".":
        return True
    return candidate == root or candidate.startswith(f"{root}/")


def workspace_path_issues(cfg: HarnessConfig) -> list[str]:
    issues: list[str] = []
    normalized: dict[str, str] = {}
    for field in WORKSPACE_ROOT_FIELDS:
        value = getattr(cfg.workspace, field)
        root = _normalized_workspace_root(value)
        if root is None:
            issues.append(f"{field} must be a non-empty project-relative path without `..`: {value!r}.")
        else:
            normalized[field] = root

    app_root = normalized.get("app_root")
    if cfg.workspace.mode == "greenfield" and app_root:
        for field in ARTIFACT_ROOT_FIELDS:
            root = normalized.get(field)
            if not root:
                continue
            if _root_contains(app_root, root) or _root_contains(root, app_root):
                issues.append(f"{field} must not overlap app_root in greenfield mode: {root} vs {app_root}.")
    return issues


def assert_workspace_paths_valid(cfg: HarnessConfig) -> None:
    issues = workspace_path_issues(cfg)
    if issues:
        raise ValueError("Invalid workspace path configuration: " + "; ".join(issues))


def ensure_project_layout(
    project_dir: Path,
    cfg: HarnessConfig,
    sprint: int | None = None,
    iteration: int | None = None,
    run_id: str | None = None,
) -> dict[str, Path]:
    assert_workspace_paths_valid(cfg)
    state = project_dir / cfg.workspace.artifact_root
    logs = project_dir / cfg.workspace.log_root
    evidence = project_dir / cfg.workspace.evidence_root
    tmp = project_dir / cfg.workspace.tmp_root
    paths = {
        "app": project_dir / cfg.workspace.app_root,
        "state": state,
        "contracts": state / "contracts",
        "handoffs": state / "handoffs",
        "evals": state / "evals",
        "verifications": state / "verifications",
        "runs": state / "runs",
        "evidence": evidence,
        "tmp": tmp,
        "logs": logs,
    }
    if run_id:
        paths["run"] = state / "runs" / run_id
    if sprint is not None:
        if run_id:
            sprint_root = state / "runs" / run_id / f"sprint-{sprint}"
            paths["sprint_run"] = sprint_root
        else:
            sprint_root = evidence / f"sprint-{sprint}"
        if iteration is not None:
            sprint_root = sprint_root / f"iter-{iteration}"
        paths.update({
            "iteration": sprint_root,
            "sprint_evidence": sprint_root,
            "commands": sprint_root / "commands",
            "screenshots": sprint_root / "screenshots",
            "browser": sprint_root / "browser",
            "axe": sprint_root / "axe",
            "lighthouse": sprint_root / "lighthouse",
            "source": sprint_root / "source",
            "api": sprint_root / "api",
            "git": sprint_root / "git",
            "artifacts": sprint_root / "artifacts",
        })
        if run_id and iteration is not None:
            paths.update({
                "eval_result": sprint_root / "eval.json",
                "verification_result": sprint_root / "verification.json",
                "handoff_result": sprint_root / "handoff.json",
            })
    file_path_keys = {"eval_result", "verification_result", "handoff_result"}
    for key, path in paths.items():
        if key in file_path_keys:
            continue
        path.mkdir(parents=True, exist_ok=True)
    return paths


def clean_tmp(project_dir: Path, cfg: HarnessConfig) -> None:
    assert_workspace_paths_valid(cfg)
    tmp = project_dir / cfg.workspace.tmp_root
    if tmp.exists():
        try:
            shutil.rmtree(tmp)
        except FileNotFoundError:
            pass
    tmp.mkdir(parents=True, exist_ok=True)


def apply_retention(project_dir: Path, cfg: HarnessConfig) -> None:
    assert_workspace_paths_valid(cfg)
    clean_tmp(project_dir, cfg)
    log_dir = project_dir / cfg.workspace.log_root
    if log_dir.exists():
        logs = sorted(log_dir.glob("*.log"))
        stale_logs = logs[: max(0, len(logs) - cfg.workspace.keep_last_runs)]
        for path in stale_logs:
            try:
                path.unlink()
            except FileNotFoundError:
                pass
    runs_dir = project_dir / cfg.workspace.artifact_root / "runs"
    if runs_dir.exists():
        runs = sorted(path for path in runs_dir.iterdir() if path.is_dir())
        stale_runs = runs[: max(0, len(runs) - cfg.workspace.keep_last_runs)]
        for path in stale_runs:
            try:
                shutil.rmtree(path)
            except FileNotFoundError:
                pass
    evidence_dir = project_dir / cfg.workspace.evidence_root
    if evidence_dir.exists():
        keep = max(0, cfg.workspace.keep_last_evidence_per_sprint)
        for sprint_dir in evidence_dir.glob("sprint-*"):
            if not sprint_dir.is_dir():
                continue
            iterations = [
                path
                for path in sprint_dir.iterdir()
                if path.is_dir() and path.name.startswith("iter-") and path.name.removeprefix("iter-").isdigit()
            ]
            iterations.sort(key=lambda path: int(path.name.removeprefix("iter-")))
            for stale in iterations[: max(0, len(iterations) - keep)]:
                try:
                    shutil.rmtree(stale)
                except FileNotFoundError:
                    pass


def _matches_pattern_or_glob_root(path: str, pattern: str) -> bool:
    normalized = Path(path).as_posix().rstrip("/")
    normalized_pattern = Path(pattern).as_posix().rstrip("/")
    if fnmatch.fnmatch(normalized, normalized_pattern):
        return True
    if normalized_pattern.endswith("/**"):
        root = normalized_pattern.removesuffix("/**").rstrip("/")
        return normalized == root
    return False


def path_allowed(path: str, patterns: list[str]) -> bool:
    normalized = Path(path).as_posix()
    return any(_matches_pattern_or_glob_root(normalized, pattern) for pattern in patterns)


def path_protected(path: str, patterns: list[str]) -> bool:
    normalized = Path(path).as_posix()
    return any(_matches_pattern_or_glob_root(normalized, pattern) for pattern in patterns)


def _under_any_root(rel: str, roots: list[str]) -> bool:
    normalized_roots = [Path(root).as_posix().rstrip("/") for root in roots if root]
    return any(rel == root or rel.startswith(f"{root}/") for root in normalized_roots)


def file_fingerprint(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def protected_workspace_snapshot(
    project_dir: Path,
    cfg: HarnessConfig,
    excluded_roots: list[str] | None = None,
) -> dict[str, str]:
    excluded_roots = excluded_roots if excluded_roots is not None else [
        cfg.workspace.app_root,
        cfg.workspace.log_root,
    ]
    ignored_parts = {
        ".git",
        ".venv",
        ".uv-cache",
        "node_modules",
        "__pycache__",
        ".pytest_cache",
    }
    snapshot: dict[str, str] = {}
    if not project_dir.exists():
        return snapshot
    app_root = Path(cfg.workspace.app_root).as_posix().strip("/")
    runtime_roots = [
        f"{app_root}/node_modules",
        f"{app_root}/.next",
        f"{app_root}/.turbo",
        f"{app_root}/next-env.d.ts",
    ] if app_root else []
    for path in project_dir.rglob("*"):
        if not path.is_file():
            continue
        rel = path.relative_to(project_dir).as_posix()
        if _under_any_root(rel, excluded_roots):
            continue
        if _under_any_root(rel, runtime_roots):
            continue
        if any(part in ignored_parts for part in path.relative_to(project_dir).parts):
            continue
        snapshot[rel] = file_fingerprint(path)
    return snapshot


def protected_workspace_changes(
    before: dict[str, str],
    after: dict[str, str],
) -> dict[str, list[str]]:
    before_keys = set(before)
    after_keys = set(after)
    modified = sorted(path for path in before_keys & after_keys if before[path] != after[path])
    return {
        "added": sorted(after_keys - before_keys),
        "modified": modified,
        "deleted": sorted(before_keys - after_keys),
    }


def workspace_changes_outside_roots(
    changes: dict[str, list[str]],
    allowed_roots: list[str],
) -> dict[str, list[str]]:
    return {
        key: [path for path in paths if not _under_any_root(path, allowed_roots)]
        for key, paths in changes.items()
    }


def _artifact_hygiene_allowed_roots(cfg: HarnessConfig | None) -> list[str]:
    if cfg is None:
        return ["harness-state", "harness-logs"]
    roots = [
        cfg.workspace.artifact_root,
        cfg.workspace.log_root,
        cfg.workspace.evidence_root,
        cfg.workspace.tmp_root,
    ]
    normalized: list[str] = []
    for root in roots:
        safe_root = _normalized_workspace_root(root)
        if safe_root and safe_root != "." and safe_root not in normalized:
            normalized.append(safe_root)
    return normalized


def find_artifact_hygiene_violations(project_dir: Path, cfg: HarnessConfig | None = None) -> list[str]:
    suspicious = ("lighthouse", "axe", "screenshot", "eval", "trace", "console")
    source_suffixes = {
        ".css",
        ".html",
        ".js",
        ".jsx",
        ".json",
        ".md",
        ".mjs",
        ".py",
        ".sql",
        ".toml",
        ".ts",
        ".tsx",
        ".txt",
        ".yaml",
        ".yml",
    }
    artifact_suffixes = {".har", ".html", ".json", ".log", ".png", ".txt", ".webp", ".zip"}
    allowed_roots = _artifact_hygiene_allowed_roots(cfg)
    ignored_parts = {
        ".git",
        ".venv",
        "node_modules",
        ".next",
        "dist",
        "build",
        "__pycache__",
        ".pytest_cache",
    }
    violations: list[str] = []
    for path in project_dir.rglob("*"):
        if not path.is_file():
            continue
        rel = path.relative_to(project_dir).as_posix()
        if _under_any_root(rel, allowed_roots):
            continue
        if any(part in ignored_parts for part in path.relative_to(project_dir).parts):
            continue
        lowered = path.name.lower()
        token_match = any(token in lowered for token in suspicious)
        if not token_match:
            continue
        suffix = path.suffix.lower()
        if suffix in source_suffixes and suffix not in artifact_suffixes:
            continue
        if suffix in artifact_suffixes or any(part in {"harness", "tests", cfg.workspace.app_root if cfg else ""} for part in path.relative_to(project_dir).parts):
            violations.append(rel)
    return sorted(violations)
