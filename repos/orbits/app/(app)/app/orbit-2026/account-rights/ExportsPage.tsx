"use client";

import { signOutAndForget } from "../../orbit-sign-out";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { AccountExportContract } from "../../../../../shared/contract/account";
import { FRESH, answerFresh, lastAnswer, rememberAnswer } from "../../orbit-last-answer";
import { useOrbitLanguage } from "../../orbit-language-context";
import { AccountLayout } from "../account/AccountLayout";
import { Button, Chip, Icon, MacTile } from "../ui";
import { accountRightsApi, AccountRightsApiError } from "./api";
import { rightsCopy } from "./copy";
import s from "./rights.module.css";

type Choice = "contacts" | "notes" | "plans" | "events";
const choices: Choice[] = ["contacts", "notes", "plans", "events"];

const HISTORY_KEY = "settings:exports";

export function ExportsPage() {
  const { language } = useOrbitLanguage();
  const t = useMemo(() => rightsCopy(language), [language]);
  const [selected, setSelected] = useState<Choice[]>(["contacts", "notes", "plans"]);
  const [all, setAll] = useState(false);
  const [format, setFormat] = useState<"csv" | "vcard">("csv");
  // The history is a list in the browser read cache: coming back shows it at once and reads only once it is stale.
  const [cached] = useState(() => lastAnswer<AccountExportContract[]>(HISTORY_KEY));
  const [history, setHistory] = useState<AccountExportContract[]>(cached ?? []);
  const [loading, setLoading] = useState(!cached);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const requestKey = useRef<string | null>(null);
  const refresh = useCallback(async () => {
    try { const list = await accountRightsApi.listExports(); setHistory(list); rememberAnswer(HISTORY_KEY, list); setProblem(""); }
    catch { setProblem(t("generalError")); }
    finally { setLoading(false); }
  }, [t]);
  useEffect(() => { if (!(cached && answerFresh(HISTORY_KEY, FRESH.list))) void refresh(); }, [cached, refresh]);
  useEffect(() => {
    if (!history.some(item => item.status === "queued" || item.status === "running")) return;
    // A tab in the background skips its turns; the next one after it comes back reads again.
    const timer = window.setInterval(() => { if (typeof document !== "undefined" && document.visibilityState === "hidden") return; void refresh(); }, 3000);
    return () => window.clearInterval(timer);
  }, [history, refresh]);
  const active = history.some(item => item.status === "queued" || item.status === "running");
  const toggle = (choice: Choice) => {
    requestKey.current = null;
    setAll(false);
    setSelected(current => current.includes(choice) ? current.filter(item => item !== choice) : [...current, choice]);
  };
  const create = async () => {
    if (busy || active || !all && !selected.length) return;
    setBusy(true); setProblem("");
    requestKey.current ??= crypto.randomUUID();
    const scope = all ? ["contacts", "notes", "plans", "tasks", "events"] : selected.flatMap(item => item === "plans" ? ["plans", "tasks"] : [item]);
    try {
      await accountRightsApi.createExport({ scope, mode: all ? "all-json" : "selected", ...(!all ? { contactsFormat: format } : {}), idempotencyKey: requestKey.current });
      requestKey.current = null;
      await refresh();
    } catch (error) {
      const reason = error instanceof AccountRightsApiError ? error.reason : "UNAVAILABLE";
      setProblem(reason === "DAILY_EXPORT_LIMIT" ? t("exportQuota") : reason === "EXPORT_IN_PROGRESS" ? t("exportActive") :
        reason === "RECENT_LOGIN_REQUIRED" ? t("freshLogin") : t("generalError"));
    } finally { setBusy(false); }
  };
  const date = (value: string) => new Intl.DateTimeFormat(language, { timeZone: "Asia/Tokyo", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  // b7 #31 書き出し ① 選択: the 書き出す範囲 card (custom checkboxes, a CSV / vCard segment on 人脈, すべて (JSON)),
  // 形式について and 履歴 on the right. Per-category counts are not shown: there is no count source.
  const rows = [["contacts", "👥", "lav", "contactsSub"], ["notes", "📝", "apricot", "notesSub"], ["plans", "🧭", "pink", "plansSub"], ["events", "🎟️", "teal", "eventsSub"]] as const;
  const day = (value: string) => new Intl.DateTimeFormat(language === "ja" ? "ja-JP" : language === "zh" ? "zh-CN" : "en-GB", { timeZone: "Asia/Tokyo", month: "long", day: "numeric" }).format(new Date(value));
  const scopeLabel = (item: AccountExportContract) => item.mode === "all-json" ? t("exportAll")
    : choices.filter(choice => item.scope.includes(choice)).map(choice => choice === "contacts" && item.contactsFormat ? `${t(choice)}（${item.contactsFormat === "vcard" ? "vCard" : "CSV"}）` : t(choice)).join(" · ");
  return <AccountLayout active="export" title={t("export")} subtitle={t("exportIntro")}>
    <div className={s.stack}>
      <div className={s.leaveGrid}>
        <section className={s.leaveCard}>
          <div className={s.leaveHead}><h2>{t("exportSelected")}</h2><span>{t("selectedCount").replace("{n}", String(all ? 5 : selected.length))}</span></div>
          {rows.map(([choice, emoji, tone, sub]) => <label className={s.xrow} key={choice}>
            <input type="checkbox" className={s.cbxInput} checked={!all && selected.includes(choice)} onChange={() => toggle(choice)} />
            <span className={s.cbx} aria-hidden><Icon name="check" size={16} /></span>
            <MacTile emoji={emoji} tone={tone} size="sm" /><div><b>{t(choice)}</b><span>{t(sub)}</span></div>
            {choice === "contacts" ? <span className={s.seg} role="radiogroup" aria-label={t("contactsFormat")}>
              {(["csv", "vcard"] as const).map(value => <button key={value} type="button" role="radio" aria-checked={format === value} className={`btn ${format === value ? s.segOn : ""}`} disabled={all || !selected.includes("contacts")} onClick={event => { event.preventDefault(); setFormat(value); }}>{value === "csv" ? "CSV" : "vCard"}</button>)}
            </span> : null}
          </label>)}
          <label className={s.xrow}>
            <input type="checkbox" className={s.cbxInput} checked={all} onChange={event => { requestKey.current = null; setAll(event.target.checked); }} />
            <span className={s.cbx} aria-hidden><Icon name="check" size={16} /></span>
            <MacTile emoji="🗂️" tone="blue" size="sm" /><div><b>{t("exportAll")}</b><span>{t("allSub")}</span></div>
          </label>
          <div className={s.exportFoot}><span>{t("readyNotice")}</span><Button label={t("startExport")} variant="primary" loading={busy} disabled={active || !all && !selected.length} onClick={() => void create()} /></div>
        </section>
        <div className={s.leaveSide}>
          <section className={s.sideCard}><h2>{t("formatTitle")}</h2><p>{t("formatCsv")}<br />{t("formatVcard")}<br />{t("formatJson")}</p></section>
          <section className={s.sideCard}><div className={s.leaveHead}><h2>{t("exportHistory")}</h2><button type="button" className={`btn ${s.refresh}`} aria-label={t("retry")} onClick={() => void refresh()}><Icon name="refresh" size={16} /></button></div>
            {loading ? <p className={s.note}>{t("running")}</p> : history.length === 0 ? <p className={s.note}>{t("noExports")}</p> :
              <table className={s.historyTable}><tbody>{history.map(item => <tr key={item.id}>
                <td className={s.lblCell}>{day(item.requestedAt)}</td>
                <td><b>{scopeLabel(item)}</b>
                  {item.status === "queued" || item.status === "running" ? <span className={s.lblCell}>{t("progress").replace("{done}", String(item.completedItems ?? 0)).replace("{total}", String(item.totalItems ?? item.scope.length))}</span> : null}
                  {item.status === "ready" && item.expiresAt ? <span className={s.lblCell}>{t("availableUntil").replace("{date}", date(item.expiresAt))}</span> : null}</td>
                <td className={s.statusCell}>{item.status === "ready" && item.downloadUrl ? <a className={s.download} href={item.downloadUrl}>{t("download")}</a> : <Chip label={t(item.status)} tone={item.status === "failed" ? "coral" : "neutral"} />}</td>
              </tr>)}</tbody></table>}
          </section>
        </div>
      </div>
      {problem ? <p role="alert" className={s.error}>{problem} {problem === t("freshLogin") ? <Button label={t("signInAgain")} variant="ghost" size="sm" className={s.inlineAction} onClick={() => void signOutAndForget("/app/account/login?next=/app/settings/exports")} /> : null}</p> : null}
    </div>
  </AccountLayout>;
}
