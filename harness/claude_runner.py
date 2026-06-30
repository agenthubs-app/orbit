from __future__ import annotations

import inspect
import os
from pathlib import Path
from typing import Any

from harness.config import SingleAgentConfig
from harness import log

# claude_runner.py 是 Claude SDK / DeepCode SDK-compatible 调用的 options 适配层。
# 不同 SDK 版本支持的 ClaudeAgentOptions 参数可能不同，所以这里先构造完整 kwargs，
# 再按运行时签名过滤，避免版本差异直接打断 harness。

def _expand_env_value(value: str) -> str:
    # DeepCode env 支持 "${NAME}" 形式从当前进程环境展开，避免把真实密钥写进 config.yaml。
    if value.startswith("${") and value.endswith("}"):
        return os.environ.get(value[2:-1], "")
    return value


def build_claude_options_kwargs(
    agent_cfg: SingleAgentConfig,
    system_prompt: str,
    *,
    allowed_tools: list[str] | None = None,
    disallowed_tools: list[str] | None = None,
    tools: list[Any] | None = None,
    mcp_servers: dict[str, Any] | None = None,
    permission_mode: str = "bypassPermissions",
    cwd: str | None = None,
    resume: str | None = None,
    max_turns: int | None = None,
    env: dict[str, str] | None = None,
) -> dict[str, Any]:
    # 这里不实例化 SDK options，只生成可检查的 kwargs，方便单元测试验证工具权限和模型配置。
    kwargs: dict[str, Any] = {
        "system_prompt": system_prompt,
        "permission_mode": permission_mode,
    }
    if agent_cfg.backend == "deepcode":
        kwargs["cli_path"] = agent_cfg.deepcode.cli_path
        kwargs["env"] = {
            **os.environ,
            **{key: _expand_env_value(value) for key, value in agent_cfg.deepcode.env.items()},
        }
    elif env is not None:
        kwargs["env"] = env
    if agent_cfg.model:
        kwargs["model"] = agent_cfg.model
    if allowed_tools is not None:
        kwargs["allowed_tools"] = allowed_tools
    if disallowed_tools is not None:
        kwargs["disallowed_tools"] = disallowed_tools
    if tools is not None:
        kwargs["tools"] = tools
    if mcp_servers is not None:
        kwargs["mcp_servers"] = mcp_servers
    if cwd is not None:
        kwargs["cwd"] = cwd
    if resume is not None:
        kwargs["resume"] = resume
    if max_turns is not None:
        kwargs["max_turns"] = max_turns
    if agent_cfg.thinking.enabled:
        kwargs["thinking"] = {"type": "enabled", "budget_tokens": agent_cfg.thinking.budget_tokens}
        kwargs["max_thinking_tokens"] = agent_cfg.thinking.budget_tokens
    elif agent_cfg.temperature is not None:
        kwargs["temperature"] = agent_cfg.temperature
    if agent_cfg.max_tokens:
        kwargs["max_tokens"] = agent_cfg.max_tokens
    return kwargs


def _filter_supported_option_kwargs(options_cls: Any, options_kwargs: dict[str, Any]) -> tuple[dict[str, Any], list[str]]:
    # SDK 向后/向前兼容保护：不支持的 option 被丢弃并写日志，而不是让构造函数抛错。
    signature = inspect.signature(options_cls)
    if any(param.kind == inspect.Parameter.VAR_KEYWORD for param in signature.parameters.values()):
        return options_kwargs, []
    supported = set(signature.parameters)
    filtered = {key: value for key, value in options_kwargs.items() if key in supported}
    dropped = sorted(key for key in options_kwargs if key not in supported)
    return filtered, dropped


def build_claude_options(agent_cfg: SingleAgentConfig, system_prompt: str, **kwargs: Any):
    # 日志会隐藏 system_prompt 和 env，避免把 prompt 或密钥打进 harness 日志。
    from claude_agent_sdk import ClaudeAgentOptions

    options_kwargs = build_claude_options_kwargs(agent_cfg, system_prompt, **kwargs)
    options_kwargs, dropped = _filter_supported_option_kwargs(ClaudeAgentOptions, options_kwargs)
    safe_kwargs = {key: value for key, value in options_kwargs.items() if key not in {"system_prompt", "env"}}
    if "cli_path" in safe_kwargs:
        safe_kwargs["cli_path"] = str(Path(str(safe_kwargs["cli_path"])).name)
    log.get().info(
        "[ClaudeSDK] options backend=%s model=%s system_chars=%s kwargs=%s dropped_unsupported=%s",
        agent_cfg.backend,
        agent_cfg.model or "<sdk-default>",
        len(system_prompt),
        log.compact(log.redact(safe_kwargs), 1000),
        dropped,
    )
    return ClaudeAgentOptions(**options_kwargs)
