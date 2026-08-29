import { withOrbitPrivateRoute } from "../src/components/OrbitRouteAccessBoundary";
import { TasksScreen } from "../src/screens/tasks/TasksScreen";

export default withOrbitPrivateRoute(TasksScreen);
