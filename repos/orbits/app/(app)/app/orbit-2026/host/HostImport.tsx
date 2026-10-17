"use client";

// R17 参加者 · 名簿の取り込み（b12 #476；決定表 §39 A2 / host DESIGN §2.2「招待者リストを取り込む」）。
// 入口：参加者页签空态「招待者リストを取り込む」→ `?tab=people&import=1`。CSV 只在浏览器里解析（不上传、不保存、不进联系人）；
// 输出 = 照合表 + 这场活动的招待リンク + 案内文（由主办方自己发；Orbit 不给 CSV 里的地址发任何邮件，对标 connpass）。
// 「申込済み / Orbit 登録済み · 未申込 / 未登録」三类照合（R17-11，用户 2026-10-17「做，知道也没关系」，决定表 §49）：
// 浏览器把每行邮箱 trim + 小写后算 SHA-256，只把哈希发给 `POST /api/host/events/[id]/roster/match`；文件本身不上传、不保存。
// 照合失败（限流 / 网络）时行显示「照合待ち」。招待リンク带 `?inv=<code>`（shared/compute/host-invite）。
// b12 #396–#475 待用户过目（§38），不进门禁。
import { useEffect, useMemo, useRef, useState } from "react";

import type { HostRosterMatchStatus } from "../../../../../shared/contract/host-console";
import type { HostEventView } from "../../../../../shared/contract/host-events";
import { hostInviteCode, normalizeRosterEmail } from "../../../../../shared/compute/host-invite";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { Icon, useToast } from "../ui";
import { failureOf, hostApi, hostEventApi } from "./host-api";
import { consoleHref, hostDateDay, hostTranslator } from "./host-model";
import i from "./import.module.css";
import s from "./host.module.css";
import m from "./tabs.module.css";

export type RosterRow = { name: string; email: string; status?: HostRosterMatchStatus | null };
/** 照合の状態：未照合 / 照合済み / 失敗 / 限流。 */
export type RosterMatchState = "pending" | "done" | "failed" | "limited";
const NAME_KEYS = /^(name|full ?name|名前|氏名|お名前|表示名|ニックネーム|姓名|参加者名)$/iu;
const MAIL_KEYS = /^(e-?mail|mail|メール|メールアドレス|email address|邮箱|电子邮件)$/iu;
export const ROSTER_MAX_ROWS = 5000;

/** RFC 4180 の最小実装（引用符・改行入りフィールド・BOM）。 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/u, "");
  for (let k = 0; k < src.length; k += 1) {
    const c = src[k]!;
    if (quoted) {
      if (c === "\"" && src[k + 1] === "\"") { field += "\""; k += 1; } else if (c === "\"") quoted = false; else field += c;
      continue;
    }
    if (c === "\"") quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[k + 1] === "\n") k += 1;
      row.push(field); field = "";
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((cell) => cell.trim())) rows.push(row);
  return rows;
}

/** 表头から 名前 / メール 列を探す（なければ null）。 */
export function rosterFromCsv(text: string): RosterRow[] | null {
  const rows = parseCsv(text);
  if (rows.length < 2) return null;
  const head = rows[0]!.map((cell) => cell.trim());
  const nameAt = head.findIndex((cell) => NAME_KEYS.test(cell));
  const mailAt = head.findIndex((cell) => MAIL_KEYS.test(cell));
  if (nameAt < 0 && mailAt < 0) return null;
  return rows.slice(1, ROSTER_MAX_ROWS + 1).map((cells) => ({ email: mailAt >= 0 ? (cells[mailAt] ?? "").trim() : "", name: nameAt >= 0 ? (cells[nameAt] ?? "").trim() : "" })).filter((row) => row.name || row.email);
}

/** 画板どおりメールはローカル部だけ見せる（`t.tanaka@…`）。 */
export const maskEmail = (email: string) => (email.includes("@") ? `${email.slice(0, email.indexOf("@"))}@…` : email);

const csvCell = (value: string) => (/[",\n]/u.test(value) ? `"${value.replace(/"/gu, "\"\"")}"` : value);

/** 浏览器端：规范化后的邮箱 → SHA-256（hex）。 */
export async function hashRosterEmail(email: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalizeRosterEmail(email)));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

const STATUS_CHIP: Record<HostRosterMatchStatus, string> = { applied: "c_teal", registered: "c_blue", unregistered: "" };
export const inviteLink = (origin: string, event: HostEventView) => (event.publicSlug ? `${origin}/e/${event.publicSlug}?inv=${hostInviteCode(event.eventId)}` : null);

export type HostImportViewProps = {
  event: HostEventView;
  language: OrbitLanguage;
  file: { name: string; rows: readonly RosterRow[]; at: string; match: RosterMatchState } | null;
  origin: string;
  onPick?: () => void;
  onCopyLink?: () => void;
  onCopyText?: () => void;
  onExport?: () => void;
};

/** 純粋な描画（b12 #476）。 */
export function HostImportView({ event, language, file, origin, onPick, onCopyLink, onCopyText, onExport }: HostImportViewProps) {
  const t = useMemo(() => hostTranslator(language), [language]);
  const link = inviteLink(origin, event);
  const rows = file?.rows ?? [];
  const matched = file?.match === "done";
  const count = (status: HostRosterMatchStatus) => rows.filter((row) => row.status === status).length;
  const rowLabel = (status: HostRosterMatchStatus | null | undefined) => (!matched || !status ? t("imPending") : status === "applied" ? t("imApplied") : status === "registered" ? t("imRowRegistered") : t("imUnregistered"));
  return (
    <>
      <div className={`${s.card} ${s.span8} ${i.blk}`} data-host-import-table={file ? rows.length : "none"}>
        {file ? (
          <>
            <div className={s.cardH}><h3>{t("imTitle", { file: file.name })}</h3><span className={s.lbl}>{t("imMeta", { d: hostDateDay(file.at, t, language), n: rows.length })}</span></div>
            <div className={i.stats}>
              {matched ? (
                <>
                  <div className={i.stat} data-host-import-count="applied"><span className={`${s.chip} ${s.c_teal} ${i.statChip}`}>{t("imApplied")}</span><b>{count("applied")}<small>{t("pubPeopleUnit")}</small></b></div>
                  <div className={i.stat} data-host-import-count="registered"><span className={`${s.chip} ${s.c_blue} ${i.statChip}`}>{t("imStatRegistered")}</span><b>{count("registered")}<small>{t("pubPeopleUnit")}</small></b></div>
                  <div className={i.stat} data-host-import-count="unregistered"><span className={`${s.chip} ${i.statChip}`}>{t("imUnregistered")}</span><b>{count("unregistered")}<small>{t("pubPeopleUnit")}</small></b></div>
                </>
              ) : (
                <>
                  <div className={i.stat}><span className={`${s.chip} ${s.c_teal} ${i.statChip}`}>{t("imApplied")}</span><b>—<small /></b></div>
                  <div className={i.stat}><span className={`${s.chip} ${s.c_blue} ${i.statChip}`}>{t("imStatRegistered")}</span><b>—<small /></b></div>
                  <div className={i.stat}><span className={`${s.chip} ${i.statChip}`}>{t("imPending")}</span><b>{rows.length}<small>{t("pubPeopleUnit")}</small></b></div>
                </>
              )}
            </div>
            {file?.match === "failed" || file?.match === "limited" ? <div className={`${s.lbl} ${i.note}`}>{t(file.match === "limited" ? "imMatchLimited" : "imMatchFailed")}</div> : null}
            <table className={m.table}>
              <thead><tr><th>{t("imColName")}</th><th>{t("imColMail")}</th><th>{t("imColResult")}</th></tr></thead>
              <tbody>
                {rows.slice(0, 50).map((row, index) => (
                  <tr key={`${row.email}-${index}`}><td><b>{row.name || "—"}</b></td><td className={s.muted}>{maskEmail(row.email) || "—"}</td><td><span className={`${s.chip} ${matched && row.status ? s[STATUS_CHIP[row.status]] ?? "" : ""}`} data-host-import-status={matched ? row.status ?? "" : "pending"}>{rowLabel(row.status)}</span></td></tr>
                ))}
              </tbody>
            </table>
            <div className={`${s.row} ${i.foot}`}>
              <button type="button" className={`btn ${s.btn} ${s.sm}`} onClick={onExport}>{t("imExport")}</button>
              <button type="button" className={`btn ${s.btn} ${s.sm} ${s.ghost}`} onClick={onPick}>{t("imPick")}</button>
              <span className={`${s.lbl} ${i.right}`}>{t("imNotContacts")}</span>
            </div>
          </>
        ) : (
          <div className={i.pick} data-host-import-pick="">
            <span className={`${s.emo} ${s.e_pink}`} aria-hidden>🗂️</span>
            <b className={i.pickTitle}>{t("imPickTitle")}</b>
            <div className={`${s.sub} ${i.pickSub}`}>{t("imPickSub")}</div>
            <button type="button" className={`btn ${s.btn} ${s.primary}`} onClick={onPick}><Icon name="plus" size={16} />{t("imPick")}</button>
          </div>
        )}
      </div>
      <div className={`${s.span4} ${i.col}`}>
        <div className={`${s.card} ${i.blk}`} data-host-import-invite="">
          <div className={s.cardH}><h3>{t("imInvite")}</h3><span className={s.lbl}>{t("imInviteSub")}</span></div>
          <div className={`${m.input} ${i.link}`}><Icon name="link" size={16} /><span className={s.clamp1}>{link ? link.replace(/^https?:\/\//u, "") : t("imNotPublished")}</span></div>
          <div className={i.acts}>
            <button type="button" className={`btn ${s.btn} ${s.primary} ${i.block}`} disabled={!link} onClick={onCopyLink}>{t("imCopyLink")}</button>
            <button type="button" className={`btn ${s.btn} ${i.block}`} disabled={!link} onClick={onCopyText}>{t("imCopyText")}</button>
          </div>
          {file ? <div className={`${s.lbl} ${i.hint}`}>{t("imSendHint", { n: matched ? rows.length - count("applied") : rows.length })}</div> : null}
        </div>
        <div className={`${s.card} ${s.flat} ${i.blk}`} data-host-import-rules="">
          <b className={i.rulesTitle}>{t("imRules")}</b>
          <div className={i.rules}>
            <div className={i.rule}><span aria-hidden>✉️</span><span>{t("imRuleMail")}</span></div>
            <div className={i.rule}><span aria-hidden>👤</span><span>{t("imRuleContacts")}</span></div>
            <div className={i.rule}><span aria-hidden>🗑️</span><span>{t("imRuleFile")}</span></div>
          </div>
        </div>
        <a className={`btn ${s.btn} ${s.ghost} ${i.block}`} href={consoleHref(event.eventId, "people")}>{t("imBack")}</a>
      </div>
    </>
  );
}

export function HostImportTab({ eventId, language }: { eventId: string; language: OrbitLanguage }) {
  const t = useMemo(() => hostTranslator(language), [language]);
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [event, setEvent] = useState<HostEventView | null>(null);
  const [failed, setFailed] = useState(false);
  const [file, setFile] = useState<{ name: string; rows: RosterRow[]; at: string; match: RosterMatchState } | null>(null);
  const [origin, setOrigin] = useState("");
  useEffect(() => { setOrigin(window.location.origin); }, []);
  useEffect(() => { void hostEventApi.event(eventId).then((res) => { if (res.ok) setEvent(res.data); else setFailed(true); }); }, [eventId]);
  const link = event ? inviteLink(origin, event) ?? "" : "";
  const copy = async (text: string) => { try { await navigator.clipboard.writeText(text); toast.success(t("pubCopied")); } catch { toast.error(t("saveError")); } };
  const read = async (picked: File | undefined) => {
    if (!picked) return;
    const rows = rosterFromCsv(await picked.text().catch(() => ""));
    if (!rows || !rows.length) { toast.error(t("imBadFile")); return; }
    const at = new Date().toISOString();
    setFile({ at, match: "pending", name: picked.name, rows });
    const withMail = rows.filter((row) => row.email.includes("@"));
    if (!withMail.length) { setFile({ at, match: "done", name: picked.name, rows: rows.map((row) => ({ ...row, status: null })) }); return; }
    const hashes = await Promise.all(withMail.map((row) => hashRosterEmail(row.email)));
    const res = await hostApi.rosterMatch(eventId, hashes);
    if (!res.ok) { setFile({ at, match: failureOf(res) === "rate_limited" ? "limited" : "failed", name: picked.name, rows }); return; }
    const byHash = new Map(res.data.results.map((row) => [row.emailHash, row.status]));
    const hashOf = new Map(withMail.map((row, index) => [row, hashes[index]!]));
    setFile({ at, match: "done", name: picked.name, rows: rows.map((row) => ({ ...row, status: hashOf.has(row) ? byHash.get(hashOf.get(row)!) ?? "unregistered" : null })) });
  };
  const exportCsv = () => {
    if (!file) return;
    const body = [[t("imColName"), t("imColMail"), t("imColResult")], ...file.rows.map((row) => [row.name, row.email, file.match !== "done" || !row.status ? t("imPending") : row.status === "applied" ? t("imApplied") : row.status === "registered" ? t("imRowRegistered") : t("imUnregistered")])].map((cells) => cells.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([`﻿${body}`], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${file.name.replace(/\.csv$/iu, "")}-match.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  if (failed) return <div className={`${s.card} ${s.span12} ${s.empty}`} data-host-failure="">{t("loadError")}</div>;
  if (!event) return <div className={`${s.card} ${s.span12} ${s.empty}`} aria-busy="true" />;
  return (
    <>
      <input ref={input} type="file" accept=".csv,text/csv" hidden onChange={(ev) => { void read(ev.target.files?.[0]); ev.target.value = ""; }} />
      <HostImportView event={event} language={language} file={file} origin={origin} onPick={() => input.current?.click()}
        onCopyLink={() => void copy(link)} onCopyText={() => void copy(t("imMessage", { title: event.title, url: link }).replace(/\\n/gu, "\n"))} onExport={exportCsv} />
    </>
  );
}
