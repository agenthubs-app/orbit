import { Ionicons } from "@expo/vector-icons";
import { type Href, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import {
  dashboardOpportunitiesRecomputePath,
  ORBIT_API_ENDPOINTS
} from "../../api/endpoints";
import { mobileContactsDashboardPayloadSchema } from "../../api/schema/mobile-contacts-dashboard";
import { AppScreen } from "../../components/AppScreen";
import { AnalysisPieOrbitChart } from "../../components/AnalysisPieOrbitChart";
import { DataCard } from "../../components/DataCard";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { colors, radius, spacing, typography } from "../../design/tokens";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { useValidatedApiResource } from "../../hooks/useValidatedApiResource";
import {
  contactsAnalysisToView,
  type ContactsAnalysisActivityView,
  type ContactsAnalysisActionView,
  type ContactsAnalysisBriefActionView,
  type ContactsAnalysisCoverageSignalView,
  type ContactsAnalysisDimensionView,
  type ContactsAnalysisHealthView,
  type ContactsAnalysisStructureDimensionId,
  type ContactsAnalysisStructureDimensionView,
  type ContactsAnalysisStructureItemView
} from "../../view-models/contacts-analysis";
import {
  contactsDashboardToView,
  type ContactsDashboardOverviewItem,
  type ContactsDashboardView
} from "../../view-models/contacts-dashboard";
import {
  contactAvatarFor,
  contactLocationsToValues,
  contactsToSummaries,
  type ContactAvatarTone,
  type ContactSummary
} from "../../view-models/contacts";
import {
  dashboardOpportunitiesRecomputeToView,
  type DashboardOpportunitiesRecomputeView,
  type DashboardActivityView,
  type DashboardGapView,
  type DashboardIndustryView,
  type DashboardPriorityView,
  type DashboardStrengthView,
  type DashboardValueTypeView
} from "../../view-models/dashboard";
import {
  buildProfileUpdateRequest,
  profileSummaryToEditDraft,
  profileToSummary,
  type ProfileManualEditDraft
} from "../../view-models/profile";

type ContactsDashboardOverviewFilter = {
  source?: string;
  status?: string;
  tag?: string;
  value?: string;
};

type AnalysisSegment = "opportunity" | "overview" | "structure";

function overviewFilterFor(
  item: ContactsDashboardOverviewItem
): ContactsDashboardOverviewFilter {
  if (item.id === "pending-followups") {
    return { status: "needs_follow_up" };
  }

  if (item.id === "dormant-contacts") {
    return { status: "nurture" };
  }

  if (item.id === "high-value") {
    return { value: "strategic_fit" };
  }

  return {};
}

export function ContactsDashboardScreen() {
  const client = useOrbitApiClient();
  const { baseUrl } = useOrbitApiBaseUrl();
  const [recomputing, setRecomputing] = useState(false);
  const [recomputeResult, setRecomputeResult] =
    useState<DashboardOpportunitiesRecomputeView | null>(null);
  const [recomputeError, setRecomputeError] = useState<string | null>(null);
  const [relationshipGoalDraft, setRelationshipGoalDraft] =
    useState<ProfileManualEditDraft | null>(null);
  const [relationshipGoalError, setRelationshipGoalError] =
    useState<string | null>(null);
  const [relationshipGoalMessage, setRelationshipGoalMessage] =
    useState<string | null>(null);
  const [savingRelationshipGoal, setSavingRelationshipGoal] = useState(false);
  const dashboardState = useValidatedApiResource(
    ORBIT_API_ENDPOINTS.mobileContactsDashboard,
    mobileContactsDashboardPayloadSchema,
    (data) => data.aggregate.relationshipAssetTotals.contacts === 0
  );
  const dashboard =
    dashboardState.kind === "success" || dashboardState.kind === "empty"
      ? dashboardState.data
      : null;
  const profile =
    dashboard?.profile
      ? profileToSummary(dashboard.profile)
      : null;

  useEffect(() => {
    if (profile) {
      setRelationshipGoalDraft(profileSummaryToEditDraft(profile));
    }
  }, [profile?.displayName, profile?.relationshipGoal]);

  function refreshAll() {
    setRecomputeError(null);
    setRelationshipGoalError(null);
    dashboardState.refresh();
  }

  async function recomputeContactDashboardOpportunities() {
    setRecomputing(true);
    setRecomputeResult(null);
    setRecomputeError(null);

    try {
      const result = await client.post<unknown>(
        dashboardOpportunitiesRecomputePath()
      );

      if (result.success) {
        setRecomputeResult(
          dashboardOpportunitiesRecomputeToView(result.data)
        );
        dashboardState.refresh();
      } else {
        setRecomputeError(result.error.message);
      }
    } catch {
      setRecomputeError("机会提醒暂时不能重新计算。请稍后再试。");
    } finally {
      setRecomputing(false);
    }
  }

  async function saveContactDashboardGoal() {
    if (!relationshipGoalDraft) {
      setRelationshipGoalError("个人资料还没加载完成。");
      setRelationshipGoalMessage(null);
      return;
    }

    const request = buildProfileUpdateRequest(relationshipGoalDraft);

    if (!request) {
      setRelationshipGoalError("先到个人资料页补姓名，再保存目标。");
      setRelationshipGoalMessage(null);
      return;
    }

    setSavingRelationshipGoal(true);
    setRelationshipGoalError(null);
    setRelationshipGoalMessage(null);

    try {
      const result = await client.put<unknown>(ORBIT_API_ENDPOINTS.profile, {
        body: request
      });

      if (!result.success) {
        setRelationshipGoalError(
          result.error.message || "关系目标暂时保存不了。"
        );
        return;
      }

      setRelationshipGoalMessage("关系目标已保存。");
      dashboardState.refresh();
    } catch (error) {
      setRelationshipGoalError(
        error instanceof Error ? error.message : "关系目标暂时保存不了。"
      );
    } finally {
      setSavingRelationshipGoal(false);
    }
  }

  return (
    <AppScreen
      eyebrow="名片夹"
      refreshControl={
        <RefreshControl
          onRefresh={refreshAll}
          refreshing={dashboardState.refreshing}
          tintColor={colors.accent}
        />
      }
      title="人脉分析"
    >
      {dashboardState.kind === "loading" ? <LoadingState /> : null}
      {dashboardState.kind === "offline" ? (
        <ErrorState message={dashboardState.error.message} title="服务器连不上" />
      ) : null}
      {dashboardState.kind === "failure" ? (
        <ErrorState message={dashboardState.error.message} />
      ) : null}
      {dashboardState.kind === "empty" ? (
        <EmptyState
          message="先确认联系人，Orbit 才能判断关系覆盖和下一步。"
          title="暂无人脉资产"
        />
      ) : null}
      {dashboardState.kind === "success" ? (
        <ContactsDashboardContent
          aggregate={dashboardState.data.aggregate}
          baseUrl={baseUrl}
          contactsPayload={dashboardState.data.contacts}
          distributions={dashboardState.data.distributions}
          gaps={dashboardState.data.gaps}
          opportunities={dashboardState.data.opportunities}
          onRecompute={recomputeContactDashboardOpportunities}
          recomputeError={recomputeError}
          recomputeResult={recomputeResult}
          recomputing={recomputing}
          onRelationshipGoalChange={(value) =>
            setRelationshipGoalDraft((current) =>
              current
                ? {
                    ...current,
                    relationshipGoal: value
                  }
                : current
            )
          }
          onSaveRelationshipGoal={saveContactDashboardGoal}
          relationshipGoalDraft={relationshipGoalDraft}
          relationshipGoalError={relationshipGoalError}
          relationshipGoalMessage={relationshipGoalMessage}
          savingRelationshipGoal={savingRelationshipGoal}
          summary={dashboardState.data.summary}
        />
      ) : null}
    </AppScreen>
  );
}

function ContactsDashboardContent({
  aggregate,
  baseUrl,
  contactsPayload,
  distributions,
  gaps,
  onRecompute,
  opportunities,
  recomputeError,
  recomputeResult,
  recomputing,
  onRelationshipGoalChange,
  onSaveRelationshipGoal,
  relationshipGoalDraft,
  relationshipGoalError,
  relationshipGoalMessage,
  savingRelationshipGoal,
  summary
}: {
  aggregate: unknown;
  baseUrl: string;
  contactsPayload: unknown;
  distributions: unknown;
  gaps: unknown;
  onRecompute: () => void;
  onRelationshipGoalChange: (value: string) => void;
  onSaveRelationshipGoal: () => void;
  opportunities: unknown;
  recomputeError: string | null;
  recomputeResult: DashboardOpportunitiesRecomputeView | null;
  recomputing: boolean;
  relationshipGoalDraft: ProfileManualEditDraft | null;
  relationshipGoalError: string | null;
  relationshipGoalMessage: string | null;
  savingRelationshipGoal: boolean;
  summary: unknown;
}) {
  const router = useRouter();
  const [analysisSegment, setAnalysisSegment] =
    useState<AnalysisSegment>("overview");
  const [structureDimension, setStructureDimension] =
    useState<ContactsAnalysisStructureDimensionId>("industry");
  const [editingGoal, setEditingGoal] = useState(false);
  const [healthExpanded, setHealthExpanded] = useState(false);
  const [selectedAction, setSelectedAction] =
    useState<ContactsAnalysisActionView | null>(null);
  const contacts = contactsToSummaries(contactsPayload);
  const contactLocations = contactLocationsToValues(contactsPayload);
  const view = contactsAnalysisToView(
    {
      aggregate,
      distributions,
      gaps,
      opportunities,
      summary
    },
    relationshipGoalDraft?.relationshipGoal ?? "",
    contacts,
    contactLocations
  );

  function openRecommendedAction(action: ContactsAnalysisActionView) {
    if (action.brief) {
      setSelectedAction(action);
      return;
    }

    if (action.contactId) {
      router.push(
        `/contacts/${encodeURIComponent(action.contactId)}` as Href
      );
      return;
    }

    if (action.id === "complete-goal") {
      setEditingGoal(true);
      return;
    }

    router.push("/contacts/list" as Href);
  }

  function openBriefAction(
    action: ContactsAnalysisBriefActionView,
    primary: boolean
  ) {
    setSelectedAction(null);

    if (action.kind === "open_pipeline") {
      router.push("/contacts/pipeline" as Href);
      return;
    }

    if (action.kind === "open_contacts") {
      router.push("/contacts/list" as Href);
      return;
    }

    if (action.contactId && primary) {
      const contact = contacts.find((item) => item.id === action.contactId);
      const inboxHref = `/inbox?contactId=${encodeURIComponent(
        action.contactId
      )}&participantName=${encodeURIComponent(
        contact?.name ?? "联系人"
      )}&organization=${encodeURIComponent(contact?.organization ?? "")}` as Href;

      router.push(inboxHref);
      return;
    }

    if (action.contactId) {
      router.push(
        `/contacts/${encodeURIComponent(action.contactId)}` as Href
      );
      return;
    }

    router.push("/contacts/list" as Href);
  }

  function openCoverageSignal(signal: ContactsAnalysisCoverageSignalView) {
    if (signal.id === "high-value") {
      router.push({
        pathname: "/contacts/list",
        params: { value: "strategic_fit" }
      });
      return;
    }

    if (signal.id === "referral") {
      router.push({
        pathname: "/contacts/list",
        params: { value: "referral_path" }
      });
      return;
    }

    router.push({
      pathname: "/contacts/list",
      params: { status: "active" }
    });
  }

  function openGoalPath() {
    if (view.goalConfigured) {
      router.push("/contacts/pipeline" as Href);
    } else {
      setEditingGoal(true);
    }
  }

  function openStructureItem(
    dimension: ContactsAnalysisStructureDimensionId,
    item: ContactsAnalysisStructureItemView
  ) {
    router.push(
      `/contacts/analysis/${encodeURIComponent(dimension)}/${encodeURIComponent(item.id)}` as Href
    );
  }

  return (
    <>
      <GoalBar
        goal={view.goal}
        onEdit={() => setEditingGoal((current) => !current)}
      />

      {editingGoal && relationshipGoalDraft ? (
        <ContactDashboardGoalCard
          draft={relationshipGoalDraft}
          error={relationshipGoalError}
          message={relationshipGoalMessage}
          onChange={onRelationshipGoalChange}
          onSave={onSaveRelationshipGoal}
          saving={savingRelationshipGoal}
        />
      ) : null}

      <AnalysisDiagnosisCard
        diagnosis={view.diagnosis}
        onRecompute={onRecompute}
        recomputing={recomputing}
      />

      <AnalysisSegmentedControl
        onSelect={setAnalysisSegment}
        selected={analysisSegment}
      />

      {recomputeResult ? (
        <DataCard
          detail={recomputeResult.statusLabel}
          title={recomputeResult.title}
        >
          <Text style={styles.bodyText}>{recomputeResult.detail}</Text>
          <Text style={styles.recomputeStatus}>
            {recomputeResult.nextAction}
          </Text>
        </DataCard>
      ) : null}
      {recomputeError ? (
        <Text style={styles.errorText}>{recomputeError}</Text>
      ) : null}

      {analysisSegment === "overview" ? (
        <>
          <AnalysisSnapshotCard dimensions={view.dimensions} />
          <RecommendedActionsCard
            actions={view.actions.slice(0, 2)}
            baseUrl={baseUrl}
            contacts={contacts}
            onOpen={openRecommendedAction}
            subtitle="最值得优先推进的关系路径"
            title="关键机会"
          />
          <AnalysisActivityCard activity={view.activity} />
        </>
      ) : null}

      {analysisSegment === "structure" ? (
        <StructureAnalysisView
          dimensions={view.structureDimensions}
          health={view.health}
          healthExpanded={healthExpanded}
          onOpenItem={openStructureItem}
          onSelectDimension={setStructureDimension}
          onToggleHealth={() =>
            setHealthExpanded((current) => !current)
          }
          selectedDimension={structureDimension}
        />
      ) : null}

      {analysisSegment === "opportunity" ? (
        <OpportunityAnalysisView
          actions={view.actions}
          baseUrl={baseUrl}
          contacts={contacts}
          coverage={view.coverage}
          goalConfigured={view.goalConfigured}
          onOpenAction={openRecommendedAction}
          onOpenPath={openGoalPath}
          onOpenSignal={openCoverageSignal}
          onRecompute={onRecompute}
          recomputing={recomputing}
        />
      ) : null}

      <OpportunityActionBriefSheet
        action={selectedAction}
        onClose={() => setSelectedAction(null)}
        onOpenPrimary={(action) => openBriefAction(action, true)}
        onOpenSecondary={(action) => openBriefAction(action, false)}
        visible={selectedAction !== null}
      />
    </>
  );
}

function opportunityTypeLabel(
  type: NonNullable<ContactsAnalysisActionView["brief"]>["type"]
): string {
  if (type === "coverage_gap") return "覆盖缺口";
  if (type === "relationship_risk") return "关系维护";
  if (type === "referral_path") return "引荐路径";
  return "跟进行动";
}

function OpportunityActionBriefSheet({
  action,
  onClose,
  onOpenPrimary,
  onOpenSecondary,
  visible
}: {
  action: ContactsAnalysisActionView | null;
  onClose: () => void;
  onOpenPrimary: (action: ContactsAnalysisBriefActionView) => void;
  onOpenSecondary: (action: ContactsAnalysisBriefActionView) => void;
  visible: boolean;
}) {
  const brief = action?.brief;

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="overFullScreen"
      transparent
      visible={visible}
    >
      <View style={styles.actionBriefRoot}>
        <Pressable
          accessibilityLabel="关闭行动简报"
          accessibilityRole="button"
          onPress={onClose}
          style={styles.actionBriefScrim}
        />
        <View style={styles.actionBriefSheet}>
          {brief ? (
            <>
              <View style={styles.actionBriefHandle} />
              <View style={styles.actionBriefHeader}>
                <View style={styles.actionBriefHeaderCopy}>
                  <Text style={styles.actionBriefType}>
                    {opportunityTypeLabel(brief.type)} · {brief.priorityScore} 分
                  </Text>
                  <Text style={styles.actionBriefTitle}>{brief.title}</Text>
                </View>
                <Pressable
                  accessibilityLabel="关闭行动简报"
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={onClose}
                  style={({ pressed }) => [
                    styles.actionBriefClose,
                    pressed ? styles.pressed : null
                  ]}
                >
                  <Ionicons color={colors.text2} name="close" size={21} />
                </Pressable>
              </View>

              <ScrollView
                contentContainerStyle={styles.actionBriefContent}
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.actionBriefSection}>
                  <Text style={styles.actionBriefSectionLabel}>为什么现在</Text>
                  <Text style={styles.actionBriefJudgment}>{brief.judgment}</Text>
                </View>

                <View style={styles.actionBriefSection}>
                  <Text style={styles.actionBriefSectionLabel}>判断依据</Text>
                  <View style={styles.actionBriefList}>
                    {(brief.evidence.length > 0
                      ? brief.evidence
                      : ["现有记录不足，先补充联系人信息"]
                    ).map((item) => (
                      <View key={item} style={styles.actionBriefEvidenceRow}>
                        <Ionicons
                          color={colors.live}
                          name="checkmark-circle-outline"
                          size={18}
                        />
                        <Text style={styles.actionBriefListText}>{item}</Text>
                      </View>
                    ))}
                  </View>
                </View>

                <View style={styles.actionBriefSection}>
                  <Text style={styles.actionBriefSectionLabel}>建议步骤</Text>
                  <View style={styles.actionBriefList}>
                    {(brief.steps.length > 0
                      ? brief.steps
                      : ["先查看联系人资料，再决定下一步"]
                    ).map((item, index) => (
                      <View key={`${index}:${item}`} style={styles.actionBriefStepRow}>
                        <View style={styles.actionBriefStepIndex}>
                          <Text style={styles.actionBriefStepIndexText}>
                            {index + 1}
                          </Text>
                        </View>
                        <Text style={styles.actionBriefListText}>{item}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </ScrollView>

              <View style={styles.actionBriefActions}>
                {brief.secondaryAction ? (
                  <Pressable
                    accessibilityLabel={brief.secondaryAction.label}
                    accessibilityRole="button"
                    onPress={() => onOpenSecondary(brief.secondaryAction!)}
                    style={({ pressed }) => [
                      styles.actionBriefSecondaryButton,
                      pressed ? styles.pressed : null
                    ]}
                  >
                    <Text style={styles.actionBriefSecondaryText}>
                      {brief.secondaryAction.label}
                    </Text>
                  </Pressable>
                ) : null}
                <Pressable
                  accessibilityLabel={brief.primaryAction.label}
                  accessibilityRole="button"
                  onPress={() => onOpenPrimary(brief.primaryAction)}
                  style={({ pressed }) => [
                    styles.actionBriefPrimaryButton,
                    pressed ? styles.pressed : null
                  ]}
                >
                  <Text style={styles.actionBriefPrimaryText}>
                    {brief.primaryAction.label}
                  </Text>
                  <Ionicons
                    color={colors.onAccent}
                    name="arrow-forward"
                    size={17}
                  />
                </Pressable>
              </View>
            </>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function GoalBar({ goal, onEdit }: { goal: string; onEdit: () => void }) {
  return (
    <Pressable
      accessibilityLabel={`当前目标：${goal}，编辑目标`}
      accessibilityRole="button"
      onPress={onEdit}
      style={({ pressed }) => [
        styles.goalBar,
        pressed ? styles.pressed : null
      ]}
    >
      <View style={styles.goalBarCopy}>
        <Text style={styles.goalBarLabel}>当前目标</Text>
        <Text numberOfLines={2} style={styles.goalBarValue}>
          {goal}
        </Text>
      </View>
      <View style={styles.goalEditButton}>
        <Ionicons color={colors.ink} name="pencil-outline" size={19} />
      </View>
    </Pressable>
  );
}

function AnalysisDiagnosisCard({
  diagnosis,
  onRecompute,
  recomputing
}: {
  diagnosis: ReturnType<typeof contactsAnalysisToView>["diagnosis"];
  onRecompute: () => void;
  recomputing: boolean;
}) {
  return (
    <View style={styles.analysisDiagnosisCard}>
      <View style={styles.analysisDiagnosisIcon}>
        <Ionicons color={colors.accent} name="sparkles-outline" size={20} />
      </View>
      <Text style={styles.analysisDiagnosisText}>{diagnosis.detail}</Text>
      <View style={styles.analysisDiagnosisScore}>
        <Text style={styles.analysisDiagnosisLabel}>
          {diagnosis.statusLabel}
        </Text>
        <Text adjustsFontSizeToFit numberOfLines={1} style={styles.analysisDiagnosisValue}>
          {diagnosis.scoreLabel}
        </Text>
      </View>
      <Pressable
        accessibilityLabel="重新计算人脉分析"
        accessibilityRole="button"
        disabled={recomputing}
        onPress={onRecompute}
        style={({ pressed }) => [
          styles.analysisDiagnosisRefresh,
          recomputing ? styles.disabled : null,
          pressed ? styles.pressed : null
        ]}
      >
        <Ionicons color={colors.text3} name="refresh-outline" size={17} />
      </Pressable>
    </View>
  );
}

function AnalysisSegmentedControl({
  onSelect,
  selected
}: {
  onSelect: (segment: AnalysisSegment) => void;
  selected: AnalysisSegment;
}) {
  const segments: { id: AnalysisSegment; label: string }[] = [
    { id: "overview", label: "概览" },
    { id: "structure", label: "结构" },
    { id: "opportunity", label: "机会" }
  ];

  return (
    <View style={styles.analysisSegmentedControl}>
      {segments.map((segment) => {
        const isSelected = selected === segment.id;

        return (
          <Pressable
            accessibilityLabel={`${segment.label}分析`}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            key={segment.id}
            onPress={() => onSelect(segment.id)}
            style={({ pressed }) => [
              styles.analysisSegment,
              isSelected ? styles.analysisSegmentSelected : null,
              pressed ? styles.pressed : null
            ]}
          >
            <Text
              style={[
                styles.analysisSegmentText,
                isSelected ? styles.analysisSegmentTextSelected : null
              ]}
            >
              {segment.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function AnalysisSnapshotCard({
  dimensions
}: {
  dimensions: ContactsAnalysisDimensionView[];
}) {
  return (
    <View style={styles.analysisSurface}>
      <View style={styles.analysisSectionHeader}>
        <View style={styles.analysisSectionTitleBlock}>
          <Text style={styles.analysisSectionTitle}>结构摘要</Text>
          <Text style={styles.analysisSectionDetail}>快速判断当前人脉构成</Text>
        </View>
      </View>
      <AnalysisDimensionSummary dimensions={dimensions} />
    </View>
  );
}

function StructureDimensionControl({
  dimensions,
  onSelect,
  selected
}: {
  dimensions: ContactsAnalysisStructureDimensionView[];
  onSelect: (dimension: ContactsAnalysisStructureDimensionId) => void;
  selected: ContactsAnalysisStructureDimensionId;
}) {
  return (
    <View style={styles.structureDimensionControl}>
      {dimensions.map((dimension) => {
        const isSelected = selected === dimension.id;

        return (
          <Pressable
            accessibilityLabel={`${dimension.label}结构分析`}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            key={dimension.id}
            onPress={() => onSelect(dimension.id)}
            style={({ pressed }) => [
              styles.structureDimensionButton,
              isSelected ? styles.structureDimensionButtonSelected : null,
              pressed ? styles.pressed : null
            ]}
          >
            <Ionicons
              color={isSelected ? colors.accent : colors.text3}
              name={structureDimensionIcon(dimension.id)}
              size={16}
            />
            <Text
              style={[
                styles.structureDimensionText,
                isSelected ? styles.structureDimensionTextSelected : null
              ]}
            >
              {dimension.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function StructureBreakdownCard({
  dimension,
  onOpenItem,
  onSelectItem,
  selectedId
}: {
  dimension: ContactsAnalysisStructureDimensionView;
  onOpenItem: (item: ContactsAnalysisStructureItemView) => void;
  onSelectItem: (item: ContactsAnalysisStructureItemView) => void;
  selectedId: string;
}) {
  const selectedItem =
    dimension.items.find((item) => item.id === selectedId) ?? dimension.items[0];
  const pieItems = dimension.items.map((item, index) => ({
    color: structurePieColor(index),
    countLabel: item.countLabel,
    id: item.id,
    label: item.label,
    percentage: item.percentage
  }));

  return (
    <View style={styles.analysisSurface}>
      <View style={styles.analysisSectionHeader}>
        <View style={styles.analysisSectionTitleBlock}>
          <Text style={styles.analysisSectionTitle}>{dimension.title}</Text>
          <Text style={styles.analysisSectionDetail}>{dimension.summary}</Text>
        </View>
        <Text style={styles.structureBreakdownHint}>
          {dimension.items.length > 5
            ? `前 5 个分组 + 其他 ${dimension.items.length - 5} 个`
            : `全部 ${dimension.items.length} 个分组`}
        </Text>
      </View>

      {dimension.items.length > 0 && selectedItem ? (
        <>
          <AnalysisPieOrbitChart
            items={pieItems}
            onSelect={(id) => {
              const item = dimension.items.find((candidate) => candidate.id === id);
              if (item) onSelectItem(item);
            }}
            selectedId={selectedItem.id}
          />
          <Pressable
            accessibilityLabel={`查看${selectedItem.label}分组详情`}
            accessibilityRole="button"
            onPress={() => onOpenItem(selectedItem)}
            style={({ pressed }) => [
              styles.structureDetailButton,
              pressed ? styles.pressed : null
            ]}
          >
            <Text style={styles.structureDetailButtonText}>
              查看{selectedItem.label}分组
            </Text>
            <Ionicons color={colors.accent} name="arrow-forward" size={17} />
          </Pressable>
        </>
      ) : (
        <View style={styles.analysisEmptyBlock}>
          <Ionicons
            color={colors.text4}
            name={structureDimensionIcon(dimension.id)}
            size={20}
          />
          <Text style={styles.analysisEmptyText}>
            补充联系人{dimension.label}信息后，这里会显示分布。
          </Text>
        </View>
      )}

      <View style={styles.structureInsight}>
        <View style={styles.structureInsightIcon}>
          <Ionicons color={colors.amber} name="bulb-outline" size={18} />
        </View>
        <View style={styles.structureInsightCopy}>
          <Text style={styles.structureInsightLabel}>结构洞察</Text>
          <Text style={styles.structureInsightText}>{dimension.insight}</Text>
        </View>
      </View>
    </View>
  );
}

function AnalysisDimensionSummary({
  dimensions
}: {
  dimensions: ContactsAnalysisDimensionView[];
}) {
  return (
    <View style={styles.analysisDimensionGrid}>
      {dimensions.map((dimension, index) => {
        const visual = analysisToneVisual(dimension.tone);

        return (
          <View
            key={dimension.id}
            style={[
              styles.analysisDimensionItem,
              index > 0 ? styles.analysisDimensionDivider : null
            ]}
          >
            <View style={styles.analysisDimensionHeading}>
              <View
                style={[
                  styles.analysisDimensionIcon,
                  { backgroundColor: visual.backgroundColor }
                ]}
              >
                <Ionicons
                  color={visual.color}
                  name={dimensionIcon(dimension.id)}
                  size={15}
                />
              </View>
              <Text numberOfLines={1} style={styles.analysisDimensionLabel}>
                {dimension.label}
              </Text>
            </View>
            <Text numberOfLines={1} style={styles.analysisDimensionValue}>
              {dimension.value}
            </Text>
            <Text numberOfLines={1} style={styles.analysisDimensionDetail}>
              {dimension.detail}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function AnalysisActivityCard({
  activity
}: {
  activity: ContactsAnalysisActivityView[];
}) {
  return (
    <View style={styles.analysisSurface}>
      <View style={styles.activityTitleRow}>
        <Text style={styles.analysisSectionTitle}>人脉健康</Text>
        <Text style={styles.analysisSectionDetail}>当前</Text>
      </View>
      <View style={styles.activityGrid}>
        {activity.map((item, index) => {
          const visual = analysisToneVisual(item.tone);

          return (
            <View
              key={item.id}
              style={[
                styles.activityItem,
                index > 0 ? styles.activityItemDivider : null
              ]}
            >
              <View
                style={[
                  styles.activityIcon,
                  { backgroundColor: visual.backgroundColor }
                ]}
              >
                <Ionicons
                  color={visual.color}
                  name={activityIcon(item.id)}
                  size={17}
                />
              </View>
              <Text style={styles.activityValue}>{item.value}</Text>
              <Text style={styles.activityLabel}>{item.label}</Text>
              <Text
                style={[styles.activityDetail, { color: visual.color }]}
              >
                {item.detail}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function StructureAnalysisView({
  dimensions,
  health,
  healthExpanded,
  onOpenItem,
  onSelectDimension,
  onToggleHealth,
  selectedDimension
}: {
  dimensions: ContactsAnalysisStructureDimensionView[];
  health: ContactsAnalysisHealthView[];
  healthExpanded: boolean;
  onOpenItem: (
    dimension: ContactsAnalysisStructureDimensionId,
    item: ContactsAnalysisStructureItemView
  ) => void;
  onSelectDimension: (dimension: ContactsAnalysisStructureDimensionId) => void;
  onToggleHealth: () => void;
  selectedDimension: ContactsAnalysisStructureDimensionId;
}) {
  const [selectedStructureItems, setSelectedStructureItems] = useState<
    Partial<Record<ContactsAnalysisStructureDimensionId, string>>
  >({});
  const activeDimension =
    dimensions.find((dimension) => dimension.id === selectedDimension) ??
    dimensions[0];

  if (!activeDimension) {
    return null;
  }
  const selectedId =
    selectedStructureItems[activeDimension.id] ??
    activeDimension.items[0]?.id ??
    "";

  return (
    <>
      <StructureDimensionControl
        dimensions={dimensions}
        onSelect={onSelectDimension}
        selected={activeDimension.id}
      />
      <StructureBreakdownCard
        dimension={activeDimension}
        onOpenItem={(item) => onOpenItem(activeDimension.id, item)}
        onSelectItem={(item) =>
          setSelectedStructureItems((current) => ({
            ...current,
            [activeDimension.id]: item.id
          }))
        }
        selectedId={selectedId}
      />
      <RelationshipHealthCard
        expanded={healthExpanded}
        health={health}
        onToggle={onToggleHealth}
      />
    </>
  );
}

function OpportunityAnalysisView({
  actions,
  baseUrl,
  contacts,
  coverage,
  goalConfigured,
  onOpenAction,
  onOpenPath,
  onOpenSignal,
  onRecompute,
  recomputing
}: {
  actions: ContactsAnalysisActionView[];
  baseUrl: string;
  contacts: ContactSummary[];
  coverage: ReturnType<typeof contactsAnalysisToView>["coverage"];
  goalConfigured: boolean;
  onOpenAction: (action: ContactsAnalysisActionView) => void;
  onOpenPath: () => void;
  onOpenSignal: (signal: ContactsAnalysisCoverageSignalView) => void;
  onRecompute: () => void;
  recomputing: boolean;
}) {
  return (
    <>
      <GoalCoverageCard
        coverage={coverage}
        onOpenPath={onOpenPath}
        onOpenSignal={onOpenSignal}
        onRecompute={onRecompute}
        primaryActionLabel={
          goalConfigured ? "查看突破路径" : "设置关系目标"
        }
        recomputing={recomputing}
      />
      <RecommendedActionsCard
        actions={actions}
        baseUrl={baseUrl}
        contacts={contacts}
        onOpen={onOpenAction}
        subtitle={
          goalConfigured ? "按目标贡献和时效排序" : "根据当前关系状态排序"
        }
        title="建议动作"
      />
    </>
  );
}

function structureDimensionIcon(
  dimension: ContactsAnalysisStructureDimensionId
): keyof typeof Ionicons.glyphMap {
  if (dimension === "location") {
    return "location-outline";
  }

  if (dimension === "role") {
    return "people-outline";
  }

  if (dimension === "relationship") {
    return "heart-outline";
  }

  return "business-outline";
}

function structurePieColor(index: number): string {
  return [
    colors.accent,
    colors.live,
    colors.sky,
    colors.amber,
    colors.rose,
    "#7B6E5B",
    "#3E8C94",
    "#8B6BB1",
    colors.muted
  ][index % 9] ?? colors.text3;
}

function analysisToneVisual(
  tone: ContactsAnalysisActivityView["tone"] | ContactsAnalysisDimensionView["tone"]
): { backgroundColor: string; color: string } {
  if (tone === "live") {
    return { backgroundColor: colors.liveSoft, color: colors.live };
  }

  if (tone === "sky") {
    return { backgroundColor: colors.skySoft, color: colors.sky };
  }

  return { backgroundColor: colors.amberSoft, color: colors.amber };
}

function dimensionIcon(
  id: ContactsAnalysisDimensionView["id"]
): keyof typeof Ionicons.glyphMap {
  if (id === "industry") {
    return "layers-outline";
  }

  if (id === "role") {
    return "people-outline";
  }

  return "heart-outline";
}

function activityIcon(
  id: ContactsAnalysisActivityView["id"]
): keyof typeof Ionicons.glyphMap {
  if (id === "new") {
    return "person-add-outline";
  }

  if (id === "strong") {
    return "flame-outline";
  }

  return "notifications-outline";
}

function GoalCoverageCard({
  coverage,
  onOpenPath,
  onOpenSignal,
  onRecompute,
  primaryActionLabel,
  recomputing
}: {
  coverage: ReturnType<typeof contactsAnalysisToView>["coverage"];
  onOpenPath: () => void;
  onOpenSignal: (signal: ContactsAnalysisCoverageSignalView) => void;
  onRecompute: () => void;
  primaryActionLabel: string;
  recomputing: boolean;
}) {
  return (
    <View style={styles.analysisSurface}>
      <View style={styles.analysisSectionHeader}>
        <View style={styles.analysisSectionTitleBlock}>
          <Text style={styles.analysisSectionTitle}>目标覆盖</Text>
          <Text style={styles.analysisSectionDetail}>{coverage.statusLabel}</Text>
        </View>
        <Pressable
          accessibilityLabel="重新计算机会"
          accessibilityRole="button"
          disabled={recomputing}
          onPress={onRecompute}
          style={({ pressed }) => [
            styles.refreshAnalysisButton,
            recomputing ? styles.disabled : null,
            pressed ? styles.pressed : null
          ]}
        >
          <Ionicons
            color={colors.text3}
            name="refresh-outline"
            size={18}
          />
        </Pressable>
      </View>

      <View style={styles.coverageBody}>
        <CoverageOrbit scoreLabel={coverage.scoreLabel} />
        <View style={styles.coverageSignals}>
          {coverage.signals.map((signal) => (
            <CoverageSignal
              key={signal.id}
              onPress={() => onOpenSignal(signal)}
              signal={signal}
            />
          ))}
        </View>
      </View>

      <Text style={styles.coverageDiagnosis}>{coverage.detail}</Text>
      <Pressable
        accessibilityLabel={primaryActionLabel}
        accessibilityRole="button"
        onPress={onOpenPath}
        style={({ pressed }) => [
          styles.analysisPrimaryButton,
          pressed ? styles.pressed : null
        ]}
      >
        <Ionicons color={colors.onAccent} name="navigate-outline" size={18} />
        <Text style={styles.analysisPrimaryButtonText}>{primaryActionLabel}</Text>
      </Pressable>
    </View>
  );
}

function CoverageOrbit({ scoreLabel }: { scoreLabel: string }) {
  return (
    <View
      accessibilityLabel={`目标覆盖 ${scoreLabel}`}
      accessibilityRole="text"
      accessible
      style={styles.coverageOrbit}
    >
      <View style={[styles.coverageRing, styles.coverageRingOuter]} />
      <View style={[styles.coverageRing, styles.coverageRingMiddle]} />
      <View style={[styles.coverageRing, styles.coverageRingInner]} />
      <View style={[styles.coverageDot, styles.coverageDotLive]} />
      <View style={[styles.coverageDot, styles.coverageDotSky]} />
      <View style={[styles.coverageDot, styles.coverageDotAmber]} />
      <View style={styles.coverageCenter}>
        <Text adjustsFontSizeToFit numberOfLines={1} style={styles.coverageScore}>
          {scoreLabel}
        </Text>
        <Text style={styles.coverageScoreLabel}>覆盖度</Text>
      </View>
    </View>
  );
}

function CoverageSignal({
  onPress,
  signal
}: {
  onPress: () => void;
  signal: ContactsAnalysisCoverageSignalView;
}) {
  const visual = coverageSignalVisual(signal.id);

  return (
    <Pressable
      accessibilityLabel={`${signal.label} ${signal.value}，查看联系人`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.coverageSignalRow,
        pressed ? styles.actionRowPressed : null
      ]}
    >
      <View
        style={[
          styles.coverageSignalIcon,
          { backgroundColor: visual.backgroundColor }
        ]}
      >
        <Ionicons color={visual.color} name={visual.icon} size={17} />
      </View>
      <Text numberOfLines={1} style={styles.coverageSignalLabel}>
        {signal.label}
      </Text>
      <Text style={[styles.coverageSignalValue, { color: visual.color }]}>
        {signal.value}
      </Text>
      <Ionicons color={colors.text4} name="chevron-forward" size={15} />
    </Pressable>
  );
}

function coverageSignalVisual(
  id: ContactsAnalysisCoverageSignalView["id"]
): { backgroundColor: string; color: string; icon: keyof typeof Ionicons.glyphMap } {
  if (id === "strong") {
    return {
      backgroundColor: colors.skySoft,
      color: colors.sky,
      icon: "people-outline"
    };
  }

  if (id === "referral") {
    return {
      backgroundColor: colors.amberSoft,
      color: colors.amber,
      icon: "git-branch-outline"
    };
  }

  return {
    backgroundColor: colors.liveSoft,
    color: colors.live,
    icon: "diamond-outline"
  };
}

function RecommendedActionsCard({
  actions,
  baseUrl,
  contacts,
  onOpen,
  subtitle,
  title = "建议动作"
}: {
  actions: ContactsAnalysisActionView[];
  baseUrl: string;
  contacts: ContactSummary[];
  onOpen: (action: ContactsAnalysisActionView) => void;
  subtitle: string;
  title?: string;
}) {
  return (
    <View style={styles.analysisSurface}>
      <View style={styles.analysisSectionHeader}>
        <View style={styles.analysisSectionTitleBlock}>
          <Text style={styles.analysisSectionTitle}>{title}</Text>
          <Text style={styles.analysisSectionDetail}>{subtitle}</Text>
        </View>
        <Text style={styles.analysisCount}>{actions.length} 项</Text>
      </View>
      <View style={styles.actionList}>
        {actions.map((action, index) => (
          <Pressable
            accessibilityLabel={`${action.title}，${action.statusLabel}，${action.detail}`}
            accessibilityRole="button"
            key={action.id}
            onPress={() => onOpen(action)}
            style={({ pressed }) => [
              styles.recommendedActionRow,
              index === actions.length - 1
                ? styles.recommendedActionRowLast
                : null,
              pressed ? styles.actionRowPressed : null
            ]}
          >
            <ActionLeading
              action={action}
              baseUrl={baseUrl}
              contact={contacts.find(
                (candidate) => candidate.id === action.contactId
              )}
              rank={index + 1}
            />
            <View style={styles.actionCopy}>
              <View style={styles.actionTitleRow}>
                <Text numberOfLines={2} style={styles.actionTitle}>
                  {action.title}
                </Text>
                <Text style={styles.actionStatus}>{action.statusLabel}</Text>
              </View>
              <Text numberOfLines={2} style={styles.actionDetail}>
                {action.detail}
              </Text>
            </View>
            <Ionicons color={colors.text4} name="chevron-forward" size={18} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function ActionLeading({
  action,
  baseUrl,
  contact,
  rank
}: {
  action: ContactsAnalysisActionView;
  baseUrl: string;
  contact: ContactSummary | undefined;
  rank: number;
}) {
  const avatar = contact ? contactAvatarFor(contact) : null;
  const visual = avatar
    ? contactAvatarVisual(avatar.tone)
    : actionVisual(action.tone);

  return (
    <View style={styles.actionLeading}>
      <View
        style={[
          styles.actionAvatar,
          { backgroundColor: visual.backgroundColor }
        ]}
      >
        {contact?.imageUrl ? (
          <Image
            resizeMode="cover"
            source={{ uri: assetUrl(baseUrl, contact.imageUrl) }}
            style={styles.actionAvatarImage}
          />
        ) : avatar ? (
          <Text style={[styles.actionAvatarText, { color: visual.color }]}>
            {avatar.initial}
          </Text>
        ) : (
          <Ionicons
            color={visual.color}
            name={action.id === "complete-goal" ? "flag-outline" : "scan-outline"}
            size={20}
          />
        )}
      </View>
      <View style={styles.actionRankBadge}>
        <Text style={styles.actionRankBadgeText}>{rank}</Text>
      </View>
    </View>
  );
}

function assetUrl(baseUrl: string, path: string): string {
  if (/^https?:\/\//iu.test(path)) {
    return path;
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl.replace(/\/+$/u, "")}${normalizedPath}`;
}

function actionVisual(tone: ContactsAnalysisActionView["tone"]): {
  backgroundColor: string;
  color: string;
} {
  if (tone === "amber") {
    return { backgroundColor: colors.amberSoft, color: colors.amber };
  }

  if (tone === "sky") {
    return { backgroundColor: colors.skySoft, color: colors.sky };
  }

  return { backgroundColor: colors.accentSofter, color: colors.accent };
}

function contactAvatarVisual(tone: ContactAvatarTone): {
  backgroundColor: string;
  color: string;
} {
  const visuals: Record<
    ContactAvatarTone,
    { backgroundColor: string; color: string }
  > = {
    amber: { backgroundColor: colors.amberSoft, color: colors.amber },
    emerald: { backgroundColor: colors.liveSoft, color: colors.live },
    rose: { backgroundColor: colors.roseSoft, color: colors.rose },
    sky: { backgroundColor: colors.skySoft, color: colors.sky },
    violet: { backgroundColor: colors.accentSofter, color: colors.accent }
  };

  return visuals[tone];
}

function RelationshipHealthCard({
  expanded,
  health,
  onToggle
}: {
  expanded: boolean;
  health: ContactsAnalysisHealthView[];
  onToggle: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={`关系健康，${health
        .map(
          (item) => `${item.label} ${item.value}，${item.statusLabel}`
        )
        .join("；")}`}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      onPress={onToggle}
      style={({ pressed }) => [
        styles.analysisSurface,
        pressed ? styles.pressed : null
      ]}
    >
      <View style={styles.analysisSectionHeader}>
        <View style={styles.analysisSectionTitleBlock}>
          <Text style={styles.analysisSectionTitle}>关系健康</Text>
          {expanded ? (
            <Text style={styles.analysisSectionDetail}>
              强度由互动频率、最近联系和已确认关系综合判断
            </Text>
          ) : null}
        </View>
        <Ionicons
          color={colors.text3}
          name={expanded ? "chevron-up" : "chevron-down"}
          size={18}
        />
      </View>
      <View style={styles.healthGrid}>
        {health.map((item, index) => (
          <HealthItem
            health={item}
            key={item.id}
            showDivider={index > 0}
          />
        ))}
      </View>
    </Pressable>
  );
}

function HealthItem({
  health,
  showDivider
}: {
  health: ContactsAnalysisHealthView;
  showDivider: boolean;
}) {
  const visual = healthVisual(health.tone);

  return (
    <View
      style={[
        styles.healthItem,
        showDivider ? styles.healthItemDivider : null
      ]}
    >
      <View
        style={[
          styles.healthIcon,
          { backgroundColor: visual.backgroundColor }
        ]}
      >
        <Ionicons color={visual.color} name="people-outline" size={17} />
      </View>
      <Text numberOfLines={1} style={styles.healthValue}>
        {health.label} {health.value}
      </Text>
      <Text style={[styles.healthStatus, { color: visual.color }]}>
        {health.statusLabel}
      </Text>
    </View>
  );
}

function healthVisual(tone: ContactsAnalysisHealthView["tone"]): {
  backgroundColor: string;
  color: string;
} {
  if (tone === "live") {
    return { backgroundColor: colors.liveSoft, color: colors.live };
  }

  if (tone === "sky") {
    return { backgroundColor: colors.skySoft, color: colors.sky };
  }

  return { backgroundColor: colors.amberSoft, color: colors.amber };
}

function ContactDashboardGoalCard({
  draft,
  error,
  message,
  onChange,
  onSave,
  saving
}: {
  draft: ProfileManualEditDraft;
  error: string | null;
  message: string | null;
  onChange: (value: string) => void;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <DataCard detail="会影响推荐和机会排序" title="关系目标">
      <TextInput
        accessibilityLabel="关系目标"
        multiline
        onChangeText={onChange}
        placeholder="最近想认识什么人，或者想推进哪类合作"
        placeholderTextColor={colors.text3}
        style={styles.goalInput}
        value={draft.relationshipGoal}
      />
      <Pressable
        accessibilityLabel="保存关系目标"
        accessibilityRole="button"
        disabled={saving}
        onPress={onSave}
        style={({ pressed }) => [
          styles.saveGoalButton,
          saving ? styles.disabled : null,
          pressed ? styles.pressed : null
        ]}
      >
        <Ionicons color={colors.onAccent} name="save-outline" size={17} />
        <Text style={styles.saveGoalButtonText}>
          {saving ? "保存中" : "保存目标"}
        </Text>
      </Pressable>
      {message ? <Text style={styles.successText}>{message}</Text> : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </DataCard>
  );
}

function OrbitMap({ view }: { view: ContactsDashboardView }) {
  return (
    <View style={styles.mapSection}>
      <View style={styles.orbitStage}>
        <View style={[styles.ring, styles.ringOuter]} />
        <View style={[styles.ring, styles.ringMiddle]} />
        <View style={[styles.ring, styles.ringInner]} />
        <View style={[styles.dot, styles.dotLive]} />
        <View style={[styles.dot, styles.dotSky]} />
        <View style={[styles.dot, styles.dotAccent]} />
        <View style={[styles.dot, styles.dotAmber]} />
        <View style={styles.mapCenter}>
          <Text adjustsFontSizeToFit numberOfLines={1} style={styles.mapValue}>
            {view.map.centerValue}
          </Text>
          <Text style={styles.mapLabel}>{view.map.centerLabel}</Text>
        </View>
      </View>
      {view.map.rings.length > 0 ? <RingLegend rings={view.map.rings} /> : null}
    </View>
  );
}

function RingLegend({ rings }: { rings: DashboardStrengthView[] }) {
  return (
    <View style={styles.ringLegend}>
      {rings.map((ring) => (
        <View key={ring.id} style={styles.ringRow}>
          <Text numberOfLines={1} style={styles.itemTitle}>
            {ring.label}
          </Text>
          <Text style={styles.metaText}>{ring.countLabel}</Text>
          <Text style={styles.metaText}>{ring.riskLabel}</Text>
        </View>
      ))}
    </View>
  );
}

function OverviewGrid({
  items,
  onOpenFilter
}: {
  items: ContactsDashboardOverviewItem[];
  onOpenFilter: (filter: ContactsDashboardOverviewFilter) => void;
}) {
  return (
    <View style={styles.overviewGrid}>
      {items.map((item) => {
        const filter = overviewFilterFor(item);

        return (
          <Pressable
            accessibilityRole="button"
            key={item.id}
            onPress={() => onOpenFilter(filter)}
            style={({ pressed }) => [
              styles.overviewCell,
              pressed ? styles.pressed : null
            ]}
          >
            <Text style={styles.metricValue}>{item.value}</Text>
            <Text numberOfLines={1} style={styles.metricLabel}>
              {item.label}
            </Text>
            <Text numberOfLines={2} style={styles.metaText}>
              {item.detail}
            </Text>
            <Text style={styles.overviewActionText}>查看</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function PriorityCard({
  onOpenContact,
  priority
}: {
  onOpenContact: () => void;
  priority: DashboardPriorityView;
}) {
  return (
    <DataCard detail={`${priority.organization} · ${priority.dueLabel}`} title="优先推进">
      <View style={styles.listStack}>
        <View style={styles.rowTop}>
          <View style={styles.flexText}>
            <Text style={styles.itemTitle}>{priority.title}</Text>
            <Text style={styles.bodyText}>{priority.detail}</Text>
          </View>
          <View style={styles.scorePill}>
            <Text style={styles.scorePillText}>{priority.scoreLabel}</Text>
          </View>
        </View>
        <View style={styles.callout}>
          <Ionicons color={colors.accent} name="checkmark-circle-outline" size={18} />
          <Text style={styles.calloutText}>{priority.action}</Text>
        </View>
        {priority.contactId ? (
          <Pressable
            accessibilityRole="button"
            onPress={onOpenContact}
            style={({ pressed }) => [
              styles.contactAction,
              pressed ? styles.pressed : null
            ]}
          >
            <View style={styles.flexText}>
              <Text style={styles.itemTitle}>{priority.contactName}</Text>
              <Text style={styles.metaText}>查看联系人背景</Text>
            </View>
            <Ionicons color={colors.text3} name="chevron-forward" size={18} />
          </Pressable>
        ) : null}
      </View>
    </DataCard>
  );
}

function GapCard({ gaps }: { gaps: DashboardGapView[] }) {
  return (
    <DataCard detail={`${gaps.length} 个需要补齐的方向`} title="覆盖缺口">
      <View style={styles.listStack}>
        {gaps.map((gap) => (
          <View key={gap.id} style={styles.listRow}>
            <View style={styles.rowTop}>
              <Text numberOfLines={1} style={styles.itemTitle}>
                {gap.label}
              </Text>
              <Text style={styles.severityBadge}>{gap.severityLabel}</Text>
            </View>
            <Text style={styles.metaText}>{gap.detail}</Text>
            <Text style={styles.bodyText}>{gap.action}</Text>
          </View>
        ))}
      </View>
    </DataCard>
  );
}

function IndustryCard({
  industries
}: {
  industries: DashboardIndustryView[];
}) {
  return (
    <DataCard detail="看哪些圈层已经够厚，哪些还薄" title="行业分布">
      <View style={styles.listStack}>
        {industries.map((industry) => (
          <View key={industry.id} style={styles.barRow}>
            <View style={styles.rowTop}>
              <Text numberOfLines={1} style={styles.itemTitle}>
                {industry.label}
              </Text>
              <Text style={styles.metaText}>{industry.countLabel}</Text>
            </View>
            <View style={styles.barTrack}>
              <View
                style={[
                  styles.barFill,
                  { width: `${Math.max(4, Math.min(100, industry.percentage))}%` }
                ]}
              />
            </View>
            {industry.organizations ? (
              <Text numberOfLines={1} style={styles.metaText}>
                {industry.organizations}
              </Text>
            ) : null}
          </View>
        ))}
      </View>
    </DataCard>
  );
}

function ValueTypeCard({
  valueTypes
}: {
  valueTypes: DashboardValueTypeView[];
}) {
  return (
    <DataCard detail="每段关系到底能帮什么忙" title="价值类型">
      <View style={styles.chipWrap}>
        {valueTypes.map((item) => (
          <View key={item.id} style={styles.chip}>
            <Text style={styles.chipText}>
              {item.label} · {item.countLabel}
            </Text>
          </View>
        ))}
      </View>
    </DataCard>
  );
}

function ActivityCard({
  activities
}: {
  activities: DashboardActivityView[];
}) {
  return (
    <DataCard detail="最近进入系统的关系变化" title="最近动态">
      <View style={styles.listStack}>
        {activities.map((activity) => (
          <View key={activity.id} style={styles.listRow}>
            <View style={styles.rowTop}>
              <Text numberOfLines={1} style={styles.itemTitle}>
                {activity.label}
              </Text>
              <Text style={styles.metaText}>{activity.time}</Text>
            </View>
            <Text style={styles.metaText}>
              {activity.typeLabel} · {activity.detail}
            </Text>
          </View>
        ))}
      </View>
    </DataCard>
  );
}

const styles = StyleSheet.create({
  actionCopy: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0
  },
  actionDetail: {
    color: colors.text3,
    fontSize: typography.caption,
    lineHeight: 17
  },
  actionList: {
    marginHorizontal: -spacing.md
  },
  actionAvatar: {
    alignItems: "center",
    borderColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 2,
    height: 48,
    justifyContent: "center",
    overflow: "hidden",
    width: 48
  },
  actionAvatarImage: {
    height: "100%",
    width: "100%"
  },
  actionAvatarText: {
    fontSize: typography.section,
    fontWeight: "800",
    lineHeight: 22
  },
  actionLeading: {
    height: 52,
    position: "relative",
    width: 52
  },
  actionRank: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    height: 30,
    justifyContent: "center",
    width: 30
  },
  actionRankText: {
    color: colors.onAccent,
    fontSize: typography.small,
    fontWeight: "800",
    lineHeight: 18
  },
  actionRankBadge: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 2,
    bottom: -1,
    height: 23,
    justifyContent: "center",
    position: "absolute",
    right: -1,
    width: 23
  },
  actionRankBadgeText: {
    color: colors.onAccent,
    fontSize: 10,
    fontWeight: "900",
    lineHeight: 13
  },
  actionRowPressed: {
    backgroundColor: colors.surface2
  },
  actionStatus: {
    color: colors.text3,
    fontSize: typography.caption,
    fontWeight: "700",
    lineHeight: 17
  },
  actionTitle: {
    color: colors.ink,
    flex: 1,
    fontSize: typography.body,
    fontWeight: "700",
    lineHeight: 21
  },
  actionTitleRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.sm
  },
  analysisCount: {
    color: colors.accent,
    fontSize: typography.small,
    fontWeight: "700",
    lineHeight: 19
  },
  analysisDiagnosisCard: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 86,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md
  },
  analysisDiagnosisIcon: {
    alignItems: "center",
    backgroundColor: colors.accentSofter,
    borderRadius: radius.pill,
    height: 42,
    justifyContent: "center",
    width: 42
  },
  analysisDiagnosisLabel: {
    color: colors.text3,
    fontSize: typography.caption,
    fontWeight: "700",
    lineHeight: 16,
    textAlign: "right"
  },
  analysisDiagnosisRefresh: {
    alignItems: "center",
    height: 36,
    justifyContent: "center",
    width: 32
  },
  analysisDiagnosisScore: {
    alignItems: "flex-end",
    gap: 2,
    minWidth: 48
  },
  analysisDiagnosisText: {
    color: colors.text,
    flex: 1,
    fontSize: typography.small,
    lineHeight: 20,
    minWidth: 0
  },
  analysisDiagnosisValue: {
    color: colors.accent,
    fontSize: typography.title,
    fontWeight: "800",
    lineHeight: 25,
    maxWidth: 58,
    textAlign: "right"
  },
  analysisDimensionDetail: {
    color: colors.text3,
    fontSize: 10,
    lineHeight: 14,
    textAlign: "center"
  },
  analysisDimensionDivider: {
    borderLeftColor: colors.border,
    borderLeftWidth: StyleSheet.hairlineWidth
  },
  analysisDimensionGrid: {
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    paddingTop: spacing.md
  },
  analysisDimensionHeading: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs,
    justifyContent: "center",
    minWidth: 0
  },
  analysisDimensionIcon: {
    alignItems: "center",
    borderRadius: radius.pill,
    height: 26,
    justifyContent: "center",
    width: 26
  },
  analysisDimensionItem: {
    alignItems: "center",
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
    paddingHorizontal: spacing.sm
  },
  analysisDimensionLabel: {
    color: colors.text3,
    flexShrink: 1,
    fontSize: typography.caption,
    fontWeight: "700",
    lineHeight: 16
  },
  analysisDimensionValue: {
    color: colors.ink,
    fontSize: typography.small,
    fontWeight: "800",
    lineHeight: 18,
    textAlign: "center"
  },
  analysisEmptyBlock: {
    alignItems: "center",
    backgroundColor: colors.surface2,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 64,
    paddingHorizontal: spacing.md
  },
  analysisEmptyText: {
    color: colors.text3,
    flex: 1,
    fontSize: typography.small,
    lineHeight: 19
  },
  analysisInlineAction: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs,
    minHeight: 40,
    paddingLeft: spacing.sm
  },
  analysisInlineActionText: {
    color: colors.text3,
    fontSize: typography.caption,
    fontWeight: "700",
    lineHeight: 16
  },
  analysisPrimaryButton: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: spacing.lg
  },
  analysisPrimaryButtonText: {
    color: colors.onAccent,
    fontSize: typography.body,
    fontWeight: "800",
    lineHeight: 21
  },
  analysisSectionDetail: {
    color: colors.text3,
    fontSize: typography.caption,
    lineHeight: 17
  },
  analysisSectionHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between"
  },
  analysisSectionTitle: {
    color: colors.ink,
    fontSize: typography.section,
    fontWeight: "800",
    lineHeight: 23
  },
  analysisSectionTitleBlock: {
    flex: 1,
    gap: spacing.xs
  },
  analysisSegment: {
    alignItems: "center",
    borderRadius: radius.control,
    flex: 1,
    justifyContent: "center",
    minHeight: 40,
    paddingHorizontal: spacing.md
  },
  analysisSegmentedControl: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.xs,
    minHeight: 50,
    padding: 4
  },
  analysisSegmentSelected: {
    backgroundColor: colors.accent
  },
  analysisSegmentText: {
    color: colors.text3,
    fontSize: typography.small,
    fontWeight: "700",
    lineHeight: 18
  },
  analysisSegmentTextSelected: {
    color: colors.onAccent
  },
  analysisSurface: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: 1,
    gap: spacing.lg,
    padding: spacing.lg
  },
  structureBreakdownHint: {
    color: colors.text4,
    fontSize: 10,
    lineHeight: 14,
    maxWidth: 126,
    textAlign: "right"
  },
  structureDetailButton: {
    alignItems: "center",
    alignSelf: "flex-end",
    flexDirection: "row",
    gap: spacing.xs,
    minHeight: 38,
    paddingHorizontal: spacing.xs
  },
  structureDetailButtonText: {
    color: colors.accent,
    fontSize: typography.small,
    fontWeight: "800",
    lineHeight: 18
  },
  structureDimensionButton: {
    alignItems: "center",
    borderColor: "transparent",
    borderRadius: radius.control,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    gap: 3,
    justifyContent: "center",
    minHeight: 42,
    minWidth: 0,
    paddingHorizontal: spacing.xs
  },
  structureDimensionButtonSelected: {
    backgroundColor: colors.accentSofter,
    borderColor: colors.accent
  },
  structureDimensionControl: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: 1,
    flexDirection: "row",
    gap: 2,
    padding: 4
  },
  structureDimensionText: {
    color: colors.text3,
    flexShrink: 1,
    fontSize: typography.caption,
    fontWeight: "700",
    lineHeight: 16
  },
  structureDimensionTextSelected: {
    color: colors.accent
  },
  activityDetail: {
    fontSize: 10,
    fontWeight: "700",
    lineHeight: 14,
    textAlign: "center"
  },
  activityGrid: {
    flexDirection: "row"
  },
  activityIcon: {
    alignItems: "center",
    borderRadius: radius.pill,
    height: 34,
    justifyContent: "center",
    width: 34
  },
  activityItem: {
    alignItems: "center",
    flex: 1,
    gap: 2,
    minWidth: 0,
    paddingHorizontal: spacing.sm
  },
  activityItemDivider: {
    borderLeftColor: colors.border,
    borderLeftWidth: StyleSheet.hairlineWidth
  },
  activityLabel: {
    color: colors.text3,
    fontSize: typography.caption,
    lineHeight: 16,
    textAlign: "center"
  },
  activityTitleRow: {
    alignItems: "baseline",
    flexDirection: "row",
    gap: spacing.sm
  },
  activityValue: {
    color: colors.ink,
    fontSize: typography.body,
    fontWeight: "800",
    lineHeight: 21
  },
  coverageBody: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md
  },
  coverageCenter: {
    alignItems: "center",
    backgroundColor: colors.ink,
    borderColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 3,
    height: 66,
    justifyContent: "center",
    width: 66
  },
  coverageDiagnosis: {
    color: colors.text2,
    fontSize: typography.small,
    lineHeight: 20
  },
  coverageDot: {
    borderColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 2,
    height: 12,
    position: "absolute",
    width: 12
  },
  coverageDotAmber: {
    backgroundColor: colors.amber,
    bottom: 18,
    left: 16
  },
  coverageDotLive: {
    backgroundColor: colors.live,
    right: 20,
    top: 12
  },
  coverageDotSky: {
    backgroundColor: colors.sky,
    left: 8,
    top: 38
  },
  coverageOrbit: {
    alignItems: "center",
    aspectRatio: 1,
    flexBasis: 136,
    justifyContent: "center",
    maxWidth: 142,
    minWidth: 124,
    position: "relative"
  },
  coverageRing: {
    borderColor: colors.border2,
    borderRadius: radius.pill,
    borderWidth: 1,
    position: "absolute"
  },
  coverageRingInner: {
    height: 82,
    width: 82
  },
  coverageRingMiddle: {
    height: 108,
    width: 108
  },
  coverageRingOuter: {
    height: 134,
    width: 134
  },
  coverageScore: {
    color: colors.onAccent,
    fontSize: typography.title,
    fontWeight: "800",
    lineHeight: 24
  },
  coverageScoreLabel: {
    color: colors.text4,
    fontSize: 10,
    fontWeight: "700",
    lineHeight: 13
  },
  coverageSignalIcon: {
    alignItems: "center",
    borderRadius: radius.pill,
    height: 30,
    justifyContent: "center",
    width: 30
  },
  coverageSignalLabel: {
    color: colors.text,
    flex: 1,
    fontSize: typography.small,
    fontWeight: "700",
    lineHeight: 19
  },
  coverageSignalRow: {
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 43
  },
  coverageSignals: {
    flex: 1,
    minWidth: 0
  },
  coverageSignalValue: {
    fontSize: typography.body,
    fontWeight: "800",
    lineHeight: 21,
    minWidth: 22,
    textAlign: "right"
  },
  goalBar: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border2,
    borderRadius: radius.control,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 68,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md
  },
  goalBarCopy: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0
  },
  goalBarLabel: {
    color: colors.text3,
    fontSize: typography.caption,
    fontWeight: "700",
    lineHeight: 16
  },
  goalBarValue: {
    color: colors.ink,
    fontSize: typography.body,
    fontWeight: "700",
    lineHeight: 21
  },
  goalEditButton: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    width: 44
  },
  healthGrid: {
    alignItems: "stretch",
    flexDirection: "row"
  },
  healthIcon: {
    alignItems: "center",
    borderRadius: radius.pill,
    height: 30,
    justifyContent: "center",
    width: 30
  },
  healthItem: {
    alignItems: "center",
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
    paddingHorizontal: spacing.sm
  },
  healthItemDivider: {
    borderLeftColor: colors.border2,
    borderLeftWidth: StyleSheet.hairlineWidth
  },
  healthStatus: {
    fontSize: typography.caption,
    fontWeight: "700",
    lineHeight: 16
  },
  healthValue: {
    color: colors.ink,
    fontSize: typography.small,
    fontWeight: "800",
    lineHeight: 18
  },
  recommendedActionRow: {
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 78,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md
  },
  recommendedActionRowLast: {
    borderBottomWidth: 0
  },
  structureInsight: {
    alignItems: "center",
    backgroundColor: colors.surface2,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 66,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  structureInsightCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0
  },
  structureInsightIcon: {
    alignItems: "center",
    backgroundColor: colors.amberSoft,
    borderRadius: radius.pill,
    height: 34,
    justifyContent: "center",
    width: 34
  },
  structureInsightLabel: {
    color: colors.text3,
    fontSize: typography.caption,
    fontWeight: "700",
    lineHeight: 16
  },
  structureInsightText: {
    color: colors.text,
    fontSize: typography.caption,
    lineHeight: 17
  },
  refreshAnalysisButton: {
    alignItems: "center",
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: radius.control,
    borderWidth: 1,
    height: 40,
    justifyContent: "center",
    width: 40
  },
  barFill: {
    backgroundColor: colors.live,
    borderRadius: radius.pill,
    height: "100%"
  },
  barRow: {
    gap: spacing.sm
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
  chip: {
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  chipText: {
    color: colors.text2,
    fontSize: typography.small,
    fontWeight: "600"
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  contactAction: {
    alignItems: "center",
    borderColor: colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
    paddingTop: spacing.md
  },
  dot: {
    borderColor: colors.bg,
    borderRadius: 999,
    borderWidth: 2,
    height: 14,
    position: "absolute",
    width: 14
  },
  dotAccent: {
    backgroundColor: colors.accent,
    right: 48,
    top: 96
  },
  dotAmber: {
    backgroundColor: colors.amber,
    bottom: 50,
    left: 54
  },
  dotLive: {
    backgroundColor: colors.live,
    right: 70,
    top: 42
  },
  dotSky: {
    backgroundColor: colors.sky,
    left: 62,
    top: 74
  },
  disabled: {
    opacity: 0.58
  },
  errorText: {
    color: colors.rose,
    fontSize: typography.small,
    lineHeight: 20
  },
  flexText: {
    flex: 1,
    gap: spacing.xs
  },
  goalInput: {
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.text,
    fontSize: typography.body,
    minHeight: 92,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    textAlignVertical: "top"
  },
  itemTitle: {
    color: colors.ink,
    flex: 1,
    fontSize: typography.body,
    fontWeight: "600",
    lineHeight: 21
  },
  listRow: {
    borderColor: colors.border,
    borderTopWidth: 1,
    gap: spacing.xs,
    paddingTop: spacing.md
  },
  listStack: {
    gap: spacing.md
  },
  mapCenter: {
    alignItems: "center",
    backgroundColor: colors.ink,
    borderColor: colors.bg,
    borderRadius: 48,
    borderWidth: 3,
    height: 96,
    justifyContent: "center",
    width: 96
  },
  mapLabel: {
    color: colors.text4,
    fontSize: typography.caption,
    fontWeight: "700"
  },
  mapSection: {
    alignItems: "center",
    gap: spacing.md
  },
  mapValue: {
    color: colors.bg,
    fontSize: 30,
    fontWeight: "700",
    lineHeight: 34,
    maxWidth: 76
  },
  metaText: {
    color: colors.text3,
    fontSize: typography.small,
    lineHeight: 19
  },
  metricLabel: {
    color: colors.text2,
    fontSize: typography.small,
    fontWeight: "700"
  },
  metricValue: {
    color: colors.ink,
    fontSize: 26,
    fontWeight: "700",
    lineHeight: 30
  },
  orbitStage: {
    alignItems: "center",
    aspectRatio: 1,
    backgroundColor: colors.bgSunken,
    borderColor: colors.border,
    borderRadius: 118,
    borderWidth: 1,
    height: 236,
    justifyContent: "center",
    overflow: "hidden"
  },
  overviewCell: {
    borderColor: colors.border,
    borderTopWidth: 1,
    flexBasis: "46%",
    flexGrow: 1,
    gap: spacing.xs,
    minWidth: 132,
    paddingTop: spacing.md
  },
  overviewActionText: {
    color: colors.accent,
    fontSize: typography.caption,
    fontWeight: "700"
  },
  overviewGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md
  },
  pressed: {
    opacity: 0.72
  },
  ring: {
    borderColor: colors.borderStrong,
    borderRadius: 999,
    borderWidth: 1,
    position: "absolute"
  },
  ringInner: {
    height: 100,
    width: 100
  },
  ringLegend: {
    alignSelf: "stretch",
    gap: spacing.sm
  },
  ringMiddle: {
    height: 156,
    width: 156
  },
  ringOuter: {
    height: 214,
    width: 214
  },
  ringRow: {
    alignItems: "center",
    borderColor: colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    paddingTop: spacing.sm
  },
  rowTop: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between"
  },
  actionBriefActions: {
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: spacing.sm,
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md
  },
  actionBriefClose: {
    alignItems: "center",
    backgroundColor: colors.surface3,
    borderRadius: radius.pill,
    height: 36,
    justifyContent: "center",
    width: 36
  },
  actionBriefContent: {
    gap: spacing.xl,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.lg
  },
  actionBriefEvidenceRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 24
  },
  actionBriefHandle: {
    alignSelf: "center",
    backgroundColor: colors.borderStrong,
    borderRadius: radius.pill,
    height: 4,
    marginTop: spacing.sm,
    width: 38
  },
  actionBriefHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.md,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md
  },
  actionBriefHeaderCopy: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0
  },
  actionBriefJudgment: {
    color: colors.ink,
    fontSize: typography.body,
    fontWeight: "600",
    lineHeight: 23
  },
  actionBriefList: {
    gap: spacing.md
  },
  actionBriefListText: {
    color: colors.text2,
    flex: 1,
    fontSize: typography.small,
    lineHeight: 20,
    minWidth: 0
  },
  actionBriefPrimaryButton: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: radius.control,
    flex: 1,
    flexDirection: "row",
    gap: spacing.xs,
    justifyContent: "center",
    minHeight: 48,
    minWidth: 0,
    paddingHorizontal: spacing.md
  },
  actionBriefPrimaryText: {
    color: colors.onAccent,
    fontSize: typography.small,
    fontWeight: "700",
    lineHeight: 18
  },
  actionBriefRoot: {
    flex: 1,
    justifyContent: "flex-end"
  },
  actionBriefScrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(22,22,26,0.28)"
  },
  actionBriefSecondaryButton: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border2,
    borderRadius: radius.control,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 48,
    minWidth: 0,
    paddingHorizontal: spacing.md
  },
  actionBriefSecondaryText: {
    color: colors.ink,
    fontSize: typography.small,
    fontWeight: "700",
    lineHeight: 18
  },
  actionBriefSection: {
    gap: spacing.sm
  },
  actionBriefSectionLabel: {
    color: colors.text3,
    fontSize: typography.caption,
    fontWeight: "700",
    lineHeight: 16
  },
  actionBriefSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    maxHeight: "88%",
    overflow: "hidden"
  },
  actionBriefStepIndex: {
    alignItems: "center",
    backgroundColor: colors.accentSofter,
    borderRadius: radius.pill,
    height: 22,
    justifyContent: "center",
    width: 22
  },
  actionBriefStepIndexText: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 14
  },
  actionBriefStepRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 24
  },
  actionBriefTitle: {
    color: colors.ink,
    fontSize: typography.title,
    fontWeight: "800",
    lineHeight: 26
  },
  actionBriefType: {
    color: colors.accent,
    fontSize: typography.caption,
    fontWeight: "700",
    lineHeight: 16
  },
  saveGoalButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    flexDirection: "row",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  saveGoalButtonText: {
    color: colors.onAccent,
    fontSize: typography.small,
    fontWeight: "700",
    lineHeight: 18
  },
  recomputeButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    flexDirection: "row",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  recomputeButtonText: {
    color: colors.onAccent,
    fontSize: typography.small,
    fontWeight: "700",
    lineHeight: 18
  },
  recomputeStatus: {
    color: colors.live,
    fontSize: typography.small,
    fontWeight: "700",
    lineHeight: 20
  },
  scoreBadge: {
    alignItems: "center",
    backgroundColor: colors.accentSofter,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  scorePill: {
    backgroundColor: colors.amberSoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  scorePillText: {
    color: colors.amber,
    fontSize: typography.small,
    fontWeight: "700"
  },
  scoreRow: {
    gap: spacing.md
  },
  scoreText: {
    color: colors.accent,
    fontSize: typography.small,
    fontWeight: "700"
  },
  severityBadge: {
    backgroundColor: colors.roseSoft,
    borderRadius: radius.pill,
    color: colors.rose,
    fontSize: typography.caption,
    fontWeight: "700",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs
  },
  successText: {
    color: colors.live,
    fontSize: typography.small,
    fontWeight: "700",
    lineHeight: 20
  }
});
