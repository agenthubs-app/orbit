// R17 イベント運営（App；`/events/[id]/operations?seg=overview|matching|people|check-in|report`）。
// 概要 = b6 #23；マッチング = b13 HM-M1–M10（HostMatchingTab：生成・条件・換桌・公開都在手机上，公开后只读）；参加者 = b13 HM-P1–P9（HostPeopleTab：手机上办完审核）；
// 受付 = 跳到 /operations/check-in（b6 #24）；レポート = b12 #430（三格摘要 + 「PC で詳細」）。
// 数据：GET /api/host/events/[id]/overview（概要 + レポート摘要）、/matching?round=、/people?bucket=；写：matching/generate・overrides・publish（HostMatchingTab）、people/[actorId]/decision、
// notices/preview + send（プロフィール未完了 的定型お知らせ，发前确认）。App 不做申込設定 / 报告详情（画板「PC で」）。
import { Redirect, useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Linking, View } from "react-native";

import type { HostOverviewResponse, HostPeopleBucket } from "../../api/contract/host-console";
import type { HostEventView, HostEventWriteResult } from "../../api/contract/host-events";
import { IconButton, presentActionSheet, presentConfirm, UiText, useToast } from "../../components/ui";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { JourneyPage } from "../events/v2/JourneyPage";
import { useHostApi, type HostApiResult } from "./host-api";
import { checkInHref, consoleHref, consoleSubtitle, desktopPath, parseSeg, type HostSeg } from "./host-model";
import { PcCard, useHostStyles } from "./host-ui";
import { CancelEventSheet, hostMenuActions, MENU_LABEL, PublishEventSheet, StatusBanner, type HostMenuAction } from "./console-manage";
import { HostCohostsSheet } from "./HostCohostsSheet";
import { useHostT } from "./useHostT";
import { OverviewBody, ReportBody, SegChips } from "./console-view";
import { HostMatchingTab } from "./HostMatchingTab";
import { PEOPLE_BUCKETS } from "./people-view";
import { HostPeopleTab } from "./HostPeopleTab";


export function HostConsoleScreen() {
  const { t, language } = useHostT();
  const router = useRouter();
  const toast = useToast();
  const api = useHostApi();
  const params = useLocalSearchParams<{ id?: string; seg?: string; bucket?: string }>();
  const eventId = String(params.id ?? "");
  const seg = parseSeg(params.seg);
  const [overview, setOverview] = useState<HostOverviewResponse | null>(null);
  const [event, setEvent] = useState<HostEventView | null>(null);
  const [failed, setFailed] = useState(false);
  const now = new Date();
  const { styles: hs } = useHostStyles();

  const loadOverview = useCallback(async () => {
    const res = await api.overview(eventId);
    if (res.ok) { setOverview(res.data); setEvent(res.data.event); setFailed(false); } else setFailed(true);
  }, [api, eventId]);
  // 概要的数字给页签角标与页头也用：每一页都读。
  useEffect(() => { void loadOverview(); }, [loadOverview, seg]);

  const go = (next: HostSeg) => router.setParams({ seg: next === "overview" ? undefined : next });
  const sendPc = async (path: string) => { const res = await api.desktopLink(path); if (res.ok) toast.success(t("appPcSent")); else toast.error(t("saveError")); };
  const { baseUrl } = useOrbitApiBaseUrl();
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<"publish" | "cancel" | "cohosts" | null>(null);
  const notify = async () => {
    const preview = await api.noticePreview(eventId);
    if (!preview.ok) { toast.error(preview.reason === "rate_limited" ? t("noticeLimit") : t("saveError")); return; }
    const ok = await presentConfirm({ cancelLabel: t("cancel"), confirmLabel: t("appNotifySend"), message: preview.data.body, title: t("noticeTitle", { n: preview.data.recipients }) });
    if (!ok) return;
    const sent = await api.noticeSend(eventId);
    if (sent.ok) toast.success(t("appNotified", { n: sent.data.queued })); else toast.error(sent.reason === "sample" ? t("appSampleReadOnly") : t("saveError"));
  };
  /** 活动级写操作：成功提示 + 重读概要；冲突 / 示例 / 其他失败各一句。 */
  const write = async (task: () => Promise<HostApiResult<HostEventWriteResult>>, done: (result: HostEventWriteResult) => string) => {
    if (busy) return;
    setBusy(true);
    const res = await task();
    setBusy(false);
    setSheet(null);
    if (!res.ok) { toast.error(res.reason === "conflict" ? t("conflictError") : res.reason === "sample" ? t("evSample") : t("saveError")); return; }
    toast.success(done(res.data));
    await loadOverview();
  };
  const current = overview?.event ?? event;
  const pick = async (action: HostMenuAction) => {
    if (!current) return;
    if (action === "cohosts") setSheet("cohosts");
    else if (action === "edit") router.push(`/events/${encodeURIComponent(eventId)}/edit` as Href);
    else if (action === "open" && current.publicSlug) void Linking.openURL(`${baseUrl.replace(/\/$/, "")}/e/${encodeURIComponent(current.publicSlug)}`);
    else if (action === "cancel") setSheet("cancel");
    else if (action === "reissue") {
      if (await presentConfirm({ cancelLabel: t("cancel"), confirmLabel: t("cfReissue"), icon: "ticket", message: t("cfReissueSub", { code: current.participationCode ?? "" }), title: t("cfReissueTitle") }))
        void write(() => api.reissueCode(eventId, current.version), (next) => t("cfReissued", { code: next.event.participationCode ?? "" }));
    } else if (action === "archive") {
      if (await presentConfirm({ cancelLabel: t("cancel"), confirmLabel: t("archive"), message: t("cfArchiveSub"), title: t("cfArchiveTitle") }))
        void write(() => api.archive(eventId, current.version, true), () => t("archivedToast"));
    }
  };
  const openMenu = async () => {
    if (!current) return;
    const key = await presentActionSheet({ destructiveStyle: "text", options: hostMenuActions(current).map((action) => ({ destructive: action === "cancel", key: action, label: t(MENU_LABEL[action]) })), title: current.title });
    if (key) void pick(key as HostMenuAction);
  };

  if (seg === "check-in") return <Redirect href={checkInHref(eventId) as Href} />;
  const title = current?.title ?? "";
  const back = { fallback: "/events/center", leftLabel: t("appBack") };
  // b13 HM-T1–T3：每一页同一个页头（活动名 + 一句状态 + 右上 ⋯）和同一排页签。
  const more = current ? <IconButton icon="more" accessibilityLabel={t("hmMore")} onPress={() => void openMenu()} /> : undefined;
  const subtitle = current ? consoleSubtitle(current.startsAt, current.status, now, language, t) : undefined;
  const tabs = <SegChips seg={seg} t={t} pending={overview?.pendingReview ?? null} onSeg={go} />;
  const sheets = current ? (
    <>
      <PublishEventSheet event={current} t={t} language={language} busy={busy} visible={sheet === "publish"} onCancel={() => setSheet(null)} onPublish={() => void write(() => api.publishEvent(eventId, current.version), () => t("publishedToast"))} />
      <CancelEventSheet event={current} t={t} busy={busy} visible={sheet === "cancel"} onKeep={() => setSheet(null)} onCancelEvent={(note) => void write(() => api.cancelEvent(eventId, current.version, note), (result) => t("cfCancelled", { n: result.notified }))} />
      <HostCohostsSheet api={api} eventId={eventId} t={t} visible={sheet === "cohosts"} onClose={() => setSheet(null)} onChanged={() => void loadOverview()} />
    </>
  ) : null;

  if (seg === "matching") {
    return <HostMatchingTab api={api} eventId={eventId} t={t} title={title} subtitle={subtitle} right={more} top={<>{tabs}{sheets}</>} onChanged={() => void loadOverview()} onRemind={() => void notify()} />;
  }
  if (seg === "people") {
    return <HostPeopleTab api={api} eventId={eventId} t={t} title={title} subtitle={subtitle} right={more} top={<>{tabs}{sheets}</>} initialBucket={PEOPLE_BUCKETS.includes(params.bucket as HostPeopleBucket) ? (params.bucket as HostPeopleBucket) : null} onChanged={() => void loadOverview()} />;
  }
  return (
    <JourneyPage title={title} subtitle={subtitle} {...back} right={more} testID={`host-console-${seg}`}>
      {tabs}
      {current ? <StatusBanner event={current} t={t} busy={busy} onEdit={() => void pick("edit")} onPublish={() => setSheet("publish")} onArchive={(archived) => void write(() => api.archive(eventId, current.version, archived), () => t(archived ? "archivedToast" : "unarchivedToast"))} /> : null}
      {seg === "setup" ? <View style={hs.card} testID="host-setup-soon"><UiText style={hs.sub}>{t("tabSoon")}</UiText></View>
        : overview ? (seg === "report"
          ? <ReportBody data={overview} t={t} now={now} onPc={() => void sendPc(desktopPath.report(eventId))} />
          : <OverviewBody data={overview} t={t} onCheckIn={() => router.push(checkInHref(eventId) as Href)} onResults={() => go("matching")} onPublish={() => router.setParams({ publish: "1", seg: "matching" })} onReview={() => go("people")} onNotify={() => void notify()} />)
          : failed ? <PcCard text={t("appLoadError")} emoji="⚠️" tone="apricot" /> : null}
      {sheets}
    </JourneyPage>
  );
}

/** 旧运营子页 → 新运营台的一段（admission → 参加者、analytics → レポート、experience / roles → 概要）。 */
export function LegacyOperationsRedirect({ to }: { to: HostSeg }) {
  const params = useLocalSearchParams<{ id?: string }>();
  return <Redirect href={consoleHref(String(params.id ?? ""), to) as Href} />;
}
