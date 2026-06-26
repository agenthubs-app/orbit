import {
  Chip,
  WorkbenchFrame,
  WorkbenchSurface,
} from "../../ui/primitives";
import {
  listCapabilitySummaries,
  type CapabilitySummary,
} from "../../services/capability-registry";
import { runDebugAction } from "../debug-action-runner";

export const APP_SCAFFOLD_CAPABILITY_SLUG = "app-scaffold";

const liveImplementationNotesPath =
  "shared/dev/app-scaffold/LIVE_IMPLEMENTATION.md";
const pathWrapStyle = { overflowWrap: "anywhere" } as const;

function apiRouteLabel(route: CapabilitySummary["api"]["routes"][number]) {
  return `${route.method} ${route.path}`;
}

function MissingCapabilityDemo({ slug }: { slug: string }) {
  return (
    <WorkbenchFrame>
      <div className="workbench-shell">
        <header className="workbench-header">
          <p className="workbench-kicker">Developer capability runtime</p>
          <h1>Missing capability demo</h1>
          <p className="workbench-intro">
            The requested capability slug <code>{slug}</code> is not registered
            in this dev-only harness. No mock action was executed, and no app
            state or artifact was written.
          </p>
        </header>

        <WorkbenchSurface elevated eyebrow="Controlled fallback" title="Known demo slug">
          <dl className="relationship-meta">
            <div>
              <dt>Available route</dt>
              <dd>
                <code>/dev/capabilities/{APP_SCAFFOLD_CAPABILITY_SLUG}</code>
              </dd>
            </div>
            <div>
              <dt>Missing route</dt>
              <dd>
                Unknown slugs stay inside this controlled state instead of
                attempting a mock action or resolving a live provider.
              </dd>
            </div>
          </dl>
        </WorkbenchSurface>
      </div>
    </WorkbenchFrame>
  );
}

function AppScaffoldCapabilityDemo() {
  const capabilities = listCapabilitySummaries();
  const liveModePreview = listCapabilitySummaries({
    mode: "live",
  });
  const liveBlockedCount = liveModePreview.filter(
    (capability) => capability.serviceStatus === "not-implemented",
  ).length;
  const actionResult = runDebugAction({
    capabilitySlug: APP_SCAFFOLD_CAPABILITY_SLUG,
    actionId: "probe-app-scaffold-registry",
    label: "Probe registry",
    payload: {
      registeredCapabilities: capabilities.length,
      liveBlockedCapabilities: liveBlockedCount,
    },
    evidence: ["capability-registry", "service-factory"],
  });

  return (
    <WorkbenchFrame>
      <div className="workbench-shell">
        <header className="workbench-header">
          <p className="workbench-kicker">Developer capability runtime</p>
          <h1>App scaffold capability harness</h1>
          <p className="workbench-intro">
            Dev-only route for exercising mock capability plumbing without
            mutating product state or writing artifacts. The harness reads the
            shared capability registry, runs one local mock probe, and records
            the result in local runtime memory only.
          </p>
        </header>

        <section
          className="workbench-grid"
          aria-label="App scaffold capability demo states"
        >
          <WorkbenchSurface elevated eyebrow={APP_SCAFFOLD_CAPABILITY_SLUG} title="Registered capabilities">
            <p className="type-body">
              The page uses <code>listCapabilitySummaries</code> as its source
              of truth, so the demo reflects the same mock, hybrid, and guarded
              live mode metadata that product routes consume.
            </p>
            <dl className="relationship-meta">
              <div>
                <dt>Mock-ready services</dt>
                <dd>
                  {capabilities.length} capability factories resolve in mock
                  mode for local development.
                </dd>
              </div>
              <div>
                <dt>Live guard</dt>
                <dd>
                  {liveBlockedCount} live services return{" "}
                  <code>NOT_IMPLEMENTED</code> until provider files and
                  replacement tests exist.
                </dd>
              </div>
            </dl>
            <div className="chip-row" aria-label="Capability harness guardrails">
              <Chip tone="evidence">registry-backed</Chip>
              <Chip tone="confirmation">mock action only</Chip>
              <Chip tone="privacy">memory-only result</Chip>
            </div>
          </WorkbenchSurface>

          <WorkbenchSurface eyebrow="Debug action result" title={actionResult.label}>
            <dl className="relationship-meta">
              <div>
                <dt>Action id</dt>
                <dd>
                  <code>{actionResult.actionId}</code>
                </dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>
                  <code>{actionResult.status}</code>
                </dd>
              </div>
              <div>
                <dt>Result boundary</dt>
                <dd>{actionResult.summary}</dd>
              </div>
            </dl>
          </WorkbenchSurface>
        </section>

        <WorkbenchSurface eyebrow="Capability registry snapshot" title="Mock capability states">
          <dl className="relationship-meta">
            {capabilities.map((capability) => (
              <div key={capability.id}>
                <dt>{capability.label}</dt>
                <dd>
                  <code>{capability.id}</code> resolves as{" "}
                  <code>{capability.serviceStatus}</code> in{" "}
                  <code>{capability.currentMode}</code> mode.{" "}
                  {capability.debug.description}
                </dd>
              </div>
            ))}
          </dl>
        </WorkbenchSurface>

        <WorkbenchSurface eyebrow="API exercise surface" title="Routes stay descriptive in the harness">
          <dl className="relationship-meta">
            {capabilities.slice(0, 4).map((capability) => (
              <div key={`${capability.id}-api`}>
                <dt>{capability.label}</dt>
                <dd>
                  {capability.api.routes.map((route) => (
                    <span key={`${capability.id}-${route.method}-${route.path}`}>
                      <code>{apiRouteLabel(route)}</code> {route.purpose}{" "}
                    </span>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
          <p className="privacy-note">
            The dev surface does not complete product workflows. It exercises
            registry contracts and mock action boundaries only.
          </p>
        </WorkbenchSurface>

        <WorkbenchSurface eyebrow="Mock-to-live handoff" title="Replacement notes stay with the dev capability">
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
                Live service and provider files, switch mechanism, required
                env vars and permissions, privacy and provenance constraints,
                and replacement tests are documented before live providers are
                wired.
              </dd>
            </div>
          </dl>
        </WorkbenchSurface>
      </div>
    </WorkbenchFrame>
  );
}

export function CapabilityDemoRoute({ slug }: { slug: string }) {
  if (slug !== APP_SCAFFOLD_CAPABILITY_SLUG) {
    return <MissingCapabilityDemo slug={slug} />;
  }

  return <AppScaffoldCapabilityDemo />;
}
