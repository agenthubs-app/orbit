import {withOrbitPrivateRoute} from '../../../src/components/OrbitRouteAccessBoundary';
import {withOnlineOnlyRoute} from '../../../src/components/OnlineOnlyBoundary';
import {NotificationSecretarySettingsScreen} from '../../../src/screens/settings/notifications/NotificationSettingsScreen';

export default withOrbitPrivateRoute(withOnlineOnlyRoute(NotificationSecretarySettingsScreen));
