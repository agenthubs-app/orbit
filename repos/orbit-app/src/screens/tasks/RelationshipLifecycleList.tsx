import { type Href, useRouter, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { randomUUID } from "expo-crypto";
import { Pressable, Text, View } from "react-native";
import { useApiResource } from "../../hooks/useApiResource";
import { decodeRelationshipTaskPage } from "../../view-models/relationship-task-pages";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { DataCard } from "../../components/DataCard";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { useOrbitTheme as useTheme } from "../../design/theme";

export function RelationshipLifecycleList({ scopeKey, ready, mode }: { scopeKey: string; ready: boolean; mode: "open" | "completed" }) {
  const auth = useOrbitAuthSession(), server = useOrbitApiBaseUrl();
  const actorId = auth.actorId ?? "";
  const enabled = ready && auth.ready && auth.signedIn && server.ready && Boolean(actorId);
  const sessionKey = useMemo(() => randomUUID(), [scopeKey, actorId, auth.cookieHeader, server.baseUrl, enabled, mode]);
  return <ScopedLifecycleList key={sessionKey} scopeKey={sessionKey} actorId={actorId} ready={enabled} mode={mode} />;
}

function ScopedLifecycleList({ scopeKey, actorId, ready, mode }: { scopeKey: string; actorId: string; ready: boolean; mode: "open" | "completed" }) {
  const [cursor, setCursor] = useState<string | null>(null);
  const state = useApiResource<unknown>(`/api/relationship-tasks/page?mode=${mode}&limit=30${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, () => false,
    { scopeKey: `${scopeKey}:page:${cursor ?? "first"}`, cachePolicy: "network-only", enabled: ready });
  const router = useRouter();
  const { language } = useOrbitLocale();
  const { colors } = useTheme();
  const text = (zh: string, en: string, ja: string) => language === "zh" ? zh : language === "ja" ? ja : en;
  const refresh = () => { setCursor(null); state.refresh(); };
  const refreshRef = useRef(refresh); refreshRef.current = refresh;
  // Returning from a task mutation starts at the current first page; changing
  // the cursor must not itself trigger the focus reset.
  useFocusEffect(useCallback(() => { refreshRef.current(); }, []));
  const page = decodeRelationshipTaskPage(ready && (state.kind === "success" || state.kind === "empty") ? state.data : null, actorId, mode);
  const items = page?.items;
  return <DataCard title={text("人脉跟进", "Relationship follow-ups", "関係のフォローアップ")} detail={text("完成时需确认关系下一步", "Complete with a relationship next step", "完了時に関係の次のステップを確認")}>
    <Pressable accessibilityRole="button" onPress={refresh} style={{ minHeight: 44, justifyContent: "center" }}><Text style={{ color: colors.accent }}>{text("刷新人脉跟进", "Refresh follow-ups", "フォローアップを更新")}</Text></Pressable>
    {items ? items.length ? items.map(task => <Pressable key={task.itemKey} accessibilityRole="button" onPress={() => router.push(`/tasks/relationship/${encodeURIComponent(task.connectionId)}` as Href)} style={{ paddingVertical: 12 }}>
      <Text style={{ color: colors.ink }}>{task.titlePreview}</Text><Text style={{ color: colors.text3 }}>{task.contactNamePreview} · {task.status === "completed" ? text("已完成", "Completed", "完了") : task.status === "dismissed" ? text("已忽略", "Dismissed", "終了") : text("待处理", "Open", "未完了")}</Text>
    </Pressable>) : <Text style={{ color: colors.text3 }}>{text("暂无人脉跟进", "No follow-ups", "フォローアップはありません")}</Text> : <View><Text style={{ color: colors.text3 }}>{state.kind === "loading" ? text("正在读取…", "Loading…", "読み込み中…") : text("跟进读取失败，请刷新重试。", "Unable to load follow-ups. Refresh to retry.", "読み込めませんでした。再試行してください。")}</Text></View>}
    {page?.hasMore ? <Pressable accessibilityRole="button" onPress={() => setCursor(page.nextCursor)} style={{ minHeight: 44, justifyContent: "center" }}><Text style={{ color: colors.accent }}>{text("下一页跟进", "Next follow-up page", "次のフォローアップ")}</Text></Pressable> : null}
    {cursor ? <Pressable accessibilityRole="button" onPress={refresh} style={{ minHeight: 44, justifyContent: "center" }}><Text style={{ color: colors.accent }}>{text("返回跟进第一页", "First follow-up page", "最初のフォローアップ")}</Text></Pressable> : null}
  </DataCard>;
}
