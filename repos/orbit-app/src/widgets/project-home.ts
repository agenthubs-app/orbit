import type { ContactCardDTO, ContactCardSummaryDTO } from "../api/contract/contact-card-page";
import type { MyEventsResponse } from "../api/contract/events-mine";
import type { PlanV2SummaryResponse } from "../api/contract/plan-v2";
import type { TodoPageContract } from "../api/contract/todo-page";
import { homeAppTargetHref } from "../screens/home/home-target";
import { nextRegisteredEvent } from "../screens/home/home-widget-model";
import type { WidgetCards } from "./snapshot";

type SecretaryItem = {
  kind: string;
  notification: {
    actorId: string; title: string; reason?: string; sample?: true;
    target: { status: string; href: string | null };
    sources: readonly { sourceKind: string }[];
  };
};

export type HomeWidgetSources = {
  actorId: string; now: Date;
  todo?: TodoPageContract | undefined;
  schedule?: { scheduleItems: readonly unknown[] } | undefined;
  networkSummary?: Pick<ContactCardSummaryDTO, "total" | "addedThisMonth"> | undefined;
  networkPage?: { items: readonly Pick<ContactCardDTO, "id" | "displayName">[] } | undefined;
  secretary?: { actorId: string; hasMore?: boolean; items: readonly SecretaryItem[] } | undefined;
  plan?: PlanV2SummaryResponse | undefined;
  events?: MyEventsResponse | undefined;
};

const text = (value: string): string => value.trim().slice(0, 160);
const legalSecretaryKinds = new Set(["event_deadline", "event_prep", "event_pick"]);
const unavailable = { status: "unavailable" } as const;
const empty = { status: "empty" } as const;

/** Projection only: ordering, plan score and registered-event selection stay in the R10 sources. */
export function projectHomeWidgetCards(input: HomeWidgetSources): WidgetCards {
  const { todo, schedule, networkSummary, networkPage, secretary, plan, events } = input;
  const scheduleRows = schedule?.scheduleItems.flatMap(raw => {
    if (!raw || typeof raw !== "object") return [];
    const row = raw as { title?: unknown; startsAt?: unknown; state?: unknown };
    return typeof row.title === "string" && typeof row.startsAt === "string" &&
      (row.state === "upcoming" || row.state === "ongoing") && Number.isFinite(Date.parse(row.startsAt))
      ? [{ title: row.title, startsAt: row.startsAt }] : [];
  }).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const today = !todo || !scheduleRows || todo.countsCapped.decisions || todo.countsCapped.nextMoves ||
    Object.values(todo.sources).some(source => source === "unavailable" || source === "not_implemented") ? unavailable : (() => {
      const rows = [
        ...todo.nextMoves.items.map(item => ({ title: text(item.titlePreview), href: "/task?seg=todo" })),
        ...todo.decisions.items.map(item => ({ title: text(item.titlePreview), href: "/task?seg=todo" })),
        ...scheduleRows.map(item => ({ title: text(item.title), href: "/task?seg=calendar" })),
      ].filter(item => item.title).slice(0, 3);
      const count = todo.counts.nextMoves + todo.counts.decisions + scheduleRows.length;
      return count === 0 ? empty : { status: "ready" as const, display: { count, rows } };
    })();

  const network = !networkSummary || !networkPage ? unavailable : networkSummary.total === 0 ? empty : {
    status: "ready" as const,
    display: { total: networkSummary.total,
      ...(networkSummary.addedThisMonth !== undefined ? { addedThisMonth: networkSummary.addedThisMonth } : {}),
      people: networkPage.items.slice(0, 3).map(person => ({ id: text(person.id), name: text(person.displayName) }))
        .filter(person => person.id && person.name),
    },
  };

  const secretaryCard = !secretary || secretary.actorId !== input.actorId ||
    secretary.items.some(item => item.notification.actorId !== input.actorId) ? unavailable : (() => {
      const items = secretary.items.flatMap(item => {
        const href = homeAppTargetHref(item.notification.target.href);
        return legalSecretaryKinds.has(item.kind) && item.notification.sources.some(source => source.sourceKind === item.kind) &&
          !item.notification.sample && item.notification.target.status === "available" && href && text(item.notification.title)
          ? [{ title: text(item.notification.title),
            ...(item.notification.reason && text(item.notification.reason) ? { reason: text(item.notification.reason) } : {}),
            kind: item.kind as "event_deadline" | "event_prep" | "event_pick", href }] : [];
      });
      return items.length ? { status: "ready" as const, display: {
        count: items.length, hasMore: secretary.hasMore === true, items: items.slice(0, 2),
      } } : empty;
    })();

  const current = plan?.current;
  const planCard = !plan ? unavailable : !current ? empty : {
    status: "ready" as const,
    display: { goal: text(current.goal), total: current.score.total, talked: current.score.talked,
      skipped: current.score.skipped, todayDelta: current.score.todayDelta,
      segments: current.score.segments.slice(0, 12).map(segment => ({ key: text(segment.key), label: text(segment.shortLabel),
        allocation: segment.allocation, earned: segment.earned, overflow: segment.overflow, skipped: segment.skipped })),
      ...(current.todayChance && homeAppTargetHref(current.todayChance.href) ? { chance: {
        label: text(current.todayChance.label), points: current.todayChance.points,
        href: homeAppTargetHref(current.todayChance.href)!,
      } } : {}),
    },
  };

  const next = events ? nextRegisteredEvent(events.items, events.asOf ? new Date(events.asOf) : input.now) : null;
  const nextHref = next ? homeAppTargetHref(next.href) : null;
  const event = !events ? unavailable : !next ? empty : !nextHref ? unavailable : {
    status: "ready" as const,
    display: { title: text(next.title), startsAt: next.startsAt, href: nextHref,
      ...(next.venue ? { venue: text(next.venue) } : {}),
      ...(next.meetCount != null ? { meetCount: next.meetCount } : {}),
    },
  };

  return { today, network, secretary: secretaryCard, plan: planCard, event };
}
