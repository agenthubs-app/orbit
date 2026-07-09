import type {
  RelationshipNaturalSearchResult,
  RelationshipNaturalSearchBusinessIntent,
  RelationshipNaturalSearchIndustry,
  RelationshipNaturalSearchInput,
  RelationshipNaturalSearchResultItem,
  RelationshipNaturalSearchValueType,
} from "../search/contract";
import { createRelationshipNaturalSearchService } from "../search/service-factory";
import type {
  RelationshipNaturalSearchService,
  RelationshipNaturalSearchServiceResult,
} from "../search/service";

export interface ContactRecommendationContextMessage {
  role: "user" | "assistant" | "system" | string;
  content: string;
}

export interface ContactRecommendationCriteria {
  businessIntent: RelationshipNaturalSearchBusinessIntent | null;
  helpTypes: readonly string[];
  industries: readonly RelationshipNaturalSearchIndustry[];
  relationshipPolicy: "existing_links_only";
  searchQuery: string;
  valueTypes: readonly RelationshipNaturalSearchValueType[];
}

export interface ContactRecommendationCandidate {
  contactId: string;
  databaseQueryExecuted: boolean;
  displayName: string;
  evidenceIds: readonly string[];
  matchReasons: readonly string[];
  matchScore: number;
  organization: string;
  recommendedAction: string;
  relationshipPath: string;
  role: string;
  sourceLabel: string;
}

export interface ContactRecommendationResult {
  candidates: readonly ContactRecommendationCandidate[];
  criteria: ContactRecommendationCriteria;
  databaseQueryExecuted: boolean;
  method: "rules_v1";
  requestedMethod?: string;
  state: "success" | "empty";
  summary: string;
}

export type ContactsRecommendationSearchToolResult =
  | ContactRecommendationResult
  | Promise<ContactRecommendationResult>;

export interface ContactsRecommendationSearchTool {
  recommend: (input: {
    contextMessages?: readonly ContactRecommendationContextMessage[];
    locale?: string | null;
    query: string;
    toolArguments?: Record<string, unknown> | null;
  }) => ContactsRecommendationSearchToolResult;
}

export interface ContactsRecommendationSearchToolOptions {
  relationshipSearchService?: RelationshipNaturalSearchService;
}

function readText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function contextText(input: {
  contextMessages?: readonly ContactRecommendationContextMessage[];
  query: string;
  toolArguments?: Record<string, unknown> | null;
}): string {
  const argumentQuery = readText(input.toolArguments?.query);

  return [
    input.query,
    argumentQuery,
    ...(input.contextMessages ?? []).map((message) => message.content),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function includesAny(value: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(value));
}

function extractRuleCriteria(input: {
  contextMessages?: readonly ContactRecommendationContextMessage[];
  query: string;
  toolArguments?: Record<string, unknown> | null;
}): ContactRecommendationCriteria {
  const text = contextText(input);
  const industries: RelationshipNaturalSearchIndustry[] = [];
  const valueTypes: RelationshipNaturalSearchValueType[] = [];
  const helpTypes: string[] = [];
  let businessIntent: RelationshipNaturalSearchBusinessIntent | null = null;
  // 模型抽取的英文检索词（`toolArguments.searchTerms`）优先作为 searchQuery。
  // 有它时，下面的中文正则领域分支不会覆盖它（它们只在 searchQuery === input.query
  // 时改写），正则仅继续补充 industry/intent/valueType 等过滤条件。没有模型词时，
  // 回退到原来的正则词表逻辑。
  const modelSearchTerms = readText(input.toolArguments?.searchTerms);
  let searchQuery = modelSearchTerms ?? input.query;

  if (
    includesAny(text, [
      /fintech/i,
      /finance/i,
      /financial/i,
      /banking/i,
      /payment/i,
      /金融/,
      /财务/,
      /銀行|银行/,
      /支付/,
    ])
  ) {
    industries.push("fintech");
    valueTypes.push("referral_path", "strategic_intro");
    searchQuery = searchQuery === input.query ? "fintech referral" : searchQuery;
  }

  if (includesAny(text, [/climate/i, /energy/i, /storage/i, /气候/, /能源/, /储能/])) {
    industries.push("climate");
    valueTypes.push("strategic_intro", "commercial_opportunity");
    searchQuery = searchQuery === input.query ? "climate intro" : searchQuery;
  }

  // 以下领域词表对应 live 库 seed 的关系数据实际词汇（restaurant/ecommerce/retail/
  // saas/investor/manufacturing/marketing/tourism/education/ai）。把中文/英文说法改写
  // 成能在后端子串匹配命中的英文关键词，避免中文原样进入后端（后端会剥离中日文分词）。
  if (
    includesAny(text, [
      /restaurant/i,
      /\bdining\b/i,
      /\bfood\b/i,
      /f\s*&\s*b/i,
      /hospitality/i,
      /catering/i,
      /餐饮|餐廳|餐厅|餐馆|餐館|菜馆|菜館|川菜|中餐|美食|饮食|飲食|食材|门店|門店|连锁/,
    ])
  ) {
    valueTypes.push("commercial_opportunity");
    searchQuery = searchQuery === input.query ? "restaurant" : searchQuery;
  }

  if (
    includesAny(text, [
      /tourism/i,
      /travel/i,
      /inbound/i,
      /旅游|旅遊|旅行|文旅|入境|訪日|访日|观光|觀光/,
    ])
  ) {
    searchQuery = searchQuery === input.query ? "tourism" : searchQuery;
  }

  if (
    includesAny(text, [
      /e-?commerce/i,
      /retail/i,
      /直播电商|跨境电商|电商|零售|带货|新零售/,
    ])
  ) {
    valueTypes.push("commercial_opportunity");
    searchQuery = searchQuery === input.query ? "ecommerce" : searchQuery;
  }

  if (
    includesAny(text, [
      /saas/i,
      /enterprise software/i,
      /企业服务|企业软件|軟體|中台/,
    ])
  ) {
    industries.push("enterprise_saas");
    searchQuery = searchQuery === input.query ? "saas" : searchQuery;
  }

  if (
    includesAny(text, [
      /investor/i,
      /investment/i,
      /venture/i,
      /fundrais/i,
      /\bseed\b/i,
      /投资人|投资|融资|天使|风投|创投/,
    ])
  ) {
    valueTypes.push("strategic_intro");
    searchQuery = searchQuery === input.query ? "investor" : searchQuery;
  }

  if (includesAny(text, [/marketing/i, /\bgrowth\b/i, /营销|市场推广|增长|获客/])) {
    searchQuery = searchQuery === input.query ? "marketing" : searchQuery;
  }

  if (
    includesAny(text, [
      /manufactur/i,
      /supply chain/i,
      /factory/i,
      /制造|供应链|工厂|生产/,
    ])
  ) {
    searchQuery = searchQuery === input.query ? "manufacturing" : searchQuery;
  }

  if (includesAny(text, [/education/i, /edtech/i, /教育|培训|课程/])) {
    searchQuery = searchQuery === input.query ? "education" : searchQuery;
  }

  if (
    includesAny(text, [
      /\bai\b/i,
      /machine learning/i,
      /\bml\b/i,
      /人工智能|机器学习|大模型|算法/,
    ])
  ) {
    searchQuery = searchQuery === input.query ? "ai" : searchQuery;
  }

  if (
    includesAny(text, [
      /合作/,
      /partner/i,
      /partnership/i,
      /collaborat/i,
      /产品开发/,
      /product/i,
    ])
  ) {
    helpTypes.push("explore_partnership");
    businessIntent = "explore_partnership";
  }

  if (includesAny(text, [/介绍/, /引荐/, /谁认识/, /誰認識/, /intro/i, /referral/i])) {
    helpTypes.push("find_warm_intro");
    businessIntent ??= "find_warm_intro";
    if (searchQuery === input.query && industries.length === 0) {
      searchQuery = "warm intro referral";
    }
  }

  if (includesAny(text, [/客户/, /客戶/, /customer/i, /reference/i])) {
    helpTypes.push("source_customer_reference");
    businessIntent ??= "source_customer_reference";
  }

  return {
    businessIntent,
    helpTypes: Array.from(new Set(helpTypes)),
    industries: Array.from(new Set(industries)),
    relationshipPolicy: "existing_links_only",
    searchQuery,
    valueTypes: Array.from(new Set(valueTypes)),
  };
}

// 模型抽词路径的排名参数：按 token 命中给候选打分，姓名/职位/组织命中权重高于
// 关系上下文命中；同一联系人可能有多条 connection，只保留得分最高的一条。
const rankedCandidateLimit = 8;

// 泛词不参与相关度排名：它们在几乎所有关系记录里都会命中，会把领域词的信号淹没。
const rankingStopwords = new Set([
  "and",
  "are",
  "business",
  "can",
  "contact",
  "contacts",
  "entry",
  "find",
  "for",
  "help",
  "market",
  "need",
  "people",
  "person",
  "product",
  "products",
  "someone",
  "the",
  "who",
  "with",
  "you",
  "your",
]);

function rankingTokensFor(searchQuery: string): readonly string[] {
  const lowered = searchQuery.toLowerCase();
  const latinTokens = lowered
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !rankingStopwords.has(token));
  // 中日文 token（如联系人名"梁佳怡"）整段保留做子串匹配，
  // 支持"某某是谁/是做什么的"这类按名字调取实体信息的查询。
  const cjkTokens: string[] = (
    lowered.match(/[぀-ヿ㐀-鿿]{2,}/gu) ?? []
  ).filter((token: string) => token.length <= 12);

  return Array.from(new Set([...latinTokens, ...cjkTokens]));
}

// 行业桶的确定性扩展词：模型抽词逐轮会有波动，行业方向一旦被正则桶识别，
// 就补上该行业在关系库里的稳定身份词（行业词 + 能帮上忙的角色词），
// 保证同一类查询的候选资格不随模型输出漂移。
const industryRankingExpansions: Partial<
  Record<RelationshipNaturalSearchIndustry, readonly string[]>
> = {
  climate: ["climate", "energy", "storage", "carbon"],
  enterprise_saas: ["saas", "software", "consultant"],
  fintech: [
    "fintech",
    "finance",
    "financial",
    "payment",
    "banking",
    "investor",
    "capital",
    "venture",
    "fundraising",
  ],
};

function rankingTokensForCriteria(
  criteria: ContactRecommendationCriteria,
): readonly string[] {
  const tokens = new Set(rankingTokensFor(criteria.searchQuery));

  for (const industry of criteria.industries) {
    for (const token of industryRankingExpansions[industry] ?? []) {
      tokens.add(token);
    }
  }

  return Array.from(tokens);
}

interface RankedSearchItem {
  item: RelationshipNaturalSearchResultItem;
  matchedTokens: readonly string[];
  strongHits: number;
  weakHits: number;
}

function rankSearchItem(
  item: RelationshipNaturalSearchResultItem,
  tokens: readonly string[],
): RankedSearchItem | null {
  const strongText = [item.displayName, item.role, item.organization, item.location]
    .join(" ")
    .toLowerCase();
  const weakText = [
    item.industry,
    item.relationshipContext,
    item.recommendedAction,
    ...item.evidence.map((evidence) => evidence.excerpt),
  ]
    .join(" ")
    .toLowerCase();
  const matchedTokens: string[] = [];
  let strongHits = 0;
  let weakHits = 0;

  for (const token of tokens) {
    if (strongText.includes(token)) {
      strongHits += 1;
      matchedTokens.push(token);
    } else if (weakText.includes(token)) {
      weakHits += 1;
      matchedTokens.push(token);
    }
  }

  return strongHits + weakHits > 0
    ? { item, matchedTokens, strongHits, weakHits }
    : null;
}

// 职位/组织/姓名等身份字段命中主导排序；证据文本命中封顶计入，
// 避免种子数据里重复出现的模板句把弱命中堆成高分。
function rankedRelevance(ranked: RankedSearchItem): number {
  return ranked.strongHits * 3 + Math.min(ranked.weakHits, 2);
}

function rankedMatchScore(ranked: RankedSearchItem): number {
  return Math.min(
    97,
    55 + ranked.strongHits * 16 + Math.min(ranked.weakHits, 2) * 5,
  );
}

function betterRankedItem(
  left: RankedSearchItem,
  right: RankedSearchItem,
): boolean {
  const relevanceDelta = rankedRelevance(left) - rankedRelevance(right);

  if (relevanceDelta !== 0) {
    return relevanceDelta > 0;
  }

  return left.item.value.score > right.item.value.score;
}

function resultForRankedSearch(
  criteria: ContactRecommendationCriteria,
  searchResult: RelationshipNaturalSearchResult,
): ContactRecommendationResult {
  if (searchResult.success !== true) {
    return resultForSearch(criteria, searchResult);
  }

  const tokens = rankingTokensForCriteria(criteria);
  const bestByContact = new Map<string, RankedSearchItem>();

  for (const item of searchResult.data.results) {
    const ranked = rankSearchItem(item, tokens);

    if (!ranked) {
      continue;
    }

    const current = bestByContact.get(item.contactId);

    if (!current || betterRankedItem(ranked, current)) {
      bestByContact.set(item.contactId, ranked);
    }
  }

  const topRanked = Array.from(bestByContact.values())
    .sort((left, right) => (betterRankedItem(left, right) ? -1 : 1))
    .slice(0, rankedCandidateLimit);
  const candidates = topRanked
    .map((ranked): ContactRecommendationCandidate | null => {
      const candidate = candidateFor(ranked.item);

      return candidate
        ? {
            ...candidate,
            matchReasons: [
              `Matched search terms: ${ranked.matchedTokens.join(", ")}.`,
              ...candidate.matchReasons,
            ],
            matchScore: rankedMatchScore(ranked),
          }
        : null;
    })
    .filter((candidate): candidate is ContactRecommendationCandidate =>
      Boolean(candidate),
    );

  return {
    candidates,
    criteria,
    databaseQueryExecuted:
      searchResult.data.provenance?.databaseQueryExecuted ??
      candidates.some((candidate) => candidate.databaseQueryExecuted),
    method: "rules_v1",
    state: candidates.length > 0 ? "success" : "empty",
    summary:
      candidates.length > 0
        ? `${candidates.length} existing relationship candidate(s) ranked by model search terms for the rules_v1 contact recommendation method.`
        : "No existing relationship candidate matched the model search terms for the rules_v1 contact recommendation method.",
  };
}

function searchInputFor(criteria: ContactRecommendationCriteria): RelationshipNaturalSearchInput {
  return {
    businessIntent: criteria.businessIntent,
    industryFilters: criteria.industries,
    query: criteria.searchQuery,
    valueTypeFilters: criteria.valueTypes,
  };
}

function evidenceIdsFor(item: RelationshipNaturalSearchResultItem): readonly string[] {
  return Array.from(
    new Set([
      ...item.evidence.map((evidence) => evidence.evidenceId),
      ...item.value.evidenceIds,
      item.source.evidenceId,
    ]),
  );
}

function candidateFor(
  item: RelationshipNaturalSearchResultItem,
): ContactRecommendationCandidate | null {
  const evidenceIds = evidenceIdsFor(item);

  if (!item.contactId || evidenceIds.length === 0) {
    return null;
  }

  return {
    contactId: item.contactId,
    databaseQueryExecuted: item.databaseQueryExecuted,
    displayName: item.displayName,
    evidenceIds,
    matchReasons: [item.matchScore.rationale, item.value.rationale],
    matchScore: item.matchScore.value,
    organization: item.organization,
    recommendedAction: item.recommendedAction,
    relationshipPath: item.relationshipContext,
    role: item.role,
    sourceLabel: item.source.label,
  };
}

function isPromiseLike<TResult>(
  result: RelationshipNaturalSearchServiceResult<TResult>,
): result is Promise<TResult> {
  const maybePromise = result as { then?: unknown };

  return typeof maybePromise.then === "function";
}

function resultForSearch(
  criteria: ContactRecommendationCriteria,
  searchResult: RelationshipNaturalSearchResult,
): ContactRecommendationResult {
  const candidates =
    searchResult.success === true
      ? searchResult.data.results
          .map(candidateFor)
          .filter((candidate): candidate is ContactRecommendationCandidate =>
            Boolean(candidate),
          )
          .sort((left, right) => right.matchScore - left.matchScore)
      : [];

  return {
    candidates,
    criteria,
    databaseQueryExecuted:
      searchResult.success === true
        ? searchResult.data.provenance?.databaseQueryExecuted ??
          candidates.some((candidate) => candidate.databaseQueryExecuted)
        : false,
    method: "rules_v1",
    state: candidates.length > 0 ? "success" : "empty",
    summary:
      candidates.length > 0
        ? `${candidates.length} existing relationship candidate(s) matched the rules_v1 contact recommendation method.`
        : "No existing relationship candidate carried enough source evidence for the rules_v1 contact recommendation method.",
  };
}

export function createContactsRecommendationSearchTool(
  options: ContactsRecommendationSearchToolOptions = {},
): ContactsRecommendationSearchTool {
  const relationshipSearchService =
    options.relationshipSearchService ?? createRelationshipNaturalSearchService();

  return {
    recommend(request): ContactsRecommendationSearchToolResult {
      const criteria = extractRuleCriteria(request);
      const modelSearchTerms = readText(request.toolArguments?.searchTerms);

      // 有模型抽取的检索词时，取全量关系池并按 token 相关度排名，避免后端
      // AND 子串匹配对多词查询过严、对元数据标签循环命中的问题。
      if (modelSearchTerms) {
        const poolResult = relationshipSearchService.queryRelationships({});

        if (isPromiseLike(poolResult)) {
          return poolResult.then((resolved) =>
            resultForRankedSearch(criteria, resolved),
          );
        }

        return resultForRankedSearch(criteria, poolResult);
      }

      const searchResult =
        relationshipSearchService.queryRelationships(searchInputFor(criteria));

      if (isPromiseLike(searchResult)) {
        return searchResult.then((resolved) => resultForSearch(criteria, resolved));
      }

      return resultForSearch(criteria, searchResult);
    },
  };
}
