/**
 * 新建/扫描联系人页 route adapter。
 *
 * route 只负责挂载样式/runtime，并把 acquisition 工作台状态交给页面边界渲染。
 */
import { OrbitReferenceStyles } from "../../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../../orbit-visual-freeze-runtime";
import { StateView } from "../../../../../shared/ui/state-view";
import {
  loadAppContactsNewRouteViewModel,
  type AppContactsNewSearchParams,
} from "./compose-app-contacts-new-from-previously-approved-mock-first-capabilities/contacts-new-route-services";

interface AppContactsNewPageProps {
  searchParams?: Promise<AppContactsNewSearchParams>;
}

type ResultLike = {
  success: boolean;
  data?: unknown;
  error?: {
    code?: string;
    message?: string;
  };
};

interface AcquisitionWorkspaceView {
  cardState: ResultLike;
  draftQueue: ResultLike;
  eventState: ResultLike;
  externalState: ResultLike;
  manualState: ResultLike;
  mergeState: ResultLike;
  permissionState: ResultLike;
  qrState: ResultLike;
  referralState: ResultLike;
  signalState: ResultLike;
}

function statusLabel(result: ResultLike): string {
  if (result.success) {
    return "Ready";
  }

  return result.error?.code ?? "Unavailable";
}

function resultMetric(result: ResultLike): string {
  if (!result.success || result.data === undefined) {
    return "0";
  }

  const numericField =
    typeof result.data === "object" && result.data !== null
      ? Object.values(result.data).find((value) => Array.isArray(value))
      : null;

  if (Array.isArray(numericField)) {
    return String(numericField.length);
  }

  return "1";
}

function AcquisitionStateBoundary({
  routeState,
}: {
  routeState: {
    errorCode?: string;
    evidenceIds?: readonly string[];
    scenario: string;
  };
}) {
  return (
    <main
      data-orbit-route="app-contacts-new-route"
      style={{ minHeight: "100dvh", padding: "32px", background: "var(--bg)" }}
    >
      <StateView
        description={
          routeState.errorCode
            ? `Live storage returned ${routeState.errorCode}.`
            : "The acquisition workspace is waiting for source records."
        }
        evidence={[...(routeState.evidenceIds ?? [])]}
        eyebrow="Acquisition"
        recoveryActions={[
          {
            href: "/app/contacts/new?mode=mock",
            id: "open-preview-data",
            label: "Open preview data",
            recoveryCopy: "Use deterministic preview records while live storage is being configured.",
          },
          {
            href: "/app/contacts",
            id: "back-to-contacts",
            label: "Back to contacts",
            recoveryCopy: "Return to the contact list without running acquisition actions.",
          },
        ]}
        title="Contact acquisition workspace could not load"
      />
    </main>
  );
}

function AcquisitionWorkspace({
  workspace,
}: {
  workspace: AcquisitionWorkspaceView;
}) {
  const sections = [
    ["Manual draft", workspace.manualState],
    ["Business card scan", workspace.cardState],
    ["QR connection", workspace.qrState],
    ["Event attendee import", workspace.eventState],
    ["External contacts", workspace.externalState],
    ["Email/calendar signals", workspace.signalState],
    ["Referral drafts", workspace.referralState],
    ["Duplicate merge", workspace.mergeState],
    ["Draft queue", workspace.draftQueue],
    ["Permissions", workspace.permissionState],
  ] as const;

  return (
    <main
      data-orbit-route="app-contacts-new-route"
      style={{
        minHeight: "100dvh",
        background: "var(--bg)",
        color: "var(--text)",
        padding: "32px",
      }}
    >
      <div style={{ maxWidth: 1120, margin: "0 auto" }}>
        <div style={{ marginBottom: 24 }}>
          <p style={{ color: "var(--text-3)", fontSize: 12, fontWeight: 650, margin: "0 0 8px" }}>
            Contact acquisition
          </p>
          <h1 className="h-display" style={{ margin: 0 }}>
            New contact workspace
          </h1>
        </div>
        <div
          style={{
            display: "grid",
            gap: 12,
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          }}
        >
          {sections.map(([label, result]) => (
            <section
              key={label}
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                minHeight: 116,
                padding: 16,
              }}
            >
              <div style={{ color: "var(--text-3)", fontSize: 12, fontWeight: 650 }}>
                {label}
              </div>
              <div style={{ fontSize: 24, fontWeight: 750, marginTop: 12 }}>
                {resultMetric(result)}
              </div>
              <div style={{ color: "var(--text-2)", fontSize: 13, marginTop: 8 }}>
                {statusLabel(result)}
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}

export default async function AppContactScanPage({
  searchParams,
}: AppContactsNewPageProps = {}) {
  const viewModel = await loadAppContactsNewRouteViewModel(await searchParams);

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      {viewModel.state === "route-state" ? (
        <AcquisitionStateBoundary routeState={viewModel.routeState} />
      ) : (
        <AcquisitionWorkspace workspace={viewModel.workspace} />
      )}
    </>
  );
}
