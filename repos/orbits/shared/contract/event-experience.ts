export interface EventExperienceQuestionContract {
  id:
    | "target_attendees"
    | "value_offered"
    | "desired_outcome"
    | "follow_up_preference"
    | "positioning";
  intent:
    | "target_attendees"
    | "value_offered"
    | "desired_outcome"
    | "follow_up_preference"
    | "positioning";
  options: readonly string[];
  participantProfileField:
    | "positioning"
    | "industry"
    | "targetAttendees"
    | "valueOffered"
    | "desiredOutcome"
    | "energyStyle"
    | "experienceHighlight"
    | "followUpPreference";
  prompt: string;
  required: boolean;
}

export interface EventExperienceQuestionSetContract {
  questions: readonly EventExperienceQuestionContract[];
  track: "v1" | "v2";
}

export interface EventExperienceConfigurationContract {
  /** Compatibility slot only; organizer-configurable assets are not supported. */
  coverAssetId: string | null;
  introduction: string | null;
  accentColor: string | null;
  questionSet: EventExperienceQuestionSetContract;
  templateId: "default";
}

export interface EventExperienceVersionContract {
  configuration: EventExperienceConfigurationContract;
  createdAt: string;
  createdByActorId: string;
  eventId: string;
  hash: string;
  version: number;
}

export interface EventExperienceHeadContract {
  draftVersion: number | null;
  eventId: string;
  frozenAt: string | null;
  publishedAt: string | null;
  publishedVersion: number | null;
  revision: number;
}

export interface EventExperienceSnapshotContract {
  draft: EventExperienceVersionContract | null;
  head: EventExperienceHeadContract;
  published: EventExperienceVersionContract | null;
}

export interface EventExperiencePreviewResponseContract {
  version: EventExperienceVersionContract;
}
