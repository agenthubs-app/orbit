from __future__ import annotations

import json
import re
from pathlib import PurePosixPath
from urllib.parse import unquote, urlsplit

from harness.models.state import SprintContract


_VAGUE_PHRASES = (
    "looks good",
    "works well",
    "handles errors",
    "user friendly",
    "polished",
)

_ALLOWED_EVIDENCE_KEYS = {"routes", "api", "commands", "source_files", "public_routes"}
_ALLOWED_FILE_BOUNDARY_KEYS = {
    "capability_root",
    "owned_paths",
    "allowed_shared_paths",
    "forbidden_paths",
    "mock_to_live_doc",
    "shared_change_policy",
}
_ALLOWED_COMMAND_KEYS = {"name", "cmd"}
_ALLOWED_API_KEYS = {"name", "method", "path", "expectStatus", "expected_status", "body"}
_ALLOWED_COMMAND_EXECUTABLES = {"npm", "pnpm", "yarn", "bun"}
_ALLOWED_API_METHODS = {"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"}
_ALLOWED_SHARED_CHANGE_POLICIES = {"forbidden_unless_explicit", "allowed_for_foundation", "none"}
_SAFE_EVIDENCE_NAME = re.compile(r"^[A-Za-z0-9_-]+$")
_SAFE_PACKAGE_SCRIPT = re.compile(r"^[A-Za-z0-9:_-]+$")
_GLOB_CHARS = set("*?[")
_SOURCE_GLOB_CHARS = set("*?")
_ALLOWED_PACKAGE_SCRIPTS = {"build", "check", "format:check", "lint", "test", "typecheck"}


def _path_has_glob(value: str) -> bool:
    return any(char in value for char in _GLOB_CHARS)


def _source_path_has_glob(value: str) -> bool:
    return any(char in value for char in _SOURCE_GLOB_CHARS)


def _route_template_issue(value: str, decoded_path: str) -> str | None:
    parts = PurePosixPath(decoded_path).parts
    if any(part.startswith(":") or "[" in part or "]" in part for part in parts) or _path_has_glob(decoded_path):
        return f"path must be concrete, not a route template: {value}."
    return None


def _unsafe_source_file_path(value: str) -> str | None:
    path = PurePosixPath(value)
    if path.is_absolute() or any(part == ".." for part in path.parts):
        return f"source_files path must stay inside app root: {value}."
    if "\\" in value:
        return f"source_files path must not contain traversal segments: {value}."
    if path.parts and path.parts[0] == "repos":
        return f"source_files path must be app-relative to app root, not include repo root prefix: {value}."
    if _source_path_has_glob(value):
        return f"source_files path must be concrete, not a glob: {value}."
    return None


def _unsafe_file_boundary_path(value: object, field: str, allow_trailing_glob: bool) -> str | None:
    if not isinstance(value, str) or not value.strip():
        return f"file_boundary.{field} entry must be a non-empty app-relative string."
    parsed = urlsplit(value)
    if parsed.scheme or parsed.netloc:
        return f"file_boundary.{field} path must be app-relative, not external: {value}."
    if "\\" in value:
        return f"file_boundary.{field} path must not contain traversal segments: {value}."
    if value.startswith("/"):
        return f"file_boundary.{field} path must stay inside app root: {value}."
    path_value = value
    if path_value.endswith("/**"):
        if not allow_trailing_glob:
            return f"file_boundary.{field} path must be concrete, not a glob: {value}."
        path_value = path_value[:-3]
        if not path_value:
            return f"file_boundary.{field} path must not be the whole app root: {value}."
    elif _source_path_has_glob(path_value):
        return f"file_boundary.{field} path may only use a trailing /** directory pattern: {value}."
    if (field == "capability_root" or value.endswith("/**")) and ("[" in path_value or "]" in path_value):
        return f"file_boundary.{field} path must identify a stable ownership directory, not a route template: {value}."
    path = PurePosixPath(path_value)
    if path.is_absolute() or any(part == ".." for part in path.parts):
        return f"file_boundary.{field} path must stay inside app root: {value}."
    if path.parts and path.parts[0] == "repos":
        return f"file_boundary.{field} path must be app-relative to app root, not include repo root prefix: {value}."
    if any(part == "" for part in path.parts):
        return f"file_boundary.{field} path must not contain empty path segments: {value}."
    return None


def _append_file_boundary_path_issues(
    issues: list[str],
    file_boundary: dict,
    field: str,
    *,
    allow_trailing_glob: bool = True,
    required: bool = False,
) -> list[str]:
    if field not in file_boundary:
        if required:
            issues.append(f"file_boundary.{field} is required.")
        return []
    values = file_boundary.get(field)
    if not isinstance(values, list):
        issues.append(f"file_boundary.{field} must be a list.")
        return []
    safe_values: list[str] = []
    for value in values:
        issue = _unsafe_file_boundary_path(value, field, allow_trailing_glob=allow_trailing_glob)
        if issue:
            issues.append(issue)
            continue
        assert isinstance(value, str)
        safe_values.append(value)
    _append_duplicate_issues(issues, f"file_boundary.{field}", safe_values)
    return safe_values


def _unsafe_app_relative_path(value: object) -> str | None:
    if not isinstance(value, str) or not value.strip():
        return "path must be a non-empty app-relative string."
    parsed = urlsplit(value)
    if parsed.scheme or parsed.netloc:
        return f"path must be app-relative, not external: {value}."
    if not value.startswith("/"):
        return f"path must start with `/`: {value}."
    decoded_path = unquote(parsed.path)
    if "\\" in decoded_path or any(part == ".." for part in PurePosixPath(decoded_path).parts):
        return f"path must not contain traversal segments: {value}."
    template_issue = _route_template_issue(value, decoded_path)
    if template_issue:
        return template_issue
    return None


def _public_route_prefix(sprint_number: object) -> str:
    if isinstance(sprint_number, int) and not isinstance(sprint_number, bool) and sprint_number > 0:
        return f"/__harness/sprint-{sprint_number}/"
    return "/__harness/sprint-N/"


def _unsafe_public_route(value: object, sprint_number: object) -> str | None:
    path_issue = _unsafe_app_relative_path(value)
    if path_issue:
        return path_issue
    prefix = _public_route_prefix(sprint_number)
    assert isinstance(value, str)
    if not value.startswith(prefix):
        return f"public evidence route must start with `{prefix}`: {value}."
    return None


def _unsafe_command(cmd: object) -> str | None:
    if not isinstance(cmd, list) or not cmd or not all(isinstance(part, str) and part for part in cmd):
        return "commands entry must contain a non-empty list[str] cmd."
    executable = PurePosixPath(cmd[0])
    if executable.is_absolute() or len(executable.parts) > 1:
        return f"commands executable must be a bare tool name: {cmd[0]}."
    if cmd[0] not in _ALLOWED_COMMAND_EXECUTABLES:
        return f"commands executable is not allowed: {cmd[0]}."
    if len(cmd) == 2 and cmd[1] == "test":
        return None
    if len(cmd) == 3 and cmd[1] == "run" and _SAFE_PACKAGE_SCRIPT.fullmatch(cmd[2]) and cmd[2] in _ALLOWED_PACKAGE_SCRIPTS:
        return None
    return f"commands must be one-shot package-manager verification commands: {cmd!r}."


def _invalid_expected_status(value: object) -> str | None:
    if isinstance(value, bool):
        return f"api expected status must be an integer HTTP status: {value!r}."
    if isinstance(value, int):
        status = value
    elif isinstance(value, str) and value.strip().isdigit():
        status = int(value)
    else:
        return f"api expected status must be an integer HTTP status: {value!r}."
    if status < 100 or status > 599:
        return f"api expected status must be between 100 and 599: {value!r}."
    return None


def _unsafe_api_probe(probe: dict) -> list[str]:
    issues: list[str] = []
    method = str(probe.get("method", "GET")).upper()
    if method not in _ALLOWED_API_METHODS:
        issues.append(f"api method is not allowed: {method}.")
    path_issue = _unsafe_app_relative_path(probe.get("path", "/"))
    if path_issue:
        issues.append(f"api {path_issue}")
    status_issue = _invalid_expected_status(probe.get("expectStatus", probe.get("expected_status", 200)))
    if status_issue:
        issues.append(status_issue)
    if "body" in probe:
        try:
            json.dumps(probe["body"])
        except (TypeError, ValueError) as exc:
            issues.append(f"api body must be JSON serializable: {type(exc).__name__}: {exc}.")
    return issues


def _duplicate_values(values: list[str]) -> list[str]:
    seen: set[str] = set()
    duplicates: list[str] = []
    for value in values:
        if value in seen and value not in duplicates:
            duplicates.append(value)
        seen.add(value)
    return duplicates


def _append_duplicate_issues(issues: list[str], evidence_type: str, values: list[str]) -> None:
    for value in _duplicate_values(values):
        issues.append(f"{evidence_type} evidence key is duplicated: {value}.")


def _append_unsupported_entry_key_issues(issues: list[str], evidence_type: str, entry: dict, allowed: set[str]) -> None:
    allowed_text = ", ".join(sorted(allowed))
    for key in entry:
        if not isinstance(key, str):
            issues.append(f"{evidence_type} evidence entry keys must be strings: {key!r}.")
        elif key not in allowed:
            issues.append(f"{evidence_type} evidence entry has unsupported field `{key}`. Allowed fields: {allowed_text}.")


def _invalid_explicit_evidence_name(entry: dict) -> str | None:
    if "name" not in entry:
        return None
    name = entry.get("name")
    if not isinstance(name, str):
        return f"name must be a string: {name!r}."
    if not name.strip():
        return "name must not be empty."
    if not _SAFE_EVIDENCE_NAME.fullmatch(name):
        return f"name must use only letters, numbers, `_`, or `-`: {name!r}."
    return None


def _command_evidence_key(command: dict) -> str | None:
    if _invalid_explicit_evidence_name(command):
        return None
    return str(command.get("name", "command"))


def _api_evidence_key(probe: dict) -> str | None:
    if _invalid_explicit_evidence_name(probe):
        return None
    return str(probe.get("name") or probe.get("path") or "api")


def _evidence_bucket(evidence: dict, key: str, issues: list[str]) -> list:
    if key not in evidence:
        return []
    value = evidence[key]
    if not isinstance(value, list):
        issues.append(f"evidence.{key} must be a list.")
        return []
    return value


def _contract_mentions_mock(contract: SprintContract, source_files: list) -> bool:
    parts: list[str] = []
    goal = getattr(contract, "goal", "")
    if isinstance(goal, str):
        parts.append(goal)
    success_criteria = getattr(contract, "success_criteria", []) or []
    if isinstance(success_criteria, list):
        for criterion in success_criteria:
            description = getattr(criterion, "description", "")
            if isinstance(description, str):
                parts.append(description)
    for source in source_files:
        if isinstance(source, str):
            parts.append(source)
    return "mock" in "\n".join(parts).lower()


def _append_file_boundary_issues(
    issues: list[str],
    contract: SprintContract,
    source_files: list,
) -> None:
    file_boundary = getattr(contract, "file_boundary", None)
    if file_boundary is None:
        return
    if not isinstance(file_boundary, dict):
        issues.append("Contract file_boundary must be an object.")
        return
    if not file_boundary:
        if _contract_mentions_mock(contract, source_files):
            issues.append("Mock contracts must declare file_boundary.mock_to_live_doc for mock-to-live replacement guidance.")
        return
    allowed_text = ", ".join(sorted(_ALLOWED_FILE_BOUNDARY_KEYS))
    for key in file_boundary:
        if not isinstance(key, str):
            issues.append(f"Contract file_boundary keys must be strings: {key!r}.")
        elif key not in _ALLOWED_FILE_BOUNDARY_KEYS:
            issues.append(f"file_boundary has unsupported field `{key}`. Allowed fields: {allowed_text}.")

    capability_root = file_boundary.get("capability_root")
    if capability_root is not None:
        root_issue = _unsafe_file_boundary_path(capability_root, "capability_root", allow_trailing_glob=False)
        if root_issue:
            issues.append(root_issue)
    owned_paths = _append_file_boundary_path_issues(issues, file_boundary, "owned_paths", required=True)
    _append_file_boundary_path_issues(issues, file_boundary, "allowed_shared_paths")
    _append_file_boundary_path_issues(issues, file_boundary, "forbidden_paths")

    policy = file_boundary.get("shared_change_policy")
    if policy is not None and policy not in _ALLOWED_SHARED_CHANGE_POLICIES:
        issues.append(
            "file_boundary.shared_change_policy must be one of "
            f"{sorted(_ALLOWED_SHARED_CHANGE_POLICIES)}: {policy!r}."
        )

    mock_doc = file_boundary.get("mock_to_live_doc")
    if mock_doc is not None:
        doc_issue = _unsafe_file_boundary_path(mock_doc, "mock_to_live_doc", allow_trailing_glob=False)
        if doc_issue:
            issues.append(doc_issue)
        elif isinstance(mock_doc, str) and not mock_doc.lower().endswith((".md", ".mdx")):
            issues.append(f"file_boundary.mock_to_live_doc must be a markdown document path: {mock_doc}.")

    if _contract_mentions_mock(contract, source_files):
        if not isinstance(mock_doc, str) or not mock_doc.strip():
            issues.append("Mock contracts must declare file_boundary.mock_to_live_doc for mock-to-live replacement guidance.")
            return
        if mock_doc not in [source for source in source_files if isinstance(source, str)]:
            issues.append(
                "Mock contracts must list file_boundary.mock_to_live_doc under evidence.source_files: "
                f"{mock_doc}."
            )
        doc_criterion = any(
            isinstance(getattr(criterion, "description", None), str)
            and "mock-to-live" in criterion.description.lower()
            for criterion in (getattr(contract, "success_criteria", []) or [])
        )
        if not doc_criterion:
            issues.append("Mock contracts must include a success criterion for the mock-to-live replacement doc.")
        if owned_paths and not any(
            _file_boundary_pattern_matches(pattern, mock_doc)
            for pattern in owned_paths
            if isinstance(mock_doc, str)
        ):
            issues.append(f"file_boundary.mock_to_live_doc must be covered by owned_paths: {mock_doc}.")


def _file_boundary_pattern_matches(pattern: str, path: str) -> bool:
    normalized_pattern = pattern.strip("/")
    normalized_path = path.strip("/")
    if normalized_pattern.endswith("/**"):
        prefix = normalized_pattern[:-3].rstrip("/")
        return normalized_path == prefix or normalized_path.startswith(f"{prefix}/")
    return normalized_path == normalized_pattern


def _criterion_label(criterion: object, index: int) -> str:
    identifier = getattr(criterion, "id", None)
    if isinstance(identifier, str) and identifier.strip():
        return identifier
    return f"success_criteria[{index}]"


def contract_review_issues(contract: SprintContract) -> list[str]:
    issues: list[str] = []
    sprint_number = getattr(contract, "sprint_number", None)
    if not isinstance(sprint_number, int) or isinstance(sprint_number, bool) or sprint_number <= 0:
        issues.append("Contract sprint_number must be a positive integer.")
    goal = getattr(contract, "goal", None)
    if not isinstance(goal, str) or not goal.strip():
        issues.append("Contract goal must be a non-empty string.")
    out_of_scope = getattr(contract, "out_of_scope", [])
    if not isinstance(out_of_scope, list):
        issues.append("Contract out_of_scope must be a list.")
    else:
        for index, item in enumerate(out_of_scope, start=1):
            if not isinstance(item, str) or not item.strip():
                issues.append(f"Contract out_of_scope[{index}] must be a non-empty string.")
    success_criteria = getattr(contract, "success_criteria", None)
    if not isinstance(success_criteria, list):
        issues.append("Contract success_criteria must be a list.")
        success_criteria = []
    elif not success_criteria:
        issues.append("Contract has no success criteria.")
    if len(success_criteria) > 5:
        issues.append("Contract has more than 5 success criteria.")
    evidence = getattr(contract, "evidence", None)
    if evidence is None:
        evidence = {}
    if not isinstance(evidence, dict):
        issues.append("Contract evidence must be an object.")
        return issues
    for key in evidence:
        if not isinstance(key, str):
            issues.append(f"Contract evidence keys must be strings: {key!r}.")
        elif key not in _ALLOWED_EVIDENCE_KEYS:
            allowed = ", ".join(sorted(_ALLOWED_EVIDENCE_KEYS))
            issues.append(f"Contract has unsupported evidence key `{key}`. Allowed keys: {allowed}.")
    evidence_keys = ("routes", "api", "commands", "source_files")
    if not any(evidence.get(key) for key in evidence_keys):
        issues.append("Contract has no declared evidence surfaces.")
    for index, criterion in enumerate(success_criteria, start=1):
        criterion_id = getattr(criterion, "id", None)
        if not isinstance(criterion_id, str):
            issues.append(f"success_criteria[{index}] id must be a string: {criterion_id!r}.")
        elif not criterion_id.strip():
            issues.append(f"success_criteria[{index}] id must not be empty.")
        description = getattr(criterion, "description", None)
        criterion_label = _criterion_label(criterion, index)
        if not isinstance(description, str):
            issues.append(f"{criterion_label} description must be a string: {description!r}.")
            continue
        if not description.strip():
            issues.append(f"{criterion_label} description must not be empty.")
            continue
        lowered = criterion.description.lower()
        for phrase in _VAGUE_PHRASES:
            if phrase in lowered:
                issues.append(f"{criterion_label}: vague criterion phrase `{phrase}`.")
    source_files = _evidence_bucket(evidence, "source_files", issues)
    commands = _evidence_bucket(evidence, "commands", issues)
    routes = _evidence_bucket(evidence, "routes", issues)
    api_probes = _evidence_bucket(evidence, "api", issues)
    public_routes = _evidence_bucket(evidence, "public_routes", issues)

    for source in source_files:
        if not isinstance(source, str) or not source.strip():
            issues.append(f"source_files entry is invalid: {source!r}.")
            continue
        source_issue = _unsafe_source_file_path(source)
        if source_issue:
            issues.append(source_issue)
    _append_duplicate_issues(
        issues,
        "source_files",
        [source for source in source_files if isinstance(source, str)],
    )
    _append_file_boundary_issues(issues, contract, source_files)
    for command in commands:
        if not isinstance(command, dict):
            issues.append(f"commands entry is invalid: {command!r}.")
            continue
        _append_unsupported_entry_key_issues(issues, "commands", command, _ALLOWED_COMMAND_KEYS)
        name_issue = _invalid_explicit_evidence_name(command)
        if name_issue:
            issues.append(f"commands {name_issue}")
        command_issue = _unsafe_command(command.get("cmd"))
        if command_issue:
            issues.append(command_issue)
    _append_duplicate_issues(
        issues,
        "commands",
        [
            key
            for command in commands
            if isinstance(command, dict)
            for key in [_command_evidence_key(command)]
            if key is not None
        ],
    )
    for route in routes:
        route_issue = _unsafe_app_relative_path(route)
        if route_issue:
            issues.append(f"routes {route_issue}")
    _append_duplicate_issues(
        issues,
        "routes",
        [route for route in routes if isinstance(route, str)],
    )
    for probe in api_probes:
        if not isinstance(probe, dict):
            issues.append(f"api entry is invalid: {probe!r}.")
            continue
        _append_unsupported_entry_key_issues(issues, "api", probe, _ALLOWED_API_KEYS)
        name_issue = _invalid_explicit_evidence_name(probe)
        if name_issue:
            issues.append(f"api {name_issue}")
        issues.extend(_unsafe_api_probe(probe))
    _append_duplicate_issues(
        issues,
        "api",
        [
            key
            for probe in api_probes
            if isinstance(probe, dict)
            for key in [_api_evidence_key(probe)]
            if key is not None
        ],
    )
    for route in public_routes:
        route_issue = _unsafe_public_route(route, sprint_number)
        if route_issue:
            issues.append(f"public_routes {route_issue}")
    _append_duplicate_issues(
        issues,
        "public_routes",
        [route for route in public_routes if isinstance(route, str)],
    )
    return issues


def assert_contract_reviewed(contract: SprintContract) -> None:
    issues = contract_review_issues(contract)
    if issues:
        joined = "; ".join(issues)
        raise ValueError(f"Contract review failed for sprint {contract.sprint_number}: {joined}")
