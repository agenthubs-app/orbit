import { StateView } from "../../../../../../shared/ui/state-view";
import { auth } from "../../../../../../auth";
import {
  loadRegistrationProfileGuideForCurrentTestUser,
  normalizeRegistrationProfileGuideLanguage,
  type RegistrationProfileGuide,
  type RegistrationProfileGuideLanguage,
  type RegistrationProfileGuideResult,
} from "../../../../../../features/events/registration-profile-guide";
import type { OrbitLanguage } from "../../../orbit-language-core";
import { getOrbitServerLanguage } from "../../../orbit-language-server";
import { OrbitReferenceStyles } from "../../../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../../../orbit-visual-freeze-runtime";
import {
  loadEventForRegistration,
  localizedEventTitle,
} from "../../../../../../features/events/registration/event-loader";
import { bilingualSegment } from "../../../../../../features/orbit-ai/event-recommendation-artifact-service";
import { generateEventRegistrationQuestions } from "../../../../../../features/events/registration/question-generator";
import {
  CURRENT_EVENT_REGISTRATION_PROFILE,
  eventRegistrationRuntimeService,
} from "../../../../../../features/events/registration/runtime";
import { EventRegistrationWorkspace } from "./event-registration-workspace";

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
): Promise<RegistrationProfileGuideLanguage> {
  if (preferredLanguage) {
    return normalizeRegistrationProfileGuideLanguage(preferredLanguage);
  }

  try {
    return normalizeRegistrationProfileGuideLanguage(
      await getOrbitServerLanguage(),
    );
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

function copy(
  language: OrbitLanguage,
  text: { en: string; zh: string },
): string {
  return language === "en" ? text.en : text.zh;
}

async function currentRegistrationActor() {
  try {
    return (await auth())?.user ?? null;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("outside a request scope")
    ) {
      return null;
    }
    throw error;
  }
}

function eventHref(
  guide: RegistrationProfileGuide,
): string {
  return `/app/events/${encodeURIComponent(guide.event.id)}?language=${guide.languagePreference}`;
}

function finalStepCue(language: RegistrationProfileGuideLanguage): string {
  return copy(language, {
    en: "This read-only fallback cannot save answers. Return to the event and retry after its registration record is confirmed or imported.",
    zh: "此只读兜底页不会保存回答。请返回活动，待报名记录确认为已发布或已导入后重试。",
  });
}

function isRegisterableEventForWorkspace(
  event: Awaited<ReturnType<typeof loadEventForRegistration>>,
): event is NonNullable<
  Awaited<ReturnType<typeof loadEventForRegistration>>
> {
  return (
    event !== null &&
    (event.status === "confirmed" || event.status === "imported")
  );
}

function failureTitle(result: Exclude<RegistrationProfileGuideResult, { state: "success" }>) {
  if (result.state === "not-registerable") {
    return "Registration questions are not available";
  }

  return "Registration guide could not load";
}

function failureDescription(
  result: Exclude<RegistrationProfileGuideResult, { state: "success" }>,
) {
  if (result.state === "not-registerable") {
    return result.reason;
  }

  return result.message;
}

function RegistrationGuideState({
  result,
}: {
  result: Exclude<RegistrationProfileGuideResult, { state: "success" }>;
}) {
  const evidenceIds =
    result.state === "failure" ? result.evidenceIds : [result.eventId];
  const title = failureTitle(result);

  return (
    <main className="orbit-page" style={{ minHeight: "100dvh", padding: 24 }}>
      <h1
        style={{
          color: "var(--ink)",
          fontSize: "2.5rem",
          lineHeight: 1,
          margin: "0 auto 18px",
          maxWidth: 960,
        }}
      >
        {title}
      </h1>
      <StateView
        description={failureDescription(result)}
        emptyState="No registration profile answers were saved."
        evidence={Array.from(evidenceIds)}
        eyebrow="Registration profile"
        guardrail="This route only reads event and profile context. It does not write profile fields, notify attendees, send messages, or call an AI provider."
        nextStep="Return to the event and review registration when the event is confirmed or imported."
        recoveryActions={[
          {
            href: "/app/events",
            id: "event-registration-guide-return",
            label: "Return to events",
            recoveryCopy:
              "Open a confirmed or imported event before answering profile questions.",
          },
        ]}
        title={title}
      />
    </main>
  );
}

function RegistrationGuideForm({
  guide,
  language,
}: {
  guide: RegistrationProfileGuide;
  language: RegistrationProfileGuideLanguage;
}) {
  return (
    <main
      data-orbit-registration-profile-guide="register"
      style={{
        background: "var(--bg-sunken)",
        minHeight: "100dvh",
        padding: "28px 16px",
      }}
    >
      <section
        style={{
          background: "var(--bg)",
          border: "1px solid var(--border)",
          borderRadius: 18,
          boxShadow: "var(--sh-md)",
          display: "grid",
          gap: 18,
          margin: "0 auto",
          maxWidth: 760,
          padding: 22,
        }}
      >
        <a
          href={eventHref(guide)}
          style={{
            color: "var(--text-2)",
            fontSize: 13,
            fontWeight: 650,
            textDecoration: "none",
          }}
        >
          {copy(language, { en: "Back to event", zh: "返回活动" })}
        </a>
        <header style={{ display: "grid", gap: 8 }}>
          <p
            style={{
              color: "var(--accent)",
              fontSize: 12,
              fontWeight: 750,
              letterSpacing: "0.08em",
              margin: 0,
              textTransform: "uppercase",
            }}
          >
            {copy(language, {
              en: "Registration profile",
              zh: "报名资料",
            })}
          </p>
          <h1
            className="h-display"
            style={{ color: "var(--ink)", margin: 0 }}
          >
            {guide.event.title}
          </h1>
          <p
            data-registration-guide-state="read-only"
            role="status"
            style={{ color: "var(--text-2)", fontSize: 15, lineHeight: 1.55, margin: 0 }}
          >
            {copy(language, {
              en: "Registration is temporarily read-only because the current event record could not be verified as confirmed or imported. Nothing entered here can be saved.",
              zh: "当前活动记录暂时无法验证为已发布或已导入，因此报名资料仅供只读查看；此处不会保存任何输入。",
            })}
          </p>
        </header>

        <section
          aria-label="Current profile context"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: 14,
            display: "grid",
            gap: 8,
            padding: 14,
          }}
        >
          <div style={{ color: "var(--ink)", fontSize: 14, fontWeight: 700 }}>
            {guide.currentUser.displayName} · {guide.currentUser.role}
          </div>
          <div style={{ color: "var(--text-2)", fontSize: 13.5, lineHeight: 1.5 }}>
            {guide.currentUser.headline}
          </div>
          <div style={{ color: "var(--text-3)", fontSize: 12.5 }}>
            {copy(language, { en: "Missing field", zh: "待补字段" })}:{" "}
            {guide.currentUser.missingFieldContext
              .map((field) => field.description)
              .join(" / ")}
          </div>
        </section>

        <section
          aria-label={copy(language, {
            en: "Read-only registration profile questions",
            zh: "只读报名资料问题",
          })}
          style={{ display: "grid", gap: 14 }}
        >
          {guide.questions.map((question, index) => (
            <fieldset
              key={question.id}
              style={{
                border: "1px solid var(--border)",
                borderRadius: 14,
                display: "grid",
                gap: 10,
                margin: 0,
                padding: 16,
              }}
            >
              <legend
                style={{
                  color: "var(--accent)",
                  fontSize: 12,
                  fontWeight: 750,
                  padding: "0 6px",
                }}
              >
                {copy(language, { en: `Question ${index + 1}`, zh: `问题 ${index + 1}` })}
              </legend>
              <label style={{ display: "grid", gap: 8 }}>
                <span style={{ color: "var(--ink)", fontSize: 15, fontWeight: 700, lineHeight: 1.45 }}>
                  {question.prompt}
                </span>
                <textarea
                  aria-label={copy(language, {
                    en: "Answer unavailable in read-only mode",
                    zh: "只读模式下无法填写回答",
                  })}
                  name={question.id}
                  placeholder={copy(language, {
                    en: "Return to the event and retry when registration is available.",
                    zh: "请返回活动，待报名恢复可用后重试。",
                  })}
                  readOnly
                  style={{
                    border: "1px solid var(--border-2)",
                    borderRadius: 12,
                    color: "var(--ink)",
                    fontFamily: "var(--ff)",
                    fontSize: 14,
                    lineHeight: 1.5,
                    minHeight: 84,
                    padding: 12,
                    resize: "vertical",
                  }}
                />
              </label>
              <p
                aria-label={copy(language, {
                  en: "Profile field context",
                  zh: "关系资料字段说明",
                })}
                style={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  color: "var(--text-2)",
                  fontSize: 13,
                  lineHeight: 1.45,
                  margin: 0,
                  padding: 10,
                }}
              >
                {copy(language, {
                  en: "Profile field",
                  zh: "关系资料字段",
                })}
                : {question.profileFieldDescription}
              </p>
              <p style={{ color: "var(--text-3)", fontSize: 13, lineHeight: 1.45, margin: 0 }}>
                {question.rationale}
              </p>
              <label
                style={{
                  alignItems: "center",
                  color: "var(--text-2)",
                  display: "flex",
                  fontSize: 13,
                  gap: 8,
                }}
              >
                <input disabled name={`${question.id}:skip`} type="checkbox" />
                {question.skipLabel}
              </label>
              <div style={{ color: "var(--accent)", fontSize: 12.5, fontWeight: 650 }}>
                {question.stagedAnswerLabel}
              </div>
            </fieldset>
          ))}
          <div
            style={{
              display: "grid",
              gap: 10,
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            }}
          >
            <a
              aria-label={copy(language, { en: "Return to event", zh: "返回活动" })}
              href={eventHref(guide)}
              style={{
                alignItems: "center",
                background: "var(--accent)",
                border: "1px solid var(--accent)",
                borderRadius: 12,
                color: "var(--on-dark)",
                cursor: "pointer",
                display: "flex",
                fontSize: 15,
                fontWeight: 700,
                justifyContent: "center",
                minHeight: 46,
                textDecoration: "none",
              }}
            >
              {copy(language, { en: "Return to event", zh: "返回活动" })}
            </a>
            <a
              href={eventHref(guide)}
              style={{
                alignItems: "center",
                background: "var(--surface)",
                border: "1px solid var(--border-2)",
                borderRadius: 12,
                color: "var(--text-2)",
                display: "flex",
                fontSize: 15,
                fontWeight: 650,
                justifyContent: "center",
                minHeight: 46,
                textDecoration: "none",
              }}
            >
              {guide.skipGuideLabel}
            </a>
          </div>
          <p
            style={{
              color: "var(--text-3)",
              fontSize: 13,
              lineHeight: 1.45,
              margin: 0,
            }}
          >
            {finalStepCue(language)}
          </p>
        </section>
      </section>
    </main>
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
  const language = await getEventRegistrationPageLanguage(preferredLanguage);
  const result = await loadRegistrationProfileGuideForCurrentTestUser({
    eventId: id,
    languagePreference: language,
    mode: readSearchParam(query, "mode"),
    scenario: readSearchParam(query, "scenario"),
  });
  const event = await loadEventForRegistration(id);

  if (isRegisterableEventForWorkspace(event)) {
    // live 活动的 title/venue 是「日/中/英」斜杠拼接串;进入画像问答前按
    // 当前语言挑出单一段,标题展示与模型生成的题目措辞保持同一语言。
    const localizedEvent = {
      ...event,
      title: localizedEventTitle(event, language === "en" ? "en" : "zh"),
      venue: bilingualSegment(event.venue, language === "en" ? "en" : "zh"),
    };
    const actor = await currentRegistrationActor();
    const [questionSet, registration] = await Promise.all([
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
    ]);
    const profile = actor
      ? {
          displayName: actor.name || CURRENT_EVENT_REGISTRATION_PROFILE.displayName,
          headline:
            result.state === "success"
              ? result.guide.currentUser.headline
              : CURRENT_EVENT_REGISTRATION_PROFILE.headline,
        }
      : result.state === "success"
        ? {
            displayName: result.guide.currentUser.displayName,
            headline: result.guide.currentUser.headline,
          }
        : CURRENT_EVENT_REGISTRATION_PROFILE;

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
          profile={profile}
          questionSet={questionSet}
        />
        <OrbitVisualFreezeRuntime />
      </>
    );
  }

  return (
    <>
      <OrbitReferenceStyles />
      {result.state === "success" ? (
        <RegistrationGuideForm guide={result.guide} language={language} />
      ) : (
        <RegistrationGuideState result={result} />
      )}
      <OrbitVisualFreezeRuntime />
    </>
  );
}
