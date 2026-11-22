import type {
  EventOperationsCandidate,
  EventOperationsParticipant,
} from "./contract";
import {
  needConcept,
  needConceptsAnsweredBy,
  offerAnswersNeed,
  offerConcept,
  offerConceptsAnswering,
  topicConcept,
  topicsShare,
} from "./match-concepts";

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
  // Real-match recall (2026-11-22): the same concept table the AI step uses decides who truly matches, so a
  // person with a sparse profile still gets every real match into the shortlist before any token-overlap guess.
  const conceptIndex = (select: (participant: EventOperationsParticipant) => readonly (string | null)[]) => {
    const mutable = new Map<string, string[]>();
    for (const participant of ordered) {
      for (const concept of new Set(select(participant).filter((value): value is string => value !== null))) {
        const bucket = mutable.get(concept) ?? [];
        bucket.push(participant.participantId);
        mutable.set(concept, bucket);
      }
    }
    return mutable as FacetIndex;
  };
  const offerConceptIndex = conceptIndex((participant) => participant.offers.map(offerConcept));
  const needConceptIndex = conceptIndex((participant) => participant.needs.map(needConcept));
  const topicConceptIndex = conceptIndex((participant) => participant.topics.map(topicConcept));
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
    // 1. Real matches: a need answered by an offer (either direction) or a topic of the same concept.
    const realIds = new Set<string>();
    const realBuckets: readonly [string, FacetIndex, readonly string[]][] = [
      ["real-need-offer", offerConceptIndex, [...new Set(source.needs.flatMap(offerConceptsAnswering))]],
      ["real-offer-need", needConceptIndex, [...new Set(source.offers.flatMap(needConceptsAnsweredBy))]],
      ["real-topic", topicConceptIndex, [...new Set(source.topics.map(topicConcept).filter((value): value is string => value !== null))]],
    ];
    for (const [kind, index, concepts] of realBuckets) {
      for (const concept of concepts) {
        if (realIds.size >= candidatePoolLimit) break;
        metrics.facetBucketVisits += gatherBucket({
          bucket: index.get(concept) ?? [],
          into: realIds,
          limit: Math.min(bucketVisitLimit, candidatePoolLimit - realIds.size + 1),
          seed: `${source.participantId}\u0000${kind}\u0000${concept}`,
          sourceParticipantId: source.participantId,
        });
      }
    }
    const realMatches = [...realIds].slice(0, candidatePoolLimit).map((targetParticipantId) => {
      metrics.pairComparisons += 1;
      const target = participantById.get(targetParticipantId)!;
      const needOffer = source.needs.reduce((count, need) => count + target.offers.filter((offer) => offerAnswersNeed(need, offer)).length, 0)
        + target.needs.reduce((count, need) => count + source.offers.filter((offer) => offerAnswersNeed(need, offer)).length, 0);
      const sharedTopics = source.topics.reduce((count, topic) => count + target.topics.filter((other) => topicsShare(topic, other)).length, 0);
      return { needOffer, sharedTopics, targetParticipantId };
    }).filter((match) => match.needOffer > 0 || match.sharedTopics > 0);
    const realById = new Map(realMatches.map((match) => [match.targetParticipantId, match]));

    // 2. The original token-overlap pool fills what real matches leave (same budget as before).
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
      .filter((id) => !realById.has(id))
      .slice(0, Math.max(0, candidatePoolLimit - realMatches.length));
    const stablePoolIds = new Set(stablePool);
    // Fill only up to the shortlist size together with the real matches.
    if (realMatches.length >= limit) stablePool.length = 0;
    if (stablePool.length < limit && ordered.length > 1) {
      const start = stableNumber(source.participantId) % ordered.length;
      for (
        let offset = 0;
        offset < Math.min(ordered.length, limit * 3 + 1) &&
        stablePool.length + realMatches.length < limit;
        offset += 1
      ) {
        metrics.supplementVisits += 1;
        const target = ordered[(start + offset) % ordered.length]!;
        if (
          target.participantId !== source.participantId &&
          !stablePoolIds.has(target.participantId) &&
          !realById.has(target.participantId)
        ) {
          stablePool.push(target.participantId);
          stablePoolIds.add(target.participantId);
        }
      }
    }

    const scored = [...realMatches.map((match) => match.targetParticipantId), ...stablePool].map((targetParticipantId) => {
      // A real match was already compared once above.
      if (!realById.has(targetParticipantId)) metrics.pairComparisons += 1;
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
      const real = realById.get(targetParticipantId);
      // Real matches rank first: need/offer answers, then shared topics, then the original overlap score.
      const realScore = real ? 1_000_000 + real.needOffer * 100_000 + real.sharedTopics * 1_000 : 0;
      const retrievalScore =
        realScore +
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
          realNeedOffer: real?.needOffer ?? 0,
          realSharedTopics: real?.sharedTopics ?? 0,
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
