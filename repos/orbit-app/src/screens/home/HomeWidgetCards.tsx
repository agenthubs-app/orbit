import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { z } from "zod";

import type { OrbitApiClient } from "../../api/client";
import type { HomeWidgetKey } from "../../api/contract/home-layout";
import { contactCardPageSchema, contactCardSummarySchema } from "../../api/schema/contact-card-page";
import { myEventsResponseSchema } from "../../api/schema/events-mine";
import { planV2SummaryResponseSchema } from "../../api/schema/plan-v2";
import { secretaryPreviewSchema } from "../../api/schema/secretary-preview";
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
import { nextRegisteredEvent, signedDelta } from "./home-widget-model";
import { useHomeRead, type HomeRead } from "./use-home-read";

type Navigate = (href: string) => void;
type GuideProgress = { completed: number; steps: { contacts: boolean; goal: boolean; plan: boolean } };
const scheduleSchema = z.object({ scheduleItems: z.array(z.unknown()) });
const scheduleRowSchema = z.object({ title: z.string(), startsAt: z.string(), state: z.enum(["upcoming", "ongoing", "ended", "cancelled"]) });
const picksSchema = z.object({ recommendations: z.array(z.object({ eventId: z.string(), title: z.string(), valueScore: z.number() }).passthrough()) });
const notesSchema = z.object({ notes: z.array(z.object({ id: z.string(), title: z.string() }).passthrough()) });

function Resource<T>({ state, children }: { state: HomeRead<T> & { retry: () => void }; children: (data: T) => React.ReactNode }) {
  const { styles } = useStyles(); const { t } = useOrbitLocale();
  if (state.kind === "loading") return <UiText style={styles.muted}>…</UiText>;
  if (state.kind === "error") return <View><UiText style={styles.muted}>{t("home.widgetUnavailable")}</UiText><Button label={t("home.readAgain")} onPress={state.retry} variant="ghost" size="sm" /></View>;
  return <>{children(state.data)}</>;
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

function TodayWidget({ navigate, guide }: { navigate: Navigate; guide: GuideProgress | null }) {
  const { timeZone } = useOrbitTimeZone(); const { styles } = useStyles(); const { t } = useOrbitLocale();
  const date = useMemo(() => todayKey(new Date(), timeZone), [timeZone]);
  const todo = useTodoPage(timeZone, date);
  const schedule = usePageCopyResource<unknown>("/api/schedule-items", value => {
    const parsed = scheduleSchema.safeParse(value); return parsed.success && parsed.data.scheduleItems.length === 0;
  }, { copy: { id: "home-schedule", variant: "main" }, accept: value => scheduleSchema.safeParse(value).success });
  const parsedSchedule = schedule.kind === "success" || schedule.kind === "empty" ? scheduleSchema.safeParse(schedule.data) : null;
  const scheduleRows = parsedSchedule?.success ? parsedSchedule.data.scheduleItems.flatMap(raw => {
    const parsed = scheduleRowSchema.safeParse(raw);
    return parsed.success && (parsed.data.state === "upcoming" || parsed.data.state === "ongoing") ? [parsed.data] : [];
  }).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)) : [];
  if (!todo.page) return <View>{guide ? <GuideSteps progress={guide} navigate={navigate} /> : null}<UiText style={styles.muted}>{todo.state.kind === "loading" ? "…" : t("home.widgetUnavailable")}</UiText><Button label={t("home.readAgain")} onPress={todo.refresh} variant="ghost" size="sm" /></View>;
  if (guide && todo.page.counts.nextMoves === 0 && todo.page.counts.decisions === 0 && scheduleRows.length === 0) return <GuideSteps progress={guide} navigate={navigate} />;
  return <View>
    {guide ? <GuideSteps progress={guide} navigate={navigate} /> : null}
    {todo.copy?.offline ? <UiText style={styles.stale}>{t("home.widgetSavedOffline")} · {todo.copy.lastSyncedAt ?? ""}</UiText> : null}
    <View style={styles.stats}><Stat value={todo.page.counts.nextMoves} label={t("home.widgetNextMove")} /><Stat value={todo.page.counts.decisions} label={t("home.widgetPending")} />{parsedSchedule?.success ? <Stat value={scheduleRows.length} label={t("home.schedule")} /> : <UiText style={styles.muted}>— {t("home.schedule")}</UiText>}</View>
    {todo.page.nextMoves.items[0] ? <LinkRow label={todo.page.nextMoves.items[0].titlePreview} href="/task?seg=todo" navigate={navigate} /> : null}
    {scheduleRows[0] ? <LinkRow label={scheduleRows[0].title} href="/task?seg=calendar" navigate={navigate} /> : null}
    {schedule.copy?.offline ? <UiText style={styles.stale}>{t("home.widgetSavedOffline")} · {schedule.copy.lastSyncedAt ?? ""}</UiText> : null}
    {Object.values(todo.page.sources).some(source => source === "unavailable" || source === "not_implemented") ? <UiText style={styles.muted}>{t("home.widgetUnavailable")}</UiText> : null}
    <TodayQuestionCard />
    <LinkRow label={t("home.widgetMore")} href="/task?seg=todo" navigate={navigate} />
  </View>;
}

function Stat({ value, label }: { value: number; label: string }) {
  const { styles } = useStyles(); return <View><UiText style={styles.statNumber}>{value}</UiText><UiText style={styles.muted}>{label}</UiText></View>;
}

function PlanWidget({ client, navigate }: { client: OrbitApiClient; navigate: Navigate }) {
  const { styles } = useStyles(); const { t } = useOrbitLocale();
  const state = useHomeRead(client, "/api/agent/plans/v2/summary", planV2SummaryResponseSchema);
  return <Resource state={state}>{data => data.current ? <View>
    <View style={styles.score}><UiText style={styles.scoreNumber}>{data.current.score.total}</UiText><UiText style={styles.muted}>/ 100</UiText><UiText style={data.current.score.todayDelta < 0 ? styles.negative : styles.delta}>{signedDelta(data.current.score.todayDelta)} {t("home.widgetTodayDelta")}</UiText></View>
    <UiText style={styles.muted}>{data.current.goal}</UiText>
    <UiText style={styles.muted}>{data.current.score.segments.map(segment => `${segment.key === "event" ? t("home.widgetEventSegment") : segment.shortLabel} ${segment.earned}/${segment.allocation}`).join(" · ")}</UiText>
    <LinkRow label={data.current.todayChance?.actionLabel ?? t("home.widgetMore")} href={data.current.todayChance?.href ?? "/task?seg=plan"} navigate={navigate} />
  </View> : <View><UiText style={styles.muted}>{t("home.widgetPlanEmptyDetail")}</UiText><Button label={t("home.widgetGoal")} onPress={() => navigate("/task?seg=plan")} variant="secondary" size="sm" /></View>}</Resource>;
}

function EventWidget({ client, navigate }: { client: OrbitApiClient; navigate: Navigate }) {
  const { styles } = useStyles(); const { t, language } = useOrbitLocale();
  const state = useHomeRead(client, "/api/events/mine?range=upcoming", myEventsResponseSchema);
  return <Resource state={state}>{data => {
    const event = nextRegisteredEvent(data.items, data.asOf ? new Date(data.asOf) : new Date());
    return event ? <View><UiText style={styles.eventTitle}>{event.emoji} {event.title}</UiText><UiText style={styles.muted}>{new Date(event.startsAt).toLocaleString(language === "ja" ? "ja-JP" : language === "zh" ? "zh-CN" : "en-US")} · {event.venue ?? ""}</UiText>
      {event.meetCount != null ? <UiText style={styles.muted}>{t("home.widgetMeetCount").replace("{count}", String(event.meetCount))}</UiText> : null}<LinkRow label={t("home.widgetMore")} href={event.href} navigate={navigate} /></View>
      : <View><UiText style={styles.muted}>{t("home.widgetEventEmptyDetail")}</UiText><Button label={t("home.widgetAssessEvent")} onPress={() => navigate("/events/assess")} variant="secondary" size="sm" /></View>;
  }}</Resource>;
}

function NetworkWidget({ client, navigate }: { client: OrbitApiClient; navigate: Navigate }) {
  const { styles } = useStyles(); const { t } = useOrbitLocale();
  const summary = useHomeRead(client, "/api/contacts/summary", contactCardSummarySchema);
  const page = useHomeRead(client, "/api/contacts/page?sort=added&limit=4", contactCardPageSchema);
  return <View><Resource state={summary}>{data => data.total > 0 ? <View style={styles.score}><UiText style={styles.scoreNumber}>{data.total}</UiText><UiText style={styles.muted}>{t("home.widgetPeopleUnit")}</UiText>{data.addedThisMonth !== undefined ? <UiText style={styles.delta}>+{data.addedThisMonth} {t("home.widgetAdded")}</UiText> : null}</View> : <UiText style={styles.muted}>{t("home.widgetNetworkEmptyDetail")}</UiText>}</Resource>
    <Resource state={page}>{data => data.items.length ? <View><View style={styles.people}>{data.items.slice(0, 4).map(person => <UiPressable key={person.id} accessibilityRole="link" accessibilityLabel={person.displayName} onPress={() => navigate(`/contacts/${encodeURIComponent(person.id)}`)} style={styles.person}><View style={styles.avatar}><UiText>{person.displayName.slice(0, 1)}</UiText></View><UiText numberOfLines={1} style={styles.personName}>{person.displayName}</UiText></UiPressable>)}</View><LinkRow label={t("home.widgetMore")} href="/contacts" navigate={navigate} /></View> : <Button label={t("home.widgetScanCard")} onPress={() => navigate("/contacts/new/scan")} variant="primary" size="sm" />}</Resource>
  </View>;
}

function SecretaryWidget({ client, actorId, navigate }: { client: OrbitApiClient; actorId: string; navigate: Navigate }) {
  const { styles } = useStyles(); const { t } = useOrbitLocale();
  const state = useHomeRead(client, "/api/inbox/secretary/preview", secretaryPreviewSchema);
  return <Resource state={state}>{data => data.actorId !== actorId || data.items.some(item => item.notification.actorId !== actorId)
    ? <UiText style={styles.muted}>{t("home.widgetUnavailable")}</UiText>
    : <View>{data.items.filter(item => ["event_deadline", "event_prep", "event_pick"].includes(item.kind)
      && item.notification.sources.some(source => source.sourceKind === item.kind)
      && item.notification.target.status === "available" && item.notification.target.href).slice(0, 3).map(item =>
        <LinkRow key={item.key} label={`${item.notification.title}${item.notification.sample ? ` · ${t("home.widgetSample")}` : ""}`} href={item.notification.target.href!} navigate={navigate} />)}
      {data.items.length ? <LinkRow label={t("home.widgetMore")} href="/inbox?filter=secretary" navigate={navigate} /> : <UiText style={styles.muted}>{t("home.widgetSecretaryEmptyDetail")}</UiText>}</View>}</Resource>;
}

function PendingWidget({ navigate, size }: { navigate: Navigate; size: "s" | "m" }) {
  const { timeZone } = useOrbitTimeZone(); const { styles } = useStyles(); const { t } = useOrbitLocale();
  const todo = useTodoPage(timeZone, todayKey(new Date(), timeZone));
  return todo.page ? <View><UiText style={styles.muted}>{t("home.widgetItemCount").replace("{count}", String(todo.page.counts.decisions))}</UiText>{todo.page.decisions.items.slice(0, size === "m" ? 2 : 1).map(item => <LinkRow key={item.key} label={item.titlePreview} href="/task?seg=todo" navigate={navigate} />)}</View>
    : <View><UiText style={styles.muted}>{t("home.widgetUnavailable")}</UiText><Button label={t("home.readAgain")} onPress={todo.refresh} variant="ghost" size="sm" /></View>;
}

function WeekWidget({ client, navigate, size }: { client: OrbitApiClient; navigate: Navigate; size: "s" | "m" }) {
  const { timeZone } = useOrbitTimeZone(); const { language, t } = useOrbitLocale(); const { styles } = useStyles();
  const range = calendarMeetingWindow(todayKey(new Date(), timeZone), "week", timeZone);
  if (!range) return <UiText style={styles.muted}>{t("home.widgetUnavailable")}</UiText>;
  return <WeekRows client={client} range={range} language={language} navigate={navigate} size={size} />;
}
function WeekRows({ client, range, language, navigate, size }: { client: OrbitApiClient; range: { from: string; to: string }; language: "ja" | "zh" | "en"; navigate: Navigate; size: "s" | "m" }) {
  const { styles } = useStyles(); const { t } = useOrbitLocale();
  const path = `/api/schedule-items?${new URLSearchParams({ scope: "calendar", from: range.from, to: range.to, language })}`;
  const state = useHomeRead(client, path, scheduleSchema);
  return <Resource state={state}>{data => {
    const rows = data.scheduleItems.flatMap(raw => { const item = scheduleRowSchema.safeParse(raw); return item.success && item.data.state !== "cancelled" ? [item.data] : []; }).sort((a,b) => Date.parse(a.startsAt)-Date.parse(b.startsAt));
    return <View>{rows.length ? rows.slice(0, size === "m" ? 2 : 1).map((item,index) => <LinkRow key={`${item.startsAt}:${index}`} label={item.title} href="/task?seg=calendar" navigate={navigate} />) : <UiText style={styles.muted}>{t("home.widgetEmpty")}</UiText>}
      <LinkRow label={t("home.widgetMore")} href="/task?seg=calendar" navigate={navigate} /></View>;
  }}</Resource>;
}
function PickWidget({ navigate, size }: { navigate: Navigate; size: "s" | "m" }) {
  const { styles } = useStyles(); const { t } = useOrbitLocale();
  const state = usePageCopyResource<unknown>("/api/recommendations/events?limit=3", value => {
    const parsed = picksSchema.safeParse(value); return parsed.success && parsed.data.recommendations.length === 0;
  }, { copy: { id: "event-recommendations", variant: "home" }, accept: value => picksSchema.safeParse(value).success });
  const parsed = state.kind === "success" || state.kind === "empty" ? picksSchema.safeParse(state.data) : null;
  if (!parsed?.success) return <View><UiText style={styles.muted}>{t("home.widgetUnavailable")}</UiText><Button label={t("home.readAgain")} onPress={state.refresh} variant="ghost" size="sm" /></View>;
  return <View>{state.copy?.offline ? <UiText style={styles.stale}>{t("home.widgetSavedOffline")} · {state.copy.lastSyncedAt ?? ""}</UiText> : null}
    {parsed.data.recommendations.length ? parsed.data.recommendations.slice(0, size === "m" ? 2 : 1).map(item => <LinkRow key={item.eventId} label={`${item.title} · ${item.valueScore}`} href={`/events/${encodeURIComponent(item.eventId)}`} navigate={navigate} />) : <UiText style={styles.muted}>{t("home.widgetEmpty")}</UiText>}
    <LinkRow label={t("home.widgetMore")} href="/events" navigate={navigate} /></View>;
}
function MemoWidget({ client, navigate, size }: { client: OrbitApiClient; navigate: Navigate; size: "s" | "m" }) {
  const { styles } = useStyles(); const { t } = useOrbitLocale(); const state = useHomeRead(client, "/api/notes?limit=3&noteKind=all", notesSchema);
  return <Resource state={state}>{data => <View>{data.notes.length ? data.notes.slice(0, size === "m" ? 2 : 1).map(note => <LinkRow key={note.id} label={note.title || t("home.widgetMemo")} href={`/notes/${encodeURIComponent(note.id)}`} navigate={navigate} />) : <UiText style={styles.muted}>{t("home.widgetEmpty")}</UiText>}
    <LinkRow label={t("home.widgetMore")} href="/task?seg=memo" navigate={navigate} /></View>}</Resource>;
}

export function HomeWidgetBody({ widget, size, client, actorId, navigate, guide }: { widget: HomeWidgetKey; size: "s" | "m"; client: OrbitApiClient; actorId: string; navigate: Navigate; guide: GuideProgress | null }) {
  switch (widget) {
    case "today": return <TodayWidget navigate={navigate} guide={guide} />;
    case "planScore": return <PlanWidget client={client} navigate={navigate} />;
    case "nextEvent": return <EventWidget client={client} navigate={navigate} />;
    case "network": return <NetworkWidget client={client} navigate={navigate} />;
    case "secretary": return <SecretaryWidget client={client} actorId={actorId} navigate={navigate} />;
    case "pending": return <PendingWidget size={size} navigate={navigate} />;
    case "week": return <WeekWidget client={client} size={size} navigate={navigate} />;
    case "eventPick": return <PickWidget size={size} navigate={navigate} />;
    case "memo": return <MemoWidget client={client} size={size} navigate={navigate} />;
    default: return null;
  }
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  muted: { color: colors.ink3Text, fontSize: 11, lineHeight: 18 }, stale: { color: colors.coralText, fontSize: 10, marginBottom: 6 },
  link: { minHeight: 32, justifyContent: "center", paddingVertical: 3 }, linkText: { color: colors.ink2, fontSize: 12 },
  stats: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }, statNumber: { color: colors.ink, fontSize: 22, fontWeight: "700" },
  score: { flexDirection: "row", alignItems: "baseline", gap: 4 }, scoreNumber: { color: colors.ink, fontSize: 34, fontWeight: "700" }, delta: { marginLeft: "auto", color: colors.accentText, fontSize: 11, fontWeight: "700" }, negative: { marginLeft: "auto", color: colors.coralText, fontSize: 11, fontWeight: "700" },
  eventTitle: { color: colors.ink, fontSize: 15, fontWeight: "700", lineHeight: 21 },
  people: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 }, person: { width: "24%", alignItems: "center", gap: 4 }, avatar: { width: 33, height: 33, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface2 }, personName: { color: colors.ink2, fontSize: 10 },
  guideHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, guideCount: { backgroundColor: colors.surface2, color: colors.accentText, borderRadius: 12, paddingHorizontal: 7, paddingVertical: 2, fontSize: 11, fontWeight: "700" }, guideStep: { minHeight: 30, justifyContent: "center", borderBottomWidth: 1, borderBottomColor: colors.line }, guideText: { color: colors.ink, fontSize: 12, fontWeight: "600" },
}));
