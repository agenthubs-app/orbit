import { MyPageScreen } from "../../src/screens/me/MyPageScreen";
const active = () => true;
export function MeOfflineConsumer() { return <MyPageScreen scopeKey="offline-harness" isScopeCurrent={active} />; }
