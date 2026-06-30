/**
 * AI provider mock 与 provenance 边界的开发者面板。
 *
 * 面板展示 provider run record、模型来源和安全账本，用来验证 AI 调用边界的 UI 表达。
 */
import {
  Chip,
  WorkbenchFrame,
  WorkbenchSurface,
} from "../../ui/primitives";
import type {
  AiProviderPayload,
  AiProviderRunRecord,
} from "../provider";
import { createMockAiProviderService } from "../mock-provider";

export const AI_PROVIDER_MOCK_PROVENANCE_SLUG =
  "ai-provider-mock-and-provenance-boundary";

const liveImplementationNotesPath =
  "shared/ai/ai-provider-mock-and-provenance-boundary/LIVE_IMPLEMENTATION.md";
const pathWrapStyle = { overflowWrap: "anywhere" } as const;

const responsiveWorkbenchStyles = `
.ai-provider-workbench {
  grid-template-columns: minmax(0, 1fr);
  overflow-x: clip;
}

.ai-provider-workbench .workbench-shell,
.ai-provider-workbench .workbench-surface,
.ai-provider-workbench .workbench-grid,
.ai-provider-workbench .relationship-meta,
.ai-provider-workbench .chip-row,
.ai-provider-workbench .ai-provider-state-matrix,
.ai-provider-workbench .ai-provider-run-grid {
  min-width: 0;
}

.ai-provider-workbench code,
.ai-provider-workbench dd,
.ai-provider-workbench .orbit-chip,
.ai-provider-workbench .source-list li {
  overflow-wrap: anywhere;
}

.ai-provider-workbench .ai-provider-checkpoint-grid,
.ai-provider-workbench .ai-provider-state-matrix,
.ai-provider-workbench .ai-provider-run-grid {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 190px), 1fr));
}

.ai-provider-workbench .ai-provider-checkpoint-grid div,
.ai-provider-workbench .ai-provider-state-matrix div,
.ai-provider-workbench .ai-provider-run-card {
  background: var(--orbit-color-surface);
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  padding: var(--orbit-space-sm);
}

.ai-provider-workbench .ai-provider-run-card {
  border-left: 3px solid var(--orbit-color-primary);
}

.ai-provider-workbench .ai-provider-run-card strong {
  display: block;
  font-size: 1rem;
  line-height: 1.25;
}

.ai-provider-workbench .ai-provider-output {
  white-space: pre-wrap;
}
`;

export const AI_PROVIDER_MOCK_API_PROBES = [
  {
    label: "Message draft",
    method: "POST",
    path: "/api/ai/mock/message-draft",
    curlCommand:
      "curl -s -X POST http://localhost:3000/api/ai/mock/message-draft",
    expectedStatus: 200,
    expectation:
      "Expect 200 success envelope with prompt template id, input hash, output, fallback behavior, and run provenance.",
  },
  {
    label: "Run provenance",
    method: "GET",
    path: "/api/ai/runs/demo-ai-run-1",
    curlCommand: "curl -s http://localhost:3000/api/ai/runs/demo-ai-run-1",
    expectedStatus: 200,
    expectation:
      "Expect 200 success envelope for one stored mock AI run provenance record.",
  },
  {
    label: "Empty message draft",
    method: "POST",
    path: "/api/ai/mock/message-draft?scenario=empty",
    curlCommand:
      "curl -s -X POST http://localhost:3000/api/ai/mock/message-draft?scenario=empty",
    expectedStatus: 200,
    expectation:
      "Expect 200 empty envelope when no prompt-ready relationship context is available.",
  },
  {
    label: "Pending provider guard",
    method: "POST",
    path: "/api/ai/mock/message-draft?scenario=pending",
    curlCommand:
      "curl -s -X POST http://localhost:3000/api/ai/mock/message-draft?scenario=pending",
    expectedStatus: 200,
    expectation:
      "Expect 200 pending envelope while the local provider guard is unresolved.",
  },
  {
    label: "Controlled failure",
    method: "POST",
    path: "/api/ai/mock/message-draft?scenario=failure",
    curlCommand:
      "curl -s -X POST http://localhost:3000/api/ai/mock/message-draft?scenario=failure",
    expectedStatus: 503,
    expectation:
      "Expect 503 failure envelope with AI_PROVIDER_MOCK_FAILED context.",
  },
] as const;

const liveHandoffEvidenceExcerpts = [
  "Live service/provider files stay isolated under shared/ai until product routes opt in.",
  "ORBIT_AI_PROVIDER_MODE and ORBIT_AI_PROVIDER switch mock rules to approved provider adapters.",
  "Prompt template id, input hash, output, fallback behavior, and run provenance remain required.",
  "Private relationship context stays source-scoped and auditable before any provider request.",
  "Replacement tests cover success, empty, pending, controlled failure, provider failure, and mock no-network guards.",
] as const;

function apiProbeCommand(
  probe: (typeof AI_PROVIDER_MOCK_API_PROBES)[number],
): string {
  return `${probe.method} ${probe.path}`;
}

function EvidenceChips({ evidenceIds }: { evidenceIds: readonly string[] }) {
  return (
    <div className="chip-row" aria-label="AI provider mock evidence ids">
      {evidenceIds.map((evidenceId) => (
        <Chip key={evidenceId} tone="evidence">
          {evidenceId}
        </Chip>
      ))}
    </div>
  );
}

function OperatorCheckpoint({ run }: { run: AiProviderRunRecord }) {
  return (
    <WorkbenchSurface
      elevated
      eyebrow="Operator checkpoint"
      title="Ready for verifier review"
    >
      <p className="type-body">
        Scan this first: the AI-shaped result is generated by local mock rules.
        The record exposes prompt template id, input hash, output, fallback
        behavior, and provenance without live provider, network, device,
        database, email, calendar, or notification access.
      </p>
      <dl
        aria-label="AI provider mock operator checkpoint"
        className="relationship-meta ai-provider-checkpoint-grid"
      >
        <div>
          <dt>Run id</dt>
          <dd>
            <code>{run.runId}</code>
          </dd>
        </div>
        <div>
          <dt>Prompt template</dt>
          <dd>
            <code>{run.promptTemplateId}</code>
          </dd>
        </div>
        <div>
          <dt>Input hash</dt>
          <dd>
            <code>{run.inputHash}</code>
          </dd>
        </div>
        <div>
          <dt>Fallback behavior</dt>
          <dd>
            used <code>{String(run.fallbackBehavior.used)}</code>
          </dd>
        </div>
        <div>
          <dt>Provider boundary</dt>
          <dd>live AI provider false</dd>
        </div>
      </dl>
      <EvidenceChips evidenceIds={run.evidenceIds} />
    </WorkbenchSurface>
  );
}

function MockOnlyExecutionChecks({ run }: { run: AiProviderRunRecord }) {
  return (
    <dl
      aria-label="Mock-only AI provider execution checks"
      className="relationship-meta"
    >
      <div>
        <dt>Provider request</dt>
        <dd>live AI provider false</dd>
      </div>
      <div>
        <dt>Network</dt>
        <dd>external network false</dd>
      </div>
      <div>
        <dt>Persistence</dt>
        <dd>database write false</dd>
      </div>
      <div>
        <dt>Fallback</dt>
        <dd>
          <code>{String(run.fallbackBehavior.used)}</code>{" "}
          {run.fallbackBehavior.reason}
        </dd>
      </div>
    </dl>
  );
}

function RunCards({ runs }: { runs: readonly AiProviderRunRecord[] }) {
  return (
    <div className="workbench-grid ai-provider-run-grid">
      {runs.map((run) => (
        <article className="ai-provider-run-card" key={run.runId}>
          <p className="surface-eyebrow">{run.output.kind}</p>
          <strong>{run.runId}</strong>
          <dl className="relationship-meta">
            <div>
              <dt>Prompt template</dt>
              <dd>
                <code>{run.promptTemplateId}</code>
              </dd>
            </div>
            <div>
              <dt>Input hash</dt>
              <dd>
                <code>{run.inputHash}</code>
              </dd>
            </div>
            <div>
              <dt>Output</dt>
              <dd className="ai-provider-output">{run.output.text}</dd>
            </div>
            <div>
              <dt>Fallback behavior</dt>
              <dd>
                <code>{String(run.fallbackBehavior.used)}</code>{" "}
                {run.fallbackBehavior.reason}
              </dd>
            </div>
          </dl>
          <EvidenceChips evidenceIds={run.evidenceIds} />
        </article>
      ))}
    </div>
  );
}

function StateMatrix({
  empty,
  failureCode,
  pending,
  success,
}: {
  empty: AiProviderPayload;
  failureCode: string;
  pending: AiProviderPayload;
  success: AiProviderPayload;
}) {
  return (
    <WorkbenchSurface eyebrow="State matrix" title="Harness-visible states">
      <dl
        aria-label="AI provider mock state matrix"
        className="relationship-meta ai-provider-state-matrix"
      >
        <div>
          <dt>Success state</dt>
          <dd>
            <span className="type-caption">
              Success probe: POST /api/ai/mock/message-draft
            </span>
            <br />
            Success: {success.runs.length} mock AI run
          </dd>
        </div>
        <div>
          <dt>Run state</dt>
          <dd>
            <span className="type-caption">
              Run probe: GET /api/ai/runs/demo-ai-run-1
            </span>
            <br />
            Run: provenance record available
          </dd>
        </div>
        <div>
          <dt>Empty state</dt>
          <dd>
            Empty: no prompt-ready relationship context
          </dd>
        </div>
        <div>
          <dt>Pending state</dt>
          <dd>Pending: local provider guard</dd>
        </div>
        <div>
          <dt>Failure state</dt>
          <dd>
            Failure: controlled error <code>{failureCode}</code>
          </dd>
        </div>
      </dl>
      <p className="privacy-note">
        Empty and pending states stay successful envelopes; controlled failures
        are explicit service-unavailable envelopes.
      </p>
      <EvidenceChips
        evidenceIds={[
          ...empty.provenance.evidenceIds,
          ...pending.provenance.evidenceIds,
        ]}
      />
    </WorkbenchSurface>
  );
}

export function AiProviderMockProvenanceDemo() {
  const service = createMockAiProviderService();
  const draftResult = service.draftMessage();
  const runOneResult = service.getRun({ runId: "demo-ai-run-1" });
  const runTwoResult = service.getRun({ runId: "demo-ai-run-2" });
  const emptyResult = service.draftMessage({ scenario: "empty" });
  const pendingResult = service.draftMessage({ scenario: "pending" });
  const failureResult = service.draftMessage({ scenario: "failure" });

  if (
    draftResult.success === false ||
    runOneResult.success === false ||
    runTwoResult.success === false ||
    emptyResult.success === false ||
    pendingResult.success === false
  ) {
    return (
      <WorkbenchFrame className="ai-provider-workbench">
        <div className="workbench-shell">
          <header className="workbench-header">
            <p className="workbench-kicker">Developer capability runtime</p>
            <h1>AI provider mock and provenance boundary</h1>
            <p className="workbench-intro">
              The deterministic AI provider mock fixtures did not load, so the
              dev surface stopped inside a controlled local state.
            </p>
          </header>
        </div>
      </WorkbenchFrame>
    );
  }

  const runs = [runOneResult.data.run, runTwoResult.data.run];
  const failureCode =
    failureResult.success === false
      ? failureResult.error.code
      : "AI_PROVIDER_MOCK_FAILED";

  return (
    <WorkbenchFrame className="ai-provider-workbench">
      <style>{responsiveWorkbenchStyles}</style>
      <div className="workbench-shell">
        <header className="workbench-header">
          <p className="workbench-kicker">Developer capability runtime</p>
          <h1>AI provider mock and provenance boundary</h1>
          <p className="workbench-intro">
            Dev-only surface for verifying the mock AI provider boundary. It
            exposes prompt template ids, input hashes, outputs, fallback
            behavior, and run provenance while remaining fully local.
          </p>
        </header>

        <OperatorCheckpoint run={runOneResult.data.run} />

        <section
          className="workbench-grid"
          aria-label="AI provider mock capability details"
        >
          <WorkbenchSurface
            elevated
            eyebrow="Run provenance records"
            title="Deterministic mock outputs"
          >
            <p className="type-body">
              {draftResult.data.summary}
            </p>
            <RunCards runs={runs} />
          </WorkbenchSurface>

          <WorkbenchSurface eyebrow="Mock-only checks" title="Provider boundaries">
            <MockOnlyExecutionChecks run={runOneResult.data.run} />
            <p className="privacy-note">
              AI-shaped output stays local until live provider files, explicit
              switch controls, privacy review, and replacement tests exist.
            </p>
          </WorkbenchSurface>
        </section>

        <StateMatrix
          empty={emptyResult.data}
          failureCode={failureCode}
          pending={pendingResult.data}
          success={draftResult.data}
        />

        <WorkbenchSurface
          eyebrow="API exercise surface"
          title="Declared probes are runnable"
        >
          <p className="type-body">
            Run these probes against the dev server to verify success, empty,
            pending, and failure envelopes without leaving the mock AI provider
            boundary.
          </p>
          <dl
            className="relationship-meta"
            aria-label="AI provider mock API probes"
          >
            {AI_PROVIDER_MOCK_API_PROBES.map((probe) => (
              <div key={apiProbeCommand(probe)}>
                <dt>{probe.label}</dt>
                <dd>
                  <code style={pathWrapStyle}>{apiProbeCommand(probe)}</code>
                  <br />
                  {probe.expectation}
                  <br />
                  Expected status: {probe.expectedStatus}
                  <br />
                  <code style={pathWrapStyle}>{probe.curlCommand}</code>
                </dd>
              </div>
            ))}
          </dl>
        </WorkbenchSurface>

        <WorkbenchSurface eyebrow="Mock-to-live handoff" title="Replacement notes">
          <dl className="relationship-meta">
            <div>
              <dt>Handoff doc</dt>
              <dd>
                <code style={pathWrapStyle}>{liveImplementationNotesPath}</code>
              </dd>
            </div>
            <div>
              <dt>Switch mechanism</dt>
              <dd>
                <code>ORBIT_AI_PROVIDER_MODE</code> and{" "}
                <code>ORBIT_AI_PROVIDER</code> stay documented before live
                provider adapters are wired.
              </dd>
            </div>
          </dl>
          <ul className="source-list">
            {liveHandoffEvidenceExcerpts.map((excerpt) => (
              <li key={excerpt}>{excerpt}</li>
            ))}
          </ul>
        </WorkbenchSurface>
      </div>
    </WorkbenchFrame>
  );
}
