/**
 * R27 会場モード 只读视图的纯映射（DESIGN §2.6）。Owner: 甲 (R27).
 * 输入是运营接口的参加者侧公开投影（`toAttendeeOperationsResponse` 同一形状，主办方已发布的分组 / 推荐，只读）+
 * 我的联系人（只用我自己的，§9 #17）+ 议程。时间相关的状态（当前轮次、残り分、是否结束）全部用服务端的 `now` 算好。
 * 未报名：`state = not_registered`，什么都不读（页面也就不会去打运营接口 → 没有 403）。
 */
import type { EventVenuePerson, EventVenueResponse } from "../../../shared/contract/event-venue";

export interface VenueParticipant {
  participantId: string;
  displayName: string;
  company: string | null;
  role: string | null;
  experienceHighlight: string | null;
  needs: readonly string[];
  offers: readonly string[];
  topics: readonly string[];
}

export interface VenueTable {
  tableNumber: number;
  theme: string;
  rationale: string;
  icebreakers: readonly string[];
  memberRationales: Readonly<Record<string, string>>;
  members: readonly { participantId: string; seat: string }[];
}

export interface VenueWorkspace {
  checkIn: { checkedInAt: string; participantId: string } | null;
  checkInAvailable: boolean;
  configuration: { eventStartsAt: string; eventEndsAt: string; roundOneStartsAt: string | null; roundTwoStartsAt: string | null };
  contactRequests: readonly { contactId: string | null; requestId: string; revision: number; requesterParticipantId: string; status: "awaiting_target_consent" | "accepted" | string; targetParticipantId: string; withdrawnAt: string | null; createdAt?: string | null }[];
  directory: readonly VenueParticipant[];
  me: VenueParticipant;
  recommendations: { recommendations: readonly { targetParticipantId: string; reasons: readonly string[]; icebreakers: readonly string[]; score: number }[] } | null;
  roundOneTable: VenueTable | null;
  roundTwoTable: VenueTable | null;
  /** All published tables per round (for 「ほかのテーブル」); optional. */
  rounds?: { one: readonly VenueTable[]; two: readonly VenueTable[] } | null;
}

export interface VenueInput {
  registered: boolean;
  event: { eventId: string; title: string; startsAt: string; endsAt?: string | null };
  now: Date;
  workspace: VenueWorkspace | null;
  myContacts: readonly { id: string; name: string }[];
  /** Participant ids matching my plan person types (会いたい人). */
  wantedParticipantIds: ReadonlySet<string>;
  agenda: readonly { at: string; title: string; detail?: string | null }[];
  meetingSlots?: readonly string[];
}

const ROUND_MINUTES = 30;
const letter = (n: number) => String.fromCharCode(64 + Math.max(1, Math.min(26, n)));
const tableLabel = (table: VenueTable, seat?: string) => `${letter(table.tableNumber)}${seat ? `-${seat}` : ""}`;
const normalize = (value: string) => value.normalize("NFKC").replace(/\s+/g, "");

function otherTables(round: readonly VenueTable[] | undefined, mine: VenueTable, others: readonly VenueParticipant[]) {
  return (round ?? []).filter((table) => table.tableNumber !== mine.tableNumber).map((table) => ({
    count: table.members.length,
    initials: table.members.slice(0, 3).flatMap((member) => {
      const found = others.find((participant) => participant.participantId === member.participantId);
      return found ? [found.displayName.trim().charAt(0)] : [];
    }),
    table: letter(table.tableNumber),
    theme: table.theme,
  }));
}

export function buildVenue(input: VenueInput): EventVenueResponse {
  const nowIso = input.now.toISOString();
  const base = { endsAt: input.event.endsAt ?? null, eventId: input.event.eventId, now: nowIso, startsAt: input.event.startsAt, title: input.event.title };
  const empty = { agenda: [], attendeeTotal: 0, attendees: [], nextOrder: [], openers: [], recommendations: [], stats: { exchanged: 0, incoming: 0, wantedMet: 0, wantedTotal: 0 } };
  if (!input.registered || !input.workspace) return { ...base, ...empty, state: "not_registered" };
  const ws = input.workspace;
  const now = input.now.getTime();
  const ended = now >= Date.parse(ws.configuration.eventEndsAt || input.event.endsAt || input.event.startsAt);
  if (!ws.checkIn && !ended) {
    return { ...base, ...empty, checkIn: { available: ws.checkInAvailable, displayName: ws.me.displayName, qrPayload: `orbit-checkin:${input.event.eventId}:${ws.me.participantId}`, receptionNumber: null }, state: "before_check_in" };
  }

  const meId = ws.me.participantId;
  const contactByName = new Map(input.myContacts.map((contact) => [normalize(contact.name), contact.id]));
  const requestWith = (participantId: string) => ws.contactRequests.find((request) => !request.withdrawnAt && ((request.requesterParticipantId === meId && request.targetParticipantId === participantId) || (request.targetParticipantId === meId && request.requesterParticipantId === participantId)));
  const tableOf = (participantId: string, round: VenueTable | null) => {
    if (!round) return null;
    const member = round.members.find((item) => item.participantId === participantId);
    return member ? tableLabel(round, member.seat) : null;
  };
  const roundOneStart = ws.configuration.roundOneStartsAt ? Date.parse(ws.configuration.roundOneStartsAt) : null;
  const roundTwoStart = ws.configuration.roundTwoStartsAt ? Date.parse(ws.configuration.roundTwoStartsAt) : null;
  const currentRound = roundTwoStart !== null && now >= roundTwoStart ? 2 : roundOneStart !== null && now >= roundOneStart ? 1 : 0;
  const currentTable = currentRound === 2 ? ws.roundTwoTable : currentRound === 1 ? ws.roundOneTable : ws.roundOneTable;
  const recByTarget = new Map((ws.recommendations?.recommendations ?? []).map((item) => [item.targetParticipantId, item]));

  const toPerson = (participant: VenueParticipant): EventVenuePerson => {
    const request = requestWith(participant.participantId);
    const exchange: EventVenuePerson["exchange"] = !request ? "none" : request.status === "accepted" ? "exchanged" : request.requesterParticipantId === meId ? "requested" : "incoming";
    const contactId = request?.contactId ?? contactByName.get(normalize(participant.displayName)) ?? null;
    const known = !request && contactByName.has(normalize(participant.displayName));
    const wanted = input.wantedParticipantIds.has(participant.participantId);
    const rec = recByTarget.get(participant.participantId);
    const why = participant.experienceHighlight ?? participant.offers[0] ?? null;
    return {
      attendeeId: participant.participantId,
      contactId,
      exchange,
      initial: participant.displayName.trim().charAt(0),
      name: participant.displayName,
      org: participant.company,
      participantId: participant.participantId,
      relation: exchange === "exchanged" ? "exchanged" : known ? "known" : wanted ? "wanted" : "other",
      role: participant.role,
      table: tableOf(participant.participantId, currentTable === ws.roundTwoTable ? ws.roundTwoTable : ws.roundOneTable),
      wanted,
      why,
      whyDetail: rec?.reasons.join(" ") || null,
      ...(request && exchange !== "exchanged" ? { requestId: request.requestId, requestRevision: request.revision, requestedAt: request.createdAt ?? null } : {}),
    };
  };
  const others = ws.directory.filter((participant) => participant.participantId !== meId);
  const people = others.map(toPerson);
  const stateOrder: Record<EventVenuePerson["exchange"], number> = { exchanged: 1, incoming: 3, none: 0, requested: 2 };
  const attendees = [...people].sort((a, b) => stateOrder[b.exchange] - stateOrder[a.exchange] || Number(b.wanted) - Number(a.wanted) || a.name.localeCompare(b.name, "ja"));
  const recommendations = (ws.recommendations?.recommendations ?? [])
    .map((item) => people.find((person) => person.participantId === item.targetParticipantId))
    .filter((person): person is EventVenuePerson => Boolean(person) && person!.exchange !== "exchanged");
  const nextOrder = [...recommendations].sort((a, b) => Number(b.exchange === "incoming") - Number(a.exchange === "incoming")).slice(0, 4);

  const mateOf = (table: VenueTable | null) => (table?.members ?? []).filter((member) => member.participantId !== meId).flatMap((member) => {
    const found = others.find((participant) => participant.participantId === member.participantId);
    return found ? [{ attendeeId: found.participantId, initial: found.displayName.trim().charAt(0), name: found.displayName, org: found.company, role: found.role }] : [];
  });
  const myCurrent = currentTable ? tableOf(meId, currentTable) : null;
  const roundEnd = currentRound === 1 && roundTwoStart !== null ? roundTwoStart : (currentRound > 0 ? (currentRound === 2 ? roundTwoStart! : roundOneStart!) + ROUND_MINUTES * 60_000 : null);
  const roundStart = currentRound === 2 ? roundTwoStart : roundOneStart;
  const nextTable = currentRound === 1 ? ws.roundTwoTable : null;
  const nextMates = mateOf(nextTable).slice(0, 2);
  const wantedTotal = input.wantedParticipantIds.size;
  const wantedMet = people.filter((person) => person.wanted && person.exchange === "exchanged").length;
  const openers = (currentTable?.icebreakers ?? []).slice(0, 3);
  const familyOf = (name: string) => name.split(" ")[0] ?? name;

  return {
    ...base,
    agenda: input.agenda.map((item) => ({ ...item })),
    attendeeTotal: people.length,
    attendees,
    checkIn: { available: false, displayName: ws.me.displayName, receptionNumber: null },
    groups: currentTable ? { myTheme: currentTable.theme, others: otherTables(currentRound === 2 ? ws.rounds?.two : ws.rounds?.one, currentTable, others), round: Math.max(1, currentRound) } : null,
    meetingSlots: input.meetingSlots ? [...input.meetingSlots] : [],
    // 共通の知り合い：只能用「我的联系人里同时认识两人」的记录（§9 #17）；现有数据里没有这条关系 → 隐藏那一行（G18）。
    mutualHint: null,
    me: { initial: ws.me.displayName.trim().charAt(0), name: ws.me.displayName, org: ws.me.company, role: ws.me.role },
    mySeat: currentTable && myCurrent ? { table: myCurrent, tablemates: mateOf(currentTable), why: currentTable.rationale || null, whyDetail: currentTable.memberRationales[meId] ?? null } : null,
    nextOrder,
    nextRound: nextTable && roundTwoStart !== null ? { at: new Date(roundTwoStart).toISOString(), names: nextMates.map((mate) => `${familyOf(mate.name)}さん（${mate.org ?? ""}）`).join("· "), round: 2, table: tableOf(meId, nextTable) ?? letter(nextTable.tableNumber) } : null,
    openers,
    recommendations,
    round: currentRound > 0 && roundStart !== null && roundEnd !== null ? { endsAt: new Date(roundEnd).toISOString(), index: currentRound, remainingMinutes: Math.max(0, Math.ceil((roundEnd - now) / 60_000)), startsAt: new Date(roundStart).toISOString(), theme: currentTable?.theme ?? null, title: "テーブルトーク", total: ws.roundTwoTable ? 2 : 1 } : null,
    seats: [ws.roundOneTable ? { round: 1, table: tableOf(meId, ws.roundOneTable) ?? letter(ws.roundOneTable.tableNumber) } : null, ws.roundTwoTable ? { round: 2, table: tableOf(meId, ws.roundTwoTable) ?? letter(ws.roundTwoTable.tableNumber) } : null].filter((item): item is { round: number; table: string } => Boolean(item)),
    state: ended ? "ended" : "checked_in",
    stats: { exchanged: people.filter((person) => person.exchange === "exchanged").length, incoming: people.filter((person) => person.exchange === "incoming").length, wantedMet, wantedTotal },
  };
}
