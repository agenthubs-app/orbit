import { Ionicons } from "@expo/vector-icons";
import { type Href, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, RefreshControl, StyleSheet, Text, View, useWindowDimensions } from "react-native";
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
import { useOrbitLocale } from "../../i18n/OrbitLocaleProvider";

export function AccountScreen() {
  const { colors } = useOrbitTheme();
  const { fontScale } = useWindowDimensions();
  const auth = useOrbitAuthSession();
  const locale = useOrbitLocale();
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
      refreshControl={
        <RefreshControl
          onRefresh={state.refresh}
          refreshing={state.refreshing}
          tintColor={colors.accent}
        />
      }
      title={fontScale > 1.3 ? locale.t("account.title").replace("与", "与\n") : locale.t("account.title")}
    >
      {!auth.ready ? <LoadingState accessibilityLabel={locale.t("common.loadingLabel")} /> : null}
      {auth.ready && !auth.signedIn ? (
        <AccountContent
          onRefresh={state.refresh}
          signedIn={false}
          view={accountSessionToView(null, {
            authenticated: false,
            authUser: null,
            t: locale.t
          })}
        />
      ) : null}
      {auth.signedIn && state.kind === "loading" ? <LoadingState accessibilityLabel={locale.t("common.loadingLabel")} /> : null}
      {auth.signedIn && state.kind === "offline" ? (
        <ErrorState message={state.error.message} title={locale.t("account.serverOffline")} />
      ) : null}
      {auth.signedIn && state.kind === "failure" ? (
        <ErrorState message={state.error.message} title={locale.t("account.unavailable")} />
      ) : null}
      {auth.signedIn &&
      (state.kind === "success" || state.kind === "empty") ? (
        <AccountContent
          onRefresh={state.refresh}
          signedIn={auth.signedIn}
          view={accountSessionToView(state.data, {
            authenticated: auth.signedIn,
            authUser: auth.user,
            t: locale.t
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
  const { fontScale } = useWindowDimensions();
  const router = useRouter();
  const auth = useOrbitAuthSession();
  const locale = useOrbitLocale();
  const [feedback, setFeedback] = useState<string | null>(null);

  async function signOut() {
    setFeedback(null);
    const result = await auth.signOut();

    if (!result.success) {
      setFeedback(result.message ?? locale.t("account.signOutFailure"));
      return;
    }

    onRefresh();
  }

  return (
    <>
      {signedIn ? (
        <>
          <View style={[styles.identity, fontScale > 1.3 && styles.identityLarge]}>
            <View style={styles.identityMain}>
              <View style={styles.avatar}><Text style={styles.avatarText}>{Array.from(view.displayName)[0]}</Text></View>
              <View style={styles.identityCopy}>
                <Text style={styles.identityName}>{view.displayName}</Text>
                {auth.user?.email ? <Text style={styles.identityEmail}>{auth.user.email}</Text> : null}
              </View>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={locale.t("account.editProfile")}
              onPress={() => router.push("/profile" as Href)} style={({ pressed }) => [styles.editButton, pressed && styles.pressed]}>
              <Text style={styles.editText}>{locale.t("account.editProfile")}</Text>
              <Ionicons color={colors.accent} name="chevron-forward" size={14} />
            </Pressable>
          </View>

          <View style={styles.section}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>{locale.t("account.workspace")}</Text>
            <View style={styles.workspace}>
              <View style={styles.workspaceIcon}><Text style={styles.workspaceInitial}>{view.workspaceName === locale.t("account.workspaceMissing") ? "—" : Array.from(view.workspaceName)[0]}</Text></View>
              <View style={styles.workspaceCopy}>
                <Text style={styles.workspaceName}>{view.workspaceName}</Text>
                <Text style={styles.workspaceDetail}>{view.roleLabel}</Text>
              </View>
              {view.workspaceName !== locale.t("account.workspaceMissing") ? <View style={styles.currentBadge}><Text style={styles.currentText}>{locale.t("common.current")}</Text></View> : null}
            </View>
            <View style={[styles.infoGrid, fontScale > 1.3 && styles.infoGridLarge]}>
              <InfoCell label={locale.t("account.plan")} value={view.planLabel} />
              <InfoCell label={locale.t("account.timeZone")} value={view.timezoneLabel} />
              <InfoCell label={locale.t("account.status")} value={view.statusLabel} />
            </View>
          </View>

          <View style={styles.section}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>{locale.t("account.goal")}</Text>
            <View style={styles.goalContent}>
              <Text style={styles.bodyText}>{view.goal}</Text>
              <Text style={styles.workspaceDetail}>{view.nextAction}</Text>
            </View>
          </View>
        </>
      ) : (
        <DataCard detail={view.summary} title={locale.t("account.signedOutTitle")}>
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

      {feedback ? <Text accessibilityRole="alert" style={styles.feedbackText}>{feedback}</Text> : null}

      <View style={styles.accessRows}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={locale.t("account.serverSettings")}
          accessibilityHint={locale.t("account.serverHint")}
          onPress={() => router.push("/settings/api" as Href)}
          style={({ pressed }) => [styles.accessRow, pressed && styles.pressed]}
        >
          <Text style={styles.accessText}>{locale.t("account.serverSettings")}</Text>
          <Ionicons color={colors.text3} name="chevron-forward" size={16} />
        </Pressable>
        {signedIn ? (
          <Pressable accessibilityRole="button" accessibilityLabel={locale.t("account.permissions")}
            accessibilityHint={locale.t("account.permissionsHint")}
            onPress={() => router.push("/account/permissions" as Href)}
            style={({ pressed }) => [styles.accessRow, pressed && styles.pressed]}>
            <Text style={styles.accessText}>{locale.t("account.permissions")}</Text>
            <Ionicons color={colors.text3} name="chevron-forward" size={16} />
          </Pressable>
        ) : null}
      </View>

      {view.authActions.length > 0 ? (
        <DataCard detail={locale.t("account.entryDetail")} title={locale.t("account.entry")}>
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
        <View style={styles.signOutSection}>
          <Pressable
            accessibilityRole="button"
            onPress={signOut}
            style={({ pressed }) => [
              styles.signOutButton,
              pressed ? styles.pressed : null
            ]}
          >
            <Text style={styles.signOutText}>{locale.t("account.signOut")}</Text>
          </Pressable>
          <Text style={styles.workspaceDetail}>{locale.t("account.signOutDetail")}</Text>
        </View>
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
  identity: { flexDirection: "row", alignItems: "center", gap: 14, paddingTop: 8, paddingBottom: 8 },
  identityLarge: { flexDirection: "column", alignItems: "stretch" },
  identityMain: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 14 },
  avatar: { width: 56, minHeight: 56, borderRadius: 28, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.onAccent, fontSize: 22, lineHeight: 28, fontWeight: "800" },
  identityCopy: { flex: 1, minWidth: 0, gap: 2 },
  identityName: { color: colors.ink, fontSize: 18, lineHeight: 24, fontWeight: "900", letterSpacing: -0.18 },
  identityEmail: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  editButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", minHeight: 44, minWidth: 44 },
  editText: { color: colors.accent, fontSize: 13, lineHeight: 20, fontWeight: "700" },
  section: { gap: 6 },
  sectionTitle: { color: colors.ink, fontSize: 15, lineHeight: 22, fontWeight: "800" },
  workspace: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 12, borderTopColor: colors.border, borderTopWidth: 1, borderBottomColor: colors.border, borderBottomWidth: 1, paddingVertical: 14 },
  workspaceIcon: { width: 36, minHeight: 36, borderRadius: 10, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" },
  workspaceInitial: { color: colors.onAccent, fontSize: 14, lineHeight: 20, fontWeight: "800" },
  workspaceCopy: { flex: 1, minWidth: 110, gap: 1 },
  workspaceName: { color: colors.ink, fontSize: 15, lineHeight: 22, fontWeight: "700" },
  workspaceDetail: { color: colors.text3, fontSize: 12, lineHeight: 18 },
  currentBadge: { backgroundColor: colors.accent, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  currentText: { color: colors.onAccent, fontSize: 11, lineHeight: 16, fontWeight: "700" },
  goalContent: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 14, gap: 8 },
  accessRows: { borderTopColor: colors.border, borderTopWidth: 1 },
  accessRow: { alignItems: "center", flexDirection: "row", gap: 12, minHeight: 50, paddingVertical: 13.5, borderBottomColor: colors.border, borderBottomWidth: 1 },
  accessText: { flex: 1, color: colors.ink, fontSize: 15, lineHeight: 22, fontWeight: "600" },
  signOutSection: { gap: 8, paddingTop: 12 },
  signOutButton: { ...createControlStyles(colors).secondaryButton, borderColor: colors.border },
  signOutText: { color: colors.rose, fontSize: 14, lineHeight: 20, fontWeight: "600" },
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
  infoGridLarge: { flexDirection: "column", flexWrap: "nowrap" },
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
}));
