"use client";

import Link from "next/link";
import { z } from "zod";

import { contactCardPageSchema, contactCardSummarySchema } from "../../../../../shared/api-schema/contact-card-page";
import { myEventsResponseSchema } from "../../../../../shared/api-schema/events-mine";
import { planV2SummaryResponseSchema } from "../../../../../shared/api-schema/plan-v2";
import { secretaryPreviewSchema } from "../../../../../shared/api-schema/secretary-preview";
import { todoPageSchema } from "../../../../../shared/api-schema/todo-page";
import type { SecretaryPreviewDTO } from "../../../../../shared/contract/secretary-preview";
import type { HomeWidgetKey } from "../../../../../shared/contract/home-layout";
import { useOrbitLanguage } from "../../orbit-language-context";
import { pickCopy } from "../copy/types";
import { TodayQuestionCard } from "../add/TodayQuestionCard";
import { homeCopy } from "./home-copy";
import { homeWeekWindow, selectNextRegisteredEvent, signedTodayDelta } from "./home-model";
import { visibleSecretaryItems } from "./secretary-model";
import { useHomeResource, type HomeResource } from "./use-home-resource";
import styles from "./home.module.css";

const guideSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("hidden"), reason: z.enum(["completed", "grandfathered"]) }),
  z.object({ kind: z.literal("unavailable") }),
  z.object({ kind: z.literal("progress"), completed: z.number().int().min(0).max(3), confirmedContacts: z.number().int().nonnegative(),
    nextStep: z.enum(["contacts", "goal", "plan"]).nullable(), steps: z.object({ contacts: z.boolean(), goal: z.boolean(), plan: z.boolean() }) }),
]);
const scheduleRowSchema = z.object({ id: z.string(), title: z.string(), startsAt: z.string(), state: z.enum(["upcoming", "ongoing", "ended", "cancelled"]) });
const scheduleSchema = z.object({ scheduleItems: z.array(z.unknown()) });

type LabelKey = keyof typeof homeCopy;
function useT() { const { language } = useOrbitLanguage(); return (key: LabelKey) => pickCopy(homeCopy[key], language); }

function State<T>({ resource, children }: { resource: HomeResource<T> & { retry: () => void }; children: (data: T) => React.ReactNode }) {
  const t = useT();
  if (resource.kind === "loading") return <p className={styles.subtle} role="status">…</p>;
  if (resource.kind === "error") return <div className={styles.failure}><span>{t("unavailable")}</span><button type="button" onClick={resource.retry}>{t("retry")}</button></div>;
  return <>{children(resource.data)}</>;
}

function EmptyLink({ href, label }: { href: string; label: string }) { return <Link className={styles.cardLink} href={href}>{label} →</Link>; }

function TodayCard() {
  const t = useT();
  const resource = useHomeResource("/api/todo/page", todoPageSchema);
  const schedule = useHomeResource("/api/schedule-items", scheduleSchema);
  const rows = schedule.kind === "ready" ? schedule.data.scheduleItems.flatMap((raw) => {
    const parsed = scheduleRowSchema.safeParse(raw);
    return parsed.success && ["upcoming", "ongoing"].includes(parsed.data.state) ? [parsed.data] : [];
  }).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)) : [];
  return <State resource={resource}>{(data) => <>
    <div className={styles.statRow}>
      <Link href="/app/tasks?tab=todo" className={styles.stat}><strong>{data.counts.nextMoves}</strong><small>今日の一手</small></Link>
      <Link href="/app/tasks?tab=todo" className={styles.stat}><strong>{data.counts.decisions}</strong><small>{t("pending")}</small></Link>
      <Link href="/app/tasks?tab=calendar" className={styles.stat}><strong>{schedule.kind === "ready" ? rows.length : "—"}</strong><small>予定</small></Link>
    </div>
    {data.nextMoves.items[0] ? <Link className={styles.item} href="/app/tasks?tab=todo">{data.nextMoves.items[0].titlePreview} <span>→</span></Link> : null}
    {rows[0] ? <Link className={styles.item} href="/app/tasks?tab=calendar">{rows[0].title}<span>→</span></Link> : null}
    {schedule.kind === "error" ? <div className={styles.failure}><span>{t("unavailable")}</span><button type="button" onClick={schedule.retry}>{t("retry")}</button></div> : null}
    {Object.values(data.sources).some((source) => source === "unavailable" || source === "not_implemented") ? <p className={styles.subtle}>{t("unavailable")}</p> : null}
    <TodayQuestionCard />
    <EmptyLink href="/app/tasks?tab=todo" label={t("showAll")} />
  </>}</State>;
}

function PlanCard() {
  const t = useT();
  const resource = useHomeResource("/api/agent/plans/v2/summary", planV2SummaryResponseSchema);
  return <State resource={resource}>{(data) => data.current ? <>
    <div className={styles.score}><strong>{data.current.score.total}</strong><span>/100</span><b className={data.current.score.todayDelta < 0 ? styles.negative : ""}>{signedTodayDelta(data.current.score.todayDelta)} 今日</b></div>
    <p className={styles.subtle}>{data.current.goal}</p>
    <div className={styles.segments}>{data.current.score.segments.map((segment) => <span key={segment.key}>{segment.key === "event" ? "イベント枠" : segment.shortLabel} {segment.earned}/{segment.allocation}</span>)}</div>
    {data.current.todayChance ? <EmptyLink href={data.current.todayChance.href} label={data.current.todayChance.actionLabel ?? data.current.todayChance.label} /> : <EmptyLink href="/app/tasks?tab=plan" label={t("showAll")} />}
  </> : <><p className={styles.subtle}>{t("empty")}</p><EmptyLink href="/app/tasks?tab=plan" label={t("goal")} /></>}</State>;
}

function EventCard() {
  const t = useT();
  const resource = useHomeResource("/api/events/mine?range=upcoming", myEventsResponseSchema);
  return <State resource={resource}>{(data) => {
    const event = selectNextRegisteredEvent(data.items, new Date(data.asOf ?? Date.now()));
    return event ? <>
      <Link className={styles.eventTitle} href={event.href}><span>{event.emoji}</span>{event.title}</Link>
      <p className={styles.subtle}>{new Intl.DateTimeFormat("ja-JP", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(event.startsAt))}{event.venue ? ` · ${event.venue}` : ""}</p>
      {event.meetCount != null ? <p className={styles.subtle}>会いたい人 {event.meetCount}人</p> : null}
      <EmptyLink href={event.href} label={t("prep")} />
    </> : <><p className={styles.subtle}>{t("empty")}</p><EmptyLink href="/app/events" label={t("assess")} /></>;
  }}</State>;
}

function NetworkCard({ onContact }: { onContact: (id: string) => void }) {
  const t = useT();
  const summary = useHomeResource("/api/contacts/summary", contactCardSummarySchema);
  const page = useHomeResource("/api/contacts/page?sort=added&limit=4", contactCardPageSchema);
  return <><State resource={summary}>{(data) => <div className={styles.score}><strong>{data.total}</strong><span>人</span>{data.addedThisMonth !== undefined ? <b>+{data.addedThisMonth} {t("added")}</b> : null}</div>}</State>
    <State resource={page}>{(data) => <div className={styles.people}>{data.items.slice(0, 4).map((person) => <button type="button" key={person.id} onClick={() => onContact(person.id)}><span className={styles.avatar}>{person.displayName.slice(0, 1)}</span><span>{person.displayName}</span></button>)}</div>}</State>
    <EmptyLink href="/app/contacts" label={t("showAll")} />
  </>;
}

function SecretaryCard({ resource }: { resource: HomeResource<SecretaryPreviewDTO> & { retry: () => void } }) {
  const t = useT();
  return <State resource={resource}>{(data) => {
    const items = visibleSecretaryItems(data);
    return items.length ? <><div className={styles.lines}>{items.map((item) => <Link key={item.key} href={item.notification.target.href!}>{item.notification.title}{item.notification.sample ? <small>{t("sample")}</small> : null}<span>→</span></Link>)}</div><EmptyLink href="/app/inbox" label={t("showAll")} /></> : <><p className={styles.subtle}>{t("empty")}</p><EmptyLink href="/app/inbox" label={t("showAll")} /></>;
  }}</State>;
}

const picksSchema = z.object({ recommendations: z.array(z.object({ eventId: z.string(), title: z.string(), valueScore: z.number() }).passthrough()) });
const notesSchema = z.object({ notes: z.array(z.object({ id: z.string(), title: z.string() }).passthrough()) });
function PendingCard() {
  const t = useT(); const resource = useHomeResource("/api/todo/page", todoPageSchema);
  return <State resource={resource}>{(data) => <><p className={styles.subtle}>{data.counts.decisions}件</p>{data.decisions.items.slice(0, 2).map((item) => <Link key={item.key} className={styles.item} href="/app/tasks?tab=todo">{item.titlePreview} →</Link>)}<EmptyLink href="/app/tasks?tab=todo" label={t("showAll")} /></>}</State>;
}
function WeekCard() {
  const source = useHomeResource("/api/todo/page", todoPageSchema);
  return <State resource={source}>{(data) => <WeekData timeZone={data.timeZone} />}</State>;
}
function WeekData({ timeZone }: { timeZone: string }) {
  const t = useT(); const { language } = useOrbitLanguage();
  const window = homeWeekWindow(new Date(), timeZone);
  if (!window) return <p className={styles.subtle}>{t("unavailable")}</p>;
  return <WeekRows window={window} language={language} />;
}
function WeekRows({ window, language }: { window: { from: string; to: string }; language: "ja" | "zh" | "en" }) {
  const t = useT();
  const path = `/api/schedule-items?${new URLSearchParams({ scope: "calendar", from: window.from, to: window.to, language })}`;
  const resource = useHomeResource(path, scheduleSchema);
  return <State resource={resource}>{(data) => {
    const rows = data.scheduleItems.flatMap((raw) => { const item = scheduleRowSchema.safeParse(raw); return item.success && item.data.state !== "cancelled" ? [item.data] : []; })
      .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
    return <>{rows.length ? rows.slice(0, 2).map((item) => <Link key={item.id} className={styles.item} href="/app/tasks?tab=calendar">{item.title} →</Link>) : <p className={styles.subtle}>{t("empty")}</p>}
      <EmptyLink href="/app/tasks?tab=calendar" label={t("showAll")} /></>;
  }}</State>;
}
function PickCard() {
  const t = useT(); const resource = useHomeResource("/api/recommendations/events?limit=3", picksSchema);
  return <State resource={resource}>{(data) => <>{data.recommendations.length ? data.recommendations.slice(0, 2).map((item) => <Link key={item.eventId} className={styles.item} href={`/app/events/${encodeURIComponent(item.eventId)}`}>{item.title} · {item.valueScore} →</Link>) : <p className={styles.subtle}>{t("empty")}</p>}<EmptyLink href="/app/events" label={t("showAll")} /></>}</State>;
}
function MemoCard() {
  const t = useT(); const resource = useHomeResource("/api/notes?limit=3&noteKind=all", notesSchema);
  return <State resource={resource}>{(data) => <>{data.notes.length ? data.notes.map((note) => <Link key={note.id} className={styles.item} href={`/app/tasks?tab=memo&memo=${encodeURIComponent(note.id)}`}>{note.title || t("memo")} →</Link>) : <p className={styles.subtle}>{t("empty")}</p>}<EmptyLink href="/app/tasks?tab=memo" label={t("showAll")} /></>}</State>;
}

export function HomeCardBody({ widget, onContact, secretary }: { widget: HomeWidgetKey; onContact: (id: string) => void; secretary: HomeResource<SecretaryPreviewDTO> & { retry: () => void } }) {
  const t = useT();
  switch (widget) {
    case "today": return <TodayCard />;
    case "planScore": return <PlanCard />;
    case "nextEvent": return <EventCard />;
    case "network": return <NetworkCard onContact={onContact} />;
    case "secretary": return <SecretaryCard resource={secretary} />;
    case "pending": return <PendingCard />;
    case "week": return <WeekCard />;
    case "eventPick": return <PickCard />;
    case "memo": return <MemoCard />;
    default: return null;
  }
}

export function useSecretaryPreview() { return useHomeResource("/api/inbox/secretary/preview", secretaryPreviewSchema); }
export function useGuideProgress() { return useHomeResource("/api/home/guide-progress", guideSchema); }
