"use client";

// 「並べ替え」モード（b13 HM-S3 / S7b，2026-11-26）：拖拽在触屏（手机、iPad）上不可靠，所以每行给 ↑ ↓ 两个按钮。
// 题目、选项、议程共用这一个组件（申込設定、建活动、基本情報を編集都用）；电脑上原来的拖拽照旧，这是另一种走法。
// 刚移动的那一行浅色底（让人看见它去了哪）；第一行的 ↑、最后一行的 ↓ 置灰。
import { useState, type ReactNode } from "react";

import { Icon } from "../ui";
import type { HostT } from "./host-model";
import r from "./reorder.module.css";

export function ReorderList<T>({ items, keyOf, labelOf, render, onMove, t, note, className }: {
  items: readonly T[];
  keyOf: (item: T, index: number) => string;
  /** 读屏用的名字（「Q2 を上へ」）。 */
  labelOf: (item: T, index: number) => string;
  render: (item: T, index: number) => ReactNode;
  onMove: (from: number, to: number) => void;
  t: HostT;
  note?: string;
  className?: string;
}) {
  const [moved, setMoved] = useState<string | null>(null);
  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length) return;
    setMoved(keyOf(items[from]!, to));
    onMove(from, to);
  };
  return (
    <>
      <div className={`${r.list} ${className ?? ""}`} data-host-reorder={items.length}>
        {items.map((item, index) => {
          const key = keyOf(item, index);
          return (
            <div key={key} className={`${r.row} ${moved === key ? r.mv : ""}`} data-reorder-row={index}>
              <div className={r.body}>{render(item, index)}</div>
              <button type="button" className={`btn ${r.arrow}`} disabled={index === 0} aria-label={t("roUp", { name: labelOf(item, index) })} onClick={() => move(index, index - 1)} data-reorder-up=""><Icon name="up" size={16} /></button>
              <button type="button" className={`btn ${r.arrow}`} disabled={index === items.length - 1} aria-label={t("roDown", { name: labelOf(item, index) })} onClick={() => move(index, index + 1)} data-reorder-down=""><Icon name="down" size={16} /></button>
            </div>
          );
        })}
      </div>
      {note ? <div className={r.note}>{note}</div> : null}
    </>
  );
}
