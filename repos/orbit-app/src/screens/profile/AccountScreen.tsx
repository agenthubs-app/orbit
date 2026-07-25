import { Ionicons } from "@expo/vector-icons";
import { type Href, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { ORBIT_API_ENDPOINTS } from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { DataCard } from "../../components/DataCard";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { colors, radius, spacing, typography } from "../../design/tokens";
import { useApiResource } from "../../hooks/useApiResource";
import {
  accountSessionToView,
  type AccountSessionView
} from "../../view-models/account-session";

export function AccountScreen() {
  const auth = useOrbitAuthSession();
  const state = useApiResource<unknown>(
    ORBIT_API_ENDPOINTS.accountMe,
    (data) =>
      accountSessionToView(data, {
        authenticated: auth.signedIn,
        authUser: auth.user
      }).statusLabel !== "已登录"
  );

  return (
    <AppScreen
      eyebrow="账号"
      refreshControl={
        <RefreshControl
          onRefresh={state.refresh}
          refreshing={state.refreshing}
          tintColor={colors.accent}
        />
      }
      title="账号与工作区"
    >
      {state.kind === "loading" ? <LoadingState /> : null}
      {state.kind === "offline" ? (
        <ErrorState message={state.error.message} title="服务器连不上" />
      ) : null}
      {state.kind === "failure" ? (
        <ErrorState message={state.error.message} title="账号状态不可用" />
      ) : null}
      {state.kind === "success" || state.kind === "empty" ? (
        <AccountContent
          onRefresh={state.refresh}
          signedIn={auth.signedIn}
          view={accountSessionToView(state.data, {
            authenticated: auth.signedIn,
            authUser: auth.user
          })}
        />
      ) : null}
    </AppScreen>
  );
}

function AccountContent({
  onRefresh,
  signedIn,
  view
}: {
  onRefresh: () => void;
  signedIn: boolean;
  view: AccountSessionView;
}) {
  const router = useRouter();
  const auth = useOrbitAuthSession();
  const [feedback, setFeedback] = useState<string | null>(null);
  const isSignedIn = view.statusLabel === "已登录";

  async function signOut() {
    setFeedback(null);
    const result = await auth.signOut();

    if (!result.success) {
      setFeedback(result.message ?? "退出登录失败，请稍后再试。");
      return;
    }

    onRefresh();
  }

  return (
    <>
      <DataCard detail={view.summary} title={view.displayName}>
        <View style={styles.statusRow}>
          <View style={[styles.statusBadge, !isSignedIn ? styles.statusBadgeMuted : null]}>
            <Ionicons
              color={isSignedIn ? colors.live : colors.text3}
              name={isSignedIn ? "checkmark-circle-outline" : "person-circle-outline"}
              size={18}
            />
            <Text style={[styles.statusText, !isSignedIn ? styles.statusTextMuted : null]}>
              {view.statusLabel}
            </Text>
          </View>
          <Text style={styles.timezoneText}>{view.timezoneLabel}</Text>
        </View>
      </DataCard>

      <DataCard detail={view.planLabel} title={view.workspaceName}>
        <View style={styles.infoGrid}>
          <InfoCell label="身份" value={view.roleLabel} />
          <InfoCell label="时区" value={view.timezoneLabel} />
        </View>
      </DataCard>

      <DataCard detail="别人找到你之前，会先看这类信息" title="连接目标">
        <Text style={styles.bodyText}>{view.goal}</Text>
        <View style={styles.nextStep}>
          <Ionicons color={colors.accent} name="arrow-forward-circle-outline" size={18} />
          <Text style={styles.nextStepText}>{view.nextAction}</Text>
        </View>
      </DataCard>

      {view.statusLabel !== "已登录" ? (
        <EmptyState message={view.emptyMessage} title={view.emptyTitle} />
      ) : null}

      {feedback ? <Text style={styles.feedbackText}>{feedback}</Text> : null}

      <DataCard
        detail="本地调试或真机测试时切换 Orbit API 地址"
        onPress={() => router.push("/settings/api" as Href)}
        title="服务器设置"
      >
        <View style={styles.nextStep}>
          <Ionicons color={colors.accent} name="server-outline" size={18} />
          <Text style={styles.nextStepText}>
            修改后，联系人、活动和 Orbit AI 都会使用新的服务器。
          </Text>
        </View>
      </DataCard>

      {view.authActions.length > 0 ? (
        <DataCard detail="先进入账号入口，再回到个人资料完善别人能看到的信息。" title="账号入口">
          <View style={styles.actionRow}>
            {view.authActions.map((action) => (
              <Pressable
                accessibilityRole="button"
                key={action.href}
                onPress={() => router.push(action.href as Href)}
                style={({ pressed }) => [
                  styles.actionButton,
                  pressed ? styles.pressed : null
                ]}
              >
                <Text style={styles.actionButtonText}>{action.label}</Text>
                <Ionicons color={colors.onAccent} name="arrow-forward" size={16} />
              </Pressable>
            ))}
          </View>
        </DataCard>
      ) : null}

      {signedIn ? (
        <DataCard
          detail="日历、通知、相机和联系人能力"
          onPress={() => router.push("/account/permissions" as Href)}
          title="权限中心"
        >
          <View style={styles.nextStep}>
            <Ionicons
              color={colors.accent}
              name="shield-checkmark-outline"
              size={18}
            />
            <Text style={styles.nextStepText}>
              查看哪些能力已经可用，哪些还需要你先复核。
            </Text>
          </View>
        </DataCard>
      ) : null}

      {signedIn ? (
        <DataCard detail="退出后，这台设备会清除保存的登录会话。" title="账号操作">
          <Pressable
            accessibilityRole="button"
            onPress={signOut}
            style={({ pressed }) => [
              styles.secondaryActionButton,
              pressed ? styles.pressed : null
            ]}
          >
            <Text style={styles.secondaryActionText}>退出登录</Text>
          </Pressable>
        </DataCard>
      ) : null}
    </>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoCell}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text numberOfLines={2} style={styles.infoValue}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bodyText: {
    color: colors.text,
    fontSize: typography.small,
    lineHeight: 20
  },
  feedbackText: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FECACA",
    borderRadius: radius.md,
    borderWidth: 1,
    color: "#B42318",
    fontSize: typography.small,
    lineHeight: 19,
    padding: spacing.md
  },
  actionButton: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: radius.control,
    flexDirection: "row",
    flexGrow: 1,
    gap: spacing.sm,
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
  infoCell: {
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    gap: spacing.xs,
    minWidth: 128,
    padding: spacing.md
  },
  infoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  infoLabel: {
    color: colors.text3,
    fontSize: typography.caption,
    lineHeight: 16
  },
  infoValue: {
    color: colors.ink,
    fontSize: typography.body,
    fontWeight: "700",
    lineHeight: 20
  },
  nextStep: {
    alignItems: "flex-start",
    backgroundColor: colors.accentSofter,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md
  },
  nextStepText: {
    color: colors.text,
    flex: 1,
    fontSize: typography.small,
    lineHeight: 20
  },
  pressed: {
    opacity: 0.84,
    transform: [{ translateY: 0.5 }]
  },
  statusBadge: {
    alignItems: "center",
    backgroundColor: colors.liveSoft,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  statusBadgeMuted: {
    backgroundColor: colors.surface2
  },
  statusRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    justifyContent: "space-between"
  },
  statusText: {
    color: colors.live,
    fontSize: typography.caption,
    fontWeight: "700",
    lineHeight: 16
  },
  statusTextMuted: {
    color: colors.text3
  },
  secondaryActionButton: {
    alignItems: "center",
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: radius.control,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md
  },
  secondaryActionText: {
    color: colors.text,
    fontSize: typography.small,
    fontWeight: "700",
    lineHeight: 18
  },
  timezoneText: {
    color: colors.text3,
    fontSize: typography.small,
    lineHeight: 18
  }
});
