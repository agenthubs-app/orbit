export const ORBIT_AI_CONTACT_RECOMMENDATION_READY_SCORE_THRESHOLD = 72;

export type OrbitAiContactRecommendationLocale = "en" | "zh";
export type OrbitAiContactRecommendationPrivacyMode = "full" | "limited";
export type OrbitAiContactRecommendationSignal =
  | "profile"
  | "relationship"
  | "event"
  | "conversation"
  | "follow_up";

export interface OrbitAiContactRecommendationContextMessage {
  role: "user" | "assistant" | "system" | string;
  content: string;
}

export interface OrbitAiContactRecommendationInput {
  contextMessages?: readonly OrbitAiContactRecommendationContextMessage[];
  goal: string;
  locale?: OrbitAiContactRecommendationLocale | string | null;
  maxRecommendations?: number;
  privacyMode?: OrbitAiContactRecommendationPrivacyMode;
  toolArguments?: Record<string, unknown> | null;
}

export interface OrbitAiContactRecommendationEvidenceSnippet {
  evidenceId: string;
  privacy: "public" | "relationship" | "private";
  signal: OrbitAiContactRecommendationSignal;
  snippet: string;
  sourceLabel: string;
}

export interface OrbitAiContactRecommendation {
  confidence: "high" | "medium";
  contactId: string;
  detailHref: string;
  displayName: string;
  evidenceIds: readonly string[];
  evidenceSnippets: readonly OrbitAiContactRecommendationEvidenceSnippet[];
  organization: string;
  recommendedAction: string;
  role: string;
  score: number;
  signalBreakdown: Record<OrbitAiContactRecommendationSignal, number>;
  sourceBackedReasons: readonly string[];
  whyThisPerson: string;
}

export interface OrbitAiRejectedContactRecommendation {
  contactId: string;
  displayName: string;
  highProfile: boolean;
  reason: string;
  score: number;
}

export interface OrbitAiContactRecommendationResult {
  evidenceCoverage: Record<OrbitAiContactRecommendationSignal, number>;
  goalConcepts: readonly string[];
  privacyMode: OrbitAiContactRecommendationPrivacyMode;
  recommendations: readonly OrbitAiContactRecommendation[];
  rejectedContacts: readonly OrbitAiRejectedContactRecommendation[];
  readiness: {
    minimumReadyScore: number;
    state: "ready" | "needs_more_context" | "no_recommendation";
  };
  summary: string;
}

export interface OrbitAiContactRecommendationEvaluationCase
  extends OrbitAiContactRecommendationInput {
  expectedTopContactId?: string;
  id: string;
  shouldBeReady: boolean;
}

export interface OrbitAiContactRecommendationSignalProfile {
  concepts: readonly string[];
  evidenceId: string;
  privacy: OrbitAiContactRecommendationEvidenceSnippet["privacy"];
  signal: OrbitAiContactRecommendationSignal;
  snippet: string;
  sourceLabel: string;
}

export interface OrbitAiContactRecommendationCandidateProfile {
  contactId: string;
  displayName: string;
  highProfile?: boolean;
  organization: string;
  prominence: number;
  recommendedAction: string;
  relationStrength: "strong" | "medium" | "weak";
  role: string;
  signals: readonly OrbitAiContactRecommendationSignalProfile[];
}

export interface OrbitAiRelationshipRecommendationService {
  recommendContacts(
    input: OrbitAiContactRecommendationInput,
  ): OrbitAiContactRecommendationResult;
}

export interface OrbitAiRelationshipRecommendationServiceOptions {
  candidates?: readonly OrbitAiContactRecommendationCandidateProfile[];
}

const signalWeights: Record<OrbitAiContactRecommendationSignal, number> = {
  conversation: 13,
  event: 14,
  follow_up: 11,
  profile: 12,
  relationship: 16,
};

const conceptWeights: Record<string, number> = {
  ai_workflow: 1.25,
  china_saas: 1.35,
  chinese_business_community: 1.25,
  crm: 1.2,
  ecommerce: 1,
  event_organizer: 1.2,
  founder_feedback: 1.05,
  investor: 1.3,
  japan_market_entry: 1.35,
  manufacturing: 1.2,
  market_entry: 1.2,
  poc_buyer: 1.25,
  restaurant: 1.1,
  seed_fundraising: 1.2,
  sponsorship: 1.1,
  weak_tie: 1.3,
};

const conceptLabelsZh: Record<string, string> = {
  ai_workflow: "AI 业务流程",
  china_saas: "中国 SaaS",
  chinese_business_community: "华人商业社群",
  crm: "客户关系管理",
  ecommerce: "跨境电商",
  event_organizer: "活动组织",
  founder_feedback: "创业者反馈",
  investor: "投资人",
  japan_market_entry: "进入日本市场",
  manufacturing: "制造业",
  market_entry: "市场进入",
  poc_buyer: "试点买方",
  restaurant: "餐饮",
  seed_fundraising: "种子轮融资",
  sponsorship: "活动赞助",
  weak_tie: "弱关系",
};

const goalConceptPatterns: readonly {
  concept: string;
  patterns: readonly RegExp[];
}[] = [
  {
    concept: "ai_workflow",
    patterns: [/ai workflow/i, /workflow poc/i, /業務自動化/i, /业务自动化/i, /ai\s*(?:業務|业务|automation|workflow)/i],
  },
  {
    concept: "manufacturing",
    patterns: [/manufactur/i, /製造/i, /制造/i, /中小製造業/i, /中小制造业/i],
  },
  {
    concept: "poc_buyer",
    patterns: [/poc buyer/i, /pilot buyer/i, /試せる買い手/i, /试点.*买方/i, /実証.*先/i, /试点客户/i],
  },
  {
    concept: "china_saas",
    patterns: [/china saas/i, /chinese saas/i, /中国\s*saas/i, /中國\s*saas/i],
  },
  {
    concept: "japan_market_entry",
    patterns: [
      /japan market entry/i,
      /enter(?:ing)? (?:the )?japan market/i,
      /enter japan/i,
      /日本市場参入/i,
      /进入日本市场/i,
      /進入日本市場/i,
    ],
  },
  {
    concept: "market_entry",
    patterns: [/market entry/i, /go[- ]to[- ]market/i, /市场进入/i, /市場進入/i, /参入/i],
  },
  {
    concept: "investor",
    patterns: [/investor/i, /investment partner/i, /投資家/i, /投资人/i],
  },
  {
    concept: "seed_fundraising",
    patterns: [/seed/i, /fundrais/i, /資金調達/i, /融资/i, /融資/i],
  },
  {
    concept: "restaurant",
    patterns: [/restaurant/i, /reservation/i, /飲食/i, /餐饮/i, /予約/i, /预约/i],
  },
  {
    concept: "crm",
    patterns: [/\bcrm\b/i, /customer relationship/i, /予約crm/i, /预约\s*crm/i],
  },
  {
    concept: "founder_feedback",
    patterns: [/founder feedback/i, /founder screening/i, /創業者.*フィードバック/i, /创业者.*反馈/i],
  },
  {
    concept: "event_organizer",
    patterns: [/organizer/i, /community lead/i, /event host/i, /主催/i, /组织者/i, /社群组织/i],
  },
  {
    concept: "chinese_business_community",
    patterns: [/chinese business community/i, /華人ビジネス/i, /华人商业/i, /chinese community/i],
  },
  {
    concept: "sponsorship",
    patterns: [/sponsor/i, /sponsorship/i, /赞助/i, /贊助/i, /スポンサー/i],
  },
  {
    concept: "ecommerce",
    patterns: [/ecommerce/i, /e-commerce/i, /越境ec/i, /跨境电商/i, /cross-border commerce/i],
  },
  {
    concept: "weak_tie",
    patterns: [/weak tie/i, /second[- ]degree/i, /loose connection/i, /弱关系/i, /弱連結/i],
  },
];

/**
 * Historical fixed profiles retained only so older evaluation reports remain
 * explainable. Product recommendations are built from defaultMockFixtures.
 */
export const ORBIT_AI_HAND_AUTHORED_RECOMMENDATION_REFERENCE_PROFILES:
  readonly OrbitAiContactRecommendationCandidateProfile[] = [
  {
    contactId: "contact_001",
    displayName: "佐藤 健一",
    organization: "North Star Foods",
    prominence: 4,
    recommendedAction:
      "Ask whether the manufacturing buyer feedback loop is still open before requesting an AI workflow PoC introduction.",
    relationStrength: "strong",
    role: "Store Owner",
    signals: [
      {
        concepts: ["ai_workflow", "manufacturing", "poc_buyer"],
        evidenceId: "evidence:contact:001",
        privacy: "public",
        signal: "profile",
        snippet:
          "Profile says 佐藤 健一 is looking for an AI workflow PoC buyer in Japanese SMB manufacturing.",
        sourceLabel: "Generated contact profile",
      },
      {
        concepts: ["japan_market_entry", "manufacturing"],
        evidenceId: "evidence:relationship:001",
        privacy: "relationship",
        signal: "relationship",
        snippet:
          "Relationship note links him to Mandarin-Japanese community marketing and buyer feedback.",
        sourceLabel: "Relationship graph",
      },
      {
        concepts: ["ai_workflow", "manufacturing"],
        evidenceId: "evidence:event:02",
        privacy: "public",
        signal: "event",
        snippet:
          "He attended the Japan-China AI Workflow PoC Roundtable where manufacturing DX was discussed.",
        sourceLabel: "Event attendance",
      },
      {
        concepts: ["poc_buyer", "manufacturing"],
        evidenceId: "evidence:conversation:001",
        privacy: "private",
        signal: "conversation",
        snippet:
          "Conversation summary says he can validate whether a manufacturing operator is ready for a PoC buyer call.",
        sourceLabel: "Conversation summary",
      },
      {
        concepts: ["ai_workflow", "poc_buyer"],
        evidenceId: "task_001",
        privacy: "private",
        signal: "follow_up",
        snippet:
          "Follow-up task asks Orbit to confirm the AI workflow PoC buyer path before any outreach.",
        sourceLabel: "Follow-up queue",
      },
    ],
  },
  {
    contactId: "contact_002",
    displayName: "鈴木 真理",
    organization: "Sakura Bridge Foods",
    prominence: 5,
    recommendedAction:
      "Use the market-entry context to ask for one advisor introduction, not a broad contact dump.",
    relationStrength: "strong",
    role: "Community Organizer",
    signals: [
      {
        concepts: ["china_saas", "japan_market_entry", "event_organizer"],
        evidenceId: "evidence:contact:002",
        privacy: "public",
        signal: "profile",
        snippet:
          "Profile says she is looking for a Japan market-entry advisor for China SaaS sales.",
        sourceLabel: "Generated contact profile",
      },
      {
        concepts: ["manufacturing", "market_entry", "poc_buyer"],
        evidenceId: "evidence:relationship:002",
        privacy: "relationship",
        signal: "relationship",
        snippet:
          "Relationship context says she can provide manufacturing DX requirements and buyer feedback.",
        sourceLabel: "Relationship graph",
      },
      {
        concepts: ["ai_workflow", "market_entry", "event_organizer"],
        evidenceId: "evidence:event:02",
        privacy: "public",
        signal: "event",
        snippet:
          "Event record connects her to the Japan-China AI Workflow PoC roundtable organizer circle.",
        sourceLabel: "Event attendance",
      },
      {
        concepts: ["china_saas", "japan_market_entry", "poc_buyer"],
        evidenceId: "evidence:conversation:002",
        privacy: "private",
        signal: "conversation",
        snippet:
          "Conversation note mentions comparing China SaaS sales motions with Japanese buyer expectations.",
        sourceLabel: "Conversation summary",
      },
      {
        concepts: ["market_entry", "event_organizer"],
        evidenceId: "task_002",
        privacy: "private",
        signal: "follow_up",
        snippet:
          "Follow-up queue says to ask her for the right advisor framing after the event recap.",
        sourceLabel: "Follow-up queue",
      },
    ],
  },
  {
    contactId: "contact_003",
    displayName: "高橋 智子",
    organization: "Aoba Foods",
    prominence: 7,
    recommendedAction:
      "Ask for investor-screening context and founder feedback before requesting a seed fundraising intro.",
    relationStrength: "medium",
    role: "Investor Partner",
    signals: [
      {
        concepts: ["investor", "restaurant", "crm", "founder_feedback"],
        evidenceId: "evidence:contact:003",
        privacy: "public",
        signal: "profile",
        snippet:
          "Profile says she is an investor partner focused on restaurant reservation CRM pilot customers.",
        sourceLabel: "Generated contact profile",
      },
      {
        concepts: ["investor", "seed_fundraising"],
        evidenceId: "evidence:relationship:003",
        privacy: "relationship",
        signal: "relationship",
        snippet:
          "Relationship context says she can provide seed investor screening and founder feedback.",
        sourceLabel: "Relationship graph",
      },
      {
        concepts: ["investor", "seed_fundraising"],
        evidenceId: "evidence:event:04",
        privacy: "public",
        signal: "event",
        snippet:
          "Event source places her at the Seed Investor and Founder Matching Salon.",
        sourceLabel: "Event attendance",
      },
      {
        concepts: ["founder_feedback", "restaurant", "crm"],
        evidenceId: "evidence:conversation:003",
        privacy: "private",
        signal: "conversation",
        snippet:
          "Conversation summary says she filtered founder pitches by restaurant CRM pilot readiness.",
        sourceLabel: "Conversation summary",
      },
      {
        concepts: ["investor", "seed_fundraising"],
        evidenceId: "task_003",
        privacy: "private",
        signal: "follow_up",
        snippet:
          "Follow-up task asks for a concise seed investor intro brief before contacting her.",
        sourceLabel: "Follow-up queue",
      },
    ],
  },
  {
    contactId: "contact_004",
    displayName: "田中 健太",
    organization: "Kanda Foods",
    prominence: 4,
    recommendedAction:
      "Use him as a weak-tie event path only after confirming sponsor and table-matching context.",
    relationStrength: "weak",
    role: "DX Consultant",
    signals: [
      {
        concepts: ["seed_fundraising", "investor", "sponsorship"],
        evidenceId: "evidence:contact:004",
        privacy: "public",
        signal: "profile",
        snippet:
          "Profile says he is seeking an investor warm intro and can offer event table matching and sponsor visibility.",
        sourceLabel: "Generated contact profile",
      },
      {
        concepts: ["weak_tie", "sponsorship"],
        evidenceId: "evidence:relationship:004",
        privacy: "relationship",
        signal: "relationship",
        snippet:
          "Relationship graph marks him as a weak tie with sponsor visibility context rather than a close contact.",
        sourceLabel: "Relationship graph",
      },
      {
        concepts: ["event_organizer", "sponsorship"],
        evidenceId: "evidence:event:05",
        privacy: "public",
        signal: "event",
        snippet:
          "Event evidence connects him to the Chinese Business Community Sponsorship Salon.",
        sourceLabel: "Event attendance",
      },
      {
        concepts: ["weak_tie", "event_organizer"],
        evidenceId: "evidence:conversation:004",
        privacy: "private",
        signal: "conversation",
        snippet:
          "Conversation note says the relationship is useful only as a second-degree event table path.",
        sourceLabel: "Conversation summary",
      },
      {
        concepts: ["sponsorship"],
        evidenceId: "task_004",
        privacy: "private",
        signal: "follow_up",
        snippet:
          "Follow-up task says to verify sponsor-fit before asking for introductions.",
        sourceLabel: "Follow-up queue",
      },
    ],
  },
  {
    contactId: "contact_005",
    displayName: "伊藤 香織",
    organization: "Yokohama Foods",
    prominence: 5,
    recommendedAction:
      "Ask whether the sponsorship path should target community reach or cross-border commerce operators.",
    relationStrength: "medium",
    role: "Marketing Lead",
    signals: [
      {
        concepts: ["chinese_business_community", "sponsorship", "ecommerce"],
        evidenceId: "evidence:contact:005",
        privacy: "public",
        signal: "profile",
        snippet:
          "Profile says she is looking for event sponsors with Chinese business-community reach.",
        sourceLabel: "Generated contact profile",
      },
      {
        concepts: ["ecommerce", "market_entry"],
        evidenceId: "evidence:relationship:005",
        privacy: "relationship",
        signal: "relationship",
        snippet:
          "Relationship context says she can offer a cross-border ecommerce launch playbook.",
        sourceLabel: "Relationship graph",
      },
      {
        concepts: ["chinese_business_community", "sponsorship"],
        evidenceId: "evidence:event:05",
        privacy: "public",
        signal: "event",
        snippet:
          "Event evidence links her to the Chinese Business Community Sponsorship Salon.",
        sourceLabel: "Event attendance",
      },
      {
        concepts: ["sponsorship", "ecommerce"],
        evidenceId: "evidence:conversation:005",
        privacy: "private",
        signal: "conversation",
        snippet:
          "Conversation summary says sponsorship should be framed around cross-border commerce reach.",
        sourceLabel: "Conversation summary",
      },
      {
        concepts: ["chinese_business_community"],
        evidenceId: "task_005",
        privacy: "private",
        signal: "follow_up",
        snippet:
          "Follow-up task says to ask for a community sponsorship target list before any external action.",
        sourceLabel: "Follow-up queue",
      },
    ],
  },
  {
    contactId: "contact_006",
    displayName: "中村 怜",
    organization: "Kobe Automation Guild",
    prominence: 3,
    recommendedAction:
      "Use Rei as a second source for the manufacturing PoC buyer path after checking the event and conversation evidence.",
    relationStrength: "medium",
    role: "Automation Partner",
    signals: [
      {
        concepts: ["ai_workflow", "manufacturing"],
        evidenceId: "evidence:contact:006",
        privacy: "public",
        signal: "profile",
        snippet:
          "Profile says Rei works with manufacturing teams evaluating AI workflow automation pilots.",
        sourceLabel: "Generated contact profile",
      },
      {
        concepts: ["ai_workflow", "poc_buyer"],
        evidenceId: "evidence:relationship:006",
        privacy: "relationship",
        signal: "relationship",
        snippet:
          "Relationship note says Rei can compare PoC buyer readiness across automation partners.",
        sourceLabel: "Relationship graph",
      },
      {
        concepts: ["ai_workflow", "manufacturing"],
        evidenceId: "evidence:event:02",
        privacy: "public",
        signal: "event",
        snippet:
          "Event evidence ties Rei to the Japan-China AI Workflow PoC roundtable.",
        sourceLabel: "Event attendance",
      },
      {
        concepts: ["manufacturing", "poc_buyer"],
        evidenceId: "evidence:conversation:006",
        privacy: "private",
        signal: "conversation",
        snippet:
          "Conversation summary says Rei named two manufacturing operators who can assess buyer readiness.",
        sourceLabel: "Conversation summary",
      },
      {
        concepts: ["ai_workflow", "poc_buyer"],
        evidenceId: "task_006",
        privacy: "private",
        signal: "follow_up",
        snippet:
          "Follow-up queue says to verify the automation partner path before requesting an intro.",
        sourceLabel: "Follow-up queue",
      },
    ],
  },
  {
    contactId: "contact_900",
    displayName: "Daniel Apex",
    highProfile: true,
    organization: "Global Keynote Capital",
    prominence: 18,
    recommendedAction:
      "Do not recommend without source evidence that matches the user's concrete goal.",
    relationStrength: "weak",
    role: "High-profile Investor",
    signals: [
      {
        concepts: ["high_profile"],
        evidenceId: "evidence:contact:900",
        privacy: "public",
        signal: "profile",
        snippet:
          "Public profile says Daniel Apex is a visible keynote investor, but no Orbit source links him to the requested work.",
        sourceLabel: "Public profile",
      },
      {
        concepts: ["high_profile"],
        evidenceId: "evidence:relationship:900",
        privacy: "relationship",
        signal: "relationship",
        snippet:
          "Relationship graph has only a weak badge-scan link with no relevant follow-up context.",
        sourceLabel: "Relationship graph",
      },
    ],
  },
];

export const ORBIT_AI_CONTACT_RECOMMENDATION_EVALUATION_CASES: readonly OrbitAiContactRecommendationEvaluationCase[] =
  [
    {
      expectedTopContactId: "contact_001",
      goal: "Find a Japan SMB manufacturing AI workflow PoC buyer with follow-up context.",
      id: "industry_fit",
      locale: "en",
      shouldBeReady: true,
    },
    {
      expectedTopContactId: "contact_012",
      goal: "Find someone who can help China SaaS sales enter the Japan market.",
      id: "market_entry_help",
      locale: "en",
      shouldBeReady: true,
    },
    {
      expectedTopContactId: "contact_003",
      goal: "Find a seed investor who can screen founders for a restaurant reservation CRM pilot.",
      id: "investor_search",
      locale: "en",
      shouldBeReady: true,
    },
    {
      expectedTopContactId: "contact_042",
      goal: "Need a community organizer intro for China SaaS market entry.",
      id: "organizer_intro",
      locale: "en",
      shouldBeReady: true,
    },
    {
      goal: "Find a weak tie who can help with event table matching and sponsor visibility.",
      id: "weak_tie_relevance",
      locale: "en",
      shouldBeReady: false,
    },
    {
      goal: "Find a healthcare regulatory reimbursement expert for a hospital procurement question.",
      id: "negative_match_filtering",
      locale: "en",
      shouldBeReady: false,
    },
    {
      goal: "Who should I meet?",
      id: "ambiguous_goal",
      locale: "en",
      shouldBeReady: false,
    },
    {
      expectedTopContactId: "contact_012",
      goal: "我想找能帮助中国 SaaS 销售进入日本市场的顾问。",
      id: "chinese_input",
      locale: "zh",
      shouldBeReady: true,
    },
    {
      expectedTopContactId: "contact_001",
      goal: "Who can help China SaaS sales enter Japan with manufacturing buyer feedback?",
      id: "english_input",
      locale: "en",
      shouldBeReady: true,
    },
    {
      expectedTopContactId: "contact_024",
      goal: "Use privacy-limited data to find a seed investor who can screen founders.",
      id: "privacy_limited_data",
      locale: "en",
      privacyMode: "limited",
      shouldBeReady: true,
    },
  ];

function readText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeLocale(
  locale: OrbitAiContactRecommendationInput["locale"],
): OrbitAiContactRecommendationLocale {
  return locale === "zh" ? "zh" : "en";
}

function localize(
  locale: OrbitAiContactRecommendationLocale,
  copy: Record<OrbitAiContactRecommendationLocale, string>,
): string {
  return copy[locale];
}

function combinedGoalText(input: OrbitAiContactRecommendationInput): string {
  return [
    input.goal,
    readText(input.toolArguments?.query),
    ...(input.contextMessages ?? []).map((message) => message.content),
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(" ");
}

function conceptsForGoal(goal: string): readonly string[] {
  const concepts = goalConceptPatterns
    .filter((entry) => entry.patterns.some((pattern) => pattern.test(goal)))
    .map((entry) => entry.concept);

  return Array.from(new Set(concepts));
}

export function inferOrbitAiContactRecommendationConcepts(
  text: string,
): readonly string[] {
  return conceptsForGoal(text);
}

function allowedSignalsFor(
  privacyMode: OrbitAiContactRecommendationPrivacyMode,
  candidate: OrbitAiContactRecommendationCandidateProfile,
): readonly OrbitAiContactRecommendationSignalProfile[] {
  return candidate.signals.filter(
    (signal) => privacyMode === "full" || signal.privacy !== "private",
  );
}

function scoreCandidate(input: {
  candidate: OrbitAiContactRecommendationCandidateProfile;
  goalConcepts: readonly string[];
  privacyMode: OrbitAiContactRecommendationPrivacyMode;
}) {
  const breakdown: Record<OrbitAiContactRecommendationSignal, number> = {
    conversation: 0,
    event: 0,
    follow_up: 0,
    profile: 0,
    relationship: 0,
  };
  const snippets: OrbitAiContactRecommendationEvidenceSnippet[] = [];
  const matchedConcepts = new Set<string>();
  let score = input.candidate.prominence;

  if (input.goalConcepts.length === 0) {
    return {
      breakdown,
      matchedConcepts,
      score,
      snippets,
    };
  }

  for (const signal of allowedSignalsFor(input.privacyMode, input.candidate)) {
    const signalMatches = input.goalConcepts.filter((concept) =>
      signal.concepts.includes(concept),
    );

    if (signalMatches.length === 0) continue;

    const signalScore = Math.round(
      signalMatches.reduce(
        (total, concept) => total + (conceptWeights[concept] ?? 1),
        0,
      ) * signalWeights[signal.signal],
    );

    breakdown[signal.signal] += signalScore;
    score += signalScore;
    snippets.push({
      evidenceId: signal.evidenceId,
      privacy: signal.privacy,
      signal: signal.signal,
      snippet: signal.snippet,
      sourceLabel: signal.sourceLabel,
    });
    for (const concept of signalMatches) {
      matchedConcepts.add(concept);
    }
  }

  if (
    input.goalConcepts.includes("weak_tie") &&
    input.candidate.relationStrength === "weak" &&
    matchedConcepts.has("weak_tie")
  ) {
    score += 16;
  }

  if (
    input.goalConcepts.includes("china_saas") &&
    input.goalConcepts.includes("japan_market_entry") &&
    matchedConcepts.has("china_saas") &&
    matchedConcepts.has("japan_market_entry")
  ) {
    score += 12;
  }

  if (
    input.candidate.highProfile &&
    matchedConcepts.size < Math.min(2, input.goalConcepts.length)
  ) {
    score -= 12;
  }

  return {
    breakdown,
    matchedConcepts,
    score: Math.max(0, Math.min(99, score)),
    snippets,
  };
}

function confidenceFor(score: number): OrbitAiContactRecommendation["confidence"] {
  return score >= 86 ? "high" : "medium";
}

function reasonFor(input: {
  candidate: OrbitAiContactRecommendationCandidateProfile;
  locale: OrbitAiContactRecommendationLocale;
  matchedConcepts: ReadonlySet<string>;
  privacyMode: OrbitAiContactRecommendationPrivacyMode;
  score: number;
}): string {
  const concepts = Array.from(input.matchedConcepts)
    .map((concept) =>
      input.locale === "zh"
        ? (conceptLabelsZh[concept] ?? concept.replace(/_/g, " "))
        : concept.replace(/_/g, " "),
    )
    .slice(0, 4)
    .join(", ");
  const privacyPrefix =
    input.privacyMode === "limited"
      ? localize(input.locale, {
          en: "Using privacy-limited evidence, ",
          zh: "在隐私受限证据下，",
        })
      : "";

  return localize(input.locale, {
    en: `${privacyPrefix}why this person: ${input.candidate.displayName} matches ${concepts} with a ${input.score} relevance score from source-backed Orbit signals.`,
    zh: `${privacyPrefix}推荐理由：${input.candidate.displayName} 命中 ${concepts}，基于 Orbit 来源证据得到 ${input.score} 分相关性。`,
  });
}

function sourceBackedReasonsFor(input: {
  locale: OrbitAiContactRecommendationLocale;
  snippets: readonly OrbitAiContactRecommendationEvidenceSnippet[];
}): readonly string[] {
  return input.snippets.slice(0, 5).map((snippet) =>
    localize(input.locale, {
      en: `${snippet.sourceLabel} (${snippet.evidenceId}) supports the ${snippet.signal.replace(/_/g, " ")} match.`,
      zh: `${snippet.sourceLabel}（${snippet.evidenceId}）支撑 ${snippet.signal.replace(/_/g, " ")} 匹配。`,
    }),
  );
}

function recommendationFor(input: {
  candidate: OrbitAiContactRecommendationCandidateProfile;
  locale: OrbitAiContactRecommendationLocale;
  matchedConcepts: ReadonlySet<string>;
  privacyMode: OrbitAiContactRecommendationPrivacyMode;
  score: number;
  signalBreakdown: Record<OrbitAiContactRecommendationSignal, number>;
  snippets: readonly OrbitAiContactRecommendationEvidenceSnippet[];
}): OrbitAiContactRecommendation {
  return {
    confidence: confidenceFor(input.score),
    contactId: input.candidate.contactId,
    detailHref: `/app/contacts/${input.candidate.contactId}`,
    displayName: input.candidate.displayName,
    evidenceIds: Array.from(
      new Set(input.snippets.map((snippet) => snippet.evidenceId)),
    ),
    evidenceSnippets: input.snippets,
    organization: input.candidate.organization,
    recommendedAction: input.candidate.recommendedAction,
    role: input.candidate.role,
    score: input.score,
    signalBreakdown: input.signalBreakdown,
    sourceBackedReasons: sourceBackedReasonsFor({
      locale: input.locale,
      snippets: input.snippets,
    }),
    whyThisPerson: reasonFor({
      candidate: input.candidate,
      locale: input.locale,
      matchedConcepts: input.matchedConcepts,
      privacyMode: input.privacyMode,
      score: input.score,
    }),
  };
}

function rejectionReasonFor(input: {
  goalConceptCount: number;
  locale: OrbitAiContactRecommendationLocale;
  matchedConceptCount: number;
  score: number;
}): string {
  if (input.goalConceptCount === 0) {
    return localize(input.locale, {
      en: "Goal is missing concrete industry, market, event, investor, or follow-up signals.",
      zh: "目标缺少明确行业、市场、活动、投资人或跟进信号。",
    });
  }

  if (input.matchedConceptCount === 0) {
    return localize(input.locale, {
      en: "Rejected because source evidence is missing the requested goal concepts.",
      zh: "已排除：来源证据缺少这次目标所需的概念。",
    });
  }

  if (input.score >= ORBIT_AI_CONTACT_RECOMMENDATION_READY_SCORE_THRESHOLD) {
    return localize(input.locale, {
      en: "The candidate cleared the evidence threshold but stayed outside the requested result limit.",
      zh: "该联系人已达到证据阈值，但未进入本次请求的展示数量范围。",
    });
  }

  return localize(input.locale, {
    en: `Rejected because the evidence-backed score ${input.score} is below the ready threshold.`,
    zh: `已排除：证据评分 ${input.score} 低于可展示阈值。`,
  });
}

function evidenceCoverageFor(
  recommendations: readonly OrbitAiContactRecommendation[],
): Record<OrbitAiContactRecommendationSignal, number> {
  const coverage: Record<OrbitAiContactRecommendationSignal, number> = {
    conversation: 0,
    event: 0,
    follow_up: 0,
    profile: 0,
    relationship: 0,
  };

  for (const recommendation of recommendations) {
    for (const snippet of recommendation.evidenceSnippets) {
      coverage[snippet.signal] += 1;
    }
  }

  return coverage;
}

function summaryFor(input: {
  locale: OrbitAiContactRecommendationLocale;
  recommendations: readonly OrbitAiContactRecommendation[];
  state: OrbitAiContactRecommendationResult["readiness"]["state"];
}): string {
  if (input.state === "needs_more_context") {
    return localize(input.locale, {
      en: "The goal is too ambiguous to present contact recommendations as ready.",
      zh: "目标过于模糊，暂不能把人脉推荐标记为可用。",
    });
  }

  if (input.recommendations.length === 0) {
    return localize(input.locale, {
      en: "No contact cleared the minimum ready score with source-backed evidence.",
      zh: "没有联系人凭来源证据达到可展示阈值。",
    });
  }

  return localize(input.locale, {
    en: `${input.recommendations.length} source-backed contact recommendations are ready for review.`,
    zh: `${input.recommendations.length} 条有来源证据的人脉推荐已可复核。`,
  });
}

export function createOrbitAiRelationshipRecommendationService(
  options: OrbitAiRelationshipRecommendationServiceOptions = {},
): OrbitAiRelationshipRecommendationService {
  const candidates = options.candidates ?? [];

  return {
    recommendContacts(
      input: OrbitAiContactRecommendationInput,
    ): OrbitAiContactRecommendationResult {
      const locale = normalizeLocale(input.locale);
      const privacyMode = input.privacyMode ?? "full";
      const goal = combinedGoalText(input);
      const goalConcepts = conceptsForGoal(goal);
      const maxRecommendations = Math.max(1, input.maxRecommendations ?? 5);
      const scoredCandidates = candidates
        .map((candidate) => ({
          candidate,
          ...scoreCandidate({
            candidate,
            goalConcepts,
            privacyMode,
          }),
        }))
        .sort((left, right) => right.score - left.score);
      const readyCandidates =
        goalConcepts.length === 0
          ? []
          : scoredCandidates.filter(
              (candidate) =>
                candidate.score >=
                  ORBIT_AI_CONTACT_RECOMMENDATION_READY_SCORE_THRESHOLD &&
                candidate.snippets.length > 0,
            );
      const recommendations = readyCandidates
        .slice(0, maxRecommendations)
        .map((candidate) =>
          recommendationFor({
            candidate: candidate.candidate,
            locale,
            matchedConcepts: candidate.matchedConcepts,
            privacyMode,
            score: candidate.score,
            signalBreakdown: candidate.breakdown,
            snippets: candidate.snippets,
          }),
        );
      const rejectedContacts = scoredCandidates
        .filter(
          (candidate) =>
            !recommendations.some(
              (recommendation) =>
                recommendation.contactId === candidate.candidate.contactId,
            ),
        )
        .map((candidate) => ({
          contactId: candidate.candidate.contactId,
          displayName: candidate.candidate.displayName,
          highProfile: candidate.candidate.highProfile === true,
          reason: rejectionReasonFor({
            goalConceptCount: goalConcepts.length,
            locale,
            matchedConceptCount: candidate.matchedConcepts.size,
            score: candidate.score,
          }),
          score: candidate.score,
        }));
      const state =
        goalConcepts.length === 0
          ? "needs_more_context"
          : recommendations.length > 0
            ? "ready"
            : "no_recommendation";

      return {
        evidenceCoverage: evidenceCoverageFor(recommendations),
        goalConcepts,
        privacyMode,
        recommendations,
        rejectedContacts,
        readiness: {
          minimumReadyScore: ORBIT_AI_CONTACT_RECOMMENDATION_READY_SCORE_THRESHOLD,
          state,
        },
        summary: summaryFor({
          locale,
          recommendations,
          state,
        }),
      };
    },
  };
}
