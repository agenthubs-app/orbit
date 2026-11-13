// R17 受付（App；b6 #24 含一行送信失败，b12 #428 QR 読み取り中）。`/events/[id]/operations/check-in`。
// 名前検索（在线 = GET /kiosk?q=，离线 = 本机名单）· 到着 · 取り消す（30 分钟内）· 当日枠（`check_in.walk_in`，满员先确认）·
// QR（expo-camera，QR v2 → POST …/check-ins/scan）。网络失败的「到着」进本机队列（expo-sqlite），联网后按幂等键补发；
// 本机名单只在 GET /kiosk/roster 成功后存，TTL = cacheUntil（按 kiosk 时钟），没有权限立即清；每 30 秒心跳（N台で受付中）。
// 受付終了（回答 closed: true，開催終了から 12 時間後 / 中止 / アーカイブ）：横幅「受付は終了しました」、搜索仍可查记录，
// 不出 QR 与每行的到着 / 取り消し / 当日枠，停 10 秒轮询与心跳、不补发队列；写操作被拒时读一次 kiosk 再提示。
// 门禁开发开关 open-path 下可带 `?q=もり&failed=<participantId>`：把这个人放进本机队列（显示「送信できませんでした」），且不自动补发。
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";

import type { HostKioskResponse, HostKioskRow } from "../../api/contract/host-console";
import { IconButton, presentConfirm, useToast } from "../../components/ui";
import { addDesignMock } from "../add/add-design-mock";
import { JourneyPage } from "../events/v2/JourneyPage";
import { newIdempotencyKey } from "../events/v2/events-api";
import { useHostApi } from "./host-api";
import { QrSheet } from "./HostQrSheet";
import { clock, consoleHref } from "./host-model";
import { PcCard } from "./host-ui";
import { applyRoster, flushQueue, purgeExpiredRosters, readRoster, searchRoster, type KioskQueueItem, type KioskRosterCache, type KioskStore } from "./kiosk-queue";
import { kioskDeviceId } from "./kiosk-device";
import { openKioskStore } from "./kiosk-store";
import { useHostT } from "./useHostT";
import { CheckInBody, checkInRefusalKey, HEARTBEAT_MS, kioskClosed, POLL_MS } from "./check-in-view";

export function HostCheckInScreen() {
  const { t } = useHostT();
  const toast = useToast();
  const api = useHostApi();
  const params = useLocalSearchParams<{ id?: string; q?: string; failed?: string }>();
  const eventId = String(params.id ?? "");
  const dev = addDesignMock("open-path");
  const [data, setData] = useState<HostKioskResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [q, setQ] = useState(dev && params.q ? String(params.q) : "");
  const [rows, setRows] = useState<HostKioskRow[]>([]);
  const [queue, setQueue] = useState<KioskQueueItem[]>([]);
  const [devices, setDevices] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [qr, setQr] = useState(false);
  const store = useRef<KioskStore | null>(null);
  const roster = useRef<KioskRosterCache | null>(null);
  const offset = useRef(0);
  const hold = useRef(Boolean(dev && params.failed));
  // 受付終了：不心跳、不轮询、不补发。
  const closedRef = useRef(false);
  // 心跳 / 轮询 effect 只按场次建一次，用 ref 读最新的搜索词、在线状态与回调。
  const qRef = useRef(q); qRef.current = q;
  const onlineRef = useRef(online); onlineRef.current = online;
  const nowKiosk = useCallback(() => new Date(Date.now() + offset.current), []);

  const refreshQueue = useCallback(async () => { if (store.current) setQueue(await store.current.queue(eventId)); }, [eventId]);
  const send = useCallback((item: KioskQueueItem) => api.checkIn(eventId, item.participantId, item.idempotencyKey), [api, eventId]);
  const flush = useCallback(async (includeFailed = false) => {
    if (!store.current || hold.current || closedRef.current) return;
    const result = await flushQueue(store.current, eventId, async (item) => { const res = await send(item); return res.ok ? res : { ok: false as const, reason: res.reason }; }, includeFailed);
    if (result.stopped) setOnline(false);
    if (result.sent + result.duplicate > 0) toast.success(t("kFlushed", { n: result.sent + result.duplicate }));
    await refreshQueue();
  }, [eventId, refreshQueue, send, t, toast]);

  /** 读 kiosk；成功返回回答（调用方据此判断 closed），失败返回 null。 */
  const load = useCallback(async (query: string): Promise<HostKioskResponse | null> => {
    const res = await api.kiosk(eventId, query);
    if (res.ok) {
      offset.current = Date.parse(res.data.now) - Date.now();
      closedRef.current = kioskClosed(res.data);
      setData(res.data); setRows([...res.data.rows]); setOnline(true); setFailed(false);
      if (res.data.devices) setDevices((value) => value || res.data.devices);
      return res.data;
    }
    if (res.reason === "network") setOnline(false);
    // 失去权限：这场的本机名单与离线队列（都有姓名）一起清。
    else if (res.reason === "forbidden" || res.reason === "not_found") { await store.current?.clearEvent(eventId); roster.current = null; setFailed(true); }
    else setFailed(true);
    return null;
  }, [api, eventId]);

  /** 写操作被拒（不是断网 / 示例 / キャンセル待ち）：读一次 kiosk，受付終了なら画面也切到只读。返回要提示的键。 */
  const refusal = useCallback(async (code: string | null | undefined): Promise<string> => {
    const next = await load(qRef.current);
    return checkInRefusalKey(code, kioskClosed(next)) ?? "saveError";
  }, [load]);

  // 打开：本机存储 → 本机名单（过期即清）→ 服务端；成功后拉名单缓存、补发队列。
  useEffect(() => {
    let live = true;
    void (async () => {
      store.current = await openKioskStore();
      // 启动时清掉所有场次里过期的名单（不只这一场）。
      await purgeExpiredRosters(store.current, new Date());
      roster.current = await readRoster(store.current, eventId, nowKiosk());
      const ok = await load(q);
      if (!live) return;
      if (ok && !kioskClosed(ok)) {
        roster.current = await applyRoster(store.current, eventId, await api.roster(eventId), nowKiosk());
        if (dev && params.failed && store.current) {
          const res = await api.kiosk(eventId);
          const person = res.ok ? res.data.recent.find((item) => item.participantId === params.failed) : undefined;
          if (person) await store.current.enqueue({ at: person.at, eventId, idempotencyKey: `dev-${person.participantId}`, initial: person.initial, name: person.name, org: person.org, participantId: person.participantId });
        }
        await flush();
      } else if (ok) {
        // 受付終了：只看记录，不拉离线名单、不补发、不心跳。
      } else if (roster.current) {
        // 离线打开：用本机名单画一个最小的到着卡（人数按名单算）。
        const rowsCached = roster.current.rows;
        setData({ checkedIn: rowsCached.filter((row) => row.status === "checked_in").length, cacheUntil: roster.current.cacheUntil, canWalkIn: false, devices: 0, doorsOpenAt: null, eventId, now: nowKiosk().toISOString(), overCapacity: false, rate: 0, recent: [], rows: [], staffName: "", staffRole: "", title: "", total: rowsCached.length, venue: null });
      }
      await refreshQueue();
      // 第一次心跳：知道受付有没有终了之后再发（终了就不发）。
      if (live && !closedRef.current) void beatRef.current();
    })();
    return () => { live = false; };
    // 只在打开时跑一次；搜索另有 effect。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  // 搜索：在线问服务端，离线查本机名单。
  useEffect(() => {
    if (!store.current) return;
    const timer = setTimeout(() => {
      if (online) void load(q);
      else setRows(searchRoster(roster.current?.rows ?? [], q, new Set(queue.map((item) => item.participantId))));
    }, 250);
    return () => clearTimeout(timer);
  }, [q, online, load, queue]);

  const flushRef = useRef(flush); flushRef.current = flush;
  const loadRef = useRef(load); loadRef.current = load;
  const refreshQueueRef = useRef(refreshQueue); refreshQueueRef.current = refreshQueue;
  const beatRef = useRef<() => Promise<void>>(async () => undefined);

  // 每 30 秒心跳（N台で受付中）；顺手补发队列、刷新名单缓存的 TTL。
  useEffect(() => {
    let deviceId = "";
    const beat = async () => {
      if (closedRef.current) return;
      deviceId ||= await kioskDeviceId();
      const res = await api.heartbeat(eventId, deviceId);
      if (res.ok) { setDevices(res.data.devices); setOnline(true); await flushRef.current(); }
      else if (res.reason === "network") setOnline(false);
      else if (res.reason === "forbidden" || res.reason === "not_found") {
        // 心跳发现权限没了（被移出共同运营等）：清这场的本机名单与队列。
        await store.current?.clearEvent(eventId); roster.current = null; setFailed(true); await refreshQueueRef.current();
        return;
      }
      if (store.current && roster.current && !(Date.parse(roster.current.cacheUntil) > nowKiosk().getTime())) { await store.current.clearRoster(eventId); roster.current = null; }
    };
    beatRef.current = beat;
    // 第一次心跳由打开的 effect 在读完 kiosk 后发（终了就不发）；之后每 30 秒一次。
    const timer = setInterval(() => void beat(), HEARTBEAT_MS);
    const poll = setInterval(() => { if (onlineRef.current && !closedRef.current) void loadRef.current(qRef.current); }, POLL_MS);
    return () => { clearInterval(timer); clearInterval(poll); };
    // 只按场次重建：搜索词 / 在线状态从 ref 读，按键不再立刻触发心跳与补发（R17 复核）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, eventId]);

  const arrive = async (row: HostKioskRow) => {
    if (busy || !store.current) return;
    const key = newIdempotencyKey();
    const item: KioskQueueItem = { at: nowKiosk().toISOString(), eventId, idempotencyKey: key, initial: row.initial, name: row.name, org: row.org, participantId: row.participantId };
    if (!online) { await store.current.enqueue(item); await refreshQueue(); toast.success(t("kQueued")); setQ(""); return; }
    setBusy(row.participantId);
    const res = await send(item);
    setBusy(null);
    if (res.ok) { toast.success(res.data.duplicate ? t("kDup", { name: row.name }) : res.data.table ? t("kDoneTable", { name: row.name, t: res.data.table }) : t("kDone", { name: row.name })); setQ(""); void load(""); return; }
    if (res.reason === "network") { setOnline(false); await store.current.enqueue(item); await refreshQueue(); toast.success(t("kQueued")); setQ(""); return; }
    if (res.code === "WAITLISTED") { toast.error(t("kWaitlistedErr")); return; }
    if (res.reason === "sample") { toast.error(t("appSampleReadOnly")); return; }
    toast.error(t(await refusal(res.code)));
  };
  const undo = async (row: HostKioskRow) => {
    if (!online) { toast.error(t("kOfflineAction")); return; }
    const time = row.checkedInAt ? clock(row.checkedInAt) : "";
    const ok = await presentConfirm({ cancelLabel: t("kUndoKeep"), confirmLabel: t("kUndoConfirm"), destructive: true, message: row.table ? t("kUndoBody", { t: row.table, time }) : t("kUndoBodyNoTable", { time }), title: t("kUndoTitle", { name: row.name }) });
    if (!ok) return;
    const res = await api.undo(eventId, row.participantId);
    if (res.ok) { toast.success(t("kUndone")); void load(q); return; }
    toast.error(res.reason === "sample" ? t("appSampleReadOnly") : res.reason === "network" ? t("kOfflineAction") : t(await refusal(res.code)));
  };
  const walkIn = async (row: HostKioskRow) => {
    if (!online) { toast.error(t("kOfflineAction")); return; }
    if (data?.overCapacity) {
      const ok = await presentConfirm({ cancelLabel: t("kOverNo"), confirmLabel: t("kOverYes"), message: typeof data?.approved === "number" && typeof data?.capacity === "number" ? t("kOverBodyCount", { a: data.approved, c: data.capacity }) : t("kOverBody"), title: t("kOverTitle") });
      if (!ok) return;
    } else {
      const ok = await presentConfirm({ cancelLabel: t("cancel"), confirmLabel: t("kWalkIn"), title: t("appWalkInTitle", { name: row.name }) });
      if (!ok) return;
    }
    const res = await api.admitOnSite(eventId, row.participantId, Boolean(data?.overCapacity));
    if (res.ok) { toast.success(t("kDone", { name: row.name })); void load(q); return; }
    toast.error(res.reason === "sample" ? t("appSampleReadOnly") : res.reason === "network" ? t("kOfflineAction") : t(await refusal(res.code)));
  };
  const retry = async (item: KioskQueueItem) => {
    hold.current = false;
    if (!store.current) return;
    if (item.error) await store.current.update({ ...item, error: null });
    await flush(true);
  };

  const closed = kioskClosed(data);
  // 受付が終わったら開いていた QR も閉じる。
  useEffect(() => { if (closed) setQr(false); }, [closed]);

  return (
    <JourneyPage title={t("kNarrowTop")} subtitle={data?.title || undefined} leftLabel={t("appBack")} fallback={consoleHref(eventId)}
      right={closed ? undefined : <IconButton icon="scan" accessibilityLabel={t("kScan")} onPress={() => setQr(true)} />} testID="host-check-in-page">
      {data ? <CheckInBody data={data} t={t} q={q} rows={rows} queue={queue} devices={devices || data.devices} busy={busy} focusSearch={dev && Boolean(params.q)} onQ={setQ} onArrive={(row) => void arrive(row)} onUndo={(row) => void undo(row)} onWalkIn={(row) => void walkIn(row)} onRetry={(item) => void retry(item)} />
        : failed ? <PcCard text={t("appNoCheckIn")} emoji="🔒" tone="apricot" /> : null}
      <QrSheet visible={qr && !closed} onClose={() => setQr(false)} t={t} api={api} eventId={eventId} onDone={() => { setQr(false); void load(""); }} onRefused={() => void load(qRef.current)} />
    </JourneyPage>
  );
}
