/**
 * 申込フォームの質問集（主催者が選んで使う定型の質問）。Web の申込設定・新規作成と、サーバーの「質問案」が同じ表を使う。
 *
 * - `id` は回答の保存キー（orbit_records `eventHostAnswers` は question.id で保存）なので、一度出したら変えない・使い回さない。
 *   削除した質問の id も再利用しない。`host:` + id が参加登録の field（≤40 字）になるので id は 35 字以内。
 * - 文面は ja / zh / en。フォームに入れるときは主催者の画面の言語で入れる（参加者には主催者が書いた文面がそのまま出る）。
 * - 選択肢は 12 個まで（`hostQuestionInput` と参加登録の質問スキーマ、App 側の同じスキーマが 12 まで）。
 *   複数選択の回答は「 · 」(U+00B7) でつなぐので、選択肢に「·」は使わない（日本語の「・」は可）。
 */
import type { HostQuestionKind, HostSetupQuestion } from "../contract/host-console";
import type { OrbitLanguage } from "../contract/language";

export const HOST_QUESTION_MAX = 5;
export const HOST_QUESTION_OPTION_MAX = 12;

type Tri = readonly [ja: string, zh: string, en: string];

export const HOST_QUESTION_CATEGORY_IDS = ["role", "industry", "company", "topic", "meet", "offer", "seek", "experience", "motivation", "language", "style", "followup", "logistics"] as const;
export type HostQuestionCategory = (typeof HOST_QUESTION_CATEGORY_IDS)[number];

const CATEGORY_LABEL: Record<HostQuestionCategory, Tri> = {
  role: ["立場・役職", "身份与职位", "Role"],
  industry: ["業界", "行业", "Industry"],
  company: ["会社のフェーズ・規模", "公司阶段与规模", "Company stage and size"],
  topic: ["話したいテーマ", "想聊的话题", "Topics"],
  meet: ["会いたい人", "想认识的人", "Who to meet"],
  offer: ["提供できること", "能提供什么", "What you offer"],
  seek: ["探していること", "正在寻找", "What you're looking for"],
  experience: ["経験", "经验", "Experience"],
  motivation: ["参加のきっかけ", "参加动机与渠道", "Why you came"],
  language: ["言語", "语言", "Language"],
  style: ["交流のスタイル", "交流风格", "Networking style"],
  followup: ["会後の連絡", "会后联系", "After the event"],
  logistics: ["当日について", "当天安排", "On the day"],
};

export interface HostLibraryEntry {
  readonly id: string;
  readonly category: HostQuestionCategory;
  readonly kind: HostQuestionKind;
  readonly required: boolean;
  readonly prompt: Tri;
  readonly options: readonly Tri[];
}

const OTHER: Tri = ["その他", "其他", "Other"];
const NA: Tri = ["該当しない", "不适用", "Not applicable"];
const NOTHING: Tri = ["特にない", "暂时没有", "Nothing in particular"];

const e = (id: string, category: HostQuestionCategory, kind: HostQuestionKind, required: boolean, prompt: Tri, options: readonly Tri[] = []): HostLibraryEntry => ({ category, id, kind, options, prompt, required });

/** 質問集（カテゴリ順。カテゴリ内は使われやすい順）。 */
export const HOST_QUESTION_LIBRARY_ENTRIES: readonly HostLibraryEntry[] = [
  // ── 立場・役職
  e("lib-role", "role", "single", true, ["あなたの立場に近いものを選んでください", "请选择最接近你身份的一项", "Which best describes you?"], [
    ["起業家・経営者", "创业者、经营者", "Founder or executive"],
    ["会社員（事業会社）", "企业员工", "Employee at a company"],
    ["投資家（VC・CVC・エンジェル）", "投资人（VC、CVC、天使）", "Investor (VC, CVC, angel)"],
    ["フリーランス・個人事業主", "自由职业者、个体经营者", "Freelancer or sole proprietor"],
    ["士業・コンサルタント", "专业服务、顾问", "Advisor or consultant"],
    ["支援機関・自治体", "支援机构、政府部门", "Support organization or government"],
    ["研究者・教員", "研究人员、教师", "Researcher or educator"],
    ["学生", "学生", "Student"],
    ["求職中", "正在求职", "Between jobs"],
    OTHER,
  ]),
  e("lib-position", "role", "single", false, ["役職に近いものを選んでください", "你的职位层级是？", "What's your level?"], [
    ["経営者・役員", "创始人、高管", "Founder or C-level"],
    ["事業部長・部長", "部门负责人", "Head of department"],
    ["マネージャー", "经理", "Manager"],
    ["リーダー・主任", "组长、主管", "Team lead"],
    ["メンバー・担当者", "一般员工", "Individual contributor"],
    ["専門職", "专业岗位", "Specialist"],
    ["個人で活動", "独立工作", "Independent"],
    ["学生", "学生", "Student"],
    OTHER,
  ]),
  e("lib-function", "role", "single", false, ["主な職種を選んでください", "你的主要职能是？", "What's your main function?"], [
    ["経営・事業企画", "经营、业务规划", "Management or strategy"],
    ["営業・事業開発", "销售、业务拓展", "Sales or business development"],
    ["マーケティング・広報", "市场、公关", "Marketing or PR"],
    ["エンジニア・開発", "工程师、开发", "Engineering"],
    ["プロダクト・デザイン", "产品、设计", "Product or design"],
    ["データ・研究", "数据、研究", "Data or research"],
    ["財務・経理", "财务、会计", "Finance or accounting"],
    ["人事・採用", "人事、招聘", "HR or recruiting"],
    ["法務・知財", "法务、知识产权", "Legal or IP"],
    ["投資", "投资", "Investment"],
    OTHER,
  ]),
  e("lib-intro", "role", "free", false, ["ひとことで自己紹介をお願いします", "请用一句话介绍自己", "Introduce yourself in a sentence"]),

  // ── 業界
  e("lib-industry", "industry", "single", true, ["お仕事の業界を選んでください", "你所在的行业是？", "Which industry are you in?"], [
    ["IT・ソフトウェア", "IT、软件", "IT or software"],
    ["製造業", "制造业", "Manufacturing"],
    ["金融・保険", "金融、保险", "Finance or insurance"],
    ["商社・貿易", "商社、贸易", "Trading"],
    ["小売・EC", "零售、电商", "Retail or e-commerce"],
    ["不動産・建設", "房地产、建筑", "Real estate or construction"],
    ["医療・ヘルスケア", "医疗、健康", "Healthcare"],
    ["教育", "教育", "Education"],
    ["メディア・広告", "媒体、广告", "Media or advertising"],
    ["観光・飲食", "旅游、餐饮", "Travel or food service"],
    ["コンサルティング・専門サービス", "咨询、专业服务", "Consulting or professional services"],
    OTHER,
  ]),
  e("lib-industry-interest", "industry", "multiple", false, ["関心のある分野を選んでください（複数可）", "你关注哪些领域？（可多选）", "Which fields interest you? (choose any)"], [
    ["AI・データ", "AI、数据", "AI or data"],
    ["SaaS", "SaaS", "SaaS"],
    ["フィンテック", "金融科技", "Fintech"],
    ["ヘルスケア", "医疗健康", "Healthcare"],
    ["製造・ものづくり", "制造", "Manufacturing"],
    ["モビリティ", "出行", "Mobility"],
    ["エネルギー・環境", "能源、环保", "Energy or climate"],
    ["小売・消費財", "零售、消费品", "Retail or consumer goods"],
    ["食・農業", "食品、农业", "Food or agriculture"],
    ["教育", "教育", "Education"],
    ["エンタメ・ゲーム", "娱乐、游戏", "Entertainment or games"],
    OTHER,
  ]),

  // ── 会社のフェーズ・規模
  e("lib-company-stage", "company", "single", false, ["会社（事業）のフェーズを教えてください", "你的公司（业务）处于哪个阶段？", "What stage is your company at?"], [
    ["構想中・起業準備", "构思中、准备创业", "Idea or pre-founding"],
    ["シード", "种子期", "Seed"],
    ["アーリー（シリーズA前後）", "早期（A轮前后）", "Early (around Series A)"],
    ["ミドル（シリーズB〜C）", "成长期（B轮至C轮）", "Growth (Series B to C)"],
    ["レイター・上場準備", "后期、准备上市", "Late stage or pre-IPO"],
    ["上場企業", "上市公司", "Public company"],
    ["中小企業", "中小企业", "Small or mid-sized business"],
    ["大企業", "大型企业", "Large enterprise"],
    NA,
  ]),
  e("lib-company-size", "company", "single", false, ["会社の従業員数を教えてください", "你的公司有多少员工？", "How many people work at your company?"], [
    ["1人", "1人", "Just me"],
    ["2〜10人", "2～10人", "2 to 10"],
    ["11〜50人", "11～50人", "11 to 50"],
    ["51〜100人", "51～100人", "51 to 100"],
    ["101〜300人", "101～300人", "101 to 300"],
    ["301〜1000人", "301～1000人", "301 to 1,000"],
    ["1001〜5000人", "1001～5000人", "1,001 to 5,000"],
    ["5001人以上", "5001人以上", "More than 5,000"],
    NA,
  ]),
  e("lib-funding", "company", "single", false, ["資金調達の状況を教えてください", "你们目前的融资情况是？", "Where are you with fundraising?"], [
    ["調達の予定はない", "暂无融资计划", "No plans to raise"],
    ["自己資金で運営", "自有资金运营", "Bootstrapped"],
    ["半年以内に調達予定", "计划半年内融资", "Raising within six months"],
    ["現在調達中", "正在融资", "Raising now"],
    ["直近1年で調達済み", "近一年内已完成融资", "Raised in the past year"],
    ["投資する側", "我是投资方", "I'm on the investor side"],
    NA,
  ]),

  // ── 話したいテーマ
  e("lib-topic", "topic", "multiple", true, ["今回話したいテーマを選んでください（複数可）", "这次想聊哪些话题？（可多选）", "What would you like to talk about? (choose any)"], [
    ["資金調達", "融资", "Fundraising"],
    ["採用・組織づくり", "招聘、团队建设", "Hiring and team building"],
    ["事業提携・協業", "业务合作", "Partnerships"],
    ["新規事業", "新业务", "New ventures"],
    ["営業・販路開拓", "销售、渠道拓展", "Sales and new channels"],
    ["マーケティング", "市场营销", "Marketing"],
    ["海外展開", "海外拓展", "Going overseas"],
    ["AI・DX", "AI、数字化转型", "AI and digital transformation"],
    ["プロダクト開発", "产品开发", "Product development"],
    ["キャリア", "职业发展", "Career"],
    ["情報交換", "信息交流", "Swapping notes"],
    OTHER,
  ]),
  e("lib-challenge", "topic", "single", false, ["いまの課題にいちばん近いものを選んでください", "你目前最大的课题是？", "What's your biggest challenge right now?"], [
    ["顧客・売上を増やす", "增加客户和收入", "Growing customers and revenue"],
    ["資金を確保する", "筹措资金", "Securing funding"],
    ["人材を採用する", "招到合适的人", "Hiring the right people"],
    ["組織・チームを整える", "理顺组织和团队", "Getting the team in shape"],
    ["プロダクトを磨く", "打磨产品", "Improving the product"],
    ["海外に出る", "走向海外", "Expanding abroad"],
    ["業務を効率化する", "提高工作效率", "Working more efficiently"],
    ["次のキャリアを決める", "决定下一步职业方向", "Deciding my next career step"],
    NOTHING,
    OTHER,
  ]),
  e("lib-share", "topic", "free", false, ["事前に共有したい課題や話題があれば教えてください", "如果有想提前分享的课题或话题，请写在这里", "Anything you'd like to raise beforehand?"]),

  // ── 会いたい人
  e("lib-meet", "meet", "multiple", true, ["会いたい人を選んでください（複数可）", "你想认识什么样的人？（可多选）", "Who would you like to meet? (choose any)"], [
    ["起業家・経営者", "创业者、经营者", "Founders and executives"],
    ["投資家", "投资人", "Investors"],
    ["事業会社の担当者", "企业业务负责人", "People at established companies"],
    ["エンジニア", "工程师", "Engineers"],
    ["デザイナー", "设计师", "Designers"],
    ["営業・事業開発", "销售、业务拓展人员", "Sales and BD people"],
    ["マーケター", "市场人员", "Marketers"],
    ["専門家（士業・コンサル）", "专业人士（律师、顾问等）", "Advisors and consultants"],
    ["研究者", "研究人员", "Researchers"],
    ["同じ業界の人", "同行业的人", "People in my industry"],
    ["異業種の人", "不同行业的人", "People outside my industry"],
    OTHER,
  ]),
  e("lib-meet-region", "meet", "multiple", false, ["つながりたい人の地域を選んでください（複数可）", "想结识哪些地区的人？（可多选）", "Where are the people you'd like to connect with? (choose any)"], [
    ["日本", "日本", "Japan"],
    ["中国大陸", "中国大陆", "Mainland China"],
    ["香港・台湾", "香港、台湾", "Hong Kong or Taiwan"],
    ["韓国", "韩国", "South Korea"],
    ["東南アジア", "东南亚", "Southeast Asia"],
    ["北米", "北美", "North America"],
    ["ヨーロッパ", "欧洲", "Europe"],
    ["地域は問わない", "不限地区", "Anywhere"],
  ]),
  e("lib-meet-free", "meet", "free", false, ["会いたい人の条件があれば教えてください", "如果有特别想认识的人，请写下条件", "Anyone in particular you'd like to meet?"]),

  // ── 提供できること
  e("lib-offer", "offer", "multiple", false, ["参加者に提供できることを選んでください（複数可）", "你能为其他参加者提供什么？（可多选）", "What can you offer other attendees? (choose any)"], [
    ["出資・投資", "投资", "Investment"],
    ["顧客・販路の紹介", "介绍客户和渠道", "Customer or channel introductions"],
    ["人の紹介", "介绍人脉", "Introductions to people"],
    ["技術・開発の支援", "技术和开发支持", "Technical help"],
    ["専門知識（法務・財務など）", "专业知识（法务、财务等）", "Expertise (legal, finance and so on)"],
    ["事業・経営の相談", "业务和经营咨询", "Business advice"],
    ["採用の相談", "招聘咨询", "Hiring advice"],
    ["海外展開の支援", "海外拓展支持", "Help going overseas"],
    ["場所・設備", "场地、设备", "Space or equipment"],
    ["仕事の依頼", "工作机会", "Work to hand out"],
    ["経験・事例の共有", "分享经验和案例", "Stories and lessons"],
    OTHER,
  ]),

  // ── 探していること
  e("lib-seek", "seek", "multiple", false, ["いま探しているものを選んでください（複数可）", "你目前在寻找什么？（可多选）", "What are you looking for right now? (choose any)"], [
    ["顧客・取引先", "客户、合作方", "Customers or clients"],
    ["事業パートナー", "业务合作伙伴", "Business partners"],
    ["共同創業者", "联合创始人", "A co-founder"],
    ["投資家・資金", "投资人、资金", "Investors or funding"],
    ["投資先", "投资标的", "Companies to invest in"],
    ["採用候補者", "招聘候选人", "People to hire"],
    ["転職・副業の機会", "跳槽、副业机会", "A new job or side project"],
    ["メンター・相談相手", "导师、可以请教的人", "A mentor"],
    ["業界の情報", "行业信息", "Industry insight"],
    ["仲間・コミュニティ", "伙伴、社群", "Peers and community"],
    NOTHING,
    OTHER,
  ]),
  e("lib-hiring", "seek", "single", false, ["採用・転職について近いものを選んでください", "关于招聘或求职，你目前的情况是？", "Where do you stand on hiring or job hunting?"], [
    ["積極的に採用している", "正在积极招聘", "Actively hiring"],
    ["良い人がいれば採用したい", "遇到合适的人会招", "Open to hiring the right person"],
    ["転職を考えている", "正在考虑换工作", "Thinking about a new job"],
    ["副業を探している", "在找副业", "Looking for side work"],
    ["どちらでもない", "都不是", "Neither"],
    ["回答しない", "不回答", "Prefer not to say"],
  ]),

  // ── 経験
  e("lib-level", "experience", "single", true, ["このテーマの経験はどのくらいですか？", "你对这个主题有多少经验？", "How familiar are you with this topic?"], [
    ["これから学びたい", "想从头学起", "New to it"],
    ["少し調べたことがある", "了解过一些", "I've read up on it"],
    ["業務で使い始めた", "刚开始在工作中使用", "Starting to use it at work"],
    ["業務で日常的に使っている", "工作中经常使用", "I use it regularly at work"],
    ["人に教えられる", "可以教别人", "I could teach it"],
    ["専門家として携わっている", "是这方面的专家", "It's my specialty"],
  ]),
  e("lib-years", "experience", "single", false, ["いまの分野での経験年数を教えてください", "你在目前领域的经验有几年？", "How long have you worked in your field?"], [
    ["1年未満", "不到1年", "Less than a year"],
    ["1〜3年", "1～3年", "1 to 3 years"],
    ["3〜5年", "3～5年", "3 to 5 years"],
    ["5〜10年", "5～10年", "5 to 10 years"],
    ["10〜20年", "10～20年", "10 to 20 years"],
    ["20年以上", "20年以上", "20 years or more"],
  ]),

  // ── 参加のきっかけ
  e("lib-purpose", "motivation", "multiple", false, ["参加の目的を選んでください（複数可）", "参加这次活动的目的是？（可多选）", "Why are you coming? (choose any)"], [
    ["人脈を広げたい", "扩展人脉", "To grow my network"],
    ["商談・協業先を探したい", "寻找商谈、合作对象", "To find business partners"],
    ["情報収集", "收集信息", "To see what's going on"],
    ["学びたい", "学习", "To learn"],
    ["採用につなげたい", "为招聘做准备", "To find people to hire"],
    ["資金調達のため", "为了融资", "To raise funding"],
    ["投資先を探したい", "寻找投资标的", "To find investments"],
    ["登壇者の話を聞きたい", "想听嘉宾分享", "To hear the speakers"],
    ["友人に誘われた", "朋友邀请", "A friend invited me"],
    OTHER,
  ]),
  e("lib-source", "motivation", "single", false, ["このイベントを何で知りましたか？", "你是从哪里知道这场活动的？", "How did you hear about this event?"], [
    ["主催者からの案内", "主办方通知", "From the organizer"],
    ["友人・知人の紹介", "朋友、熟人介绍", "A friend or colleague"],
    ["会社・所属団体", "公司或所属团体", "My company or organization"],
    ["X（Twitter）", "X（Twitter）", "X (Twitter)"],
    ["Facebook", "Facebook", "Facebook"],
    ["LinkedIn", "LinkedIn", "LinkedIn"],
    ["WeChat", "微信", "WeChat"],
    ["イベント告知サイト", "活动发布网站", "An event listing site"],
    ["検索", "搜索", "Search"],
    ["前回の参加", "以前参加过", "I came before"],
    OTHER,
  ]),
  e("lib-times", "motivation", "single", false, ["このイベントへの参加は何回目ですか？", "这是你第几次参加这个活动？", "How many times have you come to this event?"], [
    ["初めて", "第一次", "First time"],
    ["2回目", "第二次", "Second time"],
    ["3〜5回目", "第3～5次", "3 to 5 times"],
    ["6回以上", "6次以上", "6 or more"],
  ]),

  // ── 言語
  e("lib-language", "language", "multiple", true, ["会話できる言語を選んでください（複数可）", "你可以用哪些语言交流？（可多选）", "Which languages can you talk in? (choose any)"], [
    ["日本語", "日语", "Japanese"],
    ["中国語", "中文", "Chinese"],
    ["英語", "英语", "English"],
    ["韓国語", "韩语", "Korean"],
    ["広東語", "粤语", "Cantonese"],
    ["ベトナム語", "越南语", "Vietnamese"],
    ["タイ語", "泰语", "Thai"],
    ["インドネシア語", "印尼语", "Indonesian"],
    ["スペイン語", "西班牙语", "Spanish"],
    ["フランス語", "法语", "French"],
    OTHER,
  ]),
  e("lib-japanese", "language", "single", false, ["日本語での会話はどのくらいできますか？", "你的日语会话水平如何？", "How comfortable are you speaking Japanese?"], [
    ["ネイティブ", "母语", "Native"],
    ["ビジネスで問題なく話せる", "商务交流没问题", "Fluent for business"],
    ["日常会話ができる", "能进行日常会话", "Conversational"],
    ["簡単なやりとりならできる", "能简单交流", "Basic"],
    ["ほとんど話せない", "基本不会", "Hardly at all"],
  ]),
  e("lib-table-language", "language", "single", false, ["テーブルで話したい言語を選んでください", "你希望在桌上用哪种语言交流？", "Which language would you like at your table?"], [
    ["日本語", "日语", "Japanese"],
    ["中国語", "中文", "Chinese"],
    ["英語", "英语", "English"],
    ["日本語と中国語", "日语和中文", "Japanese and Chinese"],
    ["日本語と英語", "日语和英语", "Japanese and English"],
    ["どれでもよい", "都可以", "Any"],
  ]),

  // ── 交流のスタイル
  e("lib-style", "style", "single", false, ["交流のスタイルに近いものを選んでください", "你的交流风格更接近哪种？", "What's your style at events like this?"], [
    ["自分から話しかける", "主动搭话", "I start conversations"],
    ["話しかけられれば話す", "有人搭话就聊", "I chat when approached"],
    ["少人数でじっくり話したい", "喜欢小范围深入交流", "I prefer small, deep conversations"],
    ["大勢と広く話したい", "想和更多人广泛交流", "I like meeting as many people as I can"],
    ["聞き役が多い", "多半是倾听者", "I'm mostly a listener"],
    ["初対面は緊張する", "和陌生人交流会紧张", "Meeting new people makes me nervous"],
  ]),
  e("lib-table-mix", "style", "single", false, ["テーブルの組み方の希望を教えてください", "你希望怎样分桌？", "How would you like to be seated?"], [
    ["同じ業界の人と", "和同行业的人", "With people in my industry"],
    ["異なる業界の人と", "和不同行业的人", "With people from other industries"],
    ["同じ立場の人と", "和身份相同的人", "With people in a similar role"],
    ["異なる立場の人と", "和身份不同的人", "With people in different roles"],
    ["おまかせ", "交给主办方", "Leave it to the organizer"],
  ]),

  // ── 会後の連絡
  e("lib-followup", "followup", "multiple", false, ["会後の連絡方法の希望を選んでください（複数可）", "会后希望怎么联系？（可多选）", "How would you like to stay in touch? (choose any)"], [
    ["メール", "邮件", "Email"],
    ["LinkedIn", "LinkedIn", "LinkedIn"],
    ["Facebook", "Facebook", "Facebook"],
    ["X（Twitter）", "X（Twitter）", "X (Twitter)"],
    ["LINE", "LINE", "LINE"],
    ["WeChat", "微信", "WeChat"],
    ["電話", "电话", "Phone"],
    ["Orbit のメッセージ", "Orbit 消息", "Orbit messages"],
    ["連絡は控えてほしい", "希望不要联系", "Please don't contact me"],
  ]),
  e("lib-intro-ok", "followup", "single", false, ["会後、主催者から他の参加者を紹介してもよいですか？", "会后可以由主办方介绍其他参加者给你吗？", "After the event, may the organizer introduce you to other attendees?"], [
    ["ぜひ紹介してほしい", "非常欢迎", "Yes, please"],
    ["相手によっては", "看对象而定", "Depends on who"],
    ["今回は不要", "这次不需要", "Not this time"],
  ]),
  e("lib-next", "followup", "single", false, ["次回のイベントの案内を受け取りますか？", "要接收下次活动的通知吗？", "Would you like to hear about the next event?"], [
    ["受け取る", "接收", "Yes"],
    ["関心のあるテーマのときだけ", "只在感兴趣的主题时", "Only for topics I'm interested in"],
    ["受け取らない", "不接收", "No"],
  ]),

  // ── 当日について
  e("lib-region", "logistics", "single", false, ["お住まい（活動拠点）の地域を選んでください", "你的居住地（活动据点）在哪里？", "Where are you based?"], [
    ["東京", "东京", "Tokyo"],
    ["神奈川・千葉・埼玉", "神奈川、千叶、埼玉", "Kanagawa, Chiba or Saitama"],
    ["大阪・関西", "大阪、关西", "Osaka or Kansai"],
    ["名古屋・中部", "名古屋、中部", "Nagoya or Chubu"],
    ["福岡・九州", "福冈、九州", "Fukuoka or Kyushu"],
    ["その他の日本国内", "日本其他地区", "Elsewhere in Japan"],
    ["中国", "中国", "China"],
    ["その他の海外", "其他海外地区", "Elsewhere abroad"],
  ]),
  e("lib-diet", "logistics", "multiple", false, ["食事で配慮が必要なものを選んでください（複数可）", "饮食上需要注意什么？（可多选）", "Any dietary needs? (choose any)"], [
    ["特にない", "没有", "None"],
    ["ベジタリアン", "素食", "Vegetarian"],
    ["ヴィーガン", "纯素", "Vegan"],
    ["ハラール", "清真", "Halal"],
    ["食物アレルギーあり", "有食物过敏", "Food allergies"],
    ["アルコールを飲まない", "不喝酒", "No alcohol"],
    OTHER,
  ]),
];

const LANG_INDEX: Record<OrbitLanguage, 0 | 1 | 2> = { en: 2, ja: 0, zh: 1 };
const BY_ID = new Map(HOST_QUESTION_LIBRARY_ENTRIES.map((entry) => [entry.id, entry]));

export const hostQuestionCategoryLabel = (category: HostQuestionCategory, language: OrbitLanguage) => CATEGORY_LABEL[category][LANG_INDEX[language]];

export const isLibraryQuestionId = (id: string) => BY_ID.has(id);

export const libraryEntry = (id: string): HostLibraryEntry | null => BY_ID.get(id) ?? null;

/** 質問集の 1 問をその言語の申込フォームの質問にする（id は質問集の id のまま）。 */
export function entryQuestion(entry: HostLibraryEntry, language: OrbitLanguage): HostSetupQuestion {
  const i = LANG_INDEX[language];
  return { id: entry.id, kind: entry.kind, options: entry.options.map((option) => option[i]), prompt: entry.prompt[i], required: entry.required };
}

export function libraryQuestion(id: string, language: OrbitLanguage): HostSetupQuestion | null {
  const entry = BY_ID.get(id);
  return entry ? entryQuestion(entry, language) : null;
}

/** 質問集全体（その言語で）。 */
export const hostQuestionLibrary = (language: OrbitLanguage): HostSetupQuestion[] => HOST_QUESTION_LIBRARY_ENTRIES.map((entry) => entryQuestion(entry, language));

/**
 * 質問集の質問を別の言語にする。主催者が文面・選択肢・必須を手で変えていたら（どの言語版とも一致しない）そのまま返す。
 * サーバーの「質問案」は言語を知らないので日本語で来る → 画面の言語に直して足す。
 */
export function localizeQuestion(question: HostSetupQuestion, language: OrbitLanguage): HostSetupQuestion {
  const entry = BY_ID.get(question.id);
  if (!entry || question.kind !== entry.kind) return question;
  const untouched = ([0, 1, 2] as const).some((i) => question.prompt === entry.prompt[i] && question.options.length === entry.options.length && question.options.every((option, k) => option === entry.options[k]![i]));
  return untouched ? { ...entryQuestion(entry, language), required: question.required } : question;
}

export type HostQuestionTemplate = "mixer" | "study" | "round";

/** テンプレート → 質問集から最初に入れる質問。どれも Q1 は「立場」（レポートの「立場」分布が Q1 を読む）。 */
export const HOST_TEMPLATE_QUESTION_IDS: Readonly<Record<HostQuestionTemplate, readonly string[]>> = {
  mixer: ["lib-role", "lib-industry", "lib-topic", "lib-meet"],
  round: ["lib-role", "lib-challenge", "lib-company-stage", "lib-share"],
  study: ["lib-role", "lib-level", "lib-topic", "lib-share"],
};

export const templateLibraryQuestions = (template: HostQuestionTemplate, language: OrbitLanguage): HostSetupQuestion[] =>
  HOST_TEMPLATE_QUESTION_IDS[template].map((id) => libraryQuestion(id, language)!);

/** 「質問案」の候補順（どのイベントにも使える質問から）。過去の回答がない主催者にはこの順で 3 問。 */
export const HOST_SUGGESTION_ORDER: readonly string[] = ["lib-role", "lib-topic", "lib-meet", "lib-industry", "lib-purpose", "lib-offer", "lib-seek", "lib-language", "lib-meet-free"];

export function suggestionLibrary(language: OrbitLanguage): HostSetupQuestion[] {
  const first = HOST_SUGGESTION_ORDER.map((id) => libraryQuestion(id, language)!);
  const rest = HOST_QUESTION_LIBRARY_ENTRIES.filter((entry) => !HOST_SUGGESTION_ORDER.includes(entry.id)).map((entry) => entryQuestion(entry, language));
  return [...first, ...rest];
}

/** あと何問入れられるか。 */
export const remainingQuestionSlots = (questions: readonly HostSetupQuestion[], max = HOST_QUESTION_MAX) => Math.max(0, max - questions.length);

/**
 * 質問集から選んだ質問をフォームの末尾に足す（選んだ順。すでに入っている id は足さない。`max` 問で止める）。
 * `added` = 実際に足した id、`skipped` = 上限で足せなかった id。
 */
export function addLibraryQuestions(questions: readonly HostSetupQuestion[], ids: readonly string[], language: OrbitLanguage, max = HOST_QUESTION_MAX): { questions: HostSetupQuestion[]; added: string[]; skipped: string[] } {
  const next = [...questions];
  const have = new Set(questions.map((question) => question.id));
  const added: string[] = [];
  const skipped: string[] = [];
  for (const id of ids) {
    if (have.has(id)) continue;
    const question = libraryQuestion(id, language);
    if (!question) continue;
    if (next.length >= max) { skipped.push(id); continue; }
    next.push(question);
    have.add(id);
    added.push(id);
  }
  return { added, questions: next, skipped };
}

/** 質問集の検索（文面・選択肢、3 言語どれでも当たる）。空なら全件。カテゴリ `all` は全カテゴリ。 */
export function searchLibrary(query: string, category: HostQuestionCategory | "all" = "all"): HostLibraryEntry[] {
  const words = query.trim().toLowerCase().split(/\s+/u).filter(Boolean);
  return HOST_QUESTION_LIBRARY_ENTRIES.filter((entry) => {
    if (category !== "all" && entry.category !== category) return false;
    if (!words.length) return true;
    const text = [...entry.prompt, ...entry.options.flat()].join("\n").toLowerCase();
    return words.every((word) => text.includes(word));
  });
}
