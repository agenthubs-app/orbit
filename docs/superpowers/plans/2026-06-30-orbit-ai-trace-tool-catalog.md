# Orbit AI Trace Tool Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the current Orbit Agent tool catalog, Chinese descriptions, and specs on the Orbit AI trace debug page.

**Architecture:** Add a pure metadata registry under `features/orbit-ai/agent-tools/` for the current allowed Orbit tools. Extend trace runtime snapshots to include every registered tool with Chinese description/spec fields and a selected flag. Render that catalog in `/dev/orbit-ai/trace`, using the same registry for the page's empty state and the trace payload after a run.

**Tech Stack:** Next.js 16, React 18, TypeScript 5.7, Node built-in test runner with `tsx`, existing Orbit AI trace contracts.

## Global Constraints

- Tool registry/runtime belongs under `features/orbit-ai`; domain service implementations stay in their owning modules.
- First slice is metadata/read-only display only: no write tools, no external execution, no shell commands.
- Current tool catalog includes exactly: `events.recommend`, `contacts.recommend`, `followups.reviewQueue`, `chat.context`.
- Every tool must expose `descriptionZh` and `specificationZh` fields.
- Debug UI must not expose API keys, credentials, or provider request headers.
- Existing local safety boundary behavior must remain unchanged.

---

## File Structure

- Create `repos/orbits/features/orbit-ai/agent-tools/registry.ts`  
  Pure client-safe tool metadata. No service imports, no environment reads, no provider calls.

- Modify `repos/orbits/features/orbit-ai/trace-contract.ts`  
  Extend `OrbitAiTraceRuntimeTool` with display/spec metadata and a selected flag.

- Modify `repos/orbits/features/orbit-ai/live-conversation-trace.ts`  
  Build `runtimeSnapshot.tools` from the registry instead of only from `toolRequests`.

- Modify `repos/orbits/app/dev/orbit-ai/trace/orbit-ai-trace-debugger.tsx`  
  Render a tool catalog section with Chinese descriptions/specs and selected status.

- Modify `repos/orbits/tests/capabilities/orbit-ai-trace-debug.test.ts`  
  Verify the trace API returns all registered tools and metadata.

- Modify `repos/orbits/tests/pages/orbit-ai-trace-debug-page.test.tsx`  
  Verify the debug page renders the catalog shell and Chinese tool copy.

---

### Task 1: Tool Registry And Trace Contract

**Files:**
- Create: `repos/orbits/features/orbit-ai/agent-tools/registry.ts`
- Modify: `repos/orbits/features/orbit-ai/trace-contract.ts`
- Modify: `repos/orbits/features/orbit-ai/live-conversation-trace.ts`
- Test: `repos/orbits/tests/capabilities/orbit-ai-trace-debug.test.ts`

**Interfaces:**
- Produces: `ORBIT_AGENT_TOOL_CATALOG`
- Produces: `getOrbitAgentToolMetadata(toolName: string): OrbitAgentToolMetadata | null`
- Produces: `OrbitAiTraceRuntimeTool.descriptionZh`
- Produces: `OrbitAiTraceRuntimeTool.specificationZh`
- Produces: `OrbitAiTraceRuntimeTool.inputSpecZh`
- Produces: `OrbitAiTraceRuntimeTool.outputSpecZh`
- Produces: `OrbitAiTraceRuntimeTool.riskLevel`
- Produces: `OrbitAiTraceRuntimeTool.requiresConfirmation`
- Produces: `OrbitAiTraceRuntimeTool.selectedInCurrentRun`

- [ ] **Step 1: Write the failing API trace test**

Edit `repos/orbits/tests/capabilities/orbit-ai-trace-debug.test.ts`.

In the first test's typed response shape, replace:

```ts
tools: readonly { toolName: string; renderHint: string }[];
```

with:

```ts
tools: readonly {
  descriptionZh: string;
  inputSpecZh: string;
  outputSpecZh: string;
  renderHint: string;
  requiresConfirmation: boolean;
  riskLevel: string;
  selectedInCurrentRun: boolean;
  specificationZh: string;
  toolName: string;
}[];
```

After the existing `runtimeSnapshot.tools[0]` assertions, add:

```ts
const tools = body.data?.fullChain.runtimeSnapshot.tools ?? [];

assert.deepEqual(
  tools.map((tool) => tool.toolName),
  [
    "events.recommend",
    "contacts.recommend",
    "followups.reviewQueue",
    "chat.context",
  ],
);

const eventTool = tools.find((tool) => tool.toolName === "events.recommend");
const contactTool = tools.find((tool) => tool.toolName === "contacts.recommend");
const followupTool = tools.find(
  (tool) => tool.toolName === "followups.reviewQueue",
);
const chatTool = tools.find((tool) => tool.toolName === "chat.context");

assert.equal(eventTool?.selectedInCurrentRun, true);
assert.equal(contactTool?.selectedInCurrentRun, false);
assert.equal(followupTool?.selectedInCurrentRun, false);
assert.equal(chatTool?.selectedInCurrentRun, false);
assert.equal(eventTool?.riskLevel, "read");
assert.equal(eventTool?.requiresConfirmation, true);
assert.match(eventTool?.descriptionZh ?? "", /活动/);
assert.match(eventTool?.specificationZh ?? "", /输入/);
assert.match(eventTool?.inputSpecZh ?? "", /query/);
assert.match(eventTool?.outputSpecZh ?? "", /artifact/);
```

- [ ] **Step 2: Run the focused API trace test to verify it fails**

Run from `repos/orbits`:

```bash
npm test -- tests/capabilities/orbit-ai-trace-debug.test.ts
```

Expected: FAIL because `runtimeSnapshot.tools` currently only contains the selected planner tool and does not include Chinese spec fields.

- [ ] **Step 3: Add the registry**

Create `repos/orbits/features/orbit-ai/agent-tools/registry.ts`:

```ts
import type {
  OrbitAgentArtifactKind,
  OrbitAgentArtifactSourceModule,
} from "../artifact-contract";
import type { OrbitAiTraceRenderHint } from "../trace-contract";
import type { GeminiOrbitAgentToolName } from "../gemini-provider";

export type OrbitAgentToolRiskLevel = "read" | "draft" | "write" | "external";

export interface OrbitAgentToolMetadata {
  artifactKind: OrbitAgentArtifactKind;
  descriptionZh: string;
  inputSpecZh: string;
  outputSchema: string;
  outputSpecZh: string;
  renderHint: OrbitAiTraceRenderHint | string;
  requiresConfirmation: boolean;
  riskLevel: OrbitAgentToolRiskLevel;
  sourceModules: readonly OrbitAgentArtifactSourceModule[];
  specificationZh: string;
  toolFamily: "events" | "contacts" | "followups" | "relationship_chat";
  toolName: GeminiOrbitAgentToolName;
}

export const ORBIT_AGENT_TOOL_CATALOG = [
  {
    artifactKind: "event_recommendations",
    descriptionZh:
      "根据活动上下文推荐值得复核的活动、参会目标和下一步准备事项。",
    inputSpecZh:
      "输入：query 用户请求；locale zh/en；可选活动主题、时间窗口或关系目标。",
    outputSchema: "OrbitAgentArtifactPayload",
    outputSpecZh:
      "输出：event_recommendations artifact，包含推荐理由、来源模块、证据 ID、可复核 action。",
    renderHint: "artifact_panel",
    requiresConfirmation: true,
    riskLevel: "read",
    sourceModules: ["orbit-ai", "events"],
    specificationZh:
      "只读取活动和关系上下文并生成推荐视图；不会报名、发消息、写日历或修改数据库。任何外部动作必须另走确认。",
    toolFamily: "events",
    toolName: "events.recommend",
  },
  {
    artifactKind: "contact_recommendations",
    descriptionZh:
      "根据关系图谱和已确认来源推荐可联系的人脉或介绍路径。",
    inputSpecZh:
      "输入：query 用户目标；locale zh/en；可选行业、主题、联系人姓名或关系范围。",
    outputSchema: "OrbitAgentArtifactPayload",
    outputSpecZh:
      "输出：contact_recommendations artifact，包含联系人、匹配理由、来源模块、证据 ID、待确认 action。",
    renderHint: "artifact_panel",
    requiresConfirmation: true,
    riskLevel: "read",
    sourceModules: ["orbit-ai", "contacts"],
    specificationZh:
      "只读取联系人和关系证据并生成推荐；不能发明联系人事实，不能写联系人资料，不能外发联系方式。",
    toolFamily: "contacts",
    toolName: "contacts.recommend",
  },
  {
    artifactKind: "followup_queue",
    descriptionZh:
      "复核跟进队列，找出本周、逾期或沉睡关系中的下一步机会。",
    inputSpecZh:
      "输入：query 用户请求；locale zh/en；可选时间范围、优先级或跟进类型。",
    outputSchema: "OrbitAgentArtifactPayload",
    outputSpecZh:
      "输出：followup_queue artifact，包含跟进候选、排序理由、来源证据、需要确认的后续动作。",
    renderHint: "artifact_panel",
    requiresConfirmation: true,
    riskLevel: "read",
    sourceModules: ["orbit-ai", "followups"],
    specificationZh:
      "只读取跟进候选并生成复核视图；不会创建任务、发送提醒或投递通知。任务写入必须经过确认。",
    toolFamily: "followups",
    toolName: "followups.reviewQueue",
  },
  {
    artifactKind: "relationship_chat_context",
    descriptionZh:
      "整理关系聊天上下文，用于解释关系来源、准备消息草稿或复核对话线索。",
    inputSpecZh:
      "输入：query 用户问题；locale zh/en；可选联系人、会话、草稿目标或上下文范围。",
    outputSchema: "OrbitAgentArtifactPayload",
    outputSpecZh:
      "输出：relationship_chat_context artifact，包含关系摘要、可引用上下文、来源证据和草稿类 action。",
    renderHint: "artifact_panel",
    requiresConfirmation: true,
    riskLevel: "read",
    sourceModules: ["orbit-ai", "chat"],
    specificationZh:
      "只读取关系聊天上下文并准备可复核结果；不会发送消息、保存隐私设置、删除记录或跨关系泄露内容。",
    toolFamily: "relationship_chat",
    toolName: "chat.context",
  },
] as const satisfies readonly OrbitAgentToolMetadata[];

export function getOrbitAgentToolMetadata(
  toolName: string,
): OrbitAgentToolMetadata | null {
  return (
    ORBIT_AGENT_TOOL_CATALOG.find((tool) => tool.toolName === toolName) ?? null
  );
}
```

- [ ] **Step 4: Extend the trace contract**

Modify `repos/orbits/features/orbit-ai/trace-contract.ts`.

Update `OrbitAiTraceRuntimeTool` to:

```ts
export interface OrbitAiTraceRuntimeTool {
  artifactKind?: OrbitAgentArtifactKind;
  descriptionZh: string;
  inputSpecZh: string;
  outputSchema: string;
  outputSpecZh: string;
  renderHint: OrbitAiTraceRenderHint | string;
  requiresConfirmation: boolean;
  riskLevel: "read" | "draft" | "write" | "external" | string;
  selectedInCurrentRun: boolean;
  sourceModules: readonly OrbitAgentArtifactSourceModule[];
  specificationZh: string;
  toolFamily: string;
  toolName: GeminiOrbitAgentToolName | string;
}
```

- [ ] **Step 5: Populate runtime snapshot from the registry**

Modify `repos/orbits/features/orbit-ai/live-conversation-trace.ts`.

Add the import near other Orbit AI imports:

```ts
import { ORBIT_AGENT_TOOL_CATALOG } from "./agent-tools/registry";
```

In `runtimeSnapshot()`, replace the current `const tools = input.toolRequests.map(...)` block with:

```ts
  const selectedToolNames = new Set(
    input.toolRequests.map((request) => request.toolName),
  );

  const tools = ORBIT_AGENT_TOOL_CATALOG.map((tool) => {
    const artifact = artifactsByKind.get(tool.artifactKind);

    return {
      artifactKind: tool.artifactKind,
      descriptionZh: tool.descriptionZh,
      inputSpecZh: tool.inputSpecZh,
      outputSchema: tool.outputSchema,
      outputSpecZh: tool.outputSpecZh,
      renderHint: tool.renderHint,
      requiresConfirmation: tool.requiresConfirmation,
      riskLevel: tool.riskLevel,
      selectedInCurrentRun: selectedToolNames.has(tool.toolName),
      sourceModules:
        artifact?.result.provenance.sourceModules ?? tool.sourceModules,
      specificationZh: tool.specificationZh,
      toolFamily: tool.toolFamily,
      toolName: tool.toolName,
    };
  });
```

Leave `toolCallsFor()` unchanged; it should still describe the current run's planned/executed tool calls, not the whole catalog.

- [ ] **Step 6: Run the focused API trace test to verify it passes**

Run from `repos/orbits`:

```bash
npm test -- tests/capabilities/orbit-ai-trace-debug.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 1**

Run:

```bash
git add features/orbit-ai/agent-tools/registry.ts \
  features/orbit-ai/trace-contract.ts \
  features/orbit-ai/live-conversation-trace.ts \
  tests/capabilities/orbit-ai-trace-debug.test.ts
git commit -m "feat: add orbit ai trace tool registry"
```

Expected: a commit containing only the registry, trace contract, trace runtime, and API trace test changes.

---

### Task 2: Trace Debug Page Tool Catalog UI

**Files:**
- Modify: `repos/orbits/app/dev/orbit-ai/trace/orbit-ai-trace-debugger.tsx`
- Test: `repos/orbits/tests/pages/orbit-ai-trace-debug-page.test.tsx`

**Interfaces:**
- Consumes: `ORBIT_AGENT_TOOL_CATALOG`
- Consumes: `OrbitAiTraceRuntimeTool.descriptionZh`
- Consumes: `OrbitAiTraceRuntimeTool.specificationZh`
- Produces: `<div data-trace-tool-catalog="true">`
- Produces: `<div data-trace-tool-name="events.recommend">`

- [ ] **Step 1: Write the failing page test**

Edit `repos/orbits/tests/pages/orbit-ai-trace-debug-page.test.tsx`.

In `/dev/orbit-ai/trace renders the Orbit AI trace debugger shell`, add:

```ts
assert.match(html, /data-trace-tool-catalog="true"/);
assert.match(html, /data-trace-tool-name="events\.recommend"/);
assert.match(html, /根据活动上下文推荐值得复核的活动/);
assert.match(html, /输入：query 用户请求/);
assert.match(html, /只读取活动和关系上下文并生成推荐视图/);
```

In `Orbit AI trace debugger posts prompts to the full-chain trace API`, add source assertions:

```ts
assert.match(source, /ORBIT_AGENT_TOOL_CATALOG/);
assert.match(source, /descriptionZh/);
assert.match(source, /specificationZh/);
assert.match(source, /selectedInCurrentRun/);
assert.match(source, /data-trace-tool-catalog/);
```

- [ ] **Step 2: Run the focused page test to verify it fails**

Run from `repos/orbits`:

```bash
npm test -- tests/pages/orbit-ai-trace-debug-page.test.tsx
```

Expected: FAIL because the static trace page currently shows only a generic runtime snapshot card and has no tool catalog.

- [ ] **Step 3: Import the catalog into the client component**

Modify `repos/orbits/app/dev/orbit-ai/trace/orbit-ai-trace-debugger.tsx`.

Add this import after the existing trace-contract import:

```ts
import { ORBIT_AGENT_TOOL_CATALOG } from "../../../../features/orbit-ai/agent-tools/registry";
```

- [ ] **Step 4: Add copy for the catalog**

In `traceCopy.en`, add:

```ts
toolCatalogEmpty: "The registered tool catalog is available before a trace run.",
toolCatalogSelected: "selected in current run",
toolCatalogStandby: "available",
toolCatalogTitle: "Registered tools",
toolConfirmationRequired: "confirmation required",
toolDescription: "Description",
toolInputSpec: "Input",
toolOutputSpec: "Output",
toolRisk: "Risk",
toolSpec: "Spec",
```

In `traceCopy.zh`, add:

```ts
toolCatalogEmpty: "工具目录会在 trace 运行前显示，运行后会标记本轮选中的工具。",
toolCatalogSelected: "本轮已选择",
toolCatalogStandby: "可用",
toolCatalogTitle: "已注册工具",
toolConfirmationRequired: "需要确认",
toolDescription: "说明",
toolInputSpec: "输入规格",
toolOutputSpec: "输出规格",
toolRisk: "风险",
toolSpec: "规格",
```

- [ ] **Step 5: Add compact catalog styles**

In `traceDebuggerStyles`, add `.trace-tool-catalog` to the grid selector:

```css
.trace-tool-catalog,
```

Add these styles near the runtime card styles:

```css
.trace-tool-catalog {
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
}

.trace-tool-card {
  display: grid;
  gap: 10px;
}

.trace-tool-card header {
  align-items: start;
  display: flex;
  gap: 10px;
  justify-content: space-between;
}

.trace-tool-card strong {
  font-family: var(--orbit-font-mono);
  overflow-wrap: anywhere;
}

.trace-tool-spec {
  display: grid;
  gap: 6px;
}

.trace-tool-spec span {
  color: var(--orbit-color-muted);
  font-size: 0.72rem;
  font-weight: 800;
  text-transform: uppercase;
}

.trace-tool-card[data-selected-tool="true"] {
  border-color: var(--trace-agent);
  box-shadow: inset 0 4px 0 var(--trace-agent);
}
```

- [ ] **Step 6: Render all tools in `RuntimeSnapshotPanel`**

Inside `RuntimeSnapshotPanel`, before `return`, add:

```ts
  const tools =
    runtimeSnapshot?.tools ??
    ORBIT_AGENT_TOOL_CATALOG.map((tool) => ({
      ...tool,
      selectedInCurrentRun: false,
    }));
```

Inside the `<div className="trace-runtime-grid">`, replace the current tools map with:

```tsx
          <div className="trace-tool-catalog" data-trace-tool-catalog="true">
            {tools.map((tool) => (
              <div
                className="trace-runtime-card trace-tool-card"
                data-selected-tool={tool.selectedInCurrentRun ? "true" : "false"}
                data-trace-tool-name={tool.toolName}
                key={tool.toolName}
              >
                <header>
                  <strong>{tool.toolName}</strong>
                  <span className="trace-status">
                    {tool.selectedInCurrentRun
                      ? copy.toolCatalogSelected
                      : copy.toolCatalogStandby}
                  </span>
                </header>
                <p>{tool.descriptionZh}</p>
                <div className="trace-tool-spec">
                  <span>{copy.toolSpec}</span>
                  <p>{tool.specificationZh}</p>
                </div>
                <div className="trace-tool-spec">
                  <span>{copy.toolInputSpec}</span>
                  <p>{tool.inputSpecZh}</p>
                </div>
                <div className="trace-tool-spec">
                  <span>{copy.toolOutputSpec}</span>
                  <p>{tool.outputSpecZh}</p>
                </div>
                <code>
                  {copy.toolRisk}: {tool.riskLevel} ·{" "}
                  {tool.requiresConfirmation
                    ? copy.toolConfirmationRequired
                    : "no confirmation"}
                </code>
              </div>
            ))}
          </div>
```

Keep the sub-agent and renderer maps below the tool catalog.

- [ ] **Step 7: Run the focused page test to verify it passes**

Run from `repos/orbits`:

```bash
npm test -- tests/pages/orbit-ai-trace-debug-page.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Run both focused trace tests**

Run from `repos/orbits`:

```bash
npm test -- tests/capabilities/orbit-ai-trace-debug.test.ts tests/pages/orbit-ai-trace-debug-page.test.tsx
```

Expected: PASS.

- [ ] **Step 9: Commit Task 2**

Run:

```bash
git add app/dev/orbit-ai/trace/orbit-ai-trace-debugger.tsx \
  tests/pages/orbit-ai-trace-debug-page.test.tsx
git commit -m "feat: show orbit ai tool catalog in trace debugger"
```

Expected: a commit containing only the trace debugger UI and page test changes.

---

### Task 3: Full Verification

**Files:**
- Verify existing changed files only.

**Interfaces:**
- Consumes: registry, trace payload, debug page rendering from Tasks 1 and 2.
- Produces: final verification evidence.

- [ ] **Step 1: Run focused tests**

Run from `repos/orbits`:

```bash
npm test -- tests/capabilities/orbit-ai-trace-debug.test.ts tests/pages/orbit-ai-trace-debug-page.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run lint/typecheck**

Run from `repos/orbits`:

```bash
npm run lint
```

Expected: PASS.

- [ ] **Step 3: Inspect only intended diff**

Run from repo root `/Users/xzhao/Projects/orbit`:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors. Intended files from this plan are:

```text
repos/orbits/features/orbit-ai/agent-tools/registry.ts
repos/orbits/features/orbit-ai/trace-contract.ts
repos/orbits/features/orbit-ai/live-conversation-trace.ts
repos/orbits/app/dev/orbit-ai/trace/orbit-ai-trace-debugger.tsx
repos/orbits/tests/capabilities/orbit-ai-trace-debug.test.ts
repos/orbits/tests/pages/orbit-ai-trace-debug-page.test.tsx
```

The workspace may already contain unrelated dirty files; do not revert them.

- [ ] **Step 4: Final commit if Task 1 and Task 2 were not committed separately**

If previous task commits were skipped, run:

```bash
git add repos/orbits/features/orbit-ai/agent-tools/registry.ts \
  repos/orbits/features/orbit-ai/trace-contract.ts \
  repos/orbits/features/orbit-ai/live-conversation-trace.ts \
  repos/orbits/app/dev/orbit-ai/trace/orbit-ai-trace-debugger.tsx \
  repos/orbits/tests/capabilities/orbit-ai-trace-debug.test.ts \
  repos/orbits/tests/pages/orbit-ai-trace-debug-page.test.tsx
git commit -m "feat: show orbit ai tool catalog in trace debugger"
```

Expected: commit succeeds without staging unrelated workspace changes.
