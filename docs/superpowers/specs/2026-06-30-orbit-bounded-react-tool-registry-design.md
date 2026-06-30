# Orbit Bounded ReAct Tool Registry Design

Date: 2026-06-30  
Status: Design spec, no implementation yet  
Scope: Product Orbit Agent runtime inside `repos/orbits`

## Summary

Orbit should evolve from the current short `planner -> artifact -> optional synthesis`
loop into a bounded ReAct-style runtime, but not into an open-ended autonomous agent.
The runtime should let Orbit reason over observations from approved tools, while keeping
business services, write permissions, confirmation, and audit boundaries outside the
model's control.

The recommended structure is:

```text
features/orbit-ai/
  agent-runtime/
    react-loop.ts
    policy-gate.ts
    run-trace.ts
  agent-tools/
    registry.ts
    contacts-tool-adapters.ts
    events-tool-adapters.ts
    followups-tool-adapters.ts
    chat-tool-adapters.ts
    agent-action-tool-adapters.ts
    calendar-tool-adapters.ts
```

Orbit AI owns the ReAct runtime, tool selection, tool registry, policy gate, and run
trace. Domain modules continue to own domain services and data contracts.

## Current Problem

Current Orbit Agent tool behavior is only partially centralized:

- Service implementations are cleanly separated behind `service-factory.ts`.
- Model tool names are declared in `features/orbit-ai/gemini-provider.ts`.
- Tool-to-artifact mapping lives in `features/orbit-ai/live-conversation-service.ts`.

This is sufficient for the current planner/artifact loop, but it is not a strong enough
boundary for ReAct. A ReAct runtime needs one source of truth for tool metadata,
validation, policy, prompt exposure, execution, observation shaping, and audit trace.

## Design Goals

1. Add a bounded ReAct runtime without weakening Orbit's current confirmation model.
2. Centralize agent tool registration under Orbit AI.
3. Keep actual business logic in the owning feature modules.
4. Allow read and draft tools to run automatically inside a loop.
5. Require explicit confirmation for any write or external side effect.
6. Preserve provenance, safety ledger, and traceability for every action and observation.
7. Prevent provider output from directly naming routes, APIs, shell commands, or arbitrary functions.

## Non-Goals

- No open-ended autonomous loop.
- No product runtime shell command execution.
- No model-defined tools.
- No direct database writes from Orbit AI.
- No direct calendar, email, notification, or contact mutation from the ReAct loop.
- No bypass of existing service factories, permissions, sandbox, or confirmation guards.

## Ownership Boundary

Orbit AI owns agent orchestration artifacts:

- ReAct loop budget and step execution.
- Tool registry and prompt-safe tool descriptions.
- Tool input/output schema validation.
- Tool risk classification.
- Policy decisions before tool execution.
- Observation redaction before returning data to the model.
- Run trace, diagnostics, and safety ledger.

Domain modules own domain behavior:

- Contacts own contact search, profile, and relationship facts.
- Events own event context and recommendations.
- Followups own task queues and follow-up state.
- Chat owns conversation context, summaries, drafts, and privacy controls.
- Agent owns action queue, autonomy settings, and external action sandbox.
- Permissions own external account authorization state.

Orbit AI tool adapters may call these services, but they must not reimplement their rules.

## Tool Model

Each registered tool should have this shape:

```ts
interface OrbitAgentTool<TInput, TOutput> {
  name: string;
  description: string;
  inputSchema: unknown;
  outputSchema: unknown;
  riskLevel: "read" | "draft" | "write" | "external";
  requiresConfirmation: boolean;
  allowedModes: readonly ("mock" | "hybrid" | "live")[];
  timeoutMs: number;
  execute: (input: TInput, context: OrbitAgentToolContext) => Promise<TOutput>;
  redactObservation: (output: TOutput) => unknown;
  audit: OrbitAgentToolAuditPolicy;
}
```

The exact schema library must follow existing repo conventions. If no schema library is
already standard in the app, use small local validators first rather than adding a new
dependency for the initial slice.

## Risk Levels

`read` tools can execute inside the ReAct loop without user confirmation.

Examples:

- `contacts.search`
- `events.listRelevant`
- `followups.listQueue`
- `chat.getRelationshipContext`
- `calendar.listAvailability` when permission is already granted

`draft` tools can execute without external side effects, but their outputs are proposals.

Examples:

- `message.createDraft`
- `calendar.createEventDraft`
- `contact.createUpdateProposal`
- `agent.createActionProposal`

`write` tools cannot execute directly from the ReAct loop. They produce a confirmation
request or action queue item.

Examples:

- `contact.applyUpdate`
- `followups.createTask`
- `calendar.createEvent`

`external` tools require the strictest path through permissions, sandbox preview,
explicit confirmation, execution, and audit.

Examples:

- `message.send`
- `notification.deliver`
- `calendar.writeExternalEvent`

## Runtime Flow

The bounded ReAct runtime must use this flow:

```text
1. Normalize user message.
2. Run existing local safety boundaries.
3. Build allowed tool list from registry and policy.
4. Ask provider for the next step:
   - final answer
   - tool call with schema-valid input
   - clarification request
5. Policy gate checks the requested tool.
6. Execute read/draft tool or create confirmation request for write/external tool.
7. Redact and store observation.
8. Repeat until final answer, confirmation request, failure, or loop budget reached.
9. Return messages, artifacts, proposed tool intents, run trace, provenance, and safety ledger.
```

The default loop budget must stay small. Initial ReAct support must use at most three
tool steps. This keeps latency, cost, and debugging bounded.

## Provider Contract

Provider prompts and output schemas must be generated from the registry instead of
hand-maintained tool lists in multiple files. Provider output must still fail closed when:

- tool name is not in the registry;
- input does not match the registered schema;
- the tool is not allowed in the current mode;
- the tool risk level requires confirmation;
- the output claims an external side effect already happened;
- local safety boundaries were triggered before provider execution.

`features/orbit-ai/gemini-provider.ts` can keep provider-specific HTTP handling, but
tool allowlists and tool descriptions should come from the registry.

## Confirmation Path

When a write or external tool is requested, the ReAct loop must not execute it. It must
return a structured confirmation request that can be rendered as an artifact, action queue
item, or sandbox preview.

For example:

```text
User: Add lunch with Maya next Wednesday.

ReAct:
  read contacts.search
  read calendar.listAvailability
  draft calendar.createEventDraft
  draft message.createDraft
  stop with confirmation request

User confirms:
  execute through calendar/action sandbox service
  write audit record
```

The confirmation request must include:

- target person or event;
- proposed action;
- exact payload to execute;
- source evidence;
- risk level;
- what has not happened yet;
- confirmation button metadata;
- audit/provenance fields.

## Relationship To Existing Agent Module

`features/agent` remains the owner of action queue, autonomy settings, and external action
sandbox. Orbit AI should not move those services under `features/orbit-ai`.

Instead, Orbit AI should register adapters such as:

```text
agent.actionQueue.list
agent.actionQueue.createProposal
agent.externalAction.preview
```

These adapters call `features/agent/service-factory.ts` and return tool observations or
confirmation artifacts.

## File Placement

Add ReAct-specific files under `features/orbit-ai` because the runtime is a product-level
AI orchestration concern.

Do not place domain implementations there. Tool adapter files may import domain service
factories, but the service factories remain in their owning modules.

This avoids turning Orbit AI into a super-module while still giving the agent runtime one
central tool registry.

## Initial Implementation Slice

The first implementation must be read/draft only:

1. Add `agent-tools/registry.ts`.
2. Register a small set of tools:
   - `contacts.search`
   - `events.listRelevant`
   - `followups.listQueue`
   - `chat.getRelationshipContext`
   - `calendar.createEventDraft`
3. Add a lightweight `agent-runtime/react-loop.ts`.
4. Keep current provider request path, but derive allowed tool names from registry.
5. Return ReAct run trace in conversation diagnostics.
6. Do not add write or external execution tools in the first slice.

## Error Handling

Every failed step must return an explicit trace item:

- `schema_invalid`
- `tool_not_registered`
- `tool_not_allowed`
- `confirmation_required`
- `tool_timeout`
- `tool_failed`
- `observation_redacted`
- `loop_budget_exceeded`

Failures must not silently fall back to execution. If a tool fails after partial local work,
the returned safety ledger must still show no external side effects unless a confirmed
external execution actually happened.

## Testing Strategy

Tests must cover:

- registry exposes only declared tools;
- provider prompt/tool schema is derived from registry;
- unknown tool name fails closed;
- invalid input fails closed;
- read tools can execute inside loop;
- draft tools return proposals only;
- write/external tools stop at confirmation;
- safety ledger remains false for external side effects in read/draft loops;
- run trace records each action and observation;
- local safety boundaries still short-circuit before provider/tool execution.

## Acceptance Criteria

The design is successful when Orbit can answer a multi-step relationship request such as:

```text
Find why I know Maya, check whether next Wednesday is a reasonable time,
and prepare a lunch invite.
```

without executing external side effects. The response must contain sourced context,
availability-derived reasoning when available, a calendar draft, a message draft, and a
clear confirmation boundary before any write.
