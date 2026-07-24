import { Ionicons } from "@expo/vector-icons";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { contactDetailPath } from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { DataCard } from "../../components/DataCard";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { colors, radius, spacing, typography } from "../../design/tokens";
import { useApiResource } from "../../hooks/useApiResource";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import {
  contactDetailHeroToView,
  contactDetailToSummary,
  type ContactAvatarTone,
  type ContactDetailStatusActionView,
  type ContactDetailSummary
} from "../../view-models/contacts";

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "contact";
  }

  return value ?? "contact";
}

export function ContactDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const contactId = firstParam(id);
  const client = useOrbitApiClient();
  const state = useApiResource<unknown>(
    contactDetailPath(contactId),
    () => false
  );
  const [statusPending, setStatusPending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function updateStatus(action: ContactDetailStatusActionView) {
    setStatusPending(true);
    setFeedback(null);
    setActionError(null);

    try {
      const result = await client.patch<unknown>(contactDetailPath(contactId), {
        body: { status: action.nextStatus }
      });

      if (result.success) {
        setFeedback(action.successMessage);
        state.refresh();
      } else {
        setActionError("当前状态暂时改不了。请刷新后再试一次。");
      }
    } catch {
      setActionError("当前状态暂时改不了。请刷新后再试一次。");
    } finally {
      setStatusPending(false);
    }
  }

  return (
    <AppScreen
      eyebrow="联系人详情"
      refreshControl={
        <RefreshControl
          onRefresh={state.refresh}
          refreshing={state.refreshing}
          tintColor={colors.accent}
        />
      }
      title="联系人"
    >
      {state.kind === "loading" ? <LoadingState /> : null}
      {state.kind === "offline" ? (
        <ErrorState message={state.error.message} title="服务器连不上" />
      ) : null}
      {state.kind === "failure" ? (
        <ErrorState message={state.error.message} />
      ) : null}
      {feedback ? <Text style={styles.feedbackText}>{feedback}</Text> : null}
      {actionError ? <Text style={styles.errorText}>{actionError}</Text> : null}
      {state.kind === "success" || state.kind === "empty" ? (
        <ContactDetailCard
          data={state.data}
          onStatusAction={updateStatus}
          statusPending={statusPending}
        />
      ) : null}
    </AppScreen>
  );
}

function ContactDetailCard({
  data,
  onStatusAction,
  statusPending
}: {
  data: unknown;
  onStatusAction: (action: ContactDetailStatusActionView) => void;
  statusPending: boolean;
}) {
  const router = useRouter();
  const contact = contactDetailToSummary(data);
  const hero = contactDetailHeroToView(contact);
  const toneStyle = avatarToneStyles[hero.avatar.tone];
  const publicTags = [
    ...contact.publicOffering,
    ...contact.publicSeeking,
    ...contact.publicTopics
  ];
  const inboxHref =
    `/inbox?contactId=${encodeURIComponent(contact.id)}&participantName=${encodeURIComponent(
      contact.name
    )}&organization=${encodeURIComponent(contact.organization)}` as Href;

  return (
    <>
      <View style={styles.contactHero}>
        <View style={styles.contactHeroHeader}>
          <View
            style={[
              styles.heroAvatar,
              { backgroundColor: toneStyle.backgroundColor }
            ]}
          >
            <Text style={[styles.heroAvatarText, { color: toneStyle.color }]}>
              {hero.avatar.initial}
            </Text>
          </View>
          <View style={styles.contactHeroTitleBlock}>
            <Text numberOfLines={2} style={styles.contactHeroName}>
              {hero.name}
            </Text>
            <Text numberOfLines={2} style={styles.contactHeroDetail}>
              {hero.detailLine}
            </Text>
          </View>
        </View>
        <Text style={styles.contactHeroRelationship}>{hero.relationship}</Text>
        <View style={styles.heroMetaRow}>
          <Text style={styles.statusPill}>{hero.status}</Text>
          {hero.valueScoreLabel ? (
            <Text style={styles.scorePill}>{hero.valueScoreLabel}</Text>
          ) : null}
        </View>
        {contact.valueLabels.length > 0 ? (
          <View style={styles.tagsRow}>
            {contact.valueLabels.map((label) => (
              <Text key={label} style={styles.tagText}>
                {label}
              </Text>
            ))}
          </View>
        ) : null}
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push(inboxHref)}
          style={({ pressed }) => [
            styles.primaryHeroButton,
            pressed ? styles.pressed : null
          ]}
        >
          <Ionicons color={colors.onAccent} name="mail-outline" size={17} />
          <Text style={styles.primaryHeroButtonText}>起草跟进</Text>
        </Pressable>
      </View>
      {contact.publicBio || publicTags.length > 0 || contact.publicPrompts.length > 0 ? (
        <DataCard detail="别人会先看到这段介绍" title="公开资料">
          {contact.publicBio ? (
            <Text style={styles.bodyText}>{contact.publicBio}</Text>
          ) : null}
          {publicTags.length > 0 ? <TagList items={publicTags} /> : null}
          {contact.publicPrompts.length > 0 ? (
            <PromptList prompts={contact.publicPrompts} />
          ) : null}
        </DataCard>
      ) : null}
      {contact.sourceLabel || contact.evidenceExcerpts.length > 0 ? (
        <DataCard detail={contact.sourceLabel} title="来源证据">
          <EvidenceList contact={contact} />
        </DataCard>
      ) : null}
      <DataCard detail={contact.location} title="当前状态">
        <Text style={styles.bodyText}>{contact.status}</Text>
        {contact.statusAction ? (
          <Pressable
            accessibilityRole="button"
            disabled={statusPending}
            onPress={() => onStatusAction(contact.statusAction!)}
            style={({ pressed }) => [
              styles.statusButton,
              statusPending ? styles.disabled : null,
              pressed ? styles.pressed : null
            ]}
          >
            <Ionicons color={colors.accent} name="swap-horizontal-outline" size={16} />
            <Text style={styles.statusButtonText}>
              {statusPending
                ? contact.statusAction.pendingLabel
                : contact.statusAction.label}
            </Text>
          </Pressable>
        ) : null}
      </DataCard>
      {contact.noteSummaries.length > 0 ? (
        <DataCard detail={contact.lastInteractionAt} title="最近记录">
          {contact.noteSummaries.map((note) => (
            <Text key={note} style={styles.bodyText}>
              {note}
            </Text>
          ))}
        </DataCard>
      ) : null}
      <DataCard detail={contact.lastInteractionAt} title="下一步">
        <Text style={styles.bodyText}>{contact.nextAction}</Text>
      </DataCard>
    </>
  );
}

const avatarToneStyles: Record<
  ContactAvatarTone,
  { backgroundColor: string; color: string }
> = {
  amber: { backgroundColor: colors.amberSoft, color: colors.amber },
  emerald: { backgroundColor: colors.liveSoft, color: colors.live },
  rose: { backgroundColor: colors.roseSoft, color: colors.rose },
  sky: { backgroundColor: colors.skySoft, color: colors.sky },
  violet: { backgroundColor: colors.accentSofter, color: colors.accent }
};

function TagList({ items }: { items: string[] }) {
  return (
    <View style={styles.tagsRow}>
      {items.map((label) => (
        <Text key={label} style={styles.tagText}>
          {label}
        </Text>
      ))}
    </View>
  );
}

function PromptList({ prompts }: { prompts: string[] }) {
  return (
    <View style={styles.promptStack}>
      {prompts.map((prompt) => (
        <Text key={prompt} style={styles.promptText}>
          {prompt}
        </Text>
      ))}
    </View>
  );
}

function EvidenceList({ contact }: { contact: ContactDetailSummary }) {
  if (contact.evidenceExcerpts.length === 0) {
    return <Text style={styles.bodyText}>这条关系有来源记录。</Text>;
  }

  return (
    <View style={styles.promptStack}>
      {contact.evidenceExcerpts.map((excerpt) => (
        <Text key={excerpt} style={styles.bodyText}>
          {excerpt}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bodyText: {
    color: colors.text,
    fontSize: typography.small,
    lineHeight: 20
  },
  contactHero: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg
  },
  contactHeroDetail: {
    color: colors.text3,
    fontSize: typography.small,
    lineHeight: 19
  },
  contactHeroHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md
  },
  contactHeroName: {
    color: colors.ink,
    fontSize: typography.title,
    fontWeight: "800",
    lineHeight: 25
  },
  contactHeroRelationship: {
    color: colors.text,
    fontSize: typography.small,
    lineHeight: 20
  },
  contactHeroTitleBlock: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0
  },
  disabled: {
    opacity: 0.54
  },
  errorText: {
    color: colors.rose,
    fontSize: typography.small,
    lineHeight: 20
  },
  feedbackText: {
    color: colors.live,
    fontSize: typography.small,
    fontWeight: "700",
    lineHeight: 20
  },
  heroAvatar: {
    alignItems: "center",
    borderRadius: radius.pill,
    height: 64,
    justifyContent: "center",
    width: 64
  },
  heroAvatarText: {
    fontSize: 28,
    fontWeight: "800",
    lineHeight: 32
  },
  heroMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  pressed: {
    opacity: 0.72
  },
  primaryHeroButton: {
    alignItems: "center",
    alignSelf: "stretch",
    backgroundColor: colors.accent,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.xs,
    justifyContent: "center",
    minHeight: 46,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  primaryHeroButtonText: {
    color: colors.onAccent,
    fontSize: typography.small,
    fontWeight: "700",
    lineHeight: 18
  },
  promptStack: {
    gap: 8
  },
  promptText: {
    backgroundColor: colors.liveSoft,
    borderRadius: 10,
    color: colors.live,
    fontSize: typography.caption,
    fontWeight: "700",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6
  },
  statusButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderColor: colors.accent,
    borderRadius: radius.control,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  statusButtonText: {
    color: colors.accent,
    fontSize: typography.caption,
    fontWeight: "700",
    lineHeight: 16
  },
  scorePill: {
    backgroundColor: colors.accentSofter,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    color: colors.accent,
    fontSize: typography.caption,
    fontWeight: "700",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  statusPill: {
    backgroundColor: colors.liveSoft,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    color: colors.live,
    fontSize: typography.caption,
    fontWeight: "700",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  tagText: {
    backgroundColor: colors.accentSofter,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    color: colors.accent,
    fontSize: typography.caption,
    fontWeight: "700",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 5
  }
});
