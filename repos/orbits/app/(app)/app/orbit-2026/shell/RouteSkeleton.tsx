"use client";

import { usePathname, useSearchParams } from "next/navigation";

import { useOrbitLanguage } from "../../orbit-language-context";
import { AccountLayout, accountSectionFor } from "../account/AccountLayout";
import { ProfileSkeleton } from "../account/AccountProfilePage";
import { Bone, Orbit2026Scope, Skeleton, useStandardCopy } from "../ui";
import { agentConnectionPageSkeleton } from "../agent-connections/skeletons";
import { PageSkeletonBody, pageSkeletonFor, type PageSkeletonKind } from "./PageSkeleton";

/**
 * app/(app)/app/loading.tsx: a left-rail page's own layout in skeletons; a settings section, the settings
 * menu (real, the section selected) beside its heading and body as bones; any other page, the plain lines.
 */
export function RouteSkeleton({ plainClassName }: { plainClassName: string }) {
  const pathname = usePathname() ?? "";
  const kind = pageSkeletonFor(pathname);
  const copy = useStandardCopy();
  if (kind === "events") return <EventsRouteSkeleton label={copy.loading.loading} />;
  if (kind) return <PageSkeletonBody kind={kind} label={copy.loading.loading} />;
  // agent-design AG17: the consent page (no navigation) and the confirm page draw their own columns.
  const agentPage = agentConnectionPageSkeleton(pathname, copy.loading.loading);
  if (agentPage) return agentPage;
  if (/^\/app\/(profile|settings)(\/[^/]+)*\/?$/u.test(pathname) && !/^\/app\/profile\/./u.test(pathname)) {
    const section = accountSectionFor(pathname === "/app/profile" ? "/app/profile" : pathname);
    return <AccountLayout active={section} shell={false}>{section === "profile" || section === "home" ? <ProfileSkeleton /> : <Skeleton lines={5} />}</AccountLayout>;
  }
  return <div className={plainClassName}><Skeleton lines={5} /></div>;
}

/**
 * 2026-11-24 /app/events：页签只由 ?tab= 决定（events-model tabOf：assess / going，其余 = 探す），
 * 路由骨架按它画对应页签的布局，直接打开 評価 / 参加予定 时第一块不跳。只在这条路径上读查询参数。
 */
function EventsRouteSkeleton({ label }: { label: string }) {
  const tab = useSearchParams()?.get("tab");
  const kind: PageSkeletonKind = tab === "assess" ? "eventsAssess" : tab === "going" ? "eventsGoing" : "events";
  return <PageSkeletonBody kind={kind} label={label} />;
}

/** For a legacy page (no new-UI scope of its own, RD-18): the page's skeleton in a scope island. */
export function ScopedPageSkeleton({ kind, label }: { kind: PageSkeletonKind; label: string }) {
  const { language } = useOrbitLanguage();
  return <Orbit2026Scope language={language}><PageSkeletonBody kind={kind} label={label} bare /></Orbit2026Scope>;
}

/** For a legacy page: one skeleton bone (a pill-shaped control, a count line) in a scope island. */
export function ScopedBone({ width, height, round = false, label }: { width: number | string; height: number; round?: boolean; label?: string }) {
  const { language } = useOrbitLanguage();
  return <Orbit2026Scope language={language}><span role={label ? "progressbar" : undefined} aria-busy={label ? true : undefined} aria-label={label} style={{ display: "flex" }}><Bone width={width} height={height} round={round} /></span></Orbit2026Scope>;
}
