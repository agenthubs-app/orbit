/**
 * R11a：`/app/contacts/<id>` 打开新人脈页并直接展开联系人抽屉（web.html #7 / b8 #13 / #14）。
 * 仍走旧详情（`legacy-detail-page.tsx`）的只有活动线的两个入口——
 * 面谈メモ（`?capture=meeting-memo`）和日程协商（`?appointmentId=&eventId=`，R27 的文件挂在旧详情上）。
 */
import { notFound, redirect } from "next/navigation";

import { auth } from "../../../../../auth";
import { resolveAuthenticatedApiActorFromSession } from "../../../../api/_shared/authenticated-actor";
import { isDemoContactId } from "../../_demo/demo-network";
import { getOrbitServerLanguage } from "../../orbit-language-server";
import { NetworkScreen } from "../../orbit-2026/network/NetworkScreen";
import { LegacyContactDetailPage } from "./legacy-detail-page";

export const dynamic = "force-dynamic";

export default async function AppContactDetailPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams ?? Promise.resolve({} as Record<string, string | string[] | undefined>)]);
  let contactId = id;
  try { contactId = decodeURIComponent(id); } catch { /* keep the raw id */ }
  // 引导期示例人物已不再出现（2026-10-30），旧的 `demo:` 链接一律 404。
  if (isDemoContactId(contactId)) notFound();
  if (query.capture !== undefined || query.appointmentId !== undefined) {
    return LegacyContactDetailPage({ params: Promise.resolve({ id }), searchParams: Promise.resolve(query) });
  }
  const session = await auth();
  if (!session?.user?.id) redirect(`/app/account/login?next=${encodeURIComponent(`/app/contacts/${id}`)}`);
  const actor = await resolveAuthenticatedApiActorFromSession({ email: session.user.email, name: session.user.name, userId: session.user.id });
  if (!actor) throw new Error("Authenticated Orbit account membership is unavailable.");
  return <NetworkScreen language={await getOrbitServerLanguage()} nowIso={new Date().toISOString()} initialContactId={contactId} />;
}
