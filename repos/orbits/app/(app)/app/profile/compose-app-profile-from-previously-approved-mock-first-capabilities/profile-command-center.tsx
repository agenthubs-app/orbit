/* eslint-disable no-unused-vars -- The base ESLint config lacks JSX variable usage tracking. */
import type { ReactNode } from "react";
import { createProfileDocumentExtractionService } from "../../../../../features/profile/service-factory";
import { createProfileService } from "../../../../../features/profile/service-factory";
import { createProfileSignalReviewQueueService } from "../../../../../features/profile/service-factory";
import type { ProfileCompletenessField } from "../../../../../features/profile/contract";
import { Chip, WorkbenchSurface } from "../../../../../shared/ui/primitives";
import { StateView } from "../../../../../shared/ui/state-view";

const appProfileStyles = `
.app-profile-route {
  display: grid;
  gap: var(--orbit-space-md);
}

.orbit-app-shell:has(.app-profile-route) .workbench-header .workbench-intro,
.orbit-app-shell:has(.app-profile-route) .workbench-header [aria-label="Account summary"],
.orbit-app-shell:has(.app-profile-route) [aria-label="Account and next steps"] {
  display: none;
}

.app-profile-route,
.app-profile-route .workbench-surface,
.app-profile-route .relationship-meta,
.app-profile-route .chip-row,
.app-profile-route .app-profile-ledger,
.app-profile-route .app-profile-columns,
.app-profile-route .app-profile-readiness-split {
  min-width: 0;
}

.app-profile-route .app-profile-command {
  border-left: 4px solid var(--orbit-color-primary);
}

.app-profile-route .app-profile-ledger,
.app-profile-route .app-profile-columns,
.app-profile-route .app-profile-readiness-split {
  display: grid;
  gap: var(--orbit-space-sm);
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 198px), 1fr));
}

.app-profile-route .app-profile-ledger div,
.app-profile-route .app-profile-action-result {
  background: var(--orbit-color-surface);
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  padding: var(--orbit-space-sm);
}

.app-profile-route .app-profile-ledger strong {
  display: block;
  font-size: 1.45rem;
  line-height: 1.05;
}

.app-profile-route .app-profile-readiness-split {
  border-block: 1px solid var(--orbit-color-border);
  padding-block: var(--orbit-space-sm);
}

.app-profile-route .app-profile-readiness-split article {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.app-profile-route .app-profile-readiness-split h3,
.app-profile-route .app-profile-readiness-split p {
  margin: 0;
}

.app-profile-route .app-profile-readiness-split h3 {
  font-size: 0.95rem;
  line-height: 1.25;
}

.app-profile-route .app-profile-action-form {
  display: flex;
  flex-wrap: wrap;
  gap: var(--orbit-space-sm);
}

.app-profile-route .app-profile-action-form button {
  background: var(--orbit-color-primary);
  border-color: var(--orbit-color-primary-strong);
  color: var(--orbit-color-primary-text);
}

.app-profile-route .app-profile-action-result {
  border-left: 3px solid var(--orbit-color-evidence);
  display: grid;
  gap: 6px;
}

.app-profile-route .app-profile-state-links {
  display: flex;
  flex-wrap: wrap;
  gap: var(--orbit-space-xs);
}

.app-profile-route .app-profile-state-links a {
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  color: var(--orbit-color-text);
  padding: 6px 10px;
  text-decoration: none;
}

.app-profile-route .app-profile-task {
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  display: grid;
  gap: var(--orbit-space-sm);
  padding: var(--orbit-space-sm);
}

.app-profile-route .app-profile-task-options {
  display: flex;
  flex-wrap: wrap;
  gap: var(--orbit-space-xs);
}

.app-profile-route .app-profile-task-options label {
  align-items: center;
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  display: inline-flex;
  gap: 6px;
  padding: 6px 10px;
}
`;

const capabilityLabels = [
  "profile basics",
  "intro preferences",
  "profile draft",
  "suggested changes",
] as const;

const routeStateChecks = [
  {
    href: "/app/profile?scenario=empty",
    label: "Review setup gap",
  },
  {
    href: "/app/profile?scenario=pending",
    label: "Review held profile sources",
  },
  {
    href: "/app/profile?scenario=failure",
    label: "Review profile source recovery",
  },
] as const;

const suggestedIntroChannels = ["warm intro", "event follow-up"] as const;

type AppProfileSearchParams = Record<string, string | string[] | undefined>;
type RouteScenario = "empty" | "pending" | "failure";
type EvidenceResult =
  | {
      success: true;
      data: {
        provenance: {
          evidenceIds: readonly string[];
        };
      };
    }
  | {
      success: false;
      error: {
        code: string;
      };
    };

export interface AppProfileCommandCenterProps {
  searchParams?: AppProfileSearchParams;
}

function readSearchParam(
  searchParams: AppProfileSearchParams | undefined,
  key: string,
): string | null {
  const value = searchParams?.[key];

  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function readSearchParamList(
  searchParams: AppProfileSearchParams | undefined,
  key: string,
): readonly string[] | null {
  const value = searchParams?.[key];

  if (Array.isArray(value)) {
    const values = value.map((item) => item.trim()).filter(Boolean);

    return values.length ? Array.from(new Set(values)) : null;
  }

  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }

  return null;
}

function readRouteScenario(
  searchParams: AppProfileSearchParams | undefined,
): RouteScenario | null {
  const scenario = readSearchParam(searchParams, "scenario");

  if (scenario === "empty" || scenario === "pending" || scenario === "failure") {
    return scenario;
  }

  return null;
}

function firstEvidence(evidenceIds: readonly string[] | undefined): string {
  return evidenceIds?.[0] ?? "evidence:unavailable";
}

function evidenceFromResult(result: EvidenceResult): string {
  if ("error" in result) {
    return result.error.code;
  }

  return firstEvidence(result.data.provenance.evidenceIds);
}

function formatList(items: readonly string[] | undefined): string {
  return items?.length ? items.join(", ") : "not selected";
}

function formatNaturalList(items: readonly string[] | undefined): string {
  if (!items?.length) {
    return "not selected";
  }

  if (items.length === 1) {
    return items[0] ?? "not selected";
  }

  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }

  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function personalizeReviewSummary(summary: string, displayName: string): string {
  return summary.replace("operator review", `${displayName} review`);
}

function formatProfileFieldLabel(
  field: ProfileCompletenessField | string | null,
): string {
  const labels: Record<ProfileCompletenessField, string> = {
    displayName: "display name",
    headline: "headline",
    homeMarket: "home market",
    preferredIntroChannels: "preferred intro channels",
    relationshipGoal: "relationship goal",
    targetRelationshipTypes: "target relationship types",
  };

  return field && field in labels
    ? labels[field as ProfileCompletenessField]
    : "profile details";
}

function EvidenceChips({
  evidenceIds,
  label,
}: {
  evidenceIds: readonly string[];
  label: string;
}) {
  return (
    <details aria-label={`${label} source details`}>
      <summary>Source details</summary>
      <div aria-label={label} className="chip-row">
        {evidenceIds.slice(0, 5).map((evidenceId) => (
          <Chip key={evidenceId} tone="evidence">
            {evidenceId}
          </Chip>
        ))}
      </div>
    </details>
  );
}

function RouteStateMarker({
  children,
  scenario,
}: {
  children: ReactNode;
  scenario: RouteScenario;
}) {
  const routeStateUrl = `/app/profile?scenario=${scenario}`;

  return (
    <div data-route-state-url={routeStateUrl}>
      {children}
    </div>
  );
}

function RouteStateBoundary({
  scenario,
}: {
  scenario: RouteScenario;
}) {
  const profileService = createProfileService();
  const extractionService = createProfileDocumentExtractionService();
  const signalService = createProfileSignalReviewQueueService();

  if (scenario === "empty") {
    const emptyProfile = profileService.getProfile({ scenario: "empty" });

    return (
      <RouteStateMarker scenario={scenario}>
        <StateView
          description="No relationship profile has enough sourced context for profile-informed relationship work."
          emptyState="No manual profile, document draft, or review suggestion is ready."
          evidence={[evidenceFromResult(emptyProfile)]}
          eyebrow="No profile source yet"
          guardrail="Orbit can invite profile setup, but it cannot create relationship actions without profile context."
          nextStep="Source details explain why profile setup stays unchanged until reviewed context is ready."
          purpose="Start profile setup from reviewed source checks."
          recoveryActions={[
            {
              id: "profile-empty-open-setup",
              href: "/app/profile",
              label: "Open profile setup",
              recoveryCopy:
                "Open profile setup to add reviewed profile context.",
            },
          ]}
          title="Profile readiness is empty"
        />
      </RouteStateMarker>
    );
  }

  if (scenario === "pending") {
    const pendingProfile = profileService.getProfile({ scenario: "pending" });
    const pendingExtraction = extractionService.extractBusinessCardDraft({
      scenario: "pending",
    });
    const pendingSuggestions = signalService.listUpdateSuggestions({
      scenario: "pending",
    });
    const evidence = [
      evidenceFromResult(pendingProfile),
      evidenceFromResult(pendingExtraction),
      evidenceFromResult(pendingSuggestions),
    ];

    return (
      <RouteStateMarker scenario={scenario}>
        <StateView
          description="Manual review is pending for profile edits, an imported business-card draft, and suggested profile changes."
          emptyState="Manual edits, the business-card draft, and suggested changes are held until the profile owner reviews their evidence."
          evidence={evidence}
          eyebrow="Checking profile sources"
          guardrail="Held profile material cannot update relationship scoring, accept suggestions, or trigger outside work."
          nextStep="Source details show which profile sources are still held for review."
          purpose="Keep profile setup visible while local profile-source review states resolve."
          recoveryActions={[
            {
              id: "profile-pending-review-sources",
              href: "/app/profile",
              label: "Review held profile sources",
              recoveryCopy:
                "Review held profile sources while manual edits, business-card draft, and suggested changes stay held.",
            },
          ]}
          title="Profile readiness is loading"
        />
      </RouteStateMarker>
    );
  }

  const failureState = signalService.listUpdateSuggestions({
    scenario: "failure",
  });

  return (
    <RouteStateMarker scenario={scenario}>
      <StateView
        description="Suggested profile changes are unavailable because profile-source review could not load."
        emptyState="No suggested profile change was accepted, no profile record was saved, and no outside tool was contacted."
        evidence={
          failureState.success === false
            ? [failureState.error.code, firstEvidence(failureState.error.evidenceIds)]
            : ["profile-route-expected-failure-not-returned"]
        }
      eyebrow="Needs attention"
      guardrail="Returning only reads the profile source review; it does not accept suggestions or contact any outside tool."
      nextStep="Source details explain why Ari's current profile stays unchanged until source review is available."
      purpose="Show a profile-source recovery path without side effects."
      recoveryActions={[
        {
          id: "profile-failure-return",
          href: "/app/profile",
          label: "Return to profile source review",
          recoveryCopy:
            "Return to profile source review without accepting suggestions or changing Ari's profile.",
        },
      ]}
      title="Profile readiness could not load"
    />
  </RouteStateMarker>
  );
}

function ProfileLedger({
  completenessScore,
  displayName,
  documentSummary,
  suggestionCount,
}: {
  completenessScore: number;
  displayName: string;
  documentSummary: string;
  suggestionCount: number;
}) {
  return (
    <dl
      aria-label="App profile composed capabilities"
      className="relationship-meta app-profile-ledger"
    >
      <div>
        <dt>Profile owner</dt>
        <dd>{displayName}</dd>
      </div>
      <div>
        <dt>Completeness</dt>
        <dd>
          <strong>{completenessScore}%</strong>
          profile ready
        </dd>
      </div>
      <div>
        <dt>Imported profile note</dt>
        <dd>{documentSummary}</dd>
      </div>
      <div>
        <dt>Changes to review</dt>
        <dd>{suggestionCount} sourced suggestions</dd>
      </div>
    </dl>
  );
}

function ProfileReadinessSplit({
  displayName,
  homeMarket,
}: {
  displayName: string;
  homeMarket: string;
}) {
  return (
    <div
      aria-label="Profile readiness decision boundary"
      className="app-profile-readiness-split"
    >
      <article>
        <h3>What can guide follow-up now</h3>
        <p className="type-body">
          Name, headline, {homeMarket} market, and relationship goal are sourced
          and ready to inform relationship decisions.
        </p>
      </article>
      <article>
        <h3>What is blocked until confirmation</h3>
        <p className="type-body">
          Preferred intro channels and suggested profile changes stay in review
          until {displayName} confirms them.
        </p>
      </article>
      <article>
        <h3>Outside access</h3>
        <p className="type-body">
          No outside account, storage, card scanning, writing, email, calendar,
          reminder, or message tool has been contacted.
        </p>
      </article>
    </div>
  );
}

export function AppProfileCommandCenter({
  searchParams,
}: AppProfileCommandCenterProps = {}) {
  const profileService = createProfileService();
  const extractionService = createProfileDocumentExtractionService();
  const signalService = createProfileSignalReviewQueueService();
  const requestedScenario = readRouteScenario(searchParams);
  const actionRequested =
    readSearchParam(searchParams, "action") === "complete-profile-field";
  const requestedIntroChannels = readSearchParamList(
    searchParams,
    "preferredIntroChannels",
  );

  if (requestedScenario) {
    return (
      <div className="app-profile-route">
        <style>{appProfileStyles}</style>
        <RouteStateBoundary scenario={requestedScenario} />
      </div>
    );
  }

  const profileState = profileService.getProfile();
  const resumeState = extractionService.extractResumeDraft();
  const suggestionState = signalService.listUpdateSuggestions();

  if (
    profileState.success === false ||
    resumeState.success === false ||
    suggestionState.success === false ||
    !profileState.data.profile
  ) {
    const evidence = [
      evidenceFromResult(profileState),
      evidenceFromResult(resumeState),
      evidenceFromResult(suggestionState),
    ];

    return (
      <StateView
        description="Orbit could not prepare the profile review."
        emptyState="A profile, document draft, or update suggestion returned an unexpected state."
        evidence={evidence}
        eyebrow="Profile"
        guardrail="No outside action can run when profile review cannot be prepared."
        nextStep="Source details explain why this profile screen stays unchanged."
        purpose="Stop profile decisions when source checks are inconsistent."
        title="Profile readiness could not load"
      />
    );
  }

  const profile = profileState.data.profile;
  const resumeDraft = resumeState.data.draft;
  const firstSuggestion = suggestionState.data.suggestions[0] ?? null;
  const nextProfileField = profileState.data.completeness.nextBestField;
  const nextProfileFieldLabel = formatProfileFieldLabel(nextProfileField);
  const selectedIntroChannels =
    actionRequested && requestedIntroChannels
      ? requestedIntroChannels
      : suggestedIntroChannels;
  const editorPreview = profileService.updateProfile({
    displayName: profile.displayName,
    headline: profile.headline,
    organization: profile.organization,
    role: profile.role,
    homeMarket: profile.homeMarket,
    relationshipGoal: profile.relationshipGoal,
    targetRelationshipTypes: profile.targetRelationshipTypes,
    preferredFollowUpWindow: profile.preferredFollowUpWindow,
    preferredIntroChannels: selectedIntroChannels,
  });
  const editorProfile =
    editorPreview.success && editorPreview.data.profile
      ? editorPreview.data.profile
      : profile;
  const preferredChannels = formatList(editorProfile.preferredIntroChannels);
  const preferredChannelsSentence = formatNaturalList(
    editorProfile.preferredIntroChannels,
  );
  const reviewSummary = personalizeReviewSummary(
    suggestionState.data.summary,
    profile.displayName,
  );
  const actionSourceEvidence =
    editorPreview.success && editorPreview.data.provenance.evidenceIds[0]
      ? editorPreview.data.provenance.evidenceIds[0]
      : "evidence:profile-editor-put-request";

  return (
    <div className="app-profile-route">
      <style>{appProfileStyles}</style>
      <div data-state-boundary="app-profile-success">
        <WorkbenchSurface
          className="app-profile-command"
          elevated
          eyebrow="Profile"
          title={`${profile.displayName} profile`}
        >
          <p className="type-body">
            Every field below belongs to {profile.displayName}. Source-backed
            identity, market, and relationship goals are usable now; preferred
            intro channels and suggested changes stay blocked until{" "}
            {profile.displayName} confirms the save.
          </p>
          <ProfileReadinessSplit
            displayName={profile.displayName}
            homeMarket={profile.homeMarket}
          />
          <ProfileLedger
            completenessScore={profileState.data.completeness.score}
            displayName={profile.displayName}
            documentSummary={
              resumeDraft ? "Resume draft ready" : resumeState.data.nextAction
            }
            suggestionCount={suggestionState.data.suggestions.length}
          />
          <div className="app-profile-columns">
            <article className="relationship-record">
              <header>
                <p className="type-caption">Profile basics</p>
                <h3 className="relationship-name">{profile.displayName}</h3>
              </header>
              <p className="type-body">{profile.headline}</p>
              <p className="type-body">{profile.relationshipGoal}</p>
              <p className="type-body">
                Next field: {nextProfileFieldLabel}
              </p>
            </article>
            <article className="relationship-record">
              <header>
                <p className="type-caption">Intro preferences</p>
                <h3 className="relationship-name">Preferred intro channels</h3>
              </header>
              <p className="type-body">
                Suggested channels: {preferredChannels}
              </p>
              <p className="type-body">
                Review status: ready for confirmation
              </p>
            </article>
          </div>
          <form action="/app/profile" className="app-profile-task" method="get">
            <div>
              <p className="type-caption">Profile outcome</p>
              <h3 className="relationship-name">
                Confirm {profile.displayName}&apos;s intro preference
              </h3>
              <p className="type-body">
                These channels are ready to become the next confirmed profile
                field. Review the exact value and source context before anything
                is saved.
              </p>
            </div>
            <div
              aria-label="Preferred intro channel choices"
              className="app-profile-task-options"
            >
              <label>
                <input
                  defaultChecked={selectedIntroChannels.includes("warm intro")}
                  name="preferredIntroChannels"
                  type="checkbox"
                  value="warm intro"
                />
                warm intro
              </label>
              <label>
                <input
                  defaultChecked={selectedIntroChannels.includes(
                    "event follow-up",
                  )}
                  name="preferredIntroChannels"
                  type="checkbox"
                  value="event follow-up"
                />
                event follow-up
              </label>
            </div>
            <input name="action" type="hidden" value="complete-profile-field" />
            <button type="submit">Confirm intro preference</button>
          </form>
          {actionRequested && (
            <div
              aria-label="App profile local action result"
              className="app-profile-action-result"
              data-action-evidence="complete-profile-field-local-preview"
              data-task-result="preferred-intro-channels-preview"
              data-side-effects="none"
            >
              <strong>
                Ready for confirmation: {profile.displayName} prefers{" "}
                {preferredChannelsSentence}
              </strong>
              <span>The review panel is prepared for a confirmation step.</span>
              <span>Profile save still requires explicit confirmation.</span>
              <span>{preferredChannels}</span>
              <details aria-label="App profile action source details">
                <summary>Source details</summary>
                <span>Source evidence: {actionSourceEvidence}</span>
              </details>
              <span>Outside tools contacted: none</span>
              <span hidden>Outside services contacted: none</span>
            </div>
          )}
          <div aria-label="App profile readiness checks">
            <h3 className="relationship-name">Profile readiness checks</h3>
            <p className="type-body">
              Review how Orbit blocks profile actions when source context is
              missing, waiting for review, or unavailable.
            </p>
            <nav className="app-profile-state-links">
              {routeStateChecks.map((stateCheck) => (
                <a href={stateCheck.href} key={stateCheck.href}>
                  {stateCheck.label}
                </a>
              ))}
            </nav>
            <p className="privacy-note">
              These checks stay inside profile review and do not contact outside
              account, storage, card scanning, writing, calendar, reminder, or
              messaging tools.
            </p>
          </div>
          <EvidenceChips
            evidenceIds={profileState.data.provenance.evidenceIds}
            label="App profile evidence"
          />
        </WorkbenchSurface>
      </div>

      <WorkbenchSurface eyebrow="Imported profile draft" title="Resume draft ready">
        {resumeDraft ? (
          <>
            <p className="type-body">
              High confidence because the profile text includes a name, role,
              market, and relationship goal.
            </p>
            <dl className="relationship-meta">
              <div>
                <dt>Name found in source</dt>
                <dd>{resumeDraft.displayName}</dd>
              </div>
              <div>
                <dt>Draft headline</dt>
                <dd>{resumeDraft.headline}</dd>
              </div>
              <div>
                <dt>Evidence excerpt</dt>
                <dd>{resumeDraft.evidence[0]?.excerpt ?? "No excerpt loaded."}</dd>
              </div>
            </dl>
            <EvidenceChips
              evidenceIds={resumeState.data.provenance.evidenceIds}
              label="App profile document evidence"
            />
          </>
        ) : (
          <p className="type-body">{resumeState.data.nextAction}</p>
        )}
      </WorkbenchSurface>

      <WorkbenchSurface
        eyebrow="Suggested profile change"
        title="Review sourced profile change"
      >
        <p className="type-body">{reviewSummary}</p>
        {firstSuggestion && (
          <dl className="relationship-meta">
            <div>
              <dt>Field to confirm</dt>
              <dd>{formatProfileFieldLabel(firstSuggestion.targetProfileField)}</dd>
            </div>
            <div>
              <dt>Value to confirm</dt>
              <dd>{firstSuggestion.suggestedValue}</dd>
            </div>
            <div>
              <dt>Source excerpt</dt>
              <dd>{firstSuggestion.evidence[0]?.excerpt}</dd>
            </div>
          </dl>
        )}
        <p className="privacy-note">
          These suggested changes stay in review until the current profile gap is
          completed and the profile owner explicitly confirms a save.
        </p>
      </WorkbenchSurface>

      <WorkbenchSurface eyebrow="Profile sources" title="Where profile details came from">
        <p className="type-body">
          Each profile detail shown here traces to onboarding, manual editing,
          imported drafts, or a suggested change before it can influence a
          relationship recommendation.
        </p>
        <div aria-label="App profile capability labels" className="chip-row">
          {capabilityLabels.map((label) => (
            <Chip key={label} tone="primary">
              {label}
            </Chip>
          ))}
        </div>
        <p className="privacy-note">
          Source review confirms this preview does not connect outside account,
          storage, card scanning, writing, reminders, email, calendar, or
          external messaging tools.
        </p>
      </WorkbenchSurface>
    </div>
  );
}
