import type {
  EventCanonicalConflictResolution,
  EventCanonicalResolutionManifest,
} from "../contract";

const resolutions = [
  {
    eventId: "event_signup_02",
    field: "title",
    rationale:
      "The approved public catalogue title is the frozen public event name; the legacy events record retained registration-form wording.",
    reasonCode: "PUBLIC_CATALOGUE_FROZEN_TITLE",
    selectedSource: "public_catalogue",
    sourceValueDigests: [
      {
        source: "orbit_records/events",
        digest: "139e54a55a980757d9b91537f06ad0c1b6d8b3481f6c085bd61d67f7843a8e1c",
      },
      {
        source: "public_catalogue",
        digest: "7c3fc5803255a0271c533dea4d2f2ffba3f7c1b8b909064296947fe91af2319f",
      },
    ],
  },
  {
    eventId: "event_signup_02",
    field: "endsAt",
    rationale:
      "The legacy events record copied startsAt into endsAt; the approved public catalogue preserves the reviewed two-hour event window.",
    reasonCode: "PUBLIC_CATALOGUE_CORRECTED_END_TIME",
    selectedSource: "public_catalogue",
    sourceValueDigests: [
      {
        source: "orbit_records/events",
        digest: "aa515ceff28723658e2a9e0688fda1d6af9da611b88b29f209f5a3364d7aefab",
      },
      {
        source: "public_catalogue",
        digest: "44559aa53f8c7c87cf7ffc765f26ed58cb76632851a3013f78ddf6ada7ca355a",
      },
    ],
  },
  {
    eventId: "event_signup_03",
    field: "title",
    rationale:
      "The approved public catalogue title is the frozen public event name; the legacy events record retained registration-form wording.",
    reasonCode: "PUBLIC_CATALOGUE_FROZEN_TITLE",
    selectedSource: "public_catalogue",
    sourceValueDigests: [
      {
        source: "orbit_records/events",
        digest: "e5014bbefacdd9755d203cf26e16b8bd615f10772891482064c5c2a2805fc240",
      },
      {
        source: "public_catalogue",
        digest: "a738b9140c3c6d2f57d534d5b8b0ca001929a4e5d3794f56001f27e77a67a024",
      },
    ],
  },
  {
    eventId: "event_signup_03",
    field: "endsAt",
    rationale:
      "The legacy events record copied startsAt into endsAt; the approved public catalogue preserves the reviewed two-hour event window.",
    reasonCode: "PUBLIC_CATALOGUE_CORRECTED_END_TIME",
    selectedSource: "public_catalogue",
    sourceValueDigests: [
      {
        source: "orbit_records/events",
        digest: "66aaa79a7ce21ae75494b1756cbd6d66c77e4b7d60b9c54696dc749c65b73378",
      },
      {
        source: "public_catalogue",
        digest: "0f481a404127430cc970e5a075090e1919dd0f654501cb09f081246c6143517e",
      },
    ],
  },
] as const satisfies readonly EventCanonicalConflictResolution[];

if (resolutions.length !== 4) {
  throw new Error("event-canonical-v1 must contain exactly four resolutions.");
}

for (const resolution of resolutions) {
  resolution.sourceValueDigests.forEach(Object.freeze);
  Object.freeze(resolution.sourceValueDigests);
  Object.freeze(resolution);
}

export const EVENT_CANONICAL_V1_MANIFEST: EventCanonicalResolutionManifest =
  Object.freeze({
    migrationId: "event-canonical-v1",
    resolutions: Object.freeze(resolutions),
    schemaVersion: 1 as const,
  });
