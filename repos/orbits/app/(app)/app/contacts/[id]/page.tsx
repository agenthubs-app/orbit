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
import { AppointmentMemoCapture } from "./appointment-memo-capture";
import { OrbitAppointmentNegotiation } from "../../events/[id]/orbit-appointment-negotiation";

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
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, query]: [{ id: string }, Record<string, string | string[] | undefined>] = await Promise.all([
    params,
    searchParams ?? Promise.resolve({}),
  ]);
  const contactId = decodeContactRouteId(id);
  const capture = typeof query.capture === "string" ? query.capture : null;
  const appointmentId = typeof query.appointmentId === "string" && query.appointmentId.trim() && query.appointmentId.length <= 256 ? query.appointmentId.trim() : null;
  const eventId = typeof query.eventId === "string" && query.eventId.trim() && query.eventId.length <= 256 ? query.eventId.trim() : null;
  const memoRequested = capture === "meeting-memo";
  const memoQueryPresent = query.capture !== undefined;
  const invalidMemoRequest = memoQueryPresent && (!memoRequested || !appointmentId || !eventId);
  const appointmentQueryPresent = !memoQueryPresent && query.appointmentId !== undefined;
  const appointmentRequested = appointmentQueryPresent && Boolean(appointmentId && eventId);
  const invalidAppointmentRequest = appointmentQueryPresent && !appointmentRequested;
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
      {routeModel.routeState === "success" && memoQueryPresent ? (
        <AppointmentMemoCapture
          appointmentId={memoRequested ? appointmentId : null}
          contactId={contactId}
          eventId={memoRequested ? eventId : null}
          invalidRequest={invalidMemoRequest}
        />
      ) : null}
      {routeModel.routeState === "success" && appointmentRequested && appointmentId && eventId ? (
        <div style={{ margin: 16 }}>
          <OrbitAppointmentNegotiation
            appointmentId={appointmentId}
            contactId={contactId}
            eventId={eventId}
          />
        </div>
      ) : null}
      {routeModel.routeState === "success" && invalidAppointmentRequest ? (
        <p role="alert" style={{ color: "var(--danger)", margin: 16 }}>约谈链接无效：需要唯一的 appointmentId 和 eventId。</p>
      ) : null}
    </>
  );
}
