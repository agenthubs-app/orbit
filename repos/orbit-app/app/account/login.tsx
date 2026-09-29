import { AccountAuthScreen } from "../../src/screens/profile/AccountAuthScreen";
import { withOnlineOnlyRoute } from "../../src/components/OnlineOnlyBoundary";

function AccountLoginRoute() {
  return <AccountAuthScreen mode="login" />;
}

// Sprint 0131: online-only page (docs/offline/page-inventory.md); offline it shows 「需要联网」, not an error page.
export default withOnlineOnlyRoute(AccountLoginRoute, { probeOnOpen: true });
