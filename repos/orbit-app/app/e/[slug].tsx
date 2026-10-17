import { withOnlineOnlyRoute } from "../../src/components/OnlineOnlyBoundary";
import { EventShortLinkScreen } from "../../src/screens/host/EventShortLink";

// R17 申込页短链 /e/<slug> → R27 活动详情。Online-only: the slug is resolved by the server.
export default withOnlineOnlyRoute(EventShortLinkScreen);
