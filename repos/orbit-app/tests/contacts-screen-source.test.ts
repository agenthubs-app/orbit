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

test("contacts screen exposes web relationship search intent and industry filters", () => {
  assert.match(screenSource, /relationshipIntentOptions/u);
  assert.match(screenSource, /relationshipIndustryOptions/u);
  assert.match(screenSource, /selectedRelationshipIntent/u);
  assert.match(screenSource, /selectedRelationshipIndustries/u);
  assert.match(screenSource, /toggleRelationshipIndustryFilter/u);
  assert.match(screenSource, /businessIntent: selectedRelationshipIntent/u);
  assert.match(screenSource, /industryFilters: selectedRelationshipIndustries/u);
  assert.match(screenSource, /title="要找什么"/u);
  assert.match(screenSource, /title="行业"/u);
  assert.match(screenSource, /"找暖介绍"/u);
  assert.match(screenSource, /"企业 SaaS"/u);
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
  assert.match(screenSource, /useState<ContactListStatusFilter \| null>\(\s*initialStatusFilter/u);
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
  const graphIndex = screenSource.indexOf('title="人脉图谱"', priorityToolsStart);
  const dashboardIndex = screenSource.indexOf(
    'title="人脉表盘"',
    priorityToolsStart
  );
  const listEntryIndex = overviewSource.indexOf("<ContactsLibraryEntry");

  assert.match(contactsTabSource, /ContactsScreen/u);
  assert.doesNotMatch(contactsTabSource, /mode="list"/u);
  assert.match(contactsListRouteSource, /<ContactsScreen mode="list" \/>/u);
  assert.match(screenSource, /<AppScreen eyebrow="人脉总览" title="人脉">/u);
  assert.match(screenSource, /eyebrow="联系人"/u);
  assert.match(screenSource, /联系人库/u);
  assert.doesNotMatch(screenSource, /人脉工作台/u);
  assert.ok(overviewStart > -1);
  assert.ok(listStart > overviewStart);
  assert.ok(priorityToolsStart > -1);
  assert.ok(graphIndex > priorityToolsStart);
  assert.ok(dashboardIndex > graphIndex);
  assert.ok(listEntryIndex > -1);
  assert.doesNotMatch(overviewSource, /contacts\.map\(\(contact\)/u);
  assert.match(listSource, /contacts\.map\(\(contact\)/u);
});

test("contacts overview opens directly on network tools before the raw list entry", () => {
  const overviewStart = screenSource.indexOf("function ContactsOverviewContent");
  const listStart = screenSource.indexOf("function ContactsListContent");
  const overviewSource = screenSource.slice(overviewStart, listStart);
  const toolGridIndex = overviewSource.indexOf("<OverviewToolGrid");
  const listDrilldownIndex = overviewSource.indexOf("<ContactsLibraryEntry");

  assert.doesNotMatch(overviewSource, /<RelationshipWorkbenchHero/u);
  assert.ok(toolGridIndex > -1, "contacts overview should open with tool cards");
  assert.match(overviewSource, /<PriorityNetworkTools contactsCount=\{contactsCount\} \/>/u);
  assert.match(
    screenSource,
    /<NetworkPriorityCard[\s\S]*title="人脉图谱"/u
  );
  assert.match(
    screenSource,
    /<NetworkPriorityCard[\s\S]*title="人脉表盘"/u
  );
  assert.ok(
    listDrilldownIndex > toolGridIndex,
    "contacts library should be demoted below the network tools"
  );
  assert.match(screenSource, /router\.push\(route as Href\)/u);
  assert.match(screenSource, /route="\/contacts\/graph"/u);
  assert.match(screenSource, /route="\/contacts\/dashboard"/u);
  assert.match(overviewSource, /router\.push\("\/contacts\/pipeline" as Href\)/u);
  assert.match(overviewSource, /router\.push\("\/contacts\/list" as Href\)/u);
  assert.match(screenSource, /styles\.overviewToolGrid/u);
  assert.match(screenSource, /styles\.overviewToolCardPrimary/u);
  assert.match(screenSource, /styles\.contactsLibraryEntry/u);
});

test("contacts overview treats graph and dashboard as the primary first screen", () => {
  const overviewStart = screenSource.indexOf("function ContactsOverviewContent");
  const listStart = screenSource.indexOf("function ContactsListContent");
  const overviewSource = screenSource.slice(overviewStart, listStart);
  const primaryToolsIndex = overviewSource.indexOf("<PriorityNetworkTools");
  const secondaryToolsIndex = overviewSource.indexOf("<OverviewToolGrid");
  const listDrilldownIndex = overviewSource.indexOf("<ContactsLibraryEntry");

  assert.ok(primaryToolsIndex > -1, "primary network tools should render first");
  assert.ok(
    secondaryToolsIndex > primaryToolsIndex,
    "secondary tools should sit below graph and dashboard"
  );
  assert.ok(
    listDrilldownIndex > secondaryToolsIndex,
    "the contacts library should remain the deepest entry on the overview"
  );
  assert.match(screenSource, /function PriorityNetworkTools/u);
  assert.match(screenSource, /function NetworkPriorityCard/u);
  assert.match(screenSource, /styles\.networkPriorityStage/u);
  assert.match(screenSource, /styles\.networkPriorityCard/u);
  assert.match(screenSource, /styles\.networkPriorityMetric/u);
  assert.match(
    screenSource,
    /<NetworkPriorityCard[\s\S]*route="\/contacts\/graph"[\s\S]*title="人脉图谱"/u
  );
  assert.match(
    screenSource,
    /<NetworkPriorityCard[\s\S]*route="\/contacts\/dashboard"[\s\S]*title="人脉表盘"/u
  );
});

test("contacts overview demotes raw contacts into a compact library entry", () => {
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
  assert.match(librarySource, /藏在更深一层/u);
  assert.match(screenSource, /contactsLibraryEntry:[\s\S]*minHeight: 48/u);
  assert.doesNotMatch(librarySource, /contactsListDrilldown/u);
  assert.doesNotMatch(overviewSource, /title="联系人列表"/u);
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

test("recent relationship searches sit below search actions before relationship filters", () => {
  const listStart = screenSource.indexOf("function ContactsListContent");
  const listEnd = screenSource.indexOf("export function ContactsScreen");
  const listSource = screenSource.slice(listStart, listEnd);
  const actionRowIndex = listSource.indexOf("styles.searchActionRow");
  const recentIndex = listSource.indexOf("<RecentRelationshipSearchesRow");
  const intentFilterIndex = listSource.indexOf('title="要找什么"');

  assert.ok(actionRowIndex > -1);
  assert.ok(recentIndex > actionRowIndex);
  assert.ok(intentFilterIndex > recentIndex);
});
