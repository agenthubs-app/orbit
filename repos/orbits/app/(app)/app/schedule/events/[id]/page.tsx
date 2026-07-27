/**
 * 日程活动详情预览页 route adapter。
 *
 * 页面只负责加载 event preview route view model；展示层在
 * `orbit-real-schedule-event.tsx`。
 */
import { OrbitReferenceStyles } from "../../../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../../../orbit-visual-freeze-runtime";
import { auth } from "../../../../../../auth";
import { redirect } from "next/navigation";
import { loadAppScheduleEventPreviewRouteViewModel } from "./event-preview-route-view-model";
import { OrbitRealScheduleEvent } from "./orbit-real-schedule-event";

export default async function AppScheduleEventPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const actorId = session?.user?.id;
  if (!actorId) {
    redirect(
      `/app/account/login?next=${encodeURIComponent(`/app/schedule/events/${id}`)}`,
    );
  }

  const model = await loadAppScheduleEventPreviewRouteViewModel({
    actorId,
    eventId: id,
  });

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitRealScheduleEvent model={model} />
      <OrbitVisualFreezeRuntime />
    </>
  );
}
