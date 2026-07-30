import { StateView } from "../../../../../../shared/ui/state-view";
import { auth } from "../../../../../../auth";
import { normalizeOrbitLanguage } from "../../../orbit-language-core";
import {
  getOrbitServerLanguage,
  localizeOrbitTree,
} from "../../../orbit-language-server";
import { eventTitleForId } from "../../../orbit-event-presentation";
import { OrbitReferenceStyles } from "../../../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../../../orbit-visual-freeze-runtime";
import {
  loadEventForRegistration,
  localizedEventTitle,
} from "../../../../../../features/events/registration/event-loader";
import { bilingualSegment } from "../../../../../../features/orbit-ai/event-recommendation-artifact-service";
import { generateEventRegistrationQuestions } from "../../../../../../features/events/registration/question-generator";
import { eventRegistrationRuntimeService } from "../../../../../../features/events/registration/runtime";
import { createProfileService } from "../../../../../../features/profile/service-factory";
import { EventRegistrationWorkspace } from "./event-registration-workspace";
import { eventRegistrationReturnPath } from "./registration-return-path";
import { redirect } from "next/navigation";

type EventRegistrationSearchParams = Record<
  string,
  string | string[] | undefined
>;

function readSearchParam(
  searchParams: EventRegistrationSearchParams | undefined,
  key: string,
): string | undefined {
  const value = searchParams?.[key];

  return Array.isArray(value) ? value[0] : value;
}

async function getEventRegistrationPageLanguage(
  preferredLanguage?: string | null,
): Promise<"en" | "zh"> {
  if (preferredLanguage) {
    return normalizeOrbitLanguage(preferredLanguage) === "en" ? "en" : "zh";
  }

  try {
    return normalizeOrbitLanguage(await getOrbitServerLanguage()) === "en"
      ? "en"
      : "zh";
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

async function currentRegistrationActor() {
  try {
    return {
      actor: (await auth())?.user ?? null,
      requestScoped: true,
    };
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("outside a request scope")
    ) {
      // Server-render unit tests intentionally call the page without a Next
      // request. Real HTTP requests always take the requestScoped branch.
      return { actor: null, requestScoped: false };
    }
    throw error;
  }
}

type RegistrationEvent = NonNullable<
  Awaited<ReturnType<typeof loadEventForRegistration>>
>;

function isRegisterableEventForWorkspace(
  event: Awaited<ReturnType<typeof loadEventForRegistration>>,
): event is RegistrationEvent & { status: "confirmed" | "imported" } {
  return (
    event !== null &&
    (event.status === "confirmed" || event.status === "imported")
  );
}

export default async function AppEventRegistrationGuidePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<EventRegistrationSearchParams>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const preferredLanguage = readSearchParam(query, "language");
  const actorContext = await currentRegistrationActor();
  if (actorContext.requestScoped && !actorContext.actor?.id) {
    redirect(
      `/app/account/login?next=${encodeURIComponent(
        eventRegistrationReturnPath(id, preferredLanguage),
      )}`,
    );
  }
  const actor = actorContext.actor;
  const language = await getEventRegistrationPageLanguage(preferredLanguage);
  const event = await loadEventForRegistration(id, actor?.id);

  if (isRegisterableEventForWorkspace(event)) {
    const eventLanguage = language === "en" ? "en" : "zh";
    // live 活动的 title/venue 是「日/中/英」斜杠拼接串;进入画像问答前按
    // 当前语言挑出单一段。公开目录在 DTO 层只保留中文展示字段，因此标题
    // 优先复用按稳定活动 id 审阅过的展示内容，再由统一服务端本地化器处理
    // 地点等中文单段；标题展示与模型生成的题目措辞由此保持同一语言。
    const localizedEvent = localizeOrbitTree(
      {
        ...event,
        title:
          eventTitleForId(event.id, eventLanguage) ??
          localizedEventTitle(event, eventLanguage),
        venue: bilingualSegment(event.venue, eventLanguage),
      },
      eventLanguage,
    );
    const [questionSet, registration, profileResult] = await Promise.all([
      generateEventRegistrationQuestions({
        event: localizedEvent,
        language,
      }),
      actor?.id
        ? eventRegistrationRuntimeService.get({
            eventId: event.id,
            userId: actor.id,
          })
        : null,
      actor?.id
        ? createProfileService().getProfile({
            actorId: actor.id,
          })
        : null,
    ]);
    const actorProfile =
      profileResult?.success === true ? profileResult.data.profile : null;
    const displayName =
      actorProfile?.displayName.trim() ||
      actor?.name?.trim() ||
      actor?.email?.trim() ||
      (language === "en" ? "Orbit member" : "Orbit 成员");

    return (
      <>
        <OrbitReferenceStyles />
        <EventRegistrationWorkspace
          event={{
            id: localizedEvent.id,
            title: localizedEvent.title,
            venue: localizedEvent.venue,
          }}
          initialRegistration={registration}
          language={language}
          profile={{ displayName }}
          questionSet={questionSet}
        />
        <OrbitVisualFreezeRuntime />
      </>
    );
  }

  return (
    <>
      <OrbitReferenceStyles />
      <main className="orbit-page" style={{ minHeight: "100dvh", padding: 24 }}>
        <StateView
          description={
            event
              ? language === "en"
                ? "This event is no longer open for registration."
                : "该活动当前已不再开放报名。"
              : language === "en"
                ? "This event is not available to the signed-in account."
                : "当前登录账号无法访问该活动。"
          }
          emptyState={
            language === "en"
              ? "No registration answers were saved."
              : "未保存任何报名回答。"
          }
          evidence={
            event
              ? event.evidence.map((item) => item.evidenceId)
              : [`event:${id}:registration-unavailable`]
          }
          eyebrow={language === "en" ? "Event registration" : "活动报名"}
          guardrail={
            language === "en"
              ? "This boundary does not create a registration, generate questions, update a profile, notify attendees, send messages, or call an AI provider."
              : "此边界不会创建报名、生成问题、更新资料、通知参与者、发送消息或调用 AI 服务。"
          }
          nextStep={
            language === "en"
              ? "Return to Events and choose an upcoming event available to this account."
              : "返回活动列表，选择当前账号可访问的待开始活动。"
          }
          recoveryActions={[
            {
              href: "/app/events",
              id: "event-registration-return",
              label: language === "en" ? "Return to events" : "返回活动",
              recoveryCopy:
                language === "en"
                  ? "Choose an upcoming event before starting registration."
                  : "选择待开始活动后再开始报名。",
            },
          ]}
          title={
            language === "en" ? "Registration unavailable" : "报名暂不可用"
          }
        />
      </main>
      <OrbitVisualFreezeRuntime />
    </>
  );
}
