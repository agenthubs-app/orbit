/**
 * R11b 像素门禁用：把人脈分析的 mock 世界换成「设计稿示例 fixture」（features/network-analysis/analysis-fixtures.ts）。
 * - `route.dev.ts`：只在非生产当路由，生产构建不收录。
 * - 运行时闸：NODE_ENV=production 或 network-analysis 不是 mock 时一律 404。
 * - `POST { variant: "empty" | "locked5" | "few14" | "many286" | null }` 切换（null 回到演示世界）；`GET` 列出变体与当前值。
 */
import { NextResponse } from "next/server";

import { NETWORK_DESIGN_VARIANTS, activeNetworkFixture, installNetworkFixtureWorld, type NetworkDesignVariant } from "../../../../features/network-analysis/analysis-fixtures";
import { designNetworkWorld } from "../../../../features/network-analysis/design-fixtures";
import { redesignContractMode } from "../../../../features/redesign-contracts/route";

export const dynamic = "force-dynamic";
const HEADERS = { "Cache-Control": "no-store", "X-Orbit-Runtime-Boundary": "developer-local" } as const;
const available = () => process.env.NODE_ENV !== "production" && redesignContractMode("network-analysis") === "mock";
const notFound = () => NextResponse.json({ error: "not_found" }, { headers: HEADERS, status: 404 });

export async function GET() {
  if (!available()) return notFound();
  return NextResponse.json({ variants: NETWORK_DESIGN_VARIANTS, variant: activeNetworkFixture().variant }, { headers: HEADERS });
}

export async function POST(request: Request) {
  if (!available()) return notFound();
  const body = (await request.json().catch(() => null)) as { variant?: unknown } | null;
  const variant = body?.variant;
  if (variant !== null && !(NETWORK_DESIGN_VARIANTS as readonly unknown[]).includes(variant)) {
    return NextResponse.json({ error: "unknown_variant" }, { headers: HEADERS, status: 400 });
  }
  return NextResponse.json({ variant: installNetworkFixtureWorld(variant === null ? null : designNetworkWorld(variant as NetworkDesignVariant)) }, { headers: HEADERS });
}
