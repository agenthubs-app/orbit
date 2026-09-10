import { Ionicons } from "@expo/vector-icons";
import { type Href, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { ORBIT_API_ENDPOINTS } from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { DataCard } from "../../components/DataCard";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { radius, spacing, textStyles, typography } from "../../design/tokens";
import { createControlStyles } from "../../design/controls";
import { createThemedStyles, useOrbitTheme } from "../../design/theme";
import { useApiResource } from "../../hooks/useApiResource";
import {
  accountSessionToView,
  type AccountSessionView
} from "../../view-models/account-session";

export function AccountScreen() {
  const { colors } = useOrbitTheme();
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
      {!auth.ready ? <LoadingState /> : null}
      {auth.ready && !auth.signedIn ? (
        <AccountContent
          onRefresh={state.refresh}
          signedIn={false}
          view={accountSessionToView(null, {
            authenticated: false,
            authUser: null
          })}
        />
      ) : null}
      {auth.signedIn && state.kind === "loading" ? <LoadingState /> : null}
      {auth.signedIn && state.kind === "offline" ? (
        <ErrorState message={state.error.message} title="服务器连不上" />
      ) : null}
      {auth.signedIn && state.kind === "failure" ? (
        <ErrorState message={state.error.message} title="账号状态不可用" />
      ) : null}
      {auth.signedIn &&
      (state.kind === "success" || state.kind === "empty") ? (
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
  const { colors, styles } = useStyles();
  const router = useRouter();
  const auth = useOrbitAuthSession();
  const [feedback, setFeedback] = useState<string | null>(null);

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
      {signedIn ? (
        <>
          <DataCard detail={view.summary} title={view.displayName}>
            <View style={styles.statusRow}>
              <View style={styles.statusBadge}>
                <Ionicons
                  color={colors.live}
                  name="checkmark-circle-outline"
                  size={18}
                />
                <Text style={styles.statusText}>{view.statusLabel}</Text>
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
              <Ionicons
                color={colors.accent}
                name="arrow-forward-circle-outline"
                size={18}
              />
              <Text style={styles.nextStepText}>{view.nextAction}</Text>
            </View>
          </DataCard>
        </>
      ) : (
        <DataCard detail={view.summary} title="登录后查看账号与工作区">
          <View style={styles.statusRow}>
            <View style={[styles.statusBadge, styles.statusBadgeMuted]}>
              <Ionicons
                color={colors.text3}
                name="person-circle-outline"
                size={18}
              />
              <Text style={[styles.statusText, styles.statusTextMuted]}>
                {view.statusLabel}
              </Text>
            </View>
          </View>
        </DataCard>
      )}

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
            {view.authActions.map((action, index) => (
              <Pressable
                accessibilityRole="button"
                key={action.href}
                onPress={() => router.push(action.href as Href)}
                style={({ pressed }) => [
                  styles.actionButton,
                  index > 0 ? styles.secondaryActionButton : null,
                  pressed ? styles.pressed : null
                ]}
              >
                <Text style={index === 0 ? styles.actionButtonText : styles.secondaryActionText}>{action.label}</Text>
                <Ionicons color={index === 0 ? colors.onAccent : colors.text} name="arrow-forward" size={16} />
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
  const { styles } = useStyles();
  return (
    <View style={styles.infoCell}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>
        {value}
      </Text>
    </View>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  bodyText: {
    ...textStyles.body,
    color: colors.text,
  },
  feedbackText: {
    backgroundColor: colors.roseSoft,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: 1,
    color: colors.rose,
    fontSize: typography.small,
    lineHeight: 19,
    padding: spacing.md
  },
  actionButton: {
    ...createControlStyles(colors).primaryButton,
    flexDirection: "row",
    flexGrow: 1,
    maxWidth: "100%",
    gap: spacing.sm
  },
  actionButtonText: {
    ...createControlStyles(colors).primaryButtonText
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  infoCell: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 128
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
    flexDirection: "row",
    gap: spacing.sm
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
    ...createControlStyles(colors).secondaryButton
  },
  secondaryActionText: {
    ...createControlStyles(colors).secondaryButtonText
  },
  timezoneText: {
    color: colors.text3,
    fontSize: typography.small,
    lineHeight: 18
  }
}));
