import { Ionicons } from "@expo/vector-icons";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { RefreshControl, StyleSheet, Text, View, Pressable } from "react-native";
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

function OrganizerContent({
  onOpen,
  view
}: {
  onOpen: (href: string) => void;
  view: OrganizerPublicView;
}) {
  return (
    <>
      <DataCard detail={view.handle} title={view.name}>
        <View style={styles.heroRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{view.initial}</Text>
          </View>
          <View style={styles.heroCopy}>
            <Text style={styles.bodyText}>{view.summary}</Text>
          </View>
        </View>
        <View style={styles.statRow}>
          <StatCell label="活动" value={view.stats.events} />
          <StatCell label="即将" value={view.stats.upcoming} />
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
      </DataCard>

      <DataCard detail="只展示公开活动，不读取报名名单。" title="公开活动">
        {view.events.length > 0 ? (
          <View style={styles.eventStack}>
            {view.events.map((event) => (
              <EventRow event={event} key={event.id} onOpen={onOpen} />
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

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCell}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function EventRow({
  event,
  onOpen
}: {
  event: OrganizerPublicEventView;
  onOpen: (href: string) => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => onOpen(event.href)}
      style={({ pressed }) => [styles.eventRow, pressed ? styles.pressed : null]}
    >
      <View style={styles.eventMark}>
        <Text style={styles.eventMarkText}>{event.title.slice(0, 1)}</Text>
      </View>
      <View style={styles.eventText}>
        <Text numberOfLines={2} style={styles.eventTitle}>
          {event.title}
        </Text>
        <Text style={styles.eventMeta}>{event.detailLine}</Text>
      </View>
      <Text style={styles.statePill}>{stateLabels[event.state]}</Text>
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
  eventMark: {
    alignItems: "center",
    backgroundColor: colors.surface3,
    borderRadius: radius.md,
    height: 42,
    justifyContent: "center",
    width: 42
  },
  eventMarkText: {
    color: colors.ink,
    fontSize: typography.section,
    fontWeight: "700",
    lineHeight: 22
  },
  eventMeta: {
    color: colors.text3,
    fontSize: typography.small,
    lineHeight: 19
  },
  eventRow: {
    alignItems: "center",
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md
  },
  eventStack: {
    gap: spacing.sm
  },
  eventText: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0
  },
  eventTitle: {
    color: colors.ink,
    fontSize: typography.body,
    fontWeight: "700",
    lineHeight: 20
  },
  heroCopy: {
    flex: 1,
    minWidth: 0
  },
  heroRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md
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
  }
});
