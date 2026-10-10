"use client";

import { useEffect, useState } from "react";

import { useReducedMotion } from "./Scope";
import styles from "./Progress.module.css";

// kit .bar: 6 high (thin 4) with a round knob; plum gradient, coral when warning.
export function ProgressBar({ value, thin = false, tone = "plum", label }: { value: number; thin?: boolean; tone?: "plum" | "coral"; label: string }) {
  const percent = Math.max(0, Math.min(100, Math.round(value * 100)));
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className={`${styles.bar} ${thin ? styles.thin : ""} ${tone === "coral" ? styles.coral : ""}`}>
      <i className={styles.fill} style={{ width: `${percent}%` }} />
    </div>
  );
}

// kit .ring: segments drawn on a circle, a centred label.
export function RingChart({ size = 96, stroke = 10, segments, center, label }: { size?: number; stroke?: number; segments: { value: number; color: string }[]; center?: string; label: string }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <div role="img" aria-label={label} className={styles.ring} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={radius} className={styles.track} strokeWidth={stroke} />
        {segments.map((segment, index) => {
          const length = Math.max(0, Math.min(1, segment.value)) * circumference;
          const dash = `${length} ${circumference - length}`;
          const node = <circle key={index} cx={size / 2} cy={size / 2} r={radius} stroke={segment.color} strokeWidth={stroke} strokeDasharray={dash} strokeDashoffset={-offset} className={styles.segment} />;
          offset += length;
          return node;
        })}
      </svg>
      {center ? <span className={styles.center} aria-hidden>{center}</span> : null}
    </div>
  );
}

const COUNT_MS = 1150;

/** Same easing as the App's countUpValue: ease-out cubic over --dur-count. */
export function countUpValue(target: number, elapsedMs: number, durationMs = COUNT_MS): number {
  if (elapsedMs >= durationMs) return target;
  const t = Math.max(0, elapsedMs) / durationMs;
  return target * (1 - (1 - t) ** 3);
}

// Numbers count up once when shown; with Reduce Motion they show the final value.
export function CountUp({ value, decimals = 0, className }: { value: number; decimals?: number; className?: string }) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(reduced ? value : 0);
  useEffect(() => {
    if (reduced || typeof requestAnimationFrame === "undefined") { setShown(value); return; }
    let frame = 0;
    const start = performance.now();
    const step = (now: number) => {
      const next = countUpValue(value, now - start);
      setShown(next);
      if (next !== value) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, reduced]);
  return <span className={className ?? styles.number} aria-label={value.toFixed(decimals)}><span aria-hidden>{shown.toFixed(decimals)}</span></span>;
}
