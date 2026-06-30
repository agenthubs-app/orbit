import type { EventDTO } from "../../../shared/domain/contracts";
import {
  attendeesForEvent,
  compactCodeFor,
  eventCodeFor,
  eventIndustryFor,
  eventStatusFor,
  eventTagsFor,
  eventThemeFor,
  evidenceSummaryFor,
  formatDuration,
  getOrbitHybridRouteData,
  hashString,
  initialFor,
  sortedContacts,
  sortedEvents,
  type OrbitHybridRouteData,
} from "./orbit-hybrid-route-data";

export interface OrbitLandingEventView {
  address: string;
  agenda: OrbitEventAgendaItem[];
  brandColor: string;
  cap: number;
  code: string;
  descriptionZh: string;
  detailLogoUrl: string;
  endsAt: string;
  feeLabel: string;
  host: string;
  id: string;
  industry: string;
  logoUrl: string;
  mapX: number;
  mapY: number;
  name: string;
  organizer: string;
  participantCount: number;
  place: string;
  startsAt: string;
  stats: OrbitEventStatsView;
  status: "active" | "upcoming" | "ended";
  summaryZh: string;
  tags: string[];
  theme: string;
  venue: string;
  youRsvped: boolean;
}

export interface OrbitEventAgendaItem {
  description: string;
  label: string;
  time: string;
}

export interface OrbitEventAttendeeView {
  initial: string;
  name: string;
  role: string;
}

export interface OrbitEventStatsView {
  attendees: OrbitEventAttendeeView[];
  authed: boolean;
  count: number;
  youRsvped: boolean;
}

export interface OrbitLandingConnectionView {
  displayName: string;
  id: string;
  initial: string;
}

export interface OrbitLandingViewModel {
  account: {
    fullName: string;
  };
  connections: OrbitLandingConnectionView[];
  events: OrbitLandingEventView[];
}

const brandColors = [
  "#6359E9",
  "#0E9E68",
  "#2D7FF0",
  "#E0415F",
  "#E08A2B",
  "#4A5468",
] as const;

const themeGlyphs: Record<string, string> = {
  ai: "<path d='M200 80l9 26 26 9-26 9-9 26-9-26-26-9 26-9z'/><circle cx='150' cy='96' r='4.5'/><circle cx='252' cy='150' r='4.5'/>",
  chip: "<rect x='169' y='93' width='62' height='54' rx='7'/><rect x='187' y='111' width='26' height='18' rx='3'/><path d='M186 93v-12M214 93v-12M186 147v12M214 147v12M169 108h-13M169 132h-13M231 108h13M231 132h13'/>",
  cloud: "<path d='M160 150a26 26 0 0 1 5-50 34 34 0 0 1 65 5 23 23 0 0 1 3 45z'/>",
  fashion: "<circle cx='200' cy='90' r='7'/><path d='M200 97l-46 44h92z'/><path d='M154 141h92'/>",
  finance: "<path d='M170 118v32M198 104v44M226 92v56'/><path d='M150 150l26-24 18 12 28-38 24 16' stroke-opacity='.6'/>",
  globe: "<circle cx='200' cy='120' r='42'/><path d='M158 120h84M200 78c-15 12-15 72 0 84M200 78c15 12 15 72 0 84M168 98c20 10 44 10 64 0M168 142c20-10 44-10 64 0'/>",
};

function colorForEvent(event: EventDTO, index: number): string {
  return brandColors[(hashString(event.id) + index) % brandColors.length];
}

function coverSvg(color: string, theme: string, letter: string) {
  const glyph = themeGlyphs[theme] ?? themeGlyphs.ai;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 240'><defs><radialGradient id='h' cx='28%' cy='18%' r='95%'><stop offset='0' stop-color='#fff' stop-opacity='.34'/><stop offset='58%' stop-color='${color}' stop-opacity='0'/></radialGradient></defs><rect width='400' height='240' fill='${color}'/><rect width='400' height='240' fill='url(#h)'/><g fill='none' stroke='#fff' stroke-opacity='.2' stroke-width='1.3' stroke-dasharray='2 9'><circle cx='200' cy='120' r='150'/><circle cx='200' cy='120' r='112'/></g><g fill='none' stroke='#fff' stroke-opacity='.5' stroke-width='3.2' stroke-linecap='round' stroke-linejoin='round'>${glyph}</g><text x='374' y='54' text-anchor='end' font-family='Inter Tight,Inter,sans-serif' font-size='30' font-weight='700' fill='#fff' fill-opacity='.18'>${letter}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function mapPositionFor(event: EventDTO): [number, number] {
  const hash = hashString(`${event.id}:${event.location ?? ""}`);

  return [36 + (hash % 29), 35 + ((hash >> 4) % 34)];
}

function agendaFor(event: EventDTO): OrbitEventAgendaItem[] {
  const startHour = Number(event.startsAt.slice(11, 13));
  const firstHour = Number.isFinite(startHour) ? startHour : 18;
  const pad = (value: number) => String(value).padStart(2, "0");

  return [
    {
      time: `${pad(firstHour)}:00`,
      label: "签到与资料确认",
      description: "根据本地数据库中的来源资料确认身份和目标。",
    },
    {
      time: `${pad((firstHour + 1) % 24)}:00`,
      label: "主题交流",
      description: `${eventIndustryFor(event)} 相关的结构化交流。`,
    },
    {
      time: `${pad((firstHour + 2) % 24)}:00`,
      label: "关系匹配",
      description: "使用 source-backed 关系图生成推荐与后续动作。",
    },
    {
      time: `${pad((firstHour + 3) % 24)}:00`,
      label: "会后跟进",
      description: `预计活动时长 ${formatDuration(event.startsAt, event.endsAt)}。`,
    },
  ];
}

function attendeeViewsFor(
  data: OrbitHybridRouteData,
  event: EventDTO,
): OrbitEventAttendeeView[] {
  return attendeesForEvent(data, event.id).map((attendee) => ({
    initial: initialFor(attendee.displayName),
    name: attendee.displayName,
    role: [attendee.role, attendee.organization].filter(Boolean).join(" · "),
  }));
}

function eventView(
  data: OrbitHybridRouteData,
  event: EventDTO,
  index: number,
): OrbitLandingEventView {
  const attendees = attendeeViewsFor(data, event);
  const attendeeCount = attendees.length;
  const status = eventStatusFor(event, data.generatedAt);
  const theme = eventThemeFor(event);
  const color = colorForEvent(event, index);
  const logoUrl = coverSvg(color, theme, initialFor(event.name, "E"));
  const [mapX, mapY] = mapPositionFor(event);
  const description = evidenceSummaryFor(
    data,
    event.evidenceIds,
    "Source-backed event loaded from the hybrid local remote database.",
  );

  return {
    address: event.location ?? "",
    agenda: agendaFor(event),
    brandColor: color,
    cap: Math.max(20, attendeeCount + 20),
    code: eventCodeFor(event, index),
    descriptionZh: description,
    detailLogoUrl: logoUrl,
    endsAt: event.endsAt ?? event.startsAt,
    feeLabel: "Source-backed",
    host: data.account.name,
    id: event.id,
    industry: eventIndustryFor(event),
    logoUrl,
    mapX,
    mapY,
    name: event.name,
    organizer: data.account.name,
    participantCount: attendeeCount,
    place: event.location ?? "Local remote database",
    startsAt: event.startsAt,
    stats: {
      attendees,
      authed: true,
      count: attendeeCount,
      youRsvped: true,
    },
    status,
    summaryZh: description,
    tags: eventTagsFor(event),
    theme,
    venue: event.location ?? "Local remote database",
    youRsvped: true,
  };
}

export function getOrbitLandingViewModel(): OrbitLandingViewModel {
  const data = getOrbitHybridRouteData();

  return {
    account: { fullName: data.profile.displayName },
    connections: sortedContacts(data).slice(0, 6).map((contact) => ({
      displayName: contact.displayName,
      id: contact.id,
      initial: initialFor(contact.displayName),
    })),
    events: sortedEvents(data).map((event, index) => eventView(data, event, index)),
  };
}

export function getOrbitEventDetailViewModel(code: string) {
  const normalized = compactCodeFor(String(code || ""), "");
  const landing = getOrbitLandingViewModel();

  return (
    landing.events.find((event) => event.code === normalized || event.id === code) ??
    landing.events[0]
  );
}
