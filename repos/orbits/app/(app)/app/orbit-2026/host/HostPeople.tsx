"use client";

// R17 イベント運営 · 参加者（b6 #7 空 · 朝会 #3 / #8 少 · ラウンドテーブル / #9 大 · CFO18，§39 A10 审核说明与批量按钮写人数）。
// 数据：GET /api/host/events/[id]/people?bucket=&q=&incomplete=1&cursor=；决定 POST /people/[actorId]/decision。
// 批量 = 逐条调用，各带自己的版本号；失败的行就地标出（409 →「他の運営者が先に更新しました」并只重读这一行所在的列表）。
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import type { HostAdmissionDecision, HostPeopleBucket, HostPeopleResponse, HostPeopleRow } from "../../../../../shared/contract/host-console";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { InviteQr } from "../add/invite/InviteQr";
import { Avatar, Icon, Modal, useToast } from "../ui";
import { failureOf, hostApi, type HostPeopleQuery } from "./host-api";
import { consoleHref, hostTranslator, type HostT } from "./host-model";
import s from "./host.module.css";
import m from "./tabs.module.css";

const BUCKETS: readonly HostPeopleBucket[] = ["pending", "approved", "waitlisted", "rejected"];
const BUCKET_LABEL = { approved: "bApproved", pending: "bPending", rejected: "bRejected", waitlisted: "bWaitlisted" } as const;
const DONE_LABEL = { approve: "dApproved", reject: "dRejected", waitlist: "dWaitlisted" } as const;

export type RowIssue = "conflict" | "failed";

/** 小圆环（kit .ring 34 / 4；<50% 用 coral）。 */
function ScoreRing({ value, size, stroke, color, children, label }: { value: number; size: number; stroke: number; color: string; children?: ReactNode; label: string }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = Math.max(0, Math.min(1, value)) * circumference;
  return (
    <div className={m.ring} style={{ height: size, width: size }} role="img" aria-label={label}>
      <svg width={size} height={size} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={radius} stroke="var(--surface-3)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={radius} stroke={color} strokeWidth={stroke} strokeDasharray={`${dash} ${circumference}`} strokeDashoffset={0} />
      </svg>
      <div className={m.ringC} aria-hidden>{children}</div>
    </div>
  );
}

function attendText(count: number, t: HostT) {
  return count === 0 ? t("pFirstTime") : t("pTimes", { n: count });
}

export type HostPeopleViewProps = {
  data: HostPeopleResponse;
  t: HostT;
  rows: readonly HostPeopleRow[];
  query: HostPeopleQuery;
  selected: ReadonlySet<string>;
  issues?: ReadonlyMap<string, RowIssue>;
  busy?: boolean;
  origin?: string;
  onBucket?: (bucket: HostPeopleBucket) => void;
  onSearch?: (q: string) => void;
  onIncomplete?: () => void;
  onSelect?: (actorId: string) => void;
  onSelectAll?: () => void;
  onDecide?: (row: HostPeopleRow, decision: HostAdmissionDecision) => void;
  onBulk?: (decision: HostAdmissionDecision) => void;
  onMore?: () => void;
  onCopyLink?: () => void;
  onQr?: () => void;
  onImport?: () => void;
};

/** 「質問 3問 · 審査制」。 */
function setupSummary(data: HostPeopleResponse, t: HostT) {
  return t("pSetupSummary", { mode: data.event.admissionMode === "first_come" ? t("modeFirstCome") : t("modeReview"), n: data.questionCount });
}

/** 申込が一件もない（四区分すべて 0）。 */
export function peopleIsEmpty(data: HostPeopleResponse): boolean {
  return data.counts.pending + data.counts.approved + data.counts.waitlisted + data.counts.rejected === 0;
}

export function HostPeopleView(props: HostPeopleViewProps) {
  const { data, t, rows, query, selected, issues = new Map<string, RowIssue>(), busy = false, origin = "" } = props;
  const eventId = data.event.eventId;
  if (peopleIsEmpty(data) && !query.q && !query.incomplete) {
    const link = data.applyPath ? `${origin}${data.applyPath}` : null;
    return (
      <>
        <div className={`${s.card} ${s.span8} ${s.guide} ${m.emptyCard}`} data-host-people="empty">
          <div className={m.guideH}>{t("pEmptyTitle")}</div>
          <div className={`${s.sub} ${m.emptySub}`}>{t("pEmptySub")}</div>
          <div className={`${s.row} ${m.linkRow}`}>
            <div className={`${m.input} ${m.linkInput}`} aria-label={t("pApplyLink")}><Icon name="link" size={16} /><span className={m.linkText}>{link ?? t("pNoLink")}</span></div>
            <button type="button" className={`btn ${s.btn} ${s.primary} ${s.h46}`} disabled={!link} onClick={props.onCopyLink}><Icon name="link" size={16} />{t("copyLink")}</button>
            <button type="button" className={`btn ${s.btn} ${s.h46}`} disabled={!link} onClick={props.onQr}>{t("pQr")}</button>
          </div>
        </div>
        <div className={`${s.span4} ${s.tiles}`}>
          <a className={`btn ${m.tileBtn}`} href={consoleHref(eventId, "setup")}>
            <span className={`${s.emo} ${s.e_apricot}`}>📝</span>
            <div><b>{t("pSetupCheck")}</b><div className={s.lbl}>{setupSummary(data, t)}</div></div>
          </a>
          <button type="button" className={`btn ${m.tileBtn}`} onClick={props.onImport} data-host-import="">
            <span className={`${s.emo} ${s.e_pink}`}>🗂️</span>
            <div><b>{t("pImport")}</b><div className={s.lbl}>{t("pImportSub")}</div></div>
          </button>
        </div>
        <div className={`${s.card} ${s.span12}`} aria-hidden>
          <table className={m.table}>
            <thead><tr><th /><th>{t("pColApplicant")}</th><th>{t("pColAnswerPlain")}</th><th>{t("pColProfile")}</th><th>{t("pColDate")}</th><th /></tr></thead>
            <tbody>{[0, 1, 2].map((key) => <tr key={key} className={m.ghostTr}><td className={m.tdCheck}><i style={{ width: 18 }} /></td><td><i style={{ width: 140 }} /></td><td><i style={{ width: 280 }} /></td><td><i style={{ width: 60 }} /></td><td><i style={{ width: 50 }} /></td><td><i style={{ width: 150 }} /></td></tr>)}</tbody>
          </table>
        </div>
      </>
    );
  }
  const capacity = data.capacity;
  const approved = data.counts.approved;
  const decidable = query.bucket === "pending" || query.bucket === "waitlisted";
  const allSelected = rows.length > 0 && rows.every((row) => selected.has(row.actorId));
  const answerHead = data.answerLabel ? t("pColAnswer", { q: data.answerLabel }) : t("pColAnswerPlain");
  return (
    <>
      <div className={`${s.card} ${m.span9}`} data-host-people={query.bucket}>
        <div className={`${s.row} ${s.between} ${m.peopleHead}`}>
          <div className={s.seg} role="tablist" aria-label={t("pBuckets")}>
            {BUCKETS.map((bucket) => (
              <button key={bucket} type="button" role="tab" aria-selected={bucket === query.bucket} className={`btn ${s.segBtn} ${bucket === query.bucket ? s.segOn : ""}`} onClick={() => props.onBucket?.(bucket)}>{t(BUCKET_LABEL[bucket], { n: data.counts[bucket] })}</button>
            ))}
          </div>
          <div className={s.row} style={{ gap: 8 }}>
            <label className={`${m.input} ${m.searchSm}`}><Icon name="search" size={16} /><input type="search" aria-label={t("pSearch")} placeholder={t("pSearchPh")} defaultValue={query.q} onChange={(event) => props.onSearch?.(event.target.value)} /></label>
            <button type="button" className={`btn ${s.btn} ${s.sm} ${query.incomplete ? m.filterOn : ""}`} aria-pressed={query.incomplete} onClick={props.onIncomplete}><Icon name="filter" size={16} />{t("pIncomplete")}</button>
          </div>
        </div>
        {selected.size > 0 && decidable ? (
          <div className={m.bulk} data-host-bulk={selected.size}>
            <button type="button" role="checkbox" aria-checked={allSelected ? true : "mixed"} aria-label={t("pSelectAll")} className={`btn ${m.cbx} ${m.cbxOn}`} onClick={props.onSelectAll}><Icon name="check" size={16} /></button>
            <b>{t("pSelected", { n: selected.size })}</b>
            <button type="button" className={`btn ${s.btn} ${s.sm} ${s.primary} ${m.bulkFirst}`} disabled={busy} onClick={() => props.onBulk?.("approve")}><Icon name="check" size={16} />{t("pBulkApprove", { n: selected.size })}</button>
            {query.bucket !== "waitlisted" ? <button type="button" className={`btn ${s.btn} ${s.sm}`} disabled={busy} onClick={() => props.onBulk?.("waitlist")}>{t("pBulkWaitlist")}</button> : null}
            <button type="button" className={`btn ${s.btn} ${s.sm} ${s.ghost}`} disabled={busy} onClick={() => props.onBulk?.("reject")}>{t("pReject")}</button>
          </div>
        ) : null}
        <table className={`${m.table} ${m.fixed}`}>
          <thead>
            <tr>
              <th className={m.colCheck} />
              <th className={m.colApplicant}>{t("pColApplicant")}</th>
              <th>{answerHead}</th>
              <th className={m.colProfile}>{t("pColProfile")}</th>
              <th className={m.colHistory}>{t("pColHistory")}</th>
              <th className={m.colActs} />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const on = selected.has(row.actorId);
              const issue = issues.get(row.actorId);
              const low = row.profileScore < 50;
              return (
                <tr key={row.actorId} className={issue ? m.rowError : undefined} data-host-row={row.actorId} data-issue={issue}>
                  <td className={m.tdCheck}>
                    {decidable ? <button type="button" role="checkbox" aria-checked={on} aria-label={t("pSelectRow", { name: row.name })} className={`btn ${m.cbx} ${on ? m.cbxOn : ""}`} onClick={() => props.onSelect?.(row.actorId)}>{on ? <Icon name="check" size={16} /> : null}</button> : null}
                  </td>
                  <td className={m.tdApplicant}>
                    <div className={`${s.row} ${m.who}`}>
                      <Avatar name={row.name} size="sm" />
                      <div className={s.minw0}>
                        <b className={`${s.clamp1} ${m.whoName}`}>{row.name}</b>
                        <div className={`${s.lbl} ${s.clamp1}`}>{[row.org, row.role].filter(Boolean).join(" · ")}</div>
                        {issue ? <span className={m.rowNote} role="status">{issue === "conflict" ? t("pRowConflict") : t("pRowFailed")}</span> : null}
                      </div>
                    </div>
                  </td>
                  <td className={m.tdAnswer}><div className={m.answer}>{row.answer ?? "—"}</div></td>
                  <td>
                    <div className={s.row} style={{ gap: 8 }}>
                      <ScoreRing value={row.profileScore / 100} size={34} stroke={4} color={low ? "var(--coral)" : "var(--plum-500)"} label={t("pProfileScore", { n: row.profileScore })}>
                        <span className={`${m.score} ${m.scoreSm}`}>{row.profileScore}</span>
                      </ScoreRing>
                      {row.profileIncomplete ? <span className={`${s.lbl} ${m.incomplete}`}>{t("pIncompleteTag")}</span> : null}
                    </div>
                  </td>
                  <td className={s.muted}>{attendText(row.attendCount, t)}</td>
                  <td>
                    {decidable ? (
                      <div className={`${s.row} ${m.acts}`}>
                        <button type="button" className={`btn ${s.btn} ${s.sm} ${s.ghost}`} disabled={busy} onClick={() => props.onDecide?.(row, "reject")}>{t("pReject")}</button>
                        {query.bucket !== "waitlisted" ? <button type="button" className={`btn ${s.btn} ${s.sm}`} disabled={busy} onClick={() => props.onDecide?.(row, "waitlist")}>{t("pWait")}</button> : null}
                        <button type="button" className={`btn ${s.btn} ${s.sm} ${s.primary}`} disabled={busy} onClick={() => props.onDecide?.(row, "approve")}>{t("pApprove")}</button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 ? <div className={s.empty}>{query.q || query.incomplete ? t("pNoMatch") : t("pNone")}</div> : null}
        {data.more > 0 && data.nextCursor ? <div className={`${s.row} ${m.moreRow}`}><button type="button" className={`btn ${s.btn} ${s.sm}`} disabled={busy} onClick={props.onMore}>{t("pMore", { n: data.more })}</button></div> : null}
      </div>
      <div className={`${s.span3} ${m.side}`}>
        <div className={`${s.card} ${m.ringCard}`} data-host-capacity="">
          <ScoreRing value={capacity ? approved / capacity : 0} size={130} stroke={12} color="var(--plum-700)" label={capacity ? `${approved} ${t("pRingOf", { n: capacity })}` : String(approved)}>
            <div className={`${s.big} ${m.ringBig}`}>{approved}</div>
            {capacity ? <div className={s.lbl}>{t("pRingOf", { n: capacity })}</div> : null}
          </ScoreRing>
          <div className={`${s.lbl} ${m.ringLbl}`}>{data.remaining != null ? t("pRemaining", { n: data.remaining }) : t("pApprovedNoCap")}</div>
        </div>
        <div className={`${s.card} ${s.flat} ${m.reviewCard}`}>
          <b>{t("pReviewTitle")}</b>
          <div className={`${s.sub} ${m.reviewBody}`}>{t("pReviewBody")}</div>
        </div>
      </div>
    </>
  );
}

const ROW_PAGE = 8;

/** 批量 = 逐条调用（各带自己的版本号）；返回成功数与失败的行（409 → conflict）。 */
export async function runDecisions(
  targets: readonly HostPeopleRow[],
  decide: (row: HostPeopleRow) => Promise<{ ok: boolean; reason?: string }>,
): Promise<{ ok: number; failed: Map<string, RowIssue> }> {
  const failed = new Map<string, RowIssue>();
  let ok = 0;
  for (const row of targets) {
    const res = await decide(row);
    if (res.ok) ok += 1;
    else failed.set(row.actorId, res.reason === "conflict" ? "conflict" : "failed");
  }
  return { failed, ok };
}

export function HostPeopleTab({ eventId, language, initialIncomplete = false, onChanged }: { eventId: string; language: OrbitLanguage; initialIncomplete?: boolean; onChanged?: () => void }) {
  const t = useMemo(() => hostTranslator(language), [language]);
  const toast = useToast();
  const [query, setQuery] = useState<HostPeopleQuery>({ bucket: "pending", incomplete: initialIncomplete, q: "" });
  const [data, setData] = useState<HostPeopleResponse | null>(null);
  const [rows, setRows] = useState<HostPeopleRow[]>([]);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [issues, setIssues] = useState<Map<string, RowIssue>>(new Map());
  const [origin, setOrigin] = useState("");
  const [dialog, setDialog] = useState<"qr" | "import" | null>(null);

  useEffect(() => { setOrigin(window.location.host); }, []);

  const load = useCallback(async (next: HostPeopleQuery = query) => {
    const res = await hostApi.people(eventId, next);
    if (!res.ok) { setFailed(true); return null; }
    setFailed(false);
    setData(res.data);
    setRows([...res.data.rows]);
    return res.data;
  }, [eventId, query]);
  useEffect(() => {
    const timer = setTimeout(() => void load(query), query.q ? 250 : 0);
    return () => clearTimeout(timer);
  }, [load, query]);

  const change = (patch: Partial<HostPeopleQuery>) => { setSelected(new Set()); setIssues(new Map()); setQuery((prev) => ({ ...prev, ...patch, cursor: null })); };

  const more = async () => {
    if (!data?.nextCursor) return;
    setBusy(true);
    const res = await hostApi.people(eventId, { ...query, cursor: data.nextCursor });
    setBusy(false);
    if (!res.ok) { toast.error(t("loadError")); return; }
    setData(res.data);
    setRows((prev) => { const seen = new Set(prev.map((row) => row.actorId)); return [...prev, ...res.data.rows.filter((row) => !seen.has(row.actorId))]; });
  };

  /** 逐条决定；返回失败的行。成功的行从当前列表移走（换区分了）。 */
  const decide = async (targets: readonly HostPeopleRow[], decision: HostAdmissionDecision) => {
    setBusy(true);
    const { failed: failedRows, ok } = await runDecisions(targets, async (row) => {
      const res = await hostApi.decide(eventId, row.actorId, decision, row.applicationVersion);
      return res.ok ? { ok: true } : { ok: false, reason: failureOf(res) };
    });
    setBusy(false);
    // 重读列表（成功的行离开本区分；冲突的行拿到最新版本号），失败标记留在仍在列表里的行上。
    const fresh = await load(query);
    const still = new Set((fresh?.rows ?? []).map((row) => row.actorId));
    setIssues(new Map([...failedRows].filter(([actorId]) => still.has(actorId))));
    setSelected(new Set([...failedRows.keys()].filter((actorId) => still.has(actorId))));
    if (failedRows.size === 0) toast.success(targets.length === 1 ? t("pDone", { name: targets[0]!.name, what: t(DONE_LABEL[decision]) }) : t("pBulkDone", { n: ok }));
    else if ([...failedRows.values()].every((issue) => issue === "conflict") && ok === 0) toast.error(t("conflictFirst"));
    else toast.error(t("pBulkPartial", { ng: failedRows.size, ok }));
    if (ok > 0) onChanged?.();
  };

  const copyLink = async () => {
    if (!data?.applyPath) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${data.applyPath}`);
      toast.success(t("copied"));
    } catch {
      toast.error(t("saveError"));
    }
  };

  if (!data) {
    return failed
      ? <div className={`${s.card} ${s.span12} ${s.empty}`} data-host-failure="people">{t("loadError")} <button type="button" className={`btn ${s.btn} ${s.sm}`} onClick={() => void load()}>{t("retry")}</button></div>
      : null;
  }
  const visibleRows = rows.slice(0, Math.max(ROW_PAGE, rows.length));
  return (
    <>
      <HostPeopleView data={data} t={t} rows={visibleRows} query={query} selected={selected} issues={issues} busy={busy} origin={origin}
        onBucket={(bucket) => change({ bucket })}
        onSearch={(q) => change({ q })}
        onIncomplete={() => change({ incomplete: !query.incomplete })}
        onSelect={(actorId) => setSelected((prev) => { const next = new Set(prev); if (next.has(actorId)) next.delete(actorId); else next.add(actorId); return next; })}
        onSelectAll={() => setSelected((prev) => (rows.every((row) => prev.has(row.actorId)) ? new Set() : new Set(rows.map((row) => row.actorId))))}
        onDecide={(row, decision) => void decide([row], decision)}
        onBulk={(decision) => void decide(rows.filter((row) => selected.has(row.actorId)), decision)}
        onMore={() => void more()}
        onCopyLink={() => void copyLink()}
        onQr={() => setDialog("qr")}
        onImport={() => setDialog("import")} />
      {dialog === "qr" && data.applyPath ? (
        <Modal open onClose={() => setDialog(null)} title={t("pQrTitle")} size={420} actions={<button type="button" className={`btn ${s.btn}`} onClick={() => setDialog(null)}>{t("close")}</button>}>
          <div className={s.sub}>{`${origin}${data.applyPath}`}</div>
          <div className={m.qrBox}><InviteQr text={`${window.location.origin}${data.applyPath}`} label={t("pQrTitle")} /></div>
        </Modal>
      ) : null}
      {dialog === "import" ? (
        <Modal open onClose={() => setDialog(null)} title={t("pImport")} size={480} description={t("pImportBody")} hint={t("pImportSoon")} actions={<button type="button" className={`btn ${s.btn}`} onClick={() => setDialog(null)}>{t("close")}</button>} />
      ) : null}
    </>
  );
}
