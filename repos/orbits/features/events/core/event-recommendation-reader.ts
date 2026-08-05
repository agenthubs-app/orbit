import type { EventRecord } from "../event-crud-and-import/contract";
import {
  createConfiguredCanonicalPublicEventCatalogue,
} from "./public-catalogue-runtime";
import type { CanonicalPublicEventCatalogue } from "./public-catalogue";

export const CANONICAL_EVENT_RECOMMENDATION_SOURCE =
  "event-core-postgres" as const;
export const CANONICAL_EVENT_RECOMMENDATION_SOURCE_LABEL =
  "Canonical Event Core" as const;

export interface CanonicalEventRecommendationSnapshot {
  collectedAt: string;
  evidenceIds: readonly string[];
  records: readonly EventRecord[];
  source: typeof CANONICAL_EVENT_RECOMMENDATION_SOURCE;
  sourceLabel: typeof CANONICAL_EVENT_RECOMMENDATION_SOURCE_LABEL;
}

export interface CanonicalEventRecommendationReader {
  read(now: Date): Promise<CanonicalEventRecommendationSnapshot>;
}

export class CanonicalEventRecommendationReadError extends Error {
  readonly code:
    | "EVENT_RECOMMENDATION_CANONICAL_INVALID"
    | "EVENT_RECOMMENDATION_CANONICAL_UNAVAILABLE";

  constructor(
    code:
      | "EVENT_RECOMMENDATION_CANONICAL_INVALID"
      | "EVENT_RECOMMENDATION_CANONICAL_UNAVAILABLE",
    message: string,
  ) {
    super(message);
    this.name = "CanonicalEventRecommendationReadError";
    this.code = code;
  }
}

function invalid(field: string): never {
  throw new CanonicalEventRecommendationReadError(
    "EVENT_RECOMMENDATION_CANONICAL_INVALID",
    `Canonical event recommendation snapshot has invalid ${field}.`,
  );
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) invalid(field);
  return value.trim();
}

function timestamp(value: unknown, field: string): string {
  const text = requiredText(value, field);
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed)) invalid(field);
  return new Date(parsed).toISOString();
}

function validatedRecord(record: EventRecord): EventRecord {
  const id = requiredText(record.id, "record.id");
  requiredText(record.title, `record ${id} title`);
  requiredText(record.venue, `record ${id} venue`);
  const startsAt = timestamp(record.startsAt, `record ${id} startsAt`);
  const endsAt = timestamp(record.endsAt, `record ${id} endsAt`);
  if (Date.parse(startsAt) >= Date.parse(endsAt)) {
    invalid(`record ${id} time range`);
  }
  if (!Array.isArray(record.evidence) || record.evidence.length === 0) {
    invalid(`record ${id} evidence`);
  }
  for (const evidence of record.evidence) {
    requiredText(evidence.evidenceId, `record ${id} evidenceId`);
  }
  if (
    requiredText(record.sourceMetadata.provider, `record ${id} provider`) !==
    CANONICAL_EVENT_RECOMMENDATION_SOURCE
  ) {
    invalid(`record ${id} provider`);
  }
  return record;
}

export function createCanonicalEventRecommendationReader(input: {
  catalogue: CanonicalPublicEventCatalogue;
}): CanonicalEventRecommendationReader {
  return {
    async read() {
      const snapshot = await input.catalogue.readRecords();
      const collectedAt = timestamp(snapshot.generatedAt, "generatedAt");
      if (!Array.isArray(snapshot.records)) invalid("records");
      const records = snapshot.records.map(validatedRecord);
      const ids = new Set<string>();
      for (const record of records) {
        if (ids.has(record.id)) invalid(`duplicate event id ${record.id}`);
        ids.add(record.id);
      }

      return {
        collectedAt,
        evidenceIds: [
          ...new Set(
            records.flatMap((record) =>
              record.evidence.map((evidence) => evidence.evidenceId),
            ),
          ),
        ],
        records,
        source: CANONICAL_EVENT_RECOMMENDATION_SOURCE,
        sourceLabel: CANONICAL_EVENT_RECOMMENDATION_SOURCE_LABEL,
      };
    },
  };
}

export function createConfiguredCanonicalEventRecommendationReader(): CanonicalEventRecommendationReader {
  return {
    async read(now) {
      const catalogue = createConfiguredCanonicalPublicEventCatalogue({ now });
      if (!catalogue) {
        throw new CanonicalEventRecommendationReadError(
          "EVENT_RECOMMENDATION_CANONICAL_UNAVAILABLE",
          "Canonical Event Core is unavailable for event recommendations.",
        );
      }
      return createCanonicalEventRecommendationReader({ catalogue }).read(now);
    },
  };
}
