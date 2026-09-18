import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { createCanonicalArtifactSchema, createCanonicalOperationsSchema, createCanonicalRegistrationSchema } from "../../api/canonical-event-detail-contract";
import { eventOperationsPath, eventPostEventArtifactPath, eventRegistrationPath, eventRegistrationCancelPath } from "../../api/endpoints";
import { validateApiResourceState } from "../../api/validated-resource-state";
import { DataCard } from "../../components/DataCard";
import { ErrorState } from "../../components/ErrorState";
import { spacing, textStyles } from "../../design/tokens";
import { createThemedStyles } from "../../design/theme";
import { useApiResource, type ApiResourceState } from "../../hooks/useApiResource";
import { canonicalArtifactToView, canonicalRecommendationsToView, canonicalRegistrationToView } from "../../view-models/canonical-event-detail";
import { eventRegistrationToView, eventRegistrationReceiptMatches, eventRegistrationAuthorityKey, type EventRegistrationView } from "../../view-models/event-registration";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";

import { confirmEventCancellation } from "../../platform/confirm-event-cancellation";

export type CanonicalRegistrationFooterState = { registration: EventRegistrationView; verifying: boolean };

// A disabled, explicit state is required: the legacy footer treats null as public registration.
export const unavailableCanonicalRegistration = eventRegistrationToView({ eligibility: {
  allowedActions: [], applicationVersion: null, evaluatedAt: "", policyVersion: null,
  reason: "unavailable", registrationVersion: null, state: "unavailable"
} });

export function CanonicalEventDetailModules({ eventId, endsAt, scopeKey, onRegistrationChange, onRegistrationMutationConfirmed }: {
  eventId: string; endsAt: string; scopeKey: string;
  onRegistrationChange: (state: CanonicalRegistrationFooterState) => void;
  onRegistrationMutationConfirmed?: () => void;
}) {
  const auth = useOrbitAuthSession();
  const locale = useOrbitLocale();
  const { baseUrl } = useOrbitApiBaseUrl();
  const actorId = auth.actorId ?? auth.user?.id ?? "";
  const resourceScope = JSON.stringify([scopeKey, baseUrl, actorId, auth.cookieHeader, eventId]);
  const client = useOrbitApiClient({ scopeKey: resourceScope });
  const schema = useMemo(() => createCanonicalRegistrationSchema(eventId, actorId), [eventId, actorId]);
  const raw = useApiResource<unknown>(`${eventRegistrationPath(eventId)}?questions=false`, () => false,
    { scopeKey: resourceScope, cachePolicy: "network-only" });
  const state = validateApiResourceState(raw, schema);
  const rawData = raw.kind === "success" || raw.kind === "empty" ? raw.data : null;
  const data = state.kind === "success" || state.kind === "empty" ? state.data : null;
  const view = data ? canonicalRegistrationToView(data, endsAt, locale.language) : null;
  const latestData = useRef(data); latestData.current = data;
  const latestScope = useRef(resourceScope); latestScope.current = resourceScope;
  const mounted = useRef(true);
  const cancellation = useRef<AbortController | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; cancellation.current?.abort(); cancellation.current = null; }; }, [resourceScope]);
  const { styles } = useStyles();
  useEffect(() => {
    const validated = validateApiResourceState(raw, schema);
    const registration = validated.kind === "success" || validated.kind === "empty"
      ? eventRegistrationToView(validated.data, locale.language) : eventRegistrationToView({ eligibility: { allowedActions: [], state: "unavailable", evaluatedAt: "", blockingReason: "temporarily_unavailable" } }, locale.language);
    onRegistrationChange({ registration, verifying: validated.kind === "loading" || cancelling });
  }, [raw.kind, rawData, schema, onRegistrationChange, locale.language, cancelling]);

  function confirmCanonicalCancellation() {
    if (!data?.registration || !view?.footer.allowedActions?.includes("cancel") || cancellation.current) return;
    const record = data.registration;
    const authority = eventRegistrationAuthorityKey(view.footer);
    const current = () => mounted.current && latestScope.current === resourceScope && latestData.current &&
      latestData.current.registration?.id === record.id && eventRegistrationAuthorityKey(eventRegistrationToView(latestData.current)) === authority;
    confirmEventCancellation({
      title: locale.t("registration.actionCancel"), message: locale.t("registration.cancelConfirmation"),
      keepLabel: locale.t("registration.cancelKeep"), cancelLabel: locale.t("registration.actionCancel"),
      onUnavailable: () => { if (current()) setCancelError(locale.t("registration.cancelConfirmationUnavailable")); },
      onConfirm: () => { void (async () => {
        if (!current() || cancellation.current) return;
        const controller = new AbortController(); cancellation.current = controller; setCancelling(true); setCancelError(null);
        const scoped = () => mounted.current && latestScope.current === resourceScope && cancellation.current === controller;
        try {
          const result = await client.post<unknown>(eventRegistrationCancelPath(eventId), { signal: controller.signal, body: { intent: "cancel", expectedRegistrationVersion: record.updatedAt } });
          if (!scoped()) return;
          if (!result.success || result.status < 200 || result.status >= 300 || !eventRegistrationReceiptMatches(result.data, eventId, actorId, "cancelled", "cancel")) throw new Error(locale.t("registration.cancelUnconfirmed"));
          const receipt = result.data as { id: string; updatedAt: string };
          if (receipt.id !== record.id) throw new Error(locale.t("registration.cancelUnconfirmed"));
          const readback = await client.get<unknown>(`${eventRegistrationPath(eventId)}?questions=false`, { signal: controller.signal });
          if (!scoped()) return;
          const parsed = readback.success && readback.status >= 200 && readback.status < 300 ? schema.safeParse(readback.data) : null;
          if (!parsed?.success || parsed.data.registration?.status !== "cancelled" || parsed.data.registration.id !== receipt.id || parsed.data.registration.updatedAt !== receipt.updatedAt) throw new Error(locale.t("registration.cancelUnconfirmed"));
          raw.refresh();
          onRegistrationMutationConfirmed?.();
        } catch (error) { if (scoped()) setCancelError(error instanceof Error ? error.message : locale.t("registration.cancelUnconfirmed")); }
        finally { if (scoped()) { cancellation.current = null; setCancelling(false); } }
      })(); }
    });
  }

  return <View>
    <DataCard title="会前准备" detail="本次活动的报名与资料事实">
      {state.kind === "loading" ? <Text style={styles.body}>正在确认报名与资料</Text> : null}
      <CanonicalResourceFailure state={state} />
      {view ? <>
        <Text style={styles.body}>{view.status}</Text>
        <Text style={styles.detail}>{view.detail}</Text>
        {view.footer.allowedActions?.includes("cancel") ? <Pressable accessibilityRole="button" disabled={cancelling} onPress={confirmCanonicalCancellation}>
          <Text style={styles.body}>{locale.t("registration.cancelThisRegistration")}</Text>
        </Pressable> : null}
        {cancelError ? <Text accessibilityRole="alert" style={styles.detail}>{cancelError}</Text> : null}
        {view.activeRegistration ? <>
          <Text style={styles.body}>参会目标：{view.goal ?? "尚未填写"}</Text>
          {view.profileFacts.map(fact => <Text key={fact.label} style={styles.body}>{fact.label}：{fact.value}</Text>)}
        </> : null}
      </> : null}
    </DataCard>
    {view?.activeRegistration && data?.registration ? <CanonicalRecommendationsModule eventId={eventId}
      participantProfileId={data.registration.participantProfileId} scopeKey={resourceScope} /> :
      <DataCard title="推荐认识的人" detail={view ? "仅已报名账号可读取；结果以主办方发布状态为准。" : "确认报名状态后才能读取推荐结果。"} />}
    {view && !view.eventEnded ? <DataCard title="会后复核" detail="活动结束后可用；现在不会读取或生成会后总结。" /> :
      view?.activeRegistration ? <CanonicalArtifactModule eventId={eventId} scopeKey={resourceScope} /> :
        <DataCard title="会后复核" detail={view ? "仅已报名账号可读取已有会后资料。" : "活动时间资格尚未确认，不会读取会后资料。"} />}
  </View>;
}

function CanonicalRecommendationsModule({ eventId, participantProfileId, scopeKey }: { eventId: string; participantProfileId: string; scopeKey: string }) {
  const raw = useApiResource<unknown>(eventOperationsPath(eventId), () => false,
    { scopeKey: JSON.stringify([scopeKey, participantProfileId, "operations"]), cachePolicy: "network-only" });
  const schema = useMemo(() => createCanonicalOperationsSchema(eventId, participantProfileId), [eventId, participantProfileId]);
  const state = validateApiResourceState(raw, schema);
  const data = state.kind === "success" || state.kind === "empty" ? state.data : null;
  const view = data ? canonicalRecommendationsToView(data) : null;
  const { styles } = useStyles();
  return <DataCard title="推荐认识的人">
    {state.kind === "loading" ? <Text style={styles.body}>正在读取已发布的推荐结果</Text> : null}
    <CanonicalResourceFailure state={state} />
    {view ? <>
      <Text style={styles.body}>{view.status}</Text>
      {view.detail ? <Text style={styles.detail}>{view.detail}</Text> : null}
      {view.people.map(person => <View key={person.participantId} style={styles.person}>
        <Text style={styles.name}>{person.name}</Text>
        {person.context ? <Text style={styles.detail}>{person.context}</Text> : null}
        {person.reasons.map((reason, index) => <Text key={index} style={styles.body}>{reason}</Text>)}
        {person.memberHint ? <Text style={styles.body}>{person.memberHint}</Text> : null}
        {person.icebreakers.map((line, index) => <Text key={index} style={styles.detail}>{line}</Text>)}
      </View>)}
    </> : null}
  </DataCard>;
}

function CanonicalArtifactModule({ eventId, scopeKey }: { eventId: string; scopeKey: string }) {
  const raw = useApiResource<unknown>(eventPostEventArtifactPath(eventId), () => false,
    { scopeKey: JSON.stringify([scopeKey, "post-event-artifact"]), cachePolicy: "network-only" });
  const schema = useMemo(() => createCanonicalArtifactSchema(eventId), [eventId]);
  const state = validateApiResourceState(raw, schema);
  const data = state.kind === "success" || state.kind === "empty" ? state.data : null;
  const view = data ? canonicalArtifactToView(data) : null;
  const { styles } = useStyles();
  return <DataCard title="会后复核" detail="只读取已保存的会后总结；不执行联系人批量确认。">
    {state.kind === "loading" ? <Text style={styles.body}>正在读取已有会后总结</Text> : null}
    <CanonicalResourceFailure state={state} />
    {view ? <>
      <Text style={styles.body}>{view.status}</Text>
      {view.summary ? <Text style={styles.body}>{view.summary}</Text> : null}
      {view.failureDetail ? <Text style={styles.detail}>{view.failureDetail}</Text> : null}
    </> : null}
  </DataCard>;
}

function CanonicalResourceFailure({ state }: { state: ApiResourceState<unknown> }) {
  const { styles } = useStyles();
  return state.kind === "failure" || state.kind === "offline" ? <>
    <ErrorState title="暂时无法读取" message={state.error.message} />
    <Pressable accessibilityRole="button" accessibilityLabel="重新读取本模块" onPress={state.refresh} style={styles.retry}>
      <Text style={styles.retryText}>重新读取</Text>
    </Pressable>
  </> : null;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  body: { ...textStyles.body, color: colors.ink },
  detail: { ...textStyles.small, color: colors.text3 },
  name: { ...textStyles.listTitle, color: colors.ink },
  person: { gap: spacing.xs, paddingVertical: spacing.sm },
  retry: { minHeight: 44, justifyContent: "center" },
  retryText: { ...textStyles.body, color: colors.accent }
}));
