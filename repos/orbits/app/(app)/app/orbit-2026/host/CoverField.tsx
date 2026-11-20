"use client";

// 2026-11-20 カバー画像（主办表单第一项，event-web-revisit-cover-width-proposal 第 9 张）：
// 未设置 = 2:1 虚线拖放框；选了新图 = 2:1 框内上下拖动调整位置（focusY，保存时服务端按它裁成 2:1）+「変更」「削除」；
// 已保存的图（服务端已裁好）只有「変更」「削除」。
import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { Icon } from "../ui";
import type { HostT } from "./host-model";
import s from "./host.module.css";
import r from "../events/record.module.css";

/** 拖动的位移 → 新的 focusY（图比 2:1 高时才能动；往下拖 = 看更上面的部分）。 */
export function dragFocus(startFocus: number, dy: number, box: { width: number; height: number }, natural: { width: number; height: number }): number {
  if (!natural.width || !natural.height || !box.width) return startFocus;
  const shown = (box.width * natural.height) / natural.width;
  const overflow = shown - box.height;
  if (overflow <= 0) return startFocus;
  return Math.max(0, Math.min(1, startFocus - dy / overflow));
}

export function CoverField({ t, url, adjustable, focusY, disabled = false, onPick, onFocus, onRemove }: { t: HostT; url: string | null; adjustable: boolean; focusY: number; disabled?: boolean; onPick: (file: File) => void; onFocus: (focusY: number) => void; onRemove: () => void }) {
  const input = useRef<HTMLInputElement | null>(null);
  const img = useRef<HTMLImageElement | null>(null);
  const drag = useRef<{ y: number; focus: number } | null>(null);
  const [over, setOver] = useState(false);
  const choose = () => { if (!disabled) input.current?.click(); };
  const take = (files: FileList | null) => { const file = files?.[0]; if (file && !disabled) onPick(file); };
  const down = (ev: ReactPointerEvent<HTMLDivElement>) => {
    if (!adjustable || disabled || (ev.target as HTMLElement).closest("button")) return;
    drag.current = { focus: focusY, y: ev.clientY };
    ev.currentTarget.setPointerCapture(ev.pointerId);
  };
  const move = (ev: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current || !img.current) return;
    const box = ev.currentTarget.getBoundingClientRect();
    onFocus(dragFocus(drag.current.focus, ev.clientY - drag.current.y, { height: box.height, width: box.width }, { height: img.current.naturalHeight, width: img.current.naturalWidth }));
  };
  const up = () => { drag.current = null; };
  return (
    <div className={r.coverField} data-host-cover={url ? (adjustable ? "new" : "saved") : "empty"}>
      <span className={`${s.lbl} ${r.coverLbl}`}>{t("evCover")}<small>{t("evCoverSpec")}</small></span>
      <input ref={input} type="file" className={r.hidden} accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" aria-label={t("evCover")} onChange={(ev) => { take(ev.target.files); ev.target.value = ""; }} />
      {url ? (
        <div className={`${r.crop} ${adjustable ? r.cropDrag : ""}`} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
          {/* eslint-disable-next-line @next/next/no-img-element -- 本地预览（blob:）或已保存的图 */}
          <img ref={img} src={url} alt="" draggable={false} style={{ objectPosition: `50% ${Math.round(focusY * 100)}%` }} />
          {adjustable ? <span className={r.hint}>{t("evCoverDrag")}</span> : null}
          <div className={r.cropActs}>
            <button type="button" className={`btn ${s.btn} ${s.sm} ${r.cropBtn}`} disabled={disabled} onClick={choose}>{t("evCoverChange")}</button>
            <button type="button" className={`btn ${s.btn} ${s.sm} ${r.cropBtn}`} disabled={disabled} onClick={onRemove} data-host-cover-remove=""><Icon name="x" size={16} />{t("evCoverRemove")}</button>
          </div>
        </div>
      ) : (
        <button type="button" className={`btn ${r.drop} ${over ? r.dropOver : ""}`} disabled={disabled} onClick={choose}
          onDragOver={(ev) => { ev.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(ev) => { ev.preventDefault(); setOver(false); take(ev.dataTransfer.files); }} data-host-cover-drop="">
          <Icon name="image" size={24} />
          <b>{t("evCoverDrop")}</b>
          <span className={s.lbl}>{t("evCoverTypes")}</span>
        </button>
      )}
    </div>
  );
}
