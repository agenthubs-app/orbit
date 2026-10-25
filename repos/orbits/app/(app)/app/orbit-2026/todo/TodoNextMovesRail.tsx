"use client";

import { useSharedReadAccount } from "../../orbit-shared-read-account";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { taskCopy } from "../copy/task";
import { pickCopy } from "../copy/types";
import { useState } from "react";
import { EmptyState, MacTile, Orbit2026Scope, RetryCard, SampleTag, Skeleton } from "../ui";
import { RailAsk, RecentSessions } from "../home/RailParts";
import home from "../home/home.module.css";
import shellStyles from "../shell/shell.module.css";
import type { TodoPageView } from "./todo-view-model";
import styles from "./todo.module.css";

const TILES = [{ emoji: "💌", tone: "pink" }, { emoji: "🙋", tone: "teal" }, { emoji: "🥂", tone: "lav" }] as const;

/** A page-owned shell slot: shares the To-do read and never caches another account's rows. */
export function TodoNextMovesRail({ account, language, state, view, onRetry, onDraft }: {
  account: string | null;
  language: OrbitLanguage;
  state: "idle" | "loading" | "ready" | "failed" | "not_implemented";
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
