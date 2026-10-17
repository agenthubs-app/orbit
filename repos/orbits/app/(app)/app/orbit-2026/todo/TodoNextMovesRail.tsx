"use client";

import { useSharedReadAccount } from "../../orbit-shared-read-account";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { taskCopy } from "../copy/task";
import { pickCopy } from "../copy/types";
import { Button, Card, EmptyState, MacTile, Orbit2026Scope, RetryCard, SampleTag, Skeleton } from "../ui";
import type { TodoPageView } from "./todo-view-model";
import styles from "./todo.module.css";

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
  if (!current.ready || current.account !== account || state === "idle" || state === "not_implemented") return null;
  const t = (entry: typeof taskCopy[keyof typeof taskCopy]) => pickCopy(entry, language);
  const section = view?.nextMoves;
  return <Orbit2026Scope language={language}><div className={styles.rail}>
    <header className={styles.header}><h3 className={styles.heading}>{t(taskCopy.todoRailTitle)}</h3><span className={styles.note}>{t(taskCopy.todoRailFromTask)}</span></header>
    {state === "failed" || section?.state === "failed" ? <RetryCard title={t(taskCopy.todoReadFailed)} onRetry={onRetry} />
      : state === "loading" || !section ? <Skeleton lines={3} onRetry={onRetry} />
        : section.state === "hidden" ? null : <>
          {section.count.partial ? <p className={styles.note} role="status">{t(taskCopy.todoPartial)}</p> : null}
          {section.issues.some(issue => issue.status === "unavailable") ? <RetryCard title={t(taskCopy.todoUnavailable)} onRetry={onRetry} /> : null}
          {section.state === "empty" ? <EmptyState title={t(taskCopy.todoNextMovesEmpty)} /> : section.items.slice(0, 3).map(item => <Card key={item.key} className={styles.railCard}>
            <div className={styles.moveTitle}><MacTile emoji="💌" tone="pink" size="sm" /><h4>{item.title}</h4>{item.sample ? <SampleTag /> : null}</div>
            {item.subtitle ? <p className={styles.reason}>{item.subtitle}</p> : null}
            <div className={styles.moveFoot}><Button label={t(taskCopy.todoOpenDraft)} size="sm" variant="primary" disabled={item.sample} onClick={() => { if (!item.sample) onDraft(item.key); }} /></div>
          </Card>)}
          {section.items.length ? <p className={styles.note}>{t(taskCopy.todoDraftOnly)}</p> : null}
        </>}
  </div></Orbit2026Scope>;
}
