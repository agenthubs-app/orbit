import { PasswordResetScreen } from "../../src/screens/profile/PasswordResetScreen";
import { withOnlineOnlyRoute } from "../../src/components/OnlineOnlyBoundary";

function ResetPasswordRoute() {
  return <PasswordResetScreen />;
}

// Sprint 0131: online-only page (docs/offline/page-inventory.md); offline it shows 「需要联网」, not an error page.
export default withOnlineOnlyRoute(ResetPasswordRoute);
