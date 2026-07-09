export interface EventLocalizedText {
  en: string;
  ja: string;
  zh: string;
}

export interface OrbitEventAboutSection {
  icon: string;
  label: EventLocalizedText;
  body: EventLocalizedText;
}

export interface OrbitEventContent {
  title: EventLocalizedText;
  summary: EventLocalizedText;
  cover: string;
  theme: string;
  industry: string;
  tags: string[];
  about: OrbitEventAboutSection[];
}

const OVERVIEW_LABEL: EventLocalizedText = {
  zh: "活动简介",
  en: "Overview",
  ja: "イベント概要",
};

const WHAT_LABEL: EventLocalizedText = {
  zh: "活动内容",
  en: "What happens",
  ja: "当日の内容",
};

const WHO_LABEL: EventLocalizedText = {
  zh: "适合人群",
  en: "Who should attend",
  ja: "対象となる方",
};

const LOGISTICS_LABEL: EventLocalizedText = {
  zh: "时间 · 地点 · 费用",
  en: "Time · Venue · Fee",
  ja: "日時 · 会場 · 参加費",
};

export const EVENT_CONTENT: Record<string, OrbitEventContent> = {
  event_01: {
    title: {
      zh: "东京餐饮入境客增长会",
      en: "Tokyo Inbound Restaurant Growth Forum",
      ja: "東京インバウンド飲食店成長会",
    },
    summary: {
      zh: "面向东京餐饮经营者的实战交流会，聚焦如何把激增的入境游客转化为稳定客流与复购。",
      en: "A working forum for Tokyo restaurant operators on turning the surge of inbound visitors into steady, repeat foot traffic.",
      ja: "急増する訪日客を安定した来店と再訪につなげる、東京の飲食店経営者向けの実践型交流会です。",
    },
    cover: "/orbit-covers/restaurant.jpg",
    theme: "consumer",
    industry: "F&B",
    tags: ["Inbound", "F&B"],
    about: [
      {
        icon: "🌏",
        label: OVERVIEW_LABEL,
        body: {
          zh: "入境游客正在重塑东京的餐饮版图，但流量并不等于利润。本次聚会邀请一线经营者与增长伙伴同桌，拆解从多语言点单到海外点评运营的真实打法，帮你把一次性到店变成长期喜爱。",
          en: "Inbound visitors are reshaping Tokyo dining, yet traffic alone is not profit. This gathering brings frontline operators and growth partners to one table to unpack real tactics, from multilingual ordering to overseas review management, so a first visit becomes lasting loyalty.",
          ja: "訪日客は東京の飲食シーンを塗り替えていますが、集客がそのまま利益になるわけではありません。本会では現場の経営者と成長パートナーが一堂に会し、多言語オーダーから海外レビュー運用まで、初来店を継続的なファンに変える実践知を共有します。",
        },
      },
      {
        icon: "🗣",
        label: WHAT_LABEL,
        body: {
          zh: "• 经营者分享入境客占比翻倍后的定价与排班调整\n• 现场演示多语言菜单、二维码点单与海外支付接入\n• 圆桌讨论如何在 Google 与小红书上做好口碑\n• 自由交流时段，按品类与选址配对同行",
          en: "• Operators share pricing and staffing shifts after inbound share doubled\n• Live demos of multilingual menus, QR ordering and overseas payment\n• A roundtable on building reputation across Google and Xiaohongshu\n• Open networking, matched by cuisine category and location",
          ja: "• 訪日客比率が倍増した後の価格・シフト調整を経営者が共有\n• 多言語メニュー、QRオーダー、海外決済導入のライブデモ\n• GoogleやRED（小紅書）での評判づくりを語るラウンドテーブル\n• 業態と立地でマッチングする自由交流の時間",
        },
      },
      {
        icon: "👥",
        label: WHO_LABEL,
        body: {
          zh: "• 东京都内餐厅、居酒屋与咖啡店的经营者与店长\n• 负责入境增长的营销与运营负责人\n• 提供点单、支付或翻译工具的服务方",
          en: "• Owners and managers of Tokyo restaurants, izakaya and cafes\n• Marketing and operations leads driving inbound growth\n• Providers of ordering, payment or translation tools",
          ja: "• 都内の飲食店・居酒屋・カフェのオーナーや店長\n• インバウンド成長を担う集客・運営責任者\n• オーダー、決済、翻訳ツールを提供する事業者",
        },
      },
      {
        icon: "📍",
        label: LOGISTICS_LABEL,
        body: {
          zh: "• 平日晚间举办，含分享、圆桌与交流约三小时\n• 会场位于东京都心，邻近主要车站\n• 采取合作方支持的邀请制，无需现场付费",
          en: "• Held on a weekday evening, about three hours of talks, roundtable and networking\n• Venue in central Tokyo, close to major stations\n• Invite-only with partner support, no fee at the door",
          ja: "• 平日夜間に開催、トーク・ラウンドテーブル・交流で約3時間\n• 会場は都心、主要駅から至近\n• パートナー協賛による招待制で、当日の参加費は不要",
        },
      },
    ],
  },
  event_02: {
    title: {
      zh: "日中 AI 业务自动化 PoC 圆桌",
      en: "Japan-China AI Workflow PoC Roundtable",
      ja: "日中AI業務自動化PoCラウンドテーブル",
    },
    summary: {
      zh: "面向日中两地团队的闭门圆桌，围绕如何把业务自动化 PoC 从演示推进到可上线的生产系统。",
      en: "A closed-door roundtable for Japan and China teams on moving workflow-automation PoCs from demo to production-ready systems.",
      ja: "業務自動化のPoCをデモから本番運用へと進める方法を語る、日中チーム向けの少人数ラウンドテーブルです。",
    },
    cover: "/orbit-covers/events/ai-workflow-poc-roundtable.jpg",
    theme: "ai",
    industry: "AI",
    tags: ["AI", "PoC"],
    about: [
      {
        icon: "🌏",
        label: OVERVIEW_LABEL,
        body: {
          zh: "很多 AI 业务自动化项目止步于漂亮的演示。本圆桌汇集日中两地的技术与业务负责人，直面 PoC 落地的真实障碍：数据合规、模型评测、跨境交付与投资回报，交流那些真正跑通到生产的经验。",
          en: "Many AI workflow-automation projects stall at a polished demo. This roundtable convenes technical and business leads across Japan and China to face the real barriers to shipping a PoC: data compliance, model evaluation, cross-border delivery and return on investment.",
          ja: "AI業務自動化の多くは、見栄えの良いデモで止まってしまいます。本ラウンドテーブルでは日中双方の技術・事業責任者が集まり、データコンプライアンス、モデル評価、越境デリバリー、投資対効果といったPoC実装の壁に正面から向き合います。",
        },
      },
      {
        icon: "🗣",
        label: WHAT_LABEL,
        body: {
          zh: "• 案例复盘：一个 PoC 从提案到生产的完整时间线\n• 讨论跨境数据处理与合规边界\n• 分享模型评测与效果度量的实用框架\n• 小组配对，探讨可共同推进的试点",
          en: "• Case review: one PoC's full timeline from proposal to production\n• Discussion of cross-border data handling and compliance limits\n• A practical framework for model evaluation and impact metrics\n• Small-group matching to explore pilots worth advancing together",
          ja: "• ケース振り返り：提案から本番までPoCの全タイムライン\n• 越境データ処理とコンプライアンスの境界を議論\n• モデル評価と効果測定の実用フレームワークを共有\n• 共同で進められる試験導入を探る少人数マッチング",
        },
      },
      {
        icon: "👥",
        label: WHO_LABEL,
        body: {
          zh: "• 推动 AI 自动化的产品与工程负责人\n• 评估或采购 AI 方案的业务决策者\n• 提供跨境交付能力的 AI 服务商与集成商",
          en: "• Product and engineering leads driving AI automation\n• Business decision-makers evaluating or buying AI solutions\n• AI vendors and integrators offering cross-border delivery",
          ja: "• AI自動化を推進するプロダクト・エンジニア責任者\n• AIソリューションを評価・導入する事業側の意思決定者\n• 越境デリバリーを担うAIベンダー・インテグレーター",
        },
      },
      {
        icon: "📍",
        label: LOGISTICS_LABEL,
        body: {
          zh: "• 工作日午后举办，约两个半小时深度讨论\n• 线下会场设于东京，另设线上连线席位\n• 依据来源背景审核的邀请制，免收费用",
          en: "• Held on a weekday afternoon, about two and a half hours of deep discussion\n• In-person venue in Tokyo, with remote seats available\n• Invite-only after a background review, no fee",
          ja: "• 平日午後に開催、約2時間半の深い議論\n• 対面会場は東京、オンライン接続席も用意\n• 経歴を確認した上での招待制で、参加費は無料",
        },
      },
    ],
  },
  event_03: {
    title: {
      zh: "跨境电商渠道拓展交流会",
      en: "Cross-Border Ecommerce Channel Meetup",
      ja: "越境ECチャネル開拓ミートアップ",
    },
    summary: {
      zh: "为跨境电商团队搭建的渠道对接会，帮助品牌在日本与亚洲市场找到合适的平台、物流与代运营伙伴。",
      en: "A channel-building meetup for cross-border ecommerce teams, helping brands find the right platforms, logistics and operations partners across Japan and Asia.",
      ja: "越境ECチームのためのチャネル交流会。日本とアジア市場で最適なプラットフォーム、物流、運用代行のパートナーを見つけます。",
    },
    cover: "/orbit-covers/events/cross-border-ecommerce-meetup.jpg",
    theme: "ecommerce",
    industry: "Ecommerce",
    tags: ["Ecommerce", "Cross-border"],
    about: [
      {
        icon: "🌏",
        label: OVERVIEW_LABEL,
        body: {
          zh: "开一个跨境店铺不难，难的是把渠道铺对、把货送到、把利润留住。本次交流会把品牌方、平台方与服务商聚到一起，围绕选品、渠道组合与履约成本，交流可复用的拓展打法。",
          en: "Opening a cross-border store is easy; choosing the right channels, delivering the goods and keeping the margin is hard. This meetup gathers brands, platforms and service providers to trade reusable expansion tactics around assortment, channel mix and fulfilment cost.",
          ja: "越境ストアを開くのは簡単ですが、チャネルを正しく選び、商品を届け、利益を残すのは難しいものです。本ミートアップではブランド、プラットフォーム、サービス事業者が集まり、商品選定・チャネル構成・物流コストを軸に再現性ある開拓手法を共有します。",
        },
      },
      {
        icon: "🗣",
        label: WHAT_LABEL,
        body: {
          zh: "• 品牌分享进入日本市场的首年渠道踩坑与复盘\n• 平台与物流方讲解跨境履约与清关要点\n• 讨论多渠道库存与定价的协调方法\n• 定向配对，撮合品牌与代运营及物流伙伴",
          en: "• Brands share first-year channel missteps entering Japan\n• Platforms and logistics partners explain cross-border fulfilment and customs\n• Discussion of coordinating inventory and pricing across channels\n• Targeted matching between brands, operations and logistics partners",
          ja: "• ブランドが日本市場参入初年度のチャネル失敗を振り返り共有\n• プラットフォームと物流事業者が越境物流と通関の要点を解説\n• 複数チャネルの在庫・価格を調整する方法を議論\n• ブランドと運用代行・物流パートナーを狙って引き合わせ",
        },
      },
      {
        icon: "👥",
        label: WHO_LABEL,
        body: {
          zh: "• 计划或已在做跨境销售的品牌与卖家\n• 电商平台、物流与支付服务提供方\n• 代运营、选品与本地化营销团队",
          en: "• Brands and sellers planning or already running cross-border sales\n• Ecommerce platform, logistics and payment providers\n• Operations, sourcing and localization marketing teams",
          ja: "• 越境販売を計画中または実施中のブランド・出店者\n• ECプラットフォーム、物流、決済の提供事業者\n• 運用代行、商品仕入れ、ローカライズ集客のチーム",
        },
      },
      {
        icon: "📍",
        label: LOGISTICS_LABEL,
        body: {
          zh: "• 平日下午举办，含分享与定向配对约三小时\n• 会场位于东京，方便主要商圈往返\n• 由合作平台支持的邀请制，无需报名费",
          en: "• Held on a weekday afternoon, about three hours of talks and targeted matching\n• Venue in Tokyo, easy to reach from major commercial districts\n• Invite-only with partner platform support, no registration fee",
          ja: "• 平日午後に開催、トークと狙い撃ちマッチングで約3時間\n• 会場は東京、主要商業エリアからアクセス良好\n• 協賛プラットフォーム支援の招待制で、登録料は不要",
        },
      },
    ],
  },
  event_04: {
    title: {
      zh: "投资人与创业者种子轮会谈",
      en: "Seed Investor & Founder Matching Salon",
      ja: "投資家・創業者シード面談会",
    },
    summary: {
      zh: "为早期创业者与种子投资人安排的一对一会谈沙龙，用结构化配对替代随机社交，直接推进融资对话。",
      en: "A one-on-one matching salon pairing early-stage founders with seed investors, replacing random networking with structured introductions that move fundraising forward.",
      ja: "アーリー期の創業者とシード投資家の1対1面談サロン。偶然の交流ではなく構造化されたマッチングで資金調達の対話を前進させます。",
    },
    cover: "/orbit-covers/events/investor-founder-salon.jpg",
    theme: "venture",
    industry: "Venture",
    tags: ["Investors", "Seed"],
    about: [
      {
        icon: "🌏",
        label: OVERVIEW_LABEL,
        body: {
          zh: "种子轮融资靠的是精准而非人海。本沙龙在活动前收集创业者与投资人的重点方向，按赛道与阶段安排一对一会谈，让每一次对话都直指要点，而不是名片交换。",
          en: "Seed rounds are won by precision, not crowds. This salon collects the focus areas of founders and investors beforehand, then arranges one-on-one meetings by sector and stage so every conversation gets to the point rather than trading cards.",
          ja: "シード調達は人数ではなく的確さで決まります。本サロンでは事前に創業者と投資家の関心領域を集め、分野とステージごとに1対1面談を組みます。名刺交換ではなく、要点に直結する対話を実現します。",
        },
      },
      {
        icon: "🗣",
        label: WHAT_LABEL,
        body: {
          zh: "• 创业者进行简短开场，聚焦问题与牵引力\n• 按预设赛道展开多轮一对一会谈\n• 投资人分享当前关注的方向与判断标准\n• 会后跟进机制，帮助有意向的双方继续推进",
          en: "• Founders give a short pitch focused on problem and traction\n• Multiple rounds of one-on-one meetings by pre-set sector\n• Investors share current focus areas and decision criteria\n• A follow-up mechanism to keep interested pairs moving after the event",
          ja: "• 創業者が課題とトラクションに絞った短いピッチを実施\n• 事前設定した分野ごとに複数ラウンドの1対1面談\n• 投資家が現在の注目領域と判断基準を共有\n• 関心を持った双方が継続できるフォローアップの仕組み",
        },
      },
      {
        icon: "👥",
        label: WHO_LABEL,
        body: {
          zh: "• 正在或即将启动种子轮的早期创业者\n• 关注早期项目的天使与种子基金投资人\n• 支持早期公司的加速器与生态伙伴",
          en: "• Early-stage founders raising or about to raise a seed round\n• Angel and seed fund investors focused on early deals\n• Accelerators and ecosystem partners supporting early companies",
          ja: "• シードを調達中または開始間近のアーリー創業者\n• アーリー案件に注力するエンジェル・シード投資家\n• アーリー企業を支えるアクセラレーターやエコシステム関係者",
        },
      },
      {
        icon: "📍",
        label: LOGISTICS_LABEL,
        body: {
          zh: "• 平日晚间举办，含开场与多轮会谈约三小时\n• 会场设于东京商务核心区\n• 需资料审核的邀请制，双方均免收费用",
          en: "• Held on a weekday evening, about three hours of pitches and meeting rounds\n• Venue in Tokyo's core business district\n• Invite-only after profile review, no fee for either side",
          ja: "• 平日夜間に開催、ピッチと複数ラウンド面談で約3時間\n• 会場は東京のビジネス中枢エリア\n• プロフィール審査を経た招待制で、双方とも参加費は無料",
        },
      },
    ],
  },
  event_05: {
    title: {
      zh: "在日华人商业社群赞助合作会",
      en: "Chinese Business Community Sponsorship Salon",
      ja: "在日華人ビジネスコミュニティスポンサー会",
    },
    summary: {
      zh: "连接在日华人商业社群运营者与品牌赞助方的沙龙，探讨如何让社群活动与商业支持长期共赢。",
      en: "A salon connecting operators of Chinese business communities in Japan with brand sponsors, exploring how community events and commercial support can win together long term.",
      ja: "在日華人ビジネスコミュニティの運営者とブランドスポンサーをつなぐサロン。コミュニティ活動と商業支援が長期的に共栄する方法を探ります。",
    },
    cover: "/orbit-covers/events/chinese-business-community-salon.jpg",
    theme: "community",
    industry: "Community",
    tags: ["Community", "Sponsorship"],
    about: [
      {
        icon: "🌏",
        label: OVERVIEW_LABEL,
        body: {
          zh: "在日华人商业社群正在成为品牌触达高价值人群的重要入口，但赞助合作常常止于一次性投放。本沙龙让社群主理人与品牌方坐下来，探讨如何设计可持续、可衡量、双方都满意的长期合作。",
          en: "Chinese business communities in Japan have become a key channel for brands to reach high-value audiences, yet sponsorship often stops at a one-off placement. This salon sits community organizers and brands down together to design sustainable, measurable partnerships that satisfy both sides.",
          ja: "在日華人ビジネスコミュニティは、ブランドが高価値層へ届く重要な入口になっています。しかし協賛は一度きりの出稿で終わりがちです。本サロンではコミュニティ主宰者とブランドが同席し、持続可能で測定でき、双方が納得する長期連携を設計します。",
        },
      },
      {
        icon: "🗣",
        label: WHAT_LABEL,
        body: {
          zh: "• 社群主理人分享成员画像与活动运营现状\n• 品牌方讲解他们看重的合作形式与效果指标\n• 讨论赞助权益设计与长期合作的定价逻辑\n• 现场对接，撮合契合的社群与品牌",
          en: "• Community organizers share member profiles and how they run events\n• Brands explain the partnership formats and metrics they value\n• Discussion of sponsorship benefit design and long-term pricing logic\n• On-site matching between well-fit communities and brands",
          ja: "• コミュニティ主宰者が会員像と運営の現状を共有\n• ブランドが重視する連携形態と効果指標を説明\n• 協賛特典の設計と長期連携の価格ロジックを議論\n• 相性の良いコミュニティとブランドを現場でマッチング",
        },
      },
      {
        icon: "👥",
        label: WHO_LABEL,
        body: {
          zh: "• 在日华人商业社群、协会与活动的主理人\n• 希望触达在日华人群体的品牌与市场负责人\n• 提供活动、内容或场地支持的合作伙伴",
          en: "• Organizers of Chinese business communities, associations and events in Japan\n• Brand and marketing leads aiming to reach the Chinese community in Japan\n• Partners offering event, content or venue support",
          ja: "• 在日華人のビジネスコミュニティ・団体・イベントの主宰者\n• 在日華人層への到達を目指すブランド・マーケ責任者\n• イベント、コンテンツ、会場支援を提供するパートナー",
        },
      },
      {
        icon: "📍",
        label: LOGISTICS_LABEL,
        body: {
          zh: "• 平日晚间举办，含分享与对接约两个半小时\n• 会场位于东京，交通便利\n• 由合作品牌支持的邀请制，参与不收费",
          en: "• Held on a weekday evening, about two and a half hours of talks and matching\n• Venue in Tokyo with convenient access\n• Invite-only with partner brand support, no fee to attend",
          ja: "• 平日夜間に開催、トークとマッチングで約2時間半\n• 会場は東京、アクセス良好\n• 協賛ブランド支援の招待制で、参加費は無料",
        },
      },
    ],
  },
  event_06: {
    title: {
      zh: "半导体 × 制造峰会",
      en: "Semiconductor × Manufacturing Summit",
      ja: "半導体×製造サミット",
    },
    summary: {
      zh: "聚焦半导体与先进制造交汇点的峰会，探讨供应链韧性、设备协作与日本制造业的下一步机会。",
      en: "A summit at the intersection of semiconductors and advanced manufacturing, exploring supply-chain resilience, equipment collaboration and Japan's next manufacturing opportunities.",
      ja: "半導体と先端製造の交差点に立つサミット。サプライチェーンの強靭性、装置連携、日本製造業の次の機会を探ります。",
    },
    cover: "/orbit-covers/chip.jpg",
    theme: "hardware",
    industry: "Semiconductor",
    tags: ["Hardware", "Manufacturing"],
    about: [
      {
        icon: "🌏",
        label: OVERVIEW_LABEL,
        body: {
          zh: "半导体正重新定义全球制造格局，而日本在材料、设备与精密制造上握有关键筹码。本峰会汇聚芯片、装备与制造链上的决策者，直面产能布局、供应链韧性与跨企业协作的现实议题。",
          en: "Semiconductors are redefining global manufacturing, and Japan holds decisive strengths in materials, equipment and precision fabrication. This summit gathers decision-makers across chips, equipment and the manufacturing chain to confront capacity planning, supply-chain resilience and cross-company collaboration.",
          ja: "半導体は世界の製造構図を塗り替えており、日本は材料・装置・精密加工で決定的な強みを持ちます。本サミットではチップ、装置、製造チェーンの意思決定者が集まり、生産能力の配置、サプライチェーンの強靭性、企業間連携という現実的な論点に向き合います。",
        },
      },
      {
        icon: "🗣",
        label: WHAT_LABEL,
        body: {
          zh: "• 主题演讲：先进制程与地区产能的未来走向\n• 面板讨论供应链韧性与关键材料风险\n• 装备与制造企业分享协同降本的实践\n• 定向洽谈，撮合上下游技术合作",
          en: "• Keynotes on advanced nodes and the future of regional capacity\n• A panel on supply-chain resilience and critical-material risk\n• Equipment and manufacturing firms share cost-down collaboration\n• Targeted meetings to match upstream and downstream partners",
          ja: "• 基調講演：先端プロセスと地域生産能力の行方\n• サプライチェーン強靭性と重要材料リスクを論じるパネル\n• 装置・製造企業がコスト低減の協業事例を共有\n• 上流と下流の技術連携を結ぶ狙い撃ち商談",
        },
      },
      {
        icon: "👥",
        label: WHO_LABEL,
        body: {
          zh: "• 半导体、装备与材料企业的技术与业务负责人\n• 精密制造与工厂自动化领域的决策者\n• 关注硬科技供应链的投资人与政策方",
          en: "• Technical and business leads at semiconductor, equipment and materials firms\n• Decision-makers in precision manufacturing and factory automation\n• Investors and policy stakeholders tracking hard-tech supply chains",
          ja: "• 半導体・装置・材料企業の技術および事業責任者\n• 精密製造や工場自動化領域の意思決定者\n• ハードテックのサプライチェーンに注目する投資家・政策関係者",
        },
      },
      {
        icon: "📍",
        label: LOGISTICS_LABEL,
        body: {
          zh: "• 全天举办，含演讲、面板与洽谈约六小时\n• 会场设于东京大型会议设施\n• 依企业资质审核的邀请制，不收取费用",
          en: "• A full-day event, about six hours of keynotes, panels and meetings\n• Venue at a large conference facility in Tokyo\n• Invite-only after company qualification review, no fee",
          ja: "• 終日開催、講演・パネル・商談で約6時間\n• 会場は東京の大型カンファレンス施設\n• 企業資格審査を経た招待制で、参加費は無料",
        },
      },
    ],
  },
  event_07: {
    title: {
      zh: "FinTech Tokyo Mixer",
      en: "FinTech Tokyo Mixer",
      ja: "FinTech Tokyo ミキサー",
    },
    summary: {
      zh: "面向东京金融科技从业者的轻松社交酒会，连接创业团队、金融机构与投资人，激发新的合作火花。",
      en: "A relaxed social mixer for Tokyo's fintech community, connecting startups, financial institutions and investors to spark new collaborations.",
      ja: "東京のFinTech関係者が集うカジュアルな交流ミキサー。スタートアップ、金融機関、投資家をつなぎ、新たな協業のきっかけを生みます。",
    },
    cover: "/orbit-covers/finance.jpg",
    theme: "finance",
    industry: "FinTech",
    tags: ["Finance", "FinTech"],
    about: [
      {
        icon: "🌏",
        label: OVERVIEW_LABEL,
        body: {
          zh: "东京的金融科技生态正在快速成型，但真正推动合作的往往是一次轻松的当面交流。本次 Mixer 抛开繁复议程，让创业者、金融机构与投资人在轻松氛围中相遇，找到下一个合作伙伴。",
          en: "Tokyo's fintech ecosystem is taking shape fast, but real collaboration often starts with one relaxed face-to-face conversation. This mixer drops the heavy agenda and lets founders, institutions and investors meet in an easy atmosphere and find their next partner.",
          ja: "東京のFinTechエコシステムは急速に形になりつつありますが、協業を動かすのはたいてい一度の気軽な対面です。本ミキサーでは重厚なアジェンダを外し、創業者・金融機関・投資家がリラックスした雰囲気で出会い、次のパートナーを見つけます。",
        },
      },
      {
        icon: "🗣",
        label: WHAT_LABEL,
        body: {
          zh: "• 简短开场，介绍到场团队与关注领域\n• 自由社交酒会，配以饮品与轻食\n• 主题角落分设支付、财富与合规等话题\n• 主办方引荐，帮助陌生的双方破冰",
          en: "• A brief opening introducing attending teams and focus areas\n• Free-flowing social mixer with drinks and light bites\n• Themed corners for payments, wealth and compliance topics\n• Host introductions to break the ice between strangers",
          ja: "• 参加チームと注目領域を紹介する短いオープニング\n• ドリンクと軽食を伴う自由な交流ミキサー\n• 決済、資産運用、コンプライアンスなどテーマ別コーナー\n• 主催者による紹介で初対面の橋渡し",
        },
      },
      {
        icon: "👥",
        label: WHO_LABEL,
        body: {
          zh: "• 金融科技创业者与产品、业务负责人\n• 银行、保险与证券机构的创新与合作团队\n• 关注金融科技赛道的投资人",
          en: "• Fintech founders and product or business leads\n• Innovation and partnership teams at banks, insurers and brokerages\n• Investors focused on the fintech space",
          ja: "• FinTech創業者およびプロダクト・事業責任者\n• 銀行・保険・証券のイノベーション/提携チーム\n• FinTech領域に注目する投資家",
        },
      },
      {
        icon: "📍",
        label: LOGISTICS_LABEL,
        body: {
          zh: "• 平日晚间举办，酒会形式约两小时\n• 会场设于东京都心的社交空间\n• 由合作方支持的邀请制，无需付费入场",
          en: "• Held on a weekday evening, about two hours in mixer format\n• Venue at a social space in central Tokyo\n• Invite-only with partner support, no fee for entry",
          ja: "• 平日夜間に開催、ミキサー形式で約2時間\n• 会場は都心のソーシャルスペース\n• パートナー支援の招待制で、入場料は不要",
        },
      },
    ],
  },
  event_08: {
    title: {
      zh: "AI Founders Night",
      en: "AI Founders Night",
      ja: "AI創業者ナイト",
    },
    summary: {
      zh: "专属 AI 创业者的夜晚聚会，在坦诚氛围中交流产品、增长与融资的真实挑战，彼此扶持前行。",
      en: "An evening gathering for AI founders to trade the real challenges of product, growth and fundraising in a candid, supportive atmosphere.",
      ja: "AI創業者だけの夜の集い。プロダクト、成長、資金調達の本音の課題を率直に語り合い、互いを支え合います。",
    },
    cover: "/orbit-covers/ai.jpg",
    theme: "ai",
    industry: "AI",
    tags: ["AI", "Startup"],
    about: [
      {
        icon: "🌏",
        label: OVERVIEW_LABEL,
        body: {
          zh: "创业本就孤独，AI 赛道又变化得格外快。这个夜晚只留给正在一线打拼的 AI 创业者，摘下路演的面具，坦诚聊聊真正难的那些事，也在同路人身上找到支持与灵感。",
          en: "Building a company is lonely, and the AI space moves especially fast. This night is reserved for founders in the trenches to take off the pitch mask, talk honestly about what is truly hard, and find support and inspiration among peers walking the same road.",
          ja: "起業はもともと孤独で、AI領域は変化が特に速いものです。この夜は最前線で戦う創業者だけのために。ピッチの仮面を外し、本当に難しいことを率直に語り、同じ道を歩む仲間から支えと刺激を得ます。",
        },
      },
      {
        icon: "🗣",
        label: WHAT_LABEL,
        body: {
          zh: "• 创业者轮流分享本月最大的一个难题\n• 小组深聊产品定位、增长与团队搭建\n• 有经验的创始人分享踩过的坑\n• 自由交流，结识可长期互助的同路人",
          en: "• Founders take turns sharing their single biggest challenge this month\n• Small-group deep talks on positioning, growth and team building\n• Experienced founders share the pitfalls they hit\n• Open networking to meet peers for long-term mutual support",
          ja: "• 創業者が今月最大の課題を順番に共有\n• ポジショニング、成長、チーム構築を語る少人数の深い対話\n• 経験ある創業者がはまった落とし穴を共有\n• 長期的に支え合える仲間と出会う自由交流",
        },
      },
      {
        icon: "👥",
        label: WHO_LABEL,
        body: {
          zh: "• 正在全职投入的 AI 产品创业者\n• 早期 AI 公司的联合创始人与核心成员\n• 曾创办 AI 公司、愿意分享经验的前辈",
          en: "• Founders working full time on AI products\n• Co-founders and core members of early AI companies\n• Veterans who have built AI companies and want to share",
          ja: "• AIプロダクトにフルタイムで取り組む創業者\n• アーリーAI企業の共同創業者・コアメンバー\n• AI企業を築き、経験を共有したい先輩起業家",
        },
      },
      {
        icon: "📍",
        label: LOGISTICS_LABEL,
        body: {
          zh: "• 平日晚间举办，含分享与交流约三小时\n• 会场设于东京一处轻松的私密空间\n• 仅限创业者的邀请制，不收取费用",
          en: "• Held on a weekday evening, about three hours of sharing and networking\n• Venue at a relaxed, private space in Tokyo\n• Founder-only invite basis, no fee",
          ja: "• 平日夜間に開催、共有と交流で約3時間\n• 会場は東京のリラックスしたプライベート空間\n• 創業者限定の招待制で、参加費は無料",
        },
      },
    ],
  },
  event_09: {
    title: {
      zh: "D2C 品牌出海沙龙",
      en: "D2C Brand Global Expansion Salon",
      ja: "D2Cブランド海外展開サロン",
    },
    summary: {
      zh: "面向 D2C 品牌的出海实战沙龙，聚焦如何把国内验证过的品牌力复制到海外市场并持续增长。",
      en: "A hands-on salon for D2C brands on expanding abroad, focused on replicating domestically proven brand strength into overseas markets and sustaining growth.",
      ja: "D2Cブランドの海外展開実践サロン。国内で検証したブランド力を海外市場に移植し、成長を持続させる方法に焦点を当てます。",
    },
    cover: "/orbit-covers/fashion.jpg",
    theme: "fashion",
    industry: "Consumer",
    tags: ["D2C", "Brand"],
    about: [
      {
        icon: "🌏",
        label: OVERVIEW_LABEL,
        body: {
          zh: "在本土跑通的 D2C 打法，换个市场未必奏效。本沙龙聚焦品牌出海的真实课题：文化落地、渠道选择、达人合作与复购运营，让已经在路上的品牌人彼此取经，少走弯路。",
          en: "A D2C playbook that works at home does not always transfer to a new market. This salon focuses on the real questions of going global: cultural fit, channel choice, creator partnerships and repeat-purchase operations, so brands already on the road can learn from each other.",
          ja: "国内で通用したD2Cの手法が、別の市場でも効くとは限りません。本サロンでは海外展開の実課題、すなわち文化適合、チャネル選定、クリエイター連携、再購入運用に焦点を当て、すでに挑戦中のブランドが互いに学び合います。",
        },
      },
      {
        icon: "🗣",
        label: WHAT_LABEL,
        body: {
          zh: "• 品牌分享进入首个海外市场的完整复盘\n• 讨论本地化与品牌调性之间的取舍\n• 达人营销与内容投放的实操经验交流\n• 小组配对，按品类与目标市场结识同行",
          en: "• Brands share a full review of entering their first overseas market\n• Discussion of trade-offs between localization and brand tone\n• Practical exchange on creator marketing and content spend\n• Small-group matching by category and target market",
          ja: "• ブランドが初の海外市場参入を包括的に振り返り共有\n• ローカライズとブランドトーンのトレードオフを議論\n• クリエイターマーケと広告出稿の実務経験を交換\n• 商品カテゴリーと対象市場ごとの少人数マッチング",
        },
      },
      {
        icon: "👥",
        label: WHO_LABEL,
        body: {
          zh: "• 正在出海或计划出海的 D2C 品牌创始人\n• 负责海外市场的品牌与增长负责人\n• 提供本地化、达人与履约支持的服务方",
          en: "• D2C brand founders expanding abroad or planning to\n• Brand and growth leads responsible for overseas markets\n• Providers of localization, creator and fulfilment support",
          ja: "• 海外展開中または計画中のD2Cブランド創業者\n• 海外市場を担うブランド・成長責任者\n• ローカライズ、クリエイター、物流支援を提供する事業者",
        },
      },
      {
        icon: "📍",
        label: LOGISTICS_LABEL,
        body: {
          zh: "• 平日午后举办，含分享与配对约三小时\n• 会场位于东京，交通便利\n• 由合作方支持的邀请制，参与免收费用",
          en: "• Held on a weekday afternoon, about three hours of talks and matching\n• Venue in Tokyo with convenient access\n• Invite-only with partner support, no fee to join",
          ja: "• 平日午後に開催、トークとマッチングで約3時間\n• 会場は東京、アクセス良好\n• パートナー支援の招待制で、参加費は無料",
        },
      },
    ],
  },
  event_10: {
    title: {
      zh: "东京时尚设计周 Mixer",
      en: "Tokyo Fashion Design Week Mixer",
      ja: "東京ファッションデザインウィーク Mixer",
    },
    summary: {
      zh: "东京时尚设计周期间的行业交流酒会，汇聚设计师、买手与品牌方，在创意氛围中促成合作。",
      en: "An industry mixer during Tokyo Fashion Design Week, bringing designers, buyers and brands together to spark collaborations in a creative atmosphere.",
      ja: "東京ファッションデザインウィーク期間中の業界交流会。デザイナー、バイヤー、ブランドが集い、創造的な雰囲気の中で協業を生みます。",
    },
    cover: "/orbit-covers/fashion.jpg",
    theme: "fashion",
    industry: "Fashion",
    tags: ["Fashion", "Design"],
    about: [
      {
        icon: "🌏",
        label: OVERVIEW_LABEL,
        body: {
          zh: "设计周是灵感碰撞的高峰，也是行业关系升温的最佳时机。这场 Mixer 把设计师、买手、品牌方与媒体聚到一处，在轻松的创意氛围里认识彼此,让秀场之外的合作自然发生。",
          en: "Fashion week is a peak of creative energy and the best moment for industry relationships to warm up. This mixer brings designers, buyers, brands and media into one room to meet in a relaxed creative atmosphere and let collaborations beyond the runway happen naturally.",
          ja: "ファッションウィークは創造的エネルギーの頂点であり、業界の関係が温まる絶好の機会です。本ミキサーはデザイナー、バイヤー、ブランド、メディアを一堂に集め、リラックスした創造的雰囲気の中でランウェイの外側の協業を自然に生み出します。",
        },
      },
      {
        icon: "🗣",
        label: WHAT_LABEL,
        body: {
          zh: "• 新锐设计师的迷你展示与作品介绍\n• 买手与品牌方交流本季选品方向\n• 自由社交酒会，配以饮品与音乐\n• 主办方牵线，撮合设计与商业的合作",
          en: "• Mini showcases and portfolio intros from emerging designers\n• Buyers and brands exchange this season's sourcing direction\n• Free-flowing social mixer with drinks and music\n• Host introductions matching design and commercial sides",
          ja: "• 新鋭デザイナーによるミニ展示とポートフォリオ紹介\n• バイヤーとブランドが今季の仕入れ方針を交換\n• ドリンクと音楽を伴う自由な交流ミキサー\n• 主催者がデザインとビジネスの協業を仲介",
        },
      },
      {
        icon: "👥",
        label: WHO_LABEL,
        body: {
          zh: "• 服装、配饰与设计领域的独立设计师与品牌\n• 精品店与零售渠道的买手\n• 时尚媒体、公关与合作伙伴",
          en: "• Independent designers and brands in apparel, accessories and design\n• Buyers from boutiques and retail channels\n• Fashion media, PR and partner organizations",
          ja: "• アパレル、アクセサリー、デザイン領域の独立系デザイナー・ブランド\n• セレクトショップや小売チャネルのバイヤー\n• ファッションメディア、PR、パートナー組織",
        },
      },
      {
        icon: "📍",
        label: LOGISTICS_LABEL,
        body: {
          zh: "• 设计周期间的晚间举办，酒会约两小时\n• 会场设于东京的创意空间\n• 由合作方支持的邀请制，无需入场费",
          en: "• Held on an evening during design week, about two hours in mixer format\n• Venue at a creative space in Tokyo\n• Invite-only with partner support, no entry fee",
          ja: "• デザインウィーク期間中の夜に開催、ミキサー形式で約2時間\n• 会場は東京のクリエイティブスペース\n• パートナー支援の招待制で、入場料は不要",
        },
      },
    ],
  },
  event_signup_01: {
    title: {
      zh: "关西跨境商务对接会",
      en: "Kansai Cross-Border Business Connect",
      ja: "関西越境ビジネス交流会",
    },
    summary: {
      zh: "立足关西的跨境商务对接会，帮助大阪、京都、神户的企业与海外伙伴建立贸易与投资联系。",
      en: "A Kansai-based cross-border business connect, helping companies in Osaka, Kyoto and Kobe build trade and investment ties with overseas partners.",
      ja: "関西を拠点とする越境ビジネス交流会。大阪・京都・神戸の企業が海外パートナーと貿易・投資のつながりを築きます。",
    },
    cover: "/orbit-covers/events/kansai-business-connect.jpg",
    theme: "ecommerce",
    industry: "Cross-border",
    tags: ["Cross-border", "Kansai"],
    about: [
      {
        icon: "🌏",
        label: OVERVIEW_LABEL,
        body: {
          zh: "跨境机会不只在东京。关西拥有深厚的制造、消费与文旅底蕴，却常被海外伙伴忽视。本次对接会立足大阪，把关西企业与寻求合作的海外团队直接连接起来，让本地实力被真正看见。",
          en: "Cross-border opportunity is not only in Tokyo. Kansai has deep strengths in manufacturing, consumer goods and tourism, yet is often overlooked by overseas partners. Based in Osaka, this connect links Kansai companies directly with overseas teams seeking collaboration, so local strength is truly seen.",
          ja: "越境の機会は東京だけにあるのではありません。関西は製造、消費財、観光に厚みを持ちながら、海外パートナーから見落とされがちです。大阪を拠点とする本交流会は、関西企業と協業を求める海外チームを直接つなぎ、地元の実力を正しく可視化します。",
        },
      },
      {
        icon: "🗣",
        label: WHAT_LABEL,
        body: {
          zh: "• 关西企业介绍产品实力与合作诉求\n• 海外团队分享正在寻找的采购与投资方向\n• 讨论跨境交易中的物流、支付与信任问题\n• 定向配对，撮合供需契合的双方",
          en: "• Kansai companies present their strengths and partnership needs\n• Overseas teams share the sourcing and investment they seek\n• Discussion of logistics, payment and trust in cross-border deals\n• Targeted matching between well-fit supply and demand",
          ja: "• 関西企業が製品力と連携ニーズを紹介\n• 海外チームが探している調達・投資の方向を共有\n• 越境取引の物流・決済・信頼の課題を議論\n• 需給が合う双方を狙って引き合わせ",
        },
      },
      {
        icon: "👥",
        label: WHO_LABEL,
        body: {
          zh: "• 关西地区寻求出海或引资的企业负责人\n• 面向日本市场采购或投资的海外团队\n• 提供贸易、物流与跨境支付的服务方",
          en: "• Kansai business leaders seeking overseas expansion or investment\n• Overseas teams sourcing from or investing in Japan\n• Providers of trade, logistics and cross-border payment services",
          ja: "• 海外展開や資金調達を目指す関西の企業責任者\n• 日本市場から調達・投資を行う海外チーム\n• 貿易、物流、越境決済を提供する事業者",
        },
      },
      {
        icon: "📍",
        label: LOGISTICS_LABEL,
        body: {
          zh: "• 平日午后举办,含介绍与配对约三小时\n• 会场设于大阪市中心，交通便利\n• 需报名审核的邀请制，参与不收取费用",
          en: "• Held on a weekday afternoon, about three hours of intros and matching\n• Venue in central Osaka with convenient access\n• Invite-only after signup review, no fee to attend",
          ja: "• 平日午後に開催、紹介とマッチングで約3時間\n• 会場は大阪市中心部、アクセス良好\n• 申込審査を経た招待制で、参加費は無料",
        },
      },
    ],
  },
  event_signup_02: {
    title: {
      zh: "东京 AI 落地伙伴对接会",
      en: "Tokyo AI Implementation Partner Meetup",
      ja: "東京AI実装パートナー交流会",
    },
    summary: {
      zh: "为需要 AI 落地的企业与能交付的技术伙伴牵线的对接会，把需求方与实施方直接放到一张桌上。",
      en: "A meetup pairing companies that need AI implementation with technical partners who can deliver, putting demand and delivery at the same table.",
      ja: "AI実装を必要とする企業と、実行できる技術パートナーをつなぐ交流会。ニーズ側と実装側を同じテーブルに置きます。",
    },
    cover: "/orbit-covers/events/tokyo-ai-partner-meetup.jpg",
    theme: "ai",
    industry: "AI",
    tags: ["AI", "Partners"],
    about: [
      {
        icon: "🌏",
        label: OVERVIEW_LABEL,
        body: {
          zh: "想用 AI 的企业很多，能真正交付的伙伴不好找。本次对接会专门解决这个错配：让有明确落地需求的企业，与具备工程与行业经验的实施伙伴直接对话，把想法推进到可执行的项目。",
          en: "Many companies want to use AI, but partners who can truly deliver are hard to find. This meetup exists to fix that mismatch: it lets companies with concrete implementation needs talk directly with partners who have the engineering and domain experience to turn ideas into executable projects.",
          ja: "AIを使いたい企業は多いものの、本当に実装できるパートナーは見つけにくいものです。本交流会はこのミスマッチの解消を目的とし、明確な実装ニーズを持つ企業と、工学・業界経験を備えたパートナーが直接対話し、アイデアを実行可能な案件へと進めます。",
        },
      },
      {
        icon: "🗣",
        label: WHAT_LABEL,
        body: {
          zh: "• 需求方简述业务场景与期望的 AI 成果\n• 技术伙伴介绍能力范围与过往交付案例\n• 讨论落地路径、周期与协作方式\n• 定向配对，锁定可立即启动的合作",
          en: "• Demand-side firms outline business scenarios and desired AI outcomes\n• Technical partners present their scope and past delivery cases\n• Discussion of implementation paths, timelines and ways of working\n• Targeted matching to lock in partnerships ready to start",
          ja: "• ニーズ側が業務シナリオと期待するAI成果を説明\n• 技術パートナーが対応範囲と過去の実装事例を紹介\n• 実装の道筋、期間、協業の進め方を議論\n• すぐ始められる連携を固める狙い撃ちマッチング",
        },
      },
      {
        icon: "👥",
        label: WHO_LABEL,
        body: {
          zh: "• 有明确 AI 落地需求的企业业务与技术负责人\n• 具备交付能力的 AI 开发商与集成商\n• 提供数据、云与咨询支持的合作方",
          en: "• Business and technical leads with concrete AI implementation needs\n• AI developers and integrators with real delivery capability\n• Partners offering data, cloud and advisory support",
          ja: "• 明確なAI実装ニーズを持つ事業・技術責任者\n• 実装力を備えたAI開発会社・インテグレーター\n• データ、クラウド、コンサル支援を提供するパートナー",
        },
      },
      {
        icon: "📍",
        label: LOGISTICS_LABEL,
        body: {
          zh: "• 平日午后举办，含介绍与配对约两个半小时\n• 会场设于东京，方便主要车站往返\n• 需报名审核的邀请制，参与免收费用",
          en: "• Held on a weekday afternoon, about two and a half hours of intros and matching\n• Venue in Tokyo, easy to reach from major stations\n• Invite-only after signup review, no fee to join",
          ja: "• 平日午後に開催、紹介とマッチングで約2時間半\n• 会場は東京、主要駅からアクセス良好\n• 申込審査を経た招待制で、参加費は無料",
        },
      },
    ],
  },
  event_signup_03: {
    title: {
      zh: "日中投资人与创业者沙龙",
      en: "Japan-China Investor & Founder Salon",
      ja: "日中投資家・創業者サロン",
    },
    summary: {
      zh: "连接日中两地投资人与创业者的沙龙，围绕跨境创业与资本合作，促成有深度的一对一交流。",
      en: "A salon connecting investors and founders across Japan and China, fostering deep one-on-one exchange around cross-border ventures and capital collaboration.",
      ja: "日中の投資家と創業者をつなぐサロン。越境起業と資本連携をテーマに、深い1対1の交流を促します。",
    },
    cover: "/orbit-covers/events/investor-founder-salon.jpg",
    theme: "venture",
    industry: "Venture",
    tags: ["Investors", "Salon"],
    about: [
      {
        icon: "🌏",
        label: OVERVIEW_LABEL,
        body: {
          zh: "日中之间的创业与资本流动潜力巨大，但真正的信任要靠面对面建立。本沙龙聚合两地的投资人与创业者，围绕跨境创业的机会与风险展开坦诚对话，也为后续的资本合作打下基础。",
          en: "The potential for ventures and capital to flow between Japan and China is large, but real trust is built face to face. This salon brings together investors and founders from both sides for candid conversation about the opportunities and risks of cross-border ventures, laying the ground for future capital collaboration.",
          ja: "日中間の起業と資本の流動には大きな潜在力がありますが、本当の信頼は対面で築かれます。本サロンは双方の投資家と創業者を集め、越境起業の機会とリスクについて率直に語り合い、今後の資本連携の土台を築きます。",
        },
      },
      {
        icon: "🗣",
        label: WHAT_LABEL,
        body: {
          zh: "• 投资人分享对日中跨境赛道的判断与偏好\n• 创业者介绍项目与跨境扩张计划\n• 讨论两地在监管、文化与市场上的差异\n• 一对一交流,推进具体的合作意向",
          en: "• Investors share their read on and preferences for cross-border sectors\n• Founders present their ventures and cross-border expansion plans\n• Discussion of regulatory, cultural and market differences between the two\n• One-on-one exchange to advance concrete collaboration intent",
          ja: "• 投資家が日中越境領域への見解と選好を共有\n• 創業者が事業と越境拡大計画を紹介\n• 両国の規制・文化・市場の違いを議論\n• 具体的な連携意向を進める1対1の交流",
        },
      },
      {
        icon: "👥",
        label: WHO_LABEL,
        body: {
          zh: "• 关注日中跨境机会的投资人与基金\n• 计划跨境扩张的创业者与企业负责人\n• 支持跨境交易的顾问与生态伙伴",
          en: "• Investors and funds focused on Japan-China cross-border opportunities\n• Founders and business leads planning cross-border expansion\n• Advisors and ecosystem partners supporting cross-border deals",
          ja: "• 日中越境の機会に注目する投資家・ファンド\n• 越境拡大を計画する創業者・企業責任者\n• 越境取引を支えるアドバイザー・エコシステム関係者",
        },
      },
      {
        icon: "📍",
        label: LOGISTICS_LABEL,
        body: {
          zh: "• 平日晚间举办，含分享与一对一交流约三小时\n• 会场设于东京商务核心区\n• 需资料审核的邀请制，双方均免收费用",
          en: "• Held on a weekday evening, about three hours of talks and one-on-one exchange\n• Venue in Tokyo's core business district\n• Invite-only after profile review, no fee for either side",
          ja: "• 平日夜間に開催、トークと1対1交流で約3時間\n• 会場は東京のビジネス中枢エリア\n• プロフィール審査を経た招待制で、双方とも参加費は無料",
        },
      },
    ],
  },
};
