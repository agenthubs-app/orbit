"use client";

import qrcode from "qrcode-generator";
import { useMemo } from "react";

import styles from "./invite.module.css";

/**
 * The invite link as a QR code (qrcode-generator 1.4.4, pure JS; DESIGN §7). One SVG path of dark modules
 * on a light quiet zone, drawn with `currentColor` so the colours come from the tokens in the CSS module
 * (light: ink on surface; dark: the same contrast kept dark-on-light so phone cameras read it).
 */
export function inviteQrPath(text: string): { size: number; path: string } {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const count = qr.getModuleCount();
  let path = "";
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) if (qr.isDark(row, col)) path += `M${col + 4} ${row + 4}h1v1h-1z`;
  }
  return { size: count + 8, path };
}

export function InviteQr({ text, label, size = "md" }: { text: string; label: string; size?: "md" | "lg" }) {
  const { size: box, path } = useMemo(() => inviteQrPath(text), [text]);
  return (
    <span className={`${styles.qr} ${size === "lg" ? styles.qrLarge : ""}`} data-invite-qr={size}>
      <svg viewBox={`0 0 ${box} ${box}`} role="img" aria-label={label} shapeRendering="crispEdges">
        <path d={path} fill="currentColor" />
      </svg>
    </span>
  );
}
