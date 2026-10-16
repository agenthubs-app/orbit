/** R17：旧 分析 页并入イベント運営的页签（host DESIGN §2.3），旧链接跳到 `?tab=report`。 */
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AppEventAnalyticsRedirectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/app/events/${encodeURIComponent(decodeURIComponentSafe(id))}/operations?tab=report`);
}

function decodeURIComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
