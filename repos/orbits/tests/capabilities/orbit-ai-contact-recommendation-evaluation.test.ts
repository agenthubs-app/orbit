import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { defaultMockFixtures } from "../../shared/mock/fixtures";
import { createMockOrbitAiContactRecommendationCandidates } from "../../features/orbit-ai/mock-contact-recommendation-service";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

async function importProjectModule<TModule>(
  pathFromRoot: string,
): Promise<TModule> {
  const absolutePath = join(projectRoot, pathFromRoot);

  assert.equal(
    existsSync(absolutePath),
    true,
    `${pathFromRoot} must exist for the Sprint 86 recommendation evaluation`,
  );

  return (await import(pathToFileURL(absolutePath).href)) as TModule;
}

interface RecommendationEvaluationCase {
  expectedTopContactId?: string;
  id: string;
  goal: string;
  locale?: "en" | "zh";
  maxRecommendations?: number;
  privacyMode?: "full" | "limited";
  shouldBeReady: boolean;
}

interface RecommendationResult {
  evidenceCoverage: {
    conversation: number;
    event: number;
    follow_up: number;
    profile: number;
    relationship: number;
  };
  recommendations: readonly {
    confidence: "high" | "medium";
    contactId: string;
    detailHref: string;
    evidenceSnippets: readonly {
      evidenceId: string;
      privacy: string;
      signal: string;
      snippet: string;
      sourceLabel: string;
    }[];
    score: number;
    sourceBackedReasons: readonly string[];
    whyThisPerson: string;
  }[];
  rejectedContacts: readonly {
    contactId: string;
    displayName: string;
    highProfile: boolean;
    reason: string;
    score: number;
  }[];
  readiness: {
    minimumReadyScore: number;
    state: "ready" | "needs_more_context" | "no_recommendation";
  };
}

test("relationship recommendation service evaluates ten named goal cases", async () => {
  const module = await importProjectModule<{
    ORBIT_AI_CONTACT_RECOMMENDATION_EVALUATION_CASES: readonly RecommendationEvaluationCase[];
    ORBIT_AI_CONTACT_RECOMMENDATION_READY_SCORE_THRESHOLD: number;
    createOrbitAiRelationshipRecommendationService: (input: {
      candidates: ReturnType<
        typeof createMockOrbitAiContactRecommendationCandidates
      >;
    }) => {
      recommendContacts: (input: RecommendationEvaluationCase) => RecommendationResult;
    };
  }>("features/orbit-ai/contact-recommendation-service.ts");

  assert.deepEqual(
    module.ORBIT_AI_CONTACT_RECOMMENDATION_EVALUATION_CASES.map(
      (item) => item.id,
    ),
    [
      "industry_fit",
      "market_entry_help",
      "investor_search",
      "organizer_intro",
      "weak_tie_relevance",
      "negative_match_filtering",
      "ambiguous_goal",
      "chinese_input",
      "english_input",
      "privacy_limited_data",
    ],
  );

  const service = module.createOrbitAiRelationshipRecommendationService({
    candidates: createMockOrbitAiContactRecommendationCandidates(),
  });

  for (const evaluationCase of module.ORBIT_AI_CONTACT_RECOMMENDATION_EVALUATION_CASES) {
    const result = service.recommendContacts(evaluationCase);

    assert.equal(
      result.readiness.minimumReadyScore,
      module.ORBIT_AI_CONTACT_RECOMMENDATION_READY_SCORE_THRESHOLD,
      `${evaluationCase.id} must report the documented readiness threshold`,
    );

    if (evaluationCase.shouldBeReady) {
      assert.equal(result.readiness.state, "ready", evaluationCase.id);
      assert.equal(
        result.recommendations[0]?.contactId,
        evaluationCase.expectedTopContactId,
        `${evaluationCase.id} should rank the expected contact first`,
      );
      assert.ok(
        (result.recommendations[0]?.score ?? 0) >=
          module.ORBIT_AI_CONTACT_RECOMMENDATION_READY_SCORE_THRESHOLD,
        `${evaluationCase.id} top score must clear threshold`,
      );
    } else {
      assert.notEqual(result.readiness.state, "ready", evaluationCase.id);
      assert.equal(
        result.recommendations.length,
        0,
        `${evaluationCase.id} should not expose low-confidence recommendations`,
      );
    }
  }
});

test("ready recommendations carry multiple real source families without inventing missing evidence", async () => {
  const module = await importProjectModule<{
    createOrbitAiRelationshipRecommendationService: (input: {
      candidates: ReturnType<
        typeof createMockOrbitAiContactRecommendationCandidates
      >;
    }) => {
      recommendContacts: (input: {
        goal: string;
        locale?: "en" | "zh";
      }) => RecommendationResult;
    };
  }>("features/orbit-ai/contact-recommendation-service.ts");

  const result = module
    .createOrbitAiRelationshipRecommendationService({
      candidates: createMockOrbitAiContactRecommendationCandidates(),
    })
    .recommendContacts({
      goal: "Find a Japan SMB manufacturing AI workflow PoC buyer with follow-up context.",
      locale: "en",
    });
  const top = result.recommendations[0];

  assert.equal(top?.contactId, "contact_001");
  assert.deepEqual(Object.keys(result.evidenceCoverage).sort(), [
    "conversation",
    "event",
    "follow_up",
    "profile",
    "relationship",
  ]);
  assert.ok(result.evidenceCoverage.profile >= 1);
  assert.ok(result.evidenceCoverage.relationship >= 1);
  assert.ok(result.evidenceCoverage.event >= 1);
  assert.ok(result.evidenceCoverage.conversation >= 1);
  assert.ok(result.evidenceCoverage.follow_up >= 0);
  assert.ok(
    Object.values(result.evidenceCoverage).filter((count) => count > 0)
      .length >= 3,
  );
  assert.equal(top?.detailHref, "/app/contacts/contact_001");
  assert.match(top?.whyThisPerson ?? "", /AI workflow|PoC|manufacturing/i);
  assert.ok((top?.sourceBackedReasons.length ?? 0) >= 2);
  assert.ok((top?.evidenceSnippets.length ?? 0) >= 3);
});

test("unsupported goals fail closed without leaking a hand-authored celebrity contact", async () => {
  const module = await importProjectModule<{
    ORBIT_AI_CONTACT_RECOMMENDATION_EVALUATION_CASES: readonly RecommendationEvaluationCase[];
    ORBIT_AI_CONTACT_RECOMMENDATION_READY_SCORE_THRESHOLD: number;
    createOrbitAiRelationshipRecommendationService: (input: {
      candidates: ReturnType<
        typeof createMockOrbitAiContactRecommendationCandidates
      >;
    }) => {
      recommendContacts: (input: RecommendationEvaluationCase) => RecommendationResult;
    };
  }>("features/orbit-ai/contact-recommendation-service.ts");

  const service = module.createOrbitAiRelationshipRecommendationService({
    candidates: createMockOrbitAiContactRecommendationCandidates(),
  });
  const negativeCases =
    module.ORBIT_AI_CONTACT_RECOMMENDATION_EVALUATION_CASES.filter(
      (evaluationCase) => evaluationCase.shouldBeReady === false,
    );

  assert.ok(negativeCases.length >= 2);

  for (const evaluationCase of negativeCases) {
    const result = service.recommendContacts(evaluationCase);

    assert.equal(result.recommendations.length, 0, evaluationCase.id);
    assert.equal(
      result.rejectedContacts.length,
      defaultMockFixtures.contacts.length,
    );
    assert.equal(
      result.rejectedContacts.some(
        (candidate) => candidate.contactId === "contact_900",
      ),
      false,
      "the removed hand-authored celebrity fixture must never enter product results",
    );
    assert.ok(
      result.rejectedContacts.every((candidate) =>
        defaultMockFixtures.contacts.some(
          (contact) => contact.id === candidate.contactId,
        ),
      ),
    );
  }
});

test("privacy-limited evaluation removes private snippets but still ranks with allowed evidence", async () => {
  const module = await importProjectModule<{
    createOrbitAiRelationshipRecommendationService: (input: {
      candidates: ReturnType<
        typeof createMockOrbitAiContactRecommendationCandidates
      >;
    }) => {
      recommendContacts: (input: {
        goal: string;
        locale?: "en" | "zh";
        privacyMode?: "full" | "limited";
      }) => RecommendationResult;
    };
  }>("features/orbit-ai/contact-recommendation-service.ts");

  const result = module
    .createOrbitAiRelationshipRecommendationService({
      candidates: createMockOrbitAiContactRecommendationCandidates(),
    })
    .recommendContacts({
      goal: "Use privacy-limited data to find a seed investor who can screen founders.",
      locale: "en",
      privacyMode: "limited",
    });
  const top = result.recommendations[0];

  assert.equal(result.readiness.state, "ready");
  assert.ok(
    defaultMockFixtures.contacts.some(
      (contact) => contact.id === top?.contactId,
    ),
  );
  assert.equal(
    top?.evidenceSnippets.some((snippet) => snippet.privacy === "private"),
    false,
  );
  assert.ok(
    top?.evidenceSnippets.some((snippet) => snippet.signal === "profile"),
  );
  assert.ok(top?.whyThisPerson.includes("privacy-limited"));
});
