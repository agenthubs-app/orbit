# SPEC: Orbit Product Completion Harness Sprints

## Product Execution Summary
Orbit needs a focused product-completion sequence that restores the intended integrated root homepage, adds asynchronous relationship correspondence, and makes Orbit AI useful for follow-up context, contact discovery, event discovery, general conversation, to-do synthesis, calendar staging, proactive reminders, localization, schedule navigation, event registration guidance, event detail UI restoration, and demonstration visual assets.

The target implementation repo is `repos/orbits`. Evidence, logs, browser traces, generated reports, and temporary files must remain under `harness-state/` and `harness-logs/`. The reference repository `repos/tokyo-business-connect` is read-only.

## Architecture Overview
The sprints preserve the existing mock/hybrid/live feature boundary. Product pages consume route view models and feature service factories; React presenters do not import raw fixtures, live providers, or external SDK clients. Orbit AI capabilities use a structured orchestration boundary with deterministic evaluation cases around generated outputs, while all potentially side-effecting actions remain staged or local-only until a later live integration explicitly changes that contract.

## Global Safety And Quality Constraints
- Run GitNexus impact analysis before editing any existing function, class, or method.
- Use tests-first implementation for each sprint: write failing focused tests, verify red, implement, verify green.
- Preserve no-write live safety unless a sprint explicitly scopes a local-only staged record.
- No external sends, notifications, calendar mutations, CRM writes, or hidden network side effects.
- Keep app-facing copy aligned with the active system language.
- Update app documentation for every app implementation change.
- Commit only relevant app changes after a sprint is verified; never include unrelated user or generated changes.

## Sprint Execution Boundary

`harness-state/spec.md` is intentionally a concise execution overview. Do not use it as the source of detailed sprint implementation requirements. Use `harness-state/contracts/contract-sprint-N.json` as the authoritative contract for each sprint, including success criteria, evidence, file boundaries, and mock-to-live replacement docs. Use `harness-state/sprints.md` only as a human-readable sprint index.