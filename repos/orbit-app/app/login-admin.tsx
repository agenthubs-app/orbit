import { AdminLoginScreen } from "../src/screens/admin/AdminLoginScreen";
import { withOnlineOnlyRoute } from "../src/components/OnlineOnlyBoundary";

function LoginAdminRoute() {
  return <AdminLoginScreen />;
}

// Sprint 0131: online-only page (docs/offline/page-inventory.md); offline it shows 「需要联网」, not an error page.
export default withOnlineOnlyRoute(LoginAdminRoute);
