import { Ionicons } from "@expo/vector-icons";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import {
  ImageBackground,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View
} from "react-native";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { ORBIT_API_ENDPOINTS } from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { DataCard } from "../../components/DataCard";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { colors, radius, spacing, typography } from "../../design/tokens";
import { useApiResource } from "../../hooks/useApiResource";
import {
  organizerPublicToView,
  type OrganizerPublicEventState,
  type OrganizerPublicEventView,
  type OrganizerPublicView
} from "../../view-models/organizer-public";

const stateLabels: Record<OrganizerPublicEventState, string> = {
  active: "进行中",
  ended: "历史",
  upcoming: "即将"
};

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "organizer";
  }

  return value ?? "organizer";
}

export function OrganizerPublicScreen() {
  const { slug } = useLocalSearchParams<{ slug?: string | string[] }>();
  const router = useRouter();
  const organizerSlug = firstParam(slug);
  const { baseUrl } = useOrbitApiBaseUrl();
  const state = useApiResource<unknown>(
    ORBIT_API_ENDPOINTS.events,
    () => false
  );

  return (
    <AppScreen
      eyebrow="主办方"
      refreshControl={
        <RefreshControl
          onRefresh={state.refresh}
          refreshing={state.refreshing}
          tintColor={colors.accent}
        />
      }
      title="公开主页"
    >
      {state.kind === "loading" ? <LoadingState /> : null}
      {state.kind === "offline" ? (
        <ErrorState message={state.error.message} title="服务器连不上" />
      ) : null}
      {state.kind === "failure" ? (
        <ErrorState message={state.error.message} title="主办方页面不可用" />
      ) : null}
      {state.kind === "success" || state.kind === "empty" ? (
        <OrganizerContent
          baseUrl={baseUrl}
          onOpen={(href) => router.push(href as Href)}
          view={organizerPublicToView({
            events: state.data,
            slug: organizerSlug
          })}
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

function OrganizerContent({
  baseUrl,
  onOpen,
  view
}: {
  baseUrl: string;
  onOpen: (href: string) => void;
  view: OrganizerPublicView;
}) {
  return (
    <>
      <OrganizerHero baseUrl={baseUrl} onOpen={onOpen} view={view} />

      <DataCard detail="只展示公开活动，不读取报名名单。" title="公开活动">
        {view.events.length > 0 ? (
          <View style={styles.eventGrid}>
            {view.events.map((event) => (
              <OrganizerEventCard
                baseUrl={baseUrl}
                event={event}
                key={event.id}
                onOpen={onOpen}
              />
            ))}
          </View>
        ) : (
          <EmptyState
            message={view.emptyMessage}
            title={view.emptyTitle}
          />
        )}
      </DataCard>
    </>
  );
}

function OrganizerHero({
  baseUrl,
  onOpen,
  view
}: {
  baseUrl: string;
  onOpen: (href: string) => void;
  view: OrganizerPublicView;
}) {
  const heroImage = view.primaryEvent?.coverPath ?? "/orbit-covers/meeting.jpg";

  return (
    <View style={styles.organizerHero}>
      <ImageBackground
        imageStyle={styles.organizerHeroImage}
        source={{ uri: assetUrl(baseUrl, heroImage) }}
        style={styles.organizerHeroCover}
      >
        <View style={styles.organizerHeroScrim} />
        <View style={styles.organizerHeroTop}>
          <Text style={styles.verifiedBadge}>已认证主办方</Text>
        </View>
        <View style={styles.organizerHeroBottom}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{view.initial}</Text>
          </View>
          <View style={styles.heroCopy}>
            <Text numberOfLines={2} style={styles.heroName}>
              {view.name}
            </Text>
            <Text numberOfLines={1} style={styles.heroHandle}>
              {view.handle}
            </Text>
          </View>
        </View>
      </ImageBackground>
      <View style={styles.organizerHeroBody}>
        <Text style={styles.bodyText}>{view.summary}</Text>
        <View style={styles.statRow}>
          <StatCell label="活动" value={view.stats.events} />
          <StatCell label="累计参会" value={view.stats.participants} />
          <StatCell label="历史" value={view.stats.ended} />
        </View>
        <View style={styles.actionRow}>
          {view.actions.map((action) => (
            <Pressable
              accessibilityRole="button"
              key={`${action.href}-${action.label}`}
              onPress={() => onOpen(action.href)}
              style={({ pressed }) => [
                styles.actionButton,
                action.href === "/events" ? styles.secondaryButton : null,
                pressed ? styles.pressed : null
              ]}
            >
              <Text
                style={[
                  styles.actionButtonText,
                  action.href === "/events" ? styles.secondaryButtonText : null
                ]}
              >
                {action.label}
              </Text>
              <Ionicons
                color={action.href === "/events" ? colors.accent : colors.onAccent}
                name="chevron-forward"
                size={17}
              />
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCell}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function OrganizerEventCard({
  baseUrl,
  event,
  onOpen
}: {
  baseUrl: string;
  event: OrganizerPublicEventView;
  onOpen: (href: string) => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => onOpen(event.href)}
      style={({ pressed }) => [
        styles.eventCard,
        pressed ? styles.pressed : null
      ]}
    >
      <ImageBackground
        imageStyle={styles.eventImage}
        source={{ uri: assetUrl(baseUrl, event.coverPath) }}
        style={styles.eventImageFrame}
      >
        <View style={styles.eventImageScrim} />
        <View style={styles.eventImageTop}>
          <Text style={styles.statePill}>{stateLabels[event.state]}</Text>
        </View>
        <View style={styles.eventImageBottom}>
          <Text numberOfLines={2} style={styles.eventImageTitle}>
            {event.title}
          </Text>
          <Text numberOfLines={1} style={styles.eventImageMeta}>
            {event.detailLine}
          </Text>
          <View style={styles.eventImageFooter}>
            <Text style={styles.eventImageMeta}>
              {event.participantCountLabel}
            </Text>
            <Text style={styles.eventImageCta}>
              {event.state === "ended" ? "查看" : "报名"}
            </Text>
          </View>
        </View>
      </ImageBackground>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  actionButton: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: radius.control,
    flexDirection: "row",
    flexGrow: 1,
    gap: spacing.xs,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md
  },
  actionButtonText: {
    color: colors.onAccent,
    fontSize: typography.small,
    fontWeight: "700",
    lineHeight: 18
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  avatar: {
    alignItems: "center",
    backgroundColor: colors.ink,
    borderRadius: radius.lg,
    height: 64,
    justifyContent: "center",
    width: 64
  },
  avatarText: {
    color: colors.onAccent,
    fontSize: typography.display,
    fontWeight: "700",
    lineHeight: 29
  },
  bodyText: {
    color: colors.text2,
    fontSize: typography.small,
    lineHeight: 20
  },
  eventCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: "hidden"
  },
  eventGrid: {
    gap: spacing.lg
  },
  eventImage: {
    borderRadius: radius.lg
  },
  eventImageBottom: {
    gap: spacing.sm
  },
  eventImageCta: {
    color: colors.onAccent,
    fontSize: typography.caption,
    fontWeight: "800",
    lineHeight: 17
  },
  eventImageFooter: {
    alignItems: "center",
    borderTopColor: "rgba(255,255,255,0.18)",
    borderTopWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
    paddingTop: spacing.md
  },
  eventImageFrame: {
    aspectRatio: 1.12,
    backgroundColor: colors.surface3,
    justifyContent: "space-between",
    overflow: "hidden",
    padding: spacing.lg
  },
  eventImageMeta: {
    color: "rgba(255,255,255,0.84)",
    flex: 1,
    fontSize: typography.small,
    fontWeight: "600",
    lineHeight: 19,
    minWidth: 0
  },
  eventImageScrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(10,10,16,0.40)"
  },
  eventImageTitle: {
    color: colors.onAccent,
    fontSize: 22,
    fontWeight: "800",
    lineHeight: 28
  },
  eventImageTop: {
    alignItems: "flex-start"
  },
  heroCopy: {
    flex: 1,
    minWidth: 0
  },
  heroHandle: {
    color: "rgba(255,255,255,0.78)",
    fontSize: typography.small,
    fontWeight: "700",
    lineHeight: 19
  },
  heroName: {
    color: colors.onAccent,
    fontSize: typography.display,
    fontWeight: "800",
    lineHeight: 30
  },
  organizerHero: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: "hidden"
  },
  organizerHeroBody: {
    gap: spacing.md,
    padding: spacing.lg
  },
  organizerHeroBottom: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md
  },
  organizerHeroCover: {
    aspectRatio: 1.55,
    backgroundColor: colors.surface3,
    justifyContent: "space-between",
    overflow: "hidden",
    padding: spacing.lg
  },
  organizerHeroImage: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg
  },
  organizerHeroScrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(10,10,16,0.38)"
  },
  organizerHeroTop: {
    alignItems: "flex-start"
  },
  pressed: {
    opacity: 0.84,
    transform: [{ translateY: 0.5 }]
  },
  secondaryButton: {
    backgroundColor: colors.accentSofter,
    borderColor: colors.border,
    borderWidth: 1
  },
  secondaryButtonText: {
    color: colors.accent
  },
  statCell: {
    alignItems: "center",
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    flex: 1,
    gap: spacing.xs,
    minWidth: 84,
    padding: spacing.md
  },
  statLabel: {
    color: colors.text3,
    fontSize: typography.caption,
    lineHeight: 16
  },
  statRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  statValue: {
    color: colors.ink,
    fontSize: typography.title,
    fontWeight: "700",
    lineHeight: 24
  },
  statePill: {
    backgroundColor: colors.accentSofter,
    borderRadius: radius.control,
    color: colors.accent,
    fontSize: typography.caption,
    fontWeight: "700",
    lineHeight: 16,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  verifiedBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: radius.pill,
    color: colors.ink,
    fontSize: typography.caption,
    fontWeight: "800",
    overflow: "hidden",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  }
});
