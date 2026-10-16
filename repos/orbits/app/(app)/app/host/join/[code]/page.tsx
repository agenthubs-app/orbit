/**
 * R17 共同運営に参加 · 落地（host DESIGN §2.8；b12 #414）：未登录先看邀请预览（公开接口，客户端读），登录后「参加する」。
 * 页面不在登录前缀表里（未登录可开）；码只交给接口，页面本身不读活动。
 */
import type { Metadata } from "next";

import { resolveAuthenticatedApiActor } from "../../../../../api/_shared/authenticated-actor";
import { getOrbitServerLanguage } from "../../../orbit-language-server";
import { HostJoin } from "../../../orbit-2026/host/HostJoin";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { referrer: "no-referrer", robots: { follow: false, index: false } };

function decode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default async function HostJoinPage({ params }: { params: Promise<{ code: string }> }) {
  const [{ code }, actor, language] = await Promise.all([params, resolveAuthenticatedApiActor().catch(() => null), getOrbitServerLanguage()]);
  const value = decode(code).trim().slice(0, 64);
  return <HostJoin code={value || null} signedIn={Boolean(actor)} language={language} />;
}
