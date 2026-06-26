from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Any

from harness.config import HarnessConfig
from harness.workspace import path_allowed, path_protected


def _run_git(args: list[str], cwd: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(["git", *args], cwd=cwd, text=True, capture_output=True)


def parse_porcelain_paths(status: str) -> list[str]:
    paths: list[str] = []
    for line in status.splitlines():
        if not line:
            continue
        path = line[3:] if len(line) > 3 else line
        if " -> " in path:
            old_path, new_path = path.split(" -> ", 1)
            for renamed_path in (old_path, new_path):
                if renamed_path:
                    paths.append(renamed_path)
            continue
        if path:
            paths.append(path)
    return sorted(dict.fromkeys(paths))


def app_status_files(project_dir: Path, cfg: HarnessConfig, *, include_ignored: bool = False) -> list[str]:
    app_dir = project_dir / cfg.workspace.app_root
    args = ["status", "--porcelain=v1", "-uall"]
    if include_ignored:
        args.append("--ignored=matching")
    result = _run_git(args, app_dir)
    if result.returncode != 0:
        raise RuntimeError((result.stderr or result.stdout).strip() or "git status failed")
    return [f"{cfg.workspace.app_root}/{path}" for path in parse_porcelain_paths(result.stdout)]


def app_changed_files(project_dir: Path, cfg: HarnessConfig) -> list[str]:
    return app_status_files(project_dir, cfg)


def sprint_commit_subject_matches(subject: str, sprint_number: int) -> bool:
    return subject.startswith(f"wip: sprint {sprint_number} ") or subject == f"feat: sprint {sprint_number} complete"


def sprint_committed_files(project_dir: Path, cfg: HarnessConfig, sprint_number: int, *, limit: int = 100) -> list[str]:
    app_dir = project_dir / cfg.workspace.app_root
    if not (app_dir / ".git").exists():
        return []
    head = _run_git(["rev-parse", "--verify", "HEAD"], app_dir)
    if head.returncode != 0:
        return []
    log = _run_git(["log", f"-n{limit}", "--format=%H%x00%s"], app_dir)
    if log.returncode != 0:
        return []
    paths: set[str] = set()
    for line in log.stdout.splitlines():
        if "\x00" not in line:
            continue
        commit_hash, subject = line.split("\x00", 1)
        if not sprint_commit_subject_matches(subject.strip(), sprint_number):
            continue
        show = _run_git(["show", "--name-only", "--format=", "--diff-filter=ACMRTUXB", commit_hash], app_dir)
        if show.returncode != 0:
            continue
        for path in show.stdout.splitlines():
            if path.strip():
                paths.add(f"{cfg.workspace.app_root}/{path.strip()}")
    return sorted(paths)


def current_app_branch(project_dir: Path, cfg: HarnessConfig) -> str:
    app_dir = project_dir / cfg.workspace.app_root
    symbolic = _run_git(["symbolic-ref", "--short", "HEAD"], app_dir)
    if symbolic.returncode == 0 and symbolic.stdout.strip():
        return symbolic.stdout.strip()
    branch = _run_git(["rev-parse", "--abbrev-ref", "HEAD"], app_dir)
    if branch.returncode == 0:
        value = branch.stdout.strip()
        if value and value != "HEAD":
            return value
    return ""


def ensure_app_branch(project_dir: Path, cfg: HarnessConfig) -> dict[str, Any]:
    app_dir = project_dir / cfg.workspace.app_root
    if not (app_dir / ".git").exists() or not cfg.workspace.git.branch:
        return {"changed": False, "reason": "repo or configured branch missing"}
    current = current_app_branch(project_dir, cfg)
    if current == cfg.workspace.git.branch:
        return {"changed": False, "current_branch": current}
    has_commit = _run_git(["rev-parse", "--verify", "HEAD"], app_dir).returncode == 0
    if has_commit:
        return {
            "changed": False,
            "current_branch": current,
            "configured_branch": cfg.workspace.git.branch,
            "reason": "existing branch differs; not renaming committed history",
        }
    result = _run_git(["symbolic-ref", "HEAD", f"refs/heads/{cfg.workspace.git.branch}"], app_dir)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "Failed to set app repo branch.")
    return {
        "changed": True,
        "previous_branch": current,
        "current_branch": cfg.workspace.git.branch,
    }


def record_app_git_evidence(
    project_dir: Path,
    cfg: HarnessConfig,
    paths: dict[str, Path],
    *,
    phase: str,
) -> dict[str, Any]:
    app_dir = project_dir / cfg.workspace.app_root
    git_dir = paths["git"]
    git_dir.mkdir(parents=True, exist_ok=True)

    status = _run_git(["status", "--porcelain=v1", "-uall"], app_dir)
    status_text = status.stdout if status.returncode == 0 else status.stderr
    (git_dir / f"{phase}-status.txt").write_text(status_text)

    unstaged = _run_git(["diff", "--name-only"], app_dir)
    staged = _run_git(["diff", "--cached", "--name-only"], app_dir)
    untracked = _run_git(["ls-files", "--others", "--exclude-standard"], app_dir)
    changed_rel = []
    if unstaged.returncode == 0:
        changed_rel.extend(path for path in unstaged.stdout.splitlines() if path)
    if staged.returncode == 0:
        changed_rel.extend(path for path in staged.stdout.splitlines() if path)
    if untracked.returncode == 0:
        changed_rel.extend(path for path in untracked.stdout.splitlines() if path)
    changed_rel = sorted(dict.fromkeys(changed_rel))
    (git_dir / f"{phase}-diff-name-only.txt").write_text("\n".join(changed_rel) + ("\n" if changed_rel else ""))

    unstaged_diff = _run_git(["diff", "--binary"], app_dir)
    staged_diff = _run_git(["diff", "--cached", "--binary"], app_dir)
    diff_sections: list[str] = []
    if unstaged_diff.returncode == 0:
        if unstaged_diff.stdout:
            diff_sections.append("# Unstaged changes\n" + unstaged_diff.stdout)
    else:
        diff_sections.append("# Unstaged diff failed\n" + unstaged_diff.stderr)
    if staged_diff.returncode == 0:
        if staged_diff.stdout:
            diff_sections.append("# Staged changes\n" + staged_diff.stdout)
    else:
        diff_sections.append("# Staged diff failed\n" + staged_diff.stderr)
    diff_text = "\n\n".join(diff_sections)
    if untracked.returncode == 0 and untracked.stdout.strip():
        diff_text += "\n\n# Untracked files\n" + untracked.stdout
    (git_dir / f"{phase}-diff.patch").write_text(diff_text)

    return {
        "phase": phase,
        "changed_files": [f"{cfg.workspace.app_root}/{path}" for path in changed_rel],
        "status_path": str(git_dir / f"{phase}-status.txt"),
        "diff_name_only_path": str(git_dir / f"{phase}-diff-name-only.txt"),
        "diff_patch_path": str(git_dir / f"{phase}-diff.patch"),
    }


def protected_repo_violations(project_dir: Path, cfg: HarnessConfig) -> list[str]:
    protected_repos: set[str] = set()
    app_root = Path(cfg.workspace.app_root).as_posix()
    for pattern in cfg.workspace.protected_paths:
        root = pattern.removesuffix("/**")
        if not root.startswith("repos/"):
            continue
        if root == app_root or root.startswith(f"{app_root}/"):
            continue
        if root.endswith("/.git"):
            root = root.removesuffix("/.git")
        protected_repos.add(root)

    violations: list[str] = []
    for rel in sorted(protected_repos):
        repo = project_dir / rel
        if not (repo / ".git").exists():
            continue
        result = _run_git(["status", "--porcelain=v1", "-uall"], repo)
        if result.returncode != 0:
            violations.append(f"{rel} git status failed")
        elif result.stdout.strip():
            violations.append(f"{rel} has uncommitted changes")
    return violations


def app_git_sync_status(project_dir: Path, cfg: HarnessConfig) -> dict[str, Any]:
    app_dir = project_dir / cfg.workspace.app_root
    remote = _run_git(["remote", "get-url", "origin"], app_dir)
    return {
        "repo_exists": (app_dir / ".git").exists(),
        "configured_remote_url": cfg.workspace.git.remote_url,
        "actual_remote_url": remote.stdout.strip() if remote.returncode == 0 else "",
        "remote_configured": remote.returncode == 0 and bool(remote.stdout.strip()),
        "configured_branch": cfg.workspace.git.branch,
        "current_branch": current_app_branch(project_dir, cfg),
        "push_enabled": cfg.workspace.git.push,
        "git_enabled": cfg.workspace.git.enabled,
        "strategy": cfg.workspace.git.strategy,
    }


def app_git_identity_status(project_dir: Path, cfg: HarnessConfig) -> dict[str, Any]:
    app_dir = project_dir / cfg.workspace.app_root
    name = _run_git(["config", "--get", "user.name"], app_dir)
    email = _run_git(["config", "--get", "user.email"], app_dir)
    user_name = name.stdout.strip() if name.returncode == 0 else ""
    user_email = email.stdout.strip() if email.returncode == 0 else ""
    required = cfg.workspace.git.enabled or cfg.workspace.git.push
    return {
        "required": required,
        "user_name_configured": bool(user_name),
        "user_email_configured": bool(user_email),
        "commit_identity_configured": bool(user_name and user_email),
    }


def ensure_app_remote(project_dir: Path, cfg: HarnessConfig) -> dict[str, Any]:
    app_dir = project_dir / cfg.workspace.app_root
    if not cfg.workspace.git.remote_url:
        return app_git_sync_status(project_dir, cfg)
    status = app_git_sync_status(project_dir, cfg)
    if status["actual_remote_url"] == cfg.workspace.git.remote_url:
        return status
    if status["actual_remote_url"]:
        raise RuntimeError("Cannot configure app repo origin: origin remote does not match workspace.git.remote_url.")
    result = _run_git(["remote", "add", "origin", cfg.workspace.git.remote_url], app_dir)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "Failed to configure app git remote.")
    return app_git_sync_status(project_dir, cfg)


def commit_app_changes(project_dir: Path, cfg: HarnessConfig, message: str, *, allow_empty: bool = False) -> dict[str, Any]:
    app_dir = project_dir / cfg.workspace.app_root
    if not cfg.workspace.git.enabled or cfg.workspace.git.strategy == "disabled":
        return {"committed": False, "reason": "git disabled"}
    if cfg.workspace.git.strategy not in {"path-scoped", "all"}:
        raise ValueError(f"Unsupported git strategy: {cfg.workspace.git.strategy}")
    status = _run_git(["status", "--porcelain=v1", "-uall"], app_dir)
    if status.returncode != 0:
        raise RuntimeError(status.stderr.strip() or "git status failed")
    changed = parse_porcelain_paths(status.stdout)
    skipped_protected = [
        f"{cfg.workspace.app_root}/{path}"
        for path in changed
        if path_protected(f"{cfg.workspace.app_root}/{path}", cfg.workspace.protected_paths)
    ]
    skipped_outside_allowlist = []
    if cfg.workspace.git.strategy == "path-scoped":
        skipped_outside_allowlist = [
            f"{cfg.workspace.app_root}/{path}"
            for path in changed
            if not path_protected(f"{cfg.workspace.app_root}/{path}", cfg.workspace.protected_paths)
            and not path_allowed(f"{cfg.workspace.app_root}/{path}", cfg.workspace.write_allowlist)
        ]
    committable = [
        path
        for path in changed
        if not path_protected(f"{cfg.workspace.app_root}/{path}", cfg.workspace.protected_paths)
        and (
            cfg.workspace.git.strategy == "all"
            or path_allowed(f"{cfg.workspace.app_root}/{path}", cfg.workspace.write_allowlist)
        )
    ]
    reset = _run_git(["reset", "-q"], app_dir)
    if reset.returncode != 0:
        raise RuntimeError(reset.stderr.strip() or "git reset failed")
    if not committable:
        if allow_empty and not skipped_protected and not skipped_outside_allowlist:
            commit = _run_git(["commit", "--allow-empty", "-m", message], app_dir)
            if commit.returncode != 0:
                raise RuntimeError(commit.stderr.strip() or "git commit failed")
            return {
                "committed": True,
                "empty": True,
                "message": message,
                "stdout": commit.stdout,
                "staged_files": [],
                "skipped_protected": skipped_protected,
                "skipped_outside_allowlist": skipped_outside_allowlist,
            }
        return {
            "committed": False,
            "reason": "no committable changes",
            "skipped_protected": skipped_protected,
            "skipped_outside_allowlist": skipped_outside_allowlist,
        }
    add = _run_git(["add", "--", *committable], app_dir)
    if add.returncode != 0:
        raise RuntimeError(add.stderr.strip() or "git add failed")
    staged = _run_git(["diff", "--cached", "--quiet"], app_dir)
    if staged.returncode == 0:
        if allow_empty and not skipped_protected and not skipped_outside_allowlist:
            commit = _run_git(["commit", "--allow-empty", "-m", message], app_dir)
            if commit.returncode != 0:
                raise RuntimeError(commit.stderr.strip() or "git commit failed")
            return {
                "committed": True,
                "empty": True,
                "message": message,
                "stdout": commit.stdout,
                "staged_files": [],
                "skipped_protected": skipped_protected,
                "skipped_outside_allowlist": skipped_outside_allowlist,
            }
        return {
            "committed": False,
            "reason": "no staged changes",
            "skipped_protected": skipped_protected,
            "skipped_outside_allowlist": skipped_outside_allowlist,
        }
    commit = _run_git(["commit", "-m", message], app_dir)
    if commit.returncode != 0:
        raise RuntimeError(commit.stderr.strip() or "git commit failed")
    return {
        "committed": True,
        "message": message,
        "stdout": commit.stdout,
        "staged_files": [f"{cfg.workspace.app_root}/{path}" for path in committable],
        "skipped_protected": skipped_protected,
        "skipped_outside_allowlist": skipped_outside_allowlist,
    }


def _validate_push_git_config(cfg: HarnessConfig) -> None:
    if cfg.workspace.git.strategy not in {"disabled", "path-scoped", "all"}:
        raise ValueError(f"Unsupported git strategy: {cfg.workspace.git.strategy}")
    if not cfg.workspace.git.enabled or cfg.workspace.git.strategy == "disabled":
        raise RuntimeError("push requires git commit to be enabled with strategy path-scoped or all.")


def push_app_changes(project_dir: Path, cfg: HarnessConfig) -> dict[str, Any]:
    app_dir = project_dir / cfg.workspace.app_root
    if not cfg.workspace.git.push:
        return {"pushed": False, "reason": "push disabled"}
    _validate_push_git_config(cfg)
    if not cfg.workspace.git.remote_url:
        raise RuntimeError("Cannot push app repo without workspace.git.remote_url set.")
    changed_files = app_changed_files(project_dir, cfg)
    if changed_files:
        raise RuntimeError("Cannot push with uncommitted app repo changes: " + ", ".join(changed_files))
    status = app_git_sync_status(project_dir, cfg)
    configured_remote = status["configured_remote_url"]
    actual_remote = status["actual_remote_url"]
    if configured_remote and actual_remote and actual_remote != configured_remote:
        raise RuntimeError(
            "Cannot push: app repo origin remote does not match workspace.git.remote_url."
        )
    if not status["remote_configured"]:
        raise RuntimeError("Cannot push app repo without a configured origin remote.")
    if status["current_branch"] != cfg.workspace.git.branch:
        raise RuntimeError(
            f"Cannot push: current app branch {status['current_branch']!r} does not match "
            f"configured branch {cfg.workspace.git.branch!r}."
        )
    push = _run_git(["push", "-u", "origin", cfg.workspace.git.branch], app_dir)
    if push.returncode != 0:
        raise RuntimeError(push.stderr.strip() or "git push failed")
    return {"pushed": True, "stdout": push.stdout, "stderr": push.stderr}
