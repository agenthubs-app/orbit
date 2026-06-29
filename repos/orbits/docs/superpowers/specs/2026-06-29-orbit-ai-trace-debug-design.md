# Orbit AI Trace Debug Page Design

Date: 2026-06-29
Status: approved direction, pending implementation plan
Chosen approach: full-chain debug view with planner-only comparison

## Goal

Build a development-only visual debug page for Orbit AI that accepts a user
prompt and shows the processing chain behind the response. The page must make
it clear which guardrails ran, which model planner output was produced, which
Orbit tool or artifact task was selected, where artifact data came from, where
the agent chain stopped or continued, and what final response was returned.

The page must support the second reviewed design: run a full-chain trace and
show a planner-only comparison beside it. This keeps the current
`/api/dev/orbit-agent/trace` diagnostic value while adding the missing
tool/data/source visibility.

## Current Context

The app already has:

- `/api/dev/orbit-agent/trace`, which calls only the configured planner and
  returns raw planner output. It intentionally does not execute Orbit artifact
  mapping.
- `/api/ai/conversations`, which calls the Orbit Agent conversation service.
  In live mode, that service runs local guardrails, planner routing, Orbit
  artifact mapping, optional synthesis, and final response construction.
- `features/orbit-ai/live-conversation-service.ts`, which contains the real
  chain but currently returns only the final conversation payload.
- `features/orbit-ai/mock-artifact-task-service.ts`, whose artifacts already
  include `sourceModules`, `toolCalls`, `generatedView`, `evidenceIds`, and
  safety metadata.

The debug page should expose this existing behavior instead of inventing a
parallel agent model.

## Architecture

Add a new development-only trace API:

- `POST /api/dev/orbit-ai/trace`
- `GET /api/dev/orbit-ai/trace` for simple query-string probes

This endpoint returns an envelope with two diagnostic lanes:

- `fullChain`: structured trace of the complete Orbit Agent path.
- `plannerOnly`: the existing planner-only trace shape, or a compatible
  subset, so model routing can be compared against the executed full-chain
  result.

The existing `/api/dev/orbit-agent/trace` endpoint should remain compatible.
If practical, it can delegate to shared planner trace helpers, but its current
headers and planner-only behavior must not regress.

Add a shared trace runner under `features/orbit-ai/` so the API does not
reverse-engineer a final conversation payload. The runner should execute the
same ordered decisions as `createLiveOrbitAgentConversationService` and record
each stage while producing the same final conversation result.

Target modules:

- `features/orbit-ai/trace-contract.ts`: stage and payload types.
- `features/orbit-ai/live-conversation-trace.ts`: full-chain trace runner and
  conversion helpers.
- `app/api/dev/orbit-ai/trace/route.ts`: development-only API route.
- `app/dev/orbit-ai/trace/page.tsx`: server page shell.
- `app/dev/orbit-ai/trace/orbit-ai-trace-debugger.tsx`: client component for
  prompt input, run state, stage selection, comparison, and raw JSON panels.

## Trace Contract

`fullChain` should include:

- `input`: normalized prompt, locale, max loop steps, selected provider, and
  current conversation mode.
- `stages`: ordered stages with `id`, `label`, `status`, `summary`,
  `startedAt`, `completedAt`, `inputs`, `outputs`, `evidenceIds`, `safety`,
  and optional `skipReason`.
- `chain`: compact ordered summary for rendering a timeline.
- `toolCalls`: flattened list of selected planner tools and artifact tool
  call traces.
- `dataSources`: flattened list derived from artifact provenance
  `sourceModules`, artifact source, evidence ids, and generated view sections.
- `conversation`: final `OrbitAgentConversationPayload` or a failure summary.
- `raw`: raw planner output and raw synthesis output when available.

Stage ids:

1. `input_received`
2. `local_guardrails`
3. `planner`
4. `tool_mapping`
5. `artifact_generation`
6. `synthesis`
7. `final_response`

Each stage must be marked as one of:

- `completed`
- `skipped`
- `blocked`
- `failed`

If a local guardrail stops the flow, later model/tool stages must be `skipped`
with a concrete reason. If `ORBIT_AGENT_MAX_LOOP_STEPS` stops a phase, that
phase must show the limit as the reason. If the provider fails, the failed
stage must include the provider error code without leaking secrets.

## Page Design

Route: `/dev/orbit-ai/trace`

The page is a dense developer workbench, not a marketing page. It should use
the existing workbench primitives and Orbit visual language, with a distinct
debugger layout:

- Left rail: prompt textarea, locale selector, max loop steps, run button,
  and safety/runtime badges.
- Center panel: full-chain timeline with one row per stage. Rows show status,
  short summary, selected tool count, source count, and whether the chain
  stopped there.
- Right panel: details for the selected full-chain stage, including inputs,
  outputs, evidence ids, source modules, safety ledger, and related raw JSON.
- Bottom or secondary column: planner-only comparison, including raw planner
  text, parsed intent, planner-selected tools, and a diff-like note when the
  full chain executed a fallback or stopped before tools.

The primary interaction is simple:

1. User enters a prompt.
2. User runs trace.
3. Page posts to `/api/dev/orbit-ai/trace`.
4. Page renders the chain and selects the first non-completed or final stage.
5. User can select any stage to inspect data sources and raw payloads.

The submit button should be disabled only for empty prompts or while a request
is in flight.

## Safety And Runtime Boundaries

The trace API is development-only:

- In `NODE_ENV=production`, return 404.
- Use `Cache-Control: no-store`.
- Add headers such as `X-Orbit-Dev-Trace: orbit-ai-full-chain` and
  `X-Orbit-Privacy: developer-debug-prompt-visible`.
- Never expose API keys or environment variable values.
- Never execute external side effects, database writes, email, calendar,
  notifications, or live storage mutations.
- The only external network request allowed is the selected model provider
  call already used by the live Orbit Agent planner/synthesis path.

The page must visibly mark that prompts are developer-debug visible and that
tool artifacts are review-only.

## Error Handling

The API should return structured failures for:

- Missing prompt.
- Production runtime.
- Missing provider key.
- Provider request failure.
- Provider schema failure.
- Unexpected trace runner failure.

Failures should still return the stages that completed before the failure when
safe to do so. The page should show the failed stage, the recovery text, and the
raw error context allowed by the existing app error envelope.

## Testing Strategy

Use TDD before implementation.

RED tests should cover:

- `POST /api/dev/orbit-ai/trace` returns a full-chain payload with ordered
  stages, tool calls, data sources, safety metadata, and planner-only
  comparison for an event recommendation prompt.
- A local guardrail prompt stops before planner/tool execution and marks later
  stages skipped.
- Production runtime returns 404.
- The existing `/api/dev/orbit-agent/trace` planner-only contract still passes.
- `/dev/orbit-ai/trace` renders an input form, stage timeline, selected stage
  detail area, planner-only comparison area, and fetches
  `/api/dev/orbit-ai/trace`.

Verification after implementation:

- Targeted tests for the new trace API/page.
- Existing Orbit Agent live tests.
- `npm test`
- `npm run lint`
- `npm run build`
- Browser verification of `/dev/orbit-ai/trace` after starting the dev server.

## Out Of Scope

- Production admin observability.
- Persisting trace runs.
- Streaming traces.
- Real database reads or writes.
- Executing email, calendar, notification, or external actions.
- Replacing the normal chat UI.

## Acceptance Criteria

- A developer can open `/dev/orbit-ai/trace`, enter a prompt, and see both the
  full-chain execution and planner-only comparison.
- The full-chain view shows where processing stopped or continued.
- Tool names, artifact kinds, source modules, tool call traces, evidence ids,
  generated artifact summaries, and safety metadata are visible.
- Local guardrails are visible as first-class stages.
- Existing planner-only trace behavior remains compatible.
- The page and API are unavailable in production.
- Tests and build verification prove the behavior without exposing secrets.
