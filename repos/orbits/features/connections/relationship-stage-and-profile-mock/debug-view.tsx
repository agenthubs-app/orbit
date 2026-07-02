/**
 * 关系阶段与画像 mock 的开发者面板。
 *
 * 这里展示 stage/profile 更新如何从本地证据和显式输入生成可复核结果。
 */
import {
  Chip,
  Field,
  WorkbenchFrame,
  WorkbenchSurface,
} from "../../../shared/ui/primitives";
import {
  RELATIONSHIP_PROFILE_ERROR_DEFINITIONS,
  RELATIONSHIP_PROFILE_TYPES,
  type RelationshipProfilePayload,
  type RelationshipProfileRecord,
  type RelationshipProfileResult,
  type RelationshipProfileServiceResult,
} from "../profile-contract";
import { createMockRelationshipStageAndProfileService } from "../mock-profile-service";

export const RELATIONSHIP_STAGE_AND_PROFILE_MOCK_SLUG =
  "relationship-stage-and-profile-mock";

const liveImplementationNotesPath =
  "features/connections/relationship-stage-and-profile-mock/LIVE_IMPLEMENTATION.md";
const pathWrapStyle = { overflowWrap: "anywhere" } as const;
const responsiveWorkbenchStyles = `
.relationship-profile-workbench {
  grid-template-columns: minmax(0, 1fr);
  overflow-x: clip;
}

.relationship-profile-workbench .workbench-shell,
.relationship-profile-workbench .workbench-surface,
.relationship-profile-workbench .workbench-grid,
.relationship-profile-workbench .relationship-meta,
.relationship-profile-workbench .control-stack,
.relationship-profile-workbench .chip-row,
.relationship-profile-workbench .button-row,
.relationship-profile-workbench form {
  min-width: 0;
}

.relationship-profile-workbench input,
.relationship-profile-workbench select,
.relationship-profile-workbench textarea {
  max-width: 100%;
  min-width: 0;
  width: 100%;
}

.relationship-profile-workbench code,
.relationship-profile-workbench dd,
.relationship-profile-workbench .orbit-chip {
  overflow-wrap: anywhere;
}

.relationship-profile-workbench .profile-checkpoint-grid {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr));
}

.relationship-profile-workbench .profile-checkpoint-grid div {
  background: var(--orbit-color-surface);
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  padding: var(--orbit-space-sm);
}
`;

function requireSyncRelationshipProfileResult(
  result: RelationshipProfileServiceResult<RelationshipProfileResult>,
): RelationshipProfileResult {
  const maybePromise = result as { then?: unknown };

  if (typeof maybePromise.then === "function") {
    throw new Error(
      "Relationship stage/profile mock demo requires a synchronous profile service.",
    );
  }

  return result as RelationshipProfileResult;
}

const relationshipProfileApiProbes = [
  {
    label: "Update stage",
    command: "PATCH /api/connections/demo-connection-1/stage",
    expectedStatus: 200,
    expectation:
      "Expect 200 success envelope with a deterministic relationship stage and profile snapshot.",
  },
  {
    label: "Update profile",
    command: "PATCH /api/connections/demo-connection-1/profile",
    expectedStatus: 200,
    expectation:
      "Expect 200 success envelope with relationship type, context, mutual value, summary, and next action.",
  },
  {
    label: "Empty stage",
    command: "PATCH /api/connections/demo-connection-1/stage?scenario=empty",
    expectedStatus: 200,
    expectation:
      "Expect 200 empty envelope with no selected relationship profile.",
  },
  {
    label: "Pending profile",
    command: "PATCH /api/connections/demo-connection-1/profile?scenario=pending",
    expectedStatus: 200,
    expectation:
      "Expect 200 pending envelope while profile fixture review waits.",
  },
  {
    label: "Controlled failure",
    command: "PATCH /api/connections/demo-connection-1/stage?scenario=failure",
    expectedStatus: 503,
    expectation:
      "Expect 503 failure envelope with RELATIONSHIP_PROFILE_SERVICE_MOCK_FAILED context.",
  },
] as const;

const liveHandoffEvidenceExcerpts = [
  "Live service files live under features/connections/relationship-stage-and-profile-mock/.",
  "ORBIT_RELATIONSHIP_PROFILE_PROVIDER switches from mock to live.",
  "Live replacement wires stage automation and relationship profiling behind the same service interface.",
  "Relationship profiles preserve context, mutual value, latest summary, next action, and provenance together.",
  "Replacement tests cover stage update, profile update, empty, pending, invalid body, invalid stage, not-found, and provider failure paths.",
] as const;

function EvidenceChips({ evidenceIds }: { evidenceIds: readonly string[] }) {
  return (
    <div className="chip-row" aria-label="Relationship profile evidence ids">
      {evidenceIds.map((evidenceId) => (
        <Chip key={evidenceId} tone="evidence">
          {evidenceId}
        </Chip>
      ))}
    </div>
  );
}

function ProfileSummary({ profile }: { profile: RelationshipProfileRecord }) {
  return (
    <dl className="relationship-meta">
      <div>
        <dt>Connection</dt>
        <dd>{profile.displayName}</dd>
      </div>
      <div>
        <dt>Relationship type</dt>
        <dd>
          <code>{profile.relationshipType}</code>
        </dd>
      </div>
      <div>
        <dt>Stage</dt>
        <dd>
          <code>{profile.relationshipStage}</code>
        </dd>
      </div>
      <div>
        <dt>Context</dt>
        <dd>{profile.context}</dd>
      </div>
      <div>
        <dt>Mutual value</dt>
        <dd>
          {profile.mutualValue.contactReceives} Orbit user receives{" "}
          {profile.mutualValue.orbitUserReceives}
        </dd>
      </div>
      <div>
        <dt>Latest summary</dt>
        <dd>{profile.latestSummary.text}</dd>
      </div>
      <div>
        <dt>Next action</dt>
        <dd>
          {profile.nextAction.label}. {profile.nextAction.rationale}
        </dd>
      </div>
    </dl>
  );
}

function OperatorCheckpoint({ payload }: { payload: RelationshipProfilePayload }) {
  const profile = payload.profile;
  const databaseReads =
    payload.provenance.databaseReadExecuted === false ? "false" : "true";
  const databaseWrites =
    payload.provenance.databaseWriteExecuted === false ? "false" : "true";
  const aiBoundary =
    payload.provenance.aiProviderRequested === false ? "false" : "true";

  return (
    <WorkbenchSurface
      elevated
      eyebrow="Operator checkpoint"
      title="Relationship profile stays source-backed"
    >
      <p className="type-body">
        The mock stage/profile calculation keeps context, mutual value, latest
        summary, and next action together while live execution flags remain
        false.
      </p>
      <dl
        aria-label="Relationship stage profile operator checkpoint"
        className="relationship-meta profile-checkpoint-grid"
      >
        <div>
          <dt>Connection represented</dt>
          <dd>{profile ? profile.displayName : "No connection selected"}.</dd>
        </div>
        <div>
          <dt>Profile fields</dt>
          <dd>Relationship type, stage, context, mutual value, summary.</dd>
        </div>
        <div>
          <dt>Mock execution</dt>
          <dd>
            database reads {databaseReads}; database writes {databaseWrites}.
          </dd>
        </div>
        <div>
          <dt>Model boundary</dt>
          <dd>
            ai{" "}provider {aiBoundary}.
          </dd>
        </div>
      </dl>
    </WorkbenchSurface>
  );
}

function ProfileEditPanel() {
  return (
    <WorkbenchSurface
      elevated
      eyebrow="Profile controls"
      title="Preview deterministic relationship profiling"
    >
      <p className="type-body">
        The form posts to the mock profile route with local fields only. The
        route returns a stable envelope and does not write profile state.
      </p>
      <form
        action="/api/connections/demo-connection-1/profile"
        aria-label="Mock relationship profile form"
        className="control-stack"
        method="post"
      >
        <Field label="Relationship type" helper="Local profile types only.">
          <select name="relationshipType" defaultValue="customer_candidate">
            {RELATIONSHIP_PROFILE_TYPES.map((relationshipType) => (
              <option key={relationshipType} value={relationshipType}>
                {relationshipType}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Context" helper="No external context source is queried.">
          <textarea
            name="context"
            defaultValue="Kenji asked for a storage pilot operator introduction after the climate founders dinner."
            rows={3}
          />
        </Field>
        <button className="primary-action" type="submit">
          Preview profile update
        </button>
      </form>
      <div className="chip-row" aria-label="Relationship profile guardrails">
        <Chip tone="evidence">source-backed</Chip>
        <Chip tone="privacy">mock only</Chip>
        <Chip tone="confirmation">deterministic rules</Chip>
      </div>
    </WorkbenchSurface>
  );
}

function ApiProbeActions() {
  return (
    <div
      className="control-stack"
      aria-label="Relationship stage and profile API probe actions"
    >
      <p className="type-body">
        These probes exercise stage update, profile update, empty, pending, and
        controlled failure paths inside the relationship profile mock boundary.
      </p>
      <div className="button-row">
        <form
          action="/api/connections/demo-connection-1/stage"
          aria-label="Run relationship stage probe"
        >
          <button className="secondary-action" type="submit">
            Run stage probe
          </button>
        </form>
        <form
          action="/api/connections/demo-connection-1/profile"
          aria-label="Run relationship profile probe"
        >
          <button className="secondary-action" type="submit">
            Run profile probe
          </button>
        </form>
      </div>
    </div>
  );
}

export function RelationshipStageAndProfileMockDemo() {
  const profileService = createMockRelationshipStageAndProfileService();
  const successState = requireSyncRelationshipProfileResult(
    profileService.updateStage({
      connectionId: "demo-connection-1",
      relationshipStage: "active",
    }),
  );
  const profileUpdateState = requireSyncRelationshipProfileResult(
    profileService.updateProfile({
      connectionId: "demo-connection-1",
      relationshipType: "customer_candidate",
    }),
  );
  const emptyState = requireSyncRelationshipProfileResult(
    profileService.updateStage({
      connectionId: "demo-connection-1",
      scenario: "empty",
    }),
  );
  const pendingState = requireSyncRelationshipProfileResult(
    profileService.updateProfile({
      connectionId: "demo-connection-1",
      scenario: "pending",
    }),
  );
  const failureState = requireSyncRelationshipProfileResult(
    profileService.updateStage({
      connectionId: "demo-connection-1",
      scenario: "failure",
    }),
  );
  const successPayload = successState.success ? successState.data : null;
  const profilePayload = profileUpdateState.success
    ? profileUpdateState.data
    : null;

  return (
    <WorkbenchFrame className="relationship-profile-workbench">
      <style>{responsiveWorkbenchStyles}</style>
      <div className="workbench-shell">
        <header className="workbench-header">
          <p className="workbench-kicker">Developer capability runtime</p>
          <h1>Relationship stage and profile mock</h1>
          <p className="workbench-intro">
            Mock-first boundary for calculating who the relationship is, which
            stage it is in, why that stage is sensible, what value exists on
            both sides, and which follow-up action should happen next.
          </p>
        </header>

        {successPayload && <OperatorCheckpoint payload={successPayload} />}

        <ProfileEditPanel />

        <section
          className="workbench-grid"
          aria-label="Relationship stage and profile service states"
        >
          <WorkbenchSurface
            elevated
            eyebrow={RELATIONSHIP_STAGE_AND_PROFILE_MOCK_SLUG}
            title="Success state"
          >
            {successPayload?.profile && (
              <>
                <p className="type-body">{successPayload.summary}</p>
                <ProfileSummary profile={successPayload.profile} />
                <EvidenceChips
                  evidenceIds={successPayload.provenance.evidenceIds}
                />
              </>
            )}
          </WorkbenchSurface>

          <WorkbenchSurface eyebrow="No connection selected" title="Empty state">
            {emptyState.success && (
              <>
                <p className="type-body">{emptyState.data.nextAction}</p>
                <dl className="relationship-meta">
                  <div>
                    <dt>Profile</dt>
                    <dd>No relationship profile is selected.</dd>
                  </div>
                  <div>
                    <dt>State</dt>
                    <dd>
                      <code>{emptyState.data.state}</code>
                    </dd>
                  </div>
                </dl>
                <EvidenceChips
                  evidenceIds={emptyState.data.provenance.evidenceIds}
                />
              </>
            )}
          </WorkbenchSurface>

          <WorkbenchSurface eyebrow="Fixture review" title="Pending state">
            {pendingState.success && (
              <>
                <p className="type-body">{pendingState.data.summary}</p>
                <dl className="relationship-meta">
                  <div>
                    <dt>Profile status</dt>
                    <dd>
                      <code>{pendingState.data.state}</code>
                    </dd>
                  </div>
                  <div>
                    <dt>Profile</dt>
                    <dd>Relationship automation waits for fixture review.</dd>
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
          eyebrow="Profile detail"
          title="Relationship profile remains explainable"
        >
          {profilePayload?.profile && (
            <>
              <p className="type-body">{profilePayload.updateSummary}</p>
              <ProfileSummary profile={profilePayload.profile} />
              <div className="chip-row" aria-label="Mutual value types">
                {profilePayload.profile.mutualValue.valueTypes.map((valueType) => (
                  <Chip key={valueType} tone="confirmation">
                    {valueType}
                  </Chip>
                ))}
              </div>
            </>
          )}
        </WorkbenchSurface>

        <WorkbenchSurface
          eyebrow="Mock-only execution"
          title="No live automation runs in the mock"
        >
          {successPayload?.profile && (
            <>
              <p className="privacy-note">
                The mock sets database reads, database writes, production audit
                log writes, external network requests, model calls, calendar
                requests, email requests, and notifications to false.
              </p>
              <dl className="relationship-meta">
                <div>
                  <dt>Profile flags</dt>
                  <dd>
                    database reads{" "}
                    {String(successPayload.profile.databaseReadExecuted)};
                    database writes{" "}
                    {String(successPayload.profile.databaseWriteExecuted)}; ai{" "}
                    provider {String(successPayload.profile.aiProviderRequested)}
                  </dd>
                </div>
              </dl>
            </>
          )}
        </WorkbenchSurface>

        <WorkbenchSurface
          eyebrow="API exercise surface"
          title="Relationship routes use shared envelopes"
        >
          <p className="type-body">
            The declared probes cover stage and profile updates. Empty, pending,
            invalid body, invalid stage, not-found, and controlled failure
            probes document non-success states without leaving the mock boundary.
          </p>
          <dl className="relationship-meta">
            <div>
              <dt>Failure mapping</dt>
              <dd>
                <code>
                  {
                    RELATIONSHIP_PROFILE_ERROR_DEFINITIONS
                      .RELATIONSHIP_PROFILE_SERVICE_MOCK_FAILED.code
                  }
                </code>{" "}
                maps to a shared failure envelope.
              </dd>
            </div>
          </dl>
          <ApiProbeActions />
          <dl
            className="relationship-meta"
            aria-label="Relationship stage and profile API probes"
          >
            {relationshipProfileApiProbes.map((probe) => (
              <div key={probe.command}>
                <dt>{probe.label}</dt>
                <dd>
                  <code style={pathWrapStyle}>{probe.command}</code>{" "}
                  returns {probe.expectedStatus}. {probe.expectation}
                </dd>
              </div>
            ))}
          </dl>
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
                Live service and provider files, switch mechanism, required env
                vars and permissions, privacy and provenance constraints, and
                replacement tests are documented before live providers are wired.
              </dd>
            </div>
          </dl>
          <div
            className="chip-row"
            aria-label="Relationship profile live handoff excerpts"
          >
            {liveHandoffEvidenceExcerpts.map((excerpt) => (
              <Chip key={excerpt} tone="privacy">
                {excerpt}
              </Chip>
            ))}
          </div>
        </WorkbenchSurface>
      </div>
    </WorkbenchFrame>
  );
}
