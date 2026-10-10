// R08: the redesign contract fixtures, all assembled from the demo world (index.ts),
// so names and companies agree everywhere. Every fixture is typed with its contract
// (`satisfies`), parses with its zod schema where one exists (both ends:
// tests/contracts/demo-world-consistency.test.ts, App tests/contract-fixtures-parse
// .test.ts), and every content record carries `sample: true`. Settings-like
// answers (layout, delivery preferences, export / deletion state, app version,
// a dismiss receipt) are not records a person sees as content and carry no mark;
// the response header `X-Orbit-Feature-Mode: mock` covers the whole response.
import type { AccountDeletionRequestContract, AccountExportContract, AppVersionContract } from "../../contract/account";
import type { ContactCardSummaryDTO } from "../../contract/contact-card-page";
import type { ContactListItemContract } from "../../contract/contacts";
import type { NoteContract } from "../../contract/notes";
import type { TaskItemContract } from "../../contract/tasks";
import type { ContactCompletionQuestion } from "../../contract/contact-completion";
import type { EventAssessmentContract } from "../../contract/event-assessment";
import type { EventRecommendationDismissResult } from "../../contract/event-recommendation-feedback";
import type { HomeLayoutContract } from "../../contract/home-layout";
import type { InboxDeliveryPreferencesDTO } from "../../contract/notification-delivery-policy";
import type { InboxNotificationDTO } from "../../contract/inbox-notifications";
import type { InviteCodeContract, InviteCodePreview, InviteCodeRedeemResult } from "../../contract/invite-codes";
import type { PlanPremiseRow, PlanV2Content, PlanV2Detail, PlanV2SummaryResponse } from "../../contract/plan-v2";
import { nextAward, PLAN_EVENT_SEGMENT_KEY, skipAwardPoints, summarizePlanScore, type PlanScoreAward } from "../../compute/plan-score";
import { DEMO_EVENTS, DEMO_NOTES, DEMO_PEOPLE, DEMO_PLAN, DEMO_TIME_ZONE, DEMO_TODAY, DEMO_TODOS, demoEvent, demoPerson } from "./index";

export const DEMO_ACTOR_ID = "demo-actor";
const at = (time: string) => `${DEMO_TODAY}T${time}+09:00`;

// 1 home layout — the defaults with a revision.
export const demoHomeLayout: HomeLayoutContract = {
  revision: 3,
  app: [{ key: "today", size: "m" }, { key: "planScore", size: "s" }, { key: "nextEvent", size: "s" }, { key: "secretary", size: "m" }, { key: "network", size: "s" }, { key: "memo", size: "s" }],
  web: [{ key: "today", size: "m" }, { key: "planScore", size: "s" }, { key: "network", size: "s" }, { key: "secretary", size: "m" }, { key: "week", size: "m" }, { key: "nextEvent", size: "s" }, { key: "eventPick", size: "s" }],
};

// 2 contacts — list rows with density / source chip (the shape R11 fills), and the summary extras.
const SOURCE_TYPE = { meishi: "business_card_ocr", linkedin: "external_contacts", phone: "manual", manual: "manual" } as const;
const SOURCE_LABEL = { meishi: "名刺", linkedin: "LinkedIn", phone: "電話帳", manual: "手入力" } as const;
const STATUS_BY_DENSITY = { 1: "nurture", 2: "active", 3: "active" } as const;

export const demoContactRows = DEMO_PEOPLE.map((person) => {
  const source = { type: SOURCE_TYPE[person.source], id: `demo-source-${person.id}`, label: SOURCE_LABEL[person.source], evidenceId: `demo-evidence-${person.id}` };
  return {
    id: person.id,
    displayName: person.name,
    role: person.role,
    organization: person.company,
    location: "東京",
    profileSnippet: `${person.company} · ${person.role}`,
    relationshipContext: person.density === 3 ? "よく会う" : person.density === 2 ? "ときどき会う" : "一度会った",
    lastInteractionAt: at("09:00:00"),
    nextAction: DEMO_TODOS.find((todo) => todo.personId === person.id)?.title ?? "",
    source,
    evidence: [{ evidenceId: source.evidenceId, source, excerpt: `${person.name}（${person.company}）`, capturedAt: at("09:00:00"), createdBy: DEMO_ACTOR_ID }],
    tags: [],
    value: { score: person.density * 30, valueTypes: [], rationale: "", evidenceIds: [source.evidenceId] },
    status: DEMO_TODOS.some((todo) => todo.personId === person.id) ? "needs_follow_up" : STATUS_BY_DENSITY[person.density],
    density: person.density,
    sourceChip: person.source,
    databaseQueryExecuted: false,
    searchIndexReadExecuted: false,
    externalNetworkRequested: false,
    aiProviderRequested: false,
    calendarProviderRequested: false,
    emailProviderRequested: false,
    notificationDelivered: false,
    sample: true,
  } satisfies ContactListItemContract;
});

export const demoContactSummaryExtras: Pick<ContactCardSummaryDTO, "densityCounts" | "addedThisMonth"> = {
  densityCounts: {
    1: DEMO_PEOPLE.filter((person) => person.density === 1).length,
    2: DEMO_PEOPLE.filter((person) => person.density === 2).length,
    3: DEMO_PEOPLE.filter((person) => person.density === 3).length,
  },
  addedThisMonth: 4,
};

/** The /api/contacts/page params R11 adds (density, goalRelated, needsFollowUp) over the demo rows. */
export function filterDemoContacts(params: URLSearchParams) {
  const density = Number(params.get("density"));
  const planPeople = new Set<string>(DEMO_PLAN.personTypes.flatMap((type) => type.personIds));
  const followUp = new Set<string>(DEMO_TODOS.flatMap((todo) => (todo.personId ? [todo.personId] : [])));
  return demoContactRows.filter((row) =>
    (!density || row.density === density)
    && (params.get("goalRelated") !== "1" || planPeople.has(row.id))
    && (params.get("needsFollowUp") !== "1" || followUp.has(row.id)));
}

// 3 contact completion — one question a day.
export const demoCompletionQuestion: ContactCompletionQuestion = {
  id: "demo-question-1",
  contactId: "demo-person-aoki",
  question: `${demoPerson("demo-person-aoki").name}さんとはどこで知り合いましたか？`,
  options: ["イベント", "紹介", "仕事", "その他"],
  askedOn: DEMO_TODAY,
  skipCount: 0,
  sample: true,
};

// 4 invite codes.
export const demoInviteCode: InviteCodeContract = {
  sample: true,
  code: "K7QX-2M9P",
  link: "https://orbitailink.com/i/K7QX-2M9P",
  maxUses: 10,
  usedCount: 2,
  createdAt: at("09:00:00"),
  expiresAt: "2026-10-14T09:00:00+09:00",
  shared: { displayName: "Orbit デモ", organization: "サンプル株式会社", role: "代表" },
};
export const demoInvitePreview: InviteCodePreview = { code: demoInviteCode.code, expiresAt: demoInviteCode.expiresAt, shared: demoInviteCode.shared, sample: true };
export const demoInviteRedeem: InviteCodeRedeemResult = { outcome: "connected", contactId: "demo-person-matsui" };

// 5 notes — the existing note shape plus the new optional fields.
export const demoNotes = DEMO_NOTES.map((note, index) => ({
  id: note.id,
  accountId: DEMO_ACTOR_ID,
  ownerUserId: DEMO_ACTOR_ID,
  title: note.title,
  body: note.body,
  manualContactIds: [...note.personIds],
  mentions: [],
  contactIds: [...note.personIds],
  eventIds: note.eventId ? [note.eventId] : [],
  noteKind: note.noteKind,
  usedForPlan: index === 0,
  version: 1,
  createdAt: at("08:00:00"),
  updatedAt: at("08:30:00"),
  sample: true,
}) satisfies NoteContract);

// 6 inbox — the four secretary sources.
const event = demoEvent("demo-event-saas-summit");
const secretary = [
  { sourceKind: "event_deadline", title: `${event.title} の申込締切は明日です`, reason: "目標に合うイベントの締切が近づいています", target: { kind: "event", id: event.id, href: `/app/events/${event.id}` } },
  { sourceKind: "event_prep", title: `${demoEvent("demo-event-cfo-night").title} の準備`, reason: `${demoPerson("demo-person-kobayashi").name}さんと${demoPerson("demo-person-yamamoto").name}さんが参加します`, target: { kind: "event", id: "demo-event-cfo-night", href: "/app/events/demo-event-cfo-night" } },
  { sourceKind: "event_pick", title: `今週のおすすめ：${demoEvent("demo-event-robotics-meetup").title}`, reason: "プランの「先に起業した人」に会えます", target: { kind: "event", id: "demo-event-robotics-meetup", href: "/app/events/demo-event-robotics-meetup" } },
  { sourceKind: "mail_summary", title: `${demoPerson("demo-person-takahashi").name}さんから返信がありました`, reason: "資料の件への返信です", target: { kind: "conversation", id: "demo-conversation-takahashi", href: null } },
] as const;

export const demoSecretaryNotifications: InboxNotificationDTO[] = secretary.map((item, index) => ({
  id: `demo-notification-${item.sourceKind}`,
  actorId: DEMO_ACTOR_ID,
  revision: 1,
  kind: item.sourceKind === "event_pick" ? "suggestion" : item.sourceKind === "event_deadline" ? "reminder" : "update",
  origin: "automation",
  semanticKey: `demo:${item.sourceKind}`,
  title: item.title,
  reason: item.reason,
  sources: [{ sourceKind: item.sourceKind, sourceId: `demo-source-${index}`, sourceRevision: "1", occurredAt: at("07:00:00"), readAt: at("07:00:00") }],
  target: { ...item.target, status: "available" },
  actions: ["read", "dismiss"],
  occurredAt: at("07:00:00"),
  updatedAt: at("07:00:00"),
  readAt: null,
  disposition: "open",
  sample: true,
}));

// 7 delivery preferences with the new optional fields.
export const demoDeliveryPreferences: InboxDeliveryPreferencesDTO = {
  actorId: DEMO_ACTOR_ID,
  revision: 2,
  messageEnabled: true,
  reminderEnabled: true,
  suggestionEnabled: true,
  updateEnabled: true,
  lockScreenContent: "private",
  quietHoursEnabled: true,
  timeZone: DEMO_TIME_ZONE,
  mutedConversationIds: [],
  quietStart: "22:00",
  quietEnd: "08:00",
  dailyCap: 2,
  secretaryMail: true,
  secretaryDeadline: true,
  secretaryPick: false,
  meetingException: true,
};

// 8 event assessment — a ready one for the SaaS Summit (five criteria = total).
export const demoEventAssessment: EventAssessmentContract = {
  id: "demo-assessment-saas-summit",
  sourceKind: "orbit_event",
  status: "ready",
  facts: { title: event.title, startsAt: event.startsAt, venue: event.venue, organizer: event.organizer, price: "無料" },
  scoreBreakdown: [
    { criterion: "goalFit", score: 18, reason: "目標「初期顧客 5 社」に合う参加者が多い" },
    { criterion: "people", score: 16, reason: `${demoPerson("demo-person-aoki").name}さんと${demoPerson("demo-person-matsui").name}さんが参加` },
    { criterion: "timing", score: 14, reason: "予定の空いている日" },
    { criterion: "cost", score: 17, reason: "無料・移動 30 分" },
    { criterion: "followUp", score: 13, reason: "前回のイベント後のフォローが 2 件残っている" },
  ],
  total: 78,
  verdict: "recommend",
  missingFields: [],
  rubricVersion: "v1",
  createdAt: at("09:30:00"),
  sample: true,
};

// 9 recommendation feedback.
export const demoDismissResult: EventRecommendationDismissResult = { eventId: "demo-event-robotics-meetup", reason: "schedule", dismissedAt: at("10:00:00") };

// 10 tasks — the to-dos with deferral counts.
export const demoTodos = DEMO_TODOS.map((todo) => ({
  id: todo.id,
  accountId: DEMO_ACTOR_ID,
  ownerUserId: DEMO_ACTOR_ID,
  title: todo.title,
  status: "open",
  category: todo.personId ? "relationship" : "event",
  plannedDate: todo.dueDate,
  priority: todo.deferralCount > 0 ? "high" : "normal",
  source: "manual",
  ...(todo.personId ? { relatedContactId: todo.personId } : { relatedEventId: "demo-event-saas-summit" }),
  createdAt: at("07:30:00"),
  updatedAt: at("07:30:00"),
  deferralCount: todo.deferralCount,
  sample: true,
}) satisfies TaskItemContract);

// 11 account.
export const demoAccountExport: AccountExportContract = { id: "demo-export-1", scope: ["contacts", "notes", "tasks"], status: "ready", requestedAt: at("09:00:00"), downloadUrl: "https://orbitailink.com/exports/demo-export-1", expiresAt: "2026-10-14T09:00:00+09:00" };
export const demoDeletionRequest: AccountDeletionRequestContract = { requestedAt: "2026-10-07T00:00:00.000Z", purgeAfter: "2026-11-06T00:00:00.000Z" };
export const demoAppVersion: AppVersionContract = { minSupportedAppVersion: "1.0.0", latestAppVersion: "1.2.0" };

// 12 plan v2 (R22) — the demo plan's score is computed with the same shared function the
// server and both clients use, from award records in the order they happened.
export const DEMO_PLAN_NOW = at("12:00:00");
const PLAN_AWARD_TIMES = ["2026-09-22T19:00:00+09:00", "2026-09-29T10:00:00+09:00", "2026-10-03T15:00:00+09:00", at("10:00:00")];

function buildDemoPlanAwards(): PlanScoreAward[] {
  const awards: PlanScoreAward[] = [];
  let clock = 0;
  for (const type of DEMO_PLAN.personTypes) {
    const mine = () => awards.filter((award) => award.typeKey === type.key);
    for (const personId of type.personIds) {
      const next = nextAward({ allocation: type.allocation, anonymous: false, awards: mine(), skipped: false, targetCount: type.target });
      if (next.part === "none") continue;
      awards.push({ anonymous: false, at: PLAN_AWARD_TIMES[clock++ % PLAN_AWARD_TIMES.length]!, basis: "talked", id: `demo-award-${type.key}-${personId}`, part: next.part, points: next.points, typeKey: type.key });
    }
    if (type.skipped) {
      awards.push({ anonymous: false, at: "2026-09-20T09:00:00+09:00", basis: "skip", id: `demo-award-${type.key}-skip`, part: "base", points: skipAwardPoints(type.allocation, mine()), typeKey: type.key });
    }
  }
  for (const eventId of DEMO_PLAN.event.attendedEventIds) {
    const next = nextAward({ allocation: DEMO_PLAN.event.allocation, anonymous: false, awards: awards.filter((award) => award.typeKey === PLAN_EVENT_SEGMENT_KEY), skipped: false, targetCount: DEMO_PLAN.event.targetCount });
    if (next.part !== "none") awards.push({ anonymous: false, at: "2026-10-01T21:00:00+09:00", basis: "event", id: `demo-award-event-${eventId}`, part: next.part, points: next.points, typeKey: PLAN_EVENT_SEGMENT_KEY });
  }
  return awards;
}

export const demoPlanAwards = buildDemoPlanAwards();

const demoPlanScore = summarizePlanScore({
  achievedAt: null,
  awards: demoPlanAwards,
  now: DEMO_PLAN_NOW,
  slots: [
    ...DEMO_PLAN.personTypes.map((type) => ({ allocation: type.allocation, emoji: type.emoji, key: type.key, shortLabel: type.label, skipped: type.skipped, targetCount: type.target })),
    { allocation: DEMO_PLAN.event.allocation, emoji: "🎟️", key: PLAN_EVENT_SEGMENT_KEY, shortLabel: "イベント", skipped: false, targetCount: DEMO_PLAN.event.targetCount },
  ],
});

export const demoPlanSummary: PlanV2SummaryResponse = {
  current: {
    goal: DEMO_PLAN.goal,
    goalKind: DEMO_PLAN.goalKind,
    planId: DEMO_PLAN.id,
    sample: true,
    score: demoPlanScore,
    todayChance: { href: "/app/tasks?tab=plan", label: `${demoPerson("demo-person-sasaki").name}さんと話す（VC パートナー）`, points: 10 },
  },
  goals: [{
    goal: DEMO_PLAN.goal,
    goalKind: DEMO_PLAN.goalKind,
    lastOpenedAt: at("08:30:00"),
    planId: DEMO_PLAN.id,
    sample: true,
    status: "active",
    talkedPeople: DEMO_PLAN.personTypes.reduce((sum, type) => sum + type.personIds.length, 0),
    total: demoPlanScore.total,
  }],
};

const demoPlanPremise: PlanPremiseRow[] = [
  { guessed: false, key: "purpose", label: "目的", source: "background", value: DEMO_PLAN.purposeText },
  { guessed: false, key: "team", label: "チーム", source: "background", value: "2名 · 空き：財務・投資家対応" },
  { guessed: false, key: "F1", label: "ラウンドと金額", source: "q1", value: "シリーズ A · 3億円" },
  { guessed: false, key: "F2", label: "直近の数字", source: "q2", value: "ARR 8,000万円 · 前年比 2.4倍" },
  { guessed: false, key: "F3", label: "既存株主・リード候補", source: "q3", value: "既存株主 2 社 · リード候補なし" },
  { guessed: true, key: "F5", label: "使い道と締切", source: "q4", value: "採用と営業 · 半年以内（推測）" },
  { guessed: false, key: "F7", label: "使える時間", source: "q5", value: "フルタイム" },
];

const demoPlanContent: PlanV2Content = {
  allocationReasons: ["テンプレート「資金調達」の既定のままです。"],
  basis: [
    { kind: "premise", label: "確定した前提 7件", ref: "premise" },
    { kind: "template", label: "目標タイプ「資金調達」の高度プロンプト v4", ref: "fundraising@v4" },
  ],
  citations: [],
  conclusion: "先に数字と資料を固め、先輩起業家の紹介で VC 3 社と並行して話す。CVC は後から加える。",
  diagnosis: "数字は伸びていますが、リード候補がまだいません。紹介経由で VC と並行して話すのが近道です。",
  event: { allocation: DEMO_PLAN.event.allocation, targetCount: DEMO_PLAN.event.targetCount },
  personTypes: DEMO_PLAN.personTypes.map((type) => ({
    allocation: type.allocation,
    countRule: "3 問のうち 2 問以上を聞けたら「話せた」です。",
    emoji: type.emoji,
    introRoutes: [],
    itemId: `demo-plan-item-${type.key}`,
    key: type.key,
    questions: ["いまの判断基準は何ですか？", "最初に見る数字は何ですか？", "ほかに会うべき人はいますか？"],
    recognizeHints: [],
    roleSituation: type.roleSituation,
    shortLabel: type.label,
    shortLabelId: type.shortLabelId,
    skipped: type.skipped,
    slot: type.slot,
    targetCount: type.target,
    why: "このタイプの人と話すと、次の Step の判断材料がそろいます。",
  })),
  sample: true,
  steps: DEMO_PLAN.steps.map((step) => ({ ...step, personTypeKeys: [...step.personTypeKeys], why: null })),
};

export const demoPlanDetail: PlanV2Detail = {
  achievedAt: null,
  content: demoPlanContent,
  goal: DEMO_PLAN.goal,
  goalKind: DEMO_PLAN.goalKind,
  planId: DEMO_PLAN.id,
  premise: demoPlanPremise,
  purposeText: DEMO_PLAN.purposeText,
  quota: { activeGoalLimit: 2, activeGoals: 1, manualEditAvailable: true, reviewLeftThisMonth: 2, reviewMonthlyLimit: 3 },
  revision: 2,
  sample: true,
  score: demoPlanScore,
  startsOn: DEMO_PLAN.startsOn,
};

/** Every person reference used by the fixtures above (for the consistency check). */
export const demoFixturePeopleRefs = {
  completion: [demoCompletionQuestion.contactId],
  invite: [demoInviteRedeem.contactId],
  notes: demoNotes.flatMap((note) => note.contactIds),
  plan: DEMO_PLAN.personTypes.flatMap((type) => type.personIds),
  todos: demoTodos.flatMap((todo) => ("relatedContactId" in todo && todo.relatedContactId ? [todo.relatedContactId] : [])),
  contacts: demoContactRows.map((row) => row.id),
  events: DEMO_EVENTS.flatMap((item) => item.attendeeIds),
};
