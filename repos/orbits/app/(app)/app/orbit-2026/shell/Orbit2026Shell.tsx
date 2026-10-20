"use client";

import { signOut, useSession } from "next-auth/react";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { readInboxUnreadCounts } from "../../inbox/relationship-inbox-panel";
// R17：注销时删掉本机受付库（kiosk 的名单缓存与离线队列都有参加者姓名；共用平板换人登录）。
import { clearKioskDevice } from "../host/kiosk-store";
import { useOrbitLanguage } from "../../orbit-language-context";
import { getOrbitThemePreference, setOrbitThemePreference, type OrbitThemePreference } from "../../orbit-theme";
import { pickCopy } from "../copy/types";
import { shellCopy } from "../copy/shell";
import { standardCopyFor } from "../copy/standard";
import { useOrbitAsk } from "../../orbit-global-ask/orbit-ask-context";
import { orbitAskPageContext } from "../../orbit-global-ask/orbit-ask-routes";
import { BottomSheet, Button, Drawer, Icon, Kbd, Orbit2026Scope, Popover, Segmented, ToastProvider, useStandardCopy } from "../ui";
import { initials } from "../ui/Basics";
import { CommandPalette, useCommandPaletteShortcut } from "./CommandPalette";
import { InboxEventBridge } from "./inbox-bridge";
import { ShellToastBridge } from "./shell-toast-bridge";
import { SHELL_NAV, shellAppliesTo, shellNavKeyFor, shellShowsRail, type ShellNavKey } from "./shell-routes";
import { ShellSlotsProvider, useShellSlots } from "./slots";
import { WebVersionBannerGate } from "../auth-public/WebVersionBanner";
import styles from "./shell.module.css";

// R07 Orbit2026Shell (RD-02 / RD-19): the one frame of every signed-in page, mounted
// by app/(app)/app/layout.tsx. Left rail (84; 72 icons-only under 1280; under 768
// a top bar — search, 受信箱, avatar — and a bottom capsule with the five tabs), the
// main header from the page's slots, an optional right rail (≥1280 a 360 column,
// below that a header button opening it as a 380 drawer), ⌘K. The shell's parts
// are new-scope islands next to the page content — the old pages keep their own
// [data-orbit-real-page] scope, siblings, never nested (RD-18). Navigation uses
// next/link, so the shell stays mounted across pages.
export function Orbit2026Shell({ language, signedIn, currentBuildId, children }: { language: OrbitLanguage; signedIn: boolean; currentBuildId?: string; children: ReactNode }) {
  const pathname = usePathname() ?? "";
  if (!shellAppliesTo(pathname, signedIn)) return <>{children}</>;
  return (
    <ShellSlotsProvider>
      <ShellFrame language={language} pathname={pathname} currentBuildId={currentBuildId}>{children}</ShellFrame>
    </ShellSlotsProvider>
  );
}

// What the shell's own controls need, for the buttons a page puts in its header
// slots (search, 🔔, 次の一手): the slot nodes render inside the shell, so they
// read this instead of props.
type ShellChrome = { openPalette: () => void; openRail: () => void; inboxDot: boolean; rail: boolean };
const ShellChromeContext = createContext<ShellChrome | null>(null);

function ShellFrame({ language, pathname, currentBuildId, children }: { language: OrbitLanguage; pathname: string; currentBuildId?: string; children: ReactNode }) {
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
  const chrome: ShellChrome = { openPalette, openRail: () => setRailDrawer(true), inboxDot: dot, rail };
  useEffect(() => { setRailDrawer(false); }, [pathname]);
  return (
    <ShellChromeContext.Provider value={chrome}>
    <div className={styles.frame} data-orbit-2026-shell="" data-rail={rail ? "true" : "false"} data-phone-bare={slots.phoneBare ? "true" : undefined}>
      <Orbit2026Scope language={language} className={styles.sideScope}>
        <ShellSidebar active={active} dot={dot} />
      </Orbit2026Scope>
      <div className={styles.main}>
        <Orbit2026Scope language={language} className={styles.headScope}>
          <ToastProvider>
            <ShellMobileTop active={active} dot={dot} />
            {hasHeader ? (
              <header className={`${styles.mainhead} ${slots.phoneFold ? styles.mainheadFold : ""}`} data-orbit-2026-mainhead="">
                <div className={styles.headSide}>{slots.left}{slots.demoPill ? <span className={styles.demoSlot}>{slots.demoPill}</span> : null}</div>
                <div className={styles.headTitle}>
                  {slots.title ? <h1 className={styles.title}>{slots.title}</h1> : null}
                  {slots.subtitle ? <small className={styles.subtitle}>{slots.subtitle}</small> : null}
                </div>
                <div className={`${styles.headSide} ${styles.headRight}`}>
                  {slots.right}
                  {rail ? <ShellRailButton count={slots.railCount} open={railDrawer} /> : null}
                </div>
              </header>
            ) : null}
            <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
            {rail ? (
              <Drawer open={railDrawer} onClose={() => setRailDrawer(false)} title={pickCopy(shellCopy.railNextTitle, language)} size="sm" bare>
                {/* b12 N07b: ✕ at the top left, 「Esc で閉じる」 at the right, then the rail as at 1440. */}
                <div className={styles.drawerRail}>
                  <div className={styles.drawerHead}>
                    <button type="button" className={`btn ${styles.rbtn}`} aria-label={standardCopyFor(language).action.close} onClick={() => setRailDrawer(false)}><Icon name="x" size={20} /></button>
                    <span className={styles.drawerHint}><Kbd>Esc</Kbd>{pickCopy(shellCopy.railCloseHint, language)}</span>
                  </div>
                  {railContent}
                </div>
              </Drawer>
            ) : null}
            <InboxEventBridge />
            <ShellToastBridge />
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
      <Orbit2026Scope language={language}>
        <WebVersionBannerGate currentBuildId={currentBuildId} language={language} />
      </Orbit2026Scope>
    </div>
    </ShellChromeContext.Provider>
  );
}

// Header buttons a page puts in its slots (web.html searchBtn / headR, b6 railBtn).
// Outside the shell (tests of a page on its own) they render nothing.

/** The round 🔍 at the left of the main header: opens ⌘K. */
export function ShellSearchButton() {
  const chrome = useContext(ShellChromeContext);
  const { language } = useOrbitLanguage();
  const shortcut = useShortcutLabel();
  if (!chrome) return null;
  const label = pickCopy(shellCopy.searchAndAsk, language);
  return (
    <button type="button" className={`btn ${styles.rbtn}`} onClick={chrome.openPalette} aria-label={`${label} (${shortcut})`} data-orbit-2026-search="">
      <Icon name="search" size={20} />
    </button>
  );
}

/** The round 🔔 (受信箱) with the unread dot. */
export function ShellBellButton() {
  const chrome = useContext(ShellChromeContext);
  const copy = useStandardCopy();
  const { language } = useOrbitLanguage();
  if (!chrome) return null;
  const label = chrome.inboxDot ? `${copy.nav.inbox} · ${pickCopy(shellCopy.inboxUnread, language)}` : copy.nav.inbox;
  return (
    <Link href="/app/inbox" className={styles.rbtn} aria-label={label}>
      <Icon name="bell" size={20} />{chrome.inboxDot ? <i className={styles.rdot} aria-hidden /> : null}
    </Link>
  );
}

/**
 * 768–1279: the right rail folds into this header button (✨ 次の一手 + count) after
 * the page's right slot (b12 N07); it keeps the soft selected fill while its drawer is open.
 */
function ShellRailButton({ count, open }: { count?: number; open: boolean }) {
  const chrome = useContext(ShellChromeContext);
  const { language } = useOrbitLanguage();
  if (!chrome?.rail) return null;
  return (
    <button type="button" className={`btn ${styles.railButton} ${open ? styles.railButtonOn : ""}`} onClick={chrome.openRail} aria-label={pickCopy(shellCopy.railOpen, language)} aria-haspopup="dialog" aria-expanded={open} data-orbit-2026-rail-button="">
      <Icon name="sparkle" size={16} />
      <span aria-hidden>{pickCopy(shellCopy.railNextTitle, language)}</span>
      {count ? <span className={styles.cnum} aria-hidden>{count}</span> : null}
    </button>
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

function ShellSidebar({ active, dot }: { active: ShellNavKey | null; dot: boolean }) {
  const copy = useStandardCopy();
  // data-tip: the compact rail (768–1279) shows the label as a tooltip on hover and keyboard focus.
  // ⌘K has no rail item (web.html): the shortcut stays, its button is the header's 🔍.
  return (
    <nav className={styles.side} aria-label={copy.nav.main}>
      <Link className={styles.logo} href="/app/home" aria-label="Orbit">O</Link>
      {SHELL_NAV.map((item) => {
        const label = copy.nav[item.key];
        return (
          <Link key={item.key} href={item.href} className={`${styles.item} ${active === item.key ? styles.itemOn : ""}`} aria-current={active === item.key ? "page" : undefined} data-tip={label}>
            <span className={styles.itemIcon}><Icon name={item.icon} size={20} />{item.key === "inbox" && dot ? <i className={styles.dot} aria-hidden /> : null}</span>
            <span className={styles.itemLabel}>{label}</span>
          </Link>
        );
      })}
      <span className={styles.spacer} />
      <Link href="/app/events/center" className={`${styles.item} ${active === "host" ? styles.itemOn : ""}`} aria-current={active === "host" ? "page" : undefined} data-tip={copy.nav.host}>
        <span className={styles.itemIcon}><Icon name="brief" size={20} /></span>
        <span className={styles.itemLabel}>{copy.nav.host}</span>
      </Link>
      <Link href="/app/settings" className={`${styles.item} ${active === "settings" ? styles.itemOn : ""}`} aria-current={active === "settings" ? "page" : undefined} data-tip={copy.nav.settings}>
        <span className={styles.itemIcon}><Icon name="settings" size={20} /></span>
        <span className={styles.itemLabel}>{copy.nav.settings}</span>
      </Link>
      <AccountMenu active={active === "me"} />
    </nav>
  );
}

// Under 768 (b6 mwHead): the 「O Orbit」 wordmark, 受信箱 as a round button with
// the unread dot, and the avatar menu (a bottom sheet; 設定 / 主催 are reached via マイページ).
function ShellMobileTop({ active, dot }: { active: ShellNavKey | null; dot: boolean }) {
  const copy = useStandardCopy();
  return (
    <div className={styles.mobileTop} data-orbit-2026-mobile-top="">
      <Link className={styles.mobileBrand} href="/app/home" aria-label="Orbit"><span className={styles.mobileLogo} aria-hidden>O</span><b aria-hidden>Orbit</b></Link>
      <span className={styles.spacer} />
      <Link href="/app/inbox" className={`${styles.rbtn} ${active === "inbox" ? styles.rbtnOn : ""}`} aria-label={copy.nav.inbox} aria-current={active === "inbox" ? "page" : undefined}>
        <Icon name="inbox" size={20} />{dot ? <i className={styles.rdot} aria-hidden /> : null}
      </Link>
      <AccountMenu active={active === "me"} compact />
    </div>
  );
}

// The avatar menu (b12 W-R07-07 / 07b, user-approved 2026-10-12): who is signed in,
// マイページ, language, appearance (自動 / ライト / ダーク, RD-05) and sign out. From
// the rail (≥768) a 340 pop-up beside the rail, bottom-aligned with the avatar; on
// the narrow top bar a bottom sheet. 設定 / 主催 are not here: the rail has them, and
// on phones マイページ leads on (as in the App).
function AccountMenu({ active, compact = false }: { active: boolean; compact?: boolean }) {
  const copy = useStandardCopy();
  const { language } = useOrbitLanguage();
  const session = useSession();
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const name = session.data?.user?.name?.trim() || session.data?.user?.email?.trim() || copy.nav.me;
  const label = pickCopy(shellCopy.account, language);
  const body = <AccountMenuBody name={name} email={session.data?.user?.email ?? ""} compact={compact} onDone={() => setOpen(false)} />;
  return (
    <>
      <button ref={anchor} type="button" className={`btn ${styles.avatarButton} ${active ? styles.itemOn : ""}`} aria-haspopup="dialog" aria-expanded={open} aria-label={label} onClick={() => setOpen(!open)}>
        <span className={`${styles.avatar} ${open ? styles.avatarOpen : ""}`} aria-hidden>{initials(name)}</span>
      </button>
      {compact
        ? <BottomSheet open={open} onClose={() => setOpen(false)} label={label} tight>{body}</BottomSheet>
        : <Popover open={open} onClose={() => setOpen(false)} anchor={anchor} label={label} width={340} tight place={besideRail}>{body}</Popover>}
    </>
  );
}

// b12 .amenu: left = the rail's edge + 8, its foot 4 below the avatar's.
function besideRail(box: DOMRect) {
  const rail = document.querySelector("[data-orbit-2026-shell] nav")?.getBoundingClientRect();
  return { left: (rail?.right ?? box.right) + 8, bottom: window.innerHeight - box.bottom - 4 };
}

function AccountMenuBody({ name, email, compact, onDone }: { name: string; email: string; compact: boolean; onDone: () => void }) {
  const copy = useStandardCopy();
  const { language, setLanguage } = useOrbitLanguage();
  const [theme, setTheme] = useState<OrbitThemePreference>("system");
  useEffect(() => { setTheme(getOrbitThemePreference()); }, []);
  const t = (entry: (typeof shellCopy)[keyof typeof shellCopy]) => pickCopy(entry, language);
  return (
    <div className={`${styles.menu} ${compact ? styles.menuCompact : ""}`}>
      <div className={styles.menuHead}>
        <span className={`${styles.avatar} ${styles.menuAvatar}`} aria-hidden>{initials(name)}</span>
        <span className={styles.menuWho}><b>{name}</b>{email && email !== name ? <small>{email}</small> : null}</span>
      </div>
      <Link className={styles.menuRow} href="/app/profile" onClick={onDone}><Icon name="user" size={16} />{copy.nav.me}<span className={styles.menuGo}><Icon name="right" size={16} /></span></Link>
      <span className={styles.menuSep} aria-hidden />
      <span className={styles.menuLabel}>{t(shellCopy.language)}</span>
      <div className={styles.menuSeg}>
        <Segmented<OrbitLanguage> wide label={t(shellCopy.language)} value={language} onChange={setLanguage} segments={[{ key: "ja", label: t(shellCopy.languageJa) }, { key: "zh", label: t(shellCopy.languageZh) }, { key: "en", label: "English" }]} />
      </div>
      <span className={styles.menuLabel}>{t(shellCopy.appearance)}</span>
      <div className={styles.menuSeg}>
        <Segmented<OrbitThemePreference> wide label={t(shellCopy.appearance)} value={theme} onChange={(next) => { setTheme(next); setOrbitThemePreference(next); }}
          segments={[{ key: "system", label: t(shellCopy.themeSystem) }, { key: "light", label: t(shellCopy.themeLight) }, { key: "dark", label: t(shellCopy.themeDark) }]} />
      </div>
      <span className={styles.menuSep} aria-hidden />
      <Button label={t(shellCopy.signOut)} variant="dangerGhost" icon="out" block className={styles.menuOut} onClick={() => void clearKioskDevice().finally(() => signOut({ callbackUrl: "/app" }))} />
    </div>
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

/**
 * The rail before there is anything to suggest (web.html assistRail('empty')): iOrbit
 * introduces itself, three questions to start with (each hands the question to
 * iOrbit), and 「iOrbit に聞く…」 at the foot opening ⌘K. R10 feeds 次の一手 and
 * 最近の会話 here once the home suggestions exist.
 */
export function DefaultRail({ onOpenPalette, intro, prompts: promptOverride }: {
  onOpenPalette?: () => void;
  /** R27：页面专用的开场卡（如探す「イベント選びを手伝います」）；不传 = 通用介绍。 */
  intro?: { title: string; body: string };
  /** R27：页面专用的提问示例；不传 = 通用三条。 */
  prompts?: readonly string[];
}) {
  const { language } = useOrbitLanguage();
  const pathname = usePathname() ?? "";
  const ask = useOrbitAsk();
  const t = (entry: (typeof shellCopy)[keyof typeof shellCopy]) => pickCopy(entry, language);
  const open = onOpenPalette ?? (() => window.dispatchEvent(new CustomEvent("orbit:open-palette")));
  const prompts = promptOverride ?? [t(shellCopy.railPrompt1), t(shellCopy.railPrompt2), t(shellCopy.railPrompt3)];
  return (
    <div className={styles.railBody}>
      <h2 className={styles.railTitle}><span className={styles.emo} aria-hidden>✨</span>iOrbit</h2>
      <div className={styles.railCard}>
        <b>{intro?.title ?? t(shellCopy.railIntroTitle)}</b>
        <p>{intro?.body ?? t(shellCopy.railIntroBody)}</p>
      </div>
      <span className={styles.railLabel}>{t(shellCopy.railPromptsLabel)}</span>
      <div className={styles.prompts}>
        {prompts.map((prompt) => (
          <button key={prompt} type="button" className={`btn ${styles.prompt}`} onClick={() => ask?.submit(prompt, orbitAskPageContext(pathname, language))}>{prompt}</button>
        ))}
      </div>
      <span className={styles.spacer} />
      <button type="button" className={`btn ${styles.railAsk}`} onClick={open}>
        <Icon name="sparkle" size={16} />
        <span>{t(shellCopy.railAskPlaceholder)}</span>
        <ShortcutText />
      </button>
    </div>
  );
}

function ShortcutText() {
  return <small className={styles.railKey} aria-hidden>{useShortcutLabel()}</small>;
}
