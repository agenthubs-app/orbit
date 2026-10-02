/**
 * 联系人详情页 route adapter。
 *
 * 从动态路由参数读取 contact id，并通过 route-level capability service
 * 组合详情、证据和关系价值数据；成功时在「所有人脉」列表屏之上渲染
 * Orbit_0918 联系人详情弹窗（NetworkAll openDetail），关闭 = 导航回 /app/contacts。
 *
 * W0005：`demo:` 前缀的 id 是引导期示例联系人，只在本人处于示例里时存在——此时用示例数据渲染
 * 列表与详情（不调用任何真实联系人读取）；开关关闭、不在引导期或 id 不认识时一律 404，
 * 也绝不把 `demo:` id 交给真实的详情读取。示例期间打开真实 id 也不读任何真实数据，直接回到
 * `/app/contacts`（示例列表）；不在示例里（开关关、老用户、已完成）时真实 id 的路径与改动前一致，
 * 开关关闭时不做任何引导读取。
 */
import {
  getOrbitServerLanguage,
  localizeOrbitTree,
  makeOrbitServerT,
} from "../../orbit-language-server";
import type { OrbitLanguage } from "../../orbit-language-core";
import { OrbitReferenceStyles } from "../../orbit-reference-styles";
import { OrbitRouteBoundaryFrame } from "../../orbit-route-boundary-frame";
import { OrbitVisualFreezeRuntime } from "../../orbit-visual-freeze-runtime";
import { StateView } from "../../../../../shared/ui/state-view";
import { contactDetailPageViewModel } from "../compose-app-contacts-demo-contact-1-from-previously-approved-mock-first-capabili/contact-detail-page-view-model";
import {
  loadAppContactDetailRoute,
  localizeAppContactDetailBoundaryModel,
  type AppContactDetailBoundaryModel,
} from "../compose-app-contacts-demo-contact-1-from-previously-approved-mock-first-capabili/contact-detail-route-service";
import { NetworkAll } from "../network-0918/network-all";
import { NetworkCards } from "../network-0918/network-cards";
import { loadContactCardRoute } from "../contact-card-route-service";
import { loadAppContactsRouteViewModel } from "../compose-app-contacts-from-previously-approved-mock-first-capabilities/contacts-route-view-model";
import { contactsRouteToOrbitContactsViewModel } from "../compose-app-contacts-from-previously-approved-mock-first-capabilities/contacts-view-model-adapter";
import { applyOrbitContactsPresentation } from "../../orbit-contacts-presentation";
import { AccountTopNav } from "../../orbit-account-shell";
import { auth } from "../../../../../auth";
import { notFound, redirect } from "next/navigation";
import { resolveAuthenticatedApiActorFromSession } from "../../../../api/_shared/authenticated-actor";
import { AppointmentMemoCapture } from "./appointment-memo-capture";
import { OrbitAppointmentNegotiation } from "../../events/[id]/orbit-appointment-negotiation";
import { readDemoModeViewForActor } from "../../_demo/demo-guide-view";
import { buildDemoNetworkDetail, buildDemoNetworkViewModel, isDemoContactId } from "../../_demo/demo-network";
import { NetworkDemoFrame } from "../network-0918/network-demo-frame";
import { RELATIONSHIP_TIMELINE_SOURCES } from "../../../../../features/relationship-timeline/build";
import { readMemoEventOptions, readRelationshipTimelineForContact } from "../../../../../features/relationship-timeline/reader";
import { ensureRelationshipStrengthsForPage, readRelationshipStrengths, readRelationshipTierLookup } from "../../../../../features/relationship-strength/read-model";
import { readConfiguredRelationshipSignalItems } from "../../../../../features/relationship-strength/signal-items";
import { readContactInsightDetail } from "../../../../../features/contacts/insights/read";
import { contactInsightView } from "../../../../../features/contacts/insights/view";
import { NetworkInsightPanel } from "../network-0918/network-insight-panel";
import { readAnalysisThreshold } from "../../../../../features/network-analysis/analysis-threshold-reader";

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
  language,
  routeModel: rawRouteModel,
}: {
  language: OrbitLanguage;
  routeModel: AppContactDetailBoundaryModel;
}) {
  // 边界文案按当前 UI 语言单语渲染（StateView 也接收 language），
  // 不再出现“中文 / English”拼接。
  const t = makeOrbitServerT(language);
  const routeModel = localizeAppContactDetailBoundaryModel(rawRouteModel, language);

  return (
    <OrbitRouteBoundaryFrame navActive="cards" page="contact-detail">
      <StateView
        description={routeModel.description}
        emptyState={routeModel.description}
        evidence={Array.from(routeModel.evidence)}
        eyebrow={t({ en: "Contact detail", ja: "連絡先の詳細", zh: "联系人详情" })}
        guardrail={t({
          en: "No contact detail, evidence, relationship value, AI, message, notification, or external provider work is executed from this route state.",
          ja: "このルート状態では、連絡先の詳細、根拠、関係価値、AI、メッセージ、通知、外部プロバイダーの処理は一切実行されません。",
          zh: "此路由状态不会执行任何联系人详情、证据、关系价值、AI、消息、通知或外部提供方操作。",
        })}
        language={language}
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
  if (!session?.user?.id) {
    redirect(
      `/app/account/login?next=${encodeURIComponent(`/app/contacts/${contactId}`)}`,
    );
  }
  const actor = await resolveAuthenticatedApiActorFromSession({
    email: session.user.email,
    name: session.user.name,
    userId: session.user.id,
  });
  if (!actor) {
    throw new Error("Authenticated Orbit account membership is unavailable.");
  }

  if (isDemoContactId(contactId)) {
    const guide = await readDemoModeViewForActor({ actorId: actor.id, userId: session.user.id });
    if (!guide) notFound();
    const now = new Date();
    const lang = (await getContactDetailPageLanguage()) === "en" ? "en" : "zh";
    const demoDetail = buildDemoNetworkDetail(contactId, now, lang);
    if (!demoDetail) notFound();
    return (
      <>
        <OrbitReferenceStyles />
        <OrbitVisualFreezeRuntime />
        <NetworkDemoFrame guide={guide} route="app-contact-detail-route">
          <NetworkAll
            key={`${actor.id}:${contactId}`}
            viewModel={buildDemoNetworkViewModel(now, lang)}
            openDetail={{ contact: demoDetail, closeHref: "/app/contacts" }}
          />
        </NetworkDemoFrame>
      </>
    );
  }

  // 示例期间人脉页只显示示例人物：真实联系人详情（包括弹窗后面的真实列表）一律不读，回到示例列表。
  // 开关关闭时这次判定不做任何读取。
  if (await readDemoModeViewForActor({ actorId: actor.id, userId: session.user.id })) redirect("/app/contacts");

  const language = await getContactDetailPageLanguage();
  const routeModel = await loadAppContactDetailRoute({
    actorId: actor.id,
    contactId,
  });

  if (routeModel.routeState !== "success") {
    return (
      <>
        <OrbitReferenceStyles />
        <OrbitVisualFreezeRuntime />
        <ContactDetailRouteStateView language={language} routeModel={routeModel} />
      </>
    );
  }

  // W0047：先刷新关系强度读模型（来源戳与东京日未变时只读一条语句；失败不影响页面）。
  const now = new Date();
  await ensureRelationshipStrengthsForPage(actor.id, now);
  // 列表屏在弹窗后面：列表 VM 只喂列表，详情弹窗只吃详情路由的 VM（真实 notes / editableTags / lastInteraction）。
  // W0054（review P3-2）：门槛计数整页只读一次——列表的洞察一句与详情顶部「和你目标的关系」共用这一个结果。
  const thresholdPromise = readAnalysisThreshold(actor.id);
  const cards = await loadContactCardRoute({}, actor, { readThreshold: () => thresholdPromise });
  const listRoute = cards ? null : await loadAppContactsRouteViewModel({}, actor.id);
  const listTiers = listRoute?.state === "success"
    ? await readRelationshipTierLookup({ actorId: actor.id, contactIds: listRoute.payload.contacts.map((contact) => contact.id) })
    : undefined;
  const listVm =
    listRoute?.state === "success"
      ? localizeOrbitTree(applyOrbitContactsPresentation(contactsRouteToOrbitContactsViewModel(listRoute, listTiers), language), language)
      : { connections: [], events: [], intros: [], pipelineStatuses: [] };
  const detailBase = contactDetailPageViewModel(routeModel, language).connections[0];
  if (!detailBase) {
    throw new Error("Contact detail route succeeded without a connection.");
  }
  // W0046：「最近互动」聚合时间线与「写 memo」关联活动推荐在服务端读好随详情下发（不另发客户端请求）。
  // W0047：关系强度（档位与依据）同样服务端读好。
  // W0051：「和你目标的关系」按 (actor, contactId) 读一行洞察（只读，0 次模型调用）。
  // W0054（W54-3）：已确认联系人不足 3 位时这块只隐藏——先读门槛（一条计数语句），未达时不读洞察、不渲染面板。
  const [timeline, memoEventOptions, strengths, insightRead] = await Promise.all([
    readRelationshipTimelineForContact({ actorId: actor.id, contactId, now }).catch(() => ({
      items: [],
      unavailableSources: [...RELATIONSHIP_TIMELINE_SOURCES],
    })),
    readMemoEventOptions({ actorId: actor.id, now }),
    readRelationshipStrengths({ actorId: actor.id, contactIds: [contactId] }).catch(() => new Map()),
    thresholdPromise.then((threshold) => (threshold && !threshold.met
      ? null
      : readContactInsightDetail({ actorId: actor.id, contactId, now }).catch(() => ({ goal: null, goalKnown: false, quotaExhausted: false, row: null })))),
  ]);
  const insight = insightRead && (
    <NetworkInsightPanel
      key={`insight:${contactId}`}
      view={contactInsightView(insightRead.row, { contactId, goal: insightRead.goal, goalKnown: insightRead.goalKnown, now })}
      quotaExhausted={insightRead.quotaExhausted}
      contactHref={`/app/contacts/${encodeURIComponent(contactId)}`}
    />
  );
  const relationshipStrength = strengths.get(contactId) ?? null;
  // 依据里不在最近 20 条时间线中的信号：按信号 id 一条语句读回真实条目（review P2-6）。
  const shown = new Set(timeline.items.map((item) => item.id));
  const missingSignalIds = (relationshipStrength?.signals ?? []).map((signal) => signal.timelineItemId).filter((id) => !shown.has(id));
  const relationshipSignalItems = await readConfiguredRelationshipSignalItems({ actorId: actor.id, contactId, timelineItemIds: missingSignalIds });
  const detail = { ...detailBase, timeline, memoEventOptions, relationshipStrength, relationshipSignalItems };

  // 会后纪要 / 约谈核验附加态渲染在弹窗时间线上方（props 原样）。
  const extra = (
    <>
      {memoQueryPresent ? (
        <AppointmentMemoCapture
          appointmentId={memoRequested ? appointmentId : null}
          contactId={contactId}
          eventId={memoRequested ? eventId : null}
          invalidRequest={invalidMemoRequest}
        />
      ) : null}
      {appointmentRequested && appointmentId && eventId ? (
        <div style={{ margin: 16 }}>
          <OrbitAppointmentNegotiation
            appointmentId={appointmentId}
            contactId={contactId}
            eventId={eventId}
          />
        </div>
      ) : null}
      {invalidAppointmentRequest ? (
        <p role="alert" style={{ color: "var(--danger)", margin: 16 }}>约谈链接无效：需要唯一的 appointmentId 和 eventId。</p>
      ) : null}
    </>
  );

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      {/* 顶栏样式限定在 [data-orbit-real-page] 祖先下（orbit-reference-styles.tsx），外层容器必须带该属性。 */}
      <div data-orbit-real-page="network" data-orbit-route="app-contact-detail-route">
        <AccountTopNav active="cards" />
        {cards?.state === "ready" ? <NetworkCards
          key={`${actor.id}:${contactId}`}
          view={cards.view}
          openDetail={{ contact: detail, closeHref: "/app/contacts", extra, insight }}
        /> : <>
        {cards?.state === "error" && <p role="alert">{cards.message}</p>}
        <NetworkAll
          key={`${actor.id}:${contactId}`}
          viewModel={listVm}
          openDetail={{ contact: detail, closeHref: "/app/contacts", extra, insight }}
        />
        </>}
      </div>
    </>
  );
}
