/**
 * R27 会場モード 只读视图的纯映射（DESIGN §2.6）。Owner: 甲 (R27).
 * 输入是运营接口的参加者侧公开投影（`toAttendeeOperationsResponse` 同一形状，主办方已发布的分组 / 推荐，只读）+
 * 我的联系人（只用我自己的，§9 #17）+ 议程。时间相关的状态（当前轮次、残り分、是否结束）全部用服务端的 `now` 算好。
 * 未报名：`state = not_registered`，什么都不读（页面也就不会去打运营接口 → 没有 403）。
 */
import type { EventVenuePerson, EventVenueResponse, EventVenueRound } from "../../../shared/contract/event-venue";

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
  /** R17（host/DESIGN.md §2.6）：受付 QR v2（服务端签名）与受付番号；没有就不显示（旧明文 QR 已停用）。 */
  checkInPass?: { qrPayload: string | null; receptionNumber: string | null } | null;
}

const ROUND_MINUTES = 30;
const letter = (n: number) => String.fromCharCode(64 + Math.max(1, Math.min(26, n)));
/** A seat as people read it: the seat number only (「R1-T2-S6」 from a model or an older late-joiner record reads 「6」). */
const seatNumber = (seat: string) => /S?(\d+)$/u.exec(seat.trim())?.[1] ?? seat.trim();
const tableLabel = (table: VenueTable, seat?: string) => `${letter(table.tableNumber)}${seat ? `-${seatNumber(seat)}` : ""}`;
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

/** 我与某位参加者的交换关系（会場 / 会場の記録 / 参加者の詳細 共用同一规则）。 */
export interface VenueExchangeRelation {
  exchange: EventVenuePerson["exchange"];
  contactId: string | null;
  /** 不经交换、名字已在我的联系人里。 */
  known: boolean;
  /** `requested` / `incoming` 时给运营接口用的请求 id / 版本。 */
  request: { requestId: string; requestRevision: number; requestedAt: string | null } | null;
}

export function venueExchangeRelation(ws: Pick<VenueWorkspace, "me" | "contactRequests">, participant: Pick<VenueParticipant, "participantId" | "displayName">, myContacts: readonly { id: string; name: string }[]): VenueExchangeRelation {
  const meId = ws.me.participantId;
  const request = ws.contactRequests.find((item) => !item.withdrawnAt && ((item.requesterParticipantId === meId && item.targetParticipantId === participant.participantId) || (item.targetParticipantId === meId && item.requesterParticipantId === participant.participantId)));
  const byName = myContacts.find((contact) => normalize(contact.name) === normalize(participant.displayName))?.id ?? null;
  const exchange: EventVenuePerson["exchange"] = !request ? "none" : request.status === "accepted" ? "exchanged" : request.requesterParticipantId === meId ? "requested" : "incoming";
  return {
    contactId: request?.contactId ?? byName,
    exchange,
    known: !request && byName !== null,
    request: request && exchange !== "exchanged" ? { requestId: request.requestId, requestRevision: request.revision, requestedAt: request.createdAt ?? null } : null,
  };
}

/** 我坐过的每一轮（R1 / R2）：桌号、主题、理由、同桌。只给我实际被分到的轮次。 */
export function venueRounds(ws: Pick<VenueWorkspace, "me" | "directory" | "roundOneTable" | "roundTwoTable" | "configuration">, agenda: readonly { at: string; title: string }[] = []): EventVenueRound[] {
  const meId = ws.me.participantId;
  const rounds: Array<[number, VenueTable | null, string | null]> = [[1, ws.roundOneTable, ws.configuration.roundOneStartsAt], [2, ws.roundTwoTable, ws.configuration.roundTwoStartsAt]];
  return rounds.flatMap(([round, table, startsAt]) => {
    const member = table?.members.find((item) => item.participantId === meId);
    if (!table || !member) return [];
    return [{
      round,
      table: tableLabel(table, member.seat),
      tablemates: tablematesOf(ws, table),
      theme: table.theme || null,
      title: roundTitle(startsAt, agenda),
      why: table.rationale || null,
      whyDetail: table.memberRationales[meId] ?? null,
    }];
  });
}

/** 会場の記録「ほかのテーブル」：每一轮里我不在的桌，带成员（不含我）。没有全桌数据的轮次不给。 */
export function venueRoundTables(ws: Pick<VenueWorkspace, "me" | "directory" | "rounds">): { round: number; tables: { table: string; theme: string | null; members: EventVenueRound["tablemates"][number][] }[] }[] {
  const meId = ws.me.participantId;
  return ([[1, ws.rounds?.one], [2, ws.rounds?.two]] as const).flatMap(([round, tables]) => {
    const others = (tables ?? []).filter((table) => !table.members.some((member) => member.participantId === meId));
    if (!others.length) return [];
    return [{ round, tables: others.map((table) => ({ members: [...tablematesOf(ws, table)], table: letter(table.tableNumber), theme: table.theme || null })) }];
  });
}

/** 和某位参加者同桌过的轮次。 */
export function venueSharedRounds(ws: Pick<VenueWorkspace, "me" | "roundOneTable" | "roundTwoTable">, participantId: string): { round: number; table: string }[] {
  const meId = ws.me.participantId;
  return ([[1, ws.roundOneTable], [2, ws.roundTwoTable]] as const).flatMap(([round, table]) => {
    const mine = table?.members.find((item) => item.participantId === meId);
    return table && mine && participantId !== meId && table.members.some((item) => item.participantId === participantId) ? [{ round, table: tableLabel(table, mine.seat) }] : [];
  });
}

function tablematesOf(ws: Pick<VenueWorkspace, "me" | "directory">, table: VenueTable | null): EventVenueRound["tablemates"] {
  return (table?.members ?? []).filter((member) => member.participantId !== ws.me.participantId).flatMap((member) => {
    const found = ws.directory.find((participant) => participant.participantId === member.participantId);
    return found ? [{ attendeeId: found.participantId, initial: found.displayName.trim().charAt(0), name: found.displayName, org: found.company, role: found.role }] : [];
  });
}

/** 轮次标题：议程里开始时刻（东京 HH:MM）与该轮开始一致的那一行；推不出 → null。 */
function roundTitle(startsAt: string | null, agenda: readonly { at: string; title: string }[]): string | null {
  const time = startsAt ? Date.parse(startsAt) : Number.NaN;
  if (!Number.isFinite(time)) return null;
  const hhmm = new Date(time + 9 * 3_600_000).toISOString().slice(11, 16);
  const hit = agenda.find((item) => item.at.trim() === hhmm || item.at.trim() === startsAt || (Number.isFinite(Date.parse(item.at)) && Date.parse(item.at) === time));
  return hit?.title.trim() || null;
}

/**
 * 详情页「会場の記録」入口的数字（只在已结束 + 我是报名者 + 有工作区时由服务层调用）。
 * tablemates = 各轮同桌去重人数（不含我）；recommended = 推荐给我的人数；exchanged = 与我相关、已成立的交换数。
 * 我不在任何一桌、也没有推荐 → null（没有可回看的内容，不出入口）。
 */
export function venueRecordFrom(ws: Pick<VenueWorkspace, "me" | "checkIn" | "contactRequests" | "recommendations" | "roundOneTable" | "roundTwoTable">): { tablemates: number; recommended: number; exchanged: number; checkedIn: boolean } | null {
  const meId = ws.me.participantId;
  const seated = [ws.roundOneTable, ws.roundTwoTable].filter((table): table is VenueTable => Boolean(table?.members.some((member) => member.participantId === meId)));
  const recommended = new Set((ws.recommendations?.recommendations ?? []).map((item) => item.targetParticipantId).filter((id) => id !== meId));
  if (!seated.length && !recommended.size) return null;
  const mates = new Set(seated.flatMap((table) => table.members.map((member) => member.participantId)).filter((id) => id !== meId));
  const exchanged = new Set(ws.contactRequests.filter((request) => request.status === "accepted" && !request.withdrawnAt && (request.requesterParticipantId === meId || request.targetParticipantId === meId)).map((request) => (request.requesterParticipantId === meId ? request.targetParticipantId : request.requesterParticipantId)));
  return { checkedIn: Boolean(ws.checkIn), exchanged: exchanged.size, recommended: recommended.size, tablemates: mates.size };
}

export function isVenueEnded(event: VenueInput["event"], now: Date, workspace: VenueInput["workspace"]): boolean {
  return now.getTime() >= Date.parse(workspace?.configuration.eventEndsAt || event.endsAt || event.startsAt);
}

export function buildVenue(input: VenueInput): EventVenueResponse {
  const nowIso = input.now.toISOString();
  const base = { endsAt: input.event.endsAt ?? null, eventId: input.event.eventId, now: nowIso, startsAt: input.event.startsAt, title: input.event.title };
  const empty = { agenda: [], attendeeTotal: 0, attendees: [], nextOrder: [], openers: [], recommendations: [], stats: { exchanged: 0, incoming: 0, wantedMet: 0, wantedTotal: 0 } };
  if (!input.registered) return { ...base, ...empty, state: "not_registered" };
  const ended = isVenueEnded(input.event, input.now, input.workspace);
  // Registered but no operations workspace: not in the published results (e.g. registered and never
  // seated — the imported 中日创业交流会 no-shows) or a failed read. They did register, so never say
  // "registered attendees only": after the event it is simply ended, before it they still check in.
  if (!input.workspace) {
    return ended
      ? { ...base, ...empty, checkedIn: false, readOnly: true, rounds: [], state: "ended" }
      : { ...base, ...empty, checkedIn: false, readOnly: false, checkIn: { available: false, displayName: "", qrPayload: input.checkInPass?.qrPayload ?? null, receptionNumber: input.checkInPass?.receptionNumber ?? null }, state: "before_check_in" };
  }
  const ws = input.workspace;
  const now = input.now.getTime();
  // 2026-11-28 (user: 「不用签到就能进入会场模式」): a registered attendee in the published results enters venue mode
  // without checking in; checkedIn below still says whether they did.

  const meId = ws.me.participantId;
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
    const { contactId, exchange, known, request } = venueExchangeRelation(ws, participant, input.myContacts);
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
      ...(request ?? {}),
    };
  };
  const others = ws.directory.filter((participant) => participant.participantId !== meId);
  const people = others.map(toPerson);
  const stateOrder: Record<EventVenuePerson["exchange"], number> = { exchanged: 1, incoming: 3, none: 0, requested: 2 };
  const attendees = [...people].sort((a, b) => stateOrder[b.exchange] - stateOrder[a.exchange] || Number(b.wanted) - Number(a.wanted) || a.name.localeCompare(b.name, "ja"));
  const recommendations = (ws.recommendations?.recommendations ?? [])
    .map((item) => people.find((person) => person.participantId === item.targetParticipantId))
    // 会場の記録（结束后只读）：推荐名单原样保留（已交换的人也在，回看「当天推荐了谁」）。
    .filter((person): person is EventVenuePerson => Boolean(person) && (ended || person!.exchange !== "exchanged"));
  const nextOrder = [...recommendations].sort((a, b) => Number(b.exchange === "incoming") - Number(a.exchange === "incoming")).slice(0, 4);

  const mateOf = (table: VenueTable | null) => tablematesOf(ws, table);
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
    checkIn: { available: false, displayName: ws.me.displayName, receptionNumber: input.checkInPass?.receptionNumber ?? null },
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
    checkedIn: Boolean(ws.checkIn),
    readOnly: ended,
    rounds: venueRounds(ws, input.agenda),
    ...(ended ? { roundTables: venueRoundTables(ws) } : {}),
    state: ended ? "ended" : "checked_in",
    stats: { exchanged: people.filter((person) => person.exchange === "exchanged").length, incoming: people.filter((person) => person.exchange === "incoming").length, wantedMet, wantedTotal },
  };
}

/**
 * 2026-11-21 `GET /venue?view=record`：结束后的会場の記録只回回看用得上的字段（实测完整返回约 86KB）。
 * 去掉实时用的（受付 QR、当前轮、座位、下一轮、开场白、分组概览、共同熟人提示、议程提示、可约时间），
 * 人只留卡片要显示的（姓名 / 公司 / 职位 / 桌 / 一句理由 / 交换状态与申请 id）；详细理由与メモ由参加者の詳細按需读。
 * 不是只读回看（活动中）时原样返回。
 */
export function venueRecordView(venue: EventVenueResponse): EventVenueResponse {
  if (!venue.readOnly) return venue;
  const person = (p: EventVenuePerson): EventVenuePerson => ({
    attendeeId: p.attendeeId, exchange: p.exchange, initial: p.initial, name: p.name, participantId: p.participantId, relation: p.relation, wanted: p.wanted,
    ...(p.org ? { org: p.org } : {}), ...(p.role ? { role: p.role } : {}), ...(p.table ? { table: p.table } : {}), ...(p.why ? { why: p.why } : {}),
    ...(p.requestId ? { requestId: p.requestId, requestRevision: p.requestRevision ?? null } : {}),
    ...(p.contactId ? { contactId: p.contactId } : {}),
  });
  const { checkIn: _checkIn, round: _round, seats: _seats, mySeat: _mySeat, nextRound: _nextRound, groups: _groups, mutualHint: _mutualHint, agendaTip: _agendaTip, meetingSlots: _meetingSlots, ...rest } = venue;
  return { ...rest, attendees: venue.attendees.map(person), nextOrder: venue.nextOrder.map(person), openers: [], recommendations: venue.recommendations.map(person) };
}
