import { AdminScreen } from "../../src/screens/admin/AdminScreen";
import { withOnlineOnlyRoute } from "../../src/components/OnlineOnlyBoundary";

function AdminAccessRoute() {
  return <AdminScreen surface="access" />;
}

// Sprint 0131: online-only page (docs/offline/page-inventory.md); offline it shows 「需要联网」, not an error page.
export default withOnlineOnlyRoute(AdminAccessRoute);
