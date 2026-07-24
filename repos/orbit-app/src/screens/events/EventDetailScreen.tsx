import { Ionicons } from "@expo/vector-icons";
import { type Href, useLocalSearchParams } from "expo-router";
import { useRouter } from "expo-router";
import {
  ImageBackground,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View
} from "react-native";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import {
  eventDetailPath,
  eventReadinessPath,
  eventRecommendationsPath
} from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { DataCard } from "../../components/DataCard";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { colors, radius, spacing, typography } from "../../design/tokens";
import {
  type ApiResourceState,
  useApiResource
} from "../../hooks/useApiResource";
import {
  eventDetailHeroToView,
  eventDetailToSummary,
  eventReadinessToView,
  eventRecommendationsToView
} from "../../view-models/events";

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "event";
  }

  return value ?? "event";
}

export function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const eventId = firstParam(id);
  const { baseUrl } = useOrbitApiBaseUrl();
  const state = useApiResource<unknown>(eventDetailPath(eventId), () => false);
  const readinessState = useApiResource<unknown>(
    eventReadinessPath(eventId),
    () => false
  );
  const recommendationsState = useApiResource<unknown>(
    eventRecommendationsPath(eventId, 3),
    (data) => eventRecommendationsToView(data).people.length === 0
  );

  return (
    <AppScreen
      eyebrow="活动详情"
      refreshControl={
        <RefreshControl
          onRefresh={() => {
            state.refresh();
            readinessState.refresh();
            recommendationsState.refresh();
          }}
          refreshing={
            state.refreshing ||
            readinessState.refreshing ||
            recommendationsState.refreshing
          }
          tintColor={colors.accent}
        />
      }
      title="活动"
    >
      {state.kind === "loading" ? <LoadingState /> : null}
      {state.kind === "offline" ? (
        <ErrorState message={state.error.message} title="服务器连不上" />
      ) : null}
      {state.kind === "failure" ? (
        <ErrorState message={state.error.message} />
      ) : null}
      {state.kind === "success" || state.kind === "empty" ? (
        <EventDetailCard
          baseUrl={baseUrl}
          data={state.data}
          readinessState={readinessState}
          recommendationsState={recommendationsState}
        />
      ) : null}
    </AppScreen>
  );
}

function assetUrl(baseUrl: string, path: string): string {
  if (/^https?:\/\//iu.test(path)) {
    return path;
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl.replace(/\/+$/u, "")}${normalizedPath}`;
}

function EventActionButton({
  detail,
  icon,
  onPress,
  title
}: {
  detail: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  title: string;
}) {
  return (
    <Pressable
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
      <Text numberOfLines={1} style={styles.actionTitle}>
        {title}
      </Text>
      <Text numberOfLines={2} style={styles.actionDetail}>
        {detail}
      </Text>
    </Pressable>
  );
}

function EventDetailCard({
  baseUrl,
  data,
  readinessState,
  recommendationsState
}: {
  baseUrl: string;
  data: unknown;
  readinessState: ApiResourceState<unknown>;
  recommendationsState: ApiResourceState<unknown>;
}) {
  const router = useRouter();
  const event = eventDetailToSummary(data);
  const hero = eventDetailHeroToView(event);

  return (
    <>
      <View style={styles.eventHero}>
        <ImageBackground
          imageStyle={styles.eventHeroImage}
          source={{ uri: assetUrl(baseUrl, hero.coverPath) }}
          style={styles.eventHeroFrame}
        >
          <View style={styles.eventHeroScrim} />
          <View style={styles.eventHeroTopRow}>
            <Text style={styles.eventStatusBadge}>{hero.status}</Text>
          </View>
          <View style={styles.eventHeroText}>
            <Text numberOfLines={3} style={styles.eventHeroTitle}>
              {hero.title}
            </Text>
            <Text numberOfLines={2} style={styles.eventHeroDetail}>
              {hero.detailLine}
            </Text>
          </View>
        </ImageBackground>
        <View style={styles.eventHeroBody}>
          <Text style={styles.bodyText}>{hero.summary}</Text>
        </View>
      </View>
      <View style={styles.actionGrid}>
        <EventActionButton
          detail="补报名信息"
          icon="clipboard-outline"
          onPress={() =>
            router.push(`/events/${encodeURIComponent(event.id)}/register` as Href)
          }
          title="报名"
        />
        <EventActionButton
          detail="看名单匹配"
          icon="people-outline"
          onPress={() =>
            router.push(
              `/events/${encodeURIComponent(event.id)}/attendees` as Href
            )
          }
          title="参会者"
        />
        <EventActionButton
          detail="签到和介绍"
          icon="ticket-outline"
          onPress={() =>
            router.push(`/party?eventId=${encodeURIComponent(event.id)}` as Href)
          }
          title="现场"
        />
      </View>
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
      <EventReadinessModule state={readinessState} />
      <EventRecommendationsModule state={recommendationsState} />
      <DataCard detail={event.nextAction} title="下一步" />
    </>
  );
}

function EventReadinessModule({
  state
}: {
  state: ApiResourceState<unknown>;
}) {
  if (state.kind !== "success" && state.kind !== "empty") {
    return null;
  }

  const view = eventReadinessToView(state.data);

  return (
    <DataCard detail={`${view.stateLabel} · ${view.scoreLabel}`} title="会前准备度">
      <View style={styles.readinessGoal}>
        <Ionicons color={colors.accent} name="flag-outline" size={17} />
        <Text style={styles.bodyText}>{view.goal}</Text>
      </View>
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
  state
}: {
  state: ApiResourceState<unknown>;
}) {
  if (state.kind !== "success" && state.kind !== "empty") {
    return null;
  }

  const view = eventRecommendationsToView(state.data);

  if (view.people.length === 0) {
    return null;
  }

  return (
    <DataCard detail={view.nextAction} title="推荐认识的人">
      <View style={styles.stack}>
        {view.people.map((person) => (
          <View key={person.id} style={styles.recommendationRow}>
            <View style={styles.recommendationHeader}>
              <Text style={styles.rankLabel}>{person.rankLabel}</Text>
              <Text style={styles.scoreLabel}>{person.scoreLabel}</Text>
            </View>
            <Text style={styles.recommendationName}>{person.name}</Text>
            {person.organizationRole ? (
              <Text style={styles.recommendationMeta}>
                {person.organizationRole}
              </Text>
            ) : null}
            <Text style={styles.checklistDetail}>{person.reason}</Text>
            <View style={styles.openingLineBox}>
              <Ionicons color={colors.accent} name="chatbubble-ellipses-outline" size={16} />
              <Text style={styles.openingLineText}>{person.opener}</Text>
            </View>
            <Text style={styles.nextHint}>{person.suggestedAction}</Text>
          </View>
        ))}
      </View>
    </DataCard>
  );
}

const styles = StyleSheet.create({
  actionButton: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: 1,
    flex: 1,
    gap: 6,
    minHeight: 112,
    padding: spacing.md
  },
  actionButtonPressed: {
    opacity: 0.86,
    transform: [{ translateY: 0.5 }]
  },
  actionDetail: {
    color: colors.text3,
    fontSize: typography.caption,
    lineHeight: 16,
    textAlign: "center"
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
    fontSize: typography.small,
    fontWeight: "700",
    lineHeight: 18,
    textAlign: "center"
  },
  bodyText: {
    color: colors.text,
    fontSize: typography.small,
    lineHeight: 20
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
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md
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
    fontSize: typography.small,
    fontWeight: "700",
    lineHeight: 18
  },
  eventHero: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: "hidden"
  },
  eventHeroBody: {
    padding: spacing.lg
  },
  eventHeroDetail: {
    color: "rgba(255,255,255,0.86)",
    fontSize: typography.small,
    fontWeight: "600",
    lineHeight: 19
  },
  eventHeroFrame: {
    aspectRatio: 1.22,
    backgroundColor: colors.surface3,
    justifyContent: "space-between",
    overflow: "hidden",
    padding: spacing.lg
  },
  eventHeroImage: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg
  },
  eventHeroScrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.28)"
  },
  eventHeroText: {
    gap: spacing.sm
  },
  eventHeroTitle: {
    color: colors.onAccent,
    fontSize: 26,
    fontWeight: "800",
    lineHeight: 31
  },
  eventHeroTopRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "flex-start"
  },
  eventStatusBadge: {
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: radius.pill,
    color: colors.ink,
    fontSize: typography.caption,
    fontWeight: "700",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  nextHint: {
    color: colors.text3,
    fontSize: typography.small,
    lineHeight: 19
  },
  openingLineBox: {
    alignItems: "flex-start",
    backgroundColor: colors.accentSofter,
    borderRadius: radius.md,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md
  },
  openingLineText: {
    color: colors.text,
    flex: 1,
    fontSize: typography.small,
    lineHeight: 19
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
    borderRadius: radius.md,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md
  },
  recommendationHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
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
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md
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
});
