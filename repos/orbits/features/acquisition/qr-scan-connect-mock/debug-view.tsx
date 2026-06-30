/**
 * QR 扫码建联 mock 的开发者面板。
 *
 * 面板展示扫码结果、互相关系上下文、证据和确认后的候选连接；
 * mock 流程不会写入真实联系人或连接图谱。
 */
import {
  Chip,
  Field,
  WorkbenchFrame,
  WorkbenchSurface,
} from "../../../shared/ui/primitives";
import {
  QR_SCAN_CONNECT_ERROR_DEFINITIONS,
  type QrConnectionDraft,
  type QrMutualConnectionContext,
} from "../qr-contract";
import { createMockQrScanConnectService } from "../mock-qr-service";

export const QR_SCAN_CONNECT_MOCK_SLUG = "qr-scan-connect-mock";

const liveImplementationNotesPath =
  "features/acquisition/qr-scan-connect-mock/LIVE_IMPLEMENTATION.md";
const pathWrapStyle = { overflowWrap: "anywhere" } as const;
const responsiveWorkbenchStyles = `
.qr-scan-connect-workbench {
  grid-template-columns: minmax(0, 1fr);
  overflow-x: clip;
}

.qr-scan-connect-workbench .workbench-shell,
.qr-scan-connect-workbench .workbench-surface,
.qr-scan-connect-workbench .workbench-grid,
.qr-scan-connect-workbench .relationship-meta,
.qr-scan-connect-workbench .control-stack,
.qr-scan-connect-workbench .chip-row,
.qr-scan-connect-workbench .button-row,
.qr-scan-connect-workbench form {
  min-width: 0;
}

.qr-scan-connect-workbench input,
.qr-scan-connect-workbench textarea {
  max-width: 100%;
  min-width: 0;
  width: 100%;
}

.qr-scan-connect-workbench code,
.qr-scan-connect-workbench dd,
.qr-scan-connect-workbench .orbit-chip,
.qr-scan-connect-workbench .source-list li {
  overflow-wrap: anywhere;
}

.qr-scan-connect-workbench .chip-row,
.qr-scan-connect-workbench .button-row {
  grid-template-columns: repeat(
    auto-fit,
    minmax(min(100%, 132px), max-content)
  );
}
`;

const qrApiProbes = [
  {
    label: "Scan relationship QR",
    command: "POST /api/contact-drafts/qr/scan",
    expectedStatus: 200,
    expectation:
      "Expect 200 success envelope with scan metadata, mutual context, and a pending connection draft.",
  },
  {
    label: "Confirm QR draft",
    command: "POST /api/contact-drafts/demo-qr-draft/confirm",
    expectedStatus: 200,
    expectation:
      "Expect 200 success envelope with contact and connection candidates that still have no live writes.",
  },
  {
    label: "Empty QR",
    command: "POST /api/contact-drafts/qr/scan?scenario=empty",
    expectedStatus: 200,
    expectation: "Expect 200 empty envelope with no mutual context or draft.",
  },
  {
    label: "Pending QR validation",
    command: "POST /api/contact-drafts/qr/scan?scenario=pending",
    expectedStatus: 200,
    expectation: "Expect 200 pending envelope with no draft.",
  },
  {
    label: "Controlled failure",
    command: "POST /api/contact-drafts/qr/scan?scenario=failure",
    expectedStatus: 503,
    expectation:
      "Expect 503 failure envelope with QR_SCAN_CONNECT_MOCK_FAILED context.",
  },
] as const;

const liveHandoffEvidenceExcerpts = [
  "Live service files live under features/acquisition/qr-scan-connect-mock/.",
  "ORBIT_QR_SCAN_PROVIDER switches from mock to live.",
  "Live replacement requires camera permission, QR decoder, and signature verifier controls.",
  "Replacement tests cover scan, confirm, empty, pending, invalid payload, and provider failure paths.",
] as const;

function EvidenceChips({ evidenceIds }: { evidenceIds: readonly string[] }) {
  return (
    <div className="chip-row" aria-label="QR scan evidence">
      {evidenceIds.map((evidenceId) => (
        <Chip key={evidenceId} tone="evidence">
          {evidenceId}
        </Chip>
      ))}
    </div>
  );
}

function MutualContextSummary({
  context,
}: {
  context: QrMutualConnectionContext;
}) {
  return (
    <dl className="relationship-meta">
      <div>
        <dt>Mutual connection context</dt>
        <dd>
          {context.eventName} via {context.introductionPath}
        </dd>
      </div>
      <div>
        <dt>Mutuals</dt>
        <dd>{context.mutualConnections.join(", ")}</dd>
      </div>
      <div>
        <dt>Topics</dt>
        <dd>{context.sharedTopics.join(", ")}</dd>
      </div>
      <div>
        <dt>Graph lookup</dt>
        <dd>
          <code>externalGraphLookupExecuted</code> stays{" "}
          <code>{String(context.externalGraphLookupExecuted)}</code>.
        </dd>
      </div>
    </dl>
  );
}

function DraftSummary({ draft }: { draft: QrConnectionDraft }) {
  return (
    <dl className="relationship-meta">
      <div>
        <dt>Connection draft</dt>
        <dd>
          <code>{draft.id}</code> for {draft.displayName}, {draft.role} at{" "}
          {draft.organization}.
        </dd>
      </div>
      <div>
        <dt>Source</dt>
        <dd>{draft.source.label}</dd>
      </div>
      <div>
        <dt>Writes</dt>
        <dd>
          <code>contactWriteExecuted</code> and{" "}
          <code>connectionWriteExecuted</code> remain{" "}
          <code>{String(draft.contactWriteExecuted)}</code>.
        </dd>
      </div>
    </dl>
  );
}

function QrScanPanel() {
  return (
    <WorkbenchSurface elevated eyebrow="Camera and QR decode" title="Mock input">
      <p className="type-body">
        This boundary treats the QR frame as a deterministic fixture or local
        text payload. It records scan metadata without touching camera hardware,
        QR decoder providers, signature verification, external graphs,
        persistence, AI, email, calendar, or notifications.
      </p>
      <form
        action="/api/contact-drafts/qr/scan"
        aria-label="Mock QR scan form"
        className="control-stack"
        method="post"
      >
        <Field
          label="QR payload"
          helper="Local fixture text stands in for a decoded relationship QR."
        >
          <textarea
            name="qrText"
            readOnly
            value={
              "orbit-qr:name=Mika Tan;role=Founder;organization=HelioGrid;event=Climate founders dinner;mutual=Rei Nakamura,Samir Patel;topic=grid resilience,community solar"
            }
          />
        </Field>
        <Field label="Scan label" helper="The mock never opens a camera.">
          <input
            name="scanLabel"
            readOnly
            type="text"
            value="mika-tan-heliogrid-qr.png"
          />
        </Field>
        <button className="primary-action" type="submit">
          Scan QR
        </button>
      </form>
      <div className="chip-row" aria-label="QR scan guardrails">
        <Chip tone="evidence">fixture QR</Chip>
        <Chip tone="privacy">no camera access</Chip>
        <Chip tone="confirmation">draft confirmation required</Chip>
      </div>
    </WorkbenchSurface>
  );
}

function ApiProbeActions() {
  return (
    <div className="control-stack" aria-label="QR scan API probe actions">
      <p className="type-body">
        Submit these probes only when collecting boundary evidence for the mock
        QR scan connect routes.
      </p>
      <div className="button-row">
        <form
          action="/api/contact-drafts/demo-qr-draft/confirm"
          aria-label="Run confirm QR draft API probe"
          method="post"
        >
          <button className="secondary-action" type="submit">
            Run confirm probe
          </button>
        </form>
        <form
          action="/api/contact-drafts/qr/scan?scenario=empty"
          aria-label="Run empty QR scan API probe"
          method="post"
        >
          <button className="secondary-action" type="submit">
            Run empty probe
          </button>
        </form>
        <form
          action="/api/contact-drafts/qr/scan?scenario=pending"
          aria-label="Run pending QR scan API probe"
          method="post"
        >
          <button className="secondary-action" type="submit">
            Run pending probe
          </button>
        </form>
        <form
          action="/api/contact-drafts/qr/scan?scenario=failure"
          aria-label="Run controlled failure QR scan API probe"
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

export function QrScanConnectMockDemo() {
  const scanService = createMockQrScanConnectService();
  const successState = scanService.scanQrCode();
  const emptyState = scanService.scanQrCode({ scenario: "empty" });
  const pendingState = scanService.scanQrCode({ scenario: "pending" });
  const failureState = scanService.scanQrCode({ scenario: "failure" });
  const successPayload = successState.success ? successState.data : null;
  const successDraft = successPayload?.draft ?? null;
  const mutualContext = successPayload?.mutualContext ?? null;

  return (
    <WorkbenchFrame className="qr-scan-connect-workbench">
      <style>{responsiveWorkbenchStyles}</style>
      <div className="workbench-shell">
        <header className="workbench-header">
          <p className="workbench-kicker">Developer capability runtime</p>
          <h1>QR scan connect mock</h1>
          <p className="workbench-intro">
            Mock-first boundary for scanning a relationship QR, preserving
            mutual context, and staging a source-backed connection draft before
            any live camera, validation, or write path exists.
          </p>
        </header>

        <QrScanPanel />

        <section className="workbench-grid" aria-label="QR scan connect states">
          <WorkbenchSurface
            elevated
            eyebrow={QR_SCAN_CONNECT_MOCK_SLUG}
            title="Success state"
          >
            {successPayload && successDraft && mutualContext && (
              <>
                <p className="type-body">{successPayload.summary}</p>
                <DraftSummary draft={successDraft} />
                <EvidenceChips
                  evidenceIds={successPayload.provenance.evidenceIds}
                />
              </>
            )}
          </WorkbenchSurface>

          <WorkbenchSurface eyebrow="Unreadable QR" title="Empty state">
            {emptyState.success && (
              <>
                <p className="type-body">{emptyState.data.nextAction}</p>
                <dl className="relationship-meta">
                  <div>
                    <dt>Mutual context</dt>
                    <dd>No mutual connection context is staged.</dd>
                  </div>
                  <div>
                    <dt>Draft</dt>
                    <dd>No QR connection draft is staged.</dd>
                  </div>
                </dl>
                <EvidenceChips
                  evidenceIds={emptyState.data.provenance.evidenceIds}
                />
              </>
            )}
          </WorkbenchSurface>

          <WorkbenchSurface eyebrow="Validation queue" title="Pending state">
            {pendingState.success && (
              <>
                <p className="type-body">{pendingState.data.summary}</p>
                <dl className="relationship-meta">
                  <div>
                    <dt>Scan</dt>
                    <dd>
                      <code>{pendingState.data.scan.scanId}</code>
                    </dd>
                  </div>
                  <div>
                    <dt>Draft</dt>
                    <dd>Confirmation is unavailable until validation resolves.</dd>
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
          eyebrow="Mutual connection context"
          title="The scan explains why the connection exists"
        >
          {mutualContext && (
            <>
              <p className="type-body">
                QR payload context stays attached to the draft so the future
                relationship record can explain the event, mutual contacts, and
                next action.
              </p>
              <MutualContextSummary context={mutualContext} />
            </>
          )}
        </WorkbenchSurface>

        <WorkbenchSurface
          eyebrow="API exercise surface"
          title="QR scan routes use shared envelopes"
        >
          <p className="type-body">
            These probes cover scan, confirm, empty, pending, and controlled
            failure paths without leaving the QR scan connect mock boundary.
          </p>
          <dl className="relationship-meta">
            <div>
              <dt>Failure mapping</dt>
              <dd>
                <code>
                  {
                    QR_SCAN_CONNECT_ERROR_DEFINITIONS
                      .QR_SCAN_CONNECT_MOCK_FAILED.code
                  }
                </code>{" "}
                maps to a shared failure envelope.
              </dd>
            </div>
          </dl>
          <ApiProbeActions />
          <dl className="relationship-meta" aria-label="QR scan API probes">
            {qrApiProbes.map((probe) => (
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
          title="Replacement notes stay with the QR scan capability"
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
                <code>ORBIT_QR_SCAN_PROVIDER</code>
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
