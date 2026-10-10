"use client";

import { useRef, type KeyboardEvent } from "react";

import { Icon } from "./Icon";
import styles from "./Controls.module.css";

// kit .tgl: 44 × 26, on = plum-700 (green only means "done"). A real switch.
export function Toggle({ checked, onChange, label, disabled = false }: { checked: boolean; onChange: (next: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} className={`btn ${styles.toggle} ${checked ? styles.on : ""}`} onClick={() => onChange(!checked)}>
      <span className={styles.knob} aria-hidden />
    </button>
  );
}

// kit .ckr: the round completion check (22). Done = ok green (RD-17 「完成」).
export function CheckCircle({ checked, onChange, label }: { checked: boolean; onChange: (next: boolean) => void; label: string }) {
  return (
    <button type="button" role="checkbox" aria-checked={checked} aria-label={label} className={`btn ${styles.hit} ${styles.circle} ${checked ? styles.circleOn : ""}`} onClick={() => onChange(!checked)}>
      <span className={styles.circleMark} aria-hidden><Icon name="check" size={16} /></span>
    </button>
  );
}

// kit .cbx: the square checkbox for multi-select (20, radius 7-ish), plum-700 when on.
export function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (next: boolean) => void; label: string }) {
  return (
    <button type="button" role="checkbox" aria-checked={checked} aria-label={label} className={`btn ${styles.hit} ${styles.box} ${checked ? styles.boxOn : ""}`} onClick={() => onChange(!checked)}>
      <span className={styles.boxMark} aria-hidden><Icon name="check" size={16} /></span>
    </button>
  );
}

export function Radio({ selected, onSelect, label }: { selected: boolean; onSelect: () => void; label: string }) {
  return (
    <button type="button" role="radio" aria-checked={selected} aria-label={label} className={`btn ${styles.hit} ${styles.radio} ${selected ? styles.radioOn : ""}`} onClick={onSelect}>
      <span className={styles.radioMark} aria-hidden />
    </button>
  );
}

export type Segment<Key extends string> = { key: Key; label: string };

// kit .seg / .tseg: equal options on a surface-2 pill; the chosen one on surface.
// Arrow keys move between options (WAI-ARIA tabs pattern, automatic activation).
export function Segmented<Key extends string>({ segments, value, onChange, label, wide = false }: { segments: Segment<Key>[]; value: Key; onChange: (key: Key) => void; label: string; wide?: boolean }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const move = (event: KeyboardEvent, index: number) => {
    const delta = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    const target = event.key === "Home" ? 0 : event.key === "End" ? segments.length - 1 : delta ? (index + delta + segments.length) % segments.length : -1;
    if (target < 0) return;
    event.preventDefault();
    onChange(segments[target]!.key);
    refs.current[target]?.focus();
  };
  return (
    <div role="tablist" aria-label={label} className={`${styles.seg} ${wide ? styles.segWide : ""}`}>
      {segments.map((segment, index) => {
        const selected = segment.key === value;
        return (
          <button key={segment.key} ref={(node) => { refs.current[index] = node; }} type="button" role="tab" aria-selected={selected} tabIndex={selected ? 0 : -1}
            className={`btn ${styles.segOption} ${selected ? styles.segOn : ""}`} onClick={() => onChange(segment.key)} onKeyDown={(event) => move(event, index)}>
            {segment.label}
          </button>
        );
      })}
    </div>
  );
}

// kit .fopt: a multi-select filter chip (plum outline + ✓ when on), optional count.
export function FilterOption({ label, selected, count, onToggle }: { label: string; selected: boolean; count?: number; onToggle: () => void }) {
  return (
    <button type="button" aria-pressed={selected} className={`btn ${styles.fopt} ${selected ? styles.foptOn : ""}`} onClick={onToggle}>
      {selected ? <Icon name="check" size={16} /> : null}
      {label}
      {count !== undefined ? <small className={styles.count}>{count}</small> : null}
    </button>
  );
}

// kit .cat: single-choice category tabs, ink fill when chosen.
// Arrow keys move the choice like any radio group (review m3).
export function CategoryTabs<Key extends string>({ options, value, onChange, label }: { options: { key: Key; label: string; count?: number }[]; value: Key; onChange: (key: Key) => void; label: string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const move = (event: KeyboardEvent, index: number) => {
    const delta = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    const target = (index + delta + options.length) % options.length;
    onChange(options[target]!.key);
    refs.current[target]?.focus();
  };
  return (
    <div role="radiogroup" aria-label={label} className={styles.cats}>
      {options.map((option, index) => (
        <button key={option.key} ref={(node) => { refs.current[index] = node; }} type="button" role="radio" aria-checked={option.key === value} tabIndex={option.key === value ? 0 : -1} onKeyDown={(event) => move(event, index)} className={`btn ${styles.cat} ${option.key === value ? styles.catOn : ""}`} onClick={() => onChange(option.key)}>
          {option.label}
          {option.count !== undefined ? <small className={styles.count}>{option.count}</small> : null}
        </button>
      ))}
    </div>
  );
}
