import { SOURCE_CONSISTENCY_PROVENANCE_AUDIT_ENTITY_KINDS } from "./provenance-contract";
import type {
  SourceConsistencyAuditedCollection,
  SourceConsistencyAuditFinding,
  SourceConsistencyProvenanceAuditPayload,
  SourceConsistencyProvenanceAuditProvenance,
  SourceConsistencyProvenanceAuditRunPayload,
  SourceConsistencyProvenanceAuditSourceReference,
} from "./provenance-contract";
import type { SourceType } from "../../shared/domain/source-types";

export const SOURCE_CONSISTENCY_PROVENANCE_AUDIT_FIXTURE_SOURCE =
  "fixture:features/audit/provenance-fixtures.ts" as const;

const collectedAt = "2026-06-26T09:05:00.000+09:00";
const runStartedAt = "2026-06-26T09:06:00.000+09:00";

function source(input: {
  type: SourceType;
  id: string;
  label: string;
  providerRecordId: string;
}): SourceConsistencyProvenanceAuditSourceReference {
  return {
    ...input,
    generatedBy: "mock-source-consistency-provenance-audit-rules",
  };
}

export const mockSourceConsistencyProvenanceAuditProvenance: SourceConsistencyProvenanceAuditProvenance =
  {
    source: SOURCE_CONSISTENCY_PROVENANCE_AUDIT_FIXTURE_SOURCE,
    sourceLabel: "Mock source consistency provenance audit fixture",
    evidenceIds: [
      "evidence:audit:contact:event-badge",
      "evidence:audit:connection:intro-note",
      "evidence:audit:evidence:email-signal",
      "evidence:audit:recommendation:source-bundle",
      "evidence:audit:task:source-timestamp",
      "evidence:audit:chat-summary:event-host",
      "evidence:audit:agent-action:confirmation",
    ],
    collectedAt,
    privacy: "demo-source-consistency-provenance-audit-only",
    generationMethod: "fixture",
    complianceReportingExecuted: false,
    productionAuditStorageWriteExecuted: false,
    externalNetworkRequested: false,
    databaseReadExecuted: false,
    databaseWriteExecuted: false,
    aiProviderRequested: false,
    calendarProviderRequested: false,
    emailProviderRequested: false,
    notificationProviderRequested: false,
    deviceRequested: false,
  };

export const mockSourceConsistencyProvenanceAuditRunProvenance: SourceConsistencyProvenanceAuditProvenance =
  {
    ...mockSourceConsistencyProvenanceAuditProvenance,
    sourceLabel: "Mock source consistency provenance audit run",
    generationMethod: "rule-based-audit-run",
  };

export const mockSourceConsistencyProvenanceAuditFailureProvenance: SourceConsistencyProvenanceAuditProvenance =
  {
    ...mockSourceConsistencyProvenanceAuditProvenance,
    sourceLabel: "Mock source consistency provenance audit controlled failure",
    evidenceIds: ["evidence:audit:controlled-failure"],
    generationMethod: "rule-based-state",
  };

const emptyStateProvenance: SourceConsistencyProvenanceAuditProvenance = {
  ...mockSourceConsistencyProvenanceAuditProvenance,
  sourceLabel: "Mock source consistency provenance audit empty state",
  evidenceIds: ["evidence:audit:empty-state"],
  generationMethod: "rule-based-state",
};

const pendingStateProvenance: SourceConsistencyProvenanceAuditProvenance = {
  ...mockSourceConsistencyProvenanceAuditProvenance,
  sourceLabel: "Mock source consistency provenance audit pending state",
  evidenceIds: ["evidence:audit:pending-state"],
  generationMethod: "rule-based-state",
};

const sources = {
  eventBadge: source({
    type: "event_import",
    id: "source:event:tokyo-climate-operators:badge",
    label: "Tokyo Climate Operators Salon badge import",
    providerRecordId: "mock-event-import:tokyo-climate-operators",
  }),
  introNote: source({
    type: "manual",
    id: "source:connection:maya-chen:intro-note",
    label: "Manual intro note from pilot reliability discussion",
    providerRecordId: "mock-manual-note:maya-chen",
  }),
  evidenceRecord: source({
    type: "email_signal",
    id: "source:evidence:maya-chen:reliability-memo",
    label: "Email signal proving Maya requested the reliability memo",
    providerRecordId: "mock-email-signal:maya-chen:reliability-memo",
  }),
  recommendationBundle: source({
    type: "system",
    id: "source:recommendation:maya-chen:source-bundle",
    label: "Rule-based recommendation source bundle",
    providerRecordId: "mock-recommendation:maya-chen:source-bundle",
  }),
  taskTimestamp: source({
    type: "calendar_signal",
    id: "source:task:diego-rivera:stale-timestamp",
    label: "Calendar signal used to time Diego's follow-up task",
    providerRecordId: "mock-calendar-signal:diego-rivera:followup",
  }),
  chatSummary: source({
    type: "chat_summary",
    id: "source:chat-summary:aiko-tanaka:event-host",
    label: "Chat summary linking Aiko to the event host context",
    providerRecordId: "mock-chat-summary:aiko-tanaka:event-host",
  }),
  agentAction: source({
    type: "agent_action",
    id: "source:agent-action:send-memo:confirmation",
    label: "Agent action confirmation checkpoint",
    providerRecordId: "mock-agent-action:send-memo:confirmation",
  }),
} as const;

export const mockSourceConsistencyAuditedCollections: readonly SourceConsistencyAuditedCollection[] =
  [
    {
      entityKind: "contact",
      label: "Contacts",
      auditedCount: 18,
      consistentCount: 18,
      inconsistentCount: 0,
      sourceConsistent: true,
      provenanceComplete: true,
      sourceRefs: [sources.eventBadge],
      evidenceIds: ["evidence:audit:contact:event-badge"],
    },
    {
      entityKind: "connection",
      label: "Connections",
      auditedCount: 14,
      consistentCount: 14,
      inconsistentCount: 0,
      sourceConsistent: true,
      provenanceComplete: true,
      sourceRefs: [sources.introNote],
      evidenceIds: ["evidence:audit:connection:intro-note"],
    },
    {
      entityKind: "evidence",
      label: "Evidence",
      auditedCount: 23,
      consistentCount: 23,
      inconsistentCount: 0,
      sourceConsistent: true,
      provenanceComplete: true,
      sourceRefs: [sources.evidenceRecord],
      evidenceIds: ["evidence:audit:evidence:email-signal"],
    },
    {
      entityKind: "recommendation",
      label: "Recommendations",
      auditedCount: 9,
      consistentCount: 9,
      inconsistentCount: 0,
      sourceConsistent: true,
      provenanceComplete: true,
      sourceRefs: [sources.recommendationBundle],
      evidenceIds: ["evidence:audit:recommendation:source-bundle"],
    },
    {
      entityKind: "task",
      label: "Tasks",
      auditedCount: 11,
      consistentCount: 11,
      inconsistentCount: 0,
      sourceConsistent: true,
      provenanceComplete: true,
      sourceRefs: [sources.taskTimestamp],
      evidenceIds: ["evidence:audit:task:source-timestamp"],
    },
    {
      entityKind: "chat_summary",
      label: "Chat summaries",
      auditedCount: 6,
      consistentCount: 6,
      inconsistentCount: 0,
      sourceConsistent: true,
      provenanceComplete: true,
      sourceRefs: [sources.chatSummary],
      evidenceIds: ["evidence:audit:chat-summary:event-host"],
    },
    {
      entityKind: "agent_action",
      label: "Agent actions",
      auditedCount: 7,
      consistentCount: 7,
      inconsistentCount: 0,
      sourceConsistent: true,
      provenanceComplete: true,
      sourceRefs: [sources.agentAction],
      evidenceIds: ["evidence:audit:agent-action:confirmation"],
    },
  ] as const;

export const mockSourceConsistencyAuditFindings: readonly SourceConsistencyAuditFinding[] =
  [
    {
      findingId: "finding:recommendation:missing-evidence-link",
      entityKind: "recommendation",
      severity: "medium",
      ruleId: "recommendation.source_bundle.complete",
      title: "Recommendation references a source bundle without one evidence link.",
      detail:
        "Maya Chen's pilot expansion recommendation carries the system source bundle but is missing the email evidence pointer used to justify the priority.",
      remediation:
        "Attach the source evidence id before showing this recommendation outside the audit workbench.",
      affectedRecordIds: ["recommendation:maya-chen:pilot-expansion"],
      sourceConsistent: false,
      provenanceComplete: false,
      sourceRefs: [sources.recommendationBundle],
      evidenceIds: ["evidence:audit:recommendation:source-bundle"],
    },
    {
      findingId: "finding:task:stale-source",
      entityKind: "task",
      severity: "low",
      ruleId: "task.source_timestamp.current",
      title: "Task source timestamp is older than the linked evidence.",
      detail:
        "Diego Rivera's partner follow-up task still points at the original calendar signal instead of the newer event encounter note.",
      remediation:
        "Refresh the task source reference before using the task as follow-up evidence.",
      affectedRecordIds: ["task:diego-rivera:partner-followup"],
      sourceConsistent: false,
      provenanceComplete: true,
      sourceRefs: [sources.taskTimestamp],
      evidenceIds: ["evidence:audit:task:source-timestamp"],
    },
    {
      findingId: "finding:agent-action:confirmation-gap",
      entityKind: "agent_action",
      severity: "high",
      ruleId: "agent_action.confirmation_provenance.present",
      title: "Agent action is waiting for confirmation provenance.",
      detail:
        "The mock send-message action has source context but the explicit confirmation record is not attached to the action provenance yet.",
      remediation:
        "Block live execution until the confirmation guard supplies a durable confirmation source reference.",
      affectedRecordIds: ["agent-action:send-memo:maya-chen"],
      sourceConsistent: false,
      provenanceComplete: false,
      sourceRefs: [sources.agentAction],
      evidenceIds: ["evidence:audit:agent-action:confirmation"],
    },
  ] as const;

export const mockSourceConsistencyProvenanceAuditFixture: SourceConsistencyProvenanceAuditPayload =
  {
    state: "success",
    activeFindingCount: 0,
    auditedCollections: mockSourceConsistencyAuditedCollections,
    findings: [],
    summary:
      "Mock source consistency and provenance audit checks contacts, connections, evidence, recommendations, tasks, chat summaries, and agent actions against deterministic source references with zero active findings.",
    provenance: mockSourceConsistencyProvenanceAuditProvenance,
    nextAction:
      "Keep the zero-finding audit result attached to the mock MVP loop before any live compliance report or production audit storage is enabled.",
  };

export const mockSourceConsistencyProvenanceAuditRunFixture: SourceConsistencyProvenanceAuditRunPayload =
  {
    state: "success",
    runId: "audit-run:source-provenance:demo-1",
    runStartedAt,
    scannedEntityKinds: SOURCE_CONSISTENCY_PROVENANCE_AUDIT_ENTITY_KINDS,
    evaluatedRecordCount: 88,
    activeFindingCount: 0,
    generatedFindingIds: [],
    complianceReportPersisted: false,
    productionAuditStorageWritten: false,
    summary:
      "Rule-based mock run evaluated 88 Orbit records and reported zero active source consistency findings without external side effects.",
    provenance: mockSourceConsistencyProvenanceAuditRunProvenance,
    nextAction:
      "Keep the zero-finding audit result in the mock boundary until live storage, privacy review, and replacement tests are approved.",
  };

export const mockEmptySourceConsistencyProvenanceAuditFixture: SourceConsistencyProvenanceAuditPayload =
  {
    state: "empty",
    activeFindingCount: 0,
    auditedCollections: [],
    findings: [],
    summary:
      "No source consistency audit snapshot is available because the demo scenario contains no source-backed Orbit records.",
    provenance: emptyStateProvenance,
    nextAction:
      "Add source-backed Orbit records before expecting provenance audit coverage.",
  };

export const mockEmptySourceConsistencyProvenanceAuditRunFixture: SourceConsistencyProvenanceAuditRunPayload =
  {
    state: "empty",
    runId: "audit-run:source-provenance:empty",
    runStartedAt,
    scannedEntityKinds: [],
    evaluatedRecordCount: 0,
    activeFindingCount: 0,
    generatedFindingIds: [],
    complianceReportPersisted: false,
    productionAuditStorageWritten: false,
    summary:
      "The mock audit run did not evaluate any records because the source-backed dataset is empty.",
    provenance: emptyStateProvenance,
    nextAction:
      "Add source-backed Orbit records before running the provenance audit again.",
  };

export const mockPendingSourceConsistencyProvenanceAuditFixture: SourceConsistencyProvenanceAuditPayload =
  {
    state: "pending",
    activeFindingCount: 0,
    auditedCollections: [],
    findings: [],
    summary:
      "The mock source consistency audit is waiting for the local fixture refresh checkpoint.",
    provenance: pendingStateProvenance,
    nextAction:
      "Keep the pending state visible and do not call compliance reporting, databases, providers, devices, AI, or external networks.",
  };

export const mockPendingSourceConsistencyProvenanceAuditRunFixture: SourceConsistencyProvenanceAuditRunPayload =
  {
    state: "pending",
    runId: "audit-run:source-provenance:pending",
    runStartedAt,
    scannedEntityKinds: [],
    evaluatedRecordCount: 0,
    activeFindingCount: 0,
    generatedFindingIds: [],
    complianceReportPersisted: false,
    productionAuditStorageWritten: false,
    summary:
      "The mock audit run is pending until local source fixture refresh completes.",
    provenance: pendingStateProvenance,
    nextAction:
      "Render the pending run and keep live audit storage and compliance reporting disabled.",
  };
