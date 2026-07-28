import {
  eventAttendeeRosterToView,
  eventMatchesToView,
  type EventAttendeeCardView,
  type EventMatchCardView
} from "./event-attendees";
import { eventDetailToSummary } from "./events";

export interface PartyMetricView {
  label: string;
  value: string;
}

export interface PartyAgendaItemView {
  detail: string;
  time: string;
  title: string;
}

export interface PartyCheckInView {
  accessCode: string;
  attendeeSummary: string;
  instruction: string;
  statusLabel: string;
}

export interface PartyPriorityPersonView {
  groupLabel: string;
  id: string;
  imageUrl?: string;
  matchLabel: string;
  name: string;
  nextAction: string;
  organizationRole: string;
  reason: string;
  relationshipContext: string;
  seatLabel: string;
  statusLabel: string;
  tags: string[];
}

export interface PartyGraphGroupView {
  detail: string;
  id: string;
  people: PartyPriorityPersonView[];
  title: string;
}

export interface PartyMatchView {
  id: string;
  message: string;
  names: string;
  nextAction: string;
  title: string;
}

export interface PartyModeView {
  accessCode: string;
  agenda: PartyAgendaItemView[];
  checkIn: PartyCheckInView;
  eventDetail: string;
  eventId: string;
  eventTitle: string;
  graphGroups: PartyGraphGroupView[];
  matches: PartyMatchView[];
  metrics: PartyMetricView[];
  nextAction: string;
  priorityPeople: PartyPriorityPersonView[];
}

export interface PartyModeInput {
  attendeesPayload: unknown;
  eventId: string;
  eventPayload: unknown;
  matchesPayload: unknown;
}

function compactId(value: string): string {
  return value.replace(/[^a-z0-9]+/giu, "").toUpperCase();
}

export function partyAccessCode(eventId: string): string {
  const compact = compactId(eventId) || "ORBT";

  return `${compact.slice(0, 4).padEnd(4, "X")}-4821`;
}

function knownFallbackTitle(value: string): boolean {
  return value === "Event" || value === "活动" || value === "活动参会者";
}

function attendeeCheckedIn(attendee: EventAttendeeCardView): boolean {
  return attendee.statusLabel === "已签到";
}

function displayTitle(eventTitle: string, rosterTitle: string): string {
  if (eventTitle && !knownFallbackTitle(eventTitle)) {
    return eventTitle;
  }

  if (rosterTitle && !knownFallbackTitle(rosterTitle)) {
    return rosterTitle;
  }

  return "活动现场";
}

function displayDetail(eventDetail: string, rosterDetail: string): string {
  const detail = [eventDetail, rosterDetail]
    .map((value) => value.trim())
    .find((value) => value && value !== "Time pending");

  return detail ?? "";
}

function matchedNameOrder(matches: EventMatchCardView[]): Map<string, number> {
  const order = new Map<string, number>();

  matches.forEach((match, matchIndex) => {
    match.names
      .filter((name) => name !== "我")
      .forEach((name, nameIndex) => {
        if (!order.has(name)) {
          order.set(name, matchIndex * 10 + nameIndex);
        }
      });
  });

  return order;
}

function personReason(attendee: EventAttendeeCardView): string {
  return (
    attendee.reasons[0] ||
    attendee.relationshipContext ||
    "现场先判断对方的需求，再决定要不要继续。"
  );
}

function priorityPeople(
  attendees: EventAttendeeCardView[],
  matches: EventMatchCardView[]
): PartyPriorityPersonView[] {
  const matchOrder = matchedNameOrder(matches);

  return attendees
    .map((attendee, index) => ({
      attendee,
      index,
      matchIndex: matchOrder.get(attendee.name)
    }))
    .sort((left, right) => {
      const leftMatched = left.matchIndex ?? Number.POSITIVE_INFINITY;
      const rightMatched = right.matchIndex ?? Number.POSITIVE_INFINITY;

      if (leftMatched !== rightMatched) {
        return leftMatched - rightMatched;
      }

      if (left.attendee.reasons.length !== right.attendee.reasons.length) {
        return right.attendee.reasons.length - left.attendee.reasons.length;
      }

      return left.index - right.index;
    })
    .slice(0, 6)
    .map(({ attendee, matchIndex }, index) => {
      const matched = matchIndex !== undefined;
      const reason = personReason(attendee);
      const relationshipContext =
        attendee.relationshipContext.trim() === reason.trim()
          ? ""
          : attendee.relationshipContext;

      return {
        groupLabel: `第 ${index + 1} 组`,
        id: attendee.id,
        ...(attendee.imageUrl ? { imageUrl: attendee.imageUrl } : {}),
        matchLabel: matched ? "现场匹配" : attendee.knownLabel,
        name: attendee.name,
        nextAction: attendee.suggestedNextAction,
        organizationRole: attendee.organizationRole,
        reason,
        relationshipContext,
        seatLabel: `${String.fromCharCode(65 + (index % 4))}${index + 1}`,
        statusLabel: attendee.statusLabel,
        tags: attendee.tags
      };
    });
}

function graphGroups(people: PartyPriorityPersonView[]): PartyGraphGroupView[] {
  const groups = new Map<string, PartyPriorityPersonView[]>();

  people.forEach((person) => {
    const title = person.tags[0] || person.matchLabel || "现场认识";
    const current = groups.get(title) ?? [];
    current.push(person);
    groups.set(title, current);
  });

  return Array.from(groups.entries()).map(([title, groupPeople]) => ({
    detail: `${groupPeople.length} 人 · ${groupPeople
      .map((person) => person.name)
      .slice(0, 3)
      .join("、")}`,
    id: title,
    people: groupPeople,
    title
  }));
}

function metrics(input: {
  attendees: EventAttendeeCardView[];
  matches: EventMatchCardView[];
}): PartyMetricView[] {
  const checkedInCount = input.attendees.filter(attendeeCheckedIn).length;

  return [
    { label: "参会者", value: String(input.attendees.length) },
    { label: "已签到", value: String(checkedInCount) },
    { label: "现场匹配", value: String(input.matches.length) }
  ];
}

function agenda(input: {
  eventDetail: string;
  eventTitle: string;
  priorityPeople: PartyPriorityPersonView[];
}): PartyAgendaItemView[] {
  const firstPerson = input.priorityPeople[0]?.name;

  return [
    {
      detail: input.eventDetail || "到场后先确认这场活动和通行码。",
      time: "到场",
      title: "到场签到"
    },
    {
      detail: firstPerson
        ? `先见 ${firstPerson}，把对方需求和可交换资源问清楚。`
        : "先看名单，挑 1-2 个最值得聊的人。",
      time: "开场后",
      title: "优先介绍"
    },
    {
      detail: "离场前记录一个明确的下一步，别把关系留在寒暄里。",
      time: "离场前",
      title: "跟进记录"
    }
  ];
}

function matchViews(matches: EventMatchCardView[]): PartyMatchView[] {
  return matches.map((match) => ({
    id: match.id,
    message: match.message,
    names: match.names.join(" · "),
    nextAction: match.nextAction,
    title: match.title
  }));
}

function checkInView(input: {
  accessCode: string;
  attendees: EventAttendeeCardView[];
}): PartyCheckInView {
  const checkedInCount = input.attendees.filter(attendeeCheckedIn).length;
  const attendeeCount = input.attendees.length;

  return {
    accessCode: input.accessCode,
    attendeeSummary:
      attendeeCount > 0
        ? `${checkedInCount} 人已签到，${attendeeCount} 人在名单里。`
        : "名单还没准备好，先出示通行码确认活动。",
    instruction: "到场后出示通行码，工作人员确认后再继续看现场名单。",
    statusLabel: "待现场确认"
  };
}

export function partyModeToView(input: PartyModeInput): PartyModeView {
  const event = eventDetailToSummary(input.eventPayload);
  const roster = eventAttendeeRosterToView(input.attendeesPayload);
  const matchView = eventMatchesToView(input.matchesPayload);
  const eventId = event.id === "event" ? input.eventId : event.id;
  const accessCode = partyAccessCode(eventId);
  const eventTitle = displayTitle(event.title, roster.eventTitle);
  const eventDetail = displayDetail(
    [event.startsAt, event.location].filter(Boolean).join(" · "),
    roster.eventDetail
  );
  const people = priorityPeople(roster.attendees, matchView.matches);

  return {
    accessCode,
    agenda: agenda({
      eventDetail,
      eventTitle,
      priorityPeople: people
    }),
    checkIn: checkInView({
      accessCode,
      attendees: roster.attendees
    }),
    eventDetail,
    eventId,
    eventTitle,
    graphGroups: graphGroups(people),
    matches: matchViews(matchView.matches),
    metrics: metrics({
      attendees: roster.attendees,
      matches: matchView.matches
    }),
    nextAction: "先打开签到码，再看这场活动最值得优先认识的人。",
    priorityPeople: people
  };
}
