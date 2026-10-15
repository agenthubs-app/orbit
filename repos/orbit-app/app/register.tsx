import { Redirect, type Href } from "expo-router";

import { withOnlineOnlyRoute } from "../src/components/OnlineOnlyBoundary";

// R27：没有コード的 /register → R26 的参加コード入力（活动里不再有单独的「招待コード」页）。Online-only like the code entry.
function RegisterRoute() {
  return <Redirect href={"/events/assess?mode=code" as Href} />;
}

export default withOnlineOnlyRoute(RegisterRoute);
