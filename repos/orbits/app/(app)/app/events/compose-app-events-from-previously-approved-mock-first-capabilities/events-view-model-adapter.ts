import type {
  AppEventsEventChoiceViewModel,
  AppEventsRouteViewModel,
} from "./events-route-view-model";
import type {
  OrbitLandingEventView,
  OrbitLandingViewModel,
} from "../../orbit-landing-route-view-model";
import { getDemoEventSceneAsset } from "../../../../../shared/demo-visual-assets";
import { ORBIT_DEFAULT_LANGUAGE, type OrbitLanguage } from "../../orbit-language-core";

const ADAPTER_COPY = {
  feeLabel: { ja: "参加費は主催者の案内に従います", zh: "费用以主办方说明为准", en: "Fee as announced by the organizer" },
  industry: { ja: "人脈づくり", zh: "人脉拓展", en: "Relationship" },
  nextAction: { ja: "次のアクション", zh: "下一步", en: "Next action" },
  nextTime: { ja: "次へ", zh: "下一步", en: "Next" },
  readiness: { ja: "準備状況", zh: "准备度", en: "Readiness" },
  readinessUnavailable: { ja: "準備状況はまだありません", zh: "暂无准备度", en: "Readiness unavailable" },
  relationshipContext: { ja: "関係の背景", zh: "关系背景", en: "Relationship context" },
  reviewTime: { ja: "確認", zh: "复核", en: "Review" },
  sourceTime: { ja: "出典", zh: "来源", en: "Source" },
} satisfies Record<string, Record<OrbitLanguage, string>>;

function readinessScoreLabel(score: number, language: OrbitLanguage): string {
  return { ja: `準備スコア ${score}`, zh: `准备度 ${score}`, en: `Readiness score ${score}` }[language];
}

type AppEventsSuccessRouteViewModel = Extract<
  AppEventsRouteViewModel,
  { state: "success" }
>;

function eventStatusFor(
  event: AppEventsEventChoiceViewModel,
): OrbitLandingEventView["status"] {
  if (event.status === "cancelled") {
    return "ended";
  }

  const startsAt = new Date(event.startsAt).getTime();
  const endsAt = new Date(event.endsAt).getTime();
  const now = Date.now();

  if (Number.isFinite(endsAt) && endsAt < now) {
    return "ended";
  }

  if (
    Number.isFinite(startsAt) &&
    Number.isFinite(endsAt) &&
    startsAt <= now &&
    now <= endsAt
  ) {
    return "active";
  }

  return "upcoming";
}

/** Mapper bound to the page language (use with `.map(...)`). */
export function eventChoiceToLandingEventIn(language: OrbitLanguage) {
  return (event: AppEventsEventChoiceViewModel, index: number) =>
    eventChoiceToLandingEvent(event, index, language);
}

export function eventChoiceToLandingEvent(
  event: AppEventsEventChoiceViewModel,
  index: number,
  language: unknown = ORBIT_DEFAULT_LANGUAGE,
): OrbitLandingEventView {
  // `.map(eventChoiceToLandingEvent)` passes the array as the third argument,
  // so only a real language string is honoured.
  const lang: OrbitLanguage =
    language === "ja" || language === "zh" || language === "en"
      ? language
      : ORBIT_DEFAULT_LANGUAGE;
  const copy = (key: keyof typeof ADAPTER_COPY) => ADAPTER_COPY[key][lang];
  const status = eventStatusFor(event);
  const description = [event.relationshipValue, event.nextAction]
    .filter(Boolean)
    .join(" ");
  const sceneAsset = getDemoEventSceneAsset(event.id);

  return {
    address: event.venue,
    agenda: [
      {
        description: event.relationshipValue,
        label: copy("relationshipContext"),
        time: copy("sourceTime"),
      },
      {
        description: event.nextAction,
        label: copy("nextAction"),
        time: copy("nextTime"),
      },
      {
        description:
          event.readinessScore === null
            ? copy("readinessUnavailable")
            : readinessScoreLabel(event.readinessScore, lang),
        label: copy("readiness"),
        time: copy("reviewTime"),
      },
    ],
    brandColor: "#6359E9",
    cap: 20,
    canonicalEventId: event.canonicalEventId,
    code: event.id,
    descriptionZh: description,
    detailLogoUrl: sceneAsset?.src ?? "",
    endsAt: event.endsAt,
    feeLabel: copy("feeLabel"),
    host: "",
    id: event.id,
    industry: copy("industry"),
    logoUrl: sceneAsset?.src ?? "",
    mapX: 38 + ((index * 11) % 34),
    mapY: 36 + ((index * 7) % 32),
    name: event.title,
    organizer: "",
    participantCount: 0,
    place: event.venue,
    startsAt: event.startsAt,
    stats: {
      attendees: [],
      authed: true,
      count: 0,
      youRsvped: false,
    },
    status,
    summaryZh: description,
    // UI-audit fix C5. This synthesised "tags" from two values that are not
    // topics: the raw status enum and the readiness score formatted as a slug.
    // Both surfaces that read event.tags treat it as the card's topic row and
    // as the topic filter chips, so /app/events offered filters reading
    // "confirmed", "imported", "draft" and "readiness-75" — internal tokens,
    // untranslated, and the status one duplicating the dedicated status chip
    // group right beside it. Status stays available as event.status; readiness
    // is a score, not a topic. No real topic data exists yet, so the row falls
    // back to industry alone rather than inventing labels.
    tags: [],
    theme: "relationship",
    venue: event.venue,
    youRsvped: false,
  };
}

export function eventsRouteToOrbitLandingViewModel(
  model: AppEventsSuccessRouteViewModel,
): OrbitLandingViewModel {
  return {
    account: {
      fullName: "Orbit",
    },
    connections: [],
    events: model.workspace.eventChoices.map(eventChoiceToLandingEvent),
  };
}
