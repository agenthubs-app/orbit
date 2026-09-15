import { useOrbitTimeZone } from "../../time/OrbitTimeZoneProvider";
import { Ionicons } from "@expo/vector-icons";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { publicEventDetailPath } from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { DataCard } from "../../components/DataCard";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { textStyles, radius, spacing, typography } from "../../design/tokens";
import { createControlStyles } from "../../design/controls";
import { createThemedStyles, useOrbitTheme } from "../../design/theme";
import { useApiResource } from "../../hooks/useApiResource";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import {
  scheduleEventPreviewToView,
  type ScheduleEventPreviewAction,
  type ScheduleEventPreviewEventView
} from "../../view-models/schedule-event-preview";

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "event";
  }

  return value ?? "event";
}

export function ScheduleEventPreviewScreen() {
  const locale = useOrbitLocale();
  const { colors } = useOrbitTheme();
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const eventId = firstParam(id);
  const state = useApiResource<unknown>(
    publicEventDetailPath(eventId),
    () => false
  );

  return (
    <AppScreen
      eyebrow={locale.t("schedule.previewEyebrow")}
      refreshControl={
        <RefreshControl
          onRefresh={state.refresh}
          refreshing={state.refreshing}
          tintColor={colors.accent}
        />
      }
      title={locale.t("schedule.previewTitle")}
    >
      {state.kind === "loading" ? <LoadingState /> : null}
      {state.kind === "offline" ? (
        <ErrorState message={state.error.message} title={locale.t("schedule.serverUnavailable")} />
      ) : null}
      {state.kind === "failure" ? <PreviewFailure data={null} /> : null}
      {state.kind === "success" || state.kind === "empty" ? (
        <PreviewContent data={state.data} />
      ) : null}
    </AppScreen>
  );
}

function PreviewContent({ data }: { data: unknown }) {
  const { timeZone } = useOrbitTimeZone();
  const locale = useOrbitLocale();
  const { colors, styles } = useStyles();
  const view = scheduleEventPreviewToView(data, timeZone, locale.language);

  return (
    <>
      <DataCard detail={view.description} title={view.title}>
        {view.event ? <EventPreview event={view.event} /> : null}
      </DataCard>
      <DataCard detail={view.guardrail} title={locale.t("schedule.operationBoundary")}>
        <View style={styles.guardrailRow}>
          <Ionicons color={colors.amber} name="lock-closed-outline" size={18} />
          <Text style={styles.bodyText}>
            {locale.t("schedule.operationBoundaryBody")}
          </Text>
        </View>
      </DataCard>
      <ActionList actions={view.actions} />
    </>
  );
}

function PreviewFailure({ data }: { data: unknown }) {
  const { timeZone } = useOrbitTimeZone();
  const locale = useOrbitLocale();
  const { styles } = useStyles();
  const view = scheduleEventPreviewToView(data, timeZone, locale.language);

  return (
    <>
      <DataCard detail={view.description} title={view.title}>
        <Text style={styles.bodyText}>{view.guardrail}</Text>
      </DataCard>
      <ActionList actions={view.actions} />
    </>
  );
}

function EventPreview({ event }: { event: ScheduleEventPreviewEventView }) {
  const { colors, styles } = useStyles();
  return (
    <View style={styles.previewStack}>
      <View style={styles.eventHeader}>
        <View style={styles.eventIcon}>
          <Ionicons color={colors.amber} name="calendar-outline" size={20} />
        </View>
        <View style={styles.eventTitle}>
          <Text style={styles.itemTitle}>{event.title}</Text>
          <Text style={styles.metaText}>{event.venue}</Text>
        </View>
        <Text style={styles.statusBadge}>{event.statusLabel}</Text>
      </View>
      <View style={styles.metaStack}>
        <Text style={styles.metaText}>{event.timing}</Text>
        <Text style={styles.metaText}>{event.sourceContext}</Text>
      </View>
      <Text style={styles.bodyText}>{event.nextAction}</Text>
    </View>
  );
}

function ActionList({ actions }: { actions: ScheduleEventPreviewAction[] }) {
  const { colors, styles } = useStyles();
  const router = useRouter();

  return (
    <View style={styles.actionList}>
      {actions.map((action) => (
        <Pressable
          accessibilityRole="button"
          key={action.href}
          onPress={() => router.push(action.href as Href)}
          style={({ pressed }) => [
            styles.actionButton,
            pressed ? styles.pressed : null
          ]}
        >
          <Text style={styles.actionText}>{action.label}</Text>
          <Ionicons color={colors.text3} name="chevron-forward" size={18} />
        </Pressable>
      ))}
    </View>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  actionButton: {
    ...createControlStyles(colors).secondaryButton,
    borderColor: colors.border,
    borderWidth: 1,
    flexDirection: "row"
  },
  actionList: {
    gap: spacing.sm
  },
  actionText: {
    ...textStyles.body,
    color: colors.text,
    flexShrink: 1
  },
  bodyText: {
    ...textStyles.body,
    color: colors.text,
    flexShrink: 1
  },
  eventHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.md,
    flexWrap: "wrap"
  },
  eventIcon: {
    alignItems: "center",
    backgroundColor: colors.amberSoft,
    borderRadius: radius.md,
    height: 42,
    justifyContent: "center",
    width: 42
  },
  eventTitle: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0
  },
  guardrailRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm
  },
  itemTitle: {
    ...textStyles.listTitle,
    color: colors.ink
  },
  metaStack: {
    gap: spacing.xs
  },
  metaText: {
    color: colors.text3,
    fontSize: typography.small,
    lineHeight: 19
  },
  pressed: {
    opacity: 0.72
  },
  previewStack: {
    gap: spacing.md
  },
  statusBadge: {
    backgroundColor: colors.amberSoft,
    borderRadius: radius.pill,
    color: colors.amber,
    flexShrink: 0,
    fontSize: typography.caption,
    fontWeight: "700",
    overflow: "hidden",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs
  }
}));
