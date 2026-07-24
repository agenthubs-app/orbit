import { type Href, useRouter } from "expo-router";
import { RefreshControl, StyleSheet, Text, View } from "react-native";
import { ORBIT_API_ENDPOINTS } from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { DataCard } from "../../components/DataCard";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { SectionHeader } from "../../components/SectionHeader";
import { colors, spacing, typography } from "../../design/tokens";
import { useApiResource } from "../../hooks/useApiResource";
import { profileToSummary } from "../../view-models/profile";

export function ProfileScreen() {
  const router = useRouter();
  const state = useApiResource<unknown>(ORBIT_API_ENDPOINTS.profile, () => false);

  return (
    <AppScreen
      eyebrow="通用档案"
      refreshControl={
        <RefreshControl
          onRefresh={state.refresh}
          refreshing={state.refreshing}
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
        />
      ) : null}
    </AppScreen>
  );
}

function ProfileCard({
  data,
  onOpenAccount
}: {
  data: unknown;
  onOpenAccount: () => void;
}) {
  const profile = profileToSummary(data);

  return (
    <>
      <DataCard
        detail={[profile.organization, profile.role, profile.timezone]
          .filter(Boolean)
          .join(" · ")}
        title={profile.displayName}
      >
        <Text style={styles.headlineText}>{profile.headline}</Text>
        {profile.industry ? (
          <Text style={styles.metaText}>{profile.industry}</Text>
        ) : null}
      </DataCard>
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
      <ProfileTagSection items={profile.offering} title="我能提供" />
      <ProfileTagSection items={profile.seeking} title="我想寻求" />
      <ProfileTagSection items={profile.topics} title="想聊的话题" />
      {profile.relationshipGoal ? (
        <DataCard detail={profile.relationshipGoal} title="关系目标" />
      ) : null}
    </>
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
  headlineText: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: "600",
    lineHeight: 22
  },
  metaText: {
    color: colors.accent,
    fontSize: typography.caption,
    fontWeight: "700",
    lineHeight: 16
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
