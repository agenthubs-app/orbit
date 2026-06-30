# SPEC: Orbit Relationship Data And Mockdata Harness Sprints

## Product Execution Summary

Orbit needs relationship-aware data foundations that support event-specific intent, explainable AI recommendations, and high-quality Japanese business / Chinese business-community demo data. The referenced design document is advisory, not authoritative. Sprint 81 must inspect the current `repos/orbits` local-remote database design and make the best schema tradeoff across field value, redundancy, query efficiency, migration cost, and future live-database replacement. Sprint 82 must use an AI agent connected through the MiniMax Anthropic-compatible Claude SDK environment to generate v1 demo-scale seed data under `repos/mockdata`.

## Implementation Principles

- Do not replace the current Orbit schema wholesale. Preserve the existing product layer (`accounts`, `profiles`, `events`, `attendees`, `contacts`, `connections`, `evidence`, `tasks`, `conversations`, `messages`, dashboards, actions, permissions, notifications).
- Add first-class top-level fields only when they have repeated product/query value, such as event-specific looking-for/can-offer intent and relationship scores.
- Keep volatile AI interpretation in separate semantic records with JSON payloads, source references, confidence, and timestamps.
- Keep demo/regression artifacts separate from production-facing domain data. Golden matches, dirty cases, negative cases, scenarios, dictionaries, and generated exports belong under `repos/mockdata`.
- Evidence, logs, validation reports, and runner output remain under `harness-state/` and `harness-logs/`.

## Provider / SDK Boundary

The local wiki records that the MiniMax Claude-compatible setup uses:

- `ANTHROPIC_BASE_URL=https://api.minimaxi.com/anthropic`
- `ANTHROPIC_AUTH_TOKEN` derived from `$MINIMAX_API_KEY`
- `ANTHROPIC_MODEL=MiniMax-M3`

Do not write real API keys to repo files, harness-state, logs, or generated mockdata.

## Sprint Execution Boundary

`harness-state/contracts/contract-sprint-81.json` is the standard app-root schema sprint for `repos/orbits`.

`harness-state/contracts/contract-sprint-82.json` is a project-root data-generation sprint because its target output is `repos/mockdata`, a sibling of `repos/orbits`. It must be run by the relationship-data goal runner, not by the generic app-root `run-sprint` command.
