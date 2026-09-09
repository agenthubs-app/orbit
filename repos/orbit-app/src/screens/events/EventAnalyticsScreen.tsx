import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { RefreshControl } from "react-native";

import { eventAnalyticsAggregatePath, eventAnalyticsAttendeePath } from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { useOrbitTheme } from "../../design/theme";
import { useApiResource } from "../../hooks/useApiResource";
import { eventAnalyticsToView, type EventAnalyticsKind } from "../../view-models/event-analytics";
import { EventAnalyticsContent, type EventAnalyticsContentState } from "./EventAnalyticsContent";

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "event" : value ?? "event";
}

export function EventAnalyticsScreen() {
  const { colors } = useOrbitTheme();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const eventId = firstParam(params.id);
  const aggregateState = useApiResource<unknown>(eventAnalyticsAggregatePath(eventId), () => false);
  const attendeeState = useApiResource<unknown>(eventAnalyticsAttendeePath(eventId), () => false);
  const organizerView = aggregateState.kind === "success" ? eventAnalyticsToView(aggregateState.data) : null;
  const attendeeView = attendeeState.kind === "success" ? eventAnalyticsToView(attendeeState.data) : null;
  const organizerAvailable = organizerView?.kind === "organizer_aggregate";
  const attendeeAvailable = attendeeView?.kind === "attendee_report";
  const [selectedKind, setSelectedKind] = useState<EventAnalyticsKind>("organizer_aggregate");
  const activeKind = selectedKind === "organizer_aggregate" && organizerAvailable ? selectedKind : attendeeAvailable ? "attendee_report" : "organizer_aggregate";
  const view = activeKind === "organizer_aggregate" ? organizerView : attendeeView;
  const loading = !view && (aggregateState.kind === "loading" || attendeeState.kind === "loading");
  const firstFailure = [aggregateState, attendeeState].find((state) => state.kind === "failure" && state.status !== 403) ?? [aggregateState, attendeeState].find((state) => state.kind === "failure" || state.kind === "offline");
  const contentState: EventAnalyticsContentState = loading ? { kind: "loading" } : view ? { kind: "success" } : { kind: "failure", message: firstFailure && (firstFailure.kind === "failure" || firstFailure.kind === "offline") ? firstFailure.error.message : "当前账号没有可查看的活动汇总或个人报告。" };

  function refresh() {
    aggregateState.refresh();
    attendeeState.refresh();
  }

  return (
    <AppScreen eyebrow="活动分析" refreshControl={<RefreshControl onRefresh={refresh} refreshing={aggregateState.refreshing || attendeeState.refreshing} tintColor={colors.accent} />} title="活动数据报告">
      <EventAnalyticsContent activeKind={activeKind} attendeeAvailable={attendeeAvailable} onChangeKind={setSelectedKind} organizerAvailable={organizerAvailable} state={contentState} view={view} />
    </AppScreen>
  );
}
