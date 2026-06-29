"use client";

import { FormEvent, useMemo, useState } from "react";
import type {
  OrbitAiPlannerOnlyTrace,
  OrbitAiTracePayload,
  OrbitAiTraceRuntimeSnapshot,
  OrbitAiTraceStage,
} from "../../../../features/orbit-ai/trace-contract";
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

const baselineStages = [
  "input_received",
  "local_guardrails",
  "planner",
  "tool_mapping",
  "artifact_generation",
  "synthesis",
  "final_response",
] as const;

const traceDebuggerStyles = `
.orbit-ai-trace-debugger {
  --trace-ink: #111827;
  --trace-paper: #f8fafc;
  --trace-blue: #2563eb;
  --trace-source: #047857;
  --trace-guard: #b45309;
  --trace-failure: #b91c1c;
}

.orbit-ai-trace-debugger .trace-shell {
  max-width: 1440px;
}

.trace-toolbar,
.trace-main-grid,
.trace-detail-grid,
.trace-metric-row,
.trace-pill-row,
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
  grid-template-columns: minmax(260px, 0.86fr) minmax(320px, 1.1fr) minmax(320px, 1fr);
  align-items: start;
}

.trace-detail-grid {
  grid-template-columns: minmax(0, 1fr);
}

.trace-panel,
.trace-stage-button,
.trace-runtime-card,
.trace-call-row,
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
  gap: 6px;
  grid-template-columns: 12px minmax(0, 1fr);
  min-height: 76px;
  padding: 10px;
  text-align: left;
  width: 100%;
}

.trace-stage-button[aria-pressed="true"] {
  border-color: var(--trace-blue);
  box-shadow: inset 3px 0 0 var(--trace-blue);
}

.trace-stage-dot {
  border: 2px solid var(--trace-blue);
  border-radius: 999px;
  height: 12px;
  margin-top: 4px;
  width: 12px;
}

.trace-stage-button[data-status="blocked"] .trace-stage-dot,
.trace-stage-button[data-status="skipped"] .trace-stage-dot {
  border-color: var(--trace-guard);
}

.trace-stage-button[data-status="failed"] .trace-stage-dot {
  border-color: var(--trace-failure);
}

.trace-stage-title {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: space-between;
}

.trace-stage-title strong,
.trace-runtime-card strong,
.trace-call-row strong,
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
.trace-stage-button p,
.trace-runtime-card p,
.trace-call-row p,
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
.trace-source-row {
  display: grid;
  gap: 6px;
  padding: var(--orbit-space-sm);
}

.trace-empty {
  border-color: var(--trace-blue);
  border-style: dashed;
}

.trace-error {
  border-color: var(--trace-failure);
}

.trace-source-row {
  border-left: 3px solid var(--trace-source);
}

.trace-call-row {
  border-left: 3px solid var(--trace-blue);
}

.trace-runtime-card {
  border-left: 3px solid var(--trace-guard);
}

@media (max-width: 1080px) {
  .trace-toolbar,
  .trace-main-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
`;

function prettySource(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value, null, 2);
}

function stageLabel(stageId: string): string {
  return stageId.replace(/_/g, " ");
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

function stageCounts(stage: OrbitAiTraceStage | null) {
  return {
    evidence: stage?.evidenceIds.length ?? 0,
    hasSource: Boolean(stage?.outputSource),
    status: stage?.status ?? "waiting",
  };
}

function SourcePanel({ stage }: { stage: OrbitAiTraceStage | null }) {
  const source = stage?.outputSource;

  return (
    <details data-stage-output-source="true">
      <summary>
        {source ? `${stage?.label ?? "Stage"} output source` : "Stage output source"}
      </summary>
      <pre className="trace-code">
        {source ? prettySource(source.value) : "No stage output source yet."}
      </pre>
    </details>
  );
}

function StageTimeline({
  selectedStageId,
  stages,
  onSelect,
}: {
  onSelect: (stageId: string) => void;
  selectedStageId: string | null;
  stages: readonly OrbitAiTraceStage[];
}) {
  const visibleStages =
    stages.length > 0
      ? stages
      : baselineStages.map((stageId) => ({
          id: stageId,
          label: stageLabel(stageId),
          renderHint: "summary_card",
          status: "skipped",
          summary: "Waiting for trace data.",
        }));

  return (
    <div aria-label="Orbit AI trace stage timeline" data-trace-timeline="true">
      <div className="trace-detail-grid">
        {visibleStages.map((stage) => (
          <button
            aria-pressed={selectedStageId === stage.id}
            className="trace-stage-button"
            data-status={stage.status}
            key={stage.id}
            onClick={() => onSelect(stage.id)}
            type="button"
          >
            <span aria-hidden="true" className="trace-stage-dot" />
            <span>
              <span className="trace-stage-title">
                <strong>{stage.label ?? stageLabel(stage.id)}</strong>
                <span className="trace-status">{stage.status}</span>
              </span>
              <p>{stage.summary}</p>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function StageDetail({ stage }: { stage: OrbitAiTraceStage | null }) {
  const counts = stageCounts(stage);

  return (
    <WorkbenchSurface eyebrow="Selected stage" title={stage?.label ?? "No trace selected"}>
      <div className={stage ? "trace-panel" : "trace-panel trace-empty"}>
        <div className="trace-pill-row">
          <Chip tone={statusTone(counts.status)}>{counts.status}</Chip>
          <Chip tone="evidence">{stage?.renderHint ?? "summary_card"}</Chip>
          <Chip tone="confirmation">{counts.evidence} evidence</Chip>
          <Chip tone={counts.hasSource ? "success" : "privacy"}>
            {counts.hasSource ? "source attached" : "source pending"}
          </Chip>
        </div>
        <p>{stage?.summary ?? "Run a trace to inspect a stage in the chain spine."}</p>
        {stage?.skipReason && <p>{stage.skipReason}</p>}
        <SourcePanel stage={stage} />
      </div>
    </WorkbenchSurface>
  );
}

function PlannerComparison({
  plannerOnly,
}: {
  plannerOnly: OrbitAiPlannerOnlyTrace | null;
}) {
  const requests = plannerOnly?.toolTrace.toolRequests ?? [];

  return (
    <WorkbenchSurface
      eyebrow="Planner-only"
      title="Planner comparison"
    >
      <div data-planner-only-comparison="true" className="trace-panel">
        <div className="trace-pill-row">
          <Chip tone="evidence">{plannerOnly?.status ?? "waiting"}</Chip>
          <Chip tone="confirmation">{requests.length} planned tools</Chip>
        </div>
        <p>
          {plannerOnly?.planner?.parsed.assistantMessage ??
            "Planner-only output appears after the first trace run."}
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
              <strong>No planned tool</strong>
              <p>{plannerOnly?.skippedReason ?? "Waiting for planner trace."}</p>
            </div>
          )}
        </div>
        <details>
          <summary>Planner raw output</summary>
          <pre className="trace-code">
            {plannerOnly?.planner?.rawOutputText ?? "No raw planner output yet."}
          </pre>
        </details>
      </div>
    </WorkbenchSurface>
  );
}

function RuntimeSnapshotPanel({
  runtimeSnapshot,
}: {
  runtimeSnapshot: OrbitAiTraceRuntimeSnapshot | null;
}) {
  const unknownRenderers = runtimeSnapshot?.unknownRenderers ?? [];

  return (
    <WorkbenchSurface eyebrow="Runtime" title="Detected architecture">
      <details
        data-runtime-snapshot="true"
        open={unknownRenderers.length > 0}
      >
        <summary>
          {runtimeSnapshot
            ? `${runtimeSnapshot.tools.length} tools, ${runtimeSnapshot.subAgents.length} sub-agents`
            : "Runtime snapshot"}
        </summary>
        <div className="trace-runtime-grid">
          {(runtimeSnapshot?.tools ?? []).map((tool) => (
            <div className="trace-runtime-card" key={tool.toolName}>
              <strong>{tool.toolName}</strong>
              <p>{tool.toolFamily}</p>
              <code>{tool.renderHint}</code>
            </div>
          ))}
          {(runtimeSnapshot?.subAgents ?? []).map((subAgent) => (
            <div className="trace-runtime-card" key={subAgent.subAgent}>
              <strong>{subAgent.subAgent}</strong>
              <p>{subAgent.artifactKinds.join(", ")}</p>
              <code>{subAgent.renderHints.join(", ")}</code>
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
              <strong>No runtime snapshot</strong>
              <p>Run a trace to detect tools, sub-agents, and renderers.</p>
            </div>
          )}
        </div>
      </details>
    </WorkbenchSurface>
  );
}

function SourceDataPanel({ payload }: { payload: OrbitAiTracePayload | null }) {
  const dataSources = payload?.fullChain.dataSources ?? [];
  const toolCalls = payload?.fullChain.toolCalls ?? [];

  return (
    <WorkbenchSurface eyebrow="Sources" title="Tool calls and data sources">
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
            <strong>No tool call yet</strong>
            <p>Tool call traces appear after a full-chain trace run.</p>
          </div>
        )}
        {dataSources.length > 0 ? (
          dataSources.map((source, index) => (
            <div
              className="trace-source-row"
              key={`${source.artifactKind}-${source.sourceModule}-${index}`}
            >
              <strong>{source.sourceModule}</strong>
              <p>{source.generatedViewSectionTitles.join(", ") || source.source}</p>
              <span className="trace-status">{source.artifactKind}</span>
            </div>
          ))
        ) : (
          <div className="trace-source-row">
            <strong>No data source yet</strong>
            <p>Source modules appear when a sub-agent artifact is generated.</p>
          </div>
        )}
      </div>
    </WorkbenchSurface>
  );
}

export function OrbitAiTraceDebugger() {
  const [prompt, setPrompt] = useState("看下有什么有意思的活动");
  const [locale, setLocale] = useState("zh");
  const [maxLoopSteps, setMaxLoopSteps] = useState("3");
  const [payload, setPayload] = useState<OrbitAiTracePayload | null>(null);
  const [requestStatus, setRequestStatus] = useState<RequestStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
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

      if (!body.success) {
        throw new Error(body.error?.message ?? "Trace request failed.");
      }

      setPayload(body.data);
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
        <header className="workbench-header">
          <p className="workbench-kicker">developer-debug-prompt-visible</p>
          <h1>Orbit AI trace debugger</h1>
          <p className="workbench-intro">
            Full-chain Orbit Agent trace with planner, local guardrails, tool
            mapping, sub-agent artifacts, source modules, and final response.
          </p>
        </header>

        <WorkbenchSurface elevated eyebrow="Trace input" title="Run a prompt">
          <form className="trace-form trace-toolbar" onSubmit={submitTrace}>
            <label className="control-field">
              <span>Prompt</span>
              <textarea
                onChange={(event) => setPrompt(event.target.value)}
                value={prompt}
              />
            </label>
            <label className="control-field">
              <span>Locale</span>
              <select
                onChange={(event) => setLocale(event.target.value)}
                value={locale}
              >
                <option value="zh">zh</option>
                <option value="en">en</option>
              </select>
            </label>
            <label className="control-field">
              <span>Loop steps</span>
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
              {requestStatus === "loading" ? "Tracing" : "Run trace"}
            </PrimaryButton>
          </form>
          {requestStatus === "error" && (
            <div className="trace-panel trace-error" role="alert">
              <strong>Trace failed</strong>
              <p>{errorMessage}</p>
            </div>
          )}
        </WorkbenchSurface>

        <section className="trace-main-grid" aria-label="Orbit AI trace debugger">
          <WorkbenchSurface eyebrow="Chain spine" title="Execution chain">
            <StageTimeline
              onSelect={setSelectedStageId}
              selectedStageId={selectedStage?.id ?? selectedStageId}
              stages={payload?.fullChain.stages ?? []}
            />
          </WorkbenchSurface>

          <div className="trace-detail-grid">
            <StageDetail stage={selectedStage} />
            <SourceDataPanel payload={payload} />
          </div>

          <div className="trace-detail-grid">
            <PlannerComparison plannerOnly={payload?.plannerOnly ?? null} />
            <RuntimeSnapshotPanel
              runtimeSnapshot={payload?.fullChain.runtimeSnapshot ?? null}
            />
          </div>
        </section>
      </div>
      <style>{traceDebuggerStyles}</style>
    </WorkbenchFrame>
  );
}
