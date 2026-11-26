"use client";

// < 768 受付（b13 HM-K1–K10，2026-11-26 用户定：手机浏览器就是签到设备，推翻 A8「390 不开 kiosk」）。
// 与 1180 kiosk 共用 KioskInner 的数据与动作（名前検索・到着・取り消す・当日枠・离线队列・QR 解码），只换画法：
// 顶栏 ‹ 受付 ⋯ → 到着卡 → 搜索 / 结果 → 最新の受付；底部唯一主按钮「QR を読み取る」；QR 全屏取景、连续读取。
import { useEffect, useRef, useState } from "react";

import type { HostKioskRow } from "../../../../../shared/contract/host-console";
import { Avatar, BottomSheet, Icon } from "../ui";
import { ScoreRing } from "./HostPeople";
import { createQrDecoder, doorsText, notArrived, streamRows, type HostKioskViewProps, type QrDecoder } from "./HostKiosk";
import { hostDateShort, hostTime, type HostT } from "./host-model";
import s from "./host.module.css";
import kp from "./kiosk-phone.module.css";

function chipOf(row: HostKioskRow, t: HostT, queued: boolean): { text: string; tone: string } {
  if (queued) return { text: t("kStPending"), tone: s.c_coral };
  if (row.status === "checked_in") return { text: row.table ? t("kStDone", { t: row.table, time: hostTime(row.checkedInAt) }) : t("kStDoneNoTable", { time: hostTime(row.checkedInAt) }), tone: s.c_teal };
  if (row.status === "waitlisted") return { text: t("kStWait"), tone: s.c_apricot };
  return { text: t("kStNot"), tone: "" };
}

export function KioskPhoneView(props: HostKioskViewProps & { onCopyLink?: () => void }) {
  const { data, t, now, online, q, rows, queue, devices, busy = null } = props;
  const [menu, setMenu] = useState(false);
  const before = data.checkedIn === 0 && data.recent.length === 0 && queue.length === 0;
  const pendingCount = queue.filter((item) => !item.error).length;
  const checkedIn = data.checkedIn + pendingCount;
  const rate = data.total ? Math.round((checkedIn / data.total) * 100) : 0;
  const queued = new Set(queue.map((item) => item.participantId));
  const stream = streamRows(data.recent, queue);
  const doors = doorsText(data.doorsOpenAt, now, t);
  // 「CFO Night Tokyo vol.18 · 本日 19:00」：开场日是今天写「本日」，否则写日期。
  const when = data.doorsOpenAt ? `${hostDateShort(data.doorsOpenAt, t) === hostDateShort(now.toISOString(), t) ? t("today") : hostDateShort(data.doorsOpenAt, t)} ${hostTime(data.doorsOpenAt)}` : null;
  const sub = [data.title, when, data.closed ? t("kSubEnded") : doors ? t("kSubBefore") : null].filter(Boolean).join(" · ");
  return (
    <div className={kp.page} data-host-kiosk={!online ? "offline" : before ? "before" : "live"} data-kiosk-phone="">
      <div className={kp.top}>
        <a className={kp.rbtn} href={props.exitHref ?? "/app/events/center"} aria-label={t("kExit")}><Icon name="left" size={20} /></a>
        <div className={kp.topT}><b>{t("kNarrowTop")}</b><small>{sub}</small></div>
        <button type="button" className={`btn ${kp.rbtn}`} aria-label={t("pMoreMenu")} aria-haspopup="dialog" onClick={() => setMenu(true)}><Icon name="more" size={20} /></button>
      </div>

      <div className={`${s.card} ${kp.arrCard}`}>
        <div className={kp.arr}>
          <ScoreRing value={data.total ? checkedIn / data.total : 0} size={76} stroke={9} color="var(--plum-700)" label={`${t("kArrived")} ${rate}%`}>
            <b className={kp.ringN}>{rate}<small>%</small></b>
          </ScoreRing>
          <div className={kp.grow}><div className={s.lbl}>{t("kArrived")}</div><div className={kp.big} data-kiosk-count={checkedIn}>{checkedIn}<small>{t("kOfTotal", { n: data.total })}</small></div></div>
          <div className={kp.right}><div className={s.lbl}>{t("kNotArrived")}</div><div className={kp.mid}>{notArrived(checkedIn, data.total)}</div></div>
        </div>
        <div className={kp.net}>
          <span className={`${s.chip} ${online ? s.c_teal : s.c_coral}`} role="status">{online ? t("kOnline") : t("kOffline")}</span>
          <span className={s.lbl}>{online ? t("kAuto", { n: devices }) : t("kUnsent", { n: pendingCount })}</span>
        </div>
      </div>

      {data.closed ? (
        <div className={kp.banner} role="status" data-kiosk-closed="">
          <span className={kp.bEmo} aria-hidden>🔒</span>
          <div className={kp.grow}><b>{t("kClosedTitle")}</b><span className={kp.bBody}>{t("kClosedBody")}</span></div>
        </div>
      ) : null}
      {!online ? (
        <div className={`${kp.banner} ${kp.bCoral}`} role="alert" data-kiosk-offline={pendingCount}>
          <span className={kp.bEmo} aria-hidden>📡</span>
          <div className={kp.grow}><b>{t("kOfflineTitle")}</b><span className={kp.bBody}>{t("kOfflineBody", { n: pendingCount })}</span></div>
          <button type="button" className={`btn ${s.btn} ${s.sm} ${s.primary}`} onClick={props.onRetry}><Icon name="refresh" size={16} />{t("kRetry")}</button>
        </div>
      ) : null}

      {!q.trim() && before && !data.closed ? (
        <div className={`${s.card} ${kp.before}`} data-kiosk-empty="">
          <div className={kp.door} aria-hidden>🚪</div>
          <b className={kp.beforeT}>{doors ?? t("kDoorsOpen")}</b>
          <div className={`${s.sub} ${kp.beforeB}`}>{t("kEmptyBodyPhone")}</div>
        </div>
      ) : null}

      <label className={`${kp.search} ${q ? kp.searchOn : ""}`}>
        <Icon name="search" size={20} />
        <input value={q} placeholder={t("kSearchPh")} aria-label={t("kSearch")} autoComplete="off" spellCheck={false} enterKeyHint="search"
          onChange={(event) => props.onQ?.(event.target.value)} data-kiosk-search="" />
      </label>

      {q.trim() ? (
        <div className={`${s.card} ${kp.res}`} data-kiosk-results={rows.length}>
          {rows.length === 0 ? <div className={`${s.sub} ${kp.noRes}`}>{t("kNoResult", { q: q.trim() })}</div> : rows.map((row) => {
            const isQueued = queued.has(row.participantId);
            const chip = chipOf(row, t, isQueued);
            const line = [row.org, row.role].filter(Boolean).join(" · ");
            return (
              <div key={row.participantId} className={kp.kr} data-kiosk-row={row.participantId}>
                <Avatar name={row.name} size="lg" />
                <div className={kp.meta}>
                  <b>{row.name}</b>
                  {line ? <span className={s.lbl}>{line}</span> : null}
                  <span className={`${s.chip} ${chip.tone} ${kp.chip}`}>{chip.text}</span>
                </div>
                {isQueued || data.closed ? null : row.status === "checked_in"
                  ? <button type="button" className={`btn ${s.btn} ${kp.act}`} disabled={busy === row.participantId || !row.undoable} onClick={() => props.onUndo?.(row)} data-kiosk-undo="">{t("kUndo")}</button>
                  : row.status === "waitlisted"
                    ? <button type="button" className={`btn ${s.btn} ${kp.act} ${kp.actWide}`} disabled={busy === row.participantId || !data.canWalkIn} onClick={() => props.onWalkIn?.(row)} data-kiosk-walkin="">{t("kWalkIn")}</button>
                    : <button type="button" className={`btn ${s.btn} ${s.primary} ${kp.act}`} disabled={busy === row.participantId} onClick={() => props.onArrive?.(row)} data-kiosk-arrive=""><Icon name="check" size={16} />{t("kArriveShort")}</button>}
              </div>
            );
          })}
        </div>
      ) : (
        <>
          <h3 className={kp.h}>{data.closed ? t("kRecord") : t("kStream")}</h3>
          <div className={`${s.card} ${kp.stream}`} aria-live="polite">
            {stream.length === 0 ? (
              <>
                <div className={`${s.lbl} ${kp.streamEmpty}`}>{t("kStreamEmpty")}</div>
                {[0, 1].map((index) => <div key={index} className={kp.ghost} aria-hidden><i />— : —</div>)}
              </>
            ) : stream.map((row) => (
              <div key={row.key} className={`${kp.kli} ${row.pending ? kp.pend : ""}`} data-kiosk-stream={row.pending ? "pending" : "sent"}>
                <time>{hostTime(row.at)}</time>
                <Avatar name={row.name} size="sm" />
                <div className={kp.grow}><b>{row.name}</b><span>{row.pending ? t("kStPending") : row.org ?? ""}</span></div>
                {row.pending
                  ? <button type="button" className={`btn ${kp.lbtn}`} aria-label={t("kResend", { name: row.name })} onClick={props.onRetry}><Icon name="refresh" size={16} /></button>
                  : row.table ? <span className={`${s.chip} ${s.c_lav}`}>{t("kTable", { t: row.table })}</span> : null}
              </div>
            ))}
          </div>
        </>
      )}

      {data.closed ? null : (
        <div className={kp.foot}>
          <button type="button" className={`btn ${s.btn} ${s.primary} ${kp.scan}`} onClick={props.onScan} data-kiosk-scan=""><Icon name="scan" size={16} />{t("kScan")}</button>
        </div>
      )}

      <BottomSheet open={menu} onClose={() => setMenu(false)} label={t("pMoreMenu")} tight>
        <button type="button" className={`btn ${kp.mi}`} onClick={() => { setMenu(false); props.onCopyLink?.(); }}><Icon name="link" size={16} />{t("kCopyLink")}</button>
        <a className={kp.mi} href={props.exitHref ?? "/app/events/center"}><Icon name="x" size={16} />{t("kExit")}</a>
        <button type="button" className={`btn ${s.btn} ${kp.sheetClose}`} onClick={() => setMenu(false)}>{t("close")}</button>
      </BottomSheet>
    </div>
  );
}

export type ScanOutcome = { ok: true; name: string; table: string | null; at: string; duplicate: boolean } | { ok: false; message: string };

/** 全屏取景（b13 HM-K3 / K4 / K10）：读到一位 → 结果卡停 2 秒、取景框变绿，然后接着读下一位，不退出相机。 */
export function KioskPhoneScanner({ t, title, onScan, onClose }: { t: HostT; title: string; onScan: (payload: string) => Promise<ScanOutcome>; onClose: () => void }) {
  const video = useRef<HTMLVideoElement | null>(null);
  const [problem, setProblem] = useState<"unsupported" | "denied" | null>(null);
  const [result, setResult] = useState<ScanOutcome | null>(null);
  const scanRef = useRef(onScan);
  scanRef.current = onScan;
  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) { setProblem("unsupported"); return; }
    let stream: MediaStream | null = null;
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let decoder: QrDecoder | null = null;
    let last = "";
    const tick = async () => {
      if (stop || !video.current || !decoder) return;
      const text = await decoder.decode(video.current).catch(() => null);
      if (stop) return;
      if (text && text !== last) {
        last = text;
        const outcome = await scanRef.current(text);
        if (stop) return;
        setResult(outcome);
        timer = setTimeout(() => { setResult(null); last = ""; void tick(); }, 2000);
        return;
      }
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
  }, []);
  const ok = result?.ok === true;
  return (
    <div className={kp.cam} role="dialog" aria-modal="true" aria-label={t("kQrTitle")} data-kiosk-qr={problem ?? (result ? (ok ? "ok" : "error") : "reading")}>
      <div className={kp.camTop}>
        <button type="button" className={`btn ${kp.gl} ${kp.rbtn}`} aria-label={t("close")} onClick={onClose}><Icon name="x" size={20} /></button>
        <span className={`${kp.gl} ${kp.camPill}`}>{title}</span>
        <span className={kp.camSpacer} />
      </div>
      {problem ? (
        <div className={kp.warn} data-kiosk-camwarn="">
          <div className={kp.warnEmo} aria-hidden>📷</div>
          <b>{t(problem === "denied" ? "kQrDenied" : "kQrUnsupported")}</b>
          {problem === "denied" ? <div className={kp.warnHint}>{t("kQrDeniedHint")}</div> : null}
        </div>
      ) : (
        <>
          <div className={`${kp.vf} ${ok ? kp.vfOk : ""}`}>
            <video ref={video} muted playsInline />
            <i /><i /><i /><i />
            <div className={kp.qrbox} />
          </div>
          <div className={kp.camTitle}>{t("kQrTitle")}</div>
          <div className={kp.camHint}>{t("kQrReading")}</div>
          {result ? (
            <div className={kp.camRes} role="status" data-kiosk-scan-result={ok ? "ok" : "error"}>
              {result.ok ? (
                <>
                  <Avatar name={result.name} />
                  <div className={kp.grow}><b>{t("kSan", { name: result.name })}</b><span className={s.lbl}>{result.duplicate ? t("kDupShort") : result.table ? t("kScanDoneTable", { t: result.table }) : t("kScanDone")}</span></div>
                  <span className={`${s.chip} ${s.c_teal}`}><Icon name="check" size={16} />{hostTime(result.at)}</span>
                </>
              ) : <div className={kp.grow}><b className={kp.errT}>{"message" in result ? result.message : ""}</b></div>}
            </div>
          ) : null}
        </>
      )}
      <div className={kp.camFoot}>
        <button type="button" className={`btn ${kp.gl} ${kp.camBtn}`} onClick={onClose} data-kiosk-byname=""><Icon name="search" size={16} />{t("kQrByName")}</button>
      </div>
    </div>
  );
}
