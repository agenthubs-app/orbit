import {
  Chip,
  WorkbenchFrame,
  WorkbenchSurface,
} from "../../../shared/ui/primitives";
import type {
  IndustryDistributionBucket,
  NetworkDistributionAnalyticsPayload,
  NetworkDistributionAnalyticsProvenance,
  NetworkDistributionAnalyticsSourceReference,
  NetworkGapAnalysisItem,
  NetworkGapAnalysisPayload,
  RelationshipStrengthDistributionBucket,
  ValueTypeDistributionBucket,
} from "../distribution-contract";
import { createMockNetworkDistributionAnalyticsService } from "../mock-distribution-service";

export const NETWORK_DISTRIBUTION_ANALYTICS_MOCK_SLUG =
  "network-distribution-analytics-mock";

const liveImplementationNotesPath =
  "features/dashboard/network-distribution-analytics-mock/LIVE_IMPLEMENTATION.md";
const pathWrapStyle = { overflowWrap: "anywhere" } as const;
const responsiveWorkbenchStyles = `
.network-distribution-analytics-workbench {
  grid-template-columns: minmax(0, 1fr);
  overflow-x: clip;
}

.network-distribution-analytics-workbench .workbench-shell,
.network-distribution-analytics-workbench .workbench-surface,
.network-distribution-analytics-workbench .workbench-grid,
.network-distribution-analytics-workbench .relationship-meta,
.network-distribution-analytics-workbench .chip-row,
.network-distribution-analytics-workbench .network-distribution-grid,
.network-distribution-analytics-workbench .network-gap-grid,
.network-distribution-analytics-workbench .network-state-matrix,
.network-distribution-analytics-workbench .network-boundary-grid {
  min-width: 0;
}

.network-distribution-analytics-workbench code,
.network-distribution-analytics-workbench dd,
.network-distribution-analytics-workbench .orbit-chip,
.network-distribution-analytics-workbench .source-list li {
  overflow-wrap: anywhere;
}

.network-distribution-analytics-workbench .network-distribution-grid,
.network-distribution-analytics-workbench .network-gap-grid,
.network-distribution-analytics-workbench .network-state-matrix,
.network-distribution-analytics-workbench .network-boundary-grid {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 190px), 1fr));
}

.network-distribution-analytics-workbench .network-distribution-card,
.network-distribution-analytics-workbench .network-gap-card,
.network-distribution-analytics-workbench .network-state-matrix div,
.network-distribution-analytics-workbench .network-boundary-grid div {
  background: var(--orbit-color-surface);
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  padding: var(--orbit-space-sm);
}

.network-distribution-analytics-workbench .network-distribution-card strong,
.network-distribution-analytics-workbench .network-gap-card strong {
  display: block;
  font-size: 1.85rem;
  line-height: 1;
}

.network-distribution-analytics-workbench .network-gap-card {
  border-left: 3px solid var(--orbit-color-evidence);
}

.network-distribution-analytics-workbench .source-list {
  display: grid;
  gap: 6px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.network-distribution-analytics-workbench .source-list li {
  color: var(--orbit-color-muted);
  font-size: 0.82rem;
  line-height: 1.45;
}

.network-distribution-analytics-workbench .source-list .source-label {
  color: var(--orbit-color-text);
  display: block;
  font-weight: 700;
}
`;

const networkDistributionApiProbes = [
  {
    label: "Network distributions",
    command: "GET /api/dashboard/distributions",
    expectedStatus: 200,
    expectation:
      "Expect 200 success envelope with industry, value type, and relationship strength distributions.",
  },
  {
    label: "Network gaps",
    command: "GET /api/dashboard/network-gaps",
    expectedStatus: 200,
    expectation:
      "Expect 200 success envelope with rule-based network gap analysis.",
  },
  {
    label: "Empty distributions",
    command: "GET /api/dashboard/distributions?scenario=empty",
    expectedStatus: 200,
    expectation:
      "Expect 200 empty envelope when no sourced relationships are available.",
  },
  {
    label: "Pending gaps",
    command: "GET /api/dashboard/network-gaps?scenario=pending",
    expectedStatus: 200,
    expectation:
      "Expect 200 pending envelope while the local fixture refresh is unresolved.",
  },
  {
    label: "Controlled failure",
    command: "GET /api/dashboard/network-gaps?scenario=failure",
    expectedStatus: 503,
    expectation:
      "Expect 503 failure envelope with NETWORK_DISTRIBUTION_ANALYTICS_MOCK_FAILED context.",
  },
] as const;

const liveHandoffEvidenceExcerpts = [
  "Live files live under features/dashboard/network-distribution-analytics-mock/.",
  "ORBIT_NETWORK_DISTRIBUTION_ANALYTICS_PROVIDER switches mock fixtures to live providers.",
  "Live providers replace fixture buckets with approved graph algorithms, embedding indexes, analytics jobs, and database reads.",
  "Privacy and provenance stay attached to every distribution bucket and gap recommendation.",
  "replacement tests cover success, empty, pending, controlled failure, and mock provider guards.",
] as const;

function EvidenceChips({ evidenceIds }: { evidenceIds: readonly string[] }) {
  return (
    <div className="chip-row" aria-label="Network distribution evidence ids">
      {evidenceIds.map((evidenceId) => (
        <Chip key={evidenceId} tone="evidence">
          {evidenceId}
        </Chip>
      ))}
    </div>
  );
}

function SourceReferences({
  sourceRefs,
}: {
  sourceRefs: readonly NetworkDistributionAnalyticsSourceReference[];
}) {
  return (
    <ul
      className="source-list"
      aria-label="Network distribution analytics source references"
    >
      {sourceRefs.map((sourceRef) => (
        <li key={sourceRef.id}>
          <span className="source-label">{sourceRef.label}</span>
          source type <code>{sourceRef.type}</code>; provider record{" "}
          <code>{sourceRef.providerRecordId}</code>
        </li>
      ))}
    </ul>
  );
}

function IndustryDistribution({
  buckets,
}: {
  buckets: readonly IndustryDistributionBucket[];
}) {
  return (
    <div
      aria-label="Industry distribution"
      className="workbench-grid network-distribution-grid"
    >
      {buckets.map((bucket) => (
        <article className="network-distribution-card" key={bucket.bucketId}>
          <span className="type-caption">{bucket.label}</span>
          <strong>{bucket.contactCount}</strong>
          <p className="type-body">{bucket.percentage}% of sourced contacts</p>
          <p className="privacy-note">
            {bucket.topOrganizations.join(", ")}
          </p>
          <SourceReferences sourceRefs={bucket.sourceRefs} />
          <EvidenceChips evidenceIds={bucket.evidenceIds} />
        </article>
      ))}
    </div>
  );
}

function ValueTypeDistribution({
  buckets,
}: {
  buckets: readonly ValueTypeDistributionBucket[];
}) {
  return (
    <dl className="relationship-meta" aria-label="Value type distribution">
      {buckets.map((bucket) => (
        <div key={bucket.valueType}>
          <dt>{bucket.label}</dt>
          <dd>
            {bucket.relationshipCount} relationships, {bucket.percentage}% of
            the fixture. Evidence <code>{bucket.evidenceIds.join(", ")}</code>.
          </dd>
        </div>
      ))}
    </dl>
  );
}

function StrengthDistribution({
  buckets,
}: {
  buckets: readonly RelationshipStrengthDistributionBucket[];
}) {
  return (
    <dl
      className="relationship-meta"
      aria-label="Relationship strength distribution"
    >
      {buckets.map((bucket) => (
        <div key={bucket.strength}>
          <dt>
            {bucket.strength} <code>{bucket.followupRisk} risk</code>
          </dt>
          <dd>
            {bucket.relationshipCount} relationships, {bucket.percentage}% of
            the fixture.
          </dd>
        </div>
      ))}
    </dl>
  );
}

function NetworkGapCards({ gaps }: { gaps: readonly NetworkGapAnalysisItem[] }) {
  return (
    <div aria-label="Network gap analysis" className="workbench-grid network-gap-grid">
      {gaps.map((gap) => (
        <article className="network-gap-card" key={gap.gapId}>
          <span className="type-caption">{gap.severity} severity</span>
          <h3 className="relationship-name">{gap.label}</h3>
          <strong>
            {gap.currentCount}/{gap.targetCount}
          </strong>
          <p className="type-body">{gap.recommendedAction}</p>
          <EvidenceChips evidenceIds={gap.evidenceIds} />
        </article>
      ))}
    </div>
  );
}

function MockOnlyExecutionChecks({
  provenance,
}: {
  provenance: NetworkDistributionAnalyticsProvenance;
}) {
  return (
    <dl
      className="relationship-meta network-boundary-grid"
      aria-label="Network distribution analytics mock-only execution checks"
    >
      <div>
        <dt>Graph boundary</dt>
        <dd>graph algorithms {String(provenance.graphAlgorithmExecuted)}</dd>
      </div>
      <div>
        <dt>Embedding boundary</dt>
        <dd>embedding search {String(provenance.embeddingSearchExecuted)}</dd>
      </div>
      <div>
        <dt>Analytics jobs</dt>
        <dd>live analytics jobs {String(provenance.liveAnalyticsJobExecuted)}</dd>
      </div>
      <div>
        <dt>External network</dt>
        <dd>external network requested {String(provenance.externalNetworkRequested)}</dd>
      </div>
      <div>
        <dt>Database reads</dt>
        <dd>database reads {String(provenance.databaseReadExecuted)}</dd>
      </div>
      <div>
        <dt>Database writes</dt>
        <dd>database writes {String(provenance.databaseWriteExecuted)}</dd>
      </div>
      <div>
        <dt>AI provider</dt>
        <dd>AI provider requested {String(provenance.aiProviderRequested)}</dd>
      </div>
      <div>
        <dt>Email and calendar</dt>
        <dd>
          email {String(provenance.emailProviderRequested)}; calendar{" "}
          {String(provenance.calendarProviderRequested)}
        </dd>
      </div>
      <div>
        <dt>Notifications</dt>
        <dd>
          notification provider requested{" "}
          {String(provenance.notificationProviderRequested)}
        </dd>
      </div>
      <div>
        <dt>Device APIs</dt>
        <dd>device requested {String(provenance.deviceRequested)}</dd>
      </div>
    </dl>
  );
}

function OperatorCheckpoint({
  distributions,
  gaps,
}: {
  distributions: NetworkDistributionAnalyticsPayload;
  gaps: NetworkGapAnalysisPayload;
}) {
  return (
    <WorkbenchSurface
      elevated
      eyebrow="Operator checkpoint"
      title="Network analytics stays mock-only"
    >
      <p className="type-body">
        Scan this first: the capability buckets relationship context by
        industry, value type, and relationship strength, then applies local
        fixture rules to produce network gap recommendations.
      </p>
      <dl
        aria-label="Network distribution analytics operator checkpoint"
        className="relationship-meta network-boundary-grid"
      >
        <div>
          <dt>State</dt>
          <dd>
            <code>{distributions.state}</code>
          </dd>
        </div>
        <div>
          <dt>Industries</dt>
          <dd>{distributions.industryDistribution.length} buckets</dd>
        </div>
        <div>
          <dt>Gap coverage</dt>
          <dd>{gaps.coverageScore} score</dd>
        </div>
        <div>
          <dt>Gap recommendations</dt>
          <dd>{gaps.gaps.length} local rules</dd>
        </div>
      </dl>
      <EvidenceChips evidenceIds={distributions.provenance.evidenceIds} />
    </WorkbenchSurface>
  );
}

function StateMatrix({
  empty,
  failureCode,
  gaps,
  pending,
  success,
}: {
  empty: NetworkDistributionAnalyticsPayload;
  failureCode: string;
  gaps: NetworkGapAnalysisPayload;
  pending: NetworkGapAnalysisPayload;
  success: NetworkDistributionAnalyticsPayload;
}) {
  return (
    <WorkbenchSurface eyebrow="State matrix" title="Harness-visible states">
      <dl
        aria-label="Network distribution analytics state matrix"
        className="relationship-meta network-state-matrix"
      >
        <div>
          <dt>Success state</dt>
          <dd>
            Success: {success.industryDistribution.length} industry buckets and{" "}
            {gaps.gaps.length} gap recommendations
          </dd>
        </div>
        <div>
          <dt>Empty state</dt>
          <dd>Empty: {empty.summary}</dd>
        </div>
        <div>
          <dt>Pending state</dt>
          <dd>Pending: {pending.nextAction}</dd>
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
        use a service-unavailable envelope.
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

export function NetworkDistributionAnalyticsMockDemo() {
  const analyticsService = createMockNetworkDistributionAnalyticsService();
  const distributionResult = analyticsService.getDistributions();
  const gapResult = analyticsService.getNetworkGaps();
  const emptyResult = analyticsService.getDistributions({ scenario: "empty" });
  const pendingResult = analyticsService.getNetworkGaps({
    scenario: "pending",
  });
  const failureResult = analyticsService.getNetworkGaps({
    scenario: "failure",
  });

  if (
    distributionResult.success === false ||
    gapResult.success === false ||
    emptyResult.success === false ||
    pendingResult.success === false
  ) {
    return (
      <WorkbenchFrame className="network-distribution-analytics-workbench">
        <div className="workbench-shell">
          <header className="workbench-header">
            <p className="workbench-kicker">Developer capability runtime</p>
            <h1>Network distribution analytics mock</h1>
            <p className="workbench-intro">
              The deterministic network distribution analytics fixtures did not
              load, so this dev surface stopped inside a controlled local state.
            </p>
          </header>
        </div>
      </WorkbenchFrame>
    );
  }

  const failureCode =
    failureResult.success === false
      ? failureResult.error.code
      : "NETWORK_DISTRIBUTION_ANALYTICS_MOCK_FAILED";

  return (
    <WorkbenchFrame className="network-distribution-analytics-workbench">
      <style>{responsiveWorkbenchStyles}</style>
      <div className="workbench-shell">
        <header className="workbench-header">
          <p className="workbench-kicker">Developer capability runtime</p>
          <h1>Network distribution analytics mock</h1>
          <p className="workbench-intro">
            Dev-only surface for verifying the network distribution analytics
            boundary. The page reads the mock service for success, empty,
            pending, and failure states before graph analytics or live providers
            exist.
          </p>
        </header>

        <OperatorCheckpoint
          distributions={distributionResult.data}
          gaps={gapResult.data}
        />

        <section
          className="workbench-grid"
          aria-label="Network distribution analytics capability details"
        >
          <WorkbenchSurface
            elevated
            eyebrow={NETWORK_DISTRIBUTION_ANALYTICS_MOCK_SLUG}
            title="Industry distribution"
          >
            <p className="type-body">{distributionResult.data.summary}</p>
            <IndustryDistribution
              buckets={distributionResult.data.industryDistribution}
            />
          </WorkbenchSurface>

          <WorkbenchSurface eyebrow="Mock-only checks" title="Provider boundaries">
            <MockOnlyExecutionChecks
              provenance={distributionResult.data.provenance}
            />
            <p className="privacy-note">
              Distribution analytics stay local until the documented provider
              switch and replacement tests are added.
            </p>
          </WorkbenchSurface>
        </section>

        <section
          className="workbench-grid"
          aria-label="Network distribution analytics bucket details"
        >
          <WorkbenchSurface eyebrow="Relationship value" title="Value type distribution">
            <ValueTypeDistribution
              buckets={distributionResult.data.valueTypeDistribution}
            />
          </WorkbenchSurface>

          <WorkbenchSurface eyebrow="Relationship health" title="Relationship strength distribution">
            <StrengthDistribution
              buckets={distributionResult.data.relationshipStrengthDistribution}
            />
          </WorkbenchSurface>
        </section>

        <WorkbenchSurface
          eyebrow="Gap rules"
          title="Network gap analysis"
        >
          <p className="type-body">{gapResult.data.summary}</p>
          <NetworkGapCards gaps={gapResult.data.gaps} />
        </WorkbenchSurface>

        <StateMatrix
          empty={emptyResult.data}
          failureCode={failureCode}
          gaps={gapResult.data}
          pending={pendingResult.data}
          success={distributionResult.data}
        />

        <WorkbenchSurface
          eyebrow="API exercise surface"
          title="Declared probes"
        >
          <dl
            className="relationship-meta"
            aria-label="Network distribution analytics API probe details"
          >
            {networkDistributionApiProbes.map((probe) => (
              <div key={probe.command}>
                <dt>{probe.label}</dt>
                <dd>
                  <code style={pathWrapStyle}>{probe.command}</code> returns{" "}
                  {probe.expectedStatus}. {probe.expectation}
                </dd>
              </div>
            ))}
          </dl>
        </WorkbenchSurface>

        <WorkbenchSurface
          eyebrow="Mock-to-live handoff"
          title="Replacement notes"
        >
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
                <code>ORBIT_NETWORK_DISTRIBUTION_ANALYTICS_PROVIDER</code>{" "}
                remains documented before live network analytics providers are
                wired.
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
