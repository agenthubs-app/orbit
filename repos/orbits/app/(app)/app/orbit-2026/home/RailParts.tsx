"use client";

// Shared by the Home and To-do / calendar rails (web.html #2, #13, #14): 最近の会話 and the ask bar.
// Kept apart from HomePlaceholder (and free of next/link) so the Task rails do not pull in the shell.
import { z } from "zod";

import { useOrbitLanguage } from "../../orbit-language-context";
import { pickCopy } from "../copy/types";
import { shellCopy } from "../copy/shell";
import { Icon } from "../ui";
import { useHomeResource } from "./use-home-resource";
import styles from "./home.module.css";

const recentSessionsSchema = z.object({ items: z.array(z.unknown()) });

export function RecentSessions() {
  const { language } = useOrbitLanguage();
  const sessions = useHomeResource("/api/ai/conversations/sessions?limit=3", recentSessionsSchema);
  if (sessions.kind !== "ready") return null;
  const items = sessions.data.items.flatMap((raw) => {
    if (typeof raw !== "object" || raw === null) return [];
    const row = raw as { id?: unknown; title?: unknown; organization?: { customTitle?: unknown } };
    const id = typeof row.id === "string" ? row.id.trim() : "";
    const custom = typeof row.organization?.customTitle === "string" ? row.organization.customTitle.trim() : "";
    const title = custom || (typeof row.title === "string" ? row.title.trim() : "");
    return id && title ? [{ id, title }] : [];
  }).slice(0, 3);
  if (!items.length) return null;
  return <>
    <h2 className={styles.railLbl}>{pickCopy(shellCopy.railRecentTitle, language)}</h2>
    {items.map((item) => <a key={item.id} href={`/app/agent?session=${encodeURIComponent(item.id)}`} className={styles.recentRow}><Icon name="clock" size={16} />{item.title}</a>)}
  </>;
}

/** The rail's bottom: kit .assist-in (「iOrbit に聞く…」 ⌘K), pushed to the end by a spacer. */
export function RailAsk() {
  const { language } = useOrbitLanguage();
  return <>
    <span className={styles.railSpacer} />
    <button type="button" className={`btn ${styles.railAsk}`} onClick={() => window.dispatchEvent(new CustomEvent("orbit:open-palette"))}>
      <Icon name="sparkle" size={16} /><span>{pickCopy(shellCopy.railAskPlaceholder, language)}</span><small>⌘K</small>
    </button>
  </>;
}
