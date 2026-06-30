# Orbit AI Trace Debug Page Design

Date: 2026-06-29
Status: implemented; updated 2026-06-30 for shared runtime and contact matching
Chosen approach: full-chain debug view with planner-only comparison

## How To Read This Document

This document now has two jobs: it preserves the original Trace Debug design
rationale, and it records the runtime boundary the current implementation must
respect. For current code, read "Current Context" and "Trace Contract" first.
Use the later page design and test sections for historical implementation
intent and acceptance criteria.

Current authoritative code paths:

- `features/orbit-ai/live-agent-runtime.ts`: shared execution chain for
  product chat, full-chain trace, and planner-only diagnostics.
- `features/orbit-ai/live-conversation-trace.ts`: adapts runtime results into
  the trace payload.
- `features/orbit-ai/trace-contract.ts`: contract for trace payload,
  runtimeSnapshot, artifact producers, tools, render hints, and graph data.
- `app/api/dev/orbit-ai/trace/route.ts`: full-chain trace API.
- `app/api/dev/orbit-agent/trace/route.ts`: compatibility entry for the old
  planner-only API.
- `app/dev/orbit-ai/trace/orbit-ai-trace-debugger.tsx`: debugger UI.

## Goal

Build a development-only visual debug page for Orbit AI that accepts a user
prompt and shows the processing chain behind the response. The page must make
it clear which guardrails ran, which model planner output was produced, which
Orbit tool or artifact task was selected, where artifact data came from, where
the agent chain stopped or continued, what final response was returned, and
what raw output source each part produced. Source panels are collapsed by
default and pretty printed when expanded.

The page must support the second reviewed design: run a full-chain trace and
show a planner-only comparison beside it. This keeps the current
`/api/dev/orbit-agent/trace` diagnostic value while adding the missing
tool/data/source visibility.

## Current Context

The app now has:

- `/api/dev/orbit-agent/trace`, which remains a planner-only compatibility
  diagnostic. It now delegates to the shared live runtime with `maxLoopSteps=1`,
  so it exercises the same guardrail and planner path while still skipping
  domain tools, artifact generation, and synthesis.
- `/api/ai/conversations`, which calls the Orbit Agent conversation service.
  In live mode, that service runs local guardrails, planner routing, Orbit
  artifact mapping, optional synthesis, and final response construction.
- `features/orbit-ai/live-agent-runtime.ts`, which owns the shared live chain:
  local guardrails, provider planner, allowed tool mapping, artifact request
  execution, optional synthesis, and final conversation payload construction.
- `features/orbit-ai/live-conversation-service.ts`, which is a thin wrapper
  around the shared runtime for the product chat API.
- `features/orbit-ai/live-conversation-trace.ts`, which adapts the shared
  runtime result into the full-chain trace shape for `/dev/orbit-ai/trace`.
- `features/orbit-ai/contact-recommendation-artifact-service.ts`, which handles
  `contact_recommendations` artifacts from the `contacts.recommend` tool.
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

The existing `/api/dev/orbit-agent/trace` endpoint remains compatible, but it
must not own a separate planner path. It should call `runLiveOrbitAgentRuntime`
with `maxLoopSteps=1` and render the same planner-only response shape and
headers as before.

The shared runtime under `features/orbit-ai/` is the ownership boundary for
agent execution. Product chat, full-chain trace, and planner-only diagnostics
must all call it instead of duplicating guardrails, planner calls, tool mapping,
artifact execution, or synthesis. Trace code may adapt and render runtime
outputs, but it should not implement agent decisions itself.

Target modules:

- `features/orbit-ai/trace-contract.ts`: stage and payload types.
- `features/orbit-ai/live-agent-runtime.ts`: shared Orbit Agent execution
  runtime used by product chat, full-chain trace, and planner-only diagnostics.
- `features/orbit-ai/live-artifact-task-service.ts`: composition boundary for
  live artifact task services.
- `features/orbit-ai/live-conversation-trace.ts`: full-chain trace runner and
  conversion helpers.
- `features/orbit-ai/contact-recommendation-matching.ts`: method resolution and
  current evidence-backed contact matcher.
- `features/orbit-ai/contact-recommendation-artifact-service.ts`: artifact
  adapter for `contact_recommendations`.
- `app/api/dev/orbit-ai/trace/route.ts`: development-only API route.
- `app/api/dev/orbit-agent/trace/route.ts`: planner-only compatibility route
  backed by the shared runtime.
- `app/dev/orbit-ai/trace/page.tsx`: server page shell.
- `app/dev/orbit-ai/trace/orbit-ai-trace-debugger.tsx`: client component for
  prompt input, run state, stage selection, comparison, and raw JSON panels.

## Contact Recommendations And Method Selection

`contacts.recommend` is the model-facing tool name for contact recommendation
requests. It is not a static display field. The planner may select it for the
`contact_recommendations` intent, then the shared runtime maps that tool into a
`contact_recommendations` artifact request with the user message, conversation
context, and planner tool arguments.

Contact recommendation method selection is controlled by the server environment
variable `ORBIT_CONTACT_RECOMMENDATION_METHOD`:

- unset or `rules_v1`: current implemented matcher.
- `structured_extraction_v1`: declared option, returns visible
  unimplemented state until a matcher is registered.
- `semantic_index_v1`: declared option, returns visible unimplemented state.
- `graph_gated_rag_v1`: declared option for future RAG, but still gated by the
  relationship graph and source evidence. It is not broad unknown-person
  discovery.
- any other value: returns a configuration error artifact and failed tool call
  trace instead of silently falling back.

The current `rules_v1` implementation reads the latest query, planner tool
arguments, and conversation context, extracts a narrow set of criteria, then
queries the relationship natural search service. Only contacts with existing
relationship evidence and evidence ids can appear in the artifact. The product
principle is existing trusted links first: no open-web discovery, no external
side effects, and no recommendation without reviewable relationship evidence.

Because product chat, full-chain trace, and planner-only diagnostics share
`live-agent-runtime.ts`, a contact recommendation behavior change belongs in the
runtime or its artifact services, not separately in a dev route or UI component.

## Trace Contract

`fullChain` should include:

- `traceSchemaVersion`: schema version for compatibility checks as the agent
  architecture changes.
- `input`: normalized prompt, locale, max loop steps, selected provider, and
  current conversation mode.
- `runtimeSnapshot`: agent architecture observed during this run. It should
  include the planner provider, artifact producers, tool registry, each tool family,
  artifact kind, source modules, renderer hint, and output schema name.
- `stages`: ordered stages with `id`, `label`, `status`, `summary`,
  `startedAt`, `completedAt`, `inputs`, `outputs`, `evidenceIds`, `safety`,
  and optional `skipReason`.
- `stages[].outputSource`: redacted source-view data for that stage output.
  The UI keeps it collapsed by default and pretty prints JSON when expanded.
  Non-JSON text stays in a monospaced source block.
- `stages[].renderHint`: render instruction such as `summary_card`,
  `tool_call_table`, `database_table`, `artifact_panel`, `source_json`, or
  `raw_text`. Unknown hints fall back to the generic source renderer.
- `chain`: compact ordered summary for rendering a timeline.
- `toolCalls`: flattened list of selected planner tools and artifact tool
  call traces.
- `databaseInteractions`: local-remote database context observed during the
  trace, including storage key, schema version, operation, selected
  collections, and row counts. This describes local data context only; it does
  not represent a live database write.
- `dataSources`: flattened list derived from artifact provenance
  `sourceModules`, artifact source, evidence ids, and generated view sections.
- `conversation`: final `OrbitAgentConversationPayload` or a failure summary.
- `raw`: raw planner output and raw synthesis output when available.

Stage ids:

1. `input_received`
2. `local_guardrails`
3. `planner`
4. `tool_mapping`
5. `database_context`
6. `artifact_generation`
7. `synthesis`
8. `final_response`

Each stage must be marked as one of:

- `completed`
- `skipped`
- `blocked`
- `failed`

If a local guardrail stops the flow, later model/tool stages must be `skipped`
with a concrete reason. If `ORBIT_AGENT_MAX_LOOP_STEPS` stops a phase, that
phase must show the limit as the reason. If the provider fails, the failed
stage must include the provider error code without leaking secrets.

Every stage with real output must include `outputSource`. This is the redacted
raw output source, not the UI summary. Object outputs should stay structured so
the page can render `JSON.stringify(value, null, 2)`. String outputs should be
shown as-is inside the source block.

## Architecture Detection And Render Extensibility

The debug page must not assume the agent architecture will always have the same
tool set. It should detect the planner, artifact producers, tools, and artifact kinds
from `runtimeSnapshot` and each stage `renderHint`.

Detection rules:

- New artifact producers or tools must appear in `runtimeSnapshot`, `toolCalls`,
  graph data, and the related stage when they participate in a trace.
- If a new tool uses an existing `renderHint`, the page should render it with
  the existing renderer without code changes.
- If a tool has no known renderer, the page should show an `unknown tool` or
  `unregistered renderer` badge while preserving metadata, source modules, tool
  calls, evidence ids, and collapsed output source.
- If the architecture adds a new agent phase, such as retrieval or memory before
  planning, the trace runner may return a new stage. The timeline renders stages
  in returned order. The eight baseline stages are defaults, not a limit.
- A new renderer is only required when a new tool needs a new visual form. The
  page must still show the output through the generic source renderer before
  that renderer exists.

This gives the page two behaviors: known render hints get structured rendering,
and unknown tools still get complete source visibility. The page cannot invent a
new UI for a future tool by itself, but it can detect and show the new agent,
tool, and output safely.

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
- Timeline and source panels should visually separate the agent lane from the
  data lane. Planner, tool mapping, artifact generation, and synthesis use the
  agent color; `database_context`, database interactions, and data sources use
  the data color.
- Right panel: details for the selected full-chain stage, including inputs,
  outputs, evidence ids, source modules, safety ledger, and related raw JSON.
  Each output source panel is collapsed by default, shows output type and size
  in the header, and expands to a pretty printed code block.
- Bottom or secondary column: planner-only comparison, including raw planner
  text, parsed intent, planner-selected tools, and a diff-like note when the
  full chain executed a fallback or stopped before tools.
- Architecture snapshot area: detected artifact producers, tools, render hints, and
  unknown renderer warnings for the current trace. It starts collapsed and opens
  automatically when an unknown tool or renderer appears.

The primary interaction is simple:

1. User enters a prompt.
2. User runs trace.
3. Page posts to `/api/dev/orbit-ai/trace`.
4. Page renders the chain and selects the first non-completed or final stage.
5. User can select any stage to inspect data sources and raw payloads.
6. User can expand a stage output source panel to inspect the redacted pretty
   printed source for that part of the chain.

The submit button should be disabled only for empty prompts or while a request
is in flight.

## Safety And Runtime Boundaries

The trace API is development-only:

- In `NODE_ENV=production`, return 404.
- Use `Cache-Control: no-store`.
- Add headers such as `X-Orbit-Dev-Trace: orbit-ai-full-chain` and
  `X-Orbit-Privacy: developer-debug-prompt-visible`.
- Never expose API keys or environment variable values.
- Redact `outputSource` before returning it to the page.
- Never execute external side effects, live database writes, email, calendar,
  notifications, or live storage mutations.
- The trace runner may read table-level summaries from the local-remote
  database to show data context. It must not write live data or expose raw
  production records.
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
  stages, tool calls, database interactions, data sources, safety metadata, and
  planner-only comparison for an event recommendation prompt.
- Stages with output return `outputSource`; the page renders source panels
  collapsed by default and shows pretty printed JSON when expanded.
- New tools or artifact producers in the trace payload appear in `runtimeSnapshot`, the
  timeline, and source panels. Unknown renderers do not drop data; they use the
  generic fallback.
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
- Real database writes or production database reads.
- Executing email, calendar, notification, or external actions.
- Replacing the normal chat UI.

## Acceptance Criteria

- A developer can open `/dev/orbit-ai/trace`, enter a prompt, and see both the
  full-chain execution and planner-only comparison.
- The full-chain view shows where processing stopped or continued.
- Tool names, artifact kinds, source modules, tool call traces, evidence ids,
  generated artifact summaries, and safety metadata are visible.
- Database context is visible as its own stage and as a data-source panel, with
  data-colored UI that differs from the agent/tool lane.
- Each stage output source can be expanded; source panels are collapsed by
  default and show pretty printed output instead of minified JSON.
- New artifact producers or tools are detected from the trace payload. Known
  `renderHint` values use the matching renderer; unknown values show a warning
  and use the generic source panel.
- Local guardrails are visible as first-class stages.
- Existing planner-only trace behavior remains compatible.
- The page and API are unavailable in production.
- Tests and build verification prove the behavior without exposing secrets.
