import { type Href, useRouter, useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { Pressable, Text, View } from "react-native";
import { useApiResource } from "../../hooks/useApiResource";
import { relationshipTaskListSchema } from "../../api/schema/relationship-lifecycle";
import { DataCard } from "../../components/DataCard";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { useOrbitTheme as useTheme } from "../../design/theme";

export function RelationshipLifecycleList({ scopeKey, ready, mode }: { scopeKey: string; ready: boolean; mode: "open" | "completed" }) {
  const state = useApiResource<unknown>("/api/relationship-tasks", () => false, { scopeKey, cachePolicy: "network-only" });
  const router = useRouter();
  const { language } = useOrbitLocale();
  const { colors } = useTheme();
  const text = (zh: string, en: string, ja: string) => language === "zh" ? zh : language === "ja" ? ja : en;
  useFocusEffect(useCallback(() => { state.refresh(); }, [state.refresh]));
  const parsed = ready && (state.kind === "success" || state.kind === "empty") ? relationshipTaskListSchema.safeParse(state.data) : null;
  const items = parsed?.success ? parsed.data.tasks.filter(task => mode === "open" ? ["open", "scheduled"].includes(task.status) : ["completed", "dismissed"].includes(task.status)) : null;
  return <DataCard title={text("人脉跟进", "Relationship follow-ups", "関係のフォローアップ")} detail={text("完成时需确认关系下一步", "Complete with a relationship next step", "完了時に関係の次のステップを確認")}>
    <Pressable accessibilityRole="button" onPress={state.refresh}><Text style={{ color: colors.accent }}>{text("刷新人脉跟进", "Refresh follow-ups", "フォローアップを更新")}</Text></Pressable>
    {items ? items.length ? items.map(task => <Pressable key={task.taskId} accessibilityRole="button" onPress={() => router.push(`/tasks/relationship/${encodeURIComponent(task.connectionId)}` as Href)} style={{ paddingVertical: 12 }}>
      <Text style={{ color: colors.ink }}>{task.title}</Text><Text style={{ color: colors.text3 }}>{task.contactName} · {task.status === "completed" ? text("已完成", "Completed", "完了") : task.status === "dismissed" ? text("已忽略", "Dismissed", "終了") : text("待处理", "Open", "未完了")}</Text>
    </Pressable>) : <Text style={{ color: colors.text3 }}>{text("暂无人脉跟进", "No follow-ups", "フォローアップはありません")}</Text> : <View><Text style={{ color: colors.text3 }}>{state.kind === "loading" ? text("正在读取…", "Loading…", "読み込み中…") : text("跟进读取失败，请刷新重试。", "Unable to load follow-ups. Refresh to retry.", "読み込めませんでした。再試行してください。")}</Text></View>}
  </DataCard>;
}
