/**
 * R17（host/DESIGN.md §2.2「申込页地址」）：申込页短链 `/e/<slug>` → 302 到 R27 活动详情 `/app/events/<eventId>`
 * （未登录时由 R27 的公开详情接住）。只认已公开活动的 slug；未知 / 已中止 → 404。
 */
import { notFound, redirect } from "next/navigation";

import { resolveHostServiceForPage } from "../../../features/events/host/handlers";
import { HOST_INVITE_CODE_PATTERN } from "../../../shared/compute/host-invite";

export const dynamic = "force-dynamic";

export default async function EventShortLinkPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ inv?: string | string[] }> }) {
  const { slug } = await params;
  // R17-11：名簿导入的招待链接 `?inv=<code>` 一路带到活动页（格式不对就丢掉）。
  const inv = [(await searchParams).inv].flat()[0]?.trim().toUpperCase() ?? "";
  const value = decodeURIComponent(slug).trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/u.test(value)) notFound();
  const service = await resolveHostServiceForPage(null);
  const eventId = service ? await service.eventIdForSlug(value).catch(() => null) : null;
  if (!eventId) notFound();
  redirect(`/app/events/${encodeURIComponent(eventId)}${HOST_INVITE_CODE_PATTERN.test(inv) ? `?inv=${inv}` : ""}`);
}
