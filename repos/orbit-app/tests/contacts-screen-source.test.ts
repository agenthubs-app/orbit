import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url).pathname;
const screenSource = readFileSync(
  join(repoRoot, "src", "screens", "contacts", "ContactsScreen.tsx"),
  "utf8"
);
const contactsTabSource = readFileSync(
  join(repoRoot, "app", "(app)", "contacts.tsx"),
  "utf8"
);
const contactsListRoutePath = join(repoRoot, "app", "contacts", "list.tsx");

test("contacts screen can run the web deep contact search", () => {
  assert.match(screenSource, /ORBIT_API_ENDPOINTS\.contactsSearch/u);
  assert.match(screenSource, /buildContactsSearchRequest/u);
  assert.match(screenSource, /contactSearchFilterSections/u);
  assert.match(screenSource, /contactsSearchToView/u);
  assert.match(screenSource, /selectedSourceFilters/u);
  assert.match(screenSource, /selectedTagFilters/u);
  assert.match(screenSource, /selectedValueFilters/u);
  assert.match(screenSource, /toggleContactSearchFilter/u);
  assert.match(screenSource, /client\.post<unknown>/u);
  assert.match(screenSource, /ContactSearchResultCard/u);
  assert.match(screenSource, /ContactSearchFilterSection/u);
  assert.match(screenSource, /sourceFilters: selectedSourceFilters/u);
  assert.match(screenSource, /tagFilters: selectedTagFilters/u);
  assert.match(screenSource, /valueFilters: selectedValueFilters/u);
  assert.match(screenSource, /"深度搜索"/u);
});

test("contacts screen loads relationship natural search suggestions", () => {
  assert.match(screenSource, /ORBIT_API_ENDPOINTS\.relationshipSearchSuggestions/u);
  assert.match(screenSource, /ORBIT_API_ENDPOINTS\.relationshipSearch/u);
  assert.match(screenSource, /buildRelationshipSearchRequest/u);
  assert.match(screenSource, /relationshipSearchToView/u);
  assert.match(screenSource, /relationshipSearchSuggestionsToView/u);
  assert.match(screenSource, /RelationshipSearchResultCard/u);
  assert.match(screenSource, /RelationshipSearchSuggestionsRow/u);
  assert.match(screenSource, /onSelectRelationshipSuggestion/u);
  assert.match(screenSource, /runRelationshipSearch/u);
  assert.match(screenSource, /"关系搜索"/u);
  assert.match(screenSource, /推荐搜索/u);
});

test("contacts screen keeps industry filters without a persistent intent picker", () => {
  assert.match(screenSource, /relationshipIndustryOptions/u);
  assert.match(screenSource, /selectedRelationshipIndustries/u);
  assert.match(screenSource, /toggleRelationshipIndustryFilter/u);
  assert.match(screenSource, /industryFilters: selectedRelationshipIndustries/u);
  assert.match(screenSource, /label: "行业"/u);
  assert.match(screenSource, /"企业 SaaS"/u);
  assert.doesNotMatch(screenSource, /selectedRelationshipIntent/u);
  assert.doesNotMatch(screenSource, /onRelationshipIntentChange/u);
  assert.doesNotMatch(screenSource, /title="要找什么"/u);
});

test("contacts screen keeps relationship search suggestions readable on mobile", () => {
  const suggestionsStart = screenSource.indexOf(
    "function RelationshipSearchSuggestionsRow"
  );
  const suggestionsEnd = screenSource.indexOf("function ContactsOverviewContent");
  const suggestionsSlice = screenSource.slice(
    suggestionsStart,
    suggestionsEnd
  );

  assert.ok(suggestionsStart > -1);
  assert.ok(suggestionsEnd > suggestionsStart);
  assert.doesNotMatch(suggestionsSlice, /horizontal/u);
  assert.match(screenSource, /relationshipSuggestionList:[\s\S]*flexWrap: "wrap"/u);
  assert.match(screenSource, /relationshipSuggestionChip:[\s\S]*flexBasis: "100%"/u);
  assert.doesNotMatch(screenSource, /relationshipSuggestionChip:[\s\S]*width: 220/u);
});

test("contacts screen refreshes when the add-contact flow returns with a refresh token", () => {
  assert.match(screenSource, /useLocalSearchParams/u);
  assert.match(screenSource, /refreshToken/u);
  assert.match(screenSource, /contactRefreshToken/u);
  assert.match(
    screenSource,
    /const previousContactRefreshToken = useRef\(contactRefreshToken\)/u
  );
  assert.match(
    screenSource,
    /previousContactRefreshToken\.current === contactRefreshToken[\s\S]*previousContactRefreshToken\.current = contactRefreshToken;[\s\S]*state\.refresh\(\);[\s\S]*relationshipSuggestionsState\.refresh\(\);[\s\S]*contactRefreshToken/u
  );
});

test("retained contacts route does not mount data resources while unfocused", () => {
  const contactsListRouteSource = readFileSync(contactsListRoutePath, "utf8");

  assert.match(contactsListRouteSource, /useIsFocused/u);
  assert.match(
    contactsListRouteSource,
    /const isFocused = useIsFocused\(\);[\s\S]*if \(!isFocused\) \{[\s\S]*return null;[\s\S]*<ContactsScreen mode="list" \/>/u
  );
});

test("contacts screen accepts dashboard drill-down route filters", () => {
  assert.match(screenSource, /statusParam/u);
  assert.match(screenSource, /sourceParam/u);
  assert.match(screenSource, /tagParam/u);
  assert.match(screenSource, /valueParam/u);
  assert.match(screenSource, /queryParam/u);
  assert.match(screenSource, /initialStatusFilter/u);
  assert.match(screenSource, /initialListFilterValues/u);
  assert.match(screenSource, /useState<ContactRelationshipProgressFilter \| null>/u);
  assert.match(screenSource, /useState<ContactActionStateFilter \| null>/u);
  assert.match(screenSource, /useState<string\[\]>\(\s*initialListFilterValues\(sourceParam\)/u);
});

test("contacts screen renders real avatar images when contacts provide them", () => {
  assert.match(screenSource, /Image/u);
  assert.match(screenSource, /useOrbitApiBaseUrl/u);
  assert.match(screenSource, /assetUrl/u);
  assert.match(screenSource, /contact\.imageUrl/u);
  assert.match(screenSource, /source=\{\{ uri: assetUrl\(baseUrl, contact\.imageUrl\) \}\}/u);
  assert.match(screenSource, /styles\.avatarImage/u);
});

test("contact rows keep only identity and match score visible", () => {
  const cardStart = screenSource.indexOf("function ContactCard");
  const cardEnd = screenSource.indexOf("function SearchResultAvatar");
  const cardSource = screenSource.slice(cardStart, cardEnd);

  assert.ok(cardStart > -1);
  assert.ok(cardEnd > cardStart);
  assert.match(cardSource, /accessibilityLabel=\{contactAccessibilityLabel\}/u);
  assert.match(cardSource, /numberOfLines=\{1\} style=\{styles\.contactDetail\}/u);
  assert.match(cardSource, /contact\.valueScore/u);
  assert.match(cardSource, /name="chevron-forward"/u);
  assert.doesNotMatch(cardSource, /contact\.relationship/u);
  assert.doesNotMatch(cardSource, /contact\.valueLabels/u);
  assert.doesNotMatch(cardSource, /contact\.nextAction/u);
  assert.match(screenSource, /styles\.contactList/u);
  assert.match(screenSource, /contactList:[\s\S]*borderRadius: radius\.card/u);
});

test("contacts search results keep the same avatar identity treatment as contact cards", () => {
  assert.match(screenSource, /function SearchResultAvatar/u);
  assert.match(screenSource, /contactAvatarFor\(\{[\s\S]*id:[\s\S]*name:/u);
  assert.match(screenSource, /result\.imageUrl/u);
  assert.match(screenSource, /source=\{\{ uri: assetUrl\(baseUrl, imageUrl\) \}\}/u);
  assert.match(screenSource, /styles\.searchResultAvatar/u);
  assert.match(screenSource, /styles\.searchResultAvatarImage/u);
  assert.match(screenSource, /styles\.searchResultAvatarText/u);
  assert.match(screenSource, /<SearchResultAvatar[\s\S]*imageUrl=\{result\.imageUrl\}/u);
});

test("contacts overview prioritizes workbench modules and hides the long contact list", () => {
  assert.match(screenSource, /type ContactsScreenMode = "list" \| "overview"/u);
  assert.match(screenSource, /function ContactsOverviewContent/u);
  assert.match(screenSource, /function ContactsListContent/u);
  assert.match(screenSource, /mode = "overview"/u);
  assert.match(screenSource, /router\.push\("\/contacts\/list" as Href\)/u);
  assert.ok(existsSync(contactsListRoutePath), "contacts list route should exist");

  const contactsListRouteSource = readFileSync(contactsListRoutePath, "utf8");
  const overviewStart = screenSource.indexOf("function ContactsOverviewContent");
  const listStart = screenSource.indexOf("function ContactsListContent");
  const priorityToolsStart = screenSource.indexOf("function PriorityNetworkTools");
  const overviewSource = screenSource.slice(overviewStart, listStart);
  const listSource = screenSource.slice(listStart);
  const analysisIndex = screenSource.indexOf(
    'title="人脉分析"',
    priorityToolsStart
  );
  const listEntryIndex = overviewSource.indexOf("<ContactsLibraryEntry");

  assert.match(contactsTabSource, /ContactsScreen/u);
  assert.doesNotMatch(contactsTabSource, /mode="list"/u);
  assert.match(contactsListRouteSource, /<ContactsScreen mode="list" \/>/u);
  assert.match(screenSource, /<AppScreen title="人脉">/u);
  assert.doesNotMatch(screenSource, /<AppScreen eyebrow="人脉总览" title="人脉">/u);
  // List navigation and touch targets are exercised by contacts-redesign-interactions.
  assert.match(screenSource, /联系人库/u);
  assert.doesNotMatch(screenSource, /人脉工作台/u);
  assert.ok(overviewStart > -1);
  assert.ok(listStart > overviewStart);
  assert.ok(priorityToolsStart > -1);
  assert.ok(analysisIndex > priorityToolsStart);
  assert.doesNotMatch(overviewSource, /title="人脉图谱"/u);
  assert.doesNotMatch(overviewSource, /title="人脉表盘"/u);
  assert.doesNotMatch(overviewSource, /title="引荐准备"/u);
  assert.ok(listEntryIndex > -1);
  assert.doesNotMatch(overviewSource, /contacts\.map\(\(contact/u);
  assert.match(listSource, /contacts\.map\(\(contact/u);
});

test("contacts overview retains its library and analysis route wiring", () => {
  const overviewStart = screenSource.indexOf("function ContactsOverviewContent");
  const listStart = screenSource.indexOf("function ContactsListContent");
  const overviewSource = screenSource.slice(overviewStart, listStart);
  const listDrilldownIndex = overviewSource.indexOf("<ContactsLibraryEntry");

  assert.doesNotMatch(overviewSource, /<RelationshipWorkbenchHero/u);
  assert.match(overviewSource, /<OverviewToolGrid/u);
  assert.match(overviewSource, /<PriorityNetworkTools \/>/u);
  assert.match(screenSource, /<NetworkPriorityCard[\s\S]*title="人脉分析"/u);
  assert.ok(listDrilldownIndex > -1);
  // Visible row order and touch geometry are exercised against the real screen
  // in app-wide-contacts.test.ts; JSX wrapper positions do not imply layout.
  assert.match(screenSource, /router\.push\(route as Href\)/u);
  assert.match(screenSource, /route="\/contacts\/dashboard"/u);
  assert.match(overviewSource, /router\.push\("\/contacts\/pipeline" as Href\)/u);
  assert.match(overviewSource, /router\.push\("\/contacts\/list" as Href\)/u);
  assert.match(screenSource, /styles\.overviewToolGrid/u);
  assert.match(screenSource, /styles\.overviewToolCardPrimary/u);
  assert.match(screenSource, /styles\.contactsLibraryEntry/u);
});

test("contacts overview retains merged analysis semantics and its single destination", () => {
  const overviewStart = screenSource.indexOf("function ContactsOverviewContent");
  const listStart = screenSource.indexOf("function ContactsListContent");
  const overviewSource = screenSource.slice(overviewStart, listStart);
  assert.match(screenSource, /function PriorityNetworkTools/u);
  assert.match(screenSource, /function NetworkPriorityCard/u);
  assert.match(
    screenSource,
    /function NetworkPriorityCard[\s\S]*styles\.contactsLibraryEntry[\s\S]*function PriorityNetworkTools/u
  );
  assert.doesNotMatch(screenSource, /networkPriorityCardInverted/u);
  assert.match(
    screenSource,
    /<NetworkPriorityCard[\s\S]*route="\/contacts\/dashboard"[\s\S]*title="人脉分析"/u
  );
  assert.match(screenSource, /detail="结构、机会与关系质量"/u);
  assert.doesNotMatch(overviewSource, /\/contacts\/graph/u);
});

test("contacts overview retains the contacts library label and direct entry", () => {
  const overviewStart = screenSource.indexOf("function ContactsOverviewContent");
  const listStart = screenSource.indexOf("function ContactsListContent");
  const overviewSource = screenSource.slice(overviewStart, listStart);
  const libraryStart = screenSource.indexOf("function ContactsLibraryEntry");
  const networkStart = screenSource.indexOf("function NetworkPriorityCard");
  const librarySource = screenSource.slice(libraryStart, networkStart);

  assert.ok(overviewStart > -1);
  assert.ok(libraryStart > -1);
  assert.match(overviewSource, /<ContactsLibraryEntry/u);
  assert.match(overviewSource, /router\.push\("\/contacts\/list" as Href\)/u);
  assert.match(librarySource, /联系人库/u);
  assert.doesNotMatch(librarySource, /藏在更深一层/u);
  assert.match(librarySource, /people-outline/u);
  // Compact full-width rows replace the old 88pt card requirement. Actual
  // bounds, order, label reflow and navigation are covered by browser rendering.
  assert.doesNotMatch(librarySource, /contactsListDrilldown/u);
  assert.doesNotMatch(overviewSource, /title="联系人列表"/u);
});

test("contacts list separates progress and action filters and hides acquisition filters", () => {
  const listStart = screenSource.indexOf("function ContactsListContent");
  const listScreenStart = screenSource.indexOf("function ContactsListScreen");
  const listSource = screenSource.slice(listStart, listScreenStart);

  assert.match(listSource, /<ContactFilterToolbar/u);
  assert.doesNotMatch(listSource, /advancedFilterSections\.map/u);
});

test("contacts overview does not initialize the deep contact list data sources", () => {
  const overviewScreenStart = screenSource.indexOf(
    "function ContactsOverviewScreen"
  );
  const listScreenStart = screenSource.indexOf("function ContactsListScreen");
  const contactsScreenStart = screenSource.indexOf("export function ContactsScreen");
  const overviewScreenSource = screenSource.slice(
    overviewScreenStart,
    listScreenStart
  );
  const contactsScreenSource = screenSource.slice(contactsScreenStart);

  assert.ok(overviewScreenStart > -1);
  assert.ok(listScreenStart > overviewScreenStart);
  assert.ok(contactsScreenStart > listScreenStart);
  assert.match(
    contactsScreenSource,
    /mode === "overview" \? <ContactsOverviewScreen \/> : <ContactsListScreen \/>/u
  );
  assert.doesNotMatch(overviewScreenSource, /useApiResource/u);
  assert.doesNotMatch(overviewScreenSource, /contactsListPath/u);
  assert.doesNotMatch(overviewScreenSource, /relationshipSearchSuggestions/u);
  assert.doesNotMatch(overviewScreenSource, /contactsToSummaries/u);
});

test("contacts list keeps recent relationship searches as local reusable chips", () => {
  assert.match(screenSource, /type RecentRelationshipSearch/u);
  assert.match(screenSource, /function RecentRelationshipSearchesRow/u);
  assert.match(screenSource, /recentRelationshipSearches/u);
  assert.match(screenSource, /rememberRelationshipSearch/u);
  assert.match(screenSource, /onSelectRecentRelationshipSearch/u);
  assert.match(screenSource, /最近搜索/u);
  assert.match(screenSource, /只保存在本机/u);
  assert.match(screenSource, /runRelationshipSearch\([\s\S]*rememberRecent/u);
  assert.match(screenSource, /<RecentRelationshipSearchesRow[\s\S]*searches=\{recentRelationshipSearches\}/u);
  assert.doesNotMatch(screenSource, /AsyncStorage|SecureStore|savedSearchesApi/u);
});

test("recent relationship searches sit below search actions before the filter toolbar", () => {
  const listStart = screenSource.indexOf("function ContactsListContent");
  const listEnd = screenSource.indexOf("export function ContactsScreen");
  const listSource = screenSource.slice(listStart, listEnd);
  const actionRowIndex = listSource.indexOf("styles.searchActionRow");
  const recentIndex = listSource.indexOf("<RecentRelationshipSearchesRow");
  const filterToolbarIndex = listSource.indexOf("<ContactFilterToolbar");

  assert.ok(actionRowIndex > -1);
  assert.ok(recentIndex > actionRowIndex);
  assert.ok(filterToolbarIndex > recentIndex);
});

test("contact filters share one compact four-button toolbar", () => {
  const toolbarStart = screenSource.indexOf("function ContactFilterToolbar");
  const toolbarEnd = screenSource.indexOf("function ContactCard");
  const toolbarSource = screenSource.slice(toolbarStart, toolbarEnd);

  assert.match(toolbarSource, /useState<ContactFilterMenuId \| null>/u);
  assert.match(toolbarSource, /label: "行业"/u);
  assert.match(toolbarSource, /label: "进展"/u);
  assert.match(toolbarSource, /label: "行动"/u);
  assert.match(toolbarSource, /label: "更多"/u);
  assert.match(toolbarSource, /accessibilityState=\{\{ expanded: activeMenu === item\.id \}\}/u);
  assert.match(screenSource, /filterToolbarRow:[\s\S]*flexDirection: "row"/u);
  assert.match(screenSource, /filterToolbarButton:[\s\S]*flex: 1/u);
  assert.doesNotMatch(toolbarSource, /CollapsibleFilterSection/u);
});

test("contact filters expose their selected state to VoiceOver", () => {
  const filtersStart = screenSource.indexOf("function StatusFilterChip");
  const filtersEnd = screenSource.indexOf("function ContactCard");
  const filtersSource = screenSource.slice(filtersStart, filtersEnd);

  assert.match(
    filtersSource,
    /accessibilityState=\{\{ selected: option\.selected \}\}/u
  );
  assert.match(filtersSource, /accessibilityState=\{\{ selected \}\}/u);
});
