import { withOnlineOnlyRoute } from "../../src/components/OnlineOnlyBoundary";
import { InviteCodeEntryScreen } from "../../src/screens/add/invite/InviteCodeEntryScreen";

// R15 招待コードを入力 (DESIGN §2.5 第 7 条): public; a complete code opens `i/<code>`.
// Online-only like `i/<code>` (docs/offline/page-inventory.md).
function InviteCodeEntryRoute() {
  return <InviteCodeEntryScreen />;
}

export default withOnlineOnlyRoute(InviteCodeEntryRoute);
