from __future__ import annotations

from dataclasses import dataclass, field, fields
from pathlib import Path
from typing import Optional

import yaml

# config.py 把 YAML 配置转换成强类型 dataclass。
# 这里选择严格拒绝未知 key，目的是让长跑 agent 的权限、模型和路径配置
# 出错时尽早失败，而不是静默落到默认值继续运行。

def _mapping(section: str, data: object | None) -> dict:
    if data is None:
        return {}
    if not isinstance(data, dict):
        raise ValueError(f"Config section {section} must be a mapping.")
    return data


def _dataclass_keys(config_cls: type) -> set[str]:
    return {item.name for item in fields(config_cls)}


def _reject_unknown_keys(section: str, data: object | None, allowed: set[str]) -> dict:
    # 配置拼写错误通常比缺省值更危险；例如把 generator 写成 generatr
    # 会让整条链路用错误默认角色运行，所以这里直接抛错。
    mapped = _mapping(section, data)
    unknown = sorted(set(mapped) - allowed)
    if unknown:
        joined = ", ".join(unknown)
        raise ValueError(f"Unknown config key(s) in {section}: {joined}")
    return mapped


def _load_dataclass(section: str, config_cls: type, data: object | None):
    mapped = _reject_unknown_keys(section, data, _dataclass_keys(config_cls))
    return config_cls(**mapped)


def _string_list_value(section: str, data: dict, key: str, default: list[str]) -> list[str]:
    if key not in data:
        return default
    value = data[key]
    if not isinstance(value, list):
        raise ValueError(f"{section}.{key} must be a list of strings.")
    if any(not isinstance(item, str) for item in value):
        raise ValueError(f"{section}.{key} must contain only strings.")
    return value


def _non_negative_int_value(section: str, data: dict, key: str, default: int) -> int:
    if key not in data:
        return default
    value = data[key]
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise ValueError(f"{section}.{key} must be a non-negative integer.")
    return value


def _bool_value(section: str, data: dict, key: str, default: bool) -> bool:
    if key not in data:
        return default
    value = data[key]
    if not isinstance(value, bool):
        raise ValueError(f"{section}.{key} must be a boolean.")
    return value


def _string_value(section: str, data: dict, key: str, default: str) -> str:
    if key not in data:
        return default
    value = data[key]
    if not isinstance(value, str):
        raise ValueError(f"{section}.{key} must be a string.")
    return value


def _enum_value(section: str, data: dict, key: str, default: str, allowed: set[str]) -> str:
    value = data.get(key, default)
    if value not in allowed:
        allowed_values = ", ".join(sorted(allowed))
        raise ValueError(f"{section}.{key} is unsupported: {value!r}; allowed: {allowed_values}.")
    return value


@dataclass
class ThinkingConfig:
    enabled: bool = False
    budget_tokens: int = 8000


@dataclass
class CodexSettings:
    approval_mode: str = "workspace-write"
    quiet: bool = True
    reasoning_effort: str = "medium"
    provider: str = "openai"
    extra_args: list[str] = field(default_factory=list)


@dataclass
class DeepcodeSettings:
    cli_path: str = "/Users/xzhao/.local/bin/deepcode"
    env: dict[str, str] = field(default_factory=dict)


@dataclass
class SingleAgentConfig:
    # 单个 agent 的运行配置。backend 决定走 Claude SDK、Codex CLI 还是 DeepCode CLI；
    # codex/deepcode 子配置即使当前 backend 不使用，也保留为统一 schema 的一部分。
    backend: str = "claude"
    model: str = ""
    max_tokens: int = 8192
    temperature: Optional[float] = None
    thinking: ThinkingConfig = field(default_factory=ThinkingConfig)
    codex: CodexSettings = field(default_factory=CodexSettings)
    deepcode: DeepcodeSettings = field(default_factory=DeepcodeSettings)
    self_assess_model: str = "claude-opus-4-7"

    @classmethod
    def from_dict(cls, data: dict | None, section: str = "agent") -> "SingleAgentConfig":
        data = _reject_unknown_keys(section, data, _dataclass_keys(cls))
        return cls(
            backend=data.get("backend", "claude"),
            model=data.get("model", ""),
            max_tokens=data.get("max_tokens", 8192),
            temperature=data.get("temperature"),
            thinking=_load_dataclass(f"{section}.thinking", ThinkingConfig, data.get("thinking")),
            codex=_load_dataclass(f"{section}.codex", CodexSettings, data.get("codex")),
            deepcode=_load_dataclass(f"{section}.deepcode", DeepcodeSettings, data.get("deepcode")),
            self_assess_model=data.get("self_assess_model", "claude-opus-4-7"),
        )


_DEFAULT_MODELS = {
    "planner": "claude-opus-4-7",
    "generator": "claude-opus-4-7",
    "evaluator": "claude-opus-4-7",
    "verifier": "claude-opus-4-7",
}


@dataclass
class AgentConfig:
    # 四个 agent 角色共享同一配置形状，但职责不同：
    # Planner 写 contract，Generator 改 app，Evaluator/Verifier 做只读审查。
    planner: SingleAgentConfig = field(default_factory=lambda: SingleAgentConfig(model=_DEFAULT_MODELS["planner"]))
    generator: SingleAgentConfig = field(default_factory=lambda: SingleAgentConfig(model=_DEFAULT_MODELS["generator"]))
    evaluator: SingleAgentConfig = field(default_factory=lambda: SingleAgentConfig(model=_DEFAULT_MODELS["evaluator"]))
    verifier: SingleAgentConfig = field(default_factory=lambda: SingleAgentConfig(model=_DEFAULT_MODELS["verifier"]))

    @classmethod
    def from_dict(cls, data: dict | None) -> "AgentConfig":
        data = _reject_unknown_keys("agents", data, _dataclass_keys(cls))

        def load(key: str) -> SingleAgentConfig:
            cfg = SingleAgentConfig.from_dict(data.get(key), f"agents.{key}")
            if not cfg.model:
                cfg.model = _DEFAULT_MODELS[key]
            return cfg

        return cls(
            planner=load("planner"),
            generator=load("generator"),
            evaluator=load("evaluator"),
            verifier=load("verifier"),
        )


@dataclass
class LoopConfig:
    # loop 预算是防止长跑 harness 无限制消耗的硬边界。
    # timeout 控制单次 agent 调用，max/min_iterations 控制 sprint 迭代次数。
    max_iterations: int = 8
    min_iterations: int = 1
    planner_max_turns: int = 160
    planner_timeout_seconds: int = 900
    generator_max_turns: int = 160
    generator_timeout_seconds: int = 1500
    self_assess_timeout_seconds: int = 180
    self_assess_max_repair_passes: int = 1
    reviewer_runtime_retries: int = 1
    contract_review_rounds: int = 2


@dataclass
class VerdictConfig:
    pass_threshold: float = 3.0
    conditional_pass_threshold: float = 2.0


@dataclass
class VerificationConfig:
    pass_threshold: float = 3.5
    conditional_pass_threshold: float = 3.0
    block_on_high_severity: bool = True


@dataclass
class WorkspaceGitConfig:
    # git strategy 决定 harness 是否自动提交，以及提交范围是 app path-scoped 还是全部。
    enabled: bool = False
    strategy: str = "disabled"
    remote_url: str = ""
    branch: str = "main"
    push: bool = False

    @classmethod
    def from_dict(cls, data: dict | None) -> "WorkspaceGitConfig":
        data = _reject_unknown_keys("workspace.git", data, _dataclass_keys(cls))
        return cls(
            enabled=_bool_value("workspace.git", data, "enabled", False),
            strategy=_enum_value("workspace.git", data, "strategy", "disabled", {"disabled", "path-scoped", "all"}),
            remote_url=_string_value("workspace.git", data, "remote_url", ""),
            branch=_string_value("workspace.git", data, "branch", "main"),
            push=_bool_value("workspace.git", data, "push", False),
        )


@dataclass
class WorkspaceConfig:
    # workspace 配置定义 app、artifact、log、tmp 的相对路径。
    # write_allowlist/protected_paths 是 Generator 与 git 提交的共同边界。
    mode: str = "greenfield"
    app_root: str = "repos/orbits"
    artifact_root: str = "harness-state"
    log_root: str = "harness-logs"
    evidence_root: str = "harness-state/evidence"
    tmp_root: str = "harness-state/tmp"
    keep_last_runs: int = 10
    keep_last_evidence_per_sprint: int = 3
    write_allowlist: list[str] = field(default_factory=lambda: ["repos/orbits/**"])
    protected_paths: list[str] = field(default_factory=lambda: [
        ".git/**",
        ".env*",
        "node_modules/**",
        ".next/**",
        "dist/**",
        "build/**",
        "harness-state/**",
        "harness-logs/**",
        "repos/orbits/.git/**",
        "repos/orbits/.env*",
        "repos/orbits/node_modules/**",
        "repos/orbits/.next/**",
        "repos/orbits/dist/**",
        "repos/orbits/build/**",
        "repos/tokyo-business-connect/.git/**",
        "repos/tokyo-business-connect/**",
    ])
    git: WorkspaceGitConfig = field(default_factory=WorkspaceGitConfig)

    @classmethod
    def from_dict(cls, data: dict | None) -> "WorkspaceConfig":
        data = _reject_unknown_keys("workspace", data, _dataclass_keys(cls))
        return cls(
            mode=_enum_value("workspace", data, "mode", "greenfield", {"greenfield", "existing-codebase", "production-qa"}),
            app_root=data.get("app_root", "repos/orbits"),
            artifact_root=data.get("artifact_root", "harness-state"),
            log_root=data.get("log_root", "harness-logs"),
            evidence_root=data.get("evidence_root", "harness-state/evidence"),
            tmp_root=data.get("tmp_root", "harness-state/tmp"),
            keep_last_runs=_non_negative_int_value("workspace", data, "keep_last_runs", 10),
            keep_last_evidence_per_sprint=_non_negative_int_value("workspace", data, "keep_last_evidence_per_sprint", 3),
            write_allowlist=_string_list_value("workspace", data, "write_allowlist", cls().write_allowlist),
            protected_paths=_string_list_value("workspace", data, "protected_paths", cls().protected_paths),
            git=WorkspaceGitConfig.from_dict(data.get("git")),
        )


@dataclass
class HarnessConfig:
    # HarnessConfig 是所有 runner 的唯一配置入口。
    # load() 只读取 YAML，不做 runtime 探测；preflight 负责检查环境是否真的可用。
    agents: AgentConfig = field(default_factory=AgentConfig)
    loop: LoopConfig = field(default_factory=LoopConfig)
    verdict: VerdictConfig = field(default_factory=VerdictConfig)
    verification: VerificationConfig = field(default_factory=VerificationConfig)
    workspace: WorkspaceConfig = field(default_factory=WorkspaceConfig)

    @classmethod
    def load(cls, path: Path) -> "HarnessConfig":
        loaded = yaml.safe_load(path.read_text())
        raw = _reject_unknown_keys("config", loaded if loaded is not None else {}, _dataclass_keys(cls))
        return cls(
            agents=AgentConfig.from_dict(raw.get("agents")),
            loop=_load_dataclass("loop", LoopConfig, raw.get("loop")),
            verdict=_load_dataclass("verdict", VerdictConfig, raw.get("verdict")),
            verification=_load_dataclass("verification", VerificationConfig, raw.get("verification")),
            workspace=WorkspaceConfig.from_dict(raw.get("workspace")),
        )
