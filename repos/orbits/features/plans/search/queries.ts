/**
 * R34 SC-01：按目标类型的查询模板（plan-v3/DESIGN.md §3.2「规划由规则不是 AI 决定搜什么」）。
 *
 * - 6 种目标各一组，三语各写一份；顺序固定 点名（具体机构 / 活动 / 名单）→ 规则门槛（制度、资格、流程）→ 市场数据（统计）；
 *   上限 D-5：点名 3、门槛 3、市场 2，总数 ≤ `PLAN_SEARCH_PER_PLAN_LIMIT`。
 * - 查询词只由模板固定词 + 目标原文 `{goal}` + 行业标签 `{industry}` 组成。`premise` / `purpose` 的自由文本一律不进查询：
 *   那里会出现联系人与本人姓名（个人信息不得外发，PLANNER 易错边界第一条）。
 * - 日本站点优先：zh / en 模板里也带「日本 / Japan」。
 */
import { PLAN_SEARCH_PER_PLAN_LIMIT } from "../../ai-quota/constants";
import type { PlanCopyLanguage } from "../../../shared/compute/plan-template-copy";
import type { IndustryIdCode } from "../../../shared/contract/industries";
import type { PlanGoalKind } from "../../../shared/contract/plan-v2";
import { industryLabel } from "../../../shared/domain/industries";
import type { PlanSearchInput, PlanSearchQuery, PlanSearchQueryKind } from "./types";

export const PLAN_SEARCH_KIND_CAPS: Readonly<Record<PlanSearchQueryKind, number>> = { market: 2, named: 3, threshold: 3 };
/** 目标原文进查询前的长度上限（搜索引擎对长查询降权；片段断在这里不影响召回）。 */
export const PLAN_SEARCH_GOAL_TEXT_MAX = 60;

type Templates = Readonly<Record<PlanSearchQueryKind, readonly string[]>>;
type KindTemplates = Readonly<Record<PlanCopyLanguage, Templates>>;

/** `{goal}` = 目标原文；`{industry}` = 第一个行业的标签（没有行业时换成目标原文）。 */
const TEMPLATES: Readonly<Record<PlanGoalKind, KindTemplates>> = {
  launch: {
    ja: {
      named: ["{industry} スタートアップ 支援プログラム 一覧", "{goal} 補助金 公募", "{industry} 展示会 ピッチイベント 一覧"],
      threshold: ["{goal} 許認可 届出 要件", "{industry} 新規事業 開業 手続き", "{industry} 業界団体 加入 条件"],
      market: ["{industry} 市場規模 統計", "{goal} 利用者数 推移 調査"],
    },
    zh: {
      named: ["日本 {industry} 创业 支援项目 名单", "{goal} 补助金 公开征集", "日本 {industry} 展会 路演活动 一览"],
      threshold: ["{goal} 许可 备案 要求", "日本 {industry} 新业务 开业 手续", "日本 {industry} 行业协会 加入 条件"],
      market: ["日本 {industry} 市场规模 统计", "{goal} 用户数 趋势 调查"],
    },
    en: {
      named: ["Japan {industry} startup support programs list", "{goal} grant subsidy open call Japan", "Japan {industry} trade show pitch events"],
      threshold: ["{goal} license registration requirements Japan", "Japan {industry} new business registration procedure", "Japan {industry} industry association membership requirements"],
      market: ["Japan {industry} market size statistics", "{goal} user numbers trend survey"],
    },
  },
  fundraising: {
    ja: {
      named: ["{industry} ベンチャーキャピタル 投資先 一覧", "{goal} シード 資金調達 投資家", "{industry} アクセラレーター 募集"],
      threshold: ["{goal} 資金調達 新株予約権 条件", "{industry} 投資 審査 基準", "{industry} 補助金 助成金 要件"],
      market: ["{industry} 資金調達 件数 統計", "{goal} 資金調達 平均額 調査"],
    },
    zh: {
      named: ["日本 {industry} 风险投资 投资组合 名单", "{goal} 种子轮 融资 投资人", "日本 {industry} 加速器 招募"],
      threshold: ["{goal} 融资 新股预约权 条件", "日本 {industry} 投资 审核 标准", "日本 {industry} 补助金 资助 要求"],
      market: ["日本 {industry} 融资 件数 统计", "{goal} 融资 平均金额 调查"],
    },
    en: {
      named: ["Japan {industry} venture capital portfolio list", "{goal} seed fundraising investors Japan", "Japan {industry} accelerator applications"],
      threshold: ["{goal} fundraising convertible equity terms Japan", "Japan {industry} investment due diligence criteria", "Japan {industry} grant subsidy eligibility"],
      market: ["Japan {industry} fundraising deals statistics", "{goal} average funding round size survey"],
    },
  },
  sales: {
    ja: {
      named: ["{industry} 企業 一覧 導入事例", "{goal} 展示会 商談会", "{industry} 業界団体 会員 名簿"],
      threshold: ["{industry} 取引 必要資格 認証", "{goal} 入札 参加資格 要件", "{industry} 調達 ガイドライン"],
      market: ["{industry} 市場規模 推移", "{goal} 導入率 統計"],
    },
    zh: {
      named: ["日本 {industry} 企业 名单 导入案例", "{goal} 展会 洽谈会", "日本 {industry} 行业协会 会员 名录"],
      threshold: ["日本 {industry} 交易 所需资质 认证", "{goal} 投标 参加资格 要求", "日本 {industry} 采购 指南"],
      market: ["日本 {industry} 市场规模 变化", "{goal} 导入率 统计"],
    },
    en: {
      named: ["Japan {industry} company list case studies", "{goal} trade show business matching Japan", "Japan {industry} industry association member directory"],
      threshold: ["Japan {industry} vendor qualification certification", "{goal} tender bidding eligibility requirements Japan", "Japan {industry} procurement guidelines"],
      market: ["Japan {industry} market size trend", "{goal} adoption rate statistics"],
    },
  },
  hiring: {
    ja: {
      named: ["{industry} 採用イベント 一覧", "{goal} 求人媒体 比較", "{industry} 人材紹介会社 一覧"],
      threshold: ["{goal} 採用 在留資格 要件", "{industry} 雇用 労働条件 法令", "{goal} 採用 必要資格"],
      market: ["{industry} 平均年収 統計", "{goal} 有効求人倍率 推移"],
    },
    zh: {
      named: ["日本 {industry} 招聘活动 一览", "{goal} 招聘渠道 比较", "日本 {industry} 猎头公司 名单"],
      threshold: ["{goal} 招聘 在留资格 要求", "日本 {industry} 雇佣 劳动条件 法规", "{goal} 招聘 所需资格"],
      market: ["日本 {industry} 平均年收入 统计", "{goal} 有效求人倍率 趋势"],
    },
    en: {
      named: ["Japan {industry} recruiting events list", "{goal} job boards comparison Japan", "Japan {industry} recruitment agencies list"],
      threshold: ["{goal} hiring visa status requirements Japan", "Japan {industry} employment labor law conditions", "{goal} hiring required qualifications"],
      market: ["Japan {industry} average salary statistics", "{goal} job openings ratio trend Japan"],
    },
  },
  partnership: {
    ja: {
      named: ["{industry} 業務提携 事例 一覧", "{goal} パートナー 募集 プログラム", "{industry} 業界団体 交流会"],
      threshold: ["{goal} 業務提携 契約 条項", "{industry} 提携 審査 基準", "{goal} 共同開発 知財 取り決め"],
      market: ["{industry} 提携 件数 統計", "{goal} 市場 動向 調査"],
    },
    zh: {
      named: ["日本 {industry} 业务合作 案例 一览", "{goal} 合作伙伴 招募 计划", "日本 {industry} 行业协会 交流会"],
      threshold: ["{goal} 业务合作 合同 条款", "日本 {industry} 合作 审核 标准", "{goal} 共同开发 知识产权 约定"],
      market: ["日本 {industry} 合作 件数 统计", "{goal} 市场 动向 调查"],
    },
    en: {
      named: ["Japan {industry} business partnership case studies", "{goal} partner program applications Japan", "Japan {industry} industry association networking events"],
      threshold: ["{goal} partnership agreement clauses Japan", "Japan {industry} partner screening criteria", "{goal} joint development IP arrangement"],
      market: ["Japan {industry} partnership deals statistics", "{goal} market trend survey"],
    },
  },
  career: {
    ja: {
      named: ["{industry} 転職 求人 一覧", "{goal} 勉強会 コミュニティ 一覧", "{industry} キャリアイベント"],
      threshold: ["{goal} 必要資格 要件", "{industry} 転職 求められるスキル", "{goal} 在留資格 就労 要件"],
      market: ["{industry} 平均年収 統計", "{goal} 求人倍率 推移"],
    },
    zh: {
      named: ["日本 {industry} 跳槽 招聘 一览", "{goal} 学习会 社群 一览", "日本 {industry} 职业活动"],
      threshold: ["{goal} 所需资格 要求", "日本 {industry} 跳槽 需要的技能", "{goal} 在留资格 就业 要求"],
      market: ["日本 {industry} 平均年收入 统计", "{goal} 求人倍率 趋势"],
    },
    en: {
      named: ["Japan {industry} job openings list", "{goal} study groups communities Japan", "Japan {industry} career events"],
      threshold: ["{goal} required qualifications Japan", "Japan {industry} career change required skills", "{goal} work visa status requirements Japan"],
      market: ["Japan {industry} average salary statistics", "{goal} job openings ratio trend"],
    },
  },
};

const ORDER: readonly PlanSearchQueryKind[] = ["named", "threshold", "market"];

/** 目标原文：合并空白、截到上限；空字符串 = 没有可搜的目标。 */
export function planSearchGoalTerm(goalText: string): string {
  const compact = goalText.replace(/\s+/gu, " ").trim();
  return compact.length > PLAN_SEARCH_GOAL_TEXT_MAX ? compact.slice(0, PLAN_SEARCH_GOAL_TEXT_MAX).trim() : compact;
}

function industryTerm(industries: readonly IndustryIdCode[], language: PlanCopyLanguage): string | null {
  const first = industries[0];
  return first ? industryLabel(first, language) : null;
}

export function planSearchQueries(input: PlanSearchInput): PlanSearchQuery[] {
  const goal = planSearchGoalTerm(input.goalText);
  if (!goal) return [];
  const industry = industryTerm(input.industries, input.language) ?? goal;
  const templates = TEMPLATES[input.goalKind][input.language];
  const seen = new Set<string>();
  const queries: PlanSearchQuery[] = [];
  for (const kind of ORDER) {
    let taken = 0;
    for (const template of templates[kind]) {
      if (taken >= PLAN_SEARCH_KIND_CAPS[kind] || queries.length >= PLAN_SEARCH_PER_PLAN_LIMIT) break;
      const query = template.replaceAll("{goal}", goal).replaceAll("{industry}", industry).replace(/\s+/gu, " ").trim();
      if (!query || seen.has(query)) continue;
      seen.add(query);
      queries.push({ kind, query });
      taken += 1;
    }
  }
  return queries;
}
