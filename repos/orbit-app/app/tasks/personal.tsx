import { AppScreen } from "../../src/components/AppScreen";
import { withOrbitPrivateRoute } from "../../src/components/OrbitRouteAccessBoundary";
import { PersonalScheduleList } from "../../src/screens/schedule/PersonalScheduleList";
function PersonalScheduleListRoute() {
  return <AppScreen title="待办"><PersonalScheduleList /></AppScreen>;
}
export default withOrbitPrivateRoute(PersonalScheduleListRoute);
