/**
 * R34：mock 搜索——按目标类型返回固定 2–4 条来源（公共机构的公开页面，内容为编辑部写的固定摘要），不记账、不联网。
 * `query` 取真实模板生成的前几条查询词，`fetchedAt` = `context.now`，所以起草方拿到的形状与 live 完全一致。
 * 只在 mock 模块模式下使用；live 下没配置时用 `disabled`（绝不在 live 下把演示来源写进用户的正式计划）。
 */
import { planCopy, type PlanTriText } from "../../../shared/compute/plan-template-copy";
import type { PlanGoalKind } from "../../../shared/contract/plan-v2";
import type { PlanSearchSource } from "./filter";
import { planSearchQueries } from "./queries";
import type { PlanSearch, PlanSearchContext, PlanSearchInput, PlanSearchResult } from "./types";

interface MockEntry {
  url: string;
  title: PlanTriText;
  snippet: PlanTriText;
}

const ENTRIES: Readonly<Record<PlanGoalKind, readonly MockEntry[]>> = {
  launch: [
    { snippet: { en: "Tokyo's startup support portal lists public programs, subsidies and consultation desks for founders by stage.", ja: "東京都のスタートアップ支援ポータル。創業段階別に補助金・相談窓口・支援プログラムを一覧できる。", zh: "东京都创业支援门户，按创业阶段列出补助金、咨询窗口和支援项目。" }, title: { en: "Tokyo startup support portal", ja: "東京都 スタートアップ支援ポータル", zh: "东京都创业支援门户" }, url: "https://startup-station.jp/" },
    { snippet: { en: "METI's guide to starting a business in Japan: registration, licenses by sector and the notifications due before opening.", ja: "経済産業省の創業手続きガイド。登記、業種別の許認可、開業前に必要な届出をまとめている。", zh: "经济产业省创业手续指南：登记、按行业的许可、开业前需提交的备案。" }, title: { en: "METI: starting a business", ja: "経済産業省 創業の手続き", zh: "经济产业省：创业手续" }, url: "https://www.meti.go.jp/policy/newbusiness/" },
    { snippet: { en: "e-Stat publishes official statistics on new business formation and survival rates by industry and prefecture.", ja: "e-Stat の開業率・廃業率統計。業種別・都道府県別に新規開業の推移が見られる。", zh: "e-Stat 的开业率与歇业率统计，可按行业和都道府县查看新开业趋势。" }, title: { en: "e-Stat: business formation statistics", ja: "e-Stat 開業率・廃業率", zh: "e-Stat：开业率统计" }, url: "https://www.e-stat.go.jp/" },
  ],
  fundraising: [
    { snippet: { en: "JVCA member directory: venture capital firms active in Japan with stage and sector focus.", ja: "日本ベンチャーキャピタル協会の会員一覧。ステージ・領域別に国内 VC を探せる。", zh: "日本风险投资协会会员名录，可按阶段和领域查找国内 VC。" }, title: { en: "JVCA member list", ja: "JVCA 会員一覧", zh: "JVCA 会员名单" }, url: "https://jvca.jp/" },
    { snippet: { en: "J-KISS: the standard Japanese convertible equity template and the terms founders should check before signing.", ja: "J-KISS（日本版コンバーティブル・エクイティ）のひな形と、署名前に確認すべき条件の解説。", zh: "J-KISS（日本版可转换股权）标准模板及签署前应确认的条件。" }, title: { en: "J-KISS template and terms", ja: "J-KISS ひな形と条件", zh: "J-KISS 模板与条件" }, url: "https://500startups.jp/j-kiss/" },
    { snippet: { en: "INITIAL's annual report on Japanese startup financing: number of deals and median round size by stage.", ja: "INITIAL の国内スタートアップ資金調達レポート。ステージ別の件数と調達額の中央値。", zh: "INITIAL 日本创业公司融资年报：按阶段的件数与融资额中位数。" }, title: { en: "Japan startup finance report", ja: "国内スタートアップ資金調達動向", zh: "日本创业融资动向" }, url: "https://initial.inc/" },
    { snippet: { en: "Japan Finance Corporation's loan programs for new businesses: eligibility, limits and the documents required.", ja: "日本政策金融公庫の新創業融資。対象要件・限度額・必要書類。", zh: "日本政策金融公库新创业融资：对象条件、额度上限与所需材料。" }, title: { en: "JFC new business loans", ja: "日本政策金融公庫 新創業融資", zh: "日本政策金融公库新创业融资" }, url: "https://www.jfc.go.jp/" },
  ],
  sales: [
    { snippet: { en: "JETRO's exhibition calendar: trade shows and business-matching events in Japan by industry and month.", ja: "JETRO の見本市・展示会カレンダー。業種別・月別に国内の商談会を探せる。", zh: "JETRO 展会日历，可按行业和月份查找日本国内洽谈会。" }, title: { en: "JETRO trade show calendar", ja: "JETRO 見本市・展示会情報", zh: "JETRO 展会信息" }, url: "https://www.jetro.go.jp/j-messe/" },
    { snippet: { en: "Public procurement portal: tender notices and the qualification registration suppliers need before bidding.", ja: "調達ポータル。入札公告と、応札前に必要な全省庁統一資格の登録手順。", zh: "采购门户：招标公告以及投标前所需的全省厅统一资格登记流程。" }, title: { en: "Government procurement portal", ja: "調達ポータル", zh: "政府采购门户" }, url: "https://www.p-portal.go.jp/" },
    { snippet: { en: "Industry market size and adoption statistics from the Ministry's basic survey of business structure.", ja: "経済産業省 企業活動基本調査。業種別の市場規模と導入率の推移。", zh: "经济产业省企业活动基本调查：按行业的市场规模与导入率变化。" }, title: { en: "Basic survey of business structure", ja: "企業活動基本調査", zh: "企业活动基本调查" }, url: "https://www.meti.go.jp/statistics/" },
  ],
  hiring: [
    { snippet: { en: "Hello Work: the public employment service's job posting rules and the employer registration steps.", ja: "ハローワークの求人申込み手順と求人票の記載ルール。", zh: "Hello Work 招聘申请流程与招聘票填写规则。" }, title: { en: "Hello Work for employers", ja: "ハローワーク 事業主の方へ", zh: "Hello Work 雇主指南" }, url: "https://www.hellowork.mhlw.go.jp/" },
    { snippet: { en: "Immigration Services Agency: status-of-residence categories and the sponsorship documents for hiring foreign nationals.", ja: "出入国在留管理庁 在留資格一覧と、外国人を雇用する際の申請書類。", zh: "出入国在留管理厅：在留资格一览及雇用外国人时的申请材料。" }, title: { en: "Status of residence for employment", ja: "就労できる在留資格", zh: "可就业的在留资格" }, url: "https://www.moj.go.jp/isa/" },
    { snippet: { en: "MHLW's monthly job-openings-to-applicants ratio and average wages by occupation and region.", ja: "厚生労働省 一般職業紹介状況。職種別・地域別の有効求人倍率と平均賃金。", zh: "厚生劳动省一般职业介绍状况：按职种和地区的有效求人倍率与平均工资。" }, title: { en: "MHLW job openings statistics", ja: "厚生労働省 一般職業紹介状況", zh: "厚生劳动省职业介绍统计" }, url: "https://www.mhlw.go.jp/toukei/" },
  ],
  partnership: [
    { snippet: { en: "SMRJ's open-innovation matching platform connecting startups with large companies seeking partners.", ja: "中小機構のオープンイノベーション・マッチング。提携先を探す大企業とスタートアップをつなぐ。", zh: "中小机构的开放式创新对接平台，连接寻找合作方的大企业与创业公司。" }, title: { en: "SMRJ open innovation matching", ja: "中小機構 オープンイノベーション", zh: "中小机构开放式创新对接" }, url: "https://www.smrj.go.jp/" },
    { snippet: { en: "JPO's model clauses for joint R&D agreements: ownership of results, licensing and confidentiality.", ja: "特許庁 共同研究開発契約のモデル条項。成果の帰属・ライセンス・秘密保持。", zh: "特许厅共同研发合同范本条款：成果归属、许可与保密。" }, title: { en: "JPO model joint R&D clauses", ja: "特許庁 モデル契約書", zh: "特许厅合同范本" }, url: "https://www.jpo.go.jp/" },
  ],
  career: [
    { snippet: { en: "Japan's official career portal with occupation profiles, required qualifications and typical pay bands.", ja: "job tag（職業情報提供サイト）。職業ごとの仕事内容・必要資格・賃金帯。", zh: "job tag 职业信息网站：各职业的工作内容、所需资格与薪资区间。" }, title: { en: "job tag occupation profiles", ja: "job tag 職業情報", zh: "job tag 职业信息" }, url: "https://shigoto.mhlw.go.jp/" },
    { snippet: { en: "Immigration Services Agency: work visa categories and the points-based system for highly skilled professionals.", ja: "出入国在留管理庁 就労資格と高度人材ポイント制の要件。", zh: "出入国在留管理厅：就业资格与高度人才积分制的要求。" }, title: { en: "Work visa and points system", ja: "就労資格・高度人材ポイント制", zh: "就业资格与积分制" }, url: "https://www.moj.go.jp/isa/applications/" },
    { snippet: { en: "National Tax Agency's annual private-sector salary survey: average pay by industry, age and company size.", ja: "国税庁 民間給与実態統計調査。業種・年齢・企業規模別の平均給与。", zh: "国税厅民间工资实态统计调查：按行业、年龄、企业规模的平均工资。" }, title: { en: "Private-sector salary survey", ja: "民間給与実態統計調査", zh: "民间工资实态统计" }, url: "https://www.nta.go.jp/publication/statistics/" },
  ],
};

export function mockPlanSearchSources(input: PlanSearchInput, context: PlanSearchContext): PlanSearchSource[] {
  const queries = planSearchQueries(input);
  const fallback = planSearchQueries({ ...input, goalText: input.goalText.trim() || "goal" });
  return ENTRIES[input.goalKind].map((entry, index) => ({
    fetchedAt: context.now.toISOString(),
    kind: "web",
    query: (queries[index] ?? fallback[index] ?? fallback[0])?.query ?? entry.title.ja,
    snippet: planCopy(entry.snippet, input.language),
    title: planCopy(entry.title, input.language),
    url: entry.url,
  }));
}

export function createMockPlanSearch(): PlanSearch {
  return {
    id: "mock",
    async search(input, context): Promise<PlanSearchResult> {
      const sources = mockPlanSearchSources(input, context);
      return { failed: 0, queries: sources.length, sources, status: "ok" };
    },
  };
}
