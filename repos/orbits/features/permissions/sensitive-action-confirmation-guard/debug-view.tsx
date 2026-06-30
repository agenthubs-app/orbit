/**
 * 敏感动作确认守卫 mock 的开发者面板。
 *
 * 这里展示待确认动作、approve/reject 结果和 guard 错误，确保敏感动作不会绕过确认。
 */
import {
  Chip,
  WorkbenchFrame,
  WorkbenchSurface,
} from "../../../shared/ui/primitives";
import {
  CONFIRMATION_GUARD_ERROR_DEFINITIONS,
  type ConfirmationRequirement,
} from "../confirmation-contract";
import { createMockSensitiveActionConfirmationService } from "../mock-confirmation-service";

export const SENSITIVE_ACTION_CONFIRMATION_GUARD_SLUG =
  "sensitive-action-confirmation-guard";

const liveImplementationNotesPath =
  "features/permissions/sensitive-action-confirmation-guard/LIVE_IMPLEMENTATION.md";
const pathWrapStyle = { overflowWrap: "anywhere" } as const;

const confirmationApiProbes = [
  {
    label: "Approve confirmation",
    command: "POST /api/confirmations/demo-confirmation-1/approve",
    curlCommand:
      "curl -s -X POST http://localhost:3000/api/confirmations/demo-confirmation-1/approve",
    expectedStatus: 200,
    expectation:
      "Expect 200 success envelope with an approved mock decision and no executed action.",
  },
  {
    label: "Reject confirmation",
    command: "POST /api/confirmations/demo-confirmation-1/reject",
    curlCommand:
      "curl -s -X POST http://localhost:3000/api/confirmations/demo-confirmation-1/reject",
    expectedStatus: 200,
    expectation:
      "Expect 200 success envelope with a rejected mock decision and no executed action.",
  },
  {
    label: "Missing confirmation",
    command: "POST /api/confirmations/missing-confirmation/approve",
    curlCommand:
      "curl -s -X POST http://localhost:3000/api/confirmations/missing-confirmation/approve",
    expectedStatus: 404,
    expectation:
      "Expect 404 failure envelope with CONFIRMATION_REQUIREMENT_NOT_FOUND context.",
  },
  {
    label: "Controlled failure",
    command:
      "POST /api/confirmations/demo-confirmation-1/reject?scenario=failure",
    curlCommand:
      "curl -s -X POST http://localhost:3000/api/confirmations/demo-confirmation-1/reject?scenario=failure",
    expectedStatus: 503,
    expectation:
      "Expect 503 failure envelope with CONFIRMATION_GUARD_MOCK_FAILED context.",
  },
] as const;

function EvidenceChips({ evidenceIds }: { evidenceIds: readonly string[] }) {
  return (
    <div className="chip-row" aria-label="Confirmation guard evidence">
      {evidenceIds.map((evidenceId) => (
        <Chip key={evidenceId} tone="evidence">
          {evidenceId}
        </Chip>
      ))}
    </div>
  );
}

function RequirementRows({
  requirements,
}: {
  requirements: readonly ConfirmationRequirement[];
}) {
  return (
    <dl className="relationship-meta">
      {requirements.map((requirement) => (
        <div key={requirement.id}>
          <dt>{requirement.action.label}</dt>
          <dd>
            <code>{requirement.id}</code> guards{" "}
            {requirement.action.summary} {requirement.action.mockEffect}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function PendingActionContext({
  requirement,
}: {
  requirement: ConfirmationRequirement;
}) {
  const [primaryEvidence] = requirement.evidence;

  return (
    <div aria-label="Pending action under review">
      <p className="type-caption">Pending action under review</p>
      <dl className="relationship-meta">
        <div>
          <dt>Action</dt>
          <dd>
            {requirement.action.label} for {requirement.action.targetLabel}.{" "}
            {requirement.confirmationQuestion}
          </dd>
        </div>
        <div>
          <dt>Source context</dt>
          <dd>
            {primaryEvidence.sourceLabel}{" "}
            <code>{primaryEvidence.evidenceId}</code>:{" "}
            {primaryEvidence.excerpt}
          </dd>
        </div>
        <div>
          <dt>Payload preview</dt>
          <dd>{requirement.action.payloadPreview}</dd>
        </div>
        <div>
          <dt>Mock effect</dt>
          <dd>{requirement.action.mockEffect}</dd>
        </div>
      </dl>
    </div>
  );
}

export function SensitiveActionConfirmationGuardDemo() {
  const confirmationService = createMockSensitiveActionConfirmationService();
  const successState = confirmationService.listConfirmationRequirements();
  const emptyState = confirmationService.listConfirmationRequirements({
    scenario: "empty",
  });
  const pendingState = confirmationService.listConfirmationRequirements({
    scenario: "pending",
  });
  const failureState = confirmationService.listConfirmationRequirements({
    scenario: "failure",
  });
  const approvedState = confirmationService.approveConfirmation({
    confirmationId: "demo-confirmation-1",
  });
  const rejectedState = confirmationService.rejectConfirmation({
    confirmationId: "demo-confirmation-1",
  });
  const pendingRequirement = pendingState.success
    ? pendingState.data.requirements[0]
    : null;

  return (
    <WorkbenchFrame>
      <div className="workbench-shell">
        <header className="workbench-header">
          <p className="workbench-kicker">Developer capability runtime</p>
          <h1>Sensitive action confirmation guard</h1>
          <p className="workbench-intro">
            Mock-first confirmation boundary for message sends, contact writes,
            calendar event creation, and profile updates. Every action resolves
            to deterministic review data instead of performing the sensitive
            operation.
          </p>
        </header>

        <section
          className="workbench-grid"
          aria-label="Sensitive action confirmation guard states"
        >
          <WorkbenchSurface
            elevated
            eyebrow={SENSITIVE_ACTION_CONFIRMATION_GUARD_SLUG}
            title="Success state"
          >
            {successState.success && (
              <>
                <p className="type-body">{successState.data.summary}</p>
                <RequirementRows
                  requirements={successState.data.requirements}
                />
                <EvidenceChips
                  evidenceIds={successState.data.provenance.evidenceIds}
                />
              </>
            )}
          </WorkbenchSurface>

          <WorkbenchSurface eyebrow="No action queued" title="Empty state">
            {emptyState.success && (
              <>
                <p className="type-body">{emptyState.data.nextAction}</p>
                <dl className="relationship-meta">
                  <div>
                    <dt>Queued action</dt>
                    <dd>No sensitive action is waiting in this scenario.</dd>
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

          <WorkbenchSurface eyebrow="Review needed" title="Pending state">
            {pendingState.success && (
              <>
                <p className="type-body">{pendingState.data.summary}</p>
                <RequirementRows
                  requirements={pendingState.data.requirements}
                />
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
          eyebrow="Decision sandbox"
          title="Approve or reject without executing the action"
        >
          {approvedState.success && rejectedState.success && pendingRequirement && (
            <>
              <p className="type-body">
                {approvedState.data.decision.outcomeSummary}{" "}
                {rejectedState.data.nextAction}
              </p>
              <dl className="relationship-meta">
                <div>
                  <dt>Approved decision</dt>
                  <dd>
                    <code>{approvedState.data.decision.id}</code> keeps{" "}
                    <code>externalActionExecuted</code> set to{" "}
                    <code>false</code>.
                  </dd>
                </div>
                <div>
                  <dt>Rejected decision</dt>
                  <dd>
                    <code>{rejectedState.data.decision.id}</code> records the
                    operator choice while the draft stays in review.
                  </dd>
                </div>
              </dl>
              <div className="chip-row" aria-label="Confirmation guardrails">
                <Chip tone="privacy">mock only</Chip>
                <Chip tone="confirmation">explicit confirmation</Chip>
                <Chip tone="evidence">source-backed action</Chip>
              </div>
              <PendingActionContext requirement={pendingRequirement} />
              <div className="button-row" aria-label="Confirmation actions">
                <form
                  action="/api/confirmations/demo-confirmation-1/approve"
                  method="post"
                  aria-label="Approve demo confirmation"
                >
                  <button className="primary-action" type="submit">
                    Approve mock action
                  </button>
                </form>
                <form
                  action="/api/confirmations/demo-confirmation-1/reject"
                  method="post"
                  aria-label="Reject demo confirmation"
                >
                  <button className="secondary-action" type="submit">
                    Reject mock action
                  </button>
                </form>
              </div>
              <p className="type-caption">
                The forms return API envelopes from the mock guard. They do not
                send messages, write contacts, create calendar events, or save
                profile fields.
              </p>
            </>
          )}
        </WorkbenchSurface>

        <WorkbenchSurface
          eyebrow="API exercise surface"
          title="Confirmation routes use shared envelopes"
        >
          <p className="type-body">
            Run these probes against the dev server to verify approve, reject,
            missing confirmation, and controlled failure envelopes inside the
            mock boundary.
          </p>
          <dl className="relationship-meta">
            <div>
              <dt>Approve route</dt>
              <dd>
                <code>POST /api/confirmations/demo-confirmation-1/approve</code>{" "}
                returns an approval record and leaves the action unexecuted.
              </dd>
            </div>
            <div>
              <dt>Reject route</dt>
              <dd>
                <code>POST /api/confirmations/demo-confirmation-1/reject</code>{" "}
                returns a rejection record and keeps the source draft in review.
              </dd>
            </div>
            <div>
              <dt>Failure mapping</dt>
              <dd>
                <code>
                  {
                    CONFIRMATION_GUARD_ERROR_DEFINITIONS
                      .CONFIRMATION_GUARD_MOCK_FAILED.code
                  }
                </code>{" "}
                maps to a shared failure envelope.
              </dd>
            </div>
          </dl>
          <dl
            className="relationship-meta"
            aria-label="Confirmation guard API probes"
          >
            {confirmationApiProbes.map((probe) => (
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
          title="Replacement notes stay with the confirmation capability"
        >
          <dl className="relationship-meta">
            <div>
              <dt>Handoff doc</dt>
              <dd>
                <code style={pathWrapStyle}>{liveImplementationNotesPath}</code>
              </dd>
            </div>
            <div>
              <dt>Provider files</dt>
              <dd>
                <code style={pathWrapStyle}>
                  features/permissions/live-confirmation-service.ts
                </code>{" "}
                replaces the mock only after approve and reject paths have
                replacement tests for every sensitive action kind.
              </dd>
            </div>
            <div>
              <dt>Switch and env</dt>
              <dd>
                Feature mode stays explicit, and live mode requires{" "}
                <code>ORBIT_CONFIRMATION_PROVIDER</code> before any sensitive
                action can leave the mock sandbox.
              </dd>
            </div>
            <div>
              <dt>Privacy and tests</dt>
              <dd>
                Replacement tests must preserve source and evidence provenance,
                prove every decision was confirmed, and keep raw service errors
                out of API envelopes.
              </dd>
            </div>
          </dl>
        </WorkbenchSurface>
      </div>
    </WorkbenchFrame>
  );
}
