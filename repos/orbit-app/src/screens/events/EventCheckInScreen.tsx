import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { RefreshControl, StyleSheet, Text } from "react-native";

import { eventOperationsCheckInsPath } from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { colors, spacing, typography } from "../../design/tokens";
import { useApiResource } from "../../hooks/useApiResource";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import {
  buildEventCheckInBody,
  eventCheckInRosterToView,
  type EventCheckInSegment
} from "../../view-models/event-check-in";
import {
  EventCheckInContent,
  type EventCheckInContentState
} from "./EventCheckInContent";

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "event" : value ?? "event";
}

export function EventCheckInScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const eventId = firstParam(params.id);
  const path = eventOperationsCheckInsPath(eventId);
  const state = useApiResource<unknown>(
    path,
    (data) => {
      const view = eventCheckInRosterToView(data);
      return view.contractValid && view.participants.length === 0;
    }
  );
  const client = useOrbitApiClient();
  const [query, setQuery] = useState("");
  const [segment, setSegment] = useState<EventCheckInSegment>("all");
  const [pendingParticipantId, setPendingParticipantId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const roster =
    state.kind === "success" || state.kind === "empty"
      ? eventCheckInRosterToView(state.data)
      : eventCheckInRosterToView(null);
  const contentState: EventCheckInContentState =
    (state.kind === "success" || state.kind === "empty") && !roster.contractValid
      ? { kind: "failure", message: "签到名单的数据格式不符合最小权限契约，请稍后重试。" }
      : state.kind === "failure" || state.kind === "offline"
      ? { kind: state.kind, message: state.error.message }
      : { kind: state.kind };

  async function checkIn(participantId: string) {
    if (pendingParticipantId) {
      return;
    }
    setPendingParticipantId(participantId);
    setNotice(null);
    const result = await client.post<unknown>(path, {
      body: buildEventCheckInBody(participantId)
    });
    if (result.success) {
      const participant = roster.participants.find(
        (item) => item.participantId === participantId
      );
      setNotice(`${participant?.displayName ?? "参会者"} 已标记为到场。`);
      state.refresh();
    } else if (result.status === 409) {
      setNotice("活动状态或签到时间窗口已经变化，名单已刷新。");
      state.refresh();
    } else {
      setNotice(result.error.message);
    }
    setPendingParticipantId(null);
  }

  return (
    <AppScreen
      eyebrow="现场运营"
      refreshControl={
        <RefreshControl
          onRefresh={state.refresh}
          refreshing={state.refreshing}
          tintColor={colors.accent}
        />
      }
      title="活动签到台"
    >
      <Text style={styles.intro}>快速查找参会者并记录首次到场。</Text>
      <EventCheckInContent
        notice={notice}
        onCheckIn={(participantId) => void checkIn(participantId)}
        onQueryChange={setQuery}
        onSegmentChange={setSegment}
        pendingParticipantId={pendingParticipantId}
        query={query}
        roster={roster}
        segment={segment}
        state={contentState}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  intro: {
    color: colors.text2,
    fontSize: typography.small,
    lineHeight: 20,
    marginTop: -spacing.sm
  }
});
