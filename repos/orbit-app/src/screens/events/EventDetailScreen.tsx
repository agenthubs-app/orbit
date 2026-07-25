import { Ionicons } from "@expo/vector-icons";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ImageBackground,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import {
  eventDetailPath,
  eventGoalPath,
  eventOpeningLinePath,
  eventPostEventConfirmPath,
  eventPostEventPath,
  eventReadinessPath,
  eventRecommendationsPath
} from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { DataCard } from "../../components/DataCard";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { colors, radius, spacing, typography } from "../../design/tokens";
import {
  type ApiResourceState,
  useApiResource
} from "../../hooks/useApiResource";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import {
  eventDetailHeroToView,
  eventDetailToSummary,
  type EventDetailAboutSectionView,
  type EventDetailAgendaItemView,
  type EventDetailAttendeePreviewView,
  type EventDetailSummary,
  eventGoalRequestFromReadiness,
  eventOpeningLineToView,
  eventPostEventConfirmRequestFromReview,
  eventPostEventConfirmToView,
  type EventPostEventConfirmView,
  eventPostEventReviewToView,
  type EventGoalSuggestionView,
  type EventRecommendedPersonView,
  eventReadinessToView,
  eventRecommendationsToView
} from "../../view-models/events";

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "event";
  }

  return value ?? "event";
}

export function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const eventId = firstParam(id);
  const { baseUrl } = useOrbitApiBaseUrl();
  const state = useApiResource<unknown>(eventDetailPath(eventId), () => false);
  const readinessState = useApiResource<unknown>(
    eventReadinessPath(eventId),
    () => false
  );
  const recommendationsState = useApiResource<unknown>(
    eventRecommendationsPath(eventId, 3),
    (data) => eventRecommendationsToView(data).people.length === 0
  );
  const postEventState = useApiResource<unknown>(
    eventPostEventPath(eventId),
    (data) => eventPostEventReviewToView(data).contacts.length === 0
  );

  return (
    <AppScreen
      eyebrow="活动详情"
      refreshControl={
        <RefreshControl
          onRefresh={() => {
            state.refresh();
            readinessState.refresh();
            recommendationsState.refresh();
            postEventState.refresh();
          }}
          refreshing={
            state.refreshing ||
            readinessState.refreshing ||
            recommendationsState.refreshing ||
            postEventState.refreshing
          }
          tintColor={colors.accent}
        />
      }
      title="活动"
    >
      {state.kind === "loading" ? <LoadingState /> : null}
      {state.kind === "offline" ? (
        <ErrorState message={state.error.message} title="服务器连不上" />
      ) : null}
      {state.kind === "failure" ? (
        <ErrorState message={state.error.message} />
      ) : null}
      {state.kind === "success" || state.kind === "empty" ? (
        <EventDetailCard
          baseUrl={baseUrl}
          data={state.data}
          postEventState={postEventState}
          readinessState={readinessState}
          recommendationsState={recommendationsState}
        />
      ) : null}
    </AppScreen>
  );
}

function assetUrl(baseUrl: string, path: string): string {
  if (/^https?:\/\//iu.test(path)) {
    return path;
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl.replace(/\/+$/u, "")}${normalizedPath}`;
}

function EventActionButton({
  detail,
  icon,
  onPress,
  title
}: {
  detail: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  title: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        pressed ? styles.actionButtonPressed : null
      ]}
    >
      <View style={styles.actionIcon}>
        <Ionicons color={colors.accent} name={icon} size={18} />
      </View>
      <Text numberOfLines={1} style={styles.actionTitle}>
        {title}
      </Text>
      <Text numberOfLines={2} style={styles.actionDetail}>
        {detail}
      </Text>
    </Pressable>
  );
}

function EventDetailCard({
  baseUrl,
  data,
  postEventState,
  readinessState,
  recommendationsState
}: {
  baseUrl: string;
  data: unknown;
  postEventState: ApiResourceState<unknown>;
  readinessState: ApiResourceState<unknown>;
  recommendationsState: ApiResourceState<unknown>;
}) {
  const router = useRouter();
  const event = eventDetailToSummary(data);
  const hero = eventDetailHeroToView(event);
  const registerHref = `/events/${encodeURIComponent(event.id)}/register` as Href;
  const attendeesHref = `/events/${encodeURIComponent(event.id)}/attendees` as Href;
  const partyHref = `/party?eventId=${encodeURIComponent(event.id)}` as Href;

  return (
    <>
      <View style={styles.eventHero}>
        <ImageBackground
          imageStyle={styles.eventHeroImage}
          source={{ uri: assetUrl(baseUrl, hero.coverPath) }}
          style={styles.eventHeroFrame}
        >
          <View style={styles.eventHeroScrim} />
          <View style={styles.eventHeroTopRow}>
            <Text style={styles.eventStatusBadge}>{hero.status}</Text>
          </View>
          <View style={styles.eventHeroText}>
            <Text numberOfLines={3} style={styles.eventHeroTitle}>
              {hero.title}
            </Text>
            <Text numberOfLines={2} style={styles.eventHeroDetail}>
              {hero.detailLine}
            </Text>
          </View>
        </ImageBackground>
        <View style={styles.eventHeroBody}>
          <Text style={styles.bodyText}>{hero.summary}</Text>
        </View>
      </View>
      <EventRegistrationModule
        event={event}
        onOpenAttendees={() => router.push(attendeesHref)}
        onOpenLive={() => router.push(partyHref)}
        onRegister={() => router.push(registerHref)}
      />
      <EventAboutModule sections={event.aboutSections} />
      <EventAgendaModule agenda={event.agenda} />
      <EventOrganizerModule event={event} />
      {event.sourceLabel || event.evidenceExcerpts.length > 0 ? (
        <DataCard detail={event.sourceLabel} title="来源证据">
          <View style={styles.stack}>
            {event.evidenceExcerpts.length > 0 ? (
              event.evidenceExcerpts.map((excerpt) => (
                <Text key={excerpt} style={styles.bodyText}>
                  {excerpt}
                </Text>
              ))
            ) : (
              <Text style={styles.bodyText}>这场活动有报名或导入来源记录。</Text>
            )}
          </View>
        </DataCard>
      ) : null}
      <DataCard detail={event.relationshipContext} title="会前重点">
        <Text style={styles.bodyText}>{event.preparation}</Text>
      </DataCard>
      <EventReadinessModule
        eventId={event.id}
        onGoalConfirmed={readinessState.refresh}
        state={readinessState}
      />
      <EventRecommendationsModule
        eventId={event.id}
        state={recommendationsState}
      />
      <EventPostEventReviewModule
        eventId={event.id}
        onConfirmed={postEventState.refresh}
        state={postEventState}
      />
      <DataCard detail={event.nextAction} title="下一步" />
    </>
  );
}

function EventRegistrationModule({
  event,
  onOpenAttendees,
  onOpenLive,
  onRegister
}: {
  event: EventDetailSummary;
  onOpenAttendees: () => void;
  onOpenLive: () => void;
  onRegister: () => void;
}) {
  const registrationStatusLabel =
    event.status === "已确认" ? "活动已确认" : event.status;

  return (
    <View style={styles.registrationCard}>
      <View style={styles.registrationHeader}>
        <View style={styles.registrationTitleBlock}>
          <Text style={styles.registrationEyebrow}>报名</Text>
          <Text style={styles.registrationFee}>{event.feeLabel}</Text>
        </View>
        <Text style={styles.eventStatusBadge}>{registrationStatusLabel}</Text>
      </View>
      <View style={styles.infoGrid}>
        <View style={styles.infoTile}>
          <Ionicons color={colors.accent} name="calendar-outline" size={18} />
          <View style={styles.infoTileBody}>
            <Text style={styles.infoTileTitle}>{event.startsAt}</Text>
            <Text style={styles.infoTileDetail}>活动时间</Text>
          </View>
        </View>
        <View style={styles.infoTile}>
          <Ionicons color={colors.text2} name="location-outline" size={18} />
          <View style={styles.infoTileBody}>
            <Text style={styles.infoTileTitle}>{event.location || "地点待定"}</Text>
            <Text style={styles.infoTileDetail}>{event.venueDetail}</Text>
          </View>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={onRegister}
        style={({ pressed }) => [
          styles.primaryCta,
          pressed ? styles.actionButtonPressed : null
        ]}
      >
        <Text style={styles.primaryCtaText}>{event.registrationActionLabel}</Text>
        <Ionicons color={colors.onAccent} name="arrow-forward-outline" size={16} />
      </Pressable>
      <View style={styles.registrationActionRow}>
        <EventActionButton
          detail={event.attendeeCountLabel}
          icon="people-outline"
          onPress={onOpenAttendees}
          title="参会者"
        />
        <EventActionButton
          detail="签到和介绍"
          icon="ticket-outline"
          onPress={onOpenLive}
          title="现场"
        />
      </View>
      {event.attendeePreview.length > 0 ? (
        <View style={styles.attendeePreviewRow}>
          {event.attendeePreview.map((attendee) => (
            <EventAttendeePreviewPill attendee={attendee} key={attendee.id} />
          ))}
        </View>
      ) : null}
      <Text style={styles.registrationHint}>{event.registrationDetail}</Text>
    </View>
  );
}

function EventAttendeePreviewPill({
  attendee
}: {
  attendee: EventDetailAttendeePreviewView;
}) {
  return (
    <View style={styles.attendeePreviewPill}>
      <View style={styles.attendeePreviewAvatar}>
        <Text style={styles.attendeePreviewAvatarText}>{attendee.initial}</Text>
      </View>
      <View style={styles.attendeePreviewBody}>
        <Text numberOfLines={1} style={styles.attendeePreviewName}>
          {attendee.name}
        </Text>
        {attendee.role ? (
          <Text numberOfLines={1} style={styles.attendeePreviewRole}>
            {attendee.role}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function EventAboutModule({
  sections
}: {
  sections: EventDetailAboutSectionView[];
}) {
  if (sections.length === 0) {
    return null;
  }

  return (
    <DataCard detail={`${sections.length} 个重点`} title="关于活动">
      <View style={styles.stack}>
        {sections.map((section) => (
          <View key={section.id} style={styles.aboutSectionRow}>
            <View style={styles.aboutSectionIcon}>
              <Ionicons
                color={colors.accent}
                name={section.iconName as keyof typeof Ionicons.glyphMap}
                size={17}
              />
            </View>
            <View style={styles.aboutSectionBody}>
              <Text style={styles.checklistTitle}>{section.title}</Text>
              <Text style={styles.checklistDetail}>{section.body}</Text>
            </View>
          </View>
        ))}
      </View>
    </DataCard>
  );
}

function EventAgendaModule({
  agenda
}: {
  agenda: EventDetailAgendaItemView[];
}) {
  if (agenda.length === 0) {
    return null;
  }

  return (
    <DataCard detail={`${agenda.length} 个环节`} title="当晚议程">
      <View style={styles.agendaStack}>
        {agenda.map((item, index) => (
          <View key={item.id} style={styles.agendaRow}>
            <View style={styles.agendaRail}>
              <View
                style={[
                  styles.agendaDot,
                  index === 0 ? styles.agendaDotActive : null
                ]}
              />
              {index < agenda.length - 1 ? <View style={styles.agendaLine} /> : null}
            </View>
            <View style={styles.agendaBody}>
              <View style={styles.agendaHeader}>
                <Text style={styles.agendaTime}>{item.time}</Text>
                <Text style={styles.checklistTitle}>{item.title}</Text>
              </View>
              {item.description ? (
                <Text style={styles.checklistDetail}>{item.description}</Text>
              ) : null}
            </View>
          </View>
        ))}
      </View>
    </DataCard>
  );
}

function EventOrganizerModule({ event }: { event: EventDetailSummary }) {
  const initial = event.organizerName.slice(0, 1) || "O";

  return (
    <DataCard detail={event.sourceLabel || event.venueDetail} title="主办方">
      <View style={styles.organizerRow}>
        <View style={styles.organizerAvatar}>
          <Text style={styles.organizerAvatarText}>{initial}</Text>
        </View>
        <View style={styles.organizerBody}>
          <Text numberOfLines={1} style={styles.organizerName}>
            {event.organizerName}
          </Text>
          <Text numberOfLines={2} style={styles.checklistDetail}>
            {event.sourceLabel || "活动来源和主办方信息会在这里同步。"}
          </Text>
        </View>
      </View>
    </DataCard>
  );
}

function EventReadinessModule({
  eventId,
  onGoalConfirmed,
  state
}: {
  eventId: string;
  onGoalConfirmed: () => void;
  state: ApiResourceState<unknown>;
}) {
  const client = useOrbitApiClient();
  const [goalPending, setGoalPending] = useState(false);
  const [goalDraft, setGoalDraft] = useState("");
  const [goalFeedback, setGoalFeedback] = useState<string | null>(null);
  const [goalError, setGoalError] = useState<string | null>(null);
  const [selectedSuggestionId, setSelectedSuggestionId] = useState<string | null>(
    null
  );
  const view =
    state.kind === "success" || state.kind === "empty"
      ? eventReadinessToView(state.data)
      : null;

  useEffect(() => {
    if (!view) {
      return;
    }

    setGoalDraft(view.canConfirmGoal ? view.goal : "");
    setGoalFeedback(null);
    setGoalError(null);
    setSelectedSuggestionId(view.selectedSuggestionId || null);
  }, [eventId, view?.canConfirmGoal, view?.goal, view?.selectedSuggestionId]);

  if (!view) {
    return null;
  }

  const readinessView = view;

  function chooseSuggestedGoal(suggestion: EventGoalSuggestionView) {
    setGoalDraft(suggestion.goalText);
    setGoalFeedback(null);
    setGoalError(null);
    setSelectedSuggestionId(suggestion.id);
  }

  async function confirmGoal() {
    const request = eventGoalRequestFromReadiness(readinessView, {
      goalText: goalDraft,
      selectedSuggestionId
    });

    if (!request) {
      setGoalError("先写一个这场活动的目标。");
      return;
    }

    setGoalPending(true);
    setGoalFeedback(null);
    setGoalError(null);

    const result = await client.put<unknown>(eventGoalPath(eventId), {
      body: request
    });

    if (result.success) {
      setGoalFeedback("活动目标已确认。");
      onGoalConfirmed();
    } else {
      setGoalError(result.error.message);
    }

    setGoalPending(false);
  }

  return (
    <DataCard detail={`${view.stateLabel} · ${view.scoreLabel}`} title="会前准备度">
      <View style={styles.readinessGoal}>
        <Ionicons color={colors.accent} name="flag-outline" size={17} />
        <View style={styles.readinessGoalBody}>
          <Text style={styles.bodyText}>{view.goal}</Text>
          {view.suggestedGoals.length > 0 ? (
            <View style={styles.goalSuggestionStack}>
              {view.suggestedGoals.map((suggestion) => {
                const selected = selectedSuggestionId === suggestion.id;

                return (
                  <Pressable
                    accessibilityRole="button"
                    key={suggestion.id}
                    onPress={() => chooseSuggestedGoal(suggestion)}
                    style={({ pressed }) => [
                      styles.goalSuggestionCard,
                      selected ? styles.goalSuggestionCardSelected : null,
                      pressed ? styles.actionButtonPressed : null
                    ]}
                  >
                    <View style={styles.goalSuggestionHeader}>
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.goalSuggestionTitle,
                          selected ? styles.goalSuggestionTitleSelected : null
                        ]}
                      >
                        {suggestion.title}
                      </Text>
                      <Text
                        style={[
                          styles.goalSuggestionActionText,
                          selected ? styles.goalSuggestionActionTextSelected : null
                        ]}
                      >
                        {selected ? "已选" : "用这个目标"}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.goalSuggestionGoal,
                        selected ? styles.goalSuggestionGoalSelected : null
                      ]}
                    >
                      {suggestion.goalText}
                    </Text>
                    {suggestion.detail ? (
                      <Text
                        style={[
                          styles.goalSuggestionDetail,
                          selected ? styles.goalSuggestionDetailSelected : null
                        ]}
                      >
                        {suggestion.detail}
                      </Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          <View style={styles.goalEditor}>
            <Text style={styles.goalInputLabel}>自定义目标</Text>
            <TextInput
              multiline
              onChangeText={(value) => {
                setGoalDraft(value);
                setGoalFeedback(null);
                setGoalError(null);
                setSelectedSuggestionId(null);
              }}
              placeholder="写清楚这场活动想换到什么关系结果"
              placeholderTextColor={colors.text4}
              style={styles.goalInput}
              textAlignVertical="top"
              value={goalDraft}
            />
          </View>
          {view.canConfirmGoal || goalDraft.trim() ? (
            <Pressable
              accessibilityRole="button"
              disabled={goalPending}
              onPress={() => {
                void confirmGoal();
              }}
              style={({ pressed }) => [
                styles.inlineButton,
                pressed ? styles.actionButtonPressed : null,
                goalPending ? styles.inlineButtonDisabled : null
              ]}
            >
              <Ionicons
                color={colors.accent}
                name="checkmark-outline"
                size={14}
              />
              <Text style={styles.inlineButtonText}>
                {goalPending ? "确认中" : "确认目标"}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      {goalFeedback ? <Text style={styles.feedbackText}>{goalFeedback}</Text> : null}
      {goalError ? <Text style={styles.errorText}>{goalError}</Text> : null}
      <View style={styles.stack}>
        {view.checklist.map((item) => (
          <View key={item.id} style={styles.checklistRow}>
            <View style={styles.checklistStatus}>
              <Text style={styles.checklistStatusText}>{item.statusLabel}</Text>
            </View>
            <View style={styles.checklistBody}>
              <Text style={styles.checklistTitle}>{item.title}</Text>
              <Text style={styles.checklistDetail}>{item.detail}</Text>
              <Text style={styles.checklistOwner}>{item.ownerLabel}</Text>
            </View>
          </View>
        ))}
      </View>
      <Text style={styles.nextHint}>{view.nextAction}</Text>
    </DataCard>
  );
}

function EventRecommendationsModule({
  eventId,
  state
}: {
  eventId: string;
  state: ApiResourceState<unknown>;
}) {
  const client = useOrbitApiClient();
  const [openersByPersonId, setOpenersByPersonId] = useState<
    Record<string, string>
  >({});
  const [pendingOpeningLineId, setPendingOpeningLineId] = useState<string | null>(
    null
  );
  const [openingLineStatus, setOpeningLineStatus] = useState<
    Record<string, string>
  >({});
  const [openingLineError, setOpeningLineError] = useState<string | null>(null);

  if (state.kind !== "success" && state.kind !== "empty") {
    return null;
  }

  const view = eventRecommendationsToView(state.data);

  if (view.people.length === 0) {
    return null;
  }

  async function refreshOpeningLine(person: EventRecommendedPersonView) {
    setPendingOpeningLineId(person.id);
    setOpeningLineError(null);

    const result = await client.post<unknown>(
      eventOpeningLinePath(eventId, person.attendeeId, "context_question"),
      {
        body: {
          attendeeId: person.attendeeId,
          style: "context_question"
        }
      }
    );

    if (result.success) {
      const refreshed = eventOpeningLineToView(result.data);

      setOpenersByPersonId((current) => ({
        ...current,
        [person.id]: refreshed.opener
      }));
      setOpeningLineStatus((current) => ({
        ...current,
        [person.id]: refreshed.statusLabel
      }));
    } else {
      setOpeningLineError(result.error.message);
    }

    setPendingOpeningLineId(null);
  }

  return (
    <DataCard detail={view.nextAction} title="推荐认识的人">
      <View style={styles.stack}>
        {view.people.map((person) => (
          <View key={person.id} style={styles.recommendationRow}>
            <View style={styles.recommendationPersonHeader}>
              <RecommendedPersonAvatar
                initial={person.name.slice(0, 1)}
                rankLabel={person.rankLabel}
              />
              <View style={styles.recommendationPersonBody}>
                <View style={styles.recommendationHeader}>
                  <Text style={styles.recommendationName}>{person.name}</Text>
                  <Text style={styles.scoreLabel}>{person.scoreLabel}</Text>
                </View>
                {person.organizationRole ? (
                  <Text style={styles.recommendationMeta}>
                    {person.organizationRole}
                  </Text>
                ) : null}
              </View>
            </View>
            <Text style={styles.checklistDetail}>{person.reason}</Text>
            <View style={styles.openingLineBox}>
              <Ionicons color={colors.accent} name="chatbubble-ellipses-outline" size={16} />
              <View style={styles.openingLineBody}>
                <Text style={styles.openingLineText}>
                  {openersByPersonId[person.id] ?? person.opener}
                </Text>
                <View style={styles.openingLineFooter}>
                  {openingLineStatus[person.id] ? (
                    <Text style={styles.openingLineStatus}>
                      {openingLineStatus[person.id]}
                    </Text>
                  ) : (
                    <Text style={styles.openingLineStatus}>可现场直接使用</Text>
                  )}
                  <Pressable
                    accessibilityRole="button"
                    disabled={pendingOpeningLineId === person.id}
                    onPress={() => {
                      void refreshOpeningLine(person);
                    }}
                    style={({ pressed }) => [
                      styles.inlineButton,
                      pressed ? styles.actionButtonPressed : null,
                      pendingOpeningLineId === person.id
                        ? styles.inlineButtonDisabled
                        : null
                    ]}
                  >
                    <Ionicons
                      color={colors.accent}
                      name="refresh-outline"
                      size={14}
                    />
                    <Text style={styles.inlineButtonText}>
                      {pendingOpeningLineId === person.id ? "生成中" : "换一句"}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
            <Text style={styles.nextHint}>{person.suggestedAction}</Text>
          </View>
        ))}
      </View>
      {openingLineError ? (
        <Text style={styles.errorText}>{openingLineError}</Text>
      ) : null}
    </DataCard>
  );
}

function RecommendedPersonAvatar({
  initial,
  rankLabel
}: {
  initial: string;
  rankLabel: string;
}) {
  return (
    <View style={styles.recommendationAvatarWrap}>
      <View style={styles.recommendationAvatar}>
        <Text style={styles.recommendationAvatarText}>{initial || "?"}</Text>
      </View>
      <Text numberOfLines={1} style={styles.recommendationAvatarRank}>
        {rankLabel}
      </Text>
    </View>
  );
}

function EventPostEventReviewModule({
  eventId,
  onConfirmed,
  state
}: {
  eventId: string;
  onConfirmed: () => void;
  state: ApiResourceState<unknown>;
}) {
  const client = useOrbitApiClient();
  const router = useRouter();
  const [confirmPending, setConfirmPending] = useState(false);
  const [confirmResult, setConfirmResult] =
    useState<EventPostEventConfirmView | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  if (state.kind !== "success" && state.kind !== "empty") {
    return null;
  }

  const view = eventPostEventReviewToView(state.data);

  if (view.contacts.length === 0) {
    return null;
  }

  async function confirmPostEventContacts() {
    const request = eventPostEventConfirmRequestFromReview(view);

    if (!request) {
      setConfirmError("这场活动暂时没有可确认的候选。");
      return;
    }

    setConfirmPending(true);
    setConfirmError(null);
    setConfirmResult(null);

    const result = await client.post<unknown>(
      eventPostEventConfirmPath(eventId),
      {
        body: request
      }
    );

    if (result.success) {
      setConfirmResult(eventPostEventConfirmToView(result.data));
      onConfirmed();
    } else {
      setConfirmError(result.error.message);
    }

    setConfirmPending(false);
  }

  return (
    <DataCard
      detail={`${view.stateLabel} · ${view.contactCountLabel}`}
      title="会后复核"
    >
      <View style={styles.stack}>
        {view.contacts.map((contact) => (
          <View key={contact.id} style={styles.postEventRow}>
            <View style={styles.recommendationHeader}>
              <Text style={styles.recommendationName}>{contact.name}</Text>
              <Text style={styles.scoreLabel}>{contact.urgencyLabel}</Text>
            </View>
            {contact.organizationRole ? (
              <Text style={styles.recommendationMeta}>
                {contact.organizationRole}
              </Text>
            ) : null}
            <Text style={styles.checklistTitle}>{contact.headline}</Text>
            <Text style={styles.checklistDetail}>{contact.whyNow}</Text>
            <View style={styles.postEventTagRow}>
              {contact.tags.map((tag) => (
                <Text key={`${contact.id}:${tag}`} style={styles.postEventTag}>
                  {tag}
                </Text>
              ))}
            </View>
            <View style={styles.postEventDraftBox}>
              <Ionicons
                color={colors.accent}
                name="mail-outline"
                size={15}
              />
              <Text style={styles.openingLineText}>{contact.followUpDraft}</Text>
            </View>
          </View>
        ))}
      </View>
      <View style={styles.postEventFooter}>
        <Pressable
          accessibilityRole="button"
          disabled={confirmPending}
          onPress={() => {
            void confirmPostEventContacts();
          }}
          style={({ pressed }) => [
            styles.inlineButton,
            pressed ? styles.actionButtonPressed : null,
            confirmPending ? styles.inlineButtonDisabled : null
          ]}
        >
          <Ionicons color={colors.accent} name="checkmark-done-outline" size={14} />
          <Text style={styles.inlineButtonText}>
            {confirmPending ? "确认中" : "确认这些候选"}
          </Text>
        </Pressable>
        <Text style={styles.openingLineStatus}>
          {confirmResult?.confirmedCountLabel ?? "确认后不会发送跟进"}
        </Text>
      </View>
      {confirmResult ? (
        <View style={styles.confirmResultBox}>
          <Text style={styles.feedbackText}>{confirmResult.feedback}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              router.push(confirmResult.reviewQueueHref as Href);
            }}
            style={({ pressed }) => [
              styles.inlineButton,
              pressed ? styles.actionButtonPressed : null
            ]}
          >
            <Ionicons color={colors.accent} name="people-outline" size={14} />
            <Text style={styles.inlineButtonText}>
              {confirmResult.reviewQueueLabel}
            </Text>
          </Pressable>
        </View>
      ) : null}
      {confirmError ? <Text style={styles.errorText}>{confirmError}</Text> : null}
      <Text style={styles.nextHint}>{confirmResult?.nextAction ?? view.nextAction}</Text>
    </DataCard>
  );
}

const styles = StyleSheet.create({
  actionButton: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: 1,
    flex: 1,
    gap: 6,
    minHeight: 112,
    padding: spacing.md
  },
  actionButtonPressed: {
    opacity: 0.86,
    transform: [{ translateY: 0.5 }]
  },
  actionDetail: {
    color: colors.text3,
    fontSize: typography.caption,
    lineHeight: 16,
    textAlign: "center"
  },
  actionGrid: {
    flexDirection: "row",
    gap: spacing.sm
  },
  actionIcon: {
    alignItems: "center",
    backgroundColor: colors.accentSofter,
    borderRadius: radius.pill,
    height: 38,
    justifyContent: "center",
    width: 38
  },
  actionTitle: {
    color: colors.ink,
    fontSize: typography.small,
    fontWeight: "700",
    lineHeight: 18,
    textAlign: "center"
  },
  aboutSectionBody: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0
  },
  aboutSectionIcon: {
    alignItems: "center",
    backgroundColor: colors.accentSofter,
    borderRadius: radius.pill,
    height: 34,
    justifyContent: "center",
    width: 34
  },
  aboutSectionRow: {
    alignItems: "flex-start",
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md
  },
  agendaBody: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
    paddingBottom: spacing.lg
  },
  agendaDot: {
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    borderWidth: 2,
    height: 11,
    width: 11
  },
  agendaDotActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent
  },
  agendaHeader: {
    alignItems: "baseline",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  agendaLine: {
    backgroundColor: colors.border2,
    flex: 1,
    marginTop: spacing.xs,
    width: 2
  },
  agendaRail: {
    alignItems: "center",
    alignSelf: "stretch",
    width: 14
  },
  agendaRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.md
  },
  agendaStack: {
    gap: 0
  },
  agendaTime: {
    color: colors.accent,
    fontSize: typography.caption,
    fontWeight: "800",
    lineHeight: 17
  },
  attendeePreviewAvatar: {
    alignItems: "center",
    backgroundColor: colors.ink,
    borderRadius: radius.pill,
    height: 30,
    justifyContent: "center",
    width: 30
  },
  attendeePreviewAvatarText: {
    color: colors.onAccent,
    fontSize: typography.caption,
    fontWeight: "800",
    lineHeight: 15
  },
  attendeePreviewBody: {
    flex: 1,
    minWidth: 0
  },
  attendeePreviewName: {
    color: colors.ink,
    fontSize: typography.caption,
    fontWeight: "800",
    lineHeight: 16
  },
  attendeePreviewPill: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    maxWidth: "100%",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs
  },
  attendeePreviewRole: {
    color: colors.text3,
    fontSize: typography.caption,
    lineHeight: 15
  },
  attendeePreviewRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  bodyText: {
    color: colors.text,
    fontSize: typography.small,
    lineHeight: 20
  },
  checklistBody: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0
  },
  checklistDetail: {
    color: colors.text2,
    fontSize: typography.small,
    lineHeight: 19
  },
  checklistOwner: {
    color: colors.text4,
    fontSize: typography.caption,
    fontWeight: "600",
    lineHeight: 16
  },
  checklistRow: {
    alignItems: "flex-start",
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md
  },
  checklistStatus: {
    backgroundColor: colors.liveSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 5
  },
  checklistStatusText: {
    color: colors.live,
    fontSize: typography.caption,
    fontWeight: "700",
    lineHeight: 14
  },
  checklistTitle: {
    color: colors.ink,
    fontSize: typography.small,
    fontWeight: "700",
    lineHeight: 18
  },
  eventHero: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: "hidden"
  },
  eventHeroBody: {
    padding: spacing.lg
  },
  eventHeroDetail: {
    color: "rgba(255,255,255,0.86)",
    fontSize: typography.small,
    fontWeight: "600",
    lineHeight: 19
  },
  eventHeroFrame: {
    aspectRatio: 1.22,
    backgroundColor: colors.surface3,
    justifyContent: "space-between",
    overflow: "hidden",
    padding: spacing.lg
  },
  eventHeroImage: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg
  },
  eventHeroScrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.28)"
  },
  eventHeroText: {
    gap: spacing.sm
  },
  eventHeroTitle: {
    color: colors.onAccent,
    fontSize: 26,
    fontWeight: "800",
    lineHeight: 31
  },
  eventHeroTopRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "flex-start"
  },
  eventStatusBadge: {
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: radius.pill,
    color: colors.ink,
    fontSize: typography.caption,
    fontWeight: "700",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  errorText: {
    color: colors.rose,
    fontSize: typography.caption,
    lineHeight: 16
  },
  feedbackText: {
    color: colors.live,
    fontSize: typography.caption,
    fontWeight: "700",
    lineHeight: 16
  },
  confirmResultBox: {
    alignItems: "flex-start",
    gap: spacing.sm
  },
  goalEditor: {
    gap: spacing.xs
  },
  goalInput: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.text,
    fontSize: typography.small,
    lineHeight: 20,
    minHeight: 84,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  goalInputLabel: {
    color: colors.text3,
    fontSize: typography.caption,
    fontWeight: "700",
    lineHeight: 16
  },
  goalSuggestionActionText: {
    color: colors.accent,
    fontSize: typography.caption,
    fontWeight: "800",
    lineHeight: 16
  },
  goalSuggestionActionTextSelected: {
    color: colors.onAccent
  },
  goalSuggestionCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md
  },
  goalSuggestionCardSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent
  },
  goalSuggestionDetail: {
    color: colors.text3,
    fontSize: typography.caption,
    lineHeight: 17
  },
  goalSuggestionDetailSelected: {
    color: "rgba(255,255,255,0.78)"
  },
  goalSuggestionGoal: {
    color: colors.text,
    fontSize: typography.small,
    lineHeight: 19
  },
  goalSuggestionGoalSelected: {
    color: colors.onAccent
  },
  goalSuggestionHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between"
  },
  goalSuggestionStack: {
    gap: spacing.sm
  },
  goalSuggestionTitle: {
    color: colors.ink,
    flex: 1,
    fontSize: typography.small,
    fontWeight: "800",
    lineHeight: 18
  },
  goalSuggestionTitleSelected: {
    color: colors.onAccent
  },
  inlineButton: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  inlineButtonDisabled: {
    opacity: 0.62
  },
  inlineButtonText: {
    color: colors.accent,
    fontSize: typography.caption,
    fontWeight: "700",
    lineHeight: 14
  },
  infoGrid: {
    gap: spacing.sm
  },
  infoTile: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md
  },
  infoTileBody: {
    flex: 1,
    gap: spacing.xxs,
    minWidth: 0
  },
  infoTileDetail: {
    color: colors.text3,
    fontSize: typography.caption,
    lineHeight: 16
  },
  infoTileTitle: {
    color: colors.ink,
    fontSize: typography.small,
    fontWeight: "700",
    lineHeight: 18
  },
  nextHint: {
    color: colors.text3,
    fontSize: typography.small,
    lineHeight: 19
  },
  openingLineBox: {
    alignItems: "flex-start",
    backgroundColor: colors.accentSofter,
    borderRadius: radius.md,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md
  },
  openingLineBody: {
    flex: 1,
    gap: spacing.sm,
    minWidth: 0
  },
  openingLineFooter: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between"
  },
  openingLineStatus: {
    color: colors.text3,
    flex: 1,
    fontSize: typography.caption,
    fontWeight: "600",
    lineHeight: 16
  },
  openingLineText: {
    color: colors.text,
    fontSize: typography.small,
    lineHeight: 19
  },
  organizerAvatar: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    height: 44,
    justifyContent: "center",
    width: 44
  },
  organizerAvatarText: {
    color: colors.onAccent,
    fontSize: typography.section,
    fontWeight: "800",
    lineHeight: 21
  },
  organizerBody: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0
  },
  organizerName: {
    color: colors.ink,
    fontSize: typography.body,
    fontWeight: "800",
    lineHeight: 20
  },
  organizerRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md
  },
  postEventDraftBox: {
    alignItems: "flex-start",
    backgroundColor: colors.accentSofter,
    borderRadius: radius.md,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md
  },
  postEventFooter: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  postEventRow: {
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md
  },
  postEventTag: {
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    color: colors.text3,
    fontSize: typography.caption,
    fontWeight: "700",
    lineHeight: 14,
    overflow: "hidden",
    paddingHorizontal: 9,
    paddingVertical: 5
  },
  postEventTagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs
  },
  rankLabel: {
    color: colors.accent,
    fontSize: typography.caption,
    fontWeight: "800",
    lineHeight: 16
  },
  readinessGoal: {
    alignItems: "flex-start",
    backgroundColor: colors.tint,
    borderRadius: radius.md,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md
  },
  readinessGoalBody: {
    flex: 1,
    gap: spacing.sm,
    minWidth: 0
  },
  primaryCta: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "center",
    minHeight: 46,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md
  },
  primaryCtaText: {
    color: colors.onAccent,
    fontSize: typography.body,
    fontWeight: "800",
    lineHeight: 18
  },
  registrationActionRow: {
    flexDirection: "row",
    gap: spacing.sm
  },
  registrationCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg
  },
  registrationEyebrow: {
    color: colors.text3,
    fontSize: typography.caption,
    lineHeight: 16
  },
  registrationFee: {
    color: colors.ink,
    fontSize: typography.title,
    fontWeight: "800",
    lineHeight: 25
  },
  registrationHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between"
  },
  registrationHint: {
    color: colors.text3,
    fontSize: typography.caption,
    lineHeight: 17
  },
  registrationTitleBlock: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0
  },
  recommendationHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  recommendationAvatar: {
    alignItems: "center",
    backgroundColor: colors.accentSofter,
    borderColor: colors.accentSoft,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    width: 42
  },
  recommendationAvatarRank: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: "800",
    lineHeight: 12,
    maxWidth: 48,
    textAlign: "center"
  },
  recommendationAvatarText: {
    color: colors.accent,
    fontSize: 17,
    fontWeight: "800",
    lineHeight: 21
  },
  recommendationAvatarWrap: {
    alignItems: "center",
    gap: 4,
    width: 48
  },
  recommendationMeta: {
    color: colors.text3,
    fontSize: typography.caption,
    lineHeight: 16
  },
  recommendationName: {
    color: colors.ink,
    fontSize: typography.body,
    fontWeight: "700",
    lineHeight: 20
  },
  recommendationRow: {
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md
  },
  recommendationPersonBody: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0
  },
  recommendationPersonHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.sm
  },
  scoreLabel: {
    color: colors.text3,
    fontSize: typography.caption,
    fontWeight: "700",
    lineHeight: 16
  },
  stack: {
    gap: 8
  }
});
