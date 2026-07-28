import type {
  EventCrudImportFailure,
  EventCrudImportScenario,
  EventRecord,
  EventStatus,
} from "./event-crud-and-import/contract";
import {
  mockEventRecords,
  mockOrbitAiRecommendedEventDetailRecord,
} from "./event-crud-and-import/fixtures";
import { resolveEventCrudAndImportService } from "./service-factory";
import type {
  ManualProfile,
  ProfileCompleteness,
  ProfileCompletenessField,
} from "../profile/contract";
import {
  mockManualProfile,
  mockProfileFixture,
} from "../profile/fixtures";
import type { ModuleMode } from "../../shared/services/module-mode";

export const REGISTRATION_PROFILE_GUIDE_FIXTURE_SOURCE =
  "fixture:features/events/registration-profile-guide.ts" as const;

export type RegistrationProfileGuideLanguage = "en" | "zh";

export type RegistrationProfileGuideState =
  | "success"
  | "not-registerable"
  | "failure";

export interface RegistrationProfileGuideQuestion {
  eventSignal: string;
  id: string;
  missingProfileFields: readonly ProfileCompletenessField[];
  profileField: ProfileCompletenessField;
  profileFieldDescription: string;
  profileFieldLabel: string;
  prompt: string;
  rationale: string;
  skipLabel: string;
  stagedAnswerLabel: string;
}

export interface RegistrationProfileGuideProfileFieldContext {
  description: string;
  field: ProfileCompletenessField;
  label: string;
}

export interface RegistrationProfileGuide {
  answersPersistence: "staged-until-confirmed";
  confirmationLabel: string;
  currentUser: {
    displayName: string;
    headline: string;
    homeMarket: string;
    id: string;
    missingFieldContext: readonly RegistrationProfileGuideProfileFieldContext[];
    missingFields: readonly ProfileCompletenessField[];
    organization: string;
    relationshipGoal: string;
    role: string;
    targetRelationshipTypes: readonly string[];
  };
  event: {
    id: string;
    status: EventStatus;
    title: string;
    venue: string;
  };
  languagePreference: RegistrationProfileGuideLanguage;
  provenance: {
    aiProviderRequested: false;
    evidenceIds: readonly string[];
    externalNetworkRequested: false;
    generationMethod: "deterministic-demo-fixture";
    liveDatabaseWriteExecuted: false;
    profileWriteExecuted: false;
    source: typeof REGISTRATION_PROFILE_GUIDE_FIXTURE_SOURCE;
    sourceLabel: string;
  };
  questions: readonly RegistrationProfileGuideQuestion[];
  skipGuideLabel: string;
  stagedNotice: string;
  targetAttendees: string;
  topic: string;
}

export type RegistrationProfileGuideResult =
  | {
      state: "success";
      guide: RegistrationProfileGuide;
    }
  | {
      state: "not-registerable";
      eventId: string;
      reason: string;
    }
  | {
      state: "failure";
      errorCode: string;
      evidenceIds: readonly string[];
      message: string;
    };

interface RegistrationProfileGuideInput {
  completeness?: ProfileCompleteness;
  event: EventRecord;
  languagePreference?: RegistrationProfileGuideLanguage | string | null;
  profile?: ManualProfile;
}

interface RegistrationProfileGuideLoadInput {
  actorId?: string | null;
  eventId: string;
  languagePreference?: RegistrationProfileGuideLanguage | string | null;
  mode?: ModuleMode | string | null;
  scenario?: EventCrudImportScenario | string | null;
}

interface EventGuideProfile {
  topic: {
    en: string;
    zh: string;
  };
  targetAttendees: {
    en: string;
    zh: string;
  };
  prompts: {
    en: readonly EventGuidePrompt[];
    zh: readonly EventGuidePrompt[];
  };
}

interface EventGuidePrompt {
  eventSignal: string;
  field: ProfileCompletenessField;
  id: string;
  prompt: string;
  rationale: string;
}

const registerableStatuses = new Set<EventStatus>(["confirmed", "imported"]);

const deterministicDemoRegistrationEvents: readonly EventRecord[] = [
  ...mockEventRecords,
  mockOrbitAiRecommendedEventDetailRecord,
];

const guideProfiles = {
  "demo-event-1": {
    topic: {
      en: "climate founder operator introductions",
      zh: "气候创始人与运营方引荐",
    },
    targetAttendees: {
      en: "climate founders and operator investors",
      zh: "气候创业者和运营型投资人",
    },
    prompts: {
      en: [
        {
          eventSignal: "climate founder topic",
          field: "relationshipGoal",
          id: "climate-goal",
          prompt:
            "Ari, which climate founder problem should Orbit mention first when you meet climate founders and operator investors?",
          rationale:
            "Uses Ari's relationship goal and the dinner topic before any profile answer is saved.",
        },
        {
          eventSignal: "operator investor audience",
          field: "targetRelationshipTypes",
          id: "climate-targets",
          prompt:
            "Which attendee type matters most for this dinner: founders, operator investors, or event hosts?",
          rationale:
            "Connects the target attendee mix to Ari's existing relationship-type profile fields.",
        },
        {
          eventSignal: "Tokyo event context",
          field: "homeMarket",
          id: "climate-market",
          prompt:
            "What Tokyo context should be visible so a climate operator can place your Orbit work quickly?",
          rationale:
            "Uses the current home market field instead of asking for a generic bio.",
        },
        {
          eventSignal: "missing intro channel",
          field: "preferredIntroChannels",
          id: "climate-intro-channel",
          prompt:
            "Which preferred intro channels should Orbit stage for climate follow-up after this dinner?",
          rationale:
            "Fills the current user's missing preferred intro channels before registration is confirmed.",
        },
      ],
      zh: [
        {
          eventSignal: "气候创始人主题",
          field: "relationshipGoal",
          id: "climate-goal",
          prompt:
            "Ari，和气候创业者、运营型投资人见面时，Orbit 应该先说明哪一个气候业务问题？",
          rationale:
            "使用 Ari 已填写的关系目标和活动主题，回答只先暂存。",
        },
        {
          eventSignal: "运营型投资人受众",
          field: "targetRelationshipTypes",
          id: "climate-targets",
          prompt:
            "这场晚宴里最该优先匹配哪类人：创业者、运营型投资人，还是活动主办方？",
          rationale:
            "把活动受众和 Ari 已有的目标关系类型对齐。",
        },
        {
          eventSignal: "东京活动上下文",
          field: "homeMarket",
          id: "climate-market",
          prompt:
            "为了让气候运营方快速理解你在做什么，东京市场背景里哪一点要写进资料？",
          rationale:
            "使用当前 home market 字段，不让用户重写一段空泛介绍。",
        },
        {
          eventSignal: "缺少引荐渠道",
          field: "preferredIntroChannels",
          id: "climate-intro-channel",
          prompt:
            "这场气候晚宴之后，Orbit 应该先暂存哪些 preferred intro channels？",
          rationale:
            "补当前用户缺少的 preferred intro channels，确认前不会写入资料。",
        },
      ],
    },
  },
  "demo-event-2": {
    topic: {
      en: "storage pilot operator validation",
      zh: "储能试点运营方验证",
    },
    targetAttendees: {
      en: "operators evaluating partner pilot programs",
      zh: "评估合作试点的运营负责人",
    },
    prompts: {
      en: [
        {
          eventSignal: "storage pilot topic",
          field: "relationshipGoal",
          id: "storage-goal",
          prompt:
            "Which storage pilot blocker should Ari bring into the operator breakfast first?",
          rationale:
            "Grounds the question in the event topic and Ari's relationship goal.",
        },
        {
          eventSignal: "operator attendee target",
          field: "targetRelationshipTypes",
          id: "storage-targets",
          prompt:
            "Which target attendee would make this storage pilot conversation useful: BD partners, event hosts, or founders?",
          rationale:
            "Uses the current target relationship types rather than a blank attendee preference.",
        },
        {
          eventSignal: "Orbit founder headline",
          field: "headline",
          id: "storage-headline",
          prompt:
            "What one-line Orbit founder context should operators see before they decide whether to compare pilot notes?",
          rationale:
            "Turns Ari's headline into a registration prompt for this specific operator room.",
        },
        {
          eventSignal: "missing intro channel",
          field: "preferredIntroChannels",
          id: "storage-intro-channel",
          prompt:
            "Which preferred intro channels should be staged if an operator wants a storage pilot follow-up?",
          rationale:
            "Covers the only missing profile field without saving the answer.",
        },
      ],
      zh: [
        {
          eventSignal: "储能试点主题",
          field: "relationshipGoal",
          id: "storage-goal",
          prompt:
            "Ari，早餐会开始前，哪一个储能试点阻碍最值得先带给运营负责人？",
          rationale:
            "把活动主题和 Ari 的关系目标连起来，回答只在本地暂存。",
        },
        {
          eventSignal: "运营方受众",
          field: "targetRelationshipTypes",
          id: "storage-targets",
          prompt:
            "这场储能试点对话里，哪类目标关系最重要：BD partners、event hosts，还是 founders？",
          rationale:
            "使用当前 targetRelationshipTypes，而不是问一组空泛偏好。",
        },
        {
          eventSignal: "Orbit 创始人简介",
          field: "headline",
          id: "storage-headline",
          prompt:
            "为了让运营负责人愿意交换试点笔记，Orbit founder 的一句话背景应该怎么写？",
          rationale:
            "把 Ari 已有 headline 改成适合这场运营方早餐会的资料问题。",
        },
        {
          eventSignal: "缺少引荐渠道",
          field: "preferredIntroChannels",
          id: "storage-intro-channel",
          prompt:
            "如果运营负责人愿意继续聊储能试点，应该先暂存哪些 preferred intro channels？",
          rationale:
            "补当前缺失字段，确认前不写入 profile。",
        },
      ],
    },
  },
  event_001: {
    topic: {
      en: "seed investor founder matching",
      zh: "种子投资人与创始人匹配",
    },
    targetAttendees: {
      en: "seed investors and founders collecting feedback",
      zh: "种子投资人和收集反馈的创始人",
    },
    prompts: {
      en: [
        {
          eventSignal: "seed investor topic",
          field: "relationshipGoal",
          id: "investor-goal",
          prompt:
            "Which founder feedback goal should Ari name before meeting seed investors at this salon?",
          rationale:
            "Uses the investor salon context and Ari's relationship goal before staging answers.",
        },
        {
          eventSignal: "investor attendee target",
          field: "targetRelationshipTypes",
          id: "investor-targets",
          prompt:
            "Which target attendee group should Orbit look for first: founders seeking feedback, seed investors, or event hosts?",
          rationale:
            "Maps the event's target attendees to Ari's existing relationship-type profile fields.",
        },
        {
          eventSignal: "Orbit founder profile",
          field: "headline",
          id: "investor-headline",
          prompt:
            "What should the profile say about Orbit so investors understand the warm-intro operating system in one line?",
          rationale:
            "Adapts the current headline to this investor and founder room.",
        },
        {
          eventSignal: "missing intro channel",
          field: "preferredIntroChannels",
          id: "investor-intro-channel",
          prompt:
            "Which preferred intro channels should Orbit stage if a seed investor asks for a warm introduction?",
          rationale:
            "Asks for the current user's missing preferred intro channels without writing them yet.",
        },
      ],
      zh: [
        {
          eventSignal: "种子投资人主题",
          field: "relationshipGoal",
          id: "investor-goal",
          prompt:
            "Ari，见种子投资人前，哪一个 founder feedback 目标应该先写进报名资料？",
          rationale:
            "使用投资人沙龙上下文和 Ari 的关系目标，回答只先暂存。",
        },
        {
          eventSignal: "投资人受众",
          field: "targetRelationshipTypes",
          id: "investor-targets",
          prompt:
            "Orbit 应该优先识别哪类人：要反馈的 founders、seed investors，还是 event hosts？",
          rationale:
            "把活动目标受众和 Ari 已有关系类型字段对齐。",
        },
        {
          eventSignal: "Orbit 创始人资料",
          field: "headline",
          id: "investor-headline",
          prompt:
            "为了让投资人一句话理解 Orbit，资料里应该怎么写 warm-intro operating system？",
          rationale:
            "把当前 headline 改成适合投资人和创始人沙龙的版本。",
        },
        {
          eventSignal: "缺少引荐渠道",
          field: "preferredIntroChannels",
          id: "investor-intro-channel",
          prompt:
            "如果种子投资人想要 warm introduction，Orbit 应该先暂存哪些 preferred intro channels？",
          rationale:
            "补当前缺少的 preferred intro channels，确认前不会写入资料。",
        },
      ],
    },
  },
} as const satisfies Record<string, EventGuideProfile>;

export function normalizeRegistrationProfileGuideLanguage(
  languagePreference?: RegistrationProfileGuideLanguage | string | null,
): RegistrationProfileGuideLanguage {
  return languagePreference === "en" ? "en" : "zh";
}

function copyForLanguage<TCopy>(
  copy: Record<RegistrationProfileGuideLanguage, TCopy>,
  languagePreference: RegistrationProfileGuideLanguage,
): TCopy {
  return copy[languagePreference];
}

function isRegisterableEvent(event: EventRecord): boolean {
  return registerableStatuses.has(event.status);
}

function profileFieldContext(
  field: ProfileCompletenessField,
  languagePreference: RegistrationProfileGuideLanguage,
): RegistrationProfileGuideProfileFieldContext {
  const descriptions: Record<
    ProfileCompletenessField,
    Record<RegistrationProfileGuideLanguage, string>
  > = {
    displayName: {
      en: "displayName: the name other people should recognize in Orbit.",
      zh: "displayName：别人应该在 Orbit 里认出的姓名。",
    },
    headline: {
      en: "headline: one line that explains your role and relationship context.",
      zh: "headline：一句话说明你的角色和关系背景。",
    },
    homeMarket: {
      en: "homeMarket: the market context that helps people place your work.",
      zh: "homeMarket：帮助对方理解你所在市场和工作场景的背景。",
    },
    preferredIntroChannels: {
      en: "preferredIntroChannels: preferred introduction channels, such as in-person event follow-up, email, or a mutual contact.",
      zh: "preferredIntroChannels：你偏好的引荐渠道，比如活动后当面引荐、邮件、共同联系人。",
    },
    relationshipGoal: {
      en: "relationshipGoal: the relationship outcome you want this event to support.",
      zh: "relationshipGoal：这场活动应该帮助推进的关系目标。",
    },
    targetRelationshipTypes: {
      en: "targetRelationshipTypes: the kinds of relationships Orbit should prioritize, such as founders, investors, operators, or hosts.",
      zh: "targetRelationshipTypes：Orbit 应优先匹配的关系类型，例如 founders、investors、operators 或 hosts。",
    },
  };

  return {
    description: descriptions[field][languagePreference],
    field,
    label: field,
  };
}

function currentUserView(input: {
  completeness: ProfileCompleteness;
  languagePreference: RegistrationProfileGuideLanguage;
  profile: ManualProfile;
}): RegistrationProfileGuide["currentUser"] {
  return {
    displayName: input.profile.displayName,
    headline: input.profile.headline,
    homeMarket: input.profile.homeMarket,
    id: input.profile.id,
    missingFieldContext: input.completeness.missingFields.map((field) =>
      profileFieldContext(field, input.languagePreference),
    ),
    missingFields: input.completeness.missingFields,
    organization: input.profile.organization,
    relationshipGoal: input.profile.relationshipGoal,
    role: input.profile.role,
    targetRelationshipTypes: input.profile.targetRelationshipTypes,
  };
}

function questionLabels(languagePreference: RegistrationProfileGuideLanguage) {
  if (languagePreference === "en") {
    return {
      skipLabel: "Skip this question",
      stagedAnswerLabel:
        "Staged for profile-building guidance until confirmed.",
    };
  }

  return {
    skipLabel: "先跳过这一题",
    stagedAnswerLabel: "回答只用于资料补全建议，确认前不会写入资料。",
  };
}

function buildQuestions(input: {
  completeness: ProfileCompleteness;
  event: EventRecord;
  guideProfile: EventGuideProfile;
  languagePreference: RegistrationProfileGuideLanguage;
}): RegistrationProfileGuideQuestion[] {
  const labels = questionLabels(input.languagePreference);
  const prompts = copyForLanguage(
    input.guideProfile.prompts,
    input.languagePreference,
  );

  return prompts.map((prompt) => ({
    eventSignal: prompt.eventSignal,
    id: `profile-question:${input.event.id}:${prompt.id}`,
    missingProfileFields: input.completeness.missingFields,
    profileField: prompt.field,
    profileFieldDescription: profileFieldContext(
      prompt.field,
      input.languagePreference,
    ).description,
    profileFieldLabel: profileFieldContext(
      prompt.field,
      input.languagePreference,
    ).label,
    prompt: prompt.prompt,
    rationale: prompt.rationale,
    skipLabel: labels.skipLabel,
    stagedAnswerLabel: labels.stagedAnswerLabel,
  }));
}

function failureFromEventFailure(
  failure: EventCrudImportFailure,
): RegistrationProfileGuideResult {
  return {
    state: "failure",
    errorCode: failure.error.code,
    evidenceIds: failure.error.evidenceIds,
    message: failure.error.message,
  };
}

function deterministicDemoRegistrationEvent(
  eventId: string,
): EventRecord | null {
  const normalizedEventId = eventId.trim();

  if (!normalizedEventId) {
    return null;
  }

  return (
    deterministicDemoRegistrationEvents.find(
      (event) => event.id === normalizedEventId,
    ) ?? null
  );
}

function shouldUseDeterministicDemoEvent(
  input: RegistrationProfileGuideLoadInput,
): boolean {
  return (
    input.scenario === undefined ||
    input.scenario === null ||
    input.scenario === "success"
  );
}

export function buildRegistrationProfileGuide(
  input: RegistrationProfileGuideInput,
): RegistrationProfileGuideResult {
  const languagePreference = normalizeRegistrationProfileGuideLanguage(
    input.languagePreference,
  );
  const completeness = input.completeness ?? mockProfileFixture.completeness;
  const profile = input.profile ?? mockManualProfile;
  const guideProfile = guideProfiles[input.event.id];

  if (!isRegisterableEvent(input.event)) {
    return {
      state: "not-registerable",
      eventId: input.event.id,
      reason:
        "Registration profile questions are shown only for confirmed or imported demo events.",
    };
  }

  if (!guideProfile) {
    return {
      state: "failure",
      errorCode: "REGISTRATION_PROFILE_GUIDE_EVENT_UNSUPPORTED",
      evidenceIds: input.event.evidence.map((evidence) => evidence.evidenceId),
      message:
        "No deterministic registration profile guide exists for this registerable event.",
    };
  }

  const stagedNotice =
    languagePreference === "en"
      ? "Answers stay local until you confirm. Orbit uses them only as staged profile-building guidance."
      : "回答会先留在本地。确认前，Orbit 只把它们当作资料补全建议。";

  return {
    state: "success",
    guide: {
      answersPersistence: "staged-until-confirmed",
      confirmationLabel:
        languagePreference === "en"
          ? "Review and confirm staged answers"
          : "查看并确认暂存回答",
      currentUser: currentUserView({ completeness, languagePreference, profile }),
      event: {
        id: input.event.id,
        status: input.event.status,
        title: input.event.title,
        venue: input.event.venue,
      },
      languagePreference,
      provenance: {
        aiProviderRequested: false,
        evidenceIds: input.event.evidence.map((evidence) => evidence.evidenceId),
        externalNetworkRequested: false,
        generationMethod: "deterministic-demo-fixture",
        liveDatabaseWriteExecuted: false,
        profileWriteExecuted: false,
        source: REGISTRATION_PROFILE_GUIDE_FIXTURE_SOURCE,
        sourceLabel:
          "Deterministic event registration profile guide fixture",
      },
      questions: buildQuestions({
        completeness,
        event: input.event,
        guideProfile,
        languagePreference,
      }),
      skipGuideLabel:
        languagePreference === "en"
          ? "Skip profile questions"
          : "跳过资料问题",
      stagedNotice,
      targetAttendees: copyForLanguage(
        guideProfile.targetAttendees,
        languagePreference,
      ),
      topic: copyForLanguage(guideProfile.topic, languagePreference),
    },
  };
}

export function listRegisterableDemoRegistrationProfileGuides(input: {
  languagePreference?: RegistrationProfileGuideLanguage | string | null;
} = {}): RegistrationProfileGuide[] {
  return deterministicDemoRegistrationEvents
    .map((event) =>
      buildRegistrationProfileGuide({
        completeness: mockProfileFixture.completeness,
        event,
        languagePreference: input.languagePreference,
        profile: mockManualProfile,
      }),
    )
    .filter(
      (result): result is Extract<RegistrationProfileGuideResult, { state: "success" }> =>
        result.state === "success",
    )
    .map((result) => result.guide);
}

export async function loadRegistrationProfileGuideForCurrentTestUser(
  input: RegistrationProfileGuideLoadInput,
): Promise<RegistrationProfileGuideResult> {
  const deterministicEvent = shouldUseDeterministicDemoEvent(input)
    ? deterministicDemoRegistrationEvent(input.eventId)
    : null;

  if (deterministicEvent) {
    return buildRegistrationProfileGuide({
      completeness: mockProfileFixture.completeness,
      event: deterministicEvent,
      languagePreference: input.languagePreference,
      profile: mockManualProfile,
    });
  }

  const eventServiceResolution = resolveEventCrudAndImportService(
    input.mode ?? undefined,
  );

  if (eventServiceResolution.success === false) {
    return {
      state: "failure",
      errorCode: eventServiceResolution.error.code,
      evidenceIds: [eventServiceResolution.error.capabilityId],
      message: eventServiceResolution.error.message,
    };
  }

  const eventResult = await eventServiceResolution.service.getEvent({
    actorId: input.actorId?.trim() || undefined,
    eventId: input.eventId,
    scenario: input.scenario,
  });

  if (eventResult.success === false) {
    return failureFromEventFailure(eventResult);
  }

  return buildRegistrationProfileGuide({
    completeness: mockProfileFixture.completeness,
    event: eventResult.data.event,
    languagePreference: input.languagePreference,
    profile: mockManualProfile,
  });
}
