import { Ionicons } from "@expo/vector-icons";
import { type Href, useRouter } from "expo-router";
import { useState } from "react";
import {
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { connectionDetailPath, ORBIT_API_ENDPOINTS } from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { DataCard } from "../../components/DataCard";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { colors, radius, spacing, typography } from "../../design/tokens";
import { useApiResource } from "../../hooks/useApiResource";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import {
  buildConnectionEvidenceAddRequest,
  buildConnectionProfilePreviewRequest,
  connectionEvidenceDetailToView,
  connectionGraphToView,
  connectionProfileToView,
  type ConnectionEvidenceDetailView,
  type ConnectionEvidenceSourceLinkView,
  type ConnectionEvidenceTimelineView,
  type ConnectionGraphMetricView,
  type ConnectionProfileMutualValueView,
  type ConnectionProfilePreviewView,
  type ConnectionPriorityView,
  type ConnectionStageView
} from "../../view-models/connections-graph";

interface ConnectionEvidenceAddDraft {
  excerpt: string;
  title: string;
}

export function ContactsGraphScreen() {
  const state = useApiResource<unknown>(
    ORBIT_API_ENDPOINTS.connections,
    (data) => connectionGraphToView(data).priorityConnections.length === 0
  );

  return (
    <AppScreen
      eyebrow="名片夹"
      refreshControl={
        <RefreshControl
          onRefresh={state.refresh}
          refreshing={state.refreshing}
          tintColor={colors.accent}
        />
      }
      title="人脉图谱"
    >
      {state.kind === "loading" ? <LoadingState /> : null}
      {state.kind === "offline" ? (
        <ErrorState message={state.error.message} title="服务器连不上" />
      ) : null}
      {state.kind === "failure" ? (
        <ErrorState message={state.error.message} />
      ) : null}
      {state.kind === "empty" ? (
        <EmptyState
          message="先补联系人来源，关系连接会显示在这里。"
          title="暂无关系连接"
        />
      ) : null}
      {state.kind === "success" ? <GraphContent data={state.data} /> : null}
    </AppScreen>
  );
}

function GraphContent({ data }: { data: unknown }) {
  const router = useRouter();
  const client = useOrbitApiClient();
  const view = connectionGraphToView(data);
  const [selectedEvidence, setSelectedEvidence] =
    useState<ConnectionEvidenceDetailView | null>(null);
  const [evidencePendingId, setEvidencePendingId] = useState<string | null>(null);
  const [evidenceAddPending, setEvidenceAddPending] = useState(false);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const [evidenceFeedback, setEvidenceFeedback] = useState<string | null>(null);
  const [selectedProfile, setSelectedProfile] =
    useState<ConnectionProfilePreviewView | null>(null);
  const [profilePendingId, setProfilePendingId] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  async function loadConnectionEvidence(connection: ConnectionPriorityView) {
    setEvidencePendingId(connection.id);
    setEvidenceError(null);
    setEvidenceFeedback(null);

    try {
      const result = await client.get<unknown>(connectionDetailPath(connection.id));

      if (result.success) {
        setSelectedEvidence(connectionEvidenceDetailToView(result.data));
      } else {
        setEvidenceError("这条关系的证据链暂时取不到，请刷新后再试一次。");
      }
    } catch {
      setEvidenceError("这条关系的证据链暂时取不到，请刷新后再试一次。");
    } finally {
      setEvidencePendingId(null);
    }
  }

  async function addConnectionEvidence(
    draft: ConnectionEvidenceAddDraft
  ): Promise<boolean> {
    const request = buildConnectionEvidenceAddRequest({
      connectionId: selectedEvidence?.connectionId ?? "",
      excerpt: draft.excerpt,
      title: draft.title
    });

    if (!request.success) {
      setEvidenceError(request.error);
      setEvidenceFeedback(null);
      return false;
    }

    setEvidenceAddPending(true);
    setEvidenceError(null);
    setEvidenceFeedback(null);

    try {
      const result = await client.post<unknown>(request.request.endpoint, {
        body: request.request.body
      });

      if (result.success) {
        setSelectedEvidence(connectionEvidenceDetailToView(result.data));
        setEvidenceFeedback("证据已加入当前关系预览。");
        return true;
      }

      setEvidenceError("这条证据暂时补充不了，请刷新后再试一次。");
      return false;
    } catch {
      setEvidenceError("这条证据暂时补充不了，请刷新后再试一次。");
      return false;
    } finally {
      setEvidenceAddPending(false);
    }
  }

  async function loadConnectionProfile(connection: ConnectionPriorityView) {
    const request = buildConnectionProfilePreviewRequest(connection);

    if (!request.success) {
      setProfileError(request.error);
      return;
    }

    setProfilePendingId(connection.id);
    setProfileError(null);

    try {
      const result = await client.patch<unknown>(request.request.endpoint, {
        body: request.request.body
      });

      if (result.success) {
        setSelectedProfile(connectionProfileToView(result.data));
      } else {
        setProfileError("这条关系的画像暂时生成不了，请刷新后再试一次。");
      }
    } catch {
      setProfileError("这条关系的画像暂时生成不了，请刷新后再试一次。");
    } finally {
      setProfilePendingId(null);
    }
  }

  return (
    <>
      <DataCard detail={view.summary} title="关系总览">
        <MetricGrid metrics={view.metrics} />
        <View style={styles.callout}>
          <Ionicons color={colors.accent} name="git-network-outline" size={18} />
          <Text style={styles.calloutText}>{view.nextAction}</Text>
        </View>
      </DataCard>
      {view.stages.length > 0 ? <StageCard stages={view.stages} /> : null}
      {view.priorityConnections.length > 0 ? (
        <DataCard detail="按待跟进和关系强度排序" title="优先关系">
          {evidenceError ? <Text style={styles.errorText}>{evidenceError}</Text> : null}
          {profileError ? <Text style={styles.errorText}>{profileError}</Text> : null}
          <View style={styles.listStack}>
            {view.priorityConnections.map((connection) => (
              <ConnectionRow
                connection={connection}
                key={connection.id}
                onOpenContact={() => {
                  if (connection.contactId) {
                    router.push(
                      `/contacts/${encodeURIComponent(connection.contactId)}` as Href
                    );
                  }
                }}
                onPreviewProfile={() => loadConnectionProfile(connection)}
                onReviewEvidence={() => loadConnectionEvidence(connection)}
                profiling={profilePendingId === connection.id}
                reviewing={evidencePendingId === connection.id}
              />
            ))}
          </View>
        </DataCard>
      ) : null}
      {selectedEvidence ? (
        <ConnectionEvidenceCard
          addFeedback={evidenceFeedback}
          addPending={evidenceAddPending}
          onAddEvidence={addConnectionEvidence}
          view={selectedEvidence}
        />
      ) : null}
      {selectedProfile ? <ConnectionProfileCard view={selectedProfile} /> : null}
    </>
  );
}

function MetricGrid({ metrics }: { metrics: ConnectionGraphMetricView[] }) {
  return (
    <View style={styles.metricGrid}>
      {metrics.map((metric) => (
        <View key={metric.label} style={styles.metricCell}>
          <Text style={styles.metricValue}>{metric.value}</Text>
          <Text style={styles.metricLabel}>{metric.label}</Text>
        </View>
      ))}
    </View>
  );
}

function StageCard({ stages }: { stages: ConnectionStageView[] }) {
  const total = stages.reduce((sum, stage) => sum + stage.count, 0);

  return (
    <DataCard detail={`${total} 段连接`} title="关系阶段">
      <View style={styles.listStack}>
        {stages.map((stage) => (
          <View key={stage.id} style={styles.stageRow}>
            <View style={styles.rowTop}>
              <Text style={styles.itemTitle}>{stage.label}</Text>
              <Text style={styles.metaText}>{stage.count} 段</Text>
            </View>
            <View style={styles.barTrack}>
              <View
                style={[
                  styles.barFill,
                  {
                    width: `${Math.max(
                      4,
                      total ? Math.round((stage.count / total) * 100) : 0
                    )}%`
                  }
                ]}
              />
            </View>
          </View>
        ))}
      </View>
    </DataCard>
  );
}

function ConnectionRow({
  connection,
  onOpenContact,
  onPreviewProfile,
  onReviewEvidence,
  profiling,
  reviewing
}: {
  connection: ConnectionPriorityView;
  onOpenContact: () => void;
  onPreviewProfile: () => void;
  onReviewEvidence: () => void;
  profiling: boolean;
  reviewing: boolean;
}) {
  return (
    <View style={styles.connectionRow}>
      <View style={styles.rowTop}>
        <View style={styles.connectionTitle}>
          <Text numberOfLines={1} style={styles.itemTitle}>
            {connection.name}
          </Text>
          <Text numberOfLines={1} style={styles.metaText}>
            {[connection.organization, connection.role].filter(Boolean).join(" · ")}
          </Text>
        </View>
        <View style={styles.scorePill}>
          <Text style={styles.scoreText}>{connection.scoreLabel}</Text>
        </View>
      </View>
      <Text style={styles.bodyText}>{connection.detail}</Text>
      <Text style={styles.bodyText}>{connection.nextAction}</Text>
      <View style={styles.tagRow}>
        <Text style={styles.stageTag}>{connection.stageLabel}</Text>
        <Text style={styles.sourceTag}>{connection.sourceLabel}</Text>
        <Text style={styles.metaText}>{connection.lastTouchedAt}</Text>
      </View>
      <View style={styles.connectionActions}>
        <Pressable
          accessibilityRole="button"
          disabled={reviewing}
          onPress={onReviewEvidence}
          style={({ pressed }) => [
            styles.secondaryButton,
            reviewing ? styles.disabled : null,
            pressed ? styles.pressed : null
          ]}
        >
          <Ionicons color={colors.accent} name="document-text-outline" size={15} />
          <Text style={styles.secondaryButtonText}>
            {reviewing ? "读取中" : "查看证据"}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={profiling}
          onPress={onPreviewProfile}
          style={({ pressed }) => [
            styles.secondaryButton,
            profiling ? styles.disabled : null,
            pressed ? styles.pressed : null
          ]}
        >
          <Ionicons color={colors.accent} name="sparkles-outline" size={15} />
          <Text style={styles.secondaryButtonText}>
            {profiling ? "生成中" : "生成画像"}
          </Text>
        </Pressable>
        {connection.contactId ? (
          <Pressable
            accessibilityRole="button"
            onPress={onOpenContact}
            style={({ pressed }) => [
              styles.ghostButton,
              pressed ? styles.pressed : null
            ]}
          >
            <Ionicons color={colors.text3} name="person-outline" size={15} />
            <Text style={styles.ghostButtonText}>打开联系人</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function ConnectionProfileCard({
  view
}: {
  view: ConnectionProfilePreviewView;
}) {
  return (
    <DataCard detail={view.summary} title="关系画像">
      <View style={styles.evidenceHeader}>
        <View style={styles.connectionTitle}>
          <Text style={styles.itemTitle}>{view.title}</Text>
          <Text style={styles.metaText}>{view.profileLine}</Text>
        </View>
        <View style={styles.safetyPill}>
          <Ionicons color={colors.live} name="shield-checkmark-outline" size={15} />
          <Text style={styles.safetyText}>{view.safetyText}</Text>
        </View>
      </View>
      <Text style={styles.bodyText}>{view.context}</Text>
      {view.mutualValues.length > 0 ? (
        <View style={styles.profileGrid}>
          {view.mutualValues.map((item) => (
            <ProfileValueRow item={item} key={item.label} />
          ))}
        </View>
      ) : null}
      <View style={styles.profileNextAction}>
        <Text style={styles.itemTitle}>{view.nextActionTitle}</Text>
        {view.nextActionDue ? (
          <Text style={styles.metaText}>{view.nextActionDue}</Text>
        ) : null}
        <Text style={styles.bodyText}>{view.nextActionDetail}</Text>
      </View>
    </DataCard>
  );
}

function ProfileValueRow({ item }: { item: ConnectionProfileMutualValueView }) {
  return (
    <View style={styles.profileValueRow}>
      <Text style={styles.metaText}>{item.label}</Text>
      <Text style={styles.bodyText}>{item.value}</Text>
    </View>
  );
}

function ConnectionEvidenceCard({
  addFeedback,
  addPending,
  onAddEvidence,
  view
}: {
  addFeedback: string | null;
  addPending: boolean;
  onAddEvidence: (draft: ConnectionEvidenceAddDraft) => Promise<boolean>;
  view: ConnectionEvidenceDetailView;
}) {
  const [draft, setDraft] = useState<ConnectionEvidenceAddDraft>({
    excerpt: "",
    title: ""
  });

  async function submitEvidence() {
    const saved = await onAddEvidence(draft);

    if (saved) {
      setDraft({
        excerpt: "",
        title: ""
      });
    }
  }

  return (
    <DataCard detail={view.summary} title="证据链">
      <View style={styles.evidenceHeader}>
        <View style={styles.connectionTitle}>
          <Text style={styles.itemTitle}>{view.title}</Text>
          <Text style={styles.metaText}>{view.connectionLine}</Text>
        </View>
        <View style={styles.safetyPill}>
          <Ionicons color={colors.live} name="shield-checkmark-outline" size={15} />
          <Text style={styles.safetyText}>{view.safetyText}</Text>
        </View>
      </View>
      <Text style={styles.bodyText}>{view.nextAction}</Text>
      {view.kind === "empty" ? (
        <Text style={styles.bodyText}>{view.summary}</Text>
      ) : null}
      {view.sourceLinks.length > 0 ? (
        <View style={styles.tagRow}>
          {view.sourceLinks.map((source) => (
            <EvidenceSourceChip key={source.id} source={source} />
          ))}
        </View>
      ) : null}
      {view.timeline.length > 0 ? (
        <View style={styles.evidenceStack}>
          {view.timeline.map((item) => (
            <EvidenceTimelineRow item={item} key={item.id} />
          ))}
        </View>
      ) : null}
      <View style={styles.evidenceForm}>
        {addFeedback ? (
          <Text style={styles.feedbackText}>{addFeedback}</Text>
        ) : null}
        <TextInput
          onChangeText={(value) => setDraft((current) => ({ ...current, title: value }))}
          placeholder="标题，比如 后续可引荐"
          placeholderTextColor={colors.text4}
          style={styles.evidenceInput}
          value={draft.title}
        />
        <TextInput
          multiline
          onChangeText={(value) =>
            setDraft((current) => ({ ...current, excerpt: value }))
          }
          placeholder="写清楚这条关系为什么值得跟进"
          placeholderTextColor={colors.text4}
          style={styles.evidenceTextArea}
          textAlignVertical="top"
          value={draft.excerpt}
        />
        <Pressable
          accessibilityRole="button"
          disabled={addPending}
          onPress={submitEvidence}
          style={({ pressed }) => [
            styles.secondaryButton,
            addPending ? styles.disabled : null,
            pressed ? styles.pressed : null
          ]}
        >
          <Ionicons color={colors.accent} name="add-circle-outline" size={15} />
          <Text style={styles.secondaryButtonText}>
            {addPending ? "补充中" : "添加证据"}
          </Text>
        </Pressable>
      </View>
    </DataCard>
  );
}

function EvidenceSourceChip({
  source
}: {
  source: ConnectionEvidenceSourceLinkView;
}) {
  return (
    <Text style={styles.sourceTag}>
      {source.label}
      {source.detail ? ` · ${source.detail}` : ""}
    </Text>
  );
}

function EvidenceTimelineRow({
  item
}: {
  item: ConnectionEvidenceTimelineView;
}) {
  return (
    <View style={styles.evidenceRow}>
      <View style={styles.evidenceIcon}>
        <Ionicons color={colors.accent} name="document-text-outline" size={15} />
      </View>
      <View style={styles.connectionTitle}>
        <Text style={styles.itemTitle}>{item.title}</Text>
        <Text style={styles.metaText}>{item.detail}</Text>
        <Text style={styles.bodyText}>{item.excerpt}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  barFill: {
    backgroundColor: colors.live,
    borderRadius: radius.pill,
    height: "100%"
  },
  barTrack: {
    backgroundColor: colors.liveSoft,
    borderRadius: radius.pill,
    height: 8,
    overflow: "hidden"
  },
  bodyText: {
    color: colors.text,
    fontSize: typography.small,
    lineHeight: 20
  },
  callout: {
    alignItems: "center",
    backgroundColor: colors.accentSofter,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md
  },
  calloutText: {
    color: colors.text,
    flex: 1,
    fontSize: typography.small,
    lineHeight: 20
  },
  connectionActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  connectionRow: {
    borderColor: colors.border,
    borderTopWidth: 1,
    gap: spacing.sm,
    paddingTop: spacing.md
  },
  connectionTitle: {
    flex: 1,
    gap: spacing.xs
  },
  disabled: {
    opacity: 0.54
  },
  errorText: {
    color: colors.rose,
    fontSize: typography.small,
    lineHeight: 20
  },
  evidenceHeader: {
    gap: spacing.sm
  },
  evidenceForm: {
    borderColor: colors.border,
    borderTopWidth: 1,
    gap: spacing.sm,
    paddingTop: spacing.md
  },
  evidenceIcon: {
    alignItems: "center",
    backgroundColor: colors.accentSofter,
    borderRadius: radius.pill,
    height: 30,
    justifyContent: "center",
    width: 30
  },
  evidenceRow: {
    alignItems: "flex-start",
    borderColor: colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    paddingTop: spacing.md
  },
  evidenceStack: {
    gap: spacing.md
  },
  evidenceInput: {
    backgroundColor: colors.surface2,
    borderColor: colors.border2,
    borderRadius: radius.control,
    borderWidth: 1,
    color: colors.text,
    fontSize: typography.small,
    minHeight: 40,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  evidenceTextArea: {
    backgroundColor: colors.surface2,
    borderColor: colors.border2,
    borderRadius: radius.control,
    borderWidth: 1,
    color: colors.text,
    fontSize: typography.small,
    lineHeight: 20,
    minHeight: 84,
    padding: spacing.md
  },
  feedbackText: {
    color: colors.live,
    fontSize: typography.small,
    fontWeight: "700",
    lineHeight: 20
  },
  ghostButton: {
    alignItems: "center",
    borderColor: colors.border2,
    borderRadius: radius.control,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.xs,
    minHeight: 36,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  ghostButtonText: {
    color: colors.text3,
    fontSize: typography.caption,
    fontWeight: "700",
    lineHeight: 16
  },
  itemTitle: {
    color: colors.ink,
    flex: 1,
    fontSize: typography.body,
    fontWeight: "600",
    lineHeight: 21
  },
  listStack: {
    gap: spacing.md
  },
  metaText: {
    color: colors.text3,
    fontSize: typography.small,
    lineHeight: 19
  },
  metricCell: {
    borderColor: colors.border,
    borderTopWidth: 1,
    flexBasis: "46%",
    flexGrow: 1,
    gap: spacing.xs,
    minWidth: 120,
    paddingTop: spacing.md
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md
  },
  metricLabel: {
    color: colors.text3,
    fontSize: typography.caption,
    fontWeight: "600"
  },
  metricValue: {
    color: colors.ink,
    fontSize: 26,
    fontWeight: "700",
    lineHeight: 30
  },
  pressed: {
    opacity: 0.72
  },
  profileGrid: {
    gap: spacing.md
  },
  profileNextAction: {
    backgroundColor: colors.accentSofter,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md
  },
  profileValueRow: {
    borderColor: colors.border,
    borderTopWidth: 1,
    gap: spacing.xs,
    paddingTop: spacing.md
  },
  rowTop: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between"
  },
  scorePill: {
    backgroundColor: colors.amberSoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  scoreText: {
    color: colors.amber,
    fontSize: typography.small,
    fontWeight: "700"
  },
  safetyPill: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.liveSoft,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  safetyText: {
    color: colors.live,
    fontSize: typography.caption,
    fontWeight: "700",
    lineHeight: 16
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: colors.accentSofter,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.xs,
    minHeight: 36,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  secondaryButtonText: {
    color: colors.accent,
    fontSize: typography.caption,
    fontWeight: "700",
    lineHeight: 16
  },
  sourceTag: {
    backgroundColor: colors.skySoft,
    borderRadius: radius.pill,
    color: colors.sky,
    fontSize: typography.caption,
    fontWeight: "700",
    overflow: "hidden",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs
  },
  stageRow: {
    gap: spacing.sm
  },
  stageTag: {
    backgroundColor: colors.liveSoft,
    borderRadius: radius.pill,
    color: colors.live,
    fontSize: typography.caption,
    fontWeight: "700",
    overflow: "hidden",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs
  },
  tagRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  }
});
