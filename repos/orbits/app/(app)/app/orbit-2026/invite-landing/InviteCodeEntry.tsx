"use client";

import { useState } from "react";

import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { formatInviteCodeInput, inviteCodeInputHint, normalizeInviteCode, type InviteCodeInputHint } from "../../../../../shared/compute/invite-code-format";
import { inviteLandingCopy as l } from "../copy/invite";
import { pickCopy, type OrbitCopyEntry } from "../copy/types";
import { Button, Card, Icon, Orbit2026Scope, TextField } from "../ui";
import styles from "./invite-landing.module.css";

const HINT_COPY: Readonly<Record<Exclude<InviteCodeInputHint, "ok">, OrbitCopyEntry>> = {
  invalid_char: l.hintInvalidChar,
  too_short: l.hintTooShort,
  too_long: l.hintTooLong,
};

/**
 * `/i` without a code (DESIGN §2.5 第 7 条): type the 8 characters — upper-cased, the hyphen added after
 * the 4th as you type; characters outside the code alphabet are flagged at once, a short code only on
 * 開く. Opening goes to `/i/<code>` (the same page as a link). An old relationship-invite link lands here with
 * one line saying it no longer works.
 */
export function InviteCodeEntry({ language, legacyLink = false, navigate = (href) => window.location.assign(href) }: {
  language: OrbitLanguage;
  /** Arrived from an old `/app/invitations/<token>` link (redirected to `/i?expired=legacy`, m3). */
  legacyLink?: boolean;
  navigate?: (href: string) => void;
}) {
  const t = (entry: OrbitCopyEntry) => pickCopy(entry, language);
  const [value, setValue] = useState("");
  const [tried, setTried] = useState(false);
  const hint = inviteCodeInputHint(value);
  const shown = hint === "invalid_char" || (tried && hint !== "ok") ? t(HINT_COPY[hint as Exclude<InviteCodeInputHint, "ok">]) : undefined;
  const open = () => {
    setTried(true);
    const code = normalizeInviteCode(value);
    if (code) navigate(`/i/${formatInviteCodeInput(code)}`);
  };
  return (
    <Orbit2026Scope language={language} as="main" className={styles.page}>
      <div className={styles.column} data-invite-landing="entry">
        <header className={styles.head}>
          <span className={styles.appIcon} aria-hidden>O</span>
          <span className={styles.headText}><b className={styles.brand}>{t(l.brand)}</b><span className={styles.lbl}>{t(l.headSub)}</span></span>
        </header>
        <form className={`${styles.stack} ${styles.fade}`} onSubmit={(event) => { event.preventDefault(); open(); }} data-invite-entry="">
          <div className={styles.titleBlock}>
            <h1 className={styles.title}>{t(l.manualTitle)}</h1>
            <p className={styles.body}>{t(l.manualSub)}</p>
          </div>
          {legacyLink ? <p className={styles.legacy} data-invite-legacy=""><Icon name="info" size={16} /><span>{t(l.legacyLink)}</span></p> : null}
          <Card>
            <TextField label={t(l.manualField)} value={value} placeholder="XXXX-XXXX" autoComplete="off" autoCapitalize="characters" spellCheck={false} inputMode="text"
              maxLength={16} error={shown} onChange={(event) => setValue(formatInviteCodeInput(event.target.value))} data-invite-entry-field="" />
          </Card>
          <Button type="submit" label={t(l.manualOpen)} variant="primary" block data-invite-entry-open="" />
        </form>
      </div>
    </Orbit2026Scope>
  );
}
