// The loading state of each left-rail page, laid out as the page itself is (01-system ⑧ Skeleton
// in the page's own columns and card sizes): shown by the route's loading.tsx while the server
// renders, and by a page while its first read is on the way — so the cards appear where they will
// stay, and only their contents fill in.
import type { CSSProperties } from "react";

import styles from "./PageSkeleton.module.css";

// `inboxCard`: the inbox's 420 / 1fr card alone, under tabs the page has already drawn.
// 2026-11-24 eventsAssess / eventsGoing：活动的 評価 / 参加予定 页签（路由骨架按 ?tab= 选，见 RouteSkeleton）；宽屏同 events。
export type PageSkeletonKind = "home" | "network" | "agent" | "events" | "eventsAssess" | "eventsGoing" | "todo" | "inbox" | "inboxCard";

// Column span (of 12) and height of each card, in the order the page draws them.
const CARDS: Record<Exclude<PageSkeletonKind, "agent" | "inbox" | "inboxCard">, ReadonlyArray<readonly [number, number]>> = {
  home: [[8, 236], [4, 236], [4, 208], [8, 208]],
  network: [[4, 176], [5, 176], [3, 176], [12, 440]],
  events: [[12, 120], [4, 280], [4, 280], [4, 280]],
  eventsAssess: [[12, 120], [4, 280], [4, 280], [4, 280]],
  eventsGoing: [[12, 120], [4, 280], [4, 280], [4, 280]],
  todo: [[7, 300], [5, 300], [12, 240]],
};

function Cards({ cards }: { cards: ReadonlyArray<readonly [number, number]> }) {
  return (
    <div className={styles.grid}>
      {cards.map(([span, height], index) => (
        <div key={index} className={styles.card} style={{ "--span": span, minHeight: height } as CSSProperties}>
          <i className={styles.bone} style={{ width: "36%" }} />
          <i className={styles.bone} style={{ width: "82%" }} />
          <i className={styles.bone} style={{ width: "64%" }} />
        </div>
      ))}
    </div>
  );
}

/**
 * 2026-11-24 手机（< 768）：路由骨架按各页手机上的真实布局画，内容到齐时第一块不动、下面不跳。
 * 每块 = [距内容顶部的 y, 高, 样式]，样式：card 圆角卡片（里面三条灰条）/ half 两张半宽卡片 / pill 40 高的胶囊行 /
 * line 一条小字 / plain 不画底的几条灰条。数值是 390 宽本地生产构建里量到的各页顶层块（2026-11-24）。
 * Task 页手机上左右是 16（其余 18），骨架照页面画。
 */
type PhoneBlock = readonly [number, number, "card" | "half" | "pill" | "line" | "plain"];
// bareFrom：页面里（bare）用时，页面已经画了 y 小于它的行，从这里画起（首页从 0；探す 已画筛选行，从 52）。
const PHONE: Partial<Record<PageSkeletonKind, { inset?: 16; bareFrom?: number; blocks: ReadonlyArray<PhoneBlock> }>> = {
  home: { bareFrom: 0, blocks: [[0, 106, "card"], [118, 168, "half"], [298, 207, "card"], [517, 106, "card"]] },
  network: { bareFrom: 0, blocks: [[0, 17, "line"], [27, 40, "pill"], [79, 99, "card"], [193, 32, "line"], [243, 420, "card"]] },
  agent: { blocks: [[0, 154, "plain"], [166, 84, "card"], [260, 84, "card"], [354, 84, "card"], [448, 84, "card"], [560, 54, "pill"]] },
  events: { bareFrom: 52, blocks: [[0, 40, "pill"], [52, 443, "card"], [515, 22, "line"], [561, 112, "card"], [685, 112, "card"]] },
  eventsAssess: { bareFrom: 0, blocks: [[0, 82, "card"], [96, 123, "card"], [233, 80, "card"]] },
  eventsGoing: { bareFrom: 0, blocks: [[0, 36, "pill"], [48, 266, "card"]] },
  todo: { inset: 16, blocks: [[0, 98, "card"], [116, 117, "plain"], [251, 101, "card"]] },
};

function PhoneBlocks({ kind, bare }: { kind: PageSkeletonKind; bare: boolean }) {
  const layout = PHONE[kind];
  if (!layout || (bare && layout.bareFrom === undefined)) return null;
  const from = bare ? layout.bareFrom ?? 0 : 0;
  let bottom = from;
  return (
    <div className={`${styles.phone} ${layout.inset === 16 ? styles.phoneInset16 : ""}`}>
      {layout.blocks.filter(([top]) => top >= from).map(([top, height, look], index) => {
        const style = { marginTop: top - bottom, height } as CSSProperties;
        bottom = top + height;
        const lines = <><i className={styles.bone} style={{ width: "36%" }} /><i className={styles.bone} style={{ width: "78%" }} /><i className={styles.bone} style={{ width: "58%" }} /></>;
        if (look === "half") return <div key={index} className={styles.phoneHalf} style={style}><div className={styles.phoneCard}>{lines}</div><div className={styles.phoneCard}>{lines}</div></div>;
        if (look === "card") return <div key={index} className={styles.phoneCard} style={style}>{lines}</div>;
        if (look === "plain") return <div key={index} className={styles.phonePlain} style={style}>{lines}</div>;
        if (look === "pill") return <i key={index} className={`${styles.bone} ${styles.pill} ${styles.phoneBlock}`} style={style} />;
        return <i key={index} className={`${styles.bone} ${styles.phoneLine}`} style={style} />;
      })}
    </div>
  );
}

/** `bare`: inside a page that already has its insets (its own first read, not the route loading). */
export function PageSkeletonBody({ kind, label, bare = false }: { kind: PageSkeletonKind; label: string; bare?: boolean }) {
  return (
    <div className={`${styles.page} ${bare ? styles.bare : ""}`} role="progressbar" aria-busy aria-label={label} data-orbit-page-skeleton={kind}>
      {kind === "agent" ? (
        <div className={styles.start}>
          <i className={styles.bone} style={{ width: "48%", height: 28 }} />
          <i className={styles.bone} style={{ width: "72%" }} />
          <div className={styles.pair}>{[0, 1, 2, 3].map((index) => <i key={index} className={styles.tile} />)}</div>
        </div>
      ) : kind === "inbox" || kind === "inboxCard" ? (
        <>
          {kind === "inbox" ? <i className={`${styles.bone} ${styles.pill} ${styles.inboxTabs}`} style={{ width: 220, height: 40 }} /> : null}
          <div className={styles.split}>
            <div className={styles.list}>{[0, 1, 2, 3, 4, 5].map((index) => <i key={index} className={styles.bone} style={{ width: `${88 - index * 6}%`, height: 32 }} />)}</div>
            <div className={styles.pane} />
          </div>
          {/* 2026-11-24 手机：按收件箱最终布局画（页签在外壳顶栏里）——搜索框 40，下方 12 处一张圆角卡片，每行 65、头像 38。 */}
          <div className={styles.phoneInbox}>
            <i className={`${styles.bone} ${styles.pill} ${styles.phoneSearch}`} />
            <div className={styles.phoneRows}>
              {[0, 1, 2, 3, 4, 5].map((index) => (
                <div key={index} className={styles.phoneRow}>
                  <i className={styles.phoneAvatar} />
                  <span className={styles.phoneLines}><i className={styles.bone} style={{ width: `${38 + (index % 3) * 8}%` }} /><i className={styles.bone} style={{ width: `${72 - (index % 2) * 14}%`, height: 10 }} /></span>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : <Cards cards={CARDS[kind]} />}
      {kind !== "inbox" && kind !== "inboxCard" ? <PhoneBlocks kind={kind} bare={bare} /> : null}
    </div>
  );
}

const ROUTE_SKELETONS: Readonly<Record<string, PageSkeletonKind>> = {
  "/app/home": "home", "/app/contacts": "network", "/app/agent": "agent", "/app/events": "events", "/app/tasks": "todo", "/app/inbox": "inbox",
};

/** The left-rail page at this path, or null for any other page (it keeps the plain skeleton). */
export function pageSkeletonFor(pathname: string): PageSkeletonKind | null {
  return ROUTE_SKELETONS[pathname.replace(/\/+$/u, "")] ?? null;
}
