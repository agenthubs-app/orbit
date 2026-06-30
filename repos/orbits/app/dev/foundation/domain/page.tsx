/* eslint-disable no-unused-vars -- The base ESLint config lacks JSX variable usage tracking. */
/**
 * 领域契约基础页。
 *
 * 这个开发页把核心 DTO、source type、关系阶段和 feature mode 边界集中展示，
 * 方便接新能力前先确认共享 domain contract。
 */
import "../../../globals.css";
import {
  Chip,
  WorkbenchFrame,
  WorkbenchSurface,
} from "../../../../shared/ui/primitives";
import {
  PERMISSION_STATE_VALUES,
  RELATIONSHIP_STAGE_VALUES,
  RELATIONSHIP_VALUE_TYPES,
  SOURCE_TYPES,
} from "../../../../shared/domain/source-types";
import {
  FEATURE_MODES,
  resolveFeatureMode,
} from "../../../../shared/config/feature-mode";

const contractRows = [
  {
    name: "AccountDTO",
    role: "Owns the account container that future auth and workspace providers map into.",
    provenance: "Created and updated timestamps identify the account record lifecycle.",
  },
  {
    name: "UserProfileDTO",
    role: "Describes the operator using Orbit without coupling the app to live auth.",
    provenance: "Links profile state back to an account id before live identity exists.",
  },
  {
    name: "ContactDTO",
    role: "Captures who the user knows, the stage of the relationship, and source-backed evidence.",
    provenance: "Requires a source reference and at least one evidence id.",
  },
  {
    name: "ConnectionDTO",
    role: "Explains why a contact matters and which relationship value types apply.",
    provenance: "Requires a source reference and at least one evidence id.",
  },
  {
    name: "RelationshipEvidenceDTO",
    role: "Preserves the event, import, signal, referral, or agent context behind relationship records.",
    provenance:
      "Requires source type, source id, summary, occurredAt, confidence, and createdBy.",
  },
  {
    name: "EventDTO",
    role: "Defines event context for future attendee, readiness, and post-event review capabilities.",
    provenance: "Carries source and evidence references for event-originated context.",
  },
  {
    name: "TaskDTO",
    role: "Represents a follow-up commitment without implementing reminder delivery yet.",
    provenance: "Carries source and evidence references for why the task exists.",
  },
  {
    name: "ConversationDTO",
    role: "Frames email, calendar, chat, and note threads for later message extraction.",
    provenance: "Carries source and evidence references for conversation origin.",
  },
  {
    name: "MessageDTO",
    role: "Represents an individual inbound, outbound, or internal note message.",
    provenance: "Carries source, evidence, occurredAt, and createdBy fields.",
  },
  {
    name: "DashboardDTO",
    role: "Groups dashboard items generated from source-backed relationship context.",
    provenance: "Carries source and evidence references for generated summaries.",
  },
  {
    name: "AgentActionDTO",
    role: "Queues sensitive draft, reminder, intro, and summary actions behind confirmation state.",
    provenance: "Carries source and evidence references for why the action is proposed.",
  },
  {
    name: "PermissionStateDTO",
    role: "Stages permissions before live OAuth or provider scopes are wired.",
    provenance: "Carries source and evidence references for consent state changes.",
  },
  {
    name: "NotificationDTO",
    role: "Defines notification output before live delivery providers exist.",
    provenance: "Carries source and evidence references for notification purpose.",
  },
] as const;

const boundaryRows = [
  {
    name: "Source types",
    values: SOURCE_TYPES,
    note: "Typed origins that future mock and live providers must preserve.",
  },
  {
    name: "Relationship stages",
    values: RELATIONSHIP_STAGE_VALUES,
    note: "Relationship lifecycle values shared by contacts and connections.",
  },
  {
    name: "Value types",
    values: RELATIONSHIP_VALUE_TYPES,
    note: "Why a relationship may matter to the user.",
  },
  {
    name: "Permission states",
    values: PERMISSION_STATE_VALUES,
    note: "Consent states used before provider-specific OAuth or API scopes exist.",
  },
] as const;

const providerStatusByMode = {
  mock: "No live providers are connected. Capability mocks must create DTOs, source references, and evidence ids before pages consume them.",
  hybrid: "Hybrid mode may compare mock and live providers, but live payloads must still pass the shared domain validators.",
  live: "Live providers may replace mocks only after their mappers preserve source, evidence, confidence, creator, and permission provenance.",
} as const;

export default function DomainFoundationPage() {
  const currentMode = resolveFeatureMode();

  return (
    <WorkbenchFrame>
      <div className="workbench-shell">
        <header className="workbench-header">
          <p className="workbench-kicker">Developer foundation</p>
          <h1>Shared domain contract</h1>
          <p className="workbench-intro">
            Read-only admin summary for the Orbit domain DTO skeleton. This
            page keeps source/provenance boundaries visible before capability
            mocks start producing contacts, connections, evidence, tasks, and
            agent actions.
          </p>
        </header>

        <WorkbenchSurface
          eyebrow="Runtime boundary"
          title="Current mode and provider status"
        >
          <dl className="relationship-meta">
            <div>
              <dt>Current mode</dt>
              <dd>
                <code>{currentMode}</code> via the runtime mode boundary.
                Supported modes: {FEATURE_MODES.join(", ")}.
              </dd>
            </div>
            <div>
              <dt>Provider status</dt>
              <dd>{providerStatusByMode[currentMode]}</dd>
            </div>
          </dl>
        </WorkbenchSurface>

        <WorkbenchSurface
          elevated
          eyebrow="Contract skeleton"
          title="Relationship records cannot be source-free"
        >
          <dl className="relationship-meta">
            {contractRows.map((row) => (
              <div key={row.name}>
                <dt>{row.name}</dt>
                <dd>
                  {row.role} {row.provenance}
                </dd>
              </div>
            ))}
          </dl>
        </WorkbenchSurface>

        <section
          className="workbench-grid"
          aria-label="Domain source and enum boundaries"
        >
          {boundaryRows.map((boundary) => (
            <WorkbenchSurface
              key={boundary.name}
              eyebrow="Source/provenance boundaries"
              title={boundary.name}
            >
              <p className="type-body">{boundary.note}</p>
              <div className="chip-row" aria-label={`${boundary.name} values`}>
                {boundary.values.map((value) => (
                  <Chip key={value} tone="evidence">
                    {value}
                  </Chip>
                ))}
              </div>
            </WorkbenchSurface>
          ))}
        </section>

        <WorkbenchSurface
          eyebrow="Next integration step"
          title="Capability mocks must map into this contract"
        >
          <p className="type-body">
            The next integration step is for capability services to import these
            DTOs, create explicit source references and evidence ids, validate
            records at the service boundary, then return the same shapes through
            route handlers and UI pages.
          </p>
          <p className="handoff-preview">
            Live providers will replace mocks behind the runtime mode boundary,
            but provider payloads must still preserve source type, source id,
            evidence confidence, creator, and permission provenance.
          </p>
        </WorkbenchSurface>
      </div>
    </WorkbenchFrame>
  );
}
