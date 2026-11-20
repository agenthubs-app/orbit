"use client";

// 2026-11-21 活动行程页读取中的骨架：固定框架先出，内容块按各页真实位置占位（之前读完前是空白）。
// 有「上次的结果」时不画骨架（useJourneyAnswer 直接给上次的内容）。
import { Bone } from "../ui";
import styles from "./events.module.css";
import x from "./detail.module.css";
import r from "./record.module.css";

function Lines({ widths }: { widths: readonly (number | string)[] }) {
  return <div className={r.skelLines}>{widths.map((width, index) => <Bone key={index} width={width} height={index === 0 ? 11 : 13} />)}</div>;
}

export function JourneySkeleton({ kind }: { kind: "detail" | "venue" | "after" }) {
  if (kind === "detail") {
    return (
      <div className={styles.wgrid} aria-busy data-journey-loading="detail">
        <div className={`${styles.card} ${styles.span12} ${x.coverCard}`}>
          <div className={r.skelCover} />
          <div className={r.skelPad}><Lines widths={[64, "92%", "84%", "70%"]} /></div>
        </div>
        <div className={`${styles.card} ${styles.span12}`}><Lines widths={[72, "100%", "88%", "64%"]} /></div>
        <div className={`${styles.card} ${styles.span12}`}><Lines widths={[56, "40%", "40%"]} /></div>
      </div>
    );
  }
  return (
    <div className={styles.wgrid} aria-busy data-journey-loading={kind}>
      <div className={`${styles.card} ${styles.span12}`}><Lines widths={[80, "60%", "45%"]} /></div>
      <div className={`${styles.card} ${styles.span6}`}><Lines widths={[64, "100%", "90%", "70%"]} /></div>
      <div className={`${styles.card} ${styles.span6}`}><Lines widths={[64, "100%", "90%", "70%"]} /></div>
    </div>
  );
}

/** ≥1280 的右栏在读取中也先占位（读完才出右栏会让主栏宽度跳一次）。 */
export function JourneyRailSkeleton() {
  return (
    <div className={`${styles.rail} ${r.skel}`} aria-busy data-journey-loading="rail">
      <div className={`${styles.card} ${r.pcard}`}><Lines widths={[72, "90%", "70%"]} /><Bone width="100%" height={40} /></div>
      <div className={`${styles.card} ${r.pcard}`}><Lines widths={[88, "100%", "80%"]} /></div>
    </div>
  );
}
