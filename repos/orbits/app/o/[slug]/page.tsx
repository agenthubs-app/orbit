/**
 * R17 公開主催者ページ `/o/<slug>`（host DESIGN §2.11；b7 #33–#39）。公开页：不在 `(app)` 组、没有壳、不经过 proxy
 * （matcher 只拦 /app 与 /api），未登录可读。数据与公开接口 `GET /api/organizers/by-slug/[slug]` 同一个服务
 * （`resolveHostServiceForPage`：mock / live 同路由分派）；关注状态未登录为 null。不存在 / 非公开 → 404 文案页。
 */
import type { Metadata } from "next";

import { resolveAuthenticatedApiActor } from "../../api/_shared/authenticated-actor";
import { getOrbitServerLanguage } from "../../(app)/app/orbit-language-server";
import { OrganizerPublic, OrganizerPublicMissing } from "../../(app)/app/orbit-2026/host/OrganizerPublic";
import { enabledOAuthProviders } from "../../../features/auth/oauth-providers";
import { resolveHostServiceForPage } from "../../../features/events/host/handlers";

export const dynamic = "force-dynamic";

function slugOf(value: string): string | null {
  let decoded = value;
  try { decoded = decodeURIComponent(value); } catch { /* keep raw */ }
  const slug = decoded.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9-]{0,79}$/u.test(slug) ? slug : null;
}

async function load(rawSlug: string) {
  const slug = slugOf(rawSlug);
  const actor = await resolveAuthenticatedApiActor().catch(() => null);
  const actorId = actor?.id ?? null;
  if (!slug) return { actorId, data: null };
  const service = await resolveHostServiceForPage(actorId);
  const data = service ? await service.organizerPublic(actorId, slug).catch(() => null) : null;
  return { actorId, data };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const { data } = await load(slug);
  if (!data) return { robots: { index: false }, title: "Orbit" };
  return { description: data.profile.bio ?? undefined, robots: data.profile.visibility === "public" ? undefined : { index: false }, title: `${data.profile.displayName} · Orbit` };
}

export default async function OrganizerPublicPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ follow?: string | string[] }> }) {
  const [{ slug }, query, language] = await Promise.all([params, searchParams, getOrbitServerLanguage()]);
  const { actorId, data } = await load(slug);
  if (!data) return <OrganizerPublicMissing language={language} />;
  return <OrganizerPublic data={data} language={language} signedIn={Boolean(actorId)} googleEnabled={enabledOAuthProviders().includes("google")} autoFollow={query.follow === "1"} />;
}
