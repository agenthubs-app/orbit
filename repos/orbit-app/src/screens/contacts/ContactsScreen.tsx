import { Ionicons } from "@expo/vector-icons";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import {
  type ComponentProps,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState
} from "react";
import {
  Image,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions
} from "react-native";
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { z } from "zod";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import type { OrbitLanguage } from "../../api/contract/language";
import { contactsListPath, ORBIT_API_ENDPOINTS } from "../../api/endpoints";
import { INDUSTRY_CATALOG, SECONDARY_INDUSTRY_CATALOG } from "../../api/domain/industries";
import { mobileContactsDashboardSectionSchemas } from "../../api/schema/mobile-contacts-dashboard";
import { validateApiResourceState } from "../../api/validated-resource-state";
import { AppScreen } from "../../components/AppScreen";
import { DataCard } from "../../components/DataCard";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { OrbitNavigationIcon } from "../../components/OrbitNavigationIcon";
import { layout, radius, spacing, textStyles, type OrbitColors } from "../../design/tokens";
import { createControlStyles } from "../../design/controls";
import { createThemedStyles, useOrbitTheme } from "../../design/theme";
import { useApiResource } from "../../hooks/useApiResource";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { createTranslator } from "../../i18n/messages";
import { ContactPage } from "./ContactPage";
import { ContactNeedsHomeEntry } from "./ContactNeedsHomeEntry";
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

type ContactsScreenMode = "list" | "overview" | "main";
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
const mainContactFont = Platform.select({ web: '-apple-system,BlinkMacSystemFont,"PingFang SC","Hiragino Sans GB","Noto Sans SC","Microsoft YaHei",sans-serif', ios: "System", default: "sans-serif" });
const mainContactsSchema = mobileContactsDashboardSectionSchemas.contacts.refine(value =>
  (value.state === "pending" || (value.state === "empty") === (value.contacts.length === 0)) &&
  new Set(value.contacts.map(contact => contact.id)).size === value.contacts.length
);
const mainContactsSearchSchema = mainContactsSchema.refine(value => value.state !== "pending");
// App-only validation of fields consumed by the relationship search view. The
// service owns its full contract; preserve additional fields without inventing results.
const mainRelationshipSearchSchema = z.object({
  state: z.enum(["success", "empty"]),
  query: z.string(),
  appliedFilters: z.object({
    businessIntent: z.string().nullable(),
    industries: z.array(z.string()), sources: z.array(z.string()),
    valueTypes: z.array(z.string()), followUpStatuses: z.array(z.string())
  }).passthrough(),
  results: z.array(z.object({
    id: z.string().trim().min(1), contactId: z.string().trim().min(1), displayName: z.string().trim().min(1),
    organization: z.string(), role: z.string(), industry: z.string(), location: z.string(),
    relationshipContext: z.string(), recommendedAction: z.string(),
    evidence: z.array(z.object({ excerpt: z.string() }).passthrough()),
    value: z.object({ valueTypes: z.array(z.string()) }).passthrough(),
    matchScore: z.object({ value: z.number().finite(), band: z.enum(["high", "medium", "low"]) }).passthrough()
  }).passthrough())
}).passthrough().refine(value =>
  (value.state === "empty") === (value.results.length === 0) &&
  new Set(value.results.map(result => result.id)).size === value.results.length
);

function relationshipFilterLabel(
  options: RelationshipFilterOption[],
  value?: string,
  language: OrbitLanguage = "zh"
): string {
  const option = options.find((entry) => entry.value === value);
  if (!option || language === "zh") return option?.label ?? "";
  const t = createTranslator(language);
  const keyByValue = {
    climate: "contacts.industryClimate",
    enterprise_saas: "contacts.industryEnterpriseSaas",
    explore_partnership: "contacts.intentPartnership",
    find_warm_intro: "contacts.intentWarmIntro",
    fintech: "contacts.industryFintech",
    healthcare: "contacts.industryHealthcare",
    mobility: "contacts.industryMobility",
    recover_event_follow_up: "contacts.intentEventFollowUp",
    source_customer_reference: "contacts.intentCustomerReference"
  } as const;
  return value && value in keyByValue ? t(keyByValue[value as keyof typeof keyByValue]) : option.label;
}

function relationshipSearchBodyId(body: RelationshipSearchRequestBody): string {
  return [
    body.query?.trim().toLowerCase() ?? "",
    body.businessIntent ?? "",
    ...(body.industryFilters ?? []),
    ...(body.primaryIndustryIds ?? []).map((id) => `primary:${id}`),
    ...(body.secondaryIndustryIds ?? []).map((id) => `secondary:${id}`),
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

  if (body.primaryIndustryIds?.length) {
    copy.primaryIndustryIds = [...body.primaryIndustryIds];
  }

  if (body.secondaryIndustryIds?.length) {
    copy.secondaryIndustryIds = [...body.secondaryIndustryIds];
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
  body: RelationshipSearchRequestBody,
  language: OrbitLanguage = "zh"
): string {
  const t = createTranslator(language);
  const queryLabel = body.query?.trim() || t("contacts.relationshipSearch");
  const intentLabel = relationshipFilterLabel(
    relationshipIntentOptions,
    body.businessIntent,
    language
  );
  const industryLabel = (body.industryFilters ?? [])
    .map((value) => relationshipFilterLabel(relationshipIndustryOptions, value, language))
    .filter(Boolean)
    .slice(0, 2)
    .join("、");

  const structuredIndustryLabel = body.secondaryIndustryIds?.length
    ? SECONDARY_INDUSTRY_CATALOG.filter((entry) => body.secondaryIndustryIds?.includes(entry.id))
        .map((entry) => entry.labels[language]).join(language === "en" ? ", " : "、")
    : INDUSTRY_CATALOG.filter((entry) => body.primaryIndustryIds?.includes(entry.id))
        .map((entry) => entry.labels[language]).join(language === "en" ? ", " : "、");

  return [queryLabel, intentLabel, structuredIndustryLabel, industryLabel].filter(Boolean).join(" · ");
}

function relationshipSearchRecentDetail(
  body: RelationshipSearchRequestBody,
  language: OrbitLanguage = "zh"
): string {
  const t = createTranslator(language);
  const filterCount =
    (body.sourceFilters ?? []).length +
    (body.valueTypeFilters ?? []).length +
    (body.followUpStatusFilters ?? []).length;

  if (filterCount > 0) {
    return t("contacts.listFilterCount", { count: filterCount });
  }

  return t("contacts.tapSearchAgain");
}

function relationshipSearchToRecent(
  body: RelationshipSearchRequestBody,
  language: OrbitLanguage = "zh"
): RecentRelationshipSearch | null {
  const id = relationshipSearchBodyId(body);

  if (!id.replace(/\|/gu, "").trim()) {
    return null;
  }

  return {
    body: relationshipSearchBodyCopy(body),
    detail: relationshipSearchRecentDetail(body, language),
    id,
    label: relationshipSearchRecentLabel(body, language)
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

const avatarToneStyles = (colors: OrbitColors): Record<
  ContactAvatarTone,
  { backgroundColor: string; color: string }
> => ({
  amber: { backgroundColor: colors.amberSoft, color: colors.amber },
  emerald: { backgroundColor: colors.liveSoft, color: colors.live },
  rose: { backgroundColor: colors.roseSoft, color: colors.rose },
  sky: { backgroundColor: colors.skySoft, color: colors.sky },
  violet: { backgroundColor: colors.accentSofter, color: colors.accent }
});

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
  hasFilters: boolean,
  language: OrbitLanguage = "zh"
): string {
  const t = createTranslator(language);
  if (query.trim() || hasFilters) {
    return t("contacts.emptyFilteredBody");
  }

  return t("contacts.emptyListBody");
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
  const { styles } = useStyles();
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
  onSelectPrimaryIndustry,
  onSelectSecondaryIndustry,
  relationshipProgressOptions,
  selectedActionState,
  selectedRelationshipIndustries,
  selectedPrimaryIndustryIds,
  selectedSecondaryIndustryIds,
  selectedRelationshipProgress,
  primary = false,
  onReset,
  onAnalysis,
  hasFilters = false
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
  onSelectPrimaryIndustry: (value: string) => void;
  onSelectSecondaryIndustry: (value: string) => void;
  relationshipProgressOptions: ContactStatusFilterOption[];
  selectedActionState: ContactActionStateFilter | null;
  selectedRelationshipIndustries: string[];
  selectedPrimaryIndustryIds: string[];
  selectedSecondaryIndustryIds: string[];
  selectedRelationshipProgress: ContactRelationshipProgressFilter | null;
  primary?: boolean;
  onReset?: () => void;
  onAnalysis?: () => void;
  hasFilters?: boolean;
}) {
  const { colors, styles } = useStyles();
  const locale = useOrbitLocale();
  const [activeMenu, setActiveMenu] = useState<ContactFilterMenuId | null>(null);
  const { width, fontScale } = useWindowDimensions();
  const filterScale = Math.max(1, fontScale);
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
    { count: selectedRelationshipIndustries.length + selectedPrimaryIndustryIds.length + selectedSecondaryIndustryIds.length, id: "industry", label: locale.t("contacts.filterIndustry") },
    {
      count: selectedRelationshipProgress ? 1 : 0,
      id: "progress",
      label: locale.t("contacts.filterProgress")
    },
    { count: selectedActionState ? 1 : 0, id: "action", label: locale.t("contacts.filterAction") },
    { count: advancedCount, id: "more", label: locale.t("contacts.filterMore") }
  ];

  const toolbarRow = <View style={[styles.filterToolbarRow, primary && styles.mainFilterRow, primary && { minWidth: (Math.min(width, layout.contentMax) - 2 * layout.pageInset) * filterScale }]}>
        {primary ? <Pressable accessibilityRole="button" accessibilityLabel={locale.language === "zh" ? "全部人脉" : locale.t("contacts.all")} accessibilityState={{ selected: !hasFilters }} aria-selected={!hasFilters}
          onPress={() => { setActiveMenu(null); onReset?.(); }} style={[styles.mainAll, { width: 44 * filterScale }]}>
          <Text style={[styles.mainFilterText, !hasFilters && styles.mainActiveText]}>{locale.t("contacts.all")}</Text>
          {!hasFilters ? <View accessible={false} style={[styles.mainAllUnderline, { width: 26 * filterScale }]} /> : null}
        </Pressable> : null}
        {menuItems.map((item) => {
          const active = activeMenu === item.id;
          const selected = item.count > 0;

          return (
            <Pressable
              accessibilityLabel={`${locale.t("contacts.filterNamed", { label: item.label })}${
                selected ? locale.t("contacts.selectedCount", { count: item.count }) : ""
              }`}
              accessibilityRole="button"
              accessibilityState={{ expanded: activeMenu === item.id }}
              aria-expanded={activeMenu === item.id}
              key={item.id}
              onPress={() =>
                setActiveMenu((current) => (current === item.id ? null : item.id))
              }
              style={({ pressed }) => [
                styles.filterToolbarButton,
                primary ? styles.mainFilterButton : null,
                active ? primary ? styles.mainSelected : styles.filterToolbarButtonActive : null,
                pressed ? styles.filterToolbarButtonPressed : null
              ]}
            >
              <Text
                numberOfLines={1}
                style={[
                  styles.filterToolbarButtonText,
                  primary ? styles.mainFilterText : null,
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
                size={primary ? 9 : 13}
              />
              {!primary && item.id !== "more" ? <View style={styles.filterToolbarDivider} /> : null}
            </Pressable>
          );
        })}
        {primary ? <Pressable accessibilityRole="button" accessibilityLabel={locale.t("contacts.analysis")} onPress={onAnalysis} style={[styles.mainAnalysis, { minWidth: 60 * filterScale }]}>
          <Text style={styles.mainLink}>{locale.t("contacts.analysis")}</Text>
        </Pressable> : null}
      </View>;

  return (
    <View style={styles.filterToolbar}>
      {primary ? <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.mainFilterScroll}>{toolbarRow}</ScrollView> : toolbarRow}
      {activeMenu ? (
        <View style={styles.filterToolbarPanel}>
          {activeMenu === "industry" ? (
            <>
            <Text style={styles.filterToolbarPanelTitle}>{locale.t("contacts.filterForRelationshipSearch")}</Text>
            {[
              { label: locale.t("contacts.primaryIndustry"), options: INDUSTRY_CATALOG, selected: selectedPrimaryIndustryIds, onSelect: onSelectPrimaryIndustry },
              { label: locale.t("contacts.secondaryIndustry"), options: SECONDARY_INDUSTRY_CATALOG.filter((entry) => selectedPrimaryIndustryIds.includes(entry.parentId)), selected: selectedSecondaryIndustryIds, onSelect: onSelectSecondaryIndustry }
            ].map((group) => (
              <View key={group.label} style={styles.filterToolbarMoreSection}>
                <Text style={styles.filterToolbarPanelTitle}>{group.label}</Text>
                {group.options.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterList}>
                  {group.options.map((option) => {
                    const selected = group.selected.includes(option.id);
                    return <Pressable key={option.id} accessibilityRole="button"
                      accessibilityLabel={`${group.label}${locale.language === "en" ? ": " : "："}${option.labels[locale.language]}`}
                      accessibilityState={{ selected }} aria-selected={selected}
                      onPress={() => group.onSelect(option.id)}
                      style={({ pressed }) => [styles.filterChip, selected && styles.filterChipSelected, pressed && styles.filterChipPressed]}>
                      <Text style={[styles.filterChipText, selected && styles.filterChipTextSelected]}>{option.labels[locale.language]}</Text>
                    </Pressable>;
                  })}
                </ScrollView> : <Text style={styles.filterToolbarPanelTitle}>{locale.t("contacts.choosePrimaryIndustryFirst")}</Text>}
              </View>
            ))}
            <Text style={styles.filterToolbarPanelTitle}>{locale.t("contacts.relationshipArea")}</Text>
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
                      {relationshipFilterLabel(relationshipIndustryOptions, option.value, locale.language)}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            </>
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
  onPress,
  primary = false
}: {
  baseUrl: string;
  contact: ContactSummary;
  isLast: boolean;
  onPress: () => void;
  primary?: boolean;
}) {
  const { colors, styles } = useStyles();
  const locale = useOrbitLocale();
  const avatar = contactAvatarFor(contact);
  const avatarId = useId().replace(/:/gu, "");
  const tones = { sky: ["#7FB3FF", "#3B82F6"], emerald: ["#5EEAD4", "#0EA5E9"], amber: ["#FCD34D", "#F59E0B"], violet: ["#A78BFA", "#6366F1"], rose: ["#FDA4AF", "#F472B6"] } as const;
  const toneStyle = avatarToneStyles(colors)[avatar.tone];
  const detail = contactDetail(contact);
  const identityDetail = (primary ? [contact.role, contact.organization] : [contact.organization, contact.role])
    .filter(Boolean)
    .join(" · ");
  const contactAccessibilityLabel = locale.language === "zh"
    ? `${contact.name}，${detail}，打开联系人详情`
    : `${locale.t.literal(contact.name)}, ${locale.t.literal(detail)}, ${locale.t("contacts.openDetail", { name: locale.t.literal(contact.name) })}`;

  return (
    <Pressable
      accessibilityLabel={contactAccessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.contactCard,
        isLast && !primary ? styles.contactCardLast : null,
        primary ? styles.mainContactRow : null,
        pressed ? styles.contactCardPressed : null
      ]}
    >
      <View style={[styles.contactHeader, primary && styles.mainContactHeader]}>
        <View
          style={[
            styles.avatar,
            { backgroundColor: toneStyle.backgroundColor },
            primary && styles.mainAvatar
          ]}
        >
          {contact.imageUrl ? (
            <Image
              resizeMode="cover"
              source={{ uri: assetUrl(baseUrl, contact.imageUrl) }}
              style={styles.avatarImage}
            />
          ) : (
            <>
              {primary ? <Svg accessible={false} style={StyleSheet.absoluteFill} width={40} height={40} viewBox="0 0 40 40">
                <Defs><LinearGradient id={avatarId} x1="0%" y1="0%" x2="100%" y2="100%">
                  <Stop offset="0%" stopColor={tones[avatar.tone][0]} /><Stop offset="100%" stopColor={tones[avatar.tone][1]} />
                </LinearGradient></Defs><Circle cx={20} cy={20} r={20} fill={"url(#" + avatarId + ")"} />
              </Svg> : null}
              <Text style={[styles.avatarText, { color: toneStyle.color }, primary && styles.mainAvatarText]}>{avatar.initial}</Text>
            </>
          )}
        </View>
        <View style={styles.contactTitleBlock}>
          <Text numberOfLines={primary ? undefined : 1} style={[styles.contactName, primary && styles.mainContactName]}>
            {contact.name}
          </Text>
          {identityDetail ? (
            <Text numberOfLines={primary ? undefined : 1} style={[styles.contactDetail, primary && styles.mainContactDetail]}>
              {identityDetail}
            </Text>
          ) : null}
        </View>
        {/* Sprint 0089: this slot held 价值分, which is
            min(95, 60 + valueTypes.length * 12) — a relabelled count that read 84
            for 76 of 78 contacts. The value types it was derived from vary across
            eight combinations and say what the person can actually offer. */}
        {primary || contact.valueLabels.length === 0 ? null : (
          <Text numberOfLines={1} style={styles.contactMatchScore}>
            {contact.valueLabels.join(" · ")}
          </Text>
        )}
        <Ionicons color={primary ? "#C4C9D4" : colors.text4} name="chevron-forward" size={primary ? 12 : 16} />
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
  const { colors, styles } = useStyles();
  const avatar = contactAvatarFor({ id: id, name: name });
  const toneStyle = avatarToneStyles(colors)[avatar.tone];

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
  const { styles } = useStyles();
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
  const { styles } = useStyles();
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
        {/* Sprint 0089: the score is gone here too. It carried no more than the
            chip row below already shows, and showing both invited the reader to
            treat the number as extra information. */}
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
  const { styles } = useStyles();
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
  const { styles } = useStyles();
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
  const { styles } = useStyles();
  const locale = useOrbitLocale();
  if (view.suggestions.length === 0) {
    return null;
  }

  return (
    <View accessibilityLabel={locale.t("contacts.suggestedSearches")} style={styles.relationshipSuggestions}>
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
  const { colors, styles } = useStyles();
  const locale = useOrbitLocale();
  if (searches.length === 0) {
    return null;
  }

  return (
    <View accessibilityLabel={locale.t("contacts.recentSearches")} style={styles.recentRelationshipSearches}>
      <View style={styles.recentRelationshipSearchesHeader}>
        <Text style={styles.recentRelationshipSearchesTitle}>{locale.t("contacts.recentSearches")}</Text>
        <Text style={styles.recentRelationshipSearchesMeta}>{locale.t("contacts.localOnly")}</Text>
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
  const { styles } = useStyles();
  return <View style={styles.overviewToolGrid}>{children}</View>;
}

function overviewToolTone(tone: OverviewToolTone, colors: OrbitColors) {
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
  const { colors, styles } = useStyles();
  const toneStyle = overviewToolTone(tone, colors);

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
        style={styles.overviewToolIcon}
      >
        <Ionicons color={toneStyle.color} name={iconName} size={20} />
      </View>
      <View style={styles.overviewToolText}>
        <Text style={styles.overviewToolTitle}>
          {title}
        </Text>
        <Text style={styles.overviewToolDetail}>
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
  const { colors, styles } = useStyles();
  const locale = useOrbitLocale();
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
        <Text style={styles.contactsLibraryTitle}>{locale.t("contacts.library")}</Text>
        <Text style={styles.contactsLibraryDetail}>
          {contactsLabel}
        </Text>
      </View>
      <View style={styles.contactsLibraryAction}>
        <Text style={styles.contactsLibraryActionText}>{locale.t("contacts.enter")}</Text>
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
  const { colors, styles } = useStyles();
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
        <Text style={styles.contactsLibraryTitle}>
          {title}
        </Text>
        <Text style={styles.contactsLibraryDetail}>
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
  const locale = useOrbitLocale();
  return (
    <NetworkPriorityCard
      action={locale.t("contacts.see")}
      detail={locale.t("contacts.analysisDetail")}
      iconName="analytics-outline"
      route="/contacts/dashboard"
      title={locale.t("contacts.analysis")}
    />
  );
}

function ContactsOverviewContent({
  contactsCount = null
}: {
  contactsCount?: number | null;
} = {}) {
  const router = useRouter();
  const locale = useOrbitLocale();
  const contactsLabel =
    typeof contactsCount === "number" && contactsCount > 0
      ? locale.t("contacts.contactCount", { count: contactsCount })
      : locale.t("contacts.overviewDetail");

  return (
    <OverviewToolGrid>
      <ContactsLibraryEntry
        contactsLabel={contactsLabel}
        onPress={() => router.push("/contacts/list" as Href)}
      />
      <PriorityNetworkTools />
      <OverviewToolCard
        action={locale.t("contacts.seeNext")}
        detail={locale.t("contacts.progressDetail")}
        iconName="list-outline"
        onPress={() => router.push("/contacts/pipeline" as Href)}
        title={locale.t("contacts.progress")}
        tone="amber"
      />
      <OverviewToolCard
        action={locale.t("contacts.startAdding")}
        detail={locale.t("contacts.addDetail")}
        iconName="add-circle-outline"
        onPress={() => router.push("/contacts/new")}
        title={locale.t("contacts.addPeople")}
        tone="accent"
      />
    </OverviewToolGrid>
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
  onSelectPrimaryIndustry,
  onSelectSecondaryIndustry,
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
  selectedPrimaryIndustryIds,
  selectedSecondaryIndustryIds,
  selectedRelationshipProgress,
  state,
  primary = false,
  onResetFilters,
  onNavigate
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
  onSelectPrimaryIndustry: (value: string) => void;
  onSelectSecondaryIndustry: (value: string) => void;
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
  selectedPrimaryIndustryIds: string[];
  selectedSecondaryIndustryIds: string[];
  selectedRelationshipProgress: ContactRelationshipProgressFilter | null;
  state: ReturnType<typeof useApiResource<unknown>>;
  primary?: boolean;
  onResetFilters?: () => void;
  onNavigate?: (href: string) => void;
}) {
  const { colors, styles } = useStyles();
  const locale = useOrbitLocale();
  const router = useRouter();
  const navigate = onNavigate ?? ((href: string) => router.push(href as Href));
  const [searchOptionsOpen, setSearchOptionsOpen] = useState(false);
  const loadedWithoutContacts =
    (state.kind === "empty" || state.kind === "success") &&
    contacts.length === 0;
  const directoryEmpty = primary && loadedWithoutContacts && !query.trim() && !hasListFilters;
  const showSearchOptions = !primary || searchOptionsOpen;

  return (
    <>
      <View style={[styles.searchPanel, primary && styles.mainSearchPanel]}>
        <View style={[styles.searchRow, primary && styles.mainSearchRow]}>
          <Ionicons color={colors.text3} name="search-outline" size={18} />
          <TextInput
            accessibilityLabel={locale.t("contacts.searchPlaceholder")}
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={onQueryChange}
            onSubmitEditing={onRunDeepSearch}
            placeholder={locale.t("contacts.searchPlaceholder")}
            placeholderTextColor={colors.text4}
            returnKeyType="search"
            style={[styles.searchInput, primary && styles.mainSearchInput]}
            value={query}
          />
          {query.trim() ? (
            <Pressable
              accessibilityLabel={locale.t("contacts.clearSearch")}
              accessibilityRole="button"
              onPress={onClearQuery}
              style={styles.clearButton}
            >
              <Ionicons color={colors.text3} name="close-circle" size={19} />
            </Pressable>
          ) : null}
          {primary ? <Pressable accessibilityRole="button" accessibilityLabel={locale.t("contacts.searchOptions")} accessibilityState={{ expanded: searchOptionsOpen }} aria-expanded={searchOptionsOpen}
            onPress={() => setSearchOptionsOpen(open => !open)} style={styles.mainSearchOptionsButton}>
            <Ionicons name="options-outline" size={18} color={colors.text3} />
          </Pressable> : null}
        </View>
        {showSearchOptions ? <View style={styles.searchActionRow}>
          <Pressable
            accessibilityRole="button"
            disabled={searching || (primary && relationshipSearching)}
            onPress={onRunDeepSearch}
            style={({ pressed }) => [
              styles.deepSearchButton,
              searching ? styles.deepSearchButtonDisabled : null,
              pressed ? styles.deepSearchButtonPressed : null
            ]}
          >
            <Ionicons
              color={colors.accent}
              name="sparkles-outline"
              size={17}
            />
            <Text style={styles.deepSearchButtonText}>
              {searching ? locale.t("contacts.searching") : locale.t("contacts.deepSearch")}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={relationshipSearching || (primary && searching)}
            onPress={onRunRelationshipSearch}
            style={({ pressed }) => [
              styles.relationshipSearchButton,
              relationshipSearching ? styles.deepSearchButtonDisabled : null,
              pressed ? styles.deepSearchButtonPressed : null
            ]}
          >
            <Ionicons color={colors.accent} name="git-network-outline" size={17} />
            <Text style={styles.relationshipSearchButtonText}>
              {relationshipSearching ? locale.t("contacts.relationshipSearching") : locale.t("contacts.relationshipSearch")}
            </Text>
          </Pressable>
          {searchError ? (
            <Text style={styles.searchErrorText}>{searchError}</Text>
          ) : null}
          {relationshipSearchError ? (
            <Text style={styles.searchErrorText}>{relationshipSearchError}</Text>
          ) : null}
        </View> : null}
        {primary && showSearchOptions ? <View style={styles.mainTools}>
          <Pressable accessibilityRole="button" accessibilityLabel={locale.t("contacts.progress")} onPress={() => navigate("/contacts/pipeline")} style={styles.mainTool}>
            <Text style={styles.mainLink}>{locale.t("contacts.progress")}</Text><Ionicons name="chevron-forward" size={12} color={colors.accent} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={locale.t("contacts.library")} onPress={() => navigate("/contacts/list")} style={styles.mainTool}>
            <Text style={styles.mainLink}>{locale.t("contacts.library")}</Text><Ionicons name="chevron-forward" size={12} color={colors.accent} />
          </Pressable>
        </View> : null}
        {showSearchOptions ? <RecentRelationshipSearchesRow
          onSelectRecentRelationshipSearch={onSelectRecentRelationshipSearch}
          searches={recentRelationshipSearches}
        /> : null}
        {primary ? <ContactNeedsHomeEntry /> : null}
        {!directoryEmpty ? <ContactFilterToolbar
          actionStateOptions={actionStateOptions}
          advancedFilterSections={advancedFilterSections}
          onActionStateChange={onActionStateChange}
          onRelationshipProgressChange={onRelationshipProgressChange}
          onToggleAdvancedFilter={onToggleAdvancedFilter}
          onToggleRelationshipIndustry={onToggleRelationshipIndustry}
          onSelectPrimaryIndustry={onSelectPrimaryIndustry}
          onSelectSecondaryIndustry={onSelectSecondaryIndustry}
          relationshipProgressOptions={relationshipProgressOptions}
          selectedActionState={selectedActionState}
          selectedRelationshipIndustries={selectedRelationshipIndustries}
          selectedPrimaryIndustryIds={selectedPrimaryIndustryIds}
          selectedSecondaryIndustryIds={selectedSecondaryIndustryIds}
          selectedRelationshipProgress={selectedRelationshipProgress}
          primary={primary}
          hasFilters={hasListFilters || selectedRelationshipIndustries.length > 0 || selectedPrimaryIndustryIds.length > 0 || selectedSecondaryIndustryIds.length > 0}
          {...(onResetFilters ? { onReset: onResetFilters } : {})}
          onAnalysis={() => navigate("/contacts/dashboard")}
        /> : null}
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
        <ErrorState message={state.error.message} title={locale.t("contacts.serverUnavailable")} />
      ) : null}
      {state.kind === "failure" ? (
        <ErrorState message={state.error.message} />
      ) : null}
      {primary && (state.kind === "offline" || state.kind === "failure") ? <Pressable accessibilityRole="button" accessibilityLabel={locale.t("contacts.retryRead")} onPress={state.refresh} style={styles.mainRetry}>
        <Text style={styles.mainLink}>{locale.t("contacts.readAgain")}</Text>
      </Pressable> : null}
      {directoryEmpty ? <View style={styles.mainEmpty}>
        <View style={styles.mainEmptyIcon}><OrbitNavigationIcon name="contacts" size={28} color={colors.ink} /></View>
        <Text accessibilityRole="header" style={styles.mainEmptyTitle}>{locale.t("contacts.emptyTitle")}</Text>
        <Text style={styles.mainEmptyCopy}>{locale.t("contacts.emptyBody")}</Text>
        <View style={styles.mainEmptyActions}>
          <Pressable accessibilityRole="button" accessibilityLabel={locale.t("contacts.scanCard")} onPress={() => navigate("/contacts/new")} style={styles.mainEmptyScan}>
            <Text style={styles.mainEmptyScanText}>{locale.t("contacts.scanCard")}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={locale.t("contacts.manualAdd")} onPress={() => navigate("/contacts/new?mode=manual")} style={styles.mainEmptyManual}>
            <Text style={styles.mainEmptyManualText}>{locale.t("contacts.manualAdd")}</Text>
          </Pressable>
        </View>
      </View> : loadedWithoutContacts ? (
        <EmptyState
          message={emptyMessage(query, hasListFilters, locale.language)}
          title={
            query.trim() || hasListFilters
              ? locale.t("contacts.noMatch")
              : locale.t("contacts.none")
          }
        />
      ) : null}
      {contacts.length > 0 ? (
        <View style={[styles.contactList, primary && styles.mainList]}>
          {contacts.map((contact, index) => (
            <ContactCard
              baseUrl={baseUrl}
              contact={contact}
              isLast={index === contacts.length - 1}
              key={contact.id}
              onPress={() => onOpenContact(contact.id)}
              primary={primary}
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
  const locale = useOrbitLocale();
  return (
    <AppScreen title={locale.t("contacts.title")}>
      <ContactsOverviewContent />
    </AppScreen>
  );
}

function ContactsListScreen({ primary = false, scopeKey, isScopeCurrent }: { primary?: boolean; scopeKey?: string | undefined; isScopeCurrent?: (() => boolean) | undefined } = {}) {
  const locale = useOrbitLocale();
  const { colors } = useOrbitTheme();
  const { styles } = useStyles();
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
  const client = useOrbitApiClient(scopeKey === undefined ? {} : { scopeKey });
  const searchScope = useRef({ alive: true, controller: null as AbortController | null });
  const isCurrent = () => !primary || (searchScope.current.alive && isScopeCurrent?.() !== false);
  useEffect(() => {
    const scope = searchScope.current;
    scope.alive = true;
    return () => { scope.alive = false; scope.controller?.abort(); scope.controller = null; };
  }, [scopeKey]);
  function searchTicket() {
    if (!isCurrent() || (primary && searchScope.current.controller)) return null;
    const controller = primary ? new AbortController() : null;
    if (primary) searchScope.current.controller = controller;
    return {
      signal: controller?.signal,
      valid: () => isCurrent() && (!controller || (!controller.signal.aborted && searchScope.current.controller === controller)),
      release: () => { if (searchScope.current.controller === controller) searchScope.current.controller = null; }
    };
  }
  function cancelSearch() {
    if (!primary) return;
    searchScope.current.controller?.abort(); searchScope.current.controller = null;
    setSearching(false); setRelationshipSearching(false);
    setSearchResult(null); setRelationshipSearchResult(null);
  }
  function navigate(href: string) { if (isCurrent()) router.push(href as Href); }
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
  const [selectedPrimaryIndustryIds, setSelectedPrimaryIndustryIds] = useState<string[]>([]);
  const [selectedSecondaryIndustryIds, setSelectedSecondaryIndustryIds] = useState<string[]>([]);
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
  const rawState = useApiResource<unknown>(
    contactsPath,
    (data) => contactsToSummaries(data, locale.language).length === 0,
    scopeKey === undefined ? {} : { scopeKey }
  );
  const validatedState = primary ? validateApiResourceState(rawState, mainContactsSchema) : rawState;
  const pendingCollection = primary && hasContactData(validatedState) && (validatedState.data as { state: string }).state === "pending";
  const state = pendingCollection ? { kind: "loading" as const, refreshing: validatedState.refreshing, refresh: validatedState.refresh } : validatedState;
  const relationshipSuggestionsState = useApiResource<unknown>(
    ORBIT_API_ENDPOINTS.relationshipSearchSuggestions,
    (data) => relationshipSearchSuggestionsToView(data).suggestions.length === 0,
    scopeKey === undefined ? {} : { scopeKey }
  );
  const contactData = hasContactData(state) ? state.data : null;
  const relationshipSuggestions =
    hasContactData(relationshipSuggestionsState)
      ? relationshipSearchSuggestionsToView(relationshipSuggestionsState.data, locale.language)
      : null;
  const dimensionFilterOptions = contactDimensionFilterOptions(contactData, {
    actionState: selectedActionState,
    relationshipProgress: selectedRelationshipProgress
  });
  const advancedFilterSections = contactSearchFilterSections(contactData, {
    sourceFilters: selectedSourceFilters,
    tagFilters: selectedTagFilters,
    valueFilters: selectedValueFilters
  }, locale.language);
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
  const contacts = contactData ? contactsToSummaries(filteredContactData, locale.language) : [];
  const openContact = (id: string) => {
    if (!isCurrent()) return;
    router.push({
      params: { id },
      pathname: "/contacts/[id]"
    });
  };

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
    cancelSearch();
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
    cancelSearch();
    setSelectedRelationshipIndustries((current) =>
      toggleContactSearchFilter(current, value)
    );
    setRelationshipSearchError(null);
  }

  function onSelectRelationshipSuggestion(
    suggestion: RelationshipSearchSuggestionView
  ) {
    if (!isCurrent()) return;
    cancelSearch();
    setQuery(suggestion.query);
    setSelectedRelationshipIndustries(
      suggestion.request.body.industryFilters ?? []
    );
    setSelectedPrimaryIndustryIds(suggestion.request.body.primaryIndustryIds ?? []);
    setSelectedSecondaryIndustryIds(suggestion.request.body.secondaryIndustryIds ?? []);
    setSearchError(null);
    setRelationshipSearchError(null);
    setSearchResult(null);
    void runRelationshipSearch(suggestion.request.body, {
      rememberRecent: true
    });
  }

  function onSelectRecentRelationshipSearch(search: RecentRelationshipSearch) {
    if (!isCurrent()) return;
    cancelSearch();
    setQuery(search.body.query ?? "");
    setSelectedRelationshipIndustries(search.body.industryFilters ?? []);
    setSelectedPrimaryIndustryIds(search.body.primaryIndustryIds ?? []);
    setSelectedSecondaryIndustryIds(search.body.secondaryIndustryIds ?? []);
    setSearchError(null);
    setRelationshipSearchError(null);
    setSearchResult(null);
    void runRelationshipSearch(search.body, {
      rememberRecent: true
    });
  }

  function rememberRelationshipSearch(body: RelationshipSearchRequestBody) {
    const recentSearch = relationshipSearchToRecent(body, locale.language);

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
    if (!isCurrent()) return;
    const request = buildRelationshipSearchRequest(
      input ?? {
        followUpStatusFilters: relationshipFollowUpStatusFilters(),
        industryFilters: selectedRelationshipIndustries,
        primaryIndustryIds: selectedPrimaryIndustryIds,
        secondaryIndustryIds: selectedSecondaryIndustryIds,
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

    const ticket = searchTicket();
    if (!ticket) return;
    setRelationshipSearching(true);
    setRelationshipSearchError(null);
    setSearchResult(null);

    try {
      const result = await client.post<unknown>(ORBIT_API_ENDPOINTS.relationshipSearch, {
        body: request.request.body,
        ...(ticket.signal ? { signal: ticket.signal } : {})
      });
      if (!ticket.valid()) return;

      if (result.success && (!primary || (result.status >= 200 && result.status < 300 && mainRelationshipSearchSchema.safeParse(result.data).success))) {
        setRelationshipSearchResult(relationshipSearchToView(result.data, locale.language));
        if (options.rememberRecent) {
          rememberRelationshipSearch(request.request.body);
        }
        return;
      }

      setRelationshipSearchError(result.success ? locale.t("contacts.relationshipSearchUnconfirmed") : result.error.message);
      setRelationshipSearchResult(null);
    } finally {
      if (ticket.valid()) setRelationshipSearching(false);
      ticket.release();
    }
  }

  async function runDeepSearch() {
    if (!isCurrent()) return;
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

    const ticket = searchTicket();
    if (!ticket) return;
    setSearching(true);
    setSearchError(null);
    setRelationshipSearchResult(null);

    try {
      const result = await client.post<unknown>(ORBIT_API_ENDPOINTS.contactsSearch, {
        body: request.request.body,
        ...(ticket.signal ? { signal: ticket.signal } : {})
      });
      if (!ticket.valid()) return;

      if (result.success && (!primary || (result.status >= 200 && result.status < 300 && mainContactsSearchSchema.safeParse(result.data).success))) {
        setSearchResult(
          contactsSearchToView(
            filterContactListPayloadByDimensions(result.data, {
              actionState: selectedActionState,
              relationshipProgress: selectedRelationshipProgress
            }),
            locale.language
          )
        );
        return;
      }

      setSearchError(result.success ? locale.t("contacts.searchUnconfirmed") : result.error.message);
      setSearchResult(null);
    } finally {
      if (ticket.valid()) setSearching(false);
      ticket.release();
    }
  }

  const refreshControl = <RefreshControl
          onRefresh={() => {
            state.refresh();
            relationshipSuggestionsState.refresh();
          }}
          refreshing={state.refreshing || relationshipSuggestionsState.refreshing}
          tintColor={colors.accent}
        />;
  const content = <ContactsListContent
        actionStateOptions={dimensionFilterOptions.actionState}
        advancedFilterSections={advancedFilterSections}
        baseUrl={baseUrl}
        contacts={contacts}
        hasListFilters={hasListFilters}
        onActionStateChange={(value) => { cancelSearch(); setSelectedActionState(value); }}
        onClearQuery={() => {
          cancelSearch();
          setQuery("");
          setSearchError(null);
          setRelationshipSearchError(null);
          setRelationshipSearchResult(null);
        }}
        onOpenContact={openContact}
        onQueryChange={(text) => {
          cancelSearch();
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
        onRelationshipProgressChange={(value) => { cancelSearch(); setSelectedRelationshipProgress(value); }}
        onToggleAdvancedFilter={toggleAdvancedFilter}
        onToggleRelationshipIndustry={toggleRelationshipIndustryFilter}
        onSelectPrimaryIndustry={(value) => {
          cancelSearch();
          setSelectedPrimaryIndustryIds((current) => current.includes(value) ? [] : [value]);
          setSelectedSecondaryIndustryIds([]);
          setRelationshipSearchError(null);
        }}
        onSelectSecondaryIndustry={(value) => {
          cancelSearch();
          setSelectedSecondaryIndustryIds((current) => current.includes(value) ? [] : [value]);
          setRelationshipSearchError(null);
        }}
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
        selectedPrimaryIndustryIds={selectedPrimaryIndustryIds}
        selectedSecondaryIndustryIds={selectedSecondaryIndustryIds}
        selectedRelationshipProgress={selectedRelationshipProgress}
        state={state}
        primary={primary}
        onResetFilters={() => {
          cancelSearch();
          setSelectedRelationshipProgress(null); setSelectedActionState(null);
          setSelectedSourceFilters([]); setSelectedTagFilters([]); setSelectedValueFilters([]); setSelectedRelationshipIndustries([]);
          setSelectedPrimaryIndustryIds([]); setSelectedSecondaryIndustryIds([]);
          setSearchResult(null); setRelationshipSearchResult(null); setSearchError(null); setRelationshipSearchError(null);
        }}
        onNavigate={navigate}
      />;
  if (!primary) return <ContactPage backLabel={locale.t("contacts.listBack")} refreshControl={refreshControl} title={locale.t("contacts.listTitle")}>{content}</ContactPage>;
  const directoryEmpty = hasContactData(state) && contacts.length === 0 && !query.trim() && !hasListFilters;
  return <AppScreen title={locale.t("contacts.title")} refreshControl={refreshControl} header={<View style={styles.mainHeader}>
    <View style={styles.mainHeading}>
      <Text accessibilityRole="header" style={styles.mainTitle}>{locale.t("contacts.title")}</Text>
      {hasContactData(state) ? <Text testID="contacts-main-count" accessibilityLabel={locale.t("contacts.count", { count: contacts.length })} style={[styles.mainCount, directoryEmpty && styles.mainCountEmpty]}>{contacts.length}</Text> : null}
    </View>
    {!directoryEmpty ? <View style={styles.mainHeaderActions}>
      <Pressable accessibilityRole="button" accessibilityLabel={locale.t("contacts.scanCard")} onPress={() => navigate("/contacts/new")} style={styles.mainHeaderButton}>
        <View pointerEvents="none" style={styles.mainScanSurface} />
        <Svg accessible={false} width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.ink} strokeWidth={1.8} strokeLinecap="round">
          <Path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M3 12h18" />
        </Svg>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={locale.t("contacts.manualAdd")} onPress={() => navigate("/contacts/new?mode=manual")} style={styles.mainHeaderButton}>
        <View pointerEvents="none" style={styles.mainAddSurface} /><Ionicons name="add" size={18} color={colors.onAccent} />
      </Pressable>
    </View> : null}
  </View>}><View style={styles.mainBody}>{content}</View></AppScreen>;
}

export function ContactsScreen({
  mode = "overview",
  scopeKey,
  isScopeCurrent
}: {
  mode?: ContactsScreenMode;
  scopeKey?: string;
  isScopeCurrent?: () => boolean;
} = {}) {
  return mode === "overview" ? <ContactsOverviewScreen /> : <ContactsListScreen primary={mode === "main"} scopeKey={scopeKey} isScopeCurrent={isScopeCurrent} />;
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  mainHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginTop: -4, minHeight: 44 },
  mainHeading: { flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", gap: 10 },
  mainTitle: { fontFamily: mainContactFont, fontSize: 30, lineHeight: 38, fontWeight: "900", letterSpacing: -0.6, color: colors.ink },
  mainCount: { fontFamily: mainContactFont, fontSize: 30, lineHeight: 38, fontWeight: "800", letterSpacing: -0.9, color: colors.accent },
  mainCountEmpty: { color: colors.text3 },
  mainHeaderActions: { flexDirection: "row", gap: 4 },
  mainHeaderButton: { width: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  mainScanSurface: { position: "absolute", zIndex: -1, top: 2, bottom: 2, left: 2, right: 2, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  mainAddSurface: { position: "absolute", zIndex: -1, top: 2, bottom: 2, left: 2, right: 2, borderRadius: 10, backgroundColor: colors.ink },
  mainBody: { gap: 0 },
  mainSearchPanel: { gap: 12, paddingBottom: 0 },
  mainSearchRow: { borderRadius: 10, paddingHorizontal: 12, gap: 8, minHeight: 44 },
  mainSearchInput: { fontFamily: mainContactFont, fontSize: 14, lineHeight: 20, padding: 0, color: colors.ink },
  mainSearchOptionsButton: { width: 44, minHeight: 44, marginRight: -12, alignItems: "center", justifyContent: "center" },
  mainFilterRow: { borderBottomWidth: 1, borderBottomColor: colors.border },
  mainFilterScroll: { flexGrow: 0 },
  mainAll: { width: 44, minHeight: 44, justifyContent: "center", borderBottomWidth: 2, borderBottomColor: "transparent", marginBottom: -1 },
  mainAllUnderline: { position: "absolute", bottom: -2, left: 0, height: 2, backgroundColor: colors.ink },
  mainSelected: { borderBottomColor: colors.ink },
  mainActiveText: { color: colors.ink, fontWeight: "700" },
  mainFilterButton: { minHeight: 44, gap: 3, borderRadius: 0, paddingHorizontal: 0, borderBottomWidth: 2, borderBottomColor: "transparent", marginBottom: -1 },
  mainFilterText: { fontFamily: mainContactFont, fontSize: 13, lineHeight: 18, fontWeight: "400", color: colors.text3 },
  mainAnalysis: { minWidth: 60, minHeight: 44, justifyContent: "center", alignItems: "flex-end", paddingLeft: 8 },
  mainLink: { fontFamily: mainContactFont, fontSize: 13, lineHeight: 20, fontWeight: "700", color: colors.accent },
  mainTools: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  mainTool: { minHeight: 44, minWidth: 44, flexDirection: "row", alignItems: "center", gap: 4 },
  mainList: { borderTopWidth: 0 },
  mainContactRow: { minHeight: 65, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border2 },
  mainContactHeader: { gap: 12 },
  mainAvatar: { width: 40, height: 40, borderRadius: 20, flexShrink: 0 },
  mainAvatarText: { fontFamily: mainContactFont, fontSize: 15, lineHeight: 20, fontWeight: "700", color: "#FFFFFF" },
  mainContactName: { fontFamily: mainContactFont, fontSize: 15, lineHeight: 20, fontWeight: "700", letterSpacing: -0.15 },
  mainContactDetail: { fontFamily: mainContactFont, fontSize: 12, lineHeight: 17, color: colors.text3 },
  mainRetry: { alignSelf: "flex-start", minHeight: 44, justifyContent: "center", paddingHorizontal: 8 },
  mainEmpty: { marginTop: 90, paddingHorizontal: 24, alignItems: "center" },
  mainEmptyIcon: { width: 64, height: 64, borderRadius: 32, borderWidth: 1.5, borderColor: colors.ink, alignItems: "center", justifyContent: "center" },
  mainEmptyTitle: { marginTop: 20, fontFamily: mainContactFont, fontSize: 22, lineHeight: 30, fontWeight: "900", letterSpacing: -0.44, color: colors.ink, textAlign: "center" },
  mainEmptyCopy: { marginTop: 8, fontFamily: mainContactFont, fontSize: 14, lineHeight: 22, color: colors.text3, textAlign: "center" },
  mainEmptyActions: { marginTop: 28, gap: 8, width: "100%" },
  mainEmptyScan: { ...createControlStyles(colors).primaryButton },
  mainEmptyScanText: { ...createControlStyles(colors).primaryButtonText, fontFamily: mainContactFont },
  mainEmptyManual: { ...createControlStyles(colors).secondaryButton },
  mainEmptyManualText: { ...createControlStyles(colors).secondaryButtonText, fontFamily: mainContactFont },
  avatar: {
    alignItems: "center",
    borderRadius: radius.pill,
    height: 46,
    justifyContent: "center",
    overflow: "hidden",
    width: 46
  },
  avatarImage: {
    height: "100%",
    width: "100%"
  },
  avatarText: {
    fontSize: 21,
    fontWeight: "800",
    lineHeight: 26
  },
  clearButton: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    width: 44
  },
  filterToolbar: { gap: spacing.sm },
  filterToolbarButton: {
    alignItems: "center",
    borderRadius: radius.control,
    flex: 1,
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    minHeight: layout.control,
    minWidth: 0,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm
  },
  filterToolbarButtonActive: {
    backgroundColor: colors.accentSofter,
    borderColor: colors.accent
  },
  filterToolbarButtonPressed: { opacity: 0.8 },
  filterToolbarButtonText: {
    color: colors.text2,
    flexShrink: 1,
    fontSize: 14,
    fontWeight: "500",
    lineHeight: 20
  },
  filterToolbarButtonTextActive: { color: colors.accent },
  filterToolbarCount: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 15
  },
  filterToolbarMoreSection: { gap: spacing.xs },
  filterToolbarMoreSections: { gap: spacing.md },
  filterToolbarPanel: {
    backgroundColor: colors.surface2,
    borderRadius: radius.card,
    gap: spacing.sm,
    padding: spacing.md
  },
  filterToolbarPanelTitle: {
    ...textStyles.caption,
    color: colors.text3,
    fontWeight: "600"
  },
  filterToolbarRow: {
    flexDirection: "row",
    gap: 0
  },
  filterToolbarDivider: {
    backgroundColor: colors.border,
    height: 16,
    position: "absolute",
    right: 0,
    width: StyleSheet.hairlineWidth
  },
  contactCard: {
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    justifyContent: "center",
    minHeight: 70,
    paddingVertical: 12
  },
  contactCardLast: { borderBottomWidth: 0 },
  contactCardPressed: { backgroundColor: colors.surface2 },
  contactDetail: {
    ...textStyles.small,
    color: colors.text3
  },
  contactHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 16
  },
  contactList: {
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth
  },
  contactMatchScore: {
    color: colors.text3,
    flexShrink: 1,
    fontSize: 13,
    maxWidth: "40%",
    fontWeight: "400",
    lineHeight: 20,
    minWidth: 24,
    textAlign: "right"
  },
  contactName: {
    ...textStyles.listTitle,
    color: colors.ink
  },
  contactTitleBlock: {
    flex: 1,
    gap: 3,
    minWidth: 0
  },
  contactsLibraryAction: {
    alignItems: "center",
    flexDirection: "row",
    gap: 2,
    maxWidth: 76
  },
  contactsLibraryActionText: {
    ...textStyles.caption,
    color: colors.accent,
    flexShrink: 1
  },
  contactsLibraryDetail: {
    ...textStyles.small,
    color: colors.text3
  },
  contactsLibraryEntry: {
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 84,
    paddingVertical: spacing.lg
  },
  contactsLibraryIcon: {
    alignItems: "center",
    height: 36,
    width: 36,
    justifyContent: "center",
    flexShrink: 0
  },
  contactsLibraryText: {
    flex: 1,
    gap: 2,
    minWidth: 0
  },
  contactsLibraryTitle: {
    ...textStyles.listTitle,
    color: colors.ink
  },
  deepSearchButton: {
    alignItems: "center",
    backgroundColor: colors.accentSoft,
    borderRadius: radius.control,
    flex: 1,
    flexDirection: "row",
    gap: 7,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 8,
    paddingVertical: 10
  },
  deepSearchButtonDisabled: { opacity: 0.62 },
  deepSearchButtonPressed: {
    opacity: 0.84,
    transform: [{ translateY: 0.5 }]
  },
  deepSearchButtonText: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 21
  },
  filterChip: {
    ...createControlStyles(colors).chip,
    flexDirection: "row",
    gap: spacing.xs,
    maxWidth: "100%"
  },
  filterChipCount: {
    ...textStyles.caption,
    color: colors.text3,
    fontWeight: "600"
  },
  filterChipPressed: {
    opacity: 0.82,
    transform: [{ translateY: 0.5 }]
  },
  filterChipSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent
  },
  filterChipText: { ...createControlStyles(colors).chipText },
  filterChipTextSelected: { color: colors.onAccent },
  filterList: {
    gap: spacing.sm,
    paddingRight: spacing.sm
  },
  nextActionText: {
    ...textStyles.small,
    color: colors.text2
  },
  overviewToolActionRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xxs,
    maxWidth: 76
  },
  overviewToolActionText: {
    ...textStyles.caption,
    color: colors.accent,
    flexShrink: 1
  },
  overviewToolCard: {
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 84,
    paddingVertical: spacing.lg,
    width: "100%"
  },
  overviewToolCardPrimary: { minHeight: 84 },
  overviewToolDetail: {
    ...textStyles.small,
    color: colors.text3
  },
  overviewToolGrid: { gap: 0 },
  overviewToolIcon: {
    alignItems: "center",
    height: 36,
    width: 36,
    justifyContent: "center",
    flexShrink: 0
  },
  overviewToolText: {
    flex: 1,
    gap: 4,
    minWidth: 0
  },
  overviewToolTitle: {
    ...textStyles.listTitle,
    color: colors.ink
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
    ...textStyles.caption,
    color: colors.text3
  },
  recentRelationshipSearchLabel: {
    ...textStyles.caption,
    color: colors.text,
    fontWeight: "600"
  },
  recentRelationshipSearchList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs
  },
  recentRelationshipSearches: { gap: spacing.xs },
  recentRelationshipSearchesHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between"
  },
  recentRelationshipSearchesMeta: {
    ...textStyles.caption,
    color: colors.text4
  },
  recentRelationshipSearchesTitle: {
    ...textStyles.caption,
    color: colors.text2,
    fontWeight: "600"
  },
  recentRelationshipSearchText: {
    flex: 1,
    gap: 1,
    minWidth: 0
  },
  relationshipText: {
    ...textStyles.small,
    color: colors.text
  },
  relationshipSearchButton: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.accent,
    borderRadius: radius.control,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    gap: 7,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 8,
    paddingVertical: 10
  },
  relationshipSearchButtonText: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 21
  },
  relationshipSearchEvidence: {
    ...textStyles.caption,
    color: colors.text2
  },
  relationshipSearchScore: {
    ...textStyles.small,
    color: colors.accent,
    fontWeight: "600"
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
    backgroundColor: colors.surface2,
    borderRadius: radius.card,
    flexBasis: "100%",
    flexGrow: 1,
    gap: spacing.xs,
    minHeight: layout.control,
    padding: spacing.md
  },
  relationshipSuggestionDetail: {
    ...textStyles.caption,
    color: colors.accent,
    fontWeight: "600"
  },
  relationshipSuggestionHint: {
    ...textStyles.caption,
    color: colors.text3
  },
  relationshipSuggestionList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    paddingRight: spacing.sm
  },
  relationshipSuggestionQuery: {
    ...textStyles.small,
    color: colors.ink,
    fontWeight: "600"
  },
  relationshipSuggestions: { gap: spacing.sm },
  relationshipSuggestionsHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between"
  },
  relationshipSuggestionsMeta: {
    ...textStyles.caption,
    color: colors.text3
  },
  relationshipSuggestionsNext: {
    ...textStyles.caption,
    color: colors.text3
  },
  relationshipSuggestionsTitle: {
    ...textStyles.small,
    color: colors.ink,
    fontWeight: "600"
  },
  searchInput: {
    ...textStyles.body,
    color: colors.text,
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    paddingVertical: 10
  },
  searchActionRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 18
  },
  searchEmptyText: {
    ...textStyles.small,
    color: colors.text3
  },
  searchErrorText: {
    ...textStyles.caption,
    color: colors.rose,
    flexBasis: "100%",
    flexShrink: 1,
    fontWeight: "600"
  },
  searchFilterText: {
    ...textStyles.caption,
    color: colors.text3
  },
  searchPanel: {
    gap: 8,
    paddingBottom: 10
  },
  searchRow: {
    alignItems: "center",
    backgroundColor: colors.surface2,
    borderRadius: radius.input,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: layout.control,
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
    ...textStyles.body,
    fontWeight: "600"
  },
  searchResultDetail: {
    ...textStyles.caption,
    color: colors.text3
  },
  searchResultHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.sm
  },
  searchResultItem: {
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
    paddingVertical: spacing.md
  },
  searchResultItemPressed: {
    opacity: 0.84,
    transform: [{ translateY: 0.5 }]
  },
  searchResultLead: {
    ...textStyles.small,
    color: colors.text
  },
  searchResultName: {
    ...textStyles.listTitle,
    color: colors.ink
  },
  searchResultStack: { gap: spacing.sm },
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
    ...textStyles.caption,
    backgroundColor: colors.accentSofter,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    color: colors.accent,
    fontWeight: "600",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  valueText: {
    ...textStyles.caption,
    color: colors.accent,
    fontWeight: "600"
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
}));
