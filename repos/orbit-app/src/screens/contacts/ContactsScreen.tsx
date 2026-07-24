import { Ionicons } from "@expo/vector-icons";
import { type Href, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { contactsListPath } from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { DataCard } from "../../components/DataCard";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { colors, radius, spacing, typography } from "../../design/tokens";
import { useApiResource } from "../../hooks/useApiResource";
import {
  contactAvatarFor,
  contactStatusFilterOptions,
  contactsToSummaries,
  type ContactAvatarTone,
  type ContactListStatusFilter,
  type ContactStatusFilterOption,
  type ContactSummary
} from "../../view-models/contacts";

function contactDetail(contact: ContactSummary): string {
  return [contact.organization, contact.role, contact.status]
    .filter(Boolean)
    .join(" · ");
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

function hasContactData(
  state: ReturnType<typeof useApiResource<unknown>>
): state is ReturnType<typeof useApiResource<unknown>> & {
  data: unknown;
  kind: "empty" | "success";
} {
  return state.kind === "success" || state.kind === "empty";
}

function emptyMessage(query: string, status: ContactListStatusFilter | null): string {
  if (query.trim() || status) {
    return "换个关键词或清空筛选后再看。";
  }

  return "名片、报名和引荐形成的联系人会出现在这里。";
}

function StatusFilterChip({
  option,
  onPress
}: {
  option: ContactStatusFilterOption;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.filterChip,
        option.selected ? styles.filterChipSelected : null,
        pressed ? styles.filterChipPressed : null
      ]}
    >
      <Text
        numberOfLines={1}
        style={[
          styles.filterChipText,
          option.selected ? styles.filterChipTextSelected : null
        ]}
      >
        {option.label}
      </Text>
      <Text
        numberOfLines={1}
        style={[
          styles.filterChipCount,
          option.selected ? styles.filterChipTextSelected : null
        ]}
      >
        {option.count}
      </Text>
    </Pressable>
  );
}

function ContactCard({
  contact,
  onPress
}: {
  contact: ContactSummary;
  onPress: () => void;
}) {
  const avatar = contactAvatarFor(contact);
  const toneStyle = avatarToneStyles[avatar.tone];

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.contactCard,
        pressed ? styles.contactCardPressed : null
      ]}
    >
      <View style={styles.contactHeader}>
        <View
          style={[
            styles.avatar,
            { backgroundColor: toneStyle.backgroundColor }
          ]}
        >
          <Text style={[styles.avatarText, { color: toneStyle.color }]}>
            {avatar.initial}
          </Text>
        </View>
        <View style={styles.contactTitleBlock}>
          <Text numberOfLines={1} style={styles.contactName}>
            {contact.name}
          </Text>
          <Text numberOfLines={2} style={styles.contactDetail}>
            {contactDetail(contact)}
          </Text>
        </View>
      </View>
      <Text style={styles.relationshipText}>{contact.relationship}</Text>
      {contact.valueLabels.length > 0 ? (
        <View style={styles.tagsRow}>
          {contact.valueLabels.map((label) => (
            <Text key={label} style={styles.tagText}>
              {label}
            </Text>
          ))}
        </View>
      ) : null}
      <Text style={styles.nextActionText}>{contact.nextAction}</Text>
      {contact.valueScore === null ? null : (
        <Text style={styles.valueText}>价值分 {contact.valueScore}</Text>
      )}
    </Pressable>
  );
}

export function ContactsScreen() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedStatus, setSelectedStatus] =
    useState<ContactListStatusFilter | null>(null);
  const contactsPath = useMemo(
    () => contactsListPath({ query, status: selectedStatus }),
    [query, selectedStatus]
  );
  const state = useApiResource<unknown>(
    contactsPath,
    (data) => contactsToSummaries(data).length === 0
  );
  const contactData = hasContactData(state) ? state.data : null;
  const statusOptions = contactStatusFilterOptions(contactData, selectedStatus);
  const contacts = state.kind === "success" ? contactsToSummaries(state.data) : [];

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
      title="人脉"
    >
      <DataCard
        detail="名片、QR、手动记录"
        onPress={() => router.push("/contacts/new")}
        title="添加人脉来源"
      >
        <View style={styles.addSourceRow}>
          <Ionicons color={colors.accent} name="add-circle-outline" size={20} />
          <Text style={styles.nextActionText}>
            先生成待确认候选，确认前不会写入联系人。
          </Text>
        </View>
      </DataCard>
      <View style={styles.searchPanel}>
        <View style={styles.searchRow}>
          <Ionicons color={colors.text3} name="search-outline" size={18} />
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setQuery}
            placeholder="搜索姓名、公司、资源"
            placeholderTextColor={colors.text4}
            returnKeyType="search"
            style={styles.searchInput}
            value={query}
          />
          {query.trim() ? (
            <Pressable
              accessibilityLabel="清空搜索"
              accessibilityRole="button"
              onPress={() => setQuery("")}
              style={styles.clearButton}
            >
              <Ionicons color={colors.text3} name="close-circle" size={19} />
            </Pressable>
          ) : null}
        </View>
        <ScrollView
          contentContainerStyle={styles.filterList}
          horizontal
          showsHorizontalScrollIndicator={false}
        >
          {statusOptions.map((option) => (
            <StatusFilterChip
              key={option.value ?? "all"}
              onPress={() => setSelectedStatus(option.value)}
              option={option}
            />
          ))}
        </ScrollView>
      </View>
      {state.kind === "loading" ? <LoadingState /> : null}
      {state.kind === "offline" ? (
        <ErrorState message={state.error.message} title="服务器连不上" />
      ) : null}
      {state.kind === "failure" ? (
        <ErrorState message={state.error.message} />
      ) : null}
      {state.kind === "empty" ? (
        <EmptyState
          message={emptyMessage(query, selectedStatus)}
          title={query.trim() || selectedStatus ? "没有匹配的人脉" : "暂无联系人"}
        />
      ) : null}
      {contacts.length > 0
        ? contacts.map((contact) => (
            <ContactCard
              contact={contact}
              key={contact.id}
              onPress={() =>
                router.push({
                  params: { id: contact.id },
                  pathname: "/contacts/[id]"
                })
              }
            />
          ))
        : null}
      <DataCard
        detail="阶段、强度、待跟进"
        onPress={() => router.push("/contacts/graph" as Href)}
        title="人脉图谱"
      >
        <View style={styles.addSourceRow}>
          <Ionicons color={colors.live} name="git-network-outline" size={20} />
          <Text style={styles.nextActionText}>
            看哪些关系已经进入管线，哪些需要先复核再推进。
          </Text>
        </View>
      </DataCard>
      <DataCard
        detail="覆盖、价值、缺口"
        onPress={() => router.push("/contacts/dashboard" as Href)}
        title="人脉表盘"
      >
        <View style={styles.addSourceRow}>
          <Ionicons color={colors.sky} name="analytics-outline" size={20} />
          <Text style={styles.nextActionText}>
            看关系资产是否支撑当前目标，先补最薄的圈层。
          </Text>
        </View>
      </DataCard>
      <DataCard
        detail="待联系、推进中、已合作"
        onPress={() => router.push("/contacts/pipeline" as Href)}
        title="跟进管线"
      >
        <View style={styles.addSourceRow}>
          <Ionicons color={colors.amber} name="list-outline" size={20} />
          <Text style={styles.nextActionText}>
            按下一步动作整理联系人，先处理最该跟进的人。
          </Text>
        </View>
      </DataCard>
      <DataCard
        detail="可牵线的人和准备重点"
        onPress={() => router.push("/contacts/intros" as Href)}
        title="引荐准备"
      >
        <View style={styles.addSourceRow}>
          <Ionicons color={colors.live} name="git-compare-outline" size={20} />
          <Text style={styles.nextActionText}>
            找出有明确引荐路径的人，发出前逐条确认。
          </Text>
        </View>
      </DataCard>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  addSourceRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8
  },
  avatar: {
    alignItems: "center",
    borderRadius: radius.pill,
    height: 52,
    justifyContent: "center",
    width: 52
  },
  avatarText: {
    fontSize: typography.title,
    fontWeight: "800",
    lineHeight: 25
  },
  clearButton: {
    alignItems: "center",
    height: 32,
    justifyContent: "center",
    width: 32
  },
  contactCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg
  },
  contactCardPressed: {
    opacity: 0.86,
    transform: [{ translateY: 0.5 }]
  },
  contactDetail: {
    color: colors.text3,
    fontSize: typography.small,
    lineHeight: 19
  },
  contactHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md
  },
  contactName: {
    color: colors.ink,
    fontSize: typography.section,
    fontWeight: "700",
    lineHeight: 22
  },
  contactTitleBlock: {
    flex: 1,
    gap: 3,
    minWidth: 0
  },
  filterChip: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border2,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: 5,
    minHeight: 34,
    paddingHorizontal: 12
  },
  filterChipCount: {
    color: colors.text3,
    fontSize: typography.caption,
    fontWeight: "700"
  },
  filterChipPressed: {
    opacity: 0.82,
    transform: [{ translateY: 0.5 }]
  },
  filterChipSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent
  },
  filterChipText: {
    color: colors.text2,
    fontSize: typography.small,
    fontWeight: "700"
  },
  filterChipTextSelected: {
    color: colors.onAccent
  },
  filterList: {
    gap: spacing.sm,
    paddingRight: spacing.sm
  },
  nextActionText: {
    color: colors.text2,
    fontSize: typography.small,
    lineHeight: 20
  },
  relationshipText: {
    color: colors.text,
    fontSize: typography.small,
    lineHeight: 20
  },
  searchInput: {
    color: colors.text,
    flex: 1,
    fontSize: typography.body,
    lineHeight: 20,
    paddingVertical: 10
  },
  searchPanel: {
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md
  },
  searchRow: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border2,
    borderRadius: radius.control,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 46,
    paddingHorizontal: spacing.md
  },
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6
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
  },
  valueText: {
    color: colors.accent,
    fontSize: typography.caption,
    fontWeight: "700",
    textTransform: "uppercase"
  }
});
