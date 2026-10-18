import {withOrbitPrivateRoute} from '../../src/components/OrbitRouteAccessBoundary';
import {withOnlineOnlyRoute} from '../../src/components/OnlineOnlyBoundary';
import {NotificationSettingsScreen} from '../../src/screens/settings/notifications/NotificationSettingsScreen';

export default withOrbitPrivateRoute(withOnlineOnlyRoute(NotificationSettingsScreen));
