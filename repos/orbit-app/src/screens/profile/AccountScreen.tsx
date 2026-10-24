import { type Href, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Platform, RefreshControl, StyleSheet, View } from "react-native";

import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { ORBIT_API_ENDPOINTS } from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { Card } from "../../components/ui/Card";
import { Icon } from "../../components/ui/Icon";
import { ListRow } from "../../components/ui/ListRow";
import { UiText } from "../../components/ui/Text";
import { clearProfileEditSession } from "../../data/profile-edit-session";
import { createThemedStyles, useOrbitTheme } from "../../design/theme";
import { useApiResource } from "../../hooks/useApiResource";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { accountSessionToView, type AccountSessionView } from "../../view-models/account-session";
import { createAccountRightsApi } from "../account-rights/api";

export function AccountScreen() {
  const router = useRouter();
  const { colors } = useOrbitTheme();
  const auth = useOrbitAuthSession();
  const server = useOrbitApiBaseUrl();
  const client = useOrbitApiClient();
  const locale = useOrbitLocale();
  const rights = useMemo(() => createAccountRightsApi({ baseUrl: server.baseUrl, cookieHeader: auth.cookieHeader, client }), [server.baseUrl, auth.cookieHeader, client]);
  useEffect(() => {
    if (!auth.signedIn || auth.offline) return;
    void rights.deletion().then(request => {
      if (request?.status === "pending" || request?.status === "purging") router.replace("/account/pending");
    }).catch(() => undefined);
  }, [auth.signedIn, auth.offline, rights, router]);
  const state = useApiResource<unknown>(ORBIT_API_ENDPOINTS.accountMe,
    data => accountSessionToView(data, { authenticated: auth.signedIn, authUser: auth.user, t: locale.t }).statusLabel !== locale.t("account.signedIn"));
  const view = accountSessionToView(state.kind === "success" || state.kind === "empty" ? state.data : null,
    { authenticated: auth.signedIn, authUser: auth.user, t: locale.t });
  return <AppScreen inset="kit" title={locale.t("account.overviewTitle")}
    refreshControl={<RefreshControl onRefresh={state.refresh} refreshing={state.refreshing} tintColor={colors.accentText} />}>
    {!auth.ready || auth.signedIn && state.kind === "loading" ? <LoadingState accessibilityLabel={locale.t("common.loadingLabel")} /> : null}
    {auth.signedIn && state.kind === "offline" ? <ErrorState message={state.error.message} title={locale.t("account.serverOffline")} /> : null}
    {auth.signedIn && state.kind === "failure" ? <ErrorState message={state.error.message} title={locale.t("account.unavailable")} /> : null}
    {auth.ready && (!auth.signedIn || state.kind === "success" || state.kind === "empty") ? <AccountOverview view={view} onRefresh={state.refresh} /> : null}
  </AppScreen>;
}

function AccountOverview({ view, onRefresh }: { view: AccountSessionView; onRefresh: () => void }) {
  const { colors, styles } = useStyles();
  const router = useRouter();
  const auth = useOrbitAuthSession();
  const server = useOrbitApiBaseUrl();
  const locale = useOrbitLocale();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [debugPendingCount, setDebugPendingCount] = useState<number | null>(null);
  const [debugPendingIds, setDebugPendingIds] = useState<readonly string[]>([]);
  const open = (href: string) => router.push(href as Href);
  useEffect(() => {
    if (!__DEV__ || Platform.OS === "web" || !auth.signedIn) return;
    let active = true;
    void Promise.all([auth.readPendingWritesOnDevice(), auth.listDebugPendingWriteIds()]).then(([count, ids]) => {
      if (active) { setDebugPendingCount(count); setDebugPendingIds(ids); }
    }).catch(() => { if (active) setFeedback("无法读取这台设备上的待同步修改数量。"); });
    return () => { active = false; };
  }, [auth.signedIn, auth.readPendingWritesOnDevice, auth.listDebugPendingWriteIds]);
  async function signOut() {
    setFeedback(null);
    const result = await auth.signOut();
    if (!result.success) { setFeedback(result.message ?? locale.t("account.signOutFailure")); return; }
    if (auth.actorId) clearProfileEditSession({ actorId: auth.actorId, apiOrigin: server.baseUrl });
    onRefresh();
  }
  async function addDebugPendingWrite() {
    try {
      setDebugPendingCount(await auth.enqueueDebugPendingWrite());
      setDebugPendingIds(await auth.listDebugPendingWriteIds());
      setFeedback(null);
    } catch { setFeedback("Debug 测试修改未能写入本机队列。"); }
  }
  async function clearDebugPendingWrites() {
    try {
      for (const mutationId of debugPendingIds) {
        if (await auth.deleteDebugPendingWrite(mutationId) === null) throw new Error("DEBUG_OUTBOX_SCOPE_CHANGED");
      }
      setDebugPendingIds(await auth.listDebugPendingWriteIds());
      setDebugPendingCount(await auth.readPendingWritesOnDevice());
      setFeedback(null);
    } catch { setFeedback("Debug 测试修改未能全部清理，请保留队列并检查设备。"); }
  }
  const chevron = <Icon color={colors.ink3Text} name="right" size={16} />;
  return <View style={styles.page}>
    {/* 主会话代定 §R18c-2: #19 shows only supported account facts and keeps existing routes. */}
    <Card style={styles.identity}>
      <View style={styles.avatar}><UiText style={styles.avatarText}>{Array.from(view.displayName)[0] ?? "?"}</UiText></View>
      <View style={styles.identityCopy}>
        <UiText style={styles.identityName}>{view.displayName}</UiText>
        <UiText style={styles.muted}>{auth.signedIn ? auth.user?.email ?? view.summary : view.summary}</UiText>
      </View>
    </Card>
    {auth.signedIn ? <>
      <UiText style={styles.heading}>{locale.t("account.loginSection")}</UiText>
      <Card style={styles.group}>
        <ListRow title={locale.t("account.status")} subtitle={view.statusLabel} leading={<Icon color={colors.ink2} name="user" size={20} />} />
        <View style={styles.rule} />
        <ListRow title={locale.t("account.editProfile")} subtitle={view.displayName} leading={<Icon color={colors.ink2} name="edit" size={20} />} trailing={chevron} onPress={() => open("/profile/edit")} />
        <View style={styles.rule} />
        <ListRow title={locale.t("account.workspace")} subtitle={`${view.workspaceName} · ${view.roleLabel}`} leading={<Icon color={colors.ink2} name="users" size={20} />} />
        <View style={styles.rule} />
        <ListRow title={locale.t("account.goal")} subtitle={view.goal} leading={<Icon color={colors.ink2} name="flag" size={20} />} />
        <View style={styles.rule} />
        <ListRow title={locale.t("account.timeZone")} subtitle={view.timezoneLabel} leading={<Icon color={colors.ink2} name="clock" size={20} />} />
      </Card>
      <UiText style={styles.heading}>{locale.t("account.dataSection")}</UiText>
      <Card style={styles.group}>
        <ListRow title={locale.t("account.rights.export")} subtitle={locale.t("account.rights.exportIntro")} leading={<Icon color={colors.ink2} name="share" size={20} />} trailing={chevron} onPress={() => open("/account/exports")} />
        <View style={styles.rule} />
        <ListRow title={locale.t("account.rights.delete")} leading={<Icon color={colors.coralText} name="x" size={20} />} trailing={chevron} onPress={() => open("/account/deletion")} />
      </Card>
      <Card style={styles.group}>
        <ListRow title={locale.t("account.permissions")} subtitle={locale.t("account.permissionsHint")} accessibilityLabel={locale.t("account.permissions")} trailing={chevron} onPress={() => open("/account/permissions")} />
        <View style={styles.rule} />
        <ListRow title={locale.t("account.signOut")} accessibilityLabel={locale.t("account.signOut")} trailing={chevron} onPress={() => { void signOut(); }} />
      </Card>
    </> : <Card style={styles.group}>
      <UiText style={styles.muted}>{locale.t("account.signedOutTitle")}</UiText>
      <UiText style={styles.muted}>{view.emptyMessage}</UiText>
      {view.authActions.map(action => <ListRow key={action.href} title={action.label} trailing={chevron} onPress={() => open(action.href)} />)}
    </Card>}
    <Card style={styles.group}>
      <ListRow title={locale.t("account.serverSettings")} trailing={chevron} onPress={() => open("/settings/api")} />
      {__DEV__ && Platform.OS !== "web" && auth.signedIn ? <>
        <View style={styles.rule} />
        <ListRow title={`Debug 待同步修改 · ${debugPendingCount ?? "—"}`} onPress={() => { void addDebugPendingWrite(); }} />
        {debugPendingIds.length > 0 ? <ListRow title={`清理 Debug 测试修改 · ${debugPendingIds.length}`} onPress={() => { void clearDebugPendingWrites(); }} /> : null}
      </> : null}
    </Card>
    {feedback ? <UiText accessibilityRole="alert" style={styles.feedback}>{feedback}</UiText> : null}
  </View>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  page: { gap: 12, paddingBottom: 24 },
  identity: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.accentText, fontSize: 18, fontWeight: "700" },
  identityCopy: { flex: 1, minWidth: 0 },
  identityName: { color: colors.ink, fontSize: 17, fontWeight: "700" },
  muted: { color: colors.ink3Text, fontSize: 14, marginTop: 3 },
  heading: { color: colors.ink3Text, fontSize: 14, marginTop: 9, marginLeft: 6 },
  group: { paddingVertical: 2, paddingHorizontal: 16 },
  rule: { height: 1, backgroundColor: colors.line, marginLeft: 30 },
  feedback: { color: colors.coralText, backgroundColor: colors.coralSoft, borderRadius: 24, fontSize: 15, padding: 12 },
}));
