"use client";

import qrcode from "qrcode-generator";
import { useMemo } from "react";

import styles from "./invite.module.css";

/**
 * The invite link as a QR code (qrcode-generator 1.4.4, pure JS; DESIGN §7). One SVG path of dark modules,
 * drawn with `currentColor` so the colours come from the tokens in the CSS module (light: ink on surface; dark:
 * the same contrast kept dark-on-light so phone cameras read it). b11 #14 puts the Orbit 「O」 in the middle, so
 * the code uses the highest error correction (H, 30%) and the badge covers well under that. Two modules of quiet
 * zone sit inside the 8px frame (together about four, the minimum readers expect).
 */
export function inviteQrPath(text: string): { size: number; path: string } {
  const qr = qrcode(0, "H");
  qr.addData(text);
  qr.make();
  const count = qr.getModuleCount();
  let path = "";
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) if (qr.isDark(row, col)) path += `M${col + 2} ${row + 2}h1v1h-1z`;
  }
  return { size: count + 4, path };
}

export function InviteQr({ text, label }: { text: string; label: string }) {
  const { size: box, path } = useMemo(() => inviteQrPath(text), [text]);
  return (
    <span className={styles.qr} data-invite-qr="">
      <svg viewBox={`0 0 ${box} ${box}`} role="img" aria-label={label} shapeRendering="crispEdges">
        <path d={path} fill="currentColor" />
      </svg>
      <span className={styles.qrBadge} aria-hidden>O</span>
    </span>
  );
}
