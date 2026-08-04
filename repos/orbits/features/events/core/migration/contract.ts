export type EventCanonicalResolutionField =
  | "description"
  | "endsAt"
  | "lifecycleState"
  | "organizerActorId"
  | "publicCode"
  | "startsAt"
  | "timezone"
  | "title"
  | "venue";

export interface EventCanonicalSourceValueDigest {
  digest: string;
  source: string;
}

export interface EventCanonicalConflictResolution {
  eventId: string;
  field: EventCanonicalResolutionField;
  rationale: string;
  reasonCode: string;
  selectedSource: string;
  sourceValueDigests: readonly EventCanonicalSourceValueDigest[];
}

export interface EventCanonicalResolutionManifest {
  migrationId: string;
  resolutions: readonly EventCanonicalConflictResolution[];
  schemaVersion: 1;
}
