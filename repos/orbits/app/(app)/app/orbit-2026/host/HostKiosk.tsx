"use client";

// R17 受付 kiosk（/app/events/[id]/operations/check-in；不挂壳、不注册 ⌘K）：b6 #10 空（開場前）/ #11 大（搜索「もり」，深 #45）/ #12 离线（本机保存 · 未送信 N件）。
// 名前検索 GET /kiosk?q=；到着にする POST …/check-ins/[participantId]；取り消す …/undo（确认 b12 #436）；当日枠で受付 …/admit-on-site（满员确认 b12 #434）；
// QR を読み取る（BarcodeDetector，不支持时动态加载 @zxing/browser 回退；都不行才提示改用名前検索，b12 #432）；5 秒轮询 GET /kiosk；30 秒心跳；本机名单缓存 GET /kiosk/roster（TTL = cacheUntil）。
// 离线：「到着にする」先进 IndexedDB 队列（幂等键），联网后按顺序补发；重复只记一次（服务端 duplicate）。
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { HostKioskRecent, HostKioskResponse, HostKioskRow } from "../../../../../shared/contract/host-console";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { newIdempotencyKey } from "../events/events-api";
import { Avatar, Icon, Modal, Orbit2026Scope, ToastProvider, useToast } from "../ui";
import { failureCode, failureOf, hostApi } from "./host-api";
import { ScoreRing } from "./HostPeople";
import { consoleHref, hostTime, hostTranslator, type HostT } from "./host-model";
import { flushQueue, indexedDbKioskStore, kioskDeviceId, memoryKioskStore, purgeExpiredRosters, readRoster, searchRoster, type KioskQueueItem, type KioskRosterCache, type KioskStore } from "./kiosk-store";
import s from "./host.module.css";
import k from "./kiosk.module.css";

const POLL_MS = 5_000;
const HEARTBEAT_MS = 30_000;
const SEARCH_MS = 250;

/** 未到着 = 总数 − 到着（不小于 0）。 */
export const notArrived = (checkedIn: number, total: number) => Math.max(0, total - checkedIn);

/** 開場まで あと N分（已开场 / 无开场时刻 → null）。 */
export function minutesToDoors(doorsOpenAt: string | null, now: Date): number | null {
  const doors = doorsOpenAt ? Date.parse(doorsOpenAt) : NaN;
  if (!Number.isFinite(doors)) return null;
  const minutes = Math.ceil((doors - now.getTime()) / 60_000);
  return minutes > 0 ? minutes : null;
}

export type KioskStreamRow = { key: string; at: string; name: string; org: string | null; table: string | null; pending: boolean; error?: string | null; participantId: string };

/** 最新の受付：未送信（本机队列，新的在上）+ 服务端最近受付（去掉队列里已有的人）。 */
export function streamRows(recent: readonly HostKioskRecent[], queue: readonly KioskQueueItem[]): KioskStreamRow[] {
  const pending = [...queue].sort((a, b) => b.at.localeCompare(a.at)).map((item) => ({ at: item.at, error: item.error ?? null, key: item.idempotencyKey, name: item.name, org: item.org, participantId: item.participantId, pending: true, table: null }));
  const queued = new Set(queue.map((item) => item.participantId));
  return [...pending, ...recent.filter((item) => !queued.has(item.participantId)).map((item) => ({ at: item.at, key: `r:${item.participantId}:${item.at}`, name: item.name, org: item.org, participantId: item.participantId, pending: false, table: item.table }))];
}

function statusChip(row: HostKioskRow, t: HostT, queued: boolean): { text: string; tone: string } {
  if (queued) return { text: t("kStPending"), tone: s.c_coral };
  if (row.status === "checked_in") return { text: row.table ? t("kStDone", { t: row.table, time: hostTime(row.checkedInAt) }) : t("kStDoneNoTable", { time: hostTime(row.checkedInAt) }), tone: s.c_teal };
  if (row.status === "waitlisted") return { text: t("kStWait"), tone: s.c_apricot };
  return { text: t("kStNot"), tone: "" };
}

export type HostKioskViewProps = {
  data: HostKioskResponse;
  t: HostT;
  /** kiosk 的时钟（服务端 now + 本机经过的时间）。 */
  now: Date;
  online: boolean;
  q: string;
  rows: readonly HostKioskRow[];
  queue: readonly KioskQueueItem[];
  devices: number;
  busy?: string | null;
  focused?: boolean;
  onQ?: (q: string) => void;
  onFocus?: (focused: boolean) => void;
  onArrive?: (row: HostKioskRow) => void;
  onUndo?: (row: HostKioskRow) => void;
  onWalkIn?: (row: HostKioskRow) => void;
  onRetry?: () => void;
  onScan?: () => void;
  exitHref?: string;
};

/** 純粋な描画（b6 #10–#12）。 */
export function HostKioskView(props: HostKioskViewProps) {
  const { data, t, now, online, q, rows, queue, devices, busy = null, focused = false } = props;
  const before = data.checkedIn === 0 && data.recent.length === 0 && queue.length === 0;
  const pendingCount = queue.filter((item) => !item.error).length;
  const checkedIn = data.checkedIn + pendingCount;
  const rate = data.total ? Math.round((checkedIn / data.total) * 100) : 0;
  const queued = new Set(queue.map((item) => item.participantId));
  const stream = streamRows(data.recent, queue);
  const doors = minutesToDoors(data.doorsOpenAt, now);
  const staff = data.venue ? t("kStaff", { name: data.staffName, role: data.staffRole, venue: data.venue }) : t("kStaffNoVenue", { name: data.staffName, role: data.staffRole });
  return (
    <div className={k.kiosk} data-host-kiosk={!online ? "offline" : before ? "before" : "live"}>
      <div className={k.top}>
        <div className={k.logo} aria-hidden>O</div>
        <div className={k.minw0}>
          <b className={k.title}>{t("kTitle", { title: data.title })}</b>
          <div className={k.lbl}>{staff}</div>
        </div>
        <span className={`${s.chip} ${online ? s.c_teal : s.c_coral} ${k.netChip}`} role="status">{online ? <><i className={s.liveDot} />{t("kOnline")}</> : t("kOffline")}</span>
        <div className={`${k.row} ${k.topRight}`}>
          <span className={`${k.score} ${k.clock}`} aria-hidden>{hostTime(now.toISOString())}</span>
          <button type="button" className={`btn ${s.btn}`} onClick={props.onScan} data-kiosk-scan=""><Icon name="scan" size={16} />{t("kScan")}</button>
          <a className={k.rbtn} href={props.exitHref ?? "/app/events/center"} aria-label={t("kExit")}><Icon name="x" size={20} /></a>
        </div>
      </div>
      <div className={k.body}>
        <div className={k.left}>
          <div className={`${k.row} ${k.stat}`}>
            <ScoreRing value={data.total ? checkedIn / data.total : 0} size={92} stroke={10} color="var(--plum-700)" label={`${t("kArrived")} ${rate}%`}>
              <b className={`${k.score} ${k.ringC}`}>{rate}<small>%</small></b>
            </ScoreRing>
            <div><div className={k.lbl}>{t("kArrived")}</div><div className={k.big} data-kiosk-count={checkedIn}>{checkedIn}<small>{t("kOfTotal", { n: data.total })}</small></div></div>
            <div className={k.statRight}><div className={k.lbl}>{t("kNotArrived")}</div><div className={k.mid}>{notArrived(checkedIn, data.total)}</div></div>
          </div>
          {!online ? (
            <div className={k.banner} role="alert" data-kiosk-offline={pendingCount}>
              <span className={k.bannerEmo} aria-hidden>📡</span>
              <div className={k.grow}><b>{t("kOfflineTitle")}</b><div className={k.lbl}>{t("kOfflineBody", { n: pendingCount })}</div></div>
              <button type="button" className={`btn ${s.btn} ${s.primary}`} onClick={props.onRetry}><Icon name="refresh" size={16} />{t("kRetry")}</button>
            </div>
          ) : null}
          <label className={k.search}>
            <Icon name="search" size={24} />
            <span className={k.searchField}>
              <input value={q} placeholder={t("kSearchPh")} aria-label={t("kSearch")} autoComplete="off" spellCheck={false}
                onChange={(event) => props.onQ?.(event.target.value)} onFocus={() => props.onFocus?.(true)} onBlur={() => props.onFocus?.(false)} data-kiosk-search="" />
              {focused && q ? <span className={k.caretLine} aria-hidden><span className={k.ghostText}>{q}</span><span className={k.caret} data-kiosk-caret="" /></span> : null}
            </span>
          </label>
          {!q.trim() && before ? (
            <div className={k.emptyCard} data-kiosk-empty="">
              <div className={k.door} aria-hidden>🚪</div>
              <b className={k.emptyTitle}>{doors != null ? t("kDoorsIn", { n: doors }) : t("kDoorsOpen")}</b>
              <div className={`${k.sub} ${k.emptyBody}`}>{t("kEmptyBody")}</div>
              <button type="button" className={`btn ${k.arrive} ${k.emptyArrive}`} onClick={props.onScan}><Icon name="scan" size={20} />{t("kScan")}</button>
            </div>
          ) : q.trim() ? (
            <div className={k.results} data-kiosk-results={rows.length}>
              {rows.length === 0 ? <div className={`${k.sub} ${k.noResult}`}>{t("kNoResult", { q: q.trim() })}</div> : rows.map((row) => {
                const isQueued = queued.has(row.participantId);
                const chip = statusChip(row, t, isQueued);
                const sub = [row.org, row.role].filter(Boolean).join(" · ");
                return (
                  <div key={row.participantId} className={k.res} data-kiosk-row={row.participantId}>
                    <Avatar name={row.name} size="lg" />
                    <div className={k.resMain}>
                      <div className={k.nm}>{row.name}</div>
                      <div className={`${k.sub} ${k.clamp1}`}>{sub}</div>
                      <span className={`${s.chip} ${chip.tone} ${k.resChip}`}>{chip.text}</span>
                    </div>
                    {isQueued ? null : row.status === "checked_in"
                      ? <button type="button" className={`btn ${s.btn} ${k.resBtn}`} disabled={busy === row.participantId || !row.undoable} onClick={() => props.onUndo?.(row)} data-kiosk-undo="">{t("kUndo")}</button>
                      : row.status === "waitlisted"
                        ? <button type="button" className={`btn ${s.btn} ${k.resBtn}`} disabled={busy === row.participantId || !data.canWalkIn} onClick={() => props.onWalkIn?.(row)} data-kiosk-walkin="">{t("kWalkIn")}</button>
                        : <button type="button" className={`btn ${k.arrive}`} disabled={busy === row.participantId} onClick={() => props.onArrive?.(row)} data-kiosk-arrive=""><Icon name="check" size={20} />{t("kArrive")}</button>}
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
        <div className={k.stream} aria-live="polite">
          <div className={`${k.row} ${k.streamHead}`}><b>{t("kStream")}</b><span className={k.lbl}>{before ? "" : t("kAuto", { n: devices })}</span></div>
          {stream.length === 0 ? (
            <>
              <div className={`${k.sub} ${k.streamEmpty}`}>{t("kStreamEmpty")}</div>
              {[0, 1, 2, 3].map((index) => <div key={index} className={k.ghostRow} aria-hidden><i />— : —</div>)}
            </>
          ) : stream.map((row, index) => (
            <div key={row.key} className={`${k.krow} ${index === 0 && online && !row.pending && pendingCount === 0 ? k.krowNew : ""}`} data-kiosk-stream={row.pending ? "pending" : "sent"}>
              <time>{hostTime(row.at)}</time>
              <Avatar name={row.name} size="sm" />
              <div className={k.grow}><b className={k.clamp1}>{row.name}</b><div className={`${k.lbl} ${k.clamp1}`}>{row.org ?? ""}</div></div>
              {row.pending
                ? <><span className={`${s.chip} ${s.c_coral}`}>{t("kStPending")}</span><button type="button" className={`btn ${k.lbtn}`} aria-label={t("kResend", { name: row.name })} onClick={props.onRetry}><Icon name="refresh" size={16} /></button></>
                : row.table ? <span className={`${s.chip} ${s.c_lav}`}>{t("kTable", { t: row.table })}</span> : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** b12 #436 受付の取り消し確認。 */
export function UndoConfirm({ row, t, busy, onCancel, onConfirm }: { row: HostKioskRow; t: HostT; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  const title = t("kUndoTitle", { name: row.name });
  const time = hostTime(row.checkedInAt);
  return (
    <Modal open onClose={onCancel} title={title} size={480}>
      <div className={`${k.row} ${k.dlgHead}`}>
        <div className={k.dlgIcon}><Icon name="alert" size={24} /></div>
        <div><div className={k.dlgTitleSm}>{title}</div><div className={`${k.sub} ${k.dlgBody}`}>{row.table ? t("kUndoBody", { t: row.table, time }) : t("kUndoBodyNoTable", { time })}</div></div>
      </div>
      <div className={`${k.row} ${k.dlgActs}`}>
        <button type="button" className={`btn ${s.btn}`} onClick={onCancel}>{t("kUndoKeep")}</button>
        <button type="button" className={`btn ${s.btn} ${k.danger}`} disabled={busy} onClick={onConfirm}>{t("kUndoConfirm")}</button>
      </div>
    </Modal>
  );
}

/** b12 #434 当日枠の定員超え確認。 */
export function OverCapacityConfirm({ row, t, busy, onCancel, onConfirm }: { row: HostKioskRow; t: HostT; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  const title = t("kOverTitle");
  return (
    <Modal open onClose={onCancel} title={title} size={480} header={<span className={`${s.emo} ${s.e_apricot}`}>🙋</span>}>
      <div className={k.dlgTitle}>{title}</div>
      <div className={`${k.sub} ${k.dlgBody}`}>{t("kOverBody")}</div>
      <div className={k.dlgWho}><Avatar name={row.name} size="sm" /><b>{row.name}</b><span className={`${k.lbl} ${k.dlgWhoLbl}`}>{t("kStWait")}</span></div>
      <div className={`${k.row} ${k.dlgActs}`}>
        <button type="button" className={`btn ${s.btn}`} onClick={onCancel}>{t("kOverNo")}</button>
        <button type="button" className={`btn ${s.btn} ${s.primary}`} disabled={busy} onClick={onConfirm}>{t("kOverYes")}</button>
      </div>
    </Modal>
  );
}

type Detector = { detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>> };
type DetectorCtor = (new (options: { formats: string[] }) => Detector) & { getSupportedFormats?: () => Promise<string[]> };
/** 一帧解一次：读到 QR 文本就返回，否则 null。 */
export type QrDecoder = { engine: "native" | "zxing"; decode: (video: HTMLVideoElement) => Promise<string | null> };

/**
 * QR 解码器：有 BarcodeDetector（且支持 qr_code）就用原生；否则（Safari / Firefox）动态加载 `@zxing/browser`
 * （对标 Luma / Peatix 网页受付；只在 kiosk 的 QR 画面按需加载，不进其它页面的包）。都不行 → null（引导名前検索）。
 */
export async function createQrDecoder(): Promise<QrDecoder | null> {
  const Ctor = (globalThis as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
  if (Ctor) {
    const formats = await Ctor.getSupportedFormats?.().catch(() => [] as string[]);
    if (!formats || formats.includes("qr_code")) {
      const detector = new Ctor({ formats: ["qr_code"] });
      return { decode: async (video) => (await detector.detect(video).catch(() => []))[0]?.rawValue || null, engine: "native" };
    }
  }
  try {
    const { BrowserQRCodeReader } = await import("@zxing/browser");
    const reader = new BrowserQRCodeReader();
    return {
      decode: async (video) => {
        if (!video.videoWidth) return null;
        try { return reader.decode(video).getText() || null; } catch { return null; }
      },
      engine: "zxing",
    };
  } catch {
    return null;
  }
}

/** b12 #432 QR 読み取り中。BarcodeDetector → @zxing/browser 回退；都不可用 / 没有摄像头时引导名前検索。 */
function QrScanner({ t, onResult, onClose }: { t: HostT; onResult: (payload: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement | null>(null);
  const [problem, setProblem] = useState<"unsupported" | "denied" | null>(null);
  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) { setProblem("unsupported"); return; }
    let stream: MediaStream | null = null;
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let decoder: QrDecoder | null = null;
    const tick = async () => {
      if (stop || !video.current || !decoder) return;
      const text = await decoder.decode(video.current).catch(() => null);
      if (stop) return;
      if (text) { stop = true; onResult(text); return; }
      timer = setTimeout(() => void tick(), 250);
    };
    void createQrDecoder().then((found) => {
      if (stop) return;
      if (!found) { setProblem("unsupported"); return; }
      decoder = found;
      return navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }).then((media) => {
        if (stop) { media.getTracks().forEach((track) => track.stop()); return; }
        stream = media;
        if (video.current) { video.current.srcObject = media; void video.current.play().catch(() => {}); }
        void tick();
      }).catch(() => setProblem("denied"));
    });
    return () => { stop = true; if (timer) clearTimeout(timer); stream?.getTracks().forEach((track) => track.stop()); };
  }, [onResult]);
  return (
    <div className={k.cam} role="dialog" aria-label={t("kQrTitle")} data-kiosk-qr={problem ?? "reading"}>
      <div className={k.vf}>{problem ? null : <video ref={video} muted playsInline />}</div>
      <b className={k.camTitle}>{problem ? t(problem === "denied" ? "kQrDenied" : "kQrUnsupported") : t("kQrTitle")}</b>
      {problem ? null : <span className={k.camSub}>{t("kQrReading")}</span>}
      <button type="button" className={`btn ${s.btn} ${k.camBtn}`} onClick={onClose}>{t("kQrByName")}</button>
    </div>
  );
}

function isOnline() {
  return typeof navigator === "undefined" ? true : navigator.onLine !== false;
}

function KioskInner({ eventId, language }: { eventId: string; language: OrbitLanguage }) {
  const t = useMemo(() => hostTranslator(language), [language]);
  const toast = useToast();
  const [data, setData] = useState<HostKioskResponse | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<HostKioskRow[]>([]);
  const [queue, setQueue] = useState<KioskQueueItem[]>([]);
  const [devices, setDevices] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [undo, setUndo] = useState<HostKioskRow | null>(null);
  const [over, setOver] = useState<HostKioskRow | null>(null);
  const [scan, setScan] = useState(false);
  const [clock, setClock] = useState(() => new Date());
  const store = useRef<KioskStore | null>(null);
  const roster = useRef<KioskRosterCache | null>(null);
  const offset = useRef(0);
  const qRef = useRef("");
  const flushing = useRef(false);

  const nowKiosk = () => new Date(Date.now() + offset.current);
  const refreshQueue = useCallback(async () => { if (store.current) setQueue(await store.current.queue(eventId)); }, [eventId]);

  const accept = useCallback((next: HostKioskResponse) => {
    offset.current = Date.parse(next.now) - Date.now();
    setClock(new Date(Date.parse(next.now)));
    setData(next);
    setDevices(next.devices);
    if (qRef.current.trim()) setRows([...next.rows]);
  }, []);

  /** 读 kiosk（q = 当前搜索）。网络失败 → 视为离线；失去权限 → 清本机名单缓存。 */
  const load = useCallback(async (query: string) => {
    if (!isOnline()) { setOnline(false); return; }
    const res = await hostApi.kiosk(eventId, query);
    if (res.ok) { setOnline(true); setFailure(null); accept(res.data); return; }
    const reason = failureOf(res);
    if (reason === "network") { setOnline(false); return; }
    // 失去权限：这场的名单和离线队列（都有姓名）一起清。
    if (reason === "forbidden" || reason === "not_found") { await store.current?.clearEvent(eventId); roster.current = null; void refreshQueue(); }
    setFailure(reason);
  }, [eventId, accept]);

  const loadRoster = useCallback(async () => {
    if (!store.current) return;
    // TTL 按 kiosk 时钟（服务端 now）比，避免本机时间不准把有效缓存当过期。
    const cached = await readRoster(store.current, eventId, nowKiosk());
    roster.current = cached;
    if (!isOnline()) return;
    const res = await hostApi.kioskRoster(eventId);
    if (res.ok) {
      const cache = { cacheUntil: res.data.cacheUntil, eventId, rows: res.data.rows, savedAt: new Date().toISOString() };
      if (Date.parse(cache.cacheUntil) > nowKiosk().getTime()) { await store.current.saveRoster(cache); roster.current = cache; } else { await store.current.clearRoster(eventId); roster.current = null; }
    } else if (failureOf(res) === "forbidden") { await store.current.clearEvent(eventId); roster.current = null; void refreshQueue(); }
  }, [eventId, refreshQueue]);

  const flush = useCallback(async (manual: boolean) => {
    if (!store.current || flushing.current) return;
    if (!isOnline()) { setOnline(false); if (manual) toast.error(t("kOfflineTitle")); return; }
    flushing.current = true;
    const result = await flushQueue(store.current, eventId, async (item) => {
      const res = await hostApi.checkIn(item.eventId, item.participantId, item.idempotencyKey);
      return res.ok ? { data: res.data, ok: true } : { ok: false, reason: failureOf(res) };
    });
    flushing.current = false;
    await refreshQueue();
    if (result.stopped) setOnline(false);
    if (result.sent + result.duplicate > 0) { toast.success(t("kFlushed", { n: result.sent + result.duplicate })); await load(qRef.current); }
  }, [eventId, load, refreshQueue, t, toast]);

  // 初始化：本机存储 → 队列 → kiosk → 名单缓存 → 心跳。
  useEffect(() => {
    let alive = true;
    void (async () => {
      store.current = (await indexedDbKioskStore()) ?? memoryKioskStore();
      // 启动时清掉所有场次里过期的名单（不只这一场）。
      await purgeExpiredRosters(store.current, new Date());
      if (!alive) return;
      setOnline(isOnline());
      await refreshQueue();
      await load("");
      await loadRoster();
      if (isOnline()) void flush(false);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  // 5 秒轮询 + 时钟。
  useEffect(() => {
    const poll = setInterval(() => { if (document.visibilityState !== "hidden") void load(qRef.current); }, POLL_MS);
    const tick = setInterval(() => setClock(nowKiosk()), 15_000);
    return () => { clearInterval(poll); clearInterval(tick); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  // 30 秒心跳（deviceId 存 localStorage）。
  useEffect(() => {
    const deviceId = kioskDeviceId();
    const beat = async () => {
      if (!isOnline()) return;
      const res = await hostApi.heartbeat(eventId, deviceId);
      if (res.ok) { setDevices(res.data.devices); return; }
      // 心跳发现权限没了（被移出共同运营等）：清这场的本机名单与队列，并显示说明。
      const reason = failureOf(res);
      if (reason === "forbidden" || reason === "not_found") { await store.current?.clearEvent(eventId); roster.current = null; void refreshQueue(); setFailure(reason); }
    };
    void beat();
    const timer = setInterval(() => void beat(), HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, [eventId, refreshQueue]);

  // 联网 / 断网。
  useEffect(() => {
    const up = () => { setOnline(true); void flush(false).then(() => load(qRef.current)); };
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, [flush, load]);

  // 搜索（在线 = 服务端；离线 = 本机名单缓存）。
  useEffect(() => {
    qRef.current = q;
    if (!q.trim()) { setRows([]); return; }
    const timer = setTimeout(() => {
      if (online && isOnline()) void load(q);
      else setRows(searchRoster(roster.current?.rows ?? [], q, new Set(queue.map((item) => item.participantId))));
    }, online ? SEARCH_MS : 0);
    return () => clearTimeout(timer);
  }, [q, online, load, queue]);

  const enqueue = async (row: HostKioskRow, key: string) => {
    if (!store.current) return;
    await store.current.enqueue({ at: nowKiosk().toISOString(), eventId, idempotencyKey: key, name: row.name, org: row.org, participantId: row.participantId });
    await refreshQueue();
    toast.info(t("kQueued"));
  };

  const arrive = async (row: HostKioskRow) => {
    const key = newIdempotencyKey();
    setBusy(row.participantId);
    if (!online || !isOnline()) { await enqueue(row, key); setBusy(null); setQ(""); return; }
    const res = await hostApi.checkIn(eventId, row.participantId, key);
    setBusy(null);
    if (!res.ok) {
      const reason = failureOf(res);
      if (reason === "network") { setOnline(false); await enqueue(row, key); setQ(""); return; }
      toast.error(failureCode(res) === "WAITLISTED" ? t("kWaitlistedErr") : t("saveError"));
      return;
    }
    toast.success(res.data.duplicate ? t("kDup", { name: res.data.name }) : res.data.table ? t("kDoneTable", { name: res.data.name, t: res.data.table }) : t("kDone", { name: res.data.name }));
    setQ("");
    await load("");
  };

  const doUndo = async () => {
    if (!undo) return;
    if (!online) { toast.error(t("kOfflineAction")); setUndo(null); return; }
    setBusy(undo.participantId);
    const res = await hostApi.undoCheckIn(eventId, undo.participantId, newIdempotencyKey());
    setBusy(null);
    setUndo(null);
    if (!res.ok) { toast.error(t("saveError")); return; }
    toast.success(t("kUndone"));
    await load(qRef.current);
  };

  const walkIn = async (row: HostKioskRow, confirmed: boolean) => {
    if (!online) { toast.error(t("kOfflineAction")); return; }
    if (!confirmed && data?.overCapacity) { setOver(row); return; }
    setBusy(row.participantId);
    const res = await hostApi.admitOnSite(eventId, row.participantId, newIdempotencyKey(), confirmed);
    setBusy(null);
    if (!res.ok) {
      if (failureCode(res) === "CAPACITY_FULL" && !confirmed) { setOver(row); return; }
      toast.error(t("saveError"));
      return;
    }
    setOver(null);
    toast.success(t("kDone", { name: res.data.name }));
    setQ("");
    await load("");
  };

  const scanned = useCallback(async (payload: string) => {
    setScan(false);
    if (!isOnline()) { toast.error(t("kOfflineAction")); return; }
    const res = await hostApi.scanCheckIn(eventId, payload, newIdempotencyKey());
    if (!res.ok) { toast.error(failureCode(res) === "WAITLISTED" ? t("kWaitlistedErr") : t("kQrInvalid")); return; }
    toast.success(res.data.duplicate ? t("kDup", { name: res.data.name }) : res.data.table ? t("kDoneTable", { name: res.data.name, t: res.data.table }) : t("kDone", { name: res.data.name }));
    await load(qRef.current);
  }, [eventId, load, t, toast]);

  if (!data) {
    return failure ? (
      <div className={k.kiosk}><div className={`${s.card} ${s.empty}`} data-host-failure={failure}>{failure === "forbidden" ? t("noAccess") : failure === "not_found" ? t("notFound") : t("loadError")} <a className={`btn ${s.btn} ${s.sm}`} href="/app/events/center">{t("back")}</a></div></div>
    ) : <div className={k.kiosk} />;
  }
  return (
    <>
      <HostKioskView data={data} t={t} now={clock} online={online} q={q} rows={rows} queue={queue} devices={devices} busy={busy} focused={focused}
        onQ={setQ} onFocus={setFocused} onArrive={(row) => void arrive(row)} onUndo={setUndo} onWalkIn={(row) => void walkIn(row, false)}
        onRetry={() => void flush(true)} onScan={() => setScan(true)} exitHref={consoleHref(eventId)} />
      {scan ? <QrScanner t={t} onResult={(payload) => void scanned(payload)} onClose={() => setScan(false)} /> : null}
      {undo ? <UndoConfirm row={undo} t={t} busy={busy === undo.participantId} onCancel={() => setUndo(null)} onConfirm={() => void doUndo()} /> : null}
      {over ? <OverCapacityConfirm row={over} t={t} busy={busy === over.participantId} onCancel={() => setOver(null)} onConfirm={() => void walkIn(over, true)} /> : null}
    </>
  );
}

/** 390 等窄屏：受付はタブレットか App で（b12 #478，A8）。 */
export function KioskNarrowGuide({ t, title, eventId }: { t: HostT; title: string; eventId: string }) {
  const toast = useToast();
  const path = `/app/events/${encodeURIComponent(eventId)}/operations/check-in`;
  return (
    <div className={k.narrow} data-kiosk-narrow="">
      <div className={k.narrowTop}>
        <a className={k.rbtn} href={consoleHref(eventId)} aria-label={t("back")}><Icon name="left" size={20} /></a>
        <div><b>{t("kNarrowTop")}</b>{title ? <small>{title}</small> : null}</div>
        <span />
      </div>
      <div className={k.guide}>
        <div className={k.guideEmoji} aria-hidden>📱</div>
        <b className={k.guideTitle}>{t("kNarrowTitle")}</b>
        <div className={`${k.sub} ${k.guideBody}`}>{t("kNarrowBody")}</div>
        <a className={`btn ${s.btn} ${s.primary} ${k.block}`} href={`orbit://events/${encodeURIComponent(eventId)}/operations/check-in`}>{t("kOpenApp")}</a>
        <button type="button" className={`btn ${s.btn} ${s.ghost} ${k.block} ${k.blockGap}`} onClick={() => { void navigator.clipboard?.writeText(`${window.location.origin}${path}`).then(() => toast.success(t("copied")), () => toast.error(t("saveError"))); }}>{t("kCopyLink")}</button>
      </div>
    </div>
  );
}

function KioskRoot({ eventId, language }: { eventId: string; language: OrbitLanguage }) {
  const t = useMemo(() => hostTranslator(language), [language]);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setNarrow(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return (
    <>
      {narrow ? null : <KioskInner eventId={eventId} language={language} />}
      <KioskNarrowGuide t={t} title="" eventId={eventId} />
    </>
  );
}

export function HostKiosk({ eventId, language }: { eventId: string; language: OrbitLanguage }) {
  return (
    <Orbit2026Scope language={language} className={k.page}>
      <ToastProvider>
        <KioskRoot eventId={eventId} language={language} />
      </ToastProvider>
    </Orbit2026Scope>
  );
}
