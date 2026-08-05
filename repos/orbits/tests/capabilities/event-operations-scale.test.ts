import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDeterministicCandidates,
  eventOperationsCandidateLimit,
} from "../../features/events/event-operations/candidate-retrieval";
import { createEventOperationsAiProvider } from "../../features/events/event-operations/ai-provider";
import type { EventOperationsParticipant } from "../../features/events/event-operations/contract";

function scaleParticipants(count: number): EventOperationsParticipant[] {
  return Array.from({ length: count }, (_, index) => ({
    actorId: `actor:scale:${index}`,
    company: `Company ${index % 73}`,
    displayName: `Scale Participant ${index}`,
    energyStyle: index % 2 === 0 ? "structured" : "exploratory",
    evidenceIds: [`evidence:scale:${index}`],
    experienceHighlight: `Built program ${index % 97} in market ${index % 31}`,
    industry: `Industry ${index % 41}`,
    languages: [`language-${index % 7}`, `language-${(index + 2) % 7}`],
    lateRegistration: false,
    needs: [`capability-${index % 53}`, `buyer-${index % 29}`],
    offers: [
      `capability-${(index + 11) % 53}`,
      `buyer-${(index + 7) % 29}`,
    ],
    participantId: `participant:scale:${String(index).padStart(4, "0")}`,
    profileCompleteness: "complete",
    role: `Role ${index % 23}`,
    seniority: `Level ${index % 9}`,
    topics: [`topic-${index % 61}`, `topic-${(index + 13) % 61}`],
  }));
}

test("1,000-participant candidate retrieval is bounded by N×K rather than N²", () => {
  const participants = scaleParticipants(1_000);
  const recommendationCount = 4;
  const limit = eventOperationsCandidateLimit(recommendationCount);
  const result = buildDeterministicCandidates({
    generationId: "generation:scale-1000",
    participants,
    recommendationCount,
  });

  assert.equal(limit, 16);
  assert.equal(result.metrics.shortlistEntries, participants.length * limit);
  assert.ok(
    result.metrics.pairComparisons <= participants.length * limit * 8,
    `pair comparisons ${result.metrics.pairComparisons} exceeded N×K×8`,
  );
  assert.ok(
    result.metrics.facetBucketVisits <= participants.length * limit * 64,
    `facet visits ${result.metrics.facetBucketVisits} exceeded N×K×64`,
  );
  assert.ok(
    result.metrics.supplementVisits <= participants.length * (limit * 3 + 1),
  );
  const first = result.candidates.filter(
    (candidate) =>
      candidate.sourceParticipantId === participants[0]!.participantId,
  );
  assert.deepEqual(
    first.map((candidate) => candidate.retrievalRank),
    Array.from({ length: limit }, (_, index) => index + 1),
  );
  assert.equal(
    new Set(first.map((candidate) => candidate.targetParticipantId)).size,
    limit,
  );
});

test("recommendation adapter prompt contains only a bounded source and shortlist", async () => {
  const participants = scaleParticipants(1_000);
  const sourceParticipant = participants[0]!;
  const candidateParticipants = participants.slice(1, 17);
  let prompt = "";
  const provider = createEventOperationsAiProvider({
    async runModelText(input) {
      prompt = input.userText;
      return {
        model: "scale-model",
        provider: "openai",
        source: "provider:openai-responses-api",
        success: true,
        text: JSON.stringify({
          recommendations: [
            {
              noMatchReason: null,
              recommendations: [
                {
                  icebreakers: ["Question one", "Question two"],
                  memberHint: "Use the supplied evidence.",
                  rank: 1,
                  reasons: ["Bounded shortlist evidence"],
                  score: 90,
                  targetCandidateKey: "S1C1",
                },
              ],
              sourceKey: "S1",
            },
          ],
        }),
      };
    },
  });

  const result = await provider.generateRecommendations({
    eventId: "event:scale",
    recommendationCount: 4,
    sources: [{ candidateParticipants, sourceParticipant }],
  });

  assert.equal(result.success, true);
  assert.match(prompt, new RegExp(sourceParticipant.displayName, "u"));
  assert.match(prompt, new RegExp(candidateParticipants[15]!.displayName, "u"));
  assert.doesNotMatch(prompt, new RegExp(sourceParticipant.participantId, "u"));
  assert.doesNotMatch(prompt, new RegExp(candidateParticipants[15]!.participantId, "u"));
  assert.doesNotMatch(prompt, new RegExp(participants[999]!.participantId, "u"));
  assert.doesNotMatch(prompt, /full immutable snapshot/iu);
  assert.ok(prompt.length < 40_000, `bounded prompt was ${prompt.length} chars`);
});
