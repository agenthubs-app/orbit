import {
  Chip,
  WorkbenchFrame,
  WorkbenchSurface,
} from "../../../shared/ui/primitives";
import {
  PERMISSION_STATE_ERROR_DEFINITIONS,
  type PermissionStateRecord,
} from "../contract";
import { createMockPermissionStateService } from "../mock-service";

export const PERMISSION_STATE_CAPABILITY_SLUG =
  "permission-state-and-staged-authorization-mock";

const liveImplementationNotesPath =
  "features/permissions/permission-state-and-staged-authorization-mock/LIVE_IMPLEMENTATION.md";
const pathWrapStyle = { overflowWrap: "anywhere" } as const;

const permissionApiProbes = [
  {
    label: "Permission state",
    command: "GET /api/permissions",
    curlCommand: "curl -s http://localhost:3000/api/permissions",
    expectedStatus: 200,
    expectation:
      "Expect 200 success envelope with all staged permission states.",
  },
  {
    label: "Empty workflow",
    command: "GET /api/permissions?scenario=empty",
    curlCommand: "curl -s http://localhost:3000/api/permissions?scenario=empty",
    expectedStatus: 200,
    expectation: "Expect 200 success envelope with no selected workflow.",
  },
  {
    label: "Pending calendar review",
    command: "GET /api/permissions?scenario=pending",
    curlCommand:
      "curl -s http://localhost:3000/api/permissions?scenario=pending",
    expectedStatus: 200,
    expectation:
      "Expect 200 success envelope with calendar staged for review.",
  },
  {
    label: "Calendar request",
    command: "POST /api/permissions/calendar/request",
    curlCommand:
      "curl -s -X POST http://localhost:3000/api/permissions/calendar/request",
    expectedStatus: 200,
    expectation:
      "Expect 200 success envelope with a staged authorization request.",
  },
  {
    label: "Blocked request",
    command: "POST /api/permissions/calendar/request?scenario=blocked",
    curlCommand:
      "curl -s -X POST http://localhost:3000/api/permissions/calendar/request?scenario=blocked",
    expectedStatus: 403,
    expectation:
      "Expect 403 failure envelope with PERMISSION_REQUEST_NOT_ALLOWED context.",
  },
  {
    label: "Controlled failure",
    command: "GET /api/permissions?scenario=failure",
    curlCommand:
      "curl -s http://localhost:3000/api/permissions?scenario=failure",
    expectedStatus: 503,
    expectation:
      "Expect 503 failure envelope with PERMISSION_STATE_MOCK_FAILED context.",
  },
] as const;

function EvidenceChips({ evidenceIds }: { evidenceIds: readonly string[] }) {
  return (
    <div className="chip-row" aria-label="Permission state evidence">
      {evidenceIds.map((evidenceId) => (
        <Chip key={evidenceId} tone="evidence">
          {evidenceId}
        </Chip>
      ))}
    </div>
  );
}

function PermissionRows({
  permissions,
}: {
  permissions: readonly PermissionStateRecord[];
}) {
  return (
    <dl className="relationship-meta">
      {permissions.map((permission) => (
        <div key={permission.capability}>
          <dt>{permission.label}</dt>
          <dd>
            <code>{permission.status}</code> for {permission.requiredFor}{" "}
            {permission.rationale}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function PermissionStateCapabilityDemo() {
  const permissionService = createMockPermissionStateService();
  const successState = permissionService.listPermissionStates();
  const emptyState = permissionService.listPermissionStates({
    scenario: "empty",
  });
  const pendingState = permissionService.listPermissionStates({
    scenario: "pending",
  });
  const failureState = permissionService.listPermissionStates({
    scenario: "failure",
  });
  const calendarRequestState = permissionService.requestPermission({
    capability: "calendar",
    intent: "connect-event-calendar",
  });

  return (
    <WorkbenchFrame>
      <div className="workbench-shell">
        <header className="workbench-header">
          <p className="workbench-kicker">Developer capability runtime</p>
          <h1>Permission state and staged authorization mock</h1>
          <p className="workbench-intro">
            Mock-first boundary for contacts, calendar, email, notifications,
            camera, business-card scan, event data, and chat analysis
            permissions. Sensitive access is rehearsed as sourced staged
            authorization, not as browser, device, account, or provider work.
          </p>
        </header>

        <section
          className="workbench-grid"
          aria-label="Permission state and staged authorization states"
        >
          <WorkbenchSurface
            elevated
            eyebrow={PERMISSION_STATE_CAPABILITY_SLUG}
            title="Success state"
          >
            {successState.success && (
              <>
                <p className="type-body">{successState.data.summary}</p>
                <PermissionRows permissions={successState.data.permissions} />
                <EvidenceChips
                  evidenceIds={successState.data.provenance.evidenceIds}
                />
              </>
            )}
          </WorkbenchSurface>

          <WorkbenchSurface eyebrow="No workflow" title="Empty state">
            {emptyState.success && (
              <>
                <p className="type-body">{emptyState.data.nextAction}</p>
                <dl className="relationship-meta">
                  <div>
                    <dt>Selected workflow</dt>
                    <dd>No permission workflow is active in this scenario.</dd>
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
                <PermissionRows permissions={pendingState.data.permissions} />
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
          eyebrow="Staged authorization review"
          title="Calendar access is a review payload, not a redirect"
        >
          {calendarRequestState.success && (
            <>
              <p className="type-body">{calendarRequestState.data.nextAction}</p>
              <dl className="relationship-meta">
                <div>
                  <dt>Request id</dt>
                  <dd>
                    <code>{calendarRequestState.data.request.id}</code>
                  </dd>
                </div>
                <div>
                  <dt>Intent</dt>
                  <dd>
                    <code>{calendarRequestState.data.request.intent}</code>{" "}
                    remains inside a deterministic review state.
                  </dd>
                </div>
                <div>
                  <dt>Mock replacement</dt>
                  <dd>
                    No browser prompt. No provider redirect. No device access.
                  </dd>
                </div>
              </dl>
              <div className="chip-row" aria-label="Permission guardrails">
                <Chip tone="privacy">mock only</Chip>
                <Chip tone="confirmation">explicit review</Chip>
                <Chip tone="evidence">source-backed permission</Chip>
              </div>
              <form
                action="/api/permissions/calendar/request"
                method="post"
                aria-label="Run staged calendar authorization review"
                className="button-row"
              >
                <input
                  type="hidden"
                  name="intent"
                  value={calendarRequestState.data.request.intent}
                />
                <button className="primary-action" type="submit">
                  Run staged calendar review
                </button>
              </form>
              <p className="type-caption">
                This submits to the mock route and renders an API envelope
                response; it never starts OAuth, browser permission prompts,
                camera access, notifications, or provider authorization.
              </p>
            </>
          )}
        </WorkbenchSurface>

        <WorkbenchSurface
          eyebrow="API exercise surface"
          title="Permission routes use shared envelopes"
        >
          <p className="type-body">
            Run these probes against the dev server to verify success, empty,
            pending, staged request, blocked request, and controlled failure
            envelopes inside the mock boundary.
          </p>
          <dl className="relationship-meta">
            <div>
              <dt>Permission list</dt>
              <dd>
                <code>GET /api/permissions</code> returns the deterministic
                state for every permission boundary.
              </dd>
            </div>
            <div>
              <dt>Calendar request</dt>
              <dd>
                <code>POST /api/permissions/calendar/request</code> returns the
                staged review payload required before calendar context is used.
              </dd>
            </div>
            <div>
              <dt>Failure mapping</dt>
              <dd>
                <code>
                  {
                    PERMISSION_STATE_ERROR_DEFINITIONS
                      .PERMISSION_STATE_MOCK_FAILED.code
                  }
                </code>{" "}
                maps to a shared failure envelope.
              </dd>
            </div>
          </dl>
          <dl
            className="relationship-meta"
            aria-label="Permission state API probes"
          >
            {permissionApiProbes.map((probe) => (
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
          title="Replacement notes stay with the permission capability"
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
                  features/permissions/live-service.ts
                </code>{" "}
                replaces mock fixtures only after consent, account, browser,
                device, event, chat, calendar, email, and reminder adapters have
                replacement tests.
              </dd>
            </div>
            <div>
              <dt>Switch and env</dt>
              <dd>
                Feature mode stays explicit, and live mode requires{" "}
                <code>ORBIT_PERMISSION_AUTH_PROVIDER</code> before any staged
                review can resolve to a real provider.
              </dd>
            </div>
            <div>
              <dt>Privacy and tests</dt>
              <dd>
                Replacement tests must preserve source and evidence provenance,
                prove sensitive actions stay confirmed, and hide raw provider
                errors from the API envelope.
              </dd>
            </div>
          </dl>
        </WorkbenchSurface>
      </div>
    </WorkbenchFrame>
  );
}
