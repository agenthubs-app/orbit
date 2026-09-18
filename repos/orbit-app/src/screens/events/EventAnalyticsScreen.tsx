import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { RefreshControl } from "react-native";

import { eventAnalyticsAggregatePath, eventAnalyticsAttendeePath } from "../../api/endpoints";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { AppScreen } from "../../components/AppScreen";
import { useOrbitTheme } from "../../design/theme";
import { useApiResource } from "../../hooks/useApiResource";
import { eventAnalyticsToView, eventAnalyticsFailureToMessage, type EventAnalyticsKind } from "../../view-models/event-analytics";
import { EventAnalyticsContent, type EventAnalyticsContentState } from "./EventAnalyticsContent";

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "event" : value ?? "event";
}

export function EventAnalyticsScreen() {
  const { colors } = useOrbitTheme();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const eventId = firstParam(params.id);
  const auth = useOrbitAuthSession();
  const { baseUrl } = useOrbitApiBaseUrl();
  const scopeKey = JSON.stringify([baseUrl, auth.actorId, eventId]);
  const aggregateState = useApiResource<unknown>(eventAnalyticsAggregatePath(eventId), () => false, { scopeKey: `${scopeKey}:aggregate`, cachePolicy: "network-only" });
  const attendeeState = useApiResource<unknown>(eventAnalyticsAttendeePath(eventId), () => false, { scopeKey: `${scopeKey}:attendee`, cachePolicy: "network-only" });
  const organizerView = aggregateState.kind === "success" ? eventAnalyticsToView(aggregateState.data, eventId) : null;
  const attendeeView = attendeeState.kind === "success" ? eventAnalyticsToView(attendeeState.data, eventId) : null;
  const organizerAvailable = organizerView?.kind === "organizer_aggregate";
  const attendeeAvailable = attendeeView?.kind === "attendee_report";
  const [selectedKind, setSelectedKind] = useState<EventAnalyticsKind>("organizer_aggregate");
  const activeKind = selectedKind === "organizer_aggregate" && organizerAvailable ? selectedKind : attendeeAvailable ? "attendee_report" : "organizer_aggregate";
  const view = activeKind === "organizer_aggregate" ? organizerView : attendeeView;
  const loading = !view && (aggregateState.kind === "loading" || attendeeState.kind === "loading");
  const firstFailure = [aggregateState, attendeeState].find((state) => state.kind === "failure" && state.status !== 403) ?? [aggregateState, attendeeState].find((state) => state.kind === "failure" || state.kind === "offline");
  const contentState: EventAnalyticsContentState = loading ? { kind: "loading" } : view ? { kind: "success" } : { kind: "failure", message: firstFailure && (firstFailure.kind === "failure" || firstFailure.kind === "offline") ? eventAnalyticsFailureToMessage(firstFailure.error, firstFailure.status) : "当前没有可验证的本活动报告，请重新读取。" };

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
