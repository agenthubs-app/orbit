// Live event ("party") content for the Orbit app.
// Self-contained: no imports. Trilingual (en / ja / zh) networking copy.

export interface PartyLocalizedText {
  en: string;
  ja: string;
  zh: string;
}

export interface PartyPersonContent {
  name: string;
  initial: string;
  company: string;
  g: string;
  groupNumber: number;
  seat: string;
  score: number;
  industry: PartyLocalizedText;
  title: PartyLocalizedText;
  offering: PartyLocalizedText;
  seeking: PartyLocalizedText;
  reason: PartyLocalizedText;
  summary: PartyLocalizedText;
  icebreakers: PartyLocalizedText[];
  topics: PartyLocalizedText[];
}

export interface PartyMeContent {
  name: string;
  initial: string;
  groupNumber: number;
  seat: string;
  role: PartyLocalizedText;
  offering: PartyLocalizedText[];
  seeking: PartyLocalizedText[];
  topics: PartyLocalizedText[];
  prompts: PartyLocalizedText[];
}

export interface PartyAgendaItemContent {
  time: string;
  label: PartyLocalizedText;
  description: PartyLocalizedText;
}

export interface PartyContent {
  accessCode: string;
  eventName: PartyLocalizedText;
  eventVenue: PartyLocalizedText;
  me: PartyMeContent;
  recommendations: PartyPersonContent[];
  tableMates: number[];
  agenda: PartyAgendaItemContent[];
  icebreakers: PartyLocalizedText[];
}

export const PARTY_CONTENT: PartyContent = {
  accessCode: "TBC-A8-4821",
  eventName: {
    en: "Tokyo Cross-Border Founders Night",
    ja: "東京クロスボーダー・ファウンダーズ・ナイト",
    zh: "东京跨境创始人之夜",
  },
  eventVenue: {
    en: "SHIBUYA QWS, 15F, Shibuya Scramble Square",
    ja: "SHIBUYA QWS 15階（渋谷スクランブルスクエア）",
    zh: "SHIBUYA QWS 15楼（涩谷 Scramble Square）",
  },
  me: {
    name: "Liang Wei",
    initial: "L",
    groupNumber: 3,
    seat: "C1",
    role: {
      en: "Co-founder & CTO, Meridian Commerce",
      ja: "共同創業者兼CTO、Meridian Commerce",
      zh: "联合创始人兼 CTO，Meridian Commerce",
    },
    offering: [
      {
        en: "Cross-border retail tech",
        ja: "越境リテールテック",
        zh: "跨境零售技术",
      },
      {
        en: "China supply chain access",
        ja: "中国サプライチェーン",
        zh: "中国供应链资源",
      },
      {
        en: "Engineering team scaling",
        ja: "開発組織の拡大",
        zh: "工程团队扩张经验",
      },
    ],
    seeking: [
      {
        en: "Japan market entry advice",
        ja: "日本市場参入の助言",
        zh: "日本市场进入建议",
      },
      {
        en: "Local payment partners",
        ja: "国内決済パートナー",
        zh: "本地支付合作方",
      },
      {
        en: "Seed to Series A investors",
        ja: "シードからシリーズAの投資家",
        zh: "种子到 A 轮投资人",
      },
    ],
    topics: [
      {
        en: "China-to-Japan expansion",
        ja: "中国から日本への展開",
        zh: "从中国到日本的扩张",
      },
      {
        en: "Commerce infrastructure",
        ja: "コマース基盤",
        zh: "电商基础设施",
      },
      {
        en: "Founder operations",
        ja: "創業者のオペレーション",
        zh: "创始人运营",
      },
    ],
    prompts: [
      {
        en: "I'm bringing a China commerce platform into Japan this year. Which local partner surprised you most?",
        ja: "今年、中国発のコマースプラットフォームを日本に展開します。最も意外だった現地パートナーはどこでしたか？",
        zh: "我今年要把一个中国电商平台带入日本，你合作过最让你意外的本地伙伴是哪家？",
      },
      {
        en: "What's the one localization mistake you'd tell a first-time founder in Japan to avoid?",
        ja: "日本で初挑戦する創業者に、絶対に避けるべきローカライズの失敗を一つ挙げるとしたら？",
        zh: "如果只给一个建议，你会提醒首次进入日本的创始人避开哪个本地化坑？",
      },
    ],
  },
  recommendations: [
    {
      name: "Aiko Tanaka",
      initial: "A",
      company: "Kitamura Growth Capital",
      g: "g-indigo",
      groupNumber: 3,
      seat: "C2",
      score: 92,
      industry: {
        en: "Venture Capital",
        ja: "ベンチャーキャピタル",
        zh: "风险投资",
      },
      title: {
        en: "Principal, Cross-Border Investments",
        ja: "プリンシパル（越境投資担当）",
        zh: "跨境投资主管",
      },
      offering: {
        en: "Early-stage capital and a network of Japanese retail operators.",
        ja: "アーリーステージの資金と日本のリテール事業者ネットワークを提供できます。",
        zh: "提供早期资金以及日本零售运营方的人脉网络。",
      },
      seeking: {
        en: "Founders proven in China who are serious about entering Japan.",
        ja: "中国で実績があり、本気で日本参入を目指す創業者を探しています。",
        zh: "寻找在中国已被验证、认真布局日本市场的创始人。",
      },
      reason: {
        en: "She backs China-to-Japan expansion teams and just closed two commerce deals in your stage range.",
        ja: "彼女は中国から日本へ展開するチームに投資しており、あなたと同じステージのコマース案件を最近2件まとめています。",
        zh: "她专注投资从中国进军日本的团队，最近刚敲定两笔与你同阶段的电商项目。",
      },
      summary: {
        en: "Cross-border investor focused on commerce and consumer.",
        ja: "コマースと消費財に注力する越境投資家。",
        zh: "专注电商与消费领域的跨境投资人。",
      },
      icebreakers: [
        {
          en: "What signals tell you a China founder will actually adapt to Japan?",
          ja: "中国の創業者が本当に日本に順応できると判断するサインは何ですか？",
          zh: "什么信号能让你判断一位中国创始人真的能适应日本？",
        },
        {
          en: "Which of your portfolio companies had the smoothest Japan launch, and why?",
          ja: "ポートフォリオの中で、日本ローンチが最もスムーズだったのはどの会社で、その理由は？",
          zh: "你投的公司里哪家在日本上线最顺利，原因是什么？",
        },
      ],
      topics: [
        {
          en: "Market entry",
          ja: "市場参入",
          zh: "市场进入",
        },
        {
          en: "Commerce",
          ja: "コマース",
          zh: "电商",
        },
        {
          en: "Fundraising",
          ja: "資金調達",
          zh: "融资",
        },
      ],
    },
    {
      name: "Sota Kimura",
      initial: "S",
      company: "Nadeshiko Living",
      g: "g-rose",
      groupNumber: 3,
      seat: "C3",
      score: 87,
      industry: {
        en: "D2C / Consumer",
        ja: "D2C・消費財",
        zh: "D2C / 消费品",
      },
      title: {
        en: "Founder & CEO",
        ja: "創業者兼CEO",
        zh: "创始人兼 CEO",
      },
      offering: {
        en: "Playbook for building a D2C brand and community in Japan.",
        ja: "日本でD2Cブランドとコミュニティを築いた実践知を共有できます。",
        zh: "分享在日本打造 D2C 品牌与社群的实战经验。",
      },
      seeking: {
        en: "Reliable manufacturing and logistics partners in China.",
        ja: "中国での信頼できる製造・物流パートナー。",
        zh: "在中国可靠的制造与物流合作方。",
      },
      reason: {
        en: "He knows Japanese consumer taste inside out, and you can open his China supply chain.",
        ja: "彼は日本の消費者嗜好を熟知しており、あなたは彼の中国サプライチェーンを開拓できます。",
        zh: "他对日本消费者口味了如指掌，而你正好能帮他打通中国供应链。",
      },
      summary: {
        en: "D2C founder who scaled a home-goods brand to profitability.",
        ja: "ホーム雑貨ブランドを黒字化まで育てたD2C創業者。",
        zh: "把家居品牌做到盈利的 D2C 创始人。",
      },
      icebreakers: [
        {
          en: "How did you find your first loyal customers in Japan?",
          ja: "日本で最初の熱心な顧客はどう見つけましたか？",
          zh: "你在日本是怎么找到第一批忠实客户的？",
        },
        {
          en: "Where do most overseas brands get Japanese packaging wrong?",
          ja: "海外ブランドが日本向けパッケージで最もつまずく点はどこですか？",
          zh: "海外品牌在日本包装上最常犯的错误是什么？",
        },
      ],
      topics: [
        {
          en: "Brand building",
          ja: "ブランド構築",
          zh: "品牌打造",
        },
        {
          en: "Supply chain",
          ja: "サプライチェーン",
          zh: "供应链",
        },
        {
          en: "Consumer taste",
          ja: "消費者嗜好",
          zh: "消费者偏好",
        },
      ],
    },
    {
      name: "Mei Chen",
      initial: "M",
      company: "Kakehashi Pay",
      g: "g-emerald",
      groupNumber: 3,
      seat: "C4",
      score: 90,
      industry: {
        en: "FinTech",
        ja: "フィンテック",
        zh: "金融科技",
      },
      title: {
        en: "Head of Business Development",
        ja: "事業開発責任者",
        zh: "商务拓展负责人",
      },
      offering: {
        en: "Direct integration with Japanese and China payment rails.",
        ja: "日本と中国の決済ネットワークへの直接連携を提供します。",
        zh: "提供与日本和中国支付网络的直接对接。",
      },
      seeking: {
        en: "Merchants processing cross-border transactions at scale.",
        ja: "越境取引を大規模に処理する加盟店。",
        zh: "有规模化跨境交易需求的商户。",
      },
      reason: {
        en: "You both work on cross-border payments, and her rails could cut your Japan settlement time in half.",
        ja: "二人とも越境決済に取り組んでおり、彼女の決済網はあなたの日本での入金時間を半分にできる可能性があります。",
        zh: "你们都在做跨境支付，她的支付通道有望把你在日本的结算时间缩短一半。",
      },
      summary: {
        en: "FinTech BD lead bridging China and Japan payment flows.",
        ja: "中国と日本の決済フローをつなぐフィンテックBDリード。",
        zh: "连接中日支付流的金融科技商务负责人。",
      },
      icebreakers: [
        {
          en: "What's the biggest friction merchants hit settling between China and Japan?",
          ja: "中国と日本の間で決済する際、加盟店が最も苦労する点は何ですか？",
          zh: "商户在中日之间结算时，最大的摩擦点是什么？",
        },
        {
          en: "How are you thinking about compliance as volumes grow?",
          ja: "取引量が増える中で、コンプライアンスをどう考えていますか？",
          zh: "随着交易量增长，你们怎么考虑合规问题？",
        },
      ],
      topics: [
        {
          en: "Cross-border payments",
          ja: "越境決済",
          zh: "跨境支付",
        },
        {
          en: "Settlement",
          ja: "決済・入金",
          zh: "结算",
        },
        {
          en: "Compliance",
          ja: "コンプライアンス",
          zh: "合规",
        },
      ],
    },
    {
      name: "Kenji Yamada",
      initial: "K",
      company: "Rin Product Labs",
      g: "g-violet",
      groupNumber: 5,
      seat: "B2",
      score: 84,
      industry: {
        en: "AI / SaaS",
        ja: "AI・SaaS",
        zh: "AI / SaaS",
      },
      title: {
        en: "Head of Product, AI",
        ja: "プロダクト責任者（AI担当）",
        zh: "AI 产品负责人",
      },
      offering: {
        en: "Hands-on advice on shipping AI features users actually keep using.",
        ja: "ユーザーが使い続けるAI機能をリリースするための実践的な助言。",
        zh: "关于打造用户真正会持续使用的 AI 功能的实操建议。",
      },
      seeking: {
        en: "Real commerce datasets and design partners for a new recommendation engine.",
        ja: "新しいレコメンドエンジン向けの実データとデザインパートナー。",
        zh: "为新推荐引擎寻找真实电商数据与共创伙伴。",
      },
      reason: {
        en: "Your commerce platform is exactly the design partner his AI recommendation engine needs.",
        ja: "あなたのコマースプラットフォームは、彼のAIレコメンドエンジンが求めるデザインパートナーそのものです。",
        zh: "你的电商平台正是他 AI 推荐引擎所需要的共创伙伴。",
      },
      summary: {
        en: "AI product lead turning models into daily-use features.",
        ja: "モデルを日常的な機能に変えるAIプロダクトリード。",
        zh: "把模型变成日常功能的 AI 产品负责人。",
      },
      icebreakers: [
        {
          en: "How do you decide which AI features are worth the maintenance cost?",
          ja: "どのAI機能が維持コストに見合うかをどう判断していますか？",
          zh: "你怎么判断哪些 AI 功能值得付出维护成本？",
        },
        {
          en: "What metric tells you a recommendation model is genuinely helping users?",
          ja: "レコメンドモデルが本当にユーザーの役に立っていると分かる指標は何ですか？",
          zh: "哪个指标能告诉你推荐模型真的在帮助用户？",
        },
      ],
      topics: [
        {
          en: "AI product",
          ja: "AIプロダクト",
          zh: "AI 产品",
        },
        {
          en: "Recommendations",
          ja: "レコメンド",
          zh: "推荐系统",
        },
        {
          en: "Retention",
          ja: "リテンション",
          zh: "留存",
        },
      ],
    },
    {
      name: "Hiroshi Sato",
      initial: "H",
      company: "Seiwa Precision",
      g: "g-amber",
      groupNumber: 2,
      seat: "A2",
      score: 79,
      industry: {
        en: "Manufacturing / Semiconductor",
        ja: "製造・半導体",
        zh: "制造 / 半导体",
      },
      title: {
        en: "Executive Vice President, Operations",
        ja: "執行副社長（生産管掌）",
        zh: "运营执行副总裁",
      },
      offering: {
        en: "Precision manufacturing capacity and hardware sourcing in Japan.",
        ja: "日本での精密製造キャパシティとハードウェア調達を提供します。",
        zh: "提供在日本的精密制造产能与硬件采购渠道。",
      },
      seeking: {
        en: "Software partners to modernize a legacy factory floor.",
        ja: "老朽化した工場現場を刷新するソフトウェアパートナー。",
        zh: "帮助老旧工厂现代化的软件合作方。",
      },
      reason: {
        en: "Your engineering team could digitize his factory, and his sourcing network can lower your hardware costs.",
        ja: "あなたの開発チームは彼の工場をデジタル化でき、彼の調達網はあなたのハードウェアコストを下げられます。",
        zh: "你的工程团队能帮他把工厂数字化，他的采购网络也能帮你降低硬件成本。",
      },
      summary: {
        en: "Manufacturing exec modernizing a precision-parts business.",
        ja: "精密部品事業を近代化する製造業の経営幹部。",
        zh: "推动精密零件业务现代化的制造业高管。",
      },
      icebreakers: [
        {
          en: "What's stopped your factory from adopting software faster?",
          ja: "工場でソフトウェア導入が進まない一番の要因は何ですか？",
          zh: "是什么让你们工厂采用软件的速度慢下来的？",
        },
        {
          en: "How has semiconductor demand reshaped your planning this year?",
          ja: "半導体需要は今年の計画をどう変えましたか？",
          zh: "半导体需求今年如何改变了你们的规划？",
        },
      ],
      topics: [
        {
          en: "Manufacturing",
          ja: "製造",
          zh: "制造",
        },
        {
          en: "Hardware sourcing",
          ja: "ハードウェア調達",
          zh: "硬件采购",
        },
        {
          en: "Factory software",
          ja: "工場ソフトウェア",
          zh: "工厂软件",
        },
      ],
    },
    {
      name: "Yuna Park",
      initial: "Y",
      company: "Bridge Tokyo Collective",
      g: "g-sky",
      groupNumber: 6,
      seat: "B1",
      score: 82,
      industry: {
        en: "Community / Ecosystem",
        ja: "コミュニティ・エコシステム",
        zh: "社群 / 生态",
      },
      title: {
        en: "Founder & Community Lead",
        ja: "創業者兼コミュニティリード",
        zh: "创始人兼社群负责人",
      },
      offering: {
        en: "Warm introductions across Tokyo's cross-border startup scene.",
        ja: "東京の越境スタートアップ界隈への信頼できる紹介を提供します。",
        zh: "为你在东京跨境创业圈牵线搭桥。",
      },
      seeking: {
        en: "Founders willing to mentor and speak at community events.",
        ja: "コミュニティイベントで登壇やメンタリングをしてくれる創業者。",
        zh: "愿意在社群活动中分享与做导师的创始人。",
      },
      reason: {
        en: "She connects newcomers to the right people fast, which shortcuts your first months in Tokyo.",
        ja: "彼女は新参者を適切な相手へ素早くつなぎ、東京での最初の数か月を短縮してくれます。",
        zh: "她能迅速把新来者引荐给对的人，帮你省下在东京头几个月的摸索。",
      },
      summary: {
        en: "Community connector at the center of Tokyo's founder network.",
        ja: "東京の創業者ネットワークの中心にいるコミュニティの結節点。",
        zh: "身处东京创始人网络中心的社群连接者。",
      },
      icebreakers: [
        {
          en: "Who are the three people every China founder in Tokyo should meet?",
          ja: "東京にいる中国の創業者が必ず会うべき3人は誰ですか？",
          zh: "在东京的中国创始人一定要认识的三个人是谁？",
        },
        {
          en: "What kind of events actually lead to real partnerships?",
          ja: "本当のパートナーシップにつながるのはどんなイベントですか？",
          zh: "什么样的活动才真正促成了实质合作？",
        },
      ],
      topics: [
        {
          en: "Introductions",
          ja: "紹介",
          zh: "引荐",
        },
        {
          en: "Community",
          ja: "コミュニティ",
          zh: "社群",
        },
        {
          en: "Ecosystem",
          ja: "エコシステム",
          zh: "生态圈",
        },
      ],
    },
  ],
  tableMates: [0, 1, 2],
  agenda: [
    {
      time: "18:30",
      label: {
        en: "Check-in & Welcome Drinks",
        ja: "受付＆ウェルカムドリンク",
        zh: "签到与欢迎酒会",
      },
      description: {
        en: "Pick up your name card, find your table number, and settle in with a drink.",
        ja: "ネームカードを受け取り、テーブル番号を確認して、ドリンク片手にお寛ぎください。",
        zh: "领取名牌，找到你的桌号，端杯饮品先热身。",
      },
    },
    {
      time: "19:00",
      label: {
        en: "Opening & Host Remarks",
        ja: "オープニング＆主催者挨拶",
        zh: "开场与主办致辞",
      },
      description: {
        en: "A short welcome, the theme of the night, and how the matching rounds will work.",
        ja: "短い歓迎の挨拶、今夜のテーマ、そしてマッチングの進め方をご説明します。",
        zh: "简短欢迎、今晚主题，以及配对环节的玩法说明。",
      },
    },
    {
      time: "19:20",
      label: {
        en: "Structured Matching Rounds",
        ja: "テーマ別マッチングラウンド",
        zh: "主题配对环节",
      },
      description: {
        en: "Three timed rounds at your table with the people Orbit recommended for you.",
        ja: "Orbitが推薦した相手と、テーブルで3回の時間制ラウンドを行います。",
        zh: "在你的桌位与 Orbit 为你推荐的人进行三轮限时交流。",
      },
    },
    {
      time: "20:10",
      label: {
        en: "Open Networking",
        ja: "フリーネットワーキング",
        zh: "自由交流",
      },
      description: {
        en: "Roam freely, follow up on the best conversations, and exchange contacts.",
        ja: "自由に歩き回り、印象に残った相手と話を深め、連絡先を交換しましょう。",
        zh: "自由走动，跟进最投缘的对话并互换联系方式。",
      },
    },
  ],
  icebreakers: [
    {
      en: "What brought each of you to a cross-border event in Tokyo tonight?",
      ja: "今夜、東京の越境イベントに来た理由をそれぞれ教えてください。",
      zh: "今晚是什么让在座各位来参加东京的跨境活动？",
    },
    {
      en: "What's one thing about doing business in Japan that surprised you?",
      ja: "日本でビジネスをして意外だったことを一つ挙げるとしたら？",
      zh: "在日本做生意，有哪件事让你觉得意外？",
    },
    {
      en: "If you could solve one problem with someone at this table, what would it be?",
      ja: "このテーブルの誰かと一つ課題を解決できるとしたら、何を選びますか？",
      zh: "如果能和这桌的某个人合力解决一个问题，你会选哪个？",
    },
  ],
};
