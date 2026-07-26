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

export type AppContactDetailPageSearchParams = Record<
  string,
  string | string[] | undefined
>;

function readSearchParam(
  searchParams: AppContactDetailPageSearchParams | undefined,
  key: string,
): string | undefined {
  const value = searchParams?.[key];

  return Array.isArray(value) ? value[0] : value;
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
        guardrail="No contact detail, evidence, relationship value, AI, message, notification, or external provider work is executed from this failed route state."
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
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<AppContactDetailPageSearchParams>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const language = await getContactDetailPageLanguage();
  const routeModel = await loadAppContactDetailRoute({
    action: readSearchParam(query, "action"),
    contactId: id,
    mode: readSearchParam(query, "mode"),
    scenario: readSearchParam(query, "scenario"),
  });

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      {routeModel.routeState === "success" ? (
        <OrbitRealCardConnection
          contactId={id}
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
