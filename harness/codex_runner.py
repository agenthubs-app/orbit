from __future__ import annotations

import json
import os
import shutil
import signal
import subprocess
import tempfile
import time
from pathlib import Path

from harness.config import SingleAgentConfig
from harness import log

_BLOCKED_EXTRA_ARG_FLAGS = {
    "--add-dir",
    "--cd",
    "--color",
    "--dangerously-bypass-approvals-and-sandbox",
    "--dangerously-bypass-hook-trust",
    "--ignore-rules",
    "--ignore-user-config",
    "--json",
    "--local-provider",
    "--model",
    "--oss",
    "--output-last-message",
    "--output-schema",
    "--profile",
    "--sandbox",
    "--skip-git-repo-check",
    "-C",
    "-c",
    "-m",
    "-o",
    "-p",
    "-s",
}
_BLOCKED_CONFIG_PREFIXES = (
    "approval",
    "model",
    "model_provider",
    "model_reasoning",
    "sandbox",
    "shell_environment_policy",
)

# codex_runner.py 负责把 Generator/Verifier 等角色映射成 Codex CLI 调用。
# 这里的重点不是拼命开放参数，而是明确哪些 CLI 选项归 harness 管，
# 防止 extra_args 绕过 sandbox、模型、provider 或 prompt 传递边界。

def codex_extra_args_issues(extra_args: list[str]) -> list[str]:
    # extra_args 只能追加非关键参数；sandbox、model、cwd、provider、stdin prompt
    # 都由 harness 构造，避免配置文件覆盖安全边界。
    issues: list[str] = []
    index = 0
    while index < len(extra_args):
        arg = extra_args[index]
        if not isinstance(arg, str):
            issues.append(f"codex.extra_args[{index}] must be a string")
            index += 1
            continue
        if not arg.startswith("-"):
            issues.append(f"codex.extra_args[{index}]={arg!r} is positional; prompts must be sent through stdin")
            index += 1
            continue
        flag = arg.split("=", 1)[0]
        if flag in {"--config", "-c"}:
            if "=" in arg and flag == "--config":
                config_value = arg.split("=", 1)[1]
            elif index + 1 < len(extra_args):
                config_value = extra_args[index + 1]
                index += 1
            else:
                config_value = ""
            config_key = config_value.split("=", 1)[0]
            if not config_key:
                issues.append(f"codex.extra_args contains malformed {flag} without key=value")
            elif any(
                config_key == prefix or config_key.startswith(f"{prefix}.") or config_key.startswith(f"{prefix}_")
                for prefix in _BLOCKED_CONFIG_PREFIXES
            ):
                issues.append(f"codex.extra_args must not override Codex config key {config_key!r}")
            index += 1
            continue
        if flag in _BLOCKED_EXTRA_ARG_FLAGS:
            issues.append(f"codex.extra_args must not override harness-owned Codex flag {flag!r}")
        index += 1
    return issues


def validate_codex_extra_args(extra_args: list[str]) -> None:
    issues = codex_extra_args_issues(extra_args)
    if issues:
        raise ValueError("Invalid codex.extra_args: " + "; ".join(issues))


def build_codex_command(prompt: str, agent_cfg: SingleAgentConfig, cwd: Path | None = None) -> list[str]:
    # prompt 始终通过 stdin 传给 `codex exec -`，避免大 prompt 出现在 argv 或进程列表里。
    validate_codex_extra_args(agent_cfg.codex.extra_args)
    cmd = [
        "codex",
        "exec",
        "--skip-git-repo-check",
        "--color",
        "never",
    ]
    if cwd is not None:
        cmd.extend(["--cd", str(cwd)])
    if agent_cfg.codex.approval_mode == "full-auto":
        cmd.append("--dangerously-bypass-approvals-and-sandbox")
    elif agent_cfg.codex.approval_mode in {"read-only", "workspace-write", "danger-full-access"}:
        cmd.extend(["--sandbox", agent_cfg.codex.approval_mode])
        if cwd is not None and agent_cfg.codex.approval_mode == "workspace-write":
            cmd.extend([
                "--config",
                f"sandbox_workspace_write.writable_roots=[{json.dumps(str(cwd))}]",
            ])
    else:
        raise ValueError(f"Unsupported Codex approval_mode: {agent_cfg.codex.approval_mode}")
    if agent_cfg.codex.provider == "oss":
        cmd.append("--oss")
    elif agent_cfg.codex.provider and agent_cfg.codex.provider != "openai":
        cmd.extend(["--config", f'model_provider="{agent_cfg.codex.provider}"'])
    if agent_cfg.model:
        cmd.extend(["--model", agent_cfg.model])
    if agent_cfg.codex.reasoning_effort:
        cmd.extend(["--config", f'model_reasoning_effort="{agent_cfg.codex.reasoning_effort}"'])
    cmd.extend(agent_cfg.codex.extra_args)
    cmd.append("-")
    return cmd


def run_codex(prompt: str, agent_cfg: SingleAgentConfig, cwd: Path | None = None, timeout: float = 1500) -> str:
    # 真实 CLI 调用统一走这里，负责日志、超时和进程组清理。
    # stdout 是 agent 最终回复；stderr 只在失败时进入错误信息尾部。
    if not shutil.which("codex"):
        raise RuntimeError("Codex CLI not found. Install and authenticate Codex CLI before running this harness.")

    cmd = build_codex_command(prompt, agent_cfg, cwd=cwd)
    display_cmd = cmd[:-1] + [f"<prompt chars={len(prompt)}>"]
    logger = log.get()
    logger.info("[Codex] start cwd=%s timeout=%ss cmd=%s", cwd or Path.cwd(), timeout, log.compact(display_cmd, 1000))

    started_at = time.monotonic()
    process = subprocess.Popen(
        cmd,
        cwd=cwd,
        text=True,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        start_new_session=True,
    )
    try:
        stdout, stderr = process.communicate(input=prompt, timeout=timeout)
    except subprocess.TimeoutExpired:
        try:
            os.killpg(os.getpgid(process.pid), signal.SIGKILL)
        except ProcessLookupError:
            pass
        stdout, stderr = process.communicate()
        raise RuntimeError(
            f"Codex timed out after {timeout}s.\n"
            f"Partial stdout tail: {stdout[-500:] if stdout else '<empty>'}"
        )
    elapsed = time.monotonic() - started_at
    logger.info(
        "[Codex] complete returncode=%s elapsed=%.1fs stdout_tail=%s stderr_tail=%s",
        process.returncode,
        elapsed,
        log.compact(stdout[-1200:], 1200),
        log.compact(stderr[-1200:], 1200),
    )
    if process.returncode != 0:
        raise RuntimeError(f"Codex exited with {process.returncode}:\n{stderr[-1000:]}")
    return stdout.strip()


def _run_checked(cmd: list[str], cwd: Path) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(cmd, cwd=cwd, text=True, capture_output=True)
    if result.returncode != 0:
        raise RuntimeError((result.stderr or result.stdout).strip() or f"{cmd[0]} failed")
    return result


def _copy_app_for_isolated_codex(app_dir: Path, isolated_app: Path) -> None:
    # 隔离 app 复制源码但复用 node_modules symlink，避免每次 Generator 都重新安装依赖。
    ignored = shutil.ignore_patterns(".git", ".next", ".turbo", "node_modules")
    shutil.copytree(app_dir, isolated_app, ignore=ignored)
    node_modules = app_dir / "node_modules"
    if node_modules.exists():
        os.symlink(node_modules, isolated_app / "node_modules", target_is_directory=True)


def _init_isolated_git_baseline(isolated_app: Path) -> None:
    _run_checked(["git", "init", "-q"], isolated_app)
    _run_checked(["git", "config", "user.email", "harness@example.invalid"], isolated_app)
    _run_checked(["git", "config", "user.name", "Orbit Harness"], isolated_app)
    _run_checked(["git", "add", "-A"], isolated_app)
    _run_checked(["git", "commit", "-q", "--no-gpg-sign", "-m", "baseline"], isolated_app)


def _parse_porcelain_paths(status: str) -> list[str]:
    paths: list[str] = []
    for line in status.splitlines():
        if not line:
            continue
        path = line[3:] if len(line) > 3 else line
        if " -> " in path:
            old_path, new_path = path.split(" -> ", 1)
            paths.extend(value for value in (old_path, new_path) if value)
        elif path:
            paths.append(path)
    return sorted(dict.fromkeys(paths))


def sync_isolated_app_changes(isolated_app: Path, app_dir: Path) -> list[str]:
    # Codex 在临时 git repo 中改文件；同步时只复制 git 可见变更。
    # 运行产物和 ignored 目录不会被带回真实 app repo。
    status = _run_checked(["git", "status", "--porcelain=v1", "-uall"], isolated_app)
    changed_paths = _parse_porcelain_paths(status.stdout)
    synced: list[str] = []
    ignored_roots = (".git/", ".next/", ".turbo/", "node_modules/")
    for rel in changed_paths:
        if rel in {".git", ".next", ".turbo", "node_modules"} or rel.startswith(ignored_roots):
            continue
        source = isolated_app / rel
        target = app_dir / rel
        if source.exists() or source.is_symlink():
            target.parent.mkdir(parents=True, exist_ok=True)
            if source.is_dir() and not source.is_symlink():
                if target.exists():
                    shutil.rmtree(target)
                shutil.copytree(source, target)
            else:
                if target.exists() and target.is_dir():
                    shutil.rmtree(target)
                shutil.copy2(source, target, follow_symlinks=False)
        else:
            if target.is_dir() and not target.is_symlink():
                shutil.rmtree(target)
            elif target.exists() or target.is_symlink():
                target.unlink()
        synced.append(rel)
    return sorted(dict.fromkeys(synced))


def run_codex_in_isolated_app(
    prompt: str,
    agent_cfg: SingleAgentConfig,
    app_dir: Path,
    timeout: float = 1500,
) -> str:
    # Generator 使用隔离 app 工作区，降低半成品或工具副作用直接污染主 app repo 的风险。
    # CLI 成功后再按 git diff 同步回真实 app。
    temp_root = Path(tempfile.mkdtemp(prefix="orbit-codex-app-"))
    isolated_app = temp_root / "app"
    try:
        _copy_app_for_isolated_codex(app_dir, isolated_app)
        _init_isolated_git_baseline(isolated_app)
        output = run_codex(prompt, agent_cfg, cwd=isolated_app, timeout=timeout)
        synced = sync_isolated_app_changes(isolated_app, app_dir)
        log.get().info("[Codex] isolated app synced files=%s", synced)
        return output
    finally:
        shutil.rmtree(temp_root, ignore_errors=True)
