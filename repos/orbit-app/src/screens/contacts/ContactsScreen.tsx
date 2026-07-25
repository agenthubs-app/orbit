import { Ionicons } from "@expo/vector-icons";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import {
  type ComponentProps,
  type ReactNode,
  useEffect,
  useMemo,
  useState
} from "react";
import {
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { contactsListPath, ORBIT_API_ENDPOINTS } from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { DataCard } from "../../components/DataCard";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { colors, radius, spacing, typography } from "../../design/tokens";
import { useApiResource } from "../../hooks/useApiResource";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import {
  buildContactsSearchRequest,
  contactAvatarFor,
  contactSearchFilterSections,
  contactStatusFilterOptions,
  contactsSearchToView,
  contactsToSummaries,
  type ContactAvatarTone,
  type ContactListStatusFilter,
  type ContactSearchFilterKind,
  type ContactSearchFilterSectionView,
  type ContactSearchResultView,
  type ContactStatusFilterOption,
  type ContactSummary,
  type ContactsSearchView,
  toggleContactSearchFilter
} from "../../view-models/contacts";
import {
  buildRelationshipSearchRequest,
  relationshipSearchToView,
  relationshipSearchSuggestionsToView,
  type RelationshipSearchRequestBody,
  type RelationshipSearchResultView,
  type RelationshipSearchView,
  type RelationshipSearchSuggestionView,
  type RelationshipSearchSuggestionsView
} from "../../view-models/relationship-search";

type ContactsScreenMode = "list" | "overview";
type IoniconName = ComponentProps<typeof Ionicons>["name"];
type NetworkPriorityRoute = "/contacts/graph" | "/contacts/dashboard";
type OverviewToolTone = "accent" | "amber" | "live" | "sky";

type RecentRelationshipSearch = {
  body: RelationshipSearchRequestBody;
  detail: string;
  id: string;
  label: string;
};

type RunRelationshipSearchOptions = {
  rememberRecent?: boolean;
};

type RelationshipFilterOption = {
  label: string;
  value: string;
};

const relationshipIntentOptions: RelationshipFilterOption[] = [
  { label: "找暖介绍", value: "find_warm_intro" },
  { label: "找合作机会", value: "explore_partnership" },
  { label: "找会后跟进", value: "recover_event_follow_up" },
  { label: "找客户参考", value: "source_customer_reference" }
];

const relationshipIndustryOptions: RelationshipFilterOption[] = [
  { label: "企业 SaaS", value: "enterprise_saas" },
  { label: "金融科技", value: "fintech" },
  { label: "气候", value: "climate" },
  { label: "医疗健康", value: "healthcare" },
  { label: "出行", value: "mobility" }
];

const recentRelationshipSearchLimit = 4;

function relationshipFilterLabel(
  options: RelationshipFilterOption[],
  value?: string
): string {
  return options.find((option) => option.value === value)?.label ?? "";
}

function relationshipSearchBodyId(body: RelationshipSearchRequestBody): string {
  return [
    body.query?.trim().toLowerCase() ?? "",
    body.businessIntent ?? "",
    ...(body.industryFilters ?? []),
    ...(body.sourceFilters ?? []),
    ...(body.valueTypeFilters ?? []),
    ...(body.followUpStatusFilters ?? [])
  ].join("|");
}

function relationshipSearchBodyCopy(
  body: RelationshipSearchRequestBody
): RelationshipSearchRequestBody {
  const copy: RelationshipSearchRequestBody = {};

  if (body.businessIntent) {
    copy.businessIntent = body.businessIntent;
  }

  if (body.query) {
    copy.query = body.query;
  }

  if (body.followUpStatusFilters?.length) {
    copy.followUpStatusFilters = [...body.followUpStatusFilters];
  }

  if (body.industryFilters?.length) {
    copy.industryFilters = [...body.industryFilters];
  }

  if (body.sourceFilters?.length) {
    copy.sourceFilters = [...body.sourceFilters];
  }

  if (body.valueTypeFilters?.length) {
    copy.valueTypeFilters = [...body.valueTypeFilters];
  }

  return copy;
}

function relationshipSearchRecentLabel(
  body: RelationshipSearchRequestBody
): string {
  const queryLabel = body.query?.trim() || "关系搜索";
  const intentLabel = relationshipFilterLabel(
    relationshipIntentOptions,
    body.businessIntent
  );
  const industryLabel = (body.industryFilters ?? [])
    .map((value) => relationshipFilterLabel(relationshipIndustryOptions, value))
    .filter(Boolean)
    .slice(0, 2)
    .join("、");

  return [queryLabel, intentLabel, industryLabel].filter(Boolean).join(" · ");
}

function relationshipSearchRecentDetail(
  body: RelationshipSearchRequestBody
): string {
  const filterCount =
    (body.sourceFilters ?? []).length +
    (body.valueTypeFilters ?? []).length +
    (body.followUpStatusFilters ?? []).length;

  if (filterCount > 0) {
    return `${filterCount} 个列表筛选`;
  }

  return "点一下重新检索";
}

function relationshipSearchToRecent(
  body: RelationshipSearchRequestBody
): RecentRelationshipSearch | null {
  const id = relationshipSearchBodyId(body);

  if (!id.replace(/\|/gu, "").trim()) {
    return null;
  }

  return {
    body: relationshipSearchBodyCopy(body),
    detail: relationshipSearchRecentDetail(body),
    id,
    label: relationshipSearchRecentLabel(body)
  };
}

function upsertRecentRelationshipSearch(
  searches: RecentRelationshipSearch[],
  next: RecentRelationshipSearch
): RecentRelationshipSearch[] {
  return [
    next,
    ...searches.filter((search) => search.id !== next.id)
  ].slice(0, recentRelationshipSearchLimit);
}

function contactDetail(contact: ContactSummary): string {
  return [contact.organization, contact.role, contact.status]
    .filter(Boolean)
    .join(" · ");
}

function assetUrl(baseUrl: string, path: string): string {
  if (/^https?:\/\//iu.test(path)) {
    return path;
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl.replace(/\/+$/u, "")}${normalizedPath}`;
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

function emptyMessage(
  query: string,
  status: ContactListStatusFilter | null,
  hasAdvancedFilters: boolean
): string {
  if (query.trim() || status || hasAdvancedFilters) {
    return "换个关键词或清空筛选后再看。";
  }

  return "名片、报名和引荐形成的联系人会出现在这里。";
}

function firstRouteParam(value?: string | string[]): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

function initialListFilterValues(value?: string | string[]): string[] {
  const values = Array.isArray(value) ? value : value ? [value] : [];

  return values
    .flatMap((item) => item.split(","))
    .map((item) => item.trim())
    .filter(Boolean);
}

function initialStatusFilter(
  statusParam?: string | string[]
): ContactListStatusFilter | null {
  const status = firstRouteParam(statusParam);

  if (
    status === "active" ||
    status === "archived" ||
    status === "needs_follow_up" ||
    status === "nurture"
  ) {
    return status;
  }

  return null;
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

function ContactSearchFilterSection({
  onToggle,
  section
}: {
  onToggle: (kind: ContactSearchFilterKind, value: string) => void;
  section: ContactSearchFilterSectionView;
}) {
  return (
    <View style={styles.advancedFilterSection}>
      <Text style={styles.advancedFilterTitle}>{section.title}</Text>
      <ScrollView
        contentContainerStyle={styles.filterList}
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        {section.options.map((option) => (
          <Pressable
            accessibilityRole="button"
            key={option.value}
            onPress={() => onToggle(section.key, option.value)}
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
        ))}
      </ScrollView>
    </View>
  );
}

function RelationshipFilterSection({
  onSelect,
  options,
  selectedValues,
  title
}: {
  onSelect: (value: string) => void;
  options: RelationshipFilterOption[];
  selectedValues: string[];
  title: string;
}) {
  return (
    <View style={styles.advancedFilterSection}>
      <Text style={styles.advancedFilterTitle}>{title}</Text>
      <ScrollView
        contentContainerStyle={styles.filterList}
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        {options.map((option) => {
          const selected = selectedValues.includes(option.value);

          return (
            <Pressable
              accessibilityRole="button"
              key={option.value}
              onPress={() => onSelect(option.value)}
              style={({ pressed }) => [
                styles.filterChip,
                selected ? styles.filterChipSelected : null,
                pressed ? styles.filterChipPressed : null
              ]}
            >
              <Text
                numberOfLines={1}
                style={[
                  styles.filterChipText,
                  selected ? styles.filterChipTextSelected : null
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function ContactCard({
  baseUrl,
  contact,
  onPress
}: {
  baseUrl: string;
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
          {contact.imageUrl ? (
            <Image
              resizeMode="cover"
              source={{ uri: assetUrl(baseUrl, contact.imageUrl) }}
              style={styles.avatarImage}
            />
          ) : (
            <Text style={[styles.avatarText, { color: toneStyle.color }]}>
              {avatar.initial}
            </Text>
          )}
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

function SearchResultAvatar({
  baseUrl,
  id,
  imageUrl,
  name
}: {
  baseUrl: string;
  id: string;
  imageUrl: string | undefined;
  name: string;
}) {
  const avatar = contactAvatarFor({ id: id, name: name });
  const toneStyle = avatarToneStyles[avatar.tone];

  return (
    <View
      style={[
        styles.searchResultAvatar,
        { backgroundColor: toneStyle.backgroundColor }
      ]}
    >
      {imageUrl ? (
        <Image
          resizeMode="cover"
          source={{ uri: assetUrl(baseUrl, imageUrl) }}
          style={styles.searchResultAvatarImage}
        />
      ) : (
        <Text style={[styles.searchResultAvatarText, { color: toneStyle.color }]}>
          {avatar.initial}
        </Text>
      )}
    </View>
  );
}

function ContactSearchResultCard({
  baseUrl,
  onOpenContact,
  search
}: {
  baseUrl: string;
  onOpenContact: (id: string) => void;
  search: ContactsSearchView;
}) {
  return (
    <DataCard detail={search.summary} title={search.title}>
      <Text style={styles.searchResultLead}>{search.nextAction}</Text>
      <Text style={styles.searchFilterText}>{search.filtersLabel}</Text>
      {search.results.length === 0 ? (
        <Text style={styles.searchEmptyText}>{search.emptyText}</Text>
      ) : (
        <View style={styles.searchResultStack}>
          {search.results.map((result) => (
            <ContactSearchResultItem
              baseUrl={baseUrl}
              key={result.id}
              onPress={() => onOpenContact(result.id)}
              result={result}
            />
          ))}
        </View>
      )}
    </DataCard>
  );
}

function ContactSearchResultItem({
  baseUrl,
  onPress,
  result
}: {
  baseUrl: string;
  onPress: () => void;
  result: ContactSearchResultView;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.searchResultItem,
        pressed ? styles.searchResultItemPressed : null
      ]}
    >
      <View style={styles.searchResultHeader}>
        <SearchResultAvatar
          baseUrl={baseUrl}
          id={result.id}
          imageUrl={result.imageUrl}
          name={result.name}
        />
        <View style={styles.searchResultTitleBlock}>
          <Text numberOfLines={1} style={styles.searchResultName}>
            {result.name}
          </Text>
          <Text numberOfLines={2} style={styles.searchResultDetail}>
            {result.detail}
          </Text>
        </View>
        {result.valueScore === null ? null : (
          <Text style={styles.searchResultScore}>{result.valueScore}</Text>
        )}
      </View>
      <Text numberOfLines={3} style={styles.relationshipText}>
        {result.relationship}
      </Text>
      {result.valueLabels.length > 0 ? (
        <View style={styles.tagsRow}>
          {result.valueLabels.map((label) => (
            <Text key={label} style={styles.tagText}>
              {label}
            </Text>
          ))}
        </View>
      ) : null}
      <Text style={styles.nextActionText}>{result.nextAction}</Text>
    </Pressable>
  );
}

function RelationshipSearchResultCard({
  baseUrl,
  onOpenContact,
  search
}: {
  baseUrl: string;
  onOpenContact: (id: string) => void;
  search: RelationshipSearchView;
}) {
  return (
    <DataCard detail={search.summary} title={search.title}>
      <Text style={styles.searchResultLead}>{search.queryLabel}</Text>
      <Text style={styles.searchFilterText}>{search.filtersLabel}</Text>
      <Text style={styles.nextActionText}>{search.nextAction}</Text>
      {search.results.length === 0 ? (
        <Text style={styles.searchEmptyText}>{search.emptyText}</Text>
      ) : (
        <View style={styles.searchResultStack}>
          {search.results.map((result) => (
            <RelationshipSearchResultItem
              baseUrl={baseUrl}
              key={result.id}
              onPress={() => onOpenContact(result.contactId)}
              result={result}
            />
          ))}
        </View>
      )}
    </DataCard>
  );
}

function RelationshipSearchResultItem({
  baseUrl,
  onPress,
  result
}: {
  baseUrl: string;
  onPress: () => void;
  result: RelationshipSearchResultView;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.searchResultItem,
        pressed ? styles.searchResultItemPressed : null
      ]}
    >
      <View style={styles.searchResultHeader}>
        <SearchResultAvatar
          baseUrl={baseUrl}
          id={result.contactId || result.id}
          imageUrl={result.imageUrl}
          name={result.name}
        />
        <View style={styles.searchResultTitleBlock}>
          <Text numberOfLines={1} style={styles.searchResultName}>
            {result.name}
          </Text>
          <Text numberOfLines={2} style={styles.searchResultDetail}>
            {result.detail}
          </Text>
        </View>
        <View style={styles.relationshipSearchScorePill}>
          <Text style={styles.relationshipSearchScore}>{result.score}</Text>
          <Text style={styles.relationshipSearchScoreLabel}>
            {result.scoreLabel}
          </Text>
        </View>
      </View>
      <Text numberOfLines={3} style={styles.relationshipText}>
        {result.relationship}
      </Text>
      <Text numberOfLines={3} style={styles.relationshipSearchEvidence}>
        {result.evidence}
      </Text>
      {result.valueLabels.length > 0 ? (
        <View style={styles.tagsRow}>
          {result.valueLabels.map((label) => (
            <Text key={label} style={styles.tagText}>
              {label}
            </Text>
          ))}
        </View>
      ) : null}
      <Text style={styles.nextActionText}>{result.nextAction}</Text>
    </Pressable>
  );
}

function RelationshipSearchSuggestionsRow({
  onSelectRelationshipSuggestion,
  view
}: {
  onSelectRelationshipSuggestion: (
    suggestion: RelationshipSearchSuggestionView
  ) => void;
  view: RelationshipSearchSuggestionsView;
}) {
  if (view.suggestions.length === 0) {
    return null;
  }

  return (
    <View accessibilityLabel="推荐搜索" style={styles.relationshipSuggestions}>
      <View style={styles.relationshipSuggestionsHeader}>
        <Text style={styles.relationshipSuggestionsTitle}>{view.title}</Text>
        <Text style={styles.relationshipSuggestionsMeta}>{view.summary}</Text>
      </View>
      <View style={styles.relationshipSuggestionList}>
        {view.suggestions.map((suggestion) => (
          <Pressable
            accessibilityLabel={suggestion.query}
            accessibilityRole="button"
            key={suggestion.id}
            onPress={() => onSelectRelationshipSuggestion(suggestion)}
            style={({ pressed }) => [
              styles.relationshipSuggestionChip,
              pressed ? styles.filterChipPressed : null
            ]}
          >
            <Text numberOfLines={2} style={styles.relationshipSuggestionQuery}>
              {suggestion.query}
            </Text>
            <Text numberOfLines={1} style={styles.relationshipSuggestionDetail}>
              {suggestion.detail}
            </Text>
            <Text numberOfLines={2} style={styles.relationshipSuggestionHint}>
              {suggestion.evidenceHint}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.relationshipSuggestionsNext}>{view.nextAction}</Text>
    </View>
  );
}

function RecentRelationshipSearchesRow({
  onSelectRecentRelationshipSearch,
  searches
}: {
  onSelectRecentRelationshipSearch: (search: RecentRelationshipSearch) => void;
  searches: RecentRelationshipSearch[];
}) {
  if (searches.length === 0) {
    return null;
  }

  return (
    <View accessibilityLabel="最近搜索" style={styles.recentRelationshipSearches}>
      <View style={styles.recentRelationshipSearchesHeader}>
        <Text style={styles.recentRelationshipSearchesTitle}>最近搜索</Text>
        <Text style={styles.recentRelationshipSearchesMeta}>只保存在本机</Text>
      </View>
      <View style={styles.recentRelationshipSearchList}>
        {searches.map((search) => (
          <Pressable
            accessibilityLabel={search.label}
            accessibilityRole="button"
            key={search.id}
            onPress={() => onSelectRecentRelationshipSearch(search)}
            style={({ pressed }) => [
              styles.recentRelationshipSearchChip,
              pressed ? styles.filterChipPressed : null
            ]}
          >
            <Ionicons color={colors.accent} name="time-outline" size={15} />
            <View style={styles.recentRelationshipSearchText}>
              <Text
                numberOfLines={1}
                style={styles.recentRelationshipSearchLabel}
              >
                {search.label}
              </Text>
              <Text
                numberOfLines={1}
                style={styles.recentRelationshipSearchDetail}
              >
                {search.detail}
              </Text>
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function OverviewToolGrid({ children }: { children: ReactNode }) {
  return <View style={styles.overviewToolGrid}>{children}</View>;
}

function overviewToolTone(tone: OverviewToolTone) {
  if (tone === "amber") {
    return {
      backgroundColor: colors.amberSoft,
      color: colors.amber
    };
  }

  if (tone === "live") {
    return {
      backgroundColor: colors.liveSoft,
      color: colors.live
    };
  }

  if (tone === "sky") {
    return {
      backgroundColor: colors.skySoft,
      color: colors.sky
    };
  }

  return {
    backgroundColor: colors.accentSofter,
    color: colors.accent
  };
}

function OverviewToolCard({
  action,
  detail,
  iconName,
  onPress,
  priority = false,
  title,
  tone
}: {
  action: string;
  detail: string;
  iconName: IoniconName;
  onPress: () => void;
  priority?: boolean;
  title: string;
  tone: OverviewToolTone;
}) {
  const toneStyle = overviewToolTone(tone);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.overviewToolCard,
        priority ? styles.overviewToolCardPrimary : null,
        pressed ? styles.contactCardPressed : null
      ]}
    >
      <View
        style={[
          styles.overviewToolIcon,
          { backgroundColor: toneStyle.backgroundColor }
        ]}
      >
        <Ionicons color={toneStyle.color} name={iconName} size={20} />
      </View>
      <View style={styles.overviewToolText}>
        <Text numberOfLines={1} style={styles.overviewToolTitle}>
          {title}
        </Text>
        <Text numberOfLines={2} style={styles.overviewToolDetail}>
          {detail}
        </Text>
      </View>
      <View style={styles.overviewToolActionRow}>
        <Text style={styles.overviewToolActionText}>{action}</Text>
        <Ionicons color={colors.text3} name="chevron-forward" size={16} />
      </View>
    </Pressable>
  );
}

function ContactsLibraryEntry({
  contactsLabel,
  onPress
}: {
  contactsLabel: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.contactsLibraryEntry,
        pressed ? styles.contactCardPressed : null
      ]}
    >
      <View style={styles.contactsLibraryText}>
        <Text style={styles.contactsLibraryTitle}>联系人库</Text>
        <Text numberOfLines={1} style={styles.contactsLibraryDetail}>
          {contactsLabel}，藏在更深一层
        </Text>
      </View>
      <View style={styles.contactsLibraryAction}>
        <Text style={styles.contactsLibraryActionText}>进入</Text>
        <Ionicons color={colors.text3} name="chevron-forward" size={15} />
      </View>
    </Pressable>
  );
}

function NetworkPriorityCard({
  action,
  detail,
  iconName,
  inverted = false,
  metric,
  route,
  signal,
  title,
  tone
}: {
  action: string;
  detail: string;
  iconName: IoniconName;
  inverted?: boolean;
  metric: string;
  route: NetworkPriorityRoute;
  signal: string;
  title: string;
  tone: OverviewToolTone;
}) {
  const router = useRouter();
  const toneStyle = overviewToolTone(tone);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(route as Href)}
      style={({ pressed }) => [
        styles.networkPriorityCard,
        inverted ? styles.networkPriorityCardInverted : null,
        pressed ? styles.contactCardPressed : null
      ]}
    >
      <View style={styles.networkPriorityTopRow}>
        <View
          style={[
            styles.networkPriorityIcon,
            { backgroundColor: toneStyle.backgroundColor },
            inverted ? styles.networkPriorityIconInverted : null
          ]}
        >
          <Ionicons color={toneStyle.color} name={iconName} size={21} />
        </View>
        <Text
          numberOfLines={1}
          style={[
            styles.networkPriorityMetric,
            inverted ? styles.networkPriorityMetricInverted : null
          ]}
        >
          {metric}
        </Text>
      </View>
      <View style={styles.networkPriorityCopy}>
        <Text
          numberOfLines={1}
          style={[
            styles.networkPriorityTitle,
            inverted ? styles.networkPriorityTitleInverted : null
          ]}
        >
          {title}
        </Text>
        <Text
          numberOfLines={3}
          style={[
            styles.networkPriorityDetail,
            inverted ? styles.networkPriorityDetailInverted : null
          ]}
        >
          {detail}
        </Text>
      </View>
      <View style={styles.networkPriorityFooter}>
        <Text
          numberOfLines={1}
          style={[
            styles.networkPrioritySignal,
            inverted ? styles.networkPrioritySignalInverted : null
          ]}
        >
          {signal}
        </Text>
        <View style={styles.networkPriorityAction}>
          <Text
            style={[
              styles.networkPriorityActionText,
              inverted ? styles.networkPriorityActionTextInverted : null
            ]}
          >
            {action}
          </Text>
          <Ionicons
            color={inverted ? colors.onAccent : colors.text3}
            name="chevron-forward"
            size={16}
          />
        </View>
      </View>
    </Pressable>
  );
}

function PriorityNetworkTools({
  contactsCount
}: {
  contactsCount?: number | null;
}) {
  const contactsSignal =
    typeof contactsCount === "number" && contactsCount > 0
      ? `${contactsCount} 位关系节点`
      : "进入图谱查看关系节点";

  return (
    <View style={styles.networkPriorityStage}>
      <NetworkPriorityCard
        action="打开图谱"
        detail="先看谁能连接谁，以及哪些关键关系还缺证据。"
        iconName="git-network-outline"
        inverted
        metric="结构"
        route="/contacts/graph"
        signal={contactsSignal}
        title="人脉图谱"
        tone="live"
      />
      <NetworkPriorityCard
        action="看表盘"
        detail="看强弱覆盖、高价值关系和下一批要唤醒的人。"
        iconName="analytics-outline"
        metric="经营"
        route="/contacts/dashboard"
        signal="覆盖、价值、缺口"
        title="人脉表盘"
        tone="sky"
      />
    </View>
  );
}

function ContactsOverviewContent({
  contactsCount = null
}: {
  contactsCount?: number | null;
} = {}) {
  const router = useRouter();
  const contactsLabel =
    typeof contactsCount === "number" && contactsCount > 0
      ? `${contactsCount} 位联系人`
      : "搜索、筛选、打开联系人详情";

  return (
    <>
      <PriorityNetworkTools contactsCount={contactsCount} />
      <OverviewToolGrid>
        <OverviewToolCard
          action="看下一步"
          detail="待联系、推进中、已合作"
          iconName="list-outline"
          onPress={() => router.push("/contacts/pipeline" as Href)}
          title="跟进管线"
          tone="amber"
        />
        <OverviewToolCard
          action="准备介绍"
          detail="可牵线的人和重点"
          iconName="git-compare-outline"
          onPress={() => router.push("/contacts/intros" as Href)}
          title="引荐准备"
          tone="live"
        />
        <OverviewToolCard
          action="添加来源"
          detail="名片、QR、手动记录"
          iconName="add-circle-outline"
          onPress={() => router.push("/contacts/new")}
          title="添加人脉"
          tone="accent"
        />
      </OverviewToolGrid>
      <ContactsLibraryEntry
        contactsLabel={contactsLabel}
        onPress={() => router.push("/contacts/list" as Href)}
      />
    </>
  );
}

function ContactsListContent({
  advancedFilterSections,
  baseUrl,
  contacts,
  hasAdvancedFilters,
  onClearQuery,
  onOpenContact,
  onQueryChange,
  onRelationshipIntentChange,
  onRunDeepSearch,
  onRunRelationshipSearch,
  onSelectRecentRelationshipSearch,
  onSelectRelationshipSuggestion,
  onStatusChange,
  onToggleAdvancedFilter,
  onToggleRelationshipIndustry,
  query,
  recentRelationshipSearches,
  relationshipSearchError,
  relationshipSearchResult,
  relationshipSearching,
  relationshipSuggestions,
  searchError,
  searchResult,
  searching,
  selectedRelationshipIndustries,
  selectedRelationshipIntent,
  selectedStatus,
  state,
  statusOptions
}: {
  advancedFilterSections: ContactSearchFilterSectionView[];
  baseUrl: string;
  contacts: ContactSummary[];
  hasAdvancedFilters: boolean;
  onClearQuery: () => void;
  onOpenContact: (id: string) => void;
  onQueryChange: (text: string) => void;
  onRelationshipIntentChange: (value: string) => void;
  onRunDeepSearch: () => void;
  onRunRelationshipSearch: () => void;
  onSelectRecentRelationshipSearch: (search: RecentRelationshipSearch) => void;
  onSelectRelationshipSuggestion: (
    suggestion: RelationshipSearchSuggestionView
  ) => void;
  onStatusChange: (status: ContactListStatusFilter | null) => void;
  onToggleAdvancedFilter: (
    kind: ContactSearchFilterKind,
    value: string
  ) => void;
  onToggleRelationshipIndustry: (value: string) => void;
  query: string;
  recentRelationshipSearches: RecentRelationshipSearch[];
  relationshipSearchError: string | null;
  relationshipSearchResult: RelationshipSearchView | null;
  relationshipSearching: boolean;
  relationshipSuggestions: RelationshipSearchSuggestionsView | null;
  searchError: string | null;
  searchResult: ContactsSearchView | null;
  searching: boolean;
  selectedRelationshipIndustries: string[];
  selectedRelationshipIntent: string | null;
  selectedStatus: ContactListStatusFilter | null;
  state: ReturnType<typeof useApiResource<unknown>>;
  statusOptions: ContactStatusFilterOption[];
}) {
  return (
    <>
      <View style={styles.searchPanel}>
        <View style={styles.searchRow}>
          <Ionicons color={colors.text3} name="search-outline" size={18} />
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={onQueryChange}
            onSubmitEditing={onRunDeepSearch}
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
              onPress={onClearQuery}
              style={styles.clearButton}
            >
              <Ionicons color={colors.text3} name="close-circle" size={19} />
            </Pressable>
          ) : null}
        </View>
        <View style={styles.searchActionRow}>
          <Pressable
            accessibilityRole="button"
            disabled={searching}
            onPress={onRunDeepSearch}
            style={({ pressed }) => [
              styles.deepSearchButton,
              searching ? styles.deepSearchButtonDisabled : null,
              pressed ? styles.deepSearchButtonPressed : null
            ]}
          >
            <Ionicons
              color={colors.onAccent}
              name="sparkles-outline"
              size={17}
            />
            <Text style={styles.deepSearchButtonText}>
              {searching ? "搜索中" : "深度搜索"}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={relationshipSearching}
            onPress={onRunRelationshipSearch}
            style={({ pressed }) => [
              styles.relationshipSearchButton,
              relationshipSearching ? styles.deepSearchButtonDisabled : null,
              pressed ? styles.deepSearchButtonPressed : null
            ]}
          >
            <Ionicons color={colors.accent} name="git-network-outline" size={17} />
            <Text style={styles.relationshipSearchButtonText}>
              {relationshipSearching ? "检索中" : "关系搜索"}
            </Text>
          </Pressable>
          {searchError ? (
            <Text style={styles.searchErrorText}>{searchError}</Text>
          ) : null}
          {relationshipSearchError ? (
            <Text style={styles.searchErrorText}>{relationshipSearchError}</Text>
          ) : null}
        </View>
        <RecentRelationshipSearchesRow
          onSelectRecentRelationshipSearch={onSelectRecentRelationshipSearch}
          searches={recentRelationshipSearches}
        />
        <RelationshipFilterSection
          onSelect={onRelationshipIntentChange}
          options={relationshipIntentOptions}
          selectedValues={
            selectedRelationshipIntent ? [selectedRelationshipIntent] : []
          }
          title="要找什么"
        />
        <RelationshipFilterSection
          onSelect={onToggleRelationshipIndustry}
          options={relationshipIndustryOptions}
          selectedValues={selectedRelationshipIndustries}
          title="行业"
        />
        <ScrollView
          contentContainerStyle={styles.filterList}
          horizontal
          showsHorizontalScrollIndicator={false}
        >
          {statusOptions.map((option) => (
            <StatusFilterChip
              key={option.value ?? "all"}
              onPress={() => onStatusChange(option.value)}
              option={option}
            />
          ))}
        </ScrollView>
        {advancedFilterSections.map((section) => (
          <ContactSearchFilterSection
            key={section.key}
            onToggle={onToggleAdvancedFilter}
            section={section}
          />
        ))}
      </View>
      {searchResult ? (
        <ContactSearchResultCard
          baseUrl={baseUrl}
          onOpenContact={onOpenContact}
          search={searchResult}
        />
      ) : null}
      {relationshipSearchResult ? (
        <RelationshipSearchResultCard
          baseUrl={baseUrl}
          onOpenContact={onOpenContact}
          search={relationshipSearchResult}
        />
      ) : null}
      {state.kind === "loading" ? <LoadingState /> : null}
      {state.kind === "offline" ? (
        <ErrorState message={state.error.message} title="服务器连不上" />
      ) : null}
      {state.kind === "failure" ? (
        <ErrorState message={state.error.message} />
      ) : null}
      {state.kind === "empty" ? (
        <EmptyState
          message={emptyMessage(query, selectedStatus, hasAdvancedFilters)}
          title={
            query.trim() || selectedStatus || hasAdvancedFilters
              ? "没有匹配的人脉"
              : "暂无联系人"
          }
        />
      ) : null}
      {contacts.length > 0
        ? contacts.map((contact) => (
            <ContactCard
              baseUrl={baseUrl}
              contact={contact}
              key={contact.id}
              onPress={() => onOpenContact(contact.id)}
            />
          ))
        : null}
      {relationshipSuggestions ? (
        <RelationshipSearchSuggestionsRow
          onSelectRelationshipSuggestion={onSelectRelationshipSuggestion}
          view={relationshipSuggestions}
        />
      ) : null}
    </>
  );
}

function ContactsOverviewScreen() {
  return (
    <AppScreen eyebrow="人脉总览" title="人脉">
      <ContactsOverviewContent />
    </AppScreen>
  );
}

function ContactsListScreen() {
  const router = useRouter();
  const { baseUrl } = useOrbitApiBaseUrl();
  const {
    q: queryAliasParam,
    query: queryParam,
    refreshToken,
    source: sourceParam,
    status: statusParam,
    tag: tagParam,
    value: valueParam
  } = useLocalSearchParams<{
    q?: string | string[];
    query?: string | string[];
    refreshToken?: string | string[];
    source?: string | string[];
    status?: string | string[];
    tag?: string | string[];
    value?: string | string[];
  }>();
  const client = useOrbitApiClient();
  const contactRefreshToken = Array.isArray(refreshToken)
    ? refreshToken[0]
    : refreshToken;
  const [query, setQuery] = useState(
    firstRouteParam(queryParam) || firstRouteParam(queryAliasParam)
  );
  const [selectedStatus, setSelectedStatus] =
    useState<ContactListStatusFilter | null>(
      initialStatusFilter(statusParam)
    );
  const [selectedSourceFilters, setSelectedSourceFilters] = useState<string[]>(
    initialListFilterValues(sourceParam)
  );
  const [selectedTagFilters, setSelectedTagFilters] = useState<string[]>(
    initialListFilterValues(tagParam)
  );
  const [selectedValueFilters, setSelectedValueFilters] = useState<string[]>(
    initialListFilterValues(valueParam)
  );
  const [selectedRelationshipIntent, setSelectedRelationshipIntent] = useState<
    string | null
  >(null);
  const [selectedRelationshipIndustries, setSelectedRelationshipIndustries] =
    useState<string[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchResult, setSearchResult] = useState<ContactsSearchView | null>(
    null
  );
  const [searching, setSearching] = useState(false);
  const [relationshipSearchError, setRelationshipSearchError] = useState<
    string | null
  >(null);
  const [relationshipSearchResult, setRelationshipSearchResult] =
    useState<RelationshipSearchView | null>(null);
  const [relationshipSearching, setRelationshipSearching] = useState(false);
  const [recentRelationshipSearches, setRecentRelationshipSearches] = useState<
    RecentRelationshipSearch[]
  >([]);
  const contactsPath = useMemo(
    () =>
      contactsListPath({
        query,
        sourceFilters: selectedSourceFilters,
        status: selectedStatus,
        tagFilters: selectedTagFilters,
        valueFilters: selectedValueFilters
      }),
    [
      query,
      selectedSourceFilters,
      selectedStatus,
      selectedTagFilters,
      selectedValueFilters
    ]
  );
  const state = useApiResource<unknown>(
    contactsPath,
    (data) => contactsToSummaries(data).length === 0
  );
  const relationshipSuggestionsState = useApiResource<unknown>(
    ORBIT_API_ENDPOINTS.relationshipSearchSuggestions,
    (data) => relationshipSearchSuggestionsToView(data).suggestions.length === 0
  );
  const contactData = hasContactData(state) ? state.data : null;
  const relationshipSuggestions =
    hasContactData(relationshipSuggestionsState)
      ? relationshipSearchSuggestionsToView(relationshipSuggestionsState.data)
      : null;
  const statusOptions = contactStatusFilterOptions(contactData, selectedStatus);
  const advancedFilterSections = contactSearchFilterSections(contactData, {
    sourceFilters: selectedSourceFilters,
    tagFilters: selectedTagFilters,
    valueFilters: selectedValueFilters
  });
  const hasAdvancedFilters =
    selectedSourceFilters.length > 0 ||
    selectedTagFilters.length > 0 ||
    selectedValueFilters.length > 0;
  const contacts = state.kind === "success" ? contactsToSummaries(state.data) : [];
  const openContact = (id: string) =>
    router.push({
      params: { id },
      pathname: "/contacts/[id]"
    });

  useEffect(() => {
    if (!contactRefreshToken) {
      return;
    }

    state.refresh();
    relationshipSuggestionsState.refresh();
  }, [
    contactRefreshToken,
    relationshipSuggestionsState.refresh,
    state.refresh
  ]);

  function toggleAdvancedFilter(kind: ContactSearchFilterKind, value: string) {
    if (kind === "source") {
      setSelectedSourceFilters((current) =>
        toggleContactSearchFilter(current, value)
      );
      return;
    }

    if (kind === "tag") {
      setSelectedTagFilters((current) =>
        toggleContactSearchFilter(current, value)
      );
      return;
    }

    setSelectedValueFilters((current) =>
      toggleContactSearchFilter(current, value)
    );
  }

  function selectRelationshipIntent(value: string) {
    setSelectedRelationshipIntent((current) =>
      current === value ? null : value
    );
    setRelationshipSearchError(null);
  }

  function toggleRelationshipIndustryFilter(value: string) {
    setSelectedRelationshipIndustries((current) =>
      toggleContactSearchFilter(current, value)
    );
    setRelationshipSearchError(null);
  }

  function onSelectRelationshipSuggestion(
    suggestion: RelationshipSearchSuggestionView
  ) {
    setQuery(suggestion.query);
    setSelectedRelationshipIntent(suggestion.request.body.businessIntent ?? null);
    setSelectedRelationshipIndustries(
      suggestion.request.body.industryFilters ?? []
    );
    setSearchError(null);
    setRelationshipSearchError(null);
    setSearchResult(null);
    void runRelationshipSearch(suggestion.request.body, {
      rememberRecent: true
    });
  }

  function onSelectRecentRelationshipSearch(search: RecentRelationshipSearch) {
    setQuery(search.body.query ?? "");
    setSelectedRelationshipIntent(search.body.businessIntent ?? null);
    setSelectedRelationshipIndustries(search.body.industryFilters ?? []);
    setSearchError(null);
    setRelationshipSearchError(null);
    setSearchResult(null);
    void runRelationshipSearch(search.body, {
      rememberRecent: true
    });
  }

  function rememberRelationshipSearch(body: RelationshipSearchRequestBody) {
    const recentSearch = relationshipSearchToRecent(body);

    if (!recentSearch) {
      return;
    }

    setRecentRelationshipSearches((current) =>
      upsertRecentRelationshipSearch(current, recentSearch)
    );
  }

  function relationshipFollowUpStatusFilters(): string[] {
    if (selectedStatus === "active" || selectedStatus === "needs_follow_up") {
      return [selectedStatus];
    }

    if (selectedStatus === "nurture") {
      return ["dormant"];
    }

    return [];
  }

  async function runRelationshipSearch(
    input?: RelationshipSearchRequestBody,
    options: RunRelationshipSearchOptions = {}
  ) {
    const request = buildRelationshipSearchRequest(
      input ?? {
        businessIntent: selectedRelationshipIntent,
        followUpStatusFilters: relationshipFollowUpStatusFilters(),
        industryFilters: selectedRelationshipIndustries,
        query,
        sourceFilters: selectedSourceFilters,
        valueTypeFilters: selectedValueFilters
      }
    );

    if (!request.success) {
      setRelationshipSearchError(request.error);
      setRelationshipSearchResult(null);
      return;
    }

    setRelationshipSearching(true);
    setRelationshipSearchError(null);
    setSearchResult(null);

    try {
      const result = await client.post<unknown>(ORBIT_API_ENDPOINTS.relationshipSearch, {
        body: request.request.body
      });

      if (result.success) {
        setRelationshipSearchResult(relationshipSearchToView(result.data));
        if (options.rememberRecent) {
          rememberRelationshipSearch(request.request.body);
        }
        return;
      }

      setRelationshipSearchError(result.error.message);
      setRelationshipSearchResult(null);
    } finally {
      setRelationshipSearching(false);
    }
  }

  async function runDeepSearch() {
    const request = buildContactsSearchRequest({
      query,
      sourceFilters: selectedSourceFilters,
      status: selectedStatus,
      tagFilters: selectedTagFilters,
      valueFilters: selectedValueFilters
    });

    if (!request.success) {
      setSearchError(request.error);
      setSearchResult(null);
      return;
    }

    setSearching(true);
    setSearchError(null);
    setRelationshipSearchResult(null);

    try {
      const result = await client.post<unknown>(ORBIT_API_ENDPOINTS.contactsSearch, {
        body: request.request.body
      });

      if (result.success) {
        setSearchResult(contactsSearchToView(result.data));
        return;
      }

      setSearchError(result.error.message);
      setSearchResult(null);
    } finally {
      setSearching(false);
    }
  }

  return (
    <AppScreen
      eyebrow="联系人"
      refreshControl={
        <RefreshControl
          onRefresh={() => {
            state.refresh();
            relationshipSuggestionsState.refresh();
          }}
          refreshing={state.refreshing || relationshipSuggestionsState.refreshing}
          tintColor={colors.accent}
        />
      }
      title="联系人列表"
    >
      <ContactsListContent
        advancedFilterSections={advancedFilterSections}
        baseUrl={baseUrl}
        contacts={contacts}
        hasAdvancedFilters={hasAdvancedFilters}
        onClearQuery={() => {
          setQuery("");
          setSearchError(null);
          setRelationshipSearchError(null);
          setRelationshipSearchResult(null);
        }}
        onOpenContact={openContact}
        onQueryChange={(text) => {
          setQuery(text);
          setRelationshipSearchError(null);
        }}
        onRelationshipIntentChange={selectRelationshipIntent}
        onRunDeepSearch={() => {
          void runDeepSearch();
        }}
        onRunRelationshipSearch={() => {
          void runRelationshipSearch(undefined, {
            rememberRecent: true
          });
        }}
        onSelectRecentRelationshipSearch={onSelectRecentRelationshipSearch}
        onSelectRelationshipSuggestion={onSelectRelationshipSuggestion}
        onStatusChange={setSelectedStatus}
        onToggleAdvancedFilter={toggleAdvancedFilter}
        onToggleRelationshipIndustry={toggleRelationshipIndustryFilter}
        query={query}
        recentRelationshipSearches={recentRelationshipSearches}
        relationshipSearchError={relationshipSearchError}
        relationshipSearchResult={relationshipSearchResult}
        relationshipSearching={relationshipSearching}
        relationshipSuggestions={relationshipSuggestions}
        searchError={searchError}
        searchResult={searchResult}
        searching={searching}
        selectedRelationshipIndustries={selectedRelationshipIndustries}
        selectedRelationshipIntent={selectedRelationshipIntent}
        selectedStatus={selectedStatus}
        state={state}
        statusOptions={statusOptions}
      />
    </AppScreen>
  );
}

export function ContactsScreen({
  mode = "overview"
}: {
  mode?: ContactsScreenMode;
} = {}) {
  return mode === "overview" ? <ContactsOverviewScreen /> : <ContactsListScreen />;
}

const styles = StyleSheet.create({
  advancedFilterSection: {
    gap: spacing.xs
  },
  advancedFilterTitle: {
    color: colors.text3,
    fontSize: typography.caption,
    fontWeight: "800",
    lineHeight: 16
  },
  avatar: {
    alignItems: "center",
    borderRadius: radius.pill,
    height: 52,
    justifyContent: "center",
    overflow: "hidden",
    width: 52
  },
  avatarImage: {
    height: "100%",
    width: "100%"
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
  contactsLibraryAction: {
    alignItems: "center",
    flexDirection: "row",
    gap: 2
  },
  contactsLibraryActionText: {
    color: colors.text3,
    fontSize: typography.caption,
    fontWeight: "800",
    lineHeight: 17
  },
  contactsLibraryDetail: {
    color: colors.text3,
    fontSize: typography.caption,
    lineHeight: 17
  },
  contactsLibraryEntry: {
    alignItems: "center",
    borderTopColor: colors.border2,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.xs,
    paddingTop: spacing.sm
  },
  contactsLibraryText: {
    flex: 1,
    gap: 2,
    minWidth: 0
  },
  contactsLibraryTitle: {
    color: colors.text,
    fontSize: typography.caption,
    fontWeight: "800",
    lineHeight: 17
  },
  deepSearchButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.accent,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: 7,
    minHeight: 38,
    paddingHorizontal: 14
  },
  deepSearchButtonDisabled: {
    opacity: 0.62
  },
  deepSearchButtonPressed: {
    opacity: 0.84,
    transform: [{ translateY: 0.5 }]
  },
  deepSearchButtonText: {
    color: colors.onAccent,
    fontSize: typography.small,
    fontWeight: "800",
    lineHeight: 18
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
  networkPriorityAction: {
    alignItems: "center",
    flexDirection: "row",
    gap: 3
  },
  networkPriorityActionText: {
    color: colors.text2,
    fontSize: typography.caption,
    fontWeight: "800",
    lineHeight: 17
  },
  networkPriorityActionTextInverted: {
    color: colors.onAccent
  },
  networkPriorityCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: 1,
    flexBasis: 158,
    flexGrow: 1,
    gap: spacing.md,
    minHeight: 174,
    padding: spacing.lg
  },
  networkPriorityCardInverted: {
    backgroundColor: colors.ink,
    borderColor: colors.ink
  },
  networkPriorityCopy: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0
  },
  networkPriorityDetail: {
    color: colors.text3,
    fontSize: typography.small,
    lineHeight: 19
  },
  networkPriorityDetailInverted: {
    color: "rgba(255,255,255,0.72)"
  },
  networkPriorityFooter: {
    gap: spacing.xs
  },
  networkPriorityIcon: {
    alignItems: "center",
    borderRadius: radius.control,
    height: 42,
    justifyContent: "center",
    width: 42
  },
  networkPriorityIconInverted: {
    backgroundColor: "rgba(255,255,255,0.12)"
  },
  networkPriorityMetric: {
    color: colors.ink,
    fontSize: typography.caption,
    fontWeight: "900",
    lineHeight: 17
  },
  networkPriorityMetricInverted: {
    color: colors.onAccent
  },
  networkPrioritySignal: {
    color: colors.text3,
    fontSize: typography.caption,
    fontWeight: "700",
    lineHeight: 17
  },
  networkPrioritySignalInverted: {
    color: "rgba(255,255,255,0.62)"
  },
  networkPriorityStage: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  networkPriorityTitle: {
    color: colors.ink,
    fontSize: typography.section,
    fontWeight: "900",
    lineHeight: 22
  },
  networkPriorityTitleInverted: {
    color: colors.onAccent
  },
  networkPriorityTopRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  overviewToolActionRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 3,
    marginTop: "auto"
  },
  overviewToolActionText: {
    color: colors.text2,
    fontSize: typography.caption,
    fontWeight: "800",
    lineHeight: 17
  },
  overviewToolCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.control,
    borderWidth: 1,
    flexBasis: "48%",
    flexGrow: 1,
    gap: spacing.sm,
    minHeight: 138,
    padding: spacing.md
  },
  overviewToolCardPrimary: {
    flexBasis: "100%",
    minHeight: 116,
    padding: spacing.lg
  },
  overviewToolDetail: {
    color: colors.text3,
    fontSize: typography.caption,
    lineHeight: 17
  },
  overviewToolGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  overviewToolIcon: {
    alignItems: "center",
    borderRadius: radius.control,
    height: 38,
    justifyContent: "center",
    width: 38
  },
  overviewToolText: {
    flex: 1,
    gap: 4,
    minWidth: 0
  },
  overviewToolTitle: {
    color: colors.ink,
    fontSize: typography.body,
    fontWeight: "800",
    lineHeight: 20
  },
  recentRelationshipSearchChip: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border2,
    borderRadius: radius.control,
    borderWidth: 1,
    flexDirection: "row",
    flexGrow: 1,
    flexShrink: 1,
    gap: 7,
    minHeight: 44,
    minWidth: 0,
    paddingHorizontal: 11,
    paddingVertical: 8
  },
  recentRelationshipSearchDetail: {
    color: colors.text3,
    fontSize: typography.caption,
    lineHeight: 16
  },
  recentRelationshipSearchLabel: {
    color: colors.text,
    fontSize: typography.caption,
    fontWeight: "800",
    lineHeight: 16
  },
  recentRelationshipSearchList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs
  },
  recentRelationshipSearches: {
    gap: spacing.xs
  },
  recentRelationshipSearchesHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between"
  },
  recentRelationshipSearchesMeta: {
    color: colors.text4,
    fontSize: typography.caption,
    lineHeight: 16
  },
  recentRelationshipSearchesTitle: {
    color: colors.text2,
    fontSize: typography.caption,
    fontWeight: "800",
    lineHeight: 16
  },
  recentRelationshipSearchText: {
    flex: 1,
    gap: 1,
    minWidth: 0
  },
  relationshipText: {
    color: colors.text,
    fontSize: typography.small,
    lineHeight: 20
  },
  relationshipSearchButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.surface,
    borderColor: colors.accent,
    borderRadius: radius.control,
    borderWidth: 1,
    flexDirection: "row",
    gap: 7,
    minHeight: 38,
    paddingHorizontal: 14
  },
  relationshipSearchButtonText: {
    color: colors.accent,
    fontSize: typography.small,
    fontWeight: "800",
    lineHeight: 18
  },
  relationshipSearchEvidence: {
    color: colors.text2,
    fontSize: typography.caption,
    lineHeight: 18
  },
  relationshipSearchScore: {
    color: colors.accent,
    fontSize: typography.small,
    fontWeight: "900",
    lineHeight: 18
  },
  relationshipSearchScoreLabel: {
    color: colors.text3,
    fontSize: 10,
    fontWeight: "800",
    lineHeight: 13
  },
  relationshipSearchScorePill: {
    alignItems: "center",
    backgroundColor: colors.accentSofter,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    minWidth: 52,
    paddingHorizontal: 8,
    paddingVertical: 5
  },
  relationshipSuggestionChip: {
    backgroundColor: colors.surface,
    borderColor: colors.border2,
    borderRadius: radius.md,
    borderWidth: 1,
    flexBasis: "100%",
    flexGrow: 1,
    gap: 5,
    minHeight: 104,
    padding: spacing.md
  },
  relationshipSuggestionDetail: {
    color: colors.accent,
    fontSize: typography.caption,
    fontWeight: "800",
    lineHeight: 16
  },
  relationshipSuggestionHint: {
    color: colors.text3,
    fontSize: typography.caption,
    lineHeight: 17
  },
  relationshipSuggestionList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    paddingRight: spacing.sm
  },
  relationshipSuggestionQuery: {
    color: colors.ink,
    fontSize: typography.small,
    fontWeight: "800",
    lineHeight: 18
  },
  relationshipSuggestions: {
    gap: spacing.sm
  },
  relationshipSuggestionsHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between"
  },
  relationshipSuggestionsMeta: {
    color: colors.text3,
    fontSize: typography.caption,
    lineHeight: 16
  },
  relationshipSuggestionsNext: {
    color: colors.text3,
    fontSize: typography.caption,
    lineHeight: 17
  },
  relationshipSuggestionsTitle: {
    color: colors.ink,
    fontSize: typography.small,
    fontWeight: "800",
    lineHeight: 18
  },
  searchInput: {
    color: colors.text,
    flex: 1,
    fontSize: typography.body,
    lineHeight: 20,
    paddingVertical: 10
  },
  searchActionRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  searchEmptyText: {
    color: colors.text3,
    fontSize: typography.small,
    lineHeight: 20
  },
  searchErrorText: {
    color: colors.rose,
    flexShrink: 1,
    fontSize: typography.caption,
    fontWeight: "700",
    lineHeight: 18
  },
  searchFilterText: {
    color: colors.text3,
    fontSize: typography.caption,
    lineHeight: 18
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
  searchResultAvatar: {
    alignItems: "center",
    borderRadius: radius.pill,
    flexShrink: 0,
    height: 42,
    justifyContent: "center",
    overflow: "hidden",
    width: 42
  },
  searchResultAvatarImage: {
    height: "100%",
    width: "100%"
  },
  searchResultAvatarText: {
    fontSize: typography.body,
    fontWeight: "800",
    lineHeight: 21
  },
  searchResultDetail: {
    color: colors.text3,
    fontSize: typography.caption,
    lineHeight: 18
  },
  searchResultHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.sm
  },
  searchResultItem: {
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md
  },
  searchResultItemPressed: {
    opacity: 0.84,
    transform: [{ translateY: 0.5 }]
  },
  searchResultLead: {
    color: colors.text,
    fontSize: typography.small,
    lineHeight: 20
  },
  searchResultName: {
    color: colors.ink,
    fontSize: typography.body,
    fontWeight: "800",
    lineHeight: 20
  },
  searchResultScore: {
    color: colors.accent,
    fontSize: typography.caption,
    fontWeight: "900",
    lineHeight: 18
  },
  searchResultStack: {
    gap: spacing.sm
  },
  searchResultTitleBlock: {
    flex: 1,
    gap: 2,
    minWidth: 0
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
