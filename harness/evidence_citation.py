from __future__ import annotations

import json
import re
from typing import Any


EVIDENCE_ROOT_KEYS = ("commands", "navigation", "browser", "axe", "lighthouse", "api", "source_files")


def _select_from_list(items: list[Any], selector: str) -> Any | None:
    if selector.isdigit():
        index = int(selector)
        if 0 <= index < len(items):
            return items[index]
        return None
    for item in items:
        if not isinstance(item, dict):
            continue
        if any(str(item.get(key)) == selector for key in ("name", "id", "key", "route")):
            return item
    return None


def _resolve_key_with_selector(current: Any, key: str) -> Any | None:
    selector = None
    base_key = key
    match = re.fullmatch(r"(.+)\[([^\]]+)\]", key)
    if match:
        base_key = match.group(1)
        selector = match.group(2)

    if isinstance(current, dict):
        if base_key in current:
            value = current[base_key]
        else:
            value = _resolve_artifact_slug_alias(current, base_key)
            if value is None:
                return None
    elif isinstance(current, list):
        value = current if not base_key else _select_from_list(current, base_key)
    else:
        return None

    if value is None:
        return None
    if selector is None:
        return value
    if isinstance(value, list):
        return _select_from_list(value, selector)
    return None


def _safe_route_name(route_key: str) -> str:
    cleaned = route_key.strip("/") or "root"
    return "".join(char if char.isalnum() or char in {"-", "_"} else "-" for char in cleaned)


def _artifact_basename(value: Any) -> str | None:
    if not isinstance(value, dict):
        return None
    artifact_path = value.get("artifact_path")
    if not isinstance(artifact_path, str) or not artifact_path:
        return None
    return artifact_path.rsplit("/", 1)[-1]


def _resolve_artifact_slug_alias(current: dict[str, Any], key: str) -> Any | None:
    normalized = key.strip().strip("/")
    if not normalized:
        return None
    without_json = normalized[:-5] if normalized.endswith(".json") else normalized
    for record_key, record in current.items():
        if _artifact_basename(record) == normalized:
            return record
        if not isinstance(record_key, str):
            continue
        safe_name = _safe_route_name(record_key)
        if without_json == safe_name or without_json == f"{safe_name}-smoke":
            return record
    return None


def _parse_json_container(value: Any) -> Any | None:
    if not isinstance(value, str):
        return None
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        return None
    if isinstance(parsed, (dict, list)):
        return parsed
    return None


SNAPSHOT_ALIAS_KEYS = {
    "buttons",
    "headings",
    "inputs",
    "links",
    "overflow",
    "text",
    "text_excerpt",
    "title",
    "viewport",
}
SNAPSHOT_KEY_ALIASES = {"text_excerpt": "text"}


def _normalize_snapshot_parts(parts: list[str]) -> list[str]:
    if not parts:
        return parts
    aliased = SNAPSHOT_KEY_ALIASES.get(parts[0])
    if aliased is None:
        return parts
    return [aliased, *parts[1:]]


def _resolve_viewport_snapshot_alias(current: Any, parts: list[str]) -> list[Any] | None:
    if not parts or not isinstance(current, dict):
        return None
    if parts[0] == "snapshot":
        snapshot_parts = _normalize_snapshot_parts(parts[1:])
    elif parts[0] in SNAPSHOT_ALIAS_KEYS:
        snapshot_parts = _normalize_snapshot_parts(parts)
    else:
        return None
    viewports = current.get("viewports")
    if not isinstance(viewports, list):
        return None
    for viewport in viewports:
        if not isinstance(viewport, dict):
            continue
        snapshot = viewport.get("snapshot")
        if snapshot is None:
            continue
        snapshot_values = _resolve_parts(snapshot, snapshot_parts)
        if snapshot_values is not None:
            return [current, viewport, *snapshot_values]
    return None


def _resolve_parts(current: Any, parts: list[str]) -> list[Any] | None:
    if not parts:
        return [current]
    for end in range(len(parts), 0, -1):
        key = ".".join(parts[:end])
        child = _resolve_key_with_selector(current, key)
        if child is None:
            continue
        child_values = _resolve_parts(child, parts[end:])
        if child_values is not None:
            return [current, *child_values]
    snapshot_values = _resolve_viewport_snapshot_alias(current, parts)
    if snapshot_values is not None:
        return snapshot_values
    parsed = _parse_json_container(current)
    if parsed is not None:
        parsed_values = _resolve_parts(parsed, parts)
        if parsed_values is not None:
            return [current, *parsed_values]
        descendant_values = _resolve_parts_from_descendant(parsed, parts)
        if descendant_values is not None:
            return [current, *descendant_values]
    return None


def _resolve_parts_from_descendant(current: Any, parts: list[str]) -> list[Any] | None:
    direct_values = _resolve_parts(current, parts)
    if direct_values is not None:
        return direct_values
    if isinstance(current, dict):
        for child in current.values():
            child_values = _resolve_parts_from_descendant(child, parts)
            if child_values is not None:
                return [current, *child_values]
    elif isinstance(current, list):
        for child in current:
            child_values = _resolve_parts_from_descendant(child, parts)
            if child_values is not None:
                return [current, *child_values]
    return None


def _strip_terminal_value_assertion(value: str) -> str:
    last_dot = value.rfind(".")
    equals_index = value.find("=", last_dot + 1)
    if equals_index == -1:
        return value
    return value[:equals_index]


def _strip_candidate(value: str) -> str:
    return _strip_terminal_value_assertion(value.strip().strip("`'\"(){}<>:,;."))


def _candidate_paths(citation: str) -> list[str]:
    candidates = [_strip_candidate(citation)]
    root_pattern = "|".join(re.escape(root) for root in EVIDENCE_ROOT_KEYS)
    wildcard_pattern = re.compile(rf"\b({root_pattern})\.\*")
    for match in wildcard_pattern.finditer(citation):
        candidates.append(match.group(1))

    slash_pattern = re.compile(rf"\b({root_pattern})/([A-Za-z0-9_/@.\-\[\]()?=&%]+)")
    for match in slash_pattern.finditer(citation):
        candidates.append(f"{match.group(1)}.{_strip_candidate(match.group(2))}")

    source_alias_pattern = re.compile(r"\bsource/([A-Za-z0-9_/@.\-\[\]()]+)")
    for match in source_alias_pattern.finditer(citation):
        candidates.append(f"source_files.{_strip_candidate(match.group(1))}")

    path_pattern = re.compile(rf"\b({root_pattern})(?:\.[A-Za-z0-9_/@\-\[\]()?=&%]+)+")
    for match in path_pattern.finditer(citation):
        candidates.append(_strip_candidate(match.group(0)))

    bucket_pattern = re.compile(rf"\b({root_pattern})\s*:\s*([^;\n]+)")
    token_pattern = re.compile(r"[A-Za-z0-9_/@\-.()[\]?=&%]+")
    for match in bucket_pattern.finditer(citation):
        root = match.group(1)
        for token in token_pattern.findall(match.group(2)):
            cleaned = _strip_candidate(token)
            if not cleaned or cleaned in EVIDENCE_ROOT_KEYS:
                continue
            candidates.append(f"{root}.{cleaned}")

    for root in EVIDENCE_ROOT_KEYS:
        has_path_reference = re.search(rf"\b{re.escape(root)}(?:[./:]|\.\*)", citation)
        if not has_path_reference and re.search(rf"\b{re.escape(root)}\b", citation):
            candidates.append(root)

    seen: set[str] = set()
    unique: list[str] = []
    for candidate in candidates:
        if candidate and candidate not in seen:
            unique.append(candidate)
            seen.add(candidate)
    return unique


def resolve_evidence_path_values(citation: str, evidence_data: object) -> list[object] | None:
    if not isinstance(evidence_data, dict):
        return None
    for candidate in _candidate_paths(citation):
        parts = candidate.split(".")
        if not parts or any(part == "" for part in parts):
            continue
        values = _resolve_parts(evidence_data, parts)
        if values is not None:
            return values
    return None
