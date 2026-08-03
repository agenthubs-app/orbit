import type {
  EventOperationsCandidate,
  EventOperationsParticipant,
} from "./contract";

const MAX_CANDIDATES_PER_SOURCE = 32;
const MAX_FACETS_PER_KIND = 8;

function tokens(values: readonly (string | null)[]): string[] {
  return Array.from(
    new Set(
      values
        .flatMap((value) =>
          (value ?? "")
            .normalize("NFKC")
            .toLocaleLowerCase("en")
            .split(/[^\p{L}\p{N}]+/u),
        )
        .map((value) => value.trim())
        .filter((value) => value.length >= 2),
    ),
  )
    .sort()
    .slice(0, MAX_FACETS_PER_KIND);
}

function overlap(left: readonly string[], right: ReadonlySet<string>): number {
  let count = 0;
  for (const value of left) if (right.has(value)) count += 1;
  return count;
}

function stableNumber(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

interface ParticipantFeatures {
  language: readonly string[];
  languageSet: ReadonlySet<string>;
  needs: readonly string[];
  needsSet: ReadonlySet<string>;
  offers: readonly string[];
  offersSet: ReadonlySet<string>;
  topics: readonly string[];
  topicsSet: ReadonlySet<string>;
}

function featuresFor(
  participant: EventOperationsParticipant,
): ParticipantFeatures {
  const language = tokens(participant.languages);
  const needs = tokens(participant.needs);
  const offers = tokens(participant.offers);
  const topics = tokens([
    ...participant.topics,
    participant.industry,
    participant.experienceHighlight,
  ]);
  return {
    language,
    languageSet: new Set(language),
    needs,
    needsSet: new Set(needs),
    offers,
    offersSet: new Set(offers),
    topics,
    topicsSet: new Set(topics),
  };
}

type FacetIndex = ReadonlyMap<string, readonly string[]>;

function indexFor(
  participants: readonly EventOperationsParticipant[],
  features: ReadonlyMap<string, ParticipantFeatures>,
  select: (value: ParticipantFeatures) => readonly string[],
): FacetIndex {
  const mutable = new Map<string, string[]>();
  for (const participant of participants) {
    for (const facet of select(features.get(participant.participantId)!)) {
      const bucket = mutable.get(facet) ?? [];
      bucket.push(participant.participantId);
      mutable.set(facet, bucket);
    }
  }
  for (const bucket of mutable.values()) bucket.sort();
  return mutable;
}

function gatherBucket(input: {
  bucket: readonly string[];
  into: Set<string>;
  limit: number;
  seed: string;
  sourceParticipantId: string;
}): number {
  if (input.bucket.length === 0) return 0;
  const start = stableNumber(input.seed) % input.bucket.length;
  const visitLimit = Math.min(input.bucket.length, input.limit);
  let visits = 0;
  for (let offset = 0; offset < visitLimit; offset += 1) {
    const candidateId = input.bucket[(start + offset) % input.bucket.length]!;
    visits += 1;
    if (candidateId !== input.sourceParticipantId) input.into.add(candidateId);
  }
  return visits;
}

export interface EventOperationsCandidateRetrievalMetrics {
  facetBucketVisits: number;
  pairComparisons: number;
  shortlistEntries: number;
  supplementVisits: number;
}

export interface EventOperationsCandidateRetrievalResult {
  candidates: readonly EventOperationsCandidate[];
  metrics: EventOperationsCandidateRetrievalMetrics;
}

export function eventOperationsCandidateLimit(
  recommendationCount: number,
): number {
  return Math.min(
    MAX_CANDIDATES_PER_SOURCE,
    Math.max(12, Math.max(1, Math.floor(recommendationCount)) * 4),
  );
}

export function buildDeterministicCandidates(input: {
  generationId: string;
  participants: readonly EventOperationsParticipant[];
  recommendationCount: number;
}): EventOperationsCandidateRetrievalResult {
  const ordered = [...input.participants].sort((left, right) =>
    left.participantId.localeCompare(right.participantId),
  );
  const participantById = new Map(
    ordered.map((participant) => [participant.participantId, participant]),
  );
  const features = new Map(
    ordered.map((participant) => [
      participant.participantId,
      featuresFor(participant),
    ]),
  );
  const needIndex = indexFor(ordered, features, (value) => value.needs);
  const offerIndex = indexFor(ordered, features, (value) => value.offers);
  const topicIndex = indexFor(ordered, features, (value) => value.topics);
  const languageIndex = indexFor(ordered, features, (value) => value.language);
  const limit = Math.min(
    Math.max(0, ordered.length - 1),
    eventOperationsCandidateLimit(input.recommendationCount),
  );
  const bucketVisitLimit = Math.max(4, limit * 2);
  const candidatePoolLimit = Math.max(limit, limit * 8);
  const metrics: EventOperationsCandidateRetrievalMetrics = {
    facetBucketVisits: 0,
    pairComparisons: 0,
    shortlistEntries: 0,
    supplementVisits: 0,
  };
  const candidates: EventOperationsCandidate[] = [];

  for (const source of ordered) {
    const sourceFeatures = features.get(source.participantId)!;
    const candidateIds = new Set<string>();
    const facetBuckets: readonly [string, FacetIndex, readonly string[]][] = [
      ["need-offer", offerIndex, sourceFeatures.needs],
      ["offer-need", needIndex, sourceFeatures.offers],
      ["topic", topicIndex, sourceFeatures.topics],
      ["language", languageIndex, sourceFeatures.language],
    ];
    for (const [kind, index, facets] of facetBuckets) {
      for (const facet of facets) {
        metrics.facetBucketVisits += gatherBucket({
          bucket: index.get(facet) ?? [],
          into: candidateIds,
          limit: bucketVisitLimit,
          seed: `${source.participantId}\u0000${kind}\u0000${facet}`,
          sourceParticipantId: source.participantId,
        });
      }
    }

    const stablePool = [...candidateIds]
      .sort(
        (left, right) =>
          stableNumber(`${source.participantId}\u0000${left}`) -
            stableNumber(`${source.participantId}\u0000${right}`) ||
          left.localeCompare(right),
      )
      .slice(0, candidatePoolLimit);
    const stablePoolIds = new Set(stablePool);
    if (stablePool.length < limit && ordered.length > 1) {
      const start = stableNumber(source.participantId) % ordered.length;
      for (
        let offset = 0;
        offset < Math.min(ordered.length, limit * 3 + 1) &&
        stablePool.length < limit;
        offset += 1
      ) {
        metrics.supplementVisits += 1;
        const target = ordered[(start + offset) % ordered.length]!;
        if (
          target.participantId !== source.participantId &&
          !stablePoolIds.has(target.participantId)
        ) {
          stablePool.push(target.participantId);
          stablePoolIds.add(target.participantId);
        }
      }
    }

    const scored = stablePool.map((targetParticipantId) => {
      metrics.pairComparisons += 1;
      const target = participantById.get(targetParticipantId)!;
      const targetFeatures = features.get(targetParticipantId)!;
      const sourceNeedTargetOffer = overlap(
        sourceFeatures.needs,
        targetFeatures.offersSet,
      );
      const targetNeedSourceOffer = overlap(
        targetFeatures.needs,
        sourceFeatures.offersSet,
      );
      const topicOverlap = overlap(
        sourceFeatures.topics,
        targetFeatures.topicsSet,
      );
      const languageOverlap = overlap(
        sourceFeatures.language,
        targetFeatures.languageSet,
      );
      const differentCompany = Boolean(
        source.company &&
          target.company &&
          source.company.trim().toLocaleLowerCase("en") !==
            target.company.trim().toLocaleLowerCase("en"),
      );
      const retrievalScore =
        sourceNeedTargetOffer * 18 +
        targetNeedSourceOffer * 14 +
        topicOverlap * 8 +
        languageOverlap * 5 +
        (differentCompany ? 3 : 0) +
        (target.profileCompleteness === "complete"
          ? 2
          : target.profileCompleteness === "partial"
            ? 1
            : 0);
      return {
        featurePayload: {
          differentCompany,
          languageOverlap,
          sourceNeedTargetOffer,
          targetNeedSourceOffer,
          topicOverlap,
        },
        generationId: input.generationId,
        retrievalRank: 0,
        retrievalScore,
        sourceParticipantId: source.participantId,
        targetParticipantId,
      } satisfies EventOperationsCandidate;
    });
    const shortlist = scored
      .sort(
        (left, right) =>
          right.retrievalScore - left.retrievalScore ||
          left.targetParticipantId.localeCompare(right.targetParticipantId),
      )
      .slice(0, limit)
      .map((candidate, index) => ({
        ...candidate,
        retrievalRank: index + 1,
      }));
    metrics.shortlistEntries += shortlist.length;
    candidates.push(...shortlist);
  }

  return { candidates, metrics };
}
