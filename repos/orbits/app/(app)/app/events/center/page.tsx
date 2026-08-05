import { redirect } from "next/navigation";

import { auth } from "../../../../../auth";
import { OrbitReferenceStyles } from "../../orbit-reference-styles";
import { EventCenterWorkspace } from "./event-center-workspace";

export default async function EventCenterPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/app/account/login?next=%2Fapp%2Fevents%2Fcenter");
  }

  return (
    <>
      <OrbitReferenceStyles />
      <EventCenterWorkspace />
    </>
  );
}
