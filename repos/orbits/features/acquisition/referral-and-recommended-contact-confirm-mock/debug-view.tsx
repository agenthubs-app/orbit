import {
  Chip,
  Field,
  WorkbenchFrame,
  WorkbenchSurface,
} from "../../../shared/ui/primitives";
import {
  REFERRAL_RECOMMENDATION_ERROR_DEFINITIONS,
  type RecommendedContact,
  type ReferralContactDraft,
  type ReferralRecommendationPayload,
  type ReferralRecommendationProvenance,
  type ReferralSourceSummary,
} from "../referral-contract";
import { createMockReferralRecommendationService } from "../mock-referral-service";

export const REFERRAL_RECOMMENDATION_MOCK_SLUG =
  "referral-and-recommended-contact-confirm-mock";

const liveImplementationNotesPath =
  "features/acquisition/referral-and-recommended-contact-confirm-mock/LIVE_IMPLEMENTATION.md";
const pathWrapStyle = { overflowWrap: "anywhere" } as const;
const responsiveWorkbenchStyles = `
.referral-recommendation-workbench {
  grid-template-columns: minmax(0, 1fr);
  overflow-x: clip;
}

.referral-recommendation-workbench .workbench-shell,
.referral-recommendation-workbench .workbench-surface,
.referral-recommendation-workbench .workbench-grid,
.referral-recommendation-workbench .relationship-meta,
.referral-recommendation-workbench .control-stack,
.referral-recommendation-workbench .chip-row,
.referral-recommendation-workbench .button-row,
.referral-recommendation-workbench form {
  min-width: 0;
}

.referral-recommendation-workbench input,
.referral-recommendation-workbench select {
  max-width: 100%;
  min-width: 0;
  width: 100%;
}

.referral-recommendation-workbench code,
.referral-recommendation-workbench dd,
.referral-recommendation-workbench .orbit-chip,
.referral-recommendation-workbench .source-list li {
  overflow-wrap: anywhere;
}

.referral-recommendation-workbench .chip-row,
.referral-recommendation-workbench .button-row {
  grid-template-columns: repeat(
    auto-fit,
    minmax(min(100%, 148px), max-content)
  );
}

.referral-recommendation-workbench .operator-checkpoint-grid {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 178px), 1fr));
}

.referral-recommendation-workbench .operator-checkpoint-grid div {
  background: var(--orbit-color-surface);
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  padding: var(--orbit-space-sm);
}
`;

const referralRecommendationApiProbes = [
  {
    label: "Create referral drafts",
    command: "POST /api/contact-drafts/referral",
    expectedStatus: 201,
    expectation:
      "Expect 201 success envelope with referral-backed recommended contact drafts.",
  },
  {
    label: "Confirm recommended contact",
    command:
      "POST /api/contact-drafts/recommended/demo-recommendation-1/confirm",
    expectedStatus: 200,
    expectation:
      "Expect 200 success envelope with a user-confirmed recommended contact.",
  },
  {
    label: "Empty referral source",
    command: "POST /api/contact-drafts/referral?scenario=empty",
    expectedStatus: 200,
    expectation:
      "Expect 200 empty envelope with no recommended contacts or drafts.",
  },
  {
    label: "Pending recommender review",
    command: "POST /api/contact-drafts/referral?scenario=pending",
    expectedStatus: 200,
    expectation:
      "Expect 200 pending envelope while recommender context review waits.",
  },
  {
    label: "Controlled failure",
    command: "POST /api/contact-drafts/referral?scenario=failure",
    expectedStatus: 503,
    expectation:
      "Expect 503 failure envelope with REFERRAL_RECOMMENDATION_MOCK_FAILED context.",
  },
  {
    label: "Blocked confirmation",
    command:
      "POST /api/contact-drafts/recommended/demo-recommendation-1/confirm?scenario=blocked",
    expectedStatus: 403,
    expectation:
      "Expect 403 failure envelope with REFERRAL_RECOMMENDATION_CONFIRMATION_REQUIRED context.",
  },
  {
    label: "Missing recommendation adversarial probe",
    command:
      "POST /api/contact-drafts/recommended/missing-recommendation/confirm",
    expectedStatus: 404,
    expectation:
      "Expect 404 failure envelope with REFERRAL_RECOMMENDATION_NOT_FOUND context.",
  },
] as const;

const liveHandoffEvidenceExcerpts = [
  "Live service files live under features/acquisition/referral-and-recommended-contact-confirm-mock/.",
  "ORBIT_REFERRAL_RECOMMENDATION_PROVIDER switches from mock to live.",
  "Live replacement requires explicit referral source and recommender context permissions.",
  "User confirmation remains required before contact writes or outbound intro actions.",
  "Replacement tests cover source filtering, empty, pending, failure, blocked confirmation, and missing recommendation paths.",
] as const;

function EvidenceChips({ evidenceIds }: { evidenceIds: readonly string[] }) {
  return (
    <div className="chip-row" aria-label="Referral recommendation evidence">
      {evidenceIds.map((evidenceId) => (
        <Chip key={evidenceId} tone="evidence">
          {evidenceId}
        </Chip>
      ))}
    </div>
  );
}

function SourceCoverageChips({
  sources,
}: {
  sources: readonly ReferralSourceSummary[];
}) {
  return (
    <div className="chip-row" aria-label="Referral source coverage">
      {sources.map((source) => (
        <Chip key={source.kind} tone="confirmation">
          {source.label}
        </Chip>
      ))}
    </div>
  );
}

function RecommendationSummary({
  recommendations,
}: {
  recommendations: readonly RecommendedContact[];
}) {
  return (
    <dl className="relationship-meta">
      {recommendations.map((recommendation) => (
        <div key={recommendation.id}>
          <dt>{recommendation.displayName}</dt>
          <dd>
            {recommendation.role} at {recommendation.organization}.{" "}
            {recommendation.recommender.displayName} supplied{" "}
            {recommendation.recommender.relationshipToUser} context.{" "}
            {recommendation.confirmation.required
              ? "confirmation required"
              : "confirmation optional"}
            .
          </dd>
        </div>
      ))}
    </dl>
  );
}

function DraftSummary({ drafts }: { drafts: readonly ReferralContactDraft[] }) {
  return (
    <dl className="relationship-meta">
      {drafts.map((draft) => (
        <div key={draft.id}>
          <dt>{draft.displayName}</dt>
          <dd>
            <code>{draft.id}</code> from <code>{draft.sourceKind}</code>.{" "}
            Recommender: {draft.recommender.displayName}.{" "}
            <code>contactWriteExecuted</code>,{" "}
            <code>externalActionExecuted</code>, and{" "}
            <code>databaseWriteExecuted</code> remain{" "}
            <code>{String(draft.contactWriteExecuted)}</code>.
          </dd>
        </div>
      ))}
    </dl>
  );
}

function MockOnlyExecutionChecks({
  drafts,
  provenance,
}: {
  drafts: readonly ReferralContactDraft[];
  provenance: ReferralRecommendationProvenance;
}) {
  const noContactWrites =
    provenance.databaseWriteExecuted === false &&
    drafts.every((draft) => draft.contactWriteExecuted === false);
  const noExternalActions = drafts.every(
    (draft) => draft.externalActionExecuted === false,
  );
  const noNotifications =
    provenance.notificationDelivered === false &&
    drafts.every((draft) => draft.notificationDelivered === false);

  return (
    <dl
      className="relationship-meta"
      aria-label="Mock referral execution checks"
    >
      <div>
        <dt>Graph discovery</dt>
        <dd>
          multi-hop graph{" "}
          {provenance.multiHopSocialGraphDiscoveryExecuted
            ? "unexpected true"
            : "false"}
        </dd>
      </div>
      <div>
        <dt>Automatic outreach</dt>
        <dd>
          automatic outreach{" "}
          {provenance.automaticFriendOfFriendOutreachExecuted
            ? "unexpected true"
            : "false"}
        </dd>
      </div>
      <div>
        <dt>Provider calls</dt>
        <dd>
          provider calls{" "}
          {provenance.externalNetworkRequested ? "unexpected true" : "false"}
        </dd>
      </div>
      <div>
        <dt>Contact writes</dt>
        <dd>
          <code>{noContactWrites ? "false" : "unexpected true"}</code>
        </dd>
      </div>
      <div>
        <dt>External actions</dt>
        <dd>
          <code>{noExternalActions ? "false" : "unexpected true"}</code>
        </dd>
      </div>
      <div>
        <dt>Notifications</dt>
        <dd>
          <code>{noNotifications ? "false" : "unexpected true"}</code>
        </dd>
      </div>
    </dl>
  );
}

function OperatorCheckpoint({
  payload,
}: {
  payload: ReferralRecommendationPayload;
}) {
  const sourceLabels = payload.referralSources
    .map((source) => source.label)
    .join(", ");
  const graphDiscovery = payload.provenance
    .multiHopSocialGraphDiscoveryExecuted
    ? "unexpected true"
    : "false";
  const outreach = payload.provenance
    .automaticFriendOfFriendOutreachExecuted
    ? "unexpected true"
    : "false";
  const providerCalls = payload.provenance.externalNetworkRequested
    ? "unexpected true"
    : "false";

  return (
    <WorkbenchSurface
      elevated
      eyebrow="Operator checkpoint"
      title="Ready for verifier review"
    >
      <p className="type-body">
        Scan this first: referral sources, recommender context, and recommended
        contacts are deterministic fixture records. User confirmation is shown,
        but live discovery and outreach stay false.
      </p>
      <dl
        aria-label="Referral recommendation operator checkpoint"
        className="relationship-meta operator-checkpoint-grid"
      >
        <div>
          <dt>Referral sources</dt>
          <dd>{sourceLabels}</dd>
        </div>
        <div>
          <dt>Recommended contacts</dt>
          <dd>{payload.recommendations.length} contacts ready for review.</dd>
        </div>
        <div>
          <dt>Mock execution</dt>
          <dd>
            multi-hop graph {graphDiscovery}; automatic outreach {outreach};
            provider calls {providerCalls}.
          </dd>
        </div>
        <div>
          <dt>Confirmation</dt>
          <dd>
            Every recommended contact stays pending until the operator confirms
            it; no contact write or outbound intro runs here.
          </dd>
        </div>
      </dl>
    </WorkbenchSurface>
  );
}

function ReferralInputPanel() {
  return (
    <WorkbenchSurface
      elevated
      eyebrow="Referral source fixture"
      title="Local referral recommendation"
    >
      <p className="type-body">
        This boundary turns explicit recommender fixture context into
        recommended contact drafts without discovering a larger graph or sending
        friend-of-friend outreach.
      </p>
      <form
        action="/api/contact-drafts/referral"
        aria-label="Mock referral recommendation form"
        className="control-stack"
        method="post"
      >
        <Field label="Referral source" helper="The demo route uses local fixtures.">
          <select name="sourceKind" defaultValue="">
            <option value="">All referral sources</option>
            <option value="founder_referral">Founder referral fixture</option>
            <option value="investor_intro">Investor intro fixture</option>
            <option value="community_referral">Community referral fixture</option>
          </select>
        </Field>
        <button className="primary-action" type="submit">
          Stage referral drafts
        </button>
      </form>
      <div
        className="chip-row"
        aria-label="Referral recommendation guardrails"
      >
        <Chip tone="evidence">recommender context</Chip>
        <Chip tone="privacy">no graph discovery</Chip>
        <Chip tone="confirmation">user confirmation required</Chip>
      </div>
    </WorkbenchSurface>
  );
}

function ApiProbeActions() {
  return (
    <div
      className="control-stack"
      aria-label="Referral recommendation API probe actions"
    >
      <p className="type-body">
        These probes exercise draft creation, recommended contact confirmation,
        empty, pending, blocked, not-found, and controlled failure paths.
      </p>
      <div className="button-row">
        <form
          action="/api/contact-drafts/referral"
          aria-label="Run referral recommendation API probe"
          method="post"
        >
          <button className="secondary-action" type="submit">
            Run referral probe
          </button>
        </form>
        <form
          action="/api/contact-drafts/referral?scenario=empty"
          aria-label="Run empty referral recommendation API probe"
          method="post"
        >
          <button className="secondary-action" type="submit">
            Run empty probe
          </button>
        </form>
        <form
          action="/api/contact-drafts/referral?scenario=pending"
          aria-label="Run pending referral recommendation API probe"
          method="post"
        >
          <button className="secondary-action" type="submit">
            Run pending probe
          </button>
        </form>
        <form
          action="/api/contact-drafts/referral?scenario=failure"
          aria-label="Run controlled failure referral recommendation API probe"
          method="post"
        >
          <button className="secondary-action" type="submit">
            Run controlled failure probe
          </button>
        </form>
        <form
          action="/api/contact-drafts/recommended/demo-recommendation-1/confirm?scenario=blocked"
          aria-label="Run blocked recommended contact confirmation probe"
          method="post"
        >
          <button className="secondary-action" type="submit">
            Run blocked probe
          </button>
        </form>
        <form
          action="/api/contact-drafts/recommended/missing-recommendation/confirm"
          aria-label="Run missing recommended contact confirmation probe"
          method="post"
        >
          <button className="secondary-action" type="submit">
            Run not-found probe
          </button>
        </form>
      </div>
    </div>
  );
}

export function ReferralRecommendationMockDemo() {
  const service = createMockReferralRecommendationService();
  const successState = service.createReferralContactDrafts();
  const emptyState = service.createReferralContactDrafts({
    scenario: "empty",
  });
  const pendingState = service.createReferralContactDrafts({
    scenario: "pending",
  });
  const failureState = service.createReferralContactDrafts({
    scenario: "failure",
  });
  const confirmedState = service.confirmRecommendedContact({
    recommendationId: "demo-recommendation-1",
    actorLabel: "Demo operator",
  });
  const blockedState = service.confirmRecommendedContact({
    recommendationId: "demo-recommendation-1",
    scenario: "blocked",
  });
  const missingState = service.confirmRecommendedContact({
    recommendationId: "missing-recommendation",
  });
  const successPayload = successState.success ? successState.data : null;

  return (
    <WorkbenchFrame className="referral-recommendation-workbench">
      <style>{responsiveWorkbenchStyles}</style>
      <div className="workbench-shell">
        <header className="workbench-header">
          <p className="workbench-kicker">Developer capability runtime</p>
          <h1>Referral and recommended contact confirm mock</h1>
          <p className="workbench-intro">
            Mock-first boundary for explicit referral sources, recommender
            context, recommended contacts, and user confirmation before any
            live graph discovery, outreach, persistence, provider, or AI path
            exists.
          </p>
        </header>

        {successPayload && <OperatorCheckpoint payload={successPayload} />}

        <ReferralInputPanel />

        <section
          className="workbench-grid"
          aria-label="Referral recommendation states"
        >
          <WorkbenchSurface
            elevated
            eyebrow={REFERRAL_RECOMMENDATION_MOCK_SLUG}
            title="Success state"
          >
            {successPayload && (
              <>
                <p className="type-body">{successPayload.summary}</p>
                <dl className="relationship-meta">
                  <div>
                    <dt>Referral sources</dt>
                    <dd>
                      {successPayload.referralSources.length} sources represented.
                    </dd>
                  </div>
                  <div>
                    <dt>Recommended contacts</dt>
                    <dd>
                      {successPayload.recommendations.length} contacts ready.
                    </dd>
                  </div>
                  <div>
                    <dt>Drafts staged</dt>
                    <dd>{successPayload.contactDrafts.length} drafts staged.</dd>
                  </div>
                </dl>
                <EvidenceChips
                  evidenceIds={successPayload.provenance.evidenceIds}
                />
              </>
            )}
          </WorkbenchSurface>

          <WorkbenchSurface eyebrow="No referral rows" title="Empty state">
            {emptyState.success && (
              <>
                <p className="type-body">{emptyState.data.nextAction}</p>
                <dl className="relationship-meta">
                  <div>
                    <dt>Recommendations</dt>
                    <dd>No recommended contacts are available for review.</dd>
                  </div>
                  <div>
                    <dt>Drafts</dt>
                    <dd>No referral contact drafts are staged.</dd>
                  </div>
                </dl>
                <EvidenceChips
                  evidenceIds={emptyState.data.provenance.evidenceIds}
                />
              </>
            )}
          </WorkbenchSurface>

          <WorkbenchSurface eyebrow="Recommender review" title="Pending state">
            {pendingState.success && (
              <>
                <p className="type-body">{pendingState.data.summary}</p>
                <dl className="relationship-meta">
                  <div>
                    <dt>Referral status</dt>
                    <dd>
                      <code>{pendingState.data.state}</code>
                    </dd>
                  </div>
                  <div>
                    <dt>Drafts</dt>
                    <dd>Draft staging waits for local recommender review.</dd>
                  </div>
                </dl>
                <EvidenceChips
                  evidenceIds={pendingState.data.provenance.evidenceIds}
                />
              </>
            )}
          </WorkbenchSurface>

          <WorkbenchSurface eyebrow="Controlled failure" title="Failure state">
            {failureState.success === false && (
              <>
                <dl className="relationship-meta">
                  <div>
                    <dt>Error code</dt>
                    <dd>
                      <code>{failureState.error.code}</code>
                    </dd>
                  </div>
                  <div>
                    <dt>Message</dt>
                    <dd>{failureState.error.message}</dd>
                  </div>
                  <div>
                    <dt>Recovery</dt>
                    <dd>{failureState.error.recovery}</dd>
                  </div>
                </dl>
                <EvidenceChips evidenceIds={failureState.error.evidenceIds} />
              </>
            )}
          </WorkbenchSurface>
        </section>

        <WorkbenchSurface
          eyebrow="Recommender context"
          title="Recommendations explain why the contact exists"
        >
          {successPayload && (
            <>
              <p className="type-body">
                Each recommendation carries source, evidence, recommender
                context, warm path, and suggested next action.
              </p>
              <SourceCoverageChips sources={successPayload.referralSources} />
              <RecommendationSummary
                recommendations={successPayload.recommendations}
              />
            </>
          )}
        </WorkbenchSurface>

        <WorkbenchSurface
          eyebrow="Potential contact drafts"
          title="No contact write happens in the mock"
        >
          {successPayload && (
            <>
              <DraftSummary drafts={successPayload.contactDrafts} />
              <p className="privacy-note">
                The mock sets graph discovery, automatic outreach, provider
                calls, device contacts, calendar reads, email reads, contact
                writes, database writes, AI, and notifications to false.
              </p>
              <MockOnlyExecutionChecks
                drafts={successPayload.contactDrafts}
                provenance={successPayload.provenance}
              />
            </>
          )}
        </WorkbenchSurface>

        <WorkbenchSurface
          eyebrow="User confirmation"
          title="User-confirmed recommended contact"
        >
          {confirmedState.success && (
            <>
              <p className="type-body">{confirmedState.data.nextAction}</p>
              <form
                action="/api/contact-drafts/recommended/demo-recommendation-1/confirm"
                aria-label="Confirm mock recommended contact demo-recommendation-1"
                className="control-stack"
                method="post"
              >
                <input
                  name="actorLabel"
                  type="hidden"
                  value="Demo operator"
                />
                <button className="primary-action" type="submit">
                  Confirm recommended contact
                </button>
                <p className="privacy-note">
                  Confirmation returns the mock envelope only; contact writes,
                  external outreach, database writes, and notifications remain
                  false.
                </p>
              </form>
              <dl className="relationship-meta">
                <div>
                  <dt>Confirmed contact</dt>
                  <dd>
                    {confirmedState.data.confirmedContact.displayName} from{" "}
                    {confirmedState.data.confirmedContact.recommender.displayName}
                    's referral.
                  </dd>
                </div>
                <div>
                  <dt>Envelope success</dt>
                  <dd>envelope success true</dd>
                </div>
                <div>
                  <dt>Mock writes</dt>
                  <dd>
                    contact writes{" "}
                    {String(confirmedState.data.contactWriteExecuted)};
                    external actions{" "}
                    {String(confirmedState.data.externalActionExecuted)}.
                  </dd>
                </div>
              </dl>
              <EvidenceChips
                evidenceIds={confirmedState.data.provenance.evidenceIds}
              />
            </>
          )}
          {blockedState.success === false && missingState.success === false && (
            <dl className="relationship-meta">
              <div>
                <dt>Blocked confirmation</dt>
                <dd>
                  <code>{blockedState.error.code}</code> returns envelope
                  success false.
                </dd>
              </div>
              <div>
                <dt>Missing recommendation adversarial probe</dt>
                <dd>
                  <code>{missingState.error.code}</code> returns envelope
                  success false.
                </dd>
              </div>
            </dl>
          )}
        </WorkbenchSurface>

        <WorkbenchSurface
          eyebrow="API exercise surface"
          title="Referral routes use shared envelopes"
        >
          <p className="type-body">
            The declared probes cover referral draft creation and recommended
            contact confirmation. Empty, pending, blocked, not-found, and
            controlled failure probes document non-success states inside the
            mock boundary.
          </p>
          <dl className="relationship-meta">
            <div>
              <dt>Failure mapping</dt>
              <dd>
                <code>
                  {
                    REFERRAL_RECOMMENDATION_ERROR_DEFINITIONS
                      .REFERRAL_RECOMMENDATION_MOCK_FAILED.code
                  }
                </code>{" "}
                maps to a shared failure envelope.
              </dd>
            </div>
            <div>
              <dt>Confirmation guard</dt>
              <dd>
                <code>
                  {
                    REFERRAL_RECOMMENDATION_ERROR_DEFINITIONS
                      .REFERRAL_RECOMMENDATION_CONFIRMATION_REQUIRED.code
                  }
                </code>{" "}
                documents the explicit user confirmation requirement.
              </dd>
            </div>
          </dl>
          <ApiProbeActions />
          <dl
            className="relationship-meta"
            aria-label="Referral recommendation API probes"
          >
            {referralRecommendationApiProbes.map((probe) => (
              <div key={probe.command}>
                <dt>{probe.label}</dt>
                <dd>
                  <code style={pathWrapStyle}>{probe.command}</code>
                  <br />
                  {probe.expectation}
                  <br />
                  Expected status: {probe.expectedStatus}
                </dd>
              </div>
            ))}
          </dl>
        </WorkbenchSurface>

        <WorkbenchSurface
          eyebrow="Mock-to-live handoff"
          title="Replacement notes stay with the referral capability"
        >
          <dl className="relationship-meta">
            <div>
              <dt>Handoff doc</dt>
              <dd>
                <code style={pathWrapStyle}>{liveImplementationNotesPath}</code>
              </dd>
            </div>
            <div>
              <dt>Switch</dt>
              <dd>
                <code>ORBIT_REFERRAL_RECOMMENDATION_PROVIDER</code>
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
