from __future__ import annotations

import json
import re
from typing import Any


def _decode_json_value(candidate: str) -> Any | None:
    for loader in (json.loads, lambda value: json.loads(value, strict=False)):
        try:
            return loader(candidate)
        except Exception:
            continue
    return None


def _json_values(output: str) -> list[Any]:
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
    for decoded in _json_values(output):
        if isinstance(decoded, dict) and required_key in decoded:
            return decoded
    raise ValueError(f"No JSON object with required key {required_key!r} found.")


def _looks_like_contract_seed_list(value: list[Any]) -> bool:
    required_keys = {"sprint_number", "goal", "success_criteria"}
    return bool(value) and all(isinstance(item, dict) and required_keys.issubset(item) for item in value)


def parse_first_json_contract_seed_value(output: str) -> dict[str, Any] | list[Any]:
    for decoded in _json_values(output):
        if isinstance(decoded, dict) and isinstance(decoded.get("contracts"), list):
            return decoded
        if isinstance(decoded, list) and _looks_like_contract_seed_list(decoded):
            return decoded
    raise ValueError("No JSON contract seed object or list found.")
