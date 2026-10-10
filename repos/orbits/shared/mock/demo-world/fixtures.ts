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
import type { PlanV2SummaryResponse } from "../../contract/plan-v2";
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

// 12 plan v2 (draft) — the demo plan with met counts and a score.
export const demoPlanSummary: PlanV2SummaryResponse = {
  summary: {
    goal: DEMO_PLAN.goal,
    goalKind: DEMO_PLAN.goalKind,
    steps: DEMO_PLAN.steps.map((step) => ({ ...step })),
    personTypes: DEMO_PLAN.personTypes.map((type) => ({ key: type.key, label: type.label, target: type.target, met: type.personIds.length })),
    sample: true,
  },
  score: { total: 46, byType: DEMO_PLAN.personTypes.map((type) => ({ key: type.key, label: type.label, score: Math.round((type.personIds.length / type.target) * 100) })), todayDelta: 3 },
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
