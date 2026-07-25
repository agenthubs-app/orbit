import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import {
  ORBIT_API_ENDPOINTS,
  calendarPermissionRequestPath
} from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { DataCard } from "../../components/DataCard";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { colors, radius, spacing, typography } from "../../design/tokens";
import { useApiResource } from "../../hooks/useApiResource";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import {
  buildCalendarPermissionRequest,
  calendarPermissionRequestToView,
  permissionStatesToView,
  type CalendarPermissionRequestView,
  type PermissionCardTone,
  type PermissionCardView,
  type PermissionStatesView
} from "../../view-models/permissions";

function toneColor(tone: PermissionCardTone): string {
  switch (tone) {
    case "blocked":
      return colors.amber;
    case "denied":
      return colors.rose;
    case "pending":
      return colors.sky;
    case "ready":
      return colors.live;
    default:
      return colors.text3;
  }
}

function toneBackground(tone: PermissionCardTone): string {
  switch (tone) {
    case "blocked":
      return colors.amberSoft;
    case "denied":
      return colors.roseSoft;
    case "pending":
      return colors.skySoft;
    case "ready":
      return colors.liveSoft;
    default:
      return colors.surface2;
  }
}

export function AccountPermissionsScreen() {
  const client = useOrbitApiClient();
  const [requestingCalendar, setRequestingCalendar] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [requestView, setRequestView] =
    useState<CalendarPermissionRequestView | null>(null);
  const state = useApiResource<unknown>(
    ORBIT_API_ENDPOINTS.permissions,
    (data) => permissionStatesToView(data).permissions.length === 0
  );

  function refresh() {
    setRequestError(null);
    state.refresh();
  }

  async function requestCalendarReview() {
    setRequestingCalendar(true);
    setRequestError(null);

    try {
      const result = await client.post<unknown>(calendarPermissionRequestPath(), {
        body: buildCalendarPermissionRequest()
      });

      if (!result.success) {
        setRequestError(
          result.error.message || "日历权限暂时不能复核，请稍后再试。"
        );
        return;
      }

      setRequestView(calendarPermissionRequestToView(result.data));
      state.refresh();
    } catch (error) {
      setRequestError(
        error instanceof Error
          ? error.message
          : "日历权限暂时不能复核，请稍后再试。"
      );
    } finally {
      setRequestingCalendar(false);
    }
  }

  const view =
    state.kind === "success" || state.kind === "empty"
      ? permissionStatesToView(state.data)
      : null;

  return (
    <AppScreen
      eyebrow="账号"
      refreshControl={
        <RefreshControl
          onRefresh={refresh}
          refreshing={state.refreshing}
          tintColor={colors.accent}
        />
      }
      title="权限中心"
    >
      {state.kind === "loading" ? <LoadingState /> : null}
      {state.kind === "offline" ? (
        <ErrorState message={state.error.message} title="服务器连不上" />
      ) : null}
      {state.kind === "failure" ? (
        <ErrorState message={state.error.message} title="权限状态不可用" />
      ) : null}
      {view ? (
        <PermissionWorkspace
          onRequestCalendar={requestCalendarReview}
          requestError={requestError}
          requestingCalendar={requestingCalendar}
          requestView={requestView}
          view={view}
        />
      ) : null}
    </AppScreen>
  );
}

function PermissionWorkspace({
  onRequestCalendar,
  requestError,
  requestingCalendar,
  requestView,
  view
}: {
  onRequestCalendar: () => void;
  requestError: string | null;
  requestingCalendar: boolean;
  requestView: CalendarPermissionRequestView | null;
  view: PermissionStatesView;
}) {
  return (
    <>
      <DataCard detail={view.summary} title={view.title}>
        <Text style={styles.bodyText}>{view.nextAction}</Text>
        {view.canRequestCalendar ? (
          <Pressable
            accessibilityLabel="申请日历复核"
            accessibilityRole="button"
            disabled={requestingCalendar}
            onPress={onRequestCalendar}
            style={({ pressed }) => [
              styles.primaryButton,
              requestingCalendar ? styles.primaryButtonDisabled : null,
              pressed ? styles.pressed : null
            ]}
          >
            <Ionicons
              color={colors.onAccent}
              name={requestingCalendar ? "time-outline" : "calendar-outline"}
              size={16}
            />
            <Text style={styles.primaryButtonText}>
              {requestingCalendar ? "提交中" : "申请日历复核"}
            </Text>
          </Pressable>
        ) : null}
        {requestError ? (
          <Text style={styles.errorText}>{requestError}</Text>
        ) : null}
      </DataCard>

      {requestView ? <CalendarRequestCard view={requestView} /> : null}

      {view.permissions.length > 0 ? (
        <View style={styles.permissionList}>
          {view.permissions.map((permission) => (
            <PermissionCard key={permission.id} permission={permission} />
          ))}
        </View>
      ) : (
        <EmptyState message={view.nextAction} title={view.emptyText} />
      )}
    </>
  );
}

function CalendarRequestCard({
  view
}: {
  view: CalendarPermissionRequestView;
}) {
  return (
    <DataCard detail={view.statusLabel} title={view.title}>
      <Text style={styles.bodyText}>{view.detail}</Text>
      <Text style={styles.safetyText}>{view.nextAction}</Text>
      <Text style={styles.evidenceText}>{view.requestId}</Text>
    </DataCard>
  );
}

function PermissionCard({
  permission
}: {
  permission: PermissionCardView;
}) {
  const color = toneColor(permission.tone);

  return (
    <DataCard detail={permission.requiredFor} title={permission.title}>
      <View style={styles.permissionHeader}>
        <View
          style={[
            styles.statusPill,
            { backgroundColor: toneBackground(permission.tone) }
          ]}
        >
          <Ionicons color={color} name="shield-checkmark-outline" size={15} />
          <Text style={[styles.statusText, { color }]}>
            {permission.statusLabel}
          </Text>
        </View>
        <Text style={styles.stageText}>{permission.stageLabel}</Text>
      </View>
      <Text style={styles.bodyText}>{permission.reason}</Text>
      {permission.evidence.map((item) => (
        <Text key={item} style={styles.evidenceText}>
          {item}
        </Text>
      ))}
      <Text style={styles.actionText}>{permission.actionLabel}</Text>
    </DataCard>
  );
}

const styles = StyleSheet.create({
  actionText: {
    color: colors.accent,
    fontSize: typography.small,
    fontWeight: "700",
    lineHeight: 19
  },
  bodyText: {
    color: colors.text,
    fontSize: typography.small,
    lineHeight: 20
  },
  errorText: {
    backgroundColor: colors.roseSoft,
    borderColor: "#FECACA",
    borderRadius: radius.md,
    borderWidth: 1,
    color: "#B42318",
    fontSize: typography.small,
    lineHeight: 19,
    padding: spacing.md
  },
  evidenceText: {
    color: colors.text3,
    fontSize: typography.caption,
    lineHeight: 17
  },
  permissionHeader: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    justifyContent: "space-between"
  },
  permissionList: {
    gap: spacing.md
  },
  pressed: {
    opacity: 0.84,
    transform: [{ translateY: 0.5 }]
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md
  },
  primaryButtonDisabled: {
    opacity: 0.68
  },
  primaryButtonText: {
    color: colors.onAccent,
    fontSize: typography.small,
    fontWeight: "700",
    lineHeight: 18
  },
  safetyText: {
    backgroundColor: colors.accentSofter,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.text,
    fontSize: typography.small,
    lineHeight: 19,
    padding: spacing.md
  },
  stageText: {
    color: colors.text3,
    fontSize: typography.caption,
    lineHeight: 16
  },
  statusPill: {
    alignItems: "center",
    borderRadius: radius.pill,
    flexDirection: "row",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  statusText: {
    fontSize: typography.caption,
    fontWeight: "700",
    lineHeight: 16
  }
});
