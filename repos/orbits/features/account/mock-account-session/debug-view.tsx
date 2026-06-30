/**
 * 账号会话 mock 的开发者面板。
 *
 * 这里展示 demo session、登出、pending 和 failure 等会话状态，
 * 用来验证账号 API envelope 和 live auth 接入前的边界。
 */
import {
  Chip,
  WorkbenchFrame,
  WorkbenchSurface,
} from "../../../shared/ui/primitives";
import { ACCOUNT_SESSION_ERROR_DEFINITIONS } from "../contract";
import { createMockAccountSessionService } from "../mock-service";

export const MOCK_ACCOUNT_SESSION_CAPABILITY_SLUG = "mock-account-session";

const liveImplementationNotesPath =
  "features/account/mock-account-session/LIVE_IMPLEMENTATION.md";
const pathWrapStyle = { overflowWrap: "anywhere" } as const;

const accountApiProbes = [
  {
    label: "Demo session",
    command: "GET /api/account/me",
    expectation: "Expect 200 success envelope with the demo account payload.",
  },
  {
    label: "Signed out",
    command: "GET /api/account/me?scenario=signed-out",
    expectation: "Expect 200 success envelope with the empty session payload.",
  },
  {
    label: "Pending demo sign-in",
    command: "GET /api/account/me?scenario=pending",
    expectation: "Expect 200 success envelope with the pending session payload.",
  },
  {
    label: "Require account guard",
    command: "GET /api/account/me?scenario=require-account",
    expectation: "Expect 401 failure envelope with ACCOUNT_REQUIRED context.",
  },
  {
    label: "Sign out",
    command: "POST /api/account/session/sign-out",
    expectation: "Expect 200 success envelope with the empty session payload.",
  },
] as const;

function EvidenceChips({ evidenceIds }: { evidenceIds: readonly string[] }) {
  return (
    <div className="chip-row" aria-label="Account session evidence">
      {evidenceIds.map((evidenceId) => (
        <Chip key={evidenceId} tone="evidence">
          {evidenceId}
        </Chip>
      ))}
    </div>
  );
}

export function MockAccountSessionCapabilityDemo() {
  const accountService = createMockAccountSessionService();
  const successState = accountService.demoSignIn();
  const emptyState = accountService.getSignedOutSession();
  const pendingState = accountService.getPendingDemoSignIn();
  const failureState = accountService.requireAccount("signed-out");

  return (
    <WorkbenchFrame>
      <div className="workbench-shell">
        <header className="workbench-header">
          <p className="workbench-kicker">Developer capability runtime</p>
          <h1>Mock account session capability</h1>
          <p className="workbench-intro">
            Dev-only account session boundary for exercising demo sign-in,
            signed-out, pending, and require-account behavior without auth
            providers or remote account lookup.
          </p>
        </header>

        <section
          className="workbench-grid"
          aria-label="Mock account session states"
        >
          <WorkbenchSurface
            elevated
            eyebrow={MOCK_ACCOUNT_SESSION_CAPABILITY_SLUG}
            title="Success state"
          >
            {successState.success && (
              <>
                <dl className="relationship-meta">
                  <div>
                    <dt>Operator</dt>
                    <dd>{successState.data.account?.displayName}</dd>
                  </div>
                  <div>
                    <dt>Workspace</dt>
                    <dd>{successState.data.account?.workspaceName}</dd>
                  </div>
                  <div>
                    <dt>Relationship goal</dt>
                    <dd>{successState.data.profile?.relationshipGoal}</dd>
                  </div>
                  <div>
                    <dt>Session</dt>
                    <dd>
                      <code>{successState.data.session.mockSessionId}</code>{" "}
                      resolves as <code>{successState.data.session.status}</code>.
                    </dd>
                  </div>
                </dl>
                <EvidenceChips
                  evidenceIds={successState.data.provenance.evidenceIds}
                />
              </>
            )}
          </WorkbenchSurface>

          <WorkbenchSurface eyebrow="Signed out" title="Empty state">
            {emptyState.success && (
              <>
                <p className="type-body">{emptyState.data.nextAction}</p>
                <dl className="relationship-meta">
                  <div>
                    <dt>Account</dt>
                    <dd>No active mock account is attached.</dd>
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

          <WorkbenchSurface eyebrow="Demo sign-in" title="Pending state">
            {pendingState.success && (
              <>
                <p className="type-body">{pendingState.data.nextAction}</p>
                <dl className="relationship-meta">
                  <div>
                    <dt>Pending session</dt>
                    <dd>
                      <code>{pendingState.data.session.mockSessionId}</code>
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

          <WorkbenchSurface eyebrow="Require account guard" title="Failure state">
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
          eyebrow="API exercise surface"
          title="Mock account routes use shared envelopes"
        >
          <p className="type-body">
            Run these probes against the dev server to verify success, empty,
            pending, and failure envelopes without leaving the mock boundary.
          </p>
          <dl className="relationship-meta">
            <div>
              <dt>Current account</dt>
              <dd>
                <code>GET /api/account/me</code> returns the demo account in a
                success envelope, with query scenarios for signed-out, pending,
                and require-account paths.
              </dd>
            </div>
            <div>
              <dt>Sign out</dt>
              <dd>
                <code>POST /api/account/session/sign-out</code> returns a
                deterministic empty session payload without changing stored
                state.
              </dd>
            </div>
            <div>
              <dt>Controlled failure</dt>
              <dd>
                <code>
                  {ACCOUNT_SESSION_ERROR_DEFINITIONS.ACCOUNT_REQUIRED.code}
                </code>{" "}
                maps to a shared failure envelope and includes account-specific
                context.
              </dd>
            </div>
          </dl>
          <dl
            className="relationship-meta"
            aria-label="Mock account API probes"
          >
            {accountApiProbes.map((probe) => (
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
          <div className="chip-row" aria-label="Account session guardrails">
            <Chip tone="privacy">mock only</Chip>
            <Chip tone="evidence">source-backed fixture</Chip>
            <Chip tone="confirmation">require-account guard</Chip>
          </div>
        </WorkbenchSurface>

        <WorkbenchSurface
          eyebrow="Mock-to-live handoff"
          title="Replacement notes stay with the account capability"
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
                replacement tests are documented before live auth is wired.
              </dd>
            </div>
          </dl>
        </WorkbenchSurface>
      </div>
    </WorkbenchFrame>
  );
}
