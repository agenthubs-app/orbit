# Orbit AI Proactive Agent Basic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a mock-first Orbit AI proactive agent capability that converts structured signals into proactive assistant messages shown in the Orbit AI chat window.

**Architecture:** Add a standalone `orbit-ai-proactive-agent` capability under `features/orbit-ai` to avoid changing the high-impact existing conversation factory. The capability accepts `AgentSignal` input, returns an assistant proactive turn with `deliverySurface: "orbit_ai_chat"`, and keeps Notifications as a future delivery pipe rather than a product content owner.

**Tech Stack:** TypeScript, Node test runner with `node --test --import tsx`, existing `createModuleServiceFactory` pattern, Orbit API envelope and AppError conventions.

## Global Constraints

- Proactive user-facing content appears in the Orbit AI chat window.
- Chat/Messages remains for user-to-contact communication only.
- Notifications owns delivery mechanics only and must not generate proactive content.
- The basic implementation is deterministic mock-first.
- No websocket, push provider, email provider, calendar write, external network, live database write, or live AI provider may be called.
- Avoid modifying `createOrbitAgentConversationService`; GitNexus impact returned HIGH for that symbol.

---

### Task 1: Proactive Agent Contract and Service

**Files:**
- Create: `repos/orbits/features/orbit-ai/proactive-contract.ts`
- Create: `repos/orbits/features/orbit-ai/mock-proactive-service.ts`
- Create: `repos/orbits/features/orbit-ai/proactive-service-factory.ts`
- Test: `repos/orbits/tests/capabilities/orbit-ai-proactive-agent-mock.test.ts`

**Interfaces:**
- Produces: `OrbitAiProactiveAgentService.createProactiveTurn(input): OrbitAiProactiveAgentResult`
- Produces: `createMockOrbitAiProactiveAgentService(): OrbitAiProactiveAgentService`
- Produces: `createOrbitAiProactiveAgentService(mode?: ModuleMode | string): OrbitAiProactiveAgentService`

- [x] **Step 1: Write the failing contract and mock behavior tests**

Create `repos/orbits/tests/capabilities/orbit-ai-proactive-agent-mock.test.ts` with tests that import the future contract and service files, assert the signal type list, create a calendar proactive turn, assert `turnKind: "proactive"`, assert `deliverySurface: "orbit_ai_chat"`, assert notification and external side effects are false, and assert missing signal ids fail closed.

- [x] **Step 2: Run test to verify it fails**

Run: `cd repos/orbits && npm test -- tests/capabilities/orbit-ai-proactive-agent-mock.test.ts`

Expected: FAIL because `features/orbit-ai/proactive-contract.ts` does not exist.

- [x] **Step 3: Implement the minimal contract and mock service**

Add the proactive contract, deterministic mock service, and service factory. The mock service should produce a calendar message such as: `你明天 10:00 要见 Sarah...` for `calendar_event_upcoming`, include evidence ids, and keep every safety ledger side effect false.

- [x] **Step 4: Run test to verify it passes**

Run: `cd repos/orbits && npm test -- tests/capabilities/orbit-ai-proactive-agent-mock.test.ts`

Expected: PASS.

### Task 2: Design Documentation

**Files:**
- Modify: `repos/orbits/features/orbit-ai/DESIGN.md`
- Modify: `repos/orbits/docs/architecture/modules/orbit-ai.md`
- Modify: `knowledge/docs/zh/feature-orbit-ai-design.zh.md`
- Modify: `knowledge/docs/zh/module-orbit-ai.zh.md`
- Create: `repos/orbits/docs/superpowers/specs/2026-07-01-orbit-ai-proactive-agent-design.md`

**Interfaces:**
- Consumes: proactive agent boundary from Task 1.
- Produces: durable architecture documentation for product and feature ownership.

- [x] **Step 1: Update Orbit AI design docs**

Document `orbit-ai-proactive-agent` as a fourth Orbit AI capability. State that proactive messages are Orbit AI assistant turns, while Notifications is only a delivery pipe.

- [x] **Step 2: Verify docs mention the key boundaries**

Run: `rg -n "proactive|主动|orbit_ai_chat|Notifications.*delivery|通知.*投递" repos/orbits/features/orbit-ai/DESIGN.md repos/orbits/docs/architecture/modules/orbit-ai.md knowledge/docs/zh/feature-orbit-ai-design.zh.md knowledge/docs/zh/module-orbit-ai.zh.md repos/orbits/docs/superpowers/specs/2026-07-01-orbit-ai-proactive-agent-design.md`

Expected: matches in all updated documentation files.

### Task 3: Factory and Boundary Coverage

**Files:**
- Modify: `repos/orbits/tests/services/core-service-factories.test.ts`
- Modify: `repos/orbits/tests/services/modular-boundaries.test.ts` if existing boundary assertions need the new capability.

**Interfaces:**
- Consumes: `createOrbitAiProactiveAgentService`.
- Produces: tests proving the new capability follows service factory boundaries and avoids direct delivery providers.

- [x] **Step 1: Write failing factory coverage**

Add assertions that `createOrbitAiProactiveAgentService().createProactiveTurn()` succeeds and that runtime-facing files do not import the mock proactive service directly.

- [x] **Step 2: Run focused service tests**

Run: `cd repos/orbits && npm test -- tests/services/core-service-factories.test.ts`

Expected before implementation wiring: FAIL if the factory is missing or not exported.

- [x] **Step 3: Wire factory exports only if Task 1 factory is insufficient**

Keep the implementation standalone in `proactive-service-factory.ts`. Do not edit `createOrbitAgentConversationService`.

- [x] **Step 4: Run focused service tests again**

Run: `cd repos/orbits && npm test -- tests/services/core-service-factories.test.ts`

Expected: PASS.

### Task 4: Verification

**Files:**
- No new source files unless verification exposes gaps.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: evidence that the basic implementation is stable.

- [x] **Step 1: Run proactive and factory tests**

Run: `cd repos/orbits && npm test -- tests/capabilities/orbit-ai-proactive-agent-mock.test.ts tests/services/core-service-factories.test.ts`

Expected: PASS.

- [x] **Step 2: Run type/lint gate**

Run: `cd repos/orbits && npm run lint`

Expected: PASS or report exact failures.

- [x] **Step 3: Run GitNexus change detection**

Run: `mcp__gitnexus.detect_changes(scope: "all", repo: "orbit")`

Expected: changed symbols are limited to proactive agent files, docs, and tests.
