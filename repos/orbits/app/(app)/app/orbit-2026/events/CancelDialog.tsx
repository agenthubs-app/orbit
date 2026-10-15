"use client";

// R27 参加の取り消し（Web 確認，b12 #374 = App b3 #42 的底部弹层 → 01-system ② 居中确认框 480）：后果 3 行 +「参加を続ける」/ 珊瑚「参加を取り消す」。
import type { EventOverviewResponse } from "../../../../../shared/contract/event-overview";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { Button, Icon, Kbd, Modal } from "../ui";
import type { JourneyT } from "./DiscoverTab";
import { WEEK, parts } from "./EventDetail";
import c from "./cancel.module.css";
import styles from "./events.module.css";

/** 「CFO Night Tokyo vol.18」→「CFO Night Tokyo」（标题去掉期号）。 */
const shortTitle = (title: string) => title.replace(/\s*vol\.?\s*\d+\s*$/i, "").trim() || title;

export function CancelDialog({ open, event, language, t, busy, onKeep, onCancel }: { open: boolean; event: EventOverviewResponse; language: OrbitLanguage; t: JourneyT; busy: boolean; onKeep: () => void; onCancel: () => void }) {
  const p = parts(event.startsAt);
  const when = p ? t("dateWeekTime", { d: p.day, hm: p.hm, m: p.month, wd: WEEK[language][p.wd] }) : "";
  const wanted = event.attendees.filter((item) => item.wanted).length;
  const title = t("cancelTitle", { title: shortTitle(event.title) });
  return (
    <Modal open={open} onClose={onKeep} title={title} size={480}
      header={(
        <div className={`${styles.row} ${c.head}`} data-join-cancel="">
          <div className={c.dic}><Icon name="alert" size={20} /></div>
          <div className={c.body}>
            <b className={c.title}>{title}</b>
            <div className={`${styles.lbl} ${c.when}`}>{[when, event.venue].filter(Boolean).join(" · ")}</div>
            <div className={c.list}>
              <div className={`${styles.row} ${c.item}`}><Icon name="bell" size={16} /><span>{t("cancelNotify")}</span></div>
              {event.priceYen ? <div className={`${styles.row} ${c.item}`}><Icon name="ticket" size={16} /><span>{t("cancelFee", { fee: event.priceYen.toLocaleString("ja-JP") })}</span></div> : null}
              <div className={`${styles.row} ${c.item}`}><Icon name="users" size={16} /><span>{t("cancelKeep", { n: wanted })}</span></div>
            </div>
          </div>
        </div>
      )}
      hint={<><Kbd>Esc</Kbd>{t("escDismiss")}</>}
      actions={<><Button label={t("cancelKeepGoing")} variant="secondary" onClick={onKeep} /><Button label={t("cancelDo")} variant="danger" loading={busy} onClick={onCancel} /></>}
    />
  );
}
