import { useLocalSearchParams } from "expo-router";

import { withOnlineOnlyRoute } from "../../../src/components/OnlineOnlyBoundary";
import { withOrbitPrivateRoute } from "../../../src/components/OrbitRouteAccessBoundary";
import { ContactDraftsScreen } from "../../../src/screens/add/ContactDraftsScreen";

// R12 確認待ちの下書き (DESIGN §2.9): the draft queue, `?eventId=` adds 参加者から取り込む.
// Online-only: drafts and the attendee import live on the server (docs/offline/page-inventory.md).
function ContactDraftsRoute() {
  const params = useLocalSearchParams<{ eventId?: string | string[]; design?: string | string[] }>();
  const eventId = (Array.isArray(params.eventId) ? params.eventId[0] : params.eventId)?.trim() || null;
  // 像素门禁（开发包 + add-scan）：`design=n08b` 用画板示例草稿（scan-design-fixtures）。
  const design = (Array.isArray(params.design) ? params.design[0] : params.design)?.trim() || null;
  return <ContactDraftsScreen key={eventId ?? ""} eventId={eventId} design={design} />;
}

export default withOrbitPrivateRoute(withOnlineOnlyRoute(ContactDraftsRoute));
