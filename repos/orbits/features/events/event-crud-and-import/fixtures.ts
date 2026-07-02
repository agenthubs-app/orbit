/**
 * 活动 CRUD 与导入 fixture。
 *
 * 这里提供活动来源、证据、活动列表、导入记录、手动创建结果和详情 payload。
 * mock event service 使用这些数据模拟活动管理流程，但不会写入真实日历或远程活动源。
 */
import type {
  EventCrudImportProvenance,
  EventDetailPayload,
  EventEvidence,
  EventListPayload,
  EventOriginMetadata,
  EventRecord,
  EventStatus,
  ImportedEventRecord,
  ManualEventCreationInput,
  ManualEventCreationPayload,
} from "./contract";

export const EVENT_CRUD_IMPORT_FIXTURE_SOURCE =
  "fixture:features/events/event-crud-and-import/fixtures.ts" as const;

const fixtureCollectedAt = "2026-06-25T18:00:00.000Z";
const fixtureCapturedAt = "2026-06-25T18:08:00.000Z";

export const mockEventOrigins = {
  calendar: {
    type: "calendar_signal",
    id: "source:events:calendar-climate-founders",
    label: "Calendar sync fixture",
    captureMethod: "calendar_sync_fixture",
    provider: "mock-calendar-sync-fixture",
    providerRecordId: "mock-calendar:climate-founders-dinner",
    importedAt: fixtureCollectedAt,
    calendarSyncRequested: false,
    organizerFeedRequested: false,
    liveDatabaseWriteExecuted: false,
    externalNetworkRequested: false,
  },
  organizer: {
    type: "event_import",
    id: "source:events:organizer-storage-breakfast",
    label: "Organizer feed fixture",
    captureMethod: "organizer_feed_fixture",
    provider: "mock-organizer-feed-fixture",
    providerRecordId: "mock-organizer:storage-pilot-breakfast",
    importedAt: fixtureCollectedAt,
    calendarSyncRequested: false,
    organizerFeedRequested: false,
    liveDatabaseWriteExecuted: false,
    externalNetworkRequested: false,
  },
  manual: {
    type: "manual",
    id: "source:events:manual-founder-investor-salon",
    label: "Manual event creation",
    captureMethod: "manual_form",
    provider: "manual-event-form-fixture",
    providerRecordId: "manual:event-founder-investor-salon",
    importedAt: fixtureCollectedAt,
    calendarSyncRequested: false,
    organizerFeedRequested: false,
    liveDatabaseWriteExecuted: false,
    externalNetworkRequested: false,
  },
} as const satisfies Record<string, EventOriginMetadata>;

export const mockEventEvidence: readonly EventEvidence[] = [
  {
    evidenceId: "evidence:events-calendar-fixture",
    source: mockEventOrigins.calendar,
    excerpt:
      "Calendar fixture says Climate founders dinner is confirmed for June 28 with climate operators and founders.",
    capturedAt: fixtureCapturedAt,
    createdBy: "mock-event-crud-and-import-service",
  },
  {
    evidenceId: "evidence:events-organizer-fixture",
    source: mockEventOrigins.organizer,
    excerpt:
      "Organizer feed fixture lists storage pilot operators for a breakfast roundtable.",
    capturedAt: fixtureCapturedAt,
    createdBy: "mock-event-crud-and-import-service",
  },
  {
    evidenceId: "evidence:events-manual-note",
    source: mockEventOrigins.manual,
    excerpt:
      "Manual note stages a founder investor salon for warm introduction planning.",
    capturedAt: fixtureCapturedAt,
    createdBy: "mock-event-crud-and-import-service",
  },
];

function evidenceFor(evidenceId: string): readonly EventEvidence[] {
  return mockEventEvidence.filter(
    (evidence) => evidence.evidenceId === evidenceId,
  );
}

function createEventRecord(input: {
  id: string;
  title: string;
  description: string;
  venue: string;
  startsAt: string;
  endsAt: string;
  status: EventStatus;
  sourceMetadata: EventOriginMetadata;
  evidenceId: string;
  relationshipContext: string;
  recommendedPreparation: string;
  nextAction: string;
}): EventRecord {
  return {
    ...input,
    evidence: evidenceFor(input.evidenceId),
    calendarSyncRequested: false,
    calendarProviderRequested: false,
    organizerFeedRequested: false,
    liveDatabaseWriteExecuted: false,
    externalNetworkRequested: false,
    aiProviderRequested: false,
    emailProviderRequested: false,
    notificationDelivered: false,
  };
}

export const mockEventRecords: readonly EventRecord[] = [
  createEventRecord({
    id: "demo-event-1",
    title: "Climate founders dinner",
    description:
      "Small dinner for climate founders, operator investors, and community partners.",
    venue: "Kanda Founders Table",
    startsAt: "2026-06-28T10:30:00.000Z",
    endsAt: "2026-06-28T13:00:00.000Z",
    status: "confirmed",
    sourceMetadata: mockEventOrigins.calendar,
    evidenceId: "evidence:events-calendar-fixture",
    relationshipContext:
      "Founder and operator attendees overlap with the current storage pilot relationship goals.",
    recommendedPreparation:
      "Review climate founders and prepare two operator introduction paths.",
    nextAction: "Review attendee context before the dinner.",
  }),
  createEventRecord({
    id: "demo-event-2",
    title: "Storage pilot operator breakfast",
    description:
      "Organizer roster fixture for operators evaluating partner pilot programs.",
    venue: "Orbit Studio",
    startsAt: "2026-07-02T00:30:00.000Z",
    endsAt: "2026-07-02T02:00:00.000Z",
    status: "imported",
    sourceMetadata: mockEventOrigins.organizer,
    evidenceId: "evidence:events-organizer-fixture",
    relationshipContext:
      "Operators match active commercial opportunity and referral path relationship values.",
    recommendedPreparation:
      "Bring storage pilot case notes and identify warm follow-up owners.",
    nextAction: "Confirm which operators need post-event review.",
  }),
  createEventRecord({
    id: "event:manual:founder-investor-salon",
    title: "Founder investor salon",
    description:
      "Manual event staged by the operator for warm introduction planning.",
    venue: "Orbit relationship room",
    startsAt: "2026-07-09T09:00:00.000Z",
    endsAt: "2026-07-09T11:00:00.000Z",
    status: "draft",
    sourceMetadata: mockEventOrigins.manual,
    evidenceId: "evidence:events-manual-note",
    relationshipContext:
      "Manual planning event for founders and investors who need source-backed introductions.",
    recommendedPreparation:
      "Attach known relationship context before inviting attendees.",
    nextAction: "Add source notes before moving this draft into confirmed planning.",
  }),
];

export const mockImportedEventRecords: readonly ImportedEventRecord[] = [
  {
    id: "imported-event-record:calendar-climate-founders",
    eventId: "demo-event-1",
    externalRecordId: "mock-calendar:climate-founders-dinner",
    title: "Climate founders dinner",
    status: "confirmed",
    sourceMetadata: mockEventOrigins.calendar,
    fieldMapping: ["title", "venue", "startsAt", "endsAt", "description"],
    skippedFields: ["attendeeEmails"],
    calendarSyncRequested: false,
    organizerFeedRequested: false,
    liveDatabaseWriteExecuted: false,
  },
  {
    id: "imported-event-record:organizer-storage-breakfast",
    eventId: "demo-event-2",
    externalRecordId: "mock-organizer:storage-pilot-breakfast",
    title: "Storage pilot operator breakfast",
    status: "imported",
    sourceMetadata: mockEventOrigins.organizer,
    fieldMapping: ["title", "venue", "startsAt", "endsAt"],
    skippedFields: ["liveAttendeeRoster", "ticketingNotes"],
    calendarSyncRequested: false,
    organizerFeedRequested: false,
    liveDatabaseWriteExecuted: false,
  },
];

export const mockEventCrudImportProvenance: EventCrudImportProvenance = {
  source: EVENT_CRUD_IMPORT_FIXTURE_SOURCE,
  sourceLabel: "Mock event CRUD and import fixture",
  evidenceIds: [
    "evidence:events-calendar-fixture",
    "evidence:events-organizer-fixture",
    "evidence:events-manual-note",
  ],
  collectedAt: fixtureCollectedAt,
  privacy: "demo-event-crud-import-only",
  generationMethod: "fixture",
  calendarSyncRequested: false,
  organizerFeedRequested: false,
  liveDatabaseWriteExecuted: false,
  externalNetworkRequested: false,
  aiProviderRequested: false,
  emailProviderRequested: false,
  notificationDelivered: false,
};

export const mockEventFailureProvenance: EventCrudImportProvenance = {
  ...mockEventCrudImportProvenance,
  sourceLabel: "Mock event CRUD and import failure rule",
  evidenceIds: ["evidence:events-controlled-failure"],
};

export const mockEventListFixture: EventListPayload = {
  state: "success",
  events: mockEventRecords,
  importedRecords: mockImportedEventRecords,
  summary:
    "Three local event records combine calendar sync, organizer feed, and manual event fixtures without live writes.",
  provenance: mockEventCrudImportProvenance,
  nextAction:
    "Review source metadata before composing event readiness or attendee workflows.",
};

export const mockEmptyEventListFixture: EventListPayload = {
  state: "empty",
  events: [],
  importedRecords: [],
  summary: "No local event fixture rows are available for this mock scenario.",
  provenance: {
    ...mockEventCrudImportProvenance,
    sourceLabel: "Mock empty event list rule",
    evidenceIds: ["evidence:events-empty-list"],
    generationMethod: "rule-based-event-filter",
  },
  nextAction:
    "Create a manual event or import a local event fixture before planning outreach.",
};

export const mockPendingEventListFixture: EventListPayload = {
  state: "pending",
  events: [],
  importedRecords: [],
  summary:
    "Local event import fixtures are pending operator review before events can be used.",
  provenance: {
    ...mockEventCrudImportProvenance,
    sourceLabel: "Mock pending event import rule",
    evidenceIds: ["evidence:events-pending-import"],
    generationMethod: "rule-based-event-filter",
  },
  nextAction:
    "Wait for fixture review instead of calling calendar sync or organizer feeds.",
};

export const mockManualEventCreationFixture: ManualEventCreationPayload = {
  state: "success",
  event: mockEventRecords[2],
  importedRecords: [],
  summary:
    "Manual event creation staged a local event record and skipped live database writes.",
  provenance: {
    ...mockEventCrudImportProvenance,
    sourceLabel: "Mock manual event creation fixture",
    evidenceIds: ["evidence:events-manual-note"],
    generationMethod: "rule-based-manual-event-creation",
  },
  nextAction:
    "Attach relationship goals and attendee context before confirming the event.",
};

export const mockEventDetailFixture: EventDetailPayload = {
  state: "success",
  event: mockEventRecords[0],
  importedRecords: [mockImportedEventRecords[0]],
  summary:
    "Climate founders dinner came from a local calendar sync fixture with source evidence attached.",
  provenance: {
    ...mockEventCrudImportProvenance,
    evidenceIds: ["evidence:events-calendar-fixture"],
  },
  nextAction: "Review attendees and readiness context before the event.",
};

function slugFromTitle(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function buildManualEventCreationPayload(
  input: Required<
    Pick<ManualEventCreationInput, "title" | "venue" | "startsAt" | "endsAt">
  > &
    Pick<ManualEventCreationInput, "description" | "sourceNote">,
): ManualEventCreationPayload {
  // 手动创建活动只生成本地 payload，并把来源标记为 fixture 规则。
  // 不会写入真实日历、活动数据库或远程活动系统。
  const event = createEventRecord({
    id: `event:manual:${slugFromTitle(input.title)}`,
    title: input.title,
    description:
      input.description?.trim() ||
      input.sourceNote?.trim() ||
      "Manual event staged from the local event creation mock.",
    venue: input.venue,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    status: "draft",
    sourceMetadata: {
      ...mockEventOrigins.manual,
      providerRecordId: `manual:event-${slugFromTitle(input.title)}`,
    },
    evidenceId: "evidence:events-manual-note",
    relationshipContext:
      "Manual event creation needs relationship context before product workflows use it.",
    recommendedPreparation:
      "Add target contacts, goals, and follow-up owner notes before confirming.",
    nextAction:
      "Review the manually staged event before adding attendees or reminders.",
  });

  return {
    ...mockManualEventCreationFixture,
    event,
    summary: `${input.title} was staged by deterministic manual event rules.`,
  };
}

export function buildEventListPayload(input: {
  events: readonly EventRecord[];
  importedRecords: readonly ImportedEventRecord[];
  summary: string;
  evidenceIds: readonly string[];
}): EventListPayload {
  // 列表构造器复用同一套 provenance，同时允许替换事件集合和页面状态。
  return {
    ...mockEventListFixture,
    state: input.events.length > 0 ? "success" : "empty",
    events: input.events,
    importedRecords: input.importedRecords,
    summary: input.summary,
    provenance: {
      ...mockEventCrudImportProvenance,
      evidenceIds: input.evidenceIds,
      generationMethod: "rule-based-event-filter",
      sourceLabel: "Rule-based event filter fixture",
    },
    nextAction:
      input.events.length > 0
        ? "Review the filtered event source metadata."
        : "Clear the local event filter before planning outreach.",
  };
}

export function buildEventDetailPayload(event: EventRecord): EventDetailPayload {
  // 详情页直接由 event record 派生，避免列表和详情里的活动字段漂移。
  return {
    ...mockEventDetailFixture,
    event,
    importedRecords: mockImportedEventRecords.filter(
      (record) => record.eventId === event.id,
    ),
    summary: `${event.title} is available from the local event fixture.`,
    provenance: {
      ...mockEventCrudImportProvenance,
      evidenceIds: event.evidence.map((evidence) => evidence.evidenceId),
      sourceLabel: event.sourceMetadata.label,
    },
    nextAction: event.nextAction,
  };
}
