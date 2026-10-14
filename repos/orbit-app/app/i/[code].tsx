import { useLocalSearchParams } from "expo-router";

import { withOnlineOnlyRoute } from "../../src/components/OnlineOnlyBoundary";
import { InviteLandingScreen } from "../../src/screens/add/invite/InviteLandingScreen";

// R15 招待コード · 受け取る側 (DESIGN §2.5): public — signed out it shows the invite and ログイン / 登録,
// which come back here (`next=/i/<code>`). Universal links and `orbit://i/<code>` open this route.
// Online-only: the preview and つながる run on the server (docs/offline/page-inventory.md).
function InviteLandingRoute() {
  const params = useLocalSearchParams<{ code?: string | string[]; design?: string | string[] }>();
  const code = (Array.isArray(params.code) ? params.code[0] : params.code) ?? "";
  // `design` is honoured only in a dev build with the R15 pixel-gate switch (add-design-mock).
  const design = Array.isArray(params.design) ? params.design[0] : params.design;
  return <InviteLandingScreen key={code} code={code} design={design} />;
}

export default withOnlineOnlyRoute(InviteLandingRoute);
