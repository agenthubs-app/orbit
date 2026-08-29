import { Ionicons } from "@expo/vector-icons";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import {
  type ComponentProps,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
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
  contactDimensionFilterOptions,
  contactDimensionStatusFilters,
  contactSearchFilterSections,
  contactsSearchToView,
  contactsToSummaries,
  filterContactListPayloadByDimensions,
  type ContactActionStateFilter,
  type ContactAvatarTone,
  type ContactListStatusFilter,
  type ContactRelationshipProgressFilter,
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
type ContactFilterMenuId = "action" | "industry" | "more" | "progress";
type IoniconName = ComponentProps<typeof Ionicons>["name"];
type NetworkPriorityRoute = "/contacts/dashboard";
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
  { label: "找会后联系", value: "recover_event_follow_up" },
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
  hasFilters: boolean
): string {
  if (query.trim() || hasFilters) {
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
      accessibilityState={{ selected: option.selected }}
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

function ContactFilterToolbar({
  actionStateOptions,
  advancedFilterSections,
  onActionStateChange,
  onRelationshipProgressChange,
  onToggleAdvancedFilter,
  onToggleRelationshipIndustry,
  relationshipProgressOptions,
  selectedActionState,
  selectedRelationshipIndustries,
  selectedRelationshipProgress
}: {
  actionStateOptions: ContactStatusFilterOption[];
  advancedFilterSections: ContactSearchFilterSectionView[];
  onActionStateChange: (status: ContactActionStateFilter | null) => void;
  onRelationshipProgressChange: (
    status: ContactRelationshipProgressFilter | null
  ) => void;
  onToggleAdvancedFilter: (
    kind: ContactSearchFilterKind,
    value: string
  ) => void;
  onToggleRelationshipIndustry: (value: string) => void;
  relationshipProgressOptions: ContactStatusFilterOption[];
  selectedActionState: ContactActionStateFilter | null;
  selectedRelationshipIndustries: string[];
  selectedRelationshipProgress: ContactRelationshipProgressFilter | null;
}) {
  const [activeMenu, setActiveMenu] = useState<ContactFilterMenuId | null>(null);
  const advancedCount = advancedFilterSections.reduce(
    (total, section) =>
      total + section.options.filter((option) => option.selected).length,
    0
  );
  const menuItems: Array<{
    count: number;
    id: ContactFilterMenuId;
    label: string;
  }> = [
    { count: selectedRelationshipIndustries.length, id: "industry", label: "行业" },
    {
      count: selectedRelationshipProgress ? 1 : 0,
      id: "progress",
      label: "进展"
    },
    { count: selectedActionState ? 1 : 0, id: "action", label: "行动" },
    { count: advancedCount, id: "more", label: "更多" }
  ];

  return (
    <View style={styles.filterToolbar}>
      <View style={styles.filterToolbarRow}>
        {menuItems.map((item) => {
          const active = activeMenu === item.id;
          const selected = item.count > 0;

          return (
            <Pressable
              accessibilityLabel={`${item.label}筛选${
                selected ? `，已选 ${item.count} 项` : ""
              }`}
              accessibilityRole="button"
              accessibilityState={{ expanded: activeMenu === item.id }}
              key={item.id}
              onPress={() =>
                setActiveMenu((current) => (current === item.id ? null : item.id))
              }
              style={({ pressed }) => [
                styles.filterToolbarButton,
                active ? styles.filterToolbarButtonActive : null,
                pressed ? styles.filterToolbarButtonPressed : null
              ]}
            >
              <Text
                numberOfLines={1}
                style={[
                  styles.filterToolbarButtonText,
                  active || selected ? styles.filterToolbarButtonTextActive : null
                ]}
              >
                {item.label}
              </Text>
              {selected ? (
                <Text style={styles.filterToolbarCount}>{item.count}</Text>
              ) : null}
              <Ionicons
                color={active || selected ? colors.accent : colors.text4}
                name={active ? "chevron-up" : "chevron-down"}
                size={13}
              />
            </Pressable>
          );
        })}
      </View>

      {activeMenu ? (
        <View style={styles.filterToolbarPanel}>
          {activeMenu === "industry" ? (
            <ScrollView
              contentContainerStyle={styles.filterList}
              horizontal
              showsHorizontalScrollIndicator={false}
            >
              {relationshipIndustryOptions.map((option) => {
                const selected = selectedRelationshipIndustries.includes(
                  option.value
                );

                return (
                  <Pressable
                    accessibilityState={{ selected }}
                    accessibilityRole="button"
                    key={option.value}
                    onPress={() => onToggleRelationshipIndustry(option.value)}
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
          ) : null}

          {activeMenu === "progress" ? (
            <ScrollView
              contentContainerStyle={styles.filterList}
              horizontal
              showsHorizontalScrollIndicator={false}
            >
              {relationshipProgressOptions.map((option) => (
                <StatusFilterChip
                  key={option.value ?? "all"}
                  onPress={() =>
                    onRelationshipProgressChange(
                      option.value === "active" ||
                        option.value === "archived" ||
                        option.value === "nurture"
                        ? option.value
                        : null
                    )
                  }
                  option={option}
                />
              ))}
            </ScrollView>
          ) : null}

          {activeMenu === "action" ? (
            <ScrollView
              contentContainerStyle={styles.filterList}
              horizontal
              showsHorizontalScrollIndicator={false}
            >
              {actionStateOptions.map((option) => (
                <StatusFilterChip
                  key={option.value ?? "all"}
                  onPress={() =>
                    onActionStateChange(
                      option.value === "needs_follow_up" ? option.value : null
                    )
                  }
                  option={option}
                />
              ))}
            </ScrollView>
          ) : null}

          {activeMenu === "more" ? (
            <View style={styles.filterToolbarMoreSections}>
              {advancedFilterSections.map((section) => (
                <View key={section.key} style={styles.filterToolbarMoreSection}>
                  <Text style={styles.filterToolbarPanelTitle}>
                    {section.title}
                  </Text>
                  <ScrollView
                    contentContainerStyle={styles.filterList}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                  >
                    {section.options.map((option) => (
                      <Pressable
                        accessibilityState={{ selected: option.selected }}
                        accessibilityRole="button"
                        key={option.value}
                        onPress={() =>
                          onToggleAdvancedFilter(section.key, option.value)
                        }
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
                            option.selected
                              ? styles.filterChipTextSelected
                              : null
                          ]}
                        >
                          {option.label}
                        </Text>
                        <Text
                          style={[
                            styles.filterChipCount,
                            option.selected
                              ? styles.filterChipTextSelected
                              : null
                          ]}
                        >
                          {option.count}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function ContactCard({
  baseUrl,
  contact,
  isLast,
  onPress
}: {
  baseUrl: string;
  contact: ContactSummary;
  isLast: boolean;
  onPress: () => void;
}) {
  const avatar = contactAvatarFor(contact);
  const toneStyle = avatarToneStyles[avatar.tone];
  const detail = contactDetail(contact);
  const identityDetail = [contact.organization, contact.role]
    .filter(Boolean)
    .join(" · ");
  const contactAccessibilityLabel = `${contact.name}，${detail}，打开联系人详情`;

  return (
    <Pressable
      accessibilityLabel={contactAccessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.contactCard,
        isLast ? styles.contactCardLast : null,
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
          {identityDetail ? (
            <Text numberOfLines={1} style={styles.contactDetail}>
              {identityDetail}
            </Text>
          ) : null}
        </View>
        {contact.valueScore === null ? null : (
          <Text style={styles.contactMatchScore}>{contact.valueScore}</Text>
        )}
        <Ionicons color={colors.text4} name="chevron-forward" size={16} />
      </View>
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
      <View style={styles.contactsLibraryIcon}>
        <Ionicons color={colors.accent} name="people-outline" size={24} />
      </View>
      <View style={styles.contactsLibraryText}>
        <Text style={styles.contactsLibraryTitle}>联系人库</Text>
        <Text numberOfLines={2} style={styles.contactsLibraryDetail}>
          {contactsLabel}
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
  route,
  title
}: {
  action: string;
  detail: string;
  iconName: IoniconName;
  route: NetworkPriorityRoute;
  title: string;
}) {
  const router = useRouter();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(route as Href)}
      style={({ pressed }) => [
        styles.contactsLibraryEntry,
        pressed ? styles.contactCardPressed : null
      ]}
    >
      <View style={styles.contactsLibraryIcon}>
        <Ionicons color={colors.accent} name={iconName} size={24} />
      </View>
      <View style={styles.contactsLibraryText}>
        <Text numberOfLines={1} style={styles.contactsLibraryTitle}>
          {title}
        </Text>
        <Text numberOfLines={2} style={styles.contactsLibraryDetail}>
          {detail}
        </Text>
      </View>
      <View style={styles.contactsLibraryAction}>
        <Text style={styles.contactsLibraryActionText}>{action}</Text>
        <Ionicons color={colors.text3} name="chevron-forward" size={15} />
      </View>
    </Pressable>
  );
}

function PriorityNetworkTools() {
  return (
    <NetworkPriorityCard
      action="查看"
      detail="结构、机会与关系质量"
      iconName="analytics-outline"
      route="/contacts/dashboard"
      title="人脉分析"
    />
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
      <ContactsLibraryEntry
        contactsLabel={contactsLabel}
        onPress={() => router.push("/contacts/list" as Href)}
      />
      <PriorityNetworkTools />
      <OverviewToolGrid>
        <OverviewToolCard
          action="看下一步"
          detail="推进中、长期维护、已合作"
          iconName="list-outline"
          onPress={() => router.push("/contacts/pipeline" as Href)}
          title="关系进展"
          tone="amber"
        />
        <OverviewToolCard
          action="开始添加"
          detail="名片、QR、手动记录"
          iconName="add-circle-outline"
          onPress={() => router.push("/contacts/new")}
          title="添加人脉"
          tone="accent"
        />
      </OverviewToolGrid>
    </>
  );
}

function ContactsListContent({
  actionStateOptions,
  advancedFilterSections,
  baseUrl,
  contacts,
  hasListFilters,
  onActionStateChange,
  onClearQuery,
  onOpenContact,
  onQueryChange,
  onRunDeepSearch,
  onRunRelationshipSearch,
  onSelectRecentRelationshipSearch,
  onSelectRelationshipSuggestion,
  onRelationshipProgressChange,
  onToggleAdvancedFilter,
  onToggleRelationshipIndustry,
  query,
  recentRelationshipSearches,
  relationshipSearchError,
  relationshipSearchResult,
  relationshipSearching,
  relationshipSuggestions,
  relationshipProgressOptions,
  searchError,
  searchResult,
  searching,
  selectedActionState,
  selectedRelationshipIndustries,
  selectedRelationshipProgress,
  state
}: {
  actionStateOptions: ContactStatusFilterOption[];
  advancedFilterSections: ContactSearchFilterSectionView[];
  baseUrl: string;
  contacts: ContactSummary[];
  hasListFilters: boolean;
  onActionStateChange: (status: ContactActionStateFilter | null) => void;
  onClearQuery: () => void;
  onOpenContact: (id: string) => void;
  onQueryChange: (text: string) => void;
  onRunDeepSearch: () => void;
  onRunRelationshipSearch: () => void;
  onSelectRecentRelationshipSearch: (search: RecentRelationshipSearch) => void;
  onSelectRelationshipSuggestion: (
    suggestion: RelationshipSearchSuggestionView
  ) => void;
  onRelationshipProgressChange: (
    status: ContactRelationshipProgressFilter | null
  ) => void;
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
  relationshipProgressOptions: ContactStatusFilterOption[];
  searchError: string | null;
  searchResult: ContactsSearchView | null;
  searching: boolean;
  selectedActionState: ContactActionStateFilter | null;
  selectedRelationshipIndustries: string[];
  selectedRelationshipProgress: ContactRelationshipProgressFilter | null;
  state: ReturnType<typeof useApiResource<unknown>>;
}) {
  const loadedWithoutContacts =
    (state.kind === "empty" || state.kind === "success") &&
    contacts.length === 0;

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
        <ContactFilterToolbar
          actionStateOptions={actionStateOptions}
          advancedFilterSections={advancedFilterSections}
          onActionStateChange={onActionStateChange}
          onRelationshipProgressChange={onRelationshipProgressChange}
          onToggleAdvancedFilter={onToggleAdvancedFilter}
          onToggleRelationshipIndustry={onToggleRelationshipIndustry}
          relationshipProgressOptions={relationshipProgressOptions}
          selectedActionState={selectedActionState}
          selectedRelationshipIndustries={selectedRelationshipIndustries}
          selectedRelationshipProgress={selectedRelationshipProgress}
        />
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
      {loadedWithoutContacts ? (
        <EmptyState
          message={emptyMessage(query, hasListFilters)}
          title={
            query.trim() || hasListFilters
              ? "没有匹配的人脉"
              : "暂无联系人"
          }
        />
      ) : null}
      {contacts.length > 0 ? (
        <View style={styles.contactList}>
          {contacts.map((contact, index) => (
            <ContactCard
              baseUrl={baseUrl}
              contact={contact}
              isLast={index === contacts.length - 1}
              key={contact.id}
              onPress={() => onOpenContact(contact.id)}
            />
          ))}
        </View>
      ) : null}
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
    <AppScreen title="人脉">
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
  const previousContactRefreshToken = useRef(contactRefreshToken);
  const initialStatus = initialStatusFilter(statusParam);
  const [query, setQuery] = useState(
    firstRouteParam(queryParam) || firstRouteParam(queryAliasParam)
  );
  const [selectedRelationshipProgress, setSelectedRelationshipProgress] =
    useState<ContactRelationshipProgressFilter | null>(
      initialStatus === "active" ||
        initialStatus === "archived" ||
        initialStatus === "nurture"
        ? initialStatus
        : null
    );
  const [selectedActionState, setSelectedActionState] =
    useState<ContactActionStateFilter | null>(
      initialStatus === "needs_follow_up" ? initialStatus : null
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
  const dimensionStatusFilters = contactDimensionStatusFilters({
    actionState: selectedActionState,
    relationshipProgress: selectedRelationshipProgress
  });
  const contactsPath = useMemo(
    () =>
      contactsListPath({
        query,
        sourceFilters: selectedSourceFilters,
        statusFilters: dimensionStatusFilters,
        tagFilters: selectedTagFilters,
        valueFilters: selectedValueFilters
      }),
    [
      query,
      dimensionStatusFilters.join(","),
      selectedSourceFilters,
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
  const dimensionFilterOptions = contactDimensionFilterOptions(contactData, {
    actionState: selectedActionState,
    relationshipProgress: selectedRelationshipProgress
  });
  const advancedFilterSections = contactSearchFilterSections(contactData, {
    sourceFilters: selectedSourceFilters,
    tagFilters: selectedTagFilters,
    valueFilters: selectedValueFilters
  });
  const hasAdvancedFilters =
    selectedSourceFilters.length > 0 ||
    selectedTagFilters.length > 0 ||
    selectedValueFilters.length > 0;
  const hasListFilters =
    hasAdvancedFilters ||
    selectedActionState !== null ||
    selectedRelationshipProgress !== null;
  const filteredContactData = filterContactListPayloadByDimensions(contactData, {
    actionState: selectedActionState,
    relationshipProgress: selectedRelationshipProgress
  });
  const contacts = contactData ? contactsToSummaries(filteredContactData) : [];
  const openContact = (id: string) =>
    router.push({
      params: { id },
      pathname: "/contacts/[id]"
    });

  useEffect(() => {
    if (!contactRefreshToken) {
      previousContactRefreshToken.current = contactRefreshToken;
      return;
    }

    if (previousContactRefreshToken.current === contactRefreshToken) {
      return;
    }

    previousContactRefreshToken.current = contactRefreshToken;
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
    if (selectedActionState === "needs_follow_up") {
      return ["needs_follow_up"];
    }

    if (selectedRelationshipProgress === "active") {
      return ["active"];
    }

    if (selectedRelationshipProgress === "nurture") {
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
      statusFilters: dimensionStatusFilters,
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
        setSearchResult(
          contactsSearchToView(
            filterContactListPayloadByDimensions(result.data, {
              actionState: selectedActionState,
              relationshipProgress: selectedRelationshipProgress
            })
          )
        );
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
        actionStateOptions={dimensionFilterOptions.actionState}
        advancedFilterSections={advancedFilterSections}
        baseUrl={baseUrl}
        contacts={contacts}
        hasListFilters={hasListFilters}
        onActionStateChange={setSelectedActionState}
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
        onRelationshipProgressChange={setSelectedRelationshipProgress}
        onToggleAdvancedFilter={toggleAdvancedFilter}
        onToggleRelationshipIndustry={toggleRelationshipIndustryFilter}
        query={query}
        recentRelationshipSearches={recentRelationshipSearches}
        relationshipSearchError={relationshipSearchError}
        relationshipSearchResult={relationshipSearchResult}
        relationshipSearching={relationshipSearching}
        relationshipSuggestions={relationshipSuggestions}
        relationshipProgressOptions={dimensionFilterOptions.relationshipProgress}
        searchError={searchError}
        searchResult={searchResult}
        searching={searching}
        selectedActionState={selectedActionState}
        selectedRelationshipIndustries={selectedRelationshipIndustries}
        selectedRelationshipProgress={selectedRelationshipProgress}
        state={state}
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
  avatar: {
    alignItems: "center",
    borderRadius: radius.pill,
    height: 44,
    justifyContent: "center",
    overflow: "hidden",
    width: 44
  },
  avatarImage: {
    height: "100%",
    width: "100%"
  },
  avatarText: {
    fontSize: typography.section,
    fontWeight: "800",
    lineHeight: 22
  },
  clearButton: {
    alignItems: "center",
    height: 32,
    justifyContent: "center",
    width: 32
  },
  filterToolbar: {
    gap: spacing.sm
  },
  filterToolbarButton: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border2,
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
  filterToolbarButtonActive: {
    backgroundColor: colors.accentSofter,
    borderColor: colors.accent
  },
  filterToolbarButtonPressed: {
    opacity: 0.8
  },
  filterToolbarButtonText: {
    color: colors.text2,
    flexShrink: 1,
    fontSize: typography.caption,
    fontWeight: "700",
    lineHeight: 17
  },
  filterToolbarButtonTextActive: {
    color: colors.accent,
  },
  filterToolbarCount: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 15
  },
  filterToolbarMoreSection: {
    gap: spacing.xs
  },
  filterToolbarMoreSections: {
    gap: spacing.md
  },
  filterToolbarPanel: {
    backgroundColor: colors.surface,
    borderColor: colors.border2,
    borderRadius: radius.control,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.sm
  },
  filterToolbarPanelTitle: {
    color: colors.text3,
    fontSize: typography.caption,
    fontWeight: "700",
    lineHeight: 17
  },
  filterToolbarRow: {
    flexDirection: "row",
    gap: spacing.xs
  },
  contactCard: {
    borderBottomColor: colors.border2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 68,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  contactCardLast: {
    borderBottomWidth: 0
  },
  contactCardPressed: {
    backgroundColor: colors.surface2
  },
  contactDetail: {
    color: colors.text3,
    fontSize: typography.caption,
    lineHeight: 17
  },
  contactHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm
  },
  contactList: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: 1,
    overflow: "hidden"
  },
  contactMatchScore: {
    color: colors.accent,
    fontSize: typography.caption,
    fontWeight: "900",
    lineHeight: 17,
    minWidth: 24,
    textAlign: "right"
  },
  contactName: {
    color: colors.ink,
    fontSize: typography.body,
    fontWeight: "800",
    lineHeight: 20
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
    color: colors.accent,
    fontSize: typography.caption,
    fontWeight: "800",
    lineHeight: 17
  },
  contactsLibraryDetail: {
    color: colors.text3,
    fontSize: typography.small,
    lineHeight: 19
  },
  contactsLibraryEntry: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 88,
    padding: spacing.md
  },
  contactsLibraryIcon: {
    alignItems: "center",
    backgroundColor: colors.accentSofter,
    borderRadius: radius.control,
    height: 46,
    justifyContent: "center",
    width: 46
  },
  contactsLibraryText: {
    flex: 1,
    gap: 2,
    minWidth: 0
  },
  contactsLibraryTitle: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: "800",
    lineHeight: 22
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
    fontWeight: "900"
  },
  valuePill: {
    alignItems: "center",
    backgroundColor: colors.accentSofter,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 32,
    minWidth: 42,
    paddingHorizontal: spacing.sm
  }
});
