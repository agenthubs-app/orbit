"""Harness 日志工具。

这里统一创建 stdout + 文件双写 logger，并提供压缩、脱敏和工具调用描述函数。
runner/agent 可以用这些工具输出可读日志，同时避免把 key/token 等敏感字段写进日志。
"""

from __future__ import annotations

import json
import logging
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

_logger: logging.Logger | None = None


def setup(project_dir: Path, label: str = "run", log_root: str = "harness-logs") -> None:
    """初始化本次 harness run 的日志文件和 stdout handler。"""
    global _logger
    log_dir = project_dir / log_root
    log_dir.mkdir(parents=True, exist_ok=True)
    log_path = log_dir / f"{label}-{datetime.now().strftime('%Y%m%d-%H%M%S')}.log"

    logger = logging.getLogger("orbit-harness")
    logger.handlers.clear()
    logger.setLevel(logging.DEBUG)
    logger.propagate = False

    formatter = logging.Formatter("%(message)s")
    file_handler = logging.FileHandler(log_path, encoding="utf-8")
    file_handler.setFormatter(formatter)
    stdout_handler = logging.StreamHandler(sys.stdout)
    stdout_handler.setFormatter(formatter)
    logger.addHandler(file_handler)
    logger.addHandler(stdout_handler)
    _logger = logger
    logger.info(f"[Harness] Log -> {log_path}")


def get() -> logging.Logger:
    """返回已初始化 logger；如果还未初始化，则创建一个 stdout-only fallback。"""
    if _logger is not None:
        return _logger
    logger = logging.getLogger("orbit-harness")
    if not logger.handlers:
        logger.setLevel(logging.DEBUG)
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(logging.Formatter("%(message)s"))
        logger.addHandler(handler)
    return logger


def compact(value: Any, limit: int = 600) -> str:
    """把任意值转成单行短文本，避免日志被大对象刷屏。"""
    if isinstance(value, str):
        text = value
    else:
        try:
            text = json.dumps(value, ensure_ascii=False, default=str)
        except TypeError:
            text = str(value)
    text = text.replace("\n", "\\n")
    if len(text) <= limit:
        return text
    return text[: max(0, limit - 20)] + "...<truncated>"


def redact(value: Any) -> Any:
    """递归脱敏常见 credential 字段，供日志和工具输入描述使用。"""
    if isinstance(value, dict):
        redacted: dict[str, Any] = {}
        for key, item in value.items():
            lowered = str(key).lower()
            if any(secret in lowered for secret in ["key", "token", "secret", "password", "authorization"]):
                redacted[key] = "<redacted>"
            else:
                redacted[key] = redact(item)
        return redacted
    if isinstance(value, list):
        return [redact(item) for item in value]
    return value


def describe_block(block: Any) -> str:
    """把模型输出 block 或工具调用 block 压缩成人类可读的一行。"""
    block_type = type(block).__name__
    text = getattr(block, "text", None)
    if text:
        return f"{block_type} text={compact(text, 240)}"
    name = getattr(block, "name", None) or getattr(block, "tool_name", None)
    input_value = getattr(block, "input", None)
    if name:
        return f"{block_type} tool={name} input={compact(redact(input_value), 360)}"
    return block_type
