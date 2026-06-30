/**
 * 关系连接与证据时间线 fixture。
 *
 * 这里描述 connection 列表、详情页证据、添加证据后的 payload，以及 empty/pending/failure 状态。
 * mock connection service 使用这些数据展示“为什么认识、证据来自哪里、是否可继续补充证据”。
 */
import {
  CONNECTION_EVIDENCE_SERVICE_FIXTURE_SOURCE,
  CONNECTION_EVIDENCE_SOURCE_TYPES,
  type ConnectionAddEvidenceInput,
  type ConnectionEvidenceContribution,
  type ConnectionEvidenceDetailPayload,
  type ConnectionEvidenceListPayload,
  type ConnectionEvidenceProvenance,
  type ConnectionEvidenceSourceType,
  type ConnectionEvidenceTimelineItem,
  type ConnectionRecord,
  type ConnectionSourceLink,
} from "./contract";


const fixtureCollectedAt = "2026-06-25T19:00:00.000Z";
const fixtureCapturedAt = "2026-06-25T19:05:00.000Z";
const addedEvidenceId = "evidence:connection-added-manual-note";

const sourceLabels: Record<ConnectionEvidenceSourceType, string> = {
  agent_action: "Agent action",
  calendar_signal: "Calendar signal",
  chat_summary: "Chat summary",
  email_signal: "Email signal",
  event_import: "Event import",
  manual: "Manual note",
  referral: "Referral",
};

export const mockConnectionSourceLinks = {
  climateDinner: {
    type: "event_import",
    id: "source:connection:climate-founders-dinner",
    label: "Climate founders dinner",
    evidenceId: "evidence:connection-climate-dinner",
    capturedAt: fixtureCapturedAt,
    confidence: "explicit",
  },
  emailContext: {
    type: "email_signal",
    id: "source:connection:kenji-email-context",
    label: "Email context",
    evidenceId: "evidence:connection-email-context",
    capturedAt: fixtureCapturedAt,
    confidence: "explicit",
  },
  hanaReferral: {
    type: "referral",
    id: "source:connection:hana-referral",
    label: "Referral note",
    evidenceId: "evidence:connection-hana-referral",
    capturedAt: fixtureCapturedAt,
    confidence: "explicit",
  },
  storagePilot: {
    type: "manual",
    id: "source:connection:storage-pilot-note",
    label: "Storage pilot note",
    evidenceId: "evidence:connection-storage-pilot",
    capturedAt: fixtureCapturedAt,
    confidence: "explicit",
  },
} as const satisfies Record<string, ConnectionSourceLink>;

export const mockConnectionEvidenceTimeline: readonly ConnectionEvidenceTimelineItem[] =
  [
    {
      evidenceId: "evidence:connection-climate-dinner",
      sourceLink: mockConnectionSourceLinks.climateDinner,
      contribution: "origin",
      occurredAt: "2026-06-18T20:30:00.000Z",
      capturedAt: fixtureCapturedAt,
      title: "Met at the climate founders dinner",
      excerpt:
        "Kenji and the operator discussed storage pilot teams after the climate founders dinner.",
      createdBy: "mock-connection-and-evidence-service",
    },
    {
      evidenceId: "evidence:connection-storage-pilot",
      sourceLink: mockConnectionSourceLinks.storagePilot,
      contribution: "context",
      occurredAt: "2026-06-19T09:10:00.000Z",
      capturedAt: fixtureCapturedAt,
      title: "Storage pilot context captured",
      excerpt:
        "Manual note says Kenji asked which operators could validate Aster Grid's pilot.",
      createdBy: "mock-connection-and-evidence-service",
    },
    {
      evidenceId: "evidence:connection-email-context",
      sourceLink: mockConnectionSourceLinks.emailContext,
      contribution: "introduced_by",
      occurredAt: "2026-06-20T10:15:00.000Z",
      capturedAt: fixtureCapturedAt,
      title: "Email thread added partner review context",
      excerpt:
        "Email signal says the partner review call should include the operator introduction.",
      createdBy: "mock-connection-and-evidence-service",
    },
    {
      evidenceId: "evidence:connection-follow-up",
      sourceLink: mockConnectionSourceLinks.storagePilot,
      contribution: "follow_up_signal",
      occurredAt: "2026-06-21T16:45:00.000Z",
      capturedAt: fixtureCapturedAt,
      title: "Follow-up path identified",
      excerpt:
        "The sensible next action is to send the storage pilot operator intro before Friday.",
      createdBy: "mock-connection-and-evidence-service",
    },
  ];

const hanaEvidenceTimeline: readonly ConnectionEvidenceTimelineItem[] = [
  {
    evidenceId: "evidence:connection-hana-referral",
    sourceLink: mockConnectionSourceLinks.hanaReferral,
    contribution: "introduced_by",
    occurredAt: "2026-06-19T09:15:00.000Z",
    capturedAt: fixtureCapturedAt,
    title: "Hana connected the climate community context",
    excerpt:
      "Referral fixture links Hana to the climate guild and founder roundtable opportunity.",
    createdBy: "mock-connection-and-evidence-service",
  },
];

export const mockConnectionRecords: readonly ConnectionRecord[] = [
  {
    id: "demo-connection-1",
    contactId: "contact:kenji-watanabe",
    displayName: "Kenji Watanabe",
    role: "Founder",
    organization: "Aster Grid",
    location: "Tokyo",
    connectionReason:
      "Kenji asked for a storage pilot operator introduction after the climate founders dinner.",
    relationshipStage: "needs_follow_up",
    strengthScore: 91,
    lastTouchedAt: "2026-06-21T16:45:00.000Z",
    nextAction: "Send Kenji the storage pilot operator intro by Friday.",
    sourceLinks: [
      mockConnectionSourceLinks.climateDinner,
      mockConnectionSourceLinks.storagePilot,
      mockConnectionSourceLinks.emailContext,
    ],
    evidenceTimeline: mockConnectionEvidenceTimeline,
    databaseReadExecuted: false,
    databaseWriteExecuted: false,
    productionAuditLogWriteExecuted: false,
    externalNetworkRequested: false,
    deviceRequested: false,
    aiProviderRequested: false,
    calendarProviderRequested: false,
    emailProviderRequested: false,
    notificationDelivered: false,
  },
  {
    id: "demo-connection-2",
    contactId: "contact:hana-sato",
    displayName: "Hana Sato",
    role: "Community Lead",
    organization: "Tokyo Climate Guild",
    location: "Tokyo",
    connectionReason:
      "Hana can explain the founder community context behind the climate dinner.",
    relationshipStage: "active",
    strengthScore: 78,
    lastTouchedAt: "2026-06-19T09:15:00.000Z",
    nextAction: "Ask Hana whether the guild wants a founder roundtable.",
    sourceLinks: [mockConnectionSourceLinks.hanaReferral],
    evidenceTimeline: hanaEvidenceTimeline,
    databaseReadExecuted: false,
    databaseWriteExecuted: false,
    productionAuditLogWriteExecuted: false,
    externalNetworkRequested: false,
    deviceRequested: false,
    aiProviderRequested: false,
    calendarProviderRequested: false,
    emailProviderRequested: false,
    notificationDelivered: false,
  },
];

export const mockConnectionEvidenceProvenance: ConnectionEvidenceProvenance = {
  source: CONNECTION_EVIDENCE_SERVICE_FIXTURE_SOURCE,
  sourceLabel: "Mock connection and evidence fixture",
  evidenceIds: [
    "evidence:connection-climate-dinner",
    "evidence:connection-storage-pilot",
    "evidence:connection-email-context",
    "evidence:connection-follow-up",
    "evidence:connection-hana-referral",
  ],
  collectedAt: fixtureCollectedAt,
  privacy: "demo-connection-evidence-only",
  generationMethod: "fixture",
  databaseReadExecuted: false,
  databaseWriteExecuted: false,
  productionAuditLogWriteExecuted: false,
  externalNetworkRequested: false,
  deviceRequested: false,
  aiProviderRequested: false,
  calendarProviderRequested: false,
  emailProviderRequested: false,
  notificationDelivered: false,
};

export const mockEmptyConnectionEvidenceProvenance: ConnectionEvidenceProvenance =
  {
    ...mockConnectionEvidenceProvenance,
    sourceLabel: "Mock empty connection and evidence rule",
    evidenceIds: ["evidence:connection-empty"],
    generationMethod: "rule-based-connection-evidence",
  };

export const mockPendingConnectionEvidenceProvenance: ConnectionEvidenceProvenance =
  {
    ...mockConnectionEvidenceProvenance,
    sourceLabel: "Mock pending connection and evidence rule",
    evidenceIds: ["evidence:connection-pending"],
    generationMethod: "rule-based-connection-evidence",
  };

export const mockConnectionEvidenceFailureProvenance: ConnectionEvidenceProvenance =
  {
    ...mockConnectionEvidenceProvenance,
    sourceLabel: "Mock connection and evidence controlled failure rule",
    evidenceIds: ["evidence:connection-controlled-failure"],
    generationMethod: "rule-based-connection-evidence",
  };

function sourceLabelFor(sourceType: ConnectionEvidenceSourceType): string {
  return sourceLabels[sourceType] ?? sourceLabels.manual;
}

function normalizeText(value: string | null | undefined, fallback: string): string {
  const normalized = value?.trim();

  return normalized && normalized.length > 0 ? normalized : fallback;
}

function buildAddedEvidenceSourceLink(
  input: ConnectionAddEvidenceInput = { connectionId: "demo-connection-1" },
): ConnectionSourceLink {
  const sourceType =
    (input.sourceType as ConnectionEvidenceSourceType | undefined) ?? "manual";
  const sourceLabel = normalizeText(input.sourceLabel, sourceLabelFor(sourceType));

  return {
    type: sourceType,
    id: `source:connection:added-${sourceType}`,
    label: sourceLabel,
    evidenceId: normalizeText(input.evidenceId, addedEvidenceId),
    capturedAt: "2026-06-25T19:20:00.000Z",
    confidence: "explicit",
  };
}

export function buildAddedConnectionEvidenceTimelineItem(
  input: ConnectionAddEvidenceInput = { connectionId: "demo-connection-1" },
): ConnectionEvidenceTimelineItem {
  // 新增证据项由输入生成，但 ID、时间和来源仍保持 deterministic，方便测试断言。
  const sourceLink = buildAddedEvidenceSourceLink(input);

  return {
    evidenceId: sourceLink.evidenceId,
    sourceLink,
    contribution:
      (input.contribution as ConnectionEvidenceContribution | undefined) ??
      "follow_up_signal",
    occurredAt: normalizeText(
      input.occurredAt,
      "2026-06-25T19:20:00.000Z",
    ),
    capturedAt: "2026-06-25T19:20:00.000Z",
    title: normalizeText(
      input.title,
      "Operator confirmed warm introduction path",
    ),
    excerpt: normalizeText(
      input.excerpt,
      "Kenji wants the storage pilot operator intro before the partner review call.",
    ),
    createdBy: "mock-connection-and-evidence-service",
  };
}

export function buildAddedConnectionEvidencePayload(
  input: ConnectionAddEvidenceInput = { connectionId: "demo-connection-1" },
): ConnectionEvidenceDetailPayload {
  // 详情 payload 在标准 connection 上追加证据，用来模拟“补充关系证据”后的页面状态。
  const baseConnection = mockConnectionRecords[0] as ConnectionRecord;
  const addedEvidence = buildAddedConnectionEvidenceTimelineItem(input);
  const addedSourceLinks = [
    ...baseConnection.sourceLinks,
    addedEvidence.sourceLink,
  ];
  const addedTimeline = [...baseConnection.evidenceTimeline, addedEvidence];
  const connection: ConnectionRecord = {
    ...baseConnection,
    sourceLinks: addedSourceLinks,
    evidenceTimeline: addedTimeline,
    lastTouchedAt: addedEvidence.occurredAt,
  };
  const provenance: ConnectionEvidenceProvenance = {
    ...mockConnectionEvidenceProvenance,
    sourceLabel: "Mock connection evidence rule update",
    evidenceIds: [
      ...baseConnection.evidenceTimeline.map((evidence) => evidence.evidenceId),
      addedEvidence.evidenceId,
    ],
    generationMethod: "rule-based-connection-evidence",
  };

  return {
    state: "success",
    connection,
    sourceLinks: addedSourceLinks,
    evidenceTimeline: addedTimeline,
    summary:
      "Kenji Watanabe has a source-linked evidence update ready for review.",
    provenance,
    nextAction: "Use the new evidence before sending the warm introduction.",
    addEvidenceSummary: `Mock evidence ${addedEvidence.evidenceId} was attached to Kenji Watanabe without a database write.`,
  };
}

export const mockConnectionsListFixture: ConnectionEvidenceListPayload = {
  state: "success",
  connections: mockConnectionRecords,
  summary:
    "Two mock connections are available with source links and evidence timelines.",
  provenance: mockConnectionEvidenceProvenance,
  nextAction:
    "Review the source-backed connection reason before choosing the next follow-up.",
};

export const mockEmptyConnectionsListFixture: ConnectionEvidenceListPayload = {
  state: "empty",
  connections: [],
  summary: "No mock connections are selected for evidence review.",
  provenance: mockEmptyConnectionEvidenceProvenance,
  nextAction: "Add or select a mock connection before reviewing evidence.",
};

export const mockPendingConnectionsListFixture: ConnectionEvidenceListPayload = {
  ...mockEmptyConnectionsListFixture,
  state: "pending",
  summary: "Connection evidence review is pending local fixture approval.",
  provenance: mockPendingConnectionEvidenceProvenance,
  nextAction:
    "Wait for mock connection fixture review before reading connection evidence.",
};

export const mockConnectionDetailFixture: ConnectionEvidenceDetailPayload = {
  state: "success",
  connection: mockConnectionRecords[0] as ConnectionRecord,
  sourceLinks: (mockConnectionRecords[0] as ConnectionRecord).sourceLinks,
  evidenceTimeline: (mockConnectionRecords[0] as ConnectionRecord)
    .evidenceTimeline,
  summary:
    "Kenji Watanabe is ready for source-backed connection and evidence review.",
  provenance: {
    ...mockConnectionEvidenceProvenance,
    evidenceIds: (mockConnectionRecords[0] as ConnectionRecord).evidenceTimeline.map(
      (evidence) => evidence.evidenceId,
    ),
  },
  nextAction:
    "Send Kenji the storage pilot operator intro after checking the evidence timeline.",
  addEvidenceSummary: "No mock evidence has been added.",
};

export const mockEmptyConnectionDetailFixture: ConnectionEvidenceDetailPayload = {
  state: "empty",
  connection: null,
  sourceLinks: [],
  evidenceTimeline: [],
  summary: "No mock connection is selected for evidence review.",
  provenance: mockEmptyConnectionEvidenceProvenance,
  nextAction: "Add or select a mock connection before reviewing evidence.",
  addEvidenceSummary: "No mock evidence has been added.",
};

export const mockPendingConnectionDetailFixture: ConnectionEvidenceDetailPayload =
  {
    ...mockEmptyConnectionDetailFixture,
    state: "pending",
    summary: "Connection evidence review is pending local fixture approval.",
    provenance: mockPendingConnectionEvidenceProvenance,
    nextAction:
      "Wait for mock connection fixture review before reading connection evidence.",
  };

export const mockAddedConnectionEvidenceFixture: ConnectionEvidenceDetailPayload =
  buildAddedConnectionEvidencePayload({
    connectionId: "demo-connection-1",
    contribution: "follow_up_signal",
    occurredAt: "2026-06-25T19:20:00.000Z",
    sourceLabel: "Operator follow-up note",
    sourceType: CONNECTION_EVIDENCE_SOURCE_TYPES[0],
    title: "Operator confirmed warm introduction path",
    excerpt:
      "Kenji wants the storage pilot operator intro before the partner review call.",
  });
