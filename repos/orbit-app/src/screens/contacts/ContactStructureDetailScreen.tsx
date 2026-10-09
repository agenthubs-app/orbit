import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import {
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View
} from "react-native";
import { localizedApiErrorMessage } from "../../api/client";
import { contactStructureDetailPath } from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { OfflineNotice } from "../../components/OfflineNotice";
import type { NetworkStructureDetailResult } from "../../api/compute/dashboard-distribution-contract";
import { textStyles, radius, spacing, type OrbitColors } from "../../design/tokens";
import { createThemedStyles, useOrbitTheme } from "../../design/theme";
import { useApiResource } from "../../hooks/useApiResource";
import { useLocalDashboard } from "../../hooks/useLocalDashboard";
import {
  contactStructureDetailToView,
  type ContactStructureDetailContactView
} from "../../view-models/contact-structure-detail";
import { contactAvatarFor, type ContactAvatarTone } from "../../view-models/contacts";

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export function ContactStructureDetailScreen() {
  const { colors } = useOrbitTheme();
  const params = useLocalSearchParams<{
    bucketId?: string | string[];
    dimension?: string | string[];
  }>();
  const bucketId = firstParam(params.bucketId);
  const dimension = firstParam(params.dimension);
  /**
   * Sprint 0117 (dashboard D3): the drill-down is computed on the device from
   * its copy of the dashboard graph with the server's own service, so the
   * server read stays inert while the mirror is this platform's source.
   */
  const local = useLocalDashboard();
  const localMode = local.available;
  const state = useApiResource<unknown>(
    contactStructureDetailPath(dimension, bucketId),
    () => false,
    { enabled: !localMode }
  );
  const [localDetail, setLocalDetail] = useState<{ key: string; result: NetworkStructureDetailResult } | null>(null);
  const detailKey = JSON.stringify([dimension, bucketId]);
  const { structureDetail } = local;
  useEffect(() => {
    if (!localMode) return;
    let active = true;
    void structureDetail(dimension, bucketId).then((result) => {
      if (active && result) setLocalDetail({ key: detailKey, result });
    });
    return () => { active = false; };
  }, [bucketId, detailKey, dimension, localMode, structureDetail]);
  const localResult = localMode && localDetail?.key === detailKey ? localDetail.result : null;
  const router = useRouter();

  return (
    <AppScreen
      eyebrow="人脉结构"
      refreshControl={
        <RefreshControl
          onRefresh={localMode ? local.refresh : state.refresh}
          refreshing={localMode ? local.freshness.refreshing : state.refreshing}
          tintColor={colors.accentText}
        />
      }
      title="分组详情"
    >
      {localMode ? (
        <>
          {local.freshness.offline ? <OfflineNotice lastSyncedAt={local.freshness.lastSyncedAt} /> : null}
          {local.freshness.failure ? <ErrorState message={local.freshness.failure} title="服务器连不上" /> : null}
          {!local.freshness.failure && !localResult ? <LoadingState /> : null}
          {localResult && localResult.success === false ? (
            // The text the server's own answer shows (its NOT_FOUND is a 404).
            <ErrorState message={localizedApiErrorMessage({ code: localResult.error.appCode, message: localResult.error.message }, localResult.error.appCode === "NOT_FOUND" ? 404 : 503)} />
          ) : null}
          {localResult && localResult.success ? (
            <ContactStructureDetailContent
              data={localResult.data}
              onOpenContact={(contactId) =>
                router.push(`/contacts/${encodeURIComponent(contactId)}` as Href)
              }
            />
          ) : null}
        </>
      ) : null}
      {!localMode && state.kind === "loading" ? <LoadingState /> : null}
      {!localMode && state.kind === "offline" ? (
        <ErrorState message={state.error.message} title="服务器连不上" />
      ) : null}
      {!localMode && state.kind === "failure" ? <ErrorState message={state.error.message} /> : null}
      {!localMode && (state.kind === "success" || state.kind === "empty") ? (
        <ContactStructureDetailContent
          data={state.data}
          onOpenContact={(contactId) =>
            router.push(`/contacts/${encodeURIComponent(contactId)}` as Href)
          }
        />
      ) : null}
    </AppScreen>
  );
}

function ContactStructureDetailContent({
  data,
  onOpenContact
}: {
  data: unknown;
  onOpenContact: (contactId: string) => void;
}) {
  const { colors, styles } = useStyles();
  const view = contactStructureDetailToView(data);

  return (
    <>
      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <Ionicons color={colors.accentText} name="pie-chart-outline" size={22} />
        </View>
        <View style={styles.heroCopy}>
          <Text style={styles.eyebrow}>{view.dimensionLabel}</Text>
          <Text style={styles.title}>{view.title}</Text>
          <Text style={styles.share}>{view.shareLabel}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>关系质量</Text>
        <View style={styles.qualityList}>
          {view.relationshipQuality.map((item) => (
            <View key={item.id} style={styles.qualityRow}>
              <Text style={styles.qualityLabel}>{item.label}</Text>
              <View style={styles.qualityTrack}>
                <View
                  style={[
                    styles.qualityFill,
                    {
                      backgroundColor: qualityColor(item.color, colors),
                      width: `${Math.max(3, item.percentage)}%` as `${number}%`
                    }
                  ]}
                />
              </View>
              <Text style={styles.qualityCount}>{item.countLabel}</Text>
            </View>
          ))}
        </View>
      </View>

      {view.insight ? (
        <View style={styles.insight}>
          <Ionicons color={colors.macApricotText} name="bulb-outline" size={19} />
          <Text style={styles.insightText}>{view.insight}</Text>
        </View>
      ) : null}

      {view.commonTags.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>常见标签</Text>
          <View style={styles.tags}>
            {view.commonTags.map((tag) => (
              <View key={tag.label} style={styles.tag}>
                <Text style={styles.tagLabel}>{tag.label}</Text>
                <Text style={styles.tagCount}>{tag.countLabel}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.section}>
        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>相关联系人</Text>
          <Text style={styles.sectionCount}>{view.contacts.length} 人</Text>
        </View>
        <View style={styles.contactList}>
          {view.contacts.map((contact) => (
            <ContactRow
              contact={contact}
              key={contact.id}
              onPress={() => onOpenContact(contact.id)}
            />
          ))}
        </View>
      </View>
    </>
  );
}

function ContactRow({
  contact,
  onPress
}: {
  contact: ContactStructureDetailContactView;
  onPress: () => void;
}) {
  const { colors, styles } = useStyles();
  const avatar = contactAvatarFor({ id: contact.id, name: contact.name });

  return (
    <Pressable
      accessibilityLabel={`查看${contact.name}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.contactRow,
        pressed ? styles.pressed : null
      ]}
    >
      <View style={[styles.avatar, avatarToneStyle(avatar.tone, colors)]}>
        <Text style={styles.avatarText}>{avatar.initial}</Text>
      </View>
      <View style={styles.contactCopy}>
        <Text numberOfLines={1} style={styles.contactName}>{contact.name}</Text>
        <Text numberOfLines={1} style={styles.contactMeta}>
          {[contact.organization, contact.role].filter(Boolean).join(" · ")}
        </Text>
      </View>
      <Text style={styles.relationship}>{contact.relationshipLabel}</Text>
      <Ionicons color={colors.ink3Text} name="chevron-forward" size={17} />
    </Pressable>
  );
}

function qualityColor(tone: "amber" | "live" | "sky", colors: OrbitColors): string {
  if (tone === "live") return colors.okText;
  if (tone === "sky") return colors.macBlueText;
  return colors.macApricotText;
}

function avatarToneStyle(tone: ContactAvatarTone, colors: OrbitColors) {
  if (tone === "emerald") return { backgroundColor: colors.macTeal };
  if (tone === "sky") return { backgroundColor: colors.macBlue };
  if (tone === "amber") return { backgroundColor: colors.macApricot };
  if (tone === "rose") return { backgroundColor: colors.macPink };
  return { backgroundColor: colors.macLav };
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  avatar: {
    alignItems: "center",
    borderRadius: 20,
    height: 40,
    justifyContent: "center",
    width: 40
  },
  avatarText: {
    ...textStyles.body,
    color: colors.ink,
    fontWeight: "600"
  },
  contactCopy: {
    flex: 1,
    minWidth: 0
  },
  contactList: { gap: spacing.xs },
  contactMeta: {
    ...textStyles.small,
    color: colors.ink3Text
  },
  contactName: {
    ...textStyles.listTitle,
    color: colors.ink
  },
  contactRow: {
    alignItems: "center",
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 64,
    paddingVertical: spacing.sm
  },
  eyebrow: {
    ...textStyles.caption,
    color: colors.accentText,
    fontWeight: "600"
  },
  hero: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    paddingVertical: spacing.sm
  },
  heroCopy: {
    flex: 1,
    gap: spacing.xxs
  },
  heroIcon: {
    alignItems: "center",
    backgroundColor: colors.accentSoft,
    borderRadius: radius.md,
    height: 44,
    justifyContent: "center",
    width: 44
  },
  insight: {
    alignItems: "flex-start",
    backgroundColor: colors.macApricot,
    borderRadius: radius.xl,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md
  },
  insightText: {
    ...textStyles.small,
    color: colors.ink2,
    flex: 1
  },
  pressed: { opacity: 0.72 },
  qualityCount: {
    ...textStyles.caption,
    color: colors.ink3Text,
    minWidth: 38,
    textAlign: "right"
  },
  qualityFill: {
    borderRadius: radius.pill,
    height: 6
  },
  qualityLabel: {
    ...textStyles.small,
    color: colors.ink2,
    minWidth: 58
  },
  qualityList: { gap: spacing.md },
  qualityRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm
  },
  qualityTrack: {
    backgroundColor: colors.surface3,
    borderRadius: radius.pill,
    flex: 1,
    height: 6,
    overflow: "hidden"
  },
  relationship: {
    ...textStyles.caption,
    color: colors.ink3Text,
    flexShrink: 1,
    maxWidth: 70,
    textAlign: "right"
  },
  section: { gap: spacing.lg },
  sectionCount: {
    ...textStyles.caption,
    color: colors.ink3Text
  },
  sectionHeading: {
    alignItems: "baseline",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  sectionTitle: {
    ...textStyles.section,
    color: colors.ink
  },
  share: {
    ...textStyles.small,
    color: colors.ink3Text
  },
  tag: {
    alignItems: "center",
    backgroundColor: colors.surface2,
    borderColor: colors.line,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.xs,
    minHeight: 30,
    paddingHorizontal: spacing.md
  },
  tagCount: {
    ...textStyles.caption,
    color: colors.ink3Text,
  },
  tagLabel: {
    ...textStyles.caption,
    color: colors.ink2,
    fontWeight: "600"
  },
  tags: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  title: {
    ...textStyles.title,
    color: colors.ink
  }
}));
