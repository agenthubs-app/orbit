# Orbit AI Agent Performance Check - 2026-06-30

Scope: performance inspection followed by targeted optimization changes.

## Summary

The current local Orbit AI Agent service is not mainly blocked by the button click handler. Runtime checks show the click reaches `/api/ai/conversations`; almost all click-to-reply time is spent waiting for the live provider-backed conversation API.

There are two separate slow surfaces:

1. Message response latency is dominated by external model provider round trips.
2. Page startup/hydration is heavy because `/app/agent` SSRs a large inline reference style block extracted from the old prototype HTML.

## How To Read This Record

This file is a dated performance audit, not a live dashboard. Treat the measurements as evidence from the 2026-06-30 local environment. The implemented changes below describe code that landed after the audit; any new latency claim must be measured again against the current provider, model, environment variables, and browser session.

For current code, start with:

- `app/api/ai/conversations/route.ts` for route-level timing headers.
- `features/orbit-ai/live-agent-runtime.ts` for planner, artifact generation, synthesis, and diagnostics timings.
- `features/orbit-ai/artifact-task-preview-service.ts` and `features/orbit-ai/contact-recommendation-artifact-service.ts` for generated artifact payload return paths.
- `app/(app)/app/orbit-reference-styles.tsx` and `app/api/orbit-reference/styles/route.ts` for reference CSS delivery and cache validation.

## Implemented Changes

Implemented on 2026-06-30:

1. `POST /api/ai/conversations` now emits `Server-Timing` spans for `orbit-total`, `orbit-read-body`, `orbit-service`, and `orbit-serialize`.
2. Live Orbit Agent success payloads now include `diagnostics.timings` for `local_boundary`, `planner`, `artifact_generation`, and `synthesis`, plus provider/model/maxLoopSteps metadata.
3. `POST /api/ai/conversations` appends non-skipped live agent phase timings to `Server-Timing` as `orbit-agent-*` spans when diagnostics are present.
4. Live Orbit Agent interactive turns now default to `ORBIT_AGENT_MAX_LOOP_STEPS=2`, so event/contact/follow-up turns return planner + reviewable artifact without the second synthesis provider call. Explicit `ORBIT_AGENT_MAX_LOOP_STEPS=3` still runs synthesis.
5. `OrbitReferenceStyles` now renders `<link rel="stylesheet" href="/api/orbit-reference/styles">` instead of inlining the extracted prototype CSS into every SSR page.
6. `/api/orbit-reference/styles` serves the extracted prototype CSS with cache headers.
7. `/app/agent` now renders only the current responsive chat layout branch, leaving one active textarea and one submit button in the rendered HTML.
8. The chat input exposes `data-orbit-agent-request-state` and `aria-busy` so the UI can distinguish idle vs "Orbit is thinking".
9. Live/generated Orbit Agent payload paths no longer JSON-clone freshly built response objects before the API route serializes them. This removes duplicate stringify/parse work from `live-agent-runtime`, the preview artifact producer, and the contact recommendation artifact producer while keeping fixture-backed mock clone boundaries unchanged.
10. `/api/orbit-reference/styles` now emits an ETag derived from the prototype HTML metadata and React isolation style version, and returns `304 Not Modified` for matching `If-None-Match` validators without reading or transferring the multi-MB CSS body.

## Current Runtime Mode

- `ORBIT_AGENT_CONVERSATION_MODE=live` in the local app env.
- `ORBIT_AGENT_PROVIDER=deepseek` in the local app env.
- Observed trace provider/model: `deepseek` / `deepseek-v4-flash`.
- API key values are intentionally not recorded.

Relevant code:

- `features/orbit-ai/service-factory.ts`: conversation mode comes from `ORBIT_AGENT_CONVERSATION_MODE`.
- `shared/services/module-mode.ts`: default mode is `mock`; `hybrid` falls back to `mock` where a capability has no hybrid implementation.
- `features/orbit-ai/gemini-provider.ts`: provider/model/key are resolved per provider.

## Execution Path

Frontend:

- `app/(app)/app/agent/orbit-real-agent.tsx`
- `sendOrbitAgentMessage()` posts to `/api/ai/conversations`.
- `ask()` appends the user bubble, sets `thinking=true`, waits for the API reply, then appends the assistant bubble and optional panel.
- `ChatBox` keeps the submit button hittable and guards blank input in `send()`.

API:

- `app/api/ai/conversations/route.ts`
- `POST()` reads JSON, creates the conversation service, calls `service.sendMessage()`, and wraps the result in the shared envelope.
- The route emits `Server-Timing` for route-level spans.

Service:

- `features/orbit-ai/live-conversation-service.ts`
- `sendMessage()` flow: scenario short-circuit -> blank guard -> local safety boundary -> provider planner -> artifact generation if `maxLoopSteps >= 2` -> provider synthesis if `maxLoopSteps >= 3` and artifacts exist -> final response.
- `ORBIT_AGENT_MAX_LOOP_STEPS=1` means planner only.
- `ORBIT_AGENT_MAX_LOOP_STEPS=2` means planner + reviewable artifact.
- `ORBIT_AGENT_MAX_LOOP_STEPS=3` means planner + artifact + synthesis.

Provider:

- `features/orbit-ai/gemini-provider.ts`
- `plan()` and `synthesize()` each make an external HTTP request.

## Measurements

Local API checks against the running dev service:

| Case | Elapsed | Result |
| --- | ---: | --- |
| local privacy boundary | 571 ms | no provider, no artifacts |
| general chat | 3547 ms | provider reply, no artifacts |
| event recommendation | 4378 ms | provider reply, 1 artifact |
| trace event, loop=1 | 5073 ms | planner only, 0 artifacts |
| trace event, loop=2 | 2316 ms | planner + artifact, 1 artifact |
| trace event, loop=3 | 6588 ms | planner + artifact + synthesis, 1 artifact |

Local orchestration check with a fake instant provider:

| Max loop steps | Provider calls | Local orchestration time |
| --- | --- | --- |
| 1 | planner | avg 0.57 ms |
| 2 | planner | avg 0.32 ms |
| 3 | planner + synthesis | avg 0.62 ms |

This isolates the main response bottleneck: TypeScript service orchestration and artifact generation are negligible; live latency comes from external provider calls and from whether the request needs one or two model turns.

Browser check for `/app/agent`:

| Metric | Value |
| --- | ---: |
| Navigate to page | 1845 ms |
| Navigation duration | 1414 ms |
| HTML transfer size | 7,323,496 bytes |
| HTML decoded body size | 9,980,721 bytes |
| Script transfer bytes | 192,190 bytes |
| Initial textarea count | 2 |
| Initial submit button count | 2 |
| Click-to-reply time | 6443 ms |
| `/api/ai/conversations` resource time | 6199 ms |

The click-to-reply timing shows the button action is reaching the API. The browser spent about 6.2s in the conversation request out of about 6.44s total.

HTML size check:

- `curl http://localhost:3000/app/agent` produced about 9.98MB decoded HTML.
- The second inline `<style>` block was about 4.96MB.
- `public/orbit-reference/orbit-reference.html` is about 5.00MB.
- `app/(app)/app/orbit-reference-styles.tsx` reads the prototype HTML and injects extracted reference styles.
- `OrbitReferenceStyles` is used by 29 app pages, including `/app/agent`.

Post-optimization checks:

| Metric | Before | After |
| --- | ---: | ---: |
| `/app/agent` decoded HTML | ~9,980,721 bytes | ~40,562 bytes |
| Inline reference CSS block | ~4,961,237 chars | external stylesheet |
| Inline `<style>` blocks on `/app/agent` | 2 | 1 |
| SSR textarea count | 2 | 1 |
| SSR submit marker count | 2 | 1 |
| Reference CSS route body | n/a | ~4,961,237 chars |
| Service-layer clone before live local-boundary payload return | 1 JSON stringify | 0 JSON stringify |
| Service-layer clone before preview artifact payload return | 1 JSON stringify | 0 JSON stringify |
| Service-layer clone before contact recommendation artifact payload return | 1 JSON stringify | 0 JSON stringify |
| Reference CSS matching cache revalidation | 200 + CSS body | 304 + empty body |

Example local boundary response header after optimization:

```text
server-timing: orbit-total;dur=7.9, orbit-read-body;dur=6.1, orbit-service;dur=0.9, orbit-serialize;dur=0.8
```

## Findings

1. Primary click-to-reply delay is external provider work.

   The frontend submits to `/api/ai/conversations`, and the API waits for live `sendMessage()`. For non-local-boundary prompts, `sendMessage()` awaits `planner.plan()`. If artifacts exist and `maxLoopSteps >= 3`, it then awaits `planner.synthesize()`. Both are provider HTTP calls.

2. Full loop can double model latency.

   Event/contact/follow-up prompts can run planner plus synthesis. This improves the final answer but adds a second sequential network-bound wait.

3. `/app/agent` is too heavy before any click.

   The route SSRs roughly 10MB of HTML, much of it inline reference CSS copied from the prototype HTML. This affects initial load, hydration, browser parsing, DevTools inspection, and Playwright selector responsiveness.

4. Current trace output is not sufficient for timing diagnosis.

   The trace payload shows stage status, but it does not provide reliable real timing spans for planner vs artifact vs synthesis. The conversation route also lacks `Server-Timing` or structured per-stage durations.

5. Duplicate responsive ChatBox DOM can make the UI feel or test as unclickable.

   Runtime checks saw two textareas and two submit buttons. The visible button can submit, but duplicate hidden controls can confuse tests, automation, and accessibility tooling unless selectors target visible controls or stable data attributes.

## Why It Can Still Feel Like "Cannot Click"

The likely sequence is:

1. The click/submit event fires.
2. The UI enters `thinking` state.
3. The browser waits for `/api/ai/conversations`.
4. The route waits for live provider planner and sometimes synthesis.
5. The user sees no final response until that provider work returns.

So the symptom can look like a dead button, but the measured cause is usually a long in-flight API request. The duplicate responsive ChatBox copies are a secondary source of confusion.

## Remaining Optimization Candidates

1. Stream or progressively return the response: show planner/artifact first, then append synthesized natural language later.
2. Prune `OrbitReferenceStyles` usage; 29-page usage suggests it became a global visual dependency instead of a small compatibility bridge.
3. Evaluate a hashed/static CSS asset for the reference stylesheet instead of the API route if CDN caching needs immutable deploy-time URLs rather than ETag revalidation.

## Reproduction Notes

Checks used:

- Node `fetch` benchmark against `http://localhost:3000/api/ai/conversations`.
- Node `fetch` benchmark against the trace route with `maxLoopSteps=1/2/3`.
- `node --import tsx` service benchmark with an instant fake provider.
- Playwright browser check on `http://localhost:3000/app/agent`, including visible textarea fill, visible submit click, resource timing, and DOM counts.
- `curl -sS http://localhost:3000/app/agent -o /tmp/orbit-agent-current.html` plus size/style-block inspection.
- `rg -l "<OrbitReferenceStyles" 'app/(app)/app' -g '*.tsx'` found 29 page/component files.
- Post-change focused tests: `node --test --import tsx tests/capabilities/orbit-agent-conversation-mock.test.ts tests/capabilities/orbit-agent-gemini-live.test.ts tests/pages/orbit-reference-styles.test.tsx tests/pages/orbit-agent-api-ui.test.ts`.
- Second-pass performance tests: `node --test --import tsx tests/capabilities/orbit-agent-gemini-live.test.ts tests/capabilities/orbit-ai-artifact-task-mock.test.ts tests/capabilities/orbit-ai-contact-recommendation-methods.test.ts` and `node --test --import tsx tests/pages/orbit-reference-styles.test.tsx`.
- Post-change type/lint check: `npm run lint`.
