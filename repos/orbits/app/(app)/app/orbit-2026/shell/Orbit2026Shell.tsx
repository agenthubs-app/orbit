"use client";

import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { readInboxUnreadCounts } from "../../inbox/relationship-inbox-panel";
import { useOrbitLanguage } from "../../orbit-language-context";
import { getOrbitThemePreference, setOrbitThemePreference, type OrbitThemePreference } from "../../orbit-theme";
import { pickCopy } from "../copy/types";
import { shellCopy } from "../copy/shell";
import { Avatar, Button, Drawer, Icon, IconButton, Kbd, Orbit2026Scope, Popover, Segmented, ToastProvider, useStandardCopy } from "../ui";
import { CommandPalette, useCommandPaletteShortcut } from "./CommandPalette";
import { InboxEventBridge } from "./inbox-bridge";
import { SHELL_NAV, shellAppliesTo, shellNavKeyFor, shellShowsRail, type ShellNavKey } from "./shell-routes";
import { ShellSlotsProvider, useShellSlots } from "./slots";
import styles from "./shell.module.css";

// R07 Orbit2026Shell (RD-02 / RD-19): the one frame of every signed-in page, mounted
// by app/(app)/app/layout.tsx. Left rail (84; 72 icons-only under 1280; under 768
// a top bar — search, 受信箱, avatar — and a bottom capsule with the five tabs), the
// main header from the page's slots, an optional right rail (≥1280 a 360 column,
// below that a header button opening it as a 380 drawer), ⌘K. The shell's parts
// are new-scope islands next to the page content — the old pages keep their own
// [data-orbit-real-page] scope, siblings, never nested (RD-18). Navigation uses
// next/link, so the shell stays mounted across pages.
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
  const [railDrawer, setRailDrawer] = useState(false);
  const openPalette = () => setPaletteOpen(true);
  useCommandPaletteShortcut(openPalette);
  const rail = shellShowsRail(pathname) && slots.rightRail !== false && slots.rightRail !== undefined;
  const railContent = slots.rightRail === true ? <DefaultRail onOpenPalette={openPalette} /> : slots.rightRail;
  const active = shellNavKeyFor(pathname);
  const dot = useInboxDot(language, pathname);
  const hasHeader = Boolean(slots.title || slots.left || slots.right || slots.demoPill || rail);
  useEffect(() => { setRailDrawer(false); }, [pathname]);
  return (
    <div className={styles.frame} data-orbit-2026-shell="" data-rail={rail ? "true" : "false"}>
      <Orbit2026Scope language={language} className={styles.sideScope}>
        <ShellSidebar active={active} dot={dot} onOpenPalette={openPalette} />
      </Orbit2026Scope>
      <div className={styles.main}>
        <Orbit2026Scope language={language} className={styles.headScope}>
          <ToastProvider>
            <ShellMobileTop active={active} dot={dot} onOpenPalette={openPalette} />
            {hasHeader ? (
              <header className={styles.mainhead} data-orbit-2026-mainhead="">
                <div className={styles.headSide}>{slots.left}</div>
                <div className={styles.headTitle}>
                  {slots.title ? <h1 className={styles.title}>{slots.title}</h1> : null}
                  {slots.subtitle ? <small className={styles.subtitle}>{slots.subtitle}</small> : null}
                </div>
                <div className={`${styles.headSide} ${styles.headRight}`}>
                  {slots.demoPill}{slots.right}
                  {rail ? <span className={styles.railButton}><IconButton icon="list" label={pickCopy(shellCopy.railOpen, language)} soft onClick={() => setRailDrawer(true)} data-orbit-2026-rail-button="" /></span> : null}
                </div>
              </header>
            ) : null}
            <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
            {rail ? <Drawer open={railDrawer} onClose={() => setRailDrawer(false)} title={pickCopy(shellCopy.railNextTitle, language)} size="sm">{railContent}</Drawer> : null}
            <InboxEventBridge />
          </ToastProvider>
        </Orbit2026Scope>
        <div className={styles.content} data-orbit-2026-content="">{children}</div>
      </div>
      {rail ? (
        <Orbit2026Scope language={language} as="div" className={styles.railScope}>
          <aside className={styles.rail} aria-label={pickCopy(shellCopy.railNextTitle, language)}>{railContent}</aside>
        </Orbit2026Scope>
      ) : null}
      <Orbit2026Scope language={language} className={styles.bottomScope}>
        <ShellBottomBar active={active} />
      </Orbit2026Scope>
    </div>
  );
}

/** ⌘ on Apple platforms, Ctrl elsewhere (after mount: the server cannot know). */
function useShortcutLabel(): string {
  const [label, setLabel] = useState("⌘K");
  useEffect(() => {
    const platform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform ?? "";
    if (!/mac|iphone|ipad|ipod/iu.test(platform)) setLabel("Ctrl K");
  }, []);
  return label;
}

function useInboxDot(language: OrbitLanguage, pathname: string): boolean {
  // One unread read when the shell mounts and when the inbox page is left, shared
  // by the rail and the narrow top bar. With next/link the shell stays mounted
  // across pages, so this reads less often than the old top bar (once per page).
  // The inbox page itself keeps its 15-second refresh.
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

function ShellSidebar({ active, dot, onOpenPalette }: { active: ShellNavKey | null; dot: boolean; onOpenPalette: () => void }) {
  const copy = useStandardCopy();
  const { language } = useOrbitLanguage();
  const shortcut = useShortcutLabel();
  const searchLabel = pickCopy(shellCopy.searchAndAsk, language);
  // data-tip: the compact rail (768–1279) shows the label as a tooltip on hover and keyboard focus.
  return (
    <nav className={styles.side} aria-label={copy.nav.main}>
      <Link className={styles.logo} href="/app/home" aria-label="Orbit">O</Link>
      {SHELL_NAV.map((item) => {
        const label = copy.nav[item.key];
        return (
          <Link key={item.key} href={item.href} className={`${styles.item} ${active === item.key ? styles.itemOn : ""}`} aria-current={active === item.key ? "page" : undefined} data-tip={label}>
            <span className={styles.itemIcon}><Icon name={item.icon} size={21} />{item.key === "inbox" && dot ? <i className={styles.dot} aria-hidden /> : null}</span>
            <span className={styles.itemLabel}>{label}</span>
          </Link>
        );
      })}
      <span className={styles.spacer} />
      <button type="button" className={`btn ${styles.item}`} onClick={onOpenPalette} aria-label={`${searchLabel} (${shortcut})`} data-tip={searchLabel}>
        <span className={styles.itemIcon}><Icon name="search" size={21} /></span>
        <span className={styles.itemLabel} aria-hidden><Kbd>{shortcut}</Kbd></span>
      </button>
      <Link href="/app/events/center" className={`${styles.item} ${active === "host" ? styles.itemOn : ""}`} aria-current={active === "host" ? "page" : undefined} data-tip={copy.nav.host}>
        <span className={styles.itemIcon}><Icon name="flag" size={21} /></span>
        <span className={styles.itemLabel}>{copy.nav.host}</span>
      </Link>
      <Link href="/app/settings" className={`${styles.item} ${active === "settings" ? styles.itemOn : ""}`} aria-current={active === "settings" ? "page" : undefined} data-tip={copy.nav.settings}>
        <span className={styles.itemIcon}><Icon name="settings" size={21} /></span>
        <span className={styles.itemLabel}>{copy.nav.settings}</span>
      </Link>
      <AccountMenu active={active === "me"} />
    </nav>
  );
}

// Under 768 (b8): a slim top bar — search / ask, 受信箱 as a round button with the
// unread dot, and the avatar menu (which then also lists 設定 and 主催).
function ShellMobileTop({ active, dot, onOpenPalette }: { active: ShellNavKey | null; dot: boolean; onOpenPalette: () => void }) {
  const copy = useStandardCopy();
  const { language } = useOrbitLanguage();
  return (
    <div className={styles.mobileTop} data-orbit-2026-mobile-top="">
      <Link className={styles.mobileLogo} href="/app/home" aria-label="Orbit">O</Link>
      <span className={styles.spacer} />
      <IconButton icon="search" label={pickCopy(shellCopy.searchAndAsk, language)} soft onClick={onOpenPalette} />
      <Link href="/app/inbox" className={`${styles.roundLink} ${active === "inbox" ? styles.itemOn : ""}`} aria-label={copy.nav.inbox} aria-current={active === "inbox" ? "page" : undefined}>
        <Icon name="inbox" size={20} />{dot ? <i className={styles.dot} aria-hidden /> : null}
      </Link>
      <AccountMenu active={active === "me"} compact />
    </div>
  );
}

// The avatar menu: マイページ, 参加するイベント (the old account menu's 「我的活动」),
// on narrow screens also 設定 and 主催, language (moved from the old top bar),
// appearance (自動 / ライト / ダーク, RD-05) and sign out.
function AccountMenu({ active, compact = false }: { active: boolean; compact?: boolean }) {
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
          <div className={styles.menuLinks}>
            <Link className={styles.menuRow} href="/app/profile" onClick={() => setOpen(false)}><Icon name="user" size={20} />{copy.nav.me}</Link>
            <Link className={styles.menuRow} href="/app/events?scope=registered" onClick={() => setOpen(false)}><Icon name="calendar" size={20} />{t(shellCopy.myEvents)}</Link>
            {compact ? <Link className={styles.menuRow} href="/app/settings" onClick={() => setOpen(false)}><Icon name="settings" size={20} />{copy.nav.settings}</Link> : null}
            {compact ? <Link className={styles.menuRow} href="/app/events/center" onClick={() => setOpen(false)}><Icon name="flag" size={20} />{copy.nav.host}</Link> : null}
          </div>
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
        <Link key={item.key} href={item.href} className={`${styles.bottomItem} ${active === item.key ? styles.bottomOn : ""}`} aria-current={active === item.key ? "page" : undefined}>
          <Icon name={item.icon} size={21} />
          <span>{copy.nav[item.key]}</span>
        </Link>
      ))}
    </nav>
  );
}

/** The skeleton rail (web.html:409-422): 次の一手 and 最近の会話 empty for now, and the ⌘K entry. */
export function DefaultRail({ onOpenPalette }: { onOpenPalette?: () => void }) {
  const copy = useStandardCopy();
  const { language } = useOrbitLanguage();
  const shortcut = useShortcutLabel();
  return (
    <div className={styles.railBody}>
      <h2 className={styles.railTitle}>{pickCopy(shellCopy.railNextTitle, language)}</h2>
      <p className={styles.railEmpty}>{pickCopy(shellCopy.railNextEmpty, language)}</p>
      <h2 className={styles.railTitle}>{pickCopy(shellCopy.railRecentTitle, language)}</h2>
      <p className={styles.railEmpty}>{pickCopy(shellCopy.railRecentEmpty, language)}</p>
      <button type="button" className={`btn ${styles.railAsk}`} onClick={onOpenPalette ?? (() => window.dispatchEvent(new CustomEvent("orbit:open-palette")))}>
        <Icon name="sparkle" size={16} />
        <span>{copy.nav.askIorbit}</span>
        <Kbd>{shortcut}</Kbd>
      </button>
    </div>
  );
}
