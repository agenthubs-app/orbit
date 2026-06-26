from __future__ import annotations

import asyncio
from pathlib import Path

from harness.claude_runner import build_claude_options
from harness.codex_runner import run_codex
from harness.config import HarnessConfig


def _run_async(coro, timeout: int):
    return asyncio.run(asyncio.wait_for(coro, timeout=timeout))


def run_planner(brief: str, session_id: str | None = None, cfg: HarnessConfig | None = None) -> tuple[str, str | None]:
    cfg = cfg or HarnessConfig.load(Path(__file__).parents[1] / "config.yaml")
    prompt_path = Path(__file__).parents[1] / "prompts" / "planner.md"
    if cfg.agents.planner.backend == "codex":
        prompt = (
            f"{prompt_path.read_text()}\n\n"
            f"Brief:\n{brief}\n\n"
            "Write the complete SPEC now. End with SPEC_COMPLETE."
        )
        reply = run_codex(prompt, cfg.agents.planner, cwd=Path.cwd(), timeout=cfg.loop.planner_timeout_seconds)
        return reply, None
    if cfg.agents.planner.backend not in {"claude", "deepcode"}:
        raise NotImplementedError(f"Unsupported planner backend: {cfg.agents.planner.backend}")
    return _run_async(_run_planner_claude(brief, session_id, cfg), timeout=cfg.loop.planner_timeout_seconds)


async def _run_planner_claude(brief: str, session_id: str | None, cfg: HarnessConfig) -> tuple[str, str | None]:
    from claude_agent_sdk import AssistantMessage, ResultMessage, query

    prompt_path = Path(__file__).parents[1] / "prompts" / "planner.md"
    options = build_claude_options(
        cfg.agents.planner,
        prompt_path.read_text(),
        allowed_tools=[],
        max_turns=cfg.loop.planner_max_turns,
        resume=session_id,
    )
    reply = ""
    new_session_id = session_id
    async for message in query(prompt=brief, options=options):
        if isinstance(message, AssistantMessage):
            for block in message.content:
                text = getattr(block, "text", "")
                if text:
                    reply = text
            new_session_id = getattr(message, "session_id", new_session_id)
        elif isinstance(message, ResultMessage):
            reply = getattr(message, "result", "") or reply
            new_session_id = getattr(message, "session_id", new_session_id)
    return reply, new_session_id
