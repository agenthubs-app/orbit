import { Ionicons } from "@expo/vector-icons";
import { type Href, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import {
  ORBIT_API_ENDPOINTS,
  calendarPermissionRequestPath
} from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { DataCard } from "../../components/DataCard";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { radius, spacing, textStyles, typography, type OrbitColors } from "../../design/tokens";
import { createControlStyles } from "../../design/controls";
import { createThemedStyles } from "../../design/theme";
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

function toneColor(tone: PermissionCardTone, colors: OrbitColors): string {
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

function toneBackground(tone: PermissionCardTone, colors: OrbitColors): string {
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
  const { colors, styles } = useStyles();
  const router = useRouter();
  const auth = useOrbitAuthSession();
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
      {!auth.ready ? <LoadingState /> : null}
      {auth.ready && !auth.signedIn ? (
        <DataCard
          detail="当前设备没有已验证身份，Orbit 不会展示任何账号的权限记录。"
          title="登录后查看权限中心"
        >
          <Text style={styles.bodyText}>
            登录后可以查看并复核当前账号的日历、通知、相机和联系人能力。
          </Text>
          <Pressable
            accessibilityLabel="登录查看权限中心"
            accessibilityRole="button"
            onPress={() =>
              router.push(
                "/account/login?next=%2Faccount%2Fpermissions" as Href
              )
            }
            style={({ pressed }) => [
              styles.primaryButton,
              pressed ? styles.pressed : null
            ]}
          >
            <Ionicons color={colors.onAccent} name="log-in-outline" size={16} />
            <Text style={styles.primaryButtonText}>登录查看权限中心</Text>
          </Pressable>
        </DataCard>
      ) : null}
      {auth.signedIn && state.kind === "loading" ? <LoadingState /> : null}
      {auth.signedIn && state.kind === "offline" ? (
        <ErrorState message={state.error.message} title="服务器连不上" />
      ) : null}
      {auth.signedIn && state.kind === "failure" ? (
        <ErrorState message={state.error.message} title="权限状态不可用" />
      ) : null}
      {auth.signedIn && view ? (
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
  const { colors, styles } = useStyles();
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
  const { styles } = useStyles();
  return (
    <DataCard detail={view.statusLabel} title={view.title} variant="inset">
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
  const { colors, styles } = useStyles();
  const color = toneColor(permission.tone, colors);

  return (
    <DataCard detail={permission.requiredFor} title={permission.title} variant="inset">
      <View style={styles.permissionHeader}>
        <View
          style={[
            styles.statusPill,
            { backgroundColor: toneBackground(permission.tone, colors) }
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

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  actionText: {
    color: colors.accent,
    fontSize: typography.small,
    fontWeight: "700",
    lineHeight: 19
  },
  bodyText: {
    ...textStyles.body,
    color: colors.text,
  },
  errorText: {
    backgroundColor: colors.roseSoft,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: 1,
    color: colors.rose,
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
    ...createControlStyles(colors).primaryButton,
    flexDirection: "row",
    gap: spacing.sm
  },
  primaryButtonDisabled: {
    opacity: 0.68
  },
  primaryButtonText: {
    ...createControlStyles(colors).primaryButtonText
  },
  safetyText: {
    backgroundColor: colors.accentSofter,
    borderColor: colors.border,
    borderRadius: radius.card,
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
}));
