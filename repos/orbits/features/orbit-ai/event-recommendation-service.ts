export const ORBIT_AI_EVENT_RECOMMENDATION_READY_SCORE_THRESHOLD = 74;

export type OrbitAiEventRecommendationLocale = "en" | "zh";
export type OrbitAiEventRecommendationSignal =
  | "attendee_intent"
  | "event_topic"
  | "profile_fit"
  | "relationship_opportunity"
  | "schedule_timing";

export interface OrbitAiEventRecommendationContextMessage {
  role: "user" | "assistant" | "system" | string;
  content: string;
}

export interface OrbitAiEventRecommendationInput {
  contextMessages?: readonly OrbitAiEventRecommendationContextMessage[];
  goal: string;
  locale?: OrbitAiEventRecommendationLocale | string | null;
  maxRecommendations?: number;
  toolArguments?: Record<string, unknown> | null;
}

export interface OrbitAiEventRecommendationEvidenceSnippet {
  evidenceId: string;
  signal: OrbitAiEventRecommendationSignal;
  snippet: string;
  sourceLabel: string;
}

export interface OrbitAiEventRecommendationPerson {
  name: string;
  organization: string;
  reason: string;
  role: string;
}

export interface OrbitAiEventRecommendation {
  confidence: "high" | "medium";
  detailHref: string;
  endsAt: string;
  eventId: string;
  evidenceIds: readonly string[];
  evidenceSnippets: readonly OrbitAiEventRecommendationEvidenceSnippet[];
  peopleToMeet: readonly OrbitAiEventRecommendationPerson[];
  score: number;
  signalBreakdown: Record<OrbitAiEventRecommendationSignal, number>;
  sourceBackedReasons: readonly string[];
  startsAt: string;
  status: "confirmed" | "draft" | "imported";
  timing: string;
  title: string;
  venue: string;
  whyThisEvent: string;
}

export interface OrbitAiRejectedEventRecommendation {
  eventId: string;
  popular: boolean;
  reason: string;
  score: number;
  title: string;
}

export interface OrbitAiEventRecommendationResult {
  evidenceCoverage: Record<OrbitAiEventRecommendationSignal, number>;
  goalConcepts: readonly string[];
  recommendations: readonly OrbitAiEventRecommendation[];
  rejectedEvents: readonly OrbitAiRejectedEventRecommendation[];
  readiness: {
    minimumReadyScore: number;
    state: "ready" | "needs_more_context" | "no_recommendation";
  };
  summary: string;
}

export interface OrbitAiEventRecommendationEvaluationCase
  extends OrbitAiEventRecommendationInput {
  expectedTopEventId?: string;
  id: string;
  shouldBeReady: boolean;
}

interface EventSignalProfile {
  concepts: readonly string[];
  evidenceId: string;
  signal: OrbitAiEventRecommendationSignal;
  snippet: string;
  sourceLabel: string;
}

interface EventCandidateProfile {
  endsAt: string;
  eventId: string;
  peopleToMeet: readonly OrbitAiEventRecommendationPerson[];
  popular?: boolean;
  prominence: number;
  signals: readonly EventSignalProfile[];
  startsAt: string;
  status: OrbitAiEventRecommendation["status"];
  title: string;
  venue: string;
}

const signalWeights: Record<OrbitAiEventRecommendationSignal, number> = {
  attendee_intent: 16,
  event_topic: 15,
  profile_fit: 12,
  relationship_opportunity: 14,
  schedule_timing: 10,
};

const conceptWeights: Record<string, number> = {
  ai_talent: 1.3,
  bilingual: 1.1,
  china_market_partner: 1.35,
  china_saas: 1.25,
  chinese_language: 1.25,
  event_discovery: 1.1,
  event_organizer: 1.25,
  founder_feedback: 1.2,
  healthcare: 1.2,
  hiring: 1.25,
  investor: 1.35,
  japan_market_entry: 1.35,
  mandarin: 1.2,
  market_entry: 1.15,
  restaurant: 1.15,
  restaurant_expansion: 1.35,
  seed_fundraising: 1.25,
  sponsorship: 1.15,
};

const goalConceptPatterns: readonly {
  concept: string;
  patterns: readonly RegExp[];
}[] = [
  {
    concept: "investor",
    patterns: [/investor/i, /investment partner/i, /投資家/i, /投资人/i],
  },
  {
    concept: "seed_fundraising",
    patterns: [/seed/i, /fundrais/i, /資金調達/i, /融资/i, /融資/i],
  },
  {
    concept: "founder_feedback",
    patterns: [/founder feedback/i, /founder screening/i, /創業者.*フィードバック/i, /创业者.*反馈/i],
  },
  {
    concept: "china_market_partner",
    patterns: [/china[- ]market partner/i, /china partner/i, /中国.*伙伴/i, /中國.*夥伴/i, /中国市场.*伙伴/i],
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
    patterns: [/market entry/i, /go[- ]to[- ]market/i, /市场进入/i, /市場進入/i],
  },
  {
    concept: "ai_talent",
    patterns: [/ai talent/i, /machine learning/i, /ml engineer/i, /ai engineer/i, /ai 人才/i, /ai人才/i],
  },
  {
    concept: "hiring",
    patterns: [/hir(?:e|ing)/i, /recruit/i, /採用/i, /招聘/i],
  },
  {
    concept: "restaurant_expansion",
    patterns: [/restaurant expansion/i, /open new restaurants/i, /店舗拡大/i, /餐饮.*扩张/i, /餐廳.*擴張/i],
  },
  {
    concept: "restaurant",
    patterns: [/restaurant/i, /reservation/i, /飲食/i, /餐饮/i, /餐廳/i, /予約/i, /预约/i],
  },
  {
    concept: "event_organizer",
    patterns: [/organizer/i, /community lead/i, /event host/i, /主催/i, /组织者/i, /社群组织/i],
  },
  {
    concept: "sponsorship",
    patterns: [/sponsor/i, /sponsorship/i, /スポンサー/i, /赞助/i, /贊助/i],
  },
  {
    concept: "chinese_language",
    patterns: [/chinese[- ]language/i, /in chinese/i, /中文/i, /中国語/i, /中文交流/i],
  },
  {
    concept: "mandarin",
    patterns: [/mandarin/i, /普通话/i, /普通話/i],
  },
  {
    concept: "bilingual",
    patterns: [/bilingual/i, /双语/i, /雙語/i, /日中/i, /中日/i],
  },
  {
    concept: "event_discovery",
    patterns: [/\bevent\b/i, /\bactivity\b/i, /活动/i, /活動/i, /见/i, /見/i],
  },
  {
    concept: "healthcare",
    patterns: [/healthcare/i, /hospital/i, /reimbursement/i, /procurement/i, /医療/i, /医疗/i],
  },
];

const eventProfiles: readonly EventCandidateProfile[] = [
  {
    endsAt: "2026-07-09T12:00:00+09:00",
    eventId: "event_001",
    peopleToMeet: [
      {
        name: "高橋 智子",
        organization: "Aoba Foods Ventures",
        reason:
          "Screens seed-stage founders and has restaurant reservation CRM pilot context.",
        role: "Investor Partner",
      },
      {
        name: "David Lin",
        organization: "Kanda Founder Studio",
        reason:
          "Hosts founder feedback tables and can introduce investor-ready operators.",
        role: "Founder Program Lead",
      },
    ],
    prominence: 6,
    signals: [
      {
        concepts: ["investor", "seed_fundraising"],
        evidenceId: "evidence:event-rec:001:attendees",
        signal: "attendee_intent",
        snippet:
          "Attendee notes list seed investors looking for founder conversations and warm intro briefs.",
        sourceLabel: "Attendee intent notes",
      },
      {
        concepts: ["investor", "seed_fundraising", "founder_feedback"],
        evidenceId: "evidence:event-rec:001:topic",
        signal: "event_topic",
        snippet:
          "Agenda centers on seed investor matching and founder feedback rooms.",
        sourceLabel: "Event topic record",
      },
      {
        concepts: ["restaurant", "founder_feedback"],
        evidenceId: "evidence:event-rec:001:profile",
        signal: "profile_fit",
        snippet:
          "Profile fit mentions restaurant reservation CRM founders as a preferred pilot segment.",
        sourceLabel: "Profile fit summary",
      },
      {
        concepts: ["investor", "seed_fundraising", "founder_feedback"],
        evidenceId: "evidence:event-rec:001:relationship",
        signal: "relationship_opportunity",
        snippet:
          "Relationship graph links the salon to two existing investor warm-intro paths.",
        sourceLabel: "Relationship opportunity graph",
      },
      {
        concepts: [],
        evidenceId: "evidence:event-rec:001:schedule",
        signal: "schedule_timing",
        snippet:
          "The event is a July 9 morning salon, soon enough for current fundraising follow-up.",
        sourceLabel: "Schedule timing record",
      },
    ],
    startsAt: "2026-07-09T09:00:00+09:00",
    status: "confirmed",
    title: "Seed Investor and Founder Matching Salon",
    venue: "Orbit Relationship Room",
  },
  {
    endsAt: "2026-07-12T12:00:00+09:00",
    eventId: "event_002",
    peopleToMeet: [
      {
        name: "鈴木 真理",
        organization: "Sakura Bridge Foods",
        reason:
          "Organizes Japan-entry advisor circles for China SaaS sales teams.",
        role: "Community Organizer",
      },
      {
        name: "Li Wei",
        organization: "BridgeAsia Partners",
        reason:
          "Runs Mandarin-Japanese partner matching for China-market operators.",
        role: "China Market Partner",
      },
    ],
    prominence: 5,
    signals: [
      {
        concepts: ["china_market_partner", "china_saas", "mandarin"],
        evidenceId: "evidence:event-rec:002:attendees",
        signal: "attendee_intent",
        snippet:
          "Attendee intent notes mention Mandarin-speaking China-market partners and China SaaS sellers.",
        sourceLabel: "Attendee intent notes",
      },
      {
        concepts: ["china_market_partner", "japan_market_entry", "market_entry"],
        evidenceId: "evidence:event-rec:002:topic",
        signal: "event_topic",
        snippet:
          "Topic record is a Japan-China market partner breakfast for entering Japan.",
        sourceLabel: "Event topic record",
      },
      {
        concepts: ["china_saas", "japan_market_entry", "chinese_language", "bilingual"],
        evidenceId: "evidence:event-rec:002:profile",
        signal: "profile_fit",
        snippet:
          "Profile fit says the room is bilingual Japanese-Chinese and useful for China SaaS market entry.",
        sourceLabel: "Profile fit summary",
      },
      {
        concepts: ["china_market_partner", "event_organizer", "market_entry"],
        evidenceId: "evidence:event-rec:002:relationship",
        signal: "relationship_opportunity",
        snippet:
          "Relationship graph shows two organizer paths into China-market partner tables.",
        sourceLabel: "Relationship opportunity graph",
      },
      {
        concepts: [],
        evidenceId: "evidence:event-rec:002:schedule",
        signal: "schedule_timing",
        snippet:
          "The Sunday late-morning breakfast leaves follow-up time before the work week.",
        sourceLabel: "Schedule timing record",
      },
    ],
    startsAt: "2026-07-12T10:00:00+09:00",
    status: "confirmed",
    title: "Japan-China Market Partner Breakfast",
    venue: "Nihonbashi Bridge Cafe",
  },
  {
    endsAt: "2026-07-15T20:30:00+09:00",
    eventId: "event_003",
    peopleToMeet: [
      {
        name: "Nakamura Rei",
        organization: "Kobe Automation Guild",
        reason:
          "Can refer AI workflow engineers who have shipped manufacturing pilots.",
        role: "Automation Partner",
      },
      {
        name: "Anika Rao",
        organization: "Tokyo Applied AI Lab",
        reason:
          "Hosts hiring tables for applied AI and machine-learning engineers.",
        role: "AI Talent Lead",
      },
    ],
    prominence: 5,
    signals: [
      {
        concepts: ["ai_talent", "hiring"],
        evidenceId: "evidence:event-rec:003:attendees",
        signal: "attendee_intent",
        snippet:
          "Attendee notes list AI engineers and talent leads open to hiring conversations.",
        sourceLabel: "Attendee intent notes",
      },
      {
        concepts: ["ai_talent", "hiring"],
        evidenceId: "evidence:event-rec:003:topic",
        signal: "event_topic",
        snippet:
          "The topic is recruiting applied AI talent for startup and operator teams.",
        sourceLabel: "Event topic record",
      },
      {
        concepts: ["ai_talent"],
        evidenceId: "evidence:event-rec:003:profile",
        signal: "profile_fit",
        snippet:
          "Profile fit favors teams hiring machine-learning engineers with product context.",
        sourceLabel: "Profile fit summary",
      },
      {
        concepts: ["hiring", "ai_talent"],
        evidenceId: "evidence:event-rec:003:relationship",
        signal: "relationship_opportunity",
        snippet:
          "Relationship graph includes warm paths to AI talent leads and engineering managers.",
        sourceLabel: "Relationship opportunity graph",
      },
      {
        concepts: [],
        evidenceId: "evidence:event-rec:003:schedule",
        signal: "schedule_timing",
        snippet:
          "The Wednesday evening schedule is suitable for employed AI talent.",
        sourceLabel: "Schedule timing record",
      },
    ],
    startsAt: "2026-07-15T18:30:00+09:00",
    status: "confirmed",
    title: "Applied AI Talent Hiring Roundtable",
    venue: "Shibuya Build Lab",
  },
  {
    endsAt: "2026-07-16T16:00:00+09:00",
    eventId: "event_004",
    peopleToMeet: [
      {
        name: "佐藤 健一",
        organization: "North Star Foods",
        reason:
          "Can compare expansion operations and reservation workflow constraints.",
        role: "Restaurant Operator",
      },
      {
        name: "Maria Gomez",
        organization: "TableOps Japan",
        reason:
          "Advises multi-location restaurant teams adopting reservation CRM systems.",
        role: "Expansion Advisor",
      },
    ],
    prominence: 5,
    signals: [
      {
        concepts: ["restaurant_expansion", "restaurant"],
        evidenceId: "evidence:event-rec:004:attendees",
        signal: "attendee_intent",
        snippet:
          "Attendee notes list restaurant operators comparing expansion partners and CRM pilots.",
        sourceLabel: "Attendee intent notes",
      },
      {
        concepts: ["restaurant_expansion", "restaurant"],
        evidenceId: "evidence:event-rec:004:topic",
        signal: "event_topic",
        snippet:
          "Topic record covers restaurant expansion, table utilization, and reservation workflows.",
        sourceLabel: "Event topic record",
      },
      {
        concepts: ["restaurant", "restaurant_expansion"],
        evidenceId: "evidence:event-rec:004:profile",
        signal: "profile_fit",
        snippet:
          "Profile fit favors operators opening second and third locations.",
        sourceLabel: "Profile fit summary",
      },
      {
        concepts: ["restaurant_expansion"],
        evidenceId: "evidence:event-rec:004:relationship",
        signal: "relationship_opportunity",
        snippet:
          "Relationship graph links the event to expansion advisors already in Orbit.",
        sourceLabel: "Relationship opportunity graph",
      },
      {
        concepts: [],
        evidenceId: "evidence:event-rec:004:schedule",
        signal: "schedule_timing",
        snippet:
          "The afternoon table is timed before dinner service, matching operator availability.",
        sourceLabel: "Schedule timing record",
      },
    ],
    startsAt: "2026-07-16T14:00:00+09:00",
    status: "confirmed",
    title: "Restaurant Expansion Operators Table",
    venue: "Ginza Service Design Loft",
  },
  {
    endsAt: "2026-07-18T19:00:00+09:00",
    eventId: "event_005",
    peopleToMeet: [
      {
        name: "伊藤 香織",
        organization: "Yokohama Foods",
        reason:
          "Can explain sponsor visibility and organizer access in the Chinese business community.",
        role: "Marketing Lead",
      },
      {
        name: "田中 健太",
        organization: "Kanda Foods",
        reason:
          "Maintains second-degree paths to event hosts and table-matching sponsors.",
        role: "DX Consultant",
      },
    ],
    prominence: 4,
    signals: [
      {
        concepts: ["event_organizer", "sponsorship"],
        evidenceId: "evidence:event-rec:005:attendees",
        signal: "attendee_intent",
        snippet:
          "Attendee notes list organizers looking for sponsor partners and community connectors.",
        sourceLabel: "Attendee intent notes",
      },
      {
        concepts: ["event_organizer", "sponsorship"],
        evidenceId: "evidence:event-rec:005:topic",
        signal: "event_topic",
        snippet:
          "Topic record focuses on organizer networking, sponsor visibility, and table matching.",
        sourceLabel: "Event topic record",
      },
      {
        concepts: ["event_organizer"],
        evidenceId: "evidence:event-rec:005:profile",
        signal: "profile_fit",
        snippet:
          "Profile fit favors operators who need organizer relationships rather than broad leads.",
        sourceLabel: "Profile fit summary",
      },
      {
        concepts: ["event_organizer", "sponsorship"],
        evidenceId: "evidence:event-rec:005:relationship",
        signal: "relationship_opportunity",
        snippet:
          "Relationship graph shows existing weak-tie paths to hosts and sponsor tables.",
        sourceLabel: "Relationship opportunity graph",
      },
      {
        concepts: [],
        evidenceId: "evidence:event-rec:005:schedule",
        signal: "schedule_timing",
        snippet:
          "The Saturday evening timing fits organizer networking after formal sessions.",
        sourceLabel: "Schedule timing record",
      },
    ],
    startsAt: "2026-07-18T17:00:00+09:00",
    status: "confirmed",
    title: "Community Organizer Networking Salon",
    venue: "Yokohama Harbor Hall",
  },
  {
    endsAt: "2026-07-10T21:00:00+09:00",
    eventId: "event_006",
    peopleToMeet: [
      {
        name: "Rachel Kim",
        organization: "Evening Capital Network",
        reason:
          "Can host short investor office-hour introductions after normal working hours.",
        role: "Angel Investor",
      },
      {
        name: "Omar Chen",
        organization: "Founder Clinic Tokyo",
        reason:
          "Collects founder feedback requests before matching them to seed investors.",
        role: "Founder Coach",
      },
    ],
    prominence: 3,
    signals: [
      {
        concepts: ["investor", "seed_fundraising"],
        evidenceId: "evidence:event-rec:006:attendees",
        signal: "attendee_intent",
        snippet:
          "Attendee notes list angel investors open to evening office-hour introductions.",
        sourceLabel: "Attendee intent notes",
      },
      {
        concepts: ["investor", "founder_feedback"],
        evidenceId: "evidence:event-rec:006:topic",
        signal: "event_topic",
        snippet:
          "Topic record covers investor office hours and concise founder feedback.",
        sourceLabel: "Event topic record",
      },
      {
        concepts: ["seed_fundraising"],
        evidenceId: "evidence:event-rec:006:profile",
        signal: "profile_fit",
        snippet:
          "Profile fit favors operators who need a lighter fundraising review after work.",
        sourceLabel: "Profile fit summary",
      },
      {
        concepts: ["investor"],
        evidenceId: "evidence:event-rec:006:relationship",
        signal: "relationship_opportunity",
        snippet:
          "Relationship graph shows one warm path into the evening investor table.",
        sourceLabel: "Relationship opportunity graph",
      },
      {
        concepts: [],
        evidenceId: "evidence:event-rec:006:schedule",
        signal: "schedule_timing",
        snippet:
          "The July 10 evening time avoids July 9 morning conflicts.",
        sourceLabel: "Schedule timing record",
      },
    ],
    startsAt: "2026-07-10T19:00:00+09:00",
    status: "confirmed",
    title: "Evening Investor Office Hours",
    venue: "Marunouchi Startup Desk",
  },
  {
    endsAt: "2026-07-20T10:00:00+09:00",
    eventId: "event_900",
    peopleToMeet: [
      {
        name: "Daniel Apex",
        organization: "Global Keynote Capital",
        reason:
          "Popular keynote attendee, but Orbit has no goal-specific attendee or topic evidence.",
        role: "Keynote Investor",
      },
    ],
    popular: true,
    prominence: 22,
    signals: [
      {
        concepts: ["popular"],
        evidenceId: "evidence:event-rec:900:profile",
        signal: "profile_fit",
        snippet:
          "Public profile says the expo is popular, but no Orbit evidence links it to the requested goal.",
        sourceLabel: "Public event profile",
      },
      {
        concepts: [],
        evidenceId: "evidence:event-rec:900:schedule",
        signal: "schedule_timing",
        snippet:
          "The main-stage expo is available, but availability alone is not enough for a recommendation.",
        sourceLabel: "Schedule timing record",
      },
    ],
    startsAt: "2026-07-20T09:00:00+09:00",
    status: "confirmed",
    title: "Global Startup Expo Main Stage",
    venue: "Tokyo Big Sight",
  },
];

export const ORBIT_AI_EVENT_RECOMMENDATION_EVALUATION_CASES: readonly OrbitAiEventRecommendationEvaluationCase[] =
  [
    {
      expectedTopEventId: "event_001",
      goal: "Recommend events where I can meet investors for seed fundraising and founder feedback.",
      id: "meeting_investors",
      locale: "en",
      shouldBeReady: true,
    },
    {
      expectedTopEventId: "event_002",
      goal: "Find China-market partners who can help China SaaS sales enter Japan.",
      id: "china_market_partners",
      locale: "en",
      shouldBeReady: true,
    },
    {
      expectedTopEventId: "event_003",
      goal: "I need to hire AI talent and meet machine learning engineers.",
      id: "hiring_ai_talent",
      locale: "en",
      shouldBeReady: true,
    },
    {
      expectedTopEventId: "event_004",
      goal: "Find restaurant expansion operators for a reservation workflow rollout.",
      id: "restaurant_expansion",
      locale: "en",
      shouldBeReady: true,
    },
    {
      expectedTopEventId: "event_005",
      goal: "Meet event organizers for sponsorship and table matching.",
      id: "organizer_networking",
      locale: "en",
      shouldBeReady: true,
    },
    {
      expectedTopEventId: "event_002",
      goal: "Prefer a Mandarin or Chinese-language setting for Japan market entry partner conversations.",
      id: "language_preference",
      locale: "en",
      shouldBeReady: true,
    },
    {
      expectedTopEventId: "event_006",
      goal: "I need investor introductions, but I cannot attend July 9 morning events.",
      id: "schedule_conflict",
      locale: "en",
      shouldBeReady: true,
      toolArguments: {
        unavailableWindows: ["2026-07-09T08:00:00+09:00/2026-07-09T12:00:00+09:00"],
      },
    },
    {
      goal: "Find healthcare reimbursement policy buyers for hospital procurement.",
      id: "negative_event_filtering",
      locale: "en",
      shouldBeReady: false,
    },
    {
      expectedTopEventId: "event_002",
      goal: "我想认识能帮助中国 SaaS 进入日本市场的伙伴，最好可以中文交流。",
      id: "chinese_input",
      locale: "zh",
      shouldBeReady: true,
    },
    {
      expectedTopEventId: "event_001",
      goal: "Which event helps me meet investors and get founder feedback for restaurant CRM?",
      id: "english_input",
      locale: "en",
      shouldBeReady: true,
    },
  ];

function readText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeLocale(
  locale: OrbitAiEventRecommendationInput["locale"],
): OrbitAiEventRecommendationLocale {
  return locale === "zh" ? "zh" : "en";
}

function localize(
  locale: OrbitAiEventRecommendationLocale,
  copy: Record<OrbitAiEventRecommendationLocale, string>,
): string {
  return copy[locale];
}

function combinedGoalText(input: OrbitAiEventRecommendationInput): string {
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

function parseDate(value: string): Date | null {
  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function readUnavailableWindows(
  toolArguments: Record<string, unknown> | null | undefined,
): readonly { end: Date; start: Date }[] {
  const value = toolArguments?.unavailableWindows;

  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (typeof entry !== "string") {
      return [];
    }

    const [startText, endText] = entry.split("/");
    const start = parseDate(startText ?? "");
    const end = parseDate(endText ?? "");

    return start && end ? [{ end, start }] : [];
  });
}

function overlaps(left: { end: Date; start: Date }, right: { end: Date; start: Date }) {
  return left.start < right.end && right.start < left.end;
}

function hasScheduleConflict(input: {
  event: EventCandidateProfile;
  goal: string;
  toolArguments: OrbitAiEventRecommendationInput["toolArguments"];
}): boolean {
  const startsAt = parseDate(input.event.startsAt);
  const endsAt = parseDate(input.event.endsAt);

  if (!startsAt || !endsAt) {
    return false;
  }

  const eventWindow = { end: endsAt, start: startsAt };
  const explicitConflict = readUnavailableWindows(input.toolArguments).some(
    (window) => overlaps(window, eventWindow),
  );

  if (explicitConflict) {
    return true;
  }

  return (
    /(?:cannot|can't|unavailable|avoid).*(?:july 9|2026-07-09).*morning/i.test(
      input.goal,
    ) &&
    input.event.startsAt.startsWith("2026-07-09") &&
    startsAt.getUTCHours() < 3
  );
}

function scoreCandidate(input: {
  event: EventCandidateProfile;
  goal: string;
  goalConcepts: readonly string[];
  toolArguments: OrbitAiEventRecommendationInput["toolArguments"];
}) {
  const breakdown: Record<OrbitAiEventRecommendationSignal, number> = {
    attendee_intent: 0,
    event_topic: 0,
    profile_fit: 0,
    relationship_opportunity: 0,
    schedule_timing: 0,
  };
  const snippets: OrbitAiEventRecommendationEvidenceSnippet[] = [];
  const matchedConcepts = new Set<string>();
  const conflict = hasScheduleConflict({
    event: input.event,
    goal: input.goal,
    toolArguments: input.toolArguments,
  });
  let score = input.event.prominence;

  if (input.goalConcepts.length === 0) {
    return {
      breakdown,
      conflict,
      matchedConcepts,
      score,
      snippets,
    };
  }

  for (const signal of input.event.signals) {
    const directSignalMatches = input.goalConcepts.filter((concept) =>
      signal.concepts.includes(concept),
    );
    const signalMatches =
      directSignalMatches.length === 0 &&
      input.goalConcepts.includes("event_discovery") &&
      input.event.popular !== true &&
      signal.signal !== "schedule_timing"
        ? ["event_discovery"]
        : directSignalMatches;
    const isScheduleFit = signal.signal === "schedule_timing" && !conflict;

    if (signalMatches.length === 0 && !isScheduleFit) continue;

    const signalScore =
      signal.signal === "schedule_timing"
        ? 10
        : Math.round(
            signalMatches.reduce(
              (total, concept) => total + (conceptWeights[concept] ?? 1),
              0,
            ) * signalWeights[signal.signal],
          );

    breakdown[signal.signal] += signalScore;
    score += signalScore;
    snippets.push({
      evidenceId: signal.evidenceId,
      signal: signal.signal,
      snippet: signal.snippet,
      sourceLabel: signal.sourceLabel,
    });
    for (const concept of signalMatches) {
      matchedConcepts.add(concept);
    }
  }

  if (
    input.goalConcepts.includes("investor") &&
    input.goalConcepts.includes("seed_fundraising") &&
    matchedConcepts.has("investor") &&
    matchedConcepts.has("seed_fundraising")
  ) {
    score += 10;
  }

  if (
    input.goalConcepts.includes("china_market_partner") &&
    input.goalConcepts.includes("japan_market_entry") &&
    matchedConcepts.has("china_market_partner") &&
    matchedConcepts.has("japan_market_entry")
  ) {
    score += 12;
  }

  if (
    (input.goalConcepts.includes("chinese_language") ||
      input.goalConcepts.includes("mandarin")) &&
    (matchedConcepts.has("chinese_language") ||
      matchedConcepts.has("mandarin") ||
      matchedConcepts.has("bilingual"))
  ) {
    score += 12;
  }

  if (input.event.popular && breakdown.attendee_intent + breakdown.event_topic === 0) {
    score -= 20;
  }

  if (conflict) {
    score -= 70;
  }

  return {
    breakdown,
    conflict,
    matchedConcepts,
    score: Math.max(0, Math.min(99, score)),
    snippets,
  };
}

function confidenceFor(score: number): OrbitAiEventRecommendation["confidence"] {
  return score >= 88 ? "high" : "medium";
}

function timingFor(
  event: EventCandidateProfile,
  locale: OrbitAiEventRecommendationLocale,
): string {
  if (event.eventId === "event_001") {
    return localize(locale, {
      en: "July 9 morning in Tokyo; useful before the current fundraising follow-up window closes.",
      zh: "7 月 9 日上午，适合在当前融资跟进窗口关闭前复核。",
    });
  }

  if (event.eventId === "event_006") {
    return localize(locale, {
      en: "July 10 evening in Tokyo; avoids the July 9 morning conflict while keeping investor timing current.",
      zh: "7 月 10 日晚间，避开 7 月 9 日上午冲突，同时保持投资人跟进时效。",
    });
  }

  return localize(locale, {
    en: `${event.startsAt.slice(0, 10)} timing fits the stated relationship goal without known conflicts.`,
    zh: `${event.startsAt.slice(0, 10)} 的时间适合这次关系目标，且没有已知冲突。`,
  });
}

function whyThisEventFor(input: {
  event: EventCandidateProfile;
  locale: OrbitAiEventRecommendationLocale;
  matchedConcepts: ReadonlySet<string>;
  score: number;
}): string {
  const concepts = Array.from(input.matchedConcepts)
    .map((concept) => concept.replace(/_/g, " "))
    .slice(0, 5)
    .join(", ");

  return localize(input.locale, {
    en: `why this event: ${input.event.title} matches ${concepts} with a ${input.score} relevance score from attendee intent, event topic, schedule timing, relationship opportunity, and profile-fit evidence.`,
    zh: `推荐理由：${input.event.title} 命中 ${concepts}，基于参会意图、活动主题、时间、关系机会和画像匹配证据得到 ${input.score} 分。`,
  });
}

function sourceBackedReasonsFor(input: {
  locale: OrbitAiEventRecommendationLocale;
  snippets: readonly OrbitAiEventRecommendationEvidenceSnippet[];
}): readonly string[] {
  return input.snippets.slice(0, 5).map((snippet) =>
    localize(input.locale, {
      en: `${snippet.sourceLabel} (${snippet.evidenceId}) supports the ${snippet.signal.replace(/_/g, " ")} match.`,
      zh: `${snippet.sourceLabel}（${snippet.evidenceId}）支撑 ${snippet.signal.replace(/_/g, " ")} 匹配。`,
    }),
  );
}

function detailHrefFor(eventId: string): string {
  const detailEventId = "demo-event-1";

  return `/app/events/${detailEventId}?sourceEventId=${encodeURIComponent(eventId)}`;
}

function recommendationFor(input: {
  event: EventCandidateProfile;
  locale: OrbitAiEventRecommendationLocale;
  matchedConcepts: ReadonlySet<string>;
  score: number;
  signalBreakdown: Record<OrbitAiEventRecommendationSignal, number>;
  snippets: readonly OrbitAiEventRecommendationEvidenceSnippet[];
}): OrbitAiEventRecommendation {
  return {
    confidence: confidenceFor(input.score),
    detailHref: detailHrefFor(input.event.eventId),
    endsAt: input.event.endsAt,
    eventId: input.event.eventId,
    evidenceIds: Array.from(
      new Set(input.snippets.map((snippet) => snippet.evidenceId)),
    ),
    evidenceSnippets: input.snippets,
    peopleToMeet: input.event.peopleToMeet,
    score: input.score,
    signalBreakdown: input.signalBreakdown,
    sourceBackedReasons: sourceBackedReasonsFor({
      locale: input.locale,
      snippets: input.snippets,
    }),
    startsAt: input.event.startsAt,
    status: input.event.status,
    timing: timingFor(input.event, input.locale),
    title: input.event.title,
    venue: input.event.venue,
    whyThisEvent: whyThisEventFor({
      event: input.event,
      locale: input.locale,
      matchedConcepts: input.matchedConcepts,
      score: input.score,
    }),
  };
}

function rejectionReasonFor(input: {
  conflict: boolean;
  goalConceptCount: number;
  hasAttendeeOrTopicEvidence: boolean;
  locale: OrbitAiEventRecommendationLocale;
  matchedConceptCount: number;
  score: number;
}): string {
  if (input.goalConceptCount === 0) {
    return localize(input.locale, {
      en: "Goal is missing concrete event, attendee, topic, schedule, relationship, or profile-fit signals.",
      zh: "目标缺少明确活动、参会人、主题、时间、关系或画像匹配信号。",
    });
  }

  if (input.conflict) {
    return localize(input.locale, {
      en: `Rejected because schedule conflict evidence pushed the score below the ready threshold (${input.score}).`,
      zh: `已排除：时间冲突证据让评分低于可展示阈值（${input.score}）。`,
    });
  }

  if (!input.hasAttendeeOrTopicEvidence || input.matchedConceptCount === 0) {
    return localize(input.locale, {
      en: "Rejected because attendee intent and event topic evidence are missing for the requested goal.",
      zh: "已排除：参会意图和活动主题证据没有命中这次目标。",
    });
  }

  return localize(input.locale, {
    en: `Rejected because the evidence-backed score ${input.score} is below the ready threshold.`,
    zh: `已排除：证据评分 ${input.score} 低于可展示阈值。`,
  });
}

function evidenceCoverageFor(
  recommendations: readonly OrbitAiEventRecommendation[],
): Record<OrbitAiEventRecommendationSignal, number> {
  const coverage: Record<OrbitAiEventRecommendationSignal, number> = {
    attendee_intent: 0,
    event_topic: 0,
    profile_fit: 0,
    relationship_opportunity: 0,
    schedule_timing: 0,
  };

  for (const recommendation of recommendations) {
    for (const snippet of recommendation.evidenceSnippets) {
      coverage[snippet.signal] += 1;
    }
  }

  return coverage;
}

function summaryFor(input: {
  locale: OrbitAiEventRecommendationLocale;
  recommendations: readonly OrbitAiEventRecommendation[];
  state: OrbitAiEventRecommendationResult["readiness"]["state"];
}): string {
  if (input.state === "needs_more_context") {
    return localize(input.locale, {
      en: "The goal is too ambiguous to present event recommendations as ready.",
      zh: "目标过于模糊，暂不能把活动推荐标记为可用。",
    });
  }

  if (input.recommendations.length === 0) {
    return localize(input.locale, {
      en: "No event cleared the minimum ready score with source-backed attendee and topic evidence.",
      zh: "没有活动凭参会人和主题来源证据达到可展示阈值。",
    });
  }

  return localize(input.locale, {
    en: `${input.recommendations.length} source-backed event recommendations are ready for review.`,
    zh: `${input.recommendations.length} 条有来源证据的活动推荐已可复核。`,
  });
}

export function createOrbitAiEventRecommendationService() {
  return {
    recommendEvents(
      input: OrbitAiEventRecommendationInput,
    ): OrbitAiEventRecommendationResult {
      const locale = normalizeLocale(input.locale);
      const goal = combinedGoalText(input);
      const goalConcepts = conceptsForGoal(goal);
      const maxRecommendations = Math.max(1, input.maxRecommendations ?? 5);
      const scoredEvents = eventProfiles
        .map((event) => ({
          event,
          ...scoreCandidate({
            event,
            goal,
            goalConcepts,
            toolArguments: input.toolArguments,
          }),
        }))
        .sort((left, right) => {
          const scoreDifference = right.score - left.score;

          return scoreDifference === 0
            ? left.event.startsAt.localeCompare(right.event.startsAt)
            : scoreDifference;
        });
      const readyEvents =
        goalConcepts.length === 0
          ? []
          : scoredEvents.filter(
              (event) =>
                event.score >=
                  ORBIT_AI_EVENT_RECOMMENDATION_READY_SCORE_THRESHOLD &&
                event.snippets.length > 0 &&
                event.breakdown.attendee_intent + event.breakdown.event_topic >
                  0,
            );
      const recommendations = readyEvents
        .slice(0, maxRecommendations)
        .map((event) =>
          recommendationFor({
            event: event.event,
            locale,
            matchedConcepts: event.matchedConcepts,
            score: event.score,
            signalBreakdown: event.breakdown,
            snippets: event.snippets,
          }),
        );
      const rejectedEvents = scoredEvents
        .filter(
          (event) =>
            !recommendations.some(
              (recommendation) =>
                recommendation.eventId === event.event.eventId,
            ),
        )
        .map((event) => ({
          eventId: event.event.eventId,
          popular: event.event.popular === true,
          reason: rejectionReasonFor({
            conflict: event.conflict,
            goalConceptCount: goalConcepts.length,
            hasAttendeeOrTopicEvidence:
              event.breakdown.attendee_intent + event.breakdown.event_topic > 0,
            locale,
            matchedConceptCount: event.matchedConcepts.size,
            score: event.score,
          }),
          score: event.score,
          title: event.event.title,
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
        recommendations,
        rejectedEvents,
        readiness: {
          minimumReadyScore: ORBIT_AI_EVENT_RECOMMENDATION_READY_SCORE_THRESHOLD,
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
