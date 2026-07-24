import { type Href, useRouter } from "expo-router";
import { RefreshControl, StyleSheet, Text, View } from "react-native";
import { ORBIT_API_ENDPOINTS } from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { DataCard } from "../../components/DataCard";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { SectionHeader } from "../../components/SectionHeader";
import { colors, radius, spacing, typography } from "../../design/tokens";
import {
  type ApiResourceState,
  useApiResource
} from "../../hooks/useApiResource";
import {
  profileBusinessCard,
  profileToSummary,
  profileUpdateSuggestionsToView,
  type ProfileBusinessCardTagGroup,
  type ProfileSummary
} from "../../view-models/profile";

export function ProfileScreen() {
  const router = useRouter();
  const state = useApiResource<unknown>(ORBIT_API_ENDPOINTS.profile, () => false);
  const suggestionsState = useApiResource<unknown>(
    ORBIT_API_ENDPOINTS.profileUpdateSuggestions,
    (data) => profileUpdateSuggestionsToView(data).suggestions.length === 0
  );

  return (
    <AppScreen
      eyebrow="通用档案"
      refreshControl={
        <RefreshControl
          onRefresh={() => {
            state.refresh();
            suggestionsState.refresh();
          }}
          refreshing={state.refreshing || suggestionsState.refreshing}
          tintColor={colors.accent}
        />
      }
      title="个人资料"
    >
      {state.kind === "loading" ? <LoadingState /> : null}
      {state.kind === "offline" ? (
        <ErrorState message={state.error.message} title="服务器连不上" />
      ) : null}
      {state.kind === "failure" ? (
        <ErrorState message={state.error.message} />
      ) : null}
      {state.kind === "success" || state.kind === "empty" ? (
        <ProfileCard
          data={state.data}
          onOpenAccount={() => router.push("/account" as Href)}
          suggestionsState={suggestionsState}
        />
      ) : null}
    </AppScreen>
  );
}

function ProfileCard({
  data,
  onOpenAccount,
  suggestionsState
}: {
  data: unknown;
  onOpenAccount: () => void;
  suggestionsState: ApiResourceState<unknown>;
}) {
  const profile = profileToSummary(data);

  return (
    <>
      <OrbitBusinessCard profile={profile} />
      {profile.bio ? (
        <DataCard detail="别人会先看到这段介绍" title="一句话简介">
          <Text style={styles.bodyText}>{profile.bio}</Text>
        </DataCard>
      ) : null}
      <DataCard
        detail="登录状态、工作区、身份"
        onPress={onOpenAccount}
        title="账号与工作区"
      >
        <Text style={styles.bodyText}>
          确认别人看到的是你本人，以及这个工作区要优先连接哪些资源。
        </Text>
      </DataCard>
      <ProfileUpdateSuggestionsCard state={suggestionsState} />
      <ProfileTagSection items={profile.offering} title="我能提供" />
      <ProfileTagSection items={profile.seeking} title="我想寻求" />
      <ProfileTagSection items={profile.topics} title="想聊的话题" />
      {profile.relationshipGoal ? (
        <DataCard detail={profile.relationshipGoal} title="关系目标" />
      ) : null}
    </>
  );
}

function BusinessCardTagRow({
  group,
  label
}: {
  group: ProfileBusinessCardTagGroup;
  label: string;
}) {
  if (group.values.length === 0) {
    return null;
  }

  return (
    <View style={styles.businessCardTagRow}>
      <Text style={styles.businessCardTagLabel}>{label}</Text>
      <View style={styles.businessCardTags}>
        {group.values.map((value) => (
          <Text
            ellipsizeMode="tail"
            key={value}
            numberOfLines={1}
            style={styles.businessCardTag}
          >
            {value}
          </Text>
        ))}
        {group.overflow > 0 ? (
          <Text style={styles.businessCardOverflow}>+{group.overflow}</Text>
        ) : null}
      </View>
    </View>
  );
}

function OrbitBusinessCard({ profile }: { profile: ProfileSummary }) {
  const card = profileBusinessCard(profile);

  return (
    <View style={styles.businessCard}>
      <View style={styles.businessCardHeader}>
        <View style={styles.businessCardAvatar}>
          <Text style={styles.businessCardInitial}>{card.initial}</Text>
        </View>
        <Text style={styles.businessCardMark}>ORBIT</Text>
      </View>
      <View style={styles.businessCardIdentity}>
        <Text
          ellipsizeMode="tail"
          numberOfLines={1}
          style={styles.businessCardName}
        >
          {card.name}
        </Text>
        {card.headline ? (
          <Text
            ellipsizeMode="tail"
            numberOfLines={2}
            style={styles.businessCardHeadline}
          >
            {card.headline}
          </Text>
        ) : null}
        {card.metaLine ? (
          <Text
            ellipsizeMode="tail"
            numberOfLines={1}
            style={styles.businessCardMeta}
          >
            {card.metaLine}
          </Text>
        ) : null}
      </View>
      {card.offering.values.length > 0 || card.seeking.values.length > 0 ? (
        <View style={styles.businessCardTagStack}>
          <BusinessCardTagRow group={card.offering} label="提供" />
          <BusinessCardTagRow group={card.seeking} label="寻找" />
        </View>
      ) : null}
    </View>
  );
}

function ProfileUpdateSuggestionsCard({
  state
}: {
  state: ApiResourceState<unknown>;
}) {
  if (state.kind !== "success" && state.kind !== "empty") {
    return null;
  }

  const view = profileUpdateSuggestionsToView(state.data);

  if (view.suggestions.length === 0) {
    return null;
  }

  return (
    <DataCard detail={`${view.stateLabel} · ${view.nextAction}`} title="资料更新建议">
      <View style={styles.suggestionsStack}>
        {view.suggestions.map((suggestion) => (
          <View key={suggestion.id} style={styles.suggestionCard}>
            <View style={styles.suggestionHeader}>
              <Text style={styles.suggestionSource}>{suggestion.sourceLabel}</Text>
              <Text style={styles.suggestionStatus}>
                {suggestion.statusLabel} · {suggestion.confidenceLabel}
              </Text>
            </View>
            <Text style={styles.suggestionField}>{suggestion.fieldLabel}</Text>
            <View style={styles.suggestionDiff}>
              <Text style={styles.suggestionLabel}>当前</Text>
              <Text style={styles.suggestionValue}>{suggestion.currentValue}</Text>
              <Text style={styles.suggestionLabel}>建议</Text>
              <Text style={styles.suggestionValueStrong}>
                {suggestion.suggestedValue}
              </Text>
            </View>
            <Text style={styles.bodyText}>{suggestion.rationale}</Text>
            <Text style={styles.evidenceText}>{suggestion.evidenceExcerpt}</Text>
          </View>
        ))}
      </View>
    </DataCard>
  );
}

function ProfileTagSection({
  items,
  title
}: {
  items: string[];
  title: string;
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <View>
      <SectionHeader detail={`${items.length} 项`} title={title} />
      <View style={styles.tagsWrap}>
        {items.map((item) => (
          <Text key={item} style={styles.tagText}>
            {item}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bodyText: {
    color: colors.text,
    fontSize: typography.small,
    lineHeight: 20
  },
  businessCard: {
    backgroundColor: "#17211F",
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.lg,
    overflow: "hidden",
    padding: spacing.xl
  },
  businessCardAvatar: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.10)",
    borderColor: "rgba(255,255,255,0.14)",
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    width: 42
  },
  businessCardHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  businessCardHeadline: {
    color: "rgba(255,255,255,0.78)",
    fontSize: typography.body,
    fontWeight: "600",
    lineHeight: 22
  },
  businessCardIdentity: {
    gap: spacing.xs
  },
  businessCardInitial: {
    color: "#FFFFFF",
    fontSize: typography.body,
    fontWeight: "800",
    lineHeight: 21
  },
  businessCardMark: {
    color: "rgba(255,255,255,0.52)",
    fontSize: typography.caption,
    fontWeight: "800",
    letterSpacing: 1.6,
    lineHeight: 16
  },
  businessCardMeta: {
    color: "rgba(255,255,255,0.52)",
    fontSize: typography.caption,
    lineHeight: 17
  },
  businessCardName: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "800",
    lineHeight: 29
  },
  businessCardOverflow: {
    color: "rgba(255,255,255,0.62)",
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 15
  },
  businessCardTag: {
    backgroundColor: "rgba(255,255,255,0.09)",
    borderRadius: radius.pill,
    color: "rgba(255,255,255,0.84)",
    flexShrink: 1,
    fontSize: 11,
    lineHeight: 15,
    maxWidth: "42%",
    overflow: "hidden",
    paddingHorizontal: 9,
    paddingVertical: 5
  },
  businessCardTagLabel: {
    color: "rgba(255,255,255,0.42)",
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 15,
    width: 28
  },
  businessCardTagRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    minWidth: 0
  },
  businessCardTags: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: spacing.xs,
    minWidth: 0
  },
  businessCardTagStack: {
    borderTopColor: "rgba(255,255,255,0.08)",
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
    paddingTop: spacing.md
  },
  evidenceText: {
    color: colors.text3,
    fontSize: typography.caption,
    lineHeight: 17
  },
  suggestionCard: {
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md
  },
  suggestionDiff: {
    gap: 4
  },
  suggestionField: {
    color: colors.ink,
    fontSize: typography.body,
    fontWeight: "700",
    lineHeight: 20
  },
  suggestionHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between"
  },
  suggestionLabel: {
    color: colors.text4,
    fontSize: typography.caption,
    fontWeight: "700",
    lineHeight: 16
  },
  suggestionSource: {
    color: colors.accent,
    fontSize: typography.caption,
    fontWeight: "800",
    lineHeight: 16
  },
  suggestionsStack: {
    gap: spacing.md
  },
  suggestionStatus: {
    color: colors.text3,
    fontSize: typography.caption,
    fontWeight: "700",
    lineHeight: 16
  },
  suggestionValue: {
    color: colors.text2,
    fontSize: typography.small,
    lineHeight: 19
  },
  suggestionValueStrong: {
    color: colors.text,
    fontSize: typography.small,
    fontWeight: "700",
    lineHeight: 19
  },
  tagsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    paddingHorizontal: spacing.xs,
    paddingTop: spacing.sm
  },
  tagText: {
    backgroundColor: colors.liveSoft,
    borderRadius: 999,
    color: colors.live,
    fontSize: typography.small,
    fontWeight: "700",
    lineHeight: 18,
    overflow: "hidden",
    paddingHorizontal: 12,
    paddingVertical: 7
  }
});
