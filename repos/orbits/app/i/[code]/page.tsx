/**
 * R15 招待コード · 接收方 `/i/<code>`（DESIGN add-and-invite §2.5、§6）。公开页：不在 `(app)` 组、没有壳、
 * 不经过 proxy（不进登录前缀与引导门禁）。服务端按浏览器语言选文案，用与公开预览接口同一套服务与限流读码
 * （`_landing/load-invite.ts`，不另开接口）；页面头 noindex、no-referrer、标题不带邀请人名字（`_landing/landing-metadata.ts`）。
 */
import type { Metadata } from "next";

import { InviteLanding } from "../../(app)/app/orbit-2026/invite-landing/InviteLanding";
import { inviteLandingLanguage, loadInviteLanding, readInviteLandingSession } from "../_landing/load-invite";
import { inviteLandingMetadata } from "../_landing/landing-metadata";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return inviteLandingMetadata(await inviteLandingLanguage());
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default async function InviteCodePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const [language, session] = await Promise.all([inviteLandingLanguage(), readInviteLandingSession()]);
  const initial = await loadInviteLanding(safeDecode(code), session.actorId);
  return <InviteLanding language={language} initial={initial} signedIn={session.signedIn} accountName={session.accountName} accountEmail={session.accountEmail} />;
}
