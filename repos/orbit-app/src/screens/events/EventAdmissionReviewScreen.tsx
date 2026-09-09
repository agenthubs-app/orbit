import { useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Alert, RefreshControl, StyleSheet, Text } from "react-native";

import {
  eventAdmissionReviewDecisionPath,
  eventAdmissionReviewDetailPath,
  eventAdmissionReviewsPath
} from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { spacing, typography } from "../../design/tokens";
import { createThemedStyles } from "../../design/theme";
import { useApiResource } from "../../hooks/useApiResource";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import {
  buildEventAdmissionDecisionBody,
  eventAdmissionApplicationToView,
  eventAdmissionReviewListToView,
  type EventAdmissionApplicationView,
  type EventAdmissionDecision,
  type EventAdmissionReviewItemView,
  type EventAdmissionReviewViewName
} from "../../view-models/event-admission-review";
import {
  EventAdmissionReviewContent,
  type EventAdmissionReviewContentState
} from "./EventAdmissionReviewContent";

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "event" : value ?? "event";
}

export function EventAdmissionReviewScreen() {
  const { colors, styles } = useStyles();
  const params = useLocalSearchParams<{
    id?: string | string[];
    view?: string | string[];
  }>();
  const eventId = firstParam(params.id);
  const initialView = firstParam(params.view) === "processed" ? "processed" : "pending";
  const [view, setView] = useState<EventAdmissionReviewViewName>(initialView);
  const path = eventAdmissionReviewsPath(eventId, view);
  const state = useApiResource<unknown>(
    path,
    (data) => eventAdmissionReviewListToView(data).items.length === 0
  );
  const client = useOrbitApiClient();
  const [detail, setDetail] = useState<EventAdmissionApplicationView | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [extraItems, setExtraItems] = useState<EventAdmissionReviewItemView[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<"decision" | "more" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const baseList =
    state.kind === "success" || state.kind === "empty"
      ? eventAdmissionReviewListToView(state.data)
      : eventAdmissionReviewListToView({ items: [], total: 0, view });

  useEffect(() => {
    setDetail(null);
    setExtraItems([]);
    setNextCursor(null);
    setNotice(null);
  }, [path]);

  useEffect(() => {
    if (state.kind === "success" || state.kind === "empty") {
      setNextCursor(eventAdmissionReviewListToView(state.data).nextCursor);
    }
  }, [state]);

  const list = useMemo(
    () => ({
      ...baseList,
      items: [...baseList.items, ...extraItems],
      nextCursor,
      view
    }),
    [baseList, extraItems, nextCursor, view]
  );

  const contentState: EventAdmissionReviewContentState =
    state.kind === "failure" || state.kind === "offline"
      ? { kind: state.kind, message: state.error.message }
      : { kind: state.kind };

  async function openApplication(actorId: string) {
    setDetailLoading(true);
    setNotice(null);
    const result = await client.get<unknown>(
      eventAdmissionReviewDetailPath(eventId, actorId)
    );
    if (result.success) {
      const next = eventAdmissionApplicationToView(result.data);
      if (next) {
        setDetail(next);
      } else {
        setNotice("报名申请的数据暂时无法识别，请刷新后重试。");
      }
    } else {
      setNotice(result.error.message);
    }
    setDetailLoading(false);
  }

  async function loadMore() {
    if (!nextCursor || pendingAction) {
      return;
    }
    setPendingAction("more");
    const result = await client.get<unknown>(
      eventAdmissionReviewsPath(eventId, view, nextCursor)
    );
    if (result.success) {
      const page = eventAdmissionReviewListToView(result.data);
      setExtraItems((current) => [...current, ...page.items]);
      setNextCursor(page.nextCursor);
    } else {
      setNotice(result.error.message);
    }
    setPendingAction(null);
  }

  async function saveDecision(decision: EventAdmissionDecision) {
    if (!detail || pendingAction) {
      return;
    }
    setPendingAction("decision");
    setNotice(null);
    const result = await client.post<unknown>(
      eventAdmissionReviewDecisionPath(eventId, detail.actorId),
      { body: buildEventAdmissionDecisionBody(detail, decision) }
    );
    if (result.success) {
      const next = eventAdmissionApplicationToView(result.data);
      if (next) {
        setDetail(next);
        setNotice(decision === "approve" ? "报名已批准。" : "报名已拒绝。");
      } else {
        setNotice("决定已提交，但最新申请状态暂时无法识别，请刷新确认。");
      }
      state.refresh();
    } else if (result.status === 409) {
      setDetail(null);
      setNotice("申请已被其他审核员处理，队列已刷新。");
      state.refresh();
    } else {
      setNotice(result.error.message);
    }
    setPendingAction(null);
  }

  function confirmDecision(decision: EventAdmissionDecision) {
    if (!detail) {
      return;
    }
    const approve = decision === "approve";
    Alert.alert(
      approve ? "批准报名" : "拒绝报名",
      `${approve ? "确认批准" : "确认拒绝"}${detail.displayName}的报名？`,
      [
        { style: "cancel", text: "取消" },
        {
          onPress: () => void saveDecision(decision),
          style: approve ? "default" : "destructive",
          text: approve ? "批准" : "拒绝"
        }
      ]
    );
  }

  return (
    <AppScreen
      eyebrow="活动运营"
      {...(!detail
        ? {
            refreshControl: (
          <RefreshControl
            onRefresh={state.refresh}
            refreshing={state.refreshing}
            tintColor={colors.accent}
          />
            )
          }
        : {})}
      title="报名审核"
    >
      {!detail && !detailLoading ? (
        <Text style={styles.intro}>审核报名画像，决定准入名单。</Text>
      ) : null}
      <EventAdmissionReviewContent
        busy={pendingAction !== null}
        detail={detail}
        detailLoading={detailLoading}
        list={list}
        notice={notice}
        onBackToList={() => setDetail(null)}
        onChangeView={setView}
        onDecision={confirmDecision}
        onLoadMore={() => void loadMore()}
        onSelectApplicant={(actorId) => void openApplication(actorId)}
        state={contentState}
      />
    </AppScreen>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  intro: {
    color: colors.text2,
    fontSize: typography.small,
    lineHeight: 20,
    marginTop: -spacing.sm
  }
}));
