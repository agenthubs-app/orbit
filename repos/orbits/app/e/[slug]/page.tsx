/**
 * R17（host/DESIGN.md §2.2「申込页地址」）：申込页短链 `/e/<slug>` → 302 到 R27 活动详情 `/app/events/<eventId>`
 * （未登录时由 R27 的公开详情接住）。只认已公开活动的 slug；未知 / 已中止 → 404。
 */
import { notFound, redirect } from "next/navigation";

import { resolveHostServiceForPage } from "../../../features/events/host/handlers";

export const dynamic = "force-dynamic";

export default async function EventShortLinkPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const value = decodeURIComponent(slug).trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/u.test(value)) notFound();
  const service = await resolveHostServiceForPage(null);
  const eventId = service ? await service.eventIdForSlug(value).catch(() => null) : null;
  if (!eventId) notFound();
  redirect(`/app/events/${encodeURIComponent(eventId)}`);
}
