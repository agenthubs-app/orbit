/**
 * Profile onboarding 与手动编辑 mock 的开发者面板。
 *
 * 这里展示 profile 读取、更新输入和错误状态，用来验证资料页编辑契约。
 */
import {
  Chip,
  Field,
  WorkbenchFrame,
  WorkbenchSurface,
} from "../../../shared/ui/primitives";
import { PROFILE_ERROR_DEFINITIONS, type ProfileResult } from "../contract";
import { mockProfileUpdateInput } from "../fixtures";
import { createMockProfileService } from "../mock-service";
import type { ProfileServiceResult } from "../service";

export const PROFILE_ONBOARDING_CAPABILITY_SLUG =
  "profile-onboarding-and-manual-profile-editor";

const liveImplementationNotesPath =
  "features/profile/profile-onboarding-and-manual-profile-editor/LIVE_IMPLEMENTATION.md";
const pathWrapStyle = { overflowWrap: "anywhere" } as const;

const profileApiProbes = [
  {
    label: "Read profile",
    command: "GET /api/profile",
    expectation: "Expect 200 success envelope with the manual profile payload.",
  },
  {
    label: "Empty onboarding",
    command: "GET /api/profile?scenario=empty",
    expectation: "Expect 200 success envelope with the empty profile payload.",
  },
  {
    label: "Pending review",
    command: "GET /api/profile?scenario=pending",
    expectation: "Expect 200 success envelope with the pending editor payload.",
  },
  {
    label: "Save profile",
    command: "PUT /api/profile",
    expectation:
      "Expect 200 success envelope with rule-scored profile completeness.",
  },
  {
    label: "Validation guard",
    command: 'PUT /api/profile {"displayName":""}',
    expectation:
      "Expect 400 failure envelope with PROFILE_VALIDATION_FAILED context.",
  },
] as const;

function EvidenceChips({ evidenceIds }: { evidenceIds: readonly string[] }) {
  return (
    <div className="chip-row" aria-label="Profile evidence">
      {evidenceIds.map((evidenceId) => (
        <Chip key={evidenceId} tone="evidence">
          {evidenceId}
        </Chip>
      ))}
    </div>
  );
}

function isPromiseLike(value: unknown): value is Promise<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "then" in value &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

function requireSyncProfileResult(
  result: ProfileServiceResult<ProfileResult>,
): ProfileResult {
  if (isPromiseLike(result)) {
    throw new Error(
      "The profile onboarding capability demo only supports synchronous mock profile services.",
    );
  }

  return result;
}

export function ProfileOnboardingCapabilityDemo() {
  const profileService = createMockProfileService();
  const successState = requireSyncProfileResult(profileService.getProfile());
  const emptyState = requireSyncProfileResult(
    profileService.getProfile({ scenario: "empty" }),
  );
  const pendingState = requireSyncProfileResult(
    profileService.getPendingManualReview(),
  );
  const updateState = requireSyncProfileResult(
    profileService.updateProfile(mockProfileUpdateInput),
  );
  const failureState = requireSyncProfileResult(
    profileService.updateProfile({ displayName: "" }),
  );

  return (
    <WorkbenchFrame>
      <div className="workbench-shell">
        <header className="workbench-header">
          <p className="workbench-kicker">Developer capability runtime</p>
          <h1>Profile onboarding and manual profile editor</h1>
          <p className="workbench-intro">
            Mock-first profile boundary for onboarding an operator, editing
            manual relationship context, and scoring profile completeness
            without storage, auth, or external services.
          </p>
        </header>

        <section
          className="workbench-grid"
          aria-label="Profile onboarding states"
        >
          <WorkbenchSurface
            elevated
            eyebrow={PROFILE_ONBOARDING_CAPABILITY_SLUG}
            title="Success state"
          >
            {successState.success && successState.data.profile && (
              <>
                <dl className="relationship-meta">
                  <div>
                    <dt>Operator</dt>
                    <dd>{successState.data.profile.displayName}</dd>
                  </div>
                  <div>
                    <dt>Headline</dt>
                    <dd>{successState.data.profile.headline}</dd>
                  </div>
                  <div>
                    <dt>Relationship goal</dt>
                    <dd>{successState.data.profile.relationshipGoal}</dd>
                  </div>
                  <div>
                    <dt>Completeness</dt>
                    <dd>
                      <code>{successState.data.completeness.score}% complete</code>{" "}
                      with{" "}
                      <code>
                        {successState.data.completeness.nextBestField}
                      </code>{" "}
                      next.
                    </dd>
                  </div>
                </dl>
                <EvidenceChips
                  evidenceIds={successState.data.provenance.evidenceIds}
                />
              </>
            )}
          </WorkbenchSurface>

          <WorkbenchSurface eyebrow="Onboarding start" title="Empty state">
            {emptyState.success && (
              <>
                <p className="type-body">{emptyState.data.nextAction}</p>
                <dl className="relationship-meta">
                  <div>
                    <dt>Profile</dt>
                    <dd>No manual profile has been created in this scenario.</dd>
                  </div>
                  <div>
                    <dt>Completeness</dt>
                    <dd>
                      <code>{emptyState.data.completeness.score}% complete</code>
                    </dd>
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

          <WorkbenchSurface eyebrow="Manual review" title="Pending state">
            {pendingState.success && pendingState.data.profile && (
              <>
                <p className="type-body">{pendingState.data.nextAction}</p>
                <dl className="relationship-meta">
                  <div>
                    <dt>Pending fields</dt>
                    <dd>
                      {pendingState.data.editor.dirtyFields.map((field) => (
                        <code key={field}>{field} </code>
                      ))}
                    </dd>
                  </div>
                  <div>
                    <dt>Source</dt>
                    <dd>{pendingState.data.provenance.sourceLabel}</dd>
                  </div>
                </dl>
                <EvidenceChips
                  evidenceIds={pendingState.data.provenance.evidenceIds}
                />
              </>
            )}
          </WorkbenchSurface>

          <WorkbenchSurface eyebrow="Validation guard" title="Failure state">
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
          eyebrow="Manual editor"
          title="Rule-based saves return scored profile context"
        >
          {updateState.success && updateState.data.profile && (
            <>
              <p className="type-body">{updateState.data.nextAction}</p>
              <form
                aria-label="Mock manual profile editor controls"
                className="control-stack"
              >
                <Field
                  label="Display name"
                  helper="Required before the mock profile can be scored."
                >
                  <input
                    name="displayName"
                    type="text"
                    defaultValue={updateState.data.profile.displayName}
                  />
                </Field>
                <Field label="Relationship goal">
                  <textarea
                    name="relationshipGoal"
                    defaultValue={updateState.data.profile.relationshipGoal}
                  />
                </Field>
                <Field label="Follow-up window">
                  <select
                    name="preferredFollowUpWindow"
                    defaultValue={updateState.data.profile.preferredFollowUpWindow}
                  >
                    <option value="24 hours">24 hours</option>
                    <option value="48 hours">48 hours</option>
                    <option value="one week">one week</option>
                  </select>
                </Field>
                <Field label="Intro channels">
                  <input
                    name="preferredIntroChannels"
                    type="text"
                    defaultValue={updateState.data.profile.preferredIntroChannels.join(
                      ", ",
                    )}
                  />
                </Field>
              </form>
              <dl className="relationship-meta">
                <div>
                  <dt>Saved profile</dt>
                  <dd>
                    {updateState.data.profile.displayName} at{" "}
                    {updateState.data.profile.organization}
                  </dd>
                </div>
                <div>
                  <dt>Completeness</dt>
                  <dd>
                    <code>{updateState.data.completeness.score}% complete</code>{" "}
                    after the mock editor save.
                  </dd>
                </div>
                <div>
                  <dt>Profile-informed follow-up</dt>
                  <dd>
                    Use {updateState.data.profile.preferredFollowUpWindow} and{" "}
                    {updateState.data.profile.preferredIntroChannels[0]} to
                    shape the next relationship action for{" "}
                    {updateState.data.profile.targetRelationshipTypes.join(", ")}.
                  </dd>
                </div>
                <div>
                  <dt>Editor state</dt>
                  <dd>
                    Last saved at <code>{updateState.data.editor.lastSavedAt}</code>.
                  </dd>
                </div>
              </dl>
            </>
          )}
        </WorkbenchSurface>

        <WorkbenchSurface
          eyebrow="API exercise surface"
          title="Profile routes use shared envelopes"
        >
          <p className="type-body">
            Run these probes against the dev server to verify success, empty,
            pending, update, and failure envelopes without leaving the mock
            boundary.
          </p>
          <dl className="relationship-meta">
            <div>
              <dt>Profile read</dt>
              <dd>
                <code>GET /api/profile</code> returns the demo manual profile,
                with query scenarios for empty and pending paths.
              </dd>
            </div>
            <div>
              <dt>Profile update</dt>
              <dd>
                <code>PUT /api/profile</code> scores completeness from the
                submitted manual fields without changing stored state.
              </dd>
            </div>
            <div>
              <dt>Controlled failure</dt>
              <dd>
                <code>
                  {PROFILE_ERROR_DEFINITIONS.PROFILE_VALIDATION_FAILED.code}
                </code>{" "}
                maps to a shared failure envelope and includes profile-specific
                context.
              </dd>
            </div>
          </dl>
          <dl className="relationship-meta" aria-label="Profile API probes">
            {profileApiProbes.map((probe) => (
              <div key={probe.command}>
                <dt>{probe.label}</dt>
                <dd>
                  <code style={pathWrapStyle}>{probe.command}</code>
                  <br />
                  {probe.expectation}
                </dd>
              </div>
            ))}
          </dl>
          <div className="chip-row" aria-label="Profile guardrails">
            <Chip tone="privacy">mock only</Chip>
            <Chip tone="evidence">source-backed fixture</Chip>
            <Chip tone="confirmation">validation guard</Chip>
          </div>
        </WorkbenchSurface>

        <WorkbenchSurface
          eyebrow="Mock-to-live handoff"
          title="Replacement notes stay with the profile capability"
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
                replacement tests are documented before live profile persistence
                is wired.
              </dd>
            </div>
          </dl>
        </WorkbenchSurface>
      </div>
    </WorkbenchFrame>
  );
}
