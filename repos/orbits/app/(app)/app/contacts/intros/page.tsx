/**
 * 介绍与引荐页 route adapter。
 *
 * 这里只把 live-capable contacts route model 接到 intros 视图，具体推荐/引荐 UI 在真实组件中。
 */
import { OrbitReferenceStyles } from "../../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../../orbit-visual-freeze-runtime";
import {
  ContactsSubrouteStateBoundary,
  contactsRouteToOrbitContactsViewModel,
} from "../compose-app-contacts-from-previously-approved-mock-first-capabilities/contacts-subroute-route-adapter";
import {
  loadAppContactsRouteViewModel,
  type AppContactsSearchParams,
} from "../compose-app-contacts-from-previously-approved-mock-first-capabilities/contacts-route-view-model";
import { OrbitRealCardsIntros } from "../orbit-real-contacts";
import { createConfiguredContactIntroductionRepository } from "../../../../../features/contacts/introduction-records";
import { auth } from "../../../../../auth";
import { redirect } from "next/navigation";
import { resolveAuthenticatedApiActorFromSession } from "../../../../api/_shared/authenticated-actor";

interface AppContactsIntrosPageProps {
  searchParams?: Promise<AppContactsSearchParams>;
}

export default async function AppContactsIntrosPage({
  searchParams,
}: AppContactsIntrosPageProps = {}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/app/account/login?next=%2Fapp%2Fcontacts%2Fintros");
  }
  const actor = await resolveAuthenticatedApiActorFromSession({
    email: session.user.email,
    name: session.user.name,
    userId: session.user.id,
  });
  if (!actor) {
    throw new Error("Authenticated Orbit account membership is unavailable.");
  }

  const routeModel = await loadAppContactsRouteViewModel(
    await searchParams,
    actor.id,
  );
  const introductionRepository =
    createConfiguredContactIntroductionRepository();
  const introductions = introductionRepository
    ? await introductionRepository.list(actor.id)
    : [];

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      {routeModel.state === "success" ? (
        <div data-orbit-route="app-contacts-intros-route">
          <OrbitRealCardsIntros
            viewModel={{
              ...contactsRouteToOrbitContactsViewModel(routeModel.payload),
              intros: introductions.map((introduction) => ({
                blurb: introduction.blurb,
                contactAId: introduction.contactAId,
                contactBId: introduction.contactBId,
                createdAt: introduction.createdAt,
                id: introduction.id,
                labelA: introduction.labelA,
                labelB: introduction.labelB,
                statusBadge: introduction.status,
                updatedAt: introduction.updatedAt,
              })),
            }}
          />
        </div>
      ) : (
        <ContactsSubrouteStateBoundary
          marker="app-contacts-intros-route"
          routeModel={routeModel}
        />
      )}
    </>
  );
}
