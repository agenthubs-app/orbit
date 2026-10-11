/**
 * R15 招待コード · 手输码 `/i`（DESIGN add-and-invite §2.5 第 7 条）。公开页（不在 `(app)` 组、没有壳）；
 * 页面头与 `/i/<code>` 相同（noindex、no-referrer、标题「Orbit への招待」）。
 * `?expired=legacy`：旧关系邀请链接 `/app/invitations/<token>` 经 next.config 重定向来的（复核 m3），加一句「这个链接不能用了」。
 */
import type { Metadata } from "next";

import { InviteCodeEntry } from "../(app)/app/orbit-2026/invite-landing/InviteCodeEntry";
import { inviteLandingLanguage } from "./_landing/load-invite";
import { inviteLandingMetadata } from "./_landing/landing-metadata";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return inviteLandingMetadata(await inviteLandingLanguage());
}

export default async function InviteCodeEntryPage({ searchParams }: { searchParams: Promise<{ expired?: string | string[] }> }) {
  const { expired } = await searchParams;
  return <InviteCodeEntry language={await inviteLandingLanguage()} legacyLink={expired === "legacy"} />;
}
