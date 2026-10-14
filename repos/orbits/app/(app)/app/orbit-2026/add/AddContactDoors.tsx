"use client";

import Link from "next/link";

import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { addDoorsCopy as d } from "../copy/add";
import { IconButton, Kbd, MacTile, Modal, useStandardCopy } from "../ui";
import { DensityDots, translator } from "./add-parts";
import styles from "./add.module.css";

/**
 * 招待コード door (DESIGN §2.1, §9 #4: doors that are not live are hidden, not greyed out). R15
 * opened it: it opens the invite dialog (`?add=invite`) when the page passes `onInvite`.
 */
export const ADD_INVITE_DOOR_ENABLED = true;

/**
 * その他 (b12 W-R12-01: 連絡先（vCard）and LinkedIn — the dialog has five doors, D21): the R16
 * import pages. CSV and イベントから are on the import door page (W-R16-10).
 */
export const ADD_OTHER_DOORS = [
  { key: "contacts", emoji: "📱", tone: "blue", title: d.otherContacts, body: d.otherContactsBody, href: "/app/contacts/new/import?method=contacts" },
  { key: "linkedin", emoji: "🔗", tone: "teal", title: d.otherLinkedIn, body: d.otherLinkedInBody, href: "/app/contacts/new/import?method=linkedin" },
] as const;

export const ADD_SCAN_HREF = "/app/contacts/new/scan";

/**
 * The doors of 人脈を追加 (b12 W-R12-01; App app.html 人脈「＋」): おすすめ 名刺 / 招待コード /
 * 手入力 in three columns, その他 連絡先 / LinkedIn, the 情報の濃さ legend. Exported for R11, which
 * opens the same dialog from 人脈 ＋ (DESIGN §8). `href` maps a path (keeps `?lang=`); `onManual`
 * opens the 手入力 drawer; `onInvite` the 招待コード dialog (R15).
 */
export function AddContactDoors({ language, href = (path) => path, onManual, onInvite }: {
  language: OrbitLanguage;
  href?: (path: string) => string;
  onManual: () => void;
  onInvite?: () => void;
}) {
  const t = translator(language);
  const head = (emoji: string, tone: "apricot" | "pink" | "lav", density: 1 | 2 | 3) => (
    <span className={styles.doorHead}><MacTile emoji={emoji} tone={tone} /><DensityDots level={density} t={t} /></span>
  );
  const text = (title: string, body: string) => <span className={styles.doorText}><b className={styles.doorTitle}>{title}</b><span className={styles.doorBody}>{body}</span></span>;
  return (
    <div data-add-doors="">
      <p className={styles.doorGroup}>{t(d.mainTitle)}</p>
      <div className={styles.doors}>
        <Link className={`${styles.door} ${styles.rise}`} href={href(ADD_SCAN_HREF)} data-add-door="scan">
          {head("📇", "apricot", 2)}{text(t(d.scanTitle), t(d.scanBody))}
        </Link>
        {ADD_INVITE_DOOR_ENABLED && onInvite ? (
          <button type="button" className={`${styles.door} ${styles.rise}`} onClick={onInvite} data-add-door="invite">
            {head("🤝", "pink", 3)}{text(t(d.inviteTitle), t(d.inviteBody))}
          </button>
        ) : null}
        <button type="button" className={`${styles.door} ${styles.rise}`} onClick={onManual} data-add-door="manual">
          {head("✍️", "lav", 1)}{text(t(d.manualTitle), t(d.manualBody))}
        </button>
      </div>
      <p className={styles.doorGroup}>{t(d.otherTitle)}</p>
      <div className={styles.others}>
        {ADD_OTHER_DOORS.map((door) => (
          <Link key={door.key} className={`${styles.other} ${styles.rise}`} href={href(door.href)} data-add-door={door.key}>
            <MacTile emoji={door.emoji} size="sm" tone={door.tone} />
            <span className={styles.otherText}>{t(door.title)}<small>{t(door.body)}</small></span>
          </Link>
        ))}
      </div>
      <div className={styles.legend} aria-hidden>
        <DensityDots level={1} t={t} />{t(d.density1)} <DensityDots level={2} t={t} />{t(d.density2)} <DensityDots level={3} t={t} />{t(d.density3)}
      </div>
    </div>
  );
}

/** b12 W-R12-01: 人脈を追加 as a 560 dialog over 人脈 (D20). R11 opens it from 人脈「人脈を追加」. */
export function AddContactDialog({ open, onClose, language, href, onManual, onInvite }: {
  open: boolean;
  onClose: () => void;
  language: OrbitLanguage;
  href?: (path: string) => string;
  onManual: () => void;
  onInvite?: () => void;
}) {
  const t = translator(language);
  const standard = useStandardCopy();
  return (
    <Modal open={open} onClose={onClose} title={t(d.pageTitle)} size={560} header={(
      <div className={styles.dialogHead}>
        <div><b className={styles.dialogTitle}>{t(d.pageTitle)}</b><p className={styles.dialogSub}>{t(d.pageSubtitle)}</p></div>
        <IconButton icon="x" label={standard.action.close} onClick={onClose} />
      </div>
    )}>
      <AddContactDoors language={language} href={href} onManual={onManual} onInvite={onInvite} />
      <div className={styles.dialogFoot}><span className={styles.escHint}><Kbd>Esc</Kbd>{t(d.escClose)}</span></div>
    </Modal>
  );
}
