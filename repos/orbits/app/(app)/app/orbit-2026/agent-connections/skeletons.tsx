"use client";

/**
 * agent-design AG17: what app/(app)/app/loading.tsx shows for the consent page and the confirm page while their server
 * work runs — each page's own column (brand and card; the «who proposed» row and the card), so nothing moves when the
 * page arrives (web-no-flash-and-cache-rules 一、1).
 */
import type { ReactNode } from "react";

import { Bone } from "../ui";
import s from "./agent-connections.module.css";

export const CONSENT_PATH = "/app/settings/agent-connections/authorize";

export function ConfirmPageSkeleton({ label }: { label: string }) {
  return (
    <div className={s.confirmPage} role="progressbar" aria-busy aria-label={label} data-orbit-proposal-skeleton="">
      <div className={s.who}><Bone width={52} height={52} /><span style={{ display: "grid", gap: 8 }}><Bone width={180} height={22} /><Bone width={240} height={14} /></span></div>
      <i className={s.cardBone} aria-hidden />
    </div>
  );
}

export function agentConnectionPageSkeleton(pathname: string, label: string): ReactNode | null {
  const path = pathname.replace(/\/+$/u, "");
  if (path === CONSENT_PATH) {
    return (
      <div className={s.consentPage} role="progressbar" aria-busy aria-label={label}>
        <div className={s.consentColumn}>
          <div className={s.brand}><span className={s.brandLogo} aria-hidden>O</span>Orbit</div>
          <section className={`${s.card} ${s.skeletonCard}`}><Bone width={140} height={52} /><Bone width="70%" height={28} /><Bone width="90%" height={16} /><Bone width="100%" height={64} /></section>
        </div>
      </div>
    );
  }
  if (/^\/app\/agent\/proposals\/[^/]+$/u.test(path)) return <ConfirmPageSkeleton label={label} />;
  return null;
}
