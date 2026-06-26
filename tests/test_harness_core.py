from __future__ import annotations

from pathlib import Path
from threading import Thread
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


def _write_config(tmp_path, text: str) -> Path:
    path = tmp_path / "config.yaml"
    path.write_text(text.strip() + "\n")
    return path


def _single_iteration_root(tmp_path: Path, sprint: int = 1, iteration: int = 1) -> Path:
    matches = sorted((tmp_path / "harness-state/runs").glob(f"*/sprint-{sprint}/iter-{iteration}"))
    assert len(matches) == 1
    return matches[0]


def test_runtime_dependencies_include_claude_agent_sdk():
    import importlib.util

    assert importlib.util.find_spec("claude_agent_sdk") is not None


def test_config_loads_existing_app_and_verifier_defaults():
    from harness.config import HarnessConfig

    cfg = HarnessConfig.load(Path("harness/config.yaml"))

    assert cfg.workspace.mode == "greenfield"
    assert cfg.workspace.app_root == "repos/orbits"
    assert cfg.workspace.git.enabled is True
    assert cfg.workspace.git.strategy == "path-scoped"
    assert "harness-state/**" in cfg.workspace.protected_paths
    assert "repos/orbits/**" in cfg.workspace.write_allowlist
    assert "repos/tokyo-business-connect/**" in cfg.workspace.protected_paths
    assert cfg.agents.planner.backend == "claude"
    assert cfg.agents.planner.model == "claude-4.8"
    assert cfg.agents.planner.thinking.enabled is True
    assert cfg.agents.planner.thinking.budget_tokens == 32768
    assert cfg.agents.generator.backend == "codex"
    assert cfg.agents.generator.model == "gpt-5.5"
    assert cfg.agents.generator.codex.approval_mode == "workspace-write"
    assert cfg.agents.generator.codex.reasoning_effort == "xhigh"
    assert cfg.agents.evaluator.backend == "claude"
    assert cfg.agents.evaluator.model == "claude-4.8"
    assert cfg.agents.evaluator.thinking.enabled is True
    assert cfg.agents.evaluator.thinking.budget_tokens == 16384
    assert cfg.agents.verifier.backend == "codex"
    assert cfg.agents.verifier.model == "gpt-5.5"
    assert cfg.agents.verifier.codex.approval_mode == "read-only"
    assert cfg.agents.verifier.codex.reasoning_effort == "high"
    assert cfg.verdict.pass_threshold >= cfg.verdict.conditional_pass_threshold
    assert cfg.verification.pass_threshold >= cfg.verification.conditional_pass_threshold
    assert cfg.loop.planner_max_turns == 160
    assert cfg.loop.planner_timeout_seconds == 900
    assert cfg.workspace.git.remote_url == ""
    assert cfg.workspace.git.branch == "main"
    assert cfg.workspace.git.push is False


def test_config_does_not_expose_unused_strategic_decision_model():
    from harness.config import HarnessConfig

    cfg = HarnessConfig.load(Path("harness/config.yaml"))

    assert not hasattr(cfg.loop, "strategic_decision_model")


def test_config_rejects_unknown_top_level_keys(tmp_path):
    import pytest

    from harness.config import HarnessConfig

    path = _write_config(
        tmp_path,
        """
        workspce:
          app_root: repos/orbits
        """,
    )

    with pytest.raises(ValueError, match=r"config.*workspce"):
        HarnessConfig.load(path)


def test_config_rejects_non_mapping_root(tmp_path):
    import pytest

    from harness.config import HarnessConfig

    path = _write_config(tmp_path, "[]")

    with pytest.raises(ValueError, match=r"config.*mapping"):
        HarnessConfig.load(path)


def test_config_rejects_unknown_agent_roles(tmp_path):
    import pytest

    from harness.config import HarnessConfig

    path = _write_config(
        tmp_path,
        """
        agents:
          generatr:
            backend: codex
            model: gpt-5.5
        """,
    )

    with pytest.raises(ValueError, match=r"agents.*generatr"):
        HarnessConfig.load(path)


def test_config_rejects_unknown_agent_fields(tmp_path):
    import pytest

    from harness.config import HarnessConfig

    path = _write_config(
        tmp_path,
        """
        agents:
          generator:
            backend: codex
            modle: gpt-5.5
        """,
    )

    with pytest.raises(ValueError, match=r"agents\.generator.*modle"):
        HarnessConfig.load(path)


def test_config_rejects_unknown_nested_agent_fields(tmp_path):
    import pytest

    from harness.config import HarnessConfig

    path = _write_config(
        tmp_path,
        """
        agents:
          generator:
            backend: codex
            codex:
              reasoning_efort: xhigh
        """,
    )

    with pytest.raises(ValueError, match=r"agents\.generator\.codex.*reasoning_efort"):
        HarnessConfig.load(path)


def test_config_rejects_unknown_workspace_fields(tmp_path):
    import pytest

    from harness.config import HarnessConfig

    path = _write_config(
        tmp_path,
        """
        workspace:
          app_rooot: repos/orbits
        """,
    )

    with pytest.raises(ValueError, match=r"workspace.*app_rooot"):
        HarnessConfig.load(path)


def test_config_rejects_unknown_workspace_git_fields(tmp_path):
    import pytest

    from harness.config import HarnessConfig

    path = _write_config(
        tmp_path,
        """
        workspace:
          git:
            remote: git@github.com:example/orbits.git
        """,
    )

    with pytest.raises(ValueError, match=r"workspace\.git.*remote"):
        HarnessConfig.load(path)


def test_config_preserves_empty_write_allowlist(tmp_path):
    from harness.config import HarnessConfig

    path = _write_config(
        tmp_path,
        """
        workspace:
          write_allowlist: []
        """,
    )

    cfg = HarnessConfig.load(path)

    assert cfg.workspace.write_allowlist == []


def test_config_rejects_non_list_workspace_patterns(tmp_path):
    import pytest

    from harness.config import HarnessConfig

    path = _write_config(
        tmp_path,
        """
        workspace:
          write_allowlist: repos/orbits/**
          protected_paths:
            - harness-state/**
        """,
    )

    with pytest.raises(ValueError, match=r"workspace\.write_allowlist.*list"):
        HarnessConfig.load(path)


def test_config_rejects_non_string_workspace_patterns(tmp_path):
    import pytest

    from harness.config import HarnessConfig

    path = _write_config(
        tmp_path,
        """
        workspace:
          protected_paths:
            - harness-state/**
            - 123
        """,
    )

    with pytest.raises(ValueError, match=r"workspace\.protected_paths.*strings"):
        HarnessConfig.load(path)


def test_config_rejects_unknown_workspace_mode(tmp_path):
    import pytest

    from harness.config import HarnessConfig

    path = _write_config(
        tmp_path,
        """
        workspace:
          mode: greenfild
        """,
    )

    with pytest.raises(ValueError, match=r"workspace\.mode.*unsupported"):
        HarnessConfig.load(path)


def test_config_rejects_invalid_workspace_retention_counts(tmp_path):
    import pytest

    from harness.config import HarnessConfig

    path = _write_config(
        tmp_path,
        """
        workspace:
          keep_last_runs: many
        """,
    )

    with pytest.raises(ValueError, match=r"workspace\.keep_last_runs.*non-negative integer"):
        HarnessConfig.load(path)


def test_config_rejects_non_boolean_workspace_git_flags(tmp_path):
    import pytest

    from harness.config import HarnessConfig

    path = _write_config(
        tmp_path,
        """
        workspace:
          git:
            push: "false"
        """,
    )

    with pytest.raises(ValueError, match=r"workspace\.git\.push.*boolean"):
        HarnessConfig.load(path)


def test_config_rejects_non_string_workspace_git_values(tmp_path):
    import pytest

    from harness.config import HarnessConfig

    path = _write_config(
        tmp_path,
        """
        workspace:
          git:
            remote_url: 123
        """,
    )

    with pytest.raises(ValueError, match=r"workspace\.git\.remote_url.*string"):
        HarnessConfig.load(path)


def test_config_rejects_unsupported_workspace_git_strategy(tmp_path):
    import pytest

    from harness.config import HarnessConfig

    path = _write_config(
        tmp_path,
        """
        workspace:
          git:
            strategy: everything
        """,
    )

    with pytest.raises(ValueError, match=r"workspace\.git\.strategy.*unsupported"):
        HarnessConfig.load(path)


def test_codex_command_includes_reasoning_effort_config():
    from harness.codex_runner import build_codex_command
    from harness.config import HarnessConfig

    cfg = HarnessConfig.load(Path("harness/config.yaml"))

    generator_cmd = build_codex_command("generate", cfg.agents.generator)
    verifier_cmd = build_codex_command("verify", cfg.agents.verifier)

    assert "--config" in generator_cmd
    assert 'model_reasoning_effort="xhigh"' in generator_cmd
    assert "--config" in verifier_cmd
    assert 'model_reasoning_effort="high"' in verifier_cmd


def test_codex_command_reads_prompt_from_stdin_not_argv():
    from harness.codex_runner import build_codex_command
    from harness.config import SingleAgentConfig

    cfg = SingleAgentConfig(backend="codex", model="gpt-5.5")
    prompt = "large private sprint prompt"

    cmd = build_codex_command(prompt, cfg)

    assert cmd[-1] == "-"
    assert prompt not in cmd


def test_codex_command_sets_explicit_working_root(tmp_path):
    from harness.codex_runner import build_codex_command
    from harness.config import SingleAgentConfig

    cfg = SingleAgentConfig(backend="codex", model="gpt-5.5")
    app_root = tmp_path / "repos/orbits"

    cmd = build_codex_command("prompt", cfg, cwd=app_root)

    assert ["--cd", str(app_root)] == cmd[cmd.index("--cd") : cmd.index("--cd") + 2]
    assert f'sandbox_workspace_write.writable_roots=["{app_root}"]' in cmd


def test_sync_isolated_app_changes_copies_git_visible_changes(tmp_path):
    import subprocess

    from harness.codex_runner import sync_isolated_app_changes

    app_dir = tmp_path / "app"
    isolated_app = tmp_path / "isolated"
    app_dir.mkdir()
    isolated_app.mkdir()
    for root in (app_dir, isolated_app):
        (root / ".gitignore").write_text("node_modules\n.next\n")
        (root / "keep.txt").write_text("before")
        (root / "delete.txt").write_text("remove me")
    subprocess.run(["git", "init", "-q"], cwd=isolated_app, check=True)
    subprocess.run(["git", "config", "user.email", "harness@example.invalid"], cwd=isolated_app, check=True)
    subprocess.run(["git", "config", "user.name", "Orbit Harness"], cwd=isolated_app, check=True)
    subprocess.run(["git", "add", "-A"], cwd=isolated_app, check=True)
    subprocess.run(["git", "commit", "-q", "--no-gpg-sign", "-m", "baseline"], cwd=isolated_app, check=True)

    (isolated_app / "keep.txt").write_text("after")
    (isolated_app / "delete.txt").unlink()
    (isolated_app / "new.txt").write_text("new")
    (isolated_app / "node_modules").mkdir()
    (isolated_app / "node_modules" / "ignored.txt").write_text("ignored")

    synced = sync_isolated_app_changes(isolated_app, app_dir)

    assert synced == ["delete.txt", "keep.txt", "new.txt"]
    assert (app_dir / "keep.txt").read_text() == "after"
    assert (app_dir / "new.txt").read_text() == "new"
    assert not (app_dir / "delete.txt").exists()
    assert not (app_dir / "node_modules").exists()


def test_generator_codex_uses_isolated_app(tmp_path, monkeypatch):
    from harness.agents.generator import run_generator
    from harness.config import HarnessConfig
    from harness.models.state import SprintContract, SuccessCriterion

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.agents.generator.backend = "codex"
    cfg.loop.generator_timeout_seconds = 123
    app_dir = tmp_path / "repos/orbits"
    captured = {}

    def fake_isolated(prompt, agent_cfg, app_dir, timeout):
        captured["prompt"] = prompt
        captured["agent_cfg"] = agent_cfg
        captured["app_dir"] = app_dir
        captured["timeout"] = timeout
        return "isolated ok"

    monkeypatch.setattr("harness.agents.generator.run_codex_in_isolated_app", fake_isolated)
    contract = SprintContract(
        sprint_number=1,
        goal="Use isolated Codex app workspace.",
        success_criteria=[SuccessCriterion(id="SC-1", description="Generator runs.")],
        evidence={},
        confirmed=True,
    )

    result = run_generator("SPEC", contract, tmp_path, None, None, cfg)

    assert result == "isolated ok"
    assert captured["app_dir"] == app_dir
    assert captured["timeout"] == 123


def test_codex_command_maps_approval_mode_and_provider():
    from harness.codex_runner import build_codex_command
    from harness.config import SingleAgentConfig

    cfg = SingleAgentConfig(backend="codex", model="gpt-5.5")
    cfg.codex.approval_mode = "workspace-write"
    cfg.codex.provider = "oss"

    cmd = build_codex_command("prompt", cfg)

    assert "--dangerously-bypass-approvals-and-sandbox" not in cmd
    assert ["--sandbox", "workspace-write"] == cmd[cmd.index("--sandbox") : cmd.index("--sandbox") + 2]
    assert "--oss" in cmd


def test_codex_command_rejects_extra_args_that_override_harness_controls():
    import pytest

    from harness.codex_runner import build_codex_command
    from harness.config import SingleAgentConfig

    cfg = SingleAgentConfig(backend="codex", model="gpt-5.5")
    cfg.codex.extra_args = ["--sandbox", "read-only"]

    with pytest.raises(ValueError, match="codex.extra_args"):
        build_codex_command("prompt", cfg)


def test_codex_command_rejects_extra_config_that_overrides_reasoning_effort():
    import pytest

    from harness.codex_runner import build_codex_command
    from harness.config import SingleAgentConfig

    cfg = SingleAgentConfig(backend="codex", model="gpt-5.5")
    cfg.codex.reasoning_effort = "xhigh"
    cfg.codex.extra_args = ["--config", 'model_reasoning_effort="low"']

    with pytest.raises(ValueError, match="model_reasoning_effort"):
        build_codex_command("prompt", cfg)


def test_planner_claude_uses_configured_timeout(monkeypatch):
    from harness.agents import planner as planner_module
    from harness.config import HarnessConfig

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.agents.planner.backend = "claude"
    cfg.loop.planner_timeout_seconds = 17
    captured = {}

    def fake_run_planner_claude(brief, session_id, cfg_arg):
        captured["brief"] = brief
        captured["session_id"] = session_id
        captured["cfg"] = cfg_arg
        return "planner-coro"

    def fake_run_async(coro, timeout):
        captured["coro"] = coro
        captured["timeout"] = timeout
        return "SPEC_COMPLETE", "session-1"

    monkeypatch.setattr(planner_module, "_run_planner_claude", fake_run_planner_claude)
    monkeypatch.setattr(planner_module, "_run_async", fake_run_async)

    reply, session_id = planner_module.run_planner("brief", session_id="old-session", cfg=cfg)

    assert reply == "SPEC_COMPLETE"
    assert session_id == "session-1"
    assert captured["brief"] == "brief"
    assert captured["session_id"] == "old-session"
    assert captured["cfg"] is cfg
    assert captured["coro"] == "planner-coro"
    assert captured["timeout"] == 17


def test_planner_codex_uses_configured_timeout(monkeypatch):
    from harness.agents import planner as planner_module
    from harness.config import HarnessConfig

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.agents.planner.backend = "codex"
    cfg.loop.planner_timeout_seconds = 23
    captured = {}

    def fake_run_codex(prompt, agent_cfg, cwd=None, timeout=900):
        captured["prompt"] = prompt
        captured["agent_cfg"] = agent_cfg
        captured["timeout"] = timeout
        return "SPEC_COMPLETE"

    monkeypatch.setattr(planner_module, "run_codex", fake_run_codex)

    reply, session_id = planner_module.run_planner("brief", cfg=cfg)

    assert reply == "SPEC_COMPLETE"
    assert session_id is None
    assert captured["agent_cfg"] is cfg.agents.planner
    assert captured["timeout"] == 23


def test_planner_codex_does_not_add_missing_spec_complete(monkeypatch):
    from harness.agents import planner as planner_module
    from harness.config import HarnessConfig

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.agents.planner.backend = "codex"

    monkeypatch.setattr(planner_module, "run_codex", lambda *args, **kwargs: "# SPEC: Orbit\n\nIncomplete draft")

    reply, session_id = planner_module.run_planner("brief", cfg=cfg)

    assert reply == "# SPEC: Orbit\n\nIncomplete draft"
    assert "SPEC_COMPLETE" not in reply
    assert session_id is None


def test_planner_claude_uses_configured_max_turns(monkeypatch):
    import asyncio
    import sys
    import types

    from harness.agents import planner as planner_module
    from harness.config import HarnessConfig

    class FakeAssistantMessage:
        content = []
        session_id = "session-1"

    class FakeResultMessage:
        result = "SPEC_COMPLETE"
        session_id = "session-1"

    async def fake_query(prompt, options):
        yield FakeResultMessage()

    fake_sdk = types.SimpleNamespace(
        AssistantMessage=FakeAssistantMessage,
        ResultMessage=FakeResultMessage,
        query=fake_query,
    )
    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.loop.planner_max_turns = 19
    captured = {}

    def fake_build_claude_options(agent_cfg, system_prompt, **kwargs):
        captured["max_turns"] = kwargs["max_turns"]
        captured["allowed_tools"] = kwargs["allowed_tools"]
        return object()

    monkeypatch.setitem(sys.modules, "claude_agent_sdk", fake_sdk)
    monkeypatch.setattr(planner_module, "build_claude_options", fake_build_claude_options)

    reply, session_id = asyncio.run(planner_module._run_planner_claude("brief", None, cfg))

    assert reply == "SPEC_COMPLETE"
    assert session_id == "session-1"
    assert captured["max_turns"] == 19
    assert captured["allowed_tools"] == []


def test_claude_reviewers_run_without_file_or_shell_tools(monkeypatch):
    import asyncio
    import sys
    import types

    from harness.agents import evaluator as evaluator_module
    from harness.agents import verifier as verifier_module
    from harness.config import HarnessConfig

    class FakeAssistantMessage:
        content = []

    class FakeResultMessage:
        result = "{}"

    async def fake_query(prompt, options):
        yield FakeResultMessage()

    fake_sdk = types.SimpleNamespace(
        AssistantMessage=FakeAssistantMessage,
        ResultMessage=FakeResultMessage,
        query=fake_query,
    )
    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    captured = []

    def fake_build_claude_options(agent_cfg, system_prompt, **kwargs):
        captured.append(kwargs)
        return object()

    monkeypatch.setitem(sys.modules, "claude_agent_sdk", fake_sdk)
    monkeypatch.setattr(evaluator_module, "build_claude_options", fake_build_claude_options)
    monkeypatch.setattr(verifier_module, "build_claude_options", fake_build_claude_options)

    asyncio.run(evaluator_module._run_evaluator_claude("prompt", Path("repos/orbits"), cfg))
    asyncio.run(verifier_module._run_verifier_claude("prompt", Path("repos/orbits"), cfg))

    assert [kwargs["allowed_tools"] for kwargs in captured] == [[], []]


def test_self_assessment_claude_runs_without_shell_tools(monkeypatch):
    import asyncio
    import sys
    import types

    from harness.agents import generator as generator_module
    from harness.config import SingleAgentConfig

    class FakeAssistantMessage:
        content = []

    class FakeResultMessage:
        result = """```json
{
  "confident": true,
  "concerns": []
}
```"""

    async def fake_query(prompt, options):
        yield FakeResultMessage()

    fake_sdk = types.SimpleNamespace(
        AssistantMessage=FakeAssistantMessage,
        ResultMessage=FakeResultMessage,
        query=fake_query,
    )
    captured = {}

    def fake_build_claude_options(agent_cfg, system_prompt, **kwargs):
        captured.update(kwargs)
        return object()

    monkeypatch.setitem(sys.modules, "claude_agent_sdk", fake_sdk)
    monkeypatch.setattr(generator_module, "build_claude_options", fake_build_claude_options)

    output = asyncio.run(
        generator_module._run_self_assess_claude_async(
            "prompt",
            SingleAgentConfig(backend="claude", model="claude-4.8"),
            Path("repos/orbits"),
        )
    )

    assert output.startswith("```json")
    assert captured["allowed_tools"] == ["Read", "Glob"]
    assert "Bash" not in captured["allowed_tools"]
    assert captured["disallowed_tools"] == ["Bash"]


def test_self_assessment_claude_uses_configured_timeout(monkeypatch):
    from harness.agents import generator as generator_module
    from harness.config import SingleAgentConfig

    captured = {}

    def fake_run_async(coro, timeout):
        captured["coro"] = coro
        captured["timeout"] = timeout
        coro.close()
        return "review"

    monkeypatch.setattr(generator_module, "_run_async", fake_run_async)

    output = generator_module._run_self_assess_claude(
        "prompt",
        SingleAgentConfig(backend="claude", model="claude-4.8"),
        Path("repos/orbits"),
        timeout=37,
    )

    assert output == "review"
    assert captured["timeout"] == 37


def test_self_assess_prompt_disallows_shell_commands():
    from harness.agents.generator import build_self_assess_prompt
    from harness.config import HarnessConfig
    from harness.models.state import SprintContract, SuccessCriterion

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    contract = SprintContract(
        sprint_number=1,
        goal="Review implementation",
        success_criteria=[SuccessCriterion(id="SC-1", description="Entry page exists.")],
        evidence={"routes": ["/"]},
        confirmed=True,
    )

    prompt = build_self_assess_prompt(
        "SPEC",
        contract,
        ["repos/orbits/app/page.jsx"],
        "created page",
        [],
        cfg,
    )

    assert "You may read files, but must not run shell commands or edit files." in prompt
    assert "non-mutating inspection commands" not in prompt


def test_self_assess_prompt_treats_file_boundary_as_allowlist_not_required_edits():
    from harness.agents.generator import build_self_assess_prompt
    from harness.config import HarnessConfig
    from harness.models.state import SprintContract, SuccessCriterion

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    contract = SprintContract(
        sprint_number=77,
        goal="Review event workspace",
        success_criteria=[SuccessCriterion(id="SC-1", description="Event route is polished.")],
        file_boundary={
            "owned_paths": [
                "app/(app)/app/events/[id]/page.tsx",
                "app/(app)/app/events/compose-app-events-from-previously-approved-mock-first-capabilities/events-command-center.tsx",
            ],
            "shared_change_policy": "forbidden_unless_explicit",
        },
        confirmed=True,
    )

    prompt = build_self_assess_prompt(
        "SPEC",
        contract,
        ["repos/orbits/app/(app)/app/events/[id]/page.tsx"],
        "changed only the detail route because list behavior already met SC-1",
        [],
        cfg,
    )

    assert "File boundary and owned paths are an allowlist, not a required edit list." in prompt
    assert "Do not mark confident=false only because an allowed file was not changed" in prompt


def test_claude_options_filters_unsupported_kwargs_and_keeps_thinking_budget():
    from harness.claude_runner import build_claude_options
    from harness.config import SingleAgentConfig

    cfg = SingleAgentConfig(backend="claude", model="claude-4.8", max_tokens=8192, temperature=0.2)
    cfg.thinking.enabled = True
    cfg.thinking.budget_tokens = 4096

    options = build_claude_options(cfg, "system")

    assert options.thinking["budget_tokens"] == 4096
    assert options.max_thinking_tokens == 4096
    assert not hasattr(options, "temperature")
    assert not hasattr(options, "max_tokens")


def test_deepcode_options_pass_configured_model_and_cli_path():
    from harness.claude_runner import build_claude_options_kwargs
    from harness.config import SingleAgentConfig

    cfg = SingleAgentConfig(backend="deepcode", model="deepseek-v4-pro")
    cfg.deepcode.cli_path = "/Users/xzhao/.local/bin/deepcode"

    kwargs = build_claude_options_kwargs(cfg, "system")

    assert kwargs["cli_path"] == "/Users/xzhao/.local/bin/deepcode"
    assert kwargs["model"] == "deepseek-v4-pro"


def test_project_layout_keeps_artifacts_outside_nested_app(tmp_path):
    from harness.config import HarnessConfig
    from harness.workspace import ensure_project_layout

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    paths = ensure_project_layout(tmp_path, cfg, sprint=2)

    assert paths["app"] == tmp_path / "repos/orbits"
    assert paths["state"] == tmp_path / "harness-state"
    assert paths["logs"] == tmp_path / "harness-logs"
    assert paths["screenshots"] == tmp_path / "harness-state/evidence/sprint-2/screenshots"
    assert paths["screenshots"].exists()
    assert not paths["screenshots"].is_relative_to(paths["app"])


def test_project_layout_can_scope_evidence_by_iteration(tmp_path):
    from harness.config import HarnessConfig
    from harness.workspace import ensure_project_layout

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    paths = ensure_project_layout(tmp_path, cfg, sprint=2, iteration=3)

    assert paths["sprint_evidence"] == tmp_path / "harness-state/evidence/sprint-2/iter-3"
    assert paths["screenshots"] == tmp_path / "harness-state/evidence/sprint-2/iter-3/screenshots"
    assert paths["browser"] == tmp_path / "harness-state/evidence/sprint-2/iter-3/browser"


def test_project_layout_can_group_run_iteration_artifacts(tmp_path):
    from harness.config import HarnessConfig
    from harness.workspace import ensure_project_layout

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    paths = ensure_project_layout(tmp_path, cfg, sprint=2, iteration=3, run_id="run-test")

    iteration_root = tmp_path / "harness-state/runs/run-test/sprint-2/iter-3"
    assert paths["run"] == tmp_path / "harness-state/runs/run-test"
    assert paths["iteration"] == iteration_root
    assert paths["sprint_evidence"] == iteration_root
    assert paths["screenshots"] == iteration_root / "screenshots"
    assert paths["browser"] == iteration_root / "browser"
    assert paths["commands"] == iteration_root / "commands"
    assert paths["git"] == iteration_root / "git"
    assert paths["eval_result"] == iteration_root / "eval.json"
    assert paths["verification_result"] == iteration_root / "verification.json"
    assert paths["handoff_result"] == iteration_root / "handoff.json"


def test_sprint_contract_and_verification_result_round_trip(tmp_path):
    from harness.models.state import (
        ExperienceIssue,
        SuccessCriterion,
        SprintContract,
        VerificationResult,
    )

    contract = SprintContract(
        sprint_number=3,
        goal="participant CRM polish",
        success_criteria=[SuccessCriterion(id="SC-1", description="Profile page loads")],
        out_of_scope=["new billing flows"],
        evidence={"routes": ["/home/profile"]},
        confirmed=True,
    )
    contract_path = tmp_path / "contract.json"
    contract.save(contract_path)

    loaded = SprintContract.load(contract_path)

    assert loaded.sprint_number == 3
    assert loaded.evidence["routes"] == ["/home/profile"]
    assert loaded.confirmed is True

    result = VerificationResult(
        verdict="fail",
        experience_average=2.5,
        scores={"clarity": 2, "trust": 3},
        issues=[
            ExperienceIssue(
                id="UX-1",
                severity="high",
                user_impact="First-time participant cannot tell what to do next.",
                evidence="navigation./home.profile.body_excerpt",
                recommendation="Make the primary next action explicit.",
            )
        ],
        feedback="The design technically works but feels unclear.",
    )
    result_path = tmp_path / "verify.json"
    result.save(result_path)

    reloaded = VerificationResult.load(result_path)

    assert reloaded.verdict == "fail"
    assert reloaded.issues[0].severity == "high"
    assert reloaded.scores["clarity"] == 2


def test_sprint_contract_round_trip_preserves_file_boundary(tmp_path):
    from harness.models.state import SprintContract, SuccessCriterion

    contract = SprintContract(
        sprint_number=9,
        goal="Business card mock acquisition",
        success_criteria=[SuccessCriterion(id="SC-1", description="The business card mock upload route is visible.")],
        evidence={
            "routes": ["/dev/capabilities/business-card"],
            "source_files": [
                "features/acquisition/business-card/mock-service.ts",
                "features/acquisition/business-card/LIVE_IMPLEMENTATION.md",
            ],
        },
        file_boundary={
            "capability_root": "features/acquisition/business-card",
            "owned_paths": ["features/acquisition/business-card/**", "app/dev/capabilities/business-card/**"],
            "allowed_shared_paths": ["shared/domain/contact-source.ts"],
            "forbidden_paths": ["features/chat/**"],
            "mock_to_live_doc": "features/acquisition/business-card/LIVE_IMPLEMENTATION.md",
            "shared_change_policy": "forbidden_unless_explicit",
        },
        confirmed=True,
    )
    contract_path = tmp_path / "contract.json"
    contract.save(contract_path)

    loaded = SprintContract.load(contract_path)

    assert loaded.file_boundary["capability_root"] == "features/acquisition/business-card"
    assert loaded.file_boundary["owned_paths"] == [
        "features/acquisition/business-card/**",
        "app/dev/capabilities/business-card/**",
    ]
    assert loaded.file_boundary["mock_to_live_doc"] == "features/acquisition/business-card/LIVE_IMPLEMENTATION.md"


def test_contract_review_validates_file_boundary_schema():
    from harness.contract_review import contract_review_issues
    from harness.models.state import SprintContract, SuccessCriterion

    valid_contract = SprintContract(
        sprint_number=1,
        goal="Business card mock acquisition",
        success_criteria=[
            SuccessCriterion(id="SC-1", description="The business card mock route renders."),
            SuccessCriterion(
                id="SC-2",
                description="The mock-to-live replacement doc explains live service files, switch mechanism, env or permission needs, and tests.",
            ),
        ],
        evidence={
            "routes": ["/dev/capabilities/business-card"],
            "source_files": [
                "features/acquisition/business-card/mock-service.ts",
                "features/acquisition/business-card/LIVE_IMPLEMENTATION.md",
            ],
        },
        file_boundary={
            "capability_root": "features/acquisition/business-card",
            "owned_paths": ["features/acquisition/business-card/**"],
            "allowed_shared_paths": ["shared/domain/contact-source.ts"],
            "forbidden_paths": ["features/chat/**"],
            "mock_to_live_doc": "features/acquisition/business-card/LIVE_IMPLEMENTATION.md",
            "shared_change_policy": "forbidden_unless_explicit",
        },
        confirmed=True,
    )
    invalid_contract = SprintContract(
        sprint_number=2,
        goal="Unsafe boundary",
        success_criteria=[SuccessCriterion(id="SC-1", description="The / route renders.")],
        evidence={"routes": ["/"]},
        file_boundary={
            "capability_root": "repos/orbits/features/business-card",
            "owned_paths": ["/absolute/path.ts", "../outside.ts", "features/*/mock.ts"],
            "allowed_shared_paths": "shared/domain/contact-source.ts",
            "forbidden_paths": ["features/chat/[id]/**"],
            "shared_change_policy": "always",
            "extra": True,
        },
        confirmed=True,
    )

    valid_issues = contract_review_issues(valid_contract)
    invalid_issues = contract_review_issues(invalid_contract)

    assert not [issue for issue in valid_issues if "file_boundary" in issue or "mock-to-live" in issue]
    assert any("file_boundary.capability_root" in issue and "repos/orbits" in issue for issue in invalid_issues)
    assert any("file_boundary.owned_paths" in issue and "/absolute/path.ts" in issue for issue in invalid_issues)
    assert any("file_boundary.owned_paths" in issue and "../outside.ts" in issue for issue in invalid_issues)
    assert any("file_boundary.owned_paths" in issue and "features/*/mock.ts" in issue for issue in invalid_issues)
    assert any("file_boundary.allowed_shared_paths" in issue and "list" in issue for issue in invalid_issues)
    assert any("file_boundary" in issue and "unsupported field `extra`" in issue for issue in invalid_issues)
    assert any("shared_change_policy" in issue and "always" in issue for issue in invalid_issues)


def test_contract_review_requires_mock_to_live_doc_for_mock_contracts():
    from harness.contract_review import contract_review_issues
    from harness.models.state import SprintContract, SuccessCriterion

    contract = SprintContract(
        sprint_number=1,
        goal="Business card OCR mock service",
        success_criteria=[SuccessCriterion(id="SC-1", description="The business card mock service returns seeded contacts.")],
        evidence={"routes": ["/dev/capabilities/business-card"], "source_files": ["features/acquisition/business-card/mock-service.ts"]},
        file_boundary={
            "capability_root": "features/acquisition/business-card",
            "owned_paths": ["features/acquisition/business-card/**"],
            "allowed_shared_paths": [],
            "forbidden_paths": [],
            "shared_change_policy": "forbidden_unless_explicit",
        },
        confirmed=True,
    )

    issues = contract_review_issues(contract)

    assert any("mock-to-live" in issue and "file_boundary.mock_to_live_doc" in issue for issue in issues)


def test_contract_file_boundary_allows_owned_and_explicit_shared_paths():
    from harness.config import HarnessConfig
    from harness.harness import contract_file_boundary_violations
    from harness.models.state import SprintContract, SuccessCriterion

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    contract = SprintContract(
        sprint_number=1,
        goal="Business card acquisition",
        success_criteria=[SuccessCriterion(id="SC-1", description="The business card acquisition route renders.")],
        evidence={"routes": ["/dev/capabilities/business-card"]},
        file_boundary={
            "capability_root": "features/acquisition/business-card",
            "owned_paths": ["features/acquisition/business-card/**", "app/dev/capabilities/business-card/**"],
            "allowed_shared_paths": ["shared/domain/contact-source.ts"],
            "forbidden_paths": ["features/chat/**"],
            "shared_change_policy": "forbidden_unless_explicit",
        },
        confirmed=True,
    )

    allowed = contract_file_boundary_violations(
        contract,
        [
            "repos/orbits/features/acquisition/business-card/mock-service.ts",
            "repos/orbits/app/dev/capabilities/business-card/page.tsx",
            "repos/orbits/shared/domain/contact-source.ts",
        ],
        cfg,
    )
    blocked = contract_file_boundary_violations(
        contract,
        [
            "repos/orbits/features/chat/mock-service.ts",
            "repos/orbits/shared/domain/unlisted.ts",
        ],
        cfg,
    )

    assert allowed == []
    assert any("features/chat/mock-service.ts" in issue and "forbidden" in issue for issue in blocked)
    assert any("shared/domain/unlisted.ts" in issue and "outside sprint file boundary" in issue for issue in blocked)


def test_contract_file_boundary_ignores_next_env_runtime_artifact():
    from harness.config import HarnessConfig
    from harness.harness import contract_file_boundary_violations
    from harness.models.state import SprintContract, SuccessCriterion

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    contract = SprintContract(
        sprint_number=6,
        goal="Mock runtime",
        success_criteria=[SuccessCriterion(id="SC-1", description="Mock runtime exists.")],
        file_boundary={
            "capability_root": "shared/mock/runtime",
            "owned_paths": ["shared/mock/**", "tests/mock/**"],
            "allowed_shared_paths": [],
            "forbidden_paths": [],
            "shared_change_policy": "none",
        },
        confirmed=True,
    )

    violations = contract_file_boundary_violations(
        contract,
        ["repos/orbits/next-env.d.ts"],
        cfg,
    )

    assert violations == []


def test_generator_prompt_includes_orbits_repo_boundary_and_reference_protection():
    from harness.agents.generator import build_generator_prompt
    from harness.config import HarnessConfig
    from harness.models.state import SprintContract, SuccessCriterion

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    contract = SprintContract(
        sprint_number=1,
        goal="Improve participant entry",
        success_criteria=[SuccessCriterion(id="SC-1", description="Entry page explains event code login")],
        out_of_scope=["database migrations"],
        evidence={
            "routes": ["/"],
            "api": [{"name": "health", "method": "GET", "path": "/api/health", "expectStatus": 200}],
            "commands": [{"name": "test", "cmd": ["npm", "test"]}],
            "source_files": ["app/page.jsx"],
            "public_routes": [],
        },
    )

    prompt = build_generator_prompt("SPEC", contract, None, None, cfg)

    assert "Workspace mode: greenfield" in prompt
    assert "repos/orbits/**" in prompt
    assert "repos/tokyo-business-connect/**" in prompt
    assert "reference-only" in prompt
    assert "Generator cwd is already the app root" in prompt
    assert "Allowlist entries are project-relative" in prompt
    assert "do not prefix edited paths with repos/orbits" in prompt
    assert "Do not create a nested repos/orbits directory" in prompt
    assert "harness-state/runs/<run-id>/sprint-1/iter-M/" in prompt
    assert "The harness collects iteration artifacts under harness-state/runs/<run-id>/sprint-1/iter-M/" in prompt
    assert "Do not write harness artifacts yourself" in prompt
    assert "harness-logs" in prompt
    assert ".env*" in prompt
    assert "EVIDENCE SURFACES" in prompt
    assert '"routes"' in prompt and '"/"' in prompt
    assert '"api"' in prompt and '"/api/health"' in prompt
    assert '"commands"' in prompt and '"npm"' in prompt
    assert '"source_files"' in prompt and '"app/page.jsx"' in prompt
    assert '"public_routes"' in prompt


def test_verifier_prompt_is_user_experience_not_contract_gate():
    from harness.agents.verifier import build_verifier_prompt
    from harness.models.state import SprintContract, SuccessCriterion

    contract = SprintContract(
        sprint_number=1,
        goal="Improve onboarding",
        success_criteria=[SuccessCriterion(id="SC-1", description="Onboarding route exists")],
        out_of_scope=["Profile page polish"],
        file_boundary={
            "owned_paths": ["app/(app)/app/page.tsx"],
            "allowed_shared_paths": ["shared/ui/app-shell.tsx"],
            "forbidden_paths": ["app/(app)/app/profile/**"],
        },
    )

    prompt = build_verifier_prompt(
        product_context="Orbit helps people manage real business relationships.",
        contract=contract,
        app_url="http://localhost:3000",
        evidence_text='{"navigation": {}}',
    )

    assert "user experience verifier" in prompt.lower()
    assert "Do not grade sprint success criteria" in prompt
    assert "first-time participant" in prompt
    assert "clarity" in prompt
    assert "trust" in prompt
    assert "API-only sprint" in prompt
    assert "developer/admin API boundary" in prompt
    assert "Boundary-aware scoring rule" in prompt
    assert "owned_paths" in prompt
    assert "forbidden_paths" in prompt
    assert "Profile page polish" in prompt
    assert "forbidden route" in prompt


def test_evaluator_and_verifier_prompts_do_not_reference_stale_evidence_path():
    from harness.agents.evaluator import build_evaluator_prompt
    from harness.agents.verifier import build_verifier_prompt
    from harness.models.state import SprintContract, SuccessCriterion

    contract = SprintContract(
        sprint_number=1,
        goal="Current evidence",
        success_criteria=[SuccessCriterion(id="SC-1", description="Current iteration evidence is used.")],
    )
    artifact_dir = Path("harness-state/runs/run-test/sprint-1/iter-2/artifacts")

    evaluator_prompt = build_evaluator_prompt("SPEC", contract, "http://localhost:3000", "{}", artifact_dir)
    verifier_prompt = build_verifier_prompt("PRODUCT", contract, "http://localhost:3000", "{}", artifact_dir)

    assert "harness-state/evidence/sprint-N/evidence.json" not in evaluator_prompt
    assert "harness-state/evidence/sprint-N/artifacts" not in verifier_prompt
    assert "harness-state/runs/run-id/sprint-N/iter-M/evidence.json" in evaluator_prompt
    assert "sprint-N/iter-M/artifacts" not in verifier_prompt
    assert "harness-state/runs/run-test/sprint-1/iter-2/artifacts" not in evaluator_prompt
    assert "harness-state/runs/run-test/sprint-1/iter-2/artifacts" not in verifier_prompt
    assert "Do not write supplemental artifacts" in evaluator_prompt
    assert "Do not write supplemental artifacts" in verifier_prompt


def test_evaluator_and_verifier_compute_independent_verdicts():
    from harness.agents.evaluator import build_eval_result_from_grade
    from harness.agents.verifier import build_verification_result_from_review
    from harness.models.state import SprintContract, SuccessCriterion

    contract = SprintContract(
        sprint_number=1,
        goal="Entry page",
        success_criteria=[SuccessCriterion(id="SC-1", description="Page loads")],
    )
    eval_result = build_eval_result_from_grade(
        {
            "contract_results": [{"id": "SC-1", "status": "pass", "evidence": "navigation./.status"}],
            "rubric_scores": {"C1": 4, "C2": 4, "C3": 4, "C4": 4, "C5": 4},
            "feedback": "Meets contract.",
        },
        contract,
        pass_threshold=3.0,
        conditional_pass_threshold=2.0,
    )
    verify_result = build_verification_result_from_review(
        {
            "scores": {"clarity": 2, "trust": 3, "efficiency": 3, "delight": 2},
            "issues": [
                {
                    "id": "UX-1",
                    "severity": "high",
                    "user_impact": "The next step is ambiguous.",
                    "evidence": "screenshot_path",
                    "recommendation": "Promote the primary action.",
                }
            ],
            "feedback": "Passes the spec but not the user experience bar.",
        },
        pass_threshold=3.5,
        conditional_pass_threshold=3.0,
    )

    assert eval_result.verdict == "pass"
    assert verify_result.verdict == "fail"
    assert verify_result.experience_average == 2.5


def test_agent_json_parsers_use_first_valid_json_block():
    from harness.agents.evaluator import parse_grade
    from harness.agents.generator import parse_self_assess_review
    from harness.agents.verifier import parse_verification_review

    evaluator_output = """```json
{
  "contract_results": [{"id": "SC-1", "status": "pass", "evidence": "navigation./.status"}],
  "rubric_scores": {"C1": 4, "C2": 4, "C3": 4, "C4": 4, "C5": 4},
  "feedback": "first block"
}
```
diagnostic notes:
```json
{"ignored": true}
```"""
    verifier_output = """```json
{
  "scores": {"clarity": 4, "trust": 4, "efficiency": 4, "delight": 4},
  "issues": [],
  "feedback": "first block"
}
```
extra:
```json
{"ignored": true}
```"""
    self_assess_output = """```json
{
  "confident": true,
  "concerns": []
}
```
extra:
```json
{"ignored": true}
```"""

    assert parse_grade(evaluator_output)["feedback"] == "first block"
    assert parse_verification_review(verifier_output)["feedback"] == "first block"
    assert parse_self_assess_review(self_assess_output) == (True, [])


def test_evaluator_fails_passed_criteria_without_evidence():
    from harness.agents.evaluator import build_eval_result_from_grade
    from harness.models.state import SprintContract, SuccessCriterion

    contract = SprintContract(
        sprint_number=1,
        goal="Evidence-gated contract",
        success_criteria=[SuccessCriterion(id="SC-1", description="Criterion requires evidence.")],
    )

    eval_result = build_eval_result_from_grade(
        {
            "contract_results": [{"id": "SC-1", "status": "pass", "evidence": ""}],
            "rubric_scores": {"C1": 4},
            "feedback": "Claims pass without citing evidence.",
        },
        contract,
        pass_threshold=3.0,
        conditional_pass_threshold=2.0,
    )

    assert eval_result.verdict == "fail"
    assert eval_result.contract_results[0].status == "fail"


def test_evaluator_rejects_out_of_range_rubric_scores():
    from harness.agents.evaluator import build_eval_result_from_grade
    from harness.models.state import SprintContract, SuccessCriterion

    contract = SprintContract(
        sprint_number=1,
        goal="Score validation",
        success_criteria=[SuccessCriterion(id="SC-1", description="Criterion passes with evidence.")],
    )

    eval_result = build_eval_result_from_grade(
        {
            "contract_results": [{"id": "SC-1", "status": "pass", "evidence": "navigation./.status"}],
            "rubric_scores": {"C1": 100},
            "feedback": "Invalid high score should not pass.",
        },
        contract,
        pass_threshold=3.0,
        conditional_pass_threshold=2.0,
    )

    assert eval_result.verdict == "fail"
    assert eval_result.rubric_average == 0.0


def test_evaluator_fails_incomplete_rubric_scores():
    from harness.agents.evaluator import build_eval_result_from_grade
    from harness.models.state import SprintContract, SuccessCriterion

    contract = SprintContract(
        sprint_number=1,
        goal="Complete rubric validation",
        success_criteria=[SuccessCriterion(id="SC-1", description="Criterion passes with evidence.")],
    )

    eval_result = build_eval_result_from_grade(
        {
            "contract_results": [{"id": "SC-1", "status": "pass", "evidence": "navigation./.status"}],
            "rubric_scores": {"C1": 5},
            "feedback": "Only one rubric dimension was scored.",
        },
        contract,
        pass_threshold=3.0,
        conditional_pass_threshold=2.0,
    )

    assert eval_result.verdict == "fail"
    assert eval_result.rubric_average == 1.0


def test_verifier_rejects_out_of_range_scores():
    from harness.agents.verifier import build_verification_result_from_review

    verify_result = build_verification_result_from_review(
        {
            "scores": {"clarity": 100},
            "issues": [],
            "feedback": "Invalid high score should not pass.",
        },
        pass_threshold=3.5,
        conditional_pass_threshold=3.0,
    )

    assert verify_result.verdict == "fail"
    assert verify_result.experience_average == 0.0


def test_verifier_fails_incomplete_scores():
    from harness.agents.verifier import build_verification_result_from_review

    verify_result = build_verification_result_from_review(
        {
            "scores": {"clarity": 5},
            "issues": [],
            "feedback": "Only one experience dimension was scored.",
        },
        pass_threshold=3.5,
        conditional_pass_threshold=3.0,
    )

    assert verify_result.verdict == "fail"
    assert verify_result.experience_average == 1.25
    assert verify_result.scores == {"clarity": 5.0, "trust": 0.0, "efficiency": 0.0, "delight": 0.0}


def test_verifier_treats_unknown_issue_severity_as_blocking():
    from harness.agents.verifier import build_verification_result_from_review

    verify_result = build_verification_result_from_review(
        {
            "scores": {"clarity": 5, "trust": 5, "efficiency": 5, "delight": 5},
            "issues": [
                {
                    "id": "UX-1",
                    "severity": "severe",
                    "user_impact": "Participants cannot understand the next action.",
                    "evidence": "navigation./.text_excerpt",
                    "recommendation": "Clarify the primary action before accepting the sprint.",
                }
            ],
            "feedback": "The output uses a non-standard severity label for a blocking issue.",
        },
        pass_threshold=3.5,
        conditional_pass_threshold=3.0,
    )

    assert verify_result.verdict == "fail"
    assert verify_result.issues[0].severity == "high"


def test_hygiene_finder_flags_generated_artifacts_outside_allowed_roots(tmp_path):
    from harness.workspace import find_artifact_hygiene_violations

    (tmp_path / "harness/agents").mkdir(parents=True)
    (tmp_path / "harness/agents" / "evaluator.py").write_text("# source, not artifact")
    (tmp_path / "harness/prompts").mkdir(parents=True)
    (tmp_path / "harness/prompts" / "evaluator.md").write_text("prompt, not artifact")
    (tmp_path / "repos/orbits").mkdir(parents=True)
    (tmp_path / "repos/orbits" / "lighthouse-report.json").write_text("{}")
    (tmp_path / "harness-state/evidence/sprint-1").mkdir(parents=True)
    (tmp_path / "harness-state/evidence/sprint-1" / "eval.json").write_text("{}")
    (tmp_path / "harness-logs").mkdir()
    (tmp_path / "harness-logs" / "run.log").write_text("ok")

    violations = find_artifact_hygiene_violations(tmp_path)

    assert violations == ["repos/orbits/lighthouse-report.json"]


def test_hygiene_finder_flags_generated_artifacts_inside_harness_and_tests(tmp_path):
    from harness.workspace import find_artifact_hygiene_violations

    (tmp_path / "harness/agents").mkdir(parents=True)
    (tmp_path / "harness/agents" / "evaluator.py").write_text("# source, not artifact")
    (tmp_path / "harness/prompts").mkdir(parents=True)
    (tmp_path / "harness/prompts" / "evaluator.md").write_text("prompt, not artifact")
    (tmp_path / "harness" / "eval.json").write_text("{}")
    (tmp_path / "harness" / "console.log").write_text("console")
    (tmp_path / "tests").mkdir()
    (tmp_path / "tests" / "page-screenshot.png").write_text("png")

    violations = find_artifact_hygiene_violations(tmp_path)

    assert violations == [
        "harness/console.log",
        "harness/eval.json",
        "tests/page-screenshot.png",
    ]


def test_hygiene_finder_uses_configured_artifact_roots(tmp_path):
    from harness.config import HarnessConfig
    from harness.workspace import find_artifact_hygiene_violations

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.workspace.artifact_root = "run-state"
    cfg.workspace.log_root = "run-logs"
    cfg.workspace.evidence_root = "run-state/evidence"
    cfg.workspace.tmp_root = "run-state/tmp"
    (tmp_path / "run-state/evidence/sprint-1/iter-1/screenshots").mkdir(parents=True)
    (tmp_path / "run-state/evidence/sprint-1/iter-1/screenshots/page-screenshot.png").write_text("png")
    (tmp_path / "run-logs").mkdir()
    (tmp_path / "run-logs/run-console.log").write_text("ok")
    (tmp_path / "repos/orbits").mkdir(parents=True)
    (tmp_path / "repos/orbits/page-screenshot.png").write_text("bad")

    violations = find_artifact_hygiene_violations(tmp_path, cfg)

    assert violations == ["repos/orbits/page-screenshot.png"]


def test_init_creates_orbits_as_separate_git_repo(tmp_path):
    from harness.config import HarnessConfig
    from harness.harness import init

    cfg = HarnessConfig.load(Path("harness/config.yaml"))

    init(tmp_path, cfg)

    app_repo = tmp_path / "repos" / "orbits"
    assert (app_repo / ".git").is_dir()
    assert (app_repo / "README.md").read_text().startswith("# Orbits")
    assert not (tmp_path / "repos" / "tokyo-business-connect").exists()


def test_init_does_not_write_planner_spec_without_planner_manifest(tmp_path):
    from harness.config import HarnessConfig
    from harness.harness import init

    cfg = HarnessConfig.load(Path("harness/config.yaml"))

    init(tmp_path, cfg)

    state_dir = tmp_path / "harness-state"
    assert not (state_dir / "spec.md").exists()
    assert not (state_dir / "sprints.md").exists()
    assert not (state_dir / "plan-manifest.json").exists()
    assert (state_dir / "bootstrap-product-context.md").exists()
    assert (state_dir / "contracts" / "contract-sprint-1.json").exists()


def test_init_sets_app_repo_branch_from_config_before_first_commit(tmp_path):
    import subprocess

    from harness.config import HarnessConfig
    from harness.git_safety import app_git_sync_status
    from harness.harness import init

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.workspace.git.branch = "trunk"

    init(tmp_path, cfg)

    app_repo = tmp_path / "repos/orbits"
    assert subprocess.run(["git", "symbolic-ref", "--short", "HEAD"], cwd=app_repo, text=True, capture_output=True).stdout.strip() == "trunk"
    assert app_git_sync_status(tmp_path, cfg)["current_branch"] == "trunk"


def test_agent_prompts_encode_loop_harness_contracts():
    prompts = {
        name: Path(f"harness/prompts/{name}.md").read_text()
        for name in ["planner", "generator", "evaluator", "verifier"]
    }

    assert "Loop duty" in prompts["planner"]
    assert "SPEC_COMPLETE" in prompts["planner"]
    assert "Sprint Contract Seeds" in prompts["planner"]
    assert "file_boundary" in prompts["planner"]
    assert "mock_to_live_doc" in prompts["planner"]
    assert "harness-state/bootstrap-product-context.md" in prompts["planner"]
    assert "harness-state/spec.md or docs/designs/inital_design.md" not in prompts["planner"]
    assert "Do not write implementation code" in prompts["planner"]

    assert "Loop duty" in prompts["generator"]
    assert "Orient -> Plan -> Implement -> Verify -> Report" in prompts["generator"]
    assert "repos/orbits only" in prompts["generator"]
    assert "Do not edit repos/tokyo-business-connect" in prompts["generator"]
    assert "FILE BOUNDARY" in prompts["generator"]
    assert "mock-to-live replacement document" in prompts["generator"]
    assert "Do not claim completion" in prompts["generator"]

    assert "Loop duty" in prompts["evaluator"]
    assert "Use only the collected evidence JSON" in prompts["evaluator"]
    assert "Do not run commands or read files outside the collected evidence" in prompts["evaluator"]
    assert "happy path and at least one adversarial path" in prompts["evaluator"]
    assert "Missing evidence means fail" in prompts["evaluator"]
    assert "mock-to-live replacement document" in prompts["evaluator"]
    assert "accessibility smoke" in prompts["evaluator"]
    assert "performance smoke" in prompts["evaluator"]
    assert "not full axe or Lighthouse audits" in prompts["evaluator"]
    assert "Do not evaluate user delight here" in prompts["evaluator"]
    assert "API-only sprint" in prompts["evaluator"]
    assert "Do not require browser journey evidence" in prompts["evaluator"]

    assert "Loop duty" in prompts["verifier"]
    assert "Do not grade sprint success criteria" in prompts["verifier"]
    assert "Use only the current collected evidence JSON" in prompts["verifier"]
    assert "Do not run commands or inspect files outside the collected evidence" in prompts["verifier"]
    assert "User Experience Loop" in prompts["verifier"]
    assert "first-time participant" in prompts["verifier"]
    assert "high or critical issue" in prompts["verifier"]
    assert "API-only sprint" in prompts["verifier"]
    assert "Do not demand participant-facing workflow evidence" in prompts["verifier"]


def test_planner_output_writes_spec_sprints_and_contracts(tmp_path):
    from harness.config import HarnessConfig
    from harness.harness import run_planning_loop

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    planner_calls = []

    def fake_planner(brief, session_id=None, cfg=None):
        planner_calls.append((brief, session_id, cfg))
        return (
            """# SPEC: Orbit

## Product Execution Summary
Build relationship context.

## Sprint Definitions
### Sprint 1 - Entry clarity
Goal: Explain what to do first.

## Sprint Contract Seeds
```json
{
  "contracts": [
    {
      "sprint_number": 1,
      "goal": "Entry clarity",
      "success_criteria": [
        {"id": "SC-1", "description": "Opening / shows the primary action."}
      ],
      "out_of_scope": ["billing"],
      "evidence": {
        "routes": ["/"],
        "commands": [{"name": "test", "cmd": ["npm", "test"]}],
        "source_files": ["app/page.jsx"],
        "public_routes": []
      }
    }
  ]
}
```
SPEC_COMPLETE
""",
            None,
        )

    contracts = run_planning_loop(tmp_path, cfg, brief="Build Orbit", planner_func=fake_planner)

    assert planner_calls
    assert "docs/designs/inital_design.md" in planner_calls[0][0]
    assert contracts[0].goal == "Entry clarity"
    state_dir = tmp_path / "harness-state"
    persisted_spec = (state_dir / "spec.md").read_text()
    assert persisted_spec.startswith("# SPEC: Orbit")
    assert "SPEC_COMPLETE" not in persisted_spec
    assert "Sprint Contract Seeds" not in persisted_spec
    assert "### Sprint 1 - Entry clarity" not in persisted_spec
    assert "contract-sprint-N.json" in persisted_spec
    assert "### Sprint 1 - Entry clarity" in (state_dir / "sprints.md").read_text()
    assert (state_dir / "contracts" / "contract-sprint-1.json").exists()
    assert (state_dir / "plan-manifest.json").exists()


def test_planner_multiturn_output_is_accumulated_before_saving_state(tmp_path):
    from harness.config import HarnessConfig
    from harness.harness import run_planning_loop

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    replies = [
        (
            """# SPEC: Orbit

## Product Execution Summary
Build relationship context from event-grounded signals.
""",
            "planner-session",
        ),
        (
            """## Sprint Definitions
### Sprint 1 - Entry clarity
Goal: Explain what to do first.

## Sprint Contract Seeds
```json
{
  "contracts": [
    {
      "sprint_number": 1,
      "goal": "Entry clarity",
      "success_criteria": [
        {"id": "SC-1", "description": "Opening / shows the primary action."}
      ],
      "out_of_scope": ["billing"],
      "evidence": {"routes": ["/"]}
    }
  ]
}
```
SPEC_COMPLETE
""",
            "planner-session",
        ),
    ]
    planner_calls = []

    def fake_planner(brief, session_id=None, cfg=None):
        planner_calls.append((brief, session_id))
        return replies.pop(0)

    contracts = run_planning_loop(tmp_path, cfg, brief="Build Orbit", planner_func=fake_planner)

    spec = (tmp_path / "harness-state/spec.md").read_text()
    sprints = (tmp_path / "harness-state/sprints.md").read_text()
    assert contracts[0].goal == "Entry clarity"
    assert len(planner_calls) == 2
    assert planner_calls[1][1] == "planner-session"
    assert "## Product Execution Summary" in spec
    assert "Build relationship context from event-grounded signals." in spec
    assert "### Sprint 1 - Entry clarity" not in spec
    assert "## Sprint Contract Seeds" not in spec
    assert "contract-sprint-N.json" in spec
    assert "SPEC_COMPLETE" not in spec
    assert sprints.startswith("## Sprint Definitions")


def test_planner_repairs_output_when_spec_complete_but_contracts_are_invalid(tmp_path):
    from harness.config import HarnessConfig
    from harness.harness import run_planning_loop

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    replies = [
        (
            """# SPEC: Orbit

## Product Execution Summary
Build relationship context.

## Sprint Definitions
### Sprint 1 - Entry clarity
Goal: Explain what to do first.

SPEC_COMPLETE
""",
            "planner-session",
        ),
        (
            """# SPEC: Orbit

## Product Execution Summary
Build relationship context.

## Sprint Definitions
### Sprint 1 - Entry clarity
Goal: Explain what to do first.

## Sprint Contract Seeds
```json
{
  "contracts": [
    {
      "sprint_number": 1,
      "goal": "Entry clarity",
      "success_criteria": [
        {"id": "SC-1", "description": "Opening / shows the primary action."}
      ],
      "out_of_scope": ["billing"],
      "evidence": {"routes": ["/"], "commands": [{"name": "test", "cmd": ["npm", "test"]}]}
    }
  ]
}
```
SPEC_COMPLETE
""",
            "planner-session",
        ),
    ]
    planner_calls = []

    def fake_planner(brief, session_id=None, cfg=None):
        planner_calls.append((brief, session_id))
        return replies.pop(0)

    contracts = run_planning_loop(tmp_path, cfg, brief="Build Orbit", planner_func=fake_planner)

    assert contracts[0].goal == "Entry clarity"
    assert len(planner_calls) == 2
    assert planner_calls[1][1] == "planner-session"
    assert "Planner output failed contract parsing/review" in planner_calls[1][0]
    assert "Previous invalid Planner output" in planner_calls[1][0]
    assert "Build relationship context." in planner_calls[1][0]
    assert "Sprint Contract Seeds" in planner_calls[1][0]
    assert (tmp_path / "harness-state/plan-manifest.json").exists()


def test_planner_contract_review_rounds_limits_repair_attempts(tmp_path):
    import pytest

    from harness.config import HarnessConfig
    from harness.harness import run_planning_loop

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.loop.contract_review_rounds = 1
    planner_calls = []

    def fake_planner(brief, session_id=None, cfg=None):
        planner_calls.append((brief, session_id))
        return (
            """# SPEC: Orbit

## Sprint Definitions
### Sprint 1 - Missing contract seeds
Goal: Invalid draft.

SPEC_COMPLETE
""",
            "planner-session",
        )

    with pytest.raises(ValueError, match="Sprint Contract Seeds"):
        run_planning_loop(tmp_path, cfg, brief="Build Orbit", planner_func=fake_planner)

    assert len(planner_calls) == 2
    assert "Planner output failed contract parsing/review" in planner_calls[1][0]


def test_planner_rejects_empty_contract_seed_list(tmp_path):
    import pytest

    from harness.config import HarnessConfig
    from harness.harness import run_planning_loop

    cfg = HarnessConfig.load(Path("harness/config.yaml"))

    def fake_planner(brief, session_id=None, cfg=None):
        return (
            """# SPEC: Orbit

## Sprint Definitions
No executable sprints.

## Sprint Contract Seeds
```json
{"contracts": []}
```
SPEC_COMPLETE
""",
            None,
        )

    with pytest.raises(ValueError, match="at least one sprint contract"):
        run_planning_loop(tmp_path, cfg, brief="Build Orbit", planner_func=fake_planner)

    assert not (tmp_path / "harness-state/plan-manifest.json").exists()


def test_save_planned_state_rejects_empty_contract_list(tmp_path):
    import pytest

    from harness.config import HarnessConfig
    from harness.harness import save_planned_state

    cfg = HarnessConfig.load(Path("harness/config.yaml"))

    with pytest.raises(ValueError, match="at least one sprint contract"):
        save_planned_state(
            tmp_path,
            cfg,
            """# SPEC: Orbit

## Sprint Definitions
No executable sprints.
""",
            [],
        )

    assert not (tmp_path / "harness-state/plan-manifest.json").exists()


def test_save_planned_state_rejects_unreviewable_contract_before_writing_state(tmp_path):
    import pytest

    from harness.config import HarnessConfig
    from harness.harness import save_planned_state
    from harness.models.state import SprintContract, SuccessCriterion

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    contract = SprintContract(
        sprint_number=1,
        goal="Bad direct contract",
        success_criteria=[SuccessCriterion(id="SC-1", description="Bad contract should not be persisted.")],
        evidence={},
        confirmed=True,
    )

    with pytest.raises(ValueError, match="Contract review failed"):
        save_planned_state(tmp_path, cfg, "# SPEC\n\n## Sprint Definitions\n", [contract])

    assert not (tmp_path / "harness-state/spec.md").exists()
    assert not (tmp_path / "harness-state/contracts/contract-sprint-1.json").exists()
    assert not (tmp_path / "harness-state/plan-manifest.json").exists()


def test_prepare_run_state_uses_planner_when_plan_missing(tmp_path):
    from harness.config import HarnessConfig
    from harness.harness import prepare_run_state

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    calls = []

    def fake_planner(brief, session_id=None, cfg=None):
        calls.append(brief)
        return (
            """# SPEC: Orbit

## Sprint Definitions
### Sprint 2 - Context
Goal: Show relationship context.

## Sprint Contract Seeds
```json
[
  {
    "sprint_number": 2,
    "goal": "Context",
    "success_criteria": [
      {"id": "SC-1", "description": "Relationship source is visible."}
    ],
    "out_of_scope": [],
    "evidence": {"routes": ["/connections"]}
  }
]
```
SPEC_COMPLETE
""",
            None,
        )

    prepare_run_state(tmp_path, cfg, planner_func=fake_planner)

    assert calls
    assert (tmp_path / "harness-state" / "contracts" / "contract-sprint-2.json").exists()
    assert (tmp_path / "repos" / "orbits" / ".git").is_dir()


def test_prepare_run_state_replans_seed_state_without_manifest(tmp_path):
    from harness.config import HarnessConfig
    from harness.harness import init, prepare_run_state

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    init(tmp_path, cfg)
    calls = []

    def fake_planner(brief, session_id=None, cfg=None):
        calls.append(brief)
        return (
            """# SPEC: Orbit

## Sprint Definitions
### Sprint 4 - Planned
Goal: Use planner-generated state.

## Sprint Contract Seeds
```json
{
  "contracts": [
    {
      "sprint_number": 4,
      "goal": "Planned",
      "success_criteria": [
        {"id": "SC-1", "description": "Planner manifest exists before sprint execution."}
      ],
      "out_of_scope": [],
      "evidence": {"routes": ["/"]}
    }
  ]
}
```
SPEC_COMPLETE
""",
            None,
        )

    prepare_run_state(tmp_path, cfg, planner_func=fake_planner)

    assert calls
    assert (tmp_path / "harness-state" / "plan-manifest.json").exists()
    assert (tmp_path / "harness-state" / "contracts" / "contract-sprint-4.json").exists()


def test_prepare_run_state_replans_when_explicit_brief_is_provided(tmp_path):
    from harness.config import HarnessConfig
    from harness.harness import prepare_run_state, save_planned_state
    from harness.models.state import SprintContract, SuccessCriterion

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    old_contract = SprintContract(
        sprint_number=1,
        goal="Old plan",
        success_criteria=[SuccessCriterion(id="SC-1", description="Old criterion.")],
        evidence={"routes": ["/old"]},
        confirmed=True,
    )
    save_planned_state(
        tmp_path,
        cfg,
        "# SPEC: Old\n\n## Sprint Definitions\n### Sprint 1 - Old plan\n",
        [old_contract],
    )
    calls = []

    def fake_planner(brief, session_id=None, cfg=None):
        calls.append(brief)
        return (
            """# SPEC: Orbit

## Sprint Definitions
### Sprint 5 - Explicit replan
Goal: Use the new brief.

## Sprint Contract Seeds
```json
{
  "contracts": [
    {
      "sprint_number": 5,
      "goal": "Explicit replan",
      "success_criteria": [
        {"id": "SC-1", "description": "The new brief replaces the old plan."}
      ],
      "out_of_scope": [],
      "evidence": {"routes": ["/new"]}
    }
  ]
}
```
SPEC_COMPLETE
""",
            None,
        )

    prepare_run_state(tmp_path, cfg, planner_func=fake_planner, brief="New Orbit direction")

    assert calls
    assert (tmp_path / "harness-state" / "contracts" / "contract-sprint-5.json").exists()
    assert not (tmp_path / "harness-state" / "contracts" / "contract-sprint-1.json").exists()
    assert "Explicit replan" in (tmp_path / "harness-state" / "sprints.md").read_text()
    assert "Explicit replan" in (tmp_path / "harness-state" / "contracts" / "contract-sprint-5.json").read_text()


def test_run_command_runs_planner_before_preflight(tmp_path, monkeypatch):
    from harness import harness as harness_module
    from harness.models.state import EvalResult, HandoffState, SprintContract, SuccessCriterion, VerificationResult

    contract = SprintContract(
        sprint_number=1,
        goal="Run ordering",
        success_criteria=[SuccessCriterion(id="SC-1", description="Preflight sees Planner manifest.")],
        evidence={"routes": ["/"]},
        confirmed=True,
    )
    events = []

    def fake_run_planning_loop(project_dir, cfg, brief=None):
        events.append("plan")
        harness_module.save_planned_state(
            project_dir,
            cfg,
            "# SPEC: Orbit\n\n## Sprint Definitions\n",
            [contract],
        )
        return [contract]

    def fake_enforce_preflight(project_dir, cfg):
        events.append("preflight")
        assert (project_dir / cfg.workspace.artifact_root / "plan-manifest.json").exists()
        return {"status": "pass", "checks": []}

    def fake_run_sprint(spec, contract, project_dir, cfg, app_url):
        events.append("sprint")
        assert spec.startswith("# SPEC: Orbit")
        return (
            EvalResult(
                verdict="pass",
                rubric_average=4.0,
                contract_results=[SuccessCriterion(id="SC-1", description="Preflight sees Planner manifest.", status="pass")],
                feedback="ok",
            ),
            VerificationResult(verdict="pass", experience_average=4.0, scores={"clarity": 4}, issues=[], feedback="ok"),
            HandoffState(sprint_number=1, project_dir=str(project_dir / cfg.workspace.app_root)),
        )

    monkeypatch.setattr(harness_module, "PROJECT_DIR", tmp_path)
    monkeypatch.setattr(harness_module, "run_planning_loop", fake_run_planning_loop)
    monkeypatch.setattr(harness_module, "enforce_preflight", fake_enforce_preflight)
    monkeypatch.setattr(harness_module, "run_sprint", fake_run_sprint)
    monkeypatch.setattr(harness_module.sys, "argv", ["harness", "run", "--brief", "Build Orbit"])

    harness_module.main()

    assert events == ["plan", "preflight", "sprint"]


def test_doctor_reports_invalid_workspace_paths_before_retention(tmp_path, monkeypatch):
    import json
    import pytest

    from harness import harness as harness_module
    from harness.config import HarnessConfig

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.workspace.evidence_root = "repos/orbits/harness-state/evidence"

    monkeypatch.setattr(harness_module, "PROJECT_DIR", tmp_path)
    monkeypatch.setattr(harness_module.HarnessConfig, "load", lambda path: cfg)
    monkeypatch.setattr(harness_module.sys, "argv", ["harness", "doctor"])

    with pytest.raises(SystemExit) as exc:
        harness_module.main()

    report_path = tmp_path / "harness-state/preflight/preflight.json"
    report = json.loads(report_path.read_text())
    checks = {check["name"]: check for check in report["checks"]}
    assert exc.value.code != 0
    assert report["status"] == "fail"
    assert checks["workspace_paths"]["status"] == "fail"
    assert "evidence_root" in checks["workspace_paths"]["message"]


def test_doctor_uses_safe_log_path_when_configured_log_root_escapes_project(tmp_path, monkeypatch):
    import json
    import pytest

    from harness import harness as harness_module
    from harness.config import HarnessConfig

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.workspace.log_root = "../escaped-logs"
    escaped_log_root = tmp_path.parent / "escaped-logs"

    monkeypatch.setattr(harness_module, "PROJECT_DIR", tmp_path)
    monkeypatch.setattr(harness_module.HarnessConfig, "load", lambda path: cfg)
    monkeypatch.setattr(harness_module.sys, "argv", ["harness", "doctor"])

    with pytest.raises(SystemExit):
        harness_module.main()

    report_path = tmp_path / "harness-state/preflight/preflight.json"
    report = json.loads(report_path.read_text())
    checks = {check["name"]: check for check in report["checks"]}
    assert checks["workspace_paths"]["status"] == "fail"
    assert "log_root" in checks["workspace_paths"]["message"]
    assert not escaped_log_root.exists()
    assert (tmp_path / "harness-logs").is_dir()


def test_run_sprint_command_exits_nonzero_when_sprint_fails(tmp_path, monkeypatch):
    import pytest

    from harness import harness as harness_module
    from harness.models.state import EvalResult, HandoffState, SprintContract, SuccessCriterion, VerificationResult

    contract = SprintContract(
        sprint_number=1,
        goal="Failing sprint",
        success_criteria=[SuccessCriterion(id="SC-1", description="Sprint must pass.")],
        evidence={"routes": ["/"]},
        confirmed=True,
    )
    (tmp_path / "harness-state").mkdir(parents=True)
    (tmp_path / "harness-state/spec.md").write_text("# SPEC")

    def fake_run_sprint(spec, contract, project_dir, cfg, app_url):
        return (
            EvalResult(
                verdict="fail",
                rubric_average=1.0,
                contract_results=[SuccessCriterion(id="SC-1", description="Sprint must pass.", status="fail")],
                feedback="not done",
            ),
            VerificationResult(verdict="pass", experience_average=4.0, scores={"clarity": 4}, issues=[], feedback="ok"),
            HandoffState(sprint_number=1, project_dir=str(project_dir / cfg.workspace.app_root)),
        )

    monkeypatch.setattr(harness_module, "PROJECT_DIR", tmp_path)
    monkeypatch.setattr(harness_module, "prepare_run_state", lambda project_dir, cfg: None)
    monkeypatch.setattr(harness_module, "enforce_preflight", lambda project_dir, cfg: {"status": "pass", "checks": []})
    monkeypatch.setattr(harness_module, "load_contract", lambda project_dir, cfg, sprint: contract)
    monkeypatch.setattr(harness_module, "run_sprint", fake_run_sprint)
    monkeypatch.setattr(harness_module.sys, "argv", ["harness", "run-sprint", "--sprint", "1"])

    with pytest.raises(SystemExit) as exc:
        harness_module.main()

    assert exc.value.code != 0


def test_run_sprint_command_requires_brief_before_implicit_replan(tmp_path, monkeypatch):
    import pytest

    from harness import harness as harness_module

    planner_called = False

    def fake_run_planning_loop(*args, **kwargs):
        nonlocal planner_called
        planner_called = True
        return []

    monkeypatch.setattr(harness_module, "PROJECT_DIR", tmp_path)
    monkeypatch.setattr(harness_module, "run_planning_loop", fake_run_planning_loop)
    monkeypatch.setattr(harness_module.sys, "argv", ["harness", "run-sprint", "--sprint", "1"])

    with pytest.raises(SystemExit) as exc:
        harness_module.main()

    assert exc.value.code != 0
    assert planner_called is False


def test_load_contract_rejects_contract_not_listed_in_planner_manifest(tmp_path):
    import pytest

    from harness.config import HarnessConfig
    from harness.harness import init, load_contract, save_planned_state
    from harness.models.state import SprintContract, SuccessCriterion

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    init(tmp_path, cfg)
    planned = SprintContract(
        sprint_number=1,
        goal="Planned",
        success_criteria=[SuccessCriterion(id="SC-1", description="Planner-listed contract runs.")],
        evidence={"routes": ["/"]},
        confirmed=True,
    )
    stale = SprintContract(
        sprint_number=99,
        goal="Stale",
        success_criteria=[SuccessCriterion(id="SC-1", description="Stale contract must not run.")],
        evidence={"routes": ["/"]},
        confirmed=True,
    )
    save_planned_state(tmp_path, cfg, "# SPEC\n\n## Sprint Definitions\n", [planned])
    stale.save(tmp_path / "harness-state/contracts/contract-sprint-99.json")

    with pytest.raises(RuntimeError, match="not listed in Planner manifest"):
        load_contract(tmp_path, cfg, 99)


def test_plan_manifest_invalid_when_sprints_artifact_is_missing(tmp_path):
    from harness.config import HarnessConfig
    from harness.harness import init, plan_manifest_valid, save_planned_state
    from harness.models.state import SprintContract, SuccessCriterion

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    init(tmp_path, cfg)
    planned = SprintContract(
        sprint_number=1,
        goal="Planner artifacts",
        success_criteria=[SuccessCriterion(id="SC-1", description="Planner sprint plan exists.")],
        evidence={"routes": ["/"]},
        confirmed=True,
    )
    save_planned_state(tmp_path, cfg, "# SPEC\n\n## Sprint Definitions\n", [planned])

    (tmp_path / "harness-state/sprints.md").unlink()

    assert plan_manifest_valid(tmp_path, cfg) is False


def test_plan_manifest_invalid_when_artifact_paths_are_malformed(tmp_path):
    import json

    from harness.config import HarnessConfig
    from harness.harness import init, plan_manifest_valid

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    init(tmp_path, cfg)
    manifest_path = tmp_path / "harness-state/plan-manifest.json"
    manifest_path.write_text(
        json.dumps(
            {
                "source": "planner",
                "spec_path": ["harness-state/spec.md"],
                "sprints_path": "harness-state/sprints.md",
                "contracts": ["harness-state/contracts/contract-sprint-1.json"],
                "contract_count": 1,
            }
        )
    )

    assert plan_manifest_valid(tmp_path, cfg) is False


def test_plan_manifest_invalid_when_artifact_paths_escape_project(tmp_path):
    import json

    from harness.config import HarnessConfig
    from harness.harness import init, plan_manifest_valid

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    init(tmp_path, cfg)
    escaped = tmp_path.parent / "escaped-spec.md"
    escaped.write_text("# escaped")
    (tmp_path / "harness-state/sprints.md").write_text("## Sprint Definitions\n")
    manifest_path = tmp_path / "harness-state/plan-manifest.json"
    manifest_path.write_text(
        json.dumps(
            {
                "source": "planner",
                "spec_path": "../escaped-spec.md",
                "sprints_path": "harness-state/sprints.md",
                "contracts": ["harness-state/contracts/contract-sprint-1.json"],
                "contract_count": 1,
            }
        )
    )

    try:
        assert plan_manifest_valid(tmp_path, cfg) is False
    finally:
        escaped.unlink(missing_ok=True)


def test_plan_manifest_invalid_when_contract_path_is_outside_contracts_dir(tmp_path):
    import json

    from harness.config import HarnessConfig
    from harness.harness import init, plan_manifest_valid

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    init(tmp_path, cfg)
    (tmp_path / "harness-state/spec.md").write_text("# SPEC\n")
    (tmp_path / "harness-state/sprints.md").write_text("## Sprint Definitions\n")
    manifest_path = tmp_path / "harness-state/plan-manifest.json"
    manifest_path.write_text(
        json.dumps(
            {
                "source": "planner",
                "spec_path": "harness-state/spec.md",
                "sprints_path": "harness-state/sprints.md",
                "contracts": ["repos/orbits/README.md"],
                "contract_count": 1,
            }
        )
    )

    assert plan_manifest_valid(tmp_path, cfg) is False


def test_plan_manifest_invalid_when_contract_file_fails_review(tmp_path):
    import json

    from harness.config import HarnessConfig
    from harness.harness import init, plan_manifest_valid

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    init(tmp_path, cfg)
    (tmp_path / "harness-state/spec.md").write_text("# SPEC\n")
    (tmp_path / "harness-state/sprints.md").write_text("## Sprint Definitions\n")
    contract_path = tmp_path / "harness-state/contracts/contract-sprint-1.json"
    contract_path.write_text(
        json.dumps(
            {
                "sprint_number": 1,
                "goal": "Broken contract",
                "success_criteria": [],
                "out_of_scope": [],
                "evidence": {},
                "confirmed": False,
            }
        )
    )
    manifest_path = tmp_path / "harness-state/plan-manifest.json"
    manifest_path.write_text(
        json.dumps(
            {
                "source": "planner",
                "spec_path": "harness-state/spec.md",
                "sprints_path": "harness-state/sprints.md",
                "contracts": ["harness-state/contracts/contract-sprint-1.json"],
                "contract_count": 1,
            }
        )
    )

    assert plan_manifest_valid(tmp_path, cfg) is False


def test_planner_contracts_reject_duplicate_sprint_numbers():
    import pytest

    from harness.harness import contracts_from_planner_spec

    spec = """# SPEC

## Sprint Contract Seeds
```json
{
  "contracts": [
    {
      "sprint_number": 1,
      "goal": "First",
      "success_criteria": [{"id": "SC-1", "description": "First route is visible."}],
      "evidence": {"routes": ["/first"]}
    },
    {
      "sprint_number": 1,
      "goal": "Duplicate",
      "success_criteria": [{"id": "SC-1", "description": "Duplicate route is visible."}],
      "evidence": {"routes": ["/duplicate"]}
    }
  ]
}
```
SPEC_COMPLETE
"""

    with pytest.raises(ValueError, match="Duplicate sprint_number"):
        contracts_from_planner_spec(spec)


def test_planner_contracts_reject_malformed_raw_success_criteria():
    import pytest

    from harness.harness import contracts_from_planner_spec

    not_a_list_spec = """# SPEC

## Sprint Contract Seeds
```json
{
  "contracts": [
    {
      "sprint_number": 1,
      "goal": "Malformed criteria list",
      "success_criteria": "SC-1: route is visible",
      "evidence": {"routes": ["/"]}
    }
  ]
}
```
SPEC_COMPLETE
"""
    malformed_entry_spec = """# SPEC

## Sprint Contract Seeds
```json
{
  "contracts": [
    {
      "sprint_number": 1,
      "goal": "Malformed criteria entry",
      "success_criteria": ["SC-1: route is visible"],
      "evidence": {"routes": ["/"]}
    }
  ]
}
```
SPEC_COMPLETE
"""

    with pytest.raises(ValueError, match="success_criteria must be a list"):
        contracts_from_planner_spec(not_a_list_spec)
    with pytest.raises(ValueError, match="success_criteria\\[1\\] must be an object"):
        contracts_from_planner_spec(malformed_entry_spec)


def test_planner_contracts_reject_non_object_contract_entries():
    import pytest

    from harness.harness import contracts_from_planner_spec

    spec = """# SPEC

## Sprint Contract Seeds
```json
{
  "contracts": [
    "Sprint 1 should show the entry route."
  ]
}
```
SPEC_COMPLETE
"""

    with pytest.raises(ValueError, match="contracts\\[1\\] must be an object"):
        contracts_from_planner_spec(spec)


def test_planner_contracts_reject_missing_goal():
    import pytest

    from harness.harness import contracts_from_planner_spec

    spec = """# SPEC

## Sprint Contract Seeds
```json
{
  "contracts": [
    {
      "sprint_number": 1,
      "success_criteria": [{"id": "SC-1", "description": "The / route is visible."}],
      "evidence": {"routes": ["/"]}
    }
  ]
}
```
SPEC_COMPLETE
"""

    with pytest.raises(ValueError, match="goal must be a non-empty string"):
        contracts_from_planner_spec(spec)


def test_planner_contracts_use_first_json_block_with_contracts_key():
    from harness.harness import contracts_from_planner_spec

    spec = """# SPEC

## Sprint Contract Seeds
```json
{"note": "diagnostic block, not contract seeds"}
```

```json
{
  "contracts": [
    {
      "sprint_number": 1,
      "goal": "Parse robustly",
      "success_criteria": [{"id": "SC-1", "description": "The / route renders parse evidence."}],
      "evidence": {"routes": ["/"]}
    }
  ]
}
```
SPEC_COMPLETE
"""

    contracts = contracts_from_planner_spec(spec)

    assert len(contracts) == 1
    assert contracts[0].goal == "Parse robustly"


def test_planner_contracts_skip_diagnostic_json_lists():
    from harness.harness import contracts_from_planner_spec

    spec = """# SPEC

## Sprint Contract Seeds
```json
["diagnostic", "not a contract seed"]
```

```json
{
  "contracts": [
    {
      "sprint_number": 1,
      "goal": "Skip diagnostic list",
      "success_criteria": [{"id": "SC-1", "description": "The / route renders diagnostic-list-safe evidence."}],
      "evidence": {"routes": ["/"]}
    }
  ]
}
```
SPEC_COMPLETE
"""

    contracts = contracts_from_planner_spec(spec)

    assert len(contracts) == 1
    assert contracts[0].goal == "Skip diagnostic list"


def test_planner_contracts_reject_non_positive_sprint_numbers():
    import pytest

    from harness.harness import contracts_from_planner_spec

    spec = """# SPEC

## Sprint Contract Seeds
```json
{
  "contracts": [
    {
      "sprint_number": 0,
      "goal": "Invalid",
      "success_criteria": [{"id": "SC-1", "description": "Invalid sprint should not save."}],
      "evidence": {"routes": ["/"]}
    }
  ]
}
```
SPEC_COMPLETE
"""

    with pytest.raises(ValueError, match="sprint_number must be a positive integer"):
        contracts_from_planner_spec(spec)


def test_planner_contracts_reject_boolean_and_fractional_sprint_numbers():
    import pytest

    from harness.harness import contracts_from_planner_spec

    boolean_spec = """# SPEC

## Sprint Contract Seeds
```json
{
  "contracts": [
    {
      "sprint_number": true,
      "goal": "Boolean sprint number",
      "success_criteria": [{"id": "SC-1", "description": "Boolean sprint number is rejected."}],
      "evidence": {"routes": ["/"]}
    }
  ]
}
```
SPEC_COMPLETE
"""
    fractional_spec = """# SPEC

## Sprint Contract Seeds
```json
{
  "contracts": [
    {
      "sprint_number": 1.5,
      "goal": "Fractional sprint number",
      "success_criteria": [{"id": "SC-1", "description": "Fractional sprint number is rejected."}],
      "evidence": {"routes": ["/"]}
    }
  ]
}
```
SPEC_COMPLETE
"""

    with pytest.raises(ValueError, match="sprint_number must be a positive integer"):
        contracts_from_planner_spec(boolean_spec)
    with pytest.raises(ValueError, match="sprint_number must be a positive integer"):
        contracts_from_planner_spec(fractional_spec)


def test_save_planned_state_rejects_duplicate_sprint_numbers(tmp_path):
    import pytest

    from harness.config import HarnessConfig
    from harness.harness import init, save_planned_state
    from harness.models.state import SprintContract, SuccessCriterion

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    init(tmp_path, cfg)
    contracts = [
        SprintContract(
            sprint_number=1,
            goal="First",
            success_criteria=[SuccessCriterion(id="SC-1", description="First sprint is observable.")],
            evidence={"routes": ["/first"]},
            confirmed=True,
        ),
        SprintContract(
            sprint_number=1,
            goal="Duplicate",
            success_criteria=[SuccessCriterion(id="SC-1", description="Duplicate sprint is observable.")],
            evidence={"routes": ["/duplicate"]},
            confirmed=True,
        ),
    ]

    with pytest.raises(ValueError, match="Duplicate sprint_number"):
        save_planned_state(tmp_path, cfg, "# SPEC\n\n## Sprint Definitions\n", contracts)

    assert not (tmp_path / "harness-state/plan-manifest.json").exists()


def test_save_planned_state_rejects_non_positive_sprint_numbers(tmp_path):
    import pytest

    from harness.config import HarnessConfig
    from harness.harness import init, save_planned_state
    from harness.models.state import SprintContract, SuccessCriterion

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    init(tmp_path, cfg)
    contracts = [
        SprintContract(
            sprint_number=-1,
            goal="Invalid",
            success_criteria=[SuccessCriterion(id="SC-1", description="Invalid sprint is rejected.")],
            evidence={"routes": ["/"]},
            confirmed=True,
        )
    ]

    with pytest.raises(ValueError, match="sprint_number must be a positive integer"):
        save_planned_state(tmp_path, cfg, "# SPEC\n\n## Sprint Definitions\n", contracts)

    assert not (tmp_path / "harness-state/plan-manifest.json").exists()


def test_handoff_includes_untracked_app_files(tmp_path):
    from harness.agents.generator import build_handoff
    from harness.config import HarnessConfig
    from harness.harness import init

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    init(tmp_path, cfg)
    page = tmp_path / "repos/orbits/app/page.jsx"
    page.parent.mkdir(parents=True)
    page.write_text("export default function Page() { return null }")

    handoff = build_handoff(1, tmp_path, "created page", cfg)

    assert "repos/orbits/app/page.jsx" in handoff.files_changed


def test_handoff_does_not_mark_generator_summary_verified_before_review(tmp_path):
    from harness.agents.generator import build_handoff
    from harness.config import HarnessConfig
    from harness.harness import init
    from harness.models.state import format_handoff_for_prompt

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    init(tmp_path, cfg)

    handoff = build_handoff(1, tmp_path, "created page", cfg)
    prompt = format_handoff_for_prompt(handoff)

    assert handoff.completed_features == []
    assert handoff.partial_features == ["created page"]
    assert "Completed and verified" not in prompt
    assert "Partially completed" in prompt


def test_build_handoff_reports_prior_sprint_wip_commit_when_worktree_clean(tmp_path):
    import subprocess

    from harness.agents.generator import build_handoff
    from harness.config import HarnessConfig
    from harness.harness import init

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.workspace.git.enabled = True
    cfg.workspace.git.strategy = "path-scoped"
    init(tmp_path, cfg)
    app_repo = tmp_path / "repos/orbits"
    subprocess.run(["git", "config", "user.email", "orbit@example.local"], cwd=app_repo, check=True)
    subprocess.run(["git", "config", "user.name", "Orbit Harness"], cwd=app_repo, check=True)
    subprocess.run(["git", "add", "--", "."], cwd=app_repo, check=True)
    subprocess.run(["git", "commit", "-m", "test: baseline"], cwd=app_repo, check=True, capture_output=True, text=True)
    (app_repo / "app").mkdir()
    (app_repo / "app/page.jsx").write_text("export default function Page() { return null }\n")
    subprocess.run(["git", "add", "--", "app/page.jsx"], cwd=app_repo, check=True)
    subprocess.run(
        ["git", "commit", "-m", "wip: sprint 4 iteration 1"],
        cwd=app_repo,
        check=True,
        capture_output=True,
        text=True,
    )

    handoff = build_handoff(4, tmp_path, "already implemented", cfg)

    assert handoff.files_changed == ["repos/orbits/app/page.jsx"]


def test_build_handoff_unions_worktree_diff_with_prior_sprint_wip_commit(tmp_path):
    import subprocess

    from harness.agents.generator import build_handoff
    from harness.config import HarnessConfig
    from harness.harness import init

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.workspace.git.enabled = True
    cfg.workspace.git.strategy = "path-scoped"
    init(tmp_path, cfg)
    app_repo = tmp_path / "repos/orbits"
    subprocess.run(["git", "config", "user.email", "orbit@example.local"], cwd=app_repo, check=True)
    subprocess.run(["git", "config", "user.name", "Orbit Harness"], cwd=app_repo, check=True)
    subprocess.run(["git", "add", "--", "."], cwd=app_repo, check=True)
    subprocess.run(["git", "commit", "-m", "test: baseline"], cwd=app_repo, check=True, capture_output=True, text=True)
    (app_repo / "features/acquisition").mkdir(parents=True)
    (app_repo / "features/acquisition/mock-service.ts").write_text("export const mock = true;\n")
    subprocess.run(["git", "add", "--", "features/acquisition/mock-service.ts"], cwd=app_repo, check=True)
    subprocess.run(
        ["git", "commit", "-m", "wip: sprint 22 iteration 1"],
        cwd=app_repo,
        check=True,
        capture_output=True,
        text=True,
    )
    (app_repo / "features/acquisition/debug-view.tsx").write_text("export function DebugView() { return null; }\n")

    handoff = build_handoff(22, tmp_path, "refined debug view", cfg)

    assert handoff.files_changed == [
        "repos/orbits/features/acquisition/debug-view.tsx",
        "repos/orbits/features/acquisition/mock-service.ts",
    ]


def test_self_assess_uses_claude_review_even_when_generator_backend_is_codex(tmp_path, monkeypatch):
    from harness.agents.generator import self_assess
    from harness.config import HarnessConfig
    from harness.harness import init
    from harness.models.state import SprintContract, SuccessCriterion

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.agents.generator.backend = "codex"
    cfg.agents.generator.self_assess_model = "claude-4.8"
    init(tmp_path, cfg)
    app_dir = tmp_path / "repos/orbits"
    (app_dir / "package.json").write_text('{"scripts": {"test": "echo ok"}}')
    (app_dir / "app").mkdir()
    (app_dir / "app/page.jsx").write_text("export default function Page() { return null }")
    contract = SprintContract(
        sprint_number=1,
        goal="Self assess",
        success_criteria=[SuccessCriterion(id="SC-1", description="Entry page exists.")],
        evidence={"routes": ["/"]},
        confirmed=True,
    )
    called = {}

    def fake_run_self_assess_claude(prompt, agent_cfg, app_dir, timeout):
        called["prompt"] = prompt
        called["model"] = agent_cfg.model
        called["backend"] = agent_cfg.backend
        called["app_dir"] = app_dir
        called["timeout"] = timeout
        return """```json
{
  "confident": false,
  "concerns": ["SC-1 lacks browser evidence."]
}
```"""

    monkeypatch.setattr("harness.agents.generator._run_self_assess_claude", fake_run_self_assess_claude)

    confident, concerns = self_assess(
        "SPEC",
        contract,
        ["repos/orbits/app/page.jsx"],
        "created page",
        cfg,
        tmp_path,
    )

    assert called["backend"] == "claude"
    assert called["model"] == "claude-4.8"
    assert called["app_dir"] == app_dir
    assert called["timeout"] == cfg.loop.self_assess_timeout_seconds
    assert "SC-1: Entry page exists." in called["prompt"]
    assert confident is False
    assert "SC-1 lacks browser evidence." in concerns


def test_self_assess_ignores_evidence_collection_concerns_before_evaluation(tmp_path, monkeypatch):
    from harness.agents.generator import self_assess
    from harness.config import HarnessConfig
    from harness.harness import init
    from harness.models.state import SprintContract, SuccessCriterion

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    init(tmp_path, cfg)
    app_dir = tmp_path / "repos/orbits"
    (app_dir / "package.json").write_text('{"scripts": {"test": "echo ok"}}')
    contract = SprintContract(
        sprint_number=4,
        goal="Self assess evidence timing",
        success_criteria=[SuccessCriterion(id="SC-1", description="Runtime boundary exists.")],
        confirmed=True,
    )

    def fake_run_self_assess_claude(prompt, agent_cfg, app_dir, timeout):
        return """```json
{
  "confident": false,
  "concerns": [
    "Generator did not provide explicit exit-code evidence for npm test, npm run lint, or npm run build in the current run.",
    "The Generator did not attach a git diff or commit hash confirming the working tree matches the claimed unchanged state.",
    "Test count claim is unverified; reviewer cannot reproduce without re-running npm test, and no test output is included."
  ]
}
```"""

    monkeypatch.setattr("harness.agents.generator._run_self_assess_claude", fake_run_self_assess_claude)

    confident, concerns = self_assess(
        "SPEC",
        contract,
        ["repos/orbits/shared/api/envelope.ts"],
        "implemented runtime boundary",
        cfg,
        tmp_path,
    )

    assert confident is True
    assert concerns == []


def test_self_assess_treats_empty_review_concerns_as_nonblocking(tmp_path, monkeypatch):
    from harness.agents.generator import self_assess
    from harness.config import HarnessConfig
    from harness.harness import init
    from harness.models.state import SprintContract, SuccessCriterion

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    init(tmp_path, cfg)
    app_dir = tmp_path / "repos/orbits"
    (app_dir / "package.json").write_text('{"scripts": {"test": "echo ok"}}')
    (app_dir / "app").mkdir()
    (app_dir / "app/page.jsx").write_text("export default function Page() { return null }")
    contract = SprintContract(
        sprint_number=24,
        goal="Self assess empty concerns",
        success_criteria=[SuccessCriterion(id="SC-1", description="Generator output is inspectable.")],
        confirmed=True,
    )

    def fake_run_self_assess_claude(prompt, agent_cfg, app_dir, timeout):
        return """```json
{
  "confident": false,
  "concerns": []
}
```"""

    monkeypatch.setattr("harness.agents.generator._run_self_assess_claude", fake_run_self_assess_claude)

    confident, concerns = self_assess(
        "SPEC",
        contract,
        ["repos/orbits/app/page.jsx"],
        "created page",
        cfg,
        tmp_path,
    )

    assert confident is True
    assert concerns == []


def test_self_assess_treats_reviewer_timeout_as_nonblocking_without_deterministic_concerns(tmp_path, monkeypatch):
    from harness.agents.generator import self_assess
    from harness.config import HarnessConfig
    from harness.harness import init
    from harness.models.state import SprintContract, SuccessCriterion

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    init(tmp_path, cfg)
    app_dir = tmp_path / "repos/orbits"
    (app_dir / "package.json").write_text('{"scripts": {"test": "echo ok"}}')
    (app_dir / "app").mkdir()
    (app_dir / "app/page.jsx").write_text("export default function Page() { return null }")
    contract = SprintContract(
        sprint_number=25,
        goal="Self assess timeout",
        success_criteria=[SuccessCriterion(id="SC-1", description="Generator output is inspectable.")],
        confirmed=True,
    )

    def timeout_self_assess(prompt, agent_cfg, app_dir, timeout):
        raise TimeoutError()

    monkeypatch.setattr("harness.agents.generator._run_self_assess_claude", timeout_self_assess)

    result = self_assess(
        "SPEC",
        contract,
        ["repos/orbits/app/page.jsx"],
        "created page",
        cfg,
        tmp_path,
    )

    confident, concerns = result
    assert confident is True
    assert concerns == []
    assert result.reviewer_failed is True


def test_run_sprint_skips_self_assess_after_runtime_failure_in_same_sprint(tmp_path, monkeypatch):
    from harness.config import HarnessConfig
    from harness.harness import init, run_sprint
    from harness.models.state import EvalResult, SprintContract, SuccessCriterion, VerificationResult

    class RuntimeFailedSelfAssess(tuple):
        reviewer_failed = True

        def __new__(cls):
            return super().__new__(cls, (True, []))

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.loop.max_iterations = 2
    cfg.loop.min_iterations = 2
    init(tmp_path, cfg)
    contract = SprintContract(
        sprint_number=1,
        goal="Skip repeated self-assess runtime failures",
        success_criteria=[SuccessCriterion(id="SC-1", description="Formal gates continue without repeated self-assess timeout.")],
        evidence={"routes": ["/"]},
        confirmed=True,
    )
    generator_calls = []
    self_assess_calls = []

    def fake_run_generator(spec, contract, project_dir, handoff=None, strategic_framing=None, cfg=None):
        generator_calls.append(strategic_framing)
        page = project_dir / "repos/orbits/app/page.jsx"
        page.parent.mkdir(parents=True, exist_ok=True)
        page.write_text(f"// pass {len(generator_calls)}")
        return f"summary {len(generator_calls)}"

    def fake_self_assess(*args, **kwargs):
        self_assess_calls.append(args)
        return RuntimeFailedSelfAssess()

    def fake_collect_evidence(project_dir, app_url, contract, paths):
        (paths["sprint_evidence"] / "evidence.json").write_text("{}")
        return {}

    monkeypatch.setattr("harness.harness.run_generator", fake_run_generator)
    monkeypatch.setattr("harness.harness.self_assess", fake_self_assess)
    monkeypatch.setattr("harness.harness.collect_evidence", fake_collect_evidence)
    monkeypatch.setattr(
        "harness.harness.run_evaluator",
        lambda *args, **kwargs: EvalResult(
            verdict="pass",
            rubric_average=4.0,
            contract_results=[
                SuccessCriterion(
                    id="SC-1",
                    description="Formal gates continue without repeated self-assess timeout.",
                    status="pass",
                )
            ],
            feedback="ok",
        ),
    )
    monkeypatch.setattr(
        "harness.harness.run_verifier",
        lambda *args, **kwargs: VerificationResult(verdict="pass", experience_average=4.0, scores={"clarity": 4}, issues=[], feedback="ok"),
    )

    eval_result, verify_result, _handoff = run_sprint("SPEC", contract, tmp_path, cfg, "http://localhost:3000")

    assert eval_result.verdict == "pass"
    assert verify_result.verdict == "pass"
    assert len(generator_calls) == 2
    assert len(self_assess_calls) == 1


def test_self_assess_reviewer_timeout_does_not_hide_deterministic_concerns(tmp_path, monkeypatch):
    from harness.agents.generator import self_assess
    from harness.config import HarnessConfig
    from harness.harness import init
    from harness.models.state import SprintContract, SuccessCriterion

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    init(tmp_path, cfg)
    app_dir = tmp_path / "repos/orbits"
    (app_dir / "package.json").write_text('{"scripts": {"test": "echo ok"}}')
    contract = SprintContract(
        sprint_number=25,
        goal="Self assess deterministic concern",
        success_criteria=[SuccessCriterion(id="SC-1", description="Generator output is inspectable.")],
        confirmed=True,
    )

    def timeout_self_assess(prompt, agent_cfg, app_dir, timeout):
        raise TimeoutError()

    monkeypatch.setattr("harness.agents.generator._run_self_assess_claude", timeout_self_assess)

    confident, concerns = self_assess(
        "SPEC",
        contract,
        [],
        "no changed files",
        cfg,
        tmp_path,
    )

    assert confident is False
    assert concerns == ["No changed app files were reported for this sprint."]


def test_self_assess_ignores_already_satisfied_boundary_notes(tmp_path, monkeypatch):
    from harness.agents.generator import self_assess
    from harness.config import HarnessConfig
    from harness.harness import init
    from harness.models.state import SprintContract, SuccessCriterion

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    init(tmp_path, cfg)
    app_dir = tmp_path / "repos/orbits"
    (app_dir / "package.json").write_text('{"scripts": {"test": "echo ok"}}')
    contract = SprintContract(
        sprint_number=6,
        goal="Self assess boundary timing",
        success_criteria=[SuccessCriterion(id="SC-1", description="Mock runtime exists.")],
        confirmed=True,
    )

    def fake_run_self_assess_claude(prompt, agent_cfg, app_dir, timeout):
        return """```json
{
  "confident": false,
  "concerns": [
    "SC-1 reference to LIVE_IMPLEMENTATION.md paths appears satisfied, but the doc lives at shared/mock/create-the-shared-mock-runtime-used-by-every-capability-sprint/LIVE_IMPLEMENTATION.md which is not under the SC-1 switch mechanism boundary check for live provider files"
  ]
}
```"""

    monkeypatch.setattr("harness.agents.generator._run_self_assess_claude", fake_run_self_assess_claude)

    confident, concerns = self_assess(
        "SPEC",
        contract,
        ["repos/orbits/shared/mock/registry.ts"],
        "implemented mock runtime",
        cfg,
        tmp_path,
    )

    assert confident is True
    assert concerns == []


def test_self_assess_ignores_noop_handoff_repo_verification_timing(tmp_path, monkeypatch):
    from harness.agents.generator import self_assess
    from harness.config import HarnessConfig
    from harness.harness import init
    from harness.models.state import SprintContract, SuccessCriterion

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    init(tmp_path, cfg)
    app_dir = tmp_path / "repos/orbits"
    (app_dir / "package.json").write_text('{"scripts": {"test": "echo ok"}}')
    contract = SprintContract(
        sprint_number=6,
        goal="Self assess no-op handoff",
        success_criteria=[SuccessCriterion(id="SC-1", description="Mock runtime exists.")],
        confirmed=True,
    )

    def fake_run_self_assess_claude(prompt, agent_cfg, app_dir, timeout):
        return """```json
{
  "confident": false,
  "concerns": [
    "Generator reports 'Files Changed: None' but the SC-1..SC-5 requirements include shared/mock files — a no-op handoff with git diff --name-only returning empty output must be verified against the actual repo state, otherwise the Evaluator cannot confirm the files are present and current; until the source files are independently confirmed to exist, the self-assessment is not ready for Evaluator review."
  ]
}
```"""

    monkeypatch.setattr("harness.agents.generator._run_self_assess_claude", fake_run_self_assess_claude)

    confident, concerns = self_assess(
        "SPEC",
        contract,
        ["repos/orbits/shared/mock/registry.ts"],
        "no-op verification",
        cfg,
        tmp_path,
    )

    assert confident is True
    assert concerns == []


def test_self_assess_ignores_allowed_file_not_changed_summary_mismatch(tmp_path, monkeypatch):
    from harness.agents.generator import self_assess
    from harness.config import HarnessConfig
    from harness.harness import init
    from harness.models.state import SprintContract, SuccessCriterion

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    init(tmp_path, cfg)
    app_dir = tmp_path / "repos/orbits"
    (app_dir / "package.json").write_text('{"scripts": {"test": "echo ok"}}')
    contract = SprintContract(
        sprint_number=77,
        goal="Self assess allowed but unchanged route files",
        success_criteria=[SuccessCriterion(id="SC-1", description="Event route is polished.")],
        file_boundary={
            "owned_paths": [
                "app/(app)/app/events/[id]/page.tsx",
                "app/(app)/app/events/compose-app-events-from-previously-approved-mock-first-capabilities/events-command-center.tsx",
                "tests/pages/app-events-demo-event-1-page.test.tsx",
            ],
        },
        confirmed=True,
    )

    def fake_run_self_assess_claude(prompt, agent_cfg, app_dir, timeout):
        return """```json
{
  "confident": false,
  "concerns": [
    "Generator summary claims only 3 files changed (page.tsx, demo-event-1 test, product-copy test) but Sprint 77 SPEC 'Files Changed' lists 5 files including events-command-center.tsx and event-detail-route-service.ts; the two latter files appear unaddressed in the Generator summary.",
    "Generator claims SC-1 and SC-2 are 'preserved' with no list/dashboard changes, yet the contract file boundary includes events-command-center.tsx — if no changes were needed there, the boundary should explicitly state 'no changes' for clarity rather than omitting the file."
  ]
}
```"""

    monkeypatch.setattr("harness.agents.generator._run_self_assess_claude", fake_run_self_assess_claude)

    confident, concerns = self_assess(
        "SPEC",
        contract,
        [
            "repos/orbits/app/(app)/app/events/[id]/page.tsx",
            "repos/orbits/tests/pages/app-events-demo-event-1-page.test.tsx",
            "repos/orbits/tests/pages/product-copy.test.tsx",
        ],
        "Changed event detail page and tests; list route behavior already met SC-1 and SC-2.",
        cfg,
        tmp_path,
    )

    assert confident is True
    assert concerns == []


def test_self_assess_ignores_summary_file_coverage_when_handoff_lists_changed_files(tmp_path, monkeypatch):
    from harness.agents.generator import self_assess
    from harness.config import HarnessConfig
    from harness.harness import init
    from harness.models.state import SprintContract, SuccessCriterion

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    init(tmp_path, cfg)
    app_dir = tmp_path / "repos/orbits"
    (app_dir / "package.json").write_text('{"scripts": {"test": "echo ok"}}')
    contract = SprintContract(
        sprint_number=31,
        goal="Self assess summary omissions",
        success_criteria=[SuccessCriterion(id="SC-4", description="Debug route renders all mock states.")],
        confirmed=True,
    )

    def fake_run_self_assess_claude(prompt, agent_cfg, app_dir, timeout):
        return """```json
{
  "confident": false,
  "concerns": [
    "Sprint 31 'Files Changed' lists features/events/fixtures.ts, features/events/event-crud-and-import-mock/debug-view.tsx, and features/events/mock-service.ts but the Generator summary's 'Files Changed' omits all three; without inspecting diffs it cannot be verified that fixtures and the debug-view.tsx (required by SC-4 for /dev/capabilities/[slug] state rendering) were actually created or updated this sprint."
  ]
}
```"""

    monkeypatch.setattr("harness.agents.generator._run_self_assess_claude", fake_run_self_assess_claude)

    confident, concerns = self_assess(
        "SPEC",
        contract,
        [
            "repos/orbits/features/events/fixtures.ts",
            "repos/orbits/features/events/event-crud-and-import-mock/debug-view.tsx",
            "repos/orbits/features/events/mock-service.ts",
        ],
        "Implemented event CRUD/import mock capability.",
        cfg,
        tmp_path,
    )

    assert confident is True
    assert concerns == []


def test_self_assess_ignores_shell_access_verification_limits_when_handoff_lists_changed_files(tmp_path, monkeypatch):
    from harness.agents.generator import self_assess
    from harness.config import HarnessConfig
    from harness.harness import init
    from harness.models.state import SprintContract, SuccessCriterion

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    init(tmp_path, cfg)
    app_dir = tmp_path / "repos/orbits"
    (app_dir / "package.json").write_text('{"scripts": {"test": "echo ok"}}')
    contract = SprintContract(
        sprint_number=48,
        goal="Self assess shell access limits",
        success_criteria=[SuccessCriterion(id="SC-5", description="Commands must pass.")],
        confirmed=True,
    )

    def fake_run_self_assess_claude(prompt, agent_cfg, app_dir, timeout):
        return """```json
{
  "confident": false,
  "concerns": [
    "Cannot verify files exist without shell access; need to confirm files at repos/orbits/app/api/dashboard/opportunities/route.ts, repos/orbits/app/api/dashboard/opportunities/recompute/route.ts, repos/orbits/app/dev/capabilities/[slug]/page.tsx, repos/orbits/features/dashboard/mock-opportunity-service.ts, repos/orbits/features/dashboard/opportunity-contract.ts, repos/orbits/features/dashboard/opportunity-reminder-analytics-mock/LIVE_IMPLEMENTATION.md, repos/orbits/features/dashboard/opportunity-reminder-analytics-mock/debug-view.tsx, and repos/orbits/tests/capabilities/opportunity-reminder-analytics-mock.test.ts match the SPEC, including SC-4 (debug view rendering success/empty/pending/failure) and SC-5 (npm test/lint/build exit 0); all summary claims are self-reported with no verifiable evidence in the summary itself."
  ]
}
```"""

    monkeypatch.setattr("harness.agents.generator._run_self_assess_claude", fake_run_self_assess_claude)

    confident, concerns = self_assess(
        "SPEC",
        contract,
        [
            "repos/orbits/app/api/dashboard/opportunities/route.ts",
            "repos/orbits/app/api/dashboard/opportunities/recompute/route.ts",
            "repos/orbits/app/dev/capabilities/[slug]/page.tsx",
            "repos/orbits/features/dashboard/mock-opportunity-service.ts",
            "repos/orbits/features/dashboard/opportunity-contract.ts",
            "repos/orbits/features/dashboard/opportunity-reminder-analytics-mock/LIVE_IMPLEMENTATION.md",
            "repos/orbits/features/dashboard/opportunity-reminder-analytics-mock/debug-view.tsx",
            "repos/orbits/tests/capabilities/opportunity-reminder-analytics-mock.test.ts",
        ],
        "Implemented opportunity reminder analytics mock; npm test, lint, and build passed.",
        cfg,
        tmp_path,
    )

    assert confident is True
    assert concerns == []


def test_self_assess_ignores_isolated_codex_worktree_path_mismatch(tmp_path, monkeypatch):
    from harness.agents.generator import self_assess
    from harness.config import HarnessConfig
    from harness.harness import init
    from harness.models.state import SprintContract, SuccessCriterion

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    init(tmp_path, cfg)
    app_dir = tmp_path / "repos/orbits"
    (app_dir / "package.json").write_text('{"scripts": {"test": "echo ok"}}')
    (app_dir / "app").mkdir(parents=True)
    (app_dir / "app/page.jsx").write_text("export default function Page() { return null }")
    contract = SprintContract(
        sprint_number=61,
        goal="Self assess isolated worktree",
        success_criteria=[SuccessCriterion(id="SC-1", description="Generated files are synced into the app repo.")],
        confirmed=True,
    )

    def fake_run_self_assess_claude(prompt, agent_cfg, app_dir, timeout):
        return """```json
{
  "confident": false,
  "concerns": [
    "Generator Summary lists file paths under /private/tmp/orbit-codex-app-m30nwz9t/app/... but the Sprint 61 contract specifies files in repos/orbits/... . The summary does not confirm the on-repo paths exist at the expected locations, and the path mismatch must be resolved or confirmed as a worktree mirror before evaluation."
  ]
}
```"""

    monkeypatch.setattr("harness.agents.generator._run_self_assess_claude", fake_run_self_assess_claude)

    confident, concerns = self_assess(
        "SPEC",
        contract,
        ["repos/orbits/app/page.jsx"],
        "isolated app synced files=['app/page.jsx']",
        cfg,
        tmp_path,
    )

    assert confident is True
    assert concerns == []


def test_git_evidence_records_status_for_untracked_files(tmp_path):
    from harness.config import HarnessConfig
    from harness.git_safety import record_app_git_evidence
    from harness.harness import init
    from harness.workspace import ensure_project_layout

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    init(tmp_path, cfg)
    (tmp_path / "repos/orbits/app").mkdir()
    (tmp_path / "repos/orbits/app/page.jsx").write_text("export default function Page() { return null }")
    paths = ensure_project_layout(tmp_path, cfg, sprint=1)

    record = record_app_git_evidence(tmp_path, cfg, paths, phase="post")

    assert "repos/orbits/app/page.jsx" in record["changed_files"]
    assert (paths["git"] / "post-status.txt").read_text().strip()
    assert (paths["git"] / "post-diff-name-only.txt").exists()
    assert (paths["git"] / "post-diff.patch").exists()


def test_git_evidence_records_staged_changes_in_diff_patch(tmp_path):
    import subprocess

    from harness.config import HarnessConfig
    from harness.git_safety import record_app_git_evidence
    from harness.harness import init
    from harness.workspace import ensure_project_layout

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    init(tmp_path, cfg)
    app_repo = tmp_path / "repos/orbits"
    (app_repo / "app").mkdir()
    (app_repo / "app/page.jsx").write_text("export default function Page() { return null }\n")
    subprocess.run(["git", "add", "--", "app/page.jsx"], cwd=app_repo, check=True)
    paths = ensure_project_layout(tmp_path, cfg, sprint=1)

    record = record_app_git_evidence(tmp_path, cfg, paths, phase="post")

    assert "repos/orbits/app/page.jsx" in record["changed_files"]
    assert "app/page.jsx" in (paths["git"] / "post-diff-name-only.txt").read_text()
    patch = (paths["git"] / "post-diff.patch").read_text()
    assert "app/page.jsx" in patch
    assert "export default function Page" in patch


def test_reference_repo_dirty_state_is_reported(tmp_path):
    import subprocess

    from harness.config import HarnessConfig
    from harness.git_safety import protected_repo_violations

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    reference = tmp_path / "repos/tokyo-business-connect"
    reference.mkdir(parents=True)
    subprocess.run(["git", "init"], cwd=reference, check=True, capture_output=True, text=True)
    (reference / "README.md").write_text("dirty")

    violations = protected_repo_violations(tmp_path, cfg)

    assert violations == ["repos/tokyo-business-connect has uncommitted changes"]


def test_git_sync_status_reports_missing_remote(tmp_path):
    from harness.config import HarnessConfig
    from harness.git_safety import app_git_sync_status
    from harness.harness import init

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    init(tmp_path, cfg)

    status = app_git_sync_status(tmp_path, cfg)

    assert status["repo_exists"] is True
    assert status["remote_configured"] is False
    assert status["configured_remote_url"] == ""
    assert status["push_enabled"] is False


def test_init_configures_app_origin_when_remote_url_is_set(tmp_path):
    from harness.config import HarnessConfig
    from harness.git_safety import app_git_sync_status
    from harness.harness import init

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.workspace.git.remote_url = "git@github.com:example/orbits.git"

    init(tmp_path, cfg)

    status = app_git_sync_status(tmp_path, cfg)
    assert status["remote_configured"] is True
    assert status["actual_remote_url"] == "git@github.com:example/orbits.git"


def test_init_rejects_origin_mismatch_without_rewriting_remote(tmp_path):
    import subprocess

    import pytest

    from harness.config import HarnessConfig
    from harness.git_safety import app_git_sync_status
    from harness.harness import init

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    actual_remote = "git@github.com:example/current-orbits.git"
    configured_remote = "git@github.com:example/new-orbits.git"
    app_dir = tmp_path / cfg.workspace.app_root
    app_dir.mkdir(parents=True)
    subprocess.run(["git", "init"], cwd=app_dir, check=True, capture_output=True, text=True)
    subprocess.run(["git", "remote", "add", "origin", actual_remote], cwd=app_dir, check=True, capture_output=True, text=True)
    cfg.workspace.git.remote_url = configured_remote

    with pytest.raises(RuntimeError, match="origin remote does not match"):
        init(tmp_path, cfg)

    status = app_git_sync_status(tmp_path, cfg)
    assert status["actual_remote_url"] == actual_remote


def test_prepare_run_state_configures_remote_for_existing_plan(tmp_path):
    from harness.config import HarnessConfig
    from harness.git_safety import app_git_sync_status
    from harness.harness import init, prepare_run_state, save_planned_state
    from harness.models.state import SprintContract, SuccessCriterion

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    init(tmp_path, cfg)
    cfg.workspace.git.remote_url = "git@github.com:example/orbits.git"
    save_planned_state(
        tmp_path,
        cfg,
        "# SPEC: Orbit\n\n## Sprint Definitions\n",
        [
            SprintContract(
                sprint_number=1,
                goal="Ready",
                success_criteria=[SuccessCriterion(id="SC-1", description="Existing plan remains runnable.")],
                evidence={"routes": ["/"]},
                confirmed=True,
            )
        ],
    )

    prepare_run_state(tmp_path, cfg, planner_func=lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("unexpected replan")))

    status = app_git_sync_status(tmp_path, cfg)
    assert status["remote_configured"] is True
    assert status["actual_remote_url"] == "git@github.com:example/orbits.git"


def test_commit_app_changes_only_commits_orbits_repo(tmp_path):
    import subprocess

    from harness.config import HarnessConfig
    from harness.git_safety import commit_app_changes
    from harness.harness import init

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.workspace.git.enabled = True
    cfg.workspace.git.strategy = "path-scoped"
    init(tmp_path, cfg)
    app_repo = tmp_path / "repos/orbits"
    subprocess.run(["git", "config", "user.email", "orbit@example.local"], cwd=app_repo, check=True)
    subprocess.run(["git", "config", "user.name", "Orbit Harness"], cwd=app_repo, check=True)
    (app_repo / "app").mkdir()
    (app_repo / "app/page.jsx").write_text("export default function Page() { return null }")

    result = commit_app_changes(tmp_path, cfg, "test: app baseline")

    assert result["committed"] is True
    assert subprocess.run(["git", "status", "--porcelain=v1", "-uall"], cwd=app_repo, text=True, capture_output=True).stdout == ""
    assert subprocess.run(["git", "log", "--oneline", "-1"], cwd=app_repo, text=True, capture_output=True).stdout.strip().endswith("test: app baseline")


def test_commit_app_changes_skips_tracked_protected_app_paths(tmp_path):
    import subprocess

    from harness.config import HarnessConfig
    from harness.git_safety import commit_app_changes
    from harness.harness import init

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.workspace.git.enabled = True
    cfg.workspace.git.strategy = "path-scoped"
    init(tmp_path, cfg)
    app_repo = tmp_path / "repos/orbits"
    subprocess.run(["git", "config", "user.email", "orbit@example.local"], cwd=app_repo, check=True)
    subprocess.run(["git", "config", "user.name", "Orbit Harness"], cwd=app_repo, check=True)
    (app_repo / ".env").write_text("SECRET=old\n")
    subprocess.run(["git", "add", "-f", ".env", "README.md", ".gitignore"], cwd=app_repo, check=True)
    subprocess.run(["git", "commit", "-m", "test: baseline"], cwd=app_repo, check=True, capture_output=True, text=True)
    (app_repo / ".env").write_text("SECRET=new\n")
    (app_repo / "app").mkdir()
    (app_repo / "app/page.jsx").write_text("export default function Page() { return null }")

    result = commit_app_changes(tmp_path, cfg, "test: app change")

    assert result["committed"] is True
    assert "repos/orbits/.env" in result["skipped_protected"]
    assert subprocess.run(["git", "status", "--porcelain=v1", "-uall"], cwd=app_repo, text=True, capture_output=True).stdout == " M .env\n"
    assert "app/page.jsx" in subprocess.run(["git", "show", "--name-only", "--format=", "HEAD"], cwd=app_repo, text=True, capture_output=True).stdout
    assert ".env" not in subprocess.run(["git", "show", "--name-only", "--format=", "HEAD"], cwd=app_repo, text=True, capture_output=True).stdout


def test_commit_app_changes_path_scoped_respects_write_allowlist(tmp_path):
    import subprocess

    from harness.config import HarnessConfig
    from harness.git_safety import commit_app_changes
    from harness.harness import init

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.workspace.git.enabled = True
    cfg.workspace.git.strategy = "path-scoped"
    cfg.workspace.write_allowlist = ["repos/orbits/app/**"]
    init(tmp_path, cfg)
    app_repo = tmp_path / "repos/orbits"
    subprocess.run(["git", "config", "user.email", "orbit@example.local"], cwd=app_repo, check=True)
    subprocess.run(["git", "config", "user.name", "Orbit Harness"], cwd=app_repo, check=True)
    subprocess.run(["git", "add", "--", "."], cwd=app_repo, check=True)
    subprocess.run(["git", "commit", "-m", "test: baseline"], cwd=app_repo, check=True, capture_output=True, text=True)
    (app_repo / "README.md").write_text("# Orbits\n\nShould remain unstaged.\n")
    (app_repo / "app").mkdir()
    (app_repo / "app/page.jsx").write_text("export default function Page() { return null }\n")

    result = commit_app_changes(tmp_path, cfg, "test: scoped app change")

    assert result["committed"] is True
    assert "repos/orbits/README.md" in result["skipped_outside_allowlist"]
    show = subprocess.run(["git", "show", "--name-only", "--format=", "HEAD"], cwd=app_repo, text=True, capture_output=True).stdout
    assert "app/page.jsx" in show
    assert "README.md" not in show
    assert subprocess.run(["git", "status", "--porcelain=v1", "-uall"], cwd=app_repo, text=True, capture_output=True).stdout == " M README.md\n"


def test_commit_app_changes_unstages_pre_staged_files_outside_allowlist(tmp_path):
    import subprocess

    from harness.config import HarnessConfig
    from harness.git_safety import commit_app_changes
    from harness.harness import init

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.workspace.git.enabled = True
    cfg.workspace.git.strategy = "path-scoped"
    cfg.workspace.write_allowlist = ["repos/orbits/app/**"]
    init(tmp_path, cfg)
    app_repo = tmp_path / "repos/orbits"
    subprocess.run(["git", "config", "user.email", "orbit@example.local"], cwd=app_repo, check=True)
    subprocess.run(["git", "config", "user.name", "Orbit Harness"], cwd=app_repo, check=True)
    subprocess.run(["git", "add", "--", "."], cwd=app_repo, check=True)
    subprocess.run(["git", "commit", "-m", "test: baseline"], cwd=app_repo, check=True, capture_output=True, text=True)
    (app_repo / "README.md").write_text("# Orbits\n\nPre-staged but outside allowlist.\n")
    (app_repo / "app").mkdir()
    (app_repo / "app/page.jsx").write_text("export default function Page() { return null }\n")
    subprocess.run(["git", "add", "--", "README.md"], cwd=app_repo, check=True)

    result = commit_app_changes(tmp_path, cfg, "test: safe scoped commit")

    assert result["committed"] is True
    assert "repos/orbits/README.md" in result["skipped_outside_allowlist"]
    show = subprocess.run(["git", "show", "--name-only", "--format=", "HEAD"], cwd=app_repo, text=True, capture_output=True).stdout
    assert "app/page.jsx" in show
    assert "README.md" not in show
    assert subprocess.run(["git", "status", "--porcelain=v1", "-uall"], cwd=app_repo, text=True, capture_output=True).stdout == " M README.md\n"


def test_commit_app_changes_unstages_pre_staged_files_when_nothing_is_committable(tmp_path):
    import subprocess

    from harness.config import HarnessConfig
    from harness.git_safety import commit_app_changes
    from harness.harness import init

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.workspace.git.enabled = True
    cfg.workspace.git.strategy = "path-scoped"
    cfg.workspace.write_allowlist = ["repos/orbits/app/**"]
    init(tmp_path, cfg)
    app_repo = tmp_path / "repos/orbits"
    subprocess.run(["git", "config", "user.email", "orbit@example.local"], cwd=app_repo, check=True)
    subprocess.run(["git", "config", "user.name", "Orbit Harness"], cwd=app_repo, check=True)
    subprocess.run(["git", "add", "--", "."], cwd=app_repo, check=True)
    subprocess.run(["git", "commit", "-m", "test: baseline"], cwd=app_repo, check=True, capture_output=True, text=True)
    baseline = subprocess.run(["git", "rev-parse", "HEAD"], cwd=app_repo, text=True, capture_output=True, check=True).stdout.strip()
    (app_repo / "README.md").write_text("# Orbits\n\nOnly pre-staged outside allowlist.\n")
    subprocess.run(["git", "add", "--", "README.md"], cwd=app_repo, check=True)

    result = commit_app_changes(tmp_path, cfg, "test: no committable files")

    assert result["committed"] is False
    assert result["reason"] == "no committable changes"
    assert "repos/orbits/README.md" in result["skipped_outside_allowlist"]
    assert subprocess.run(["git", "rev-parse", "HEAD"], cwd=app_repo, text=True, capture_output=True, check=True).stdout.strip() == baseline
    assert subprocess.run(["git", "status", "--porcelain=v1", "-uall"], cwd=app_repo, text=True, capture_output=True).stdout == " M README.md\n"


def test_commit_app_changes_does_not_create_empty_commit_by_default(tmp_path):
    import subprocess

    from harness.config import HarnessConfig
    from harness.git_safety import commit_app_changes
    from harness.harness import init

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.workspace.git.enabled = True
    cfg.workspace.git.strategy = "path-scoped"
    init(tmp_path, cfg)
    app_repo = tmp_path / "repos/orbits"
    subprocess.run(["git", "config", "user.email", "orbit@example.local"], cwd=app_repo, check=True)
    subprocess.run(["git", "config", "user.name", "Orbit Harness"], cwd=app_repo, check=True)
    subprocess.run(["git", "add", "--", "."], cwd=app_repo, check=True)
    subprocess.run(["git", "commit", "-m", "test: baseline"], cwd=app_repo, check=True, capture_output=True, text=True)
    baseline = subprocess.run(["git", "rev-parse", "HEAD"], cwd=app_repo, text=True, capture_output=True, check=True).stdout.strip()

    result = commit_app_changes(tmp_path, cfg, "test: should not commit empty")

    assert result["committed"] is False
    assert result["reason"] == "no committable changes"
    assert subprocess.run(["git", "rev-parse", "HEAD"], cwd=app_repo, text=True, capture_output=True, check=True).stdout.strip() == baseline


def test_push_app_changes_rejects_branch_mismatch(tmp_path):
    import subprocess
    import pytest

    from harness.config import HarnessConfig
    from harness.git_safety import push_app_changes
    from harness.harness import init

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    init(tmp_path, cfg)
    app_repo = tmp_path / "repos/orbits"
    subprocess.run(["git", "config", "user.email", "orbit@example.local"], cwd=app_repo, check=True)
    subprocess.run(["git", "config", "user.name", "Orbit Harness"], cwd=app_repo, check=True)
    subprocess.run(["git", "add", "--", "."], cwd=app_repo, check=True)
    subprocess.run(["git", "commit", "-m", "test: baseline"], cwd=app_repo, check=True, capture_output=True, text=True)
    remote_repo = tmp_path / "remote.git"
    subprocess.run(["git", "remote", "add", "origin", str(remote_repo)], cwd=app_repo, check=True)
    cfg.workspace.git.enabled = True
    cfg.workspace.git.strategy = "path-scoped"
    cfg.workspace.git.branch = "release"
    cfg.workspace.git.push = True
    cfg.workspace.git.remote_url = str(remote_repo)

    with pytest.raises(RuntimeError, match="current app branch"):
        push_app_changes(tmp_path, cfg)


def test_push_app_changes_rejects_push_without_configured_remote_url(tmp_path):
    import subprocess
    import pytest

    from harness.config import HarnessConfig
    from harness.git_safety import push_app_changes
    from harness.harness import init

    remote_repo = tmp_path / "remote.git"
    subprocess.run(["git", "init", "--bare", str(remote_repo)], check=True, capture_output=True, text=True)
    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.workspace.git.enabled = True
    cfg.workspace.git.strategy = "path-scoped"
    cfg.workspace.git.push = True
    init(tmp_path, cfg)
    app_repo = tmp_path / "repos/orbits"
    subprocess.run(["git", "config", "user.email", "orbit@example.local"], cwd=app_repo, check=True)
    subprocess.run(["git", "config", "user.name", "Orbit Harness"], cwd=app_repo, check=True)
    subprocess.run(["git", "remote", "add", "origin", str(remote_repo)], cwd=app_repo, check=True)
    subprocess.run(["git", "add", "--", "."], cwd=app_repo, check=True)
    subprocess.run(["git", "commit", "-m", "test: baseline"], cwd=app_repo, check=True, capture_output=True, text=True)

    with pytest.raises(RuntimeError, match="workspace.git.remote_url"):
        push_app_changes(tmp_path, cfg)


def test_push_app_changes_rejects_push_when_git_commit_disabled(tmp_path):
    import subprocess
    import pytest

    from harness.config import HarnessConfig
    from harness.git_safety import push_app_changes
    from harness.harness import init

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.workspace.git.enabled = False
    cfg.workspace.git.strategy = "disabled"
    cfg.workspace.git.push = True
    init(tmp_path, cfg)
    app_repo = tmp_path / "repos/orbits"
    remote_repo = tmp_path / "remote.git"
    subprocess.run(["git", "init", "--bare", str(remote_repo)], check=True, capture_output=True, text=True)
    subprocess.run(["git", "config", "user.email", "orbit@example.local"], cwd=app_repo, check=True)
    subprocess.run(["git", "config", "user.name", "Orbit Harness"], cwd=app_repo, check=True)
    subprocess.run(["git", "add", "--", "."], cwd=app_repo, check=True)
    subprocess.run(["git", "commit", "-m", "test: baseline"], cwd=app_repo, check=True, capture_output=True, text=True)
    subprocess.run(["git", "remote", "add", "origin", str(remote_repo)], cwd=app_repo, check=True)

    with pytest.raises(RuntimeError, match="push requires git commit"):
        push_app_changes(tmp_path, cfg)


def test_push_app_changes_rejects_dirty_app_worktree(tmp_path):
    import subprocess
    import pytest

    from harness.config import HarnessConfig
    from harness.git_safety import push_app_changes
    from harness.harness import init

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.workspace.git.enabled = True
    cfg.workspace.git.strategy = "path-scoped"
    cfg.workspace.git.push = True
    remote_repo = tmp_path / "remote.git"
    cfg.workspace.git.remote_url = str(remote_repo)
    subprocess.run(["git", "init", "--bare", str(remote_repo)], check=True, capture_output=True, text=True)
    init(tmp_path, cfg)
    app_repo = tmp_path / "repos/orbits"
    subprocess.run(["git", "config", "user.email", "orbit@example.local"], cwd=app_repo, check=True)
    subprocess.run(["git", "config", "user.name", "Orbit Harness"], cwd=app_repo, check=True)
    subprocess.run(["git", "add", "--", "."], cwd=app_repo, check=True)
    subprocess.run(["git", "commit", "-m", "test: baseline"], cwd=app_repo, check=True, capture_output=True, text=True)
    (app_repo / "README.md").write_text("# Orbits\n\nDirty local change must block push.\n")

    with pytest.raises(RuntimeError, match="uncommitted app repo changes"):
        push_app_changes(tmp_path, cfg)


def test_push_app_changes_rejects_origin_mismatch_without_rewriting_remote(tmp_path):
    import subprocess
    import pytest

    from harness.config import HarnessConfig
    from harness.git_safety import push_app_changes
    from harness.harness import init

    actual_remote = tmp_path / "actual.git"
    configured_remote = tmp_path / "configured.git"
    subprocess.run(["git", "init", "--bare", str(actual_remote)], check=True, capture_output=True, text=True)
    subprocess.run(["git", "init", "--bare", str(configured_remote)], check=True, capture_output=True, text=True)
    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    init(tmp_path, cfg)
    app_repo = tmp_path / "repos/orbits"
    subprocess.run(["git", "config", "user.email", "orbit@example.local"], cwd=app_repo, check=True)
    subprocess.run(["git", "config", "user.name", "Orbit Harness"], cwd=app_repo, check=True)
    subprocess.run(["git", "remote", "add", "origin", str(actual_remote)], cwd=app_repo, check=True)
    subprocess.run(["git", "add", "--", "."], cwd=app_repo, check=True)
    subprocess.run(["git", "commit", "-m", "test: baseline"], cwd=app_repo, check=True, capture_output=True, text=True)
    cfg.workspace.git.enabled = True
    cfg.workspace.git.strategy = "path-scoped"
    cfg.workspace.git.push = True
    cfg.workspace.git.remote_url = str(configured_remote)

    with pytest.raises(RuntimeError, match="origin remote does not match"):
        push_app_changes(tmp_path, cfg)

    actual_after = subprocess.run(
        ["git", "remote", "get-url", "origin"],
        cwd=app_repo,
        text=True,
        capture_output=True,
        check=True,
    ).stdout.strip()
    assert actual_after == str(actual_remote)


def test_push_app_changes_pushes_clean_matching_origin(tmp_path):
    import subprocess

    from harness.config import HarnessConfig
    from harness.git_safety import push_app_changes
    from harness.harness import init

    remote_repo = tmp_path / "remote.git"
    subprocess.run(["git", "init", "--bare", str(remote_repo)], check=True, capture_output=True, text=True)
    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.workspace.git.enabled = True
    cfg.workspace.git.strategy = "path-scoped"
    cfg.workspace.git.push = True
    cfg.workspace.git.remote_url = str(remote_repo)
    init(tmp_path, cfg)
    app_repo = tmp_path / "repos/orbits"
    subprocess.run(["git", "config", "user.email", "orbit@example.local"], cwd=app_repo, check=True)
    subprocess.run(["git", "config", "user.name", "Orbit Harness"], cwd=app_repo, check=True)
    subprocess.run(["git", "add", "--", "."], cwd=app_repo, check=True)
    subprocess.run(["git", "commit", "-m", "test: baseline"], cwd=app_repo, check=True, capture_output=True, text=True)

    result = push_app_changes(tmp_path, cfg)

    remote_head = subprocess.run(
        ["git", "rev-parse", "refs/heads/main"],
        cwd=remote_repo,
        text=True,
        capture_output=True,
        check=True,
    ).stdout.strip()
    local_head = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=app_repo,
        text=True,
        capture_output=True,
        check=True,
    ).stdout.strip()
    assert result["pushed"] is True
    assert remote_head == local_head


def test_run_sprint_commits_app_changes_when_git_enabled(tmp_path, monkeypatch):
    import subprocess

    from harness.config import HarnessConfig
    from harness.harness import init, run_sprint
    from harness.models.state import EvalResult, SprintContract, SuccessCriterion, VerificationResult

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.workspace.git.enabled = True
    cfg.workspace.git.strategy = "path-scoped"
    init(tmp_path, cfg)
    app_repo = tmp_path / "repos/orbits"
    subprocess.run(["git", "config", "user.email", "orbit@example.local"], cwd=app_repo, check=True)
    subprocess.run(["git", "config", "user.name", "Orbit Harness"], cwd=app_repo, check=True)
    subprocess.run(["git", "add", "--", "."], cwd=app_repo, check=True)
    subprocess.run(["git", "commit", "-m", "test: baseline"], cwd=app_repo, check=True, capture_output=True, text=True)

    contract = SprintContract(
        sprint_number=1,
        goal="Commit checkpoint",
        success_criteria=[SuccessCriterion(id="SC-1", description="Generated app file is committed.")],
        evidence={"routes": ["/"]},
        confirmed=True,
    )

    def fake_run_generator(spec, contract, project_dir, handoff=None, strategic_framing=None, cfg=None):
        page = project_dir / "repos/orbits/app/page.jsx"
        page.parent.mkdir(parents=True)
        page.write_text("export default function Page() { return null }")
        return "created page"

    def fake_collect_evidence(project_dir, app_url, contract, paths):
        (paths["sprint_evidence"] / "evidence.json").write_text("{}")
        return {}

    monkeypatch.setattr("harness.harness.run_generator", fake_run_generator)
    monkeypatch.setattr("harness.harness.self_assess", lambda *args, **kwargs: (True, []))
    monkeypatch.setattr("harness.harness.collect_evidence", fake_collect_evidence)
    monkeypatch.setattr(
        "harness.harness.run_evaluator",
        lambda *args, **kwargs: EvalResult(
            verdict="pass",
            rubric_average=4.0,
            contract_results=[SuccessCriterion(id="SC-1", description="Generated app file is committed.", status="pass")],
            feedback="ok",
        ),
    )
    monkeypatch.setattr(
        "harness.harness.run_verifier",
        lambda *args, **kwargs: VerificationResult(verdict="pass", experience_average=4.0, scores={"clarity": 4}, issues=[], feedback="ok"),
    )

    run_sprint("SPEC", contract, tmp_path, cfg, "http://localhost:3000")

    assert subprocess.run(["git", "status", "--porcelain=v1", "-uall"], cwd=app_repo, text=True, capture_output=True).stdout == ""
    assert subprocess.run(["git", "log", "--oneline", "-1"], cwd=app_repo, text=True, capture_output=True).stdout.strip().endswith("feat: sprint 1 complete")
    assert (_single_iteration_root(tmp_path) / "git/iter-1-commit.json").exists()


def test_run_sprint_groups_iteration_outputs_under_run_folder(tmp_path, monkeypatch):
    from harness.config import HarnessConfig
    from harness.harness import init, run_sprint
    from harness.models.state import EvalResult, SprintContract, SuccessCriterion, VerificationResult

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.workspace.git.enabled = False
    cfg.workspace.git.strategy = "disabled"
    init(tmp_path, cfg)
    contract = SprintContract(
        sprint_number=1,
        goal="Grouped artifacts",
        success_criteria=[SuccessCriterion(id="SC-1", description="Iteration outputs are grouped.")],
        evidence={"routes": ["/"]},
        confirmed=True,
    )

    def fake_run_generator(spec, contract, project_dir, handoff=None, strategic_framing=None, cfg=None):
        page = project_dir / "repos/orbits/app/page.jsx"
        page.parent.mkdir(parents=True, exist_ok=True)
        page.write_text("export default function Page() { return null }")
        return "created page"

    def fake_collect_evidence(project_dir, app_url, contract, paths):
        (paths["sprint_evidence"] / "evidence.json").write_text("{}")
        return {}

    monkeypatch.setattr("harness.harness.run_generator", fake_run_generator)
    monkeypatch.setattr("harness.harness.self_assess", lambda *args, **kwargs: (True, []))
    monkeypatch.setattr("harness.harness.collect_evidence", fake_collect_evidence)
    monkeypatch.setattr(
        "harness.harness.run_evaluator",
        lambda *args, **kwargs: EvalResult(
            verdict="pass",
            rubric_average=4.0,
            contract_results=[SuccessCriterion(id="SC-1", description="Iteration outputs are grouped.", status="pass", evidence="commands.test")],
            feedback="ok",
        ),
    )
    monkeypatch.setattr(
        "harness.harness.run_verifier",
        lambda *args, **kwargs: VerificationResult(verdict="pass", experience_average=4.0, scores={"clarity": 4}, issues=[], feedback="ok"),
    )

    run_sprint("SPEC", contract, tmp_path, cfg, "http://localhost:3000", run_id="run-test")

    iteration_root = tmp_path / "harness-state/runs/run-test/sprint-1/iter-1"
    assert (iteration_root / "evidence.json").exists()
    assert (iteration_root / "eval.json").exists()
    assert (iteration_root / "verification.json").exists()
    assert (iteration_root / "handoff.json").exists()
    assert (iteration_root / "git/iter-1-pre-status.txt").exists()
    assert (iteration_root / "git/iter-1-post-status.txt").exists()
    assert not (tmp_path / "harness-state/evals/eval-sprint-1-iter-1.json").exists()
    assert not (tmp_path / "harness-state/verifications/verify-sprint-1-iter-1.json").exists()


def test_runtime_ignored_app_artifacts_do_not_trip_boundary_snapshots(tmp_path):
    from harness.config import HarnessConfig
    from harness.harness import ignored_app_status_paths, init, protected_app_status_paths

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    init(tmp_path, cfg)
    app_repo = tmp_path / "repos/orbits"
    (app_repo / "node_modules/pkg").mkdir(parents=True)
    (app_repo / "node_modules/pkg/index.js").write_text("// dependency")
    (app_repo / ".next/cache").mkdir(parents=True)
    (app_repo / ".next/cache/page.js").write_text("// build cache")
    (app_repo / ".env.local").write_text("SECRET=1")
    (app_repo / "npm-debug.log").write_text("debug")

    protected = protected_app_status_paths(tmp_path, cfg)
    ignored = ignored_app_status_paths(tmp_path, cfg)

    assert not any("node_modules" in path for path in protected + ignored)
    assert not any("/.next/" in path for path in protected + ignored)
    assert "repos/orbits/.env.local" in protected
    assert "repos/orbits/npm-debug.log" in ignored


def test_protected_workspace_snapshot_ignores_uv_cache(tmp_path):
    from harness.config import HarnessConfig
    from harness.harness import init
    from harness.workspace import protected_workspace_snapshot

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    init(tmp_path, cfg)
    cache_file = tmp_path / ".uv-cache/interpreter-v4/cache.msgpack"
    cache_file.parent.mkdir(parents=True)
    cache_file.write_text("cache")

    snapshot = protected_workspace_snapshot(tmp_path, cfg, excluded_roots=[cfg.workspace.log_root])

    assert not any(path.startswith(".uv-cache/") for path in snapshot)


def test_protected_workspace_snapshot_includes_harness_artifact_roots_by_default(tmp_path):
    from harness.config import HarnessConfig
    from harness.harness import init
    from harness.workspace import protected_workspace_snapshot

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    init(tmp_path, cfg)
    artifact_file = tmp_path / "harness-state/runs/run-1/sprint-1/iter-1/git/status.txt"
    log_file = tmp_path / "harness-logs/run.log"
    tmp_file = tmp_path / "harness-state/tmp/work.txt"
    for path in [artifact_file, log_file, tmp_file]:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("artifact")

    snapshot = protected_workspace_snapshot(tmp_path, cfg)

    assert "harness-state/runs/run-1/sprint-1/iter-1/git/status.txt" in snapshot
    assert "harness-state/tmp/work.txt" in snapshot
    assert not any(path.startswith("harness-logs/") for path in snapshot)


def test_workspace_changes_except_paths_allows_recorded_git_artifacts():
    from harness.harness import workspace_changes_except_paths

    changes = {
        "added": [
            "harness-state/runs/run-1/sprint-1/iter-1/git/iter-1-pre-status.txt",
            "harness-state/evidence/sprint-99/leak.txt",
        ],
        "modified": ["harness/workspace.py"],
        "deleted": [],
    }

    filtered = workspace_changes_except_paths(
        changes,
        {"harness-state/runs/run-1/sprint-1/iter-1/git/iter-1-pre-status.txt"},
        allowed_roots=[],
    )

    assert filtered == {
        "added": ["harness-state/evidence/sprint-99/leak.txt"],
        "modified": ["harness/workspace.py"],
        "deleted": [],
    }


def test_workspace_changes_except_paths_allows_iteration_artifact_root():
    from harness.harness import workspace_changes_except_paths

    changes = {
        "added": [
            "harness-state/runs/run-1/sprint-1/iter-1/git/iter-1-pre-status.txt",
            "harness-state/evidence/sprint-99/leak.txt",
        ],
        "modified": [],
        "deleted": ["harness-state/runs/old-run/sprint-1/iter-1/evidence.json"],
    }

    filtered = workspace_changes_except_paths(
        changes,
        set(),
        allowed_roots=[
            "harness-state/runs/run-1/sprint-1/iter-1",
            "harness-state/runs/old-run",
            "harness-state/preflight",
        ],
    )

    assert filtered == {
        "added": ["harness-state/evidence/sprint-99/leak.txt"],
        "modified": [],
        "deleted": [],
    }


def test_stop_stale_app_dev_servers_kills_same_app_next_server_on_other_port(tmp_path, monkeypatch):
    import json
    from types import SimpleNamespace

    from harness.harness import stop_stale_app_dev_servers

    app_dir = tmp_path / "repos/orbits"
    app_dir.mkdir(parents=True)
    artifacts = tmp_path / "harness-state/runs/run/sprint-1/iter-1/artifacts"
    killed: list[int] = []

    def fake_run(cmd, **kwargs):
        if cmd == ["lsof", "-nP", "-iTCP", "-sTCP:LISTEN", "-Fpcn"]:
            return SimpleNamespace(
                returncode=0,
                stdout="p47828\ncnode\nn*:3010\np99999\ncnode\nn*:3000\np12345\ncnode\nn*:3011\n",
                stderr="",
            )
        if cmd == ["lsof", "-a", "-p", "47828", "-d", "cwd", "-Fn"]:
            return SimpleNamespace(returncode=0, stdout=f"p47828\nn{app_dir}\n", stderr="")
        if cmd == ["lsof", "-a", "-p", "99999", "-d", "cwd", "-Fn"]:
            return SimpleNamespace(returncode=0, stdout=f"p99999\nn{app_dir}\n", stderr="")
        if cmd == ["lsof", "-a", "-p", "12345", "-d", "cwd", "-Fn"]:
            return SimpleNamespace(returncode=0, stdout=f"p12345\nn{tmp_path / 'other-app'}\n", stderr="")
        raise AssertionError(f"unexpected command: {cmd}")

    monkeypatch.setattr("harness.harness.subprocess.run", fake_run)
    monkeypatch.setattr("harness.harness.os.kill", lambda pid, signal: killed.append(pid))

    stopped = stop_stale_app_dev_servers(app_dir, 3000, {"artifacts": artifacts})

    assert killed == [47828]
    assert stopped == [
        {
            "pid": 47828,
            "port": 3010,
            "cwd": str(app_dir),
            "command": "node",
            "signal": "SIGTERM",
            "reason": "same-app-other-port",
            "killed_pids": [47828],
        }
    ]
    record = json.loads((artifacts / "stale-dev-servers.json").read_text())
    assert record["stopped"] == stopped
    assert record["target_port"] == 3000


def test_stop_stale_app_dev_servers_leaves_foreign_target_port_running(tmp_path, monkeypatch):
    from types import SimpleNamespace

    from harness.harness import stop_stale_app_dev_servers

    app_dir = tmp_path / "repos/orbits"
    foreign_dir = tmp_path / "other-app"
    app_dir.mkdir(parents=True)
    foreign_dir.mkdir(parents=True)
    artifacts = tmp_path / "harness-state/runs/run/sprint-1/iter-1/artifacts"
    killed: list[int] = []

    def fake_run(cmd, **kwargs):
        if cmd == ["lsof", "-nP", "-iTCP", "-sTCP:LISTEN", "-Fpcn"]:
            return SimpleNamespace(returncode=0, stdout="p22222\ncnode\nn*:3000\n", stderr="")
        if cmd == ["lsof", "-a", "-p", "22222", "-d", "cwd", "-Fn"]:
            return SimpleNamespace(returncode=0, stdout=f"p22222\nn{foreign_dir}\n", stderr="")
        raise AssertionError(f"unexpected command: {cmd}")

    monkeypatch.setattr("harness.harness.subprocess.run", fake_run)
    monkeypatch.setattr("harness.harness.os.kill", lambda pid, signal: killed.append(pid))

    stopped = stop_stale_app_dev_servers(app_dir, 3000, {"artifacts": artifacts})

    assert killed == []
    assert stopped == []
    assert not (artifacts / "stale-dev-servers.json").exists()


def test_start_app_dev_server_cleans_port_before_ready_short_circuit(tmp_path, monkeypatch):
    from harness.config import HarnessConfig
    from harness.harness import start_app_dev_server

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.workspace.app_root = "repos/orbits"
    app_dir = tmp_path / cfg.workspace.app_root
    app_dir.mkdir(parents=True)
    (app_dir / "package.json").write_text("{}\n")
    paths = {"artifacts": tmp_path / "harness-state/runs/run/sprint-1/iter-1/artifacts"}
    calls: list[tuple[Path, int]] = []

    def fake_stop(app_dir_arg, port_arg, paths_arg):
        calls.append((app_dir_arg, port_arg))
        assert paths_arg is paths
        return []

    monkeypatch.setattr("harness.harness._tcp_listeners", lambda: [])
    monkeypatch.setattr("harness.harness.stop_stale_app_dev_servers", fake_stop)
    monkeypatch.setattr("harness.harness.app_url_ready", lambda app_url, timeout_seconds=60: True)

    server = start_app_dev_server(tmp_path, cfg, "http://localhost:3000", paths)

    assert server is None
    assert calls == [(app_dir, 3000)]


def test_start_app_dev_server_uses_fallback_port_when_requested_port_is_foreign(tmp_path, monkeypatch):
    import json
    from types import SimpleNamespace

    from harness.config import HarnessConfig
    from harness.harness import start_app_dev_server

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.workspace.app_root = "repos/orbits"
    app_dir = tmp_path / cfg.workspace.app_root
    foreign_dir = tmp_path / "other-app"
    app_dir.mkdir(parents=True)
    foreign_dir.mkdir(parents=True)
    (app_dir / "package.json").write_text("{}\n")
    paths = {"artifacts": tmp_path / "harness-state/runs/run/sprint-1/iter-1/artifacts"}
    popen_calls: list[tuple[list[str], Path]] = []
    ready_urls: list[str] = []

    class FakeProcess:
        def poll(self):
            return None

        def terminate(self):
            pass

        def wait(self, timeout=None):
            return 0

    def fake_run(cmd, **kwargs):
        if cmd == ["lsof", "-a", "-p", "22222", "-d", "cwd", "-Fn"]:
            return SimpleNamespace(returncode=0, stdout=f"p22222\nn{foreign_dir}\n", stderr="")
        return SimpleNamespace(returncode=1, stdout="", stderr="")

    def fake_popen(cmd, cwd, stdout, stderr, text):
        popen_calls.append((cmd, cwd))
        return FakeProcess()

    def fake_ready(app_url, timeout_seconds=60):
        ready_urls.append(app_url)
        return bool(popen_calls) and app_url == "http://localhost:3001"

    monkeypatch.setattr("harness.harness._tcp_listeners", lambda: [{"pid": 22222, "port": 3000, "command": "node"}])
    monkeypatch.setattr("harness.harness.subprocess.run", fake_run)
    monkeypatch.setattr("harness.harness.subprocess.Popen", fake_popen)
    monkeypatch.setattr("harness.harness._port_is_available", lambda host, port: port == 3001)
    monkeypatch.setattr("harness.harness.stop_stale_app_dev_servers", lambda *args, **kwargs: [])
    monkeypatch.setattr("harness.harness.app_url_ready", fake_ready)

    server = start_app_dev_server(tmp_path, cfg, "http://localhost:3000", paths)

    assert server is not None
    assert server.app_url == "http://localhost:3001"
    assert popen_calls == [
        (["npm", "run", "dev", "--", "--hostname", "localhost", "--port", "3001"], app_dir)
    ]
    assert ready_urls == ["http://localhost:3001", "http://localhost:3001"]
    conflict = json.loads((paths["artifacts"] / "dev-server-port-conflict.json").read_text())
    assert conflict["requested_app_url"] == "http://localhost:3000"
    assert conflict["actual_app_url"] == "http://localhost:3001"
    record = json.loads((paths["artifacts"] / "dev-server.json").read_text())
    assert record["app_url"] == "http://localhost:3001"
    assert record["requested_app_url"] == "http://localhost:3000"


def test_run_sprint_prepares_dependencies_and_dev_server_before_evidence(tmp_path, monkeypatch):
    from harness.config import HarnessConfig
    from harness.harness import init, run_sprint
    from harness.models.state import EvalResult, SprintContract, SuccessCriterion, VerificationResult

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.agents.generator.backend = "claude"
    cfg.loop.max_iterations = 1
    cfg.loop.min_iterations = 1
    cfg.workspace.git.enabled = False
    cfg.workspace.git.strategy = "disabled"
    init(tmp_path, cfg)
    contract = SprintContract(
        sprint_number=1,
        goal="Runtime preparation",
        success_criteria=[SuccessCriterion(id="SC-1", description="Runtime server is ready before evidence collection.")],
        evidence={"routes": ["/"]},
        confirmed=True,
    )
    events = []

    def fake_run_generator(spec, contract, project_dir, handoff=None, strategic_framing=None, cfg=None):
        app = project_dir / "repos/orbits"
        (app / "app").mkdir(parents=True, exist_ok=True)
        (app / "package.json").write_text('{"scripts":{"dev":"next dev"}}')
        (app / "app/page.tsx").write_text("export default function Page() { return null }")
        events.append("generate")
        return "created app"

    def fake_prepare(project_dir, cfg, paths):
        events.append("prepare")

    def fake_start(project_dir, cfg, app_url, paths):
        events.append("start")
        return object()

    def fake_stop(server):
        events.append("stop")

    def fake_collect_evidence(project_dir, app_url, contract, paths):
        events.append("evidence")
        (paths["sprint_evidence"] / "evidence.json").write_text("{}")
        return {}

    monkeypatch.setattr("harness.harness.run_generator", fake_run_generator)
    monkeypatch.setattr("harness.harness.prepare_app_dependencies", fake_prepare)
    monkeypatch.setattr("harness.harness.start_app_dev_server", fake_start)
    monkeypatch.setattr("harness.harness.stop_app_dev_server", fake_stop)
    monkeypatch.setattr("harness.harness.self_assess", lambda *args, **kwargs: (True, []))
    monkeypatch.setattr("harness.harness.collect_evidence", fake_collect_evidence)
    def fake_evaluator(*args, **kwargs):
        events.append("evaluator")
        return EvalResult(
            verdict="pass",
            rubric_average=4.0,
            contract_results=[SuccessCriterion(id="SC-1", description="Runtime server is ready before evidence collection.", status="pass")],
            feedback="ok",
        )

    def fake_verifier(*args, **kwargs):
        events.append("verifier")
        return VerificationResult(verdict="pass", experience_average=4.0, scores={"clarity": 4}, issues=[], feedback="ok")

    monkeypatch.setattr("harness.harness.run_evaluator", fake_evaluator)
    monkeypatch.setattr("harness.harness.run_verifier", fake_verifier)

    run_sprint("SPEC", contract, tmp_path, cfg, "http://localhost:3000")

    assert events == ["generate", "prepare", "start", "evidence", "stop", "evaluator", "verifier"]


def test_run_sprint_allows_current_iteration_artifacts_created_during_evidence_collection(tmp_path, monkeypatch):
    from harness.config import HarnessConfig
    from harness.harness import init, run_sprint
    from harness.models.state import EvalResult, SprintContract, SuccessCriterion, VerificationResult

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.loop.max_iterations = 1
    cfg.loop.min_iterations = 1
    cfg.workspace.git.enabled = False
    cfg.workspace.git.strategy = "disabled"
    init(tmp_path, cfg)
    contract = SprintContract(
        sprint_number=1,
        goal="Current iteration artifacts",
        success_criteria=[SuccessCriterion(id="SC-1", description="Evidence artifacts are allowed.")],
        evidence={"routes": ["/"]},
        confirmed=True,
    )

    def fake_run_generator(spec, contract, project_dir, handoff=None, strategic_framing=None, cfg=None):
        page = project_dir / "repos/orbits/app/page.jsx"
        page.parent.mkdir(parents=True, exist_ok=True)
        page.write_text("export default function Page() { return 'ok' }")
        return "generated app"

    def fake_collect_evidence(project_dir, app_url, contract, paths):
        (paths["artifacts"] / "evidence-note.json").write_text("{}")
        (paths["sprint_evidence"] / "evidence.json").write_text("{}")
        return {}

    monkeypatch.setattr("harness.harness.run_generator", fake_run_generator)
    monkeypatch.setattr("harness.harness.prepare_app_dependencies", lambda *args, **kwargs: None)
    monkeypatch.setattr("harness.harness.start_app_dev_server", lambda *args, **kwargs: None)
    monkeypatch.setattr("harness.harness.stop_app_dev_server", lambda *args, **kwargs: None)
    monkeypatch.setattr("harness.harness.self_assess", lambda *args, **kwargs: (True, []))
    monkeypatch.setattr("harness.harness.collect_evidence", fake_collect_evidence)
    monkeypatch.setattr(
        "harness.harness.run_evaluator",
        lambda *args, **kwargs: EvalResult(
            verdict="pass",
            rubric_average=4.0,
            contract_results=[
                SuccessCriterion(id="SC-1", description="Evidence artifacts are allowed.", status="pass")
            ],
            feedback="ok",
        ),
    )
    monkeypatch.setattr(
        "harness.harness.run_verifier",
        lambda *args, **kwargs: VerificationResult(
            verdict="pass",
            experience_average=4.0,
            scores={"clarity": 4},
            issues=[],
            feedback="ok",
        ),
    )

    run_sprint("SPEC", contract, tmp_path, cfg, "http://localhost:3000", run_id="run-allow")


def test_run_sprint_runs_repair_pass_when_self_assess_is_not_confident(tmp_path, monkeypatch):
    from harness.config import HarnessConfig
    from harness.harness import init, run_sprint
    from harness.models.state import EvalResult, SprintContract, SuccessCriterion, VerificationResult

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.loop.max_iterations = 2
    cfg.loop.min_iterations = 1
    init(tmp_path, cfg)
    contract = SprintContract(
        sprint_number=1,
        goal="Repair pass",
        success_criteria=[SuccessCriterion(id="SC-1", description="Generator repairs self-assessed gap.")],
        evidence={"routes": ["/"]},
        confirmed=True,
    )
    generator_calls = []
    self_assess_calls = []

    def fake_run_generator(spec, contract, project_dir, handoff=None, strategic_framing=None, cfg=None):
        generator_calls.append(strategic_framing)
        page = project_dir / "repos/orbits/app/page.jsx"
        page.parent.mkdir(parents=True, exist_ok=True)
        page.write_text(f"// pass {len(generator_calls)}")
        return f"summary {len(generator_calls)}"

    def fake_self_assess(*args, **kwargs):
        self_assess_calls.append(args)
        if len(self_assess_calls) == 1:
            return False, ["SC-1 lacks the route implementation."]
        return True, []

    def fake_collect_evidence(project_dir, app_url, contract, paths):
        (paths["sprint_evidence"] / "evidence.json").write_text("{}")
        return {}

    monkeypatch.setattr("harness.harness.run_generator", fake_run_generator)
    monkeypatch.setattr("harness.harness.self_assess", fake_self_assess)
    monkeypatch.setattr("harness.harness.collect_evidence", fake_collect_evidence)
    monkeypatch.setattr(
        "harness.harness.run_evaluator",
        lambda *args, **kwargs: EvalResult(
            verdict="pass",
            rubric_average=4.0,
            contract_results=[SuccessCriterion(id="SC-1", description="Generator repairs self-assessed gap.", status="pass")],
            feedback="ok",
        ),
    )
    monkeypatch.setattr(
        "harness.harness.run_verifier",
        lambda *args, **kwargs: VerificationResult(verdict="pass", experience_average=4.0, scores={"clarity": 4}, issues=[], feedback="ok"),
    )

    run_sprint("SPEC", contract, tmp_path, cfg, "http://localhost:3000")

    assert len(generator_calls) == 2
    assert generator_calls[0] is None
    assert "Self-assessment repair pass" in generator_calls[1]
    assert "SC-1 lacks the route implementation." in generator_calls[1]
    assert len(self_assess_calls) == 2


def test_run_sprint_caps_self_assessment_repair_passes_per_sprint(tmp_path, monkeypatch):
    from harness.config import HarnessConfig
    from harness.harness import init, run_sprint
    from harness.models.state import EvalResult, SprintContract, SuccessCriterion, VerificationResult

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.loop.max_iterations = 3
    cfg.loop.min_iterations = 2
    cfg.loop.self_assess_max_repair_passes = 1
    init(tmp_path, cfg)
    contract = SprintContract(
        sprint_number=1,
        goal="Bound self-assessment repairs",
        success_criteria=[SuccessCriterion(id="SC-1", description="Formal gates still evaluate after self-assess concerns.")],
        evidence={"routes": ["/"]},
        confirmed=True,
    )
    generator_calls = []
    self_assess_calls = []

    def fake_run_generator(spec, contract, project_dir, handoff=None, strategic_framing=None, cfg=None):
        generator_calls.append(strategic_framing)
        page = project_dir / "repos/orbits/app/page.jsx"
        page.parent.mkdir(parents=True, exist_ok=True)
        page.write_text(f"// pass {len(generator_calls)}")
        return f"summary {len(generator_calls)}"

    def fake_self_assess(*args, **kwargs):
        self_assess_calls.append(args)
        return False, ["self-assess still wants more polish"]

    def fake_collect_evidence(project_dir, app_url, contract, paths):
        (paths["sprint_evidence"] / "evidence.json").write_text("{}")
        return {}

    monkeypatch.setattr("harness.harness.run_generator", fake_run_generator)
    monkeypatch.setattr("harness.harness.self_assess", fake_self_assess)
    monkeypatch.setattr("harness.harness.collect_evidence", fake_collect_evidence)
    monkeypatch.setattr(
        "harness.harness.run_evaluator",
        lambda *args, **kwargs: EvalResult(
            verdict="pass",
            rubric_average=4.0,
            contract_results=[
                SuccessCriterion(id="SC-1", description="Formal gates still evaluate after self-assess concerns.", status="pass")
            ],
            feedback="ok",
        ),
    )
    monkeypatch.setattr(
        "harness.harness.run_verifier",
        lambda *args, **kwargs: VerificationResult(verdict="pass", experience_average=4.0, scores={"clarity": 4}, issues=[], feedback="ok"),
    )

    eval_result, verify_result, _handoff = run_sprint("SPEC", contract, tmp_path, cfg, "http://localhost:3000")

    assert eval_result.verdict == "pass"
    assert verify_result.verdict == "pass"
    assert len(generator_calls) == 3
    assert generator_calls[0] is None
    assert "Self-assessment repair pass" in generator_calls[1]
    assert "QUALITY IMPROVEMENT" in generator_calls[2]
    assert len(self_assess_calls) == 3


def test_run_sprint_persists_repaired_handoff_before_evaluation(tmp_path, monkeypatch):
    from harness.config import HarnessConfig
    from harness.harness import init, run_sprint
    from harness.models.state import EvalResult, HandoffState, SprintContract, SuccessCriterion, VerificationResult

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.loop.max_iterations = 2
    cfg.loop.min_iterations = 1
    init(tmp_path, cfg)
    contract = SprintContract(
        sprint_number=1,
        goal="Persist repair handoff",
        success_criteria=[SuccessCriterion(id="SC-1", description="Repair summary is persisted before evaluation.")],
        evidence={"routes": ["/"]},
        confirmed=True,
    )
    generator_calls = []
    self_assess_calls = []

    def fake_run_generator(spec, contract, project_dir, handoff=None, strategic_framing=None, cfg=None):
        generator_calls.append(strategic_framing)
        page = project_dir / "repos/orbits/app/page.jsx"
        page.parent.mkdir(parents=True, exist_ok=True)
        page.write_text(f"// pass {len(generator_calls)}")
        return f"summary {len(generator_calls)}"

    def fake_self_assess(*args, **kwargs):
        self_assess_calls.append(args)
        if len(self_assess_calls) == 1:
            return False, ["repair needed"]
        return True, []

    def fake_collect_evidence(project_dir, app_url, contract, paths):
        persisted = HandoffState.load(paths["handoff_result"])
        assert persisted.completed_features == []
        assert "summary 2" in persisted.partial_features
        assert "repair needed" not in persisted.known_broken
        (paths["sprint_evidence"] / "evidence.json").write_text("{}")
        return {}

    monkeypatch.setattr("harness.harness.run_generator", fake_run_generator)
    monkeypatch.setattr("harness.harness.self_assess", fake_self_assess)
    monkeypatch.setattr("harness.harness.collect_evidence", fake_collect_evidence)
    monkeypatch.setattr(
        "harness.harness.run_evaluator",
        lambda *args, **kwargs: EvalResult(
            verdict="pass",
            rubric_average=4.0,
            contract_results=[SuccessCriterion(id="SC-1", description="Repair summary is persisted before evaluation.", status="pass")],
            feedback="ok",
        ),
    )
    monkeypatch.setattr(
        "harness.harness.run_verifier",
        lambda *args, **kwargs: VerificationResult(verdict="pass", experience_average=4.0, scores={"clarity": 4}, issues=[], feedback="ok"),
    )

    eval_result, verify_result, handoff = run_sprint("SPEC", contract, tmp_path, cfg, "http://localhost:3000")

    assert eval_result.verdict == "pass"
    assert verify_result.verdict == "pass"
    assert "summary 2" in handoff.completed_features
    assert handoff.partial_features == []


def test_run_sprint_passes_failed_iteration_as_partial_handoff_to_next_generator(tmp_path, monkeypatch):
    from harness.config import HarnessConfig
    from harness.harness import init, run_sprint
    from harness.models.state import EvalResult, HandoffState, SprintContract, SuccessCriterion, VerificationResult

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.loop.max_iterations = 2
    init(tmp_path, cfg)
    contract = SprintContract(
        sprint_number=1,
        goal="Partial handoff",
        success_criteria=[SuccessCriterion(id="SC-1", description="Failed iteration is not marked verified.")],
        evidence={"routes": ["/"]},
        confirmed=True,
    )
    handoffs_seen: list[HandoffState | None] = []

    def fake_run_generator(spec, contract, project_dir, handoff=None, strategic_framing=None, cfg=None):
        handoffs_seen.append(handoff)
        page = project_dir / "repos/orbits/app/page.jsx"
        page.parent.mkdir(parents=True, exist_ok=True)
        page.write_text(f"// pass {len(handoffs_seen)}")
        return f"summary {len(handoffs_seen)}"

    def fake_collect_evidence(project_dir, app_url, contract, paths):
        (paths["sprint_evidence"] / "evidence.json").write_text("{}")
        return {}

    eval_calls = []

    def fake_run_evaluator(*args, **kwargs):
        eval_calls.append(1)
        if len(eval_calls) == 1:
            return EvalResult(
                verdict="fail",
                rubric_average=1.0,
                contract_results=[SuccessCriterion(id="SC-1", description="Failed iteration is not marked verified.", status="fail")],
                feedback="not done",
            )
        return EvalResult(
            verdict="pass",
            rubric_average=4.0,
            contract_results=[SuccessCriterion(id="SC-1", description="Failed iteration is not marked verified.", status="pass")],
            feedback="ok",
        )

    monkeypatch.setattr("harness.harness.run_generator", fake_run_generator)
    monkeypatch.setattr("harness.harness.self_assess", lambda *args, **kwargs: (True, []))
    monkeypatch.setattr("harness.harness.collect_evidence", fake_collect_evidence)
    monkeypatch.setattr("harness.harness.run_evaluator", fake_run_evaluator)
    monkeypatch.setattr(
        "harness.harness.run_verifier",
        lambda *args, **kwargs: VerificationResult(verdict="pass", experience_average=4.0, scores={"clarity": 4}, issues=[], feedback="ok"),
    )

    eval_result, verify_result, final_handoff = run_sprint("SPEC", contract, tmp_path, cfg, "http://localhost:3000")

    assert handoffs_seen[0] is None
    assert handoffs_seen[1] is not None
    assert handoffs_seen[1].completed_features == []
    assert "summary 1" in handoffs_seen[1].partial_features
    assert eval_result.verdict == "pass"
    assert verify_result.verdict == "pass"
    assert "summary 2" in final_handoff.completed_features


def test_run_sprint_treats_pass_before_min_iterations_as_verified_quality_baseline(tmp_path, monkeypatch):
    from harness.config import HarnessConfig
    from harness.harness import init, run_sprint
    from harness.models.state import EvalResult, HandoffState, SprintContract, SuccessCriterion, VerificationResult

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.loop.max_iterations = 2
    cfg.loop.min_iterations = 2
    init(tmp_path, cfg)
    contract = SprintContract(
        sprint_number=1,
        goal="Quality iteration",
        success_criteria=[SuccessCriterion(id="SC-1", description="Passing first iteration becomes verified baseline.")],
        evidence={"routes": ["/"]},
        confirmed=True,
    )
    handoffs_seen: list[HandoffState | None] = []
    framings_seen: list[str | None] = []

    def fake_run_generator(spec, contract, project_dir, handoff=None, strategic_framing=None, cfg=None):
        handoffs_seen.append(handoff)
        framings_seen.append(strategic_framing)
        page = project_dir / "repos/orbits/app/page.jsx"
        page.parent.mkdir(parents=True, exist_ok=True)
        page.write_text(f"// pass {len(handoffs_seen)}")
        return f"summary {len(handoffs_seen)}"

    def fake_collect_evidence(project_dir, app_url, contract, paths):
        (paths["sprint_evidence"] / "evidence.json").write_text("{}")
        return {}

    monkeypatch.setattr("harness.harness.run_generator", fake_run_generator)
    monkeypatch.setattr("harness.harness.self_assess", lambda *args, **kwargs: (True, []))
    monkeypatch.setattr("harness.harness.collect_evidence", fake_collect_evidence)
    monkeypatch.setattr(
        "harness.harness.run_evaluator",
        lambda *args, **kwargs: EvalResult(
            verdict="pass",
            rubric_average=4.0,
            contract_results=[SuccessCriterion(id="SC-1", description="Passing first iteration becomes verified baseline.", status="pass")],
            feedback="Meets contract.",
        ),
    )
    monkeypatch.setattr(
        "harness.harness.run_verifier",
        lambda *args, **kwargs: VerificationResult(verdict="pass", experience_average=4.0, scores={"clarity": 4}, issues=[], feedback="Good UX."),
    )

    eval_result, verify_result, final_handoff = run_sprint("SPEC", contract, tmp_path, cfg, "http://localhost:3000")

    assert handoffs_seen[0] is None
    assert handoffs_seen[1] is not None
    assert "summary 1" in handoffs_seen[1].completed_features
    assert handoffs_seen[1].partial_features == []
    assert "QUALITY IMPROVEMENT" in framings_seen[1]
    assert "Strategic directive - REFINE" not in framings_seen[1]
    assert eval_result.verdict == "pass"
    assert verify_result.verdict == "pass"
    assert "summary 2" in final_handoff.completed_features


def test_run_sprint_retries_verifier_runtime_failure_before_next_generator_iteration(tmp_path, monkeypatch):
    from harness.config import HarnessConfig
    from harness.harness import init, run_sprint
    from harness.models.state import EvalResult, SprintContract, SuccessCriterion, VerificationResult

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.loop.max_iterations = 3
    cfg.loop.min_iterations = 2
    cfg.loop.reviewer_runtime_retries = 1
    init(tmp_path, cfg)
    contract = SprintContract(
        sprint_number=1,
        goal="Retry verifier runtime",
        success_criteria=[SuccessCriterion(id="SC-1", description="Verifier runtime failures are retried before product iteration.")],
        evidence={"routes": ["/"]},
        confirmed=True,
    )
    generator_calls = []
    verifier_calls = []

    def fake_run_generator(spec, contract, project_dir, handoff=None, strategic_framing=None, cfg=None):
        generator_calls.append(strategic_framing)
        page = project_dir / "repos/orbits/app/page.jsx"
        page.parent.mkdir(parents=True, exist_ok=True)
        page.write_text(f"// pass {len(generator_calls)}")
        return f"summary {len(generator_calls)}"

    def fake_collect_evidence(project_dir, app_url, contract, paths):
        (paths["sprint_evidence"] / "evidence.json").write_text("{}")
        return {}

    def fake_run_verifier(*args, **kwargs):
        verifier_calls.append(1)
        if len(verifier_calls) == 2:
            raise TimeoutError("Codex timed out after 900s.")
        return VerificationResult(
            verdict="pass",
            experience_average=4.0,
            scores={"clarity": 4},
            issues=[],
            feedback="ok",
        )

    monkeypatch.setattr("harness.harness.run_generator", fake_run_generator)
    monkeypatch.setattr("harness.harness.self_assess", lambda *args, **kwargs: (True, []))
    monkeypatch.setattr("harness.harness.collect_evidence", fake_collect_evidence)
    monkeypatch.setattr(
        "harness.harness.run_evaluator",
        lambda *args, **kwargs: EvalResult(
            verdict="pass",
            rubric_average=4.0,
            contract_results=[
                SuccessCriterion(
                    id="SC-1",
                    description="Verifier runtime failures are retried before product iteration.",
                    status="pass",
                )
            ],
            feedback="ok",
        ),
    )
    monkeypatch.setattr("harness.harness.run_verifier", fake_run_verifier)

    eval_result, verify_result, final_handoff = run_sprint("SPEC", contract, tmp_path, cfg, "http://localhost:3000")

    assert eval_result.verdict == "pass"
    assert verify_result.verdict == "pass"
    assert len(verifier_calls) == 3
    assert len(generator_calls) == 2
    assert "QUALITY IMPROVEMENT" in generator_calls[1]
    assert "summary 2" in final_handoff.completed_features


def test_run_sprint_records_reviewer_runtime_retry_artifact(tmp_path, monkeypatch):
    import json

    from harness.config import HarnessConfig
    from harness.harness import init, run_sprint
    from harness.models.state import EvalResult, SprintContract, SuccessCriterion, VerificationResult

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.loop.max_iterations = 2
    cfg.loop.min_iterations = 1
    cfg.loop.reviewer_runtime_retries = 1
    init(tmp_path, cfg)
    contract = SprintContract(
        sprint_number=1,
        goal="Record reviewer runtime retry",
        success_criteria=[SuccessCriterion(id="SC-1", description="Reviewer runtime retries are auditable.")],
        evidence={"routes": ["/"]},
        confirmed=True,
    )
    generator_calls = []
    evaluator_calls = []

    def fake_run_generator(spec, contract, project_dir, handoff=None, strategic_framing=None, cfg=None):
        generator_calls.append(strategic_framing)
        page = project_dir / "repos/orbits/app/page.jsx"
        page.parent.mkdir(parents=True, exist_ok=True)
        page.write_text("// retry artifact")
        return "summary"

    def fake_collect_evidence(project_dir, app_url, contract, paths):
        (paths["sprint_evidence"] / "evidence.json").write_text("{}")
        return {}

    def flaky_evaluator(*args, **kwargs):
        evaluator_calls.append(1)
        if len(evaluator_calls) == 1:
            raise RuntimeError("Evaluator did not return parseable JSON. Output tail: ```json")
        return EvalResult(
            verdict="pass",
            rubric_average=4.0,
            contract_results=[
                SuccessCriterion(
                    id="SC-1",
                    description="Reviewer runtime retries are auditable.",
                    status="pass",
                )
            ],
            feedback="ok",
        )

    monkeypatch.setattr("harness.harness.run_generator", fake_run_generator)
    monkeypatch.setattr("harness.harness.self_assess", lambda *args, **kwargs: (True, []))
    monkeypatch.setattr("harness.harness.collect_evidence", fake_collect_evidence)
    monkeypatch.setattr("harness.harness.run_evaluator", flaky_evaluator)
    monkeypatch.setattr(
        "harness.harness.run_verifier",
        lambda *args, **kwargs: VerificationResult(verdict="pass", experience_average=4.0, scores={"clarity": 4}, issues=[], feedback="ok"),
    )

    eval_result, verify_result, _final_handoff = run_sprint("SPEC", contract, tmp_path, cfg, "http://localhost:3000")

    retry_artifact = _single_iteration_root(tmp_path) / "artifacts/reviewer-runtime-failures.json"
    recorded = json.loads(retry_artifact.read_text())
    assert eval_result.verdict == "pass"
    assert verify_result.verdict == "pass"
    assert len(generator_calls) == 1
    assert len(evaluator_calls) == 2
    assert recorded == [
        {
            "label": "Evaluator",
            "attempt": 1,
            "max_retries": 1,
            "retrying": True,
            "error_type": "RuntimeError",
            "message": "Evaluator did not return parseable JSON. Output tail: ```json",
        }
    ]


def test_run_sprint_creates_final_commit_marker_when_quality_iteration_has_no_new_changes(tmp_path, monkeypatch):
    import subprocess

    from harness.config import HarnessConfig
    from harness.harness import init, run_sprint
    from harness.models.state import EvalResult, SprintContract, SuccessCriterion, VerificationResult

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.loop.max_iterations = 2
    cfg.loop.min_iterations = 2
    cfg.workspace.git.enabled = True
    cfg.workspace.git.strategy = "path-scoped"
    init(tmp_path, cfg)
    app_repo = tmp_path / "repos/orbits"
    subprocess.run(["git", "config", "user.email", "orbit@example.local"], cwd=app_repo, check=True)
    subprocess.run(["git", "config", "user.name", "Orbit Harness"], cwd=app_repo, check=True)
    subprocess.run(["git", "add", "--", "."], cwd=app_repo, check=True)
    subprocess.run(["git", "commit", "-m", "test: baseline"], cwd=app_repo, check=True, capture_output=True, text=True)
    contract = SprintContract(
        sprint_number=1,
        goal="Final commit marker",
        success_criteria=[SuccessCriterion(id="SC-1", description="Final verified sprint has a completion commit.")],
        evidence={"routes": ["/"]},
        confirmed=True,
    )

    def fake_run_generator(spec, contract, project_dir, handoff=None, strategic_framing=None, cfg=None):
        page = project_dir / "repos/orbits/app/page.jsx"
        page.parent.mkdir(parents=True, exist_ok=True)
        page.write_text("// same verified content")
        return "same verified content"

    def fake_collect_evidence(project_dir, app_url, contract, paths):
        (paths["sprint_evidence"] / "evidence.json").write_text("{}")
        return {}

    monkeypatch.setattr("harness.harness.run_generator", fake_run_generator)
    monkeypatch.setattr("harness.harness.self_assess", lambda *args, **kwargs: (True, []))
    monkeypatch.setattr("harness.harness.collect_evidence", fake_collect_evidence)
    monkeypatch.setattr(
        "harness.harness.run_evaluator",
        lambda *args, **kwargs: EvalResult(
            verdict="pass",
            rubric_average=4.0,
            contract_results=[SuccessCriterion(id="SC-1", description="Final verified sprint has a completion commit.", status="pass")],
            feedback="ok",
        ),
    )
    monkeypatch.setattr(
        "harness.harness.run_verifier",
        lambda *args, **kwargs: VerificationResult(verdict="pass", experience_average=4.0, scores={"clarity": 4}, issues=[], feedback="ok"),
    )

    run_sprint("SPEC", contract, tmp_path, cfg, "http://localhost:3000")

    log = subprocess.run(["git", "log", "--oneline", "-2"], cwd=app_repo, text=True, capture_output=True, check=True).stdout
    assert "feat: sprint 1 complete" in log.splitlines()[0]
    assert "wip: sprint 1 iteration 1" in log.splitlines()[1]
    commit_record = _single_iteration_root(tmp_path, iteration=2) / "git/iter-2-commit.json"
    assert '"empty": true' in commit_record.read_text()


def test_run_sprint_blocks_generator_changes_outside_app_root(tmp_path, monkeypatch):
    import pytest

    from harness.config import HarnessConfig
    from harness.harness import init, run_sprint
    from harness.models.state import EvalResult, SprintContract, SuccessCriterion, VerificationResult

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.agents.generator.backend = "claude"
    cfg.loop.max_iterations = 1
    cfg.loop.min_iterations = 1
    cfg.workspace.git.enabled = False
    init(tmp_path, cfg)
    (tmp_path / "docs").mkdir()
    (tmp_path / "docs" / "existing.md").write_text("before")
    contract = SprintContract(
        sprint_number=1,
        goal="Stay in app root",
        success_criteria=[SuccessCriterion(id="SC-1", description="Generator stays in repos/orbits.")],
        evidence={"routes": ["/"]},
        confirmed=True,
    )

    def fake_run_generator(spec, contract, project_dir, handoff=None, strategic_framing=None, cfg=None):
        (project_dir / "docs" / "leak.md").write_text("outside app")
        page = project_dir / "repos/orbits/app/page.jsx"
        page.parent.mkdir(parents=True)
        page.write_text("export default function Page() { return 'ok' }")
        return "wrote outside app"

    monkeypatch.setattr("harness.harness.run_generator", fake_run_generator)
    monkeypatch.setattr("harness.harness.self_assess", lambda *args, **kwargs: (True, []))
    monkeypatch.setattr("harness.harness.collect_evidence", lambda *args, **kwargs: {})
    monkeypatch.setattr(
        "harness.harness.run_evaluator",
        lambda *args, **kwargs: EvalResult(
            verdict="pass",
            rubric_average=4.0,
            contract_results=[SuccessCriterion(id="SC-1", description="Generator stays in repos/orbits.", status="pass")],
            feedback="ok",
        ),
    )
    monkeypatch.setattr(
        "harness.harness.run_verifier",
        lambda *args, **kwargs: VerificationResult(verdict="pass", experience_average=4.0, scores={"clarity": 4}, issues=[], feedback="ok"),
    )

    with pytest.raises(RuntimeError, match="Protected workspace changed"):
        run_sprint("SPEC", contract, tmp_path, cfg, "http://localhost:3000")


def test_run_sprint_allows_codex_isolated_generator_during_product_context_edits(tmp_path, monkeypatch):
    from harness.config import HarnessConfig
    from harness.harness import init, run_sprint
    from harness.models.state import EvalResult, SprintContract, SuccessCriterion, VerificationResult

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.agents.generator.backend = "codex"
    cfg.loop.max_iterations = 1
    cfg.loop.min_iterations = 1
    cfg.workspace.git.enabled = False
    init(tmp_path, cfg)
    design = tmp_path / "docs" / "designs" / "inital_design.md"
    design.parent.mkdir(parents=True)
    design.write_text("initial product context")
    harness_file = tmp_path / "harness" / "harness.py"
    harness_file.parent.mkdir(parents=True)
    harness_file.write_text("# harness before")
    test_file = tmp_path / "tests" / "test_harness_core.py"
    test_file.parent.mkdir(parents=True)
    test_file.write_text("# tests before")
    contract = SprintContract(
        sprint_number=1,
        goal="Tolerate concurrent root development edits while Codex runs isolated.",
        success_criteria=[SuccessCriterion(id="SC-1", description="Sprint can continue after external root development edits.")],
        evidence={"routes": ["/"]},
        confirmed=True,
    )

    def fake_run_generator(spec, contract, project_dir, handoff=None, strategic_framing=None, cfg=None):
        design.write_text("updated product context for the next sprint")
        harness_file.write_text("# harness after")
        test_file.write_text("# tests after")
        page = project_dir / "repos/orbits/app/page.jsx"
        page.parent.mkdir(parents=True)
        page.write_text("export default function Page() { return 'ok' }")
        return "generated in isolated app"

    monkeypatch.setattr("harness.harness.run_generator", fake_run_generator)
    monkeypatch.setattr("harness.harness.self_assess", lambda *args, **kwargs: (True, []))
    monkeypatch.setattr("harness.harness.collect_evidence", lambda *args, **kwargs: {})
    monkeypatch.setattr(
        "harness.harness.run_evaluator",
        lambda *args, **kwargs: EvalResult(
            verdict="pass",
            rubric_average=4.0,
            contract_results=[SuccessCriterion(id="SC-1", description="Sprint can continue after external root development edits.", status="pass")],
            feedback="ok",
        ),
    )
    monkeypatch.setattr(
        "harness.harness.run_verifier",
        lambda *args, **kwargs: VerificationResult(verdict="pass", experience_average=4.0, scores={"clarity": 4}, issues=[], feedback="ok"),
    )

    eval_result, verify_result, _handoff = run_sprint("SPEC", contract, tmp_path, cfg, "http://localhost:3000")

    assert eval_result.verdict == "pass"
    assert verify_result.verdict == "pass"
    assert design.read_text() == "updated product context for the next sprint"
    assert harness_file.read_text() == "# harness after"
    assert test_file.read_text() == "# tests after"


def test_run_sprint_allows_concurrent_product_context_edits_during_evaluator(tmp_path, monkeypatch):
    from harness.config import HarnessConfig
    from harness.harness import init, run_sprint
    from harness.models.state import EvalResult, SprintContract, SuccessCriterion, VerificationResult

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.agents.generator.backend = "codex"
    cfg.loop.max_iterations = 1
    cfg.loop.min_iterations = 1
    cfg.workspace.git.enabled = False
    init(tmp_path, cfg)
    design = tmp_path / "docs" / "designs" / "inital_design.md"
    design.parent.mkdir(parents=True)
    design.write_text("initial product context")
    contract = SprintContract(
        sprint_number=1,
        goal="Tolerate product context edits while reviewers run.",
        success_criteria=[SuccessCriterion(id="SC-1", description="Sprint can continue after an external design doc edit.")],
        evidence={"routes": ["/"]},
        confirmed=True,
    )

    def fake_run_generator(spec, contract, project_dir, handoff=None, strategic_framing=None, cfg=None):
        page = project_dir / "repos/orbits/app/page.jsx"
        page.parent.mkdir(parents=True)
        page.write_text("export default function Page() { return 'ok' }")
        return "generated app"

    def fake_run_evaluator(*args, **kwargs):
        design.write_text("updated product context while evaluator ran")
        return EvalResult(
            verdict="pass",
            rubric_average=4.0,
            contract_results=[SuccessCriterion(id="SC-1", description="Sprint can continue after an external design doc edit.", status="pass")],
            feedback="ok",
        )

    monkeypatch.setattr("harness.harness.run_generator", fake_run_generator)
    monkeypatch.setattr("harness.harness.self_assess", lambda *args, **kwargs: (True, []))
    monkeypatch.setattr("harness.harness.collect_evidence", lambda *args, **kwargs: {})
    monkeypatch.setattr("harness.harness.run_evaluator", fake_run_evaluator)
    monkeypatch.setattr(
        "harness.harness.run_verifier",
        lambda *args, **kwargs: VerificationResult(verdict="pass", experience_average=4.0, scores={"clarity": 4}, issues=[], feedback="ok"),
    )

    eval_result, verify_result, _handoff = run_sprint("SPEC", contract, tmp_path, cfg, "http://localhost:3000")

    assert eval_result.verdict == "pass"
    assert verify_result.verdict == "pass"
    assert design.read_text() == "updated product context while evaluator ran"


def test_run_sprint_allows_concurrent_harness_runtime_artifact_changes(tmp_path, monkeypatch):
    import shutil

    from harness.config import HarnessConfig
    from harness.harness import init, run_sprint
    from harness.models.state import EvalResult, SprintContract, SuccessCriterion, VerificationResult

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.loop.max_iterations = 1
    cfg.loop.min_iterations = 1
    cfg.workspace.git.enabled = False
    init(tmp_path, cfg)
    old_run = tmp_path / "harness-state/runs/old-run/sprint-1/iter-1"
    old_run.mkdir(parents=True)
    (old_run / "evidence.json").write_text("{}")
    preflight_report = tmp_path / "harness-state/preflight/preflight.json"
    preflight_report.parent.mkdir(parents=True)
    preflight_report.write_text('{"status":"pass"}')
    contract = SprintContract(
        sprint_number=1,
        goal="Tolerate harness runtime artifact maintenance",
        success_criteria=[SuccessCriterion(id="SC-1", description="Generator only edits app code.")],
        evidence={"routes": ["/"]},
        confirmed=True,
    )

    def fake_run_generator(spec, contract, project_dir, handoff=None, strategic_framing=None, cfg=None):
        page = project_dir / "repos/orbits/app/page.jsx"
        page.parent.mkdir(parents=True)
        page.write_text("export default function Page() { return 'ok' }")
        shutil.rmtree(project_dir / "harness-state/runs/old-run")
        preflight_report.write_text('{"status":"pass","refreshed":true}')
        return "wrote app while harness artifacts were maintained"

    monkeypatch.setattr("harness.harness.run_generator", fake_run_generator)
    monkeypatch.setattr("harness.harness.self_assess", lambda *args, **kwargs: (True, []))
    monkeypatch.setattr("harness.harness.collect_evidence", lambda *args, **kwargs: {})
    monkeypatch.setattr(
        "harness.harness.run_evaluator",
        lambda *args, **kwargs: EvalResult(
            verdict="pass",
            rubric_average=4.0,
            contract_results=[SuccessCriterion(id="SC-1", description="Generator only edits app code.", status="pass")],
            feedback="ok",
        ),
    )
    monkeypatch.setattr(
        "harness.harness.run_verifier",
        lambda *args, **kwargs: VerificationResult(verdict="pass", experience_average=4.0, scores={"clarity": 4}, issues=[], feedback="ok"),
    )

    eval_result, verify_result, _handoff = run_sprint("SPEC", contract, tmp_path, cfg, "http://localhost:3000")

    assert eval_result.verdict == "pass"
    assert verify_result.verdict == "pass"


def test_run_sprint_blocks_self_assessment_workspace_writes(tmp_path, monkeypatch):
    import pytest

    from harness.config import HarnessConfig
    from harness.harness import init, run_sprint
    from harness.models.state import EvalResult, SprintContract, SuccessCriterion, VerificationResult

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    init(tmp_path, cfg)
    contract = SprintContract(
        sprint_number=1,
        goal="Self-assessment stays read-only",
        success_criteria=[SuccessCriterion(id="SC-1", description="Self-assessment cannot mutate files.")],
        evidence={"routes": ["/"]},
        confirmed=True,
    )

    def fake_run_generator(spec, contract, project_dir, handoff=None, strategic_framing=None, cfg=None):
        page = project_dir / "repos/orbits/app/page.jsx"
        page.parent.mkdir(parents=True)
        page.write_text("export default function Page() { return 'before' }")
        return "created page"

    def mutating_self_assess(*args, **kwargs):
        (tmp_path / "repos/orbits/app/page.jsx").write_text("export default function Page() { return 'after' }")
        return True, []

    monkeypatch.setattr("harness.harness.run_generator", fake_run_generator)
    monkeypatch.setattr("harness.harness.self_assess", mutating_self_assess)
    monkeypatch.setattr("harness.harness.collect_evidence", lambda *args, **kwargs: {})
    monkeypatch.setattr(
        "harness.harness.run_evaluator",
        lambda *args, **kwargs: EvalResult(
            verdict="pass",
            rubric_average=4.0,
            contract_results=[SuccessCriterion(id="SC-1", description="Self-assessment cannot mutate files.", status="pass")],
            feedback="ok",
        ),
    )
    monkeypatch.setattr(
        "harness.harness.run_verifier",
        lambda *args, **kwargs: VerificationResult(verdict="pass", experience_average=4.0, scores={"clarity": 4}, issues=[], feedback="ok"),
    )

    with pytest.raises(RuntimeError, match="Self-assessment modified workspace"):
        run_sprint("SPEC", contract, tmp_path, cfg, "http://localhost:3000")


def test_run_sprint_allows_product_context_edits_during_self_assessment(tmp_path, monkeypatch):
    from harness.config import HarnessConfig
    from harness.harness import init, run_sprint
    from harness.models.state import EvalResult, SprintContract, SuccessCriterion, VerificationResult

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.loop.max_iterations = 1
    cfg.loop.min_iterations = 1
    cfg.workspace.git.enabled = False
    init(tmp_path, cfg)
    design = tmp_path / "docs" / "designs" / "inital_design.md"
    design.parent.mkdir(parents=True)
    design.write_text("initial product context")
    contract = SprintContract(
        sprint_number=1,
        goal="Self-assessment tolerates concurrent product context edits",
        success_criteria=[SuccessCriterion(id="SC-1", description="Self-assessment remains read-only while product context changes externally.")],
        evidence={"routes": ["/"]},
        confirmed=True,
    )

    def fake_run_generator(spec, contract, project_dir, handoff=None, strategic_framing=None, cfg=None):
        page = project_dir / "repos/orbits/app/page.jsx"
        page.parent.mkdir(parents=True)
        page.write_text("export default function Page() { return 'ok' }")
        return "created page"

    def concurrent_self_assess(*args, **kwargs):
        design.write_text("updated product context for the next sprint")
        return True, []

    monkeypatch.setattr("harness.harness.run_generator", fake_run_generator)
    monkeypatch.setattr("harness.harness.self_assess", concurrent_self_assess)
    monkeypatch.setattr("harness.harness.collect_evidence", lambda *args, **kwargs: {})
    monkeypatch.setattr(
        "harness.harness.run_evaluator",
        lambda *args, **kwargs: EvalResult(
            verdict="pass",
            rubric_average=4.0,
            contract_results=[
                SuccessCriterion(
                    id="SC-1",
                    description="Self-assessment remains read-only while product context changes externally.",
                    status="pass",
                )
            ],
            feedback="ok",
        ),
    )
    monkeypatch.setattr(
        "harness.harness.run_verifier",
        lambda *args, **kwargs: VerificationResult(verdict="pass", experience_average=4.0, scores={"clarity": 4}, issues=[], feedback="ok"),
    )

    eval_result, verify_result, _handoff = run_sprint("SPEC", contract, tmp_path, cfg, "http://localhost:3000")

    assert eval_result.verdict == "pass"
    assert verify_result.verdict == "pass"
    assert design.read_text() == "updated product context for the next sprint"


def test_run_sprint_blocks_self_assessment_root_workspace_writes(tmp_path, monkeypatch):
    import pytest

    from harness.config import HarnessConfig
    from harness.harness import init, run_sprint
    from harness.models.state import EvalResult, SprintContract, SuccessCriterion, VerificationResult

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.loop.max_iterations = 1
    cfg.loop.min_iterations = 1
    cfg.workspace.git.enabled = False
    init(tmp_path, cfg)
    sentinel = tmp_path / "tests/test_harness_core.py"
    sentinel.parent.mkdir(parents=True)
    sentinel.write_text("before")
    contract = SprintContract(
        sprint_number=1,
        goal="Self-assessment root writes are blocked",
        success_criteria=[SuccessCriterion(id="SC-1", description="Self-assessment root writes do not persist.")],
        evidence={"routes": ["/"]},
        confirmed=True,
    )

    def fake_run_generator(spec, contract, project_dir, handoff=None, strategic_framing=None, cfg=None):
        page = project_dir / "repos/orbits/app/page.jsx"
        page.parent.mkdir(parents=True)
        page.write_text("export default function Page() { return 'ok' }")
        return "created page"

    def mutating_self_assess(*args, **kwargs):
        sentinel.write_text("after")
        return True, []

    monkeypatch.setattr("harness.harness.run_generator", fake_run_generator)
    monkeypatch.setattr("harness.harness.self_assess", mutating_self_assess)
    monkeypatch.setattr("harness.harness.collect_evidence", lambda *args, **kwargs: {})
    monkeypatch.setattr(
        "harness.harness.run_evaluator",
        lambda *args, **kwargs: EvalResult(
            verdict="pass",
            rubric_average=4.0,
            contract_results=[SuccessCriterion(id="SC-1", description="Self-assessment root writes do not persist.", status="pass")],
            feedback="ok",
        ),
    )
    monkeypatch.setattr(
        "harness.harness.run_verifier",
        lambda *args, **kwargs: VerificationResult(verdict="pass", experience_average=4.0, scores={"clarity": 4}, issues=[], feedback="ok"),
    )

    with pytest.raises(RuntimeError, match="Self-assessment modified workspace"):
        run_sprint("SPEC", contract, tmp_path, cfg, "http://localhost:3000")


def test_run_sprint_reviews_contract_before_generation(tmp_path, monkeypatch):
    import pytest

    from harness.config import HarnessConfig
    from harness.harness import init, run_sprint
    from harness.models.state import EvalResult, SprintContract, SuccessCriterion, VerificationResult

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.loop.max_iterations = 1
    init(tmp_path, cfg)
    contract = SprintContract(
        sprint_number=1,
        goal="Reject unreviewed direct contract",
        success_criteria=[SuccessCriterion(id="SC-1", description="The contract is reviewed before generation.")],
        evidence={},
        confirmed=True,
    )
    generator_calls = []

    def fake_run_generator(spec, contract, project_dir, handoff=None, strategic_framing=None, cfg=None):
        generator_calls.append(True)
        return "should not run"

    monkeypatch.setattr("harness.harness.run_generator", fake_run_generator)
    monkeypatch.setattr("harness.harness.self_assess", lambda *args, **kwargs: (True, []))
    monkeypatch.setattr("harness.harness.collect_evidence", lambda *args, **kwargs: {})
    monkeypatch.setattr(
        "harness.harness.run_evaluator",
        lambda *args, **kwargs: EvalResult(
            verdict="pass",
            rubric_average=4.0,
            contract_results=[SuccessCriterion(id="SC-1", description="unexpected", status="pass")],
            feedback="unexpected pass",
        ),
    )
    monkeypatch.setattr(
        "harness.harness.run_verifier",
        lambda *args, **kwargs: VerificationResult(verdict="pass", experience_average=4.0, scores={"clarity": 4}, issues=[], feedback="unexpected pass"),
    )

    with pytest.raises(ValueError, match="Contract review failed"):
        run_sprint("SPEC", contract, tmp_path, cfg, "http://localhost:3000")

    assert generator_calls == []


def test_run_sprint_blocks_generator_changes_to_harness_state(tmp_path, monkeypatch):
    import pytest

    from harness.config import HarnessConfig
    from harness.harness import init, run_sprint
    from harness.models.state import EvalResult, SprintContract, SuccessCriterion, VerificationResult

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.loop.max_iterations = 1
    cfg.loop.min_iterations = 1
    cfg.workspace.git.enabled = False
    init(tmp_path, cfg)
    contract = SprintContract(
        sprint_number=1,
        goal="Stay out of harness artifacts",
        success_criteria=[SuccessCriterion(id="SC-1", description="Generator only edits app code.")],
        evidence={"routes": ["/"]},
        confirmed=True,
    )

    def fake_run_generator(spec, contract, project_dir, handoff=None, strategic_framing=None, cfg=None):
        leak = project_dir / "harness-state/evidence/sprint-99/leak.txt"
        leak.parent.mkdir(parents=True)
        leak.write_text("generator artifact")
        page = project_dir / "repos/orbits/app/page.jsx"
        page.parent.mkdir(parents=True)
        page.write_text("export default function Page() { return 'ok' }")
        return "wrote harness-state"

    monkeypatch.setattr("harness.harness.run_generator", fake_run_generator)
    monkeypatch.setattr("harness.harness.self_assess", lambda *args, **kwargs: (True, []))
    monkeypatch.setattr("harness.harness.collect_evidence", lambda *args, **kwargs: {})
    monkeypatch.setattr(
        "harness.harness.run_evaluator",
        lambda *args, **kwargs: EvalResult(
            verdict="pass",
            rubric_average=4.0,
            contract_results=[SuccessCriterion(id="SC-1", description="Generator only edits app code.", status="pass")],
            feedback="ok",
        ),
    )
    monkeypatch.setattr(
        "harness.harness.run_verifier",
        lambda *args, **kwargs: VerificationResult(verdict="pass", experience_average=4.0, scores={"clarity": 4}, issues=[], feedback="ok"),
    )

    with pytest.raises(RuntimeError, match="Protected workspace changed"):
        run_sprint("SPEC", contract, tmp_path, cfg, "http://localhost:3000")


def test_run_sprint_blocks_generator_changes_to_current_iteration_artifacts(tmp_path, monkeypatch):
    import pytest

    from harness.config import HarnessConfig
    from harness.harness import init, run_sprint
    from harness.models.state import EvalResult, SprintContract, SuccessCriterion, VerificationResult

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.loop.max_iterations = 1
    cfg.loop.min_iterations = 1
    cfg.workspace.git.enabled = False
    init(tmp_path, cfg)
    contract = SprintContract(
        sprint_number=1,
        goal="Generator cannot write harness run artifacts",
        success_criteria=[SuccessCriterion(id="SC-1", description="Generator only edits app code.")],
        evidence={"routes": ["/"]},
        confirmed=True,
    )

    def fake_run_generator(spec, contract, project_dir, handoff=None, strategic_framing=None, cfg=None):
        page = project_dir / "repos/orbits/app/page.jsx"
        page.parent.mkdir(parents=True, exist_ok=True)
        page.write_text("export default function Page() { return 'ok' }")
        leak = project_dir / "harness-state/runs/run-test/sprint-1/iter-1/artifacts/generator-leak.txt"
        leak.parent.mkdir(parents=True, exist_ok=True)
        leak.write_text("generator artifact")
        return "wrote app and harness-state"

    monkeypatch.setattr("harness.harness.run_generator", fake_run_generator)
    monkeypatch.setattr("harness.harness.self_assess", lambda *args, **kwargs: (True, []))
    monkeypatch.setattr("harness.harness.collect_evidence", lambda *args, **kwargs: {})
    monkeypatch.setattr(
        "harness.harness.run_evaluator",
        lambda *args, **kwargs: EvalResult(
            verdict="pass",
            rubric_average=4.0,
            contract_results=[SuccessCriterion(id="SC-1", description="Generator only edits app code.", status="pass")],
            feedback="ok",
        ),
    )
    monkeypatch.setattr(
        "harness.harness.run_verifier",
        lambda *args, **kwargs: VerificationResult(verdict="pass", experience_average=4.0, scores={"clarity": 4}, issues=[], feedback="ok"),
    )

    with pytest.raises(RuntimeError, match="Protected workspace changed"):
        run_sprint("SPEC", contract, tmp_path, cfg, "http://localhost:3000", run_id="run-test")


def test_run_sprint_blocks_generator_root_build_artifacts(tmp_path, monkeypatch):
    import pytest

    from harness.config import HarnessConfig
    from harness.harness import init, run_sprint
    from harness.models.state import EvalResult, SprintContract, SuccessCriterion, VerificationResult

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.loop.max_iterations = 1
    cfg.loop.min_iterations = 1
    cfg.workspace.git.enabled = False
    init(tmp_path, cfg)
    contract = SprintContract(
        sprint_number=1,
        goal="No root build artifacts",
        success_criteria=[SuccessCriterion(id="SC-1", description="Generator must not write root build artifacts.")],
        evidence={"routes": ["/"]},
        confirmed=True,
    )

    def fake_run_generator(spec, contract, project_dir, handoff=None, strategic_framing=None, cfg=None):
        leak = project_dir / "build/leak.txt"
        leak.parent.mkdir(parents=True)
        leak.write_text("root build artifact")
        page = project_dir / "repos/orbits/app/page.jsx"
        page.parent.mkdir(parents=True)
        page.write_text("export default function Page() { return 'ok' }")
        return "wrote root build artifact"

    def fake_collect_evidence(project_dir, app_url, contract, paths):
        (paths["sprint_evidence"] / "evidence.json").write_text("{}")
        return {}

    monkeypatch.setattr("harness.harness.run_generator", fake_run_generator)
    monkeypatch.setattr("harness.harness.self_assess", lambda *args, **kwargs: (True, []))
    monkeypatch.setattr("harness.harness.collect_evidence", fake_collect_evidence)
    monkeypatch.setattr(
        "harness.harness.run_evaluator",
        lambda *args, **kwargs: EvalResult(
            verdict="pass",
            rubric_average=4.0,
            contract_results=[SuccessCriterion(id="SC-1", description="Generator must not write root build artifacts.", status="pass")],
            feedback="unexpected pass",
        ),
    )
    monkeypatch.setattr(
        "harness.harness.run_verifier",
        lambda *args, **kwargs: VerificationResult(verdict="pass", experience_average=4.0, scores={"clarity": 4}, issues=[], feedback="unexpected pass"),
    )

    with pytest.raises(RuntimeError, match="Protected workspace changed"):
        run_sprint("SPEC", contract, tmp_path, cfg, "http://localhost:3000")


def test_run_sprint_blocks_generator_modifications_to_existing_harness_files(tmp_path, monkeypatch):
    import pytest

    from harness.config import HarnessConfig
    from harness.harness import init, run_sprint
    from harness.models.state import EvalResult, SprintContract, SuccessCriterion, VerificationResult

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.agents.generator.backend = "claude"
    cfg.loop.max_iterations = 1
    cfg.loop.min_iterations = 1
    cfg.workspace.git.enabled = False
    init(tmp_path, cfg)
    harness_file = tmp_path / "harness/harness.py"
    harness_file.parent.mkdir(parents=True)
    harness_file.write_text("before")
    contract = SprintContract(
        sprint_number=1,
        goal="Restore harness file pollution",
        success_criteria=[SuccessCriterion(id="SC-1", description="Generator only edits app code.")],
        evidence={"routes": ["/"]},
        confirmed=True,
    )

    def fake_run_generator(spec, contract, project_dir, handoff=None, strategic_framing=None, cfg=None):
        (project_dir / "harness/harness.py").write_text("after")
        page = project_dir / "repos/orbits/app/page.jsx"
        page.parent.mkdir(parents=True)
        page.write_text("export default function Page() { return 'ok' }")
        return "modified harness file"

    monkeypatch.setattr("harness.harness.run_generator", fake_run_generator)
    monkeypatch.setattr("harness.harness.self_assess", lambda *args, **kwargs: (True, []))
    monkeypatch.setattr("harness.harness.collect_evidence", lambda *args, **kwargs: {})
    monkeypatch.setattr(
        "harness.harness.run_evaluator",
        lambda *args, **kwargs: EvalResult(
            verdict="pass",
            rubric_average=4.0,
            contract_results=[SuccessCriterion(id="SC-1", description="Generator only edits app code.", status="pass")],
            feedback="ok",
        ),
    )
    monkeypatch.setattr(
        "harness.harness.run_verifier",
        lambda *args, **kwargs: VerificationResult(verdict="pass", experience_average=4.0, scores={"clarity": 4}, issues=[], feedback="ok"),
    )

    with pytest.raises(RuntimeError, match="Protected workspace changed"):
        run_sprint("SPEC", contract, tmp_path, cfg, "http://localhost:3000")


def test_run_sprint_blocks_generator_creating_nested_app_root(tmp_path, monkeypatch):
    import pytest

    from harness.config import HarnessConfig
    from harness.harness import init, run_sprint
    from harness.models.state import EvalResult, SprintContract, SuccessCriterion, VerificationResult

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.loop.max_iterations = 1
    init(tmp_path, cfg)
    contract = SprintContract(
        sprint_number=1,
        goal="Do not nest app root",
        success_criteria=[SuccessCriterion(id="SC-1", description="Generator writes app-relative paths only.")],
        evidence={"routes": ["/"]},
        confirmed=True,
    )

    def fake_run_generator(spec, contract, project_dir, handoff=None, strategic_framing=None, cfg=None):
        nested = project_dir / "repos/orbits/repos/orbits/app/page.jsx"
        nested.parent.mkdir(parents=True)
        nested.write_text("export default function Page() { return null }")
        return "created nested app root"

    def fake_collect_evidence(project_dir, app_url, contract, paths):
        (paths["sprint_evidence"] / "evidence.json").write_text("{}")
        return {}

    monkeypatch.setattr("harness.harness.run_generator", fake_run_generator)
    monkeypatch.setattr("harness.harness.self_assess", lambda *args, **kwargs: (True, []))
    monkeypatch.setattr("harness.harness.collect_evidence", fake_collect_evidence)
    monkeypatch.setattr(
        "harness.harness.run_evaluator",
        lambda *args, **kwargs: EvalResult(
            verdict="pass",
            rubric_average=4.0,
            contract_results=[SuccessCriterion(id="SC-1", description="Generator writes app-relative paths only.", status="pass")],
            feedback="unexpected pass",
        ),
    )
    monkeypatch.setattr(
        "harness.harness.run_verifier",
        lambda *args, **kwargs: VerificationResult(verdict="pass", experience_average=4.0, scores={"clarity": 4}, issues=[], feedback="unexpected pass"),
    )

    with pytest.raises(RuntimeError, match="Nested app root changed"):
        run_sprint("SPEC", contract, tmp_path, cfg, "http://localhost:3000")


def test_run_sprint_blocks_generator_changes_outside_write_allowlist(tmp_path, monkeypatch):
    import pytest

    from harness.config import HarnessConfig
    from harness.harness import init, run_sprint
    from harness.models.state import EvalResult, SprintContract, SuccessCriterion, VerificationResult

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.workspace.write_allowlist = ["repos/orbits/app/**"]
    cfg.loop.max_iterations = 1
    init(tmp_path, cfg)
    contract = SprintContract(
        sprint_number=1,
        goal="Respect write allowlist",
        success_criteria=[SuccessCriterion(id="SC-1", description="Generator changes only allowlisted app files.")],
        evidence={"routes": ["/"]},
        confirmed=True,
    )

    def fake_run_generator(spec, contract, project_dir, handoff=None, strategic_framing=None, cfg=None):
        (project_dir / "repos/orbits/README.md").write_text("# Orbits\n\nGenerator changed outside allowlist.\n")
        return "changed README"

    def fake_collect_evidence(project_dir, app_url, contract, paths):
        (paths["sprint_evidence"] / "evidence.json").write_text("{}")
        return {}

    monkeypatch.setattr("harness.harness.run_generator", fake_run_generator)
    monkeypatch.setattr("harness.harness.self_assess", lambda *args, **kwargs: (True, []))
    monkeypatch.setattr("harness.harness.collect_evidence", fake_collect_evidence)
    monkeypatch.setattr(
        "harness.harness.run_evaluator",
        lambda *args, **kwargs: EvalResult(
            verdict="pass",
            rubric_average=4.0,
            contract_results=[SuccessCriterion(id="SC-1", description="Generator changes only allowlisted app files.", status="pass")],
            feedback="unexpected pass",
        ),
    )
    monkeypatch.setattr(
        "harness.harness.run_verifier",
        lambda *args, **kwargs: VerificationResult(verdict="pass", experience_average=4.0, scores={"clarity": 4}, issues=[], feedback="unexpected pass"),
    )

    with pytest.raises(RuntimeError, match="Outside write allowlist changed"):
        run_sprint("SPEC", contract, tmp_path, cfg, "http://localhost:3000")


def test_run_sprint_blocks_generator_changes_outside_contract_file_boundary(tmp_path, monkeypatch):
    import pytest

    from harness.config import HarnessConfig
    from harness.harness import init, run_sprint
    from harness.models.state import SprintContract, SuccessCriterion

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.loop.max_iterations = 1
    init(tmp_path, cfg)
    contract = SprintContract(
        sprint_number=1,
        goal="Business card acquisition boundary",
        success_criteria=[SuccessCriterion(id="SC-1", description="The business card acquisition route renders.")],
        evidence={"routes": ["/dev/capabilities/business-card"]},
        file_boundary={
            "capability_root": "features/acquisition/business-card",
            "owned_paths": ["features/acquisition/business-card/**", "app/dev/capabilities/business-card/**"],
            "allowed_shared_paths": [],
            "forbidden_paths": ["features/chat/**"],
            "shared_change_policy": "forbidden_unless_explicit",
        },
        confirmed=True,
    )

    def fake_run_generator(spec, contract, project_dir, handoff=None, strategic_framing=None, cfg=None):
        leak = project_dir / "repos/orbits/features/chat/mock-service.ts"
        leak.parent.mkdir(parents=True, exist_ok=True)
        leak.write_text("export const leak = true;")
        return "changed another capability"

    monkeypatch.setattr("harness.harness.run_generator", fake_run_generator)

    with pytest.raises(RuntimeError, match="Outside sprint file boundary changed"):
        run_sprint("SPEC", contract, tmp_path, cfg, "http://localhost:3000")


def test_run_sprint_blocks_generator_changes_to_protected_app_paths(tmp_path, monkeypatch):
    import subprocess
    import pytest

    from harness.config import HarnessConfig
    from harness.harness import init, run_sprint
    from harness.models.state import SprintContract, SuccessCriterion

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    init(tmp_path, cfg)
    app_repo = tmp_path / "repos/orbits"
    subprocess.run(["git", "config", "user.email", "orbit@example.local"], cwd=app_repo, check=True)
    subprocess.run(["git", "config", "user.name", "Orbit Harness"], cwd=app_repo, check=True)
    (app_repo / ".env").write_text("SECRET=old\n")
    subprocess.run(["git", "add", "-f", ".env", "README.md", ".gitignore"], cwd=app_repo, check=True)
    subprocess.run(["git", "commit", "-m", "test: baseline"], cwd=app_repo, check=True, capture_output=True, text=True)
    contract = SprintContract(
        sprint_number=1,
        goal="Do not touch secrets",
        success_criteria=[SuccessCriterion(id="SC-1", description="Generator leaves protected app paths alone.")],
        evidence={"routes": ["/"]},
        confirmed=True,
    )

    def fake_run_generator(spec, contract, project_dir, handoff=None, strategic_framing=None, cfg=None):
        (project_dir / "repos/orbits/.env").write_text("SECRET=new\n")
        return "changed env"

    monkeypatch.setattr("harness.harness.run_generator", fake_run_generator)

    with pytest.raises(RuntimeError, match="Protected app path changed"):
        run_sprint("SPEC", contract, tmp_path, cfg, "http://localhost:3000")


def test_run_sprint_blocks_generator_renaming_protected_app_paths(tmp_path, monkeypatch):
    import subprocess
    import pytest

    from harness.config import HarnessConfig
    from harness.harness import init, run_sprint
    from harness.models.state import EvalResult, SprintContract, SuccessCriterion, VerificationResult

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.loop.max_iterations = 1
    init(tmp_path, cfg)
    app_repo = tmp_path / "repos/orbits"
    subprocess.run(["git", "config", "user.email", "orbit@example.local"], cwd=app_repo, check=True)
    subprocess.run(["git", "config", "user.name", "Orbit Harness"], cwd=app_repo, check=True)
    (app_repo / ".env").write_text("SECRET=old\n")
    subprocess.run(["git", "add", "-f", ".env", "README.md", ".gitignore"], cwd=app_repo, check=True)
    subprocess.run(["git", "commit", "-m", "test: baseline"], cwd=app_repo, check=True, capture_output=True, text=True)
    contract = SprintContract(
        sprint_number=1,
        goal="Do not move secrets",
        success_criteria=[SuccessCriterion(id="SC-1", description="Generator leaves protected app paths in place.")],
        evidence={"routes": ["/"]},
        confirmed=True,
    )

    def fake_run_generator(spec, contract, project_dir, handoff=None, strategic_framing=None, cfg=None):
        app_dir = project_dir / "repos/orbits"
        (app_dir / "app").mkdir()
        subprocess.run(["git", "mv", ".env", "app/env-copy.txt"], cwd=app_dir, check=True)
        return "renamed env into app source"

    def fake_collect_evidence(project_dir, app_url, contract, paths):
        (paths["sprint_evidence"] / "evidence.json").write_text("{}")
        return {}

    monkeypatch.setattr("harness.harness.run_generator", fake_run_generator)
    monkeypatch.setattr("harness.harness.self_assess", lambda *args, **kwargs: (True, []))
    monkeypatch.setattr("harness.harness.collect_evidence", fake_collect_evidence)
    monkeypatch.setattr(
        "harness.harness.run_evaluator",
        lambda *args, **kwargs: EvalResult(
            verdict="pass",
            rubric_average=4.0,
            contract_results=[SuccessCriterion(id="SC-1", description="Generator leaves protected app paths in place.", status="pass")],
            feedback="unexpected pass",
        ),
    )
    monkeypatch.setattr(
        "harness.harness.run_verifier",
        lambda *args, **kwargs: VerificationResult(verdict="pass", experience_average=4.0, scores={"clarity": 4}, issues=[], feedback="unexpected pass"),
    )

    with pytest.raises(RuntimeError, match="Protected app path changed"):
        run_sprint("SPEC", contract, tmp_path, cfg, "http://localhost:3000")


def test_run_sprint_blocks_generator_creating_ignored_protected_app_artifacts(tmp_path, monkeypatch):
    import pytest

    from harness.config import HarnessConfig
    from harness.harness import init, run_sprint
    from harness.models.state import EvalResult, SprintContract, SuccessCriterion, VerificationResult

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    init(tmp_path, cfg)
    contract = SprintContract(
        sprint_number=1,
        goal="Do not create app artifacts",
        success_criteria=[SuccessCriterion(id="SC-1", description="Generator leaves ignored protected artifact dirs alone.")],
        evidence={"routes": ["/"]},
        confirmed=True,
    )

    def fake_run_generator(spec, contract, project_dir, handoff=None, strategic_framing=None, cfg=None):
        artifact = project_dir / "repos/orbits/.env.local"
        artifact.write_text("SECRET=leak")
        return "wrote ignored protected artifact"

    def fake_collect_evidence(project_dir, app_url, contract, paths):
        (paths["sprint_evidence"] / "evidence.json").write_text("{}")
        return {}

    monkeypatch.setattr("harness.harness.run_generator", fake_run_generator)
    monkeypatch.setattr("harness.harness.self_assess", lambda *args, **kwargs: (True, []))
    monkeypatch.setattr("harness.harness.collect_evidence", fake_collect_evidence)
    monkeypatch.setattr(
        "harness.harness.run_evaluator",
        lambda *args, **kwargs: EvalResult(
            verdict="pass",
            rubric_average=4.0,
            contract_results=[SuccessCriterion(id="SC-1", description="Generator leaves ignored protected artifact dirs alone.", status="pass")],
            feedback="unexpected pass",
        ),
    )
    monkeypatch.setattr(
        "harness.harness.run_verifier",
        lambda *args, **kwargs: VerificationResult(verdict="pass", experience_average=4.0, scores={"clarity": 4}, issues=[], feedback="unexpected pass"),
    )

    with pytest.raises(RuntimeError, match="Protected app path changed"):
        run_sprint("SPEC", contract, tmp_path, cfg, "http://localhost:3000")


def test_run_sprint_blocks_generator_creating_ignored_unprotected_app_artifacts(tmp_path, monkeypatch):
    import pytest

    from harness.config import HarnessConfig
    from harness.harness import init, run_sprint
    from harness.models.state import EvalResult, SprintContract, SuccessCriterion, VerificationResult

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.loop.max_iterations = 1
    init(tmp_path, cfg)
    contract = SprintContract(
        sprint_number=1,
        goal="Do not create ignored app logs",
        success_criteria=[SuccessCriterion(id="SC-1", description="Generator does not leave ignored app artifacts behind.")],
        evidence={"routes": ["/"]},
        confirmed=True,
    )

    def fake_run_generator(spec, contract, project_dir, handoff=None, strategic_framing=None, cfg=None):
        (project_dir / "repos/orbits/npm-debug.log").write_text("npm failed")
        return "wrote ignored app artifact"

    def fake_collect_evidence(project_dir, app_url, contract, paths):
        (paths["sprint_evidence"] / "evidence.json").write_text("{}")
        return {}

    monkeypatch.setattr("harness.harness.run_generator", fake_run_generator)
    monkeypatch.setattr("harness.harness.self_assess", lambda *args, **kwargs: (True, []))
    monkeypatch.setattr("harness.harness.collect_evidence", fake_collect_evidence)
    monkeypatch.setattr(
        "harness.harness.run_evaluator",
        lambda *args, **kwargs: EvalResult(
            verdict="pass",
            rubric_average=4.0,
            contract_results=[SuccessCriterion(id="SC-1", description="Generator does not leave ignored app artifacts behind.", status="pass")],
            feedback="unexpected pass",
        ),
    )
    monkeypatch.setattr(
        "harness.harness.run_verifier",
        lambda *args, **kwargs: VerificationResult(verdict="pass", experience_average=4.0, scores={"clarity": 4}, issues=[], feedback="unexpected pass"),
    )

    with pytest.raises(RuntimeError, match="Ignored app path changed"):
        run_sprint("SPEC", contract, tmp_path, cfg, "http://localhost:3000")


def test_run_sprint_blocks_generator_modifying_existing_ignored_unprotected_app_artifacts(tmp_path, monkeypatch):
    import pytest

    from harness.config import HarnessConfig
    from harness.harness import init, run_sprint
    from harness.models.state import EvalResult, SprintContract, SuccessCriterion, VerificationResult

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.loop.max_iterations = 1
    init(tmp_path, cfg)
    (tmp_path / "repos/orbits/npm-debug.log").write_text("before")
    contract = SprintContract(
        sprint_number=1,
        goal="Do not mutate ignored app logs",
        success_criteria=[SuccessCriterion(id="SC-1", description="Generator does not mutate ignored app artifacts.")],
        evidence={"routes": ["/"]},
        confirmed=True,
    )

    def fake_run_generator(spec, contract, project_dir, handoff=None, strategic_framing=None, cfg=None):
        (project_dir / "repos/orbits/npm-debug.log").write_text("after")
        return "modified ignored app artifact"

    def fake_collect_evidence(project_dir, app_url, contract, paths):
        (paths["sprint_evidence"] / "evidence.json").write_text("{}")
        return {}

    monkeypatch.setattr("harness.harness.run_generator", fake_run_generator)
    monkeypatch.setattr("harness.harness.self_assess", lambda *args, **kwargs: (True, []))
    monkeypatch.setattr("harness.harness.collect_evidence", fake_collect_evidence)
    monkeypatch.setattr(
        "harness.harness.run_evaluator",
        lambda *args, **kwargs: EvalResult(
            verdict="pass",
            rubric_average=4.0,
            contract_results=[SuccessCriterion(id="SC-1", description="Generator does not mutate ignored app artifacts.", status="pass")],
            feedback="unexpected pass",
        ),
    )
    monkeypatch.setattr(
        "harness.harness.run_verifier",
        lambda *args, **kwargs: VerificationResult(verdict="pass", experience_average=4.0, scores={"clarity": 4}, issues=[], feedback="unexpected pass"),
    )

    with pytest.raises(RuntimeError, match="Ignored app path changed"):
        run_sprint("SPEC", contract, tmp_path, cfg, "http://localhost:3000")


def test_run_sprint_blocks_repair_pass_creating_ignored_unprotected_app_artifacts(tmp_path, monkeypatch):
    import pytest

    from harness.config import HarnessConfig
    from harness.harness import init, run_sprint
    from harness.models.state import EvalResult, SprintContract, SuccessCriterion, VerificationResult

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.loop.max_iterations = 2
    init(tmp_path, cfg)
    contract = SprintContract(
        sprint_number=1,
        goal="Do not create ignored app logs during repair",
        success_criteria=[SuccessCriterion(id="SC-1", description="Repair pass does not leave ignored app artifacts behind.")],
        evidence={"routes": ["/"]},
        confirmed=True,
    )

    generator_calls = []

    def fake_run_generator(spec, contract, project_dir, handoff=None, strategic_framing=None, cfg=None):
        generator_calls.append(strategic_framing)
        if strategic_framing:
            (project_dir / "repos/orbits/npm-debug.log").write_text("repair failed")
            return "repair wrote ignored app artifact"
        page = project_dir / "repos/orbits/app/page.jsx"
        page.parent.mkdir(parents=True, exist_ok=True)
        page.write_text("// generator")
        return "created page"

    self_assess_calls = []

    def fake_self_assess(*args, **kwargs):
        self_assess_calls.append(True)
        if len(self_assess_calls) == 1:
            return False, ["needs repair"]
        return True, []

    def fake_collect_evidence(project_dir, app_url, contract, paths):
        (paths["sprint_evidence"] / "evidence.json").write_text("{}")
        return {}

    monkeypatch.setattr("harness.harness.run_generator", fake_run_generator)
    monkeypatch.setattr("harness.harness.self_assess", fake_self_assess)
    monkeypatch.setattr("harness.harness.collect_evidence", fake_collect_evidence)
    monkeypatch.setattr(
        "harness.harness.run_evaluator",
        lambda *args, **kwargs: EvalResult(
            verdict="pass",
            rubric_average=4.0,
            contract_results=[SuccessCriterion(id="SC-1", description="Repair pass does not leave ignored app artifacts behind.", status="pass")],
            feedback="unexpected pass",
        ),
    )
    monkeypatch.setattr(
        "harness.harness.run_verifier",
        lambda *args, **kwargs: VerificationResult(verdict="pass", experience_average=4.0, scores={"clarity": 4}, issues=[], feedback="unexpected pass"),
    )

    with pytest.raises(RuntimeError, match="Ignored app path changed"):
        run_sprint("SPEC", contract, tmp_path, cfg, "http://localhost:3000")
    assert len(generator_calls) == 2


def test_run_sprint_blocks_generator_modifying_existing_ignored_protected_app_artifacts(tmp_path, monkeypatch):
    import pytest

    from harness.config import HarnessConfig
    from harness.harness import init, run_sprint
    from harness.models.state import EvalResult, SprintContract, SuccessCriterion, VerificationResult

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    init(tmp_path, cfg)
    existing_artifact = tmp_path / "repos/orbits/.env.local"
    existing_artifact.write_text("before")
    contract = SprintContract(
        sprint_number=1,
        goal="Do not mutate app artifacts",
        success_criteria=[SuccessCriterion(id="SC-1", description="Generator does not mutate ignored protected artifact dirs.")],
        evidence={"routes": ["/"]},
        confirmed=True,
    )

    def fake_run_generator(spec, contract, project_dir, handoff=None, strategic_framing=None, cfg=None):
        (project_dir / "repos/orbits/.env.local").write_text("after")
        return "modified ignored protected artifact"

    def fake_collect_evidence(project_dir, app_url, contract, paths):
        (paths["sprint_evidence"] / "evidence.json").write_text("{}")
        return {}

    monkeypatch.setattr("harness.harness.run_generator", fake_run_generator)
    monkeypatch.setattr("harness.harness.self_assess", lambda *args, **kwargs: (True, []))
    monkeypatch.setattr("harness.harness.collect_evidence", fake_collect_evidence)
    monkeypatch.setattr(
        "harness.harness.run_evaluator",
        lambda *args, **kwargs: EvalResult(
            verdict="pass",
            rubric_average=4.0,
            contract_results=[SuccessCriterion(id="SC-1", description="Generator does not mutate ignored protected artifact dirs.", status="pass")],
            feedback="unexpected pass",
        ),
    )
    monkeypatch.setattr(
        "harness.harness.run_verifier",
        lambda *args, **kwargs: VerificationResult(verdict="pass", experience_average=4.0, scores={"clarity": 4}, issues=[], feedback="unexpected pass"),
    )

    with pytest.raises(RuntimeError, match="Protected app path changed"):
        run_sprint("SPEC", contract, tmp_path, cfg, "http://localhost:3000")


def test_run_sprint_blocks_evaluator_changes_to_app_repo(tmp_path, monkeypatch):
    import pytest

    from harness.config import HarnessConfig
    from harness.harness import init, run_sprint
    from harness.models.state import EvalResult, SprintContract, SuccessCriterion, VerificationResult

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    init(tmp_path, cfg)
    contract = SprintContract(
        sprint_number=1,
        goal="Evaluator boundary",
        success_criteria=[SuccessCriterion(id="SC-1", description="Evaluator must not edit app source.")],
        evidence={"routes": ["/"]},
        confirmed=True,
    )

    def fake_run_generator(spec, contract, project_dir, handoff=None, strategic_framing=None, cfg=None):
        page = project_dir / "repos/orbits/app/page.jsx"
        page.parent.mkdir(parents=True, exist_ok=True)
        page.write_text("// generator")
        return "created page"

    def fake_collect_evidence(project_dir, app_url, contract, paths):
        (paths["sprint_evidence"] / "evidence.json").write_text("{}")
        return {}

    def fake_run_evaluator(*args, **kwargs):
        (tmp_path / "repos/orbits/app/evaluator-leak.jsx").write_text("// evaluator wrote app")
        return EvalResult(
            verdict="pass",
            rubric_average=4.0,
            contract_results=[SuccessCriterion(id="SC-1", description="Evaluator must not edit app source.", status="pass")],
            feedback="ok",
        )

    monkeypatch.setattr("harness.harness.run_generator", fake_run_generator)
    monkeypatch.setattr("harness.harness.self_assess", lambda *args, **kwargs: (True, []))
    monkeypatch.setattr("harness.harness.collect_evidence", fake_collect_evidence)
    monkeypatch.setattr("harness.harness.run_evaluator", fake_run_evaluator)
    monkeypatch.setattr(
        "harness.harness.run_verifier",
        lambda *args, **kwargs: VerificationResult(verdict="pass", experience_average=4.0, scores={"clarity": 4}, issues=[], feedback="ok"),
    )

    with pytest.raises(RuntimeError, match="Evaluator wrote outside allowed artifacts"):
        run_sprint("SPEC", contract, tmp_path, cfg, "http://localhost:3000")


def test_run_sprint_blocks_evaluator_creating_protected_ignored_app_artifacts(tmp_path, monkeypatch):
    import pytest

    from harness.config import HarnessConfig
    from harness.harness import init, run_sprint
    from harness.models.state import EvalResult, SprintContract, SuccessCriterion, VerificationResult

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    init(tmp_path, cfg)
    contract = SprintContract(
        sprint_number=1,
        goal="Evaluator protected artifact boundary",
        success_criteria=[SuccessCriterion(id="SC-1", description="Evaluator must not mutate protected ignored app artifacts.")],
        evidence={"routes": ["/"]},
        confirmed=True,
    )

    def fake_run_generator(spec, contract, project_dir, handoff=None, strategic_framing=None, cfg=None):
        page = project_dir / "repos/orbits/app/page.jsx"
        page.parent.mkdir(parents=True, exist_ok=True)
        page.write_text("// generator")
        return "created page"

    def fake_collect_evidence(project_dir, app_url, contract, paths):
        (paths["sprint_evidence"] / "evidence.json").write_text("{}")
        return {}

    def fake_run_evaluator(*args, **kwargs):
        leak = tmp_path / "repos/orbits/.env.local"
        leak.write_text("evaluator wrote protected ignored app artifact")
        return EvalResult(
            verdict="pass",
            rubric_average=4.0,
            contract_results=[SuccessCriterion(id="SC-1", description="Evaluator must not mutate protected ignored app artifacts.", status="pass")],
            feedback="ok",
        )

    monkeypatch.setattr("harness.harness.run_generator", fake_run_generator)
    monkeypatch.setattr("harness.harness.self_assess", lambda *args, **kwargs: (True, []))
    monkeypatch.setattr("harness.harness.collect_evidence", fake_collect_evidence)
    monkeypatch.setattr("harness.harness.run_evaluator", fake_run_evaluator)
    monkeypatch.setattr(
        "harness.harness.run_verifier",
        lambda *args, **kwargs: VerificationResult(verdict="pass", experience_average=4.0, scores={"clarity": 4}, issues=[], feedback="ok"),
    )

    with pytest.raises(RuntimeError, match="Evaluator wrote outside allowed artifacts"):
        run_sprint("SPEC", contract, tmp_path, cfg, "http://localhost:3000")


def test_run_sprint_blocks_verifier_creating_protected_ignored_app_artifacts(tmp_path, monkeypatch):
    import pytest

    from harness.config import HarnessConfig
    from harness.harness import init, run_sprint
    from harness.models.state import EvalResult, SprintContract, SuccessCriterion, VerificationResult

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    init(tmp_path, cfg)
    contract = SprintContract(
        sprint_number=1,
        goal="Verifier protected artifact boundary",
        success_criteria=[SuccessCriterion(id="SC-1", description="Verifier must not mutate protected ignored app artifacts.")],
        evidence={"routes": ["/"]},
        confirmed=True,
    )

    def fake_run_generator(spec, contract, project_dir, handoff=None, strategic_framing=None, cfg=None):
        page = project_dir / "repos/orbits/app/page.jsx"
        page.parent.mkdir(parents=True, exist_ok=True)
        page.write_text("// generator")
        return "created page"

    def fake_collect_evidence(project_dir, app_url, contract, paths):
        (paths["sprint_evidence"] / "evidence.json").write_text("{}")
        return {}

    def fake_run_verifier(*args, **kwargs):
        leak = tmp_path / "repos/orbits/.env.local"
        leak.write_text("verifier wrote protected ignored app artifact")
        return VerificationResult(verdict="pass", experience_average=4.0, scores={"clarity": 4}, issues=[], feedback="ok")

    monkeypatch.setattr("harness.harness.run_generator", fake_run_generator)
    monkeypatch.setattr("harness.harness.self_assess", lambda *args, **kwargs: (True, []))
    monkeypatch.setattr("harness.harness.collect_evidence", fake_collect_evidence)
    monkeypatch.setattr(
        "harness.harness.run_evaluator",
        lambda *args, **kwargs: EvalResult(
            verdict="pass",
            rubric_average=4.0,
            contract_results=[SuccessCriterion(id="SC-1", description="Verifier must not mutate protected ignored app artifacts.", status="pass")],
            feedback="ok",
        ),
    )
    monkeypatch.setattr("harness.harness.run_verifier", fake_run_verifier)

    with pytest.raises(RuntimeError, match="Verifier wrote outside allowed artifacts"):
        run_sprint("SPEC", contract, tmp_path, cfg, "http://localhost:3000")


def test_self_assess_read_only_blocks_protected_ignored_app_artifacts(tmp_path, monkeypatch):
    import pytest

    from harness.config import HarnessConfig
    from harness.harness import init, run_self_assess_read_only
    from harness.models.state import SprintContract, SuccessCriterion

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    init(tmp_path, cfg)
    contract = SprintContract(
        sprint_number=1,
        goal="Self assess boundary",
        success_criteria=[SuccessCriterion(id="SC-1", description="Self-assessment is read-only.")],
        evidence={"routes": ["/"]},
        confirmed=True,
    )

    def mutating_self_assess(*args, **kwargs):
        leak = tmp_path / "repos/orbits/.env.local"
        leak.write_text("self-assessment wrote protected ignored app artifact")
        return True, []

    monkeypatch.setattr("harness.harness.self_assess", mutating_self_assess)

    with pytest.raises(RuntimeError, match="Self-assessment modified workspace"):
        run_self_assess_read_only("SPEC", contract, [], "summary", cfg, tmp_path)


def test_run_sprint_blocks_evidence_collection_app_mutations(tmp_path, monkeypatch):
    import pytest

    from harness.config import HarnessConfig
    from harness.harness import init, run_sprint
    from harness.models.state import EvalResult, SprintContract, SuccessCriterion, VerificationResult

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    init(tmp_path, cfg)
    contract = SprintContract(
        sprint_number=1,
        goal="Evidence boundary",
        success_criteria=[SuccessCriterion(id="SC-1", description="Evidence collection must not mutate app source.")],
        evidence={"routes": ["/"]},
        confirmed=True,
    )

    def fake_run_generator(spec, contract, project_dir, handoff=None, strategic_framing=None, cfg=None):
        page = project_dir / "repos/orbits/app/page.jsx"
        page.parent.mkdir(parents=True, exist_ok=True)
        page.write_text("// generator")
        return "created page"

    def mutating_collect_evidence(project_dir, app_url, contract, paths):
        (paths["sprint_evidence"] / "evidence.json").write_text("{}")
        (project_dir / "repos/orbits/app/evidence-leak.jsx").write_text("// evidence wrote app")
        return {}

    monkeypatch.setattr("harness.harness.run_generator", fake_run_generator)
    monkeypatch.setattr("harness.harness.self_assess", lambda *args, **kwargs: (True, []))
    monkeypatch.setattr("harness.harness.collect_evidence", mutating_collect_evidence)
    monkeypatch.setattr(
        "harness.harness.run_evaluator",
        lambda *args, **kwargs: EvalResult(
            verdict="pass",
            rubric_average=4.0,
            contract_results=[SuccessCriterion(id="SC-1", description="Evidence collection must not mutate app source.", status="pass")],
            feedback="unexpected pass",
        ),
    )
    monkeypatch.setattr(
        "harness.harness.run_verifier",
        lambda *args, **kwargs: VerificationResult(verdict="pass", experience_average=4.0, scores={"clarity": 4}, issues=[], feedback="unexpected pass"),
    )

    with pytest.raises(RuntimeError, match="Evidence collection modified workspace"):
        run_sprint("SPEC", contract, tmp_path, cfg, "http://localhost:3000")


def test_evidence_collection_allows_runtime_next_artifacts(tmp_path, monkeypatch):
    from harness.config import HarnessConfig
    from harness.harness import init, run_evidence_collection_bounded
    from harness.models.state import SprintContract, SuccessCriterion
    from harness.workspace import ensure_project_layout

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    init(tmp_path, cfg)
    contract = SprintContract(
        sprint_number=1,
        goal="Runtime artifacts",
        success_criteria=[SuccessCriterion(id="SC-1", description="Evidence may run the app server.")],
        evidence={"routes": ["/"]},
        confirmed=True,
    )
    paths = ensure_project_layout(tmp_path, cfg, sprint=1, iteration=1, run_id="runtime-test")

    def runtime_collect(project_dir, app_url, contract, paths):
        (paths["sprint_evidence"] / "evidence.json").write_text("{}")
        artifact = project_dir / "repos/orbits/.next/dev/cache/runtime.txt"
        artifact.parent.mkdir(parents=True, exist_ok=True)
        artifact.write_text("runtime")
        return {}

    monkeypatch.setattr("harness.harness.collect_evidence", runtime_collect)

    run_evidence_collection_bounded(tmp_path, "http://localhost:3000", contract, cfg, paths)


def test_evidence_collection_allows_same_content_source_touch(tmp_path, monkeypatch):
    from harness.config import HarnessConfig
    from harness.harness import init, run_evidence_collection_bounded
    from harness.models.state import SprintContract, SuccessCriterion
    from harness.workspace import ensure_project_layout

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    init(tmp_path, cfg)
    source = tmp_path / "repos/orbits/next-env.d.ts"
    source.write_text("/// <reference types=\"next\" />\n")
    contract = SprintContract(
        sprint_number=1,
        goal="Evidence snapshot content",
        success_criteria=[SuccessCriterion(id="SC-1", description="Evidence may touch stable generated framework files.")],
        evidence={"routes": ["/"]},
        confirmed=True,
    )
    paths = ensure_project_layout(tmp_path, cfg, sprint=1, iteration=1, run_id="same-content-test")

    def touch_same_content(project_dir, app_url, contract, paths):
        (paths["sprint_evidence"] / "evidence.json").write_text("{}")
        source.write_text("/// <reference types=\"next\" />\n")
        return {}

    monkeypatch.setattr("harness.harness.collect_evidence", touch_same_content)

    run_evidence_collection_bounded(tmp_path, "http://localhost:3000", contract, cfg, paths)


def test_evidence_collection_allows_next_env_runtime_rewrite(tmp_path, monkeypatch):
    from harness.config import HarnessConfig
    from harness.harness import init, run_evidence_collection_bounded
    from harness.models.state import SprintContract, SuccessCriterion
    from harness.workspace import ensure_project_layout

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    init(tmp_path, cfg)
    source = tmp_path / "repos/orbits/next-env.d.ts"
    source.write_text(
        '/// <reference types="next" />\n'
        '/// <reference types="next/image-types/global" />\n'
        'import "./.next/dev/types/routes.d.ts";\n'
    )
    contract = SprintContract(
        sprint_number=1,
        goal="Next runtime generated types",
        success_criteria=[SuccessCriterion(id="SC-1", description="Evidence may run Next dev and build commands.")],
        evidence={"routes": ["/"]},
        confirmed=True,
    )
    paths = ensure_project_layout(tmp_path, cfg, sprint=1, iteration=1, run_id="next-env-runtime-test")

    def rewrite_next_env(project_dir, app_url, contract, paths):
        (paths["sprint_evidence"] / "evidence.json").write_text("{}")
        source.write_text(
            '/// <reference types="next" />\n'
            '/// <reference types="next/image-types/global" />\n'
            'import "./.next/types/routes.d.ts";\n'
        )
        return {}

    monkeypatch.setattr("harness.harness.collect_evidence", rewrite_next_env)

    run_evidence_collection_bounded(tmp_path, "http://localhost:3000", contract, cfg, paths)


def test_run_sprint_blocks_evidence_collection_modifying_existing_ignored_protected_app_artifacts(tmp_path, monkeypatch):
    import pytest

    from harness.config import HarnessConfig
    from harness.harness import init, run_sprint
    from harness.models.state import EvalResult, SprintContract, SuccessCriterion, VerificationResult

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    init(tmp_path, cfg)
    existing_artifact = tmp_path / "repos/orbits/.env.local"
    existing_artifact.parent.mkdir(parents=True, exist_ok=True)
    existing_artifact.write_text("before")
    contract = SprintContract(
        sprint_number=1,
        goal="Evidence artifact mutation boundary",
        success_criteria=[SuccessCriterion(id="SC-1", description="Evidence collection does not mutate ignored protected app artifacts.")],
        evidence={"routes": ["/"]},
        confirmed=True,
    )

    def fake_run_generator(spec, contract, project_dir, handoff=None, strategic_framing=None, cfg=None):
        page = project_dir / "repos/orbits/app/page.jsx"
        page.parent.mkdir(parents=True, exist_ok=True)
        page.write_text("// generator")
        return "created page"

    def mutating_collect_evidence(project_dir, app_url, contract, paths):
        (paths["sprint_evidence"] / "evidence.json").write_text("{}")
        (project_dir / "repos/orbits/.env.local").write_text("after")
        return {}

    monkeypatch.setattr("harness.harness.run_generator", fake_run_generator)
    monkeypatch.setattr("harness.harness.self_assess", lambda *args, **kwargs: (True, []))
    monkeypatch.setattr("harness.harness.collect_evidence", mutating_collect_evidence)
    monkeypatch.setattr(
        "harness.harness.run_evaluator",
        lambda *args, **kwargs: EvalResult(
            verdict="pass",
            rubric_average=4.0,
            contract_results=[SuccessCriterion(id="SC-1", description="Evidence collection does not mutate ignored protected app artifacts.", status="pass")],
            feedback="unexpected pass",
        ),
    )
    monkeypatch.setattr(
        "harness.harness.run_verifier",
        lambda *args, **kwargs: VerificationResult(verdict="pass", experience_average=4.0, scores={"clarity": 4}, issues=[], feedback="unexpected pass"),
    )

    with pytest.raises(RuntimeError, match="Evidence collection modified workspace"):
        run_sprint("SPEC", contract, tmp_path, cfg, "http://localhost:3000")


def test_run_sprint_blocks_evidence_collection_writes_outside_current_iteration(tmp_path, monkeypatch):
    import pytest

    from harness.config import HarnessConfig
    from harness.harness import init, run_sprint
    from harness.models.state import EvalResult, SprintContract, SuccessCriterion, VerificationResult

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    init(tmp_path, cfg)
    contract = SprintContract(
        sprint_number=1,
        goal="Evidence artifact boundary",
        success_criteria=[SuccessCriterion(id="SC-1", description="Evidence artifacts stay in current iteration.")],
        evidence={"routes": ["/"]},
        confirmed=True,
    )

    def fake_run_generator(spec, contract, project_dir, handoff=None, strategic_framing=None, cfg=None):
        page = project_dir / "repos/orbits/app/page.jsx"
        page.parent.mkdir(parents=True, exist_ok=True)
        page.write_text("// generator")
        return "created page"

    def leaking_collect_evidence(project_dir, app_url, contract, paths):
        (paths["sprint_evidence"] / "evidence.json").write_text("{}")
        leak = project_dir / "harness-state/evidence/sprint-99/leak.txt"
        leak.parent.mkdir(parents=True, exist_ok=True)
        leak.write_text("wrong sprint")
        return {}

    monkeypatch.setattr("harness.harness.run_generator", fake_run_generator)
    monkeypatch.setattr("harness.harness.self_assess", lambda *args, **kwargs: (True, []))
    monkeypatch.setattr("harness.harness.collect_evidence", leaking_collect_evidence)
    monkeypatch.setattr(
        "harness.harness.run_evaluator",
        lambda *args, **kwargs: EvalResult(
            verdict="pass",
            rubric_average=4.0,
            contract_results=[SuccessCriterion(id="SC-1", description="Evidence artifacts stay in current iteration.", status="pass")],
            feedback="unexpected pass",
        ),
    )
    monkeypatch.setattr(
        "harness.harness.run_verifier",
        lambda *args, **kwargs: VerificationResult(verdict="pass", experience_average=4.0, scores={"clarity": 4}, issues=[], feedback="unexpected pass"),
    )

    with pytest.raises(RuntimeError, match="Evidence collection modified workspace"):
        run_sprint("SPEC", contract, tmp_path, cfg, "http://localhost:3000")


def test_run_sprint_blocks_evidence_collection_root_build_artifacts(tmp_path, monkeypatch):
    import pytest

    from harness.config import HarnessConfig
    from harness.harness import init, run_sprint
    from harness.models.state import EvalResult, SprintContract, SuccessCriterion, VerificationResult

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    init(tmp_path, cfg)
    contract = SprintContract(
        sprint_number=1,
        goal="Evidence root build boundary",
        success_criteria=[SuccessCriterion(id="SC-1", description="Evidence collection must not write root build artifacts.")],
        evidence={"routes": ["/"]},
        confirmed=True,
    )

    def fake_run_generator(spec, contract, project_dir, handoff=None, strategic_framing=None, cfg=None):
        page = project_dir / "repos/orbits/app/page.jsx"
        page.parent.mkdir(parents=True, exist_ok=True)
        page.write_text("// generator")
        return "created page"

    def leaking_collect_evidence(project_dir, app_url, contract, paths):
        (paths["sprint_evidence"] / "evidence.json").write_text("{}")
        leak = project_dir / "build/evidence-leak.txt"
        leak.parent.mkdir(parents=True, exist_ok=True)
        leak.write_text("root build evidence")
        return {}

    monkeypatch.setattr("harness.harness.run_generator", fake_run_generator)
    monkeypatch.setattr("harness.harness.self_assess", lambda *args, **kwargs: (True, []))
    monkeypatch.setattr("harness.harness.collect_evidence", leaking_collect_evidence)
    monkeypatch.setattr(
        "harness.harness.run_evaluator",
        lambda *args, **kwargs: EvalResult(
            verdict="pass",
            rubric_average=4.0,
            contract_results=[SuccessCriterion(id="SC-1", description="Evidence collection must not write root build artifacts.", status="pass")],
            feedback="unexpected pass",
        ),
    )
    monkeypatch.setattr(
        "harness.harness.run_verifier",
        lambda *args, **kwargs: VerificationResult(verdict="pass", experience_average=4.0, scores={"clarity": 4}, issues=[], feedback="unexpected pass"),
    )

    with pytest.raises(RuntimeError, match="Evidence collection modified workspace"):
        run_sprint("SPEC", contract, tmp_path, cfg, "http://localhost:3000")


def test_run_sprint_blocks_verifier_artifact_write_under_current_iteration(tmp_path, monkeypatch):
    import pytest

    from harness.config import HarnessConfig
    from harness.harness import init, run_sprint
    from harness.models.state import EvalResult, SprintContract, SuccessCriterion, VerificationResult

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    init(tmp_path, cfg)
    contract = SprintContract(
        sprint_number=1,
        goal="Verifier artifact",
        success_criteria=[SuccessCriterion(id="SC-1", description="Verifier must not write supplemental artifacts.")],
        evidence={"routes": ["/"]},
        confirmed=True,
    )

    def fake_run_generator(spec, contract, project_dir, handoff=None, strategic_framing=None, cfg=None):
        page = project_dir / "repos/orbits/app/page.jsx"
        page.parent.mkdir(parents=True, exist_ok=True)
        page.write_text("// generator")
        return "created page"

    def fake_collect_evidence(project_dir, app_url, contract, paths):
        (paths["sprint_evidence"] / "evidence.json").write_text("{}")
        return {}

    def fake_run_verifier(*args, **kwargs):
        artifact_dir = kwargs["evidence_dir"] / "artifacts"
        artifact_dir.mkdir(parents=True, exist_ok=True)
        (artifact_dir / "verifier-note.txt").write_text("ok")
        return VerificationResult(verdict="pass", experience_average=4.0, scores={"clarity": 4}, issues=[], feedback="ok")

    monkeypatch.setattr("harness.harness.run_generator", fake_run_generator)
    monkeypatch.setattr("harness.harness.self_assess", lambda *args, **kwargs: (True, []))
    monkeypatch.setattr("harness.harness.collect_evidence", fake_collect_evidence)
    monkeypatch.setattr(
        "harness.harness.run_evaluator",
        lambda *args, **kwargs: EvalResult(
            verdict="pass",
            rubric_average=4.0,
            contract_results=[SuccessCriterion(id="SC-1", description="Verifier must not write supplemental artifacts.", status="pass")],
            feedback="ok",
        ),
    )
    monkeypatch.setattr("harness.harness.run_verifier", fake_run_verifier)

    with pytest.raises(RuntimeError, match="Verifier wrote outside allowed artifacts"):
        run_sprint("SPEC", contract, tmp_path, cfg, "http://localhost:3000")


def test_run_sprint_records_evaluator_crash_as_failed_eval_result(tmp_path, monkeypatch):
    from harness.config import HarnessConfig
    from harness.harness import init, run_sprint
    from harness.models.state import EvalResult, SprintContract, SuccessCriterion, VerificationResult

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.loop.max_iterations = 1
    init(tmp_path, cfg)
    contract = SprintContract(
        sprint_number=1,
        goal="Evaluator crash handling",
        success_criteria=[SuccessCriterion(id="SC-1", description="Evaluator crash is recorded.")],
        evidence={"routes": ["/"]},
        confirmed=True,
    )

    def fake_run_generator(spec, contract, project_dir, handoff=None, strategic_framing=None, cfg=None):
        page = project_dir / "repos/orbits/app/page.jsx"
        page.parent.mkdir(parents=True, exist_ok=True)
        page.write_text("// generator")
        return "created page"

    def fake_collect_evidence(project_dir, app_url, contract, paths):
        (paths["sprint_evidence"] / "evidence.json").write_text("{}")
        return {}

    def crashing_evaluator(*args, **kwargs):
        raise RuntimeError("malformed evaluator JSON")

    monkeypatch.setattr("harness.harness.run_generator", fake_run_generator)
    monkeypatch.setattr("harness.harness.self_assess", lambda *args, **kwargs: (True, []))
    monkeypatch.setattr("harness.harness.collect_evidence", fake_collect_evidence)
    monkeypatch.setattr("harness.harness.run_evaluator", crashing_evaluator)
    monkeypatch.setattr(
        "harness.harness.run_verifier",
        lambda *args, **kwargs: VerificationResult(verdict="pass", experience_average=4.0, scores={"clarity": 4}, issues=[], feedback="ok"),
    )

    eval_result, verify_result, _handoff = run_sprint("SPEC", contract, tmp_path, cfg, "http://localhost:3000")

    saved = EvalResult.load(_single_iteration_root(tmp_path) / "eval.json")
    assert eval_result.verdict == "fail"
    assert verify_result.verdict == "pass"
    assert saved.verdict == "fail"
    assert saved.contract_results[0].status == "fail"
    assert "Evaluator failed" in saved.feedback
    assert "malformed evaluator JSON" in saved.feedback


def test_run_sprint_records_evidence_collection_crash_as_failed_iteration(tmp_path, monkeypatch):
    import json

    from harness.config import HarnessConfig
    from harness.harness import init, run_sprint
    from harness.models.state import EvalResult, SprintContract, SuccessCriterion, VerificationResult

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.loop.max_iterations = 1
    init(tmp_path, cfg)
    contract = SprintContract(
        sprint_number=1,
        goal="Evidence crash handling",
        success_criteria=[SuccessCriterion(id="SC-1", description="Evidence crash is recorded.")],
        evidence={"routes": ["/"]},
        confirmed=True,
    )

    def fake_run_generator(spec, contract, project_dir, handoff=None, strategic_framing=None, cfg=None):
        page = project_dir / "repos/orbits/app/page.jsx"
        page.parent.mkdir(parents=True, exist_ok=True)
        page.write_text("// generator")
        return "created page"

    def crashing_collect_evidence(*args, **kwargs):
        raise RuntimeError("browser collector exploded")

    monkeypatch.setattr("harness.harness.run_generator", fake_run_generator)
    monkeypatch.setattr("harness.harness.self_assess", lambda *args, **kwargs: (True, []))
    monkeypatch.setattr("harness.harness.collect_evidence", crashing_collect_evidence)
    monkeypatch.setattr(
        "harness.harness.run_evaluator",
        lambda *args, **kwargs: EvalResult(
            verdict="pass",
            rubric_average=4.0,
            contract_results=[SuccessCriterion(id="SC-1", description="Evidence crash is recorded.", status="pass")],
            feedback="unexpected",
        ),
    )
    monkeypatch.setattr(
        "harness.harness.run_verifier",
        lambda *args, **kwargs: VerificationResult(verdict="pass", experience_average=4.0, scores={"clarity": 4}, issues=[], feedback="unexpected"),
    )

    eval_result, verify_result, _handoff = run_sprint("SPEC", contract, tmp_path, cfg, "http://localhost:3000")

    iteration_root = _single_iteration_root(tmp_path)
    evidence = json.loads((iteration_root / "evidence.json").read_text())
    saved_eval = EvalResult.load(iteration_root / "eval.json")
    saved_verify = VerificationResult.load(iteration_root / "verification.json")
    assert evidence["collection_failed"] is True
    assert "browser collector exploded" in evidence["error"]
    assert eval_result.verdict == "fail"
    assert verify_result.verdict == "fail"
    assert saved_eval.verdict == "fail"
    assert saved_verify.verdict == "fail"
    assert "Evidence collection failed" in saved_eval.feedback
    assert "Evidence collection failed" in saved_verify.feedback


def test_run_sprint_records_verifier_crash_as_failed_verification_result(tmp_path, monkeypatch):
    from harness.config import HarnessConfig
    from harness.harness import init, run_sprint
    from harness.models.state import EvalResult, SprintContract, SuccessCriterion, VerificationResult

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.loop.max_iterations = 1
    init(tmp_path, cfg)
    contract = SprintContract(
        sprint_number=1,
        goal="Verifier crash handling",
        success_criteria=[SuccessCriterion(id="SC-1", description="Verifier crash is recorded.")],
        evidence={"routes": ["/"]},
        confirmed=True,
    )

    def fake_run_generator(spec, contract, project_dir, handoff=None, strategic_framing=None, cfg=None):
        page = project_dir / "repos/orbits/app/page.jsx"
        page.parent.mkdir(parents=True, exist_ok=True)
        page.write_text("// generator")
        return "created page"

    def fake_collect_evidence(project_dir, app_url, contract, paths):
        (paths["sprint_evidence"] / "evidence.json").write_text("{}")
        return {}

    def crashing_verifier(*args, **kwargs):
        raise RuntimeError("verifier timed out")

    monkeypatch.setattr("harness.harness.run_generator", fake_run_generator)
    monkeypatch.setattr("harness.harness.self_assess", lambda *args, **kwargs: (True, []))
    monkeypatch.setattr("harness.harness.collect_evidence", fake_collect_evidence)
    monkeypatch.setattr(
        "harness.harness.run_evaluator",
        lambda *args, **kwargs: EvalResult(
            verdict="pass",
            rubric_average=4.0,
            contract_results=[SuccessCriterion(id="SC-1", description="Verifier crash is recorded.", status="pass")],
            feedback="ok",
        ),
    )
    monkeypatch.setattr("harness.harness.run_verifier", crashing_verifier)

    eval_result, verify_result, _handoff = run_sprint("SPEC", contract, tmp_path, cfg, "http://localhost:3000")

    saved = VerificationResult.load(_single_iteration_root(tmp_path) / "verification.json")
    assert eval_result.verdict == "pass"
    assert verify_result.verdict == "fail"
    assert saved.verdict == "fail"
    assert saved.experience_average == 0.0
    assert saved.issues[0].severity == "critical"
    assert "Verifier failed" in saved.feedback
    assert "verifier timed out" in saved.feedback


def test_retention_cleans_tmp_and_prunes_old_logs(tmp_path):
    from harness.config import HarnessConfig
    from harness.workspace import apply_retention

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.workspace.keep_last_runs = 2
    tmp_file = tmp_path / "harness-state/tmp/stale.txt"
    tmp_file.parent.mkdir(parents=True)
    tmp_file.write_text("stale")
    log_dir = tmp_path / "harness-logs"
    log_dir.mkdir()
    for index in range(4):
        (log_dir / f"run-20260624-00000{index}.log").write_text(str(index))
    runs_dir = tmp_path / "harness-state/runs"
    for run_id in ["20260624-000001", "20260624-000002", "20260624-000003"]:
        run_root = runs_dir / run_id / "sprint-1/iter-1"
        run_root.mkdir(parents=True)
        (run_root / "evidence.json").write_text("{}")

    apply_retention(tmp_path, cfg)

    assert not tmp_file.exists()
    assert sorted(path.name for path in log_dir.glob("run-*.log")) == [
        "run-20260624-000002.log",
        "run-20260624-000003.log",
    ]
    assert sorted(path.name for path in runs_dir.iterdir()) == [
        "20260624-000002",
        "20260624-000003",
    ]


def test_clean_tmp_tolerates_tmp_removed_by_parallel_harness_command(tmp_path, monkeypatch):
    from harness.config import HarnessConfig
    from harness.workspace import clean_tmp

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    tmp_file = tmp_path / "harness-state/tmp/stale.txt"
    tmp_file.parent.mkdir(parents=True)
    tmp_file.write_text("stale")

    def racy_rmtree(path):
        raise FileNotFoundError(path)

    monkeypatch.setattr("harness.workspace.shutil.rmtree", racy_rmtree)

    clean_tmp(tmp_path, cfg)

    assert (tmp_path / "harness-state/tmp").is_dir()


def test_retention_prunes_old_evidence_iterations_per_sprint(tmp_path):
    from harness.config import HarnessConfig
    from harness.workspace import apply_retention

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.workspace.keep_last_evidence_per_sprint = 2
    sprint_dir = tmp_path / "harness-state/evidence/sprint-1"
    for index in range(1, 5):
        iter_dir = sprint_dir / f"iter-{index}"
        iter_dir.mkdir(parents=True)
        (iter_dir / "evidence.json").write_text(str(index))
    (sprint_dir / "manual-note.txt").write_text("keep")

    apply_retention(tmp_path, cfg)

    assert sorted(path.name for path in sprint_dir.iterdir()) == ["iter-3", "iter-4", "manual-note.txt"]


def test_log_setup_uses_configured_log_root(tmp_path):
    from harness import log

    log.setup(tmp_path, log_root="custom-logs")

    assert list((tmp_path / "custom-logs").glob("run-*.log"))
    assert not (tmp_path / "harness-logs").exists()


def test_run_recorded_captures_timeout_as_command_evidence(tmp_path, monkeypatch):
    import json
    import subprocess

    from harness.evidence import run_recorded

    def fake_run(*args, **kwargs):
        raise subprocess.TimeoutExpired(
            cmd=args[0],
            timeout=kwargs["timeout"],
            output="partial stdout",
            stderr="partial stderr",
        )

    monkeypatch.setattr("harness.evidence.subprocess.run", fake_run)

    record = run_recorded(["npm", "test"], tmp_path, tmp_path / "commands", "test", timeout=1)

    assert record["timed_out"] is True
    assert record["returncode"] is None
    assert Path(record["stdout_path"]).read_text() == "partial stdout"
    assert Path(record["stderr_path"]).read_text() == "partial stderr"
    saved = json.loads((tmp_path / "commands/test.json").read_text())
    assert saved["timed_out"] is True


def test_run_recorded_captures_missing_executable_as_command_evidence(tmp_path, monkeypatch):
    import json

    from harness.evidence import run_recorded

    def fake_run(*args, **kwargs):
        raise FileNotFoundError("No such file or directory: 'npm'")

    monkeypatch.setattr("harness.evidence.subprocess.run", fake_run)

    record = run_recorded(["npm", "test"], tmp_path, tmp_path / "commands", "test")

    assert record["missing_executable"] is True
    assert record["returncode"] == 127
    assert "No such file or directory" in Path(record["stderr_path"]).read_text()
    saved = json.loads((tmp_path / "commands/test.json").read_text())
    assert saved["missing_executable"] is True


def test_collect_evidence_rejects_unsafe_declared_commands(tmp_path, monkeypatch):
    from harness.config import HarnessConfig
    from harness.evidence import collect_evidence
    from harness.harness import init
    from harness.models.state import SprintContract, SuccessCriterion
    from harness.workspace import ensure_project_layout

    server = ThreadingHTTPServer(("127.0.0.1", 0), _EvidenceHandler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    app_url = f"http://127.0.0.1:{server.server_port}"
    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    init(tmp_path, cfg)
    paths = ensure_project_layout(tmp_path, cfg, sprint=1)

    def fail_if_subprocess_runs(*args, **kwargs):
        raise AssertionError("unsafe command should not run")

    monkeypatch.setattr("harness.evidence.subprocess.run", fail_if_subprocess_runs)
    contract = SprintContract(
        sprint_number=1,
        goal="Command safety",
        success_criteria=[SuccessCriterion(id="SC-1", description="Unsafe command is rejected.")],
        evidence={
            "routes": ["/"],
            "commands": [
                {"name": "shell", "cmd": ["bash", "-lc", "cat ../../.env"]},
                {"name": "node-eval", "cmd": ["node", "-e", "require('fs').readFileSync('../../.env')"]},
                {"name": "npx-tool", "cmd": ["npx", "some-tool"]},
                {"name": "dev-server", "cmd": ["npm", "run", "dev"]},
            ],
        },
    )

    def fake_browser_collector(url, paths, route_key):
        return {
            "url": url,
            "route": route_key,
            "status": 200,
            "overflow": {"horizontal": False},
            "console": [],
            "request_failures": [],
        }

    try:
        evidence = collect_evidence(tmp_path, app_url, contract, paths, browser_collector=fake_browser_collector)
    finally:
        server.shutdown()
        thread.join(timeout=2)

    assert evidence["commands"]["shell"]["rejected"] is True
    assert "not allowed" in evidence["commands"]["shell"]["error"]
    assert evidence["commands"]["node-eval"]["rejected"] is True
    assert "not allowed" in evidence["commands"]["node-eval"]["error"]
    assert evidence["commands"]["npx-tool"]["rejected"] is True
    assert "not allowed" in evidence["commands"]["npx-tool"]["error"]
    assert evidence["commands"]["dev-server"]["rejected"] is True
    assert "one-shot" in evidence["commands"]["dev-server"]["error"]


def test_collect_evidence_rejects_invalid_command_entries(tmp_path):
    from harness.config import HarnessConfig
    from harness.evidence import collect_evidence
    from harness.harness import init
    from harness.models.state import SprintContract, SuccessCriterion
    from harness.workspace import ensure_project_layout

    server = ThreadingHTTPServer(("127.0.0.1", 0), _EvidenceHandler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    app_url = f"http://127.0.0.1:{server.server_port}"
    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    init(tmp_path, cfg)
    paths = ensure_project_layout(tmp_path, cfg, sprint=1)
    contract = SprintContract(
        sprint_number=1,
        goal="Command shape safety",
        success_criteria=[SuccessCriterion(id="SC-1", description="Malformed command evidence is rejected.")],
        evidence={"routes": ["/"], "commands": ["npm test"]},
    )

    def fake_browser_collector(url, paths, route_key):
        return {
            "url": url,
            "route": route_key,
            "status": 200,
            "overflow": {"horizontal": False},
            "console": [],
            "request_failures": [],
        }

    try:
        evidence = collect_evidence(tmp_path, app_url, contract, paths, browser_collector=fake_browser_collector)
    finally:
        server.shutdown()
        thread.join(timeout=2)

    assert evidence["commands"]["command-1"]["rejected"] is True
    assert "Invalid command entry" in evidence["commands"]["command-1"]["error"]


def test_collect_evidence_rejects_external_routes_and_api_paths(tmp_path, monkeypatch):
    from harness.config import HarnessConfig
    from harness.evidence import collect_evidence
    from harness.harness import init
    from harness.models.state import SprintContract, SuccessCriterion
    from harness.workspace import ensure_project_layout

    def fail_if_urlopen_runs(*args, **kwargs):
        raise AssertionError("external route/api evidence should not be requested")

    monkeypatch.setattr("harness.evidence.urlopen", fail_if_urlopen_runs)
    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    init(tmp_path, cfg)
    paths = ensure_project_layout(tmp_path, cfg, sprint=1)
    contract = SprintContract(
        sprint_number=1,
        goal="Route and API safety",
        success_criteria=[SuccessCriterion(id="SC-1", description="External evidence targets are rejected.")],
        evidence={
            "routes": ["https://example.com/", "/../admin", "/app/events/:id"],
            "api": [
                {"name": "external", "method": "GET", "path": "https://example.com/api"},
                {"name": "traversal", "method": "GET", "path": "/api/../secret"},
                {"name": "template", "method": "GET", "path": "/api/events/:id"},
            ],
        },
    )

    def fail_browser_collector(url, paths, route_key):
        raise AssertionError("browser collector should not run for rejected route")

    evidence = collect_evidence(tmp_path, "http://127.0.0.1:3000", contract, paths, browser_collector=fail_browser_collector)

    route_record = evidence["navigation"]["https://example.com/"]
    assert route_record["rejected"] is True
    assert "app-relative" in route_record["error"]
    traversal_route_record = evidence["navigation"]["/../admin"]
    assert traversal_route_record["rejected"] is True
    assert "traversal" in traversal_route_record["error"]
    template_route_record = evidence["navigation"]["/app/events/:id"]
    assert template_route_record["rejected"] is True
    assert "concrete" in template_route_record["error"]
    api_record = evidence["api"]["external"]
    assert api_record["rejected"] is True
    assert "app-relative" in api_record["error"]
    traversal_api_record = evidence["api"]["traversal"]
    assert traversal_api_record["rejected"] is True
    assert "traversal" in traversal_api_record["error"]
    template_api_record = evidence["api"]["template"]
    assert template_api_record["rejected"] is True
    assert "concrete" in template_api_record["error"]


def test_collect_evidence_accepts_query_routes_as_distinct_browser_targets(tmp_path):
    from harness.config import HarnessConfig
    from harness.evidence import collect_evidence
    from harness.harness import init
    from harness.models.state import SprintContract, SuccessCriterion
    from harness.workspace import ensure_project_layout

    server = ThreadingHTTPServer(("127.0.0.1", 0), _EvidenceHandler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    app_url = f"http://127.0.0.1:{server.server_port}"
    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    init(tmp_path, cfg)
    paths = ensure_project_layout(tmp_path, cfg, sprint=1)
    contract = SprintContract(
        sprint_number=1,
        goal="Route state evidence",
        success_criteria=[SuccessCriterion(id="SC-1", description="Scenario routes are captured.")],
        evidence={"routes": ["/app/contacts", "/app/contacts?scenario=empty"]},
    )
    captured: list[tuple[str, str]] = []

    def fake_browser_collector(url, paths, route_key):
        captured.append((route_key, url))
        return {
            "url": url,
            "route": route_key,
            "status": 200,
            "overflow": {"horizontal": False},
            "console": [],
            "request_failures": [],
        }

    try:
        evidence = collect_evidence(tmp_path, app_url, contract, paths, browser_collector=fake_browser_collector)
    finally:
        server.shutdown()
        thread.join(timeout=2)

    assert "/app/contacts" in evidence["browser"]
    assert "/app/contacts?scenario=empty" in evidence["browser"]
    assert evidence["navigation"]["/app/contacts?scenario=empty"]["status"] == 200
    assert captured == [
        ("/app/contacts", f"{app_url}/app/contacts"),
        ("/app/contacts?scenario=empty", f"{app_url}/app/contacts?scenario=empty"),
    ]


def test_collect_evidence_rejects_invalid_api_entries(tmp_path):
    from harness.config import HarnessConfig
    from harness.evidence import collect_evidence
    from harness.harness import init
    from harness.models.state import SprintContract, SuccessCriterion
    from harness.workspace import ensure_project_layout

    server = ThreadingHTTPServer(("127.0.0.1", 0), _EvidenceHandler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    app_url = f"http://127.0.0.1:{server.server_port}"
    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    init(tmp_path, cfg)
    paths = ensure_project_layout(tmp_path, cfg, sprint=1)
    contract = SprintContract(
        sprint_number=1,
        goal="API shape safety",
        success_criteria=[SuccessCriterion(id="SC-1", description="Malformed API evidence is rejected.")],
        evidence={"routes": ["/"], "api": ["/api/health"]},
    )

    def fake_browser_collector(url, paths, route_key):
        return {
            "url": url,
            "route": route_key,
            "status": 200,
            "overflow": {"horizontal": False},
            "console": [],
            "request_failures": [],
        }

    try:
        evidence = collect_evidence(tmp_path, app_url, contract, paths, browser_collector=fake_browser_collector)
    finally:
        server.shutdown()
        thread.join(timeout=2)

    assert evidence["api"]["api-1"]["rejected"] is True
    assert "Invalid API entry" in evidence["api"]["api-1"]["error"]


def test_collect_evidence_rejects_invalid_api_probe_fields(tmp_path, monkeypatch):
    from harness.config import HarnessConfig
    from harness.evidence import collect_evidence
    from harness.harness import init
    from harness.models.state import SprintContract, SuccessCriterion
    from harness.workspace import ensure_project_layout

    def fail_if_urlopen_runs(*args, **kwargs):
        raise AssertionError("invalid API probes should not be requested")

    monkeypatch.setattr("harness.evidence.urlopen", fail_if_urlopen_runs)
    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    init(tmp_path, cfg)
    paths = ensure_project_layout(tmp_path, cfg, sprint=1)
    contract = SprintContract(
        sprint_number=1,
        goal="API field safety",
        success_criteria=[SuccessCriterion(id="SC-1", description="Invalid API probe fields are rejected.")],
        evidence={
            "routes": [],
            "api": [
                {"name": "bad-method", "method": "TRACE", "path": "/api/health"},
                {"name": "bad-status", "method": "GET", "path": "/api/health", "expectStatus": "ok"},
                {"name": "fractional-status", "method": "GET", "path": "/api/health", "expectStatus": 200.5},
                {"name": "bad-body", "method": "POST", "path": "/api/health", "body": {"bad": {1, 2}}},
            ],
        },
    )

    evidence = collect_evidence(tmp_path, "http://127.0.0.1:3000", contract, paths)

    assert evidence["api"]["bad-method"]["rejected"] is True
    assert "method" in evidence["api"]["bad-method"]["error"]
    assert evidence["api"]["bad-status"]["rejected"] is True
    assert "expected status" in evidence["api"]["bad-status"]["error"]
    assert evidence["api"]["fractional-status"]["rejected"] is True
    assert "expected status" in evidence["api"]["fractional-status"]["error"]
    assert evidence["api"]["bad-body"]["rejected"] is True
    assert "JSON" in evidence["api"]["bad-body"]["error"]


def test_collect_evidence_respects_explicit_empty_routes_for_api_only_sprint(tmp_path, monkeypatch):
    from harness.config import HarnessConfig
    from harness.evidence import collect_evidence
    from harness.harness import init
    from harness.models.state import SprintContract, SuccessCriterion
    from harness.workspace import ensure_project_layout

    server = ThreadingHTTPServer(("127.0.0.1", 0), _EvidenceHandler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    app_url = f"http://127.0.0.1:{server.server_port}"
    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    init(tmp_path, cfg)
    paths = ensure_project_layout(tmp_path, cfg, sprint=1)
    contract = SprintContract(
        sprint_number=1,
        goal="API only evidence",
        success_criteria=[SuccessCriterion(id="SC-1", description="API probe runs without browser route evidence.")],
        evidence={
            "routes": [],
            "api": [{"name": "health", "method": "GET", "path": "/api/health", "expectStatus": 200}],
        },
    )

    def fail_browser_collector(url, paths, route_key):
        raise AssertionError("browser collector should not run when routes is explicitly empty")

    try:
        evidence = collect_evidence(tmp_path, app_url, contract, paths, browser_collector=fail_browser_collector)
    finally:
        server.shutdown()
        thread.join(timeout=2)

    assert evidence["navigation"] == {}
    assert evidence["browser"] == {}
    assert evidence["axe"] == {}
    assert evidence["lighthouse"] == {}
    assert evidence["api"]["health"]["passed"] is True


class _EvidenceHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/api/health":
            self.send_response(200)
            self.send_header("content-type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"ok": true}')
            return
        if self.path == "/api/error":
            self.send_response(500)
            self.send_header("content-type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"success":false,"error":{"code":"INTERNAL_ERROR"}}')
            return
        self.send_response(200)
        self.send_header("content-type", "text/html")
        self.end_headers()
        self.wfile.write(
            b"""<!doctype html>
<html>
  <head><title>Orbit Entry</title></head>
  <body>
    <h1>Join event</h1>
    <form><input name=\"eventCode\" /><button>Continue</button></form>
    <a href=\"/register\">Register</a>
  </body>
</html>"""
        )

    def log_message(self, format, *args):
        return


def test_collect_evidence_records_api_probe_and_html_summary(tmp_path):
    from harness.config import HarnessConfig
    from harness.evidence import collect_evidence
    from harness.harness import init
    from harness.models.state import SprintContract, SuccessCriterion
    from harness.workspace import ensure_project_layout

    server = ThreadingHTTPServer(("127.0.0.1", 0), _EvidenceHandler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    app_url = f"http://127.0.0.1:{server.server_port}"
    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    init(tmp_path, cfg)
    paths = ensure_project_layout(tmp_path, cfg, sprint=1)
    contract = SprintContract(
        sprint_number=1,
        goal="Evidence",
        success_criteria=[SuccessCriterion(id="SC-1", description="Entry page can be inspected.")],
        evidence={
            "routes": ["/"],
            "api": [{"name": "health", "method": "GET", "path": "/api/health", "expectStatus": 200}],
            "source_files": ["missing.jsx"],
        },
    )

    try:
        evidence = collect_evidence(tmp_path, app_url, contract, paths)
    finally:
        server.shutdown()
        thread.join(timeout=2)

    assert evidence["api"]["health"]["status"] == 200
    assert evidence["api"]["health"]["passed"] is True
    assert evidence["navigation"]["/"]["html_summary"]["title"] == "Orbit Entry"
    assert evidence["navigation"]["/"]["html_summary"]["buttons"] == ["Continue"]
    assert evidence["navigation"]["/"]["html_summary"]["forms_count"] == 1
    assert evidence["navigation"]["/"]["html_summary"]["input_names"] == ["eventCode"]
    assert evidence["source_files"]["missing.jsx"]["missing"] is True


def test_collect_evidence_reads_expected_http_error_response_body(tmp_path):
    from harness.config import HarnessConfig
    from harness.evidence import collect_evidence
    from harness.harness import init
    from harness.models.state import SprintContract, SuccessCriterion
    from harness.workspace import ensure_project_layout

    server = ThreadingHTTPServer(("127.0.0.1", 0), _EvidenceHandler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    app_url = f"http://127.0.0.1:{server.server_port}"
    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    init(tmp_path, cfg)
    paths = ensure_project_layout(tmp_path, cfg, sprint=1)
    contract = SprintContract(
        sprint_number=1,
        goal="API evidence",
        success_criteria=[SuccessCriterion(id="SC-1", description="Expected API failures are captured.")],
        evidence={
            "routes": [],
            "api": [{"name": "error", "method": "GET", "path": "/api/error", "expectStatus": 500}],
        },
    )

    try:
        evidence = collect_evidence(tmp_path, app_url, contract, paths)
    finally:
        server.shutdown()
        thread.join(timeout=2)

    assert evidence["api"]["error"]["status"] == 500
    assert evidence["api"]["error"]["passed"] is True
    assert evidence["api"]["error"]["response_excerpt"] == '{"success":false,"error":{"code":"INTERNAL_ERROR"}}'
    assert "error" not in evidence["api"]["error"]


def test_collect_evidence_rejects_source_files_outside_app_root(tmp_path):
    from harness.config import HarnessConfig
    from harness.evidence import collect_evidence
    from harness.harness import init
    from harness.models.state import SprintContract, SuccessCriterion
    from harness.workspace import ensure_project_layout

    server = ThreadingHTTPServer(("127.0.0.1", 0), _EvidenceHandler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    app_url = f"http://127.0.0.1:{server.server_port}"
    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    init(tmp_path, cfg)
    (tmp_path / "secret.txt").write_text("do not copy")
    paths = ensure_project_layout(tmp_path, cfg, sprint=1)
    contract = SprintContract(
        sprint_number=1,
        goal="Source safety",
        success_criteria=[SuccessCriterion(id="SC-1", description="Evidence source paths stay in app root.")],
        evidence={
            "routes": ["/"],
            "source_files": [
                "../../secret.txt",
                "repos/orbits/package.json",
                "features/account/tests/*.test.js",
            ],
        },
    )

    def fake_browser_collector(url, paths, route_key):
        return {
            "url": url,
            "route": route_key,
            "status": 200,
            "overflow": {"horizontal": False},
            "console": [],
            "request_failures": [],
        }

    try:
        evidence = collect_evidence(tmp_path, app_url, contract, paths, browser_collector=fake_browser_collector)
    finally:
        server.shutdown()
        thread.join(timeout=2)

    record = evidence["source_files"]["../../secret.txt"]
    assert record["rejected"] is True
    assert "outside app root" in record["error"]
    prefixed = evidence["source_files"]["repos/orbits/package.json"]
    assert prefixed["rejected"] is True
    assert "app-relative" in prefixed["error"]
    globbed = evidence["source_files"]["features/account/tests/*.test.js"]
    assert globbed["rejected"] is True
    assert "concrete" in globbed["error"]
    assert not (paths["source"] / "../../secret.txt").resolve().exists()


def test_collect_evidence_allows_next_dynamic_segment_source_file_names(tmp_path):
    from harness.config import HarnessConfig
    from harness.evidence import collect_evidence
    from harness.harness import init
    from harness.models.state import SprintContract, SuccessCriterion
    from harness.workspace import ensure_project_layout

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    init(tmp_path, cfg)
    paths = ensure_project_layout(tmp_path, cfg, sprint=1)
    source = "app/(app)/events/[id]/page.js"
    source_path = tmp_path / "repos/orbits" / source
    source_path.parent.mkdir(parents=True)
    source_path.write_text("export default function EventPage() { return null; }")
    contract = SprintContract(
        sprint_number=1,
        goal="Dynamic source file evidence",
        success_criteria=[SuccessCriterion(id="SC-1", description="Source evidence records a concrete route file.")],
        evidence={"routes": [], "source_files": [source]},
    )

    evidence = collect_evidence(tmp_path, "http://127.0.0.1:3000", contract, paths)

    record = evidence["source_files"][source]
    assert record["missing"] is False
    assert Path(record["artifact_path"]).exists()
    assert "rejected" not in record


def test_collect_evidence_records_browser_artifact_with_injected_collector(tmp_path):
    from harness.config import HarnessConfig
    from harness.evidence import collect_evidence
    from harness.harness import init
    from harness.models.state import SprintContract, SuccessCriterion
    from harness.workspace import ensure_project_layout

    server = ThreadingHTTPServer(("127.0.0.1", 0), _EvidenceHandler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    app_url = f"http://127.0.0.1:{server.server_port}"
    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    init(tmp_path, cfg)
    paths = ensure_project_layout(tmp_path, cfg, sprint=1)
    contract = SprintContract(
        sprint_number=1,
        goal="Browser evidence",
        success_criteria=[SuccessCriterion(id="SC-1", description="Entry page renders in a browser.")],
        evidence={"routes": ["/"]},
    )

    def fake_browser_collector(url, paths, route_key):
        screenshot = paths["screenshots"] / "root.png"
        browser_json = paths["browser"] / "root.json"
        screenshot.write_bytes(b"png")
        record = {
            "url": url,
            "route": route_key,
            "status": 200,
            "screenshot_path": str(screenshot),
            "viewport": {"width": 1440, "height": 900},
            "overflow": {"horizontal": False, "scroll_width": 1440, "client_width": 1440},
            "console": [],
            "request_failures": [],
            "artifact_path": str(browser_json),
        }
        browser_json.write_text("{}")
        return record

    try:
        evidence = collect_evidence(tmp_path, app_url, contract, paths, browser_collector=fake_browser_collector)
    finally:
        server.shutdown()
        thread.join(timeout=2)

    browser_record = evidence["browser"]["/"]
    assert browser_record["screenshot_path"].endswith("root.png")
    assert browser_record["viewport"]["width"] == 1440
    assert browser_record["overflow"]["horizontal"] is False
    assert browser_record["console"] == []
    assert Path(browser_record["screenshot_path"]).exists()


def test_browser_viewport_snapshot_helper_records_mobile_tablet_and_desktop(tmp_path):
    from harness.evidence import capture_viewport_snapshots

    paths = {"screenshots": tmp_path / "screenshots"}

    class FakePage:
        def __init__(self):
            self.current_width = 0
            self.current_height = 0
            self.viewport_calls = []
            self.screenshot_paths = []

        def set_viewport_size(self, viewport):
            self.current_width = viewport["width"]
            self.current_height = viewport["height"]
            self.viewport_calls.append((self.current_width, self.current_height))

        def screenshot(self, path, full_page):
            self.screenshot_paths.append((path, full_page))
            Path(path).write_bytes(f"{self.current_width}x{self.current_height}".encode())

        def evaluate(self, script):
            return {
                "title": "Orbit Entry",
                "text": "Join event",
                "buttons": ["Continue"],
                "inputs": [],
                "links": [],
                "viewport": {"width": self.current_width, "height": self.current_height},
                "overflow": {
                    "horizontal": self.current_width == 375,
                    "scroll_width": 420 if self.current_width == 375 else self.current_width,
                    "client_width": self.current_width,
                },
            }

    page = FakePage()

    snapshots = capture_viewport_snapshots(page, paths, "root")

    assert page.viewport_calls == [(375, 812), (768, 1024), (1440, 900)]
    assert [snapshot["name"] for snapshot in snapshots] == ["mobile", "tablet", "desktop"]
    assert snapshots[0]["overflow"]["horizontal"] is True
    assert snapshots[2]["snapshot"]["viewport"]["width"] == 1440
    assert all(Path(snapshot["screenshot_path"]).exists() for snapshot in snapshots)
    assert all(full_page for _path, full_page in page.screenshot_paths)


def test_accessibility_smoke_uses_browser_headings_when_navigation_html_is_streamed(tmp_path):
    from harness.evidence import collect_accessibility_smoke_evidence

    paths = {"axe": tmp_path / "axe"}
    navigation_record = {
        "body_excerpt": "<html lang=\"en\"><head><title>Orbit</title></head><body><script>self.__next_f=[]</script></body></html>",
        "html_summary": {"title": "Orbit", "links": []},
    }
    browser_record = {
        "available": True,
        "headings": [{"level": 1, "text": "Orbit"}],
    }

    accessibility = collect_accessibility_smoke_evidence(
        "/",
        "http://127.0.0.1:3000/",
        navigation_record,
        browser_record,
        paths,
    )

    assert accessibility["passed"] is True
    assert not any(issue["id"] == "h1-missing" for issue in accessibility["violations"])


def test_collect_evidence_records_accessibility_and_performance_smoke_artifacts(tmp_path):
    import json

    from harness.config import HarnessConfig
    from harness.evidence import collect_evidence
    from harness.harness import init
    from harness.models.state import SprintContract, SuccessCriterion
    from harness.workspace import ensure_project_layout

    server = ThreadingHTTPServer(("127.0.0.1", 0), _EvidenceHandler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    app_url = f"http://127.0.0.1:{server.server_port}"
    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    init(tmp_path, cfg)
    paths = ensure_project_layout(tmp_path, cfg, sprint=1)
    contract = SprintContract(
        sprint_number=1,
        goal="Smoke evidence",
        success_criteria=[SuccessCriterion(id="SC-1", description="Evidence includes non-LLM smoke checks.")],
        evidence={"routes": ["/"]},
    )

    def fake_browser_collector(url, paths, route_key):
        return {
            "url": url,
            "route": route_key,
            "status": 200,
            "viewport": {"width": 1440, "height": 900},
            "overflow": {"horizontal": True, "scroll_width": 1600, "client_width": 1440},
            "console": [{"type": "error", "text": "Hydration failed"}],
            "request_failures": [{"url": f"{url}/missing.js", "method": "GET", "failure": "404"}],
        }

    try:
        evidence = collect_evidence(tmp_path, app_url, contract, paths, browser_collector=fake_browser_collector)
    finally:
        server.shutdown()
        thread.join(timeout=2)

    accessibility = evidence["axe"]["/"]
    performance = evidence["lighthouse"]["/"]

    assert accessibility["engine"] == "built_in_accessibility_smoke"
    assert accessibility["not_full_axe"] is True
    assert accessibility["artifact_path"].startswith(str(paths["axe"]))
    assert any(issue["id"] == "html-lang-missing" for issue in accessibility["violations"])
    assert Path(accessibility["artifact_path"]).exists()

    assert performance["engine"] == "built_in_performance_smoke"
    assert performance["not_full_lighthouse"] is True
    assert performance["artifact_path"].startswith(str(paths["lighthouse"]))
    assert any(issue["id"] == "horizontal-overflow" for issue in performance["issues"])
    assert any(issue["id"] == "console-errors" for issue in performance["issues"])
    assert any(issue["id"] == "request-failures" for issue in performance["issues"])
    assert Path(performance["artifact_path"]).exists()

    saved_evidence = json.loads((paths["sprint_evidence"] / "evidence.json").read_text())
    assert saved_evidence["axe"]["/"]["artifact_path"] == accessibility["artifact_path"]
    assert saved_evidence["lighthouse"]["/"]["artifact_path"] == performance["artifact_path"]


def test_collect_evidence_classifies_next_hmr_console_errors_as_dev_noise(tmp_path):
    from harness.config import HarnessConfig
    from harness.evidence import collect_evidence
    from harness.harness import init
    from harness.models.state import SprintContract, SuccessCriterion
    from harness.workspace import ensure_project_layout

    server = ThreadingHTTPServer(("127.0.0.1", 0), _EvidenceHandler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    app_url = f"http://127.0.0.1:{server.server_port}"
    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    init(tmp_path, cfg)
    paths = ensure_project_layout(tmp_path, cfg, sprint=1)
    contract = SprintContract(
        sprint_number=1,
        goal="Dev HMR noise",
        success_criteria=[SuccessCriterion(id="SC-1", description="Evidence ignores dev runtime noise.")],
        evidence={"routes": ["/"]},
    )

    def fake_browser_collector(url, paths, route_key):
        return {
            "url": url,
            "route": route_key,
            "status": 200,
            "viewport": {"width": 1440, "height": 900},
            "overflow": {"horizontal": False, "scroll_width": 1440, "client_width": 1440},
            "console": [
                {
                    "type": "error",
                    "text": (
                        "WebSocket connection to 'ws://127.0.0.1:3010/_next/webpack-hmr?id=abc' "
                        "failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE"
                    ),
                }
            ],
            "request_failures": [],
        }

    try:
        evidence = collect_evidence(tmp_path, app_url, contract, paths, browser_collector=fake_browser_collector)
    finally:
        server.shutdown()
        thread.join(timeout=2)

    browser = evidence["browser"]["/"]
    performance = evidence["lighthouse"]["/"]

    assert browser["console"] == []
    assert browser["dev_noise"][0]["id"] == "next-hmr-websocket"
    assert not any(issue["id"] == "console-errors" for issue in performance["issues"])
    assert performance["dev_noise"][0]["id"] == "next-hmr-websocket"


def test_iteration_scoped_evidence_does_not_overwrite_browser_artifacts(tmp_path):
    from harness.config import HarnessConfig
    from harness.evidence import collect_evidence
    from harness.harness import init
    from harness.models.state import SprintContract, SuccessCriterion
    from harness.workspace import ensure_project_layout

    server = ThreadingHTTPServer(("127.0.0.1", 0), _EvidenceHandler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    app_url = f"http://127.0.0.1:{server.server_port}"
    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    init(tmp_path, cfg)
    contract = SprintContract(
        sprint_number=1,
        goal="Browser evidence",
        success_criteria=[SuccessCriterion(id="SC-1", description="Entry page renders in a browser.")],
        evidence={"routes": ["/"]},
    )

    def fake_browser_collector(url, paths, route_key):
        screenshot = paths["screenshots"] / "root.png"
        browser_json = paths["browser"] / "root.json"
        screenshot.write_bytes(str(paths["sprint_evidence"]).encode())
        record = {
            "url": url,
            "route": route_key,
            "status": 200,
            "screenshot_path": str(screenshot),
            "viewport": {"width": 1440, "height": 900},
            "overflow": {"horizontal": False},
            "console": [],
            "request_failures": [],
            "artifact_path": str(browser_json),
        }
        browser_json.write_text("{}")
        return record

    try:
        iter1 = ensure_project_layout(tmp_path, cfg, sprint=1, iteration=1)
        iter2 = ensure_project_layout(tmp_path, cfg, sprint=1, iteration=2)
        evidence1 = collect_evidence(tmp_path, app_url, contract, iter1, browser_collector=fake_browser_collector)
        evidence2 = collect_evidence(tmp_path, app_url, contract, iter2, browser_collector=fake_browser_collector)
    finally:
        server.shutdown()
        thread.join(timeout=2)

    shot1 = Path(evidence1["browser"]["/"]["screenshot_path"])
    shot2 = Path(evidence2["browser"]["/"]["screenshot_path"])
    assert "iter-1" in shot1.as_posix()
    assert "iter-2" in shot2.as_posix()
    assert shot1 != shot2
    assert shot1.read_bytes() != shot2.read_bytes()


def test_contract_review_rejects_vague_criteria_without_evidence():
    import pytest

    from harness.harness import contracts_from_planner_spec

    spec = """# SPEC: Orbit

## Sprint Definitions
### Sprint 1

## Sprint Contract Seeds
```json
{
  "contracts": [
    {
      "sprint_number": 1,
      "goal": "Vague",
      "success_criteria": [
        {"id": "SC-1", "description": "The app looks good and works well."}
      ],
      "out_of_scope": []
    }
  ]
}
```
SPEC_COMPLETE
"""

    with pytest.raises(ValueError, match="Contract review failed"):
        contracts_from_planner_spec(spec)


def test_contract_review_rejects_invalid_success_criterion_schema():
    from harness.contract_review import contract_review_issues
    from harness.models.state import SprintContract, SuccessCriterion

    contract = SprintContract(
        sprint_number=1,
        goal="Invalid criteria",
        success_criteria=[
            SuccessCriterion(id=123, description="Criterion id must be a string."),
            SuccessCriterion(id="   ", description="Criterion id must not be empty."),
            SuccessCriterion(id="SC-3", description=None),
            SuccessCriterion(id="SC-4", description="   "),
        ],
        evidence={"routes": ["/"]},
        confirmed=True,
    )

    issues = contract_review_issues(contract)

    assert any("success_criteria" in issue and "id" in issue and "123" in issue for issue in issues)
    assert any("success_criteria" in issue and "id" in issue and "empty" in issue for issue in issues)
    assert any("SC-3" in issue and "description" in issue and "string" in issue for issue in issues)
    assert any("SC-4" in issue and "description" in issue and "empty" in issue for issue in issues)


def test_contract_review_rejects_non_list_success_criteria_field():
    from harness.contract_review import contract_review_issues
    from harness.models.state import SprintContract

    string_contract = SprintContract(
        sprint_number=1,
        goal="String criteria",
        success_criteria="SC-1: the / route is visible.",
        evidence={"routes": ["/"]},
        confirmed=True,
    )
    none_contract = SprintContract(
        sprint_number=2,
        goal="Missing criteria list",
        success_criteria=None,
        evidence={"routes": ["/"]},
        confirmed=True,
    )

    string_issues = contract_review_issues(string_contract)
    none_issues = contract_review_issues(none_contract)

    assert any("success_criteria" in issue and "list" in issue for issue in string_issues)
    assert any("success_criteria" in issue and "list" in issue for issue in none_issues)


def test_contract_review_rejects_invalid_constructed_sprint_number():
    from harness.contract_review import contract_review_issues
    from harness.models.state import SprintContract, SuccessCriterion

    bool_contract = SprintContract(
        sprint_number=True,
        goal="Boolean sprint number",
        success_criteria=[SuccessCriterion(id="SC-1", description="The / route is visible.")],
        evidence={"routes": ["/"]},
        confirmed=True,
    )
    fractional_contract = SprintContract(
        sprint_number=1.5,
        goal="Fractional sprint number",
        success_criteria=[SuccessCriterion(id="SC-1", description="The / route is visible.")],
        evidence={"routes": ["/"]},
        confirmed=True,
    )

    bool_issues = contract_review_issues(bool_contract)
    fractional_issues = contract_review_issues(fractional_contract)

    assert any("sprint_number" in issue and "positive integer" in issue for issue in bool_issues)
    assert any("sprint_number" in issue and "positive integer" in issue for issue in fractional_issues)


def test_contract_review_rejects_invalid_goal_and_out_of_scope_schema():
    from harness.contract_review import contract_review_issues
    from harness.models.state import SprintContract, SuccessCriterion

    contract = SprintContract(
        sprint_number=1,
        goal=None,
        success_criteria=[SuccessCriterion(id="SC-1", description="The / route is visible.")],
        out_of_scope="billing",
        evidence={"routes": ["/"]},
        confirmed=True,
    )

    issues = contract_review_issues(contract)

    assert any("goal" in issue and "non-empty string" in issue for issue in issues)
    assert any("out_of_scope" in issue and "list" in issue for issue in issues)


def test_contract_review_rejects_source_file_path_traversal():
    from harness.contract_review import contract_review_issues
    from harness.models.state import SprintContract, SuccessCriterion

    contract = SprintContract(
        sprint_number=1,
        goal="Unsafe source evidence",
        success_criteria=[SuccessCriterion(id="SC-1", description="Route shows a safe page.")],
        evidence={
            "source_files": [
                "../../secret.txt",
                "/tmp/absolute.txt",
                "repos/orbits/package.json",
                "features/account/tests/*.test.js",
            ]
        },
        confirmed=True,
    )

    issues = contract_review_issues(contract)

    assert any("source_files" in issue and "../../secret.txt" in issue for issue in issues)
    assert any("source_files" in issue and "/tmp/absolute.txt" in issue for issue in issues)
    assert any("source_files" in issue and "repos/orbits/package.json" in issue and "app-relative" in issue for issue in issues)
    assert any("source_files" in issue and "features/account/tests/*.test.js" in issue and "concrete" in issue for issue in issues)


def test_contract_review_allows_next_dynamic_segment_source_file_names():
    from harness.contract_review import contract_review_issues
    from harness.models.state import SprintContract, SuccessCriterion

    contract = SprintContract(
        sprint_number=1,
        goal="Dynamic source evidence",
        success_criteria=[SuccessCriterion(id="SC-1", description="Route file is present.")],
        evidence={"source_files": ["app/(app)/events/[id]/page.js"]},
        confirmed=True,
    )

    issues = contract_review_issues(contract)

    assert not [issue for issue in issues if "source_files" in issue]


def test_contract_review_rejects_unsafe_declared_commands():
    from harness.contract_review import contract_review_issues
    from harness.models.state import SprintContract, SuccessCriterion

    contract = SprintContract(
        sprint_number=1,
        goal="Unsafe command evidence",
        success_criteria=[SuccessCriterion(id="SC-1", description="Route shows a safe page.")],
        evidence={
            "commands": [
                {"name": "shell", "cmd": ["bash", "-lc", "cat ../../.env"]},
                {"name": "node-eval", "cmd": ["node", "-e", "require('fs').readFileSync('../../.env')"]},
                {"name": "npx-tool", "cmd": ["npx", "some-tool"]},
                {"name": "dev-server", "cmd": ["npm", "run", "dev"]},
            ]
        },
        confirmed=True,
    )

    issues = contract_review_issues(contract)

    assert any("commands" in issue and "bash" in issue for issue in issues)
    assert any("commands" in issue and "node" in issue for issue in issues)
    assert any("commands" in issue and "npx" in issue for issue in issues)
    assert any("commands" in issue and "dev" in issue and "one-shot" in issue for issue in issues)


def test_contract_review_rejects_external_routes_and_api_paths():
    from harness.contract_review import contract_review_issues
    from harness.models.state import SprintContract, SuccessCriterion

    contract = SprintContract(
        sprint_number=1,
        goal="Unsafe external evidence",
        success_criteria=[SuccessCriterion(id="SC-1", description="Route shows a safe page.")],
        evidence={
            "routes": ["https://example.com/", "/../admin", "/app/events/:id"],
            "api": [
                {"name": "external", "method": "GET", "path": "https://example.com/api"},
                {"name": "traversal", "method": "GET", "path": "/api/../secret"},
                {"name": "template", "method": "GET", "path": "/api/events/:id"},
            ],
        },
        confirmed=True,
    )

    issues = contract_review_issues(contract)

    assert any("routes" in issue and "https://example.com/" in issue for issue in issues)
    assert any("routes" in issue and "/../admin" in issue and "traversal" in issue for issue in issues)
    assert any("routes" in issue and "/app/events/:id" in issue and "concrete" in issue for issue in issues)
    assert any("api" in issue and "https://example.com/api" in issue for issue in issues)
    assert any("api" in issue and "/api/../secret" in issue and "traversal" in issue for issue in issues)
    assert any("api" in issue and "/api/events/:id" in issue and "concrete" in issue for issue in issues)


def test_contract_review_allows_safe_query_route_evidence():
    from harness.contract_review import contract_review_issues
    from harness.models.state import SprintContract, SuccessCriterion

    contract = SprintContract(
        sprint_number=1,
        goal="Route state evidence",
        success_criteria=[SuccessCriterion(id="SC-1", description="Scenario routes are browser-observable.")],
        evidence={"routes": ["/app/contacts?scenario=empty"]},
        confirmed=True,
    )

    route_issues = [issue for issue in contract_review_issues(contract) if "routes" in issue]

    assert route_issues == []


def test_contract_review_rejects_unsafe_public_routes():
    from harness.contract_review import contract_review_issues
    from harness.models.state import SprintContract, SuccessCriterion

    malformed_contract = SprintContract(
        sprint_number=1,
        goal="Malformed public routes",
        success_criteria=[SuccessCriterion(id="SC-1", description="Route shows a safe page.")],
        evidence={"routes": ["/"], "public_routes": "/debug"},
        confirmed=True,
    )
    unsafe_contract = SprintContract(
        sprint_number=1,
        goal="Unsafe public routes",
        success_criteria=[SuccessCriterion(id="SC-1", description="Route shows a safe page.")],
        evidence={
            "routes": ["/"],
            "public_routes": [
                "https://example.com/debug",
                "/debug",
                "/__harness/sprint-1/../debug",
                "/__harness/sprint-1/evidence",
                "/__harness/sprint-1/evidence",
            ],
        },
        confirmed=True,
    )

    malformed_issues = contract_review_issues(malformed_contract)
    unsafe_issues = contract_review_issues(unsafe_contract)

    assert any("public_routes" in issue and "list" in issue for issue in malformed_issues)
    assert any("public_routes" in issue and "https://example.com/debug" in issue for issue in unsafe_issues)
    assert any("public_routes" in issue and "/debug" in issue and "__harness" in issue for issue in unsafe_issues)
    assert any("public_routes" in issue and "/__harness/sprint-1/../debug" in issue and "traversal" in issue for issue in unsafe_issues)
    assert any("public_routes" in issue and "/__harness/sprint-1/evidence" in issue and "duplicated" in issue for issue in unsafe_issues)


def test_contract_review_rejects_invalid_api_probe_fields():
    from harness.contract_review import contract_review_issues
    from harness.models.state import SprintContract, SuccessCriterion

    contract = SprintContract(
        sprint_number=1,
        goal="Invalid API probe",
        success_criteria=[SuccessCriterion(id="SC-1", description="API probe is valid.")],
        evidence={
            "api": [
                {"name": "bad-method", "method": "TRACE", "path": "/api/health"},
                {"name": "bad-status", "method": "GET", "path": "/api/health", "expectStatus": "ok"},
                {"name": "fractional-status", "method": "GET", "path": "/api/health", "expectStatus": 200.5},
            ]
        },
        confirmed=True,
    )

    issues = contract_review_issues(contract)

    assert any("api method" in issue and "TRACE" in issue for issue in issues)
    assert any("expected status" in issue and "ok" in issue for issue in issues)
    assert any("expected status" in issue and "200.5" in issue for issue in issues)


def test_contract_review_rejects_malformed_evidence_schema():
    from harness.contract_review import contract_review_issues
    from harness.models.state import SprintContract, SuccessCriterion

    non_object_contract = SprintContract(
        sprint_number=1,
        goal="Malformed evidence object",
        success_criteria=[SuccessCriterion(id="SC-1", description="Evidence schema is valid.")],
        evidence=["routes", "/"],
        confirmed=True,
    )
    empty_list_contract = SprintContract(
        sprint_number=2,
        goal="Malformed empty evidence list",
        success_criteria=[SuccessCriterion(id="SC-1", description="Evidence schema is valid.")],
        evidence=[],
        confirmed=True,
    )
    empty_string_contract = SprintContract(
        sprint_number=3,
        goal="Malformed empty evidence string",
        success_criteria=[SuccessCriterion(id="SC-1", description="Evidence schema is valid.")],
        evidence="",
        confirmed=True,
    )
    malformed_bucket_contract = SprintContract(
        sprint_number=4,
        goal="Malformed evidence buckets",
        success_criteria=[SuccessCriterion(id="SC-1", description="Evidence bucket schemas are valid.")],
        evidence={
            "routes": "/",
            "commands": {"name": "test", "cmd": ["npm", "test"]},
            "api": {"name": "health", "method": "GET", "path": "/api/health"},
            "source_files": "app/page.tsx",
        },
        confirmed=True,
    )
    null_bucket_contract = SprintContract(
        sprint_number=5,
        goal="Null evidence buckets",
        success_criteria=[SuccessCriterion(id="SC-1", description="Evidence bucket schemas are valid.")],
        evidence={
            "routes": None,
            "commands": None,
            "api": None,
            "source_files": None,
        },
        confirmed=True,
    )

    non_object_issues = contract_review_issues(non_object_contract)
    empty_list_issues = contract_review_issues(empty_list_contract)
    empty_string_issues = contract_review_issues(empty_string_contract)
    malformed_bucket_issues = contract_review_issues(malformed_bucket_contract)
    null_bucket_issues = contract_review_issues(null_bucket_contract)

    assert any("evidence" in issue and "object" in issue for issue in non_object_issues)
    assert any("evidence" in issue and "object" in issue for issue in empty_list_issues)
    assert any("evidence" in issue and "object" in issue for issue in empty_string_issues)
    assert any("routes" in issue and "list" in issue for issue in malformed_bucket_issues)
    assert any("commands" in issue and "list" in issue for issue in malformed_bucket_issues)
    assert any("api" in issue and "list" in issue for issue in malformed_bucket_issues)
    assert any("source_files" in issue and "list" in issue for issue in malformed_bucket_issues)
    assert any("routes" in issue and "list" in issue for issue in null_bucket_issues)
    assert any("commands" in issue and "list" in issue for issue in null_bucket_issues)
    assert any("api" in issue and "list" in issue for issue in null_bucket_issues)
    assert any("source_files" in issue and "list" in issue for issue in null_bucket_issues)


def test_contract_review_rejects_unknown_evidence_keys():
    from harness.contract_review import contract_review_issues
    from harness.models.state import SprintContract, SuccessCriterion

    contract = SprintContract(
        sprint_number=1,
        goal="Unknown evidence keys",
        success_criteria=[SuccessCriterion(id="SC-1", description="Evidence schema is explicit.")],
        evidence={
            "routes": ["/"],
            "write_files": ["../harness.py"],
            "debug_routes": ["/debug"],
        },
        confirmed=True,
    )

    issues = contract_review_issues(contract)

    assert any("unsupported evidence key" in issue and "write_files" in issue for issue in issues)
    assert any("unsupported evidence key" in issue and "debug_routes" in issue for issue in issues)


def test_contract_review_rejects_duplicate_evidence_keys():
    from harness.contract_review import contract_review_issues
    from harness.models.state import SprintContract, SuccessCriterion

    contract = SprintContract(
        sprint_number=1,
        goal="Duplicate evidence",
        success_criteria=[SuccessCriterion(id="SC-1", description="Declared evidence is unambiguous.")],
        evidence={
            "routes": ["/", "/"],
            "commands": [
                {"name": "test", "cmd": ["npm", "test"]},
                {"name": "test", "cmd": ["npm", "run", "build"]},
            ],
            "api": [
                {"name": "health", "method": "GET", "path": "/api/health"},
                {"name": "health", "method": "GET", "path": "/api/ready"},
            ],
            "source_files": ["app/page.tsx", "app/page.tsx"],
        },
        confirmed=True,
    )

    issues = contract_review_issues(contract)

    assert any("routes" in issue and "/" in issue and "duplicated" in issue for issue in issues)
    assert any("commands" in issue and "test" in issue and "duplicated" in issue for issue in issues)
    assert any("api" in issue and "health" in issue and "duplicated" in issue for issue in issues)
    assert any("source_files" in issue and "app/page.tsx" in issue and "duplicated" in issue for issue in issues)


def test_contract_review_rejects_invalid_named_evidence_keys():
    from harness.contract_review import contract_review_issues
    from harness.models.state import SprintContract, SuccessCriterion

    contract = SprintContract(
        sprint_number=1,
        goal="Invalid evidence names",
        success_criteria=[SuccessCriterion(id="SC-1", description="Declared evidence keys are safe.")],
        evidence={
            "commands": [
                {"name": 123, "cmd": ["npm", "test"]},
                {"name": "   ", "cmd": ["npm", "run", "build"]},
                {"name": "build/test", "cmd": ["npm", "test"]},
            ],
            "api": [
                {"name": 456, "method": "GET", "path": "/api/health"},
                {"name": "   ", "method": "GET", "path": "/api/ready"},
                {"name": "health check", "method": "GET", "path": "/api/health"},
            ],
        },
        confirmed=True,
    )

    issues = contract_review_issues(contract)

    assert any("commands" in issue and "name" in issue and "123" in issue for issue in issues)
    assert any("commands" in issue and "name" in issue and "empty" in issue for issue in issues)
    assert any("commands" in issue and "name" in issue and "build/test" in issue for issue in issues)
    assert any("api" in issue and "name" in issue and "456" in issue for issue in issues)
    assert any("api" in issue and "name" in issue and "empty" in issue for issue in issues)
    assert any("api" in issue and "name" in issue and "health check" in issue for issue in issues)


def test_contract_review_rejects_unknown_nested_evidence_fields():
    from harness.contract_review import contract_review_issues
    from harness.models.state import SprintContract, SuccessCriterion

    contract = SprintContract(
        sprint_number=1,
        goal="Unknown nested evidence fields",
        success_criteria=[SuccessCriterion(id="SC-1", description="Nested evidence schema is explicit.")],
        evidence={
            "commands": [{"name": "test", "cmd": ["npm", "test"], "cwd": "../"}],
            "api": [
                {
                    "name": "health",
                    "method": "GET",
                    "path": "/api/health",
                    "expectStatus": 200,
                    "headers": {"x-debug": "1"},
                    "write_file": "public/debug.json",
                }
            ],
        },
        confirmed=True,
    )

    issues = contract_review_issues(contract)

    assert any("commands" in issue and "unsupported field" in issue and "cwd" in issue for issue in issues)
    assert any("api" in issue and "unsupported field" in issue and "headers" in issue for issue in issues)
    assert any("api" in issue and "unsupported field" in issue and "write_file" in issue for issue in issues)


def test_strategy_decision_pivots_when_scores_are_flat():
    from harness.strategy import decide_strategy

    decision = decide_strategy(
        [
            {"iteration": 1, "evaluator_average": 2.4, "verifier_average": 2.5, "verdict": "fail"},
            {"iteration": 2, "evaluator_average": 2.45, "verifier_average": 2.45, "verdict": "fail"},
            {"iteration": 3, "evaluator_average": 2.42, "verifier_average": 2.47, "verdict": "fail"},
        ],
        latest_feedback="The current direction is still confusing.",
    )

    assert decision["decision"] == "pivot"
    assert "PIVOT" in decision["directive"]


def test_strategy_directive_prioritizes_blocking_repair_targets():
    from harness.strategy import decide_strategy

    decision = decide_strategy(
        [
            {"iteration": 1, "evaluator_average": 2.4, "verifier_average": 2.5, "verdict": "fail"},
            {"iteration": 2, "evaluator_average": 2.45, "verifier_average": 2.45, "verdict": "fail"},
            {"iteration": 3, "evaluator_average": 2.42, "verifier_average": 2.47, "verdict": "fail"},
        ],
        latest_feedback="The current direction is still confusing.",
        blocking_items=[
            "Evaluator SC-1: route returns the wrong service.",
            "Evaluator SC-1: route returns the wrong service.",
            "Verifier UX-1: add a clear recovery path.",
        ],
    )

    assert decision["decision"] == "pivot"
    assert decision["blocking_items"] == [
        "Evaluator SC-1: route returns the wrong service.",
        "Verifier UX-1: add a clear recovery path.",
    ]
    assert "Blocking repair targets" in decision["directive"]
    assert "before broad refactors or polish" in decision["directive"]


def test_strategy_decision_refines_when_scores_improve():
    from harness.strategy import decide_strategy

    decision = decide_strategy(
        [
            {"iteration": 1, "evaluator_average": 2.0, "verifier_average": 2.2, "verdict": "fail"},
            {"iteration": 2, "evaluator_average": 3.2, "verifier_average": 3.4, "verdict": "conditional_pass"},
        ],
        latest_feedback="Most checks pass; fix the remaining rough edges.",
    )

    assert decision["decision"] == "refine"
    assert "REFINE" in decision["directive"]


def test_preflight_reports_missing_manifest_remote_and_dirty_app_repo(tmp_path):
    from harness.config import HarnessConfig
    from harness.harness import init
    from harness.preflight import run_preflight

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    init(tmp_path, cfg)

    report = run_preflight(
        tmp_path,
        cfg,
        browser_check=lambda: {"available": True, "message": "chromium ok"},
        runner_check=lambda cfg: {"available": True, "required": [], "missing": []},
    )

    checks = {check["name"]: check for check in report["checks"]}
    assert report["status"] == "fail"
    assert checks["planner_manifest"]["status"] == "warning"
    assert checks["app_git_remote"]["status"] == "warning"
    assert checks["app_worktree"]["status"] == "fail"
    assert checks["browser_runtime"]["status"] == "pass"
    assert "repos/orbits/README.md" in checks["app_worktree"]["details"]["changed_files"]


def test_preflight_passes_when_plan_remote_worktree_and_browser_are_ready(tmp_path):
    import subprocess

    from harness.config import HarnessConfig
    from harness.harness import init, save_planned_state
    from harness.models.state import SprintContract, SuccessCriterion
    from harness.preflight import run_preflight

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    init(tmp_path, cfg)
    save_planned_state(
        tmp_path,
        cfg,
        """# SPEC

## Sprint Definitions
### Sprint 1
""",
        [
            SprintContract(
                sprint_number=1,
                goal="Ready",
                success_criteria=[SuccessCriterion(id="SC-1", description="Ready state can be checked.")],
                evidence={"routes": ["/"]},
                confirmed=True,
            )
        ],
    )
    app_repo = tmp_path / "repos/orbits"
    subprocess.run(["git", "config", "user.email", "orbit@example.local"], cwd=app_repo, check=True)
    subprocess.run(["git", "config", "user.name", "Orbit Harness"], cwd=app_repo, check=True)
    subprocess.run(["git", "remote", "add", "origin", "git@github.com:example/orbits.git"], cwd=app_repo, check=True)
    subprocess.run(["git", "add", "--", "."], cwd=app_repo, check=True)
    subprocess.run(["git", "commit", "-m", "test: baseline"], cwd=app_repo, check=True, capture_output=True, text=True)

    report = run_preflight(
        tmp_path,
        cfg,
        browser_check=lambda: {"available": True, "message": "chromium ok"},
        runner_check=lambda cfg: {"available": True, "required": [], "missing": []},
    )

    checks = {check["name"]: check for check in report["checks"]}
    assert report["status"] == "pass"
    assert checks["planner_manifest"]["status"] == "pass"
    assert checks["app_git_remote"]["status"] == "pass"
    assert checks["app_worktree"]["status"] == "pass"
    assert checks["browser_runtime"]["status"] == "pass"
    assert checks["agent_runtimes"]["status"] == "pass"


def test_preflight_fails_dirty_app_worktree_when_git_commit_enabled(tmp_path):
    import subprocess

    from harness.config import HarnessConfig
    from harness.harness import init, save_planned_state
    from harness.models.state import SprintContract, SuccessCriterion
    from harness.preflight import run_preflight

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.workspace.git.enabled = True
    cfg.workspace.git.strategy = "path-scoped"
    cfg.workspace.git.remote_url = "git@github.com:example/orbits.git"
    init(tmp_path, cfg)
    save_planned_state(
        tmp_path,
        cfg,
        """# SPEC

## Sprint Definitions
### Sprint 1
""",
        [
            SprintContract(
                sprint_number=1,
                goal="Dirty worktree",
                success_criteria=[SuccessCriterion(id="SC-1", description="Pre-existing changes are not auto-committed.")],
                evidence={"routes": ["/"]},
                confirmed=True,
            )
        ],
    )
    app_repo = tmp_path / "repos/orbits"
    subprocess.run(["git", "config", "user.email", "orbit@example.local"], cwd=app_repo, check=True)
    subprocess.run(["git", "config", "user.name", "Orbit Harness"], cwd=app_repo, check=True)
    subprocess.run(["git", "add", "--", "."], cwd=app_repo, check=True)
    subprocess.run(["git", "commit", "-m", "test: baseline"], cwd=app_repo, check=True, capture_output=True, text=True)
    (app_repo / "README.md").write_text("# Orbits\n\nUser change before harness run.\n")

    report = run_preflight(
        tmp_path,
        cfg,
        browser_check=lambda: {"available": True, "message": "chromium ok"},
        runner_check=lambda cfg: {"available": True, "required": [], "missing": []},
    )

    checks = {check["name"]: check for check in report["checks"]}
    assert report["status"] == "fail"
    assert checks["app_worktree"]["status"] == "fail"
    assert "Git commit/push is enabled" in checks["app_worktree"]["message"]


def test_preflight_fails_when_app_git_status_cannot_be_read(tmp_path):
    from harness.config import HarnessConfig
    from harness.harness import save_planned_state
    from harness.models.state import SprintContract, SuccessCriterion
    from harness.preflight import run_preflight

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    app_repo = tmp_path / "repos/orbits"
    app_repo.mkdir(parents=True)
    (app_repo / ".git").mkdir()
    save_planned_state(
        tmp_path,
        cfg,
        """# SPEC

## Sprint Definitions
### Sprint 1
""",
        [
            SprintContract(
                sprint_number=1,
                goal="Unreadable git status",
                success_criteria=[SuccessCriterion(id="SC-1", description="App git status is readable before generation.")],
                evidence={"routes": ["/"]},
                confirmed=True,
            )
        ],
    )

    report = run_preflight(
        tmp_path,
        cfg,
        browser_check=lambda: {"available": True, "message": "chromium ok"},
        runner_check=lambda cfg: {"available": True, "required": [], "missing": []},
    )

    checks = {check["name"]: check for check in report["checks"]}
    assert report["status"] == "fail"
    assert checks["app_worktree"]["status"] == "fail"
    assert "Cannot inspect app repo worktree" in checks["app_worktree"]["message"]


def test_preflight_fails_when_required_agent_runtime_is_missing(tmp_path):
    from harness.config import HarnessConfig
    from harness.harness import init
    from harness.preflight import run_preflight

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    init(tmp_path, cfg)

    report = run_preflight(
        tmp_path,
        cfg,
        browser_check=lambda: {"available": True, "message": "chromium ok"},
        runner_check=lambda cfg: {
            "available": False,
            "required": [
                {"role": "generator", "backend": "codex", "runtime": "codex"},
            ],
            "missing": [
                {
                    "role": "generator",
                    "backend": "codex",
                    "runtime": "codex",
                    "message": "codex CLI not found",
                },
            ],
        },
    )

    checks = {check["name"]: check for check in report["checks"]}
    assert report["status"] == "fail"
    assert checks["agent_runtimes"]["status"] == "fail"
    assert checks["agent_runtimes"]["details"]["missing"][0]["runtime"] == "codex"


def test_preflight_fails_invalid_codex_reasoning_effort(tmp_path):
    from harness.config import HarnessConfig
    from harness.harness import init
    from harness.preflight import run_preflight

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.agents.generator.codex.reasoning_effort = "maximum"
    init(tmp_path, cfg)

    report = run_preflight(
        tmp_path,
        cfg,
        browser_check=lambda: {"available": True, "message": "chromium ok"},
        runner_check=lambda cfg: {"available": True, "required": [], "missing": []},
    )

    checks = {check["name"]: check for check in report["checks"]}
    assert report["status"] == "fail"
    assert checks["agent_config"]["status"] == "fail"
    assert "generator.codex.reasoning_effort" in checks["agent_config"]["message"]
    assert "maximum" in checks["agent_config"]["message"]
    assert checks["agent_runtimes"]["status"] == "pass"


def test_preflight_fails_invalid_codex_approval_mode(tmp_path):
    from harness.config import HarnessConfig
    from harness.harness import init
    from harness.preflight import run_preflight

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.agents.verifier.codex.approval_mode = "auto-edit"
    init(tmp_path, cfg)

    report = run_preflight(
        tmp_path,
        cfg,
        browser_check=lambda: {"available": True, "message": "chromium ok"},
        runner_check=lambda cfg: {"available": True, "required": [], "missing": []},
    )

    checks = {check["name"]: check for check in report["checks"]}
    assert report["status"] == "fail"
    assert checks["agent_config"]["status"] == "fail"
    assert "verifier.codex.approval_mode" in checks["agent_config"]["message"]
    assert "auto-edit" in checks["agent_config"]["message"]
    assert checks["agent_runtimes"]["status"] == "pass"


def test_preflight_fails_reviewer_codex_with_writeable_sandbox(tmp_path):
    from harness.config import HarnessConfig
    from harness.harness import init
    from harness.preflight import run_preflight

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.agents.evaluator.backend = "codex"
    cfg.agents.evaluator.codex.approval_mode = "workspace-write"
    cfg.agents.verifier.backend = "codex"
    cfg.agents.verifier.codex.approval_mode = "danger-full-access"
    init(tmp_path, cfg)

    report = run_preflight(
        tmp_path,
        cfg,
        browser_check=lambda: {"available": True, "message": "chromium ok"},
        runner_check=lambda cfg: {"available": True, "required": [], "missing": []},
    )

    checks = {check["name"]: check for check in report["checks"]}
    assert report["status"] == "fail"
    assert checks["agent_config"]["status"] == "fail"
    assert "evaluator.codex.approval_mode must be read-only" in checks["agent_config"]["message"]
    assert "verifier.codex.approval_mode must be read-only" in checks["agent_config"]["message"]


def test_preflight_fails_codex_extra_args_that_override_workspace(tmp_path):
    from harness.config import HarnessConfig
    from harness.harness import init
    from harness.preflight import run_preflight

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.agents.generator.codex.extra_args = ["--cd", "/tmp"]
    init(tmp_path, cfg)

    report = run_preflight(
        tmp_path,
        cfg,
        browser_check=lambda: {"available": True, "message": "chromium ok"},
        runner_check=lambda cfg: {"available": True, "required": [], "missing": []},
    )

    checks = {check["name"]: check for check in report["checks"]}
    assert report["status"] == "fail"
    assert checks["agent_config"]["status"] == "fail"
    assert "generator.codex.extra_args" in checks["agent_config"]["message"]
    assert "--cd" in checks["agent_config"]["message"]


def test_preflight_fails_invalid_claude_thinking_budget(tmp_path):
    from harness.config import HarnessConfig
    from harness.harness import init
    from harness.preflight import run_preflight

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.agents.planner.thinking.budget_tokens = 0
    init(tmp_path, cfg)

    report = run_preflight(
        tmp_path,
        cfg,
        browser_check=lambda: {"available": True, "message": "chromium ok"},
        runner_check=lambda cfg: {"available": True, "required": [], "missing": []},
    )

    checks = {check["name"]: check for check in report["checks"]}
    assert report["status"] == "fail"
    assert checks["agent_config"]["status"] == "fail"
    assert "planner.thinking.budget_tokens" in checks["agent_config"]["message"]


def test_preflight_fails_claude_temperature_with_thinking(tmp_path):
    from harness.config import HarnessConfig
    from harness.harness import init
    from harness.preflight import run_preflight

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.agents.evaluator.temperature = 0.2
    init(tmp_path, cfg)

    report = run_preflight(
        tmp_path,
        cfg,
        browser_check=lambda: {"available": True, "message": "chromium ok"},
        runner_check=lambda cfg: {"available": True, "required": [], "missing": []},
    )

    checks = {check["name"]: check for check in report["checks"]}
    assert report["status"] == "fail"
    assert checks["agent_config"]["status"] == "fail"
    assert "evaluator.temperature" in checks["agent_config"]["message"]


def test_preflight_fails_invalid_loop_iteration_bounds(tmp_path):
    from harness.config import HarnessConfig
    from harness.harness import init
    from harness.preflight import run_preflight

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.loop.max_iterations = 0
    cfg.loop.planner_max_turns = 0
    cfg.loop.planner_timeout_seconds = 0
    init(tmp_path, cfg)

    report = run_preflight(
        tmp_path,
        cfg,
        browser_check=lambda: {"available": True, "message": "chromium ok"},
        runner_check=lambda cfg: {"available": True, "required": [], "missing": []},
    )

    checks = {check["name"]: check for check in report["checks"]}
    assert report["status"] == "fail"
    assert checks["loop_config"]["status"] == "fail"
    assert "loop.max_iterations" in checks["loop_config"]["message"]
    assert "loop.planner_max_turns" in checks["loop_config"]["message"]
    assert "loop.planner_timeout_seconds" in checks["loop_config"]["message"]


def test_preflight_fails_workspace_root_that_escapes_project(tmp_path):
    from harness.config import HarnessConfig
    from harness.preflight import run_preflight

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.workspace.app_root = "../escaped-orbits"
    escaped = tmp_path.parent / "escaped-orbits"

    report = run_preflight(
        tmp_path,
        cfg,
        browser_check=lambda: {"available": True, "message": "chromium ok"},
        runner_check=lambda cfg: {"available": True, "required": [], "missing": []},
    )

    checks = {check["name"]: check for check in report["checks"]}
    assert report["status"] == "fail"
    assert checks["workspace_paths"]["status"] == "fail"
    assert not escaped.exists()


def test_preflight_fails_artifact_roots_inside_app_repo(tmp_path):
    from harness.config import HarnessConfig
    from harness.preflight import run_preflight

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.workspace.evidence_root = "repos/orbits/harness-state/evidence"

    report = run_preflight(
        tmp_path,
        cfg,
        browser_check=lambda: {"available": True, "message": "chromium ok"},
        runner_check=lambda cfg: {"available": True, "required": [], "missing": []},
    )

    checks = {check["name"]: check for check in report["checks"]}
    assert report["status"] == "fail"
    assert checks["workspace_paths"]["status"] == "fail"
    assert "evidence_root" in checks["workspace_paths"]["message"]


def test_preflight_fails_when_commit_enabled_without_app_git_identity(tmp_path):
    import subprocess

    from harness.config import HarnessConfig
    from harness.harness import init
    from harness.preflight import run_preflight

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.workspace.git.enabled = True
    cfg.workspace.git.strategy = "path-scoped"
    init(tmp_path, cfg)
    app_repo = tmp_path / "repos/orbits"
    subprocess.run(["git", "config", "user.name", ""], cwd=app_repo, check=True)
    subprocess.run(["git", "config", "user.email", ""], cwd=app_repo, check=True)

    report = run_preflight(
        tmp_path,
        cfg,
        browser_check=lambda: {"available": True, "message": "chromium ok"},
        runner_check=lambda cfg: {"available": True, "required": [], "missing": []},
    )

    checks = {check["name"]: check for check in report["checks"]}
    assert report["status"] == "fail"
    assert checks["app_git_identity"]["status"] == "fail"
    assert checks["app_git_identity"]["details"]["required"] is True


def test_preflight_fails_when_push_enabled_but_git_commit_disabled(tmp_path):
    import subprocess

    from harness.config import HarnessConfig
    from harness.harness import init, save_planned_state
    from harness.models.state import SprintContract, SuccessCriterion
    from harness.preflight import run_preflight

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.workspace.git.enabled = False
    cfg.workspace.git.strategy = "disabled"
    cfg.workspace.git.push = True
    cfg.workspace.git.remote_url = "git@github.com:example/orbits.git"
    init(tmp_path, cfg)
    save_planned_state(
        tmp_path,
        cfg,
        "# SPEC\n\n## Sprint Definitions\n",
        [
            SprintContract(
                sprint_number=1,
                goal="Git config",
                success_criteria=[SuccessCriterion(id="SC-1", description="Git sync config is internally consistent.")],
                evidence={"routes": ["/"]},
                confirmed=True,
            )
        ],
    )
    app_repo = tmp_path / "repos/orbits"
    subprocess.run(["git", "config", "user.email", "orbit@example.local"], cwd=app_repo, check=True)
    subprocess.run(["git", "config", "user.name", "Orbit Harness"], cwd=app_repo, check=True)
    subprocess.run(["git", "add", "--", "."], cwd=app_repo, check=True)
    subprocess.run(["git", "commit", "-m", "test: baseline"], cwd=app_repo, check=True, capture_output=True, text=True)

    report = run_preflight(
        tmp_path,
        cfg,
        browser_check=lambda: {"available": True, "message": "chromium ok"},
        runner_check=lambda cfg: {"available": True, "required": [], "missing": []},
    )

    checks = {check["name"]: check for check in report["checks"]}
    assert report["status"] == "fail"
    assert checks["app_git_config"]["status"] == "fail"
    assert "push requires git commit" in checks["app_git_config"]["message"]


def test_preflight_fails_when_push_enabled_without_configured_remote_url(tmp_path):
    import subprocess

    from harness.config import HarnessConfig
    from harness.harness import init, save_planned_state
    from harness.models.state import SprintContract, SuccessCriterion
    from harness.preflight import run_preflight

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.workspace.git.enabled = True
    cfg.workspace.git.strategy = "path-scoped"
    cfg.workspace.git.push = True
    init(tmp_path, cfg)
    save_planned_state(
        tmp_path,
        cfg,
        "# SPEC\n\n## Sprint Definitions\n",
        [
            SprintContract(
                sprint_number=1,
                goal="Git remote",
                success_criteria=[SuccessCriterion(id="SC-1", description="GitHub push target is explicitly configured.")],
                evidence={"routes": ["/"]},
                confirmed=True,
            )
        ],
    )
    app_repo = tmp_path / "repos/orbits"
    remote_repo = tmp_path / "remote.git"
    subprocess.run(["git", "init", "--bare", str(remote_repo)], check=True, capture_output=True, text=True)
    subprocess.run(["git", "config", "user.email", "orbit@example.local"], cwd=app_repo, check=True)
    subprocess.run(["git", "config", "user.name", "Orbit Harness"], cwd=app_repo, check=True)
    subprocess.run(["git", "remote", "add", "origin", str(remote_repo)], cwd=app_repo, check=True)
    subprocess.run(["git", "add", "--", "."], cwd=app_repo, check=True)
    subprocess.run(["git", "commit", "-m", "test: baseline"], cwd=app_repo, check=True, capture_output=True, text=True)

    report = run_preflight(
        tmp_path,
        cfg,
        browser_check=lambda: {"available": True, "message": "chromium ok"},
        runner_check=lambda cfg: {"available": True, "required": [], "missing": []},
    )

    checks = {check["name"]: check for check in report["checks"]}
    assert report["status"] == "fail"
    assert checks["app_git_remote"]["status"] == "fail"
    assert "workspace.git.remote_url" in checks["app_git_remote"]["message"]


def test_preflight_fails_when_git_enabled_with_disabled_strategy(tmp_path):
    import subprocess

    from harness.config import HarnessConfig
    from harness.harness import init, save_planned_state
    from harness.models.state import SprintContract, SuccessCriterion
    from harness.preflight import run_preflight

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.workspace.git.enabled = True
    cfg.workspace.git.strategy = "disabled"
    cfg.workspace.git.push = False
    cfg.workspace.git.remote_url = "git@github.com:example/orbits.git"
    init(tmp_path, cfg)
    save_planned_state(
        tmp_path,
        cfg,
        "# SPEC\n\n## Sprint Definitions\n",
        [
            SprintContract(
                sprint_number=1,
                goal="Git config",
                success_criteria=[SuccessCriterion(id="SC-1", description="Git commit strategy is enabled.")],
                evidence={"routes": ["/"]},
                confirmed=True,
            )
        ],
    )
    app_repo = tmp_path / "repos/orbits"
    subprocess.run(["git", "config", "user.email", "orbit@example.local"], cwd=app_repo, check=True)
    subprocess.run(["git", "config", "user.name", "Orbit Harness"], cwd=app_repo, check=True)
    subprocess.run(["git", "add", "--", "."], cwd=app_repo, check=True)
    subprocess.run(["git", "commit", "-m", "test: baseline"], cwd=app_repo, check=True, capture_output=True, text=True)

    report = run_preflight(
        tmp_path,
        cfg,
        browser_check=lambda: {"available": True, "message": "chromium ok"},
        runner_check=lambda cfg: {"available": True, "required": [], "missing": []},
    )

    checks = {check["name"]: check for check in report["checks"]}
    assert report["status"] == "fail"
    assert checks["app_git_config"]["status"] == "fail"
    assert "enabled git commit requires" in checks["app_git_config"]["message"]


def test_preflight_fails_for_unsupported_git_strategy(tmp_path):
    import subprocess

    from harness.config import HarnessConfig
    from harness.harness import init, save_planned_state
    from harness.models.state import SprintContract, SuccessCriterion
    from harness.preflight import run_preflight

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.workspace.git.enabled = True
    cfg.workspace.git.strategy = "everything"
    cfg.workspace.git.push = False
    cfg.workspace.git.remote_url = "git@github.com:example/orbits.git"
    init(tmp_path, cfg)
    save_planned_state(
        tmp_path,
        cfg,
        "# SPEC\n\n## Sprint Definitions\n",
        [
            SprintContract(
                sprint_number=1,
                goal="Git config",
                success_criteria=[SuccessCriterion(id="SC-1", description="Unsupported strategy is rejected.")],
                evidence={"routes": ["/"]},
                confirmed=True,
            )
        ],
    )
    app_repo = tmp_path / "repos/orbits"
    subprocess.run(["git", "config", "user.email", "orbit@example.local"], cwd=app_repo, check=True)
    subprocess.run(["git", "config", "user.name", "Orbit Harness"], cwd=app_repo, check=True)
    subprocess.run(["git", "add", "--", "."], cwd=app_repo, check=True)
    subprocess.run(["git", "commit", "-m", "test: baseline"], cwd=app_repo, check=True, capture_output=True, text=True)

    report = run_preflight(
        tmp_path,
        cfg,
        browser_check=lambda: {"available": True, "message": "chromium ok"},
        runner_check=lambda cfg: {"available": True, "required": [], "missing": []},
    )

    checks = {check["name"]: check for check in report["checks"]}
    assert report["status"] == "fail"
    assert checks["app_git_config"]["status"] == "fail"
    assert "Unsupported git strategy" in checks["app_git_config"]["message"]


def test_agent_runtime_check_requires_configured_codex_and_claude(monkeypatch):
    from harness.config import HarnessConfig
    from harness.preflight import check_agent_runtimes

    cfg = HarnessConfig.load(Path("harness/config.yaml"))

    monkeypatch.setattr("harness.preflight.shutil.which", lambda name: None)
    monkeypatch.setattr("harness.preflight.importlib.util.find_spec", lambda name: None)

    result = check_agent_runtimes(cfg)

    missing = {(entry["role"], entry["runtime"]) for entry in result["missing"]}
    assert result["available"] is False
    assert ("planner", "claude_agent_sdk") in missing
    assert ("generator", "codex") in missing
    assert ("evaluator", "claude_agent_sdk") in missing
    assert ("verifier", "codex") in missing


def test_preflight_reports_app_branch_mismatch(tmp_path):
    from harness.config import HarnessConfig
    from harness.harness import init
    from harness.preflight import run_preflight

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    init(tmp_path, cfg)
    cfg.workspace.git.branch = "release"

    report = run_preflight(
        tmp_path,
        cfg,
        browser_check=lambda: {"available": True, "message": "chromium ok"},
        runner_check=lambda cfg: {"available": True, "required": [], "missing": []},
    )

    checks = {check["name"]: check for check in report["checks"]}
    assert checks["app_git_branch"]["status"] == "warning"
    assert checks["app_git_branch"]["details"]["current_branch"] == "main"
    assert checks["app_git_branch"]["details"]["configured_branch"] == "release"


def test_preflight_fails_app_branch_mismatch_when_push_enabled(tmp_path):
    from harness.config import HarnessConfig
    from harness.harness import init
    from harness.preflight import run_preflight

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    init(tmp_path, cfg)
    cfg.workspace.git.branch = "release"
    cfg.workspace.git.push = True

    report = run_preflight(
        tmp_path,
        cfg,
        browser_check=lambda: {"available": True, "message": "chromium ok"},
        runner_check=lambda cfg: {"available": True, "required": [], "missing": []},
    )

    checks = {check["name"]: check for check in report["checks"]}
    assert report["status"] == "fail"
    assert checks["app_git_branch"]["status"] == "fail"


def test_preflight_report_is_written_under_harness_state(tmp_path):
    from harness.config import HarnessConfig
    from harness.preflight import write_preflight_report

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    report = {"status": "warning", "checks": []}

    report_path = write_preflight_report(tmp_path, cfg, report)

    assert report_path == tmp_path / "harness-state/preflight/preflight.json"
    assert report_path.read_text().startswith("{")


def test_preflight_report_falls_back_when_artifact_root_escapes_project(tmp_path):
    from harness.config import HarnessConfig
    from harness.preflight import write_preflight_report

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.workspace.artifact_root = "../escaped-state"
    report = {"status": "fail", "checks": []}

    report_path = write_preflight_report(tmp_path, cfg, report)

    assert report_path == tmp_path / "harness-state/preflight/preflight.json"
    assert not (tmp_path.parent / "escaped-state").exists()


def test_preflight_report_falls_back_when_artifact_root_overlaps_app_repo(tmp_path):
    from harness.config import HarnessConfig
    from harness.preflight import write_preflight_report

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.workspace.artifact_root = "repos/orbits/harness-state"
    report = {"status": "fail", "checks": []}

    report_path = write_preflight_report(tmp_path, cfg, report)

    assert report_path == tmp_path / "harness-state/preflight/preflight.json"
    assert not (tmp_path / "repos/orbits/harness-state").exists()


def test_preflight_gate_allows_warnings_and_writes_report(tmp_path):
    import subprocess

    from harness.config import HarnessConfig
    from harness.harness import enforce_preflight, init

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    init(tmp_path, cfg)
    app_repo = tmp_path / "repos/orbits"
    subprocess.run(["git", "config", "user.email", "orbit@example.local"], cwd=app_repo, check=True)
    subprocess.run(["git", "config", "user.name", "Orbit Harness"], cwd=app_repo, check=True)
    subprocess.run(["git", "add", "--", "."], cwd=app_repo, check=True)
    subprocess.run(["git", "commit", "-m", "test: baseline"], cwd=app_repo, check=True, capture_output=True, text=True)

    report = enforce_preflight(
        tmp_path,
        cfg,
        browser_check=lambda: {"available": True, "message": "chromium ok"},
        runner_check=lambda cfg: {"available": True, "required": [], "missing": []},
    )

    assert report["status"] == "warning"
    assert (tmp_path / "harness-state/preflight/preflight.json").exists()


def test_preflight_gate_blocks_failures_and_writes_report(tmp_path):
    import pytest

    from harness.config import HarnessConfig
    from harness.harness import enforce_preflight, init

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    init(tmp_path, cfg)

    with pytest.raises(RuntimeError, match="Preflight failed"):
        enforce_preflight(
            tmp_path,
            cfg,
            browser_check=lambda: {"available": False, "message": "chromium missing"},
            runner_check=lambda cfg: {"available": True, "required": [], "missing": []},
        )

    report_path = tmp_path / "harness-state/preflight/preflight.json"
    assert report_path.exists()
    assert '"status": "fail"' in report_path.read_text()


def test_evaluator_and_verifier_read_iteration_scoped_evidence(tmp_path, monkeypatch):
    from harness.agents.evaluator import run_evaluator
    from harness.agents.verifier import run_verifier
    from harness.config import HarnessConfig
    from harness.models.state import SprintContract, SuccessCriterion

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.agents.evaluator.backend = "codex"
    cfg.agents.verifier.backend = "codex"
    contract = SprintContract(
        sprint_number=1,
        goal="Use current evidence",
        success_criteria=[SuccessCriterion(id="SC-1", description="Current iteration evidence is visible.")],
    )
    evidence_dir = tmp_path / "harness-state/evidence/sprint-1/iter-2"
    evidence_dir.mkdir(parents=True)
    (evidence_dir / "evidence.json").write_text('{"marker": "ITERATION_2_EVIDENCE"}')
    (tmp_path / "repos/orbits").mkdir(parents=True)
    captured = {}

    def fake_eval_codex(prompt, agent_cfg, cwd=None, timeout=900):
        captured["eval_prompt"] = prompt
        return """```json
{
  "contract_results": [{"id": "SC-1", "status": "pass", "evidence": "marker"}],
  "rubric_scores": {"C1": 4},
  "feedback": "ok"
}
```"""

    def fake_verify_codex(prompt, agent_cfg, cwd=None, timeout=900):
        captured["verify_prompt"] = prompt
        return """```json
{
  "scores": {"clarity": 4, "trust": 4, "efficiency": 4, "delight": 4},
  "issues": [],
  "feedback": "ok"
}
```"""

    monkeypatch.setattr("harness.agents.evaluator.run_codex", fake_eval_codex)
    monkeypatch.setattr("harness.agents.verifier.run_codex", fake_verify_codex)

    run_evaluator("SPEC", contract, "http://localhost:3000", cfg=cfg, project_dir=tmp_path, evidence_dir=evidence_dir)
    run_verifier("PRODUCT", contract, "http://localhost:3000", cfg=cfg, project_dir=tmp_path, evidence_dir=evidence_dir)

    assert "ITERATION_2_EVIDENCE" in captured["eval_prompt"]
    assert "ITERATION_2_EVIDENCE" in captured["verify_prompt"]


def test_run_evaluator_fails_bogus_evidence_citation(tmp_path, monkeypatch):
    from harness.agents.evaluator import run_evaluator
    from harness.config import HarnessConfig
    from harness.models.state import SprintContract, SuccessCriterion

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.agents.evaluator.backend = "codex"
    contract = SprintContract(
        sprint_number=1,
        goal="Require real evidence citations",
        success_criteria=[SuccessCriterion(id="SC-1", description="Page status is cited from evidence.")],
    )
    evidence_dir = tmp_path / "harness-state/evidence/sprint-1/iter-1"
    evidence_dir.mkdir(parents=True)
    (evidence_dir / "evidence.json").write_text('{"navigation": {"/": {"status": 200}}}')
    (tmp_path / "repos/orbits").mkdir(parents=True)

    def fake_eval_codex(prompt, agent_cfg, cwd=None, timeout=900):
        return """```json
{
  "contract_results": [{"id": "SC-1", "status": "pass", "evidence": "navigation./missing.status"}],
  "rubric_scores": {"C1": 5, "C2": 5, "C3": 5, "C4": 5, "C5": 5},
  "feedback": "Bogus citation should not pass."
}
```"""

    monkeypatch.setattr("harness.agents.evaluator.run_codex", fake_eval_codex)

    result = run_evaluator("SPEC", contract, "http://localhost:3000", cfg=cfg, project_dir=tmp_path, evidence_dir=evidence_dir)

    assert result.verdict == "fail"
    assert result.contract_results[0].status == "fail"


def test_run_evaluator_fails_pass_citation_to_failed_command_evidence(tmp_path, monkeypatch):
    import json

    from harness.agents.evaluator import run_evaluator
    from harness.config import HarnessConfig
    from harness.models.state import SprintContract, SuccessCriterion

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.agents.evaluator.backend = "codex"
    contract = SprintContract(
        sprint_number=1,
        goal="Require passing command evidence",
        success_criteria=[SuccessCriterion(id="SC-1", description="Declared test command passes.")],
    )
    evidence_dir = tmp_path / "harness-state/evidence/sprint-1/iter-1"
    evidence_dir.mkdir(parents=True)
    (evidence_dir / "evidence.json").write_text(
        json.dumps(
            {
                "commands": {
                    "test": {
                        "cmd": ["npm", "test"],
                        "returncode": 1,
                        "timed_out": False,
                        "missing_executable": False,
                    }
                }
            }
        )
    )
    (tmp_path / "repos/orbits").mkdir(parents=True)

    def fake_eval_codex(prompt, agent_cfg, cwd=None, timeout=900):
        return """```json
{
  "contract_results": [{"id": "SC-1", "status": "pass", "evidence": "commands.test.returncode"}],
  "rubric_scores": {"C1": 5, "C2": 5, "C3": 5, "C4": 5, "C5": 5},
  "feedback": "Failed command evidence must not support a pass."
}
```"""

    monkeypatch.setattr("harness.agents.evaluator.run_codex", fake_eval_codex)

    result = run_evaluator("SPEC", contract, "http://localhost:3000", cfg=cfg, project_dir=tmp_path, evidence_dir=evidence_dir)

    assert result.verdict == "fail"
    assert result.contract_results[0].status == "fail"


def test_run_evaluator_fails_pass_citation_to_http_error_evidence(tmp_path, monkeypatch):
    import json

    from harness.agents.evaluator import run_evaluator
    from harness.config import HarnessConfig
    from harness.models.state import SprintContract, SuccessCriterion

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.agents.evaluator.backend = "codex"
    contract = SprintContract(
        sprint_number=1,
        goal="Require successful browser evidence",
        success_criteria=[SuccessCriterion(id="SC-1", description="Entry route renders without HTTP errors.")],
    )
    evidence_dir = tmp_path / "harness-state/evidence/sprint-1/iter-1"
    evidence_dir.mkdir(parents=True)
    (evidence_dir / "evidence.json").write_text(
        json.dumps(
            {
                "browser": {
                    "/": {
                        "status": 500,
                        "available": True,
                        "artifact_path": str(evidence_dir / "browser/root.json"),
                    }
                }
            }
        )
    )
    (tmp_path / "repos/orbits").mkdir(parents=True)

    def fake_eval_codex(prompt, agent_cfg, cwd=None, timeout=900):
        return """```json
{
  "contract_results": [{"id": "SC-1", "status": "pass", "evidence": "browser./"}],
  "rubric_scores": {"C1": 5, "C2": 5, "C3": 5, "C4": 5, "C5": 5},
  "feedback": "HTTP error evidence must not support a pass."
}
```"""

    monkeypatch.setattr("harness.agents.evaluator.run_codex", fake_eval_codex)

    result = run_evaluator("SPEC", contract, "http://localhost:3000", cfg=cfg, project_dir=tmp_path, evidence_dir=evidence_dir)

    assert result.verdict == "fail"
    assert result.contract_results[0].status == "fail"


def test_run_evaluator_fails_pass_citation_to_parent_bucket_with_failed_child_evidence(tmp_path, monkeypatch):
    import json

    from harness.agents.evaluator import run_evaluator
    from harness.config import HarnessConfig
    from harness.models.state import SprintContract, SuccessCriterion

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.agents.evaluator.backend = "codex"
    contract = SprintContract(
        sprint_number=1,
        goal="Require successful browser bucket evidence",
        success_criteria=[SuccessCriterion(id="SC-1", description="Browser evidence has no failed child records.")],
    )
    evidence_dir = tmp_path / "harness-state/evidence/sprint-1/iter-1"
    evidence_dir.mkdir(parents=True)
    (evidence_dir / "evidence.json").write_text(
        json.dumps(
            {
                "browser": {
                    "/": {
                        "status": 500,
                        "available": True,
                    }
                }
            }
        )
    )
    (tmp_path / "repos/orbits").mkdir(parents=True)

    def fake_eval_codex(prompt, agent_cfg, cwd=None, timeout=900):
        return """```json
{
  "contract_results": [{"id": "SC-1", "status": "pass", "evidence": "browser"}],
  "rubric_scores": {"C1": 5, "C2": 5, "C3": 5, "C4": 5, "C5": 5},
  "feedback": "Parent bucket with failed child evidence must not support a pass."
}
```"""

    monkeypatch.setattr("harness.agents.evaluator.run_codex", fake_eval_codex)

    result = run_evaluator("SPEC", contract, "http://localhost:3000", cfg=cfg, project_dir=tmp_path, evidence_dir=evidence_dir)

    assert result.verdict == "fail"
    assert result.contract_results[0].status == "fail"


def test_run_evaluator_allows_pass_citation_to_expected_http_error_api_evidence(tmp_path, monkeypatch):
    import json

    from harness.agents.evaluator import run_evaluator
    from harness.config import HarnessConfig
    from harness.models.state import SprintContract, SuccessCriterion

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.agents.evaluator.backend = "codex"
    contract = SprintContract(
        sprint_number=1,
        goal="Require expected API error evidence",
        success_criteria=[SuccessCriterion(id="SC-1", description="Unauthorized API path returns the expected error status.")],
    )
    evidence_dir = tmp_path / "harness-state/evidence/sprint-1/iter-1"
    evidence_dir.mkdir(parents=True)
    (evidence_dir / "evidence.json").write_text(
        json.dumps(
            {
                "api": {
                    "unauthorized": {
                        "status": 404,
                        "expected_status": 404,
                        "passed": True,
                    }
                }
            }
        )
    )
    (tmp_path / "repos/orbits").mkdir(parents=True)

    def fake_eval_codex(prompt, agent_cfg, cwd=None, timeout=900):
        return """```json
{
  "contract_results": [{"id": "SC-1", "status": "pass", "evidence": "api.unauthorized"}],
  "rubric_scores": {"C1": 5, "C2": 5, "C3": 5, "C4": 5, "C5": 5},
  "feedback": "Expected API error evidence may support a pass."
}
```"""

    monkeypatch.setattr("harness.agents.evaluator.run_codex", fake_eval_codex)

    result = run_evaluator("SPEC", contract, "http://localhost:3000", cfg=cfg, project_dir=tmp_path, evidence_dir=evidence_dir)

    assert result.verdict == "pass"
    assert result.contract_results[0].status == "pass"


def test_build_eval_result_accepts_source_file_citation_with_dotted_filename():
    from harness.agents.evaluator import build_eval_result_from_grade
    from harness.models.state import SprintContract, SuccessCriterion

    contract = SprintContract(
        sprint_number=1,
        goal="Source evidence",
        success_criteria=[SuccessCriterion(id="SC-1", description="Source file evidence is cited.")],
        confirmed=True,
    )
    grade = {
        "contract_results": [
            {"id": "SC-1", "status": "pass", "evidence": "source_files.app/page.jsx"}
        ],
        "rubric_scores": {"C1": 4, "C2": 4, "C3": 4, "C4": 4, "C5": 4},
        "feedback": "Source evidence resolves.",
    }
    evidence_data = {
        "source_files": {
            "app/page.jsx": {
                "artifact_path": "harness-state/evidence/sprint-1/iter-1/source/app/page.jsx",
                "missing": False,
            }
        }
    }

    result = build_eval_result_from_grade(grade, contract, 3.0, 2.0, evidence_data=evidence_data)

    assert result.verdict == "pass"
    assert result.contract_results[0].status == "pass"


def test_build_eval_result_accepts_source_artifact_alias_citation():
    from harness.agents.evaluator import build_eval_result_from_grade
    from harness.models.state import SprintContract, SuccessCriterion

    contract = SprintContract(
        sprint_number=4,
        goal="Source alias evidence",
        success_criteria=[SuccessCriterion(id="SC-1", description="Source file evidence is cited.")],
        confirmed=True,
    )
    grade = {
        "contract_results": [
            {
                "id": "SC-1",
                "status": "pass",
                "evidence": "source/shared/errors/app-error.ts exports typed error codes.",
            }
        ],
        "rubric_scores": {"C1": 4, "C2": 4, "C3": 4, "C4": 4, "C5": 4},
        "feedback": "Source evidence resolves.",
    }
    evidence_data = {
        "source_files": {
            "shared/errors/app-error.ts": {
                "artifact_path": "harness-state/evidence/sprint-4/iter-1/source/shared/errors/app-error.ts",
                "missing": False,
            }
        }
    }

    result = build_eval_result_from_grade(grade, contract, 3.0, 2.0, evidence_data=evidence_data)

    assert result.verdict == "pass"
    assert result.contract_results[0].status == "pass"


def test_build_eval_result_accepts_source_files_slash_citation_with_dotted_filename():
    from harness.agents.evaluator import build_eval_result_from_grade
    from harness.models.state import SprintContract, SuccessCriterion

    contract = SprintContract(
        sprint_number=6,
        goal="Source slash evidence",
        success_criteria=[SuccessCriterion(id="SC-1", description="Mock registry evidence is cited.")],
        confirmed=True,
    )
    grade = {
        "contract_results": [
            {
                "id": "SC-1",
                "status": "pass",
                "evidence": "source_files/shared/mock/registry.ts (missing=false)",
            }
        ],
        "rubric_scores": {"C1": 4, "C2": 4, "C3": 4, "C4": 4, "C5": 4},
        "feedback": "Source evidence resolves.",
    }
    evidence_data = {
        "source_files": {
            "shared/mock/registry.ts": {
                "artifact_path": "harness-state/runs/run/sprint-6/iter-1/source/shared/mock/registry.ts",
                "missing": False,
            }
        }
    }

    result = build_eval_result_from_grade(grade, contract, 3.0, 2.0, evidence_data=evidence_data)

    assert result.verdict == "pass"
    assert result.contract_results[0].status == "pass"


def test_build_eval_result_accepts_browser_artifact_slug_citation():
    from harness.agents.evaluator import build_eval_result_from_grade
    from harness.models.state import SprintContract, SuccessCriterion

    contract = SprintContract(
        sprint_number=6,
        goal="Browser artifact slug evidence",
        success_criteria=[SuccessCriterion(id="SC-1", description="Browser evidence is cited by artifact slug.")],
        confirmed=True,
    )
    grade = {
        "contract_results": [
            {
                "id": "SC-1",
                "status": "pass",
                "evidence": "browser/dev-foundation-mock-registry.json text confirms getMockFixtureVariant",
            }
        ],
        "rubric_scores": {"C1": 4, "C2": 4, "C3": 4, "C4": 4, "C5": 4},
        "feedback": "Browser evidence resolves.",
    }
    evidence_data = {
        "browser": {
            "/dev/foundation/mock-registry": {
                "artifact_path": "harness-state/runs/run/sprint-6/iter-1/browser/dev-foundation-mock-registry.json",
                "route": "/dev/foundation/mock-registry",
                "passed": True,
                "viewports": [],
            }
        }
    }

    result = build_eval_result_from_grade(grade, contract, 3.0, 2.0, evidence_data=evidence_data)

    assert result.verdict == "pass"
    assert result.contract_results[0].status == "pass"


def test_build_eval_result_accepts_prose_evidence_citation():
    from harness.agents.evaluator import build_eval_result_from_grade
    from harness.models.state import SprintContract, SuccessCriterion

    contract = SprintContract(
        sprint_number=1,
        goal="Prose evidence",
        success_criteria=[
            SuccessCriterion(id="SC-1", description="Source files are present."),
            SuccessCriterion(id="SC-2", description="Commands pass."),
            SuccessCriterion(id="SC-3", description="Source files stay in the app repo."),
        ],
        confirmed=True,
    )
    grade = {
        "contract_results": [
            {
                "id": "SC-1",
                "status": "pass",
                "evidence": "source_files: package.json, app/page.tsx, tests/smoke.test.tsx all missing=false",
            },
            {
                "id": "SC-2",
                "status": "pass",
                "evidence": "commands/test returncode 0 and commands/build returncode 0",
            },
            {
                "id": "SC-3",
                "status": "pass",
                "evidence": "All source_files.* artifacts are under repos/orbits",
            },
        ],
        "rubric_scores": {"C1": 4, "C2": 4, "C3": 4, "C4": 4, "C5": 4},
        "feedback": "Prose evidence still contains resolvable paths.",
    }
    evidence_data = {
        "source_files": {
            "package.json": {"missing": False},
            "app/page.tsx": {"missing": False},
            "tests/smoke.test.tsx": {"missing": False},
        },
        "commands": {
            "test": {"returncode": 0},
            "build": {"returncode": 0},
        },
    }

    result = build_eval_result_from_grade(grade, contract, 3.0, 2.0, evidence_data=evidence_data)

    assert result.verdict == "pass"
    assert [item.status for item in result.contract_results] == ["pass", "pass", "pass"]


def test_build_eval_result_corrects_fail_status_when_api_probe_evidence_passes():
    from harness.agents.evaluator import build_eval_result_from_grade
    from harness.models.state import SprintContract, SuccessCriterion

    contract = SprintContract(
        sprint_number=4,
        goal="API envelope",
        success_criteria=[
            SuccessCriterion(
                id="SC-1",
                description="Health APIs return success and deterministic failure envelopes.",
            )
        ],
        confirmed=True,
    )
    grade = {
        "contract_results": [
            {
                "id": "SC-1",
                "status": "fail",
                "evidence": (
                    "api probe api-envelope-apperror-and-feature-mode_1 "
                    "(GET /api/health -> 200 with success envelope, passed:true) and "
                    "api probe api-envelope-apperror-and-feature-mode_2 "
                    "(GET /api/health/error -> 500 with deterministic failure envelope, passed:true)."
                ),
            }
        ],
        "rubric_scores": {"C1": 4, "C2": 4, "C3": 4, "C4": 4, "C5": 4},
        "feedback": "All success criteria pass; no failures to fix.",
    }
    evidence_data = {
        "api": {
            "api-envelope-apperror-and-feature-mode_1": {
                "status": 200,
                "expected_status": 200,
                "passed": True,
            },
            "api-envelope-apperror-and-feature-mode_2": {
                "status": 500,
                "expected_status": 500,
                "passed": True,
            },
        }
    }

    result = build_eval_result_from_grade(grade, contract, 3.0, 2.0, evidence_data=evidence_data)

    assert result.verdict == "pass"
    assert result.contract_results[0].status == "pass"


def test_build_eval_result_corrects_fail_status_when_source_evidence_passes_and_feedback_says_all_pass():
    from harness.agents.evaluator import build_eval_result_from_grade
    from harness.models.state import SprintContract, SuccessCriterion

    contract = SprintContract(
        sprint_number=4,
        goal="API runtime boundary",
        success_criteria=[
            SuccessCriterion(
                id="SC-2",
                description="shared/errors/app-error.ts exports typed error codes and HTTP status mapping.",
            )
        ],
        confirmed=True,
    )
    grade = {
        "contract_results": [
            {
                "id": "SC-2",
                "status": "fail",
                "evidence": (
                    "source/shared/errors/app-error.ts exports APP_ERROR_CODES, "
                    "AppError, toAppError(), getHttpStatusForAppErrorCode(), "
                    "and APP_ERROR_HTTP_STATUS."
                ),
            }
        ],
        "rubric_scores": {"C1": 4, "C2": 4, "C3": 4, "C4": 4, "C5": 4},
        "feedback": "All five success criteria pass. The shared error map is coherent and aligned.",
    }
    evidence_data = {
        "source_files": {
            "shared/errors/app-error.ts": {
                "artifact_path": "harness-state/runs/run/sprint-4/iter-1/source/shared/errors/app-error.ts",
                "missing": False,
            }
        }
    }

    result = build_eval_result_from_grade(grade, contract, 3.0, 2.0, evidence_data=evidence_data)

    assert result.verdict == "pass"
    assert result.contract_results[0].status == "pass"


def test_build_eval_result_does_not_treat_no_raw_evidence_ids_as_missing_evidence():
    from harness.agents.evaluator import build_eval_result_from_grade
    from harness.models.state import SprintContract, SuccessCriterion

    contract = SprintContract(
        sprint_number=75,
        goal="Contact intake polish",
        success_criteria=[
            SuccessCriterion(
                id="SC-3",
                description=(
                    "Readable source labels are visible while raw IDs such as evidence:*, "
                    "source:*, and queue:* stay only inside details."
                ),
            )
        ],
        confirmed=True,
    )
    grade = {
        "contract_results": [
            {
                "id": "SC-3",
                "status": "fail",
                "evidence": (
                    "Main flow labels read 'Manual note from climate founders dinner', "
                    "'Card from robotics investor salon', and 'QR badge from Climate founders dinner' "
                    "with no evidence:*/source:*/queue:* raw IDs in primary narrative; "
                    "diagnostic raw fields only appear in collapsed details."
                ),
            }
        ],
        "rubric_scores": {"C1": 4, "C2": 4, "C3": 4, "C4": 4, "C5": 4},
        "feedback": "All five success criteria pass with consistent evidence. Raw IDs are contained to diagnostic details.",
    }
    evidence_data = {
        "browser": {
            "/app/contacts/new": {
                "passed": True,
                "text_excerpt": (
                    "Manual note from climate founders dinner. Card from robotics investor salon. "
                    "QR badge from Climate founders dinner. Source record details evidence:manual-note-kenji."
                ),
            }
        }
    }

    result = build_eval_result_from_grade(grade, contract, 3.0, 2.0, evidence_data=evidence_data)

    assert result.verdict == "pass"
    assert result.contract_results[0].status == "pass"


def test_evaluator_run_async_timeout_does_not_wait_for_slow_coroutine():
    import asyncio
    import time

    import pytest

    from harness.agents.evaluator import _run_async

    async def slow_operation():
        await asyncio.sleep(0.4)

    started = time.monotonic()
    with pytest.raises(TimeoutError):
        _run_async(slow_operation(), timeout=0.01)

    assert time.monotonic() - started < 0.2


def test_planner_run_async_timeout_does_not_wait_for_slow_coroutine():
    import asyncio
    import time

    import pytest

    from harness.agents.planner import _run_async

    async def slow_operation():
        await asyncio.sleep(0.4)

    started = time.monotonic()
    with pytest.raises(TimeoutError):
        _run_async(slow_operation(), timeout=0.01)

    assert time.monotonic() - started < 0.2


def test_build_eval_result_corrects_fail_status_when_artifacts_stay_under_harness_state():
    from harness.agents.evaluator import build_eval_result_from_grade
    from harness.models.state import SprintContract, SuccessCriterion

    contract = SprintContract(
        sprint_number=68,
        goal="Mock loop acceptance",
        success_criteria=[
            SuccessCriterion(
                id="SC-4",
                description=(
                    "Acceptance artifacts are recorded under harness-state/runs and no evidence "
                    "artifacts are written into repos/orbits."
                ),
            )
        ],
        confirmed=True,
    )
    grade = {
        "contract_results": [
            {
                "id": "SC-4",
                "status": "fail",
                "evidence": (
                    "All evidence paths located under "
                    "/Volumes/ORICO/Projects/orbit/harness-state/runs/run/sprint-68/iter-2/ "
                    "(commands/, navigation/, browser/, api/, source/, screenshots/); "
                    "no evidence artifacts referenced under repos/orbits."
                ),
            }
        ],
        "rubric_scores": {"C1": 4, "C2": 4, "C3": 4, "C4": 4, "C5": 4},
        "feedback": "All five success criteria pass. SC-4 keeps all artifacts under harness-state/runs.",
    }
    evidence_data = {
        "commands": {
            "test": {
                "returncode": 0,
                "stdout_path": "/Volumes/ORICO/Projects/orbit/harness-state/runs/run/sprint-68/iter-2/commands/test.stdout.txt",
            }
        },
        "browser": {
            "/app": {
                "artifact_path": "/Volumes/ORICO/Projects/orbit/harness-state/runs/run/sprint-68/iter-2/browser/app.json",
                "screenshot_path": "/Volumes/ORICO/Projects/orbit/harness-state/runs/run/sprint-68/iter-2/screenshots/app.png",
            }
        },
    }

    result = build_eval_result_from_grade(grade, contract, 3.0, 2.0, evidence_data=evidence_data)

    assert result.verdict == "pass"
    assert result.contract_results[0].status == "pass"


def test_build_eval_result_corrects_fail_status_when_prose_evidence_matches_collected_data():
    from harness.agents.evaluator import build_eval_result_from_grade
    from harness.models.state import SprintContract, SuccessCriterion

    contract = SprintContract(
        sprint_number=16,
        goal="Manual contact creation mock",
        success_criteria=[
            SuccessCriterion(
                id="SC-2",
                description="Mock service avoids external providers and live writes.",
            )
        ],
        confirmed=True,
    )
    grade = {
        "contract_results": [
            {
                "id": "SC-2",
                "status": "fail",
                "evidence": (
                    'API response excerpt shows duplicateCheck.mode="mock-rule", '
                    "duplicateCheck.externalLookupExecuted=false, "
                    "contactWriteExecuted/duplicateLookupExecuted stay false per page text; "
                    'provenance.generationMethod="fixture", '
                    'privacy="demo-manual-contact-creation-only"; '
                    "no real Supabase/database/auth/OCR/email/calendar/AI/notifications code path invoked."
                ),
            }
        ],
        "rubric_scores": {"C1": 4, "C2": 4, "C3": 4, "C4": 4, "C5": 4},
        "feedback": "All five success criteria pass. Build, lint, and test all exit 0.",
    }
    evidence_data = {
        "api": {
            "manual-contact-creation-mock_1": {
                "json": {
                    "duplicateCheck": {
                        "mode": "mock-rule",
                        "externalLookupExecuted": False,
                    },
                    "provenance": {
                        "generationMethod": "fixture",
                        "privacy": "demo-manual-contact-creation-only",
                    },
                }
            }
        },
        "browser": {
            "/dev/capabilities/manual-contact-creation-mock": {
                "text_excerpt": "contactWriteExecuted and duplicateLookupExecuted false"
            }
        },
    }

    result = build_eval_result_from_grade(grade, contract, 3.0, 2.0, evidence_data=evidence_data)

    assert result.verdict == "pass"
    assert result.contract_results[0].status == "pass"


def test_build_eval_result_corrects_fail_status_for_mock_action_without_external_side_effects():
    from harness.agents.evaluator import build_eval_result_from_grade
    from harness.models.state import SprintContract, SuccessCriterion

    contract = SprintContract(
        sprint_number=58,
        goal="Compose profile route",
        success_criteria=[
            SuccessCriterion(
                id="SC-3",
                description="The page exposes the core user action for this route against mock services.",
            )
        ],
        confirmed=True,
    )
    grade = {
        "contract_results": [
            {
                "id": "SC-3",
                "status": "fail",
                "evidence": (
                    "Browser snapshot shows 'Complete intro-channel task' button with form inputs "
                    "(preferredIntroChannels checkboxes, hidden action input); page copy confirms "
                    "'This local task previews a manual profile editor patch only; it does not save "
                    "the profile or call external providers' and 'Provenance confirms this preview "
                    "does not connect auth, storage, OCR, AI, notifications, email, calendar, or "
                    "external message providers'"
                ),
            }
        ],
        "rubric_scores": {"C1": 4, "C2": 4, "C3": 4, "C4": 4, "C5": 4},
        "feedback": (
            "All five success criteria pass with rubric average 4.0. "
            "The page includes provenance copy explicitly disclaiming live provider connections. "
            "No failures to report."
        ),
    }
    evidence_data = {
        "browser": {
            "/app/profile": {
                "passed": True,
                "text_excerpt": (
                    "This local task previews a manual profile editor patch only; it does not save "
                    "the profile or call external providers. Complete intro-channel task. "
                    "Provenance confirms this preview does not connect auth, storage, OCR, AI, "
                    "notifications, email, calendar, or external message providers."
                ),
                "buttons": ["Complete intro-channel task"],
                "inputs": [
                    {"name": "preferredIntroChannels", "type": "checkbox"},
                    {"name": "action", "type": "hidden"},
                ],
            }
        }
    }

    result = build_eval_result_from_grade(grade, contract, 3.0, 2.0, evidence_data=evidence_data)

    assert result.verdict == "pass"
    assert result.contract_results[0].status == "pass"


def test_build_eval_result_corrects_fail_status_for_mock_boundary_false_safety_flags():
    from harness.agents.evaluator import build_eval_result_from_grade
    from harness.models.state import SprintContract, SuccessCriterion

    contract = SprintContract(
        sprint_number=20,
        goal="Event attendee import mock",
        success_criteria=[
            SuccessCriterion(
                id="SC-2",
                description="Mock implementation never calls organizer feeds or live writes.",
            )
        ],
        confirmed=True,
    )
    grade = {
        "contract_results": [
            {
                "id": "SC-2",
                "status": "fail",
                "evidence": (
                    "Dev page flags: ORGANIZER FEED REQUEST=false, CONTACT WRITES=false, "
                    "NOTIFICATIONS=false, BULK DATABASE IMPORTS=false. API probe response confirms "
                    "organizerFeedRequested=false, bulkDatabaseImportExecuted=false, "
                    "externalLookupExecuted=false, databaseWriteExecuted=false. Mock service file present."
                ),
            }
        ],
        "rubric_scores": {"C1": 4, "C2": 4, "C3": 4, "C4": 4, "C5": 4},
        "feedback": (
            "All five success criteria satisfied with strong evidence. "
            "Mock boundary correctly pins organizer feed, contact write, notification, "
            "and bulk database import flags to false."
        ),
    }
    evidence_data = {
        "api": {
            "event-attendee-import-mock_1": {
                "status": 200,
                "passed": True,
                "json": {
                    "organizerFeedRequested": False,
                    "bulkDatabaseImportExecuted": False,
                    "externalLookupExecuted": False,
                    "databaseWriteExecuted": False,
                },
            }
        },
        "browser": {
            "/dev/capabilities/event-attendee-import-mock": {
                "passed": True,
                "text_excerpt": (
                    "ORGANIZER FEED REQUEST=false CONTACT WRITES=false "
                    "NOTIFICATIONS=false BULK DATABASE IMPORTS=false"
                ),
            }
        },
        "source_files": {
            "features/acquisition/mock-event-attendee-import-service.ts": {"missing": False}
        },
    }

    result = build_eval_result_from_grade(grade, contract, 3.0, 2.0, evidence_data=evidence_data)

    assert result.verdict == "pass"
    assert result.contract_results[0].status == "pass"


def test_build_eval_result_corrects_fail_status_when_sprint_contract_satisfied_and_provider_flags_false():
    from harness.agents.evaluator import build_eval_result_from_grade
    from harness.models.state import SprintContract, SuccessCriterion

    contract = SprintContract(
        sprint_number=31,
        goal="Event CRUD and import mock",
        success_criteria=[
            SuccessCriterion(
                id="SC-2",
                description=(
                    "The mock implementation replaces calendar sync, organizer feeds, and live event database writes "
                    "with deterministic fixtures and never calls external services."
                ),
            )
        ],
        confirmed=True,
    )
    grade = {
        "contract_results": [
            {
                "id": "SC-2",
                "status": "fail",
                "evidence": (
                    "api.event-crud-and-import-mock_1/2/3 responses show calendarSyncRequested:false, "
                    "organizerFeedRequested:false, liveDatabaseWriteExecuted:false, externalNetworkRequested:false, "
                    "aiProviderRequested:false, emailProviderRequested:false, notificationDelivered:false; "
                    "browser.text_excerpt shows 'CALENDAR PROVIDER false / ORGANIZER FEED false / "
                    "LIVE DATABASE WRITES false / NOTIFICATIONS false'; mock-execution flags match contract"
                ),
            }
        ],
        "rubric_scores": {"C1": 4, "C2": 4, "C3": 4, "C4": 4, "C5": 4},
        "feedback": (
            "Sprint contract satisfied. Mock execution flags (calendar/organizer/live-db/ai/email/notification) "
            "are explicitly false in both API responses and the dev page ledger."
        ),
    }
    evidence_data = {
        "api": {
            "event-crud-and-import-mock_1": {
                "status": 200,
                "passed": True,
                "json": {
                    "mockExecution": {
                        "calendarSyncRequested": False,
                        "organizerFeedRequested": False,
                        "liveDatabaseWriteExecuted": False,
                        "externalNetworkRequested": False,
                        "aiProviderRequested": False,
                        "emailProviderRequested": False,
                        "notificationDelivered": False,
                    }
                },
            }
        },
        "browser": {
            "/dev/capabilities/event-crud-and-import-mock": {
                "passed": True,
                "text_excerpt": (
                    "CALENDAR PROVIDER false / ORGANIZER FEED false / "
                    "LIVE DATABASE WRITES false / NOTIFICATIONS false"
                ),
            }
        },
    }

    result = build_eval_result_from_grade(grade, contract, 3.5, 3.0, evidence_data=evidence_data)

    assert result.verdict == "pass"
    assert result.contract_results[0].status == "pass"


def test_build_eval_result_keeps_expected_false_mock_boundary_pass_with_prose_evidence():
    from harness.agents.evaluator import build_eval_result_from_grade
    from harness.models.state import SprintContract, SuccessCriterion

    contract = SprintContract(
        sprint_number=22,
        goal="Email and calendar relationship signal mock",
        success_criteria=[
            SuccessCriterion(
                id="SC-2",
                description="Mock implementation never calls external email, calendar, sync, or database services.",
            )
        ],
        confirmed=True,
    )
    grade = {
        "contract_results": [
            {
                "id": "SC-2",
                "status": "pass",
                "evidence": (
                    "dev page text 'MOCK EXECUTION: message body ingestion false; background sync false; "
                    "provider calls false' and 'PROVIDER CALLS false; MESSAGE BODY INGESTION false; "
                    "BACKGROUND SYNC false; DATABASE WRITES false'; permission objects include "
                    "mailboxSyncExecuted=false and deviceCalendarReadExecuted=false; evidence.excerpts "
                    "and capturedFields are fixture-driven with messageBodyIngested=false"
                ),
            }
        ],
        "rubric_scores": {"C1": 4, "C2": 4, "C3": 4, "C4": 4, "C5": 4},
        "feedback": (
            "All five success criteria pass with evidence from collected JSON. "
            "Mock-only execution confirmed by permission/evidence flags."
        ),
    }
    evidence_data = {
        "api": {
            "email-and-calendar-relationship-signal-mock_1": {
                "status": 200,
                "passed": True,
                "json": {
                    "data": {
                        "signals": [
                            {
                                "permission": {
                                    "mailboxSyncExecuted": False,
                                    "deviceCalendarReadExecuted": False,
                                },
                                "evidence": [
                                    {
                                        "capturedFields": {
                                            "messageBodyIngested": False,
                                        },
                                        "excerpts": ["Header and subject fixture"],
                                    }
                                ],
                            }
                        ]
                    }
                },
            }
        },
        "browser": {
            "/dev/capabilities/email-and-calendar-relationship-signal-mock": {
                "passed": True,
                "text_excerpt": (
                    "MOCK EXECUTION: message body ingestion false; background sync false; "
                    "provider calls false; PROVIDER CALLS false; MESSAGE BODY INGESTION false; "
                    "BACKGROUND SYNC false; DATABASE WRITES false"
                ),
            }
        },
    }

    result = build_eval_result_from_grade(grade, contract, 3.0, 2.0, evidence_data=evidence_data)

    assert result.verdict == "pass"
    assert result.contract_results[0].status == "pass"


def test_build_eval_result_keeps_fail_when_embedded_api_probe_evidence_fails():
    from harness.agents.evaluator import build_eval_result_from_grade
    from harness.models.state import SprintContract, SuccessCriterion

    contract = SprintContract(
        sprint_number=4,
        goal="API envelope",
        success_criteria=[
            SuccessCriterion(
                id="SC-1",
                description="Health APIs return success and deterministic failure envelopes.",
            )
        ],
        confirmed=True,
    )
    grade = {
        "contract_results": [
            {
                "id": "SC-1",
                "status": "fail",
                "evidence": (
                    "api probe api-envelope-apperror-and-feature-mode_1 "
                    "(GET /api/health -> 200 with success envelope, passed:true) and "
                    "api probe api-envelope-apperror-and-feature-mode_2 "
                    "(GET /api/health/error -> 500 with deterministic failure envelope, passed:true)."
                ),
            }
        ],
        "rubric_scores": {"C1": 4, "C2": 4, "C3": 4, "C4": 4, "C5": 4},
        "feedback": "All success criteria pass; no failures to fix.",
    }
    evidence_data = {
        "api": {
            "api-envelope-apperror-and-feature-mode_1": {
                "status": 200,
                "expected_status": 200,
                "passed": True,
            },
            "api-envelope-apperror-and-feature-mode_2": {
                "status": 500,
                "expected_status": 200,
                "passed": False,
            },
        }
    }

    result = build_eval_result_from_grade(grade, contract, 3.0, 2.0, evidence_data=evidence_data)

    assert result.verdict == "fail"
    assert result.contract_results[0].status == "fail"


def test_build_eval_result_prefers_longest_source_file_key_match():
    from harness.agents.evaluator import build_eval_result_from_grade
    from harness.models.state import SprintContract, SuccessCriterion

    contract = SprintContract(
        sprint_number=1,
        goal="Source evidence",
        success_criteria=[SuccessCriterion(id="SC-1", description="Source file evidence is cited.")],
        confirmed=True,
    )
    grade = {
        "contract_results": [
            {"id": "SC-1", "status": "pass", "evidence": "source_files.app/page.jsx"}
        ],
        "rubric_scores": {"C1": 4, "C2": 4, "C3": 4, "C4": 4, "C5": 4},
        "feedback": "Source evidence resolves.",
    }
    evidence_data = {
        "source_files": {
            "app/page": {"jsx": {"missing": True}},
            "app/page.jsx": {
                "artifact_path": "harness-state/evidence/sprint-1/iter-1/source/app/page.jsx",
                "missing": False,
            },
        }
    }

    result = build_eval_result_from_grade(grade, contract, 3.0, 2.0, evidence_data=evidence_data)

    assert result.verdict == "pass"
    assert result.contract_results[0].status == "pass"


def test_build_verification_result_accepts_issue_source_citation_with_dotted_filename():
    from harness.agents.verifier import build_verification_result_from_review

    review = {
        "scores": {"clarity": 4, "trust": 4, "efficiency": 4, "delight": 4},
        "issues": [
            {
                "id": "UX-1",
                "severity": "low",
                "user_impact": "Minor source-backed concern.",
                "evidence": "source_files.app/page.jsx",
                "recommendation": "Tighten copy.",
            }
        ],
        "feedback": "Valid source citation.",
    }
    evidence_data = {
        "source_files": {
            "app/page.jsx": {
                "artifact_path": "harness-state/evidence/sprint-1/iter-1/source/app/page.jsx",
                "missing": False,
            }
        }
    }

    result = build_verification_result_from_review(
        review,
        pass_threshold=3.5,
        conditional_pass_threshold=3.0,
        evidence_available=True,
        evidence_data=evidence_data,
    )

    assert result.verdict == "pass"
    assert [issue.id for issue in result.issues] == ["UX-1"]


def test_build_verification_result_accepts_api_response_excerpt_json_citation():
    from harness.agents.verifier import build_verification_result_from_review

    review = {
        "scores": {"clarity": 5, "trust": 5, "efficiency": 4, "delight": 4},
        "issues": [
            {
                "id": "UX-1",
                "severity": "low",
                "user_impact": "Mock-to-live guidance is referential.",
                "evidence": "api.api-envelope-apperror-and-feature-mode_1.response_excerpt.boundary.mockToLive",
                "recommendation": "Inline the accepted runtime values.",
            }
        ],
        "feedback": "Valid API response excerpt citation.",
    }
    evidence_data = {
        "api": {
            "api-envelope-apperror-and-feature-mode_1": {
                "passed": True,
                "response_excerpt": (
                    '{"success":true,"data":{"boundary":'
                    '{"mockToLive":"Switch providers through ORBIT_FEATURE_MODE."}}}'
                ),
            }
        }
    }

    result = build_verification_result_from_review(
        review,
        pass_threshold=3.5,
        conditional_pass_threshold=3.0,
        evidence_available=True,
        evidence_data=evidence_data,
    )

    assert result.verdict == "pass"
    assert [issue.id for issue in result.issues] == ["UX-1"]


def test_build_verification_result_accepts_browser_snapshot_shorthand_citations():
    from harness.agents.verifier import build_verification_result_from_review

    review = {
        "scores": {"clarity": 4, "trust": 4, "efficiency": 4, "delight": 4},
        "issues": [
            {
                "id": "UX-1",
                "severity": "low",
                "user_impact": "The developer route has no links.",
                "evidence": (
                    "browser./dev/foundation/domain.snapshot.links is empty; "
                    "browser./dev/foundation/domain.snapshot.text lists DTO names"
                ),
                "recommendation": "Add source links.",
            }
        ],
        "feedback": "Valid browser snapshot shorthand citation.",
    }
    evidence_data = {
        "browser": {
            "/dev/foundation/domain": {
                "status": 200,
                "viewports": [
                    {
                        "name": "desktop",
                        "snapshot": {
                            "text": "Shared domain contract lists ContactDTO and RelationshipEvidenceDTO.",
                            "links": [],
                            "buttons": [],
                        },
                    }
                ],
            }
        }
    }

    result = build_verification_result_from_review(
        review,
        pass_threshold=3.5,
        conditional_pass_threshold=3.0,
        evidence_available=True,
        evidence_data=evidence_data,
    )

    assert result.verdict == "pass"
    assert [issue.id for issue in result.issues] == ["UX-1"]


def test_build_verification_result_accepts_browser_snapshot_alias_citation():
    from harness.agents.verifier import build_verification_result_from_review

    review = {
        "scores": {"clarity": 4, "trust": 4, "efficiency": 4, "delight": 4},
        "issues": [
            {
                "id": "UX-1",
                "severity": "low",
                "user_impact": "The route has no direct source links.",
                "evidence": (
                    "browser./dev/foundation/domain.snapshot.links is empty; "
                    "browser./dev/foundation/domain.snapshot.buttons is empty"
                ),
                "recommendation": "Add source links.",
            },
            {
                "id": "UX-2",
                "severity": "low",
                "user_impact": "The route is abstract.",
                "evidence": "browser./dev/foundation/domain.snapshot.text lists DTO names but no example instance.",
                "recommendation": "Add an example.",
            },
        ],
        "feedback": "Valid browser snapshot alias citations.",
    }
    evidence_data = {
        "browser": {
            "/dev/foundation/domain": {
                "status": 200,
                "available": True,
                "viewports": [
                    {
                        "name": "mobile",
                        "snapshot": {
                            "text": "Shared domain contract ContactDTO ConnectionDTO",
                            "links": [],
                            "buttons": [],
                        },
                    }
                ],
            }
        }
    }

    result = build_verification_result_from_review(
        review,
        pass_threshold=3.5,
        conditional_pass_threshold=3.0,
        evidence_available=True,
        evidence_data=evidence_data,
    )

    assert result.verdict == "pass"
    assert [issue.id for issue in result.issues] == ["UX-1", "UX-2"]


def test_build_verification_result_accepts_browser_snapshot_text_excerpt_alias():
    from harness.agents.verifier import build_verification_result_from_review

    review = {
        "scores": {"clarity": 4, "trust": 4, "efficiency": 4, "delight": 4},
        "issues": [
            {
                "id": "UX-1",
                "severity": "low",
                "user_impact": "The route repeats technical labels.",
                "evidence": (
                    "browser./app/dashboard.snapshot.text_excerpt repeatedly shows "
                    '"Technical provenance IDs"'
                ),
                "recommendation": "Use calmer source labels.",
            }
        ],
        "feedback": "Valid browser snapshot text excerpt alias citation.",
    }
    evidence_data = {
        "browser": {
            "/app/dashboard": {
                "status": 200,
                "available": True,
                "viewports": [
                    {
                        "name": "desktop",
                        "snapshot": {
                            "text": "Technical provenance IDs appear after source sections.",
                            "links": [],
                            "buttons": [],
                        },
                    }
                ],
            }
        }
    }

    result = build_verification_result_from_review(
        review,
        pass_threshold=3.5,
        conditional_pass_threshold=3.0,
        evidence_available=True,
        evidence_data=evidence_data,
    )

    assert result.verdict == "pass"
    assert [issue.id for issue in result.issues] == ["UX-1"]


def test_build_verification_result_accepts_prose_issue_citations():
    from harness.agents.verifier import build_verification_result_from_review

    review = {
        "scores": {"clarity": 4, "trust": 4, "efficiency": 4, "delight": 4},
        "issues": [
            {
                "id": "UX-1",
                "severity": "low",
                "user_impact": "The cited browser text is weak.",
                "evidence": "browser./.viewports.desktop.snapshot.buttons=[]",
                "recommendation": "Improve the page state.",
            },
            {
                "id": "UX-2",
                "severity": "low",
                "user_impact": "Axe found a heading issue.",
                "evidence": "axe./.violations[0]: id='h1-missing'",
                "recommendation": "Use a semantic h1.",
            },
        ],
        "feedback": "Valid prose citations.",
    }
    evidence_data = {
        "browser": {
            "/": {
                "status": 200,
                "available": True,
                "text_excerpt": "sample text",
                "viewports": [
                    {"name": "desktop", "snapshot": {"buttons": []}},
                ],
            }
        },
        "axe": {
            "/": {
                "available": True,
                "violations": [{"id": "h1-missing"}],
            }
        },
    }

    result = build_verification_result_from_review(
        review,
        pass_threshold=3.5,
        conditional_pass_threshold=3.0,
        evidence_available=True,
        evidence_data=evidence_data,
    )

    assert result.verdict == "pass"
    assert [issue.id for issue in result.issues] == ["UX-1", "UX-2"]


def test_run_verifier_fails_without_collected_evidence(tmp_path, monkeypatch):
    from harness.agents.verifier import run_verifier
    from harness.config import HarnessConfig
    from harness.models.state import SprintContract, SuccessCriterion

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.agents.verifier.backend = "codex"
    contract = SprintContract(
        sprint_number=1,
        goal="Require verifier evidence",
        success_criteria=[SuccessCriterion(id="SC-1", description="Verifier sees current evidence.")],
    )
    evidence_dir = tmp_path / "harness-state/evidence/sprint-1/iter-1"
    evidence_dir.mkdir(parents=True)
    (evidence_dir / "evidence.json").write_text("{}")
    (tmp_path / "repos/orbits").mkdir(parents=True)

    def fake_verify_codex(prompt, agent_cfg, cwd=None, timeout=900):
        return """```json
{
  "scores": {"clarity": 5, "trust": 5, "efficiency": 5, "delight": 5},
  "issues": [],
  "feedback": "High scores without evidence should not pass."
}
```"""

    monkeypatch.setattr("harness.agents.verifier.run_codex", fake_verify_codex)

    result = run_verifier("PRODUCT", contract, "http://localhost:3000", cfg=cfg, project_dir=tmp_path, evidence_dir=evidence_dir)

    assert result.verdict == "fail"
    assert result.experience_average == 0.0
    assert result.issues[0].id == "UX-EVIDENCE"


def test_run_verifier_fails_bogus_issue_evidence_citation(tmp_path, monkeypatch):
    from harness.agents.verifier import run_verifier
    from harness.config import HarnessConfig
    from harness.models.state import SprintContract, SuccessCriterion

    cfg = HarnessConfig.load(Path("harness/config.yaml"))
    cfg.agents.verifier.backend = "codex"
    contract = SprintContract(
        sprint_number=1,
        goal="Require verifier issue evidence",
        success_criteria=[SuccessCriterion(id="SC-1", description="Verifier cites current evidence.")],
    )
    evidence_dir = tmp_path / "harness-state/evidence/sprint-1/iter-1"
    evidence_dir.mkdir(parents=True)
    (evidence_dir / "evidence.json").write_text('{"browser": {"/": {"text_excerpt": "Current page"}}}')
    (tmp_path / "repos/orbits").mkdir(parents=True)

    def fake_verify_codex(prompt, agent_cfg, cwd=None, timeout=900):
        return """```json
{
  "scores": {"clarity": 5, "trust": 5, "efficiency": 5, "delight": 5},
  "issues": [
    {
      "id": "UX-1",
      "severity": "low",
      "user_impact": "The cited artifact does not exist.",
      "evidence": "browser./missing.text_excerpt",
      "recommendation": "Use real current evidence."
    }
  ],
  "feedback": "Bogus issue citation should not pass."
}
```"""

    monkeypatch.setattr("harness.agents.verifier.run_codex", fake_verify_codex)

    result = run_verifier("PRODUCT", contract, "http://localhost:3000", cfg=cfg, project_dir=tmp_path, evidence_dir=evidence_dir)

    assert result.verdict == "fail"
    assert result.experience_average == 0.0
    assert result.issues[0].id == "UX-EVIDENCE-CITATION"


def test_verifier_accepts_browser_route_query_issue_evidence():
    from harness.agents.verifier import build_verification_result_from_review

    review = {
        "scores": {"clarity": 4, "trust": 4, "efficiency": 4, "delight": 4},
        "issues": [
            {
                "id": "UX-1",
                "severity": "low",
                "user_impact": "Recovery actions compete with persistent shortcuts.",
                "evidence": (
                    "browser./app?scenario=failure.links shows 'Add a relationship source' before "
                    "'Return to relationship cockpit'; browser./app?scenario=pending.viewports[0].snapshot.text "
                    "mentions the pending source queue."
                ),
                "recommendation": "Prioritize state-specific recovery actions.",
            }
        ],
        "feedback": "Low severity issue should not be converted into citation failure.",
    }
    evidence_data = {
        "browser": {
            "/app?scenario=failure": {
                "viewports": [
                    {
                        "name": "mobile",
                        "snapshot": {
                            "links": [
                                {"href": "/app/contacts/new", "text": "Add a relationship source"},
                                {"href": "/app", "text": "Return to relationship cockpit"},
                            ],
                            "text": "Return to relationship cockpit.",
                        },
                    }
                ]
            },
            "/app?scenario=pending": {
                "viewports": [
                    {
                        "name": "mobile",
                        "snapshot": {
                            "links": [{"href": "/app", "text": "Return to relationship cockpit"}],
                            "text": "The pending source queue is still being checked.",
                        },
                    }
                ]
            },
        }
    }

    result = build_verification_result_from_review(
        review,
        pass_threshold=3.5,
        conditional_pass_threshold=3.0,
        evidence_available=True,
        evidence_data=evidence_data,
    )

    assert result.verdict == "pass"
    assert result.experience_average == 4.0
    assert [issue.id for issue in result.issues] == ["UX-1"]
