import { withOrbitPrivateRoute } from "../src/components/OrbitRouteAccessBoundary";
import { GlobalSearchScreen } from "../src/screens/search/GlobalSearchScreen";

// R30 全局搜索（b5 #53–#56）。LF11: people (and offline the conversations) are searched on the device, so the route
// opens offline; events need the server (useGlobalSearchSource.ts).
export default withOrbitPrivateRoute(GlobalSearchScreen);
