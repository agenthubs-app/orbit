from __future__ import annotations

import json
import re
from typing import Any

# 多个 agent 会在自然语言里包 JSON。这里集中处理“从模型输出里找第一个可用 JSON”的问题，
# 让 Planner/Evaluator/Verifier 不需要各自维护一套脆弱的正则解析。

def _decode_json_value(candidate: str) -> Any | None:
    # strict=False 作为兜底，容忍模型偶尔输出未转义控制字符。
    for loader in (json.loads, lambda value: json.loads(value, strict=False)):
        try:
            return loader(candidate)
        except Exception:
            continue
    return None


def _json_values(output: str) -> list[Any]:
    # 优先解析 fenced ```json block，再扫描正文中的裸 JSON object。
    # 这样既支持严格 prompt，也兼容模型在 JSON 前后加说明文字。
    values: list[Any] = []
    fenced_candidates = [
        match.group(1).strip()
        for match in re.finditer(r"```(?:json)?\s*(.*?)```", output, re.DOTALL | re.IGNORECASE)
    ]
    for candidate in fenced_candidates:
        decoded = _decode_json_value(candidate)
        if decoded is not None:
            values.append(decoded)

    decoders = [json.JSONDecoder(), json.JSONDecoder(strict=False)]
    for index, char in enumerate(output):
        if char != "{":
            continue
        for decoder in decoders:
            try:
                decoded, _ = decoder.raw_decode(output[index:])
            except Exception:
                continue
            values.append(decoded)
            break
    return values


def parse_first_json_object(output: str, required_key: str) -> dict[str, Any]:
    # required_key 用来选中目标对象，例如 scores/confident/contracts，避免误读其它 JSON 片段。
    for decoded in _json_values(output):
        if isinstance(decoded, dict) and required_key in decoded:
            return decoded
    raise ValueError(f"No JSON object with required key {required_key!r} found.")


def _looks_like_contract_seed_list(value: list[Any]) -> bool:
    required_keys = {"sprint_number", "goal", "success_criteria"}
    return bool(value) and all(isinstance(item, dict) and required_keys.issubset(item) for item in value)


def parse_first_json_contract_seed_value(output: str) -> dict[str, Any] | list[Any]:
    # Planner contract seed 允许两种形状：{"contracts": [...]} 或直接 [...]。
    for decoded in _json_values(output):
        if isinstance(decoded, dict) and isinstance(decoded.get("contracts"), list):
            return decoded
        if isinstance(decoded, list) and _looks_like_contract_seed_list(decoded):
            return decoded
    raise ValueError("No JSON contract seed object or list found.")
