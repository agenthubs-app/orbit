import type { PlanDraftView, PlanIntakeView } from "../../../shared/contract/plan-v2";

// R23 Web screens: plain fixtures for the plan flow render tests (fictional people,
// launch goal; allocations add up to 100 like the template rules require).
const AT = "2026-10-10T00:00:00.000Z";

export function intakeFixture(overrides: Partial<PlanIntakeView> = {}): PlanIntakeView {
  return {
    aiSteps: { background: { state: "done" }, draft: { state: "none" }, ladder: { state: "none" }, members: { state: "none" }, questions: { state: "none" } },
    answers: null,
    background: {
      me: { confirmedAt: null, value: { headline: "Engineer · Kanade Labs", name: "Hana Yamada", stance: "cofounder", wants: "Launch the service" } },
      purpose: {
        confirmedAt: null,
        value: {
          reason: "The team already builds; a brand is the next step.",
          rungs: [
            { level: 4, text: "Become the known name in the field" },
            { level: 3, text: "Build the service into a brand and a business" },
            { level: 2, text: "Make the service profitable" },
            { level: 1, text: "Turn the beta into a paid plan" },
          ],
          selectedLevel: 3,
          suggestedLevel: 3,
        },
      },
      team: {
        confirmedAt: null,
        value: {
          members: [
            { basis: null, capabilities: ["product", "ai_data"], contactId: null, headline: "Engineer", isSelf: true, memberId: "self", name: "Hana Yamada", otherCapabilities: [], relation: null, source: "profile" },
            { basis: "Card and meeting notes", capabilities: ["product", "ops_infra"], contactId: "c-1", headline: "Engineer · Kanade Labs", isSelf: false, memberId: "contact:c-1", name: "Ken Mori", otherCapabilities: [], relation: "cofounder", source: "network" },
          ],
          mode: "team",
        },
      },
    },
    draftId: null,
    goal: "Launch the service and make it profitable",
    goalKind: "launch",
    href: "/app/plans/flow/in-1",
    intakeId: "in-1",
    limits: { ladderLeft: 3, newGoalsLeftThisMonth: 9 },
    planId: null,
    premise: null,
    premiseVersion: 0,
    questions: null,
    reading: [{ detail: "Hana Yamada", kind: "profile" }],
    source: "task",
    status: "background",
    updatedAt: AT,
    ...overrides,
  };
}

export function confirmed<T extends PlanIntakeView>(intake: T, blocks: readonly ("me" | "team" | "purpose")[]): T {
  const background = { ...intake.background };
  for (const block of blocks) background[block] = { ...background[block], confirmedAt: AT } as never;
  return { ...intake, background };
}

export function questionsIntake(): PlanIntakeView {
  return {
    ...confirmed(intakeFixture(), ["me", "team", "purpose"]),
    aiSteps: { background: { state: "done" }, draft: { state: "none" }, ladder: { state: "none" }, members: { state: "none" }, questions: { state: "done" } },
    questions: [
      { guess: { text: null, values: ["beta"] }, id: "R1", why: "The stage changes the first step." },
      { guess: null, id: "R2", why: "Who pays decides the first type." },
      { guess: null, id: "R7", why: "Gaps in design and sales." },
    ],
    status: "questions",
  };
}

export function premiseIntake(overrides: Partial<PlanIntakeView> = {}): PlanIntakeView {
  return {
    ...questionsIntake(),
    answers: [
      { guessed: true, questionId: "R1", text: null, values: ["beta"] },
      { guessed: false, questionId: "R2", text: "Organisers pay", values: ["businesses"] },
      { guessed: false, questionId: "R7", text: null, values: ["recruit"] },
    ],
    premise: [
      { guessed: false, key: "purpose", label: "目的", source: "background", value: "Build the service into a brand and a business" },
      { guessed: false, key: "team", label: "チーム", source: "background", value: "2名" },
      { guessed: true, key: "R1", label: "現在地", source: "q1", value: "完成・β 運用中" },
      { guessed: false, key: "R2", label: "払い手", source: "q2", value: "法人 · Organisers pay" },
      { guessed: false, key: "R7", label: "足りない力", source: "q3", value: "仲間に入れる" },
    ],
    premiseVersion: 1,
    status: "premise",
    ...overrides,
  };
}

export function draftFixture(overrides: Partial<PlanDraftView> = {}): PlanDraftView {
  const content: PlanDraftView["content"] = {
    allocationReasons: ["Brand builders +5: the team has no brand experience."],
    basis: [{ kind: "premise", label: "目的：Build the service into a brand", ref: "purpose" }],
    citations: [{ id: "L-012", version: 3 }, { id: "L-031", version: 2 }],
    conclusion: "Grow through event organisers first; personal plans come second.",
    diagnosis: "Building is strong; the one-line pitch and the sales route are missing ① ②.",
    event: { allocation: 15, targetCount: 3 },
    flow: [{ emoji: "🎪", label: "Organisers", note: "Pay first" }, { emoji: "🙋", label: "Guests", note: "Free" }, { emoji: "⭐", label: "Pro", note: "Second" }],
    personTypes: [
      { allocation: 30, countRule: "", emoji: "🎪", introRoutes: [], itemId: "first_payer", key: "first_payer", questions: [], recognizeHints: [], roleSituation: "Runs a monthly meetup of 50–200 people", shortLabel: "First payer", shortLabelId: "first_payer", skipped: false, slot: "first_payer", targetCount: 5, why: "" },
      { allocation: 25, countRule: "", emoji: "🎨", introRoutes: [], itemId: "brand_pr", key: "brand_pr", questions: [], recognizeHints: [], roleSituation: "Launched a SaaS brand from zero", shortLabel: "Brand builder", shortLabelId: "brand_pr", skipped: false, slot: "brand_pr", targetCount: 2, why: "" },
      { allocation: 20, countRule: "", emoji: "📇", introRoutes: [], itemId: "prior_product", key: "prior_product", questions: [], recognizeHints: [], roleSituation: "Sold a card SaaS before", shortLabel: "Prior product", shortLabelId: "prior_product", skipped: false, slot: "prior_product", targetCount: 2, why: "" },
      { allocation: 10, countRule: "", emoji: "🛠️", introRoutes: [], itemId: "same_path_founder", key: "same_path_founder", questions: [], recognizeHints: [], roleSituation: "Engineer who founded a company", shortLabel: "Founder", shortLabelId: "same_path_founder", skipped: false, slot: "same_path_founder", targetCount: 3, why: "" },
    ],
    steps: [
      { doneCriteria: "3 of 5 organisers want it", key: "step-1", personTypeKeys: ["first_payer", "brand_pr", "event"], title: "Say who it is for", why: null },
      { doneCriteria: "One paid pilot agreed", key: "step-2", personTypeKeys: ["first_payer", "prior_product"], title: "First paying customer", why: null },
      { doneCriteria: "A design partner is found", key: "step-3", personTypeKeys: ["brand_pr", "same_path_founder"], title: "Fill the missing skills", why: null },
    ],
  };
  return {
    aiFixLimit: 3,
    aiFixUsed: 0,
    citations: [
      { id: "L-012", sourceLabel: "Public pricing pages", sourcePublishedOn: "2026-09-01", sourceUrl: "https://example.org/l-012", summary: "Personal card apps are mostly free.", title: "Card and contact apps", updatedOn: "2026-09", version: 3 },
      { id: "L-031", sourceLabel: "Organiser interviews", sourcePublishedOn: "2026-08-01", sourceUrl: "https://example.org/l-031", summary: "Nobody owns the follow-up after events.", title: "Event operations", updatedOn: "2026-08", version: 2 },
    ],
    content,
    draftId: "dr-1",
    fix: { state: "none" },
    goal: "Launch the service and make it profitable",
    goalKind: "launch",
    intakeId: "in-1",
    kind: "initial",
    manualEditAvailable: true,
    originContent: content,
    planId: null,
    premise: [],
    purposeText: "Build the service into a brand and a business",
    revision: AT,
    status: "open",
    turns: [],
    updatedAt: AT,
    ...overrides,
  };
}

/**
 * R36a: a v3 draft (plan-draft-v5 v16 shape) on top of `draftFixture`: outcome / summary with marks and refs / verdict /
 * confidence / order reasons / comparison / key numbers / risks (one unverified) / sources (landscape + web, one web
 * source older than 180 days); every person type belongs to a step. Numbers: 30 + 25 + 20 + 10 + 15 (event) = 100.
 */
export function draftV3Fixture(overrides: Partial<PlanDraftView> = {}, contentOverrides: Partial<PlanDraftView["content"]> = {}): PlanDraftView {
  const base = draftFixture();
  const text = "Building is strong. The one-line pitch is missing. Organisers pay first.";
  const content: PlanDraftView["content"] = {
    ...base.content,
    comparison: {
      funnel: "6 types narrowed to 4 by stage",
      rows: [
        { label: "First payer", score: 85, sourceIds: ["S1"], typeKey: "first_payer", verdict: "preferred" },
        { label: "Brand builder", score: 60, sourceIds: ["S2"], typeKey: "brand_pr", verdict: "possible" },
        { label: "Paid ads", score: 15, sourceIds: ["S3"], typeKey: null, verdict: "not_recommended" },
      ],
      title: "Who to reach first",
    },
    confidence: { level: "mid", reason: "The product is already in beta." },
    keyNumbers: [{ label: "paying customers that prove the model", sourceIds: ["S2"], value: "5" }],
    orderReasons: [{ sourceIds: ["S1"], text: "Paying customers first; brand later." }, { sourceIds: ["S2", "S3"], text: "Talk to a shipped founder before you set a price." }],
    outcome: "Five paying customers",
    personTypes: base.content.personTypes.map((type, index) => ({ ...type, stepKey: ["step-1", "step-1", "step-2", "step-3"][index]! })),
    risks: [{ kind: "risk", text: "A beta that is free for too long is hard to price." }, { kind: "unverified", text: "Could not check this online this time." }],
    schemaVersion: 3,
    sources: [
      { id: "S1", kind: "landscape", landscapeId: "L-012", version: 3 },
      { fetchedAt: "2026-10-01T00:00:00.000Z", id: "S2", kind: "web", query: "saas pricing", snippet: "Most personal apps are free.", title: "Pricing survey 2026", url: "https://example.org/pricing-2026" },
      { fetchedAt: "2025-01-01T00:00:00.000Z", id: "S3", kind: "web", query: "ads", snippet: "Ads rarely pay for B2B.", title: "Old ads report", url: "https://example.org/ads-old" },
    ],
    summary: {
      marks: [{ end: 18, start: 0 }],
      refs: [{ end: 19, ref: { kind: "answer", questionKey: "R1" }, start: 0 }, { end: 51, ref: { kind: "source", sourceId: "S1" }, start: 20 }, { end: 74, ref: { kind: "source", sourceId: "S-missing" }, start: 52 }],
      text,
    },
    verdict: "feasible",
    ...contentOverrides,
  };
  return { ...base, content, originContent: content, premise: [{ guessed: false, key: "R1", label: "現在地", source: "q1", value: "完成・β 運用中" }], ...overrides };
}
