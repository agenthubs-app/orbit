/**
 * Source/provenance 一致性审计 mock 的开发者面板。
 *
 * 面板展示各 mock collection 的来源、证据覆盖和审计发现，
 * 用来检查能力之间是否保持可追溯的 provenance。
 */
import {
  Chip,
  WorkbenchFrame,
  WorkbenchSurface,
} from "../../../shared/ui/primitives";
import type {
  SourceConsistencyAuditFinding,
  SourceConsistencyAuditedCollection,
  SourceConsistencyProvenanceAuditPayload,
  SourceConsistencyProvenanceAuditProvenance,
  SourceConsistencyProvenanceAuditRunPayload,
  SourceConsistencyProvenanceAuditSourceReference,
} from "../provenance-contract";
import { createMockSourceConsistencyProvenanceAuditService } from "../mock-provenance-audit-service";

export const SOURCE_CONSISTENCY_PROVENANCE_AUDIT_SLUG =
  "source-consistency-and-provenance-audit";

const liveImplementationNotesPath =
  "features/audit/source-consistency-and-provenance-audit/LIVE_IMPLEMENTATION.md";

const responsiveWorkbenchStyles = `
.source-consistency-provenance-audit-workbench {
  grid-template-columns: minmax(0, 1fr);
  overflow-x: clip;
}

.source-consistency-provenance-audit-workbench .workbench-shell,
.source-consistency-provenance-audit-workbench .workbench-surface,
.source-consistency-provenance-audit-workbench .workbench-grid,
.source-consistency-provenance-audit-workbench .relationship-meta,
.source-consistency-provenance-audit-workbench .chip-row,
.source-consistency-provenance-audit-workbench .audit-collection-grid,
.source-consistency-provenance-audit-workbench .audit-state-matrix,
.source-consistency-provenance-audit-workbench .audit-boundary-grid,
.source-consistency-provenance-audit-workbench .audit-scenario-grid,
.source-consistency-provenance-audit-workbench .audit-finding-list,
.source-consistency-provenance-audit-workbench .source-list {
  min-width: 0;
}

.source-consistency-provenance-audit-workbench code,
.source-consistency-provenance-audit-workbench dd,
.source-consistency-provenance-audit-workbench .orbit-chip,
.source-consistency-provenance-audit-workbench .audit-finding-list li,
.source-consistency-provenance-audit-workbench .source-list li {
  overflow-wrap: anywhere;
}

.source-consistency-provenance-audit-workbench .audit-collection-grid,
.source-consistency-provenance-audit-workbench .audit-state-matrix,
.source-consistency-provenance-audit-workbench .audit-boundary-grid,
.source-consistency-provenance-audit-workbench .audit-scenario-grid {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 190px), 1fr));
}

.source-consistency-provenance-audit-workbench .audit-collection-card,
.source-consistency-provenance-audit-workbench .audit-state-matrix div,
.source-consistency-provenance-audit-workbench .audit-boundary-grid div,
.source-consistency-provenance-audit-workbench .audit-scenario-control {
  background: var(--orbit-color-surface);
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  padding: var(--orbit-space-sm);
}

.source-consistency-provenance-audit-workbench .audit-collection-card {
  border-left: 3px solid var(--orbit-color-evidence);
}

.source-consistency-provenance-audit-workbench .audit-status-note {
  background: var(--orbit-color-surface);
  border: 1px solid var(--orbit-color-evidence);
  border-radius: var(--orbit-radius-control);
  color: var(--orbit-color-text);
  font-weight: 700;
  margin: var(--orbit-space-sm) 0;
  padding: var(--orbit-space-sm);
}

.source-consistency-provenance-audit-workbench .audit-collection-card strong {
  display: block;
  font-size: 1.35rem;
  line-height: 1.12;
}

.source-consistency-provenance-audit-workbench .audit-scenario-control {
  align-content: start;
  display: grid;
  gap: var(--orbit-space-sm);
}

.source-consistency-provenance-audit-workbench .audit-scenario-control form {
  margin: 0;
}

.source-consistency-provenance-audit-workbench .audit-scenario-action {
  align-items: center;
  background: var(--orbit-color-surface-raised);
  border: 1px solid var(--orbit-color-border-strong);
  border-radius: var(--orbit-radius-control);
  color: var(--orbit-color-text);
  display: inline-flex;
  font-size: 0.86rem;
  font-weight: 700;
  justify-content: center;
  line-height: 1.35;
  min-height: 40px;
  padding: 8px 10px;
  text-align: center;
  text-decoration: none;
  width: 100%;
}

.source-consistency-provenance-audit-workbench .audit-scenario-action:hover {
  border-color: var(--orbit-color-primary);
  color: var(--orbit-color-primary-strong);
}

.source-consistency-provenance-audit-workbench .audit-finding-list,
.source-consistency-provenance-audit-workbench .source-list {
  display: grid;
  gap: 6px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.source-consistency-provenance-audit-workbench .audit-finding-list li,
.source-consistency-provenance-audit-workbench .source-list li {
  color: var(--orbit-color-muted);
  font-size: 0.82rem;
  line-height: 1.45;
}

.source-consistency-provenance-audit-workbench .audit-finding-label,
.source-consistency-provenance-audit-workbench .source-label {
  color: var(--orbit-color-text);
  display: block;
  font-weight: 700;
}
`;

const auditApiProbes = [
  {
    label: "Audit snapshot",
    command: "GET /api/audit/provenance",
    expectedStatus: 200,
    expectation:
      "Expect 200 success envelope with source consistency coverage for contacts, connections, evidence, recommendations, tasks, chat summaries, and agent actions.",
  },
  {
    label: "Run audit",
    command: "POST /api/audit/provenance/run",
    expectedStatus: 200,
    expectation:
      "Expect 200 success envelope with deterministic rule-based audit run output and no production audit storage writes.",
  },
  {
    label: "Empty audit",
    command: "GET /api/audit/provenance?scenario=empty",
    expectedStatus: 200,
    expectation:
      "Expect 200 empty envelope when no source-backed Orbit records are available.",
  },
  {
    label: "Pending run",
    command: "POST /api/audit/provenance/run?scenario=pending",
    expectedStatus: 200,
    expectation:
      "Expect 200 pending envelope while the local source fixture refresh is unresolved.",
  },
  {
    label: "Controlled failure",
    command: "POST /api/audit/provenance/run?scenario=failure",
    expectedStatus: 503,
    expectation:
      "Expect 503 failure envelope with SOURCE_CONSISTENCY_PROVENANCE_AUDIT_MOCK_FAILED context.",
  },
] as const;

const liveHandoffEvidenceExcerpts = [
  "Live files live under features/audit/source-consistency-and-provenance-audit/.",
  "ORBIT_SOURCE_PROVENANCE_AUDIT_PROVIDER switches mock fixtures to live providers.",
  "Live providers replace deterministic fixtures with approved audit reads and compliance-report writes.",
  "Privacy and provenance stay attached to contacts, connections, evidence, recommendations, tasks, chat summaries, and agent actions.",
  "replacement tests cover success, empty, pending, controlled failure, and mock provider guards.",
] as const;

const scenarioExerciseControls = [
  {
    actionLabel: "Open audit snapshot",
    expectedStatus: 200,
    method: "GET",
    path: "/api/audit/provenance",
    state: "success",
    type: "link",
  },
  {
    actionLabel: "Open empty audit",
    expectedStatus: 200,
    method: "GET",
    path: "/api/audit/provenance?scenario=empty",
    state: "empty",
    type: "link",
  },
  {
    actionLabel: "Run audit",
    expectedStatus: 200,
    method: "POST",
    path: "/api/audit/provenance/run",
    state: "success",
    type: "form",
  },
  {
    actionLabel: "Run pending audit",
    expectedStatus: 200,
    method: "POST",
    path: "/api/audit/provenance/run?scenario=pending",
    state: "pending",
    type: "form",
  },
  {
    actionLabel: "Run failure audit",
    expectedStatus: 503,
    method: "POST",
    path: "/api/audit/provenance/run?scenario=failure",
    state: "failure",
    type: "form",
  },
] as const;

function EvidenceChips({ evidenceIds }: { evidenceIds: readonly string[] }) {
  return (
    <div className="chip-row" aria-label="Source consistency audit evidence ids">
      {evidenceIds.map((evidenceId) => (
        <Chip key={evidenceId} tone="evidence">
          {evidenceId}
        </Chip>
      ))}
    </div>
  );
}

function SourceList({
  sources,
}: {
  sources: readonly SourceConsistencyProvenanceAuditSourceReference[];
}) {
  return (
    <ul className="source-list" aria-label="Source references">
      {sources.map((source) => (
        <li key={source.id}>
          <span className="source-label">{source.label}</span>
          <code>{source.type}</code>; <code>{source.providerRecordId}</code>
        </li>
      ))}
    </ul>
  );
}

function CollectionCard({
  collection,
}: {
  collection: SourceConsistencyAuditedCollection;
}) {
  return (
    <article className="audit-collection-card">
      <p className="surface-eyebrow">{collection.entityKind}</p>
      <strong>{collection.label}</strong>
      <p>
        audited {collection.auditedCount}; inconsistent{" "}
        {collection.inconsistentCount}
      </p>
      <div className="chip-row">
        <Chip tone={collection.sourceConsistent ? "confirmation" : "evidence"}>
          source consistent {String(collection.sourceConsistent)}
        </Chip>
        <Chip tone={collection.provenanceComplete ? "privacy" : "evidence"}>
          provenance complete {String(collection.provenanceComplete)}
        </Chip>
      </div>
      <SourceList sources={collection.sourceRefs} />
      <EvidenceChips evidenceIds={collection.evidenceIds} />
    </article>
  );
}

function FindingList({
  findings,
}: {
  findings: readonly SourceConsistencyAuditFinding[];
}) {
  if (findings.length === 0) {
    return (
      <p className="audit-status-note">
        No active provenance findings remain in the mock MVP loop.
      </p>
    );
  }

  return (
    <ul className="audit-finding-list" aria-label="Audit findings">
      {findings.map((finding) => (
        <li key={finding.findingId}>
          <span className="audit-finding-label">{finding.title}</span>
          <code>{finding.ruleId}</code>; {finding.severity};{" "}
          {finding.detail}
          <p>{finding.remediation}</p>
          <SourceList sources={finding.sourceRefs} />
          <EvidenceChips evidenceIds={finding.evidenceIds} />
        </li>
      ))}
    </ul>
  );
}

function StateCard({
  label,
  payload,
}: {
  label: string;
  payload: SourceConsistencyProvenanceAuditPayload | SourceConsistencyProvenanceAuditRunPayload;
}) {
  return (
    <div>
      <h3>{label}</h3>
      <p>
        state <code>{payload.state}</code>
      </p>
      <p>{payload.summary}</p>
      <p>{payload.nextAction}</p>
      <EvidenceChips evidenceIds={payload.provenance.evidenceIds} />
    </div>
  );
}

function BoundaryMatrix({
  provenance,
}: {
  provenance: SourceConsistencyProvenanceAuditProvenance;
}) {
  const checks = [
    ["compliance reporting", provenance.complianceReportingExecuted],
    ["production audit storage", provenance.productionAuditStorageWriteExecuted],
    ["external network", provenance.externalNetworkRequested],
    ["database reads", provenance.databaseReadExecuted],
    ["database writes", provenance.databaseWriteExecuted],
    ["AI provider", provenance.aiProviderRequested],
    ["email", provenance.emailProviderRequested],
    ["calendar", provenance.calendarProviderRequested],
    ["notification provider", provenance.notificationProviderRequested],
    ["device", provenance.deviceRequested],
  ] as const;

  return (
    <div
      className="workbench-grid audit-boundary-grid"
      aria-label="Source consistency provenance audit provider boundary"
    >
      {checks.map(([label, value]) => (
        <div key={label}>
          <strong>
            {label} {String(value)}
          </strong>
          <p>All Sprint 55 audit paths stay local and deterministic.</p>
        </div>
      ))}
    </div>
  );
}

function ApiProbeList() {
  return (
    <div className="workbench-grid audit-state-matrix">
      {auditApiProbes.map((probe) => (
        <div key={probe.command}>
          <h3>{probe.label}</h3>
          <p>
            <code>{probe.command}</code>
          </p>
          <p>Expected status {probe.expectedStatus}</p>
          <p>{probe.expectation}</p>
        </div>
      ))}
    </div>
  );
}

function ScenarioControls() {
  return (
    <div
      className="workbench-grid audit-scenario-grid"
      id="source-consistency-provenance-audit-scenario-controls"
      aria-label="Source consistency provenance audit scenario exercise controls"
    >
      {scenarioExerciseControls.map((control) => (
        <div className="audit-scenario-control" key={control.path}>
          <h3>{control.actionLabel}</h3>
          <p>
            {control.method} <code>{control.path}</code>
          </p>
          <p>
            state <code>{control.state}</code>; expected status{" "}
            {control.expectedStatus}
          </p>
          {control.type === "link" ? (
            <a className="audit-scenario-action" href={control.path}>
              {control.actionLabel}
            </a>
          ) : (
            <form action={control.path} method="post">
              <button className="audit-scenario-action" type="submit">
                {control.actionLabel}
              </button>
            </form>
          )}
        </div>
      ))}
    </div>
  );
}

export function SourceConsistencyProvenanceAuditDemo() {
  const service = createMockSourceConsistencyProvenanceAuditService();
  const successResult = service.getAuditSnapshot();
  const runResult = service.runAudit();
  const emptyResult = service.getAuditSnapshot({ scenario: "empty" });
  const pendingResult = service.runAudit({ scenario: "pending" });
  const failureResult = service.runAudit({ scenario: "failure" });

  if (
    successResult.success === false ||
    runResult.success === false ||
    emptyResult.success === false ||
    pendingResult.success === false
  ) {
    return null;
  }

  const findingCount = successResult.data.activeFindingCount;
  const findingLabel = findingCount === 1 ? "finding" : "findings";

  return (
    <WorkbenchFrame className="source-consistency-provenance-audit-workbench">
      <style>{responsiveWorkbenchStyles}</style>
      <div className="workbench-shell">
        <header className="workbench-header">
          <p className="workbench-kicker">Developer capability</p>
          <h1>Source consistency and provenance audit</h1>
          <p className="workbench-intro">
            Deterministic audit boundary for source consistency across contacts,
            connections, evidence, recommendations, tasks, chat summaries, and
            agent actions.{" "}
            <a href="#source-consistency-provenance-audit-scenario-controls">
              Scenario controls
            </a>
          </p>
        </header>

        <WorkbenchSurface
          elevated
          eyebrow="Mock capability"
          title="Source consistency and provenance audit"
        >
          <div
            className="relationship-meta"
            aria-label="Source consistency provenance audit operator checkpoint"
          >
            <span>Provider switch ORBIT_SOURCE_PROVENANCE_AUDIT_PROVIDER</span>
            <span>Live notes {liveImplementationNotesPath}</span>
            <span>{successResult.data.provenance.sourceLabel}</span>
          </div>
          <p>{successResult.data.summary}</p>
          <p className="audit-status-note" role="status">
            Audit result: completed with{" "}
            {findingCount === 0 ? "zero" : findingCount} active {findingLabel}.
          </p>
          <BoundaryMatrix provenance={successResult.data.provenance} />
        </WorkbenchSurface>

        <WorkbenchSurface eyebrow="Success state" title="Audited collections">
          <div className="workbench-grid audit-collection-grid">
            {successResult.data.auditedCollections.map((collection) => (
              <CollectionCard
                collection={collection}
                key={collection.entityKind}
              />
            ))}
          </div>
        </WorkbenchSurface>

        <WorkbenchSurface eyebrow="Findings" title="Audit findings">
          <FindingList findings={successResult.data.findings} />
        </WorkbenchSurface>

        <WorkbenchSurface eyebrow="Run output" title="Rule-based run">
          <div className="workbench-grid audit-state-matrix">
            <div>
              <h3>{runResult.data.runId}</h3>
              <p>evaluated {runResult.data.evaluatedRecordCount} records</p>
              <p>active findings {runResult.data.activeFindingCount}</p>
              <p>
                compliance report persisted{" "}
                <code>{String(runResult.data.complianceReportPersisted)}</code>
              </p>
              <p>
                production audit storage written{" "}
                <code>{String(runResult.data.productionAuditStorageWritten)}</code>
              </p>
              <EvidenceChips evidenceIds={runResult.data.generatedFindingIds} />
            </div>
          </div>
        </WorkbenchSurface>

        <WorkbenchSurface eyebrow="State matrix" title="Probe states">
          <div className="workbench-grid audit-state-matrix">
            <StateCard label="Success state" payload={successResult.data} />
            <StateCard label="Empty state" payload={emptyResult.data} />
            <StateCard label="Pending state" payload={pendingResult.data} />
            <div>
              <h3>Failure state</h3>
              {failureResult.success === false ? (
                <>
                  <p>
                    <code>{failureResult.error.code}</code>
                  </p>
                  <p>{failureResult.error.message}</p>
                  <EvidenceChips evidenceIds={failureResult.error.evidenceIds} />
                </>
              ) : null}
            </div>
          </div>
        </WorkbenchSurface>

        <WorkbenchSurface eyebrow="API probes" title="Declared evidence surfaces">
          <ApiProbeList />
        </WorkbenchSurface>

        <WorkbenchSurface
          eyebrow="Scenario controls"
          title="Exercise API states"
        >
          <ScenarioControls />
        </WorkbenchSurface>

        <WorkbenchSurface eyebrow="Live handoff" title="Mock-to-live path">
          <p>
            Live implementation notes: <code>{liveImplementationNotesPath}</code>
          </p>
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
