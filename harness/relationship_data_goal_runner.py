from __future__ import annotations

import argparse
import asyncio
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import subprocess
from typing import Any

from harness import log
from harness.claude_runner import build_claude_options
from harness.config import HarnessConfig, SingleAgentConfig
from harness.git_safety import parse_porcelain_paths
from harness.harness import enforce_preflight, new_run_id, run_sprint
from harness.models.state import EvalResult, HandoffState, SprintContract, SuccessCriterion, VerificationResult
from harness.workspace import file_fingerprint
from harness.workspace import ensure_project_layout


PROJECT_DIR = Path(__file__).resolve().parents[1]
MINIMAX_BASE_URL = "https://api.minimaxi.com/anthropic"
MINIMAX_MODEL = "MiniMax-M3"
DEFAULT_MINIMAX_AGENT_TIMEOUT_SECONDS = 900


@dataclass(frozen=True)
class MockdataCountRanges:
    users: tuple[int, int] = (120, 150)
    events: tuple[int, int] = (10, 12)
    companies: tuple[int, int] = (80, 100)
    participants: tuple[int, int] = (400, 600)
    connections: tuple[int, int] = (800, 1200)
    interactions: tuple[int, int] = (1000, 1500)
    recommendations: tuple[int, int] = (300, 500)
    golden_matches: tuple[int, int] = (100, 200)


CORE_JSON_FILES = {
    "users": "seed/users.seed.json",
    "events": "seed/events.seed.json",
    "participants": "seed/event_participants.seed.json",
    "contacts": "seed/contacts.seed.json",
    "connections": "seed/connections.seed.json",
    "interactions": "seed/interactions.seed.json",
    "ai_analyses": "seed/ai_analyses.seed.json",
    "recommendations": "seed/match_recommendations.seed.json",
    "golden_matches": "tests/golden_matches.json",
    "negative_cases": "tests/negative_cases.json",
    "dirty_cases": "tests/dirty_data_cases.json",
}

REQUIRED_SCENARIO_FILES = [
    f"scenario_{index:02d}_{name}.json"
    for index, name in [
        (1, "jp_restaurant_inbound"),
        (2, "cn_ai_founder_japan_poc"),
        (3, "jp_company_china_market_entry"),
        (4, "investor_founder_matching"),
        (5, "organizer_table_matching"),
        (6, "business_card_profile_generation"),
        (7, "post_event_follow_up"),
        (8, "dormant_relationship_reactivation"),
        (9, "duplicate_contact_merge"),
        (10, "bad_match_filtering"),
    ]
]

GENERIC_GOALS = {
    "meet interesting people",
    "i want to meet interesting people",
    "networking",
    "expand network",
    "想认识有趣的人",
    "拓展人脉",
    "人脉を広げたい",
    "人脈を広げたい",
    "aiに興味があります",
    "ビジネスパートナーを探しています",
}

MISSING_PROJECT_FILE_FINGERPRINT = "<missing>"
SPRINT_82_ALLOWED_WRITE_ROOTS = ("repos/mockdata", "harness-state", "harness-logs")


def _claude_settings_env(settings_path: Path | None = None) -> dict[str, str]:
    path = settings_path or (Path.home() / ".claude" / "settings.json")
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text())
    except json.JSONDecodeError:
        return {}
    env = data.get("env") if isinstance(data, dict) else None
    if not isinstance(env, dict):
        return {}
    return {str(key): str(value) for key, value in env.items() if isinstance(key, str) and isinstance(value, str)}


def build_minimax_env(settings_path: Path | None = None) -> dict[str, str]:
    settings_env = _claude_settings_env(settings_path)
    token = (
        os.environ.get("MINIMAX_API_KEY")
        or os.environ.get("ANTHROPIC_AUTH_TOKEN")
        or settings_env.get("ANTHROPIC_AUTH_TOKEN")
    )
    if not token:
        raise RuntimeError("MINIMAX_API_KEY is required for the MiniMax Claude SDK mockdata sprint.")
    env = dict(os.environ)
    env.update(
        {
            "ANTHROPIC_BASE_URL": MINIMAX_BASE_URL,
            "ANTHROPIC_AUTH_TOKEN": token,
            "ANTHROPIC_MODEL": MINIMAX_MODEL,
            "ANTHROPIC_DEFAULT_SONNET_MODEL": MINIMAX_MODEL,
            "ANTHROPIC_DEFAULT_OPUS_MODEL": MINIMAX_MODEL,
            "ANTHROPIC_DEFAULT_HAIKU_MODEL": MINIMAX_MODEL,
            "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1",
        }
    )
    return env


def redacted_minimax_env(env: dict[str, str]) -> dict[str, str]:
    keys = [
        "ANTHROPIC_BASE_URL",
        "ANTHROPIC_AUTH_TOKEN",
        "ANTHROPIC_MODEL",
        "ANTHROPIC_DEFAULT_SONNET_MODEL",
        "ANTHROPIC_DEFAULT_OPUS_MODEL",
        "ANTHROPIC_DEFAULT_HAIKU_MODEL",
        "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC",
    ]
    redacted: dict[str, str] = {}
    for key in keys:
        if key not in env:
            continue
        redacted[key] = "<set>" if "TOKEN" in key or "KEY" in key else env[key]
    return redacted


def _git_status_paths(project_dir: Path) -> list[str]:
    result = subprocess.run(
        ["git", "status", "--porcelain=v1", "-uall"],
        cwd=project_dir,
        text=True,
        capture_output=True,
    )
    if result.returncode != 0:
        raise RuntimeError((result.stderr or result.stdout).strip() or "git status failed")
    return parse_porcelain_paths(result.stdout)


def _project_file_fingerprint(project_dir: Path, rel_path: str) -> str:
    path = project_dir / rel_path
    return file_fingerprint(path) if path.is_file() else MISSING_PROJECT_FILE_FINGERPRINT


def project_status_fingerprints(project_dir: Path) -> dict[str, str]:
    return {
        path: _project_file_fingerprint(project_dir, path)
        for path in _git_status_paths(project_dir)
    }


def _under_any_allowed_root(path: str, allowed_roots: tuple[str, ...]) -> bool:
    normalized = Path(path).as_posix().strip("/")
    return any(normalized == root or normalized.startswith(f"{root}/") for root in allowed_roots)


def project_write_boundary_violations(
    project_dir: Path,
    baseline_fingerprints: dict[str, str],
    *,
    allowed_roots: tuple[str, ...] = SPRINT_82_ALLOWED_WRITE_ROOTS,
) -> list[str]:
    current = project_status_fingerprints(project_dir)
    violations: list[str] = []
    for path, fingerprint in current.items():
        if _under_any_allowed_root(path, allowed_roots):
            continue
        if baseline_fingerprints.get(path) != fingerprint:
            violations.append(path)
    for path, fingerprint in baseline_fingerprints.items():
        if _under_any_allowed_root(path, allowed_roots):
            continue
        if path not in current and fingerprint != MISSING_PROJECT_FILE_FINGERPRINT:
            violations.append(path)
    return sorted(dict.fromkeys(violations))


def _read_json_array(path: Path, issues: list[str]) -> list[dict[str, Any]]:
    if not path.exists():
        issues.append(f"Missing required JSON file: {path}")
        return []
    try:
        data = json.loads(path.read_text())
    except json.JSONDecodeError as exc:
        issues.append(f"Invalid JSON in {path}: {exc}")
        return []
    if not isinstance(data, list):
        issues.append(f"Expected JSON array in {path}")
        return []
    records: list[dict[str, Any]] = []
    for index, item in enumerate(data, start=1):
        if not isinstance(item, dict):
            issues.append(f"Expected object at {path}[{index}]")
            continue
        records.append(item)
    return records


def _ids(records: list[dict[str, Any]], label: str, issues: list[str]) -> set[str]:
    seen: set[str] = set()
    for index, record in enumerate(records, start=1):
        value = record.get("id")
        if not isinstance(value, str) or not value.strip():
            issues.append(f"{label}[{index}] has no stable string id.")
            continue
        if value in seen:
            issues.append(f"{label} has duplicate id: {value}")
        seen.add(value)
    return seen


def _range_issue(label: str, count: int, expected: tuple[int, int]) -> str | None:
    low, high = expected
    if low <= count <= high:
        return None
    return f"{label} count {count} is outside expected range {low}-{high}."


def _collect_company_count(users: list[dict[str, Any]], contacts: list[dict[str, Any]]) -> int:
    values: set[str] = set()
    for record in users + contacts:
        for key in ("company", "company_id", "organization", "organization_id"):
            value = record.get(key)
            if isinstance(value, str) and value.strip():
                values.add(value.strip())
    return len(values)


def _score_in_range(value: object) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and 0 <= float(value) <= 1


def _string_list(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, str) and item.strip()]


def _check_segment_ratios(users: list[dict[str, Any]], issues: list[str]) -> None:
    if len(users) < 100:
        return
    counts: dict[str, int] = {}
    for user in users:
        segment = str(user.get("segment") or user.get("user_group") or "")
        counts[segment] = counts.get(segment, 0) + 1
    total = len(users)
    expected = {
        "jp_local_business": (0.45, 0.55),
        "jp_chinese_business": (0.25, 0.35),
        "greater_china_business": (0.10, 0.15),
        "international": (0.05, 0.10),
    }
    for segment, (low, high) in expected.items():
        ratio = counts.get(segment, 0) / total
        if not low <= ratio <= high:
            issues.append(f"user segment {segment} ratio {ratio:.2f} is outside expected {low:.2f}-{high:.2f}.")


def _missing_string_fields(record: dict[str, Any], fields: list[str]) -> list[str]:
    return [field for field in fields if not isinstance(record.get(field), str) or not record[field].strip()]


def _contains_placeholder(value: object) -> bool:
    if not isinstance(value, str):
        return False
    lowered = value.lower()
    return any(
        marker in lowered
        for marker in (
            "orbit demo",
            "relationship scenario",
            "demo user",
            "demo company",
            "placeholder",
        )
    )


def _check_generated_multilingual_contacts_and_events(mockdata_dir: Path, issues: list[str]) -> None:
    contacts = _read_json_array(mockdata_dir / "generated/contacts.generated.json", issues)
    events = _read_json_array(mockdata_dir / "generated/events.generated.json", issues)
    contact_fields = ["name_ja", "name_zh", "name_en", "profile_ja", "profile_zh", "profile_en"]
    event_fields = ["title_ja", "title_zh", "title_en", "description_ja", "description_zh", "description_en"]
    for record in contacts:
        missing = _missing_string_fields(record, contact_fields)
        if missing or _contains_placeholder(record.get("display_name")):
            issues.append(
                f"generated contact {record.get('id')} lacks realistic multilingual person info: "
                f"missing={missing}, display_name={record.get('display_name')!r}."
            )
    for record in events:
        missing = _missing_string_fields(record, event_fields)
        if missing or _contains_placeholder(record.get("title")):
            issues.append(
                f"generated event {record.get('id')} lacks realistic multilingual event content: "
                f"missing={missing}, title={record.get('title')!r}."
            )


def validate_relationship_mockdata(
    mockdata_dir: Path,
    *,
    count_ranges: MockdataCountRanges = MockdataCountRanges(),
    require_scenarios: bool = True,
) -> dict[str, Any]:
    issues: list[str] = []
    data = {
        label: _read_json_array(mockdata_dir / relative, issues)
        for label, relative in CORE_JSON_FILES.items()
    }
    if require_scenarios:
        for relative in REQUIRED_SCENARIO_FILES:
            path = mockdata_dir / "scenarios" / relative
            if not path.exists():
                issues.append(f"Missing required scenario file: {path}")

    users = data["users"]
    events = data["events"]
    participants = data["participants"]
    contacts = data["contacts"]
    connections = data["connections"]
    interactions = data["interactions"]
    ai_analyses = data["ai_analyses"]
    recommendations = data["recommendations"]
    golden_matches = data["golden_matches"]
    negative_cases = data["negative_cases"]
    dirty_cases = data["dirty_cases"]

    counts = {
        "users": len(users),
        "events": len(events),
        "companies": _collect_company_count(users, contacts),
        "participants": len(participants),
        "connections": len(connections),
        "interactions": len(interactions),
        "recommendations": len(recommendations),
        "golden_matches": len(golden_matches),
        "negative_cases": len(negative_cases),
        "dirty_cases": len(dirty_cases),
    }
    for label, expected in asdict(count_ranges).items():
        issue = _range_issue(label, counts[label], tuple(expected))
        if issue:
            issues.append(issue)

    user_ids = _ids(users, "users", issues)
    event_ids = _ids(events, "events", issues)
    participant_ids = _ids(participants, "participants", issues)
    contact_ids = _ids(contacts, "contacts", issues)
    connection_ids = _ids(connections, "connections", issues)
    evidence_ids = {
        value
        for records in data.values()
        for record in records
        for value in _string_list(record.get("evidence_ids") or record.get("evidenceIds"))
    }

    for record in participants:
        if record.get("event_id") not in event_ids:
            issues.append(f"event participant {record.get('id')} references missing event {record.get('event_id')}.")
        if record.get("user_id") not in user_ids:
            issues.append(f"event participant {record.get('id')} references missing user {record.get('user_id')}.")
        looking = _string_list(record.get("looking_for_at_event"))
        offering = _string_list(record.get("can_offer_at_event"))
        if not looking or not offering:
            issues.append(f"event participant {record.get('id')} lacks event-specific looking_for/can_offer intent.")
        generic = {item.strip().lower() for item in looking + offering} & {item.lower() for item in GENERIC_GOALS}
        if generic:
            issues.append(f"event participant {record.get('id')} uses generic goal text outside dirty cases: {sorted(generic)}.")

    for record in contacts:
        user_id = record.get("user_id")
        if user_id is not None and user_id not in user_ids:
            issues.append(f"contact {record.get('id')} references missing user {user_id}.")

    for record in connections:
        if record.get("user_id") not in user_ids:
            issues.append(f"connection {record.get('id')} references missing user {record.get('user_id')}.")
        if record.get("contact_id") not in contact_ids:
            issues.append(f"connection {record.get('id')} references missing contact {record.get('contact_id')}.")
        for key in ("relationship_strength", "trust_level", "business_relevance_score"):
            if key in record and not _score_in_range(record[key]):
                issues.append(f"connection {record.get('id')} has invalid {key}: {record[key]!r}.")

    for record in interactions:
        if record.get("connection_id") not in connection_ids:
            issues.append(f"interaction {record.get('id')} references missing connection {record.get('connection_id')}.")

    target_ids = {
        "user": user_ids,
        "event": event_ids,
        "event_participant": participant_ids,
        "contact": contact_ids,
        "connection": connection_ids,
        "recommendation": {record.get("id") for record in recommendations},
    }
    for record in ai_analyses:
        target_type = record.get("target_type")
        target_id = record.get("target_id")
        if target_type in target_ids and target_id not in target_ids[target_type]:
            issues.append(f"AI analysis {record.get('id')} references missing {target_type} {target_id}.")
        if not isinstance(record.get("result_json"), dict):
            issues.append(f"AI analysis {record.get('id')} lacks result_json object.")

    for label, records in [("recommendation", recommendations), ("golden match", golden_matches), ("negative case", negative_cases)]:
        for record in records:
            if record.get("event_id") not in event_ids:
                issues.append(f"{label} {record.get('id')} references missing event {record.get('event_id')}.")
            if record.get("user_id") not in user_ids:
                issues.append(f"{label} {record.get('id')} references missing user {record.get('user_id')}.")
            if record.get("recommended_user_id") not in user_ids:
                issues.append(
                    f"{label} {record.get('id')} references missing recommended_user_id {record.get('recommended_user_id')}."
                )
            if "score" in record and not _score_in_range(record["score"]):
                issues.append(f"{label} {record.get('id')} has invalid score {record['score']!r}.")

    if require_scenarios and len(dirty_cases) < 20:
        issues.append("dirty_data_cases should include at least 20 cases for v1 demo validation.")
    if require_scenarios and not evidence_ids:
        issues.append("Generated data should include evidence_ids/source references on relationship records.")
    _check_segment_ratios(users, issues)
    _check_generated_multilingual_contacts_and_events(mockdata_dir, issues)

    return {
        "passed": not issues,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "mockdata_dir": str(mockdata_dir),
        "counts": counts,
        "issues": issues,
    }


def _write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")


def _project_root_for_mockdata_dir(mockdata_dir: Path) -> Path:
    if mockdata_dir.name == "mockdata" and mockdata_dir.parent.name == "repos":
        return mockdata_dir.parent.parent
    return PROJECT_DIR


def _source_type(value: object) -> str:
    mapping = {
        "business_card": "business_card_ocr",
        "business_card_ocr": "business_card_ocr",
        "calendar": "calendar_signal",
        "email": "email_signal",
        "event": "event_import",
        "event_import": "event_import",
        "manual": "manual",
        "meeting": "manual",
        "referral": "referral",
    }
    return mapping.get(str(value), "manual")


def _preferred_language(value: object) -> str:
    normalized = str(value or "").lower()
    if normalized.startswith("ja"):
        return "ja"
    if normalized.startswith("en"):
        return "en"
    if normalized.startswith("zh"):
        return "zh"
    return "mixed"


def _relationship_stage(index: int) -> str:
    return ["captured", "reviewing", "active", "needs_follow_up", "nurture"][index % 5]


def _relationship_value_types(index: int) -> list[str]:
    values = [
        "strategic_fit",
        "commercial_opportunity",
        "knowledge_exchange",
        "referral_path",
        "community_context",
    ]
    return [values[index % len(values)], values[(index + 2) % len(values)]]


def _relationship_trust_level(score: float) -> str:
    if score >= 0.85:
        return "trusted"
    if score >= 0.65:
        return "warm"
    if score >= 0.45:
        return "emerging"
    return "unverified"


def _as_percentage(score: object) -> int:
    if isinstance(score, (int, float)) and not isinstance(score, bool):
        if 0 <= float(score) <= 1:
            return int(round(float(score) * 100))
        return int(round(float(score)))
    return 50


def _ends_at(starts_at: str) -> str:
    return starts_at.replace("10:00:00", "12:00:00")


def _build_hybrid_runtime_fixture(
    *,
    generated_at: str,
    users: list[dict[str, Any]],
    events: list[dict[str, Any]],
    participants: list[dict[str, Any]],
    contacts: list[dict[str, Any]],
    connections: list[dict[str, Any]],
    interactions: list[dict[str, Any]],
    messages: list[dict[str, Any]],
    ai_analyses: list[dict[str, Any]],
    recommendations: list[dict[str, Any]],
    golden_matches: list[dict[str, Any]],
    negative_cases: list[dict[str, Any]],
    dirty_cases: list[dict[str, Any]],
) -> dict[str, Any]:
    account_id = "account_orbit_generated"
    profile_id = "profile_orbit_generated_operator"
    system_source = {
        "type": "system",
        "id": "source:generated-relationship-fixtures",
        "label": "Generated relationship mockdata fixture",
    }
    evidence: dict[str, dict[str, Any]] = {}

    def add_evidence(
        evidence_id: str,
        *,
        source_type: str,
        source_id: str,
        summary: str,
        confidence: float = 0.9,
        occurred_at: str | None = None,
    ) -> str:
        evidence[evidence_id] = {
            "id": evidence_id,
            "sourceType": _source_type(source_type),
            "sourceId": source_id,
            "summary": summary,
            "occurredAt": occurred_at or generated_at,
            "confidence": confidence,
            "createdBy": profile_id,
        }
        return evidence_id

    contacts_by_user_id = {contact["user_id"]: contact for contact in contacts}
    users_by_id = {user["id"]: user for user in users}

    runtime_contacts = []
    for index, contact in enumerate(contacts, start=1):
        evidence_id = contact["evidence_ids"][0]
        add_evidence(
            evidence_id,
            source_type=contact["source"],
            source_id=contact["id"],
            summary=(
                f"{contact['display_name']} / {contact['name_en']} at {contact['company_name_en']}. "
                f"JA: {contact['profile_ja']} ZH: {contact['profile_zh']} EN: {contact['profile_en']}"
            ),
        )
        runtime_contacts.append(
            {
                "id": contact["id"],
                "displayName": contact["display_name"],
                "organization": contact["company_name_en"],
                "role": contact["role_en"],
                "location": users_by_id[contact["user_id"]]["city"],
                "profileSnippet": f"{contact['profile_ja']} / {contact['profile_zh']} / {contact['profile_en']}",
                "stage": _relationship_stage(index),
                "source": {
                    "type": _source_type(contact["source"]),
                    "id": f"source:{contact['id']}",
                    "label": f"{contact['name_ja']} / {contact['name_zh']} / {contact['name_en']}",
                },
                "evidenceIds": [evidence_id],
                "createdAt": generated_at,
                "updatedAt": generated_at,
            }
        )

    runtime_events = []
    for index, event in enumerate(events, start=1):
        evidence_id = event["evidence_ids"][0]
        add_evidence(
            evidence_id,
            source_type="event_import",
            source_id=event["id"],
            summary=f"JA: {event['description_ja']} ZH: {event['description_zh']} EN: {event['description_en']}",
            confidence=0.94,
            occurred_at=event["starts_at"],
        )
        runtime_events.append(
            {
                "id": event["id"],
                "name": f"{event['title_ja']} / {event['title_en']}",
                "location": event["city"],
                "startsAt": event["starts_at"],
                "endsAt": _ends_at(event["starts_at"]),
                "source": {
                    "type": "event_import",
                    "id": f"source:{event['id']}",
                    "label": f"{event['title_ja']} / {event['title_zh']} / {event['title_en']}",
                },
                "evidenceIds": [evidence_id],
            }
        )

    runtime_attendees = []
    runtime_event_intents = []
    for index, participant in enumerate(participants, start=1):
        user = users_by_id[participant["user_id"]]
        contact = contacts_by_user_id[participant["user_id"]]
        evidence_id = participant["evidence_ids"][0]
        add_evidence(
            evidence_id,
            source_type="event_import",
            source_id=participant["id"],
            summary=(
                f"{contact['display_name']} joined {participant['event_id']} looking for "
                f"{', '.join(participant['looking_for_at_event'])}; can offer "
                f"{', '.join(participant['can_offer_at_event'])}."
            ),
            confidence=0.86,
        )
        source = {
            "type": "event_import",
            "id": f"source:{participant['id']}",
            "label": f"{contact['display_name']} event intent",
        }
        runtime_attendees.append(
            {
                "id": participant["id"],
                "eventId": participant["event_id"],
                "contactId": contact["id"],
                "displayName": contact["display_name"],
                "organization": contact["company_name_en"],
                "role": contact["role_en"],
                "status": "reviewed" if index % 3 == 0 else "imported",
                "source": source,
                "evidenceIds": [evidence_id],
                "createdAt": generated_at,
                "updatedAt": generated_at,
            }
        )
        runtime_event_intents.append(
            {
                "id": f"intent_{index:03d}",
                "eventId": participant["event_id"],
                "attendeeId": participant["id"],
                "contactId": contact["id"],
                "lookingFor": participant["looking_for_at_event"],
                "canOffer": participant["can_offer_at_event"],
                "preferredLanguage": _preferred_language(participant["preferred_language"]),
                "confidence": round(0.72 + (index % 20) / 100, 2),
                "source": source,
                "evidenceIds": [evidence_id],
                "createdAt": generated_at,
                "updatedAt": generated_at,
            }
        )

    runtime_connections = []
    first_connection_by_contact_id: dict[str, dict[str, Any]] = {}
    for index, connection in enumerate(connections, start=1):
        contact = next(item for item in contacts if item["id"] == connection["contact_id"])
        evidence_id = connection["evidence_ids"][0]
        strength = _as_percentage(connection["relationship_strength"])
        relevance = _as_percentage(connection["business_relevance_score"])
        add_evidence(
            evidence_id,
            source_type="manual",
            source_id=connection["id"],
            summary=(
                f"Relationship context for {contact['display_name']}: "
                f"{', '.join(connection['shared_topics'])}; next action {', '.join(connection['suggested_actions'])}."
            ),
            confidence=0.82,
        )
        runtime_connection = {
            "id": connection["id"],
            "accountId": account_id,
            "contactId": connection["contact_id"],
            "stage": _relationship_stage(index + 1),
            "valueTypes": _relationship_value_types(index),
            "summary": f"{contact['display_name']} matches {connection['shared_topics'][0]} through {connection['shared_topics'][1]}.",
            "relationshipStrength": strength,
            "trustLevel": _relationship_trust_level(connection["trust_level"]),
            "businessRelevanceScore": relevance,
            "sharedTopics": connection["shared_topics"],
            "suggestedActions": connection["suggested_actions"],
            "source": {
                "type": "manual",
                "id": f"source:{connection['id']}",
                "label": "Generated relationship graph edge",
            },
            "evidenceIds": [evidence_id],
            "createdAt": generated_at,
            "updatedAt": generated_at,
        }
        runtime_connections.append(runtime_connection)
        first_connection_by_contact_id.setdefault(connection["contact_id"], runtime_connection)

    participant_by_user_id = {participant["user_id"]: participant for participant in participants}

    runtime_recommendations = []
    for index, recommendation in enumerate(recommendations, start=1):
        recommended_contact = contacts_by_user_id[recommendation["recommended_user_id"]]
        participant = participant_by_user_id.get(recommendation["user_id"], participants[index % len(participants)])
        connection = first_connection_by_contact_id.get(recommended_contact["id"])
        evidence_id = recommendation["evidence_ids"][0]
        score = _as_percentage(recommendation["score"])
        add_evidence(
            evidence_id,
            source_type="agent_action",
            source_id=recommendation["id"],
            summary=f"{recommendation['reason']} Recommended contact: {recommended_contact['display_name']}.",
            confidence=0.8,
        )
        runtime_recommendations.append(
            {
                "id": recommendation["id"],
                "eventId": recommendation["event_id"],
                "attendeeId": participant["id"],
                "contactId": recommended_contact["id"],
                **({"connectionId": connection["id"]} if connection else {}),
                "recommendationType": ["event_follow_up", "warm_intro", "context_share"][index % 3],
                "score": score,
                "businessRelevanceScore": max(50, score),
                "sharedTopics": connection["sharedTopics"] if connection else ["relationship context"],
                "suggestedActions": connection["suggestedActions"] if connection else ["review source evidence before follow-up"],
                "reason": recommendation["reason"],
                "source": {
                    "type": "agent_action",
                    "id": f"source:{recommendation['id']}",
                    "label": "Generated match recommendation",
                },
                "evidenceIds": [evidence_id],
                "createdAt": generated_at,
                "updatedAt": generated_at,
            }
        )

    runtime_conversations = []
    runtime_messages = []
    conversation_by_contact_id: dict[str, str] = {}
    for index, message in enumerate(messages[:160], start=1):
        connection = connections[(index - 1) % len(connections)]
        contact_id = connection["contact_id"]
        conversation_id = conversation_by_contact_id.setdefault(contact_id, f"conversation_{len(conversation_by_contact_id) + 1:03d}")
        evidence_id = message["evidence_ids"][0]
        add_evidence(
            evidence_id,
            source_type="chat_summary",
            source_id=message["id"],
            summary=message["body"],
            confidence=0.78,
        )
        if len(runtime_conversations) < len(conversation_by_contact_id):
            runtime_conversations.append(
                {
                    "id": conversation_id,
                    "participantContactIds": [contact_id],
                    "channel": "email" if message["language"] == "en" else "chat",
                    "source": {
                        "type": "chat_summary",
                        "id": f"source:{conversation_id}",
                        "label": "Generated relationship conversation",
                    },
                    "evidenceIds": [evidence_id],
                    "updatedAt": generated_at,
                }
            )
        runtime_messages.append(
            {
                "id": message["id"],
                "conversationId": conversation_id,
                "direction": "outbound" if index % 3 == 0 else "internal_note",
                "body": message["body"],
                "occurredAt": f"2026-06-{(index % 28) + 1:02d}T13:00:00+09:00",
                "createdBy": profile_id,
                "source": {
                    "type": "chat_summary",
                    "id": f"source:{message['id']}",
                    "label": "Generated follow-up message",
                },
                "evidenceIds": [evidence_id],
            }
        )

    runtime_interaction_memories = []
    for index, interaction in enumerate(interactions, start=1):
        connection = next(item for item in runtime_connections if item["id"] == interaction["connection_id"])
        evidence_id = interaction["evidence_ids"][0]
        add_evidence(
            evidence_id,
            source_type=interaction["channel"],
            source_id=interaction["id"],
            summary=interaction["summary"],
            confidence=0.76,
            occurred_at=interaction["occurred_at"],
        )
        conversation_id = conversation_by_contact_id.get(connection["contactId"])
        runtime_interaction_memories.append(
            {
                "id": interaction["id"],
                "contactId": connection["contactId"],
                "connectionId": connection["id"],
                **({"conversationId": conversation_id} if conversation_id else {}),
                "memoryType": {
                    "event": "event_note",
                    "email": "follow_up_request",
                    "chat": "follow_up_request",
                    "meeting": "referral_offer",
                }.get(interaction["channel"], "event_note"),
                "summary": interaction["summary"],
                "occurredAt": interaction["occurred_at"],
                "confidence": 0.76,
                "source": {
                    "type": _source_type(interaction["channel"]),
                    "id": f"source:{interaction['id']}",
                    "label": "Generated interaction memory",
                },
                "evidenceIds": [evidence_id],
                "createdAt": generated_at,
            }
        )

    runtime_ai_analyses = []
    ai_targets = (
        [("contact", contact["id"]) for contact in runtime_contacts[:80]]
        + [("attendee", attendee["id"]) for attendee in runtime_attendees[:80]]
        + [("connection", connection["id"]) for connection in runtime_connections[:80]]
        + [("event", event["id"]) for event in runtime_events]
    )
    for index, analysis in enumerate(ai_analyses, start=1):
        target_type, target_id = ai_targets[(index - 1) % len(ai_targets)]
        evidence_id = analysis["evidence_ids"][0]
        add_evidence(
            evidence_id,
            source_type="agent_action",
            source_id=analysis["id"],
            summary=f"Generated AI analysis for {target_type} {target_id}.",
            confidence=float(analysis["confidence"]),
        )
        runtime_ai_analyses.append(
            {
                "id": analysis["id"],
                "analysisType": ["event_intent", "relationship_profile", "match_explanation", "interaction_memory"][index % 4],
                "target": {"type": target_type, "id": target_id},
                "resultJson": analysis["result_json"],
                "confidence": analysis["confidence"],
                "source": {
                    "type": "agent_action",
                    "id": f"source:{analysis['id']}",
                    "label": "Generated AI relationship analysis",
                },
                "evidenceIds": [evidence_id],
                "createdAt": generated_at,
            }
        )

    recommendation_by_id = {recommendation["id"]: recommendation for recommendation in runtime_recommendations}

    runtime_recommendation_tests = []

    def add_recommendation_test(
        *,
        record: dict[str, Any],
        case_type: str,
        expected_outcome: str,
        reason: str,
        confidence: float,
        source_type: str,
    ) -> None:
        index = len(runtime_recommendation_tests) + 1
        contact = contacts_by_user_id.get(record.get("recommended_user_id") or record.get("user_id"), contacts[index % len(contacts)])
        participant = participant_by_user_id.get(record.get("user_id"), participants[index % len(participants)])
        recommendation_id = runtime_recommendations[index % len(runtime_recommendations)]["id"]
        connection = first_connection_by_contact_id.get(contact["id"])
        evidence_id = record["evidence_ids"][0]
        add_evidence(
            evidence_id,
            source_type=source_type,
            source_id=record["id"],
            summary=reason,
            confidence=confidence,
        )
        runtime_recommendation_tests.append(
            {
                "id": record["id"],
                "caseType": case_type,
                "eventId": record.get("event_id", events[index % len(events)]["id"]),
                "attendeeId": participant["id"],
                "contactId": contact["id"],
                **({"connectionId": connection["id"]} if connection else {}),
                **({"recommendationId": recommendation_id} if recommendation_id in recommendation_by_id else {}),
                "expectedOutcome": expected_outcome,
                "reason": reason,
                "confidence": confidence,
                "source": {
                    "type": _source_type(source_type),
                    "id": f"source:{record['id']}",
                    "label": f"Generated {case_type} recommendation test",
                },
                "evidenceIds": [evidence_id],
                "createdAt": generated_at,
            }
        )

    for record in golden_matches:
        add_recommendation_test(
            record=record,
            case_type="golden_match",
            expected_outcome="recommend",
            reason="Known positive relationship recommendation case.",
            confidence=0.94,
            source_type="agent_action",
        )
    for record in negative_cases:
        add_recommendation_test(
            record=record,
            case_type="negative_case",
            expected_outcome="suppress",
            reason=record["reason"],
            confidence=0.82,
            source_type="agent_action",
        )
    for record in dirty_cases:
        add_recommendation_test(
            record={**record, "event_id": events[len(runtime_recommendation_tests) % len(events)]["id"], "user_id": users[len(runtime_recommendation_tests) % len(users)]["id"]},
            case_type="dirty_data",
            expected_outcome="manual_review",
            reason=f"Dirty input '{record['value']}' should be routed to manual review.",
            confidence=0.7,
            source_type="manual",
        )

    runtime_tasks = []
    for index, recommendation in enumerate(runtime_recommendations[:80], start=1):
        evidence_id = f"evidence:task:{index:03d}"
        add_evidence(
            evidence_id,
            source_type="agent_action",
            source_id=f"task_{index:03d}",
            summary=f"Follow-up task generated from {recommendation['id']}.",
            confidence=0.8,
        )
        runtime_tasks.append(
            {
                "id": f"task_{index:03d}",
                "title": f"Review follow-up for {recommendation['contactId']}",
                "status": "open" if index % 4 else "scheduled",
                "contactId": recommendation["contactId"],
                **({"connectionId": recommendation["connectionId"]} if "connectionId" in recommendation else {}),
                "dueAt": f"2026-07-{(index % 28) + 1:02d}T09:00:00+09:00",
                "source": {
                    "type": "agent_action",
                    "id": f"source:task:{index:03d}",
                    "label": "Generated recommendation follow-up task",
                },
                "evidenceIds": [evidence_id],
                "createdAt": generated_at,
                "updatedAt": generated_at,
            }
        )

    runtime_agent_actions = []
    for index, recommendation in enumerate(runtime_recommendations[:60], start=1):
        evidence_id = f"evidence:agent_action:{index:03d}"
        add_evidence(
            evidence_id,
            source_type="agent_action",
            source_id=f"agent_action_{index:03d}",
            summary=f"Agent action staged for recommendation {recommendation['id']}.",
            confidence=0.79,
        )
        runtime_agent_actions.append(
            {
                "id": f"agent_action_{index:03d}",
                "type": ["draft_message", "schedule_reminder", "prepare_intro", "summarize_context"][index % 4],
                "status": "awaiting_confirmation",
                "confirmationRequired": True,
                "source": {
                    "type": "agent_action",
                    "id": f"source:agent_action:{index:03d}",
                    "label": "Generated agent action",
                },
                "evidenceIds": [evidence_id],
                "createdAt": generated_at,
                "updatedAt": generated_at,
            }
        )

    dashboard_evidence_ids = [item["evidenceIds"][0] for item in runtime_recommendations[:5]]
    runtime_dashboards = [
        {
            "id": "dashboard_generated_relationships",
            "accountId": account_id,
            "generatedAt": generated_at,
            "items": [
                {
                    "id": f"dashboard_item_{index:03d}",
                    "title": f"Review {recommendation['recommendationType']} for {recommendation['contactId']}",
                    "summary": recommendation["reason"],
                    "valueType": recommendation["sharedTopics"] and _relationship_value_types(index)[0],
                    "source": recommendation["source"],
                    "evidenceIds": recommendation["evidenceIds"],
                }
                for index, recommendation in enumerate(runtime_recommendations[:20], start=1)
            ],
            "source": system_source,
            "evidenceIds": dashboard_evidence_ids,
        }
    ]

    runtime_notifications = []
    for index, task in enumerate(runtime_tasks[:40], start=1):
        evidence_id = f"evidence:notification:{index:03d}"
        add_evidence(
            evidence_id,
            source_type="system",
            source_id=f"notification_{index:03d}",
            summary=f"Notification generated for task {task['id']}.",
            confidence=0.8,
        )
        runtime_notifications.append(
            {
                "id": f"notification_{index:03d}",
                "channel": "in_app",
                "title": task["title"],
                "body": "Generated relationship follow-up is ready for review.",
                "status": "pending",
                "scheduledFor": task.get("dueAt"),
                "source": system_source,
                "evidenceIds": [evidence_id],
                "createdAt": generated_at,
            }
        )

    permission_evidence_id = add_evidence(
        "evidence:permission:relationship-local-remote",
        source_type="system",
        source_id="permission_relationship_local_remote",
        summary="Hybrid relationship fixture keeps external providers disabled until live replacement gates pass.",
        confidence=1,
    )

    def contact_index(contact_id: str | None) -> int:
        if not contact_id:
            return 0
        try:
            return int(contact_id.rsplit("_", 1)[1])
        except (IndexError, ValueError):
            return 0

    def person_id_for_contact_id(contact_id: str | None) -> str | None:
        index = contact_index(contact_id)
        return f"person_{index:03d}" if index else None

    def contact_id_for_person_id(person_id: str | None) -> str | None:
        if not person_id:
            return None
        try:
            return f"contact_{int(person_id.rsplit('_', 1)[1]):03d}"
        except (IndexError, ValueError):
            return None

    concrete_contact_sources = ["business_card_ocr", "qr_scan", "referral", "manual"]
    connection_methods = ["offline_meeting", "business_card", "qr_scan", "referral", "shared_event"]
    relationship_types = ["buyer", "seller", "partner", "investor", "mentor", "organizer", "service_provider"]
    value_types = ["strategic_fit", "commercial_opportunity", "knowledge_exchange", "referral_path", "community_context"]

    def source_type_for_method(method: str) -> str:
        if method == "business_card":
            return "business_card_ocr"
        if method == "shared_event":
            return "event_import"
        if method == "offline_meeting":
            return "manual"
        return method

    def contact_source_label(source_type: str) -> str:
        return {
            "business_card_ocr": "Business card exchange",
            "qr_scan": "Direct QR scan",
            "referral": "Warm referral",
            "manual": "Confirmed offline meeting note",
        }.get(source_type, "Confirmed relationship source")

    network_people = []
    platform_person_ids: list[str] = []
    current_user_contact_person_ids: set[str] = set()
    person_by_id: dict[str, dict[str, Any]] = {}
    for contact in runtime_contacts:
        index = contact_index(contact["id"])
        person_id = person_id_for_contact_id(contact["id"])
        if not person_id:
            continue
        is_external = index % 3 == 0
        person = {
            "id": person_id,
            "personKind": "external_contact" if is_external else "platform_user",
            **({} if is_external else {"platformUserId": f"user_{index:03d}"}),
            "displayName": contact["displayName"],
            "organization": contact.get("organization"),
            "role": contact.get("role"),
            "location": contact.get("location"),
            **({"primaryEmail": contact.get("primaryEmail")} if is_external and contact.get("primaryEmail") else {}),
            "profileSnippet": contact.get("profileSnippet"),
            "source": (
                {
                    "type": "manual",
                    "id": f"source:external-person:{person_id}",
                    "label": "Current-user external contact record",
                }
                if is_external
                else {
                    "type": "system",
                    "id": f"source:platform-user:{person_id}",
                    "label": "Generated platform user profile",
                }
            ),
            "evidenceIds": contact["evidenceIds"],
            "createdAt": contact["createdAt"],
            "updatedAt": contact["updatedAt"],
        }
        network_people.append({key: value for key, value in person.items() if value is not None})
        person_by_id[person_id] = person
        if is_external:
            current_user_contact_person_ids.add(person_id)
        else:
            platform_person_ids.append(person_id)
            if index % 4 == 1:
                current_user_contact_person_ids.add(person_id)

    current_contact_ids = {
        contact_id
        for contact_id in (contact_id_for_person_id(person_id) for person_id in current_user_contact_person_ids)
        if contact_id
    }

    runtime_contacts = [
        {
            **contact,
            "personId": person_id_for_contact_id(contact["id"]),
            "source": {
                "type": source_type,
                "id": f"source:{source_type}:{contact['id']}",
                "label": f"{contact_source_label(source_type)} for {contact['displayName']}",
            },
        }
        for contact in runtime_contacts
        if contact["id"] in current_contact_ids
        for source_type in [concrete_contact_sources[contact_index(contact["id"]) % len(concrete_contact_sources)]]
    ]
    contact_ids = {contact["id"] for contact in runtime_contacts}

    def narrow_contact_ref(record: dict[str, Any]) -> dict[str, Any]:
        contact_id = record.get("contactId")
        person_id = person_id_for_contact_id(contact_id)
        next_record = {**record}
        if person_id:
            next_record["personId"] = person_id
        if contact_id not in contact_ids:
            next_record.pop("contactId", None)
        return next_record

    runtime_attendees = [narrow_contact_ref(attendee) for attendee in runtime_attendees]
    runtime_event_intents = [narrow_contact_ref(intent) for intent in runtime_event_intents]

    person_relationship_edges = []
    for source_index, from_person_id in enumerate(platform_person_ids):
        for offset_index, offset in enumerate([3, 7, 11, 17, 23]):
            to_person_id = platform_person_ids[(source_index + offset) % len(platform_person_ids)]
            if from_person_id == to_person_id:
                continue
            edge_number = len(person_relationship_edges) + 1
            method = connection_methods[(source_index + offset_index) % len(connection_methods)]
            evidence_id = f"evidence:person_edge:{edge_number:04d}"
            from_person = person_by_id[from_person_id]
            to_person = person_by_id[to_person_id]
            add_evidence(
                evidence_id,
                source_type=source_type_for_method(method),
                source_id=f"person_edge_{edge_number:04d}",
                summary=(
                    f"{from_person['displayName']} has a {method.replace('_', ' ')} "
                    f"relationship path to {to_person['displayName']}."
                ),
                confidence=0.78,
            )
            person_relationship_edges.append(
                {
                    "id": f"person_edge_{edge_number:04d}",
                    "fromPersonId": from_person_id,
                    "toPersonId": to_person_id,
                    "relationshipType": relationship_types[edge_number % len(relationship_types)],
                    "connectionMethod": method,
                    **(
                        {"introducedByPersonId": platform_person_ids[(source_index + 1) % len(platform_person_ids)]}
                        if method == "referral"
                        else {}
                    ),
                    "relationshipStrength": min(95, 45 + ((source_index + offset_index) % 45)),
                    "trustLevel": ["emerging", "warm", "trusted"][(source_index + offset_index) % 3],
                    "sharedTopics": [
                        from_person.get("organization") or "platform community",
                        to_person.get("organization") or "relationship graph",
                    ],
                    "source": {
                        "type": source_type_for_method(method),
                        "id": f"source:person_edge_{edge_number:04d}",
                        "label": "Generated platform person relationship edge",
                    },
                    "evidenceIds": [evidence_id],
                    "createdAt": generated_at,
                    "updatedAt": generated_at,
                }
            )

    runtime_connections = [
        {**connection, "accountId": account_id}
        for connection in runtime_connections
        if connection["contactId"] in contact_ids
    ]
    first_connection_by_contact_id = {}
    for connection in runtime_connections:
        first_connection_by_contact_id.setdefault(connection["contactId"], connection["id"])
    for contact in runtime_contacts:
        if contact["id"] in first_connection_by_contact_id:
            continue
        evidence_id = f"evidence:connection:{contact['id']}:current-user"
        connection_id = f"connection_for_{contact['id']}"
        add_evidence(
            evidence_id,
            source_type=contact["source"]["type"],
            source_id=connection_id,
            summary=(
                f"{contact['displayName']} is a current-user contact backed by "
                f"{contact['source'].get('label') or contact['source']['type']}."
            ),
            confidence=0.82,
            occurred_at=contact["updatedAt"],
        )
        runtime_connections.append(
            {
                "id": connection_id,
                "accountId": account_id,
                "contactId": contact["id"],
                "stage": contact["stage"],
                "valueTypes": [value_types[contact_index(contact["id"]) % len(value_types)]],
                "summary": (
                    f"{contact['displayName']} has a concrete current-user relationship record "
                    f"from {contact['source'].get('label') or contact['source']['type']}."
                ),
                "relationshipStrength": 58 + (contact_index(contact["id"]) % 35),
                "trustLevel": ["emerging", "warm", "trusted"][contact_index(contact["id"]) % 3],
                "businessRelevanceScore": 55 + (contact_index(contact["id"]) % 40),
                "sharedTopics": [contact.get("organization") or "relationship context", contact.get("role") or "business context"],
                "suggestedActions": ["review evidence before follow-up"],
                "source": contact["source"],
                "evidenceIds": [evidence_id],
                "createdAt": contact["createdAt"],
                "updatedAt": generated_at,
            }
        )
        first_connection_by_contact_id[contact["id"]] = connection_id
    connection_ids = {connection["id"] for connection in runtime_connections}

    runtime_tasks = [
        {
            **task,
            **(
                {"connectionId": first_connection_by_contact_id[task["contactId"]]}
                if task.get("contactId") in first_connection_by_contact_id
                else {}
            ),
        }
        for task in runtime_tasks
        if not task.get("contactId") or task["contactId"] in contact_ids
    ]
    runtime_conversations = [
        conversation
        for conversation in runtime_conversations
        if all(contact_id in contact_ids for contact_id in conversation["participantContactIds"])
    ]
    conversation_ids = {conversation["id"] for conversation in runtime_conversations}
    runtime_messages = [
        message for message in runtime_messages if message["conversationId"] in conversation_ids
    ]
    message_ids = {message["id"] for message in runtime_messages}

    runtime_interaction_memories = [
        {
            **{
                key: value
                for key, value in memory.items()
                if key not in {"connectionId", "conversationId", "messageId"}
            },
            **(
                {"connectionId": first_connection_by_contact_id[memory["contactId"]]}
                if memory.get("contactId") in first_connection_by_contact_id
                else {}
            ),
            **(
                {"conversationId": memory["conversationId"]}
                if memory.get("conversationId") in conversation_ids
                else {}
            ),
            **({"messageId": memory["messageId"]} if memory.get("messageId") in message_ids else {}),
        }
        for memory in runtime_interaction_memories
        if memory["contactId"] in contact_ids
    ]

    non_contact_platform_person_ids = [
        person_id for person_id in platform_person_ids if person_id not in current_user_contact_person_ids
    ]
    platform_contact_person_ids = [
        person_id for person_id in platform_person_ids if person_id in current_user_contact_person_ids
    ]
    for index, recommendation in enumerate(runtime_recommendations):
        target_person_id = person_id_for_contact_id(recommendation.get("contactId"))
        if target_person_id:
            recommendation["targetPersonId"] = target_person_id
        if index % 4 == 0 and non_contact_platform_person_ids:
            recommendation["targetPersonId"] = non_contact_platform_person_ids[index % len(non_contact_platform_person_ids)]
            recommendation.pop("contactId", None)
            recommendation.pop("connectionId", None)
            if platform_contact_person_ids:
                recommendation["introducedByPersonId"] = platform_contact_person_ids[index % len(platform_contact_person_ids)]
            recommendation["recommendationType"] = "warm_intro"
            recommendation["reason"] = (
                f"{recommendation['reason']} This target is not yet a current-user contact; "
                "create contact only after a warm introduction or direct exchange."
            )
            recommendation["suggestedActions"] = [
                "ask the introducer for permission before creating a contact",
                *recommendation["suggestedActions"],
            ][:3]
        elif recommendation.get("contactId") not in contact_ids:
            recommendation.pop("contactId", None)
            recommendation.pop("connectionId", None)
        else:
            connection_id = first_connection_by_contact_id.get(recommendation["contactId"])
            if connection_id:
                recommendation["connectionId"] = connection_id

    for record in runtime_recommendation_tests:
        target_person_id = person_id_for_contact_id(record.get("contactId"))
        if target_person_id:
            record["targetPersonId"] = target_person_id
        if record.get("contactId") not in contact_ids:
            record.pop("contactId", None)
            record.pop("connectionId", None)
        else:
            connection_id = first_connection_by_contact_id.get(record["contactId"])
            if connection_id:
                record["connectionId"] = connection_id

    valid_targets = {
        "contact": [contact["id"] for contact in runtime_contacts],
        "connection": [connection["id"] for connection in runtime_connections],
        "attendee": [attendee["id"] for attendee in runtime_attendees],
        "event": [event["id"] for event in runtime_events],
    }
    fallback_target_types = ["contact", "attendee", "connection", "event"]
    for index, analysis in enumerate(runtime_ai_analyses):
        target = analysis["target"]
        if target["id"] in valid_targets.get(target["type"], []):
            continue
        fallback_type = fallback_target_types[index % len(fallback_target_types)]
        fallback_ids = valid_targets[fallback_type]
        analysis["target"] = {
            "type": fallback_type,
            "id": fallback_ids[index % len(fallback_ids)],
        }

    return {
        "id": "mock_fixture_generated_relationship",
        "label": "Generated Orbit relationship graph",
        "description": "Deterministic relationship mockdata converted into the hybrid local-remote database DTO shape.",
        "generatedAt": generated_at,
        "accounts": [
            {
                "id": account_id,
                "name": "Orbit Generated Relationship Workspace",
                "createdAt": generated_at,
                "updatedAt": generated_at,
            }
        ],
        "profiles": [
            {
                "id": profile_id,
                "accountId": account_id,
                "displayName": "結城 航太郎",
                "role": "Relationship Operations Lead",
                "timezone": "Asia/Tokyo",
                "createdAt": generated_at,
                "updatedAt": generated_at,
            }
        ],
        "events": runtime_events,
        "networkPeople": network_people,
        "personRelationshipEdges": person_relationship_edges,
        "attendees": runtime_attendees,
        "eventParticipantIntents": runtime_event_intents,
        "contacts": runtime_contacts,
        "connections": runtime_connections,
        "aiAnalyses": runtime_ai_analyses,
        "matchRecommendations": runtime_recommendations,
        "interactionMemories": runtime_interaction_memories,
        "recommendationTests": runtime_recommendation_tests,
        "evidence": list(evidence.values()),
        "tasks": runtime_tasks,
        "conversations": runtime_conversations,
        "messages": runtime_messages,
        "dashboards": runtime_dashboards,
        "agentActions": runtime_agent_actions,
        "permissions": [
            {
                "id": "permission_relationship_local_remote",
                "capability": "relationship_local_remote_database",
                "state": "requested",
                "updatedAt": generated_at,
                "source": system_source,
                "evidenceIds": [permission_evidence_id],
            }
        ],
        "notifications": runtime_notifications,
    }


def _write_hybrid_runtime_fixture(mockdata_dir: Path, fixture: dict[str, Any]) -> Path:
    project_dir = _project_root_for_mockdata_dir(mockdata_dir)
    path = project_dir / "repos/orbits/shared/mock/generated-relationship-fixtures.ts"
    serialized = json.dumps(fixture, indent=2, ensure_ascii=False)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        "import type { MockRuntimeFixtures } from \"./fixtures\";\n\n"
        "// Generated by harness/relationship_data_goal_runner.py. Do not edit by hand.\n"
        f"export const generatedRelationshipFixtures = {serialized} satisfies MockRuntimeFixtures;\n"
    )
    return path


def generate_relationship_mockdata(mockdata_dir: Path, *, minimax_plan_text: str) -> dict[str, int]:
    """Expand a compact MiniMax-authored plan into deterministic demo-scale relationship data."""
    generated_at = datetime.now(timezone.utc).isoformat()
    for folder in ["dictionaries", "seed", "tests", "scenarios", "generated", "exports", "validators", "generation"]:
        (mockdata_dir / folder).mkdir(parents=True, exist_ok=True)

    segments = (
        ["jp_local_business"] * 66
        + ["jp_chinese_business"] * 40
        + ["greater_china_business"] * 16
        + ["international"] * 10
    )
    industries = [
        "restaurant_inbound",
        "ai_saas",
        "manufacturing_dx",
        "cross_border_ecommerce",
        "venture_capital",
        "community_events",
        "retail_omnichannel",
        "legal_accounting",
        "tourism_hospitality",
        "education_training",
    ]
    roles = [
        "founder_ceo",
        "store_owner",
        "community_organizer",
        "investor_partner",
        "dx_consultant",
        "marketing_lead",
        "product_manager",
        "sales_director",
    ]
    needs_i18n = [
        ("小紅書と訪日客向けの二言語集客パートナー", "小红书与入境客双语获客伙伴", "bilingual Xiaohongshu inbound campaign partner"),
        ("日本の中小製造業でAI業務自動化PoCを試せる買い手", "可在日本中小制造业试点 AI 业务自动化的买方", "AI workflow PoC buyer in Japanese SMB manufacturing"),
        ("中国SaaS営業の日本市場参入アドバイザー", "中国 SaaS 销售进入日本市场的顾问", "Japan market entry advisor for China SaaS sales"),
        ("飲食店予約CRM連携の実証先", "餐饮预约 CRM 集成试点客户", "restaurant reservation CRM integration pilot"),
        ("シード調達に向けた投資家紹介", "种子轮融资的投资人暖介绍", "investor warm intro for seed fundraising"),
        ("華人ビジネスコミュニティに届くイベントスポンサー", "触达华人商业社群的活动赞助商", "event sponsor with Chinese business-community reach"),
        ("イベント後フォローアップ運用の担当者", "会后跟进流程运营负责人", "post-event follow-up workflow operator"),
        ("重複連絡先の整理と証跡レビュー", "重复联系人清理与证据复核", "duplicate contact cleanup and provenance review"),
        ("小売ライブコマースの販売パートナー", "零售直播电商分销伙伴", "retail live-commerce distribution partner"),
        ("日本進出に信頼できる税務・設立アドバイザー", "日本落地可信赖的税务与设立顾问", "trusted tax and incorporation advisor for Japan entry"),
    ]
    offers_i18n = [
        ("東京の飲食店での実証場所", "东京餐饮门店试点场景", "Tokyo restaurant operator test site"),
        ("日中二言語のコミュニティ集客チャネル", "日中双语社群营销渠道", "Mandarin Japanese community marketing channel"),
        ("製造業DXの要件整理と買い手フィードバック", "制造业 DX 需求梳理与买方反馈", "manufacturing DX requirements and buyer feedback"),
        ("シード投資家の目線での選考と創業者フィードバック", "种子投资人视角的筛选与创业者反馈", "seed investor screening and founder feedback"),
        ("イベント卓マッチングとスポンサー露出", "活动桌次匹配与赞助曝光", "event table matching and sponsor visibility"),
        ("越境EC立ち上げの実務プレイブック", "跨境电商启动实务手册", "cross-border ecommerce launch playbook"),
        ("二言語営業資料のレビュー", "双语销售材料审阅", "bilingual sales deck review"),
        ("プライバシーに配慮した連絡先証跡監査", "注重隐私的联系人证据审计", "privacy-safe contact provenance audit"),
        ("フォローアップ文面の多言語ローカライズ", "跟进消息多语言本地化", "follow-up message localization"),
        ("関西の提携チャネル紹介", "关西合作渠道介绍", "partner channel introductions in Kansai"),
    ]
    needs = [item[2] for item in needs_i18n]
    offers = [item[2] for item in offers_i18n]
    jp_surnames = [
        ("佐藤", "Sato"),
        ("鈴木", "Suzuki"),
        ("高橋", "Takahashi"),
        ("田中", "Tanaka"),
        ("伊藤", "Ito"),
        ("渡辺", "Watanabe"),
        ("山本", "Yamamoto"),
        ("中村", "Nakamura"),
        ("小林", "Kobayashi"),
        ("加藤", "Kato"),
        ("吉田", "Yoshida"),
        ("山田", "Yamada"),
        ("佐々木", "Sasaki"),
        ("山口", "Yamaguchi"),
        ("松本", "Matsumoto"),
        ("井上", "Inoue"),
        ("木村", "Kimura"),
        ("林", "Hayashi"),
        ("斎藤", "Saito"),
        ("清水", "Shimizu"),
        ("山崎", "Yamazaki"),
        ("森", "Mori"),
        ("池田", "Ikeda"),
        ("橋本", "Hashimoto"),
        ("阿部", "Abe"),
        ("石川", "Ishikawa"),
        ("前田", "Maeda"),
        ("藤田", "Fujita"),
        ("岡田", "Okada"),
        ("後藤", "Goto"),
        ("長谷川", "Hasegawa"),
        ("村上", "Murakami"),
        ("近藤", "Kondo"),
        ("石井", "Ishii"),
        ("坂本", "Sakamoto"),
        ("遠藤", "Endo"),
        ("青木", "Aoki"),
        ("藤井", "Fujii"),
        ("西村", "Nishimura"),
        ("福田", "Fukuda"),
        ("太田", "Ota"),
        ("三浦", "Miura"),
        ("藤原", "Fujiwara"),
        ("岡本", "Okamoto"),
        ("松田", "Matsuda"),
        ("中島", "Nakajima"),
        ("中川", "Nakagawa"),
        ("原田", "Harada"),
        ("小川", "Ogawa"),
        ("竹内", "Takeuchi"),
        ("田村", "Tamura"),
        ("金子", "Kaneko"),
        ("和田", "Wada"),
        ("中野", "Nakano"),
        ("石田", "Ishida"),
    ]
    jp_given_names = [
        ("健一", "Kenichi"),
        ("浩二", "Koji"),
        ("桜", "Sakura"),
        ("美咲", "Misaki"),
        ("大輔", "Daisuke"),
        ("直子", "Naoko"),
        ("拓也", "Takuya"),
        ("真理", "Mari"),
        ("翔太", "Shota"),
        ("恵", "Megumi"),
        ("亮", "Ryo"),
        ("陽子", "Yoko"),
        ("達也", "Tatsuya"),
        ("優子", "Yuko"),
        ("智子", "Tomoko"),
        ("裕太", "Yuta"),
        ("彩", "Aya"),
        ("祐介", "Yusuke"),
        ("麻衣", "Mai"),
        ("翼", "Tsubasa"),
        ("莉奈", "Rina"),
        ("健太", "Kenta"),
        ("千尋", "Chihiro"),
        ("修平", "Shuhei"),
        ("愛", "Ai"),
        ("悠斗", "Haruto"),
        ("奈々子", "Nanako"),
        ("聡", "Satoshi"),
        ("香織", "Kaori"),
        ("豪", "Go"),
        ("美穂", "Miho"),
        ("隼人", "Hayato"),
        ("瑞希", "Mizuki"),
        ("翔", "Sho"),
        ("由美", "Yumi"),
        ("颯太", "Sota"),
        ("航平", "Kohei"),
        ("明日香", "Asuka"),
        ("信也", "Shinya"),
        ("佳奈", "Kana"),
        ("蓮", "Ren"),
        ("葵", "Aoi"),
        ("浩", "Hiroshi"),
        ("恵子", "Keiko"),
        ("学", "Manabu"),
        ("絵美", "Emi"),
        ("大地", "Daichi"),
        ("遥", "Haruka"),
        ("和也", "Kazuya"),
        ("沙也香", "Sayaka"),
        ("誠", "Makoto"),
        ("夏美", "Natsumi"),
        ("雄二", "Yuji"),
        ("明子", "Akiko"),
        ("信明", "Nobuaki"),
    ]
    cn_family_names = [
        ("王", "Wang"),
        ("李", "Li"),
        ("张", "Zhang"),
        ("刘", "Liu"),
        ("陈", "Chen"),
        ("林", "Lin"),
        ("赵", "Zhao"),
        ("黄", "Huang"),
        ("周", "Zhou"),
        ("吴", "Wu"),
        ("徐", "Xu"),
        ("孙", "Sun"),
        ("胡", "Hu"),
        ("朱", "Zhu"),
        ("高", "Gao"),
        ("郭", "Guo"),
        ("何", "He"),
        ("罗", "Luo"),
        ("郑", "Zheng"),
        ("梁", "Liang"),
        ("谢", "Xie"),
        ("宋", "Song"),
        ("唐", "Tang"),
        ("许", "Hsu"),
        ("邓", "Deng"),
        ("韩", "Han"),
        ("冯", "Feng"),
        ("曹", "Cao"),
        ("曾", "Zeng"),
        ("彭", "Peng"),
        ("萧", "Xiao"),
        ("蔡", "Cai"),
        ("潘", "Pan"),
        ("田", "Tian"),
        ("董", "Dong"),
        ("袁", "Yuan"),
        ("于", "Yu"),
        ("蒋", "Jiang"),
        ("叶", "Ye"),
        ("程", "Cheng"),
        ("魏", "Wei"),
        ("苏", "Su"),
        ("杜", "Du"),
        ("方", "Fang"),
        ("沈", "Shen"),
        ("任", "Ren"),
        ("廖", "Liao"),
        ("姚", "Yao"),
        ("龙", "Long"),
    ]
    cn_given_names = [
        ("晨", "Chen"),
        ("晓琳", "Xiaolin"),
        ("伟", "Wei"),
        ("雨桐", "Yutong"),
        ("明轩", "Mingxuan"),
        ("佳怡", "Jiayi"),
        ("思远", "Siyuan"),
        ("雅婷", "Yating"),
        ("俊杰", "Junjie"),
        ("可欣", "Kexin"),
        ("子涵", "Zihan"),
        ("海宁", "Haining"),
        ("一凡", "Yifan"),
        ("诗涵", "Shihan"),
        ("宇航", "Yuhang"),
        ("欣怡", "Xinyi"),
        ("睿", "Rui"),
        ("嘉豪", "Jiahao"),
        ("语嫣", "Yuyan"),
        ("立新", "Lixin"),
        ("天宇", "Tianyu"),
        ("梦琪", "Mengqi"),
        ("博文", "Bowen"),
        ("若曦", "Ruoxi"),
        ("家明", "Jiaming"),
        ("怡然", "Yiran"),
        ("嘉诚", "Jiacheng"),
        ("雨薇", "Yuwei"),
        ("泽宇", "Zeyu"),
        ("欣然", "Xinran"),
        ("静怡", "Jingyi"),
        ("凯文", "Kaiwen"),
        ("安琪", "Anqi"),
        ("皓然", "Haoran"),
        ("佩珊", "Peishan"),
        ("梓豪", "Zihao"),
        ("佳宁", "Jianing"),
        ("子墨", "Zimo"),
        ("怡君", "Yijun"),
        ("亦辰", "Yichen"),
        ("佳琪", "Jiaqi"),
        ("文博", "Wenbo"),
        ("思琪", "Siqi"),
        ("皓宇", "Haoyu"),
        ("依娜", "Yina"),
        ("子睿", "Zirui"),
        ("书涵", "Shuhan"),
        ("思雨", "Siyu"),
    ]
    intl_given_names = [
        ("エミリー", "艾米丽", "Emily"),
        ("マイケル", "迈克尔", "Michael"),
        ("ソフィア", "索菲亚", "Sofia"),
        ("ダニエル", "丹尼尔", "Daniel"),
        ("オリビア", "奥利维亚", "Olivia"),
        ("ルーカス", "卢卡斯", "Lucas"),
        ("マヤ", "玛雅", "Maya"),
        ("ノア", "诺亚", "Noah"),
        ("アイシャ", "艾莎", "Aisha"),
        ("イーサン", "伊森", "Ethan"),
        ("プリヤ", "普丽雅", "Priya"),
        ("マテオ", "马特奥", "Mateo"),
        ("ハンナ", "汉娜", "Hannah"),
        ("オマル", "奥马尔", "Omar"),
        ("クロエ", "克洛伊", "Chloe"),
        ("ヴィクター", "维克多", "Victor"),
        ("レイラ", "莱拉", "Leila"),
        ("トーマス", "托马斯", "Thomas"),
        ("ファティマ", "法蒂玛", "Fatima"),
        ("エイドリアン", "阿德里安", "Adrian"),
        ("エレナ", "埃琳娜", "Elena"),
        ("アイザック", "艾萨克", "Isaac"),
        ("ノラ", "诺拉", "Nora"),
        ("ジュリアン", "朱利安", "Julian"),
    ]
    intl_family_names = [
        ("チェン", "陈", "Chen"),
        ("ミラー", "米勒", "Miller"),
        ("ガルシア", "加西亚", "Garcia"),
        ("グエン", "阮", "Nguyen"),
        ("パテル", "帕特尔", "Patel"),
        ("ブラウン", "布朗", "Brown"),
        ("ウィルソン", "威尔逊", "Wilson"),
        ("リー", "李", "Lee"),
        ("カーン", "汗", "Khan"),
        ("テイラー", "泰勒", "Taylor"),
        ("シン", "辛格", "Singh"),
        ("マルティネス", "马丁内斯", "Martinez"),
        ("ジョンソン", "约翰逊", "Johnson"),
        ("キム", "金", "Kim"),
        ("アフメド", "艾哈迈德", "Ahmed"),
        ("ウォーカー", "沃克", "Walker"),
        ("ロッシ", "罗西", "Rossi"),
        ("アンダーソン", "安德松", "Andersson"),
        ("シルバ", "席尔瓦", "Silva"),
        ("コーエン", "科恩", "Cohen"),
        ("ドゥアルテ", "杜阿尔特", "Duarte"),
        ("モラレス", "莫拉莱斯", "Morales"),
        ("イブラヒム", "易卜拉欣", "Ibrahim"),
        ("パーカー", "帕克", "Parker"),
    ]
    role_labels = {
        "founder_ceo": ("創業者CEO", "创始人 CEO", "Founder CEO"),
        "store_owner": ("店舗オーナー", "门店经营者", "Store Owner"),
        "community_organizer": ("コミュニティ主催者", "社群组织者", "Community Organizer"),
        "investor_partner": ("投資パートナー", "投资合伙人", "Investor Partner"),
        "dx_consultant": ("DXコンサルタント", "DX 顾问", "DX Consultant"),
        "marketing_lead": ("マーケティング責任者", "市场负责人", "Marketing Lead"),
        "product_manager": ("プロダクトマネージャー", "产品经理", "Product Manager"),
        "sales_director": ("営業責任者", "销售总监", "Sales Director"),
    }
    event_templates = [
        (
            "東京インバウンド飲食店成長会",
            "东京餐饮入境客增长会",
            "Tokyo Inbound Restaurant Growth Forum",
            "飲食店オーナーと華人マーケターが、予約導線、口コミ、リピート施策を具体案件で相談する少人数会。",
            "面向餐饮店主和华人营销人的小型交流会，围绕预约转化、口碑传播和复购方案讨论真实项目。",
            "A small forum for restaurant operators and Chinese-community marketers to discuss booking flows, reviews, and repeat-visit growth.",
        ),
        (
            "日中AI業務自動化PoCラウンドテーブル",
            "日中 AI 业务自动化 PoC 圆桌",
            "Japan-China AI Workflow PoC Roundtable",
            "中小企業の業務課題とAI SaaSのPoC条件を、導入責任者と創業者がすり合わせる実務型イベント。",
            "让中小企业导入负责人和 AI SaaS 创业者对齐 PoC 条件、业务痛点与评估指标的务实圆桌。",
            "A practical roundtable where SMB operators and AI SaaS founders align on PoC scope, metrics, and adoption blockers.",
        ),
        (
            "越境ECチャネル開拓ミートアップ",
            "跨境电商渠道拓展交流会",
            "Cross-Border Ecommerce Channel Meetup",
            "日本ブランド、物流、ライブコマース、代理店候補が販売チャネルと初回検証を設計する会。",
            "日本品牌、物流伙伴、直播电商团队和代理商候选人共同设计销售渠道与首轮验证。",
            "A meetup for Japanese brands, logistics partners, live-commerce teams, and channel agents to plan first-market tests.",
        ),
        (
            "投資家・創業者シード面談会",
            "投资人与创业者种子轮会谈",
            "Seed Investor and Founder Matching Salon",
            "投資家と創業者が、紹介文脈、顧客検証、次回面談条件を短時間で確認するマッチング会。",
            "投资人与创业者快速确认介绍背景、客户验证进展和下一次会谈条件的配对活动。",
            "A matching salon where investors and founders review context, customer proof, and next-meeting criteria.",
        ),
        (
            "在日華人ビジネスコミュニティスポンサー会",
            "在日华人商业社群赞助合作会",
            "Chinese Business Community Sponsorship Salon",
            "コミュニティ主催者、スポンサー候補、店舗経営者が参加者価値と協賛導線を詰める会。",
            "社群主理人、潜在赞助商和门店经营者一起打磨参与者价值与赞助转化路径。",
            "A sponsorship salon for community hosts, sponsors, and local operators to design participant value and sponsor paths.",
        ),
        (
            "名刺プロフィール生成ワークショップ",
            "名片资料生成工作坊",
            "Business Card Profile Generation Workshop",
            "名刺、会話メモ、公開プロフィールから、信頼できる連絡先情報とフォローアップ文脈を作る実践会。",
            "用名片、会话笔记和公开资料生成可信联系人信息与后续跟进语境的实操工作坊。",
            "A workshop for turning business cards, conversation notes, and public profiles into trusted contact context.",
        ),
        (
            "イベント後フォローアップ作戦会議",
            "会后跟进策略会",
            "Post-Event Follow-Up Strategy Session",
            "会った相手への優先順位、紹介文、次回アクションを多言語で整理するフォローアップ会。",
            "围绕会后联系人优先级、介绍文案和下一步行动进行多语言整理的策略会。",
            "A multilingual session for prioritizing event contacts, drafting introductions, and setting concrete next actions.",
        ),
        (
            "休眠関係リカバリー会",
            "沉睡关系重新激活会",
            "Dormant Relationship Reactivation Lab",
            "過去の接点を安全に見直し、再連絡する価値がある相手と理由を整理する実験会。",
            "安全回顾过往触点，筛选值得重新联系的人和具体理由的实验型活动。",
            "A lab for safely reviewing past touchpoints and identifying which dormant relationships deserve reactivation.",
        ),
        (
            "重複コンタクト整理クリニック",
            "重复联系人合并诊断会",
            "Duplicate Contact Merge Clinic",
            "複数ソースから入った連絡先を、証跡と本人確認を残しながら整理する運用相談会。",
            "针对多来源联系人，保留证据与确认记录的合并整理运营诊断会。",
            "An operations clinic for merging multi-source contacts while preserving evidence and confirmation history.",
        ),
        (
            "低品質マッチ排除レビュー",
            "低质量匹配过滤复盘会",
            "Bad Match Filtering Review",
            "AI推薦の低信頼ケースを見直し、なぜ薦めないかを説明できるルールに落とすレビュー会。",
            "复盘低置信 AI 推荐案例，把“不推荐”的原因整理成可解释规则的评审会。",
            "A review for low-confidence AI recommendations, converting weak matches into explainable filtering rules.",
        ),
    ]

    def localized_person(index: int, segment: str) -> dict[str, str]:
        offset = index - 1
        if segment == "jp_local_business":
            surname_i = offset % len(jp_surnames)
            given_i = (offset * 7 + offset // len(jp_surnames)) % len(jp_given_names)
            surname_ja, surname_en = jp_surnames[surname_i]
            given_ja, given_en = jp_given_names[given_i]
            name_ja = f"{surname_ja} {given_ja}"
            name_zh = f"{surname_ja}{given_ja}"
            name_en = f"{given_en} {surname_en}"
        elif segment in {"jp_chinese_business", "greater_china_business"}:
            family_i = offset % len(cn_family_names)
            given_i = (offset * 5 + offset // len(cn_family_names)) % len(cn_given_names)
            family_zh, family_en = cn_family_names[family_i]
            given_zh, given_en = cn_given_names[given_i]
            name_zh = f"{family_zh}{given_zh}"
            name_ja = f"{family_zh} {given_zh}"
            name_en = f"{given_en} {family_en}"
        else:
            given_i = offset % len(intl_given_names)
            family_i = (offset * 3 + offset // len(intl_given_names)) % len(intl_family_names)
            given_ja, given_zh, given_en = intl_given_names[given_i]
            family_ja, family_zh, family_en = intl_family_names[family_i]
            name_en = f"{given_en} {family_en}"
            name_ja = f"{family_ja} {given_ja}"
            name_zh = f"{family_zh}{given_zh}"
        return {"name_ja": name_ja, "name_zh": name_zh, "name_en": name_en}

    dictionaries = {
        "industries.json": [{"id": f"industry_{index:02d}", "label": value} for index, value in enumerate(industries, start=1)],
        "roles.json": [{"id": role, "label": role.replace("_", " ").title()} for role in roles],
        "company_types.json": ["smb", "startup", "enterprise", "vc", "community", "professional_services"],
        "languages.json": ["ja", "zh-Hans", "zh-Hant", "en"],
        "relationship_types.json": ["buyer", "seller", "partner", "investor", "mentor", "organizer", "service_provider"],
        "event_types.json": ["meetup", "conference", "roundtable", "demo_day", "private_dinner"],
        "business_goals.json": [{"id": f"goal_{index:02d}", "label": value} for index, value in enumerate(needs, start=1)],
        "offer_need_pairs.json": [
            {"need": needs[index % len(needs)], "offer": offers[(index + 3) % len(offers)]}
            for index in range(20)
        ],
        "follow_up_templates.json": [
            {"id": "template_intro", "channel": "chat", "body": "Share the event context, concrete overlap, and one next step."},
            {"id": "template_poc", "channel": "email", "body": "Confirm the PoC owner, target metric, and follow-up date."},
            {"id": "template_reactivate", "channel": "chat", "body": "Reference the last interaction and propose a narrow reconnection reason."},
        ],
    }
    for filename, data in dictionaries.items():
        _write_json(mockdata_dir / "dictionaries" / filename, data)

    company_roots = [
        ("北星", "北星", "North Star"),
        ("桜橋", "樱桥", "Sakura Bridge"),
        ("青葉", "青叶", "Aoba"),
        ("神田", "神田", "Kanda"),
        ("横浜", "横滨", "Yokohama"),
        ("関西", "关西", "Kansai"),
        ("銀座", "银座", "Ginza"),
        ("浅草", "浅草", "Asakusa"),
        ("梅田", "梅田", "Umeda"),
        ("福岡", "福冈", "Fukuoka"),
        ("紅橋", "红桥", "Red Bridge"),
        ("晨光", "晨光", "Morning Light"),
        ("雲杉", "云杉", "Cedar"),
        ("明岸", "明岸", "Bright Shore"),
        ("藍海", "蓝海", "Blue Harbor"),
        ("星野", "星野", "Hoshino"),
        ("竹林", "竹林", "Bamboo Grove"),
        ("南山", "南山", "Nanshan"),
    ]
    company_suffixes = [
        ("フーズ", "餐饮", "Foods"),
        ("テクノロジー", "科技", "Technologies"),
        ("パートナーズ", "伙伴", "Partners"),
        ("キャピタル", "资本", "Capital"),
        ("コミュニティ", "社群", "Community"),
    ]

    def localized_company(index: int) -> dict[str, str]:
        offset = index - 1
        root_ja, root_zh, root_en = company_roots[offset % len(company_roots)]
        suffix_ja, suffix_zh, suffix_en = company_suffixes[(offset // len(company_roots)) % len(company_suffixes)]
        return {
            "name": f"{root_en} {suffix_en}",
            "name_ja": f"{root_ja}{suffix_ja}",
            "name_zh": f"{root_zh}{suffix_zh}",
            "name_en": f"{root_en} {suffix_en}",
        }

    companies = []
    for index in range(1, 91):
        company_names = localized_company(index)
        companies.append(
            {
                "id": f"company_{index:03d}",
                **company_names,
                "industry": industries[index % len(industries)],
                "type": ["smb", "startup", "enterprise", "vc", "community"][index % 5],
                "city": ["Tokyo", "Osaka", "Shanghai", "Shenzhen", "Taipei", "Singapore"][index % 6],
            }
        )
    users: list[dict[str, Any]] = []
    for index, segment in enumerate(segments, start=1):
        names = localized_person(index, segment)
        role = roles[index % len(roles)]
        role_ja, role_zh, role_en = role_labels[role]
        company = companies[(index - 1) % len(companies)]
        need_ja, need_zh, need_en = needs_i18n[index % len(needs_i18n)]
        offer_ja, offer_zh, offer_en = offers_i18n[index % len(offers_i18n)]
        languages = ["ja"]
        if segment == "jp_chinese_business":
            languages = ["ja", "zh-Hans"]
        elif segment == "greater_china_business":
            languages = ["zh-Hans", "en"]
        elif segment == "international":
            languages = ["en", "ja"]
        users.append(
            {
                "id": f"user_{index:03d}",
                "display_name": names["name_ja"] if segment == "jp_local_business" else names["name_zh"] if segment != "international" else names["name_en"],
                **names,
                "segment": segment,
                "preferred_languages": languages,
                "company_id": company["id"],
                "company_name_ja": company["name_ja"],
                "company_name_zh": company["name_zh"],
                "company_name_en": company["name_en"],
                "role": role,
                "role_ja": role_ja,
                "role_zh": role_zh,
                "role_en": role_en,
                "profile_ja": f"{company['name_ja']}の{role_ja}。今回の関心は「{need_ja}」で、提供できる強みは「{offer_ja}」。",
                "profile_zh": f"{company['name_zh']}的{role_zh}。本次关注「{need_zh}」，可提供「{offer_zh}」。",
                "profile_en": f"{role_en} at {company['name_en']}. Looking for {need_en}; can offer {offer_en}.",
                "city": company["city"],
                "evidence_ids": [f"evidence:user:{index:03d}"],
            }
        )

    events = [
        {
            "id": f"event_{index:02d}",
            "title": event_templates[index - 1][0],
            "title_ja": event_templates[index - 1][0],
            "title_zh": event_templates[index - 1][1],
            "title_en": event_templates[index - 1][2],
            "description_ja": event_templates[index - 1][3],
            "description_zh": event_templates[index - 1][4],
            "description_en": event_templates[index - 1][5],
            "event_type": dictionaries["event_types.json"][index % len(dictionaries["event_types.json"])],
            "city": ["Tokyo", "Osaka", "Shanghai", "Taipei"][index % 4],
            "starts_at": f"2026-0{(index % 6) + 1}-15T10:00:00+09:00",
            "evidence_ids": [f"evidence:event:{index:02d}"],
        }
        for index in range(1, 11)
    ]

    participants = [
        {
            "id": f"participant_{index:03d}",
            "event_id": events[(index - 1) % len(events)]["id"],
            "user_id": users[(index * 7) % len(users)]["id"],
            "looking_for_at_event": [needs[index % len(needs)], needs[(index + 2) % len(needs)]],
            "looking_for_at_event_ja": [needs_i18n[index % len(needs_i18n)][0], needs_i18n[(index + 2) % len(needs_i18n)][0]],
            "looking_for_at_event_zh": [needs_i18n[index % len(needs_i18n)][1], needs_i18n[(index + 2) % len(needs_i18n)][1]],
            "can_offer_at_event": [offers[index % len(offers)], offers[(index + 4) % len(offers)]],
            "can_offer_at_event_ja": [offers_i18n[index % len(offers_i18n)][0], offers_i18n[(index + 4) % len(offers_i18n)][0]],
            "can_offer_at_event_zh": [offers_i18n[index % len(offers_i18n)][1], offers_i18n[(index + 4) % len(offers_i18n)][1]],
            "preferred_language": users[(index * 7) % len(users)]["preferred_languages"][0],
            "evidence_ids": [f"evidence:participant:{index:03d}"],
        }
        for index in range(1, 501)
    ]

    contacts = [
        {
            "id": f"contact_{index:03d}",
            "user_id": users[index - 1]["id"],
            "display_name": users[index - 1]["display_name"],
            "name_ja": users[index - 1]["name_ja"],
            "name_zh": users[index - 1]["name_zh"],
            "name_en": users[index - 1]["name_en"],
            "company_id": users[index - 1]["company_id"],
            "company_name_ja": users[index - 1]["company_name_ja"],
            "company_name_zh": users[index - 1]["company_name_zh"],
            "company_name_en": users[index - 1]["company_name_en"],
            "role_ja": users[index - 1]["role_ja"],
            "role_zh": users[index - 1]["role_zh"],
            "role_en": users[index - 1]["role_en"],
            "profile_ja": users[index - 1]["profile_ja"],
            "profile_zh": users[index - 1]["profile_zh"],
            "profile_en": users[index - 1]["profile_en"],
            "source": ["event_import", "business_card", "manual", "referral"][index % 4],
            "evidence_ids": [f"evidence:contact:{index:03d}"],
        }
        for index in range(1, len(users) + 1)
    ]

    connections = [
        {
            "id": f"connection_{index:04d}",
            "user_id": users[(index * 5) % len(users)]["id"],
            "contact_id": contacts[(index * 11) % len(contacts)]["id"],
            "relationship_type": dictionaries["relationship_types.json"][index % len(dictionaries["relationship_types.json"])],
            "relationship_strength": round(0.35 + (index % 60) / 100, 2),
            "trust_level": round(0.4 + (index % 50) / 100, 2),
            "business_relevance_score": round(0.45 + (index % 45) / 100, 2),
            "shared_topics": [industries[index % len(industries)], needs[index % len(needs)]],
            "suggested_actions": [offers[index % len(offers)]],
            "evidence_ids": [f"evidence:connection:{index:04d}"],
        }
        for index in range(1, 901)
    ]

    interactions = [
        {
            "id": f"interaction_{index:04d}",
            "connection_id": connections[(index * 13) % len(connections)]["id"],
            "occurred_at": f"2026-06-{(index % 28) + 1:02d}T{(index % 10) + 9:02d}:00:00+09:00",
            "channel": ["event", "chat", "email", "meeting"][index % 4],
            "summary": f"Discussed {needs[index % len(needs)]} and {offers[index % len(offers)]}.",
            "evidence_ids": [f"evidence:interaction:{index:04d}"],
        }
        for index in range(1, 1201)
    ]

    recommendations = [
        {
            "id": f"recommendation_{index:04d}",
            "event_id": events[index % len(events)]["id"],
            "user_id": users[(index * 3) % len(users)]["id"],
            "recommended_user_id": users[((index * 3) + 17) % len(users)]["id"],
            "score": round(0.5 + (index % 45) / 100, 2),
            "reason": f"Need/offer fit: {needs[index % len(needs)]} ↔ {offers[(index + 5) % len(offers)]}.",
            "evidence_ids": [f"evidence:recommendation:{index:04d}"],
        }
        for index in range(1, 351)
    ]

    golden_matches = [
        {
            "id": f"golden_match_{index:03d}",
            "event_id": recommendations[index % len(recommendations)]["event_id"],
            "user_id": recommendations[index % len(recommendations)]["user_id"],
            "recommended_user_id": recommendations[index % len(recommendations)]["recommended_user_id"],
            "score": 0.9,
            "label": "golden_positive",
            "evidence_ids": [f"evidence:golden:{index:03d}"],
        }
        for index in range(1, 151)
    ]

    negative_cases = [
        {
            "id": f"negative_case_{index:03d}",
            "event_id": events[index % len(events)]["id"],
            "user_id": users[(index * 2) % len(users)]["id"],
            "recommended_user_id": users[((index * 2) + 53) % len(users)]["id"],
            "score": round(0.05 + (index % 20) / 100, 2),
            "reason": "Low-context or conflicting event intent; should be filtered.",
            "evidence_ids": [f"evidence:negative:{index:03d}"],
        }
        for index in range(1, 61)
    ]

    dirty_cases = [
        {
            "id": f"dirty_case_{index:03d}",
            "case_type": ["generic_goal", "missing_language", "duplicate_contact", "low_confidence_ai"][index % 4],
            "value": ["meet interesting people", "人脈を広げたい", "", "ai score below review threshold"][index % 4],
            "expected_handling": "flag_for_review",
            "evidence_ids": [f"evidence:dirty:{index:03d}"],
        }
        for index in range(1, 26)
    ]

    ai_analyses = [
        {
            "id": f"ai_analysis_{index:04d}",
            "target_type": ["user", "event_participant", "connection", "recommendation"][index % 4],
            "target_id": (
                users[index % len(users)]["id"]
                if index % 4 == 0
                else participants[index % len(participants)]["id"]
                if index % 4 == 1
                else connections[index % len(connections)]["id"]
                if index % 4 == 2
                else recommendations[index % len(recommendations)]["id"]
            ),
            "confidence": round(0.45 + (index % 50) / 100, 2),
            "result_json": {
                "confirmed_facts": [needs[index % len(needs)]],
                "inferred_traits": [offers[index % len(offers)]],
                "low_confidence": index % 7 == 0,
            },
            "evidence_ids": [f"evidence:ai:{index:04d}"],
        }
        for index in range(1, 241)
    ]

    messages = [
        {
            "id": f"message_{index:04d}",
            "connection_id": connections[index % len(connections)]["id"],
            "body": f"Follow up about {needs[index % len(needs)]} with a concrete next step.",
            "language": ["ja", "zh-Hans", "en"][index % 3],
            "evidence_ids": [f"evidence:message:{index:04d}"],
        }
        for index in range(1, 401)
    ]

    seed_files = {
        "users.seed.json": users,
        "events.seed.json": events,
        "event_participants.seed.json": participants,
        "contacts.seed.json": contacts,
        "connections.seed.json": connections,
        "interactions.seed.json": interactions,
        "messages.seed.json": messages,
        "ai_analyses.seed.json": ai_analyses,
        "match_recommendations.seed.json": recommendations,
    }
    for filename, data in seed_files.items():
        _write_json(mockdata_dir / "seed" / filename, data)

    generated_files = {
        "users.generated.json": users,
        "events.generated.json": events,
        "event_participants.generated.json": participants,
        "contacts.generated.json": contacts,
        "connections.generated.json": connections,
        "interactions.generated.json": interactions,
        "match_recommendations.generated.json": recommendations,
    }
    for filename, data in generated_files.items():
        _write_json(mockdata_dir / "generated" / filename, data)

    _write_json(mockdata_dir / "tests/golden_matches.json", golden_matches)
    _write_json(mockdata_dir / "tests/negative_cases.json", negative_cases)
    _write_json(mockdata_dir / "tests/dirty_data_cases.json", dirty_cases)

    scenario_names = [path.removesuffix(".json") for path in REQUIRED_SCENARIO_FILES]
    for index, scenario in enumerate(scenario_names, start=1):
        _write_json(
            mockdata_dir / "scenarios" / f"{scenario}.json",
            {
                "id": scenario,
                "event_id": events[(index - 1) % len(events)]["id"],
                "primary_need": needs[index % len(needs)],
                "primary_offer": offers[index % len(offers)],
                "expected_records": {
                    "participants": 50,
                    "recommendations": 35,
                    "dirty_cases": 2 if index <= 5 else 3,
                },
            },
        )

    seed_export = {
        "schema_version": "relationship_mockdata_v1",
        "generated_at": generated_at,
        "minimax_plan_excerpt": minimax_plan_text[:2000],
        "users": users,
        "events": events,
        "event_participants": participants,
        "contacts": contacts,
        "connections": connections,
        "interactions": interactions,
        "messages": messages,
        "ai_analyses": ai_analyses,
        "match_recommendations": recommendations,
        "golden_matches": golden_matches,
        "negative_cases": negative_cases,
        "dirty_data_cases": dirty_cases,
    }
    _write_json(mockdata_dir / "exports/local_seed.json", seed_export)
    _write_json(mockdata_dir / "exports/demo_seed.json", {**seed_export, "export_profile": "demo"})
    _write_json(mockdata_dir / "generation/minimax_generation_plan.json", {"generated_at": generated_at, "plan_text": minimax_plan_text})
    hybrid_fixture = _build_hybrid_runtime_fixture(
        generated_at=generated_at,
        users=users,
        events=events,
        participants=participants,
        contacts=contacts,
        connections=connections,
        interactions=interactions,
        messages=messages,
        ai_analyses=ai_analyses,
        recommendations=recommendations,
        golden_matches=golden_matches,
        negative_cases=negative_cases,
        dirty_cases=dirty_cases,
    )
    _write_hybrid_runtime_fixture(mockdata_dir, hybrid_fixture)

    (mockdata_dir / "validators/validate_relationship_mockdata.mjs").write_text(
        "#!/usr/bin/env node\n"
        "import { existsSync, readFileSync } from 'node:fs';\n"
        "const root = new URL('../', import.meta.url);\n"
        "const required = ['seed/users.seed.json','seed/events.seed.json','seed/event_participants.seed.json','seed/connections.seed.json','seed/match_recommendations.seed.json','tests/golden_matches.json'];\n"
        "for (const rel of required) {\n"
        "  const url = new URL(rel, root);\n"
        "  if (!existsSync(url)) throw new Error(`Missing ${rel}`);\n"
        "  JSON.parse(readFileSync(url, 'utf8'));\n"
        "}\n"
        "console.log('relationship mockdata files are present and parseable');\n"
    )
    (mockdata_dir / "generation/README.md").write_text(
        "# Orbit Relationship Mockdata Generation\n\n"
        "This dataset was expanded deterministically from a compact MiniMax Claude SDK plan. "
        "The plan is stored in `generation/minimax_generation_plan.json`; API tokens and provider "
        "environment values are not written to this directory.\n\n"
        "The same generator also writes `../orbits/shared/mock/generated-relationship-fixtures.ts`, "
        "which satisfies the app's `MockRuntimeFixtures` contract and is consumed by the existing "
        "hybrid local-remote database path. Feature services should read that DTO-shaped fixture "
        "through `createOrbitLocalRemoteDatabase()`, not parse these snake_case JSON exports directly.\n\n"
        "The generator writes stable IDs, source/evidence references, conservative low-confidence AI "
        "analysis flags, negative cases, dirty data cases, and export bundles for future importers.\n"
    )

    return {
        "users": len(users),
        "events": len(events),
        "companies": len(companies),
        "participants": len(participants),
        "connections": len(connections),
        "interactions": len(interactions),
        "recommendations": len(recommendations),
        "golden_matches": len(golden_matches),
    }


def _load_contract(sprint_number: int) -> SprintContract:
    return SprintContract.load(PROJECT_DIR / "harness-state" / "contracts" / f"contract-sprint-{sprint_number}.json")


def _relationship_cfg() -> HarnessConfig:
    cfg = HarnessConfig.load(PROJECT_DIR / "harness" / "config.yaml")
    cfg.workspace.mode = "existing-codebase"
    cfg.workspace.git.enabled = False
    cfg.workspace.git.strategy = "disabled"
    return cfg


def _build_mockdata_prompt(contract: SprintContract, design_doc: str, validation: dict[str, Any] | None) -> str:
    validation_text = ""
    if validation:
        validation_text = (
            "\n\n## Previous Validation Failures\n"
            "Fix every issue in this JSON report before stopping:\n"
            f"```json\n{json.dumps(validation, indent=2, ensure_ascii=False)[:12000]}\n```"
        )
    return (
        "You are the Generator agent for Orbit Sprint 82. Work at the project root.\n\n"
        "Write files only under repos/mockdata. Do not edit repos/orbits, harness, harness-state, "
        "harness-logs, .env files, or any git metadata. Do not print, save, or infer API keys.\n\n"
        "Use the advisory design document to create high-quality v1 demo data. Do not make random filler data. "
        "Every generated relationship should answer: why this person came to this event, what they need, "
        "what they can offer, who should be recommended, why, and what the next step is.\n\n"
        "Use snake_case field names matching the design document: event_id, user_id, recommended_user_id, "
        "looking_for_at_event, can_offer_at_event, result_json, evidence_ids.\n\n"
        "Required scale: 120-150 users, 10-12 events, 80-100 companies/organizations, "
        "400-600 event participant records, 800-1200 connections, 1000-1500 interactions, "
        "300-500 match recommendations, 100-200 golden matches. Include at least 20 dirty data cases.\n\n"
        "Required user segment field values and approximate ratios: jp_local_business 45-55%, "
        "jp_chinese_business 25-35%, greater_china_business 10-15%, international 5-10%.\n\n"
        "Create the directories and files listed in the sprint contract. Also create "
        "repos/mockdata/validators/validate_relationship_mockdata.mjs and repos/mockdata/generation/README.md "
        "describing how data was generated and validated without secrets.\n\n"
        f"## Sprint Contract\n```json\n{json.dumps(contract.__dict__, default=lambda value: value.__dict__, indent=2, ensure_ascii=False)}\n```\n\n"
        f"## Advisory Design Document\n{design_doc[:50000]}"
        f"{validation_text}\n\n"
        "After writing files, run the validator you created if practical and summarize the generated counts."
    )


def _build_mockdata_plan_prompt(contract: SprintContract, design_doc: str, validation: dict[str, Any] | None) -> str:
    validation_text = ""
    if validation and validation.get("issues"):
        validation_text = "\n\nPrevious deterministic validation issues to account for:\n" + "\n".join(
            f"- {issue}" for issue in validation["issues"][:20]
        )
    return (
        "Return only a compact JSON object for an Orbit relationship mockdata generation plan. "
        "Do not call tools and do not write files. Include keys: themes, persona_templates, "
        "scenario_emphasis, dirty_case_policy, conservative_ai_policy, and follow_up_tone. "
        "Keep it under 1200 words.\n\n"
        "The downstream deterministic expander will create the full v1 dataset at these volumes: "
        "120-150 users, 10-12 events, 80-100 companies, 400-600 participants, 800-1200 "
        "connections, 1000-1500 interactions, 300-500 recommendations, and 100-200 golden matches.\n\n"
        f"## Sprint Goal\n{contract.goal}\n\n"
        f"## Advisory Design Excerpt\n{design_doc[:12000]}"
        f"{validation_text}"
    )


async def _run_minimax_agent(prompt: str, project_dir: Path, env: dict[str, str]) -> str:
    from claude_agent_sdk import AssistantMessage, ResultMessage, query

    agent_cfg = SingleAgentConfig(backend="claude", model=MINIMAX_MODEL, max_tokens=16384)
    options = build_claude_options(
        agent_cfg,
        "You are an Orbit relationship mockdata generation agent. Follow path boundaries exactly.",
        allowed_tools=["Read", "Write", "Edit", "Bash", "Glob"],
        permission_mode="bypassPermissions",
        cwd=str(project_dir),
        env=env,
        max_turns=160,
    )
    summary = ""
    async for message in query(prompt=prompt, options=options):
        if isinstance(message, AssistantMessage):
            for block in message.content:
                text = getattr(block, "text", "")
                if text:
                    summary = text
        elif isinstance(message, ResultMessage):
            summary = getattr(message, "result", "") or summary
    return summary


def run_minimax_agent_with_timeout(
    prompt: str,
    project_dir: Path,
    env: dict[str, str],
    *,
    timeout_seconds: float = DEFAULT_MINIMAX_AGENT_TIMEOUT_SECONDS,
) -> str:
    try:
        return asyncio.run(asyncio.wait_for(_run_minimax_agent(prompt, project_dir, env), timeout=timeout_seconds))
    except TimeoutError as exc:
        raise TimeoutError(f"MiniMax mockdata agent timed out after {timeout_seconds:g}s.") from exc


def _write_result_files(paths: dict[str, Path], sprint: int, passed: bool, validation: dict[str, Any], summary: str) -> None:
    criterion_status = "pass" if passed else "fail"
    eval_result = EvalResult(
        verdict="pass" if passed else "fail",
        rubric_average=4.0 if passed else 1.0,
        contract_results=[
            SuccessCriterion(
                id="SC-VALIDATION",
                description=f"Sprint {sprint} deterministic validation.",
                status=criterion_status,
                evidence=str(paths["artifacts"] / "mockdata-validation.json"),
            )
        ],
        feedback=summary[:4000] + ("\n\n" + "\n".join(validation.get("issues", [])[:20]) if not passed else ""),
    )
    verification = VerificationResult(
        verdict="pass" if passed else "fail",
        experience_average=4.0 if passed else 1.0,
        scores={"data_quality": 4.0 if passed else 1.0},
        issues=[],
        feedback="Deterministic mockdata validation passed." if passed else "Deterministic mockdata validation failed.",
    )
    handoff = HandoffState(
        sprint_number=sprint,
        project_dir=str(PROJECT_DIR),
        completed_features=[summary[:2000]] if passed else [],
        partial_features=[] if passed else [summary[:2000]],
        known_broken=validation.get("issues", [])[:20],
        files_changed=sorted(str(path.relative_to(PROJECT_DIR)) for path in (PROJECT_DIR / "repos/mockdata").rglob("*") if path.is_file()),
        run_commands=["uv run python -m harness.relationship_data_goal_runner validate"],
    )
    eval_result.save(paths.get("eval_result", paths["evals"] / f"eval-sprint-{sprint}-iter-1.json"))
    verification.save(paths.get("verification_result", paths["verifications"] / f"verify-sprint-{sprint}-iter-1.json"))
    handoff.save(paths.get("handoff_result", paths["handoffs"] / f"handoff-sprint-{sprint}.json"))


def run_sprint_81(project_dir: Path, cfg: HarnessConfig, app_url: str, run_id: str) -> None:
    contract = _load_contract(81)
    enforce_preflight(project_dir, cfg)
    spec = (project_dir / "harness-state" / "spec.md").read_text()
    eval_result, verify_result, _handoff = run_sprint(spec, contract, project_dir, cfg, app_url, run_id=run_id)
    if eval_result.verdict not in {"pass", "conditional_pass"} or verify_result.verdict not in {"pass", "conditional_pass"}:
        raise SystemExit(f"Sprint 81 failed: evaluator={eval_result.verdict}, verifier={verify_result.verdict}")


def run_sprint_82(project_dir: Path, cfg: HarnessConfig, run_id: str) -> None:
    contract = _load_contract(82)
    design_doc = (project_dir / "repos/mockdata/orbit_mock_data_ai_relationship_design.md").read_text()
    env = build_minimax_env()
    max_iterations = int((contract.file_boundary or {}).get("max_iterations") or contract.evidence.get("max_iterations") or 6)
    agent_timeout_seconds = float(
        (contract.file_boundary or {}).get("agent_timeout_seconds")
        or contract.evidence.get("agent_timeout_seconds")
        or DEFAULT_MINIMAX_AGENT_TIMEOUT_SECONDS
    )
    validation: dict[str, Any] | None = None
    summary = ""
    baseline_fingerprints = project_status_fingerprints(project_dir)
    for iteration in range(1, max_iterations + 1):
        paths = ensure_project_layout(project_dir, cfg, sprint=82, iteration=iteration, run_id=run_id)
        paths["artifacts"].mkdir(parents=True, exist_ok=True)
        (paths["artifacts"] / "minimax-env.json").write_text(json.dumps(redacted_minimax_env(env), indent=2))
        prompt = _build_mockdata_plan_prompt(contract, design_doc, validation)
        (paths["artifacts"] / "prompt.md").write_text(prompt)
        try:
            plan_text = run_minimax_agent_with_timeout(
                prompt,
                project_dir,
                env,
                timeout_seconds=min(agent_timeout_seconds, 90),
            )
        except TimeoutError as exc:
            summary = str(exc)
            validation = {
                "passed": False,
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "mockdata_dir": str(project_dir / "repos/mockdata"),
                "counts": {},
                "issues": [summary],
            }
            (paths["artifacts"] / "agent-summary.md").write_text(summary)
            (paths["artifacts"] / "mockdata-validation.json").write_text(json.dumps(validation, indent=2, ensure_ascii=False))
            _write_result_files(paths, 82, False, validation, summary)
            raise SystemExit(summary) from exc
        (paths["artifacts"] / "minimax-plan.txt").write_text(plan_text)
        counts = generate_relationship_mockdata(project_dir / "repos/mockdata", minimax_plan_text=plan_text)
        summary = (
            "MiniMax Claude SDK returned a compact generation plan; deterministic expander wrote "
            f"relationship mockdata counts: {json.dumps(counts, sort_keys=True)}"
        )
        (paths["artifacts"] / "agent-summary.md").write_text(summary)
        boundary_violations = project_write_boundary_violations(project_dir, baseline_fingerprints)
        if boundary_violations:
            validation = {
                "passed": False,
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "mockdata_dir": str(project_dir / "repos/mockdata"),
                "counts": {},
                "issues": [
                    "MiniMax mockdata agent wrote outside allowed roots: "
                    + ", ".join(boundary_violations)
                ],
            }
            (paths["artifacts"] / "mockdata-validation.json").write_text(json.dumps(validation, indent=2, ensure_ascii=False))
            _write_result_files(paths, 82, False, validation, summary)
            raise SystemExit(validation["issues"][0])
        validation = validate_relationship_mockdata(project_dir / "repos/mockdata")
        (paths["artifacts"] / "mockdata-validation.json").write_text(json.dumps(validation, indent=2, ensure_ascii=False))
        _write_result_files(paths, 82, bool(validation["passed"]), validation, summary)
        if validation["passed"]:
            return
    assert validation is not None
    raise SystemExit("Sprint 82 failed validation after all iterations: " + "; ".join(validation["issues"][:10]))


def validate_command(project_dir: Path) -> None:
    validation = validate_relationship_mockdata(project_dir / "repos/mockdata")
    print(json.dumps(validation, indent=2, ensure_ascii=False))
    if not validation["passed"]:
        raise SystemExit(1)


def run_all(app_url: str, run_id: str | None = None) -> None:
    cfg = _relationship_cfg()
    run_id = run_id or new_run_id()
    log.setup(PROJECT_DIR, log_root=cfg.workspace.log_root, label="relationship-data")
    run_sprint_81(PROJECT_DIR, cfg, app_url, run_id)
    run_sprint_82(PROJECT_DIR, cfg, run_id)


def main() -> None:
    parser = argparse.ArgumentParser(description="Run Orbit relationship-data goal sprints 81 and 82.")
    parser.add_argument("command", choices=["run", "run-sprint-81", "run-sprint-82", "validate"])
    parser.add_argument("--app-url", default="http://localhost:3000")
    parser.add_argument("--run-id", default=None)
    args = parser.parse_args()

    cfg = _relationship_cfg()
    log.setup(PROJECT_DIR, log_root=cfg.workspace.log_root, label="relationship-data")
    run_id = args.run_id or new_run_id()
    if args.command == "validate":
        validate_command(PROJECT_DIR)
    elif args.command == "run-sprint-81":
        run_sprint_81(PROJECT_DIR, cfg, args.app_url, run_id)
    elif args.command == "run-sprint-82":
        run_sprint_82(PROJECT_DIR, cfg, run_id)
    else:
        run_sprint_81(PROJECT_DIR, cfg, args.app_url, run_id)
        run_sprint_82(PROJECT_DIR, cfg, run_id)


if __name__ == "__main__":
    main()
