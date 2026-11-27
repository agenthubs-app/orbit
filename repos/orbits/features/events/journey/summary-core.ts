/**
 * 2026-11-23 探す 简介栏（event-side-panel-proposal）：纯规则部分。只组装栏里要显示的字段，读取在 service.summary。
 * - 介绍：活动说明去掉 Markdown 标记、合成一段，最多 400 字（栏里再按 4 行省略）。
 * - 已结束且我报了名：会场记录里同桌 + 交换过的人（去重），首字最多 4 个，没加为人脉的人数。
 */
import type { EventOverviewRegistrationStatus, EventOverviewResponse } from "../../../shared/contract/event-overview";
import type { EventSummaryResponse } from "../../../shared/contract/event-summary";
import type { JourneyEvent } from "./ports";
import type { VenueWorkspace } from "./venue-core";

export const SUMMARY_DESCRIPTION_MAX = 400;
export const SUMMARY_INITIALS_MAX = 4;

/** Markdown → 一段纯文字（标题、列表符号、链接、强调、图片、代码标记都去掉）。 */
export function plainDescription(raw: string | null | undefined, max = SUMMARY_DESCRIPTION_MAX): string | null {
  if (!raw) return null;
  const text = raw
    .replace(/\r\n?/g, "\n")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*(?:[-*+•●]|\d+[.)])\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/(\*\*|__|\*|_|~~|`)(?=\S)([\s\S]*?\S)\1/g, "$2")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;
  const chars = [...text];
  return chars.length > max ? `${chars.slice(0, max - 1).join("")}…` : text;
}

const initial = (name: string) => name.trim().charAt(0);
const normalizeName = (value: string) => value.normalize("NFKC").replace(/\s+/g, "");

/** 会场记录里我见过的人：两轮同桌 + 交换成立（去重，不含我）。 */
export function metPeople(ws: Pick<VenueWorkspace, "me" | "directory" | "contactRequests" | "roundOneTable" | "roundTwoTable">, contactNames: ReadonlySet<string>): NonNullable<EventSummaryResponse["met"]> {
  const meId = ws.me.participantId;
  const ids = new Set<string>();
  for (const table of [ws.roundOneTable, ws.roundTwoTable]) {
    if (!table?.members.some((member) => member.participantId === meId)) continue;
    for (const member of table.members) if (member.participantId !== meId) ids.add(member.participantId);
  }
  for (const request of ws.contactRequests) {
    if (request.status !== "accepted" || request.withdrawnAt) continue;
    if (request.requesterParticipantId === meId) ids.add(request.targetParticipantId);
    else if (request.targetParticipantId === meId) ids.add(request.requesterParticipantId);
  }
  const people = [...ids].flatMap((id) => {
    const found = ws.directory.find((participant) => participant.participantId === id);
    return found ? [found.displayName] : [];
  });
  return {
    count: ids.size,
    hasRecord: ids.size > 0,
    initials: people.slice(0, SUMMARY_INITIALS_MAX).map(initial).filter(Boolean),
    notInContacts: people.filter((name) => !contactNames.has(normalizeName(name))).length,
  };
}

/** 示例世界：从详情读模型换算（示例活动不多读，live 走 service.summary 的轻量读取）。 */
export function summaryFromOverview(overview: EventOverviewResponse, now: Date): EventSummaryResponse {
  const ended = now.getTime() >= Date.parse(overview.endsAt || overview.startsAt);
  const status = overview.registration.status;
  const went = ended && (status === "registered" || status === "attended");
  const next = overview.organizer.next;
  return {
    attendeeInitials: overview.attendees.slice(0, SUMMARY_INITIALS_MAX).map((item) => item.initial).filter(Boolean),
    capacity: overview.capacity ?? null,
    coverUrl: overview.coverUrl ?? null,
    description: plainDescription(overview.description),
    emoji: overview.emoji,
    ended,
    endsAt: overview.endsAt ?? null,
    eventId: overview.eventId,
    ...(went ? { met: overview.venueRecord ? { count: overview.venueRecord.tablemates, hasRecord: overview.venueRecord.tablemates > 0, initials: [], notInContacts: 0 } : { count: 0, hasRecord: false, initials: [], notInContacts: 0 } } : {}),
    ...(ended && !went ? { next: next ? { coverUrl: null, emoji: overview.emoji, eventId: next.eventId, startsAt: next.startsAt, title: next.title, venue: null } : null } : {}),
    organizer: { following: Boolean(overview.organizer.following), name: overview.organizer.name, organizerId: overview.organizer.organizerId ?? null, ...(overview.organizer.unnamed ? { unnamed: true } : {}) },
    priceYen: overview.priceYen ?? null,
    registrationClosesAt: overview.registrationClosesAt ?? null,
    registrationCount: overview.attendeeCounts.all,
    remaining: overview.remaining ?? null,
    startsAt: overview.startsAt,
    status,
    title: overview.title,
    venue: overview.venue ?? null,
    waitlistEnabled: Boolean(overview.waitlistEnabled),
  };
}

export function buildEventSummary(input: {
  event: JourneyEvent;
  now: Date;
  status: EventOverviewRegistrationStatus;
  organizer: EventSummaryResponse["organizer"];
  attendeeNames: readonly string[];
  met?: EventSummaryResponse["met"];
  next?: EventSummaryResponse["next"];
}): EventSummaryResponse {
  const { event } = input;
  const ended = input.now.getTime() >= Date.parse(event.endsAt || event.startsAt);
  return {
    attendeeInitials: input.attendeeNames.slice(0, SUMMARY_INITIALS_MAX).map(initial).filter(Boolean),
    capacity: event.capacity,
    coverUrl: event.coverUrl ?? null,
    description: plainDescription(event.description),
    emoji: event.emoji,
    ended,
    endsAt: event.endsAt,
    eventId: event.eventId,
    ...(input.met !== undefined ? { met: input.met } : {}),
    ...(input.next !== undefined ? { next: input.next } : {}),
    organizer: input.organizer,
    priceYen: event.priceYen,
    registrationClosesAt: event.registrationClosesAt,
    registrationCount: event.registrationCount,
    remaining: event.capacity ? Math.max(0, event.capacity - event.registrationCount) : null,
    startsAt: event.startsAt,
    status: input.status,
    title: event.title,
    venue: event.venue,
    waitlistEnabled: Boolean(event.waitlistEnabled),
  };
}
