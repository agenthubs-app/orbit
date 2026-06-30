# Orbit AI Trace 工具目录计划

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `docs/superpowers/plans/2026-06-30-orbit-ai-trace-tool-catalog.md` |
| 中文镜像 | `knowledge/docs/zh/trace-tool-catalog-plan.zh.md` |
| 分类 | `implementation-plan` |
| 状态 | `current` |
| 新鲜度 | `likely-current` |
| 负责人域 | `orbit-ai` |

## 怎么读

这页是当前阅读入口。具体字段、函数签名和运行行为仍以原始来源、相关代码路径和测试为准。

已登记来源和关联代码，但后续改动仍需要重新核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

实施 trace debug 页面展示工具 catalog 和中文规格说明的计划。

## 审计依据

已登记关联代码路径：repos/orbits/app/dev/orbit-ai/trace、repos/orbits/features/orbit-ai。

## 结构化阅读入口

- 第 1 节：Orbit AI Trace Tool Catalog 实现 计划
- 第 2 节：源标题：Global Constraints
- 第 3 节：源标题：File Structure
- 第 4 节：任务 1: Tool Registry 和 Trace 契约
- 第 5 节：任务 2: Trace Debug 页面 Tool Catalog UI
- 第 6 节：任务 3: Full 验证

## 保留的代码与命令证据

### 代码证据 1

```ts
tools: readonly { toolName: string; renderHint: string }[];
```

### 代码证据 2

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

### 代码证据 3

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

### 代码证据 4

```bash
npm test -- tests/capabilities/orbit-ai-trace-debug.test.ts
```

### 代码证据 5

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

### 代码证据 6

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

### 代码证据 7

```ts
import { ORBIT_AGENT_TOOL_CATALOG } from "./agent-tools/registry";
```

### 代码证据 8

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

### 代码证据 9

```bash
npm test -- tests/capabilities/orbit-ai-trace-debug.test.ts
```

### 代码证据 10

```bash
git add features/orbit-ai/agent-tools/registry.ts \
  features/orbit-ai/trace-contract.ts \
  features/orbit-ai/live-conversation-trace.ts \
  tests/capabilities/orbit-ai-trace-debug.test.ts
git commit -m "feat: add orbit ai trace tool registry"
```

### 代码证据 11

```ts
assert.match(html, /data-trace-tool-catalog="true"/);
assert.match(html, /data-trace-tool-name="events\.recommend"/);
assert.match(html, /根据活动上下文推荐值得复核的活动/);
assert.match(html, /输入：query 用户请求/);
assert.match(html, /只读取活动和关系上下文并生成推荐视图/);
```

### 代码证据 12

```ts
assert.match(source, /ORBIT_AGENT_TOOL_CATALOG/);
assert.match(source, /descriptionZh/);
assert.match(source, /specificationZh/);
assert.match(source, /selectedInCurrentRun/);
assert.match(source, /data-trace-tool-catalog/);
```

### 代码证据 13

```bash
npm test -- tests/pages/orbit-ai-trace-debug-page.test.tsx
```

### 代码证据 14

```ts
import { ORBIT_AGENT_TOOL_CATALOG } from "../../../../features/orbit-ai/agent-tools/registry";
```

### 代码证据 15

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

### 代码证据 16

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

### 代码证据 17

```css
.trace-tool-catalog,
```

### 代码证据 18

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

### 代码证据 19

```ts
  const tools =
    runtimeSnapshot?.tools ??
    ORBIT_AGENT_TOOL_CATALOG.map((tool) => ({
      ...tool,
      selectedInCurrentRun: false,
    }));
```

### 代码证据 20

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

### 代码证据 21

```bash
npm test -- tests/pages/orbit-ai-trace-debug-page.test.tsx
```

### 代码证据 22

```bash
npm test -- tests/capabilities/orbit-ai-trace-debug.test.ts tests/pages/orbit-ai-trace-debug-page.test.tsx
```

### 代码证据 23

```bash
git add app/dev/orbit-ai/trace/orbit-ai-trace-debugger.tsx \
  tests/pages/orbit-ai-trace-debug-page.test.tsx
git commit -m "feat: show orbit ai tool catalog in trace debugger"
```

### 代码证据 24

```bash
npm test -- tests/capabilities/orbit-ai-trace-debug.test.ts tests/pages/orbit-ai-trace-debug-page.test.tsx
```

### 代码证据 25

```bash
npm run lint
```

### 代码证据 26

```bash
git diff --check
git status --short
```

### 代码证据 27

```text
repos/orbits/features/orbit-ai/agent-tools/registry.ts
repos/orbits/features/orbit-ai/trace-contract.ts
repos/orbits/features/orbit-ai/live-conversation-trace.ts
repos/orbits/app/dev/orbit-ai/trace/orbit-ai-trace-debugger.tsx
repos/orbits/tests/capabilities/orbit-ai-trace-debug.test.ts
repos/orbits/tests/pages/orbit-ai-trace-debug-page.test.tsx
```

### 代码证据 28

```bash
git add repos/orbits/features/orbit-ai/agent-tools/registry.ts \
  repos/orbits/features/orbit-ai/trace-contract.ts \
  repos/orbits/features/orbit-ai/live-conversation-trace.ts \
  repos/orbits/app/dev/orbit-ai/trace/orbit-ai-trace-debugger.tsx \
  repos/orbits/tests/capabilities/orbit-ai-trace-debug.test.ts \
  repos/orbits/tests/pages/orbit-ai-trace-debug-page.test.tsx
git commit -m "feat: show orbit ai tool catalog in trace debugger"
```

## 源文档正文

源文档正文主要不是中文。中文镜像不直接机翻全文，避免生成一份看似同步、实际难以审计的副本；阅读时先看本页摘要、审计依据、标题入口和代码证据。需要逐段核对时，请打开上方原始来源。
