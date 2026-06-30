# Orbit Agent Operating Notes

This file records how we run the Orbit harness and develop the generated app. Treat it as a
living project note: update it whenever the harness workflow or development policy changes.

## Repository Boundaries

- Harness code lives in `harness/`.
- Harness runtime state, evidence, logs, contracts, handoffs, and audits live under
  `harness-state/` and `harness-logs/`.
- The app implementation target is `repos/orbits`.
- `repos/tokyo-business-connect` is reference-only. Do not implement, stage, or commit changes
  there.
- `repos/orbits` is managed as a local git repo. Current policy is local commits only:
  `workspace.git.enabled: true`, `strategy: path-scoped`, `push: false`.

## Harness Execution

Use `uv` for every Python command.

Common flow:

```bash
uv sync
uv run python -m harness.harness doctor
uv run python -m harness.harness plan --brief "Build the next narrow Orbit sprint"
uv run python -m harness.harness run-sprint --sprint N --app-url http://localhost:3000
uv run python -m harness.harness hygiene
```

Before generation:

- Confirm `uv run python -m harness.harness doctor` has no failures.
- Confirm `repos/orbits` has a clean worktree.
- Confirm the sprint contract is listed in `harness-state/plan-manifest.json`.
- Confirm the sprint is small enough by the granularity rules below.

After generation:

- Review `harness-state/runs/run-id/sprint-N/iter-M/`.
- Check `repos/orbits` status and commit history.
- Keep harness artifacts out of `repos/orbits`.
- Check that changed app files fit the sprint's `file_boundary`; the harness enforces this after
  Generator and repair passes.
- For every mock component or mock-backed route, check that the sprint's
  `file_boundary.mock_to_live_doc` exists in the contract's `evidence.source_files`.

Iteration output package:

```text
harness-state/runs/run-id/sprint-N/iter-M/
  evidence.json
  eval.json
  verification.json
  handoff.json
  git/
  commands/
  browser/
  screenshots/
  axe/
  lighthouse/
  source/
  api/
  artifacts/
```

## Sprint Granularity Rule

Sprint size is a quality gate. A sprint should be small enough that Generator can implement it,
Evaluator can prove it, and Verifier can inspect it without relying on broad product intent.

Current Orbit planning policy is capability-first for Milestone C. Framework code is real:
Next.js scaffold, app shell, API envelope, feature mode, domain contracts, mock registry, service
factory, capability registry, and debug surfaces should be implemented directly. Hard-to-debug or
external capabilities get explicit mock boundaries before page composition: OCR / business-card
scan, QR scan, contact imports, email/calendar signals, recommendations, chat summary, message
drafting, notifications, dashboard analytics, agent actions, external action execution, and AI
provider calls. Page sprints may only compose previously approved capabilities and mock services.

A sprint should normally have:

- One user-visible goal or one platform foundation goal.
- Three to five success criteria.
- One primary feature area, such as auth shell, profile contracts, events, contacts,
  recommendations, followups, chat, dashboard, agent actions, persistence, or AI provider wiring.
- One implementation layer when possible: contracts, mock UI loop, live service, persistence
  migration, or AI integration. Combining layers is allowed only when the change is very small.
- Evidence that can be collected through a short list of routes, API probes, commands, and source
  files.

Split the sprint if it includes any of these:

- More than one independent product workflow.
- Multiple feature domains that can pass or fail independently.
- UI, API contracts, database persistence, and AI behavior in the same sprint.
- More than five success criteria.
- Evidence hints that span many unrelated routes or service modules.
- A goal that requires words like "full", "complete", "entire", "all primary pages", or
  "end-to-end" before the foundations are already in place.

When Planner proposes an oversized sprint, revise the plan before running Generator. Do not rely
on Generator to self-scope a large sprint.

## Preferred Sprint Shape

Use this shape when writing or reviewing sprint contracts:

```text
Goal: one narrow behavior or foundation.

Done when:
- Observable criterion 1.
- Observable criterion 2.
- Observable criterion 3.

Out of scope:
- Explicit adjacent feature not included.
- Explicit later-layer work not included.

Evidence hints:
- Routes: only routes needed for this sprint.
- API: only endpoints changed or verified by this sprint.
- Commands: npm test, npm run lint, npm run build when relevant.
- Source files: concrete app-relative files only.
File boundary:
- `capability_root`: the sprint's ownership root.
- `owned_paths`: files or trailing `/**` directories this sprint may edit.
- `allowed_shared_paths`: shared files this sprint may touch explicitly.
- `forbidden_paths`: adjacent capabilities this sprint must not touch.
- `mock_to_live_doc`: required for every mock component or mock-backed route.
```

The Generator may edit only `owned_paths` and `allowed_shared_paths`. Shared files should be
listed narrowly and only when a sprint genuinely needs shared API, DTO, route-composition, or
registry work. If a mock component is implemented, its replacement document must explain live
service/provider files, the switch mechanism, required env vars or permissions,
privacy/provenance constraints, and tests.

## Current Planning Bias

Prefer smaller sprints than the initial plan when there is doubt. For example, do not group
Recommendations, Followups, Chat, Dashboard, and Agent into one implementation sprint unless the
work is contract-only and the evidence remains compact. Split by domain when the sprint moves
from contracts into UI, live persistence, or AI behavior.

## Productization Sprint Policy

After Sprint 68, the mock capability loop is runnable but should not be treated as the final
participant-facing product. The next productization sprints must improve the existing mock-backed
framework and `/app/**` product routes without adding new backend capability behavior.

Use `harness-state/productization-notes/product-facing-sprints.md` as the backlog source when
planning Sprint 69 and later.

Productization sprints must follow these rules:

- Public `/app/**` routes lead with user work: who needs attention, why now, what source backs it,
  and what safe action is available next.
- Mock, harness, fixture, provider, operator, raw ID, and implementation language must not be the
  primary public narrative. Keep demo/runtime details in compact badges or secondary disclosures.
- Raw `evidence:*`, `source:*`, `queue:*`, and similar IDs stay out of primary copy. Use readable
  source chips and optional technical details.
- Each sprint should touch one product surface or one shared presentation layer. Do not combine
  visual system, route IA, copy rewrite, and multiple page families in the same sprint.
- Verifier should judge public product routes as real user surfaces. If a UX issue requires
  cross-route product polish outside the sprint boundary, convert it into the next productization
  sprint instead of expanding the current sprint silently.

## SPEC Role

`harness-state/spec.md` is an execution spec, not the source of product strategy. It should contain
only the product execution summary, implementation principles, technical boundaries, and a concise
sprint strategy summary.

Do not put detailed sprint implementation requirements, full success criteria, evidence lists, or
contract seed JSON in `harness-state/spec.md`. The authoritative source for a sprint's concrete
implementation and evaluation requirements is `harness-state/contracts/contract-sprint-N.json`.
Use `harness-state/sprints.md` as a human-readable index, not as the final source of truth.

Long-form business positioning, market reasoning, and future product vision belong in product
context documents under `docs/`, not in `harness-state/spec.md`.

## Documentation And Knowledge Base Maintenance

- Use `knowledge/index.zh.md` as the first project knowledge entry before deep code exploration.
- 每次实现变更都必须更新或新增相关文档；architecture change, data contract change,
  agent tool change, or harness workflow change must also update or add the relevant documentation.
- Every user-visible or architecture-relevant change must append a 中文 entry to
  `knowledge/history/development-log.zh.md`.
- New document catalog and knowledge entries must include 中文 titles and 中文 summaries.
- New troubleshooting, error, and recurring-pattern learnings under `.learnings/` must be
  reflected in `knowledge/learnings/`.
