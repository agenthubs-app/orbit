"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import type { OrbitLanguage } from "../../../shared/contract/language";
import {
  Avatar, Bone, Button, CategoryTabs, DegradedCard, QuotaChip, QuotaMeter, RetryCard, WhyBody, WhyButton, CheckCircle, Checkbox, Chip, ConfirmCard, ConfirmDialog, FilterOption, Icon, Kbd, ListRow, MacTile,
  Orbit2026Scope, Popover, Radio, Toggle, useStandardCopy, type ChipTone,
} from "../../(app)/app/orbit-2026/ui";
import { ToastPreview } from "../../(app)/app/orbit-2026/ui/Toast";
import samples from "./cell-samples.json";
import type { CellId } from "./cell-ids";
import styles from "./cells.module.css";

// R31b（U02）：01-system 规格格 ↔ 展示页小节。每格 = 一个渲染函数 + 固定宽度（= 规格格宽）。
// 浮层格（Modal 等）在视口里按组件自己的定位画，清单的 region 按 1440×900 视口换算（见 views/web-R31b-components.json）。
type Cell = { width: number; render: () => ReactNode; /** 打开后把焦点移走（设计稿没画焦点环的弹出层）。 */ blur?: boolean; /** 画在 (left, 0)：Popover 离视口边至少 8，锚点贴边时整格右移 8（清单 region 同步）。 */ left?: number };

const S = samples;

function ConfirmCell() {
  return (
    <ConfirmDialog open title={S.confirm.title} message={S.confirm.body} confirmLabel={S.confirm.confirm} destructive onConfirm={() => undefined} onCancel={() => undefined} />
  );
}

function PopoverCell() {
  const copy = useStandardCopy();
  const anchor = useRef<HTMLButtonElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return (
    <div style={{ width: 340 }}>
      <Button ref={anchor} label={S.popover.trigger} icon="filter" className={styles.trigger} />
      <Popover open={ready} onClose={() => undefined} anchor={anchor} label={S.popover.title} width={340}>
        <div className={`${styles.row} ${styles.between}`}><b>{S.popover.title}</b><Button label={copy.filter.clear} size="sm" variant="ghost" /></div>
        <div className={styles.chips} style={{ marginTop: 10, gap: 7 }}>
          {S.popover.options.map((option) => <FilterOption key={option} label={option.replace("*", "")} selected={option.endsWith("*")} onToggle={() => undefined} />)}
        </div>
        <div className={styles.row} style={{ marginTop: 14, gap: 8 }}>
          <span className={styles.lbl}><Kbd>Esc</Kbd> {S.popover.escClose}</span>
          <Button label={S.popover.show} size="sm" variant="primary" style={{ marginLeft: "auto" }} />
        </div>
      </Popover>
    </div>
  );
}

/** 勾选类控件的布局框是 44 命中区（标记 22 / 20 / 18 居中）；规格格画的是裸标记、行内 gap 14，展示格用负外边距把命中区收回标记大小再排。 */
function Mark({ size, children }: { size: number; children: ReactNode }) {
  return <span style={{ display: "inline-flex", margin: -(44 - size) / 2 }}>{children}</span>;
}

function ControlsCell() {
  const c = S.ctl;
  return (
    <div className={styles.grid} style={{ gap: 14, width: 359 }}>
      <div className={styles.row} style={{ gap: 14 }}><Toggle checked={false} onChange={() => undefined} label="off" /><Toggle checked onChange={() => undefined} label="on" /><span className={styles.lbl} lang="zh">{c.toggle}<code lang="zh">{c.toggleCode}</code></span></div>
      <div className={styles.row} style={{ gap: 14 }}><Mark size={22}><CheckCircle checked={false} onChange={() => undefined} label="off" /></Mark><Mark size={22}><CheckCircle checked onChange={() => undefined} label="on" /></Mark><span className={styles.lbl} lang="zh">{c.circle}<code lang="zh">{c.circleCode}</code></span></div>
      <div className={styles.row} style={{ gap: 14 }}><Mark size={20}><Checkbox checked={false} onChange={() => undefined} label="off" /></Mark><Mark size={20}><Checkbox checked onChange={() => undefined} label="on" /></Mark><span className={styles.lbl} lang="zh">{c.box}</span></div>
      <div className={styles.row} style={{ gap: 14 }}><Mark size={18}><Radio selected={false} onSelect={() => undefined} label="off" /></Mark><Mark size={18}><Radio selected onSelect={() => undefined} label="on" /></Mark><span className={styles.lbl} lang="zh">{c.radio}</span></div>
      <div className={styles.row} style={{ gap: 6, flexWrap: "wrap" }}>
        <FilterOption label={c.fopt[0]!} selected onToggle={() => undefined} /><FilterOption label={c.fopt[1]!} selected={false} onToggle={() => undefined} />
        <CategoryTabs label="cat" value="all" onChange={() => undefined} options={[{ key: "all", label: c.cat[0]! }, { key: "notice", label: c.cat[1]! }]} />
        <span className={styles.lbl} lang="zh">{c.chips}</span>
      </div>
    </div>
  );
}

function ChipsCell() {
  return (
    <div className={styles.grid} style={{ gap: 10, width: 359 }}>
      {(S.chips as [string, string[]][]).map(([tone, words]) => (
        <div key={tone} className={styles.chips}>{words.map((word) => <Chip key={word} label={word} tone={tone as ChipTone} />)}</div>
      ))}
    </div>
  );
}

function KbdPanelCell() {
  const k = S.kbd;
  return (
    <div style={{ width: 420, padding: 10, background: "var(--surface)", borderRadius: 22, boxShadow: "var(--shadow-float)", border: "1px solid var(--line)" }}>
      <div className={styles.row} style={{ gap: 10, padding: "6px 8px 10px", borderBottom: "1px solid var(--line)" }}><Icon name="search" /><b style={{ fontSize: 15, flex: 1 }}>{k.query}</b><Kbd>Esc</Kbd></div>
      {k.rows.map(([name, detail], index) => (
        <div key={name} className={styles.row} style={{ gap: 10, padding: 8, borderRadius: 14, background: index === 0 ? "var(--surface-2)" : undefined }}>
          <Avatar name={name!} size="sm" tone={index === 0 ? "pink" : "blue"} />
          <div style={{ flex: 1, minWidth: 0 }}><b style={{ fontSize: 13, display: "block" }}>{name}</b><span className={styles.lbl}>{detail}</span></div>
          {index === 0 ? <Kbd>↵</Kbd> : null}
        </div>
      ))}
      <div className={styles.keys} style={{ padding: "10px 8px 2px", borderTop: "1px solid var(--line)", marginTop: 6 }}>
        <span><Kbd>↑</Kbd><Kbd>↓</Kbd>{k.move}</span><span><Kbd>↵</Kbd>{k.open}</span><span><Kbd>Tab</Kbd>{k.switch}</span><span style={{ marginLeft: "auto" }}><Kbd>⌘</Kbd><Kbd>↵</Kbd>{k.ask}</span>
      </div>
    </div>
  );
}

function ToastCell() {
  const t = S.toast;
  return (
    <div className={styles.grid} style={{ gap: 10, width: 359 }}>
      <ToastPreview kind="success" message={t.done} undoLabel={t.undo} />
      <ToastPreview kind="success" icon="clock" message={t.moved} sub={t.movedSub} undoLabel={t.undo} />
      <ToastPreview kind="info" icon="plus" message={t.added} actionLabel={t.open} />
      <ToastPreview kind="error" message={t.failed} actionLabel={t.retry} actionIcon="refresh" countdown={false} />
      <ToastPreview kind="info" icon="wifioff" message={t.offline} sub={t.offlineSub} countdown={false} />
    </div>
  );
}

function AiCell({ state }: { state: "pending" | "success" | "failure" }) {
  const a = S.ai;
  if (state === "pending") return <ConfirmCard state="pending" emoji="📝" title={a.confirmTitle} detail={a.confirmBody} actions={[{ label: a.add, onSelect: () => undefined, primary: true }, { label: a.decline, onSelect: () => undefined }]} />;
  if (state === "success") return <ConfirmCard state="success" title={a.okTitle} detail={a.okBody} undo={{ label: a.undo, onSelect: () => undefined }} link={{ label: a.okLink, href: "#plan" }} />;
  return <ConfirmCard state="failure" title={a.ngTitle} reason={a.ngReason} detail={a.ngBody} actions={[{ label: a.reconnect, onSelect: () => undefined, primary: true }, { label: a.again, onSelect: () => undefined }, { label: a.later, onSelect: () => undefined, ghost: true }]} />;
}

function WhyCard({ open }: { open: boolean }) {
  const w = S.why;
  const [shown, setShown] = useState(open);
  const id = useId();
  return (
    <div className={styles.card} style={{ padding: 16 }}>
      <div className={styles.row} style={{ gap: 8 }}><MacTile emoji="🎯" tone="apricot" size="sm" /><b style={{ fontSize: 13 }}>{w.title}</b><span style={{ marginLeft: "auto", display: "inline-flex" }}><WhyButton open={shown} onToggle={() => setShown(!shown)} controls={id} /></span></div>
      <div style={{ fontSize: 14, fontWeight: 700, marginTop: 8, lineHeight: 1.55 }}>{w.text}</div>
      <WhyBody id={id} open={shown}>{w.body}</WhyBody>
    </div>
  );
}

function WhyCell() {
  const w = S.why;
  const [shown, setShown] = useState(false);
  const id = useId();
  return (
    <div style={{ width: 359 }}>
      <WhyCard open={false} />
      <div style={{ marginTop: 10 }}><WhyCard open /></div>
      <div style={{ marginTop: 12 }}>
        <div className={styles.row} style={{ gap: 6 }}><span className={styles.chipFill}><Chip label={w.chip} tone="lav" /></span><WhyButton open={shown} onToggle={() => setShown(!shown)} controls={id} /></div>
        <WhyBody id={id} open={shown}>{w.chipBody}</WhyBody>
      </div>
    </div>
  );
}

function SkeletonCell() {
  return (
    <div className={styles.card} style={{ padding: "14px 16px", width: 280 }} role="progressbar" aria-busy aria-label="loading">
      <Bone width="40%" height={11} /><div style={{ marginTop: 10 }}><Bone width="52%" height={30} /></div>
      {[78, 64, 70].map((w) => (
        <div key={w} className={styles.row} style={{ marginTop: 14 }}><Bone width={38} height={38} round /><div style={{ flex: 1 }}><Bone width={`${w}%`} height={11} /><div style={{ marginTop: 7 }}><Bone width={`${w - 22}%`} height={9} /></div></div></div>
      ))}
    </div>
  );
}

function PayCell() {
  const p = S.pay;
  return (
    <div style={{ width: 300 }}>
      <div className={styles.card} style={{ padding: 14 }}>
        <div className={`${styles.row} ${styles.between}`}><b style={{ fontSize: 13 }}>{p.title}</b><QuotaChip left={2} /></div>
        <div style={{ marginTop: 10 }}><QuotaMeter used={1} total={3} label="1 / 3" /></div>
        <div className={styles.lbl} style={{ marginTop: 8 }}>{p.note}</div>
        <Button label={p.run} icon="refresh" variant="primary" block style={{ marginTop: 12 }} />
      </div>
      <div className={styles.row} style={{ marginTop: 10, gap: 8 }}><QuotaChip left={0} /><span className={styles.lbl} lang="zh">{p.outNote}</span></div>
    </div>
  );
}

function TextCell({ kind }: { kind: 0 | 1 | 2 }) {
  const x = S.text;
  if (kind === 0) return <div style={{ width: 330, padding: "6px 14px", background: "var(--surface)", borderRadius: 22 }}><ListRow title={x.name} subtitle={`${x.company} · ${x.role}`} leading={<Avatar name={x.name} tone="blue" />} trailing={<Chip label={x.stage} tone="blue" />} /></div>;
  if (kind === 1) return null;
  return null;
}

const CELLS: Record<CellId, Cell> = {
  "c-toast-0": { width: 359, render: () => <ToastCell /> },
  "c-confirm-2": { width: 446, render: () => <ConfirmCell /> },
  "c-layer-2": { width: 340, render: () => <PopoverCell />, blur: true, left: 8 },
  "c-ai-0": { width: 280, render: () => <AiCell state="pending" /> },
  "c-ai-1": { width: 280, render: () => <AiCell state="success" /> },
  "c-ai-2": { width: 300, render: () => <AiCell state="failure" /> },
  "c-chip-0": { width: 359, render: () => <ChipsCell /> },
  "c-why-0": { width: 359, render: () => <WhyCell /> },
  "c-load-0": { width: 280, render: () => <SkeletonCell /> },
  "c-err-1": { width: 290, render: () => <RetryCard title={S.err.retryTitle} onRetry={() => undefined} onViewCached={() => undefined} /> },
  "c-err-2": { width: 290, render: () => <div><DegradedCard title={S.err.degTitle} message={S.err.degBody} onRetry={() => undefined} />{/* 规格格里两块 .degrade 是 .cell（flex 列，gap 8）的两个子项，再加 margin-top 8 = 16 */}<div style={{ marginTop: 16 }}><DegradedCard title={S.err.deg2Title} message={S.err.deg2Body} /></div></div> },
  "c-pay-0": { width: 300, render: () => <PayCell /> },
  "c-kbd-0": { width: 420, render: () => <KbdPanelCell /> },
  "c-text-0": { width: 330, render: () => <TextCell kind={0} /> },
  "c-ctl-0": { width: 359, render: () => <ControlsCell /> },
  "mac-tile": { width: 120, render: () => <div className={styles.row}><MacTile emoji="📝" /><MacTile emoji="🎯" tone="apricot" size="sm" /></div> },
};

export function ComponentCell({ id, language, theme }: { id: CellId; language: OrbitLanguage; theme: "light" | "dark" | null }) {
  const cell = CELLS[id];
  useEffect(() => {
    if (!theme) return;
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);
  useEffect(() => {
    if (!cell.blur) return;
    const timer = setTimeout(() => (document.activeElement as HTMLElement | null)?.blur(), 300);
    return () => clearTimeout(timer);
  }, [cell.blur]);
  return (
    <Orbit2026Scope language={language} as="main" className={styles.page} reducedMotion>
      <div className={styles.cell} style={{ width: cell.width, left: cell.left ?? 0 }} data-showcase-cell={id}>{cell.render()}</div>
    </Orbit2026Scope>
  );
}
