"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { z } from "zod";

import { contactCardPageSchema, contactCardSummarySchema } from "../../../../../shared/api-schema/contact-card-page";
import { myEventsResponseSchema } from "../../../../../shared/api-schema/events-mine";
import { planV2SummaryResponseSchema } from "../../../../../shared/api-schema/plan-v2";
import { secretaryPreviewSchema } from "../../../../../shared/api-schema/secretary-preview";
import { todoPageSchema } from "../../../../../shared/api-schema/todo-page";
import type { SecretaryPreviewDTO } from "../../../../../shared/contract/secretary-preview";
import type { HomeWidgetKey } from "../../../../../shared/contract/home-layout";
import type { TodoPageContract } from "../../../../../shared/contract/todo-page";
import { useOrbitLanguage } from "../../orbit-language-context";
import { pickCopy } from "../copy/types";
import { Avatar, Button, Chip, Icon, MacTile, type ChipTone } from "../ui";
import type { AvatarTone } from "../ui/Basics";
import { homeCopy } from "./home-copy";
import { homeContactCopyKeys, homeTodoPagePath, homeWeekWindow, selectNextRegisteredEvent, signedTodayDelta } from "./home-model";
import { visibleSecretaryItems } from "./secretary-model";
import { useHomeResource, type HomeResource } from "./use-home-resource";
import { useSavedPlanGoal } from "../plan/saved-goal";
import styles from "./home.module.css";

// web.html ホーム boards (#0 empty / #1 few / #2 many): every card is kit `.card.hw` —
// a `.hw-h` head (emo.sm + lbl + count chip + chevron), `.hw-row` / `.hw-sec` rows and a
// `.hw-foot` pushed to the bottom. The classes below are those, one for one.

const guideSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("hidden"), reason: z.enum(["completed", "grandfathered"]) }),
  z.object({ kind: z.literal("unavailable") }),
  z.object({ kind: z.literal("progress"), completed: z.number().int().min(0).max(3), confirmedContacts: z.number().int().nonnegative(),
    nextStep: z.enum(["contacts", "goal", "plan"]).nullable(), steps: z.object({ contacts: z.boolean(), goal: z.boolean(), plan: z.boolean() }) }),
]);
const scheduleRowSchema = z.object({ id: z.string(), title: z.string(), startsAt: z.string(), state: z.enum(["upcoming", "ongoing", "ended", "cancelled"]) });
const scheduleSchema = z.object({ scheduleItems: z.array(z.unknown()) });

type LabelKey = keyof typeof homeCopy;
type GuideProgress = { completed: number; confirmedContacts?: number; nextStep?: "contacts" | "goal" | "plan" | null; steps: { contacts: boolean; goal: boolean; plan: boolean } };
function useT() {
  const { language } = useOrbitLanguage();
  return (key: LabelKey, values: Record<string, string | number> = {}) =>
    Object.entries(values).reduce((text, [name, value]) => text.replace(`{${name}}`, String(value)), pickCopy(homeCopy[key], language));
}

/** The head every card shares; `controls` replaces the chevron in Edit. */
export const HOME_HEAD: Record<HomeWidgetKey, { emoji: string; tone: AvatarTone; title: LabelKey; href: string }> = {
  today: { emoji: "✅", tone: "teal", title: "today", href: "/app/tasks?tab=todo" },
  planScore: { emoji: "💰", tone: "pink", title: "planScore", href: "/app/tasks?tab=plan" },
  nextEvent: { emoji: "🎟️", tone: "apricot", title: "nextEvent", href: "/app/events" },
  network: { emoji: "👥", tone: "blue", title: "network", href: "/app/contacts" },
  secretary: { emoji: "🗂️", tone: "lav", title: "secretary", href: "/app/inbox" },
  pending: { emoji: "⚖️", tone: "pink", title: "pending", href: "/app/tasks?tab=todo" },
  week: { emoji: "🗓️", tone: "blue", title: "week", href: "/app/tasks?tab=calendar" },
  deadline: { emoji: "🗓️", tone: "blue", title: "week", href: "/app/tasks?tab=calendar" },
  eventPick: { emoji: "✨", tone: "lav", title: "eventPick", href: "/app/events" },
  memo: { emoji: "📝", tone: "teal", title: "memo", href: "/app/tasks?tab=memo" },
};

function Head({ widget, count, emoji, controls }: { widget: HomeWidgetKey; count?: number; emoji?: string; controls?: ReactNode }) {
  const t = useT();
  const head = HOME_HEAD[widget];
  return <header className={styles.head}>
    <MacTile emoji={emoji ?? head.emoji} tone={head.tone} size="sm" />
    <h2 className={styles.lbl}>{t(head.title)}</h2>
    {count ? <span className={styles.count}><Chip label={String(count)} /></span> : null}
    {controls ?? <Link className={styles.go} href={head.href} aria-label={t(head.title)}><Icon name="right" size={16} /></Link>}
  </header>;
}

function Foot({ href, label }: { href: string; label: string }) {
  return <Link className={styles.foot} href={href}>{label}<Icon name="right" size={16} /></Link>;
}

function Failure({ retry }: { retry: () => void }) {
  const t = useT();
  return <div className={styles.failure}><span>{t("unavailable")}</span><Button label={t("retry")} variant="ghost" size="sm" onClick={retry} /></div>;
}

function State<T>({ resource, children }: { resource: HomeResource<T> & { retry: () => void }; children: (data: T) => ReactNode }) {
  if (resource.kind === "loading") return <p className={styles.empty} role="status">…</p>;
  if (resource.kind === "error") return <Failure retry={resource.retry} />;
  return <>{children(resource.data)}</>;
}

function Row({ href, check, time, title, sub, chip }: { href: string; check?: boolean; time?: string; title: string; sub?: string; chip?: { label: string; tone: ChipTone } }) {
  return <Link className={styles.row} href={href}>
    {time ? <time>{time}</time> : <span className={styles.ck} data-done={check ? "true" : undefined} />}
    <span className={styles.hmt}><b>{title}</b>{sub ? <span>{sub}</span> : null}</span>
    {chip ? <Chip label={chip.label} tone={chip.tone} /> : null}
  </Link>;
}

function GuideRows({ progress }: { progress: GuideProgress }) {
  const t = useT();
  const steps = [
    { key: "contacts", href: "/app/contacts", title: t(homeContactCopyKeys(progress).contacts) },
    { key: "goal", href: "/app/tasks?tab=plan", title: t("guideGoal") },
    { key: "plan", href: "/app/tasks?tab=plan", title: t("guidePlan") },
  ] as const;
  return <>
    <div className={styles.empty}>{t("guide")}</div>
    {steps.map((step, index) => <Row key={step.key} href={step.href} check={progress.steps[step.key]} title={`${index + 1}. ${step.title}`}
      chip={step.key === "contacts" && !progress.steps.contacts ? { label: `${Math.min(progress.confirmedContacts ?? 0, 3)} / 3`, tone: "lav" } : undefined} />)}
  </>;
}

function clock(iso: string): string {
  return new Intl.DateTimeFormat("ja-JP", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}
function sameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

type TodoRow = { key: string; href: string; title: string; sub?: string; time?: string; chip?: { label: string; tone: ChipTone } };
/** 今日やること rows: next moves, overdue follow-ups and decisions (the daily question as 「1問」), then today's first schedule row. */
export function homeTodoRows(data: TodoPageContract, today: readonly { id: string; title: string; startsAt: string }[], labels: { move: string; overdue: string; question: string; questionSub: string }): { rows: TodoRow[]; total: number } {
  const todo = "/app/tasks?tab=todo";
  const tasks: TodoRow[] = [
    ...data.nextMoves.items.map((item) => ({ key: item.key, href: item.taskId ? `${todo}&task=${encodeURIComponent(item.taskId)}` : todo, title: item.titlePreview, sub: item.reasonPreview, chip: { label: labels.move, tone: "lav" as const } })),
    ...data.followups.items.filter((item) => item.overdue).map((item) => ({ key: item.key, href: `${todo}&task=${encodeURIComponent(item.taskId)}`, title: item.titlePreview, sub: item.contactNamePreview, chip: { label: labels.overdue, tone: "coral" as const } })),
    ...data.decisions.items.map((item) => item.source === "completion_question"
      ? { key: item.key, href: todo, title: item.titlePreview, sub: item.reasonPreview ?? labels.questionSub, chip: { label: labels.question, tone: "neutral" as const } }
      : { key: item.key, href: todo, title: item.titlePreview, sub: item.reasonPreview }),
  ];
  const schedule = today.slice(0, 1).map((item) => ({ key: `schedule:${item.id}`, href: "/app/tasks?tab=calendar", title: item.title, time: clock(item.startsAt) }));
  const rows = [...tasks.slice(0, 3 - schedule.length), ...schedule];
  const total = data.counts.nextMoves + data.counts.decisions + data.followups.items.filter((item) => item.overdue).length + today.length;
  return { rows, total: Math.max(total, rows.length) };
}

function TodayCard({ guide, controls }: { guide: GuideProgress | null; controls?: ReactNode }) {
  const t = useT();
  const resource = useHomeResource(homeTodoPagePath(), todoPageSchema);
  const schedule = useHomeResource("/api/schedule-items", scheduleSchema);
  const now = new Date();
  const today = schedule.kind === "ready" ? schedule.data.scheduleItems.flatMap((raw) => {
    const parsed = scheduleRowSchema.safeParse(raw);
    return parsed.success && ["upcoming", "ongoing"].includes(parsed.data.state) && sameLocalDay(new Date(parsed.data.startsAt), now) ? [parsed.data] : [];
  }).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)) : [];
  const showGuide = guide !== null && guide.completed < 3;
  const view = resource.kind === "ready"
    ? homeTodoRows(resource.data, today, { move: t("todayMove"), overdue: t("overdue"), question: t("question"), questionSub: t("questionSub") }) : null;
  return <>
    <Head widget="today" count={view?.total} controls={controls} />
    {showGuide ? <GuideRows progress={guide} /> : null}
    {resource.kind === "ready" && view ? <>
      {(showGuide ? view.rows.filter((row) => row.chip?.label === t("question")) : view.rows).map(({ key, ...row }) => <Row key={key} {...row} />)}
      {!showGuide && !view.rows.length ? <p className={styles.empty}>{t("empty")}</p> : null}
      {Object.values(resource.data.sources).some((source) => source === "unavailable" || source === "not_implemented") ? <p className={styles.empty}>{t("unavailable")}</p> : null}
      {!showGuide && view.total > view.rows.length ? <Foot href="/app/tasks?tab=todo" label={t("more", { count: view.total - view.rows.length })} /> : null}
    </> : resource.kind === "error" ? <Failure retry={resource.retry} /> : null}
    {schedule.kind === "error" ? <Failure retry={schedule.retry} /> : null}
  </>;
}

function PlanCard({ controls }: { controls?: ReactNode }) {
  const t = useT();
  const resource = useHomeResource("/api/agent/plans/v2/summary", planV2SummaryResponseSchema);
  const current = resource.kind === "ready" ? resource.data.current : null;
  const savedGoal = useSavedPlanGoal(resource.kind === "ready" && !current);
  return <>
    <Head widget="planScore" emoji={resource.kind === "ready" && !current ? "🎯" : undefined} controls={controls} />
    <State resource={resource}>{(data) => data.current ? <>
      <div className={styles.figure}><strong className={styles.big}>{data.current.score.total}</strong><span className={styles.sub}>{t("outOf")}</span></div>
      <div className={`${styles.sub} ${styles.ellipsis}`}>{data.current.goal}</div>
      <div className={styles.bar} aria-hidden>{data.current.score.segments.map((segment) => <span key={segment.key} className={segment.skipped ? styles.skipped : undefined} style={{ flex: segment.allocation }}>
        {segment.skipped ? null : <b style={{ width: `${segment.allocation ? Math.min(100, (segment.earned / segment.allocation) * 100) : 0}%` }} />}</span>)}</div>
      <div className={styles.push}>{data.current.todayChance
        ? <Link href={data.current.todayChance.href} className={`${styles.chance} ${data.current.score.todayDelta < 0 ? styles.negative : ""}`}>{t("chance", { delta: signedTodayDelta(data.current.score.todayDelta) })}</Link>
        : <span className={`${styles.chance} ${data.current.score.todayDelta < 0 ? styles.negative : ""}`}>{t("chance", { delta: signedTodayDelta(data.current.score.todayDelta) })}</span>}</div>
    </> : <>
      <div className={styles.empty}>{t(savedGoal ? "planEmptyDetailGoal" : "planEmptyDetail")}</div>
      <Link className={styles.action} href="/app/tasks?tab=plan"><Icon name="plus" size={16} />{t(savedGoal ? "planFromGoal" : "goal")}</Link>
    </>}</State>
  </>;
}

function eventWhen(iso: string, t: ReturnType<typeof useT>): string {
  const at = new Date(iso); const now = new Date();
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
  const time = clock(iso);
  if (sameLocalDay(at, now)) return t(at.getHours() >= 17 ? "tonight" : "todayAt", { time });
  if (sameLocalDay(at, tomorrow)) return t("tomorrowAt", { time });
  return new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(at);
}

function EventCard({ controls }: { controls?: ReactNode }) {
  const t = useT();
  const resource = useHomeResource("/api/events/mine?range=upcoming", myEventsResponseSchema);
  return <>
    <Head widget="nextEvent" controls={controls} />
    <State resource={resource}>{(data) => {
      const event = selectNextRegisteredEvent(data.items, new Date(data.asOf ?? Date.now()));
      return event ? <>
        <span className={styles.when}><Chip label={eventWhen(event.startsAt, t)} tone="apricot" /></span>
        <Link className={styles.eventTitle} href={event.href}>{event.title}</Link>
        {event.venue ? <div className={styles.sub}>{event.venue}</div> : null}
        <Foot href={event.href} label={event.meetCount != null ? t("meetCount", { count: event.meetCount }) : t("prep")} />
      </> : <>
        <div className={styles.empty}>{t("eventEmptyDetail")}</div>
        <Link className={styles.action} href="/app/events"><Icon name="link" size={16} />{t("assess")}</Link>
      </>;
    }}</State>
  </>;
}

function NetworkCard({ onContact, controls }: { onContact: (id: string) => void; controls?: ReactNode }) {
  const t = useT();
  const summary = useHomeResource("/api/contacts/summary", contactCardSummarySchema);
  const page = useHomeResource("/api/contacts/page?sort=added&limit=4", contactCardPageSchema);
  return <>
    <Head widget="network" controls={controls} />
    <State resource={summary}>{(data) => data.total > 0 ? <>
      <div className={styles.figure}><strong className={styles.big}>{data.total}<small>{t("peopleUnit")}</small></strong>
        {data.addedThisMonth ? <span className={styles.delta}>{t("addedMonth", { count: data.addedThisMonth })}</span> : null}</div>
      <State resource={page}>{(people) => people.items.length ? <>
        <div className={`${styles.sub} ${styles.recent}`}>{t("recentPeople")}</div>
        <div className={styles.people}>{people.items.slice(0, 4).map((person) => <button key={person.id} type="button" className={`btn ${styles.person}`} onClick={() => onContact(person.id)}>
          <Avatar name={person.displayName} size="sm" /><b>{person.displayName}</b>{person.organization ? <span>{person.organization}</span> : null}</button>)}</div>
      </> : null}</State>
    </> : <>
      <div className={styles.empty}>{t("networkEmptyDetail")}</div>
      <Link className={`${styles.action} ${styles.primary}`} href="/app/contacts/new/scan"><Icon name="scan" size={16} />{t("scanCard")}</Link>
    </>}</State>
  </>;
}

const SECRETARY_KIND: Record<string, { emoji: string; tone: AvatarTone; label: LabelKey }> = {
  event_deadline: { emoji: "⏰", tone: "apricot", label: "kindDeadline" },
  event_prep: { emoji: "🥂", tone: "pink", label: "kindPrep" },
  event_pick: { emoji: "🎯", tone: "lav", label: "kindPick" },
};

function SecretaryCard({ resource, controls }: { resource: HomeResource<SecretaryPreviewDTO> & { retry: () => void }; controls?: ReactNode }) {
  const t = useT();
  const items = resource.kind === "ready" ? visibleSecretaryItems(resource.data) : [];
  return <>
    <Head widget="secretary" count={items.length || undefined} controls={controls} />
    <State resource={resource}>{() => items.length ? <>
      {items.map((item) => { const kind = SECRETARY_KIND[item.kind] ?? SECRETARY_KIND.event_pick!;
        return <Link key={item.key} className={styles.sec} href={item.notification.target.href!}>
          <MacTile emoji={kind.emoji} tone={kind.tone} size="sm" />
          <span className={styles.secText}><b>{item.notification.title}</b>{item.notification.reason ? <small>{item.notification.reason}</small> : null}</span>
          <span className={styles.k}>{item.notification.sample ? t("sample") : t(kind.label)}</span>
        </Link>; })}
      <Foot href="/app/inbox" label={t("secretaryAll")} />
    </> : <div className={styles.empty}>{t("secretaryEmptyDetail")}</div>}</State>
  </>;
}

const picksSchema = z.object({ recommendations: z.array(z.object({ eventId: z.string(), title: z.string(), valueScore: z.number() }).passthrough()) });
const notesSchema = z.object({ notes: z.array(z.object({ id: z.string(), title: z.string() }).passthrough()) });
function PendingCard({ controls }: { controls?: ReactNode }) {
  const t = useT(); const resource = useHomeResource(homeTodoPagePath(), todoPageSchema);
  return <>
    <Head widget="pending" count={resource.kind === "ready" ? resource.data.counts.decisions : undefined} controls={controls} />
    <State resource={resource}>{(data) => data.decisions.items.length
      ? <>{data.decisions.items.slice(0, 2).map((item) => <Row key={item.key} href="/app/tasks?tab=todo" title={item.titlePreview} sub={item.reasonPreview} />)}</>
      : <p className={styles.empty}>{t("empty")}</p>}</State>
  </>;
}
function WeekCard({ controls }: { controls?: ReactNode }) {
  const source = useHomeResource(homeTodoPagePath(), todoPageSchema);
  return <><Head widget="week" controls={controls} /><State resource={source}>{(data) => <WeekData timeZone={data.timeZone} />}</State></>;
}
function WeekData({ timeZone }: { timeZone: string }) {
  const t = useT(); const { language } = useOrbitLanguage();
  const window = homeWeekWindow(new Date(), timeZone);
  if (!window) return <p className={styles.empty}>{t("unavailable")}</p>;
  return <WeekRows window={window} language={language} />;
}
function WeekRows({ window, language }: { window: { from: string; to: string }; language: "ja" | "zh" | "en" }) {
  const t = useT();
  const path = `/api/schedule-items?${new URLSearchParams({ scope: "calendar", from: window.from, to: window.to, language })}`;
  const resource = useHomeResource(path, scheduleSchema);
  return <State resource={resource}>{(data) => {
    const rows = data.scheduleItems.flatMap((raw) => { const item = scheduleRowSchema.safeParse(raw); return item.success && item.data.state !== "cancelled" ? [item.data] : []; })
      .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
    return rows.length ? <>{rows.slice(0, 2).map((item) => <Row key={item.id} href="/app/tasks?tab=calendar" time={clock(item.startsAt)} title={item.title} />)}</> : <p className={styles.empty}>{t("empty")}</p>;
  }}</State>;
}
function PickCard({ controls }: { controls?: ReactNode }) {
  const t = useT(); const resource = useHomeResource("/api/recommendations/events?limit=3", picksSchema);
  return <><Head widget="eventPick" controls={controls} /><State resource={resource}>{(data) => data.recommendations.length
    ? <>{data.recommendations.slice(0, 2).map((item) => <Row key={item.eventId} href={`/app/events/${encodeURIComponent(item.eventId)}`} title={item.title} chip={{ label: String(item.valueScore), tone: "lav" }} />)}</>
    : <p className={styles.empty}>{t("empty")}</p>}</State></>;
}
function MemoCard({ controls }: { controls?: ReactNode }) {
  const t = useT(); const resource = useHomeResource("/api/notes?limit=3&noteKind=all", notesSchema);
  return <><Head widget="memo" controls={controls} /><State resource={resource}>{(data) => data.notes.length
    ? <>{data.notes.slice(0, 2).map((note) => <Row key={note.id} href={`/app/tasks?tab=memo&memo=${encodeURIComponent(note.id)}`} check title={note.title || t("memo")} />)}</>
    : <p className={styles.empty}>{t("empty")}</p>}</State></>;
}

export function HomeCardBody({ widget, onContact, secretary, guide, controls }: { widget: HomeWidgetKey; onContact: (id: string) => void; secretary: HomeResource<SecretaryPreviewDTO> & { retry: () => void }; guide: GuideProgress | null; controls?: ReactNode }) {
  switch (widget) {
    case "today": return <TodayCard guide={guide} controls={controls} />;
    case "planScore": return <PlanCard controls={controls} />;
    case "nextEvent": return <EventCard controls={controls} />;
    case "network": return <NetworkCard onContact={onContact} controls={controls} />;
    case "secretary": return <SecretaryCard resource={secretary} controls={controls} />;
    case "pending": return <PendingCard controls={controls} />;
    case "week": case "deadline": return <WeekCard controls={controls} />;
    case "eventPick": return <PickCard controls={controls} />;
    case "memo": return <MemoCard controls={controls} />;
    default: return null;
  }
}

export function useSecretaryPreview() { return useHomeResource("/api/inbox/secretary/preview", secretaryPreviewSchema); }
export function useGuideProgress() { return useHomeResource("/api/home/guide-progress", guideSchema); }
