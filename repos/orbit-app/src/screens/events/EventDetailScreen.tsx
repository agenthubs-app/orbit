import { useOrbitTimeZone } from "../../time/OrbitTimeZoneProvider";
import { Ionicons } from "@expo/vector-icons";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ImageBackground,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import {
  eventGoalPath,
  eventOpeningLinePath,
  eventPostEventConfirmPath,
  eventPostEventPath,
  publicEventDetailPath,
  eventReadinessPath,
  eventRecommendationsPath
} from "../../api/endpoints";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import {
  eventDetailGoalReceiptSchema, eventDetailOpeningLineReceiptSchema, eventDetailReadinessSchema,
  eventDetailRecommendationsSchema, eventDetailReviewReceiptSchema, eventDetailReviewSchema,
  publicEventDetailSchema, type DetailReadiness, type DetailRecommendations, type DetailReview, type PublicEventDetail
} from "../../api/event-detail-contract";
import { validateApiResourceState } from "../../api/validated-resource-state";
import { DataCard } from "../../components/DataCard";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { layout, radius, spacing, typography, textStyles } from "../../design/tokens";
import { createControlStyles } from "../../design/controls";
import { createThemedStyles } from "../../design/theme";
import {
  type ApiResourceState,
  useApiResource
} from "../../hooks/useApiResource";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import {
  eventDetailHeroToView,
  eventDetailToSummary,
  type EventDetailAboutSectionView,
  type EventDetailAgendaItemView,
  type EventDetailAttendeePreviewView,
  type EventDetailSummary,
  eventGoalRequestFromReadiness,
  eventOpeningLineToView,
  eventPostEventConfirmRequestFromReview,
  eventPostEventConfirmToView,
  type EventPostEventConfirmView,
  eventPostEventReviewToView,
  type EventGoalSuggestionView,
  type EventRecommendedPersonView,
  eventReadinessToView,
  eventRecommendationsToView
} from "../../view-models/events";

const detailFont = Platform.select({ web: '-apple-system,BlinkMacSystemFont,"PingFang SC","Hiragino Sans GB","Noto Sans SC","Microsoft YaHei",sans-serif', ios: "System", default: "sans-serif" });

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "event";
  }

  return value ?? "event";
}

export function EventDetailScreen({ scopeKey, isScopeCurrent }: { scopeKey?: string; isScopeCurrent?: () => boolean } = {}) {
  const { colors, styles } = useStyles();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const eventId = firstParam(id);
  const { baseUrl } = useOrbitApiBaseUrl();
  const { signedIn } = useOrbitAuthSession();
  const scope = useMemo(() => ({ key: scopeKey, eventId }), [scopeKey, eventId]);
  const latest = useRef(scope);
  latest.current = scope;
  const currentParent = useRef(isScopeCurrent);
  currentParent.current = isScopeCurrent;
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const isCurrent = () => mounted.current && latest.current === scope && (currentParent.current?.() ?? true);
  const rawState = useApiResource<unknown>(publicEventDetailPath(eventId), () => false, { scopeKey: JSON.stringify([scopeKey ?? "public-event-detail", eventId]) });
  const state = validateApiResourceState(rawState, publicEventDetailSchema);
  const data = state.kind === "success" || state.kind === "empty" ? state.data : null;
  const { timeZone } = useOrbitTimeZone();
  const event = data ? publicEventDetailToSummary(data, timeZone) : null;
  const [personalizedRefreshKey, setPersonalizedRefreshKey] = useState(0);
  const sharing = useRef(false);
  const [sharePending, setSharePending] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const canGoBack = router.canGoBack();

  function refreshAll() {
    if (!isCurrent()) return;
    state.refresh();
    setPersonalizedRefreshKey(current => current + 1);
  }

  function navigate(href: Href) {
    if (isCurrent()) router.push(href);
  }

  async function shareEvent() {
    if (!isCurrent() || !event || !data || sharing.current) return;
    sharing.current = true;
    setSharePending(true);
    setShareError(null);
    const timing = eventDetailTiming(data.event.startsAt, data.event.endsAt, timeZone);
    try {
      await Share.share({ message: `${event.title}\n${timing.date} ${timing.time}\n${event.location || "地点待定"}` });
    } catch {
      if (isCurrent()) setShareError("暂时无法分享，请重试。");
    } finally {
      if (isCurrent()) { sharing.current = false; setSharePending(false); }
    }
  }

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <View style={styles.navigation}>
        <View style={styles.navigationSide}>
          <Pressable accessibilityRole="button" accessibilityLabel={canGoBack ? "返回" : "返回活动"}
            onPress={() => { if (isCurrent()) canGoBack ? router.back() : router.replace("/events"); }}
            style={({ pressed }) => [styles.backButton, pressed && styles.actionButtonPressed]}>
            <Ionicons name="chevron-back" color={colors.accent} size={18} />
            <Text style={styles.backLabel}>{canGoBack ? "返回" : "活动"}</Text>
          </Pressable>
        </View>
        <Text accessibilityRole="header" style={styles.navigationTitle}>活动详情</Text>
        <View style={[styles.navigationSide, styles.navigationRight]}>
          {event ? <Pressable accessibilityRole="button" accessibilityLabel="分享活动" disabled={sharePending}
            onPress={() => { void shareEvent(); }} style={({ pressed }) => [styles.shareButton, pressed && styles.actionButtonPressed]}>
            <Ionicons name="share-outline" size={22} color={colors.ink} />
          </Pressable> : null}
        </View>
      </View>
      <ScrollView testID="event-detail-scroll" automaticallyAdjustKeyboardInsets contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="interactive" keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}
        refreshControl={<RefreshControl onRefresh={refreshAll} refreshing={state.refreshing} tintColor={colors.accent} />}>
        {state.kind === "loading" ? <LoadingState /> : null}
        {state.kind === "offline" || state.kind === "failure" ? <View style={styles.stack}>
          <ErrorState message={state.error.message} title="暂时取不到活动详情" />
          <Pressable accessibilityRole="button" onPress={refreshAll} style={styles.inlineButton}><Text style={styles.inlineButtonText}>重新读取活动</Text></Pressable>
        </View> : null}
        {shareError ? <Text accessibilityRole="alert" style={styles.errorText}>{shareError}</Text> : null}
        {data && event ? <EventDetailCard baseUrl={baseUrl} data={data} onNavigate={navigate}
          personalizedModules={signedIn ? <AuthenticatedEventDetailModules eventId={event.id} key={event.id}
            refreshKey={personalizedRefreshKey} scopeKey={scopeKey ?? "event-detail"} isScopeCurrent={isCurrent} /> : null} /> : null}
      </ScrollView>
      {event ? (
        <EventRegistrationModule event={event} onRegister={() => {
          if (event.status !== "已结束" && event.status !== "已取消") navigate(`/events/${encodeURIComponent(event.id)}/register` as Href);
        }} />
      ) : null}
    </SafeAreaView>
  );
}

function publicEventDetailToSummary(data: PublicEventDetail, timeZone: string): EventDetailSummary {
  const event = eventDetailToSummary(data, timeZone);
  const canonical = data.event.sourceMetadata?.label === "event-core-postgres";
  // The public catalogue encodes its ended phase as cancelled. Do not apply
  // that compatibility rule to genuinely cancelled records from other sources.
  const ended = Date.parse(data.event.endsAt) <= Date.now() && (data.event.status !== "cancelled" || canonical);
  const status = ended ? "已结束" : event.status;
  const closed = status === "已结束" || status === "已取消";
  return {
    ...event,
    status,
    registrationActionLabel: closed ? `活动${status}` : event.registrationActionLabel,
    registrationDetail: closed ? "报名已关闭，仍可查看活动资料和参会者入口。" : event.registrationDetail,
    sourceLabel: canonical ? "主办方活动记录" : event.sourceLabel,
    relationshipContext: event.relationshipContext === "Published event context." ? "查看活动安排与参会信息。" : event.relationshipContext,
    preparation: event.preparation === "Review the event details and complete the event-scoped registration profile." ? "查看活动详情，并完善本次活动的报名资料。" : event.preparation,
    nextAction: event.nextAction === "Sign in and register before viewing the attendee list."
      ? closed ? "查看活动资料；如已参加，可继续复核会后记录。" : "登录并完成报名后，可查看完整参会者名单。"
      : event.nextAction,
    evidenceExcerpts: event.evidenceExcerpts.map(excerpt => canonical && excerpt === `Canonical event ${data.event.id}.` ? "活动信息来自主办方发布的记录。" : excerpt)
  };
}

function eventDetailTiming(startsAt: string, endsAt: string, timeZone: string) {
  const dateFormatter = new Intl.DateTimeFormat("zh-CN", { timeZone, month: "numeric", day: "numeric" });
  const weekdayFormatter = new Intl.DateTimeFormat("zh-CN", { timeZone, weekday: "short" });
  const timeFormatter = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const start = new Date(startsAt); const end = new Date(endsAt);
  const parts = dateFormatter.formatToParts(start);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? "";
  const date = `${value("month")}月${value("day")}日 ${weekdayFormatter.format(start)}`;
  const sameDay = dateFormatter.format(start) === dateFormatter.format(end);
  const endLabel = sameDay ? timeFormatter.format(end) : `${dateFormatter.format(end)} ${timeFormatter.format(end)}`;
  return { date, start: timeFormatter.format(start), time: `${timeFormatter.format(start)} – ${endLabel}` };
}

function assetUrl(baseUrl: string, path: string): string {
  if (/^https?:\/\//iu.test(path)) {
    return path;
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl.replace(/\/+$/u, "")}${normalizedPath}`;
}

function publicEventDetailStatus(status: string): string {
  const normalized = status.trim().toLowerCase();

  if (normalized === "已确认") return "活动已确认";

  if (normalized === "imported" || normalized === "scheduled") {
    return "可报名";
  }

  return status || "待确认";
}

function publicEventDetailSummary(summary: string): string {
  const normalized = summary.trim();

  if (!normalized || normalized === "Published event context.") {
    return "查看活动安排、参会信息和会前准备。";
  }

  return normalized;
}

function EventActionButton({
  accessibilityLabel,
  detail,
  icon,
  onPress,
  title
}: {
  accessibilityLabel: string;
  detail: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  title: string;
}) {
  const { colors, styles } = useStyles();
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        pressed ? styles.actionButtonPressed : null
      ]}
    >
      <View style={styles.actionIcon}>
        <Ionicons color={colors.accent} name={icon} size={18} />
      </View>
      <Text style={styles.actionTitle}>
        {title}
      </Text>
      <Text style={styles.actionDetail}>
        {detail}
      </Text>
    </Pressable>
  );
}

function EventDetailCard({
  baseUrl,
  data,
  onNavigate,
  personalizedModules
}: {
  baseUrl: string;
  data: PublicEventDetail;
  onNavigate: (href: Href) => void;
  personalizedModules: ReactNode;
}) {
  const { colors, styles } = useStyles();
  const { width, fontScale } = useWindowDimensions();
  const { timeZone } = useOrbitTimeZone();
  const event = publicEventDetailToSummary(data, timeZone);
  const hero = eventDetailHeroToView(event);
  const heroStatus = publicEventDetailStatus(hero.status);
  const heroSummary = publicEventDetailSummary(hero.summary);
  const attendeesHref = `/events/${encodeURIComponent(event.id)}/attendees` as Href;
  const partyHref = `/party?eventId=${encodeURIComponent(event.id)}` as Href;
  const timing = eventDetailTiming(data.event.startsAt, data.event.endsAt, timeZone);
  const narrow = width < 360 || fontScale >= 1.4;
  const attendeeCount = data.event.stats?.count ?? data.event.participantCount;
  const participantLabel = attendeeCount === undefined ? event.participantCountLabel : `${attendeeCount} 人已报名`;
  const organizerLabel = event.organizerName === "主办方待确认" ? "" : `${event.organizerName}主办`;

  return (
    <>
      <View style={styles.eventHero}>
        <ImageBackground
          testID="event-detail-cover"
          imageStyle={styles.eventHeroImage}
          source={{ uri: assetUrl(baseUrl, hero.coverPath) }}
          style={styles.eventHeroFrame}
        >
          <View style={styles.eventHeroTopRow}>
            <Text style={styles.eventStatusBadge}>{heroStatus}</Text>
          </View>
        </ImageBackground>
        <Text accessibilityRole="header" style={styles.eventHeroTitle}>{hero.title}</Text>
        <Text style={styles.eventHeroDetail}>{[organizerLabel, participantLabel].filter(Boolean).join(" · ")}</Text>
      </View>
      <View style={styles.infoGrid}>
        <View style={[styles.infoGridRow, narrow && styles.infoGridRowNarrow]}>
          <View style={[styles.infoTile, !narrow && styles.infoTileFirst, narrow && styles.infoTileNarrow]}>
            <Text style={styles.infoTileDetail}>日期</Text>
            <Text style={styles.infoTileTime}>{timing.date}</Text>
          </View>
          <View style={[styles.infoTile, !narrow && styles.infoTileSecond, narrow && styles.infoTileNext, narrow && styles.infoTileNarrow]}>
            <Text style={styles.infoTileDetail}>时间</Text>
            <Text style={styles.infoTileTime}>{timing.time}</Text>
          </View>
        </View>
        <View style={[styles.infoGridRow, styles.infoGridSecondRow, narrow && styles.infoGridRowNarrow]}>
          <View style={[styles.infoTile, !narrow && styles.infoTileFirst, narrow && styles.infoTileNarrow]}>
            <Text style={styles.infoTileDetail}>地点</Text>
            <Text style={styles.infoTileTitle}>{event.location || "地点待定"}</Text>
            {event.address && event.address !== event.location ? <Text style={styles.infoTileDetail}>{event.address}</Text> : null}
          </View>
          <EventOrganizerModule event={event} narrow={narrow} />
        </View>
      </View>
      <View style={styles.publicSection}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>活动介绍</Text>
        <Text style={styles.publicBody}>{heroSummary}</Text>
      </View>
      <EventAboutModule sections={data.event.about?.length ? event.aboutSections : []} />
      <EventAgendaModule agenda={data.event.agenda?.length ? event.agenda : event.agenda.map(item => ({ ...item, time: timing.start }))} />
      <View style={styles.attendeesSection}>
        <Pressable accessibilityRole="button" accessibilityLabel="查看参会者" onPress={() => onNavigate(attendeesHref)}
          style={({ pressed }) => [styles.attendeesLink, pressed && styles.actionButtonPressed]}>
          <Text style={styles.attendeesTitle}>参会者</Text>
          <View style={styles.attendeesCount}><Text style={styles.attendeesCountText}>{attendeeCount === undefined ? event.attendeeCountLabel : `${attendeeCount} 人`}</Text><Ionicons name="chevron-forward" size={14} color={colors.text3} /></View>
        </Pressable>
        {event.attendeePreview.length > 0 ? <View style={styles.attendeePreviewRow}>{event.attendeePreview.map(attendee => <EventAttendeePreviewPill attendee={attendee} key={attendee.id} />)}</View> : null}
      </View>
      <View style={styles.additionalDetails}>
      <EventActionButton accessibilityLabel="打开活动现场" title="现场" detail="签到和介绍" icon="ticket-outline" onPress={() => onNavigate(partyHref)} />
      <View style={styles.feeRow}><Text style={styles.infoTileDetail}>费用</Text><Text style={styles.attendeesTitle}>{event.feeLabel}</Text></View>
      <Text style={styles.registrationHint}>{event.registrationDetail}</Text>
      {event.sourceLabel || event.evidenceExcerpts.length > 0 ? (
        <DataCard detail={event.sourceLabel} title="来源证据">
          <View style={styles.stack}>
            {event.evidenceExcerpts.length > 0 ? (
              event.evidenceExcerpts.map((excerpt) => (
                <Text key={excerpt} style={styles.bodyText}>
                  {excerpt}
                </Text>
              ))
            ) : (
              <Text style={styles.bodyText}>这场活动有报名或导入来源记录。</Text>
            )}
          </View>
        </DataCard>
      ) : null}
      <DataCard detail={event.relationshipContext} title="会前重点">
        <Text style={styles.bodyText}>{event.preparation}</Text>
      </DataCard>
      {personalizedModules}
      <DataCard detail={event.nextAction} title="下一步" />
      </View>
    </>
  );
}

function AuthenticatedEventDetailModules({ eventId, refreshKey, scopeKey, isScopeCurrent }: {
  eventId: string; refreshKey: number; scopeKey: string; isScopeCurrent: () => boolean;
}) {
  const operationKey = JSON.stringify([scopeKey, eventId, refreshKey]);
  const [readinessAttempt, setReadinessAttempt] = useState(0);
  const [recommendationsAttempt, setRecommendationsAttempt] = useState(0);
  const [reviewAttempt, setReviewAttempt] = useState(0);
  const readinessRaw = useApiResource<unknown>(eventReadinessPath(eventId), () => false,
    { scopeKey: JSON.stringify([operationKey, "readiness", readinessAttempt]) });
  const recommendationsRaw = useApiResource<unknown>(eventRecommendationsPath(eventId, 3), () => false,
    { scopeKey: JSON.stringify([operationKey, "recommendations", recommendationsAttempt]) });
  const reviewRaw = useApiResource<unknown>(eventPostEventPath(eventId), () => false,
    { scopeKey: JSON.stringify([operationKey, "review", reviewAttempt]) });
  const readinessState = validateApiResourceState(readinessRaw, eventDetailReadinessSchema(eventId));
  const recommendationsState = validateApiResourceState(recommendationsRaw, eventDetailRecommendationsSchema(eventId));
  const postEventState = validateApiResourceState(reviewRaw, eventDetailReviewSchema(eventId));

  return (
    <>
      <EventReadinessModule
        eventId={eventId}
        scopeKey={operationKey}
        isScopeCurrent={isScopeCurrent}
        onGoalConfirmed={readinessState.refresh}
        state={{ ...readinessState, refresh: () => setReadinessAttempt(value => value + 1) }}
      />
      <EventRecommendationsModule
        eventId={eventId}
        scopeKey={operationKey}
        isScopeCurrent={isScopeCurrent}
        state={{ ...recommendationsState, refresh: () => setRecommendationsAttempt(value => value + 1) }}
      />
      <EventPostEventReviewModule
        eventId={eventId}
        scopeKey={operationKey}
        isScopeCurrent={isScopeCurrent}
        onConfirmed={postEventState.refresh}
        state={{ ...postEventState, refresh: () => setReviewAttempt(value => value + 1) }}
      />
    </>
  );
}

// Each of the three explicit writes owns one lock and abortable request. The
// opaque key changes on refresh; the parent also revokes route/session changes.
function useDetailWriteScope(scopeKey: string, isScopeCurrent: () => boolean) {
  const scope = useMemo(() => ({ scopeKey }), [scopeKey]);
  const latest = useRef(scope);
  latest.current = scope;
  const parent = useRef(isScopeCurrent);
  parent.current = isScopeCurrent;
  const mounted = useRef(true);
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; request.current?.abort(); request.current = null; };
  }, [scope]);
  const isCurrent = () => mounted.current && latest.current === scope && parent.current();
  return {
    isCurrent,
    start() {
      if (!isCurrent() || request.current) return null;
      const controller = new AbortController();
      request.current = controller;
      return controller;
    },
    owns(controller: AbortController) { return isCurrent() && request.current === controller && !controller.signal.aborted; },
    finish(controller: AbortController) { if (request.current === controller) request.current = null; }
  };
}

function EventPersonalNotice({ state, empty, labels, isCurrent }: {
  state: ApiResourceState<{ state: "success" | "empty" | "pending" }>; empty?: boolean;
  labels: readonly [string, string, string, string, string]; isCurrent: () => boolean;
}) {
  const { styles } = useStyles();
  const failed = state.kind === "failure" || state.kind === "offline";
  const data = state.kind === "success" || state.kind === "empty" ? state.data : null;
  const message = state.kind === "loading" ? labels[0] : failed ? labels[3]
    : data?.state === "pending" ? labels[1] : data?.state === "empty" || empty ? labels[2] : null;
  if (!message) return null;
  return <View style={styles.stack}>
    <Text accessibilityRole={failed ? "alert" : undefined} style={failed ? styles.errorText : styles.bodyText}>{message}</Text>
    {state.kind !== "loading" ? <Pressable accessibilityRole="button" onPress={() => { if (isCurrent()) state.refresh(); }}
      style={styles.inlineButton}><Text style={styles.inlineButtonText}>{labels[4]}</Text></Pressable> : null}
  </View>;
}

function EventRegistrationModule({
  event,
  onRegister
}: {
  event: EventDetailSummary;
  onRegister: () => void;
}) {
  const { styles } = useStyles();
  const closed = event.status === "已结束" || event.status === "已取消";

  return (
    <SafeAreaView edges={["bottom"]} style={styles.registrationFooter}>
      <View style={styles.registrationCard}>
      <Text style={styles.registrationFooterHint}>{closed ? "仍可查看活动资料与参会者入口" : "提交前请确认活动要求"}</Text>
      <Pressable
        accessibilityRole="button"
        disabled={closed}
        onPress={onRegister}
        style={({ pressed }) => [
          styles.primaryCta,
          closed ? styles.inlineButtonDisabled : null,
          pressed ? styles.actionButtonPressed : null
        ]}
      >
        <Text style={styles.primaryCtaText}>{event.registrationActionLabel}</Text>
      </Pressable>
      </View>
    </SafeAreaView>
  );
}

function EventAttendeePreviewPill({
  attendee
}: {
  attendee: EventDetailAttendeePreviewView;
}) {
  const { styles } = useStyles();
  return (
    <View style={styles.attendeePreviewPill}>
      <View style={styles.attendeePreviewAvatar}>
        <Text style={styles.attendeePreviewAvatarText}>{attendee.initial}</Text>
      </View>
      <View style={styles.attendeePreviewBody}>
        <Text style={styles.attendeePreviewName}>
          {attendee.name}
        </Text>
        {attendee.role ? (
          <Text style={styles.attendeePreviewRole}>
            {attendee.role}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function EventAboutModule({
  sections
}: {
  sections: EventDetailAboutSectionView[];
}) {
  const { styles } = useStyles();
  if (sections.length === 0) {
    return null;
  }

  return (
    <View>
      {sections.map((section, index) => (
        <View key={`${section.id}:${index}`} style={styles.publicSection}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>{section.title}</Text>
          <Text style={styles.publicBody}>{section.body}</Text>
        </View>
      ))}
    </View>
  );
}

function EventAgendaModule({
  agenda
}: {
  agenda: EventDetailAgendaItemView[];
}) {
  const { styles } = useStyles();
  if (agenda.length === 0) {
    return null;
  }

  return (
    <View style={styles.publicSection}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>当天安排</Text>
      <View style={styles.agendaStack}>
        {agenda.map((item, index) => (
          <View key={item.id} style={styles.agendaRow}>
            <Text style={styles.agendaTime}>{item.time}</Text>
            <View style={[styles.agendaRail, index > 0 && styles.agendaRailSecondary]} />
            <View style={styles.agendaBody}>
              <Text style={styles.agendaTitle}>{item.title}</Text>
              {item.description ? (
                <Text style={styles.agendaDescription}>{item.description}</Text>
              ) : null}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function EventOrganizerModule({ event, narrow }: { event: EventDetailSummary; narrow: boolean }) {
  const { styles } = useStyles();

  return (
    <View style={[styles.infoTile, !narrow && styles.infoTileSecond, narrow && styles.infoTileNext, narrow && styles.infoTileNarrow]}>
      <Text style={styles.infoTileDetail}>主办方</Text>
      <Text style={styles.infoTileTitle}>{event.organizerName}</Text>
    </View>
  );
}

// Exact service copy, not a language/keyword filter: “live music”, “provider”
// and other legitimate business language must remain unchanged.
function detailBusinessText(value: string, fallback = "") {
  const text = value.trim();
  const serviceCopy: Record<string, string> = {
    "Find live pilot partners": "寻找试点伙伴",
    "Find two AI workflow PoC or restaurant CRM pilot partners from generated attendees.": "从参会者中寻找两位 AI 工作流概念验证或餐饮 CRM 试点伙伴。",
    "Generated attendee intents include PoC, workflow, pilot, and CRM signals.": "参会者意向包含概念验证、工作流、试点和 CRM 需求。",
    "Map warm operator paths": "梳理熟人引荐路径",
    "Identify warm operator introduction paths among known contacts and partner-channel attendees.": "从熟人和合作渠道参会者中寻找可以引荐的业务伙伴。",
    "Generated roster tags include known-contact and partner-path signals.": "参会者标签包含熟人和合作渠道信息。",
    "Capture investor context": "了解投资人的反馈",
    "Collect investor-context feedback on the strongest generated relationship opportunities.": "围绕重点合作机会，收集投资人的反馈。",
    "Generated relationship records include investor, seed, or founder feedback context.": "关系记录包含投资人、种子轮或创始人的反馈背景。",
    "Review generated attendee intents": "查看参会者意向",
    "Check known-contact paths first": "先查看熟人引荐路径",
    "Review eligible recommendation pool": "查看可推荐的参会者",
    "Confirm the primary event goal": "确认本次活动的主要目标",
    "A source-backed goal is ready for operator review.": "活动目标已有来源信息，等待你复核。",
    "Review the generated attendee evidence attached to the primary goal.": "查看与当前目标相关的参会者来源信息。",
    "Select one generated goal before preparing a pre-event brief.": "先选择一个目标，再准备会前介绍。",
    "Choose a live storage goal or enter a concise event goal.": "选择一个建议目标，或写下本次活动的目标。",
    "Review the live storage readiness checklist before the event.": "活动开始前，再检查一次准备清单。",
    "Review the generated goal and readiness checklist before the event.": "活动开始前，复核目标和准备清单。",
    "Verify generated attendee records before setting an event goal.": "先核对参会者资料，再设置活动目标。",
    "Review the top live recommendation before using its opening line.": "使用开场白前，先查看推荐对象的资料。",
    "Review generated contact drafts before confirming any records.": "确认记录前，先复核联系人草稿。",
    "Review confirmed contacts before any formal Contacts write or follow-up send.": "正式保存联系人或发送跟进消息前，请再次复核已确认的联系人。",
    "Route any follow-up send through a separate confirmation guard before external action execution.": "发送跟进消息需要再次确认；本次确认不会发送消息。",
    "The event fixture overlaps with operator attendees and the active storage pilot relationship context.": "参会者和当前储能试点的合作需求相关。",
    "Local fixture rules connect the dinner to storage pilot operators and partner-path contacts.": "晚餐参会者中有储能试点负责人，以及可以引荐的合作伙伴。",
    "The event fixture includes operator investors, but the recommended preparation keeps evidence before outreach.": "参会者中有业务负责人和投资人，建议先核对信息，再发起联系。",
    "A primary event goal is set from deterministic local suggestions.": "已根据建议选定本次活动的主要目标。",
    "The mock keeps follow-up ownership pending so the operator can confirm it before the event.": "跟进负责人尚未确认，请在活动开始前确认。",
    "A deterministic local rule says the fixture has no time conflict.": "参考日程未见时间冲突，请再核对你的实际日程。",
    "Set a local mock goal before composing pre-event preparation.": "先设置活动目标，再准备会前介绍。",
    "The opening line can cite only local event roster evidence.": "开场白仅参考本次活动的参会者资料。",
    "The recommended action is a source-backed context check, not immediate outreach.": "建议先核对来源和背景，暂不发起联系。"
  };
  const records = /^(\d+) generated attendee records are available for goal planning\.$/u.exec(text);
  if (records) return `有 ${records[1]} 位参会者的资料可用于准备活动目标。`;
  const known = /^(\d+) generated attendees already map to known contacts\.$/u.exec(text);
  if (known) return `其中 ${known[1]} 位参会者已经是你的人脉。`;
  const eligible = /^(\d+) attendees are eligible for follow-up review\.$/u.exec(text);
  if (eligible) return `有 ${eligible[1]} 位参会者可供会后联系复核。`;
  return Object.prototype.hasOwnProperty.call(serviceCopy, text) ? serviceCopy[text]! : (text || fallback);
}

function detailReadinessToView(data: DetailReadiness) {
  const view = eventReadinessToView(data);
  return {
    ...view,
    canConfirmGoal: data.goal !== null,
    goal: detailBusinessText(data.goal?.intent ?? "", view.goal),
    checklist: view.checklist.map((item, index) => ({ ...item,
      title: detailBusinessText(data.readinessChecklist[index]!.label, item.title),
      detail: detailBusinessText(data.readinessChecklist[index]!.rationale, item.detail)
    })),
    nextAction: detailBusinessText(data.preparationState.nextPreparationStep || data.nextAction, view.nextAction),
    suggestedGoals: data.suggestedGoals.slice(0, 3).map(goal => ({
      id: goal.goalId, title: detailBusinessText(goal.label), goalText: detailBusinessText(goal.intent), detail: detailBusinessText(goal.rationale),
      selected: goal.goalId === data.goal?.selectedSuggestionId
    }))
  };
}

function detailRecommendationsToView(data: DetailRecommendations) {
  const view = eventRecommendationsToView(data);
  return { ...view, nextAction: detailBusinessText(data.nextAction, view.nextAction), people: view.people.map((person, index) => {
    const source = data.recommendations[index]!;
    return { ...person, opener: detailBusinessText(source.openingLine.text, person.opener),
      reason: source.reasons.map(reason => detailBusinessText(reason)).filter(Boolean).join("\n") || person.reason,
      suggestedAction: detailBusinessText(source.recommendedAction, person.suggestedAction) };
  }) };
}

function detailPostEventReviewToView(data: DetailReview) {
  const view = eventPostEventReviewToView(data);
  return { ...view, nextAction: detailBusinessText(data.nextAction, view.nextAction), contacts: view.contacts.map((contact, index) => {
    const source = data.contacts[index]!;
    return { ...contact, followUpDraft: detailBusinessText(source.followUpSuggestion.messageDraft, contact.followUpDraft),
      headline: detailBusinessText(source.summary.headline, contact.headline), whyNow: detailBusinessText(source.summary.whyNow, contact.whyNow),
      tags: source.tags.length ? [...new Set(source.tags.map(tag => detailBusinessText(tag.label)))].slice(0, 4) : contact.tags };
  }) };
}

function EventReadinessModule({
  eventId,
  scopeKey,
  isScopeCurrent,
  onGoalConfirmed,
  state
}: {
  eventId: string;
  scopeKey: string;
  isScopeCurrent: () => boolean;
  onGoalConfirmed: () => void;
  state: ApiResourceState<DetailReadiness>;
}) {
  const { colors, styles } = useStyles();
  const client = useOrbitApiClient({ scopeKey });
  const operation = useDetailWriteScope(scopeKey, isScopeCurrent);
  const [goalPending, setGoalPending] = useState(false);
  const [goalDraft, setGoalDraft] = useState("");
  const dirtyDraft = useRef(false);
  const draftRevision = useRef(0);
  const [goalFeedback, setGoalFeedback] = useState<string | null>(null);
  const [goalError, setGoalError] = useState<string | null>(null);
  const [selectedSuggestionId, setSelectedSuggestionId] = useState<string | null>(
    null
  );
  const view =
    (state.kind === "success" || state.kind === "empty") && state.data.state !== "pending"
      ? detailReadinessToView(state.data)
      : null;

  useEffect(() => { setGoalPending(false); setGoalFeedback(null); setGoalError(null); }, [scopeKey]);
  useEffect(() => {
    if (!view || dirtyDraft.current) {
      return;
    }

    setGoalDraft(view.canConfirmGoal ? view.goal : "");
    setSelectedSuggestionId(view.selectedSuggestionId || null);
  }, [eventId, view?.canConfirmGoal, view?.goal, view?.selectedSuggestionId]);

  const notice = <EventPersonalNotice state={state} isCurrent={operation.isCurrent}
    labels={["正在读取会前准备", "会前准备还在更新", "还没有会前准备记录", "暂时取不到会前准备", "重新读取会前准备"]} />;
  if (!view) return <DataCard title="会前准备度">{notice}</DataCard>;

  const readinessView = view;

  function chooseSuggestedGoal(suggestion: EventGoalSuggestionView) {
    if (!operation.isCurrent()) return;
    dirtyDraft.current = true;
    draftRevision.current++;
    setGoalDraft(suggestion.goalText);
    setGoalFeedback(null);
    setGoalError(null);
    setSelectedSuggestionId(suggestion.id);
  }

  async function confirmGoal() {
    if (!operation.isCurrent()) return;
    const request = eventGoalRequestFromReadiness({ ...readinessView, selectedSuggestionId: selectedSuggestionId ?? "" }, {
      goalText: goalDraft,
      selectedSuggestionId
    });

    if (!request) {
      setGoalError("先写一个这场活动的目标。");
      return;
    }

    const controller = operation.start();
    if (!controller) return;
    const revision = draftRevision.current;
    setGoalPending(true);
    setGoalFeedback(null);
    setGoalError(null);

    try {
      const result = await client.put<unknown>(eventGoalPath(eventId), { body: request, signal: controller.signal });
      if (!operation.owns(controller)) return;
      const receipt = result.success && result.status >= 200 && result.status < 300
        ? eventDetailGoalReceiptSchema(eventId, request).safeParse(result.data) : null;
      if (receipt?.success) {
        if (draftRevision.current === revision) {
          dirtyDraft.current = false;
          setGoalDraft(detailBusinessText(receipt.data.acceptedGoalText));
          setSelectedSuggestionId(receipt.data.goal.selectedSuggestionId);
          setGoalFeedback("活动目标已确认。");
        }
        onGoalConfirmed();
      } else setGoalError("活动目标暂时未能确认，请重试。");
    } catch {
      if (operation.owns(controller)) setGoalError("活动目标暂时未能确认，请重试。");
    } finally {
      if (operation.owns(controller)) { operation.finish(controller); setGoalPending(false); }
    }
  }

  return (
    <DataCard detail={`${view.stateLabel} · ${view.scoreLabel}`} title="会前准备度">
      {notice}
      <View style={styles.readinessGoal}>
        <Ionicons color={colors.accent} name="flag-outline" size={17} />
        <View style={styles.readinessGoalBody}>
          <Text style={styles.bodyText}>{view.goal}</Text>
          {view.suggestedGoals.length > 0 ? (
            <View style={styles.goalSuggestionStack}>
              {view.suggestedGoals.map((suggestion) => {
                const selected = selectedSuggestionId === suggestion.id;

                return (
                  <Pressable
                    accessibilityRole="button"
                    key={suggestion.id}
                    onPress={() => chooseSuggestedGoal(suggestion)}
                    style={({ pressed }) => [
                      styles.goalSuggestionCard,
                      selected ? styles.goalSuggestionCardSelected : null,
                      pressed ? styles.actionButtonPressed : null
                    ]}
                  >
                    <View style={styles.goalSuggestionHeader}>
                      <Text
                        style={[
                          styles.goalSuggestionTitle,
                          selected ? styles.goalSuggestionTitleSelected : null
                        ]}
                      >
                        {suggestion.title}
                      </Text>
                      <Text
                        style={[
                          styles.goalSuggestionActionText,
                          selected ? styles.goalSuggestionActionTextSelected : null
                        ]}
                      >
                        {selected ? "已选" : "用这个目标"}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.goalSuggestionGoal,
                        selected ? styles.goalSuggestionGoalSelected : null
                      ]}
                    >
                      {suggestion.goalText}
                    </Text>
                    {suggestion.detail ? (
                      <Text
                        style={[
                          styles.goalSuggestionDetail,
                          selected ? styles.goalSuggestionDetailSelected : null
                        ]}
                      >
                        {suggestion.detail}
                      </Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          <View style={styles.goalEditor}>
            <Text style={styles.goalInputLabel}>自定义目标</Text>
            <TextInput
              accessibilityLabel="自定义活动目标"
              multiline
              onChangeText={(value) => {
                if (!operation.isCurrent()) return;
                dirtyDraft.current = true;
                draftRevision.current++;
                setGoalDraft(value);
                setGoalFeedback(null);
                setGoalError(null);
                setSelectedSuggestionId(null);
              }}
              placeholder="写清楚这场活动想换到什么关系结果"
              placeholderTextColor={colors.text4}
              style={styles.goalInput}
              textAlignVertical="top"
              value={goalDraft}
            />
          </View>
          {view.canConfirmGoal || goalDraft.trim() ? (
            <Pressable
              accessibilityRole="button"
              disabled={goalPending}
              onPress={() => {
                void confirmGoal();
              }}
              style={({ pressed }) => [
                styles.inlineButton,
                pressed ? styles.actionButtonPressed : null,
                goalPending ? styles.inlineButtonDisabled : null
              ]}
            >
              <Ionicons
                color={colors.accent}
                name="checkmark-outline"
                size={14}
              />
              <Text style={styles.inlineButtonText}>
                {goalPending ? "确认中" : "确认目标"}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      {goalFeedback ? <Text style={styles.feedbackText}>{goalFeedback}</Text> : null}
      {goalError ? <Text style={styles.errorText}>{goalError}</Text> : null}
      <View style={styles.stack}>
        {view.checklist.map((item) => (
          <View key={item.id} style={styles.checklistRow}>
            <View style={styles.checklistStatus}>
              <Text style={styles.checklistStatusText}>{item.statusLabel}</Text>
            </View>
            <View style={styles.checklistBody}>
              <Text style={styles.checklistTitle}>{item.title}</Text>
              <Text style={styles.checklistDetail}>{item.detail}</Text>
              <Text style={styles.checklistOwner}>{item.ownerLabel}</Text>
            </View>
          </View>
        ))}
      </View>
      <Text style={styles.nextHint}>{view.nextAction}</Text>
    </DataCard>
  );
}

function EventRecommendationsModule({
  eventId,
  scopeKey,
  isScopeCurrent,
  state
}: {
  eventId: string;
  scopeKey: string;
  isScopeCurrent: () => boolean;
  state: ApiResourceState<DetailRecommendations>;
}) {
  const { colors, styles } = useStyles();
  const client = useOrbitApiClient({ scopeKey });
  const operation = useDetailWriteScope(scopeKey, isScopeCurrent);
  const [openersByPersonId, setOpenersByPersonId] = useState<
    Record<string, string>
  >({});
  const [pendingOpeningLineId, setPendingOpeningLineId] = useState<string | null>(
    null
  );
  const [openingLineStatus, setOpeningLineStatus] = useState<
    Record<string, string>
  >({});
  const [openingLineError, setOpeningLineError] = useState<string | null>(null);
  useEffect(() => {
    setOpenersByPersonId({}); setOpeningLineStatus({}); setOpeningLineError(null); setPendingOpeningLineId(null);
  }, [scopeKey]);

  const view = (state.kind === "success" || state.kind === "empty") && state.data.state === "success"
    ? detailRecommendationsToView(state.data) : null;
  if (!view || view.people.length === 0) return <DataCard title="推荐认识的人">
    <EventPersonalNotice state={state} empty={view?.people.length === 0} isCurrent={operation.isCurrent}
      labels={["正在读取推荐对象", "推荐对象还在准备中", "暂无推荐对象", "暂时取不到推荐对象", "重新读取推荐对象"]} />
  </DataCard>;

  async function refreshOpeningLine(person: EventRecommendedPersonView) {
    const controller = operation.start();
    if (!controller) return;
    setPendingOpeningLineId(person.id);
    setOpeningLineError(null);

    try {
      const result = await client.post<unknown>(eventOpeningLinePath(eventId, person.attendeeId, "context_question"), {
        body: { attendeeId: person.attendeeId, style: "context_question" }, signal: controller.signal
      });
      if (!operation.owns(controller)) return;
      const receipt = result.success && result.status >= 200 && result.status < 300
        ? eventDetailOpeningLineReceiptSchema(eventId, person).safeParse(result.data) : null;
      if (receipt?.success) {
        const refreshed = eventOpeningLineToView(receipt.data);
        setOpenersByPersonId(current => ({ ...current, [person.id]: detailBusinessText(receipt.data.openingLine.text, refreshed.opener) }));
        setOpeningLineStatus(current => ({ ...current, [person.id]: refreshed.statusLabel }));
      } else setOpeningLineError("暂时没能生成新的开场白，请重试。");
    } catch {
      if (operation.owns(controller)) setOpeningLineError("暂时没能生成新的开场白，请重试。");
    } finally {
      if (operation.owns(controller)) { operation.finish(controller); setPendingOpeningLineId(null); }
    }
  }

  return (
    <DataCard detail={view.nextAction} title="推荐认识的人">
      <View style={styles.stack}>
        {view.people.map((person) => (
          <View key={person.id} style={styles.recommendationRow}>
            <View style={styles.recommendationPersonHeader}>
              <RecommendedPersonAvatar
                initial={person.name.slice(0, 1)}
                rankLabel={person.rankLabel}
              />
              <View style={styles.recommendationPersonBody}>
                <View style={styles.recommendationHeader}>
                  <Text style={styles.recommendationName}>{person.name}</Text>
                  <Text style={styles.scoreLabel}>{person.scoreLabel}</Text>
                </View>
                {person.organizationRole ? (
                  <Text style={styles.recommendationMeta}>
                    {person.organizationRole}
                  </Text>
                ) : null}
              </View>
            </View>
            <Text style={styles.checklistDetail}>{person.reason}</Text>
            <View style={styles.openingLineBox}>
              <Ionicons color={colors.accent} name="chatbubble-ellipses-outline" size={16} />
              <View style={styles.openingLineBody}>
                <Text style={styles.openingLineText}>
                  {openersByPersonId[person.id] ?? person.opener}
                </Text>
                <View style={styles.openingLineFooter}>
                  {openingLineStatus[person.id] ? (
                    <Text style={styles.openingLineStatus}>
                      {openingLineStatus[person.id]}
                    </Text>
                  ) : (
                    <Text style={styles.openingLineStatus}>可现场直接使用</Text>
                  )}
                  <Pressable
                    accessibilityRole="button"
                    disabled={pendingOpeningLineId !== null}
                    onPress={() => {
                      void refreshOpeningLine(person);
                    }}
                    style={({ pressed }) => [
                      styles.inlineButton,
                      pressed ? styles.actionButtonPressed : null,
                      pendingOpeningLineId !== null
                        ? styles.inlineButtonDisabled
                        : null
                    ]}
                  >
                    <Ionicons
                      color={colors.accent}
                      name="refresh-outline"
                      size={14}
                    />
                    <Text style={styles.inlineButtonText}>
                      {pendingOpeningLineId === person.id ? "生成中" : "换一句"}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
            <Text style={styles.nextHint}>{person.suggestedAction}</Text>
          </View>
        ))}
      </View>
      {openingLineError ? (
        <Text style={styles.errorText}>{openingLineError}</Text>
      ) : null}
    </DataCard>
  );
}

function RecommendedPersonAvatar({
  initial,
  rankLabel
}: {
  initial: string;
  rankLabel: string;
}) {
  const { styles } = useStyles();
  return (
    <View style={styles.recommendationAvatarWrap}>
      <View style={styles.recommendationAvatar}>
        <Text style={styles.recommendationAvatarText}>{initial || "?"}</Text>
      </View>
      <Text numberOfLines={1} style={styles.recommendationAvatarRank}>
        {rankLabel}
      </Text>
    </View>
  );
}

function EventPostEventReviewModule({
  eventId,
  scopeKey,
  isScopeCurrent,
  onConfirmed,
  state
}: {
  eventId: string;
  scopeKey: string;
  isScopeCurrent: () => boolean;
  onConfirmed: () => void;
  state: ApiResourceState<DetailReview>;
}) {
  const { colors, styles } = useStyles();
  const client = useOrbitApiClient({ scopeKey });
  const operation = useDetailWriteScope(scopeKey, isScopeCurrent);
  const router = useRouter();
  const [confirmPending, setConfirmPending] = useState(false);
  const [confirmResult, setConfirmResult] =
    useState<EventPostEventConfirmView | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  useEffect(() => { setConfirmPending(false); setConfirmResult(null); setConfirmError(null); }, [scopeKey]);

  const data = (state.kind === "success" || state.kind === "empty") && state.data.state === "success" ? state.data : null;
  const view = data ? detailPostEventReviewToView(data) : null;
  const notice = <EventPersonalNotice state={state} empty={view?.contacts.length === 0} isCurrent={operation.isCurrent}
    labels={["正在读取会后复核", "会后资料还在准备中", "暂无会后复核候选", "暂时取不到会后复核", "重新读取会后复核"]} />;

  async function confirmPostEventContacts() {
    if (!operation.isCurrent() || !view || !data) return;
    const request = eventPostEventConfirmRequestFromReview(view);

    if (!request) {
      setConfirmError("这场活动暂时没有可确认的候选。");
      return;
    }

    const controller = operation.start();
    if (!controller) return;
    setConfirmPending(true);
    setConfirmError(null);
    setConfirmResult(null);

    try {
      const result = await client.post<unknown>(eventPostEventConfirmPath(eventId), { body: request, signal: controller.signal });
      if (!operation.owns(controller)) return;
      const receipt = result.success && result.status >= 200 && result.status < 300
        ? eventDetailReviewReceiptSchema(eventId, data.reviewId, request.contactDraftIds).safeParse(result.data) : null;
      if (receipt?.success) {
        const confirmed = eventPostEventConfirmToView(receipt.data);
        setConfirmResult({ ...confirmed, nextAction: detailBusinessText(receipt.data.nextAction, confirmed.nextAction) });
        onConfirmed();
      } else setConfirmError("候选暂时未能确认，请重试。");
    } catch {
      if (operation.owns(controller)) setConfirmError("候选暂时未能确认，请重试。");
    } finally {
      if (operation.owns(controller)) { operation.finish(controller); setConfirmPending(false); }
    }
  }

  return (
    <DataCard
      detail={view ? `${view.stateLabel} · ${view.contactCountLabel}` : ""}
      title="会后复核"
    >
      {notice}
      <View style={styles.stack}>
        {view?.contacts.map((contact) => (
          <View key={contact.id} style={styles.postEventRow}>
            <View style={styles.recommendationHeader}>
              <Text style={styles.recommendationName}>{contact.name}</Text>
              <Text style={styles.scoreLabel}>{contact.urgencyLabel}</Text>
            </View>
            {contact.organizationRole ? (
              <Text style={styles.recommendationMeta}>
                {contact.organizationRole}
              </Text>
            ) : null}
            <Text style={styles.checklistTitle}>{contact.headline}</Text>
            <Text style={styles.checklistDetail}>{contact.whyNow}</Text>
            <View style={styles.postEventTagRow}>
              {contact.tags.map((tag) => (
                <Text key={`${contact.id}:${tag}`} style={styles.postEventTag}>
                  {tag}
                </Text>
              ))}
            </View>
            <View style={styles.postEventDraftBox}>
              <Ionicons
                color={colors.accent}
                name="mail-outline"
                size={15}
              />
              <Text style={styles.openingLineText}>{contact.followUpDraft}</Text>
            </View>
          </View>
        ))}
      </View>
      {view?.contacts.length ? <View style={styles.postEventFooter}>
        <Pressable
          accessibilityRole="button"
          disabled={confirmPending}
          onPress={() => {
            void confirmPostEventContacts();
          }}
          style={({ pressed }) => [
            styles.inlineButton,
            pressed ? styles.actionButtonPressed : null,
            confirmPending ? styles.inlineButtonDisabled : null
          ]}
        >
          <Ionicons color={colors.accent} name="checkmark-done-outline" size={14} />
          <Text style={styles.inlineButtonText}>
            {confirmPending ? "确认中" : "确认这些候选"}
          </Text>
        </Pressable>
        <Text style={[styles.openingLineStatus, styles.postEventSafety]}>
          {confirmResult?.confirmedCountLabel ?? "确认后不会发送消息"}
        </Text>
      </View> : null}
      {confirmResult ? (
        <View style={styles.confirmResultBox}>
          <Text style={styles.feedbackText}>{confirmResult.feedback}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              if (operation.isCurrent()) router.push(confirmResult.reviewQueueHref as Href);
            }}
            style={({ pressed }) => [
              styles.inlineButton,
              pressed ? styles.actionButtonPressed : null
            ]}
          >
            <Ionicons color={colors.accent} name="people-outline" size={14} />
            <Text style={styles.inlineButtonText}>
              {confirmResult.reviewQueueLabel}
            </Text>
          </Pressable>
        </View>
      ) : null}
      {confirmError ? <Text style={styles.errorText}>{confirmError}</Text> : null}
      {confirmResult || view ? <Text style={styles.nextHint}>{confirmResult?.nextAction ?? view?.nextAction}</Text> : null}
    </DataCard>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.surface },
  navigation: { flexDirection: "row", alignItems: "center", minHeight: 48, paddingHorizontal: 16 },
  navigationSide: { width: "25%", minWidth: 44, flexShrink: 1 },
  navigationRight: { alignItems: "flex-end" },
  navigationTitle: { flex: 1, minWidth: 0, textAlign: "center", color: colors.ink, fontFamily: detailFont, fontSize: 15, fontWeight: "800", lineHeight: 20 },
  backButton: { flexDirection: "row", alignItems: "center", minHeight: 44, minWidth: 44, alignSelf: "flex-start", maxWidth: "100%" },
  backLabel: { color: colors.accent, fontFamily: detailFont, fontSize: 15, fontWeight: "600", lineHeight: 21, flexShrink: 1 },
  shareButton: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  content: { alignSelf: "center", width: "100%", maxWidth: layout.contentMax, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 },
  publicSection: { marginTop: 14, gap: 4 },
  sectionTitle: { color: colors.ink, fontFamily: detailFont, fontSize: 15, fontWeight: "800", lineHeight: 20 },
  publicBody: { color: colors.text2, fontFamily: detailFont, fontSize: 14, lineHeight: 22 },
  infoGridRow: { flexDirection: "row" },
  infoGridRowNarrow: { flexDirection: "column" },
  infoGridSecondRow: { borderTopColor: colors.border2, borderTopWidth: 1 },
  infoTileFirst: { borderRightColor: colors.border, borderRightWidth: 1, paddingRight: 12 },
  infoTileSecond: { paddingLeft: 16 },
  infoTileNext: { borderTopColor: colors.border2, borderTopWidth: 1 },
  infoTileNarrow: { width: "100%" },
  infoTileTime: { color: colors.ink, fontFamily: detailFont, fontSize: 16, fontWeight: "800", lineHeight: 22, letterSpacing: -0.16 },
  agendaTitle: { color: colors.ink, fontFamily: detailFont, fontSize: 14, fontWeight: "700", lineHeight: 20 },
  agendaDescription: { color: colors.text3, fontFamily: detailFont, fontSize: 12, lineHeight: 18, marginTop: 1 },
  agendaRailSecondary: { opacity: 0.3 },
  attendeesSection: { marginTop: 8, borderTopColor: colors.border, borderTopWidth: 1 },
  attendeesLink: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, minHeight: 44, paddingVertical: 11 },
  attendeesTitle: { color: colors.ink, fontFamily: detailFont, fontSize: 14, fontWeight: "600", lineHeight: 20 },
  attendeesCount: { flexDirection: "row", alignItems: "center", gap: 5, flexShrink: 1 },
  attendeesCountText: { color: colors.text3, fontFamily: detailFont, fontSize: 14, lineHeight: 20, flexShrink: 1 },
  additionalDetails: { gap: 16, marginTop: 12 },
  feeRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 12 },
  registrationFooter: { backgroundColor: colors.surface, borderTopColor: colors.border, borderTopWidth: 1, flexShrink: 0 },
  registrationFooterHint: { color: colors.text4, fontFamily: detailFont, fontSize: 11, lineHeight: 16, textAlign: "center" },
  actionButton: {
    ...createControlStyles(colors).secondaryButton,
    flexDirection: "row",
    flexWrap: "wrap",
    minWidth: 120,
    gap: spacing.sm
  },
  actionButtonPressed: {
    opacity: 0.86,
    transform: [{ translateY: 0.5 }]
  },
  actionDetail: {
    color: colors.text3,
    textAlign: "center",
    ...textStyles.small
  },
  actionGrid: {
    flexDirection: "row",
    gap: spacing.sm
  },
  actionIcon: {
    alignItems: "center",
    backgroundColor: colors.accentSofter,
    borderRadius: radius.pill,
    height: 38,
    justifyContent: "center",
    width: 38
  },
  actionTitle: {
    color: colors.ink,
    textAlign: "center",
    ...textStyles.listTitle
  },
  aboutSectionBody: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0
  },
  aboutSectionIcon: {
    alignItems: "center",
    backgroundColor: colors.accentSofter,
    borderRadius: radius.pill,
    height: 34,
    justifyContent: "center",
    width: 34
  },
  aboutSectionRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.md,
    backgroundColor: "transparent",
    paddingVertical: spacing.md
  },
  agendaBody: {
    flex: 1,
    minWidth: 0,
    paddingBottom: 0
  },
  agendaDot: {
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    borderWidth: 2,
    height: 11,
    width: 11
  },
  agendaDotActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent
  },
  agendaHeader: {
    alignItems: "baseline",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  agendaLine: {
    backgroundColor: colors.border2,
    flex: 1,
    marginTop: spacing.xs,
    width: 2
  },
  agendaRail: {
    alignSelf: "stretch",
    width: 2,
    backgroundColor: colors.accent,
    borderRadius: 1
  },
  agendaRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 14,
    paddingVertical: 6
  },
  agendaStack: {
    gap: 0
  },
  agendaTime: {
    color: colors.ink,
    fontFamily: detailFont,
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 20,
    minWidth: 44,
    flexShrink: 0,
    letterSpacing: -0.14
  },
  attendeePreviewAvatar: {
    alignItems: "center",
    backgroundColor: colors.ink,
    borderRadius: radius.pill,
    height: 30,
    justifyContent: "center",
    width: 30
  },
  attendeePreviewAvatarText: {
    color: colors.onAccent,
    fontSize: typography.caption,
    fontWeight: "800",
    lineHeight: 15
  },
  attendeePreviewBody: {
    flex: 1,
    minWidth: 0
  },
  attendeePreviewName: {
    color: colors.ink,
    fontSize: typography.caption,
    fontWeight: "800",
    lineHeight: 16
  },
  attendeePreviewPill: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    maxWidth: "100%",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs
  },
  attendeePreviewRole: {
    color: colors.text3,
    fontSize: typography.caption,
    lineHeight: 15
  },
  attendeePreviewRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  bodyText: {
    color: colors.text,
    ...textStyles.body
  },
  checklistBody: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0
  },
  checklistDetail: {
    color: colors.text2,
    fontSize: typography.small,
    lineHeight: 19
  },
  checklistOwner: {
    color: colors.text4,
    fontSize: typography.caption,
    fontWeight: "600",
    lineHeight: 16
  },
  checklistRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.md,
    backgroundColor: "transparent",
    paddingVertical: spacing.md
  },
  checklistStatus: {
    backgroundColor: colors.liveSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 5
  },
  checklistStatusText: {
    color: colors.live,
    fontSize: typography.caption,
    fontWeight: "700",
    lineHeight: 14
  },
  checklistTitle: {
    color: colors.ink,
    ...textStyles.listTitle
  },
  eventHero: {
    backgroundColor: "transparent"
  },
  eventHeroBody: {
    paddingVertical: spacing.md
  },
  eventHeroDetail: {
    color: colors.text3,
    fontFamily: detailFont,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4
  },
  eventHeroFrame: {
    backgroundColor: colors.surface3,
    justifyContent: "flex-end",
    padding: 12,
    height: 96,
    borderRadius: 12,
    overflow: "hidden"
  },
  eventHeroImage: {
    borderRadius: 12
  },
  eventHeroScrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.28)"
  },
  eventHeroText: {
    gap: spacing.sm
  },
  eventHeroTitle: {
    color: colors.ink,
    fontFamily: detailFont,
    fontSize: 24,
    fontWeight: "900",
    lineHeight: 30,
    letterSpacing: -0.48,
    marginTop: 14
  },
  eventHeroTopRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "flex-start"
  },
  eventStatusBadge: {
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: 6,
    color: colors.imageBadgeText,
    fontFamily: detailFont,
    fontSize: 11,
    fontWeight: "700",
    overflow: "hidden",
    paddingHorizontal: 9,
    paddingVertical: 4
  },
  errorText: {
    color: colors.rose,
    fontSize: typography.caption,
    lineHeight: 16
  },
  feedbackText: {
    color: colors.live,
    fontSize: typography.caption,
    fontWeight: "700",
    lineHeight: 16
  },
  confirmResultBox: {
    alignItems: "flex-start",
    gap: spacing.sm
  },
  goalEditor: {
    gap: spacing.xs
  },
  goalInput: {
    ...createControlStyles(colors).input,
    minHeight: 84
  },
  goalInputLabel: {
    color: colors.text3,
    fontSize: typography.caption,
    fontWeight: "700",
    lineHeight: 16
  },
  goalSuggestionActionText: {
    color: colors.accent,
    fontSize: typography.caption,
    fontWeight: "800",
    lineHeight: 16
  },
  goalSuggestionActionTextSelected: {
    color: colors.onAccent
  },
  goalSuggestionCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md
  },
  goalSuggestionCardSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent
  },
  goalSuggestionDetail: {
    color: colors.text3,
    fontSize: typography.caption,
    lineHeight: 17
  },
  goalSuggestionDetailSelected: {
    color: colors.onAccent
  },
  goalSuggestionGoal: {
    color: colors.text,
    fontSize: typography.small,
    lineHeight: 19
  },
  goalSuggestionGoalSelected: {
    color: colors.onAccent
  },
  goalSuggestionHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between"
  },
  goalSuggestionStack: {
    gap: spacing.sm
  },
  goalSuggestionTitle: {
    color: colors.ink,
    flex: 1,
    fontSize: typography.small,
    fontWeight: "800",
    lineHeight: 18
  },
  goalSuggestionTitleSelected: {
    color: colors.onAccent
  },
  inlineButton: {
    ...createControlStyles(colors).secondaryButton,
    flexDirection: "row",
    gap: spacing.sm,
    maxWidth: "100%"
  },
  inlineButtonDisabled: {
    opacity: 0.62
  },
  inlineButtonText: {
    ...createControlStyles(colors).secondaryButtonText
  },
  infoGrid: {
    marginTop: 12,
    borderTopColor: colors.border,
    borderBottomColor: colors.border,
    borderTopWidth: 1,
    borderBottomWidth: 1
  },
  infoTile: {
    width: "50%",
    minWidth: 0,
    gap: 3,
    backgroundColor: "transparent",
    paddingVertical: 10,
    minHeight: 59
  },
  infoTileBody: {
    flex: 1,
    gap: spacing.xxs,
    minWidth: 0
  },
  infoTileDetail: {
    color: colors.text4,
    fontFamily: detailFont,
    fontSize: 11,
    lineHeight: 16
  },
  infoTileTitle: {
    color: colors.ink,
    fontFamily: detailFont,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20
  },
  nextHint: {
    color: colors.text3,
    fontSize: typography.small,
    lineHeight: 19
  },
  openingLineBox: {
    alignItems: "flex-start",
    backgroundColor: colors.accentSofter,
    borderRadius: radius.card,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md
  },
  openingLineBody: {
    flex: 1,
    gap: spacing.sm,
    minWidth: 0
  },
  openingLineFooter: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between",
    flexWrap: "wrap"
  },
  openingLineStatus: {
    color: colors.text3,
    flex: 1,
    fontSize: typography.caption,
    fontWeight: "600",
    lineHeight: 16
  },
  openingLineText: {
    color: colors.text,
    fontSize: typography.small,
    lineHeight: 19
  },
  organizerAvatar: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    height: 44,
    justifyContent: "center",
    width: 44
  },
  organizerAvatarText: {
    color: colors.onAccent,
    fontSize: typography.section,
    fontWeight: "800",
    lineHeight: 21
  },
  organizerBody: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0
  },
  organizerName: {
    color: colors.ink,
    ...textStyles.listTitle
  },
  organizerRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md
  },
  postEventDraftBox: {
    alignItems: "flex-start",
    backgroundColor: colors.accentSofter,
    borderRadius: radius.card,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md
  },
  postEventFooter: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  postEventSafety: { minWidth: 140 },
  postEventRow: {
    gap: spacing.sm,
    backgroundColor: "transparent",
    paddingVertical: spacing.md
  },
  postEventTag: {
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    color: colors.text3,
    fontSize: typography.caption,
    fontWeight: "700",
    lineHeight: 14,
    overflow: "hidden",
    paddingHorizontal: 9,
    paddingVertical: 5
  },
  postEventTagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs
  },
  rankLabel: {
    color: colors.accent,
    fontSize: typography.caption,
    fontWeight: "800",
    lineHeight: 16
  },
  readinessGoal: {
    alignItems: "flex-start",
    backgroundColor: colors.tint,
    borderRadius: radius.card,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md
  },
  readinessGoalBody: {
    flex: 1,
    gap: spacing.sm,
    minWidth: 0
  },
  primaryCta: {
    ...createControlStyles(colors).primaryButton,
    flexDirection: "row",
    gap: spacing.sm,
    borderRadius: 12,
    minHeight: 50
  },
  primaryCtaText: {
    ...createControlStyles(colors).primaryButtonText,
    fontFamily: detailFont,
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 21
  },
  registrationActionRow: {
    flexDirection: "row",
    gap: spacing.sm,
    flexWrap: "wrap"
  },
  registrationCard: {
    gap: 8,
    backgroundColor: "transparent",
    paddingTop: 12,
    paddingBottom: 0,
    paddingHorizontal: 16,
    width: "100%",
    maxWidth: layout.contentMax,
    alignSelf: "center"
  },
  registrationEyebrow: {
    color: colors.text3,
    fontSize: typography.caption,
    lineHeight: 16
  },
  registrationFee: {
    color: colors.ink,
    ...textStyles.title
  },
  registrationHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between"
  },
  registrationHint: {
    color: colors.text3,
    fontSize: typography.caption,
    lineHeight: 17
  },
  registrationTitleBlock: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0
  },
  recommendationHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  recommendationAvatar: {
    alignItems: "center",
    backgroundColor: colors.accentSofter,
    borderColor: colors.accentSoft,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    width: 42
  },
  recommendationAvatarRank: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: "800",
    lineHeight: 12,
    maxWidth: 48,
    textAlign: "center"
  },
  recommendationAvatarText: {
    color: colors.accent,
    fontSize: 17,
    fontWeight: "800",
    lineHeight: 21
  },
  recommendationAvatarWrap: {
    alignItems: "center",
    gap: 4,
    width: 48
  },
  recommendationMeta: {
    color: colors.text3,
    fontSize: typography.caption,
    lineHeight: 16
  },
  recommendationName: {
    color: colors.ink,
    fontSize: typography.body,
    fontWeight: "700",
    lineHeight: 20
  },
  recommendationRow: {
    gap: spacing.sm,
    backgroundColor: "transparent",
    paddingVertical: spacing.md
  },
  recommendationPersonBody: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0
  },
  recommendationPersonHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.sm
  },
  scoreLabel: {
    color: colors.text3,
    fontSize: typography.caption,
    fontWeight: "700",
    lineHeight: 16
  },
  stack: {
    gap: 8
  }
}));
