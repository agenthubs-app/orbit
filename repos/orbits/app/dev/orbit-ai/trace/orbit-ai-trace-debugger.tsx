"use client";

import { FormEvent, useMemo, useState } from "react";
import type {
  OrbitAiPlannerOnlyTrace,
  OrbitAiTracePayload,
  OrbitAiTraceRuntimeSnapshot,
  OrbitAiTraceStage,
} from "../../../../features/orbit-ai/trace-contract";
import { ORBIT_AGENT_TOOL_CATALOG } from "../../../../features/orbit-ai/agent-tools/registry";
import {
  Chip,
  PrimaryButton,
  WorkbenchFrame,
  WorkbenchSurface,
} from "../../../../shared/ui/primitives";

type TraceApiResponse =
  | {
      data: OrbitAiTracePayload;
      success: true;
    }
  | {
      error?: {
        code?: string;
        message?: string;
      };
      success: false;
    };

type RequestStatus = "idle" | "loading" | "success" | "error";
type TraceLanguage = "zh" | "en";
type TraceGraphNode =
  OrbitAiTracePayload["fullChain"]["graph"]["nodes"][number];

const baselineStages = [
  "input_received",
  "local_guardrails",
  "planner",
  "tool_mapping",
  "database_context",
  "artifact_generation",
  "synthesis",
  "final_response",
] as const;

const stageLabels: Record<TraceLanguage, Record<string, string>> = {
  en: {
    artifact_generation: "Artifact",
    database_context: "Database",
    final_response: "Response",
    input_received: "Input",
    local_guardrails: "Guardrails",
    planner: "Planner",
    synthesis: "Synthesis",
    tool_mapping: "Tool mapping",
  },
  zh: {
    artifact_generation: "Artifact",
    database_context: "数据库",
    final_response: "最终响应",
    input_received: "输入",
    local_guardrails: "本地边界",
    planner: "规划器",
    synthesis: "综合",
    tool_mapping: "工具映射",
  },
};

const statusLabels: Record<TraceLanguage, Record<string, string>> = {
  en: {
    blocked: "blocked",
    completed: "completed",
    failed: "failed",
    skipped: "skipped",
    waiting: "waiting",
  },
  zh: {
    blocked: "已截停",
    completed: "已完成",
    failed: "失败",
    skipped: "已跳过",
    waiting: "等待中",
  },
};

const traceCopy = {
  en: {
    architectureEmpty:
      "Run a trace to detect tools, artifact producers, and renderers.",
    architectureEyebrow: "Runtime",
    architectureSummary: "Runtime snapshot",
    architectureTitle: "Detected architecture",
    chainAria: "Orbit AI trace debugger",
    dataSourceEmpty:
      "Source modules appear when an artifact producer output is generated.",
    dataSourceEmptyTitle: "No data source yet",
    databaseEmpty: "Local database context appears after a trace run.",
    databaseEmptyTitle: "No database context yet",
    durationLabel: "Duration",
    evidence: "evidence",
    graphEmpty: "Trace graph appears after a run.",
    graphMaxLoops: "supports up to",
    graphMode: "Graph mode",
    inspectorEmpty:
      "Run a trace to inspect a stage in the pipeline workbench.",
    inspectorEyebrow: "Selected stage",
    inspectorTitleEmpty: "No trace selected",
    intro:
      "Pipeline view for the Agent execution chain: input, local guardrails, planner, tool mapping, artifact generation, synthesis, and final response.",
    languageToggleLabel: "Switch trace interface language",
    localeLabel: "Prompt locale",
    loopStepsLabel: "Loop steps",
    pipelineEyebrow: "Execution",
    pipelineTitle: "Agent execution pipeline",
    plannedTools: "planned tools",
    plannerEmpty: "Planner-only output appears after the first trace run.",
    plannerEmptyReason: "Waiting for planner trace.",
    plannerEmptyTitle: "No planned tool",
    plannerEyebrow: "Planner-only",
    plannerRawOutput: "Planner raw output",
    plannerRawOutputEmpty: "No raw planner output yet.",
    plannerTitle: "Planner comparison",
    promptLabel: "Prompt",
    requestDurationLabel: "Request elapsed",
    runButton: "Run trace",
    runningButton: "Tracing",
    safetyLedger: "Safety ledger",
    sourceAttached: "source attached",
    sourceEmpty: "No stage output source yet.",
    sourcePending: "source pending",
    sourceSummaryEmpty: "Stage output source",
    sourcesEyebrow: "Sources",
    sourcesTitle: "Tool calls and data sources",
    title: "Orbit AI trace debugger",
    toolCallEmpty: "Tool call traces appear after a full-chain trace run.",
    toolCallEmptyTitle: "No tool call yet",
    toolCatalogEmpty:
      "The registered tool catalog is available before a trace run.",
    toolCatalogSelected: "selected in current run",
    toolCatalogStandby: "available",
    toolCatalogTitle: "Registered tools",
    toolConfirmationRequired: "confirmation required",
    toolDescription: "Description",
    toolInputSpec: "Input",
    toolOutputSpec: "Output",
    toolRisk: "Risk",
    toolSpec: "Spec",
    traceInputEyebrow: "Trace input",
    traceInputTitle: "Run a prompt",
    traceFailed: "Trace failed",
    waitingSummary: "Waiting for trace data.",
    waitingDuration: "waiting",
  },
  zh: {
    architectureEmpty: "运行一次 trace 后检测工具、artifact producer 和 renderer。",
    architectureEyebrow: "运行时",
    architectureSummary: "运行时快照",
    architectureTitle: "架构检测",
    chainAria: "Orbit AI trace 调试器",
    dataSourceEmpty: "生成 artifact producer 输出后会显示来源模块。",
    dataSourceEmptyTitle: "暂无数据来源",
    databaseEmpty: "运行 trace 后会显示本地数据库上下文。",
    databaseEmptyTitle: "暂无数据库上下文",
    durationLabel: "耗时",
    evidence: "条证据",
    graphEmpty: "运行后会显示 trace 图。",
    graphMaxLoops: "最多支持",
    graphMode: "图模式",
    inspectorEmpty: "运行一次 trace 后，在管线检查台查看当前阶段。",
    inspectorEyebrow: "当前阶段",
    inspectorTitleEmpty: "尚未选择 trace",
    intro:
      "Agent 执行管线视图：输入、本地边界、规划器、工具映射、Artifact、综合、最终响应按真实链路串起来。",
    languageToggleLabel: "切换 trace 界面语言",
    localeLabel: "Prompt 语言",
    loopStepsLabel: "Loop 步数",
    pipelineEyebrow: "执行链",
    pipelineTitle: "Agent 执行管线",
    plannedTools: "个计划工具",
    plannerEmpty: "第一次 trace 运行后会显示 planner-only 输出。",
    plannerEmptyReason: "等待 planner trace。",
    plannerEmptyTitle: "暂无计划工具",
    plannerEyebrow: "Planner-only",
    plannerRawOutput: "Planner 原始输出",
    plannerRawOutputEmpty: "暂无 planner 原始输出。",
    plannerTitle: "Planner 对照",
    promptLabel: "Prompt",
    requestDurationLabel: "请求总耗时",
    runButton: "运行 trace",
    runningButton: "Tracing",
    safetyLedger: "安全账本",
    sourceAttached: "源码已附加",
    sourceEmpty: "暂无阶段输出源码。",
    sourcePending: "源码待生成",
    sourceSummaryEmpty: "阶段输出源码",
    sourcesEyebrow: "来源",
    sourcesTitle: "工具调用与数据来源",
    title: "Orbit AI trace debugger",
    toolCallEmpty: "完整执行链运行后会显示工具调用 trace。",
    toolCallEmptyTitle: "暂无工具调用",
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
    traceInputEyebrow: "Trace 输入",
    traceInputTitle: "运行 Prompt",
    traceFailed: "Trace 失败",
    waitingSummary: "等待 trace 数据。",
    waitingDuration: "等待耗时",
  },
} satisfies Record<TraceLanguage, Record<string, string>>;

const traceDebuggerStyles = `
.orbit-ai-trace-debugger {
  --trace-ink: #111827;
  --trace-paper: #f8fafc;
  --trace-agent: #2563eb;
  --trace-data: #047857;
  --trace-guard: #b45309;
  --trace-failure: #b91c1c;
}

.orbit-ai-trace-debugger .trace-shell {
  max-width: 1440px;
  overflow-x: clip;
}

.orbit-ai-trace-debugger .workbench-header h1,
.orbit-ai-trace-debugger .workbench-intro {
  max-width: 100%;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.trace-toolbar,
.trace-main-grid,
.trace-inspector-grid,
.trace-detail-grid,
.trace-metric-row,
.trace-pill-row,
.trace-tool-catalog,
.trace-runtime-grid {
  display: grid;
  gap: var(--orbit-space-sm);
  min-width: 0;
}

.trace-toolbar {
  grid-template-columns: minmax(280px, 1fr) 160px 160px auto;
  align-items: end;
}

.trace-main-grid {
  grid-template-columns: minmax(0, 1fr);
  align-items: start;
}

.trace-inspector-grid {
  grid-template-columns: minmax(320px, 1.25fr) minmax(300px, 0.95fr);
  align-items: start;
}

.trace-detail-grid {
  grid-template-columns: minmax(0, 1fr);
}

.trace-header-row {
  align-items: start;
  display: grid;
  gap: var(--orbit-space-md);
  grid-template-columns: minmax(0, 1fr) auto;
}

.trace-language-toggle {
  align-items: center;
  background: #eef4f8;
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  display: inline-grid;
  gap: 4px;
  grid-template-columns: repeat(2, minmax(72px, max-content));
  padding: 4px;
}

.trace-language-toggle button {
  background: transparent;
  border: 0;
  border-radius: calc(var(--orbit-radius-control) - 2px);
  color: var(--trace-ink);
  cursor: pointer;
  font: inherit;
  font-size: 0.86rem;
  font-weight: 750;
  min-height: 34px;
  padding: 0 10px;
}

.trace-language-toggle button[aria-pressed="true"] {
  background: #ffffff;
  box-shadow: 0 1px 4px rgba(15, 23, 42, 0.12);
}

.trace-pipeline-shell {
  overflow-x: auto;
  padding-bottom: 4px;
}

.trace-pipeline {
  display: grid;
  gap: 0;
  grid-template-columns: repeat(8, minmax(150px, 1fr));
  min-width: 1200px;
}

.trace-graph-shell {
  display: grid;
  gap: var(--orbit-space-md);
  overflow-x: auto;
  padding-bottom: 4px;
}

.trace-loop-band {
  background: #f6f9fc;
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  display: grid;
  gap: var(--orbit-space-sm);
  min-width: 1120px;
  padding: var(--orbit-space-sm);
}

.trace-loop-header {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: var(--orbit-space-sm);
  justify-content: space-between;
}

.trace-loop-header strong {
  font-family: var(--orbit-font-mono);
  font-size: 0.9rem;
}

.trace-graph-node-grid {
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
}

.trace-graph-node {
  background: #ffffff;
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  color: var(--trace-ink);
  cursor: pointer;
  display: grid;
  gap: 6px;
  min-height: 78px;
  padding: 10px 12px;
  position: relative;
  text-align: left;
}

.trace-graph-node::after {
  background: var(--orbit-color-border);
  content: "";
  height: 2px;
  left: calc(100% + 1px);
  position: absolute;
  top: 34px;
  width: 14px;
}

.trace-graph-node[data-terminal="true"]::after {
  display: none;
}

.trace-graph-node[aria-pressed="true"] {
  border-color: var(--trace-agent);
  box-shadow: inset 0 4px 0 var(--trace-agent);
}

.trace-graph-node[data-trace-lane="data"] {
  background: #eef8f3;
}

.trace-graph-node[data-trace-lane="data"][aria-pressed="true"] {
  border-color: var(--trace-data);
  box-shadow: inset 0 4px 0 var(--trace-data);
}

.trace-graph-node small {
  color: var(--orbit-color-muted);
  font-family: var(--orbit-font-mono);
  font-size: 0.68rem;
  font-weight: 800;
  text-transform: uppercase;
}

.trace-duration {
  color: var(--trace-guard);
  font-family: var(--orbit-font-mono);
  font-size: 0.72rem;
  font-weight: 850;
  line-height: 1.25;
}

.trace-graph-node strong {
  overflow-wrap: anywhere;
}

.trace-edge-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.trace-edge-chip {
  background: #ffffff;
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  color: var(--orbit-color-muted);
  font-family: var(--orbit-font-mono);
  font-size: 0.68rem;
  font-weight: 800;
  padding: 4px 7px;
  text-transform: uppercase;
}

.trace-panel,
.trace-stage-button,
.trace-runtime-card,
.trace-call-row,
.trace-database-row,
.trace-source-row {
  background: var(--trace-paper);
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  min-width: 0;
}

.trace-stage-button {
  align-items: start;
  color: var(--trace-ink);
  display: grid;
  gap: 8px;
  grid-template-rows: auto auto;
  min-height: 92px;
  padding: 12px;
  position: relative;
  text-align: left;
  width: 100%;
}

.trace-stage-button[aria-pressed="true"] {
  border-color: var(--trace-agent);
  box-shadow: inset 0 4px 0 var(--trace-agent);
}

.trace-stage-button[data-trace-lane="data"] {
  background: #eef8f3;
}

.trace-stage-button[data-trace-lane="data"][aria-pressed="true"] {
  border-color: var(--trace-data);
  box-shadow: inset 0 4px 0 var(--trace-data);
}

.trace-stage-button::after {
  background: var(--orbit-color-border);
  content: "";
  height: 2px;
  left: calc(100% + 1px);
  position: absolute;
  top: 32px;
  width: 22px;
  z-index: 0;
}

.trace-stage-button[data-terminal="true"]::after {
  display: none;
}

.trace-stage-dot {
  align-items: center;
  background: #ffffff;
  border: 2px solid var(--trace-agent);
  border-radius: 999px;
  display: inline-flex;
  font-family: var(--orbit-font-mono);
  font-size: 0.68rem;
  font-weight: 800;
  height: 28px;
  justify-content: center;
  width: 28px;
}

.trace-stage-button[data-status="blocked"] .trace-stage-dot,
.trace-stage-button[data-status="skipped"] .trace-stage-dot {
  border-color: var(--trace-guard);
}

.trace-stage-button[data-status="failed"] .trace-stage-dot {
  border-color: var(--trace-failure);
}

.trace-stage-button[data-trace-lane="data"] .trace-stage-dot {
  border-color: var(--trace-data);
}

.trace-stage-title {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: space-between;
}

.trace-stage-number-row {
  align-items: center;
  display: flex;
  justify-content: space-between;
}

.trace-stage-title strong,
.trace-runtime-card strong,
.trace-call-row strong,
.trace-database-row strong,
.trace-source-row strong {
  overflow-wrap: anywhere;
}

.trace-status {
  color: var(--orbit-color-muted);
  font-family: var(--orbit-font-mono);
  font-size: 0.72rem;
  font-weight: 750;
  text-transform: uppercase;
}

.trace-panel {
  display: grid;
  gap: var(--orbit-space-sm);
  padding: var(--orbit-space-md);
}

.trace-panel h3 {
  font-size: 1rem;
  line-height: 1.25;
  margin: 0;
}

.trace-panel p,
.trace-runtime-card p,
.trace-call-row p,
.trace-database-row p,
.trace-source-row p {
  color: var(--orbit-color-muted);
  line-height: 1.5;
  margin: 0;
  overflow-wrap: anywhere;
}

.trace-metric-row,
.trace-runtime-grid {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 150px), 1fr));
}

.trace-tool-catalog {
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
}

.trace-pill-row {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 120px), max-content));
}

.trace-code {
  background: #0f172a;
  border-radius: var(--orbit-radius-control);
  color: #e5eefb;
  font-family: var(--orbit-font-mono);
  font-size: 0.78rem;
  line-height: 1.55;
  margin: 0;
  max-height: 360px;
  overflow: auto;
  padding: var(--orbit-space-sm);
  white-space: pre;
}

.trace-form textarea {
  min-height: 112px;
}

.trace-runtime-card,
.trace-call-row,
.trace-database-row,
.trace-source-row {
  display: grid;
  gap: 6px;
  padding: var(--orbit-space-sm);
}

.trace-empty {
  border-color: var(--trace-agent);
  border-style: dashed;
}

.trace-error {
  border-color: var(--trace-failure);
}

.trace-source-row {
  border-left: 3px solid var(--trace-data);
}

.trace-call-row {
  border-left: 3px solid var(--trace-agent);
}

.trace-database-row {
  border-left: 3px solid var(--trace-data);
}

.trace-runtime-card {
  border-left: 3px solid var(--trace-guard);
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

@media (max-width: 1080px) {
  .trace-toolbar,
  .trace-main-grid,
  .trace-inspector-grid,
  .trace-header-row {
    grid-template-columns: minmax(0, 1fr);
  }

  .trace-language-toggle {
    justify-self: start;
  }
}

@media (max-width: 520px) {
  .orbit-ai-trace-debugger .workbench-header h1 {
    font-size: 2rem;
    line-height: 1.08;
    max-width: min(100%, 320px);
  }

  .orbit-ai-trace-debugger .workbench-intro {
    max-width: min(100%, 330px);
  }

  .trace-language-toggle {
    width: 100%;
  }

  .trace-language-toggle button {
    min-width: 0;
  }

  .trace-pipeline {
    grid-template-columns: repeat(8, minmax(136px, 1fr));
    min-width: 1088px;
  }

  .trace-loop-band {
    min-width: 960px;
  }
}
`;

function prettySource(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value, null, 2);
}

function stageLabel(stageId: string, language: TraceLanguage): string {
  return stageLabels[language][stageId] ?? stageId.replace(/_/g, " ");
}

function statusLabel(status: string, language: TraceLanguage): string {
  return statusLabels[language][status] ?? status;
}

function formatDuration(
  durationMs: number | null | undefined,
  copy: (typeof traceCopy)[TraceLanguage],
) {
  if (typeof durationMs !== "number" || !Number.isFinite(durationMs)) {
    return copy.waitingDuration;
  }

  if (durationMs > 0 && durationMs < 1) {
    return "<1 ms";
  }

  return `${durationMs >= 10 ? durationMs.toFixed(0) : durationMs.toFixed(1)} ms`;
}

function statusTone(status: string): "evidence" | "privacy" | "warning" {
  if (status === "completed") {
    return "evidence";
  }

  if (status === "blocked" || status === "failed") {
    return "warning";
  }

  return "privacy";
}

function laneForStage(stage: Pick<OrbitAiTraceStage, "id" | "lane">) {
  return stage.lane ?? (stage.id === "database_context" ? "data" : "agent");
}

function stageCounts(stage: OrbitAiTraceStage | null) {
  return {
    durationMs: stage?.durationMs,
    evidence: stage?.evidenceIds.length ?? 0,
    hasSource: Boolean(stage?.outputSource),
    status: stage?.status ?? "waiting",
  };
}

function SourcePanel({
  copy,
  stage,
}: {
  copy: (typeof traceCopy)[TraceLanguage];
  stage: OrbitAiTraceStage | null;
}) {
  const source = stage?.outputSource;

  return (
    <details data-stage-output-source="true">
      <summary>
        {source
          ? `${stage?.label ?? copy.sourceSummaryEmpty} output source`
          : copy.sourceSummaryEmpty}
      </summary>
      <pre className="trace-code">
        {source ? prettySource(source.value) : copy.sourceEmpty}
      </pre>
    </details>
  );
}

function StagePipeline({
  copy,
  language,
  selectedStageId,
  stages,
  onSelect,
}: {
  copy: (typeof traceCopy)[TraceLanguage];
  language: TraceLanguage;
  onSelect: (stageId: string) => void;
  selectedStageId: string | null;
  stages: readonly OrbitAiTraceStage[];
}) {
  const visibleStages =
    stages.length > 0
      ? stages
      : baselineStages.map((stageId) => ({
          id: stageId,
          lane: stageId === "database_context" ? "data" : "agent",
          label: stageLabel(stageId, language),
          renderHint: "summary_card",
          status: "skipped",
          summary: copy.waitingSummary,
        }));

  return (
    <div
      aria-label={copy.pipelineTitle}
      className="trace-pipeline-shell"
      data-trace-pipeline="true"
      data-trace-timeline="true"
    >
      <div className="trace-pipeline">
        {visibleStages.map((stage, index) => {
          const lane = laneForStage(stage);

          return (
            <button
              aria-pressed={selectedStageId === stage.id}
              className="trace-stage-button"
              data-database-lane={lane === "data" ? "true" : undefined}
              data-pipeline-stage={stage.id}
              data-status={stage.status}
              data-terminal={index === visibleStages.length - 1}
              data-trace-lane={lane}
              key={stage.id}
              onClick={() => onSelect(stage.id)}
              type="button"
            >
              <span className="trace-stage-number-row">
                <span aria-hidden="true" className="trace-stage-dot">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="trace-status">
                  {statusLabel(stage.status, language)}
                </span>
              </span>
              <span>
                <span className="trace-stage-title">
                  <strong>{stageLabel(stage.id, language)}</strong>
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function fallbackGraph(
  copy: (typeof traceCopy)[TraceLanguage],
  language: TraceLanguage,
): OrbitAiTracePayload["fullChain"]["graph"] {
  const loopIndex = 1;
  const nodes: TraceGraphNode[] = baselineStages.map((stageId) => ({
    id: `loop:${loopIndex}:stage:${stageId}`,
    kind:
      stageId === "planner" || stageId === "synthesis"
        ? "model"
        : stageId === "database_context"
          ? "data"
          : stageId === "final_response"
            ? "response"
            : "stage",
    label: stageLabel(stageId, language),
    lane: stageId === "database_context" ? "data" : "agent",
    loopIndex,
    stageId,
    status: "skipped",
    summary: copy.waitingSummary,
  }));

  return {
    edges: baselineStages.slice(0, -1).map((stageId, index) => ({
      from: `loop:${loopIndex}:stage:${stageId}`,
      kind: "control",
      to: `loop:${loopIndex}:stage:${baselineStages[index + 1]}`,
    })),
    nodes,
  };
}

function TraceGraph({
  copy,
  language,
  onSelect,
  payload,
  selectedStageId,
}: {
  copy: (typeof traceCopy)[TraceLanguage];
  language: TraceLanguage;
  onSelect: (stageId: string) => void;
  payload: OrbitAiTracePayload | null;
  selectedStageId: string | null;
}) {
  const graph = payload?.fullChain.graph ?? fallbackGraph(copy, language);
  const loopSummary =
    payload?.fullChain.loopSummary ??
    ({
      loopCount: 1,
      maxSupportedLoops: 1,
      mode: "single_live_loop",
      reason: copy.graphEmpty,
    } satisfies OrbitAiTracePayload["fullChain"]["loopSummary"]);
  const totalDurationMs = payload?.fullChain.totalDurationMs;
  const loopIndexes = Array.from(
    new Set(graph.nodes.map((node) => node.loopIndex)),
  ).sort((left, right) => left - right);

  return (
    <div
      className="trace-graph-shell"
      data-loop-count={loopSummary.loopCount}
      data-trace-graph="true"
      data-trace-pipeline="true"
      data-trace-timeline="true"
    >
      {loopIndexes.map((loopIndex) => {
        const loopNodes = graph.nodes.filter(
          (node) => node.loopIndex === loopIndex,
        );
        const loopNodeIds = new Set(loopNodes.map((node) => node.id));
        const loopEdges = graph.edges.filter(
          (edge) => loopNodeIds.has(edge.from) && loopNodeIds.has(edge.to),
        );

        return (
          <section
            className="trace-loop-band"
            data-trace-loop={loopIndex}
            key={loopIndex}
          >
            <header className="trace-loop-header">
              <strong>
                Loop {loopIndex} / {loopSummary.loopCount}
              </strong>
              <div className="trace-pill-row">
                <Chip tone="evidence">{loopSummary.mode}</Chip>
                <Chip tone="confirmation">
                  {copy.graphMaxLoops} {loopSummary.maxSupportedLoops}
                </Chip>
                <Chip tone="evidence">
                  {copy.requestDurationLabel}: {formatDuration(totalDurationMs, copy)}
                </Chip>
              </div>
            </header>
            <div className="trace-graph-node-grid">
              {loopNodes.map((node, index) => (
                <button
                  aria-pressed={selectedStageId === node.stageId}
                  className="trace-graph-node"
                  data-graph-node={node.id}
                  data-pipeline-stage={node.stageId}
                  data-stage-duration-ms={node.durationMs}
                  data-status={node.status}
                  data-terminal={index === loopNodes.length - 1}
                  data-trace-lane={node.lane}
                  key={node.id}
                  onClick={() => {
                    if (node.stageId) {
                      onSelect(node.stageId);
                    }
                  }}
                  type="button"
                >
                  <small>
                    {node.kind} · {statusLabel(node.status, language)}
                  </small>
                  <strong>
                    {node.stageId ? stageLabel(node.stageId, language) : node.label}
                  </strong>
                  <span className="trace-duration">
                    {copy.durationLabel}: {formatDuration(node.durationMs, copy)}
                  </span>
                </button>
              ))}
            </div>
            <div className="trace-edge-row" aria-label={copy.graphMode}>
              {loopEdges.length > 0 ? (
                loopEdges.map((edge) => (
                  <span
                    className="trace-edge-chip"
                    data-graph-edge={edge.kind}
                    key={`${edge.from}-${edge.kind}-${edge.to}`}
                  >
                    {edge.kind}
                  </span>
                ))
              ) : (
                <span className="trace-edge-chip">{copy.graphEmpty}</span>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function StageDetail({
  copy,
  language,
  stage,
}: {
  copy: (typeof traceCopy)[TraceLanguage];
  language: TraceLanguage;
  stage: OrbitAiTraceStage | null;
}) {
  const counts = stageCounts(stage);

  return (
    <WorkbenchSurface
      eyebrow={copy.inspectorEyebrow}
      title={stage ? stageLabel(stage.id, language) : copy.inspectorTitleEmpty}
    >
      <div className={stage ? "trace-panel" : "trace-panel trace-empty"}>
        <div className="trace-pill-row">
          <Chip tone={statusTone(counts.status)}>
            {statusLabel(counts.status, language)}
          </Chip>
          <Chip tone="evidence">{stage?.renderHint ?? "summary_card"}</Chip>
          <Chip tone="confirmation">
            {counts.evidence} {copy.evidence}
          </Chip>
          <Chip tone="evidence">
            {copy.durationLabel}: {formatDuration(counts.durationMs, copy)}
          </Chip>
          <Chip tone={counts.hasSource ? "success" : "privacy"}>
            {counts.hasSource ? copy.sourceAttached : copy.sourcePending}
          </Chip>
        </div>
        <p>{stage?.summary ?? copy.inspectorEmpty}</p>
        {stage?.skipReason && <p>{stage.skipReason}</p>}
        {stage?.safety && (
          <details>
            <summary>{copy.safetyLedger}</summary>
            <pre className="trace-code">{prettySource(stage.safety)}</pre>
          </details>
        )}
        <SourcePanel copy={copy} stage={stage} />
      </div>
    </WorkbenchSurface>
  );
}

function PlannerComparison({
  copy,
  plannerOnly,
}: {
  copy: (typeof traceCopy)[TraceLanguage];
  plannerOnly: OrbitAiPlannerOnlyTrace | null;
}) {
  const requests = plannerOnly?.toolTrace.toolRequests ?? [];

  return (
    <WorkbenchSurface
      eyebrow={copy.plannerEyebrow}
      title={copy.plannerTitle}
    >
      <div data-planner-only-comparison="true" className="trace-panel">
        <div className="trace-pill-row">
          <Chip tone="evidence">{plannerOnly?.status ?? "waiting"}</Chip>
          <Chip tone="confirmation">
            {requests.length} {copy.plannedTools}
          </Chip>
        </div>
        <p>
          {plannerOnly?.planner?.parsed.assistantMessage ??
            copy.plannerEmpty}
        </p>
        <div className="trace-detail-grid">
          {requests.length > 0 ? (
            requests.map((request) => (
              <div className="trace-call-row" key={request.toolName}>
                <strong>{request.toolName}</strong>
                <p>{request.toolFamily}</p>
              </div>
            ))
          ) : (
            <div className="trace-call-row">
              <strong>{copy.plannerEmptyTitle}</strong>
              <p>{plannerOnly?.skippedReason ?? copy.plannerEmptyReason}</p>
            </div>
          )}
        </div>
        <details>
          <summary>{copy.plannerRawOutput}</summary>
          <pre className="trace-code">
            {plannerOnly?.planner?.rawOutputText ?? copy.plannerRawOutputEmpty}
          </pre>
        </details>
      </div>
    </WorkbenchSurface>
  );
}

function RuntimeSnapshotPanel({
  copy,
  runtimeSnapshot,
}: {
  copy: (typeof traceCopy)[TraceLanguage];
  runtimeSnapshot: OrbitAiTraceRuntimeSnapshot | null;
}) {
  const unknownRenderers = runtimeSnapshot?.unknownRenderers ?? [];
  const tools =
    runtimeSnapshot?.tools ??
    ORBIT_AGENT_TOOL_CATALOG.map((tool) => ({
      ...tool,
      selectedInCurrentRun: false,
    }));

  return (
    <WorkbenchSurface
      eyebrow={copy.architectureEyebrow}
      title={copy.architectureTitle}
    >
      <details
        data-runtime-snapshot="true"
        open={unknownRenderers.length > 0}
      >
        <summary>
          {runtimeSnapshot
            ? `${runtimeSnapshot.tools.length} tools, ${runtimeSnapshot.artifactProducers.length} artifact producers`
            : copy.architectureSummary}
        </summary>
        <div className="trace-runtime-grid">
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
          {(runtimeSnapshot?.artifactProducers ?? []).map((artifactProducer) => (
            <div className="trace-runtime-card" key={artifactProducer.artifactProducer}>
              <strong>{artifactProducer.artifactProducer}</strong>
              <p>{artifactProducer.artifactKinds.join(", ")}</p>
              <code>{artifactProducer.renderHints.join(", ")}</code>
            </div>
          ))}
          {(runtimeSnapshot?.renderers ?? []).map((renderer) => (
            <div className="trace-runtime-card" key={`${renderer.hint}-${renderer.renderer}`}>
              <strong>{renderer.hint}</strong>
              <p>{renderer.renderer}</p>
            </div>
          ))}
          {runtimeSnapshot ? null : (
            <div className="trace-runtime-card">
              <strong>{copy.toolCatalogTitle}</strong>
              <p>{copy.toolCatalogEmpty}</p>
            </div>
          )}
        </div>
      </details>
    </WorkbenchSurface>
  );
}

function SourceDataPanel({
  copy,
  payload,
}: {
  copy: (typeof traceCopy)[TraceLanguage];
  payload: OrbitAiTracePayload | null;
}) {
  const databaseInteractions = payload?.fullChain.databaseInteractions ?? [];
  const dataSources = payload?.fullChain.dataSources ?? [];
  const toolCalls = payload?.fullChain.toolCalls ?? [];

  return (
    <WorkbenchSurface eyebrow={copy.sourcesEyebrow} title={copy.sourcesTitle}>
      <div className="trace-detail-grid">
        {toolCalls.length > 0 ? (
          toolCalls.map((toolCall, index) => (
            <div
              className="trace-call-row"
              key={`${toolCall.source}-${toolCall.toolName}-${index}`}
            >
              <strong>{toolCall.toolName}</strong>
              <p>{toolCall.reason}</p>
              <span className="trace-status">{toolCall.status}</span>
            </div>
          ))
        ) : (
          <div className="trace-call-row">
            <strong>{copy.toolCallEmptyTitle}</strong>
            <p>{copy.toolCallEmpty}</p>
          </div>
        )}
        {databaseInteractions.length > 0 ? (
          databaseInteractions.map((interaction) => (
            <div
              className="trace-database-row"
              data-database-lane="true"
              data-trace-lane="data"
              key={interaction.id}
            >
              <strong>{interaction.storageKey}</strong>
              <p>{interaction.summary}</p>
              <span className="trace-status">
                {interaction.operation} · v{interaction.schemaVersion}
              </span>
            </div>
          ))
        ) : (
          <div
            className="trace-database-row"
            data-database-lane="true"
            data-trace-lane="data"
          >
            <strong>{copy.databaseEmptyTitle}</strong>
            <p>{copy.databaseEmpty}</p>
          </div>
        )}
        {dataSources.length > 0 ? (
          dataSources.map((source, index) => (
            <div
              className="trace-source-row"
              data-trace-lane="data"
              key={`${source.artifactKind}-${source.sourceModule}-${index}`}
            >
              <strong>{source.sourceModule}</strong>
              <p>{source.generatedViewSectionTitles.join(", ") || source.source}</p>
              <span className="trace-status">{source.artifactKind}</span>
            </div>
          ))
        ) : (
          <div className="trace-source-row" data-trace-lane="data">
            <strong>{copy.dataSourceEmptyTitle}</strong>
            <p>{copy.dataSourceEmpty}</p>
          </div>
        )}
      </div>
    </WorkbenchSurface>
  );
}

export function OrbitAiTraceDebugger() {
  const [prompt, setPrompt] = useState("看下有什么有意思的活动");
  const [locale, setLocale] = useState("zh");
  const [uiLanguage, setUiLanguage] = useState<TraceLanguage>("zh");
  const [maxLoopSteps, setMaxLoopSteps] = useState("3");
  const [payload, setPayload] = useState<OrbitAiTracePayload | null>(null);
  const [requestDurationMs, setRequestDurationMs] = useState<number | null>(null);
  const [requestStatus, setRequestStatus] = useState<RequestStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const copy = traceCopy[uiLanguage];
  const selectedStage = useMemo(() => {
    const stages = payload?.fullChain.stages ?? [];

    return (
      stages.find((stage) => stage.id === selectedStageId) ??
      stages[0] ??
      null
    );
  }, [payload, selectedStageId]);

  async function submitTrace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!prompt.trim()) {
      return;
    }

    setRequestStatus("loading");
    setErrorMessage("");
    setRequestDurationMs(null);
    const requestStartedAt = performance.now();

    try {
      const response = await fetch("/api/dev/orbit-ai/trace", {
        body: JSON.stringify(
          {
            locale,
            maxLoopSteps: Number(maxLoopSteps),
            message: prompt,
          },
          null,
          2,
        ),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const body = (await response.json()) as TraceApiResponse;

      if (body.success === false) {
        throw new Error(body.error?.message ?? "Trace request failed.");
      }

      setPayload(body.data);
      setRequestDurationMs(
        Math.max(0, Number((performance.now() - requestStartedAt).toFixed(3))),
      );
      setSelectedStageId(body.data.fullChain.stages[0]?.id ?? null);
      setRequestStatus("success");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Trace request failed.");
      setRequestStatus("error");
    }
  }

  return (
    <WorkbenchFrame className="orbit-ai-trace-debugger">
      <div
        className="workbench-shell trace-shell"
        data-orbit-ai-trace-debugger="true"
      >
        <header className="workbench-header trace-header-row">
          <div>
            <p className="workbench-kicker">developer-debug-prompt-visible</p>
            <h1>{copy.title}</h1>
            <p className="workbench-intro">{copy.intro}</p>
          </div>
          <div
            aria-label={copy.languageToggleLabel}
            className="trace-language-toggle"
            data-language-toggle="true"
            role="group"
          >
            <button
              aria-pressed={uiLanguage === "zh"}
              onClick={() => setUiLanguage("zh")}
              type="button"
            >
              中文
            </button>
            <button
              aria-pressed={uiLanguage === "en"}
              onClick={() => setUiLanguage("en")}
              type="button"
            >
              English
            </button>
          </div>
        </header>

        <WorkbenchSurface
          elevated
          eyebrow={copy.traceInputEyebrow}
          title={copy.traceInputTitle}
        >
          <form className="trace-form trace-toolbar" onSubmit={submitTrace}>
            <label className="control-field">
              <span>{copy.promptLabel}</span>
              <textarea
                onChange={(event) => setPrompt(event.target.value)}
                value={prompt}
              />
            </label>
            <label className="control-field">
              <span>{copy.localeLabel}</span>
              <select
                onChange={(event) => setLocale(event.target.value)}
                value={locale}
              >
                <option value="zh">zh</option>
                <option value="en">en</option>
              </select>
            </label>
            <label className="control-field">
              <span>{copy.loopStepsLabel}</span>
              <select
                onChange={(event) => setMaxLoopSteps(event.target.value)}
                value={maxLoopSteps}
              >
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
              </select>
            </label>
            <PrimaryButton
              disabled={!prompt.trim() || requestStatus === "loading"}
              type="submit"
            >
              {requestStatus === "loading" ? copy.runningButton : copy.runButton}
            </PrimaryButton>
          </form>
          <div className="trace-pill-row">
            <Chip tone="evidence">
              {copy.requestDurationLabel}:{" "}
              {formatDuration(requestDurationMs ?? payload?.fullChain.totalDurationMs, copy)}
            </Chip>
          </div>
          {requestStatus === "error" && (
            <div className="trace-panel trace-error" role="alert">
              <strong>{copy.traceFailed}</strong>
              <p>{errorMessage}</p>
            </div>
          )}
        </WorkbenchSurface>

        <section className="trace-main-grid" aria-label={copy.chainAria}>
          <WorkbenchSurface
            eyebrow={copy.pipelineEyebrow}
            title={copy.pipelineTitle}
          >
            <TraceGraph
              copy={copy}
              language={uiLanguage}
              onSelect={setSelectedStageId}
              payload={payload}
              selectedStageId={selectedStage?.id ?? selectedStageId}
            />
          </WorkbenchSurface>

          <div className="trace-inspector-grid">
            <div className="trace-detail-grid">
              <StageDetail
                copy={copy}
                language={uiLanguage}
                stage={selectedStage}
              />
              <SourceDataPanel copy={copy} payload={payload} />
            </div>

            <div className="trace-detail-grid">
              <PlannerComparison
                copy={copy}
                plannerOnly={payload?.plannerOnly ?? null}
              />
              <RuntimeSnapshotPanel
                copy={copy}
                runtimeSnapshot={payload?.fullChain.runtimeSnapshot ?? null}
              />
            </div>
          </div>
        </section>
      </div>
      <style>{traceDebuggerStyles}</style>
    </WorkbenchFrame>
  );
}
