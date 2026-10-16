/** R17：旧 審査 页并入イベント運営的页签（host DESIGN §2.3），旧链接跳到 `?tab=people`。 */
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AppEventAdmissionRedirectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/app/events/${encodeURIComponent(decodeURIComponentSafe(id))}/operations?tab=people`);
}

function decodeURIComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
