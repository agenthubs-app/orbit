import { redirect } from "next/navigation";

import { auth } from "../../../../../auth";
import { AccountTopNav } from "../../orbit-account-shell";
import { OrbitReferenceStyles } from "../../orbit-reference-styles";
import { OpsHub } from "../ops-0918/ops-hub";

export default async function EventCenterPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/app/account/login?next=%2Fapp%2Fevents%2Fcenter");
  }

  return (
    <>
      <OrbitReferenceStyles />
      {/* 顶栏样式限定在 [data-orbit-real-page] 祖先下（orbit-reference-styles.tsx），外层容器必须带该属性。 */}
      <div data-orbit-real-page="ops-0918">
        <AccountTopNav active="events" />
        <OpsHub />
      </div>
    </>
  );
}
