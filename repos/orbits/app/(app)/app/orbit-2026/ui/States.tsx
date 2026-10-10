"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { Button } from "./Button";
import { Icon } from "./Icon";
import { fillCopy, useStandardCopy } from "./Scope";
import styles from "./States.module.css";

// kit .guide: an empty state that guides (title, why, numbered steps, ghost rows,
// one primary action). Same props as the App's EmptyState.
export function EmptyState({ title, message, action, steps, ghostRows = 0 }: {
  title: string;
  message?: string;
  action?: { label: string; onSelect: () => void };
  steps?: { label: string; state: "done" | "now" | "later" }[];
  ghostRows?: number;
}) {
  return (
    <div className={styles.guide}>
      <h3 className={styles.title}>{title}</h3>
      {message ? <p className={styles.message}>{message}</p> : null}
      {steps?.length ? (
        <ol className={styles.steps}>
          {steps.map((step, index) => (
            <li key={step.label} className={`${styles.step} ${styles[`step_${step.state}`]}`} aria-current={step.state === "now" ? "step" : undefined}>
              <span className={styles.stepNumber}>{step.state === "done" ? <Icon name="check" size={16} /> : index + 1}</span>
              {step.label}
            </li>
          ))}
        </ol>
      ) : null}
      {Array.from({ length: ghostRows }, (_, index) => <div key={index} className={styles.ghost} aria-hidden><i /></div>)}
      {action ? <div className={styles.action}><Button label={action.label} variant="primary" onClick={action.onSelect} /></div> : null}
    </div>
  );
}

export const SKELETON_SLOW_MS = 8000;

// 01-system ⑦ skeleton: shimmer 1.6 s (Reduce Motion: still), after 8 s a line with retry.
export function Skeleton({ lines = 3, onRetry }: { lines?: number; onRetry?: () => void }) {
  const copy = useStandardCopy();
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), SKELETON_SLOW_MS);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div role="progressbar" aria-label={copy.loading.loading} aria-busy className={styles.skeleton}>
      {slow ? (
        <div className={styles.slow} role="status">
          <span>{copy.loading.slow}</span>
          {onRetry ? <Button label={copy.action.retry} size="sm" onClick={onRetry} /> : null}
        </div>
      ) : null}
      {Array.from({ length: lines }, (_, index) => <i key={index} className={styles.bone} style={{ width: `${100 - index * 14}%` }} />)}
    </div>
  );
}

export const OFFLINE_SYNCED_MS = 2000;

// 01-system ⑧ offline bar: apricot 「オフライン · …」 + 同期待ち N; back online it turns
// mint 「同期しました」 and folds away after 2 s.
export function OfflineBar({ offline, pending }: { offline: boolean; pending: number }) {
  const copy = useStandardCopy();
  const [synced, setSynced] = useState(false);
  const wasOffline = useRef(offline);
  useEffect(() => {
    if (wasOffline.current && !offline) {
      wasOffline.current = offline;
      setSynced(true);
      const timer = setTimeout(() => setSynced(false), OFFLINE_SYNCED_MS);
      return () => clearTimeout(timer);
    }
    wasOffline.current = offline;
  }, [offline]);
  if (!offline && !synced) return null;
  return (
    <div role="status" className={`${styles.bar} ${offline ? styles.offline : styles.synced}`}>
      <Icon name={offline ? "wifioff" : "check"} size={16} />
      <span className={styles.barText}>{offline ? copy.offline.banner : copy.offline.synced}</span>
      {offline && pending > 0 ? <span className={styles.pending}>{fillCopy(copy.offline.pending, { count: pending })}</span> : null}
    </div>
  );
}

// 01-system ⑧ block error: coral-soft icon block, what failed, why + reassurance, 再試行.
export function RetryCard({ title, message, onRetry, retrying = false, onViewCached }: { title: string; message?: string; onRetry: () => void; retrying?: boolean; onViewCached?: () => void }) {
  const copy = useStandardCopy();
  return (
    <div role="alert" className={styles.retry}>
      <span className={styles.retryIcon}><Icon name="alert" size={24} /></span>
      <h3 className={styles.title}>{title}</h3>
      <p className={styles.message}>{message ?? `${copy.error.checkConnection}${copy.error.inputKept}`}</p>
      <div className={styles.retryActions}>
        <Button icon="refresh" label={copy.action.retry} variant="primary" loading={retrying} onClick={onRetry} />
        {onViewCached ? <Button label={copy.error.viewCached} variant="ghost" onClick={onViewCached} /> : null}
      </div>
    </div>
  );
}

// 01-system ⑧ AI degraded: grey (not the user's fault), what stopped and what still works.
export function DegradedCard({ title, message, onRetry }: { title?: string; message?: string; onRetry?: () => void }) {
  const copy = useStandardCopy();
  return (
    <div role="status" className={styles.degraded}>
      <Icon name="alert" size={16} />
      <div className={styles.degradedBody}>
        <b className={styles.degradedTitle}>{title ?? copy.degraded.iorbitUnavailable}</b>
        <p className={styles.message}>{message ?? copy.degraded.iorbitStopped}</p>
      </div>
      {onRetry ? <Button label={copy.action.retry} size="sm" onClick={onRetry} /> : null}
    </div>
  );
}

// Sample data (示例模式): the apricot tag and the banner; the demo-mode intercept
// layer (`_demo/demo-mode-core.tsx`) keeps blocking writes, these are its visuals.
export function SampleTag() {
  return <span className={styles.sampleTag}>{useStandardCopy().sample.tag}</span>;
}

export function SampleBar({ trailing }: { trailing?: ReactNode }) {
  const copy = useStandardCopy();
  return (
    <div role="status" className={styles.sampleBar}>
      <span>{copy.sample.banner}</span>
      {trailing}
    </div>
  );
}

// Quota: 「今月あと N 回」, coral when used up.
export function QuotaChip({ left }: { left: number }) {
  const copy = useStandardCopy();
  const out = left <= 0;
  return <span className={`${styles.quota} ${out ? styles.quotaOut : ""}`}>{out ? copy.quota.reached : fillCopy(copy.quota.left, { count: left })}</span>;
}
