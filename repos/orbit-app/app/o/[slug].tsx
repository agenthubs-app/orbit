import { withOnlineOnlyRoute } from "../../src/components/OnlineOnlyBoundary";
import { OrganizerPublicPage } from "../../src/screens/host/OrganizerPublic";

// R17 公開主催者ページ（b7 #36–#38）。Online-only public page: it is not account data.
export default withOnlineOnlyRoute(OrganizerPublicPage);
