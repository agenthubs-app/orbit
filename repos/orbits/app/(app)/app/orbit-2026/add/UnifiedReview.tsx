"use client";

import type { ReactNode } from "react";

import { addDoorsCopy, addReviewCopy as r } from "../copy/add";
import { Button, Card, Checkbox, Chip, CountUp, Icon, MacTile } from "../ui";
import { DensityDots, type Translate } from "./add-parts";
import styles from "./add.module.css";

export type ReviewTileKey = "duplicate" | "review" | "asIs";

export interface ReviewDuplicateRow {
  id: string;
  existing: string;
  incoming: string;
  /** What differs (会社名の表記 / ローマ字表記 …); `warn` = 会社が違う（転職？）as an apricot chip. */
  difference: string;
  warn?: boolean;
  selected: boolean;
}

export interface ReviewGroupRow {
  key: string;
  label: string;
  /** The suggestion in one line (Kyohei Mori → 森 恭平). */
  example: string;
  tone: "mid" | "lo";
  count: number;
}

/**
 * まとめて確認 — one page for every way in (b9 A2 ④ / A3 ④ Web, 统一): three tiles (重複 / 要確認 /
 * そのまま追加), the duplicates side by side with a check per row (選んだ N件を統合 / 別人として追加),
 * 要確認 grouped by reason (1件ずつ見る / 提案どおりに直す), then あとで続ける and N人を人脈に追加.
 * Cards (R12) and 連絡先 / LinkedIn / CSV (R16) fill it with their own rows.
 */
export function UnifiedReview({ t, tiles, active = "duplicate", onTile, sourceLabel, autoMerged, autoMergedLabel, duplicates, onToggleDuplicate, onSeparate, onMergeSelected, groups, onOneByOne, onApplySuggestions, note, onLater, addCount, onAddAll, busy = false, extra }: {
  t: Translate;
  tiles: Record<ReviewTileKey, { count: number; sub: string }>;
  active?: ReviewTileKey;
  onTile?: (key: ReviewTileKey) => void;
  /** The column head for this import (今回（LinkedIn）/ 今回（名刺）). */
  sourceLabel: string;
  autoMerged: number;
  /** The source's own wording (名刺: 同じ内容だったので); defaults to the LinkedIn / 連絡先 email one. */
  autoMergedLabel?: string;
  duplicates: readonly ReviewDuplicateRow[];
  onToggleDuplicate: (id: string) => void;
  onSeparate: () => void;
  onMergeSelected: () => void;
  groups: readonly ReviewGroupRow[];
  onOneByOne: () => void;
  onApplySuggestions: () => void;
  note: string;
  onLater: () => void;
  addCount: number;
  onAddAll: () => void;
  busy?: boolean;
  /** Below the two cards (e.g. 会った場所 for a card batch, 読み取れなかった名刺). */
  extra?: ReactNode;
}) {
  const selected = duplicates.filter((row) => row.selected).length;
  const reviewTotal = groups.reduce((sum, group) => sum + group.count, 0);
  const tileKeys: ReviewTileKey[] = ["duplicate", "review", "asIs"];
  const tileLabel = { duplicate: r.tileDuplicate, review: r.tileReview, asIs: r.tileAsIs } as const;
  return (
    <div className={`${styles.wgrid} ${styles.fade}`} data-unified-review="">
      <div className={`${styles.span12} ${styles.bq}`}>
        {tileKeys.map((key) => (
          <button key={key} type="button" className={`${styles.bqTile} ${active === key ? styles.bqOn : ""}`} onClick={() => onTile?.(key)} data-review-tile={key}>
            <span className={styles.bqLabel}>{t(tileLabel[key])}</span>
            <b className={styles.bqNumber}><CountUp value={tiles[key].count} /></b>
            <span className={styles.bqLabel}>{tiles[key].sub}</span>
          </button>
        ))}
      </div>
      <Card className={styles.span7} data-review-duplicates={duplicates.length}>
        <div className={styles.reviewCardHead}>
          <h3>{t(r.duplicateTitle, { n: duplicates.length })}</h3>
          <div className={styles.reviewActs}>
            <Button size="sm" label={t(r.separate)} disabled={busy || !selected} onClick={onSeparate} data-review-separate="" />
            <Button size="sm" variant="primary" label={t(r.mergeSelected, { n: selected })} disabled={busy || !selected} onClick={onMergeSelected} data-review-merge="" />
          </div>
        </div>
        {autoMerged ? (
          <div className={styles.okCard}>
            <span className={styles.okMark} aria-hidden><Icon name="check" size={16} /></span>
            <span className={styles.okText}><b>{autoMergedLabel ?? t(r.autoMerged, { n: autoMerged })}</b><span className={styles.okNote}>{t(r.autoMergedNote)}</span></span>
          </div>
        ) : null}
        {duplicates.length ? (
          <table className={styles.reviewTable}>
            <thead><tr><th aria-label={t(r.selectColumn)} /><th>{t(r.existing)}</th><th>{sourceLabel}</th><th>{t(r.difference)}</th></tr></thead>
            <tbody>
              {duplicates.map((row) => (
                <tr key={row.id} data-review-duplicate={row.id}>
                  <td><Checkbox checked={row.selected} label={t(r.selectRow, { name: row.incoming })} onChange={() => onToggleDuplicate(row.id)} /></td>
                  <td>{row.existing}</td>
                  <td>{row.incoming}</td>
                  <td>{row.warn ? <Chip label={row.difference} tone="apricot" /> : <span className={styles.footNote}>{row.difference}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className={styles.footNote}>{t(r.noDuplicates)}</p>}
      </Card>
      <Card className={`${styles.span5} ${styles.reviewGroups}`} data-review-groups={reviewTotal}>
        <div className={styles.reviewCardHead}>
          <h3>{t(r.reviewTitle, { n: reviewTotal })}</h3>
          <span className={styles.footNote}>{t(r.reviewNote)}</span>
        </div>
        {groups.map((group) => (
          <div key={group.key} className={styles.groupRow} data-review-group={group.key}>
            <span className={styles.frowKey}>{group.label}</span>
            <i className={`${styles.frowDot} ${group.tone === "lo" ? styles.frowDotLo : styles.frowDotMid}`} />
            <b>{group.example}</b>
            <span className={styles.footNote}>{t(r.count, { n: group.count })}</span>
          </div>
        ))}
        {reviewTotal ? (
          <div className={styles.groupActs}>
            <Button size="sm" label={t(r.oneByOne)} disabled={busy} onClick={onOneByOne} data-review-one-by-one="" />
            <Button size="sm" label={t(r.applySuggestions)} disabled={busy} onClick={onApplySuggestions} data-review-apply="" />
          </div>
        ) : null}
      </Card>
      {extra ? <div className={styles.span12}>{extra}</div> : null}
      <div className={`${styles.span12} ${styles.reviewFoot}`}>
        <span className={styles.footNote}>{note}</span>
        <Button label={t(r.later)} onClick={onLater} data-review-later="" />
        <Button variant="primary" className={styles.h46} loading={busy} disabled={!addCount} label={t(r.addAll, { n: addCount })} onClick={onAddAll} data-review-add-all={addCount} />
      </div>
    </div>
  );
}

/** The right rail of まとめて確認 (b9 ④ Web): what this source brings, and how much is known after. */
export function ReviewRail({ t, emoji, tone, title, body, level, levelNote }: {
  t: Translate;
  emoji: string;
  tone: "teal" | "apricot" | "blue" | "lav" | "pink";
  title: string;
  body: string;
  level: 1 | 2 | 3;
  levelNote: string;
}) {
  return (
    <div className={styles.railStack} data-review-rail="">
      <h2 className={styles.railH}><MacTile emoji={emoji} size="sm" tone={tone} />{title}</h2>
      <div className={`${styles.railCard} ${styles.railBody}`}>{body}</div>
      <div className={styles.railCard}>
        <div className={styles.footNote}>{t(r.railDensity)}</div>
        <div className={styles.railLevel}><DensityDots level={level} t={t} /><b>{t(level === 1 ? addDoorsCopy.density1 : level === 2 ? addDoorsCopy.density2 : addDoorsCopy.density3)}</b></div>
        <div className={`${styles.footNote} ${styles.railLevelNote}`}>{levelNote}</div>
      </div>
    </div>
  );
}
