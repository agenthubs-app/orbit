/** R17：旧 体験設定 页并入イベント運営的页签（host DESIGN §2.3），旧链接跳到 `?tab=setup`。 */
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AppEventExperienceRedirectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/app/events/${encodeURIComponent(decodeURIComponentSafe(id))}/operations?tab=setup`);
}

function decodeURIComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
