import { withOnlineOnlyRoute } from "../src/components/OnlineOnlyBoundary";
import { withOrbitPrivateRoute } from "../src/components/OrbitRouteAccessBoundary";
import { GlobalSearchScreen } from "../src/screens/search/GlobalSearchScreen";

// R30 全局搜索（b5 #53–#56）。Online-only: every answer comes from GET /api/search/global.
export default withOrbitPrivateRoute(withOnlineOnlyRoute(GlobalSearchScreen));
