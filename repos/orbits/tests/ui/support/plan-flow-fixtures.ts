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
