"use client";

import { useSession } from "next-auth/react";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { readInboxUnreadCounts } from "../../inbox/relationship-inbox-panel";
// R17 / 读取缓存规则：注销时清掉本机这个账号的东西（受付库、读取缓存、个人 localStorage 项），见 orbit-sign-out.ts。
import { signOutAndForget } from "../../orbit-sign-out";
import { useSharedReadAccount } from "../../orbit-shared-read-account";
import { installChangeWatch, useAreaChanges } from "../../orbit-change-watch";
import { installWriteWatch } from "../../orbit-write-watch";
import { useOrbitLanguage } from "../../orbit-language-context";
import { getOrbitThemePreference, setOrbitThemePreference, type OrbitThemePreference } from "../../orbit-theme";
import { pickCopy } from "../copy/types";
import { shellCopy } from "../copy/shell";
import { networkCopy } from "../copy/network";
import { eventsCopy } from "../copy/events";
import { iorbitCopy } from "../copy/iorbit";
import { accountCopy } from "../copy/account";
import { agentConnectionsCopy } from "../copy/agent-connections";
import { monthHeading } from "./month-heading";
import { standardCopyFor } from "../copy/standard";
import { useOrbitAsk } from "../../orbit-global-ask/orbit-ask-context";
import { orbitAskPageContext } from "../../orbit-global-ask/orbit-ask-routes";
import { BottomSheet, Button, ContextMenu, Drawer, Icon, Kbd, Orbit2026Scope, Popover, Segmented, ToastProvider, useStandardCopy } from "../ui";
import { initials } from "../ui/Basics";
import { CommandPalette, useCommandPaletteShortcut } from "./CommandPalette";
import { InboxEventBridge } from "./inbox-bridge";
import { ShellToastBridge } from "./shell-toast-bridge";
import { SHELL_NAV, onboardingImportFocus, shellAppliesTo, shellFrameFor, shellNavKeyFor, type ShellFrame as RouteFrame, type ShellNavKey } from "./shell-routes";
import { ShellSlotsProvider, useShellSlots, useShellSlotsFilled, type ShellPhoneAction, type ShellSlots } from "./slots";
import { WebVersionBannerGate } from "../auth-public/WebVersionBanner";
import { OnboardingImportHeader } from "../onboarding/OnboardingImportHeader";
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
  // Every /app page: the browser read cache knows whose it is (orbit-last-answer keys and clears by account),
  // and a successful write anywhere marks it stale (orbit-write-watch).
  useSharedReadAccount();
  useEffect(() => { installWriteWatch(); }, []);
  // Signed in: one small change-cursor question replaces each list's own timer (orbit-change-watch).
  useEffect(() => { if (signedIn) installChangeWatch(); }, [signedIn]);
  const returnTo = useSearchParams()?.get("returnTo") ?? null;
  if (!shellAppliesTo(pathname, signedIn)) return <>{children}</>;
  const focus = returnTo && onboardingImportFocus(pathname, returnTo) ? <OnboardingImportHeader returnTo={returnTo} /> : null;
  return (
    <ShellSlotsProvider>
      <ShellFrame language={language} pathname={pathname} currentBuildId={currentBuildId} focus={focus}>{children}</ShellFrame>
    </ShellSlotsProvider>
  );
}

// What the shell's own controls need, for the buttons a page puts in its header
// slots (search, 🔔, 次の一手): the slot nodes render inside the shell, so they
// read this instead of props.
type ShellChrome = { openPalette: () => void; openRail: () => void; inboxDot: boolean; rail: boolean; railLabel: string; railOpenLabel: string };
const ShellChromeContext = createContext<ShellChrome | null>(null);
// Its own context with a stable value: a page that closes the drawer must not re-render with
// the shell, or the rail it passes back would loop (ShellChrome changes on every render).
const CloseRailContext = createContext<() => void>(() => undefined);

/** Closes the rail drawer (768–1279), for a rail whose choice stays on the same URL (iOrbit 会話リスト). */
export function useCloseShellRail(): () => void {
  return useContext(CloseRailContext);
}

// `focus` (R28 onboarding import): a header across the top in place of the rail nav,
// the mobile top bar and the bottom capsule; the main header, content and rail stay.
function ShellFrame({ language, pathname, currentBuildId, focus = null, children }: { language: OrbitLanguage; pathname: string; currentBuildId?: string; focus?: ReactNode; children: ReactNode }) {
  const filled = useShellSlots();
  const routeFrame = shellFrameFor(pathname);
  // Until the page fills the slots, its fixed frame; after, the page's slots — with the frame's rail
  // placeholder kept while the part of the page that brings the rail is still on its way (受信箱: the
  // title mounts before the open tab). A page that has no rail says `rightRail={false}`.
  const slots = !useShellSlotsFilled() && routeFrame ? frameSlots(routeFrame, language)
    : routeFrame?.rail && filled.rightRail === undefined ? { ...filled, rightRail: <FrameRail /> } : filled;
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [railDrawer, setRailDrawer] = useState(false);
  const closeRail = useCallback(() => setRailDrawer(false), []);
  const openPalette = () => setPaletteOpen(true);
  useCommandPaletteShortcut(openPalette);
  const rail = slots.rightRail !== false && slots.rightRail !== undefined;
  const railLabel = slots.railLabel ?? pickCopy(shellCopy.railNextTitle, language);
  const railOpenLabel = slots.railLabel ?? pickCopy(shellCopy.railOpen, language);
  const railContent = slots.rightRail === true ? <DefaultRail onOpenPalette={openPalette} /> : slots.rightRail;
  const active = shellNavKeyFor(pathname);
  const dot = useInboxDot(language, pathname);
  const hasHeader = Boolean(slots.title || slots.left || slots.right || slots.demoPill || rail);
  const headRef = useRef<HTMLElement | null>(null);
  usePhoneHeadCrowding(headRef, hasHeader);
  // b11 TT2 (2026-10-28): on a primary page (a left-rail destination itself) the title takes its own
  // row and the side controls drop to a toolbar row under it — left search / segments, right action.
  const twoTier = Boolean(slots.left || slots.right) && (Boolean(slots.twoTier) || SHELL_NAV.some((item) => item.href === pathname.replace(/\/+$/u, "")));
  const chrome: ShellChrome = { openPalette, openRail: () => setRailDrawer(true), inboxDot: dot, rail, railLabel, railOpenLabel };
  useEffect(() => { setRailDrawer(false); }, [pathname]);
  return (
    <ShellChromeContext.Provider value={chrome}>
    <CloseRailContext.Provider value={closeRail}>
    <div className={styles.frame} data-orbit-2026-shell="" data-rail={rail ? "true" : "false"} data-phone-bare={slots.phoneBare ? "true" : undefined} data-focus={focus ? "true" : undefined}>
      {focus ? <Orbit2026Scope language={language} className={styles.focusScope}>{focus}</Orbit2026Scope> : (
        <Orbit2026Scope language={language} className={styles.sideScope}>
          <ShellSidebar active={active} dot={dot} />
        </Orbit2026Scope>
      )}
      <div className={styles.main}>
        <Orbit2026Scope language={language} className={styles.headScope}>
          <ToastProvider>
            {focus ? null : <ShellPhoneBar pathname={pathname} slots={slots} active={active} dot={dot} language={language} openRail={() => setRailDrawer(true)} />}
            {hasHeader ? (
              <header ref={headRef} className={`${styles.mainhead} ${twoTier ? styles.twoTier : ""} ${slots.phoneFold ? styles.mainheadFold : ""}`} data-orbit-2026-mainhead="" data-two-tier={twoTier ? "true" : undefined}>
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
              <Drawer open={railDrawer} onClose={() => setRailDrawer(false)} title={railLabel} size="sm" bare>
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
          <aside className={styles.rail} aria-label={railLabel}>{railContent}</aside>
        </Orbit2026Scope>
      ) : null}
      {focus ? null : (
        <Orbit2026Scope language={language} className={styles.bottomScope}>
          <ShellBottomBar active={active} />
        </Orbit2026Scope>
      )}
      <Orbit2026Scope language={language}>
        <WebVersionBannerGate currentBuildId={currentBuildId} language={language} />
      </Orbit2026Scope>
    </div>
    </CloseRailContext.Provider>
    </ShellChromeContext.Provider>
  );
}

// A left-rail page's fixed frame (shellFrameFor) as slots: the real title, and placeholders the size
// of the controls, the count line and the rail the page puts there once it has mounted.
const FRAME_TITLE: Record<RouteFrame["title"], (language: OrbitLanguage) => string> = {
  month: (language) => monthHeading(language).month,
  network: (language) => pickCopy(networkCopy.title, language),
  iorbit: () => "iOrbit",
  events: (language) => pickCopy(eventsCopy.title, language),
  task: (language) => pickCopy(shellCopy.taskTitle, language),
  inbox: (language) => pickCopy(shellCopy.inboxTitle, language),
  settings: (language) => pickCopy(accountCopy.settings, language),
  proposal: (language) => agentConnectionsCopy.confirmTitle[language],
};

function frameSlots(frame: RouteFrame, language: OrbitLanguage): ShellSlots {
  const height = frame.toolbar?.height ?? 40;
  const controls = (widths: readonly number[]) => widths.length ? <>{widths.map((width, index) => <i key={index} className={styles.framePill} style={{ width, height }} aria-hidden />)}</> : undefined;
  return {
    title: FRAME_TITLE[frame.title](language),
    subtitle: frame.subtitle === "range" ? monthHeading(language).range
      : frame.subtitle === "iorbit" ? pickCopy(iorbitCopy.subtitle, language)
      : frame.subtitle === "pending" ? <i className={styles.frameLine} aria-hidden /> : undefined,
    left: frame.toolbar ? controls(frame.toolbar.left) : undefined,
    right: frame.toolbar ? controls(frame.toolbar.right) : undefined,
    rightRail: frame.rail ? <FrameRail /> : undefined,
    phoneFold: frame.phoneFold,
    ...(frame.phoneBare ? { phoneBare: true } : {}),
    ...(frame.phoneTabs ? { phoneTabs: <i className={`${styles.framePill} ${styles.frameTabs}`} aria-hidden /> } : {}),
  };
}

/** 2026-11-21 < 768：标题栏是「左 | 标题 | 右」三栏，某一侧放了带文字的按钮（運営センター的「共同運営に参加」「イベントを作成」等）
 *  就会盖住标题。量出两侧内容的自然宽度，放不下时给标题栏标 data-crowded，CSS 改成「标题一行、左右按钮一行」（与宽屏 twoTier 同构）。 */
function usePhoneHeadCrowding(ref: { current: HTMLElement | null }, active: boolean) {
  useEffect(() => {
    const head = ref.current;
    if (!active || !head || typeof window === "undefined") return undefined;
    const phone = window.matchMedia("(max-width: 767px)");
    const natural = (el: Element | undefined) => {
      if (!el) return 0;
      const kids = [...el.children].filter((child) => (child as HTMLElement).offsetWidth > 0);
      const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
      return kids.reduce((sum, child) => sum + (child as HTMLElement).offsetWidth, 0) + gap * Math.max(0, kids.length - 1);
    };
    const check = () => {
      const [left, title, right] = [...head.children];
      if (!phone.matches || !title || head.clientWidth === 0) { head.removeAttribute("data-crowded"); return; }
      const range = document.createRange();
      range.selectNodeContents(title);
      const titleWidth = Math.min(range.getBoundingClientRect().width, head.clientWidth);
      const style = getComputedStyle(head);
      const inner = head.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
      const room = (inner - titleWidth) / 2 - (parseFloat(style.columnGap) || 0);
      if (Math.max(natural(left), natural(right)) > room + 1) head.setAttribute("data-crowded", "true");
      else head.removeAttribute("data-crowded");
    };
    check();
    const observer = new ResizeObserver(check);
    observer.observe(head);
    for (const child of head.children) for (const inner of child.children) observer.observe(inner);
    const mutation = new MutationObserver(() => { for (const child of head.children) for (const inner of child.children) observer.observe(inner); check(); });
    mutation.observe(head, { childList: true, subtree: true, characterData: true });
    phone.addEventListener("change", check);
    return () => { observer.disconnect(); mutation.disconnect(); phone.removeEventListener("change", check); };
  }, [ref, active]);
}

function FrameRail() {
  const copy = useStandardCopy();
  return (
    <div className={styles.railBody} role="progressbar" aria-busy aria-label={copy.loading.loading} data-orbit-2026-frame-rail="">
      <i className={styles.frameBone} style={{ width: "40%" }} />
      <i className={styles.frameCard} />
      <i className={styles.frameCard} />
    </div>
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
  if (!chrome?.rail) return null;
  return (
    <button type="button" className={`btn ${styles.railButton} ${open ? styles.railButtonOn : ""}`} onClick={chrome.openRail} aria-label={chrome.railOpenLabel} aria-haspopup="dialog" aria-expanded={open} data-orbit-2026-rail-button="">
      <Icon name="sparkle" size={16} />
      <span aria-hidden>{chrome.railLabel}</span>
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
  // It reads again when the change cursor says the inbox moved (a message or notification arrived elsewhere).
  const [dot, setDot] = useState(false);
  const [moved, setMoved] = useState(0);
  const onInbox = pathname.startsWith("/app/inbox");
  useAreaChanges(["inbox"], () => setMoved((value) => value + 1));
  useEffect(() => {
    if (onInbox) return;
    let live = true;
    readInboxUnreadCounts(language).then((counts) => { if (live) setDot(counts.threads > 0 || counts.alerts > 0); }).catch(() => undefined);
    return () => { live = false; };
  }, [language, onInbox, moved]);
  return dot && !onInbox;
}

function ShellSidebar({ active, dot }: { active: ShellNavKey | null; dot: boolean }) {
  const copy = useStandardCopy();
  // The six left-rail pages are prefetched whole (`prefetch`, kept for next.config staleTimes.static) as soon as
  // the rail is on screen and again on hover once stale, so switching between them shows the page at once.
  // data-tip: the compact rail (768–1279) shows the label as a tooltip on hover and keyboard focus.
  // ⌘K has no rail item (web.html): the shortcut stays, its button is the header's 🔍.
  return (
    <nav className={styles.side} aria-label={copy.nav.main}>
      <Link className={styles.logo} href="/app/home" aria-label="Orbit">O</Link>
      {SHELL_NAV.map((item) => {
        const label = copy.nav[item.key];
        return (
          <Link key={item.key} href={item.href} prefetch className={`${styles.item} ${active === item.key ? styles.itemOn : ""}`} aria-current={active === item.key ? "page" : undefined} data-tip={label}>
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
/** Pages a sub-page's 「‹」 falls back to when there is no previous page in this tab (opened from a link or a reload). */
export function phoneParentHref(pathname: string): string {
  const path = pathname.replace(/\/+$/u, "");
  if (/^\/app\/events\/assessments\//u.test(path)) return "/app/events?tab=assess";
  if (/^\/app\/plans\//u.test(path)) return "/app/tasks?tab=plan";
  if (/^\/app\/(tasks|inbox|agent|home)\//u.test(path)) return `/app/${path.split("/")[2]}`;
  if (path === "/app/start") return "/app/home";
  if (path === "/app/profile" || path.startsWith("/app/profile/")) return "/app/settings";
  if (path === "/app/settings") return "/app/home";
  if (path === "/app/events/center") return "/app/events";
  if (path === "/app/host/join") return "/app/events/center";
  const parent = path.slice(0, path.lastIndexOf("/"));
  return parent && parent !== "/app" ? parent : "/app/home";
}

// Whether this tab has moved between app pages since it loaded: then 「‹」 is the browser's back (as in the App),
// otherwise (a shared link, a reload) it goes to the parent page.
let phoneHistoryDepth = 0;

/**
 * 2026-11-23 phone top bar (< 768, mobile-top-height-proposal, user-approved): one 52px row drawn by the shell for every
 * framed page, then the page's tabs (40 + 10) when it has them; both stay on top while the content scrolls.
 * A first-level page (the five tabs and 受信箱): its title on the left (home: the Orbit mark), up to two of its own icon
 * actions (more go into 「更多」), 受信箱 and the avatar. Any other page: 「‹」, the centred title, one action.
 * The page only declares title / actions / tabs; it no longer draws its own heading row or top margin.
 */
function ShellPhoneBar({ pathname, slots, active, dot, language, openRail }: { pathname: string; slots: ShellSlots; active: ShellNavKey | null; dot: boolean; language: OrbitLanguage; openRail: () => void }) {
  const copy = useStandardCopy();
  const router = useRouter();
  const path = pathname.replace(/\/+$/u, "");
  const first = !slots.phoneSub && SHELL_NAV.some((item) => item.href === path);
  const moreRef = useRef<HTMLButtonElement>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const seen = useRef<string | null>(null);
  useEffect(() => { if (seen.current !== null && seen.current !== pathname) phoneHistoryDepth += 1; seen.current = pathname; }, [pathname]);
  const title = slots.phoneTitle === null ? "" : slots.phoneTitle ?? slots.title ?? "";
  const actions = slots.phoneActions ?? [];
  const run = (action: ShellPhoneAction) => { if (action.kind === "rail") openRail(); else action.onClick?.(); };
  const button = (action: ShellPhoneAction) => action.href
    ? <Link key={action.key} href={action.href} className={`${styles.rbtn} ${styles.phoneBtn} ${action.active ? styles.rbtnOn : ""}`} aria-label={action.label}><Icon name={action.icon} size={20} />{action.dot ? <i className={styles.rdot} aria-hidden /> : null}</Link>
    : <button key={action.key} type="button" className={`btn ${styles.rbtn} ${styles.phoneBtn} ${action.active ? styles.rbtnOn : ""}`} aria-label={action.label} aria-pressed={action.active} onClick={() => run(action)}><Icon name={action.icon} size={20} />{action.dot ? <i className={styles.rdot} aria-hidden /> : null}</button>;
  const room = first ? 2 : 1;
  const shown = actions.length > room ? actions.slice(0, room - 1) : actions;
  const rest = actions.length > room ? actions.slice(room - 1) : [];
  const more = rest.length ? (
    <>
      <button ref={moreRef} type="button" className={`btn ${styles.rbtn} ${styles.phoneBtn}`} aria-label={pickCopy(shellCopy.phoneMore, language)} aria-haspopup="menu" aria-expanded={moreOpen} onClick={() => setMoreOpen((open) => !open)}><Icon name="more" size={20} /></button>
      <ContextMenu open={moreOpen} onClose={() => setMoreOpen(false)} anchor={moreRef} label={pickCopy(shellCopy.phoneMore, language)}
        items={rest.map((action) => ({ key: action.key, label: action.label, onSelect: () => { if (action.href) router.push(action.href); else run(action); } }))} />
    </>
  ) : null;
  const back = slots.phoneBack === false ? null : (
    <button type="button" className={`btn ${styles.rbtn} ${styles.phoneBtn}`} aria-label={pickCopy(shellCopy.phoneBack, language)} data-orbit-phone-back=""
      onClick={() => { if (typeof slots.phoneBack === "string") router.push(slots.phoneBack); else if (phoneHistoryDepth > 0) { phoneHistoryDepth -= 1; router.back(); } else router.push(phoneParentHref(pathname)); }}>
      <Icon name="left" size={20} />
    </button>
  );
  return (
    <div className={styles.phoneTop} data-orbit-phone-top="">
      {first ? (
        <div className={styles.phoneBar} data-orbit-phone-bar="first">
          {path === "/app/home"
            ? <Link className={styles.phoneBrand} href="/app/home" aria-label="Orbit"><span className={styles.phoneLogo} aria-hidden>O</span><b className={styles.phoneTitle}>Orbit</b></Link>
            : <h1 className={styles.phoneTitle}>{title}</h1>}
          {slots.demoPill ? <span className={styles.phoneDemo}>{slots.demoPill}</span> : null}
          {shown.map(button)}
          {more}
          {active === "inbox" ? null : (
            <Link href="/app/inbox" className={`${styles.rbtn} ${styles.phoneBtn}`} aria-label={copy.nav.inbox}>
              <Icon name="inbox" size={20} />{dot ? <i className={styles.rdot} aria-hidden /> : null}
            </Link>
          )}
          <AccountMenu active={active === "me"} compact />
        </div>
      ) : (
        <div className={`${styles.phoneBar} ${styles.phoneSub}`} data-orbit-phone-bar="sub">
          {back ?? <span className={styles.phoneGap} aria-hidden />}
          <div className={styles.phoneCenter}>
            {title ? <h1 className={styles.phoneSubTitle}>{title}</h1> : null}
            {title && (slots.phoneSubtitle ?? slots.subtitle) ? <small className={styles.phoneSubLine}>{slots.phoneSubtitle ?? slots.subtitle}</small> : null}
          </div>
          {shown.length ? shown.map(button) : more ?? <span className={styles.phoneGap} aria-hidden />}
          {shown.length ? more : null}
        </div>
      )}
      {slots.phoneTabs ? <div className={styles.phoneTabs} data-orbit-phone-tabs="">{slots.phoneTabs}</div> : null}
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
      <Button label={t(shellCopy.signOut)} variant="dangerGhost" icon="out" block className={styles.menuOut} onClick={() => void signOutAndForget("/app")} />
    </div>
  );
}

// Under 768 the left rail becomes a bottom capsule with the five main tabs (b8).
function ShellBottomBar({ active }: { active: ShellNavKey | null }) {
  const copy = useStandardCopy();
  return (
    <nav className={styles.bottom} aria-label={copy.nav.main}>
      {SHELL_NAV.filter((item) => item.key !== "inbox").map((item) => (
        <Link key={item.key} href={item.href} prefetch className={`${styles.bottomItem} ${active === item.key ? styles.bottomOn : ""}`} aria-current={active === item.key ? "page" : undefined}>
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
