/**
 * R15 像素门禁的只读演示（同 R12 `scan-design-fixture-gate.ts` 的做法）：本机 mock（`ORBIT_REDESIGN_MOCK` 含
 * `invite-codes` 或 `all`）下，`/i/<码>?design=done` 直接打开「つながりました」（b11 #10），不兑换、不写任何数据。
 * 生产与 live 永远关闭。
 */
import type { InviteLandingInitial, InviteLandingView } from "../../(app)/app/orbit-2026/invite-landing/landing-model";

export function inviteDesignFixturesEnabled(env: Record<string, string | undefined> = process.env): boolean {
  if (env.NODE_ENV === "production" || env.VERCEL_ENV === "production") return false;
  const listed = (env.ORBIT_REDESIGN_MOCK ?? "").split(",").map((entry) => entry.trim());
  return listed.includes("all") || listed.includes("invite-codes");
}

/** What the fixture says I shared (b11 #10: 名前 · 会社・役職 · 提供できること). */
export const INVITE_DESIGN_SHARED_BY_ME = ["organization", "offering"] as const;

/** The view to open on, or undefined (no fixture asked, fixtures off, or nothing to show it with). */
export function inviteDesignView(design: string | undefined, initial: InviteLandingInitial, env: Record<string, string | undefined> = process.env): InviteLandingView | undefined {
  if (design !== "done" || !inviteDesignFixturesEnabled(env) || initial.kind !== "preview") return undefined;
  const { shared } = initial.preview;
  return { view: "done", result: { outcome: "connected", contactId: "demo-design-fixture", peer: shared } };
}
