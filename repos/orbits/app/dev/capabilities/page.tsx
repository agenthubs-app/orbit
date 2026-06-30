/* eslint-disable no-unused-vars -- The base ESLint config lacks JSX variable usage tracking. */
/**
 * Capability registry 开发页。
 *
 * 这里展示所有已注册 capability 的 mock/hybrid/live 解析状态，
 * 并把 live 接入前需要补齐的 provider、env、测试和权限边界列出来。
 */
import "../../globals.css";
import {
  Chip,
  WorkbenchFrame,
  WorkbenchSurface,
} from "../../../shared/ui/primitives";
import {
  listCapabilitySummaries,
  type CapabilitySummary,
} from "../../../shared/services/capability-registry";

const capabilities = listCapabilitySummaries();
const liveModePreview = listCapabilitySummaries({
  mode: "live",
});
const liveBlockedCount = liveModePreview.filter(
  (capability) => capability.serviceStatus === "not-implemented",
).length;
const capabilityDebugDashboardRoute =
  "/dev/capabilities/capability-debug-dashboard";
const liveImplementationNotesPath =
  "shared/services/create-the-standard-way-pages-and-routes-obtain-mock-hybrid-or-live-services/LIVE_IMPLEMENTATION.md";
const pathWrapStyle = { overflowWrap: "anywhere" } as const;
const actionLinkStyle = {
  alignItems: "center",
  display: "inline-flex",
  fontWeight: 700,
  justifyContent: "center",
  minHeight: 40,
  textDecoration: "none",
} as const;

const handoffCoverage = [
  "Live service and provider files",
  "Switch mechanism",
  "Required env vars and permissions",
  "Privacy and provenance constraints",
  "Replacement tests",
] as const;

const operatorHandoffSteps = [
  {
    label: "Add provider boundary",
    detail:
      "Create the live-service, provider, mapper, and validator files for one capability before touching a page or route handler.",
  },
  {
    label: "Switch deliberately",
    detail:
      "Register the live constructor in the shared registry and select live mode through ORBIT_MODULE_MODE or an explicit test setup.",
  },
  {
    label: "Prove replacement",
    detail:
      "Replace the NOT_IMPLEMENTED expectation with mapper, factory, route-envelope, confirmation-guard, and privacy tests.",
  },
] as const;

const modeTone: Record<
  CapabilitySummary["currentMode"],
  "evidence" | "confirmation" | "privacy"
> = {
  mock: "evidence",
  hybrid: "confirmation",
  live: "privacy",
};

function apiRouteLabel(route: CapabilitySummary["api"]["routes"][number]) {
  return `${route.method} ${route.path}`;
}

export default function CapabilitiesPage() {
  return (
    <WorkbenchFrame>
      <div className="workbench-shell">
        <header className="workbench-header">
          <p className="workbench-kicker">Developer capability runtime</p>
          <h1>Capability registry</h1>
          <p className="workbench-intro">
            Read-only summary for how Orbit pages and route handlers obtain
            mock, hybrid, or live services. Every registered capability defaults
            to mock mode until a live provider is explicitly added behind the
            shared service factory.
          </p>
        </header>

        <WorkbenchSurface
          elevated
          eyebrow="Mode resolution"
          title="Current mode defaults to mock"
        >
          <dl className="relationship-meta">
            <div>
              <dt>Registered capabilities</dt>
              <dd>{capabilities.length} service factories are available.</dd>
            </div>
            <div>
              <dt>Current mode</dt>
              <dd>
                All capabilities resolve through <code>mock</code> mode by
                default. Pages and route handlers can request <code>hybrid</code>{" "}
                or <code>live</code> through the shared factory.
              </dd>
            </div>
            <div>
              <dt>Live guard</dt>
              <dd>
                {liveBlockedCount} live services return a controlled{" "}
                <code>NOT_IMPLEMENTED</code> failure until provider files and
                replacement tests exist.
              </dd>
            </div>
          </dl>
          <div className="chip-row" aria-label="Capability mode guardrails">
            <Chip tone="evidence">mock default</Chip>
            <Chip tone="confirmation">hybrid factory</Chip>
            <Chip tone="privacy">live guarded</Chip>
          </div>
        </WorkbenchSurface>

        <WorkbenchSurface
          elevated
          eyebrow="Debug dashboard"
          title="Capability debug dashboard"
        >
          <p className="type-body">
            Open a single mock-first dashboard that links all registered
            capabilities, mock scenarios, API probes, and reset controls for
            evaluator evidence.
          </p>
          <div className="button-row">
            <a
              className="secondary-action"
              href={capabilityDebugDashboardRoute}
              style={actionLinkStyle}
            >
              Open dashboard
            </a>
          </div>
        </WorkbenchSurface>

        <WorkbenchSurface
          eyebrow="Operator handoff"
          title="Implementation coverage is documented before live providers"
        >
          <p className="type-body">
            The live handoff keeps operators focused on the exact work needed
            to move a capability from mock to live without bypassing provenance,
            consent, or the API envelope.
          </p>
          <dl className="relationship-meta" aria-label="Live handoff coverage">
            <div>
              <dt>Handoff doc</dt>
              <dd>
                <code style={pathWrapStyle}>{liveImplementationNotesPath}</code>
              </dd>
            </div>
            <div>
              <dt>Implementation coverage</dt>
              <dd>
                {handoffCoverage.map((coverageItem) => (
                  <span key={coverageItem}>
                    <code>{coverageItem}</code>{" "}
                  </span>
                ))}
              </dd>
            </div>
          </dl>
          <dl
            className="guard-list"
            aria-label="Operator handoff checklist"
          >
            {operatorHandoffSteps.map((step) => (
              <div key={step.label}>
                <dt>{step.label}</dt>
                <dd>{step.detail}</dd>
              </div>
            ))}
          </dl>
        </WorkbenchSurface>

        <section
          className="workbench-grid"
          aria-label="Registered capability services"
        >
          {capabilities.map((capability) => (
            <WorkbenchSurface
              key={capability.id}
              eyebrow={capability.serviceStatus}
              title={capability.label}
            >
              <div id={capability.id} className="relationship-record">
                <p className="type-body">{capability.description}</p>
                <div
                  className="chip-row"
                  aria-label={`${capability.label} service mode`}
                >
                  <Chip tone={modeTone[capability.currentMode]}>
                    {capability.currentMode}
                  </Chip>
                  <Chip tone="primary">{capability.defaultMode} default</Chip>
                </div>
                <dl className="relationship-meta">
                  <div>
                    <dt>Current mode</dt>
                    <dd>
                      <code>{capability.currentMode}</code> via{" "}
                      <code>{capability.serviceStatus}</code>.
                    </dd>
                  </div>
                  <div>
                    <dt>API metadata</dt>
                    <dd>
                      {capability.api.routes.map((route) => (
                        <span key={`${route.method}-${route.path}`}>
                          <code>{apiRouteLabel(route)}</code> {route.purpose}{" "}
                        </span>
                      ))}
                    </dd>
                  </div>
                  <div>
                    <dt>Debug route</dt>
                    <dd>
                      <code>{capability.debug.route}</code>{" "}
                      {capability.debug.description}
                    </dd>
                  </div>
                </dl>
              </div>
            </WorkbenchSurface>
          ))}
        </section>
      </div>
    </WorkbenchFrame>
  );
}
