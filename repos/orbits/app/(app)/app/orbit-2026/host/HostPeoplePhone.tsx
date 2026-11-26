"use client";

// < 768 参加者（b13 HM-P1–P9，2026-11-26 用户定：手机上也能办完审核）。
// 行尾「承認」；左滑露出「待ち」「見送り」；长按一行或点「選択」进入选择模式 → 底部操作条；点名字开详情（详情里也能决定）。
// 見送り 一律先确认（会通知对方、不能撤回）——确认框在 HostPeopleTab。
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import type { HostAdmissionDecision, HostPeopleBucket, HostPeopleRow } from "../../../../../shared/contract/host-console";
import { Avatar, BottomSheet, Icon } from "../ui";
import type { HostPeopleViewProps, RowIssue } from "./HostPeople";
import { ScoreRing } from "./HostPeople";
import { consoleHref, type HostT } from "./host-model";
import s from "./host.module.css";
import p from "./people-phone.module.css";
import m from "./tabs.module.css";

const BUCKETS: readonly HostPeopleBucket[] = ["pending", "approved", "waitlisted", "rejected"];
const BUCKET_LABEL = { approved: "bApproved", pending: "bPending", rejected: "bRejected", waitlisted: "bWaitlisted" } as const;
/** 左滑露出的两个按钮宽（72 × 2，kit .swipe.open）。 */
const SWIPE_OPEN = 144;
const LONG_PRESS_MS = 500;

export type HostPeoplePhoneProps = HostPeopleViewProps & {
  selecting: boolean;
  onSelecting: (on: boolean) => void;
  onClearSearch?: () => void;
  answerOf: (row: HostPeopleRow) => string | null;
};

type RowProps = {
  row: HostPeopleRow;
  t: HostT;
  bucket: HostPeopleBucket;
  answer: string | null;
  issue?: RowIssue;
  busy: boolean;
  selecting: boolean;
  selected: boolean;
  open: boolean;
  onOpenSwipe: (actorId: string | null) => void;
  onLongPress: (row: HostPeopleRow) => void;
  onToggle: (row: HostPeopleRow) => void;
  onDetail: (row: HostPeopleRow) => void;
  onDecide?: (row: HostPeopleRow, decision: HostAdmissionDecision) => void;
};

function attendText(count: number, t: HostT) {
  return count === 0 ? t("pFirstTime") : t("pTimes", { n: count });
}

function PersonRow({ row, t, bucket, answer, issue, busy, selecting, selected, open, onOpenSwipe, onLongPress, onToggle, onDetail, onDecide }: RowProps) {
  const decidable = bucket === "pending" || bucket === "waitlisted";
  const swipeable = decidable && !selecting;
  const [dx, setDx] = useState<number | null>(null);
  const start = useRef<{ x: number; y: number; id: number; horizontal: boolean | null } | null>(null);
  const timer = useRef<number | null>(null);
  const suppressClick = useRef(false);
  const clearTimer = () => { if (timer.current != null) { window.clearTimeout(timer.current); timer.current = null; } };
  useEffect(() => clearTimer, []);

  const down = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    start.current = { horizontal: null, id: event.pointerId, x: event.clientX, y: event.clientY };
    suppressClick.current = false;
    if (decidable && !selecting) {
      clearTimer();
      timer.current = window.setTimeout(() => { suppressClick.current = true; start.current = null; setDx(null); onLongPress(row); }, LONG_PRESS_MS);
    }
  };
  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    const from = start.current;
    if (!from || from.id !== event.pointerId) return;
    const mx = event.clientX - from.x;
    const my = event.clientY - from.y;
    if (Math.abs(mx) > 8 || Math.abs(my) > 8) clearTimer();
    if (!swipeable) return;
    if (from.horizontal === null && (Math.abs(mx) > 8 || Math.abs(my) > 8)) from.horizontal = Math.abs(mx) > Math.abs(my);
    if (!from.horizontal) return;
    suppressClick.current = true;
    const base = open ? -SWIPE_OPEN : 0;
    setDx(Math.max(-SWIPE_OPEN - 24, Math.min(0, base + mx)));
  };
  const up = () => {
    clearTimer();
    if (dx !== null) onOpenSwipe(dx < -SWIPE_OPEN / 2 ? row.actorId : null);
    setDx(null);
    start.current = null;
  };
  const tap = () => {
    if (suppressClick.current) { suppressClick.current = false; return; }
    if (open) { onOpenSwipe(null); return; }
    if (selecting) { if (decidable) onToggle(row); return; }
    onDetail(row);
  };
  const offset = dx ?? (open ? -SWIPE_OPEN : 0);
  const low = row.profileScore < 50;
  const ring = (
    <ScoreRing value={row.profileScore / 100} size={30} stroke={4} color={low ? "var(--coral)" : "var(--plum-500)"} label={t("pProfileScore", { n: row.profileScore })}>
      <span className={`${p.score9} ${low ? p.inc : ""}`}>{row.profileScore}</span>
    </ScoreRing>
  );
  const line = [row.org, row.role].filter(Boolean).join(" · ");
  return (
    <div className={`${p.swipe} ${selected ? p.sel : ""}`} data-host-row={row.actorId} data-issue={issue} data-open={open || undefined}>
      {swipeable ? (
        <div className={p.acts} aria-hidden={!open}>
          {bucket !== "waitlisted" ? <button type="button" className={`btn ${p.aWait}`} tabIndex={open ? 0 : -1} disabled={busy} aria-label={t("pSwipeWait", { name: row.name })} onClick={() => { onOpenSwipe(null); onDecide?.(row, "waitlist"); }}><Icon name="clock" size={16} />{t("pWait")}</button> : null}
          <button type="button" className={`btn ${p.aReject}`} tabIndex={open ? 0 : -1} disabled={busy} aria-label={t("pSwipeReject", { name: row.name })} onClick={() => { onOpenSwipe(null); onDecide?.(row, "reject"); }}><Icon name="x" size={16} />{t("pReject")}</button>
        </div>
      ) : null}
      <div className={`${p.face} ${dx !== null ? p.dragging : ""}`} style={{ transform: offset ? `translateX(${offset}px)` : undefined }}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onContextMenu={(event) => { if (decidable) event.preventDefault(); }}>
        {selecting && decidable ? (
          <button type="button" role="checkbox" aria-checked={selected} aria-label={t("pSelectRow", { name: row.name })} className={`btn ${p.cbx} ${selected ? p.cbxOn : ""}`} onClick={() => onToggle(row)}>{selected ? <Icon name="check" size={16} /> : null}</button>
        ) : null}
        <button type="button" className={`btn ${p.who}`} data-host-who="" aria-label={selecting ? t("pSelectRow", { name: row.name }) : t("pdOpen", { name: row.name })} onClick={tap}>
          <Avatar name={row.name} />
          <span className={p.meta}>
            <b>{row.name}</b>
            {line ? <span className={s.lbl}>{line}</span> : null}
            {answer ? <span className={p.ans}>{answer}</span> : null}
            {issue ? <span className={p.rnote} role="status">{issue === "conflict" ? t("pRowConflict") : t("pRowFailed")}</span> : null}
          </span>
        </button>
        <span className={p.side}>
          {bucket === "approved" ? <span className={s.lbl}>{attendText(row.attendCount, t)}</span> : ring}
          {decidable && !selecting ? <button type="button" className={`btn ${s.btn} ${s.sm} ${s.primary}`} disabled={busy} onClick={() => onDecide?.(row, "approve")} data-host-approve="">{t("pApprove")}</button> : null}
        </span>
      </div>
    </div>
  );
}

export function HostPeoplePhone(props: HostPeoplePhoneProps) {
  const { data, t, rows, query, selected, selecting, issues = new Map<string, RowIssue>(), busy = false } = props;
  const [swipeOpen, setSwipeOpen] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const [q, setQ] = useState(query.q);
  useEffect(() => { setQ(query.q); }, [query.q]);
  const decidable = query.bucket === "pending" || query.bucket === "waitlisted";
  const capacity = data.capacity;
  const approved = data.counts.approved;
  const selCount = rows.filter((row) => selected.has(row.actorId)).length;
  const filtered = Boolean(query.q || query.incomplete);
  return (
    <div className={p.col} data-host-people={query.bucket} data-host-people-phone="" data-selecting={selecting || undefined}>
      <div className={p.segWrap}>
        <div className={`${p.seg} ${s.seg}`} role="tablist" aria-label={t("pBuckets")}>
          {BUCKETS.map((bucket) => (
            <button key={bucket} type="button" role="tab" aria-selected={bucket === query.bucket} className={`btn ${s.segBtn} ${bucket === query.bucket ? s.segOn : ""}`}
              onClick={() => { setSwipeOpen(null); props.onBucket?.(bucket); }}>{t(BUCKET_LABEL[bucket], { n: data.counts[bucket] })}</button>
          ))}
        </div>
      </div>
      {selecting ? (
        <div className={p.selhead} data-host-selhead="">
          <button type="button" className={`btn ${s.btn} ${s.sm} ${s.ghost}`} onClick={() => props.onSelecting(false)}>{t("cancel")}</button>
          <b>{t("pSelected", { n: selCount })}</b>
          <button type="button" className={`btn ${s.btn} ${s.sm} ${s.ghost}`} onClick={props.onSelectAll}>{t("pSelectEveryone")}</button>
        </div>
      ) : (
        <>
          <div className={p.capl} data-host-capacity="">
            <span className={s.lbl}>{t("pCapApproved")}</span>
            <b>{approved}{capacity ? <small className={s.lbl}> / {capacity}</small> : null}</b>
            {capacity ? <div className={`${s.bar} ${p.capBar}`}><i style={{ width: `${Math.min(100, Math.round((approved / capacity) * 100))}%` }} /></div> : <span className={p.grow} />}
            <span className={s.lbl}>{data.remaining != null ? t("pCapLeft", { n: data.remaining }) : t("pApprovedNoCap")}</span>
          </div>
          <div className={p.tools}>
            <label className={`${p.search} ${q ? p.searchOn : ""}`}><Icon name="search" size={16} />
              <input type="search" aria-label={t("pSearch")} placeholder={t("pSearchPh")} value={q} onChange={(event) => { setQ(event.target.value); props.onSearch?.(event.target.value); }} />
            </label>
            <button type="button" className={`btn ${p.more}`} aria-label={t("pMoreMenu")} aria-haspopup="dialog" onClick={() => setSheet(true)} data-host-people-more=""><Icon name="more" size={16} /></button>
          </div>
          <div className={p.tools2}>
            <button type="button" className={`btn ${p.fchip} ${query.incomplete ? p.fchipOn : ""}`} aria-pressed={query.incomplete} onClick={props.onIncomplete}>
              <Icon name={query.incomplete ? "check" : "filter"} size={16} />{t("pIncomplete")}
            </button>
            <span className={p.grow} />
            {decidable && rows.length > 0 ? <button type="button" className={`btn ${s.btn} ${s.sm} ${s.ghost}`} onClick={() => props.onSelecting(true)} data-host-select="">{t("pSelect")}</button> : null}
          </div>
        </>
      )}
      {props.loading ? (
        <div className={`${s.card} ${p.plist}`} aria-busy="true">
          {[110, 90, 120, 100, 80].map((w) => <div key={w} className={p.ghost} aria-hidden><i className={p.gAv} /><span className={p.gLines}><i style={{ width: w }} /><i style={{ width: w + 70 }} /></span><i className={p.gBtn} /></div>)}
        </div>
      ) : rows.length === 0 ? (
        filtered ? (
          <div className={`${s.card} ${p.nomatch}`} data-host-people-nomatch="">
            <div className={p.nomatchEmo} aria-hidden>🔍</div>
            <b>{t("pNoMatch")}</b>
            <div className={p.nomatchActs}>
              {query.q ? <button type="button" className={`btn ${s.btn} ${s.sm}`} onClick={() => { setQ(""); props.onClearSearch?.(); }}>{t("pClearSearch")}</button> : null}
              {query.incomplete ? <button type="button" className={`btn ${s.btn} ${s.sm}`} onClick={props.onIncomplete}>{t("pClearFilter")}</button> : null}
            </div>
          </div>
        ) : <div className={`${s.card} ${s.empty}`}>{t("pNone")}</div>
      ) : (
        <div className={`${s.card} ${p.plist}`}>
          {rows.map((row) => (
            <PersonRow key={row.actorId} row={row} t={t} bucket={query.bucket} answer={props.answerOf(row)} issue={issues.get(row.actorId)} busy={busy}
              selecting={selecting} selected={selected.has(row.actorId)} open={swipeOpen === row.actorId}
              onOpenSwipe={setSwipeOpen}
              onLongPress={(target) => { setSwipeOpen(null); props.onSelecting(true); if (!selected.has(target.actorId)) props.onSelect?.(target.actorId); }}
              onToggle={(target) => props.onSelect?.(target.actorId)}
              onDetail={(target) => props.onOpen?.(target)}
              onDecide={props.onDecide} />
          ))}
        </div>
      )}
      {data.more > 0 && data.nextCursor && !props.loading ? <div className={`${s.row} ${m.moreRow}`}><button type="button" className={`btn ${s.btn} ${s.sm}`} disabled={busy} onClick={props.onMore}>{t("pMore", { n: data.more })}</button></div> : null}
      {selecting ? (
        <div className={p.foot} data-host-bulk={selCount}>
          <div className={p.bulk}>
            <div className={`${s.row} ${s.between}`}><b className={p.bulkCount}>{t("pSelected", { n: selCount })}</b><span className={s.lbl}>{t(BUCKET_LABEL[query.bucket], { n: data.counts[query.bucket] }).replace(/\s*\d+$/u, "")}</span></div>
            <div className={p.bk3}>
              <button type="button" className={`btn ${s.btn} ${s.primary}`} disabled={busy || selCount === 0} onClick={() => props.onBulk?.("approve")}><Icon name="check" size={16} />{t("pBulkApprove", { n: selCount })}</button>
              {query.bucket !== "waitlisted" ? <button type="button" className={`btn ${s.btn}`} disabled={busy || selCount === 0} onClick={() => props.onBulk?.("waitlist")}>{t("pBulkWaitlist")}</button> : <span />}
              <button type="button" className={`btn ${s.btn} ${p.ctext}`} disabled={busy || selCount === 0} onClick={() => props.onBulk?.("reject")}>{t("pReject")}</button>
            </div>
          </div>
        </div>
      ) : null}
      <BottomSheet open={sheet} onClose={() => setSheet(false)} label={t("pMoreMenu")} tight>
        <div className={p.mrows}>
          <button type="button" className={`btn ${p.mi}`} disabled={!data.applyPath} onClick={() => { setSheet(false); props.onCopyLink?.(); }}><Icon name="link" size={16} />{t("pCopyApplyLink")}</button>
          <button type="button" className={`btn ${p.mi}`} disabled={!data.applyPath} onClick={() => { setSheet(false); props.onQr?.(); }}><Icon name="scan" size={16} />{t("pQrTitle")}</button>
          <button type="button" className={`btn ${p.mi}`} onClick={() => { setSheet(false); props.onImport?.(); }}><Icon name="layers" size={16} />{t("pImport")}<span className={p.miTail}>CSV</span></button>
        </div>
        <button type="button" className={`btn ${s.btn} ${p.sheetClose}`} onClick={() => setSheet(false)}>{t("close")}</button>
      </BottomSheet>
    </div>
  );
}

/** < 768 还没有申込（b13 HM-P7）：申込リンク + コピー / QR，下面两张入口卡。 */
export function HostPeoplePhoneEmpty({ t, link, eventId, setupSummary, onCopyLink, onQr, onImport }: { t: HostT; link: string | null; eventId: string; setupSummary: string; onCopyLink?: () => void; onQr?: () => void; onImport?: () => void }) {
  return (
    <div className={p.col} data-host-people="empty" data-host-people-phone="">
      <div className={`${s.guide} ${p.emptyGuide}`}>
        <div className={p.emptyTitle}>{t("pEmptyTitle")}</div>
        <div className={`${s.sub} ${p.emptySub}`}>{t("pEmptySub")}</div>
        <div className={p.emptyLink} aria-label={t("pApplyLink")}><Icon name="link" size={16} /><span className={p.ell}>{link ?? t("pNoLink")}</span></div>
        <div className={p.grid2}>
          <button type="button" className={`btn ${s.btn} ${s.primary}`} disabled={!link} onClick={onCopyLink}><Icon name="link" size={16} />{t("copyLink")}</button>
          <button type="button" className={`btn ${s.btn}`} disabled={!link} onClick={onQr}>{t("pQr")}</button>
        </div>
      </div>
      <a className={`${s.card} ${p.tile}`} href={consoleHref(eventId, "setup")}>
        <span className={`${s.emo} ${s.e_apricot}`}>📝</span>
        <span className={p.grow}><b>{t("pSetupCheck")}</b><span className={`${s.lbl} ${p.block}`}>{setupSummary}</span></span>
        <Icon name="right" size={16} />
      </a>
      <button type="button" className={`btn ${s.card} ${p.tile}`} onClick={onImport} data-host-import="">
        <span className={`${s.emo} ${s.e_pink}`}>🗂️</span>
        <span className={p.grow}><b>{t("pImport")}</b><span className={`${s.lbl} ${p.block}`}>{t("pImportSub")}</span></span>
        <Icon name="right" size={16} />
      </button>
    </div>
  );
}
