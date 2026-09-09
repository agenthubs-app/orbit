import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, RefreshControl } from "react-native";

import { eventOperationsAdminPath, eventOperationsGenerationActionPath, eventOperationsGenerationsPath } from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { useOrbitTheme } from "../../design/theme";
import { useApiResource } from "../../hooks/useApiResource";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { eventOperationsGenerationMutationMatches, eventOperationsPublishedResultMatches, eventOperationsToView, type EventOperationsGenerationView } from "../../view-models/event-operations";
import { EventOperationsContent, type EventOperationsContentState } from "./EventOperationsContent";

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "event" : value ?? "event";
}

export function EventOperationsScreen() {
  const { colors } = useOrbitTheme();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const eventId = firstParam(params.id);
  const router = useRouter();
  const client = useOrbitApiClient();
  const state = useApiResource<unknown>(eventOperationsAdminPath(eventId), () => false);
  const view = state.kind === "success" ? eventOperationsToView(state.data) : eventOperationsToView(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const contentState: EventOperationsContentState =
    state.kind === "failure" &&
    state.error.context?.eventOperationsCode === "EVENT_OPERATIONS_NOT_CONFIGURED"
      ? { kind: "unconfigured" }
      : state.kind === "failure" || state.kind === "offline"
        ? { kind: state.kind, message: state.error.message }
        : { kind: state.kind };

  useEffect(() => {
    if (!view.hasActiveGeneration) return;
    const timer = setInterval(state.refresh, 3_000);
    return () => clearInterval(timer);
  }, [state.refresh, view.hasActiveGeneration]);

  async function startGeneration() {
    setBusy("start");
    setNotice(null);
    const result = await client.post<unknown>(eventOperationsGenerationsPath(eventId), { body: {} });
    if (result.success && eventOperationsGenerationMutationMatches(result.data, { eventId, statuses: ["queued", "running"] })) {
      setNotice("匹配生成已开始。完成后仍需你确认发布。");
      state.refresh();
    } else if (result.success) {
      setNotice("服务器返回的生成状态无法确认，已刷新运营台。");
      state.refresh();
    } else {
      setNotice(result.error.message);
    }
    setBusy(null);
  }

  async function runGenerationAction(generation: EventOperationsGenerationView) {
    if (!generation.action) return;
    setBusy(generation.generationId);
    setNotice(null);
    const result = await client.post<unknown>(eventOperationsGenerationActionPath(eventId, generation.generationId, generation.action));
    const valid = result.success && (generation.action === "publish" ? eventOperationsPublishedResultMatches(result.data, eventId, generation.generationId) : eventOperationsGenerationMutationMatches(result.data, { eventId, generationId: generation.generationId, statuses: ["queued", "running"] }));
    if (valid) setNotice(generation.action === "publish" ? "完整匹配结果已发布。" : "失败分片已进入重试队列。");
    else if (result.success) setNotice("服务器返回的任务状态无法确认，已刷新运营台。");
    else setNotice(result.error.message);
    state.refresh();
    setBusy(null);
  }

  function confirmStart() {
    Alert.alert("生成匹配", `将为 ${view.metrics[0]?.value ?? 0} 位参会者生成推荐与两轮分桌。完成后不会自动发布。`, [
      { style: "cancel", text: "取消" },
      { onPress: () => void startGeneration(), text: "开始生成" }
    ]);
  }

  function confirmGenerationAction(generation: EventOperationsGenerationView) {
    const publishing = generation.action === "publish";
    Alert.alert(publishing ? "发布匹配结果" : "重试失败分片", publishing ? "发布后参会者将能按时间门禁看到完整结果。确认继续？" : "只会重置失败分片，已完成结果会保留。", [
      { style: "cancel", text: "取消" },
      { onPress: () => void runGenerationAction(generation), text: publishing ? "确认发布" : "开始重试" }
    ]);
  }

  return (
    <AppScreen eyebrow="活动运营" refreshControl={<RefreshControl onRefresh={state.refresh} refreshing={state.refreshing} tintColor={colors.accent} />} title="运营控制台">
      <EventOperationsContent busy={busy} notice={notice} onGenerationAction={confirmGenerationAction} onOpenAnalytics={() => router.push(`/events/${encodeURIComponent(eventId)}/analytics` as Href)} onOpenCheckIn={() => router.push(`/events/${encodeURIComponent(eventId)}/operations/check-in` as Href)} onOpenExperience={() => router.push(`/events/${encodeURIComponent(eventId)}/operations/experience` as Href)} onOpenRoles={() => router.push(`/events/${encodeURIComponent(eventId)}/operations/roles` as Href)} onStartGeneration={confirmStart} state={contentState} view={view} />
    </AppScreen>
  );
}
