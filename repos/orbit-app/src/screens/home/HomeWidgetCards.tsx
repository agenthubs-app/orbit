import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { z } from "zod";

import type { OrbitApiClient } from "../../api/client";
import type { HomeWidgetKey } from "../../api/contract/home-layout";
import { planV2SummaryResponseSchema } from "../../api/schema/plan-v2";
import { contactCardPageSchema, contactCardSummarySchema } from "../../api/schema/contact-card-page";
import { myEventsResponseSchema } from "../../api/schema/events-mine";
import { secretaryPreviewSchema } from "../../api/schema/secretary-preview";
import { useApiResource } from "../../hooks/useApiResource";
import { useDeviceMirror } from "../../hooks/useDeviceMirror";
import { buildSecretaryPreview } from "../../api/compute/secretary-source";
import { localInboxList } from "../../api/compute/inbox-local";
import type { InboxNotificationDTO } from "../../api/contract/inbox-notifications";
import { useLocalContacts } from "../../hooks/useLocalContacts";
import { useLocalEventDay } from "../../hooks/useLocalEventDay";
import { useLocalInbox } from "../../hooks/useLocalInbox";
import { useSyncedCollection } from "../../hooks/useSyncedCollection";
import { mirrorFreshness } from "../../data/sync/mirror-freshness";
import type { PageCopyResourceState } from "../../hooks/usePageCopyResource";
import { localContactCardPage, localContactCardSummary } from "../../view-models/contacts-local";
import { localRegisteredEvents } from "../../view-models/event-day-local";
import { notesFromMirror } from "../../view-models/notes-mirror";
import { tokyoMonthStart } from "../network/network-model";
import { useOrbitTimeZone } from "../../time/OrbitTimeZoneProvider";
import { Button } from "../../components/ui/Button";
import { UiPressable } from "../../components/ui/Pressable";
import { UiText } from "../../components/ui/Text";
import { createThemedStyles } from "../../design/theme";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { usePageCopyResource } from "../../hooks/usePageCopyResource";
import { TodayQuestionCard } from "../add/CompletionQuestionCard";
import { calendarMeetingWindow } from "../calendar/calendar-meeting-source";
import { useTodoPage } from "../todo/useTodoPage";
import { HOME_COPY_FRESH_MS, nextLocalRegisteredEvent, nextRegisteredEvent, signedDelta } from "./home-widget-model";

type Navigate = (href: string) => void;
type GuideProgress = { completed: number; steps: { contacts: boolean; goal: boolean; plan: boolean } };
const scheduleSchema = z.object({ scheduleItems: z.array(z.unknown()) });
const scheduleRowSchema = z.object({ title: z.string(), startsAt: z.string(), state: z.enum(["upcoming", "ongoing", "ended", "cancelled"]) });
const notesSchema = z.object({ notes: z.array(z.object({ id: z.string(), title: z.string() }).passthrough()) });
const picksSchema = z.object({ recommendations: z.array(z.object({ eventId: z.string(), title: z.string(), valueScore: z.number() }).passthrough()) });
/** LF1: a page-copy card — the saved answer at once, 「截至」 when it is all the device has, retry otherwise. */
function CopyResource<T>({ state, schema, children }: { state: PageCopyResourceState<unknown>; schema: z.ZodType<T>; children: (data: T) => React.ReactNode }) {
  const { styles } = useStyles(); const { t } = useOrbitLocale();
  if (state.kind === "loading") return <UiText style={styles.muted}>…</UiText>;
  const parsed = state.kind === "success" || state.kind === "empty" ? schema.safeParse(state.data) : null;
  if (!parsed?.success) return <View><UiText style={styles.muted}>{t("home.widgetUnavailable")}</UiText><Button label={t("home.readAgain")} onPress={state.refresh} variant="ghost" size="sm" /></View>;
  return <><SavedOfflineNote show={state.copy?.offline} at={state.copy?.lastSyncedAt} />{children(parsed.data)}</>;
}

/** The server read a card falls back to without a device mirror; inert (no request) when the mirror is the source. */
function useFallbackRead<T>(path: string, schema: z.ZodType<T>, enabled: boolean): { data: T | null; loading: boolean; refresh: () => void } {
  const state = useApiResource<unknown>(path, () => false, { enabled, cachePolicy: "network-only" });
  const parsed = state.kind === "success" || state.kind === "empty" ? schema.safeParse(state.data) : null;
  return { data: parsed?.success ? parsed.data : null, loading: state.kind === "loading", refresh: state.refresh };
}

function FallbackState({ loading, refresh }: { loading: boolean; refresh: () => void }) {
  const { styles } = useStyles(); const { t } = useOrbitLocale();
  return loading ? <UiText style={styles.muted}>…</UiText> : <View><UiText style={styles.muted}>{t("home.widgetUnavailable")}</UiText><Button label={t("home.readAgain")} onPress={refresh} variant="ghost" size="sm" /></View>;
}

/** LF1: a device-mirror card — 「截至」 when the mirror is not up to date with the server. */
function MirrorNotice({ offline, lastSyncedAt }: { offline: boolean; lastSyncedAt: string | null }) {
  return <SavedOfflineNote show={offline} at={lastSyncedAt} />;
}

/** 「以前の情報 · …」 with the save time as a short local date, not the raw ISO string. */
function SavedOfflineNote({ show, at }: { show: boolean | undefined; at: string | null | undefined }) {
  const { styles } = useStyles(); const { t, language } = useOrbitLocale();
  if (!show) return null;
  const time = at && Number.isFinite(Date.parse(at))
    ? new Date(at).toLocaleString(language === "en" ? "en-US" : language === "ja" ? "ja-JP" : "zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : null;
  return <UiText style={styles.stale}>{t("home.widgetSavedOffline")}{time ? ` · ${time}` : ""}</UiText>;
}

function LinkRow({ label, href, navigate }: { label: string; href: string; navigate: Navigate }) {
  const { styles } = useStyles();
  return <UiPressable accessibilityRole="link" accessibilityLabel={label} onPress={() => navigate(href)} style={styles.link}><UiText style={styles.linkText}>{label} →</UiText></UiPressable>;
}

function todayKey(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "2-digit", day: "2-digit", timeZone }).formatToParts(now);
  const part = (kind: string) => parts.find(item => item.type === kind)?.value ?? "00";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function GuideSteps({ progress, navigate }: { progress: GuideProgress; navigate: Navigate }) {
  const { styles } = useStyles(); const { t } = useOrbitLocale();
  const steps = [
    { key: "contacts", label: t("home.widgetGuideContacts"), href: "/contacts" },
    { key: "goal", label: t("home.widgetGuideGoal"), href: "/task?seg=plan" },
    { key: "plan", label: t("home.widgetGuidePlan"), href: "/task?seg=plan" },
  ] as const;
  return <View><View style={styles.guideHead}><UiText style={styles.muted}>{t("home.widgetGuide")}</UiText><UiText style={styles.guideCount}>{progress.completed}/3</UiText></View>{steps.map((step, index) =>
    <UiPressable key={step.key} accessibilityRole="link" accessibilityLabel={step.label} onPress={() => navigate(step.href)} style={styles.guideStep}><UiText style={styles.guideText}>{progress.steps[step.key] ? "✓" : "○"}  {index + 1}. {step.label}</UiText></UiPressable>)}</View>;
}

function TodayWidget({ navigate, guide, onDataSettled }: { navigate: Navigate; guide: GuideProgress | null; onDataSettled?: (() => void) | undefined }) {
  const { timeZone } = useOrbitTimeZone(); const { styles } = useStyles(); const { t } = useOrbitLocale();
  const date = useMemo(() => todayKey(new Date(), timeZone), [timeZone]);
  const todo = useTodoPage(timeZone, date);
  const schedule = usePageCopyResource<unknown>("/api/schedule-items", value => {
    const parsed = scheduleSchema.safeParse(value); return parsed.success && parsed.data.scheduleItems.length === 0;
  }, { copy: { id: "home-schedule", variant: "main" }, freshForMs: HOME_COPY_FRESH_MS, accept: value => scheduleSchema.safeParse(value).success });
  const parsedSchedule = schedule.kind === "success" || schedule.kind === "empty" ? scheduleSchema.safeParse(schedule.data) : null;
  const scheduleRows = parsedSchedule?.success ? parsedSchedule.data.scheduleItems.flatMap(raw => {
    const parsed = scheduleRowSchema.safeParse(raw);
    return parsed.success && (parsed.data.state === "upcoming" || parsed.data.state === "ongoing") ? [parsed.data] : [];
  }).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)) : [];
  const settled = () => { todo.refresh(); onDataSettled?.(); };
  if (!todo.page) return <View>{guide ? <GuideSteps progress={guide} navigate={navigate} /> : null}<UiText style={styles.muted}>{todo.state.kind === "loading" ? "…" : t("home.widgetUnavailable")}</UiText><Button label={t("home.readAgain")} onPress={todo.refresh} variant="ghost" size="sm" /><TodayQuestionCard onSettled={settled} /></View>;
  if (guide && todo.page.counts.nextMoves === 0 && todo.page.counts.decisions === 0 && scheduleRows.length === 0) return <View><GuideSteps progress={guide} navigate={navigate} /><TodayQuestionCard onSettled={settled} /></View>;
  return <View>
    {guide ? <GuideSteps progress={guide} navigate={navigate} /> : null}
    <SavedOfflineNote show={todo.copy?.offline} at={todo.copy?.lastSyncedAt} />
    <View style={styles.stats}><Stat value={todo.page.counts.nextMoves} label={t("home.widgetNextMove")} /><Stat value={todo.page.counts.decisions} label={t("home.widgetPending")} />{parsedSchedule?.success ? <Stat value={scheduleRows.length} label={t("home.schedule")} /> : <UiText style={styles.muted}>— {t("home.schedule")}</UiText>}</View>
    {todo.page.nextMoves.items[0] ? <LinkRow label={todo.page.nextMoves.items[0].titlePreview} href="/task?seg=todo" navigate={navigate} /> : null}
    {scheduleRows[0] ? <LinkRow label={scheduleRows[0].title} href="/task?seg=calendar" navigate={navigate} /> : null}
    <SavedOfflineNote show={schedule.copy?.offline} at={schedule.copy?.lastSyncedAt} />
    {Object.values(todo.page.sources).some(source => source === "unavailable" || source === "not_implemented") ? <UiText style={styles.muted}>{t("home.widgetUnavailable")}</UiText> : null}
    <TodayQuestionCard onSettled={settled} />
    <LinkRow label={t("home.widgetMore")} href="/task?seg=todo" navigate={navigate} />
  </View>;
}

function Stat({ value, label }: { value: number; label: string }) {
  const { styles } = useStyles(); return <View><UiText style={styles.statNumber}>{value}</UiText><UiText style={styles.muted}>{label}</UiText></View>;
}

function PlanWidget({ navigate }: { navigate: Navigate }) {
  const { styles } = useStyles(); const { t } = useOrbitLocale();
  // LF1: plans have no sync domain; the last answer is a page copy re-read after its fresh window or a write.
  const state = usePageCopyResource<unknown>("/api/agent/plans/v2/summary", () => false, {
    copy: { id: "home-plan-summary" }, freshForMs: HOME_COPY_FRESH_MS, accept: value => planV2SummaryResponseSchema.safeParse(value).success });
  return <CopyResource state={state} schema={planV2SummaryResponseSchema}>{data => data.current ? <View>
    <View style={styles.score}><UiText style={styles.scoreNumber}>{data.current.score.total}</UiText><UiText style={styles.muted}>/ 100</UiText><UiText style={data.current.score.todayDelta < 0 ? styles.negative : styles.delta}>{signedDelta(data.current.score.todayDelta)} {t("home.widgetTodayDelta")}</UiText></View>
    <UiText style={styles.muted} numberOfLines={2}>{data.current.goal}</UiText>
    <UiText style={styles.muted} numberOfLines={2}>{data.current.score.segments.map(segment => `${segment.key === "event" ? t("home.widgetEventSegment") : segment.shortLabel} ${segment.earned}/${segment.allocation}`).join(" · ")}</UiText>
    <LinkRow label={data.current.todayChance?.actionLabel ?? t("home.widgetMore")} href={data.current.todayChance?.href ?? "/task?seg=plan"} navigate={navigate} />
  </View> : <View><UiText style={styles.muted}>{t("home.widgetPlanEmptyDetail")}</UiText><Button label={t("home.widgetGoal")} onPress={() => navigate("/task?seg=plan")} variant="secondary" size="sm" /></View>}</CopyResource>;
}

function EventWidget({ navigate }: { navigate: Navigate }) {
  const { styles } = useStyles(); const { t, language } = useOrbitLocale();
  // LF1: the next registered event comes from the device's event-day domains (0115), not a server read.
  const device = useDeviceMirror();
  // `true`: the hook ties readiness to it (a cheap conditional probe through the sync coordinator).
  const day = useLocalEventDay(true);
  const fallback = useFallbackRead("/api/events/mine?range=upcoming", myEventsResponseSchema, !device);
  const local = useMemo(() => nextLocalRegisteredEvent(localRegisteredEvents(day.records.events), day.records.registrations, new Date()),
    [day.records.events, day.records.registrations]);
  if (!device) {
    if (!fallback.data) return <FallbackState loading={fallback.loading} refresh={fallback.refresh} />;
    const next = nextRegisteredEvent(fallback.data.items, fallback.data.asOf ? new Date(fallback.data.asOf) : new Date());
    return next ? <View><UiText style={styles.eventTitle}>{next.emoji} {next.title}</UiText><UiText style={styles.muted}>{new Date(next.startsAt).toLocaleString(language === "ja" ? "ja-JP" : language === "zh" ? "zh-CN" : "en-US")} · {next.venue ?? ""}</UiText><LinkRow label={t("home.widgetMore")} href={next.href} navigate={navigate} /></View>
      : <View><UiText style={styles.muted}>{t("home.widgetEventEmptyDetail")}</UiText><Button label={t("home.widgetAssessEvent")} onPress={() => navigate("/events/assess")} variant="secondary" size="sm" /></View>;
  }
  const event = local;
  if (!day.freshness.readable) return <UiText style={styles.muted}>{day.freshness.loading ? "…" : t("home.widgetUnavailable")}</UiText>;
  return <View><MirrorNotice offline={day.freshness.offline} lastSyncedAt={day.freshness.lastSyncedAt} />{event
    ? <View><UiText style={styles.eventTitle}>{event.title}</UiText><UiText style={styles.muted}>{new Date(event.startsAt).toLocaleString(language === "ja" ? "ja-JP" : language === "zh" ? "zh-CN" : "en-US")} · {event.venue ?? ""}</UiText>
      <LinkRow label={t("home.widgetMore")} href={`/events/${encodeURIComponent(event.eventId)}`} navigate={navigate} /></View>
    : <View><UiText style={styles.muted}>{t("home.widgetEventEmptyDetail")}</UiText><Button label={t("home.widgetAssessEvent")} onPress={() => navigate("/events/assess")} variant="secondary" size="sm" /></View>}</View>;
}

function NetworkWidget({ navigate }: { navigate: Navigate }) {
  const { styles } = useStyles(); const { t } = useOrbitLocale();
  // LF1: total, this month's additions and the four most recently added come from the contacts domain (0116),
  // computed with the same shared directory rules as GET /api/contacts/summary and /api/contacts/page?sort=added.
  const local = useLocalContacts();
  const fallbackSummary = useFallbackRead("/api/contacts/summary", contactCardSummarySchema, !local.available);
  const fallbackPage = useFallbackRead("/api/contacts/page?sort=added&limit=4", contactCardPageSchema, !local.available);
  const asOf = local.freshness.lastSyncedAt ?? new Date().toISOString();
  const summary = useMemo(() => localContactCardSummary(local.rows, { monthStart: tokyoMonthStart(Date.now()) }, asOf), [asOf, local.rows]);
  const recent = useMemo(() => localContactCardPage(local.rows, { sort: "added" }, null, asOf).items.slice(0, 4), [asOf, local.rows]);
  if (!local.available && (!fallbackSummary.data || !fallbackPage.data)) return <FallbackState loading={fallbackSummary.loading || fallbackPage.loading} refresh={() => { fallbackSummary.refresh(); fallbackPage.refresh(); }} />;
  if (local.available && !local.freshness.readable) return <UiText style={styles.muted}>{local.freshness.loading ? "…" : t("home.widgetUnavailable")}</UiText>;
  return <NetworkCardBody navigate={navigate} offline={local.available && local.freshness.offline} lastSyncedAt={local.freshness.lastSyncedAt}
    summary={local.available ? summary : fallbackSummary.data!} recent={local.available ? recent : fallbackPage.data!.items.slice(0, 4)} />;
}

function NetworkCardBody({ navigate, offline, lastSyncedAt, summary, recent }: { navigate: Navigate; offline: boolean; lastSyncedAt: string | null;
  summary: { total: number; addedThisMonth?: number | undefined }; recent: readonly { id: string; displayName: string }[] }) {
  const { styles } = useStyles(); const { t } = useOrbitLocale();
  return <View><MirrorNotice offline={offline} lastSyncedAt={lastSyncedAt} />
    {summary.total > 0 ? <View style={styles.score}><UiText style={styles.scoreNumber}>{summary.total}</UiText><UiText style={styles.muted}>{t("home.widgetPeopleUnit")}</UiText>{summary.addedThisMonth !== undefined ? <UiText style={styles.delta}>+{summary.addedThisMonth} {t("home.widgetAdded")}</UiText> : null}</View> : <UiText style={styles.muted}>{t("home.widgetNetworkEmptyDetail")}</UiText>}
    {recent.length ? <View><View style={styles.people}>{recent.map(person => <UiPressable key={person.id} accessibilityRole="link" accessibilityLabel={person.displayName} onPress={() => navigate(`/contacts/${encodeURIComponent(person.id)}`)} style={styles.person}><View style={styles.avatar}><UiText>{person.displayName.slice(0, 1)}</UiText></View><UiText numberOfLines={1} style={styles.personName}>{person.displayName}</UiText></UiPressable>)}</View><LinkRow label={t("home.widgetMore")} href="/contacts" navigate={navigate} /></View> : <Button label={t("home.widgetScanCard")} onPress={() => navigate("/contacts/new/scan")} variant="primary" size="sm" />}
  </View>;
}

function SecretaryWidget({ actorId, navigate }: { actorId: string; navigate: Navigate }) {
  const { styles } = useStyles(); const { t, language } = useOrbitLocale();
  // LF1: the secretary preview is the shared buildSecretaryPreview over the device's inbox domain (0118),
  // instead of the server paging through the whole inbox on every Home focus.
  const inbox = useLocalInbox(false);
  const fallback = useFallbackRead("/api/inbox/secretary/preview", secretaryPreviewSchema, !inbox.available);
  const localPreview = useMemo(() => {
    const nowMs = Date.now();
    const rows = localInboxList(inbox.rows, { filter: "all", language, nowMs });
    return buildSecretaryPreview(actorId, rows.map(row => ({ notification: { ...row, actorId } as InboxNotificationDTO, sourceState: row.sourceState })), new Date(nowMs).toISOString());
  }, [actorId, inbox.rows, language]);
  if (!inbox.available) {
    if (!fallback.data) return <FallbackState loading={fallback.loading} refresh={fallback.refresh} />;
    if (fallback.data.actorId !== actorId || fallback.data.items.some(item => item.notification.actorId !== actorId)) return <UiText style={styles.muted}>{t("home.widgetUnavailable")}</UiText>;
  }
  const preview = inbox.available ? localPreview : fallback.data!;
  if (inbox.available && !inbox.freshness.readable) return <UiText style={styles.muted}>{inbox.freshness.loading ? "…" : t("home.widgetUnavailable")}</UiText>;
  return <View><MirrorNotice offline={inbox.available && inbox.freshness.offline} lastSyncedAt={inbox.freshness.lastSyncedAt} />
    {preview.items.filter(item => item.notification.target.href).map(item =>
      <LinkRow key={item.key} label={`${item.notification.title}${item.notification.sample ? ` · ${t("home.widgetSample")}` : ""}`} href={item.notification.target.href!} navigate={navigate} />)}
    {preview.items.length ? <LinkRow label={t("home.widgetMore")} href="/inbox?filter=secretary" navigate={navigate} /> : <UiText style={styles.muted}>{t("home.widgetSecretaryEmptyDetail")}</UiText>}</View>;
}

function PendingWidget({ navigate, size }: { navigate: Navigate; size: "s" | "m" }) {
  const { timeZone } = useOrbitTimeZone(); const { styles } = useStyles(); const { t } = useOrbitLocale();
  const todo = useTodoPage(timeZone, todayKey(new Date(), timeZone));
  return todo.page ? <View><UiText style={styles.muted}>{t("home.widgetItemCount").replace("{count}", String(todo.page.counts.decisions))}</UiText>{todo.page.decisions.items.slice(0, size === "m" ? 2 : 1).map(item => <LinkRow key={item.key} label={item.titlePreview} href="/task?seg=todo" navigate={navigate} />)}</View>
    : <View><UiText style={styles.muted}>{t("home.widgetUnavailable")}</UiText><Button label={t("home.readAgain")} onPress={todo.refresh} variant="ghost" size="sm" /></View>;
}

function WeekWidget({ navigate, size }: { navigate: Navigate; size: "s" | "m" }) {
  const { timeZone } = useOrbitTimeZone(); const { language, t } = useOrbitLocale(); const { styles } = useStyles();
  const range = calendarMeetingWindow(todayKey(new Date(), timeZone), "week", timeZone);
  if (!range) return <UiText style={styles.muted}>{t("home.widgetUnavailable")}</UiText>;
  return <WeekRows range={range} language={language} navigate={navigate} size={size} />;
}
function WeekRows({ range, language, navigate, size }: { range: { from: string; to: string }; language: "ja" | "zh" | "en"; navigate: Navigate; size: "s" | "m" }) {
  const { styles } = useStyles(); const { t } = useOrbitLocale();
  const path = `/api/schedule-items?${new URLSearchParams({ scope: "calendar", from: range.from, to: range.to, language })}`;
  // LF1: this week's calendar keeps its last answer; a new week (path) reads again.
  const state = usePageCopyResource<unknown>(path, () => false, { copy: { id: "home-week" }, freshForMs: HOME_COPY_FRESH_MS,
    accept: value => scheduleSchema.safeParse(value).success });
  return <CopyResource state={state} schema={scheduleSchema}>{data => {
    const rows = data.scheduleItems.flatMap(raw => { const item = scheduleRowSchema.safeParse(raw); return item.success && item.data.state !== "cancelled" ? [item.data] : []; }).sort((a,b) => Date.parse(a.startsAt)-Date.parse(b.startsAt));
    return <View>{rows.length ? rows.slice(0, size === "m" ? 2 : 1).map((item,index) => <LinkRow key={`${item.startsAt}:${index}`} label={item.title} href="/task?seg=calendar" navigate={navigate} />) : <UiText style={styles.muted}>{t("home.widgetEmpty")}</UiText>}
      <LinkRow label={t("home.widgetMore")} href="/task?seg=calendar" navigate={navigate} /></View>;
  }}</CopyResource>;
}
function PickWidget({ navigate, size }: { navigate: Navigate; size: "s" | "m" }) {
  const { styles } = useStyles(); const { t } = useOrbitLocale();
  const state = usePageCopyResource<unknown>("/api/recommendations/events?limit=3", value => {
    const parsed = picksSchema.safeParse(value); return parsed.success && parsed.data.recommendations.length === 0;
  }, { copy: { id: "event-recommendations", variant: "home" }, freshForMs: HOME_COPY_FRESH_MS, accept: value => picksSchema.safeParse(value).success });
  const parsed = state.kind === "success" || state.kind === "empty" ? picksSchema.safeParse(state.data) : null;
  if (!parsed?.success) return <View><UiText style={styles.muted}>{t("home.widgetUnavailable")}</UiText><Button label={t("home.readAgain")} onPress={state.refresh} variant="ghost" size="sm" /></View>;
  return <View><SavedOfflineNote show={state.copy?.offline} at={state.copy?.lastSyncedAt} />
    {parsed.data.recommendations.length ? parsed.data.recommendations.slice(0, size === "m" ? 2 : 1).map(item => <LinkRow key={item.eventId} label={`${item.title} · ${item.valueScore}`} href={`/events/${encodeURIComponent(item.eventId)}`} navigate={navigate} />) : <UiText style={styles.muted}>{t("home.widgetEmpty")}</UiText>}
    <LinkRow label={t("home.widgetMore")} href="/events" navigate={navigate} /></View>;
}
function MemoWidget({ actorId, navigate, size }: { actorId: string; navigate: Navigate; size: "s" | "m" }) {
  const { styles } = useStyles(); const { t, language } = useOrbitLocale();
  // LF1: the latest notes come from the notes domain (0108) instead of GET /api/notes.
  const device = useDeviceMirror();
  const mirror = useSyncedCollection<Record<string, unknown>>({ kind: "note" });
  const freshness = mirrorFreshness(mirror, device);
  const fallback = useFallbackRead("/api/notes?limit=3&noteKind=all", notesSchema, !device);
  const localNotes = useMemo(() => device && freshness.readable ? notesFromMirror(mirror.records, actorId, language) : null, [actorId, device, freshness.readable, language, mirror.records]);
  if (!device && !fallback.data) return <FallbackState loading={fallback.loading} refresh={fallback.refresh} />;
  const notes: readonly { id: string; title: string }[] | null = device ? localNotes : fallback.data!.notes;
  if (!notes) return <UiText style={styles.muted}>{freshness.loading ? "…" : t("home.widgetUnavailable")}</UiText>;
  return <View>{notes.length ? notes.slice(0, size === "m" ? 2 : 1).map(note => <LinkRow key={note.id} label={note.title || t("home.widgetMemo")} href={`/notes/${encodeURIComponent(note.id)}`} navigate={navigate} />) : <UiText style={styles.muted}>{t("home.widgetEmpty")}</UiText>}
    <LinkRow label={t("home.widgetMore")} href="/task?seg=memo" navigate={navigate} /></View>;
}

export function HomeWidgetBody({ widget, size, client, actorId, navigate, guide, onDataSettled }: { widget: HomeWidgetKey; size: "s" | "m"; client: OrbitApiClient; actorId: string; navigate: Navigate; guide: GuideProgress | null; onDataSettled?: () => void }) {
  switch (widget) {
    case "today": return <TodayWidget navigate={navigate} guide={guide} onDataSettled={onDataSettled} />;
    case "planScore": return <PlanWidget navigate={navigate} />;
    case "nextEvent": return <EventWidget navigate={navigate} />;
    case "network": return <NetworkWidget navigate={navigate} />;
    case "secretary": return <SecretaryWidget actorId={actorId} navigate={navigate} />;
    case "pending": return <PendingWidget size={size} navigate={navigate} />;
    case "week": return <WeekWidget size={size} navigate={navigate} />;
    case "eventPick": return <PickWidget size={size} navigate={navigate} />;
    case "memo": return <MemoWidget actorId={actorId} size={size} navigate={navigate} />;
    default: return null;
  }
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  muted: { color: colors.ink3Text, fontSize: 13, lineHeight: 21 }, stale: { color: colors.coralText, fontSize: 12, marginBottom: 6 },
  link: { minHeight: 32, justifyContent: "center", paddingVertical: 3 }, linkText: { color: colors.ink2, fontSize: 14 },
  stats: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }, statNumber: { color: colors.ink, fontSize: 24, fontWeight: "700" },
  score: { flexDirection: "row", alignItems: "baseline", gap: 4 }, scoreNumber: { color: colors.ink, fontSize: 34, fontWeight: "700" }, delta: { marginLeft: "auto", color: colors.accentText, fontSize: 13, fontWeight: "700" }, negative: { marginLeft: "auto", color: colors.coralText, fontSize: 13, fontWeight: "700" },
  eventTitle: { color: colors.ink, fontSize: 17, fontWeight: "700", lineHeight: 24 },
  people: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 }, person: { width: "24%", alignItems: "center", gap: 4 }, avatar: { width: 33, height: 33, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface2 }, personName: { color: colors.ink2, fontSize: 12 },
  guideHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, guideCount: { backgroundColor: colors.surface2, color: colors.accentText, borderRadius: 12, paddingHorizontal: 7, paddingVertical: 2, fontSize: 13, fontWeight: "700" }, guideStep: { minHeight: 30, justifyContent: "center", borderBottomWidth: 1, borderBottomColor: colors.line }, guideText: { color: colors.ink, fontSize: 14, fontWeight: "600" },
}));
