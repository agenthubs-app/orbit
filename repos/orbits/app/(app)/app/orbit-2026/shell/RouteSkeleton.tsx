"use client";

import { usePathname } from "next/navigation";

import { useOrbitLanguage } from "../../orbit-language-context";
import { AccountLayout, accountSectionFor } from "../account/AccountLayout";
import { ProfileSkeleton } from "../account/AccountProfilePage";
import { Bone, Orbit2026Scope, Skeleton, useStandardCopy } from "../ui";
import { PageSkeletonBody, pageSkeletonFor, type PageSkeletonKind } from "./PageSkeleton";

/**
 * app/(app)/app/loading.tsx: a left-rail page's own layout in skeletons; a settings section, the settings
 * menu (real, the section selected) beside its heading and body as bones; any other page, the plain lines.
 */
export function RouteSkeleton({ plainClassName }: { plainClassName: string }) {
  const pathname = usePathname() ?? "";
  const kind = pageSkeletonFor(pathname);
  const copy = useStandardCopy();
  if (kind) return <PageSkeletonBody kind={kind} label={copy.loading.loading} />;
  if (/^\/app\/(profile|settings)(\/[^/]+)*\/?$/u.test(pathname) && !/^\/app\/profile\/./u.test(pathname)) {
    const section = accountSectionFor(pathname === "/app/profile" ? "/app/profile" : pathname);
    return <AccountLayout active={section} shell={false}>{section === "profile" || section === "home" ? <ProfileSkeleton /> : <Skeleton lines={5} />}</AccountLayout>;
  }
  return <div className={plainClassName}><Skeleton lines={5} /></div>;
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
