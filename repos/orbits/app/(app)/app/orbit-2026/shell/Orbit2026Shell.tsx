"use client";

import { signOut, useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { readInboxUnreadCounts } from "../../inbox/relationship-inbox-panel";
import { useOrbitLanguage } from "../../orbit-language-context";
import { getOrbitThemePreference, setOrbitThemePreference, type OrbitThemePreference } from "../../orbit-theme";
import { pickCopy } from "../copy/types";
import { shellCopy } from "../copy/shell";
import { Avatar, Button, Icon, Kbd, Orbit2026Scope, Popover, Segmented, ToastProvider, useStandardCopy } from "../ui";
import { CommandPalette, useCommandPaletteShortcut } from "./CommandPalette";
import { InboxEventBridge } from "./inbox-bridge";
import { SHELL_NAV, shellAppliesTo, shellNavKeyFor, shellShowsRail, type ShellNavKey } from "./shell-routes";
import { ShellSlotsProvider, useShellSlots } from "./slots";
import styles from "./shell.module.css";

// R07 Orbit2026Shell (RD-02 / RD-19): the one frame of every signed-in page, mounted
// by app/(app)/app/layout.tsx. Left rail (84; 72 icons-only under 1280; a bottom
// capsule under 768), the main header from the page's slots, an optional right
// rail (≥1280), ⌘K. The shell's parts are new-scope islands next to the page
// content — the old pages keep their own [data-orbit-real-page] scope, siblings,
// never nested (RD-18).
export function Orbit2026Shell({ language, signedIn, children }: { language: OrbitLanguage; signedIn: boolean; children: ReactNode }) {
  const pathname = usePathname() ?? "";
  if (!shellAppliesTo(pathname, signedIn)) return <>{children}</>;
  return (
    <ShellSlotsProvider>
      <ShellFrame language={language} pathname={pathname}>{children}</ShellFrame>
    </ShellSlotsProvider>
  );
}

function ShellFrame({ language, pathname, children }: { language: OrbitLanguage; pathname: string; children: ReactNode }) {
  const slots = useShellSlots();
  const [paletteOpen, setPaletteOpen] = useState(false);
  useCommandPaletteShortcut(() => setPaletteOpen(true));
  const rail = shellShowsRail(pathname) && slots.rightRail !== false && slots.rightRail !== undefined;
  const active = shellNavKeyFor(pathname);
  const hasHeader = Boolean(slots.title || slots.left || slots.right || slots.demoPill);
  return (
    <div className={styles.frame} data-orbit-2026-shell="" data-rail={rail ? "true" : "false"}>
      <Orbit2026Scope language={language} className={styles.sideScope}>
        <ShellSidebar active={active} onOpenPalette={() => setPaletteOpen(true)} />
      </Orbit2026Scope>
      <div className={styles.main}>
        <Orbit2026Scope language={language} className={styles.headScope}>
          <ToastProvider>
            {hasHeader ? (
              <header className={styles.mainhead} data-orbit-2026-mainhead="">
                <div className={styles.headSide}>{slots.left}</div>
                <div className={styles.headTitle}>
                  {slots.title ? <h1 className={styles.title}>{slots.title}</h1> : null}
                  {slots.subtitle ? <small className={styles.subtitle}>{slots.subtitle}</small> : null}
                </div>
                <div className={`${styles.headSide} ${styles.headRight}`}>{slots.demoPill}{slots.right}</div>
              </header>
            ) : null}
            <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
            <InboxEventBridge />
          </ToastProvider>
        </Orbit2026Scope>
        <div className={styles.content} data-orbit-2026-content="">{children}</div>
      </div>
      {rail ? (
        <Orbit2026Scope language={language} as="div" className={styles.railScope}>
          <aside className={styles.rail} aria-label={pickCopy(shellCopy.railNextTitle, language)}>{slots.rightRail === true ? <DefaultRail onOpenPalette={() => setPaletteOpen(true)} /> : slots.rightRail}</aside>
        </Orbit2026Scope>
      ) : null}
      <Orbit2026Scope language={language} className={styles.bottomScope}>
        <ShellBottomBar active={active} />
      </Orbit2026Scope>
    </div>
  );
}

function useInboxDot(language: OrbitLanguage, pathname: string): boolean {
  // One unread read when the shell mounts and when the inbox page is left (the
  // old top bar read once per page; the shell lives across pages, so it reads
  // no more often). The inbox page itself keeps its 15-second refresh.
  const [dot, setDot] = useState(false);
  const onInbox = pathname.startsWith("/app/inbox");
  useEffect(() => {
    if (onInbox) return;
    let live = true;
    readInboxUnreadCounts(language).then((counts) => { if (live) setDot(counts.threads > 0 || counts.alerts > 0); }).catch(() => undefined);
    return () => { live = false; };
  }, [language, onInbox]);
  return dot && !onInbox;
}

function ShellSidebar({ active, onOpenPalette }: { active: ShellNavKey | null; onOpenPalette: () => void }) {
  const copy = useStandardCopy();
  const { language } = useOrbitLanguage();
  const pathname = usePathname() ?? "";
  const dot = useInboxDot(language, pathname);
  return (
    <nav className={styles.side} aria-label={copy.nav.main}>
      <a className={styles.logo} href="/app/home" aria-label="Orbit">O</a>
      {SHELL_NAV.map((item) => {
        const label = copy.nav[item.key];
        return (
          <a key={item.key} href={item.href} className={`${styles.item} ${active === item.key ? styles.itemOn : ""}`} aria-current={active === item.key ? "page" : undefined} title={label}>
            <span className={styles.itemIcon}><Icon name={item.icon} size={21} />{item.key === "inbox" && dot ? <i className={styles.dot} aria-hidden /> : null}</span>
            <span className={styles.itemLabel}>{label}</span>
          </a>
        );
      })}
      <span className={styles.spacer} />
      <button type="button" className={`btn ${styles.item}`} onClick={onOpenPalette} title={copy.nav.askIorbit}>
        <span className={styles.itemIcon}><Icon name="search" size={21} /></span>
        <span className={styles.itemLabel}><Kbd>⌘K</Kbd></span>
      </button>
      <a href="/app/events/center" className={`${styles.item} ${active === "host" ? styles.itemOn : ""}`} aria-current={active === "host" ? "page" : undefined} title={copy.nav.host}>
        <span className={styles.itemIcon}><Icon name="flag" size={21} /></span>
        <span className={styles.itemLabel}>{copy.nav.host}</span>
      </a>
      <a href="/app/settings" className={`${styles.item} ${active === "settings" ? styles.itemOn : ""}`} aria-current={active === "settings" ? "page" : undefined} title={copy.nav.settings}>
        <span className={styles.itemIcon}><Icon name="settings" size={21} /></span>
        <span className={styles.itemLabel}>{copy.nav.settings}</span>
      </a>
      <AccountMenu active={active === "me"} />
    </nav>
  );
}

// The avatar menu: マイページ, language (moved from the old top bar), appearance
// (自動 / ライト / ダーク, RD-05) and sign out.
function AccountMenu({ active }: { active: boolean }) {
  const copy = useStandardCopy();
  const { language, setLanguage } = useOrbitLanguage();
  const session = useSession();
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<OrbitThemePreference>("system");
  useEffect(() => { if (open) setTheme(getOrbitThemePreference()); }, [open]);
  const name = session.data?.user?.name?.trim() || session.data?.user?.email?.trim() || copy.nav.me;
  const t = (entry: (typeof shellCopy)[keyof typeof shellCopy]) => pickCopy(entry, language);
  return (
    <>
      <button ref={anchor} type="button" className={`btn ${styles.avatarButton} ${active ? styles.itemOn : ""}`} aria-haspopup="dialog" aria-expanded={open} aria-label={t(shellCopy.account)} onClick={() => setOpen(!open)}>
        <Avatar name={name} />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchor={anchor} label={t(shellCopy.account)} width={340}>
        <div className={styles.menu}>
          <a className={styles.menuRow} href="/app/profile"><Icon name="user" size={20} />{copy.nav.me}</a>
          <div className={styles.menuGroup}>
            <span className={styles.menuLabel}>{t(shellCopy.language)}</span>
            <Segmented<OrbitLanguage> wide label={t(shellCopy.language)} value={language} onChange={setLanguage} segments={[{ key: "ja", label: t(shellCopy.languageJa) }, { key: "zh", label: t(shellCopy.languageZh) }, { key: "en", label: "English" }]} />
          </div>
          <div className={styles.menuGroup}>
            <span className={styles.menuLabel}>{t(shellCopy.appearance)}</span>
            <Segmented<OrbitThemePreference> wide label={t(shellCopy.appearance)} value={theme} onChange={(next) => { setTheme(next); setOrbitThemePreference(next); }}
              segments={[{ key: "system", label: t(shellCopy.themeSystem) }, { key: "light", label: t(shellCopy.themeLight) }, { key: "dark", label: t(shellCopy.themeDark) }]} />
          </div>
          <Button label={t(shellCopy.signOut)} variant="dangerGhost" icon="out" block onClick={() => void signOut({ callbackUrl: "/app" })} />
        </div>
      </Popover>
    </>
  );
}

// Under 768 the left rail becomes a bottom capsule with the five main tabs (b8).
function ShellBottomBar({ active }: { active: ShellNavKey | null }) {
  const copy = useStandardCopy();
  return (
    <nav className={styles.bottom} aria-label={copy.nav.main}>
      {SHELL_NAV.filter((item) => item.key !== "inbox").map((item) => (
        <a key={item.key} href={item.href} className={`${styles.bottomItem} ${active === item.key ? styles.bottomOn : ""}`} aria-current={active === item.key ? "page" : undefined}>
          <Icon name={item.icon} size={21} />
          <span>{copy.nav[item.key]}</span>
        </a>
      ))}
    </nav>
  );
}

/** The skeleton rail (web.html:409-422): 次の一手 and 最近の会話 empty for now, and the ⌘K entry. */
export function DefaultRail({ onOpenPalette }: { onOpenPalette?: () => void }) {
  const copy = useStandardCopy();
  const { language } = useOrbitLanguage();
  return (
    <div className={styles.railBody}>
      <h2 className={styles.railTitle}>{pickCopy(shellCopy.railNextTitle, language)}</h2>
      <p className={styles.railEmpty}>{pickCopy(shellCopy.railNextEmpty, language)}</p>
      <h2 className={styles.railTitle}>{pickCopy(shellCopy.railRecentTitle, language)}</h2>
      <p className={styles.railEmpty}>{pickCopy(shellCopy.railRecentEmpty, language)}</p>
      <button type="button" className={`btn ${styles.railAsk}`} onClick={onOpenPalette ?? (() => window.dispatchEvent(new CustomEvent("orbit:open-palette")))}>
        <Icon name="sparkle" size={16} />
        <span>{copy.nav.askIorbit}</span>
        <Kbd>⌘K</Kbd>
      </button>
    </div>
  );
}
