"use client";

import { usePathname } from "next/navigation";

import { useOrbitLanguage } from "../../orbit-language-context";
import { Orbit2026Scope, Skeleton, useStandardCopy } from "../ui";
import { PageSkeletonBody, pageSkeletonFor, type PageSkeletonKind } from "./PageSkeleton";

/** app/(app)/app/loading.tsx: a left-rail page's own layout in skeletons; any other page, the plain lines. */
export function RouteSkeleton({ plainClassName }: { plainClassName: string }) {
  const kind = pageSkeletonFor(usePathname() ?? "");
  const copy = useStandardCopy();
  return kind ? <PageSkeletonBody kind={kind} label={copy.loading.loading} /> : <div className={plainClassName}><Skeleton lines={5} /></div>;
}

/** For a legacy page (no new-UI scope of its own, RD-18): the page's skeleton in a scope island. */
export function ScopedPageSkeleton({ kind, label }: { kind: PageSkeletonKind; label: string }) {
  const { language } = useOrbitLanguage();
  return <Orbit2026Scope language={language}><PageSkeletonBody kind={kind} label={label} bare /></Orbit2026Scope>;
}
