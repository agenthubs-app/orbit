"use client";

import { useSharedReadAccount } from "../../orbit-shared-read-account";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { taskCopy } from "../copy/task";
import { pickCopy } from "../copy/types";
import { useEffect, useState, type ReactNode } from "react";
import { z } from "zod";
import { EmptyState, MacTile, Orbit2026Scope, RetryCard, SampleTag, Skeleton } from "../ui";
import { RailAsk, RecentSessions } from "../home/RailParts";
import { useHomeResource } from "../home/use-home-resource";
import home from "../home/home.module.css";
import shellStyles from "../shell/shell.module.css";
import { useInShell } from "../shell/slots";
import type { TodoPageView } from "./todo-view-model";
import styles from "./todo.module.css";

type RailState = "idle" | "loading" | "ready" | "failed" | "not_implemented";

// The rail's 「最近の会話」 block (RailParts RecentSessions) reads this path through the shared Home resource;
// the page subscribes to the same path, so the rail goes in once that answer is there too (one request).
const RECENT_SESSIONS_PATH = "/api/ai/conversations/sessions?limit=3";
const recentSessionsSchema = z.object({ items: z.array(z.unknown()) });

/** Subscribes to the rail's recent conversations (the same shared read the rail's block uses) and says when it has answered. */
function RecentSessionsProbe({ onSettled }: { onSettled: (settled: boolean) => void }) {
  const sessions = useHomeResource(RECENT_SESSIONS_PATH, recentSessionsSchema);
  const settled = sessions.kind !== "loading";
  useEffect(() => { onSettled(settled); }, [onSettled, settled]);
  return null;
}

/**
 * The rail slot for a page that owns the To-do rail: `undefined` (the shell keeps its rail skeleton) until
 * the To-do read and the recent conversations have both answered, `false` when To-do is closed for the
 * account, then the complete rail once. Render `probe` in the page; it reads only inside the shell (the
 * rail is not drawn elsewhere), as the rail did.
 */
export function useTodoRailSlot(state: RailState, rail: () => ReactNode, enabled = true): { slot: ReactNode | false | undefined; probe: ReactNode } {
  const inShell = useInShell();
  const [sessionsSettled, setSessionsSettled] = useState(false);
  const active = enabled && inShell;
  const probe = active ? <RecentSessionsProbe onSettled={setSessionsSettled} /> : null;
  if (!active) return { slot: undefined, probe };
  if (state === "not_implemented") return { slot: false, probe };
  if ((state !== "ready" && state !== "failed") || !sessionsSettled) return { slot: undefined, probe };
  return { slot: rail(), probe };
}

const TILES = [{ emoji: "💌", tone: "pink" }, { emoji: "🙋", tone: "teal" }, { emoji: "🥂", tone: "lav" }] as const;

/** A page-owned shell slot: shares the To-do read and never caches another account's rows. */
export function TodoNextMovesRail({ account, language, state, view, onRetry, onDraft }: {
  account: string | null;
  language: OrbitLanguage;
  state: RailState;
  view: TodoPageView | null;
  onRetry: () => void;
  onDraft: (key: string) => void;
}) {
  const current = useSharedReadAccount();
  const [later, setLater] = useState<string[]>([]);
  if (!current.ready || current.account !== account || state === "idle" || state === "not_implemented") return null;
  const t = (entry: typeof taskCopy[keyof typeof taskCopy]) => pickCopy(entry, language);
  const section = view?.nextMoves;
  const shown = section?.items.filter(item => !later.includes(item.key)).slice(0, 3) ?? [];
  // web.html #14 rail = the Home rail: 「✨ 次の一手 · Task から」, .sugg cards (open / あとで), 最近の会話, .assist-in.
  return <Orbit2026Scope language={language} className={styles.railScope}><div className={`${shellStyles.railBody} ${home.rail}`}>
    <h2 className={home.railHead}><MacTile emoji="✨" tone="lav" size="sm" />{t(taskCopy.todoRailTitle)}<span>{t(taskCopy.todoRailFromTask)}</span></h2>
    {state === "failed" || section?.state === "failed" ? <RetryCard title={t(taskCopy.todoReadFailed)} onRetry={onRetry} />
      : state === "loading" || !section ? <Skeleton lines={3} onRetry={onRetry} />
        : section.state === "hidden" ? null : <>
          {section.count.partial ? <p className={styles.note} role="status">{t(taskCopy.todoPartial)}</p> : null}
          {section.issues.some(issue => issue.status === "unavailable") ? <RetryCard title={t(taskCopy.todoUnavailable)} onRetry={onRetry} /> : null}
          {section.state === "empty" || !shown.length ? <EmptyState title={t(taskCopy.todoNextMovesEmpty)} /> : shown.map((item, index) => <div key={item.key} className={home.sugg}>
            <div className={home.suggRow}><MacTile emoji={TILES[index % TILES.length]!.emoji} tone={TILES[index % TILES.length]!.tone} size="sm" /><div><b>{item.title}</b>{item.subtitle ? <span>{item.subtitle}</span> : null}</div>{item.sample ? <SampleTag /> : null}</div>
            <div className={home.suggActs}><button type="button" className={`btn ${home.suggGo}`} disabled={item.sample} onClick={() => { if (!item.sample) onDraft(item.key); }}>{t(taskCopy.todoOpenDraft)}</button>
              <button type="button" className={`btn ${home.suggLater}`} onClick={() => setLater(keys => [...keys, item.key])}>{t(taskCopy.todoLater)}</button></div>
          </div>)}
        </>}
    <RecentSessions />
    <RailAsk />
  </div></Orbit2026Scope>;
}
