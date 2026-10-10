/**
 * R22 计划 v2.2 模板的三语文字（DESIGN §3.5；id 与数字在 `plan-templates.ts`）。
 * 日文为主；题干与 b10 规范板一致，设计稿没有的选项、能力名、短名由 R22 撰写（见 R22 REPORT）。
 */
import type { PlanGoalKind } from "../contract/plan-v2";

export type PlanCopyLanguage = "ja" | "zh" | "en";
export type PlanTriText = Readonly<Record<PlanCopyLanguage, string>>;

export const PLAN_GOAL_KIND_COPY: Readonly<Record<PlanGoalKind, PlanTriText>> = {
  career: { en: "Career", ja: "キャリア", zh: "职业发展" },
  fundraising: { en: "Fundraising", ja: "資金調達", zh: "融资" },
  hiring: { en: "Hiring", ja: "採用", zh: "招聘" },
  launch: { en: "Launch & revenue", ja: "上市・収益化", zh: "上市与盈利" },
  partnership: { en: "Partnerships", ja: "事業提携", zh: "业务合作" },
  sales: { en: "New customers", ja: "新規開拓", zh: "开拓客户" },
};

export const PLAN_CAPABILITY_COPY: Readonly<Record<string, PlanTriText>> = {
  ai_data: { en: "AI & data", ja: "AI・データ", zh: "AI 与数据" },
  brand: { en: "Brand", ja: "ブランド", zh: "品牌" },
  business_dev: { en: "Business development", ja: "事業開発", zh: "业务拓展" },
  certification: { en: "Certifications", ja: "資格", zh: "资格证书" },
  compensation: { en: "Pay & terms", ja: "処遇設計", zh: "薪酬设计" },
  customer_success: { en: "Customer success", ja: "カスタマーサクセス", zh: "客户成功" },
  design: { en: "Design", ja: "デザイン", zh: "设计" },
  domain_skill: { en: "Core skills", ja: "専門スキル", zh: "专业技能" },
  employer_brand: { en: "Employer brand", ja: "採用広報", zh: "雇主品牌" },
  finance: { en: "Finance", ja: "財務", zh: "财务" },
  financial_model: { en: "Financial model", ja: "事業計画・財務モデル", zh: "财务模型" },
  hr_admin: { en: "HR admin", ja: "労務", zh: "人事行政" },
  industry_network: { en: "Industry network", ja: "業界のつながり", zh: "行业人脉" },
  interviewing: { en: "Interviews", ja: "面接", zh: "面试" },
  investor_relations: { en: "Investor relations", ja: "投資家対応", zh: "投资人关系" },
  job_design: { en: "Role design", ja: "職務設計", zh: "岗位设计" },
  language: { en: "Languages", ja: "語学", zh: "外语" },
  legal_admin: { en: "Legal & admin", ja: "法務・手続き", zh: "法务与手续" },
  legal_ip: { en: "Legal & IP", ja: "法務・知財", zh: "法务与知识产权" },
  market_research: { en: "Market research", ja: "市場調査", zh: "市场调研" },
  marketing: { en: "Marketing", ja: "マーケ", zh: "市场营销" },
  metrics: { en: "Metrics", ja: "KPI 管理", zh: "指标管理" },
  negotiation: { en: "Negotiation", ja: "交渉", zh: "谈判" },
  network: { en: "Network", ja: "人のつながり", zh: "人脉" },
  onboarding: { en: "Onboarding", ja: "受け入れ", zh: "入职引导" },
  ops_infra: { en: "Ops & infra", ja: "運用・インフラ", zh: "运维与基础设施" },
  personal_brand: { en: "Personal brand", ja: "発信", zh: "个人品牌" },
  pitch: { en: "Pitch", ja: "ピッチ", zh: "路演" },
  portfolio: { en: "Portfolio", ja: "実績・ポートフォリオ", zh: "作品集" },
  pricing: { en: "Pricing", ja: "価格設計", zh: "定价" },
  product: { en: "Product", ja: "プロダクト開発", zh: "产品开发" },
  product_knowledge: { en: "Product knowledge", ja: "商品知識", zh: "产品知识" },
  proposal: { en: "Proposals", ja: "提案", zh: "方案提案" },
  prospecting: { en: "Prospecting", ja: "リスト作り", zh: "线索开发" },
  sales: { en: "Sales", ja: "営業", zh: "销售" },
  sourcing: { en: "Sourcing", ja: "候補者探し", zh: "寻找候选人" },
  storytelling: { en: "Storytelling", ja: "ストーリー", zh: "叙事" },
  technical_integration: { en: "Integration", ja: "技術連携", zh: "技术对接" },
};

export interface PlanQuestionCopy {
  /** 题目的主题（「確定した前提」的行名）。 */
  topic: PlanTriText;
  prompt: PlanTriText;
  options: Readonly<Record<string, PlanTriText>>;
}

const SIDE_TIME = {
  fulltime: { en: "Full time", ja: "フルタイム", zh: "全职投入" },
  side_10to20: { en: "Alongside a job, 10–20 h/week", ja: "並行・10〜20時間", zh: "兼职 · 每周 10–20 小时" },
  side_under10: { en: "Alongside a job, under 10 h/week", ja: "並行・10時間未満", zh: "兼职 · 每周不到 10 小时" },
} as const;

export const PLAN_QUESTION_COPY: Readonly<Record<string, PlanQuestionCopy>> = {
  // 🚀 上市・収益化
  R1: { options: { beta: { en: "Built, in beta", ja: "完成・β 運用中", zh: "已完成 · β 运营中" }, building: { en: "Building", ja: "開発中", zh: "开发中" }, idea: { en: "Idea", ja: "アイデア", zh: "构想" }, paying: { en: "Paying users", ja: "有料あり", zh: "已有付费" } }, prompt: { en: "Where are you now?", ja: "いま、どこにいますか？", zh: "现在进展到哪一步？" }, topic: { en: "Current stage", ja: "現在地", zh: "当前阶段" } },
  R2: { options: { both: { en: "Both", ja: "両方", zh: "两者都有" }, businesses: { en: "Businesses", ja: "法人", zh: "企业" }, individuals: { en: "Individuals", ja: "個人", zh: "个人" }, undecided: { en: "Not decided", ja: "まだ決めていない", zh: "还没决定" } }, prompt: { en: "Who should pay you first?", ja: "最初にお金を払ってほしいのは誰ですか？", zh: "最先向谁收费？" }, topic: { en: "Who pays", ja: "払い手", zh: "付费方" } },
  R3: { options: { decided: { en: "Decided", ja: "決まっている", zh: "已经定了" }, draft: { en: "A rough idea", ja: "案がある", zh: "有初步想法" }, none: { en: "Not yet", ja: "まだない", zh: "还没有" } }, prompt: { en: "How do you want people to remember it, in one line?", ja: "どんな存在として覚えてもらいたいですか？", zh: "希望别人用一句话怎么记住它？" }, topic: { en: "One-line pitch", ja: "ブランドの一言", zh: "一句话定位" } },
  R4: { options: { free_first: { en: "Free tier first", ja: "無料枠から", zh: "先免费" }, per_use: { en: "Pay per use", ja: "従量課金", zh: "按量收费" }, subscription: { en: "Subscription", ja: "月額", zh: "订阅" }, undecided: { en: "Not decided", ja: "まだ決めていない", zh: "还没决定" } }, prompt: { en: "What is your pricing idea?", ja: "価格はどう考えていますか？", zh: "定价怎么考虑？" }, topic: { en: "Pricing idea", ja: "価格の仮説", zh: "定价设想" } },
  R5: { options: { direct: { en: "Direct competitors", ja: "競合がいる", zh: "有直接竞品" }, none_known: { en: "None I know of", ja: "知らない", zh: "不清楚" }, substitute: { en: "People use other ways", ja: "代わりの手段がある", zh: "有替代做法" } }, prompt: { en: "What do people use instead today?", ja: "いま、代わりに何が使われていますか？", zh: "现在大家用什么替代？" }, topic: { en: "Alternatives", ja: "競合・代わりの手段", zh: "竞品与替代" } },
  R6: { options: SIDE_TIME, prompt: { en: "How much time can you spend each week?", ja: "1週間に使える時間は？", zh: "每周能投入多少时间？" }, topic: { en: "Time", ja: "使える時間", zh: "可投入时间" } },
  R7: { options: { learn: { en: "Learn it myself", ja: "自分で学ぶ", zh: "自己学" }, outsource: { en: "Outsource", ja: "外部に頼む", zh: "外包" }, recruit: { en: "Bring someone in", ja: "仲間に入れる", zh: "找伙伴加入" } }, prompt: { en: "How do you want to fill the missing skills?", ja: "足りない力を、どう埋めたいですか？", zh: "缺的能力打算怎么补？" }, topic: { en: "Missing skills", ja: "足りない力", zh: "能力缺口" } },
  R8: { options: { ads: { en: "Ads", ja: "広告", zh: "广告" }, interviews: { en: "User interviews", ja: "ユーザーインタビュー", zh: "用户访谈" }, nothing_yet: { en: "Nothing yet", ja: "まだ何も", zh: "还没有" }, sales_calls: { en: "Sales calls", ja: "営業", zh: "销售拜访" } }, prompt: { en: "What have you tried so far?", ja: "これまでに試したことは？", zh: "已经试过什么？" }, topic: { en: "Tried so far", ja: "試したこと", zh: "已尝试" } },
  // 💰 資金調達
  F1: { options: { series_a: { en: "Series A", ja: "シリーズ A", zh: "A 轮" }, series_b_plus: { en: "Series B or later", ja: "シリーズ B 以降", zh: "B 轮及以后" }, seed: { en: "Seed", ja: "シード", zh: "种子轮" }, undecided: { en: "Not decided", ja: "まだ決めていない", zh: "还没决定" } }, prompt: { en: "Which round, and how much?", ja: "ラウンドと金額は？", zh: "哪一轮、融多少？" }, topic: { en: "Round and amount", ja: "ラウンドと金額", zh: "轮次与金额" } },
  F2: { options: { early_revenue: { en: "Early revenue", ja: "売上が立ち始めた", zh: "开始有收入" }, growing: { en: "Growing", ja: "伸びている", zh: "在增长" }, pre_revenue: { en: "No revenue yet", ja: "売上前", zh: "还没有收入" }, profitable: { en: "Profitable", ja: "黒字", zh: "已盈利" } }, prompt: { en: "What are your latest numbers?", ja: "直近の数字は？", zh: "最近的数据怎样？" }, topic: { en: "Latest numbers", ja: "直近の数字", zh: "近期数据" } },
  F3: { options: { has_existing: { en: "Existing investors only", ja: "既存株主がいる", zh: "已有股东" }, has_lead: { en: "A lead in mind", ja: "リード候補がいる", zh: "有领投候选" }, none: { en: "None yet", ja: "まだいない", zh: "还没有" } }, prompt: { en: "Existing investors or a lead in mind?", ja: "既存株主やリード候補はいますか？", zh: "有现有股东或领投候选吗？" }, topic: { en: "Investors", ja: "既存株主・リード候補", zh: "股东与领投" } },
  F4: { options: { first_time: { en: "First time", ja: "はじめて", zh: "第一次" }, raised_before: { en: "Raised before", ja: "経験あり", zh: "融过" } }, prompt: { en: "Have you raised before?", ja: "調達の経験はありますか？", zh: "以前融过资吗？" }, topic: { en: "Experience", ja: "調達の経験", zh: "融资经验" } },
  F5: { options: { undecided: { en: "Not decided", ja: "まだ決めていない", zh: "还没决定" }, within_12m: { en: "Within 12 months", ja: "1年以内", zh: "一年内" }, within_3m: { en: "Within 3 months", ja: "3か月以内", zh: "三个月内" }, within_6m: { en: "Within 6 months", ja: "半年以内", zh: "半年内" } }, prompt: { en: "What is the money for, and by when?", ja: "使い道と締切は？", zh: "资金用途和期限？" }, topic: { en: "Use and deadline", ja: "使い道と締切", zh: "用途与期限" } },
  F6: { options: { maybe: { en: "Maybe", ja: "場合による", zh: "看情况" }, no: { en: "No", ja: "入れない", zh: "不要" }, yes: { en: "Yes", ja: "入れたい", zh: "想要" } }, prompt: { en: "Do you want a corporate investor (CVC)?", ja: "事業会社（CVC）を入れたいですか？", zh: "想引入企业投资（CVC）吗？" }, topic: { en: "Corporate investor", ja: "事業会社（CVC）", zh: "企业投资方" } },
  F7: { options: SIDE_TIME, prompt: { en: "How much time can you spend each week?", ja: "1週間に使える時間は？", zh: "每周能投入多少时间？" }, topic: { en: "Time", ja: "使える時間", zh: "可投入时间" } },
  // 🤝 新規開拓
  S1: { options: { over_1m: { en: "Over ¥1M", ja: "100万円以上", zh: "100 万日元以上" }, under_100k: { en: "Under ¥100k", ja: "10万円未満", zh: "10 万日元以下" }, "100k_1m": { en: "¥100k–1M", ja: "10万〜100万円", zh: "10–100 万日元" } }, prompt: { en: "What do you sell, and at what price?", ja: "売るものと単価は？", zh: "卖什么、单价多少？" }, topic: { en: "Offer and price", ja: "売るもの・単価", zh: "产品与单价" } },
  S2: { options: { enterprise: { en: "Large companies", ja: "大企業", zh: "大企业" }, mid: { en: "Mid-sized", ja: "中堅企業", zh: "中型企业" }, public: { en: "Public sector", ja: "官公庁・自治体", zh: "政府与公共机构" }, smb: { en: "Small businesses", ja: "中小企業", zh: "中小企业" } }, prompt: { en: "Which industry and size are you aiming at?", ja: "狙う業界・規模は？", zh: "目标行业和规模？" }, topic: { en: "Target", ja: "狙う業界・規模", zh: "目标客户" } },
  S3: { options: { "1to5": { en: "1–5", ja: "1〜5件", zh: "1–5 个" }, none: { en: "None", ja: "なし", zh: "没有" }, over5: { en: "More than 5", ja: "6件以上", zh: "6 个以上" } }, prompt: { en: "How many deals are open now?", ja: "いまの商談数は？", zh: "现在有几个商机？" }, topic: { en: "Open deals", ja: "今の商談数", zh: "在谈商机" } },
  S4: { options: { no: { en: "No", ja: "ない", zh: "没有" }, sometimes: { en: "Sometimes", ja: "ときどき", zh: "偶尔" }, yes: { en: "Yes", ja: "ある", zh: "有" } }, prompt: { en: "Have you reached the decision makers?", ja: "決裁者に届いたことはありますか？", zh: "接触过决策人吗？" }, topic: { en: "Decision makers", ja: "決裁者との接点", zh: "决策人接触" } },
  S5: { options: { high: { en: "A lot", ja: "大きい", zh: "很大" }, none: { en: "None", ja: "ない", zh: "没有" }, some: { en: "Some", ja: "少しある", zh: "有一些" } }, prompt: { en: "Can current customers introduce you?", ja: "既存顧客からの紹介は見込めますか？", zh: "老客户能帮忙介绍吗？" }, topic: { en: "Referrals", ja: "紹介の余地", zh: "转介绍空间" } },
  S6: { options: { alone: { en: "Just me", ja: "自分だけ", zh: "只有我" }, small_team: { en: "2–3 people", ja: "2〜3人", zh: "2–3 人" }, team: { en: "A sales team", ja: "営業チーム", zh: "销售团队" } }, prompt: { en: "Who does the selling?", ja: "営業の体制は？", zh: "销售由谁来做？" }, topic: { en: "Sales team", ja: "営業の体制", zh: "销售配置" } },
  // 🧑‍💼 採用
  H1: { options: { four_plus: { en: "4 or more", ja: "4人以上", zh: "4 人以上" }, one: { en: "1", ja: "1人", zh: "1 人" }, two_to_three: { en: "2–3", ja: "2〜3人", zh: "2–3 人" } }, prompt: { en: "Which role, and how many people?", ja: "職種と人数は？", zh: "什么岗位、招几个人？" }, topic: { en: "Role and headcount", ja: "職種と人数", zh: "岗位与人数" } },
  H2: { options: { contract: { en: "Contract", ja: "業務委託", zh: "外包合作" }, flexible: { en: "Flexible", ja: "柔軟に", zh: "灵活" }, fulltime: { en: "Full-time", ja: "正社員", zh: "全职" }, side_job: { en: "Side job", ja: "副業", zh: "副业" } }, prompt: { en: "What terms are you offering?", ja: "条件（年収・働き方）は？", zh: "给出什么条件（薪资、工作方式）？" }, topic: { en: "Terms", ja: "条件", zh: "条件" } },
  H3: { options: { agency: { en: "Agencies", ja: "エージェント", zh: "猎头中介" }, job_board: { en: "Job boards", ja: "求人媒体", zh: "招聘网站" }, none_yet: { en: "Nothing yet", ja: "まだ何も", zh: "还没有" }, referral: { en: "Referrals", ja: "紹介", zh: "内推" } }, prompt: { en: "How have you hired so far?", ja: "これまでの採用経路は？", zh: "以前通过什么渠道招人？" }, topic: { en: "Channels so far", ja: "採用経路", zh: "招聘渠道" } },
  H4: { options: { compensation: { en: "Pay", ja: "報酬", zh: "薪酬" }, growth: { en: "Growth", ja: "成長機会", zh: "成长机会" }, mission: { en: "Mission", ja: "ミッション", zh: "使命" }, work_style: { en: "Way of working", ja: "働き方", zh: "工作方式" } }, prompt: { en: "What can you offer as a draw?", ja: "魅力として言えることは？", zh: "能拿出来的吸引力是什么？" }, topic: { en: "Draws", ja: "魅力", zh: "吸引力" } },
  H5: { options: { undecided: { en: "Not decided", ja: "まだ決めていない", zh: "还没决定" }, within_1m: { en: "Within a month", ja: "1か月以内", zh: "一个月内" }, within_3m: { en: "Within 3 months", ja: "3か月以内", zh: "三个月内" }, within_6m: { en: "Within 6 months", ja: "半年以内", zh: "半年内" } }, prompt: { en: "By when do you need them?", ja: "採用の締切は？", zh: "什么时候要到岗？" }, topic: { en: "Deadline", ja: "締切", zh: "期限" } },
  H6: { options: { alone: { en: "Just me", ja: "自分だけ", zh: "只有我" }, outsourced: { en: "Outsourced", ja: "外部に委託", zh: "委托外部" }, with_team: { en: "With the team", ja: "チームで", zh: "团队一起" } }, prompt: { en: "Who runs the interviews?", ja: "面接の体制は？", zh: "面试由谁来做？" }, topic: { en: "Interviews", ja: "面接の体制", zh: "面试安排" } },
  // 🔗 事業提携
  P1: { options: { brand: { en: "Brand", ja: "ブランド", zh: "品牌" }, funding: { en: "Funding", ja: "資金", zh: "资金" }, sales_channel: { en: "Sales channel", ja: "販路", zh: "销售渠道" }, technology: { en: "Technology", ja: "技術", zh: "技术" } }, prompt: { en: "What do you want from the partnership?", ja: "提携で得たいものは？", zh: "希望从合作中得到什么？" }, topic: { en: "What you want", ja: "得たいもの", zh: "合作目的" } },
  P2: { options: { enterprise: { en: "Large companies", ja: "大企業", zh: "大企业" }, mid: { en: "Mid-sized", ja: "中堅企業", zh: "中型企业" }, public: { en: "Public sector", ja: "官公庁・自治体", zh: "政府与公共机构" }, startup: { en: "Startups", ja: "スタートアップ", zh: "初创公司" } }, prompt: { en: "What kind of partner, and how big?", ja: "相手の業種・規模は？", zh: "合作方的行业和规模？" }, topic: { en: "Partner", ja: "相手の業種・規模", zh: "合作对象" } },
  P3: { options: { customers: { en: "Customers", ja: "顧客", zh: "客户" }, data: { en: "Data", ja: "データ", zh: "数据" }, product: { en: "Product", ja: "プロダクト", zh: "产品" }, technology: { en: "Technology", ja: "技術", zh: "技术" } }, prompt: { en: "What can you bring?", ja: "自社が出せるものは？", zh: "我方能拿出什么？" }, topic: { en: "What you bring", ja: "出せるもの", zh: "我方资源" } },
  P4: { options: { committee: { en: "Committee", ja: "稟議・会議体", zh: "层层审批" }, simple: { en: "One person decides", ja: "担当者が決める", zh: "一人拍板" }, unknown: { en: "Not sure", ja: "わからない", zh: "不清楚" } }, prompt: { en: "How does the partner decide?", ja: "決裁の流れは？", zh: "对方怎么决策？" }, topic: { en: "Decision flow", ja: "決裁の流れ", zh: "决策流程" } },
  P5: { options: { met_before: { en: "Met before", ja: "会ったことがある", zh: "见过面" }, none: { en: "None", ja: "まだない", zh: "还没有" }, via_intro: { en: "Through someone", ja: "紹介経由で", zh: "通过介绍" } }, prompt: { en: "Any contact with them so far?", ja: "これまでの接点は？", zh: "之前有过接触吗？" }, topic: { en: "Contact so far", ja: "これまでの接点", zh: "已有接触" } },
  P6: { options: { capital: { en: "Capital tie-up", ja: "資本提携", zh: "资本合作" }, joint_development: { en: "Joint development", ja: "共同開発", zh: "联合开发" }, referral: { en: "Referral", ja: "送客", zh: "互相导流" }, reseller: { en: "Reseller", ja: "販売代理", zh: "代理销售" } }, prompt: { en: "What kind of agreement do you want?", ja: "契約形態の希望は？", zh: "希望什么合作形式？" }, topic: { en: "Agreement", ja: "契約形態", zh: "合作形式" } },
  // 🧭 キャリア
  K1: { options: { "3to10y": { en: "3–10 years", ja: "3〜10年", zh: "3–10 年" }, over10y: { en: "Over 10 years", ja: "10年以上", zh: "10 年以上" }, under3y: { en: "Under 3 years", ja: "3年未満", zh: "不到 3 年" } }, prompt: { en: "What do you do now, and for how long?", ja: "いまの仕事と年数は？", zh: "现在做什么、做了几年？" }, topic: { en: "Current work", ja: "いまの仕事", zh: "当前工作" } },
  K2: { options: { independent: { en: "Go independent", ja: "独立する", zh: "独立创业" }, new_field: { en: "New field", ja: "別の分野へ", zh: "换领域" }, same_field: { en: "Same field", ja: "同じ分野で", zh: "同领域" } }, prompt: { en: "Which role or industry are you aiming for?", ja: "目指す職・業界は？", zh: "想去什么岗位或行业？" }, topic: { en: "Aim", ja: "目指す職・業界", zh: "目标方向" } },
  K3: { options: { someday: { en: "Someday", ja: "いずれ", zh: "以后再说" }, within_1y: { en: "Within a year", ja: "1年以内", zh: "一年内" }, within_3m: { en: "Within 3 months", ja: "3か月以内", zh: "三个月内" } }, prompt: { en: "Roughly when?", ja: "時期の目安は？", zh: "大概什么时候？" }, topic: { en: "Timing", ja: "時期の目安", zh: "时间" } },
  K4: { options: { network: { en: "Network", ja: "人脈", zh: "人脉" }, not_sure: { en: "Not sure", ja: "わからない", zh: "说不清" }, results: { en: "Results", ja: "実績", zh: "业绩" }, skills: { en: "Skills", ja: "スキル", zh: "技能" } }, prompt: { en: "What can you name as your strengths?", ja: "強みとして言えることは？", zh: "能拿出手的优势是什么？" }, topic: { en: "Strengths", ja: "強み", zh: "优势" } },
  K5: { options: { income: { en: "Income", ja: "年収", zh: "收入" }, location: { en: "Location", ja: "勤務地", zh: "地点" }, role: { en: "Role", ja: "役割", zh: "职责" }, work_style: { en: "Way of working", ja: "働き方", zh: "工作方式" } }, prompt: { en: "What must not change?", ja: "譲れない条件は？", zh: "哪些条件不能让？" }, topic: { en: "Must-haves", ja: "譲れない条件", zh: "底线条件" } },
  K6: { options: { active: { en: "Active", ja: "活発に", zh: "很活跃" }, none: { en: "None", ja: "していない", zh: "没有" }, some: { en: "A little", ja: "少し", zh: "偶尔" } }, prompt: { en: "Any activities outside work?", ja: "社外の活動は？", zh: "有工作以外的活动吗？" }, topic: { en: "Outside activities", ja: "社外の活動", zh: "工作外活动" } },
};

/** 固定短名（`<slot>` 通用、`<slot>@<industry>` 行业覆盖）。 */
export const PLAN_SHORT_NAME_COPY: Readonly<Record<string, PlanTriText>> = {
  alliance_veteran: { en: "Partnership veteran", ja: "提携の経験者", zh: "有合作经验的人" },
  angel: { en: "Angel investor", ja: "エンジェル投資家", zh: "天使投资人" },
  brand_pr: { en: "Brand builder", ja: "ブランドづくりの経験者", zh: "做过品牌的人" },
  candidate: { en: "Candidate", ja: "候補者本人", zh: "候选人" },
  "candidate@technology_internet": { en: "Engineer candidate", ja: "エンジニア候補", zh: "工程师候选人" },
  cfo: { en: "Former CFO", ja: "CFO 経験者", zh: "前 CFO" },
  community_host: { en: "Community host", ja: "コミュニティ運営者", zh: "社群运营者" },
  cvc: { en: "Corporate VC", ja: "CVC 担当者", zh: "企业投资人" },
  decision_maker: { en: "Decision maker", ja: "決裁者", zh: "决策人" },
  "decision_maker@healthcare_life_sciences": { en: "Hospital decision maker", ja: "病院・医療機関の決裁者", zh: "医疗机构决策人" },
  "decision_maker@manufacturing_supply_chain": { en: "Plant decision maker", ja: "工場の決裁者", zh: "工厂决策人" },
  field_lead: { en: "Field lead", ja: "現場責任者", zh: "一线负责人" },
  first_payer: { en: "First payer", ja: "最初に払う人", zh: "第一个付费的人" },
  "first_payer@community_nonprofit": { en: "Meetup organizer", ja: "交流会の主催者", zh: "交流会主办方" },
  "first_payer@media_creative": { en: "Media buyer", ja: "メディアの発注者", zh: "媒体采购方" },
  "first_payer@retail_consumer": { en: "Store buyer", ja: "店舗のバイヤー", zh: "门店采购" },
  funded_founder: { en: "Founder who raised", ja: "調達経験のある起業家", zh: "融过资的创业者" },
  heavy_user: { en: "Heavy user", ja: "ヘビーユーザー", zh: "重度用户" },
  hiring_side: { en: "Hiring manager", ja: "採用する側", zh: "招聘方" },
  industry_body: { en: "Industry association", ja: "業界団体", zh: "行业协会" },
  introducer: { en: "Introducer", ja: "紹介者・代理店", zh: "介绍人与代理" },
  lawyer: { en: "Lawyer (investment)", ja: "弁護士（投資契約）", zh: "律师（投资协议）" },
  legal_ip: { en: "Legal & IP", ja: "法務・知財", zh: "法务与知识产权" },
  mentor: { en: "Mentor", ja: "メンター", zh: "导师" },
  missing_expert: { en: "Missing expert", ja: "足りない専門", zh: "缺的专业" },
  partner_field: { en: "Partner's team", ja: "提携先の現場", zh: "合作方一线" },
  partner_lead: { en: "Partner's business lead", ja: "提携先の事業責任者", zh: "合作方业务负责人" },
  peer: { en: "Like-minded peer", ja: "同じ志向の仲間", zh: "志同道合的人" },
  practitioner: { en: "Current practitioner", ja: "目指す職の現役", zh: "目标岗位的在职者" },
  prior_product: { en: "Prior-product veteran", ja: "先行プロダクト経験", zh: "做过同类产品的人" },
  "prior_product@technology_internet": { en: "SaaS veteran", ja: "SaaS の経験者", zh: "做过 SaaS 的人" },
  recruiter: { en: "Former recruiter", ja: "採用担当の経験者", zh: "做过招聘的人" },
  referrer: { en: "Candidate referrer", ja: "候補者を紹介できる人", zh: "能推荐候选人的人" },
  same_path_founder: { en: "Founder who's been there", ja: "同じ道を通った創業者", zh: "走过同样路的创业者" },
  senior_peer: { en: "Senior in the role", ja: "同職種の先輩", zh: "同岗位前辈" },
  senior_seller: { en: "Senior salesperson", ja: "同業の先輩営業", zh: "同行销售前辈" },
  switcher: { en: "Someone who switched", ja: "転身した先輩", zh: "转行成功的前辈" },
  vc_partner: { en: "VC partner", ja: "VC パートナー", zh: "VC 合伙人" },
};

/** イベント枠的名称。 */
export const PLAN_EVENT_COPY: PlanTriText = { en: "Events", ja: "イベント", zh: "活动" };

export function planCopy(text: PlanTriText, language: PlanCopyLanguage): string {
  return text[language];
}
