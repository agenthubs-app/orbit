// R17 イベント運営 · マッチング（App；b13 HM-M1–M10，同 Web HostMatching 的手机分支）。
// 读：GET /api/host/events/[id]/matching?round=；生成：POST …/matching/generate（≤3 回，条件随生成提交；generating 时每 4 秒重读）；
// 换桌：PUT …/matching/overrides（带 overridesVersion，409 →「他の運営者が先に更新しました」并重读）；公開：POST …/matching/publish（notifyCohosts）。
// 公开后只读（不能再换桌，确认里写明）。概要的「公開する」带 publish=1 跳来，下書き时直接打开公開確認（只开一次）。
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { type ScrollView, View } from "react-native";

import type { HostMatchingConditions, HostMatchingMove, HostMatchingResponse } from "../../api/contract/host-console";
import { presentConfirm, useToast } from "../../components/ui";
import { JourneyPage } from "../events/v2/JourneyPage";
import type { HostApi } from "./host-api";
import type { HostT } from "./host-model";
import { PcCard } from "./host-ui";
import { ConditionsSheet, fillSeatsMoves, MatchingFoot, MatchingGenerating, MatchingNone, MatchingResult, MatchPublishSheet, MoveSheet, roundTables, type Moving } from "./matching-view";

const POLL_MS = 4000;

export function HostMatchingTab({ api, eventId, t, title, subtitle, right, top, onChanged, onRemind }: {
  api: HostApi;
  eventId: string;
  t: HostT;
  title: string;
  subtitle?: string | undefined;
  right?: ReactNode;
  top?: ReactNode;
  /** 生成 / 公開 之后概要的数字要重读。 */
  onChanged?: () => void;
  /** 「リマインド」= 概要同一个「プロフィール未完了」定型お知らせ（先预览确认再发）。 */
  onRemind: () => void;
}) {
  const toast = useToast();
  const router = useRouter();
  const params = useLocalSearchParams<{ round?: string; publish?: string }>();
  const [round, setRound] = useState(Number(params.round) || 1);
  const [data, setData] = useState<HostMatchingResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [conditions, setConditions] = useState<HostMatchingConditions | null>(null);
  const [pending, setPending] = useState<HostMatchingConditions | null>(null);
  const [modal, setModal] = useState<"conditions" | "publish" | null>(null);
  const [moving, setMoving] = useState<Moving | null>(null);
  const scroller = useRef<ScrollView>(null);
  const columnY = useRef(0);

  const latest = useRef(0);
  const load = useCallback(async () => {
    const seq = ++latest.current;
    const res = await api.matching(eventId, round);
    if (seq !== latest.current) return;
    if (res.ok) { setData(res.data); setFailed(false); } else setFailed(true);
  }, [api, eventId, round]);
  useEffect(() => { void load(); }, [load]);
  // 生成中：每 4 秒重读，直到出结果。
  useEffect(() => {
    if (data?.state !== "generating") return;
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [data?.state, load]);
  // 概要的「公開する」跳过来：下書き时直接打开公開確認，只开一次。
  const wantPublish = params.publish === "1";
  useEffect(() => {
    if (!wantPublish || data?.state !== "draft") return;
    setModal("publish");
    router.setParams({ publish: undefined });
  }, [wantPublish, data?.state, router]);

  const pickRound = (next: number) => { setMoving(null); setRound(next); router.setParams({ round: next === 1 ? undefined : String(next) }); };
  const conflict = async () => { toast.error(t("conflictFirst")); await load(); };

  const move = async (moves: HostMatchingMove[], done: string) => {
    if (!data?.generationId || !moves.length || busy) return;
    setBusy(true);
    const res = await api.overrides(eventId, data.generationId, data.overridesVersion, moves);
    setBusy(false);
    if (!res.ok) { if (res.reason === "conflict") await conflict(); else toast.error(res.reason === "sample" ? t("appSampleReadOnly") : t("saveError")); return; }
    toast.success(done);
    // 回答是第 1 ラウンド的视图；看别的轮时重读当前轮。
    if (round === 1) setData(res.data); else await load();
  };

  const generate = async (next: HostMatchingConditions) => {
    if (busy) return;
    setBusy(true);
    const res = await api.generate(eventId, next);
    setBusy(false);
    setModal(null);
    if (!res.ok) {
      if (res.reason === "conflict" || res.reason === "rate_limited") toast.error(t("mLimit", { n: data?.generationsLimit ?? 3 }));
      else toast.error(res.reason === "sample" ? t("appSampleReadOnly") : t("saveError"));
      return;
    }
    setConditions(null);
    setData(res.data);
    if (res.data.state !== "generating") toast.success(t("mGenerated"));
    onChanged?.();
  };

  const remaining = data ? Math.max(0, data.generationsLimit - data.generationsUsed) : 0;
  /** 再生成会丢手动调整：先确认（同 Web ConfirmDialog mRegen*）。 */
  const regenerate = async (next: HostMatchingConditions) => {
    setModal(null);
    setPending(next);
    const ok = await presentConfirm({ cancelLabel: t("cancel"), confirmLabel: t("mRegenConfirm"), icon: "refresh", message: t("mRegenBody", { n: remaining }), title: t("mRegenTitle") });
    setPending(null);
    if (ok) await generate(next);
  };

  const publish = async (notifyCohosts: boolean) => {
    if (!data?.generationId || busy) return;
    setBusy(true);
    const res = await api.publishMatching(eventId, data.generationId, data.overridesVersion, notifyCohosts);
    setBusy(false);
    setModal(null);
    if (!res.ok) { if (res.reason === "conflict") await conflict(); else toast.error(res.reason === "sample" ? t("appSampleReadOnly") : t("saveError")); return; }
    setData(res.data);
    toast.success(t("pubDone"));
    onChanged?.();
  };

  const current = conditions ?? data?.conditions ?? null;
  const footer = !data ? undefined
    : data.state === "none" ? <MatchingFoot note={t("mGenerateNote", { n: data.generationsLimit })} label={t("mGenerate")} icon="sparkle" testID="host-matching-generate"
      disabled={busy || data.applied < data.minimumApplied || data.generationsUsed >= data.generationsLimit} onPress={() => { if (current) void generate(current); }} />
      : data.state === "draft" ? <MatchingFoot label={t("aPublish")} icon="share" testID="host-matching-publish" disabled={busy || !data.generationId} onPress={() => setModal("publish")} />
        : undefined;

  return (
    <View style={{ flex: 1 }}>
    <JourneyPage title={title} subtitle={subtitle} fallback="/events/center" leftLabel={t("appBack")} right={right} scrollRef={scroller} testID="host-console-matching">
      {top}
      <View onLayout={(event) => { columnY.current = event.nativeEvent.layout.y; }}>
        {!data || !current ? (failed ? <PcCard text={t("appLoadError")} emoji="⚠️" tone="apricot" /> : null)
          : data.state === "none" ? <MatchingNone data={data} conditions={current} t={t} onConditions={setConditions} onOpenConditions={() => setModal("conditions")} onRemind={onRemind} />
            : data.state === "generating" ? <MatchingGenerating t={t} />
              : <MatchingResult key={`${data.round}-${data.generationId ?? ""}`} data={data} t={t} busy={busy} onRound={pickRound} onConditions={() => setModal("conditions")}
                onRegenerate={() => void regenerate(current)}
                onFillSeats={() => { const moves = fillSeatsMoves(data); if (!moves.length) toast.info(t("mNoSeats")); else void move(moves, t("mFilled", { n: moves.length })); }}
                onMove={setMoving}
                onJump={(y) => setTimeout(() => scroller.current?.scrollTo({ animated: true, y: Math.max(0, columnY.current + y - 8) }), 50)} />}
      </View>
      {data && current ? (
        <>
          <ConditionsSheet visible={modal === "conditions"} initial={pending ?? current} t={t} remaining={remaining} regenerate={data.state !== "none"} busy={busy} onClose={() => setModal(null)}
            onApply={(next) => { if (data.state === "none") { setConditions(next); setModal(null); } else void regenerate(next); }} />
          <MoveSheet moving={moving} tables={roundTables(data)} round={data.round} t={t} onClose={() => setMoving(null)}
            onPick={(to) => {
              const target = moving;
              setMoving(null);
              if (!target || target.from === to) return;
              const name = target.member.name;
              void move([{ participantId: target.member.participantId, round: data.round, toTable: to }], to ? t("mMoved", { name, t: to }) : t("mMovedOut", { name }));
            }} />
          {data.state === "draft" ? <MatchPublishSheet data={data} visible={modal === "publish"} t={t} busy={busy} onCancel={() => setModal(null)} onPublish={(notify) => void publish(notify)} /> : null}
        </>
      ) : null}
    </JourneyPage>
    {footer}
    </View>
  );
}
