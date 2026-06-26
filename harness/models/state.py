from __future__ import annotations

from dataclasses import asdict, dataclass, field
import json
from pathlib import Path
from typing import Any


@dataclass
class SuccessCriterion:
    id: str
    description: str
    status: str = "pending"
    evidence: str = ""


@dataclass
class SprintContract:
    sprint_number: int
    goal: str
    success_criteria: list[SuccessCriterion]
    out_of_scope: list[str] = field(default_factory=list)
    evidence: dict[str, Any] = field(default_factory=dict)
    file_boundary: dict[str, Any] = field(default_factory=dict)
    confirmed: bool = False

    def all_criteria_met(self) -> bool:
        return all(item.status == "pass" for item in self.success_criteria)

    def failing_criteria(self) -> list[SuccessCriterion]:
        return [item for item in self.success_criteria if item.status == "fail"]

    def save(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(asdict(self), indent=2, ensure_ascii=False))

    @classmethod
    def load(cls, path: Path) -> "SprintContract":
        data = json.loads(path.read_text())
        criteria = [SuccessCriterion(**item) for item in data.get("success_criteria", [])]
        return cls(
            sprint_number=data["sprint_number"],
            goal=data["goal"],
            success_criteria=criteria,
            out_of_scope=data.get("out_of_scope", []),
            evidence=data.get("evidence", {}),
            file_boundary=data.get("file_boundary", {}),
            confirmed=data.get("confirmed", False),
        )


@dataclass
class HandoffState:
    sprint_number: int
    project_dir: str
    completed_features: list[str] = field(default_factory=list)
    partial_features: list[str] = field(default_factory=list)
    known_broken: list[str] = field(default_factory=list)
    architecture_decisions: dict[str, Any] = field(default_factory=dict)
    next_steps: list[str] = field(default_factory=list)
    files_changed: list[str] = field(default_factory=list)
    run_commands: list[str] = field(default_factory=list)

    def save(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(asdict(self), indent=2, ensure_ascii=False))

    @classmethod
    def load(cls, path: Path) -> "HandoffState":
        data = json.loads(path.read_text())
        return cls(**{key: value for key, value in data.items() if key in cls.__dataclass_fields__})


@dataclass
class EvalResult:
    verdict: str
    rubric_average: float
    contract_results: list[SuccessCriterion]
    feedback: str

    def save(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(asdict(self), indent=2, ensure_ascii=False))

    @classmethod
    def load(cls, path: Path) -> "EvalResult":
        data = json.loads(path.read_text())
        return cls(
            verdict=data["verdict"],
            rubric_average=data["rubric_average"],
            contract_results=[SuccessCriterion(**item) for item in data.get("contract_results", [])],
            feedback=data.get("feedback", ""),
        )


@dataclass
class ExperienceIssue:
    id: str
    severity: str
    user_impact: str
    evidence: str
    recommendation: str


@dataclass
class VerificationResult:
    verdict: str
    experience_average: float
    scores: dict[str, float]
    issues: list[ExperienceIssue]
    feedback: str

    def save(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(asdict(self), indent=2, ensure_ascii=False))

    @classmethod
    def load(cls, path: Path) -> "VerificationResult":
        data = json.loads(path.read_text())
        return cls(
            verdict=data["verdict"],
            experience_average=data["experience_average"],
            scores={key: float(value) for key, value in data.get("scores", {}).items()},
            issues=[ExperienceIssue(**item) for item in data.get("issues", [])],
            feedback=data.get("feedback", ""),
        )


def format_handoff_for_prompt(handoff: HandoffState) -> str:
    lines = [f"## Handoff State - Sprint {handoff.sprint_number}"]
    if handoff.completed_features:
        lines.append("\n### Completed and verified:")
        lines.extend(f"- {item}" for item in handoff.completed_features)
    if handoff.partial_features:
        lines.append("\n### Partially completed:")
        lines.extend(f"- {item}" for item in handoff.partial_features)
    if handoff.known_broken:
        lines.append("\n### Known broken / feedback:")
        lines.extend(f"- {item}" for item in handoff.known_broken)
    if handoff.architecture_decisions:
        lines.append("\n### Architecture decisions:")
        lines.extend(f"- {key}: {value}" for key, value in handoff.architecture_decisions.items())
    if handoff.next_steps:
        lines.append("\n### Next steps:")
        lines.extend(f"{index + 1}. {item}" for index, item in enumerate(handoff.next_steps))
    if handoff.run_commands:
        lines.append("\n### Run commands:")
        lines.extend(f"- {item}" for item in handoff.run_commands)
    return "\n".join(lines)
