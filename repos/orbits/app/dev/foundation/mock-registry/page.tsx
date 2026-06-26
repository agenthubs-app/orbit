/* eslint-disable no-unused-vars -- The base ESLint config lacks JSX variable usage tracking. */
import "../../../globals.css";
import {
  Chip,
  WorkbenchFrame,
  WorkbenchSurface,
} from "../../../../shared/ui/primitives";
import {
  getMockFixtureVariant,
  listMockFixtureVariants,
} from "../../../../shared/mock/registry";
import { MOCK_FIXTURE_COLLECTION_NAMES } from "../../../../shared/mock/fixtures";
import { createMockStateStore } from "../../../../shared/mock/state-store";

const fixture = getMockFixtureVariant();
const variants = listMockFixtureVariants();
const runtimeStateStore = createMockStateStore(fixture);
const runtimeSnapshot = runtimeStateStore.getState();
const runtimeSourceFiles = [
  {
    label: "Registry",
    path: "shared/mock/registry.ts",
  },
  {
    label: "State store",
    path: "shared/mock/state-store.ts",
  },
  {
    label: "Seed graph",
    path: "shared/mock/fixtures.ts",
  },
] as const;
const liveImplementationNotesPath =
  "shared/mock/create-the-shared-mock-runtime-used-by-every-capability-sprint/LIVE_IMPLEMENTATION.md";
const pathWrapStyle = { overflowWrap: "anywhere" } as const;

export default function MockRegistryFoundationPage() {
  return (
    <WorkbenchFrame>
      <div className="workbench-shell">
        <header className="workbench-header">
          <p className="workbench-kicker">Developer foundation</p>
          <h1>Shared mock runtime</h1>
          <p className="workbench-intro">
            Debug summary for the typed mock fixture registry, deterministic
            state-store boundary, and source-backed seed graph every capability
            sprint can consume before live providers exist.
          </p>
        </header>

        <section
          className="workbench-grid"
          aria-label="Mock registry runtime surfaces"
        >
          <WorkbenchSurface elevated eyebrow="Variant lookup" title="Registered fixture variants">
            <p className="type-body">
              Capability services call <code>getMockFixtureVariant</code> for a
              cloned graph and <code>listMockFixtureVariants</code> for
              developer-visible registry metadata.
            </p>
            <dl className="relationship-meta">
              {variants.map((variant) => (
                <div key={variant.variant}>
                  <dt>{variant.variant}</dt>
                  <dd>
                    {variant.label}. Fixture id: <code>{variant.fixtureId}</code>.
                    {` ${variant.description}`}
                  </dd>
                </div>
              ))}
            </dl>
          </WorkbenchSurface>

          <WorkbenchSurface eyebrow="Reset helpers" title="Deterministic in-memory state">
            <p className="type-body">
              The registry reset helper restores the default variant, and
              <code>createMockStateStore</code> clones reads, writes, updates,
              and resets so tests and route handlers cannot mutate shared
              fixture state by accident.
            </p>
            <div className="chip-row" aria-label="Mock runtime guardrails">
              <Chip tone="evidence">clone-on-read</Chip>
              <Chip tone="confirmation">resettable registry</Chip>
              <Chip tone="privacy">no live providers</Chip>
            </div>
            <p className="handoff-preview">
              Current runtime snapshot: {runtimeSnapshot.contacts.length}{" "}
              contacts, {runtimeSnapshot.connections.length} connections, and{" "}
              {runtimeSnapshot.agentActions.length} confirmation-aware agent
              actions.
            </p>
          </WorkbenchSurface>
        </section>

        <WorkbenchSurface eyebrow="Seeded collections" title={fixture.label}>
          <p className="type-body">{fixture.description}</p>
          <dl className="relationship-meta">
            {MOCK_FIXTURE_COLLECTION_NAMES.map((collectionName) => (
              <div key={collectionName}>
                <dt>{collectionName}</dt>
                <dd>
                  {fixture[collectionName].length} records seeded with source or
                  evidence provenance for mock capability services.
                </dd>
              </div>
            ))}
          </dl>
        </WorkbenchSurface>

        <WorkbenchSurface eyebrow="Mock-to-live handoff" title="Live providers replace the registry behind service factories">
          <p className="type-body">
            Live account, profile, event, contact, signal, dashboard, agent,
            permission, and notification providers must map into the same DTOs,
            preserve source and evidence ids, and replace this mock runtime only
            through the documented feature-mode service switch.
          </p>
          <p className="handoff-preview">
            Start with these files when wiring a capability service to the mock
            runtime or planning a live provider replacement.
          </p>
          <dl
            className="relationship-meta"
            aria-label="Sprint 6 source and handoff files"
          >
            {runtimeSourceFiles.map((file) => (
              <div key={file.path}>
                <dt>{file.label}</dt>
                <dd>
                  <code style={pathWrapStyle}>{file.path}</code>
                </dd>
              </div>
            ))}
            <div>
              <dt>Live notes</dt>
              <dd>
                <code style={pathWrapStyle}>
                  {liveImplementationNotesPath}
                </code>
              </dd>
            </div>
          </dl>
        </WorkbenchSurface>
      </div>
    </WorkbenchFrame>
  );
}
