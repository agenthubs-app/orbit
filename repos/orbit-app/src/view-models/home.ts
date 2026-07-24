import { contactsToSummaries } from "./contacts";
import { eventsToSummaries, type EventSummary } from "./events";
import { profileToSummary, type ProfileSummary } from "./profile";

export type HomeEventFilter = "active" | "all" | "ended" | "upcoming";
export type HomeEventState = Exclude<HomeEventFilter, "all">;

export interface HomeEntryView {
  detail: string;
  href: "/contacts" | "/profile" | "/schedule";
  title: string;
}

export interface HomeEventView extends EventSummary {
  detailLine: string;
  state: HomeEventState;
}

export type HomePipelineTone = "accent" | "live" | "sky";

export interface HomePipelineItemView {
  detail: string;
  label: string;
  tone: HomePipelineTone;
  value: string;
}

export interface HomeProfileFactView {
  label: string;
  value: string;
}

export interface HomeProfileGroupView {
  items: string[];
  title: string;
}

export interface HomeProfilePanelView {
  bio: string;
  facts: HomeProfileFactView[];
  goal: string;
  groups: HomeProfileGroupView[];
  title: string;
}

export interface HomeHubLayoutView {
  aiMinHeight: number;
  askInputMinHeight: number;
  entryVariant: "compact";
  secondaryEventLimit: number;
}

export interface HomeAssistantView {
  placeholder: string;
  title: string;
}

export interface HomeView {
  assistant: HomeAssistantView;
  entries: HomeEntryView[];
  events: HomeEventView[];
  filterCounts: Record<HomeEventFilter, number>;
  layout: HomeHubLayoutView;
  pipeline: HomePipelineItemView[];
  profile: ProfileSummary;
  profilePanel: HomeProfilePanelView;
  stats: {
    events: string;
    inProgress: string;
    people: string;
  };
  summary: string;
}

type UnknownRecord = Record<string, unknown>;

const entries: HomeEntryView[] = [
  {
    detail: "别人报名和认识你时，先看到这里。",
    href: "/profile",
    title: "通用画像"
  },
  {
    detail: "会后人脉、合作线索和引荐背景。",
    href: "/contacts",
    title: "名片夹"
  },
  {
    detail: "约见、跟进和活动时间。",
    href: "/schedule",
    title: "日程安排"
  }
];

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(record: UnknownRecord, fieldName: string): string {
  const value = record[fieldName];
  return typeof value === "string" ? value.trim() : "";
}

function listFromPayload(data: unknown): UnknownRecord[] {
  if (Array.isArray(data)) {
    return data.filter(isRecord);
  }

  if (!isRecord(data)) {
    return [];
  }

  const events = data.events;
  return Array.isArray(events) ? events.filter(isRecord) : [];
}

function timestamp(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function eventState(
  status: string,
  timing: {
    endsAt: string;
    now: number;
    startsAt: string;
  }
): HomeEventState {
  if (/已结束|已取消|ended|cancelled|canceled|past/iu.test(status)) {
    return "ended";
  }

  const startsAt = timestamp(timing.startsAt);
  const endsAt = timestamp(timing.endsAt);

  if (endsAt !== null && endsAt < timing.now) {
    return "ended";
  }

  if (
    startsAt !== null &&
    endsAt !== null &&
    startsAt <= timing.now &&
    timing.now <= endsAt
  ) {
    return "active";
  }

  if (startsAt !== null && endsAt === null && startsAt < timing.now) {
    return "ended";
  }

  if (/进行中|active|live/iu.test(status)) {
    return "active";
  }

  return "upcoming";
}

function detailLine(event: EventSummary): string {
  return [event.startsAt, event.location].filter(Boolean).join(" · ");
}

function homeEvents(
  events: EventSummary[],
  rawEvents: UnknownRecord[],
  now: number
): HomeEventView[] {
  return events.map((event, index) => ({
    ...event,
    detailLine: detailLine(event),
    state: eventState(event.status, {
      endsAt: stringField(rawEvents[index] ?? {}, "endsAt"),
      now,
      startsAt: stringField(rawEvents[index] ?? {}, "startsAt")
    })
  }));
}

function inProgressCount(contacts: ReturnType<typeof contactsToSummaries>): number {
  return contacts.filter((contact) => /在推进|待联系|培养中/iu.test(contact.status))
    .length;
}

function filterCounts(events: HomeEventView[]): Record<HomeEventFilter, number> {
  return {
    active: events.filter((event) => event.state === "active").length,
    all: events.length,
    ended: events.filter((event) => event.state === "ended").length,
    upcoming: events.filter((event) => event.state === "upcoming").length
  };
}

function homePipeline(stats: HomeView["stats"]): HomePipelineItemView[] {
  return [
    {
      detail: "需要准备与复盘",
      label: "活动",
      tone: "sky",
      value: stats.events
    },
    {
      detail: "可触达关系",
      label: "人脉",
      tone: "accent",
      value: stats.people
    },
    {
      detail: "今天优先处理",
      label: "在推进",
      tone: "live",
      value: stats.inProgress
    }
  ];
}

function homeHubLayout(): HomeHubLayoutView {
  return {
    aiMinHeight: 560,
    askInputMinHeight: 138,
    entryVariant: "compact",
    secondaryEventLimit: 2
  };
}

function homeAssistant(): HomeAssistantView {
  return {
    placeholder: "问人脉、活动、跟进或日程",
    title: "有什么可以帮你？"
  };
}

function profileFacts(profile: ProfileSummary): HomeProfileFactView[] {
  return [
    { label: "身份", value: profile.role },
    { label: "领域", value: profile.industry },
    { label: "时区", value: profile.timezone }
  ].filter((fact) => fact.value.trim().length > 0);
}

function profileGroups(profile: ProfileSummary): HomeProfileGroupView[] {
  return [
    { items: profile.offering, title: "我能提供" },
    { items: profile.seeking, title: "我在寻找" },
    { items: profile.topics, title: "想聊的话题" }
  ].filter((group) => group.items.length > 0);
}

function homeProfilePanel(profile: ProfileSummary): HomeProfilePanelView {
  return {
    bio: profile.bio,
    facts: profileFacts(profile),
    goal: profile.relationshipGoal,
    groups: profileGroups(profile),
    title: "别人会看到的资料"
  };
}

export function homeToView({
  contacts,
  events,
  now = new Date(),
  profile
}: {
  contacts: unknown;
  events: unknown;
  now?: Date;
  profile: unknown;
}): HomeView {
  const profileView = profileToSummary(profile);
  const eventViews = homeEvents(
    eventsToSummaries(events),
    listFromPayload(events),
    now.getTime()
  );
  const contactViews = contactsToSummaries(contacts);
  const stats = {
    events: String(eventViews.length),
    inProgress: String(inProgressCount(contactViews)),
    people: String(contactViews.length)
  };

  return {
    assistant: homeAssistant(),
    entries,
    events: eventViews,
    filterCounts: filterCounts(eventViews),
    layout: homeHubLayout(),
    pipeline: homePipeline(stats),
    profile: profileView,
    profilePanel: homeProfilePanel(profileView),
    stats,
    summary: "先看今天该推进的人，再决定要参加和准备的活动。"
  };
}

export function homeFilteredEvents(
  events: HomeEventView[],
  filter: HomeEventFilter
): HomeEventView[] {
  return filter === "all"
    ? events
    : events.filter((event) => event.state === filter);
}
