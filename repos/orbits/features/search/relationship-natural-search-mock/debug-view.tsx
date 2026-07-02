/**
 * 自然语言关系搜索 mock 的开发者面板。
 *
 * 这里展示自然语言 query、可用筛选器、搜索结果和 provenance，不访问真实搜索索引。
 */
import {
  Chip,
  Field,
  WorkbenchFrame,
  WorkbenchSurface,
} from "../../../shared/ui/primitives";
import type {
  RelationshipNaturalSearchPayload,
  RelationshipNaturalSearchProvenance,
  RelationshipNaturalSearchResult,
  RelationshipNaturalSearchResultItem,
  RelationshipNaturalSearchSuggestionsResult,
} from "../contract";
import { createMockRelationshipNaturalSearchService } from "../mock-service";
import type { RelationshipNaturalSearchServiceResult } from "../service";

export const RELATIONSHIP_NATURAL_SEARCH_MOCK_SLUG =
  "relationship-natural-search-mock";

const liveImplementationNotesPath =
  "features/search/relationship-natural-search-mock/LIVE_IMPLEMENTATION.md";
const pathWrapStyle = { overflowWrap: "anywhere" } as const;
const responsiveWorkbenchStyles = `
.relationship-natural-search-workbench {
  grid-template-columns: minmax(0, 1fr);
  overflow-x: clip;
}

.relationship-natural-search-workbench .workbench-shell,
.relationship-natural-search-workbench .workbench-surface,
.relationship-natural-search-workbench .workbench-grid,
.relationship-natural-search-workbench .relationship-meta,
.relationship-natural-search-workbench .control-stack,
.relationship-natural-search-workbench .chip-row,
.relationship-natural-search-workbench .button-row,
.relationship-natural-search-workbench form {
  min-width: 0;
}

.relationship-natural-search-workbench input,
.relationship-natural-search-workbench select {
  max-width: 100%;
  min-width: 0;
  width: 100%;
}

.relationship-natural-search-workbench code,
.relationship-natural-search-workbench dd,
.relationship-natural-search-workbench .orbit-chip {
  overflow-wrap: anywhere;
}

.relationship-natural-search-workbench .relationship-result-list {
  display: grid;
  gap: var(--orbit-space-md);
}

.relationship-natural-search-workbench .relationship-result-card {
  border-top: 1px solid var(--orbit-color-border);
  min-width: 0;
  padding-top: var(--orbit-space-md);
}

.relationship-natural-search-workbench .relationship-result-card:first-child {
  border-top: 0;
  padding-top: 0;
}

.relationship-natural-search-workbench .relationship-state-card {
  position: relative;
}

.relationship-natural-search-workbench .relationship-state-pending {
  border-color: var(--orbit-color-primary);
}

.relationship-natural-search-workbench .relationship-state-pending::before {
  background: var(--orbit-color-primary);
  border-radius: var(--orbit-radius-control);
  content: "";
  inset: var(--orbit-space-sm) auto var(--orbit-space-sm) 0;
  position: absolute;
  width: 4px;
}

.relationship-natural-search-workbench .relationship-pending-diagnosis {
  background: var(--orbit-color-accent-soft);
  border-left: 3px solid var(--orbit-color-primary);
  border-radius: var(--orbit-radius-control);
  padding: var(--orbit-space-sm);
}
`;

function requireSyncRelationshipNaturalSearchResult<TResult>(
  result: RelationshipNaturalSearchServiceResult<TResult>,
): TResult {
  const maybePromise = result as { then?: unknown };

  if (typeof maybePromise.then === "function") {
    throw new Error(
      "Relationship natural search mock debug view requires a synchronous service.",
    );
  }

  return result as TResult;
}

const apiProbes = [
  {
    label: "Relationship search",
    command: "POST /api/search/relationships",
    expectedStatus: 200,
    expectation:
      "Expect 200 success envelope with locally filtered relationship results.",
  },
  {
    label: "Search suggestions",
    command: "GET /api/search/suggestions",
    expectedStatus: 200,
    expectation:
      "Expect 200 success envelope with supported mock search prompts.",
  },
  {
    label: "Empty search",
    command: "POST /api/search/relationships?scenario=empty",
    expectedStatus: 200,
    expectation: "Expect 200 empty envelope with no relationship results.",
  },
  {
    label: "Controlled failure",
    command: "POST /api/search/relationships?scenario=failure",
    expectedStatus: 503,
    expectation:
      "Expect 503 failure envelope with RELATIONSHIP_NATURAL_SEARCH_MOCK_FAILED context.",
  },
] as const;

function EvidenceChips({ evidenceIds }: { evidenceIds: readonly string[] }) {
  return (
    <div className="chip-row" aria-label="Relationship natural search evidence">
      {evidenceIds.map((evidenceId) => (
        <Chip key={evidenceId} tone="evidence">
          {evidenceId}
        </Chip>
      ))}
    </div>
  );
}

function MockOnlyExecutionChecks({
  provenance,
  results,
}: {
  provenance: RelationshipNaturalSearchProvenance;
  results: readonly RelationshipNaturalSearchResultItem[];
}) {
  const semanticSearch =
    provenance.semanticSearchExecuted === false &&
    results.every((result) => result.semanticSearchExecuted === false)
      ? "false"
      : "unexpected true";
  const embeddings =
    provenance.embeddingsGenerated === false &&
    results.every((result) => result.embeddingGenerated === false)
      ? "false"
      : "unexpected true";
  const crossProviderIndex =
    provenance.crossProviderIndexQueried === false &&
    results.every((result) => result.crossProviderIndexQueried === false)
      ? "false"
      : "unexpected true";

  return (
    <dl
      aria-label="Relationship natural search mock-only execution checks"
      className="relationship-meta"
    >
      <div>
        <dt>Semantic search</dt>
        <dd>semantic search executed: {semanticSearch}</dd>
      </div>
      <div>
        <dt>Embeddings</dt>
        <dd>embeddings generated: {embeddings}</dd>
      </div>
      <div>
        <dt>Cross-provider index</dt>
        <dd>cross-provider index queried: {crossProviderIndex}</dd>
      </div>
    </dl>
  );
}

function ResultList({
  results,
}: {
  results: readonly RelationshipNaturalSearchResultItem[];
}) {
  return (
    <div className="relationship-result-list">
      {results.map((result) => (
        <article
          aria-label={`Relationship natural search result for ${result.displayName}`}
          className="relationship-record relationship-result-card"
          key={result.id}
        >
          <header>
            <p className="type-caption">
              {result.role} at {result.organization}
            </p>
            <h3 className="relationship-name">{result.displayName}</h3>
            <p className="type-caption">{result.industry}</p>
          </header>
          <dl className="relationship-meta">
            <div>
              <dt>Why this connection exists</dt>
              <dd>{result.relationshipContext}</dd>
            </div>
            <div>
              <dt>Intent match</dt>
              <dd>{result.matchedBusinessIntents.join(", ")}</dd>
            </div>
            <div>
              <dt>Source</dt>
              <dd>
                {result.source.type}: {result.source.label}
              </dd>
            </div>
            <div>
              <dt>Follow-up</dt>
              <dd>{result.followUpStatus}</dd>
            </div>
            <div>
              <dt>Next action</dt>
              <dd>{result.recommendedAction}</dd>
            </div>
          </dl>
          <EvidenceChips
            evidenceIds={result.evidence.map((evidence) => evidence.evidenceId)}
          />
        </article>
      ))}
    </div>
  );
}

function SearchPanel() {
  return (
    <WorkbenchSurface
      elevated
      eyebrow="Relationship workspace"
      title="Ask for the relationship you need"
    >
      <p className="type-body">
        The form targets the same mock API route that evaluator probes call.
        Query and filters are resolved by local fixture rules only.
      </p>
      <form
        action="/api/search/relationships"
        aria-label="Mock relationship natural search form"
        className="control-stack"
        method="post"
      >
        <Field label="Natural query" helper="Local fixture rules only.">
          <input
            name="query"
            placeholder="Try pilot operator intro"
            type="search"
          />
        </Field>
        <Field label="Business intent" helper="Contract-defined intents.">
          <select name="businessIntent" defaultValue="">
            <option value="">Any intent</option>
            <option value="find_warm_intro">Find warm intro</option>
            <option value="explore_partnership">Explore partnership</option>
            <option value="recover_event_follow_up">
              Recover event follow-up
            </option>
            <option value="source_customer_reference">
              Source customer reference
            </option>
          </select>
        </Field>
        <Field label="Industry" helper="No live index is queried.">
          <select name="industry" defaultValue="">
            <option value="">Any industry</option>
            <option value="climate">Climate</option>
            <option value="fintech">Fintech</option>
            <option value="enterprise_saas">Enterprise SaaS</option>
          </select>
        </Field>
        <button className="primary-action" type="submit">
          Search relationships
        </button>
      </form>
      <div className="chip-row" aria-label="Relationship natural search guardrails">
        <Chip tone="evidence">source evidence</Chip>
        <Chip tone="privacy">mock-only search</Chip>
        <Chip tone="confirmation">follow-up context</Chip>
      </div>
    </WorkbenchSurface>
  );
}

function ApiProbeActions() {
  return (
    <div
      aria-label="Relationship natural search API probe actions"
      className="control-stack"
    >
      <p className="type-body">
        These probes exercise success, empty, suggestions, and controlled
        failure paths inside the relationship natural search mock boundary.
      </p>
      <div className="button-row">
        <form
          action="/api/search/suggestions"
          aria-label="Run relationship natural search suggestions probe"
          method="get"
        >
          <button className="secondary-action" type="submit">
            Run suggestions probe
          </button>
        </form>
        <form
          action="/api/search/relationships?scenario=empty"
          aria-label="Run empty relationship natural search probe"
          method="post"
        >
          <button className="secondary-action" type="submit">
            Run empty probe
          </button>
        </form>
        <form
          action="/api/search/relationships?scenario=failure"
          aria-label="Run controlled failure relationship natural search probe"
          method="post"
        >
          <button className="secondary-action" type="submit">
            Run controlled failure probe
          </button>
        </form>
      </div>
    </div>
  );
}

function StateSurface({
  payload,
  title,
}: {
  payload: RelationshipNaturalSearchPayload;
  title: string;
}) {
  return (
    <WorkbenchSurface
      className={`relationship-state-card relationship-state-${payload.state}`}
      elevated={title === "Success state"}
      eyebrow={RELATIONSHIP_NATURAL_SEARCH_MOCK_SLUG}
      title={title}
    >
      <p className="type-body">{payload.summary}</p>
      <dl className="relationship-meta">
        <div>
          <dt>State</dt>
          <dd>{payload.state}</dd>
        </div>
        <div>
          <dt>Results</dt>
          <dd>{payload.results.length}</dd>
        </div>
        <div>
          <dt>Next action</dt>
          <dd>{payload.nextAction}</dd>
        </div>
      </dl>
      {payload.state === "pending" && (
        <dl
          aria-label="Pending state diagnosis"
          className="relationship-meta relationship-pending-diagnosis"
        >
          <div>
            <dt>Pending state diagnosis</dt>
            <dd>
              Fixture review pending; the mock boundary is intentionally holding
              relationship results while live search, embeddings, and external
              indexes remain off.
            </dd>
          </div>
        </dl>
      )}
      <MockOnlyExecutionChecks
        provenance={payload.provenance}
        results={payload.results}
      />
      {payload.results.length > 0 && <ResultList results={payload.results} />}
    </WorkbenchSurface>
  );
}

export function RelationshipNaturalSearchMockDemo() {
  const searchService = createMockRelationshipNaturalSearchService();
  const successState =
    requireSyncRelationshipNaturalSearchResult<RelationshipNaturalSearchResult>(
      searchService.queryRelationships(),
    );
  const filteredState =
    requireSyncRelationshipNaturalSearchResult<RelationshipNaturalSearchResult>(
      searchService.queryRelationships({
        businessIntent: "find_warm_intro",
        industryFilters: ["climate"],
        query: "pilot operator intro",
      }),
    );
  const emptyState =
    requireSyncRelationshipNaturalSearchResult<RelationshipNaturalSearchResult>(
      searchService.queryRelationships({ scenario: "empty" }),
    );
  const pendingState =
    requireSyncRelationshipNaturalSearchResult<RelationshipNaturalSearchResult>(
      searchService.queryRelationships({ scenario: "pending" }),
    );
  const failureState =
    requireSyncRelationshipNaturalSearchResult<RelationshipNaturalSearchResult>(
      searchService.queryRelationships({ scenario: "failure" }),
    );
  const suggestionsState =
    requireSyncRelationshipNaturalSearchResult<RelationshipNaturalSearchSuggestionsResult>(
      searchService.getSearchSuggestions(),
    );
  const successPayload = successState.success ? successState.data : null;
  const filteredPayload = filteredState.success ? filteredState.data : null;
  const emptyPayload = emptyState.success ? emptyState.data : null;
  const pendingPayload = pendingState.success ? pendingState.data : null;
  const failureError =
    failureState.success === false ? failureState.error : null;
  const suggestionsPayload = suggestionsState.success
    ? suggestionsState.data
    : null;

  return (
    <WorkbenchFrame className="relationship-natural-search-workbench">
      <style>{responsiveWorkbenchStyles}</style>
      <div className="workbench-shell">
        <header className="workbench-header">
          <p className="workbench-kicker">Developer capability runtime</p>
          <h1>Relationship natural search mock</h1>
          <p className="workbench-intro">
            Mock-first boundary for asking who Orbit knows by business intent,
            industry, source, value type, and follow-up status while every
            source and recommendation remains tied to fixture evidence.
          </p>
        </header>

        <SearchPanel />

        <section
          aria-label="Relationship natural search mock states"
          className="workbench-grid"
        >
          {successPayload && (
            <StateSurface payload={successPayload} title="Success state" />
          )}
          {emptyPayload && (
            <StateSurface payload={emptyPayload} title="Empty state" />
          )}
          {pendingPayload && (
            <StateSurface payload={pendingPayload} title="Pending state" />
          )}
          <WorkbenchSurface
            eyebrow={RELATIONSHIP_NATURAL_SEARCH_MOCK_SLUG}
            title="Failure state"
          >
            {failureError && (
              <>
                <p className="type-body">{failureError.message}</p>
                <dl className="relationship-meta">
                  <div>
                    <dt>Error code</dt>
                    <dd>{failureError.code}</dd>
                  </div>
                  <div>
                    <dt>Recovery</dt>
                    <dd>{failureError.recovery}</dd>
                  </div>
                  <div>
                    <dt>Evidence</dt>
                    <dd>{failureError.evidenceIds.join(", ")}</dd>
                  </div>
                </dl>
              </>
            )}
          </WorkbenchSurface>
        </section>

        {filteredPayload && (
          <WorkbenchSurface
            eyebrow="Rule-based fixture query"
            title="Business intent filter preview"
          >
            <p className="type-body">{filteredPayload.summary}</p>
            <ResultList results={filteredPayload.results} />
          </WorkbenchSurface>
        )}

        <WorkbenchSurface eyebrow="Search suggestions" title="Prompt starters">
          {suggestionsPayload && (
            <dl className="relationship-meta">
              {suggestionsPayload.suggestions.map((suggestion) => (
                <div key={suggestion.id}>
                  <dt>{suggestion.query}</dt>
                  <dd>
                    {suggestion.businessIntent}. {suggestion.evidenceHint}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </WorkbenchSurface>

        <WorkbenchSurface eyebrow="API exercise surface" title="Declared probes">
          <dl className="relationship-meta">
            {apiProbes.map((probe) => (
              <div key={probe.command}>
                <dt>{probe.label}</dt>
                <dd>
                  <code>{probe.command}</code> expects {probe.expectedStatus}.{" "}
                  {probe.expectation}
                </dd>
              </div>
            ))}
          </dl>
          <ApiProbeActions />
        </WorkbenchSurface>

        <WorkbenchSurface
          eyebrow="Mock-to-live handoff"
          title="Replacement notes stay with the capability"
        >
          <dl className="relationship-meta">
            <div>
              <dt>Handoff doc</dt>
              <dd>
                <code style={pathWrapStyle}>{liveImplementationNotesPath}</code>
              </dd>
            </div>
            <div>
              <dt>Required coverage</dt>
              <dd>
                Live service/provider files, switch mechanism, required env
                vars and permissions, privacy and provenance constraints, and
                replacement tests are documented before live search is wired.
              </dd>
            </div>
          </dl>
        </WorkbenchSurface>
      </div>
    </WorkbenchFrame>
  );
}
