/**
 * 联系人详情页 route adapter。
 *
 * 从动态路由参数读取 contact id，并通过 route-level capability service
 * 组合详情、证据和关系价值数据后交给详情组件。
 */
import {
  getOrbitServerLanguage,
  localizeOrbitTree,
} from "../../orbit-language-server";
import type { OrbitLanguage } from "../../orbit-language-core";
import { OrbitReferenceStyles } from "../../orbit-reference-styles";
import { OrbitRouteBoundaryFrame } from "../../orbit-route-boundary-frame";
import { OrbitVisualFreezeRuntime } from "../../orbit-visual-freeze-runtime";
import { StateView } from "../../../../../shared/ui/state-view";
import { contactDetailRouteToOrbitContactsViewModel } from "../compose-app-contacts-demo-contact-1-from-previously-approved-mock-first-capabili/contact-detail-view-model-adapter";
import { applyOrbitContactsPresentation } from "../../orbit-contacts-presentation";
import {
  loadAppContactDetailRoute,
  type AppContactDetailBoundaryModel,
} from "../compose-app-contacts-demo-contact-1-from-previously-approved-mock-first-capabili/contact-detail-route-service";
import { OrbitRealCardConnection } from "../orbit-real-card-connection";
import { auth } from "../../../../../auth";
import { redirect } from "next/navigation";

function decodeContactRouteId(id: string): string {
  try {
    return decodeURIComponent(id);
  } catch {
    return id;
  }
}

async function getContactDetailPageLanguage(): Promise<OrbitLanguage> {
  try {
    return await getOrbitServerLanguage();
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("outside a request scope")
    ) {
      return "zh";
    }

    throw error;
  }
}

function ContactDetailRouteStateView({
  routeModel,
}: {
  routeModel: AppContactDetailBoundaryModel;
}) {
  return (
    <OrbitRouteBoundaryFrame navActive="cards" page="contact-detail">
      <StateView
        description={routeModel.description}
        emptyState={routeModel.description}
        evidence={Array.from(routeModel.evidence)}
        eyebrow="Contact detail"
        guardrail="No contact detail, evidence, relationship value, AI, message, notification, or external provider work is executed from this route state."
        nextStep={routeModel.nextStep}
        recoveryActions={routeModel.recoveryActions.map((action, index) => ({
          href: action.href,
          id: `contact-detail-recovery-${index}`,
          label: action.label,
          // Each action describes itself. Passing routeModel.nextStep here gave
          // every button the same sentence (UI-audit P0-1).
          recoveryCopy: action.recoveryCopy,
        }))}
        title={routeModel.title}
      />
    </OrbitRouteBoundaryFrame>
  );
}

export default async function AppContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const contactId = decodeContactRouteId(id);
  const session = await auth();
  const actorId = session?.user?.id;
  if (!actorId) {
    redirect(
      `/app/account/login?next=${encodeURIComponent(`/app/contacts/${contactId}`)}`,
    );
  }

  const language = await getContactDetailPageLanguage();
  const routeModel = await loadAppContactDetailRoute({
    actorId,
    contactId,
  });

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      {routeModel.routeState === "success" ? (
        <OrbitRealCardConnection
          contactId={contactId}
          viewModel={localizeOrbitTree(
            applyOrbitContactsPresentation(
              contactDetailRouteToOrbitContactsViewModel(routeModel, language),
              language,
            ),
            language,
          )}
        />
      ) : (
        <ContactDetailRouteStateView routeModel={routeModel} />
      )}
    </>
  );
}
