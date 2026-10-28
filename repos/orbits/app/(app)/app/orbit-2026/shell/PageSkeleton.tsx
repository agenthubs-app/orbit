// The loading state of each left-rail page, laid out as the page itself is (01-system ⑧ Skeleton
// in the page's own columns and card sizes): shown by the route's loading.tsx while the server
// renders, and by a page while its first read is on the way — so the cards appear where they will
// stay, and only their contents fill in.
import type { CSSProperties } from "react";

import styles from "./PageSkeleton.module.css";

// `inboxCard`: the inbox's 420 / 1fr card alone, under tabs the page has already drawn.
export type PageSkeletonKind = "home" | "network" | "agent" | "events" | "todo" | "inbox" | "inboxCard";

// Column span (of 12) and height of each card, in the order the page draws them.
const CARDS: Record<Exclude<PageSkeletonKind, "agent" | "inbox" | "inboxCard">, ReadonlyArray<readonly [number, number]>> = {
  home: [[8, 236], [4, 236], [4, 208], [8, 208]],
  network: [[4, 176], [5, 176], [3, 176], [12, 440]],
  events: [[12, 120], [4, 280], [4, 280], [4, 280]],
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
          {kind === "inbox" ? <i className={`${styles.bone} ${styles.pill}`} style={{ width: 220, height: 40 }} /> : null}
          <div className={styles.split}>
            <div className={styles.list}>{[0, 1, 2, 3, 4, 5].map((index) => <i key={index} className={styles.bone} style={{ width: `${88 - index * 6}%`, height: 32 }} />)}</div>
            <div className={styles.pane} />
          </div>
        </>
      ) : <Cards cards={CARDS[kind]} />}
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
