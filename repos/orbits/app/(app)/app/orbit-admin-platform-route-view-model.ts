import type { EventDTO } from "../../../shared/domain/contracts";
import {
  attendeesForEvent,
  eventCodeFor,
  eventIndustryFor,
  eventStatusFor,
  evidenceSummaryFor,
  getOrbitHybridRouteData,
  gradientFor,
  initialFor,
  sortedEvents,
  type OrbitHybridRouteData,
} from "./orbit-hybrid-route-data";

export interface OrbitAdminEventView {
  cap: number;
  checkedin: number;
  code: string;
  endsAt: string;
  g: string;
  id: string;
  matched: number;
  name: string;
  phase: number;
  registered: number;
  startsAt: string;
  status: string;
  summary: string;
  themeColor: string;
  venue: string;
}

export interface OrbitAdminMemberView {
  email: string;
  g: string;
  initial: string;
  name: string;
  role: string;
}

export interface OrbitAdminFeedView {
  company: string;
  g: string;
  id: string;
  initial: string;
  kind: string;
  name: string;
  t: string;
  title: string;
}

export interface OrbitAdminViewModel {
  adminEvents: OrbitAdminEventView[];
  adminFeed: OrbitAdminFeedView[];
  adminFunnel: Array<[string, number, number]>;
  adminMembers: OrbitAdminMemberView[];
  adminOrg: { g: string; initial: string; name: string; owner: string; sub: string };
  adminPhases: string[];
  adminStats: Array<{ delta: string; g: string; icon: string; label: string; value: string }>;
}

export interface OrbitPlatformReviewView {
  desc: string;
  facts: Array<[string, string]>;
  flags: string[];
  g: string;
  id: string;
  letter: string;
  name: string;
  org: string;
  submitted: string;
}

export interface OrbitPlatformAccountView {
  events: number;
  g: string;
  letter: string;
  name: string;
  owner: string;
  status: string;
}

export interface OrbitPlatformViewModel {
  orgAccounts: OrbitPlatformAccountView[];
  platformStats: Array<{ icon: string; label: string; note: string; tone: string; value: string }>;
  reviewQueue: OrbitPlatformReviewView[];
}

const themeColors = ["#6359E9", "#0E9E68", "#2D7FF0", "#E0415F", "#E08A2B"] as const;

function phaseForStatus(status: string): number {
  if (status === "ended") return 4;
  if (status === "active") return 3;
  return 1;
}

function adminEvent(
  data: OrbitHybridRouteData,
  event: EventDTO,
  index: number,
): OrbitAdminEventView {
  const attendees = attendeesForEvent(data, event.id);
  const matched = data.matchRecommendations.filter(
    (recommendation) => recommendation.eventId === event.id,
  ).length;
  const status = eventStatusFor(event, data.generatedAt);
  const summary = evidenceSummaryFor(
    data,
    event.evidenceIds,
    "Source-backed event from the hybrid local remote database.",
  );

  return {
    cap: Math.max(20, attendees.length + 20),
    checkedin: attendees.filter((attendee) => attendee.status === "reviewed").length,
    code: eventCodeFor(event, index),
    endsAt: event.endsAt ?? event.startsAt,
    g: gradientFor(event.id, index),
    id: event.id,
    matched,
    name: event.name,
    phase: phaseForStatus(status),
    registered: attendees.length,
    startsAt: event.startsAt,
    status,
    summary,
    themeColor: themeColors[index % themeColors.length],
    venue: event.location ?? "Local remote database",
  };
}

function adminMembers(data: OrbitHybridRouteData): OrbitAdminMemberView[] {
  return data.profile
    ? [
        {
          email: `${data.profile.id}@local.orbit`,
          g: gradientFor(data.profile.id),
          initial: initialFor(data.profile.displayName),
          name: data.profile.displayName,
          role: data.profile.role ?? "Workspace member",
        },
      ]
    : [];
}

function adminFeed(data: OrbitHybridRouteData): OrbitAdminFeedView[] {
  const attendeeFeed = data.attendees.slice(0, 6).map((attendee, index) => ({
    company: attendee.organization ?? "",
    g: gradientFor(attendee.id, index),
    id: attendee.id,
    initial: initialFor(attendee.displayName),
    kind: attendee.status === "reviewed" ? "签到" : "报名",
    name: attendee.displayName,
    t: attendee.updatedAt ? "local remote" : "seed",
    title: attendee.role ?? "",
  }));

  if (attendeeFeed.length > 0) {
    return attendeeFeed;
  }

  return data.contacts.slice(0, 6).map((contact, index) => ({
    company: contact.organization ?? "",
    g: gradientFor(contact.id, index),
    id: contact.id,
    initial: initialFor(contact.displayName),
    kind: "联系人",
    name: contact.displayName,
    t: "local remote",
    title: contact.role ?? "",
  }));
}

export function getOrbitAdminViewModel(): OrbitAdminViewModel {
  const data = getOrbitHybridRouteData();
  const events = sortedEvents(data).map((event, index) =>
    adminEvent(data, event, index),
  );
  const totalRegistered = events.reduce((sum, event) => sum + event.registered, 0);
  const totalCheckedIn = events.reduce((sum, event) => sum + event.checkedin, 0);
  const totalMatched = events.reduce((sum, event) => sum + event.matched, 0);
  const activeCount = events.filter((event) => event.status === "active").length;

  return {
    adminOrg: {
      name: data.account.name,
      sub: "Hybrid local remote workspace",
      owner: `${data.profile.id}@local.orbit`,
      initial: initialFor(data.account.name),
      g: gradientFor(data.account.id),
    },
    adminEvents: events,
    adminPhases: ["创建", "报名", "签到", "匹配", "复盘"],
    adminStats: [
      { label: "总报名", value: String(totalRegistered), delta: "local remote", icon: "users", g: "g-indigo" },
      { label: "已签到", value: String(totalCheckedIn), delta: `${events.length} events`, icon: "checkCircle", g: "g-emerald" },
      { label: "完成匹配", value: String(totalMatched), delta: "hybrid matches", icon: "sparkle", g: "g-violet" },
      { label: "进行中活动", value: String(activeCount), delta: "computed status", icon: "zap", g: "g-amber" },
    ],
    adminFunnel: [
      ["活动记录", events.length, 1],
      ["报名记录", totalRegistered, events.length ? totalRegistered / Math.max(totalRegistered, events.length) : 0],
      ["匹配记录", totalMatched, totalRegistered ? totalMatched / totalRegistered : 0],
    ],
    adminFeed: adminFeed(data),
    adminMembers: adminMembers(data),
  };
}

export function getOrbitPlatformViewModel(): OrbitPlatformViewModel {
  const data = getOrbitHybridRouteData();
  const events = sortedEvents(data);
  const reviewQueue: OrbitPlatformReviewView[] = events.slice(0, 8).map((event, index) => {
    const attendees = attendeesForEvent(data, event.id);

    return {
      id: event.id,
      name: event.name,
      org: data.account.name,
      letter: initialFor(event.name),
      g: gradientFor(event.id, index),
      submitted: event.startsAt,
      desc: evidenceSummaryFor(
        data,
        event.evidenceIds,
        "Hybrid local remote event pending operator review.",
      ),
      facts: [
        ["预计人数", String(Math.max(20, attendees.length + 20))],
        ["场地", event.location ?? "Local remote database"],
        ["行业", eventIndustryFor(event)],
      ],
      flags: [event.source.type.replace(/_/g, " "), eventStatusFor(event, data.generatedAt)],
    };
  });

  return {
    platformStats: [
      { label: "主办方账号", value: String(data.accounts?.length ?? 1), note: "local remote", icon: "building", tone: "indigo" },
      { label: "累计活动", value: String(events.length), note: "events table", icon: "calendar", tone: "live" },
      { label: "待审核", value: String(reviewQueue.length), note: "review queue", icon: "checkCircle", tone: "amber" },
      { label: "平台用户", value: String(data.contacts.length), note: "contacts table", icon: "users", tone: "sky" },
    ],
    reviewQueue,
    orgAccounts: [
      {
        name: data.account.name,
        events: events.length,
        owner: `${data.profile.id}@local.orbit`,
        status: "已认证",
        letter: initialFor(data.account.name),
        g: gradientFor(data.account.id),
      },
    ],
  };
}
