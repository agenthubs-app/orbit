"use client";

// 2026-11-12 イベント詳細 · 紹介：主催者が貼った長文を Markdown として描く（見出し・箇条書き・リンク・改行）。
// 長い時は約 10 行で畳んで「続きを読む」（Luma / Peatix と同じ）。raw HTML は描かない、画像も出さない（外部ピクセル対策）。
import { useLayoutEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { Icon } from "../ui";
import type { JourneyT } from "./DiscoverTab";
import styles from "./events.module.css";
import x from "./detail.module.css";

/** 畳んだ時の高さ（px）と、畳む価値がある最小の全高。 */
export const DESCRIPTION_CLAMP_PX = 240;
const CLAMP_WORTH_PX = 320;

/** 貼られた文を Markdown に寄せる：Windows 改行、「• 」箇条書き（行頭でも文中でも項目の始まり）、単独改行＝そのまま改行。 */
export function descriptionToMarkdown(raw: string): string {
  const text = raw.replace(/\r\n?/g, "\n").trim();
  const lines = text.replace(/(^|\n|[ \t\u3000]+)[•●] +/g, (_match, pre: string) => `${pre === "" || pre === "\n" ? pre : "\n"}- `).split("\n");
  // 行の継ぎ方：空行はそのまま；箇条書き同士は普通の改行；箇条書きの次が地の文なら段落を分ける（lazy continuation で項目に吸われない）；それ以外は強制改行。
  return lines.map((line, index) => {
    const next = lines[index + 1];
    if (next === undefined) return line;
    if (line === "" || next === "") return `${line}\n`;
    const bullet = /^- /.test(line);
    if (bullet && /^- /.test(next)) return `${line}\n`;
    if (bullet) return `${line}\n\n`;
    return `${line}  \n`;
  }).join("");
}

export function EventDescription({ text, t, className }: { text: string | null | undefined; t: JourneyT; className?: string }) {
  const body = useRef<HTMLDivElement | null>(null);
  const [clampable, setClampable] = useState(false);
  const [open, setOpen] = useState(false);
  const markdown = text?.trim() ? descriptionToMarkdown(text) : "";
  useLayoutEffect(() => {
    const el = body.current;
    if (!el) return;
    const measure = () => setClampable(el.scrollHeight > CLAMP_WORTH_PX);
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(el);
    return () => observer?.disconnect();
  }, [markdown]);
  if (!markdown) return null;
  const collapsed = clampable && !open;
  return (
    <div className={className} data-event-description={collapsed ? "collapsed" : "open"}>
      <div ref={body} className={`${x.md} ${collapsed ? x.mdClamp : ""}`}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            a: ({ children, href }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
            img: () => null,
          }}
        >
          {markdown}
        </ReactMarkdown>
      </div>
      {clampable ? (
        <button type="button" className={`btn ${styles.btn} ${styles.sm} ${x.mdMore}`} aria-expanded={!collapsed} data-event-description-toggle="" onClick={() => setOpen((value) => !value)}>
          {t(collapsed ? "readMore" : "readLess")}<Icon name={collapsed ? "down" : "up"} size={16} />
        </button>
      ) : null}
    </div>
  );
}
