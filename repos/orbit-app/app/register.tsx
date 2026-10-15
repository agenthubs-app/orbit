import { Redirect, type Href } from "expo-router";

// R27：没有コード的 /register → R26 的参加コード入力（活动里不再有单独的「招待コード」页）。
export default function RegisterRoute() {
  return <Redirect href={"/events/assess?mode=code" as Href} />;
}
