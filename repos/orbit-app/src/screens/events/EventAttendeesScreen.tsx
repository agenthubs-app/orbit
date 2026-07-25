import { Ionicons } from "@expo/vector-icons";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import {
  ORBIT_API_ENDPOINTS,
  eventAttendeesPath,
  eventEncounterEvidencePath,
  eventEncountersPath,
  eventMatchesPath,
  eventWantToConnectPath
} from "../../api/endpoints";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { AppScreen } from "../../components/AppScreen";
import { DataCard } from "../../components/DataCard";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { colors, radius, spacing, typography } from "../../design/tokens";
import { useApiResource } from "../../hooks/useApiResource";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import {
  buildEventAttendeeContactDraftImportRequest,
  buildEventAttendeeRosterImportRequest,
  buildEncounterNoteRequest,
  buildWantConnectRequest,
  eventAttendeeContactDraftImportToView,
  eventAttendeeRosterImportToView,
  eventEncounterEvidenceToView,
  eventEncounterNoteToView,
  eventAttendeeRosterToView,
  eventMatchesToView,
  type EventAttendeeCardView,
  type EventAttendeeDraftImportView,
  type EventAttendeeRosterImportView,
  type EventEncounterNoteView
} from "../../view-models/event-attendees";

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "event";
  }

  return value ?? "event";
}

function assetUrl(baseUrl: string, path: string): string {
  if (/^https?:\/\//iu.test(path)) {
    return path;
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl.replace(/\/+$/u, "")}${normalizedPath}`;
}

export function EventAttendeesScreen() {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const eventId = firstParam(id);
  const router = useRouter();
  const client = useOrbitApiClient();
  const { baseUrl } = useOrbitApiBaseUrl();
  const rosterState = useApiResource<unknown>(
    eventAttendeesPath(eventId),
    (data) => eventAttendeeRosterToView(data).attendees.length === 0
  );
  const matchesState = useApiResource<unknown>(
    eventMatchesPath(eventId),
    (data) => eventMatchesToView(data).matches.length === 0
  );
  const [pendingAttendeeId, setPendingAttendeeId] = useState<string | null>(null);
  const [pendingEncounterAttendeeId, setPendingEncounterAttendeeId] = useState<
    string | null
  >(null);
  const [pendingEvidenceEncounterId, setPendingEvidenceEncounterId] = useState<
    string | null
  >(null);
  const [encounterNotesByAttendee, setEncounterNotesByAttendee] = useState<
    Record<string, string>
  >({});
  const [savedEncounterNotesByAttendee, setSavedEncounterNotesByAttendee] =
    useState<Record<string, EventEncounterNoteView>>({});
  const [draftImportView, setDraftImportView] =
    useState<EventAttendeeDraftImportView | null>(null);
  const [rosterImportView, setRosterImportView] =
    useState<EventAttendeeRosterImportView | null>(null);
  const [importingRoster, setImportingRoster] = useState(false);
  const [importingDrafts, setImportingDrafts] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  function refresh() {
    setFeedback(null);
    setActionError(null);
    setDraftImportView(null);
    setRosterImportView(null);
    setSavedEncounterNotesByAttendee({});
    rosterState.refresh();
    matchesState.refresh();
  }

  function updateEncounterNote(attendeeId: string, noteText: string) {
    setEncounterNotesByAttendee((current) => ({
      ...current,
      [attendeeId]: noteText
    }));
  }

  async function recordWantConnect(attendee: EventAttendeeCardView) {
    setPendingAttendeeId(attendee.id);
    setFeedback(null);
    setActionError(null);

    const result = await client.post<unknown>(eventWantToConnectPath(eventId), {
      body: buildWantConnectRequest(attendee)
    });

    if (result.success) {
      setFeedback(`已记录想认识 ${attendee.name}。现场先确认对方也愿意继续聊。`);
      matchesState.refresh();
    } else {
      setActionError(result.error.message);
    }

    setPendingAttendeeId(null);
  }

  async function saveEncounterNote(attendee: EventAttendeeCardView) {
    const request = buildEncounterNoteRequest(
      attendee,
      encounterNotesByAttendee[attendee.id] ?? ""
    );

    if (!request) {
      setActionError("先写一句现场记录。");
      return;
    }

    setPendingEncounterAttendeeId(attendee.id);
    setFeedback(null);
    setActionError(null);

    const result = await client.post<unknown>(eventEncountersPath(eventId), {
      body: request
    });

    if (result.success) {
      const view = eventEncounterNoteToView(result.data);
      setFeedback(`${view.feedback}${view.evidenceLabel ? ` ${view.evidenceLabel}。` : ""}`);
      if (view.encounterId) {
        setSavedEncounterNotesByAttendee((current) => ({
          ...current,
          [attendee.id]: view
        }));
      }
      setEncounterNotesByAttendee((current) => ({
        ...current,
        [attendee.id]: ""
      }));
    } else {
      setActionError(result.error.message);
    }

    setPendingEncounterAttendeeId(null);
  }

  async function createEncounterEvidence(
    attendee: EventAttendeeCardView,
    encounter: EventEncounterNoteView
  ) {
    if (!encounter.encounterId) {
      setActionError("先保存现场记录。");
      return;
    }

    setPendingEvidenceEncounterId(encounter.encounterId);
    setFeedback(null);
    setActionError(null);

    const result = await client.post<unknown>(
      eventEncounterEvidencePath(eventId, encounter.encounterId)
    );

    if (result.success) {
      const view = eventEncounterEvidenceToView(result.data);
      setFeedback(`${view.feedback} ${view.nextAction}`);
      setSavedEncounterNotesByAttendee((current) => {
        const next = { ...current };
        delete next[attendee.id];
        return next;
      });
    } else {
      setActionError(result.error.message);
    }

    setPendingEvidenceEncounterId(null);
  }

  async function importEventAttendeesAsDrafts() {
    const request = buildEventAttendeeContactDraftImportRequest(eventId);

    if (!request.success) {
      setActionError(request.error);
      return;
    }

    setImportingDrafts(true);
    setFeedback(null);
    setActionError(null);

    const result = await client.post<unknown>(
      ORBIT_API_ENDPOINTS.contactDraftEventAttendeesImport,
      {
        body: request.request.body
      }
    );

    if (result.success) {
      const view = eventAttendeeContactDraftImportToView(result.data);
      setDraftImportView(view);
      setFeedback(`${view.summary}，${view.nextAction}`);
    } else {
      setActionError(result.error.message);
    }

    setImportingDrafts(false);
  }

  async function importEventAttendeesIntoRoster() {
    const request = buildEventAttendeeRosterImportRequest(eventId);

    if (!request.success) {
      setActionError(request.error);
      return;
    }

    setImportingRoster(true);
    setFeedback(null);
    setActionError(null);

    const result = await client.post<unknown>(request.request.endpoint, {
      body: request.request.body
    });

    if (result.success) {
      const view = eventAttendeeRosterImportToView(result.data);
      setRosterImportView(view);
      setFeedback(`${view.summary} ${view.nextAction}`);
      rosterState.refresh();
    } else {
      setActionError(result.error.message);
    }

    setImportingRoster(false);
  }

  const roster =
    rosterState.kind === "success" || rosterState.kind === "empty"
      ? eventAttendeeRosterToView(rosterState.data)
      : null;
  const matches =
    matchesState.kind === "success" || matchesState.kind === "empty"
      ? eventMatchesToView(matchesState.data)
      : null;

  return (
    <AppScreen
      eyebrow="活动现场"
      refreshControl={
        <RefreshControl
          onRefresh={refresh}
          refreshing={rosterState.refreshing || matchesState.refreshing}
          tintColor={colors.accent}
        />
      }
      title="参会者"
    >
      {rosterState.kind === "loading" ? <LoadingState /> : null}
      {rosterState.kind === "offline" ? (
        <ErrorState message={rosterState.error.message} title="服务器连不上" />
      ) : null}
      {rosterState.kind === "failure" ? (
        <ErrorState message={rosterState.error.message} />
      ) : null}
      {roster ? (
        <>
          <DataCard detail={roster.eventDetail} title={roster.eventTitle}>
            <Text style={styles.bodyText}>{roster.nextAction}</Text>
            <View style={styles.actionRow}>
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  router.push({
                    params: { id: eventId },
                    pathname: "/events/[id]"
                  })
                }
                style={({ pressed }) => [
                  styles.secondaryButton,
                  pressed ? styles.pressed : null
                ]}
              >
                <Ionicons color={colors.accent} name="arrow-back-outline" size={17} />
                <Text style={styles.secondaryButtonText}>返回活动</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={importingRoster}
                onPress={importEventAttendeesIntoRoster}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  importingRoster ? styles.disabled : null,
                  pressed ? styles.pressed : null
                ]}
              >
                <Ionicons color={colors.accent} name="download-outline" size={17} />
                <Text style={styles.secondaryButtonText}>
                  {importingRoster ? "导入中" : "导入名册"}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={importingDrafts}
                onPress={importEventAttendeesAsDrafts}
                style={({ pressed }) => [
                  styles.primaryButton,
                  importingDrafts ? styles.disabled : null,
                  pressed ? styles.pressed : null
                ]}
              >
                <Ionicons color={colors.onAccent} name="person-add-outline" size={17} />
                <Text style={styles.primaryButtonText}>
                  {importingDrafts ? "导入中" : "导入为候选"}
                </Text>
              </Pressable>
            </View>
          </DataCard>
          {matches && matches.matches.length > 0 ? (
            <DataCard detail={matches.nextAction} title="现场匹配">
              <View style={styles.stack}>
                {matches.matches.map((match) => (
                  <View key={match.id} style={styles.matchBlock}>
                    <Text style={styles.matchTitle}>{match.title}</Text>
                    <Text style={styles.bodyText}>{match.names.join(" · ")}</Text>
                    <Text style={styles.bodyText}>{match.message}</Text>
                  </View>
                ))}
              </View>
            </DataCard>
          ) : null}
          {matchesState.kind === "failure" ? (
            <ErrorState message={matchesState.error.message} title="现场匹配不可用" />
          ) : null}
          {feedback ? <Text style={styles.feedbackText}>{feedback}</Text> : null}
          {actionError ? <Text style={styles.errorText}>{actionError}</Text> : null}
          {rosterImportView ? (
            <EventAttendeeRosterImportResultCard view={rosterImportView} />
          ) : null}
          {draftImportView ? (
            <EventAttendeeDraftImportResultCard
              onOpenDraftQueue={() => router.push("/contacts/new" as Href)}
              view={draftImportView}
            />
          ) : null}
          {roster.attendees.length === 0 ? (
            <EmptyState message="这场活动暂时没有可见名单。" title="没有参会者" />
          ) : (
            roster.attendees.map((attendee) => (
              <AttendeeCard
                attendee={attendee}
                baseUrl={baseUrl}
                encounterNote={encounterNotesByAttendee[attendee.id] ?? ""}
                encounterPending={pendingEncounterAttendeeId === attendee.id}
                evidencePending={
                  pendingEvidenceEncounterId ===
                  savedEncounterNotesByAttendee[attendee.id]?.encounterId
                }
                key={attendee.id}
                onEncounterNoteChange={(noteText) =>
                  updateEncounterNote(attendee.id, noteText)
                }
                onCreateEvidence={createEncounterEvidence}
                onSaveEncounter={saveEncounterNote}
                onWantConnect={recordWantConnect}
                pending={pendingAttendeeId === attendee.id}
                savedEncounter={savedEncounterNotesByAttendee[attendee.id] ?? null}
              />
            ))
          )}
        </>
      ) : null}
    </AppScreen>
  );
}

function EventAttendeeRosterImportResultCard({
  view
}: {
  view: EventAttendeeRosterImportView;
}) {
  return (
    <DataCard detail={view.summary} title={view.title}>
      <View style={styles.pillRow}>
        {view.metrics.map((metric) => (
          <Text key={metric} style={styles.statusPill}>
            {metric}
          </Text>
        ))}
      </View>
      <Text style={styles.bodyText}>{view.nextAction}</Text>
      <Text style={styles.safetyText}>{view.safetyText}</Text>
    </DataCard>
  );
}

function EventAttendeeDraftImportResultCard({
  onOpenDraftQueue,
  view
}: {
  onOpenDraftQueue: () => void;
  view: EventAttendeeDraftImportView;
}) {
  return (
    <DataCard detail={view.summary} title={view.title}>
      <View style={styles.stack}>
        {view.drafts.map((draft) => (
          <View key={draft.id} style={styles.matchBlock}>
            <View style={styles.pillRow}>
              <Text style={styles.statusPill}>{draft.statusLabel}</Text>
              <Text style={styles.knownPill}>{draft.writeState}</Text>
            </View>
            <Text style={styles.matchTitle}>{draft.name}</Text>
            {draft.detail ? <Text style={styles.nextText}>{draft.detail}</Text> : null}
            <Text style={styles.bodyText}>{draft.relationship}</Text>
            <Text style={styles.nextText}>{draft.nextAction}</Text>
            {draft.evidence.length > 0 ? (
              <View style={styles.stack}>
                {draft.evidence.map((evidence) => (
                  <Text key={`${draft.id}:${evidence}`} style={styles.reasonText}>
                    {evidence}
                  </Text>
                ))}
              </View>
            ) : null}
          </View>
        ))}
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={onOpenDraftQueue}
        style={({ pressed }) => [
          styles.secondaryButton,
          pressed ? styles.pressed : null
        ]}
      >
        <Ionicons color={colors.accent} name="checkmark-circle-outline" size={17} />
        <Text style={styles.secondaryButtonText}>{"去复核候选"}</Text>
      </Pressable>
    </DataCard>
  );
}

function AttendeeCard({
  attendee,
  baseUrl,
  encounterNote,
  encounterPending,
  evidencePending,
  onEncounterNoteChange,
  onCreateEvidence,
  onSaveEncounter,
  onWantConnect,
  pending,
  savedEncounter
}: {
  attendee: EventAttendeeCardView;
  baseUrl: string;
  encounterNote: string;
  encounterPending: boolean;
  evidencePending: boolean;
  onEncounterNoteChange: (noteText: string) => void;
  onCreateEvidence: (
    attendee: EventAttendeeCardView,
    encounter: EventEncounterNoteView
  ) => void;
  onSaveEncounter: (attendee: EventAttendeeCardView) => void;
  onWantConnect: (attendee: EventAttendeeCardView) => void;
  pending: boolean;
  savedEncounter: EventEncounterNoteView | null;
}) {
  return (
    <DataCard detail={attendee.organizationRole} title={attendee.name}>
      <View style={styles.attendeeIdentityRow}>
        <AttendeeAvatar
          baseUrl={baseUrl}
          imageUrl={attendee.imageUrl}
          initial={attendee.name.slice(0, 1)}
        />
        <View style={styles.attendeeIdentityBody}>
          <View style={styles.pillRow}>
            <Text style={styles.statusPill}>{attendee.statusLabel}</Text>
            <Text style={styles.knownPill}>{attendee.knownLabel}</Text>
            {attendee.tags.map((tag) => (
              <Text key={tag} style={styles.tagPill}>
                {tag}
              </Text>
            ))}
          </View>
        </View>
      </View>
      <Text style={styles.bodyText}>{attendee.relationshipContext}</Text>
      {attendee.reasons.length > 0 ? (
        <View style={styles.stack}>
          {attendee.reasons.map((reason) => (
            <Text key={reason} style={styles.reasonText}>
              {reason}
            </Text>
          ))}
        </View>
      ) : null}
      <Text style={styles.nextText}>{attendee.suggestedNextAction}</Text>
      <View style={styles.encounterBox}>
        <Text style={styles.fieldLabel}>现场记录</Text>
        <TextInput
          multiline
          onChangeText={onEncounterNoteChange}
          placeholder="聊到了什么、对方想找什么、下一步怎么跟。"
          placeholderTextColor={colors.text4}
          style={styles.input}
          textAlignVertical="top"
          value={encounterNote}
        />
        <View style={styles.actionRow}>
          <Pressable
            accessibilityRole="button"
            disabled={encounterPending}
            onPress={() => onSaveEncounter(attendee)}
            style={({ pressed }) => [
              styles.secondaryButton,
              encounterPending ? styles.disabled : null,
              pressed ? styles.pressed : null
            ]}
          >
            <Ionicons color={colors.accent} name="document-text-outline" size={17} />
            <Text style={styles.secondaryButtonText}>
              {encounterPending ? "保存中" : "保存现场记录"}
            </Text>
          </Pressable>
          <Text style={styles.safetyText}>只保存记录，不发送消息</Text>
        </View>
      </View>
      {savedEncounter?.encounterId ? (
        <View style={styles.evidenceBox}>
          <Text style={styles.fieldLabel}>{savedEncounter.evidenceLabel}</Text>
          <Text style={styles.bodyText}>{savedEncounter.noteText}</Text>
          <Text style={styles.nextText}>{savedEncounter.nextAction}</Text>
          <Pressable
            accessibilityRole="button"
            disabled={evidencePending}
            onPress={() => onCreateEvidence(attendee, savedEncounter)}
            style={({ pressed }) => [
              styles.secondaryButton,
              evidencePending ? styles.disabled : null,
              pressed ? styles.pressed : null
            ]}
          >
            <Ionicons color={colors.accent} name="shield-checkmark-outline" size={17} />
            <Text style={styles.secondaryButtonText}>
              {evidencePending ? "生成中" : "生成关系证据"}
            </Text>
          </Pressable>
        </View>
      ) : null}
      {attendee.canWantConnect ? (
        <Pressable
          accessibilityRole="button"
          disabled={pending}
          onPress={() => onWantConnect(attendee)}
          style={({ pressed }) => [
            styles.primaryButton,
            pending ? styles.disabled : null,
            pressed ? styles.pressed : null
          ]}
        >
          <Ionicons color={colors.onAccent} name="person-add-outline" size={17} />
          <Text style={styles.primaryButtonText}>
            {pending ? "记录中" : "想认识"}
          </Text>
        </Pressable>
      ) : null}
    </DataCard>
  );
}

function AttendeeAvatar({
  baseUrl,
  imageUrl,
  initial
}: {
  baseUrl: string;
  imageUrl: string | undefined;
  initial: string;
}) {
  return (
    <View style={styles.attendeeAvatar}>
      {imageUrl ? (
        <Image
          resizeMode="cover"
          source={{ uri: assetUrl(baseUrl, imageUrl) }}
          style={styles.attendeeAvatarImage}
        />
      ) : (
        <Text style={styles.attendeeAvatarText}>{initial || "?"}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  actionRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  attendeeAvatar: {
    alignItems: "center",
    backgroundColor: colors.accentSofter,
    borderColor: colors.accentSoft,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    width: 44
  },
  attendeeAvatarImage: {
    borderRadius: radius.pill,
    height: "100%",
    width: "100%"
  },
  attendeeAvatarText: {
    color: colors.accent,
    fontSize: 18,
    fontWeight: "800",
    lineHeight: 22
  },
  attendeeIdentityBody: {
    flex: 1,
    minWidth: 0
  },
  attendeeIdentityRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm
  },
  bodyText: {
    color: colors.text,
    fontSize: typography.small,
    lineHeight: 20
  },
  disabled: {
    opacity: 0.54
  },
  errorText: {
    color: colors.rose,
    fontSize: typography.small,
    lineHeight: 20
  },
  encounterBox: {
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md
  },
  evidenceBox: {
    backgroundColor: colors.liveSoft,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md
  },
  feedbackText: {
    color: colors.live,
    fontSize: typography.small,
    fontWeight: "700",
    lineHeight: 20
  },
  fieldLabel: {
    color: colors.text3,
    fontSize: typography.caption,
    fontWeight: "700",
    lineHeight: 16
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.text,
    fontSize: typography.small,
    lineHeight: 20,
    minHeight: 82,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  knownPill: {
    backgroundColor: colors.accentSofter,
    borderRadius: radius.pill,
    color: colors.accent,
    fontSize: typography.caption,
    fontWeight: "700",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  matchBlock: {
    backgroundColor: colors.liveSoft,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md
  },
  matchTitle: {
    color: colors.live,
    fontSize: typography.small,
    fontWeight: "700"
  },
  nextText: {
    color: colors.text3,
    fontSize: typography.small,
    lineHeight: 20
  },
  pillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs
  },
  pressed: {
    opacity: 0.78,
    transform: [{ translateY: 0.5 }]
  },
  primaryButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.accent,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.xs,
    minHeight: 40,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  primaryButtonText: {
    color: colors.onAccent,
    fontSize: typography.small,
    fontWeight: "700"
  },
  reasonText: {
    backgroundColor: colors.surface2,
    borderColor: colors.border2,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.text,
    fontSize: typography.small,
    lineHeight: 20,
    padding: spacing.md
  },
  secondaryButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.accentSofter,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.xs,
    minHeight: 40,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  secondaryButtonText: {
    color: colors.accent,
    fontSize: typography.small,
    fontWeight: "700"
  },
  safetyText: {
    color: colors.text4,
    flexShrink: 1,
    fontSize: typography.caption,
    lineHeight: 16
  },
  stack: {
    gap: spacing.sm
  },
  statusPill: {
    backgroundColor: colors.liveSoft,
    borderRadius: radius.pill,
    color: colors.live,
    fontSize: typography.caption,
    fontWeight: "700",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  tagPill: {
    backgroundColor: colors.surface2,
    borderColor: colors.border2,
    borderRadius: radius.pill,
    borderWidth: 1,
    color: colors.text2,
    fontSize: typography.caption,
    fontWeight: "700",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 5
  }
});
