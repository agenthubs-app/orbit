import { redirect } from "next/navigation";

import { auth } from "../../../../../auth";
import { OrbitReferenceStyles } from "../../orbit-reference-styles";
import { OrbitRouteBoundaryFrame } from "../../orbit-route-boundary-frame";
import { RelationshipInvitationClient } from "./relationship-invitation-client";

export const dynamic = "force-dynamic";

export default async function RelationshipInvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const [{ token }, session] = await Promise.all([params, auth()]);
  const invitationPath = `/app/invitations/${encodeURIComponent(token)}`;
  if (!session?.user?.id) {
    redirect(`/app/account/login?${new URLSearchParams({ next: invitationPath })}`);
  }

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitRouteBoundaryFrame navActive="cards" page="relationship-invitation">
        <RelationshipInvitationClient token={token} />
      </OrbitRouteBoundaryFrame>
    </>
  );
}
