import { Ionicons } from "@expo/vector-icons";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import {
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View
} from "react-native";
import { contactStructureDetailPath } from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { textStyles, radius, spacing, type OrbitColors } from "../../design/tokens";
import { createThemedStyles, useOrbitTheme } from "../../design/theme";
import { useApiResource } from "../../hooks/useApiResource";
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
  const state = useApiResource<unknown>(
    contactStructureDetailPath(dimension, bucketId),
    () => false
  );
  const router = useRouter();

  return (
    <AppScreen
      eyebrow="人脉结构"
      refreshControl={
        <RefreshControl
          onRefresh={state.refresh}
          refreshing={state.refreshing}
          tintColor={colors.accent}
        />
      }
      title="分组详情"
    >
      {state.kind === "loading" ? <LoadingState /> : null}
      {state.kind === "offline" ? (
        <ErrorState message={state.error.message} title="服务器连不上" />
      ) : null}
      {state.kind === "failure" ? <ErrorState message={state.error.message} /> : null}
      {state.kind === "success" || state.kind === "empty" ? (
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
          <Ionicons color={colors.accent} name="pie-chart-outline" size={22} />
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
          <Ionicons color={colors.amber} name="bulb-outline" size={19} />
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
      <Ionicons color={colors.text4} name="chevron-forward" size={17} />
    </Pressable>
  );
}

function qualityColor(tone: "amber" | "live" | "sky", colors: OrbitColors): string {
  if (tone === "live") return colors.live;
  if (tone === "sky") return colors.sky;
  return colors.amber;
}

function avatarToneStyle(tone: ContactAvatarTone, colors: OrbitColors) {
  if (tone === "emerald") return { backgroundColor: colors.liveSoft };
  if (tone === "sky") return { backgroundColor: colors.skySoft };
  if (tone === "amber") return { backgroundColor: colors.amberSoft };
  if (tone === "rose") return { backgroundColor: colors.roseSoft };
  return { backgroundColor: colors.accentSoft };
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
    color: colors.text3
  },
  contactName: {
    ...textStyles.listTitle,
    color: colors.ink
  },
  contactRow: {
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 64,
    paddingVertical: spacing.sm
  },
  eyebrow: {
    ...textStyles.caption,
    color: colors.accent,
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
    backgroundColor: colors.accentSofter,
    borderRadius: radius.control,
    height: 44,
    justifyContent: "center",
    width: 44
  },
  insight: {
    alignItems: "flex-start",
    backgroundColor: colors.amberSoft,
    borderRadius: radius.card,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md
  },
  insightText: {
    ...textStyles.small,
    color: colors.text2,
    flex: 1
  },
  pressed: { opacity: 0.72 },
  qualityCount: {
    ...textStyles.caption,
    color: colors.text3,
    minWidth: 38,
    textAlign: "right"
  },
  qualityFill: {
    borderRadius: radius.pill,
    height: 6
  },
  qualityLabel: {
    ...textStyles.small,
    color: colors.text2,
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
    color: colors.text3,
    flexShrink: 1,
    maxWidth: 70,
    textAlign: "right"
  },
  section: { gap: spacing.lg },
  sectionCount: {
    ...textStyles.caption,
    color: colors.text4
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
    color: colors.text3
  },
  tag: {
    alignItems: "center",
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.xs,
    minHeight: 30,
    paddingHorizontal: spacing.md
  },
  tagCount: {
    ...textStyles.caption,
    color: colors.text4,
  },
  tagLabel: {
    ...textStyles.caption,
    color: colors.text2,
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
