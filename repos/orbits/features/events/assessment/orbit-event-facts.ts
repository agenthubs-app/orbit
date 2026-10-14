/**
 * R26 库内活动的规则事实（events DESIGN §3.5 映射表「库内活动」列、§6.2-1）。Owner: 甲 (R26).
 * Used by: 评估服务（`orbit_event`）、计划 live 事实（`plans/v2/event-facts.ts`）——两处同一份事实，分数一致。
 *
 * - 活动级事实（标题、日时、会场、费用、议程、报名者构成）：进程内缓存（最长 6 小时；报名人数变了就作废）。
 * - 人级事实（一度人脉、人物类型匹配）：每次现算，不缓存。
 * - 报名者构成只读 roster 的公开字段（显示名、职位 / 立场、行业），不读别人的人脉（§9 #14 / #17）。
 */
import { typeAttendees } from "../../../shared/compute/event-attendee-typing";
import { connectionCounts } from "../../../shared/compute/event-facts-derive";
import { eventEmoji } from "../../../shared/compute/event-emoji";
import { parsePriceYen } from "../../../shared/compute/event-score-input";
import type { EventAssessmentAgendaItem, EventAssessmentFacts } from "../../../shared/contract/event-assessment";
import type { JudgeContext, OrbitEventExtras } from "./judge";

export interface OrbitEventBase {
  eventId: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  venue: string | null;
  description: string | null;
  sourcePayload: Readonly<Record<string, unknown>>;
}

export interface OrbitEventRegistrant {
  name: string | null;
  role: string | null;
  org: string | null;
}

export interface OrbitEventReaders {
  event(eventId: string): Promise<OrbitEventBase | null>;
  registrants(eventId: string): Promise<OrbitEventRegistrant[]>;
}

export interface OrbitEventFactsResult {
  facts: EventAssessmentFacts;
  extras: OrbitEventExtras;
  attendeeSignature: string | null;
  emoji: string;
}

export const ORBIT_EVENT_FACTS_TTL_MS = 6 * 3_600_000;

const asString = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);

/** sourcePayload 里常见的费用 / 议程写法（主办方建活动或日历导入时写入）。 */
export function payloadFacts(payload: Readonly<Record<string, unknown>>): { price: string | null; feeYen: number | null; agenda: EventAssessmentAgendaItem[]; area: string | null; emoji: string | null; matching: boolean | null; nameTags: boolean | null } {
  const rawFee = payload.feeYen ?? payload.fee ?? payload.price ?? payload.ticketPrice ?? payload.participationFee;
  const feeYen = typeof rawFee === "number" && Number.isFinite(rawFee) ? Math.max(0, Math.round(rawFee)) : parsePriceYen(asString(rawFee));
  const price = feeYen === null ? null : feeYen === 0 ? "無料" : `¥${feeYen.toLocaleString("en-US")}`;
  const agendaRaw = Array.isArray(payload.agenda) ? payload.agenda : Array.isArray(payload.timetable) ? payload.timetable : [];
  const agenda = agendaRaw.flatMap((item): EventAssessmentAgendaItem[] => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const at = asString(record.at ?? record.time ?? record.startsAt ?? record.start);
    const title = asString(record.title ?? record.name ?? record.label);
    const minutes = typeof record.minutes === "number" ? record.minutes : typeof record.durationMinutes === "number" ? record.durationMinutes : undefined;
    return at && title ? [{ at: at.slice(0, 40), title: title.slice(0, 200), ...(minutes !== undefined ? { minutes } : {}) }] : [];
  }).slice(0, 40);
  return {
    agenda,
    area: asString(payload.area ?? payload.prefecture ?? payload.address),
    emoji: asString(payload.emoji),
    feeYen,
    matching: typeof payload.matchingEnabled === "boolean" ? payload.matchingEnabled : null,
    nameTags: typeof payload.nameTags === "boolean" ? payload.nameTags : null,
    price,
  };
}

export function createOrbitEventFactsReader(readers: OrbitEventReaders, options: { now?: () => number } = {}) {
  const now = options.now ?? Date.now;
  const cache = new Map<string, { at: number; base: OrbitEventBase; registrants: OrbitEventRegistrant[] }>();

  async function load(eventId: string) {
    const cached = cache.get(eventId);
    if (cached && now() - cached.at < ORBIT_EVENT_FACTS_TTL_MS) {
      // 报名人数变了就作废（只读人数这一项很便宜：roster 读一次，和缓存比条数）。
      const fresh = await readers.registrants(eventId);
      if (fresh.length === cached.registrants.length) return cached;
      const entry = { ...cached, at: now(), registrants: fresh };
      cache.set(eventId, entry);
      return entry;
    }
    const base = await readers.event(eventId);
    if (!base) { cache.delete(eventId); return null; }
    const entry = { at: now(), base, registrants: await readers.registrants(eventId) };
    if (cache.size > 500) cache.delete(cache.keys().next().value!);
    cache.set(eventId, entry);
    return entry;
  }

  return {
    clear: () => cache.clear(),
    async facts(_actorId: string, eventId: string, context: JudgeContext): Promise<OrbitEventFactsResult | null> {
      const loaded = await load(eventId);
      if (!loaded) return null;
      const { base, registrants } = loaded;
      const payload = payloadFacts(base.sourcePayload);
      const facts: EventAssessmentFacts = {
        startsAt: base.startsAt,
        title: base.title,
        ...(base.endsAt ? { endsAt: base.endsAt } : {}),
        ...(base.venue ? { venue: base.venue } : {}),
        ...(payload.area ? { area: payload.area } : {}),
        ...(payload.price ? { price: payload.price } : {}),
        ...(payload.agenda.length ? { agenda: payload.agenda } : {}),
        ...(registrants.length ? { expectedAttendees: registrants.length } : {}),
      };
      const typing = typeAttendees({
        registrants: registrants.map((person) => ({ name: person.name, org: person.org, role: person.role })),
        text: [base.title, base.description, ...payload.agenda.map((item) => item.title)].filter(Boolean).join(" "),
        types: context.types.map((type) => ({ key: type.key, roleSituation: type.roleSituation ?? null, shortLabel: type.shortLabel })),
      });
      const names = registrants.map((person) => person.name).filter((name): name is string => Boolean(name));
      const connections = registrants.length ? connectionCounts({ myContacts: context.contacts, speakerNames: names }) : { firstDegree: null, known: [], secondDegree: null };
      return {
        attendeeSignature: `${registrants.length}`,
        emoji: eventEmoji({ emoji: payload.emoji, title: base.title }),
        extras: {
          attendeeSource: typing.attendeeSource,
          expected: typing.expected,
          feeYen: payload.feeYen,
          firstDegree: connections.firstDegree,
          known: connections.known,
          matchingEnabled: payload.matching,
          nameTags: payload.nameTags,
          registrantCount: registrants.length || null,
          secondDegree: null,
        },
        facts,
      };
    },
  };
}
