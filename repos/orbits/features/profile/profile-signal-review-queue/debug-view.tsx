/**
 * Profile signal review queue 的开发者面板。
 *
 * 面板展示从关系信号推导出的 profile 更新建议，以及接受建议后的本地 patch。
 */
import {
  Chip,
  WorkbenchFrame,
  WorkbenchSurface,
} from "../../../shared/ui/primitives";
import {
  PROFILE_SIGNAL_REVIEW_QUEUE_ERROR_DEFINITIONS,
  type ProfileSignalSuggestionAcceptedPayload,
  type ProfileUpdateSuggestion,
} from "../signal-contract";
import { createMockProfileSignalReviewQueueService } from "../mock-signal-service";

export const PROFILE_SIGNAL_REVIEW_QUEUE_CAPABILITY_SLUG =
  "profile-signal-review-queue";

const liveImplementationNotesPath =
  "features/profile/profile-signal-review-queue/LIVE_IMPLEMENTATION.md";
const pathWrapStyle = { overflowWrap: "anywhere" } as const;

const profileSignalApiProbes = [
  {
    label: "Review queue",
    command: "GET /api/profile/update-suggestions",
    curlCommand: "curl -s http://localhost:3000/api/profile/update-suggestions",
    expectedStatus: 200,
    expectation: "Expect 200 success envelope with sourced demo suggestions.",
  },
  {
    label: "Accept suggestion",
    command:
      "POST /api/profile/update-suggestions/demo-profile-suggestion-1/accept",
    curlCommand:
      "curl -s -X POST http://localhost:3000/api/profile/update-suggestions/demo-profile-suggestion-1/accept",
    expectedStatus: 200,
    expectation: "Expect 200 success envelope with a profile patch.",
  },
  {
    label: "Empty queue",
    command: "GET /api/profile/update-suggestions?scenario=empty",
    curlCommand:
      "curl -s http://localhost:3000/api/profile/update-suggestions?scenario=empty",
    expectedStatus: 200,
    expectation: "Expect 200 success envelope with no suggestions.",
  },
  {
    label: "Pending signal",
    command: "GET /api/profile/update-suggestions?scenario=pending",
    curlCommand:
      "curl -s http://localhost:3000/api/profile/update-suggestions?scenario=pending",
    expectedStatus: 200,
    expectation: "Expect 200 success envelope with one held suggestion.",
  },
  {
    label: "Controlled failure",
    command: "GET /api/profile/update-suggestions?scenario=failure",
    curlCommand:
      "curl -s http://localhost:3000/api/profile/update-suggestions?scenario=failure",
    expectedStatus: 503,
    expectation:
      "Expect 503 failure envelope with PROFILE_SIGNAL_REVIEW_QUEUE_FAILED context.",
  },
] as const;

function EvidenceChips({ evidenceIds }: { evidenceIds: readonly string[] }) {
  return (
    <div className="chip-row" aria-label="Profile signal evidence">
      {evidenceIds.map((evidenceId) => (
        <Chip key={evidenceId} tone="evidence">
          {evidenceId}
        </Chip>
      ))}
    </div>
  );
}

function SourceReviewRehearsal({
  acceptedPatch,
  suggestion,
}: {
  acceptedPatch: ProfileSignalSuggestionAcceptedPayload;
  suggestion: ProfileUpdateSuggestion;
}) {
  const [sourceEvidence] = suggestion.evidence;

  return (
    <WorkbenchSurface
      eyebrow="Operator rehearsal"
      title="Source review rehearsal"
    >
      <p className="type-body">
        No automatic profile mutation happens in this mock boundary. The route
        returns a review suggestion and an accepted patch for the operator to
        inspect before saving.
      </p>
      <dl className="relationship-meta">
        <div>
          <dt>Inspect source excerpt</dt>
          <dd>{sourceEvidence.excerpt}</dd>
        </div>
        <div>
          <dt>Return patch only</dt>
          <dd>
            <code>{acceptedPatch.appliedFields.join(", ")}</code> becomes{" "}
            {acceptedPatch.profilePatch.headline}.
          </dd>
        </div>
        <div>
          <dt>Operator save required</dt>
          <dd>
            Keep the patch separate from persistence until the profile editor
            confirmation guard accepts it.
          </dd>
        </div>
      </dl>
      <div className="chip-row" aria-label="Profile signal review rehearsal">
        <Chip tone="privacy">No automatic profile mutation</Chip>
        <Chip tone="evidence">{sourceEvidence.evidenceId}</Chip>
        <Chip tone="confirmation">operator confirmed save</Chip>
      </div>
    </WorkbenchSurface>
  );
}

export function ProfileSignalReviewQueueCapabilityDemo() {
  const signalService = createMockProfileSignalReviewQueueService();
  const successState = signalService.listUpdateSuggestions();
  const emptyState = signalService.listUpdateSuggestions({ scenario: "empty" });
  const pendingState = signalService.listUpdateSuggestions({
    scenario: "pending",
  });
  const failureState = signalService.listUpdateSuggestions({
    scenario: "failure",
  });
  const acceptState = signalService.acceptUpdateSuggestion(
    "demo-profile-suggestion-1",
  );

  return (
    <WorkbenchFrame>
      <div className="workbench-shell">
        <header className="workbench-header">
          <p className="workbench-kicker">Developer capability runtime</p>
          <h1>Profile signal review queue</h1>
          <p className="workbench-intro">
            Mock-first boundary for profile update suggestions from chat,
            activity, and contact signals. Suggestions stay in review until the
            operator accepts a source-backed patch.
          </p>
        </header>

        <section
          className="workbench-grid"
          aria-label="Profile signal review queue states"
        >
          <WorkbenchSurface
            elevated
            eyebrow={PROFILE_SIGNAL_REVIEW_QUEUE_CAPABILITY_SLUG}
            title="Success state"
          >
            {successState.success && (
              <>
                <p className="type-body">{successState.data.summary}</p>
                <dl className="relationship-meta">
                  {successState.data.suggestions.map((suggestion) => (
                    <div key={suggestion.id}>
                      <dt>{suggestion.sourceLabel}</dt>
                      <dd>
                        <code>{suggestion.id}</code> suggests{" "}
                        <code>{suggestion.targetProfileField}</code> from{" "}
                        {suggestion.currentValue} to {suggestion.suggestedValue}.
                      </dd>
                    </div>
                  ))}
                </dl>
                <EvidenceChips
                  evidenceIds={successState.data.provenance.evidenceIds}
                />
              </>
            )}
          </WorkbenchSurface>

          <WorkbenchSurface eyebrow="No signals" title="Empty state">
            {emptyState.success && (
              <>
                <p className="type-body">{emptyState.data.nextAction}</p>
                <dl className="relationship-meta">
                  <div>
                    <dt>Queue</dt>
                    <dd>No profile suggestions are ready in this scenario.</dd>
                  </div>
                  <div>
                    <dt>Source</dt>
                    <dd>{emptyState.data.provenance.sourceLabel}</dd>
                  </div>
                </dl>
                <EvidenceChips
                  evidenceIds={emptyState.data.provenance.evidenceIds}
                />
              </>
            )}
          </WorkbenchSurface>

          <WorkbenchSurface eyebrow="Held signal" title="Pending state">
            {pendingState.success && (
              <>
                <p className="type-body">{pendingState.data.nextAction}</p>
                <dl className="relationship-meta">
                  <div>
                    <dt>Suggestion</dt>
                    <dd>
                      {pendingState.data.suggestions[0].sourceLabel} is held as{" "}
                      <code>{pendingState.data.suggestions[0].status}</code>.
                    </dd>
                  </div>
                  <div>
                    <dt>Generation</dt>
                    <dd>{pendingState.data.provenance.generationMethod}</dd>
                  </div>
                </dl>
                <EvidenceChips
                  evidenceIds={pendingState.data.provenance.evidenceIds}
                />
              </>
            )}
          </WorkbenchSurface>

          <WorkbenchSurface eyebrow="Review guard" title="Failure state">
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
          eyebrow="Accepted patch"
          title="Accepting a suggestion returns a patch, not a background mutation"
        >
          {acceptState.success && (
            <>
              <p className="type-body">{acceptState.data.nextAction}</p>
              <dl className="relationship-meta">
                <div>
                  <dt>Accepted suggestion</dt>
                  <dd>
                    <code>{acceptState.data.acceptedSuggestion.id}</code> moved
                    to <code>{acceptState.data.acceptedSuggestion.status}</code>.
                  </dd>
                </div>
                <div>
                  <dt>Patch field</dt>
                  <dd>
                    <code>{acceptState.data.appliedFields.join(", ")}</code>
                  </dd>
                </div>
                <div>
                  <dt>Patch value</dt>
                  <dd>{acceptState.data.profilePatch.headline}</dd>
                </div>
              </dl>
              <div className="chip-row" aria-label="Profile signal guardrails">
                <Chip tone="privacy">mock only</Chip>
                <Chip tone="evidence">source-backed patch</Chip>
                <Chip tone="confirmation">review before save</Chip>
              </div>
            </>
          )}
        </WorkbenchSurface>

        {successState.success && acceptState.success && (
          <SourceReviewRehearsal
            acceptedPatch={acceptState.data}
            suggestion={successState.data.suggestions[0]}
          />
        )}

        <WorkbenchSurface
          eyebrow="API exercise surface"
          title="Profile signal routes use shared envelopes"
        >
          <p className="type-body">
            Run these probes against the dev server to verify review, empty,
            pending, accept, and failure envelopes inside the mock boundary.
          </p>
          <dl className="relationship-meta">
            <div>
              <dt>Suggestion queue</dt>
              <dd>
                <code>GET /api/profile/update-suggestions</code> returns
                sourced suggestions from chat, activity, and contact fixtures.
              </dd>
            </div>
            <div>
              <dt>Accept suggestion</dt>
              <dd>
                <code>
                  POST
                  /api/profile/update-suggestions/demo-profile-suggestion-1/accept
                </code>{" "}
                returns the accepted suggestion and a profile patch.
              </dd>
            </div>
            <div>
              <dt>Controlled failure</dt>
              <dd>
                <code>
                  {
                    PROFILE_SIGNAL_REVIEW_QUEUE_ERROR_DEFINITIONS
                      .PROFILE_SIGNAL_REVIEW_QUEUE_FAILED.code
                  }
                </code>{" "}
                maps to a shared failure envelope.
              </dd>
            </div>
          </dl>
          <dl
            className="relationship-meta"
            aria-label="Profile signal review queue API probes"
          >
            {profileSignalApiProbes.map((probe) => (
              <div key={probe.command}>
                <dt>{probe.label}</dt>
                <dd>
                  <code style={pathWrapStyle}>{probe.command}</code>
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

        <WorkbenchSurface
          eyebrow="Mock-to-live handoff"
          title="Replacement notes stay with the profile signal capability"
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
                Live service files, the switch mechanism, required environment
                values and permissions, privacy and provenance constraints, and
                replacement tests are documented before live signal analysis is
                wired.
              </dd>
            </div>
            <div>
              <dt>Provider files</dt>
              <dd>
                <code style={pathWrapStyle}>
                  features/profile/live-signal-service.ts
                </code>{" "}
                plus chat, activity, and contact adapters inside the capability
                provider folder.
              </dd>
            </div>
            <div>
              <dt>Switch and env</dt>
              <dd>
                Feature mode stays explicit, and live mode requires{" "}
                <code>ORBIT_PROFILE_SIGNAL_PROVIDER</code> before provider
                adapters can replace the mock service.
              </dd>
            </div>
            <div>
              <dt>Privacy and tests</dt>
              <dd>
                Replacement tests must preserve evidence provenance, hide raw
                provider errors, and prove suggestions never write directly to
                profile fields.
              </dd>
            </div>
          </dl>
        </WorkbenchSurface>
      </div>
    </WorkbenchFrame>
  );
}
