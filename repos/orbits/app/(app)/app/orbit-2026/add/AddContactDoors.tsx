"use client";

import Link from "next/link";

import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { addDoorsCopy as d } from "../copy/add";
import { Icon, MacTile } from "../ui";
import { DensityDots, translator } from "./add-parts";
import styles from "./add.module.css";

/**
 * 招待コード door (DESIGN §2.1, §9 #4: doors that are not live are hidden, not greyed out). R15
 * opened it: it opens the invite dialog (`?add=invite`) when the page passes `onInvite`.
 */
export const ADD_INVITE_DOOR_ENABLED = true;

/**
 * その他 (DESIGN §2.7): until R16 builds the new import pages these four go to the old
 * import screen (`/app/contacts/new?method=…`, still rendered by NetworkImport); R16
 * points them at `/app/contacts/new/import…`.
 */
export const ADD_OTHER_DOORS = [
  { key: "contacts", emoji: "📱", title: d.otherContacts, body: d.otherContactsBody, href: "/app/contacts/new?method=contacts", density: 1 },
  { key: "linkedin", emoji: "🔗", title: d.otherLinkedIn, body: d.otherLinkedInBody, href: "/app/contacts/new?method=csv", density: 1 },
  { key: "csv", emoji: "🗂️", title: d.otherCsv, body: d.otherCsvBody, href: "/app/contacts/new?method=csv", density: 1 },
  { key: "event", emoji: "🎟️", title: d.otherEvent, body: d.otherEventBody, href: "/app/contacts/new?method=event", density: 2 },
] as const;

export const ADD_SCAN_HREF = "/app/contacts/new/scan";

/**
 * The doors of 人脈を追加 (b11 A1 / web.html 人脈). Exported for R11, which opens the same
 * content as a dialog from 人脈 ＋ (DESIGN §8). `href` maps a path (keeps `?lang=`);
 * `onManual` opens the 手入力 drawer; `onInvite` is for R15.
 */
export function AddContactDoors({ language, href = (path) => path, onManual, onInvite }: {
  language: OrbitLanguage;
  href?: (path: string) => string;
  onManual: () => void;
  onInvite?: () => void;
}) {
  const t = translator(language);
  return (
    <div className={styles.stack} data-add-doors="">
      <h2 className={styles.sectionTitle}>{t(d.mainTitle)}</h2>
      <div className={styles.doors}>
        <Link className={`${styles.door} ${styles.rise}`} href={href(ADD_SCAN_HREF)} data-add-door="scan">
          <MacTile emoji="📇" tone="lav" />
          <span className={styles.doorTitle}>{t(d.scanTitle)}</span>
          <span className={styles.doorBody}>{t(d.scanBody)}</span>
          <span className={styles.doorFoot}><DensityDots level={2} t={t} /><Icon name="right" size={16} /></span>
        </Link>
        {ADD_INVITE_DOOR_ENABLED && onInvite ? (
          <button type="button" className={`btn ${styles.door} ${styles.rise}`} onClick={onInvite} data-add-door="invite">
            <MacTile emoji="🤝" tone="pink" />
            <span className={styles.doorTitle}>{t(d.inviteTitle)}</span>
            <span className={styles.doorBody}>{t(d.inviteBody)}</span>
            <span className={styles.doorFoot}><DensityDots level={3} t={t} /><Icon name="right" size={16} /></span>
          </button>
        ) : null}
        <button type="button" className={`btn ${styles.door} ${styles.rise}`} onClick={onManual} data-add-door="manual">
          <MacTile emoji="✍️" tone="apricot" />
          <span className={styles.doorTitle}>{t(d.manualTitle)}</span>
          <span className={styles.doorBody}>{t(d.manualBody)}</span>
          <span className={styles.doorFoot}><DensityDots level={1} t={t} /><Icon name="right" size={16} /></span>
        </button>
      </div>
      <h2 className={styles.sectionTitle}>{t(d.otherTitle)}</h2>
      <div className={styles.others}>
        {ADD_OTHER_DOORS.map((door) => (
          <Link key={door.key} className={`${styles.other} ${styles.rise}`} href={href(door.href)} data-add-door={door.key}>
            <MacTile emoji={door.emoji} size="sm" tone="blue" />
            <span className={styles.grow}>
              <b>{t(door.title)}</b>
              <span className={styles.label}>{t(door.body)}</span>
            </span>
            <DensityDots level={door.density} t={t} />
          </Link>
        ))}
      </div>
    </div>
  );
}
