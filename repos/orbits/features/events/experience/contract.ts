import type {
  EventParticipantProfileField,
  EventRegistrationQuestionIntent,
} from "../registration/contract";

export const EVENT_EXPERIENCE_TEMPLATE_IDS = ["default"] as const;
export type EventExperienceTemplateId =
  (typeof EVENT_EXPERIENCE_TEMPLATE_IDS)[number];

export const EVENT_EXPERIENCE_QUESTION_TRACKS = ["v1", "v2"] as const;
export type EventExperienceQuestionTrack =
  (typeof EVENT_EXPERIENCE_QUESTION_TRACKS)[number];

/**
 * The organizer may choose wording and options, but never a new profile
 * dimension. Keeping this map in one place prevents a question from writing
 * into an unrelated participant field.
 */
export const EVENT_EXPERIENCE_QUESTION_MAPPING = Object.freeze({
  desired_outcome: "desiredOutcome",
  follow_up_preference: "followUpPreference",
  positioning: "positioning",
  target_attendees: "targetAttendees",
  value_offered: "valueOffered",
} as const satisfies Record<
  EventRegistrationQuestionIntent,
  EventParticipantProfileField
>);

export interface EventExperienceQuestion {
  id: EventRegistrationQuestionIntent;
  intent: EventRegistrationQuestionIntent;
  options: readonly string[];
  participantProfileField: EventParticipantProfileField;
  prompt: string;
  required: boolean;
}

export interface EventExperienceQuestionSetInput {
  questions: readonly EventExperienceQuestion[];
  track: EventExperienceQuestionTrack;
}

export interface EventExperienceConfiguration {
  /** Kept nullable for compatibility; MVP does not accept organizer asset ids. */
  coverAssetId: string | null;
  introduction: string | null;
  accentColor: string | null;
  questionSet: EventExperienceQuestionSetInput;
  templateId: EventExperienceTemplateId;
}

export interface EventExperienceVersion {
  configuration: EventExperienceConfiguration;
  createdAt: string;
  createdByActorId: string;
  eventId: string;
  hash: string;
  version: number;
}

export interface EventExperienceHead {
  draftVersion: number | null;
  eventId: string;
  frozenAt: string | null;
  publishedAt: string | null;
  publishedVersion: number | null;
  revision: number;
}

export interface EventExperienceSnapshot {
  draft: EventExperienceVersion | null;
  head: EventExperienceHead;
  published: EventExperienceVersion | null;
}

/** Public registration metadata. It contains no organizer-only draft data. */
export interface EventExperiencePublishedQuestionSet {
  hash: string;
  questions: readonly EventExperienceQuestion[];
  questionSetVersion: number;
  track: EventExperienceQuestionTrack;
}

export interface EventExperienceErrorContext {
  eventId: string;
  expectedRevision: number | null;
  revision: number | null;
}

export type EventExperienceErrorCode =
  | "EVENT_EXPERIENCE_EVENT_ID_REQUIRED"
  | "EVENT_EXPERIENCE_NOT_FOUND"
  | "EVENT_EXPERIENCE_INVALID"
  | "EVENT_EXPERIENCE_VERSION_CONFLICT"
  | "EVENT_EXPERIENCE_FROZEN"
  | "EVENT_EXPERIENCE_PUBLISH_REQUIRED"
  | "EVENT_EXPERIENCE_STORAGE_UNAVAILABLE";

export class EventExperienceError extends Error {
  constructor(
    readonly code: EventExperienceErrorCode,
    message: string,
    readonly context?: Partial<EventExperienceErrorContext>,
  ) {
    super(message);
    this.name = "EventExperienceError";
  }
}

export interface SaveEventExperienceDraftInput {
  actorId: string;
  configuration: EventExperienceConfiguration;
  eventId: string;
  expectedRevision: number | null;
}

export interface PublishEventExperienceInput {
  actorId: string;
  eventId: string;
  expectedRevision: number;
}

export interface EventExperienceRepository {
  get(eventId: string): Promise<EventExperienceSnapshot | null>;
  publish(input: PublishEventExperienceInput): Promise<EventExperienceSnapshot>;
  saveDraft(
    input: SaveEventExperienceDraftInput,
  ): Promise<EventExperienceSnapshot>;
}

export interface EventExperienceService {
  get(eventId: string): Promise<EventExperienceSnapshot>;
  getPublishedQuestionSet(
    eventId: string,
  ): Promise<EventExperiencePublishedQuestionSet | null>;
  preview(configuration: EventExperienceConfiguration): EventExperienceSnapshot["draft"];
  publish(input: PublishEventExperienceInput): Promise<EventExperienceSnapshot>;
  saveDraft(
    input: SaveEventExperienceDraftInput,
  ): Promise<EventExperienceSnapshot>;
}
