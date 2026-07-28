import { Ionicons } from "@expo/vector-icons";
import {
  ImageBackground,
  RefreshControl,
  StyleSheet,
  Text,
  View
} from "react-native";
import { ORBIT_API_ENDPOINTS } from "../../api/endpoints";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { AppScreen } from "../../components/AppScreen";
import { DataCard } from "../../components/DataCard";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { colors, radius, spacing, typography } from "../../design/tokens";
import { useApiResource } from "../../hooks/useApiResource";
import {
  platformToView,
  type PlatformReviewItemView,
  type PlatformStatView
} from "../../view-models/platform";

function assetUrl(baseUrl: string, path: string): string {
  if (/^https?:\/\//iu.test(path)) {
    return path;
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl.replace(/\/+$/u, "")}${normalizedPath}`;
}

export function PlatformScreen() {
  const eventsState = useApiResource<unknown>(
    ORBIT_API_ENDPOINTS.publicEvents,
    (data) => platformToView({ events: data }).reviewQueue.length === 0
  );

  function refreshEvents() {
    eventsState.refresh();
  }

  return (
    <AppScreen
      eyebrow="平台工作台"
      refreshControl={
        <RefreshControl
          onRefresh={refreshEvents}
          refreshing={eventsState.refreshing}
          tintColor={colors.accent}
        />
      }
      title="平台总览"
    >
      {eventsState.kind === "loading" ? <LoadingState /> : null}
      {eventsState.kind === "offline" ? (
        <ErrorState message={eventsState.error.message} title="服务器连不上" />
      ) : null}
      {eventsState.kind === "failure" ? (
        <ErrorState message={eventsState.error.message} />
      ) : null}
      {eventsState.kind === "empty" ? (
        <EmptyState
          message="公开目录有新活动后，这里会展示来源和公开内容供核对。"
          title="暂无近期公开活动"
        />
      ) : null}
      {eventsState.kind === "success" ? (
        <PlatformContent events={eventsState.data} />
      ) : null}
    </AppScreen>
  );
}

function PlatformContent({
  events
}: {
  events: unknown;
}) {
  const view = platformToView({ events });

  return (
    <>
      <DataCard detail={view.summary} title="平台健康">
        <StatGrid stats={view.stats} />
      </DataCard>

      {view.reviewQueue.length > 0 ? (
        <ReviewQueueCard items={view.reviewQueue} />
      ) : (
        <EmptyState
          message={view.emptyReviewMessage}
          title={view.emptyReviewTitle}
        />
      )}

      <DataCard detail={view.boundary} title="平台边界">
        <Text style={styles.bodyText}>
          当前没有具备身份校验的平台审核写接口，因此不会在移动端显示批准、驳回、发布或账号认证操作。
        </Text>
      </DataCard>
    </>
  );
}

function StatGrid({ stats }: { stats: PlatformStatView[] }) {
  return (
    <View style={styles.statGrid}>
      {stats.map((stat) => (
        <View key={stat.id} style={styles.statCell}>
          <View style={[styles.toneDot, styles[`tone_${stat.tone}`]]} />
          <Text adjustsFontSizeToFit numberOfLines={1} style={styles.statValue}>
            {stat.value}
          </Text>
          <Text numberOfLines={1} style={styles.statLabel}>
            {stat.label}
          </Text>
          <Text numberOfLines={1} style={styles.statNote}>
            {stat.note}
          </Text>
        </View>
      ))}
    </View>
  );
}

function ReviewQueueCard({
  items
}: {
  items: PlatformReviewItemView[];
}) {
  const { baseUrl } = useOrbitApiBaseUrl();

  return (
    <DataCard detail={`${items.length} 场近期公开活动`} title="公开活动来源核对">
      <View style={styles.list}>
        {items.map((item) => (
          <View key={item.id} style={styles.eventRow}>
            {item.coverPath ? (
              <ImageBackground
                imageStyle={styles.eventThumbImage}
                source={{ uri: assetUrl(baseUrl, item.coverPath) }}
                style={styles.eventThumbFrame}
              >
                <View style={styles.eventThumbOverlay} />
              </ImageBackground>
            ) : (
              <View style={styles.eventIcon}>
                <Text style={styles.eventFallbackText}>
                  {item.title.slice(0, 1)}
                </Text>
              </View>
            )}
            <View style={styles.eventCopy}>
              <View style={styles.eventTitleRow}>
                <Text numberOfLines={2} style={styles.itemTitle}>
                  {item.title}
                </Text>
                <View style={styles.stateBadge}>
                  <Text style={styles.stateText}>{item.stateLabel}</Text>
                </View>
              </View>
              <View style={styles.eventMetaStack}>
                <View style={styles.eventMetaLine}>
                  <Ionicons color={colors.text3} name="time-outline" size={14} />
                  <Text numberOfLines={1} style={styles.metaText}>
                    {item.submitted}
                  </Text>
                </View>
                <View style={styles.eventMetaLine}>
                  <Ionicons color={colors.text3} name="location-outline" size={14} />
                  <Text numberOfLines={1} style={styles.metaText}>
                    {item.location}
                  </Text>
                </View>
              </View>
              <Text numberOfLines={2} style={styles.detailText}>
                {item.detail}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </DataCard>
  );
}

const styles = StyleSheet.create({
  bodyText: {
    color: colors.text2,
    fontSize: typography.small,
    lineHeight: 20
  },
  detailText: {
    color: colors.text2,
    fontSize: typography.small,
    lineHeight: 19
  },
  eventCopy: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0
  },
  eventFallbackText: {
    color: colors.accent,
    fontSize: typography.section,
    fontWeight: "700"
  },
  eventIcon: {
    alignItems: "center",
    backgroundColor: colors.accentSofter,
    borderRadius: radius.md,
    height: 48,
    justifyContent: "center",
    width: 48
  },
  eventMetaLine: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs,
    maxWidth: "100%",
    minWidth: 0
  },
  eventMetaStack: {
    gap: spacing.xxs
  },
  eventRow: {
    alignItems: "flex-start",
    backgroundColor: colors.bgSunken,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 92,
    padding: spacing.md
  },
  eventThumbFrame: {
    backgroundColor: colors.surface3,
    borderRadius: radius.md,
    height: 76,
    overflow: "hidden",
    width: 76
  },
  eventThumbImage: {
    borderRadius: radius.md
  },
  eventThumbOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(10,10,16,0.08)"
  },
  eventTitleRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between"
  },
  itemTitle: {
    color: colors.ink,
    flexShrink: 1,
    fontSize: typography.body,
    fontWeight: "700",
    lineHeight: 20
  },
  list: {
    gap: spacing.sm
  },
  metaText: {
    color: colors.text3,
    fontSize: typography.small
  },
  statCell: {
    backgroundColor: colors.bgSunken,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.xs,
    minHeight: 106,
    padding: spacing.md,
    width: "48%"
  },
  statGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    justifyContent: "space-between"
  },
  statLabel: {
    color: colors.ink,
    fontSize: typography.small,
    fontWeight: "600"
  },
  statNote: {
    color: colors.text3,
    fontSize: typography.caption
  },
  statValue: {
    color: colors.ink,
    fontSize: 28,
    fontWeight: "800",
    lineHeight: 32
  },
  stateBadge: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.pill,
    flexShrink: 0,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs
  },
  stateText: {
    color: colors.accent,
    fontSize: typography.caption,
    fontWeight: "700"
  },
  tone_accent: {
    backgroundColor: colors.accent
  },
  tone_amber: {
    backgroundColor: colors.amber
  },
  tone_blue: {
    backgroundColor: colors.sky
  },
  tone_green: {
    backgroundColor: colors.live
  },
  toneDot: {
    borderRadius: radius.pill,
    height: 8,
    width: 8
  }
});
