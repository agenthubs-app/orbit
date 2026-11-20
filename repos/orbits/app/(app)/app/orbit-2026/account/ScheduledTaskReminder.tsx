"use client";

/**
 * agent-design AG16 (approved visual draft 16-1 to 16-3; D16-1, D16-3) on the web:
 *   - `ReminderBlock`: 「有新结果时提醒我」 on a task's page — one switch for the phone and the browser, flipped here it
 *     takes effect at once (no card). With the switch off nothing about devices is shown and the browser is asked nothing.
 *   - `BrowserReminderLine`: with the switch on, whether this browser will show the reminder (not asked yet, allowed,
 *     refused, allowed then switched off in the system — found out only when a reminder could not be sent). The
 *     browser's own prompt appears only after 「允许这个浏览器通知」 is pressed (enableWebPush), never on opening a page.
 *   - Under a confirmed card that turned a reminder on (16-2), the same line with 「已打开。」 in front, and only when this
 *     browser will not show it yet.
 * A deployment without browser reminders, or a browser that cannot show them, gets no browser line at all.
 */
import { useEffect, useState } from "react";

import { refusedRunOf } from "../../../../../shared/compute/agent-reminder";
import type { AgentScheduledTaskContract, AgentScheduledTaskRunContract } from "../../../../../shared/contract/agent-v1";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { lastAnswer, rememberAnswer } from "../../orbit-last-answer";
import { Toggle, useToast } from "../ui";
import { setScheduledTaskPush } from "./scheduled-tasks-client";
import { scheduledTaskCopy } from "./scheduled-tasks-copy";
import { browserWebPush, disableWebPush, enableWebPush, readWebPushState, syncWebPush, webPushDeviceId, type WebPushBrowser, type WebPushState } from "./web-push-client";
import s from "./ScheduledTasks.module.css";

const STATE_KEY = "settings:web-push-state";
/** States this browser has nothing to say in: no line at all. */
const SILENT: readonly WebPushState[] = ["unsupported", "unavailable"];

export function ReminderBlock({ task, runs, language, onChanged, browser }: { task: AgentScheduledTaskContract; runs: readonly AgentScheduledTaskRunContract[]; language: OrbitLanguage; onChanged(): void; browser?: WebPushBrowser | null }) {
  const t = scheduledTaskCopy(language);
  const toast = useToast();
  const [push, setPush] = useState(task.notify.push);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setPush(task.notify.push); }, [task.notify.push]);
  const flip = async (next: boolean) => {
    if (busy) return;
    setBusy(true);
    setPush(next);
    try {
      await setScheduledTaskPush(task.id, next);
      onChanged();
    } catch {
      setPush(!next);
      toast.error(t("failed"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className={s.reminder} aria-label={t("reminderTitle")} data-orbit-scheduled-reminder={push ? "on" : "off"}>
      <div className={s.reminderHead}>
        <div className={s.reminderMain}>
          <b className={s.reminderTitle}>{t("reminderTitle")}</b>
          <span className={s.reminderSub}>{push ? t("reminderOnSub") : t("reminderOffSub")}</span>
        </div>
        <Toggle checked={push} disabled={busy} label={t("reminderToggle", { title: task.title })} onChange={(next) => void flip(next)} />
      </div>
      {push ? <BrowserReminderLine language={language} runs={runs} browser={browser} /> : null}
    </section>
  );
}

export function BrowserReminderLine({ language, runs = [], afterCard = false, browser }: { language: OrbitLanguage; runs?: readonly AgentScheduledTaskRunContract[]; afterCard?: boolean; browser?: WebPushBrowser | null }) {
  const t = scheduledTaskCopy(language);
  const toast = useToast();
  const [device] = useState(() => (browser !== undefined ? browser : browserWebPush()));
  const [state, setState] = useState<WebPushState | null>(() => lastAnswer<WebPushState>(STATE_KEY) ?? null);
  const [busy, setBusy] = useState(false);
  const [howTo, setHowTo] = useState(false);
  useEffect(() => {
    let alive = true;
    // Reads only: neither asks the browser for anything. On a task's page the server's registration is brought in
    // step with the browser (a permission taken back in the browser's settings).
    (afterCard ? readWebPushState(device) : syncWebPush(device)).then((next) => {
      if (!alive) return;
      setState(next);
      rememberAnswer(STATE_KEY, next);
    }).catch(() => undefined);
    return () => { alive = false; };
  }, [device, afterCard]);
  const act = async (action: (browser: WebPushBrowser | null) => Promise<WebPushState>) => {
    if (busy) return;
    setBusy(true);
    try {
      const next = await action(device);
      setState(next);
      rememberAnswer(STATE_KEY, next);
    } catch {
      toast.error(t("failed"));
    } finally {
      setBusy(false);
    }
  };
  if (!state || SILENT.includes(state)) return null;
  if (afterCard && state === "on") return null;
  const lead = afterCard ? t("turnedOn") : "";
  const allow = <button type="button" className={`btn ${s.devButton}`} disabled={busy} onClick={() => void act(enableWebPush)} data-orbit-web-push-allow>{state === "stopped" ? t("browserAllowAgain") : state === "off" ? t("browserTurnOn") : t("browserAllow")}</button>;
  if (state === "on") {
    return (
      <div className={`${s.dev} ${s.devOk}`} data-orbit-web-push="on">
        <i className={s.devIcon} aria-hidden>✓</i>
        <div className={s.devText}>
          <b>{t("browserOn")}</b>
          <span>{t("browserStopLead")}<button type="button" className={`btn ${s.devLink}`} disabled={busy} onClick={() => void act(disableWebPush)} data-orbit-web-push-stop>{t("browserStop")}</button></span>
        </div>
      </div>
    );
  }
  if (state === "blocked") {
    return (
      <div className={`${s.dev} ${s.devNo}`} data-orbit-web-push="blocked">
        <i className={s.devIcon} aria-hidden>!</i>
        <div className={s.devText}>
          <b>{lead}{t("browserBlocked")}</b>
          <span>{t("browserBlockedBody")}</span>
          <div className={s.devButtons}><button type="button" className={`btn ${s.devButtonLine}`} aria-expanded={howTo} onClick={() => setHowTo(!howTo)}>{t("browserHowTo")}</button></div>
          {howTo ? <ol className={s.devSteps}><li>{t("browserHowToStep1")}</li><li>{t("browserHowToStep2")}</li></ol> : null}
        </div>
      </div>
    );
  }
  if (state === "stopped") {
    const day = refusedRunOf(runs, device ? webPushDeviceId(device, false) : null)?.display?.day ?? null;
    return (
      <div className={`${s.dev} ${s.devNo}`} data-orbit-web-push="stopped">
        <i className={s.devIcon} aria-hidden>!</i>
        <div className={s.devText}>
          <b>{afterCard ? `${lead}${t("turnedOnStopped")}` : t("browserStopped")}</b>
          <span>{day ? t("browserStoppedBody", { day }) : t("browserStoppedBodyPlain")}</span>
          <div className={s.devButtons}>{allow}</div>
        </div>
      </div>
    );
  }
  // not_asked, or allowed in the browser but not taken here (turned off here before).
  return (
    <div className={s.dev} data-orbit-web-push={state}>
      <i className={s.devIcon} aria-hidden>?</i>
      <div className={s.devText}>
        <b>{afterCard ? `${lead}${state === "off" ? t("browserOff") : t("turnedOnNotAsked")}` : state === "off" ? t("browserOff") : t("browserNotAsked")}</b>
        <span>{state === "off" ? t("browserOffBody") : t("browserNotAskedBody")}</span>
        <div className={s.devButtons}>{allow}</div>
      </div>
    </div>
  );
}
