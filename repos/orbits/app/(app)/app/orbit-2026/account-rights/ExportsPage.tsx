"use client";

import { signOut } from "next-auth/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { AccountExportContract } from "../../../../../shared/contract/account";
import { useOrbitLanguage } from "../../orbit-language-context";
import { AccountLayout } from "../account/AccountLayout";
import { Button, Card } from "../ui";
import { accountRightsApi, AccountRightsApiError } from "./api";
import { rightsCopy } from "./copy";
import s from "./rights.module.css";

type Choice = "contacts" | "notes" | "plans" | "events";
const choices: Choice[] = ["contacts", "notes", "plans", "events"];

export function ExportsPage() {
  const { language } = useOrbitLanguage();
  const t = useMemo(() => rightsCopy(language), [language]);
  const [selected, setSelected] = useState<Choice[]>(["contacts", "notes", "plans"]);
  const [all, setAll] = useState(false);
  const [format, setFormat] = useState<"csv" | "vcard">("csv");
  const [history, setHistory] = useState<AccountExportContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const requestKey = useRef<string | null>(null);
  const refresh = useCallback(async () => {
    try { setHistory(await accountRightsApi.listExports()); setProblem(""); }
    catch { setProblem(t("generalError")); }
    finally { setLoading(false); }
  }, [t]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!history.some(item => item.status === "queued" || item.status === "running")) return;
    const timer = window.setInterval(() => void refresh(), 3000);
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
  return <AccountLayout active="export" title={t("export")} subtitle={t("exportIntro")} largeTitle>
    <div className={s.stack}>
      <Card title={t("exportSelected")}>
        <div className={s.selection}>
          {choices.map(choice => <label className={s.option} key={choice}>
            <input type="checkbox" checked={!all && selected.includes(choice)} onChange={() => toggle(choice)} />
            <span>{t(choice)}</span>
          </label>)}
          <label className={`${s.option} ${s.allOption}`}>
            <input type="checkbox" checked={all} onChange={event => { requestKey.current = null; setAll(event.target.checked); }} />
            <span>{t("exportAll")}</span>
          </label>
        </div>
        {!all && selected.includes("contacts") ? <fieldset className={s.formats}><legend>{t("contactsFormat")}</legend>
          <label><input type="radio" name="contacts-format" checked={format === "csv"} onChange={() => setFormat("csv")} /> CSV</label>
          <label><input type="radio" name="contacts-format" checked={format === "vcard"} onChange={() => setFormat("vcard")} /> vCard</label>
        </fieldset> : null}
        <p className={s.note}>{t("exportLimit")}</p>
        <div className={s.actions}><Button label={t("startExport")} variant="primary" loading={busy} disabled={active || !all && !selected.length} onClick={() => void create()} /></div>
      </Card>
      {problem ? <p role="alert" className={s.error}>{problem} {problem === t("freshLogin") ? <Button label={t("signInAgain")} variant="ghost" size="sm" className={s.inlineAction} onClick={() => void signOut({ callbackUrl: "/app/account/login?next=/app/settings/exports" })} /> : null}</p> : null}
      <Card title={t("exportHistory")} trailing={<Button label={t("retry")} size="sm" variant="ghost" onClick={() => void refresh()} />}>
        {loading ? <p className={s.note}>{t("running")}</p> : history.length === 0 ? <p className={s.note}>{t("noExports")}</p> :
          <ul className={s.history}>{history.map(item => <li className={s.historyItem} key={item.id}>
            <div><strong>{t(item.status)}</strong><span className={s.meta}>{date(item.requestedAt)}</span>
              {item.status === "queued" || item.status === "running" ? <p className={s.note}>{t("progress").replace("{done}", String(item.completedItems ?? 0)).replace("{total}", String(item.totalItems ?? item.scope.length))}</p> : null}
              {item.status === "ready" && item.expiresAt ? <p className={s.note}>{t("availableUntil").replace("{date}", date(item.expiresAt))}</p> : null}
            </div>
            {item.status === "ready" && item.downloadUrl ? <a className={s.download} href={item.downloadUrl}>{t("download")}</a> : null}
          </li>)}</ul>}
      </Card>
    </div>
  </AccountLayout>;
}
