import { ChangePasswordScreen } from "../../src/screens/profile/ChangePasswordScreen";
import { withOrbitPrivateRoute } from "../../src/components/OrbitRouteAccessBoundary";
import { withOnlineOnlyRoute } from "../../src/components/OnlineOnlyBoundary";

// 首次登录强制改密 / 登录后修改密码（与 Web /app/account/change-password 同一接口）。需要登录；改密要服务器校验，离线显示「需要联网」。
export default withOrbitPrivateRoute(withOnlineOnlyRoute(ChangePasswordScreen, { probeOnOpen: true }));
