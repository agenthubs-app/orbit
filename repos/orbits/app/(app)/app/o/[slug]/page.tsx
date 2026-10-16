/**
 * R17（host DESIGN §2.11「旧链接」）：旧公开主办页 `/app/o/<slug | eventId | publicCode>` → 302 到所属资料的 `/o/<slug>`。
 * 先按资料 slug 认，认不出再当活动别名查所属资料（`organizerSlugForEvent`）；`?follow=1`（登录后回来自动关注）原样带过去。
 * 公开主办方页的登录回跳也走这里：`normalizeOrbitAuthReturnPath` 只放行 /app 下的路径。
 */
import { notFound, redirect } from "next/navigation";

import { resolveAuthenticatedApiActor } from "../../../../api/_shared/authenticated-actor";
import { resolveHostServiceForPage } from "../../../../../features/events/host/handlers";

export const dynamic = "force-dynamic";

export default async function LegacyOrganizerPublicPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ follow?: string | string[] }> }) {
  const [{ slug: raw }, query] = await Promise.all([params, searchParams]);
  let value = raw;
  try { value = decodeURIComponent(raw); } catch { /* keep raw */ }
  value = value.trim();
  if (!value || value.length > 120) notFound();
  const actor = await resolveAuthenticatedApiActor().catch(() => null);
  const service = await resolveHostServiceForPage(actor?.id ?? null);
  if (!service) notFound();
  const lower = value.toLowerCase();
  const direct = /^[a-z0-9][a-z0-9-]{0,79}$/u.test(lower) ? await service.organizerPublic(null, lower).catch(() => null) : null;
  const slug = direct ? lower : await service.organizerSlugForEvent(value).catch(() => null);
  if (!slug) notFound();
  redirect(`/o/${encodeURIComponent(slug)}${query.follow === "1" ? "?follow=1" : ""}`);
}
