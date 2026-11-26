// R17 イベント運営（App；`/events/[id]/operations?seg=overview|matching|people|check-in|report`）。
// 概要 = b6 #23；マッチング = b12 #422（只读，入れ替えは PC）；参加者 = b13 HM-P1–P9（HostPeopleTab：手机上办完审核）；
// 受付 = 跳到 /operations/check-in（b6 #24）；レポート = b12 #430（三格摘要 + 「PC で詳細」）。
// 数据：GET /api/host/events/[id]/overview（概要 + レポート摘要）、/matching?round=、/people?bucket=；写：matching/publish、people/[actorId]/decision、
// notices/preview + send（プロフィール未完了 的定型お知らせ，发前确认）。App 不做申込設定 / 报告详情（画板「PC で」）。
import { Redirect, useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useCallback, useEffect, useState } from "react";

import type { HostMatchingResponse, HostOverviewResponse, HostPeopleBucket } from "../../api/contract/host-console";
import type { HostEventView } from "../../api/contract/host-events";
import { IconButton, presentConfirm, useToast } from "../../components/ui";
import { JourneyPage } from "../events/v2/JourneyPage";
import { useHostApi } from "./host-api";
import { checkInHref, consoleHref, consoleSubtitle, desktopPath, parseSeg, type HostSeg } from "./host-model";
import { PcCard } from "./host-ui";
import { useHostT } from "./useHostT";
import { MatchingBody, OverviewBody, ReportBody, SegChips } from "./console-view";
import { PEOPLE_BUCKETS } from "./people-view";
import { HostPeopleTab } from "./HostPeopleTab";


export function HostConsoleScreen() {
  const { t, language } = useHostT();
  const router = useRouter();
  const toast = useToast();
  const api = useHostApi();
  const params = useLocalSearchParams<{ id?: string; seg?: string; round?: string; bucket?: string }>();
  const eventId = String(params.id ?? "");
  const seg = parseSeg(params.seg);
  const [overview, setOverview] = useState<HostOverviewResponse | null>(null);
  const [matching, setMatching] = useState<HostMatchingResponse | null>(null);
  const [event, setEvent] = useState<HostEventView | null>(null);
  const [failed, setFailed] = useState(false);
  const [round, setRound] = useState(Number(params.round) || 1);
  const now = new Date();

  const loadOverview = useCallback(async () => {
    const res = await api.overview(eventId);
    if (res.ok) { setOverview(res.data); setEvent(res.data.event); setFailed(false); } else setFailed(true);
  }, [api, eventId]);
  useEffect(() => {
    let live = true;
    if (seg === "overview" || seg === "report") void loadOverview();
    if (seg === "matching") void api.matching(eventId, round).then((res) => { if (!live) return; if (res.ok) { setMatching(res.data); setEvent(res.data.event); } else setFailed(true); });
    return () => { live = false; };
  }, [api, eventId, loadOverview, round, seg]);

  const go = (next: HostSeg) => router.setParams({ seg: next === "overview" ? undefined : next });
  const sendPc = async (path: string) => { const res = await api.desktopLink(path); if (res.ok) toast.success(t("appPcSent")); else toast.error(t("saveError")); };
  const publish = async () => {
    const current = await api.matching(eventId, 1);
    if (!current.ok || !current.data.generationId) { toast.error(t("saveError")); return; }
    const ok = await presentConfirm({ cancelLabel: t("cancel"), confirmLabel: t("aPublish"), message: t("pubSub", { n: current.data.participantCount }), title: t("appPublishTitle") });
    if (!ok) return;
    const res = await api.publishMatching(eventId, current.data.generationId, current.data.overridesVersion);
    if (res.ok) { toast.success(t("appPublishedToast")); void loadOverview(); } else toast.error(res.reason === "sample" ? t("appSampleReadOnly") : t("saveError"));
  };
  const notify = async () => {
    const preview = await api.noticePreview(eventId);
    if (!preview.ok) { toast.error(preview.reason === "rate_limited" ? t("noticeLimit") : t("saveError")); return; }
    const ok = await presentConfirm({ cancelLabel: t("cancel"), confirmLabel: t("appNotifySend"), message: preview.data.body, title: t("noticeTitle", { n: preview.data.recipients }) });
    if (!ok) return;
    const sent = await api.noticeSend(eventId);
    if (sent.ok) toast.success(t("appNotified", { n: sent.data.queued })); else toast.error(sent.reason === "sample" ? t("appSampleReadOnly") : t("saveError"));
  };


  if (seg === "check-in") return <Redirect href={checkInHref(eventId) as Href} />;
  const title = event?.title ?? "";
  const back = { fallback: "/events/center", leftLabel: t("appBack") };
  const cohosts = <IconButton icon="users" accessibilityLabel={t("appCohosts")} onPress={() => void sendPc(`/app/events/${encodeURIComponent(eventId)}/operations?drawer=cohosts`)} />;

  if (seg === "matching") {
    return (
      <JourneyPage title={t("appMatchTitle")} subtitle={title ? `${title} · ${t("mRoundShort", { n: round })}` : undefined} {...back} onLeft={() => go("overview")} testID="host-console-matching">
        {matching ? <MatchingBody data={matching} t={t} onRound={setRound} /> : failed ? <PcCard text={t("appLoadError")} emoji="⚠️" tone="apricot" /> : null}
      </JourneyPage>
    );
  }
  if (seg === "people") {
    return <HostPeopleTab api={api} eventId={eventId} t={t} title={title} initialBucket={PEOPLE_BUCKETS.includes(params.bucket as HostPeopleBucket) ? (params.bucket as HostPeopleBucket) : null} onBack={() => go("overview")} onChanged={() => void loadOverview()} />;
  }
  return (
    <JourneyPage title={title} subtitle={overview ? consoleSubtitle(overview.event.startsAt, overview.event.status, now, language, t) : undefined} {...back} right={cohosts} testID={`host-console-${seg}`}>
      <SegChips seg={seg} t={t} pending={seg === "overview" ? overview?.pendingReview ?? null : null} onSeg={go} />
      {overview ? (seg === "report"
        ? <ReportBody data={overview} t={t} now={now} onPc={() => void sendPc(desktopPath.report(eventId))} />
        : <OverviewBody data={overview} t={t} onCheckIn={() => router.push(checkInHref(eventId) as Href)} onResults={() => go("matching")} onPublish={() => void publish()} onReview={() => go("people")} onNotify={() => void notify()} onEditOnPc={() => void sendPc(desktopPath.edit(eventId))} />)
        : failed ? <PcCard text={t("appLoadError")} emoji="⚠️" tone="apricot" /> : null}
    </JourneyPage>
  );
}

/** 旧运营子页 → 新运营台的一段（admission → 参加者、analytics → レポート、experience / roles → 概要）。 */
export function LegacyOperationsRedirect({ to }: { to: HostSeg }) {
  const params = useLocalSearchParams<{ id?: string }>();
  return <Redirect href={consoleHref(String(params.id ?? ""), to) as Href} />;
}
