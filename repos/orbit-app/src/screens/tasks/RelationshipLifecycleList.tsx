import { type Href, useRouter, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { randomUUID } from "expo-crypto";
import { Pressable, Text, View } from "react-native";
import { useApiResource } from "../../hooks/useApiResource";
import { usePageCopyResource } from "../../hooks/usePageCopyResource";
import { OfflineNotice } from "../../components/OfflineNotice";
import { decodeRelationshipTaskPage } from "../../view-models/relationship-task-pages";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { DataCard } from "../../components/DataCard";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { useStandardCopy } from "../../i18n/standard-copy";
import { useOrbitTheme as useTheme } from "../../design/theme";

/**
 * UX-7: the open follow-ups' first page (the same page copy the list below reads), for the one
 * Reminders-style To-do list that shows them among the tasks by date.
 */
export function useOpenFollowUps(scopeKey: string, ready: boolean) {
  const auth = useOrbitAuthSession();
  const actorId = auth.actorId ?? "";
  const enabled = ready && Boolean(actorId);
  const first = usePageCopyResource<unknown>(`/api/relationship-tasks/page?mode=open&limit=30`, () => false,
    { scopeKey: `${scopeKey}:${actorId}:followups:first`, enabled, copy: { id: "relationship-tasks", variant: "open" },
      accept: (data) => decodeRelationshipTaskPage(data, actorId, "open") !== null });
  const refreshRef = useRef(first.refresh); refreshRef.current = first.refresh;
  useFocusEffect(useCallback(() => { refreshRef.current(); }, []));
  const page = decodeRelationshipTaskPage(enabled && (first.kind === "success" || first.kind === "empty") ? first.data : null, actorId, "open");
  return { items: page?.items ?? null, total: page?.total ?? 0, hasMore: page?.hasMore ?? false, refresh: first.refresh };
}

export function RelationshipLifecycleList({ scopeKey, ready, mode }: { scopeKey: string; ready: boolean; mode: "open" | "completed" }) {
  const auth = useOrbitAuthSession(), server = useOrbitApiBaseUrl();
  const actorId = auth.actorId ?? "";
  const enabled = ready && auth.ready && auth.signedIn && server.ready && Boolean(actorId);
  const sessionKey = useMemo(() => randomUUID(), [scopeKey, actorId, auth.cookieHeader, server.baseUrl, enabled, mode]);
  return <ScopedLifecycleList key={sessionKey} scopeKey={sessionKey} actorId={actorId} ready={enabled} mode={mode} />;
}

function ScopedLifecycleList({ scopeKey, actorId, ready, mode }: { scopeKey: string; actorId: string; ready: boolean; mode: "open" | "completed" }) {
  const [cursor, setCursor] = useState<string | null>(null);
  // Sprint 0131: the first page per mode is the page copy "relationship-tasks" (readable offline with 截至); later pages are online reads.
  const first = usePageCopyResource<unknown>(`/api/relationship-tasks/page?mode=${mode}&limit=30`, () => false,
    { scopeKey: `${scopeKey}:page:first`, enabled: ready && cursor === null, copy: { id: "relationship-tasks", variant: mode },
      accept: (data) => decodeRelationshipTaskPage(data, actorId, mode) !== null });
  const later = useApiResource<unknown>(`/api/relationship-tasks/page?mode=${mode}&limit=30${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, () => false,
    { scopeKey: `${scopeKey}:page:${cursor ?? "first"}`, cachePolicy: "network-only", enabled: ready && cursor !== null });
  const state = cursor === null ? first : later;
  const offline = cursor === null && first.copy?.offline === true;
  const router = useRouter();
  const locale = useOrbitLocale();
  const { t } = locale;
  const copy = useStandardCopy();
  const { colors } = useTheme();
  const refresh = () => { setCursor(null); state.refresh(); };
  const refreshRef = useRef(refresh); refreshRef.current = refresh;
  // Returning from a task mutation starts at the current first page; changing
  // the cursor must not itself trigger the focus reset.
  useFocusEffect(useCallback(() => { refreshRef.current(); }, []));
  const page = decodeRelationshipTaskPage(ready && (state.kind === "success" || state.kind === "empty") ? state.data : null, actorId, mode);
  const items = page?.items;
  return <DataCard title={t("tasks.lifecycle.title")} detail={t("tasks.lifecycle.detail")}>
    {offline ? <OfflineNotice lastSyncedAt={first.copy?.lastSyncedAt ?? null} reason={first.copy?.reason ?? null} /> : null}
    <Pressable accessibilityRole="button" onPress={refresh} style={{ minHeight: 44, justifyContent: "center" }}><Text style={{ color: colors.accentText }}>{t("tasks.lifecycle.refresh")}</Text></Pressable>
    {items ? items.length ? items.map(task => <Pressable key={task.itemKey} accessibilityRole="button" onPress={() => router.push(`/tasks/relationship/${encodeURIComponent(task.connectionId)}${task.status === "open" || task.status === "scheduled" ? `?taskId=${encodeURIComponent(task.taskId)}&contactId=${encodeURIComponent(task.contactId)}` : ""}` as Href)} style={{ paddingVertical: 12 }}>
      <Text style={{ color: colors.ink }}>{task.titlePreview}</Text><Text style={{ color: colors.ink3Text }}>{task.contactNamePreview} · {task.status === "completed" ? t("tasks.lifecycle.statusCompleted") : task.status === "dismissed" ? t("tasks.lifecycle.statusDismissed") : t("tasks.lifecycle.statusOpen")}</Text>
    </Pressable>) : <Text style={{ color: colors.ink3Text }}>{t("tasks.lifecycle.empty")}</Text> : <View><Text style={{ color: colors.ink3Text }}>{state.kind === "loading" ? copy.loading.loading : state.kind === "offline" ? t("sync.notOnDevice") : t("tasks.lifecycle.readFailed")}</Text></View>}
    {page?.hasMore && !offline ? <Pressable accessibilityRole="button" onPress={() => setCursor(page.nextCursor)} style={{ minHeight: 44, justifyContent: "center" }}><Text style={{ color: colors.accentText }}>{t("tasks.lifecycle.nextPage")}</Text></Pressable> : null}
    {cursor ? <Pressable accessibilityRole="button" onPress={refresh} style={{ minHeight: 44, justifyContent: "center" }}><Text style={{ color: colors.accentText }}>{t("tasks.lifecycle.firstPage")}</Text></Pressable> : null}
  </DataCard>;
}
