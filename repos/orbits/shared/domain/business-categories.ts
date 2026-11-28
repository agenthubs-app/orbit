/**
 * Business categories (2026-11-28): the third level under SECONDARY_INDUSTRY_CATALOG — what a company actually does,
 * and who it usually sells to. Used by event matching (who is a buyer / supplier / channel for whom) and, next, by
 * the profile ("公司做什么" / "客户在哪些行业"). Search is by label in any language or by keyword (see
 * searchBusinessCategories); inference from free text uses the same keywords.
 *
 * customers: who a company in this category usually sells to —
 *   a secondary industry id ("real_estate_construction.property_development"), a top-level industry id
 *   ("retail_consumer" = any of its secondaries), "consumer" (individuals), or "*" (any business; a weak signal).
 */

export interface BusinessCategory {
  id: string;
  /** SECONDARY_INDUSTRY_CATALOG id. */
  parent: string;
  labels: { zh: string; ja: string; en: string };
  /** Lower-case search / inference keywords in zh / ja / en (labels are searched too). */
  keywords: readonly string[];
  customers: readonly string[];
}

type Row = readonly [id: string, parent: string, zh: string, ja: string, en: string, keywords: string, customers: string];

const B = "*";
const C = "consumer";
const RE_DEV = "real_estate_construction.property_development";
const RE_BUILD = "real_estate_construction.construction";
const RE_DESIGN = "real_estate_construction.architecture_design";
const RE_OPS = "real_estate_construction.property_operations";
const RETAIL = "retail_consumer.physical_retail|retail_consumer.ecommerce";
const RESTAURANTS = "food_hospitality.restaurants";
const HOTELS = "food_hospitality.hotels_tourism";
const MFG = "manufacturing_supply_chain";
const TRADE = "trade_logistics";
const STARTUPS = "startup";

const ROWS: readonly Row[] = [
  // 餐饮与食品
  ["restaurant_chain", "food_hospitality.restaurants", "连锁餐饮", "飲食チェーン", "Restaurant chains", "连锁餐厅|餐饮连锁|飲食チェーン|restaurant chain|外食", C],
  ["restaurant_single", "food_hospitality.restaurants", "餐厅、居酒屋", "飲食店・居酒屋", "Restaurants & izakaya", "餐厅|饭店|居酒屋|レストラン|飲食店|中华料理|中華料理|ラーメン|拉面|火锅|restaurant", C],
  ["catering", "food_hospitality.restaurants", "团餐与外卖", "ケータリング・デリバリー", "Catering & delivery", "团餐|外卖|ケータリング|デリバリー|catering|delivery", `${C}|${B}`],
  ["cafe_tea", "food_hospitality.cafes_beverages", "咖啡与茶饮店", "カフェ・ティースタンド", "Cafés & tea shops", "咖啡|奶茶|茶饮|カフェ|タピオカ|coffee|cafe|bubble tea", C],
  ["beverage_brand", "food_hospitality.cafes_beverages", "饮料与酒类品牌", "飲料・酒類ブランド", "Beverage & alcohol brands", "饮料|酒类|白酒|日本酒|清酒|ワイン|酒造|beverage|sake|wine|liquor", `${RETAIL}|${RESTAURANTS}|${TRADE}`],
  ["food_manufacturing", "food_hospitality.food_production", "食品加工制造", "食品製造・加工", "Food manufacturing", "食品加工|食品制造|食品工場|食品メーカー|food manufactur|冷冻食品|冷凍食品|调味料|調味料", `${RETAIL}|${RESTAURANTS}|food_hospitality.food_distribution`],
  ["agriculture", "food_hospitality.food_production", "农业与生鲜", "農業・生鮮", "Agriculture & fresh produce", "农业|农产品|生鲜|農業|農産物|水産|水产|agri|farm", `food_hospitality.food_distribution|${RETAIL}|${RESTAURANTS}`],
  ["food_import", "food_hospitality.food_distribution", "食品进口与批发", "食品輸入・卸", "Food import & wholesale", "食品进口|食品批发|食品輸入|食品卸|food import|food wholesale", `${RETAIL}|${RESTAURANTS}`],
  ["food_ec", "food_hospitality.food_distribution", "食品电商与零售", "食品EC・小売", "Food e-commerce & retail", "食品电商|生鲜电商|食品ec|ネットスーパー|grocery", C],
  ["hotel", "food_hospitality.hotels_tourism", "酒店与民宿", "ホテル・民泊", "Hotels & vacation rentals", "酒店|民宿|民泊|旅館|ホテル|hotel|ryokan|airbnb", C],
  ["travel_agency", "food_hospitality.hotels_tourism", "旅行社与入境游", "旅行会社・インバウンド", "Travel agencies & inbound tourism", "旅行社|旅游|入境游|インバウンド|旅行会社|ツアー|travel|tour|inbound", `${C}|${B}`],
  ["mice", "food_hospitality.hotels_tourism", "商务旅行与会展接待", "MICE・視察旅行", "Business travel & MICE", "商务考察|会展接待|視察|mice|研修旅行", B],

  // 科技与互联网
  ["saas_business", "technology_internet.enterprise_software", "企业 SaaS 与业务软件", "業務SaaS・業務システム", "Business SaaS", "saas|业务系统|業務システム|erp|crm|企业软件|クラウドサービス", B],
  ["rpa_automation", "technology_internet.enterprise_software", "业务自动化与 RPA", "業務自動化・RPA", "Business automation & RPA", "rpa|业务自动化|業務自動化|自动化导入|ワークフロー|automation", B],
  ["dx_consulting", "technology_internet.enterprise_software", "数字化转型支持", "DX推進支援", "Digital transformation services", "dx|数字化转型|デジタル化|デジタルトランスフォーメーション|digital transformation", B],
  ["system_integration", "technology_internet.enterprise_software", "系统开发与外包", "受託開発・SIer", "Software development & outsourcing", "系统开发|软件开发|外包开发|受託開発|システム開発|sier|オフショア|outsourc|software develop", B],
  ["ai_application", "technology_internet.ai_data", "AI 应用与生成式 AI", "AI活用・生成AI", "AI applications & generative AI", "生成ai|生成式ai|ai应用|ai活用|llm|大模型|chatgpt|ai助手|ai人脉|aiエージェント|ai agent|generative ai", `${B}|${C}`],
  ["ai_solutions", "technology_internet.ai_data", "企业 AI 导入", "企業向けAI導入", "Enterprise AI solutions", "ai导入|ai导入支持|ai導入|ai解决方案|ai solution|機械学習|机器学习|machine learning", B],
  ["data_analytics", "technology_internet.ai_data", "数据分析与 BI", "データ分析・BI", "Data analytics & BI", "数据分析|データ分析|bi|データ活用|analytics", B],
  ["cloud_infra", "technology_internet.cloud_infrastructure", "云服务与 IT 基础设施", "クラウド・ITインフラ", "Cloud & IT infrastructure", "云服务|云计算|クラウド|aws|azure|インフラ|服务器|cloud", B],
  ["telecom", "technology_internet.cloud_infrastructure", "通信与网络", "通信・ネットワーク", "Telecom & networks", "通信|网络设备|5g|sim|telecom", `${B}|${C}`],
  ["security", "technology_internet.cybersecurity", "网络安全", "サイバーセキュリティ", "Cybersecurity", "网络安全|信息安全|セキュリティ|security", B],
  ["consumer_app", "technology_internet.internet_platforms", "消费者 App 与社交", "コンシューマーアプリ・SNS", "Consumer apps & social", "app|アプリ|社交|sns|マッチング|social app", C],
  ["marketplace", "technology_internet.internet_platforms", "平台与撮合", "プラットフォーム・マッチング", "Platforms & marketplaces", "平台|撮合|プラットフォーム|marketplace|matching platform", `${B}|${C}`],
  ["networking_tool", "technology_internet.internet_platforms", "人脉与活动工具", "人脈・イベントツール", "Networking & event tools", "人脉助手|人脉|名片|人脈|イベントツール|networking|event tool", `${B}|${C}|community_nonprofit`],
  ["web_dev", "technology_internet.internet_platforms", "网站与小程序开发", "Web・アプリ制作", "Websites & mini-app development", "网站|小程序|web制作|ホームページ|アプリ開発|website|mini program", B],
  ["hardware_iot", "technology_internet.other", "智能硬件与 IoT", "IoT・スマートデバイス", "Smart hardware & IoT", "iot|智能硬件|スマートデバイス|ガジェット|wearable", `${B}|${C}`],
  ["web3", "technology_internet.other", "区块链与 Web3", "ブロックチェーン・Web3", "Blockchain & Web3", "区块链|web3|ブロックチェーン|nft|crypto|暗号資産", `${B}|${C}`],

  // 金融与投资
  ["angel_investing", "finance_investment.venture_capital", "天使投资", "エンジェル投資", "Angel investing", "天使投资|エンジェル投資|angel invest|个人投资", STARTUPS],
  ["vc_fund", "finance_investment.venture_capital", "风险投资基金", "ベンチャーキャピタル", "Venture capital", "vc|风投|风险投资|ベンチャーキャピタル|venture capital|基金", STARTUPS],
  ["cvc", "finance_investment.venture_capital", "企业投资（CVC）", "事業会社投資（CVC）", "Corporate venture capital", "cvc|企业投资部|事業投資|corporate venture", STARTUPS],
  ["pe_buyout", "finance_investment.private_equity", "私募与并购投资", "PE・M&A投資", "Private equity & buyouts", "pe|私募股权|并购基金|買収|バイアウト|buyout", B],
  ["ma_advisory", "finance_investment.private_equity", "并购与事业承继顾问", "M&A仲介・事業承継", "M&A & succession advisory", "m&a|并购|买卖公司|公司买卖|事業承継|事業売却|会社売買|企业并购", B],
  ["fundraising_advisory", "finance_investment.venture_capital", "融资顾问（FA）", "資金調達アドバイザリー", "Fundraising advisory", "融资顾问|fa|資金調達支援|資金調達アドバイス|融资对接|fundraising", STARTUPS],
  ["bank_lending", "finance_investment.banking", "银行与贷款", "銀行・融資", "Banking & lending", "银行|贷款|銀行|融資|bank|loan", `${B}|${C}`],
  ["asset_management", "finance_investment.asset_management", "资产管理与理财", "資産運用", "Asset & wealth management", "资产管理|理财|資産運用|ウェルスマネジメント|wealth|asset management|证券", C],
  ["real_estate_investment", "finance_investment.asset_management", "不动产投资", "不動産投資", "Real estate investment", "不动产投资|房产投资|不動産投資|收益物件|real estate invest", C],
  ["insurance", "finance_investment.insurance", "保险", "保険", "Insurance", "保险|保険|insurance", `${C}|${B}`],
  ["payments", "finance_investment.fintech", "支付与金融科技", "決済・フィンテック", "Payments & fintech", "支付|决済|決済|フィンテック|fintech|payment", `${B}|${C}`],

  // 专业服务
  ["management_consulting", "professional_services.management_consulting", "管理咨询", "経営コンサルティング", "Management consulting", "管理咨询|经营咨询|咨询公司|咨询顾问|経営コンサル|コンサルティング|コンサルタント|consulting firm|management consult|経営支援", B],
  ["overseas_entry_consulting", "professional_services.management_consulting", "出海与日本进入咨询", "海外進出・日本進出支援", "Market-entry consulting", "日本落地|进入日本|日本进出|日本市场落地|日本市场的落地|海外品牌|出海|海外進出|日本進出|中国進出|market entry", `${B}|${STARTUPS}`],
  ["subsidy_consulting", "professional_services.management_consulting", "补助金与政策申请", "補助金申請支援", "Subsidy & grant applications", "补助金|助成金|補助金|政策申请|subsid|grant", B],
  ["law_firm", "professional_services.legal", "律师与法务", "弁護士・法務", "Law & legal services", "律师|法务|弁護士|法務|契約|legal|lawyer", B],
  ["immigration_admin", "professional_services.legal", "签证与行政书士", "ビザ・行政書士", "Visa & administrative scriveners", "签证|行政书士|行政書士|ビザ|在留|会社設立|visa", `${C}|${B}`],
  ["ip_patent", "professional_services.legal", "知识产权与专利", "知財・特許", "IP & patents", "知识产权|专利|商标|特許|知財|商標|patent|trademark", B],
  ["accounting_audit", "professional_services.tax_accounting", "会计、审计与税务", "会計・監査・税務", "Accounting, audit & tax", "会计|审计|税务|会計|監査|税務|税理士|四大|big4|accounting|audit|tax", B],
  ["recruiting", "professional_services.human_resources", "招聘与猎头", "人材紹介・ヘッドハンティング", "Recruiting & headhunting", "招聘|猎头|人材紹介|ヘッドハンティング|採用支援|recruit|headhunt", B],
  ["staffing", "professional_services.human_resources", "人才派遣与外包", "人材派遣・BPO", "Staffing & BPO", "派遣|人才派遣|bpo|业务外包|アウトソーシング|staffing", B],
  ["startup_support", "professional_services.startup_services", "创业支持与孵化", "起業支援・インキュベーション", "Startup support & incubation", "孵化|创业支持|起業支援|インキュベーション|アクセラレーター|incubat|accelerat", STARTUPS],
  ["translation", "professional_services.startup_services", "翻译与口译", "翻訳・通訳", "Translation & interpreting", "翻译|口译|翻訳|通訳|translation|interpret", B],
  ["company_setup", "professional_services.startup_services", "公司注册与代办", "会社設立・代行", "Company setup services", "公司注册|公司设立|会社設立|代办|company setup", `${B}|${C}`],

  // 制造与供应链
  ["kitchen_bath", "manufacturing_supply_chain.other", "厨柜、卫浴与住宅设备", "キッチン・水回り・住宅設備", "Kitchens, bathrooms & housing equipment", "厨柜|橱柜|整体厨房|卫浴|住宅设备制造|住宅設備メーカー|システムキッチン|水回り|キッチン|kitchen|bathroom|cabinet", `${RE_DEV}|${RE_BUILD}|${RE_DESIGN}|building_materials_trade|${C}`],
  ["building_materials", "manufacturing_supply_chain.materials", "建材制造", "建材メーカー", "Building materials", "建材|瓷砖|石材|涂料|木材|タイル|塗料|building material", `${RE_DEV}|${RE_BUILD}|${RE_DESIGN}|building_materials_trade`],
  ["furniture_home", "manufacturing_supply_chain.other", "家具与家居用品", "家具・インテリア用品", "Furniture & home goods", "家具|家居用品|家居饰品|インテリア|寝具|furniture|home goods", `${RETAIL}|${RE_DEV}|${HOTELS}|${RE_DESIGN}|${C}`],
  ["industrial_machinery", "manufacturing_supply_chain.industrial_equipment", "工业机械与设备", "産業機械・設備", "Industrial machinery", "机械|设备制造|産業機械|工作機械|machinery|equipment", MFG],
  ["factory_automation", "manufacturing_supply_chain.robotics", "工厂自动化与机器人", "FA・ロボット", "Factory automation & robotics", "机器人|工厂自动化|ロボット|fa|robot", MFG],
  ["auto_parts", "manufacturing_supply_chain.automotive", "汽车与零部件", "自動車・部品", "Automotive & parts", "汽车|零部件|自動車|部品|automotive|ev", `${MFG}|${C}`],
  ["semiconductor", "manufacturing_supply_chain.semiconductors", "半导体", "半導体", "Semiconductors", "半导体|芯片|半導体|chip|semiconductor", MFG],
  ["electronics_mfg", "manufacturing_supply_chain.electronics", "电子产品与 OEM", "電子機器・OEM", "Electronics & OEM", "电子|家电|oem|odm|電子機器|家電|electronics", `${RETAIL}|${B}`],
  ["chemicals", "manufacturing_supply_chain.materials", "化工与新材料", "化学・素材", "Chemicals & materials", "化工|新材料|化学|素材|chemical|material", MFG],
  ["textiles_apparel", "manufacturing_supply_chain.other", "纺织与服装制造", "繊維・アパレル製造", "Textiles & apparel manufacturing", "纺织|面料|服装厂|繊維|アパレル製造|生地|textile|garment", `fashion_brand|import_export|wholesale_distribution|furniture_home`],
  ["packaging_printing", "manufacturing_supply_chain.other", "包装与印刷", "包装・印刷", "Packaging & printing", "包装|印刷|パッケージ|packaging|printing", `${MFG}|retail_consumer.consumer_brands|food_hospitality.food_production`],
  ["energy_equipment", "manufacturing_supply_chain.other", "新能源与电池设备", "再エネ・蓄電池", "Renewable energy & batteries", "新能源|光伏|太阳能|储能|电池|蓄電池|太陽光|再エネ|solar|battery|renewable", `${RE_DEV}|${MFG}|government_public_affairs|${C}`],
  ["contract_manufacturing", "manufacturing_supply_chain.other", "代工与 OEM 生产", "OEM・受託製造", "Contract manufacturing", "代工|oem生产|受託製造|贴牌|contract manufactur", `retail_consumer.consumer_brands|${MFG}`],

  // 零售与消费
  ["store_retail", "retail_consumer.physical_retail", "门店零售", "店舗小売", "Store retail", "零售|门店|店铺|線下零售|线下零售|小売|店舗|スーパー|retail store", C],
  ["home_center", "retail_consumer.physical_retail", "家居建材零售", "ホームセンター・住設小売", "Home-improvement retail", "家居建材零售|ホームセンター|リフォーム店|home improvement", C],
  ["duty_free", "retail_consumer.physical_retail", "免税与入境消费", "免税・インバウンド消費", "Duty-free & tourist retail", "免税|インバウンド消費|duty free", C],
  ["ec_seller", "retail_consumer.ecommerce", "网店与电商运营", "EC事業・ネットショップ", "Online stores & EC operations", "电商|网店|ec事業|ネットショップ|楽天|亚马逊|amazon|天猫|ecommerce|e-commerce|ec", C],
  ["cross_border_ec", "retail_consumer.ecommerce", "跨境电商", "越境EC", "Cross-border e-commerce", "跨境电商|越境ec|代购|cross-border", C],
  ["live_commerce", "retail_consumer.ecommerce", "直播带货", "ライブコマース", "Live commerce", "直播带货|直播|ライブコマース|ライブ配信|livestream", `retail_consumer.consumer_brands|${C}`],
  ["cosmetics_brand", "retail_consumer.consumer_brands", "美妆与个护品牌", "化粧品・パーソナルケアブランド", "Beauty & personal care brands", "化妆品|美妆|护肤|个护|化粧品|コスメ|マンダム|資生堂|cosmetic|beauty|skincare", `${RETAIL}|${C}`],
  ["fashion_brand", "retail_consumer.consumer_brands", "服装与时尚品牌", "ファッションブランド", "Fashion brands", "服装品牌|时尚|ファッション|アパレルブランド|fashion|apparel brand", `${RETAIL}|${C}`],
  ["food_brand", "retail_consumer.consumer_brands", "食品与零食品牌", "食品ブランド", "Food & snack brands", "零食|食品品牌|お菓子|スナック|snack|food brand", `${RETAIL}|${C}`],
  ["household_brand", "retail_consumer.consumer_brands", "家居与日用品牌", "日用品・生活雑貨ブランド", "Household & lifestyle brands", "日用品|生活用品|雑貨|household|lifestyle brand", `${RETAIL}|${C}`],
  ["pet", "retail_consumer.lifestyle_services", "宠物用品与服务", "ペット用品・サービス", "Pet products & services", "宠物|ペット|pet", C],
  ["beauty_salon", "retail_consumer.lifestyle_services", "美容美发与沙龙", "美容室・サロン", "Salons & beauty services", "美容院|美发|美甲|沙龙|美容室|サロン|ネイル|salon", C],
  ["fitness_wellness", "retail_consumer.lifestyle_services", "健身与养生", "フィットネス・ウェルネス", "Fitness & wellness", "健身|瑜伽|养生|フィットネス|ジム|ヨガ|fitness|wellness", C],
  ["antiques_collectibles", "retail_consumer.lifestyle_services", "古玩与收藏品", "骨董・コレクション", "Antiques & collectibles", "古玩|收藏|骨董|アンティーク|antique|collectible", C],
  ["wedding_events", "retail_consumer.lifestyle_services", "婚庆与生活活动", "ウェディング・ライフイベント", "Weddings & life events", "婚庆|婚礼|ウェディング|wedding", C],

  // 贸易与物流
  ["import_export", "trade_logistics.import_export", "进出口贸易", "輸出入・貿易", "Import & export trade", "进出口|贸易|中日贸易|輸出入|貿易|商社|trading|import|export", `${RETAIL}|${MFG}|${B}`],
  ["wholesale_distribution", "trade_logistics.procurement", "批发与分销代理", "卸売・代理店", "Wholesale & distribution", "批发|分销|代理商|经销|卸売|卸|代理店|ディストリビューター|wholesale|distribut", `${RETAIL}|${B}`],
  ["building_materials_trade", "trade_logistics.procurement", "建材与住宅设备批发", "建材・住宅設備卸", "Building-material & housing-equipment wholesale", "建材批发|住宅设备批发|住宅設備機器の卸|住宅設備卸|建材卸|建築関連|建築案件|housing equipment", `${RE_DEV}|${RE_BUILD}|${RE_DESIGN}|home_center`],
  ["sourcing_agent", "trade_logistics.procurement", "采购代理与供应链服务", "調達代行・サプライチェーン", "Sourcing & supply-chain services", "采购代理|代购采购|供应链服务|調達代行|購買代行|仕入れ代行|sourcing agent|procurement service", `${RETAIL}|${MFG}`],
  ["freight_forwarding", "trade_logistics.freight", "国际货运与报关", "国際物流・通関", "Freight forwarding & customs", "货代|国际物流|报关|通関|フォワーダー|freight|customs", `${TRADE}|${MFG}|${RETAIL}`],
  ["warehousing_3pl", "trade_logistics.warehousing", "仓储与 3PL 配送", "倉庫・3PL", "Warehousing & 3PL", "仓储|仓库|配送|倉庫|物流センター|3pl|warehouse|fulfil", `${RETAIL}|retail_consumer.ecommerce|${TRADE}`],
  ["cross_border_services", "trade_logistics.cross_border_services", "跨境服务与中日对接", "越境サービス・日中ビジネスマッチング", "Cross-border services & China–Japan matching", "中日对接|中日业务对接|日中|中日|对接中日|日中交流|越境|china-japan|cross-border service", `${B}|${STARTUPS}`],

  // 房地产与建设
  ["property_developer", RE_DEV, "房地产开发", "不動産開発・デベロッパー", "Property development", "房地产开发|地产开发|开发商|デベロッパー|不動産開発|property develop|developer", C],
  ["housing_builder", RE_DEV, "住宅建设与销售", "住宅メーカー・分譲", "Home builders", "住宅建设|住宅メーカー|分譲|ハウスメーカー|home builder", C],
  ["general_contractor", RE_BUILD, "建筑施工与工程", "建設・工事", "Construction & contracting", "建筑施工|施工队|建筑工程|土木工程|ゼネコン|工務店|建設会社|建設業|工事|contractor|construction company", `${RE_DEV}|${B}|government_public_affairs`],
  ["renovation", RE_BUILD, "装修与翻新", "リフォーム・内装工事", "Renovation & fit-out", "装修|翻新|リフォーム|リノベーション|内装|renovation|fit-out", `${C}|${RE_OPS}|${B}`],
  ["architecture_interior", RE_DESIGN, "建筑与室内设计", "建築・インテリア設計", "Architecture & interior design", "建筑设计|室内设计|設計事務所|インテリアデザイン|architect|interior design", `${RE_DEV}|${B}|${C}`],
  ["property_management", RE_OPS, "物业管理与租赁运营", "不動産管理・賃貸運営", "Property management & leasing", "物业|租赁|賃貸|不動産管理|物件管理|property manag|leasing", C],
  ["commercial_real_estate", RE_OPS, "商业地产与招商运营", "商業施設・テナント誘致", "Commercial real estate & leasing", "商业地产|招商|古玩城|商城招商|商场招商|商铺|商业店铺|商業施設|テナント|commercial real estate", `${RETAIL}|${RESTAURANTS}|${B}`],
  ["coworking", RE_OPS, "共享办公与空间运营", "コワーキング・シェアオフィス", "Coworking & flexible space", "共享办公|联合办公|コワーキング|シェアオフィス|coworking", `${STARTUPS}|${B}`],
  ["real_estate_brokerage", "real_estate_construction.real_estate_services", "房产中介与买卖", "不動産仲介・売買", "Real estate brokerage", "房产中介|中介|买房|不動産仲介|不動産売買|broker", C],

  // 医疗与健康
  ["clinic", "healthcare_life_sciences.medical_services", "诊所与医院", "クリニック・病院", "Clinics & hospitals", "诊所|医院|クリニック|病院|clinic|hospital", C],
  ["aesthetic_medicine", "healthcare_life_sciences.medical_services", "医美", "美容医療", "Aesthetic medicine", "医美|美容医疗|美容医療|美容整形|aesthetic", C],
  ["medical_tourism", "healthcare_life_sciences.medical_services", "医疗旅游与体检", "医療ツーリズム・健診", "Medical tourism & check-ups", "医疗旅游|体检|健診|人間ドック|medical tourism", C],
  ["pharma", "healthcare_life_sciences.pharmaceuticals", "医药研发与销售", "医薬品", "Pharmaceuticals", "医药|制药|医薬|製薬|pharma", "healthcare_life_sciences.medical_services"],
  ["medical_device", "healthcare_life_sciences.medical_devices", "医疗器械", "医療機器", "Medical devices", "医疗器械|医療機器|medical device", "healthcare_life_sciences.medical_services"],
  ["biotech", "healthcare_life_sciences.biotechnology", "生物技术", "バイオテクノロジー", "Biotechnology", "生物技术|生物科技|バイオ|biotech", "healthcare_life_sciences"],
  ["supplements", "healthcare_life_sciences.health_management", "保健品与健康食品", "健康食品・サプリ", "Supplements & health foods", "保健品|健康食品|サプリ|supplement", `${RETAIL}|${C}`],
  ["elderly_care", "healthcare_life_sciences.health_management", "养老与介护", "介護・高齢者ケア", "Elderly care", "养老|介护|介護|高齢者|elderly care|nursing", C],
  ["healthtech", "healthcare_life_sciences.health_management", "医疗健康科技", "ヘルステック", "Health tech", "医疗科技|健康科技|ヘルステック|healthtech", `healthcare_life_sciences.medical_services|${C}`],

  // 教育与研究
  ["language_school", "education_research.professional_training", "语言学校与日语教育", "日本語学校・語学教育", "Language schools", "语言学校|日语|日本語学校|語学|language school", C],
  ["study_abroad", "education_research.professional_training", "留学中介", "留学エージェント", "Study-abroad agencies", "留学|留学中介|留学エージェント|study abroad", C],
  ["corporate_training", "education_research.professional_training", "企业培训", "企業研修", "Corporate training", "企业培训|研修|企業研修|corporate training", B],
  ["skills_training", "education_research.professional_training", "职业技能培训", "職業訓練・スクール", "Vocational & skills training", "职业培训|技能培训|スクール|编程培训|プログラミングスクール|bootcamp", C],
  ["kids_education", "education_research.school_education", "少儿教育与补习", "子ども教育・塾", "Kids' education & tutoring", "少儿|补习|塾|子ども教育|tutoring", C],
  ["university", "education_research.higher_education", "大学与学术", "大学・アカデミア", "Universities & academia", "大学教员|大学教授|研究室|university|professor", B],
  ["edtech_platform", "education_research.edtech", "在线教育平台", "オンライン教育", "Online education", "在线教育|网课|オンライン教育|edtech|e-learning", `${C}|${B}`],
  ["research_lab", "education_research.research_institutes", "研究机构与研发服务", "研究機関・R&D", "Research institutes & R&D", "研究所|研发|研究機関|r&d|research", `${B}|${MFG}`],
  ["student", "education_research.higher_education", "在读学生", "学生", "Students", "学生|在读|大学生|留学生|student", ""],

  // 文化传媒与创意
  ["ad_agency", "media_creative.advertising_marketing", "广告与营销代理", "広告代理店・マーケティング支援", "Advertising & marketing agencies", "广告|营销代理|広告代理|マーケティング支援|广告公司|agency", B],
  ["sns_marketing", "media_creative.advertising_marketing", "SNS 运营与 KOL", "SNS運用・インフルエンサー", "Social media & influencer marketing", "sns运营|kol|网红|mcn|小红书|抖音|インフルエンサー|sns運用|tiktok|influencer", `retail_consumer.consumer_brands|${B}`],
  ["pr_media_relations", "media_creative.advertising_marketing", "公关与媒体关系", "PR・広報", "PR & media relations", "公关|pr|広報|プレスリリース|public relations", B],
  ["brand_marketing", "media_creative.advertising_marketing", "品牌策划与海外营销", "ブランド企画・海外マーケティング", "Brand planning & overseas marketing", "品牌策划|海外营销|ブランド企画|海外マーケティング|brand marketing", `retail_consumer.consumer_brands|${B}`],
  ["media_publisher", "media_creative.publishing_content", "媒体与内容", "メディア・コンテンツ", "Media & content", "媒体|出版|自媒体|メディア|出版社|編集|media|publisher", `${C}|${B}`],
  ["video_production", "media_creative.film_video", "影视与视频制作", "映像制作", "Film & video production", "影视|视频制作|映像制作|動画制作|video production|film", B],
  ["games", "media_creative.games_entertainment", "游戏开发", "ゲーム開発", "Game development", "游戏|ゲーム|小游戏|game", C],
  ["anime_ip", "media_creative.games_entertainment", "动漫与 IP", "アニメ・IP", "Anime & IP", "动漫|二次元|アニメ|漫画|ip授权|anime|manga", `${C}|retail_consumer.consumer_brands`],
  ["music_entertainment", "media_creative.games_entertainment", "音乐与演艺", "音楽・エンタメ", "Music & entertainment", "音乐|演艺|偶像|音楽|芸能|music|entertainment", C],
  ["design_studio", "media_creative.design_creative", "设计与创意工作室", "デザイン・クリエイティブ", "Design & creative studios", "平面设计|ui设计|设计公司|设计工作室|デザイン事務所|デザイナー|クリエイティブ|design studio|graphic design", B],
  ["event_production", "media_creative.design_creative", "活动策划与会展", "イベント企画・展示会", "Events & exhibitions", "活动策划|会展|展会|イベント企画|展示会|event planning|exhibition", `${B}|community_nonprofit`],

  // 社群与非营利
  ["chamber_association", "community_nonprofit.industry_associations", "商会与行业协会", "商工会・業界団体", "Chambers & industry associations", "商会|协会|总商会|商工会|業界団体|chamber|association", B],
  ["community_operator", "community_nonprofit.community_operations", "社群与交流会运营", "コミュニティ・交流会運営", "Community & meetup organisers", "社群|交流会|部落|コミュニティ|community|meetup", `${C}|${B}`],
  ["nonprofit", "community_nonprofit.nonprofits", "公益与非营利组织", "NPO・非営利団体", "Nonprofits", "公益|非营利|npo|ngo|nonprofit", ""],

  // 政府与公共事务
  ["local_government", "government_public_affairs.economic_development", "地方政府与招商", "自治体・企業誘致", "Local government & investment promotion", "招商局|地方政府|自治体|企業誘致|jetro|investment promotion", B],
  ["public_institution", "government_public_affairs.public_services", "公共机构", "公的機関", "Public institutions", "公共机构|公的機関|public institution", ""],
];

export const BUSINESS_CATEGORIES: readonly BusinessCategory[] = ROWS.map(([id, parent, zh, ja, en, keywords, customers]) => ({
  customers: customers ? customers.split("|") : [],
  id,
  keywords: keywords.split("|").map((keyword) => keyword.toLocaleLowerCase("en-US")),
  labels: { en, ja, zh },
  parent,
}));

const byId = new Map(BUSINESS_CATEGORIES.map((category) => [category.id, category]));
export const businessCategory = (id: string): BusinessCategory | undefined => byId.get(id);

/** The top-level industry id of a category. */
export const categoryIndustry = (category: BusinessCategory) => category.parent.split(".")[0]!;

const fold = (text: string) => text.normalize("NFKC").toLocaleLowerCase("en-US");
const ASCII_WORD = /^[a-z0-9&+.\- ]+$/u;

/** Does a keyword occur in folded text? Short ASCII keywords (≤ 3 letters: "ec", "pr", "vc", "ai") match whole words only. */
export function keywordIn(text: string, keyword: string): boolean {
  if (!keyword) return false;
  if (ASCII_WORD.test(keyword) && keyword.length <= 3) {
    return new RegExp(`(^|[^a-z0-9])${keyword.replace(/[.+-]/gu, "\\$&")}(?=$|[^a-z0-9])`, "u").test(text);
  }
  return text.includes(keyword);
}

/** Every place a keyword of the category occurs in folded text. */
export function keywordPositions(folded: string, category: BusinessCategory): { at: number; keyword: string }[] {
  const out: { at: number; keyword: string }[] = [];
  for (const keyword of category.keywords) {
    if (!keywordIn(folded, keyword)) continue;
    for (let at = folded.indexOf(keyword); at >= 0; at = folded.indexOf(keyword, at + 1)) out.push({ at, keyword });
  }
  return out;
}

/** Categories whose keywords occur in the text, best (longest keyword) first. */
export function categoriesInText(text: string): { category: BusinessCategory; keyword: string }[] {
  const folded = fold(text);
  const hits: { category: BusinessCategory; keyword: string }[] = [];
  for (const category of BUSINESS_CATEGORIES) {
    const keyword = category.keywords.filter((candidate) => keywordIn(folded, candidate)).sort((a, b) => b.length - a.length)[0];
    if (keyword) hits.push({ category, keyword });
  }
  return hits.sort((a, b) => b.keyword.length - a.keyword.length);
}

/** Fast search for a picker: label prefix > label contains > keyword match, in any language. */
export function searchBusinessCategories(query: string, limit = 12): BusinessCategory[] {
  const q = fold(query.trim());
  if (!q) return [];
  const scored: { category: BusinessCategory; score: number }[] = [];
  for (const category of BUSINESS_CATEGORIES) {
    const labels = [category.labels.zh, category.labels.ja, category.labels.en].map(fold);
    let score = 0;
    if (labels.some((label) => label.startsWith(q))) score = 3;
    else if (labels.some((label) => label.includes(q))) score = 2;
    else if (category.keywords.some((keyword) => keyword.includes(q) || (q.length >= 2 && q.includes(keyword) && keyword.length >= 2))) score = 1;
    if (score) scored.push({ category, score });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((entry) => entry.category);
}

/**
 * Is a company in category `seller` a natural supplier to one in `buyer`? True when the seller's customers name the
 * buyer's category, its secondary industry or its top-level industry. "*" (any business) and "consumer" never count
 * here — they are too broad to say two specific people do business.
 */
export function sellsTo(seller: BusinessCategory, buyer: BusinessCategory): boolean {
  return seller.customers.some((customer) => customer === buyer.id || customer === buyer.parent || customer === categoryIndustry(buyer));
}
