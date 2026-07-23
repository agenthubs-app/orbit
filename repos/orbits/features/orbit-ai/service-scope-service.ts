/**
 * 服务范围分类器。
 *
 * Orbit 是商务关系工作助手,不是通用问答。日常生活类问题(菜谱、行程、就医、
 * 法律、作业、写代码)不该直接作答,而应转成"你的人脉里谁懂这个"。
 *
 * 为什么放在这里而不是 planner 的 systemInstruction:
 * 写进 prompt 时,规则能否生效取决于模型当轮的自由裁量,无法单测、无法观测,
 * 且与其它 30 条规则互相干扰。这里把「是否超纲」的判断收回代码层——判定确定、
 * 可单测、命中可记录——与 live-agent-runtime 中既有的隐私/危机/专业建议等
 * 边界守卫同级。
 *
 * 与那些守卫的一个区别:命中后不完全短路。超纲问题仍要走人脉检索,才能给出
 * "这个我不答,但你人脉里这几位懂"的回复。所以这里只确定性地决定「拒答 + 用
 * 哪些领域去检索」,具体推荐谁仍由检索层决定。
 *
 * 覆盖范围是有意保守的:只拦明确属于这些品类的问法,拿不准就返回 null 交给
 * planner(systemInstruction 里仍保留同样语义的规则作为兜底)。宁可漏判也不
 * 要把商业问题误判成超纲——后者会直接砍掉产品的核心能力。
 */
import type { OrbitAgentRecommendationDomain } from "./gemini-provider";

export interface OrbitAiOutOfScopeClassification {
  /** 命中的品类,用于日志与测试断言。 */
  category: OrbitAiOutOfScopeCategory;
  /** 转人脉检索时使用的领域标签(planner 的 domains 枚举子集)。 */
  domains: readonly OrbitAgentRecommendationDomain[];
  /** 转人脉检索时使用的英文检索词。 */
  searchTerms: string;
}

export const ORBIT_AI_OUT_OF_SCOPE_CATEGORIES = [
  "cooking",
  "travel",
  "health",
  "legal",
  "homework",
  "programming",
  "entertainment",
] as const;

export type OrbitAiOutOfScopeCategory =
  (typeof ORBIT_AI_OUT_OF_SCOPE_CATEGORIES)[number];

interface ScopeRule {
  category: OrbitAiOutOfScopeCategory;
  domains: readonly OrbitAgentRecommendationDomain[];
  searchTerms: string;
  /** 品类词:消息必须提到这个领域。 */
  topic: RegExp;
  /** 求解词:用户是在要这个领域的答案,而不是在谈生意。 */
  ask: RegExp;
}

// 商务语境豁免:同样的词在商业场景里含义完全不同(开餐厅、投资医疗、
// 法务尽调、旅游行业出海),这些必须留给正常的人脉/活动链路。
const businessContext =
  /(?:创业|創業|开公司|開公司|开店|開店|开一家|開一家|融资|融資|投资人|投資人|投融资|投融資|市场|市場|获客|獲客|渠道|合伙|合夥|供应链|供應鏈|品牌|出海|加盟|门店|門店|运营|運營|商业|商業|业务|業務|客户|客戶|行业|行業|赛道|賽道|尽调|盡調|并购|併購|startup|business|market|investor|funding|customer|b2b|saas|go-to-market)/i;

const scopeRules: readonly ScopeRule[] = [
  {
    ask: /(?:怎么做|怎麼做|做法|菜谱|菜譜|食谱|食譜|配方|步骤|步驟|教程|怎么煮|怎麼煮|怎么炒|怎麼炒|怎么烤|怎麼烤|recipe|how to (?:cook|make|bake))/i,
    category: "cooking",
    domains: ["restaurant", "food_beverage"],
    searchTerms: "restaurant food beverage chef culinary kitchen",
    topic:
      /(?:麻辣香锅|麻辣香鍋|火锅|火鍋|川菜|粤菜|粵菜|拉面|拉麵|寿司|壽司|蛋糕|面包|麵包|红烧|紅燒|糖醋|宫保|宮保|回锅肉|回鍋肉|水煮鱼|水煮魚|小笼包|小籠包|饺子|餃子|炒饭|炒飯|咖喱|沙拉|甜点|甜點|菜|汤|湯|肉|鱼|魚|饭|飯|面|麵|recipe|dish|cook|bake|cuisine)/i,
  },
  {
    ask: /(?:怎么安排|怎麼安排|行程|攻略|几日游|幾日游|几天游|幾天游|玩什么|玩什麼|去哪玩|好玩的|景点推荐|景點推薦|自由行|itinerary|travel guide|what to see|sightseeing)/i,
    category: "travel",
    domains: ["tourism"],
    searchTerms: "travel tourism hospitality local guide",
    topic:
      /(?:旅游|旅遊|旅行|观光|觀光|景点|景點|一日游|二日游|三日游|度假|签证|簽證|机票|機票|酒店|民宿|travel|trip|tour|vacation|sightseeing|itinerary)/i,
  },
  {
    ask: /(?:吃什么药|吃什麼藥|用什么药|用什麼藥|怎么治|怎麼治|怎么办|怎麼辦|严重吗|嚴重嗎|要紧吗|要緊嗎|挂什么科|掛什麼科|需要看医生|需要看醫生|what medicine|should i see a doctor|how to treat)/i,
    category: "health",
    domains: ["healthcare"],
    searchTerms: "healthcare medical clinic wellness",
    topic:
      /(?:头痛|頭痛|胸口痛|胸痛|发烧|發燒|感冒|咳嗽|失眠|过敏|過敏|拉肚子|腹泻|腹瀉|症状|症狀|病|药|藥|医院|醫院|体检|體檢|headache|fever|cough|insomnia|allergy|symptom|medicine|hospital)/i,
  },
  {
    ask: /(?:怎么打官司|怎麼打官司|要不要起诉|要不要起訴|怎么维权|怎麼維權|算不算违法|算不算違法|会被判|會被判|怎么写诉状|怎麼寫訴狀|how to sue|is it illegal|legal advice)/i,
    category: "legal",
    domains: ["legal"],
    searchTerms: "legal lawyer compliance advisory",
    topic:
      /(?:官司|起诉|起訴|诉讼|訴訟|坐牢|判刑|违法|違法|犯法|离婚|離婚|遗产|遺產|继承|繼承|赔偿|賠償|lawsuit|sue|illegal|divorce|inheritance|criminal)/i,
  },
  {
    ask: /(?:帮我写|幫我寫|帮我做|幫我做|怎么写|怎麼寫|解一下|算一下|翻译一下|翻譯一下|help me (?:write|solve)|solve this)/i,
    category: "homework",
    domains: ["education"],
    searchTerms: "education tutoring academic",
    topic:
      /(?:作业|作業|习题|習題|试卷|試卷|考试题|考試題|论文|論文|读后感|讀後感|数学题|數學題|物理题|物理題|homework|essay|assignment|exam question)/i,
  },
  {
    ask: /(?:帮我写|幫我寫|怎么写|怎麼寫|写个|寫個|实现一下|實現一下|报错|報錯|调试|調試|怎么改|怎麼改|debug|help me (?:write|fix)|how do i (?:write|implement))/i,
    category: "programming",
    domains: ["enterprise_saas", "ai"],
    searchTerms: "software engineering developer technical",
    topic:
      /(?:python|javascript|typescript|java\b|golang|rust\b|sql\b|脚本|腳本|代码|代碼|函数|函數|正则|正則|报错|報錯|bug|api 调用|api 調用|script|code|function|regex|stack trace|compile)/i,
  },
  {
    ask: /(?:推荐几部|推薦幾部|推荐几本|推薦幾本|好看吗|好看嗎|剧情|劇情|结局|結局|谁赢了|誰贏了|比分|怎么玩|怎麼玩|recommend some|what should i watch|who won)/i,
    category: "entertainment",
    domains: ["entertainment"],
    searchTerms: "entertainment media creative",
    topic:
      /(?:电影|電影|电视剧|電視劇|动漫|動漫|小说|小說|综艺|綜藝|游戏|遊戲|球赛|球賽|世界杯|奥运|奧運|明星|追剧|追劇|movie|tv show|anime|novel|game|match)/i,
  },
];

/**
 * 判断消息是否超出 Orbit 的服务范围。
 *
 * 判据是「品类词 + 求解词」同时命中,且不带商务语境。三者缺一不判超纲——
 * "我想开一家川菜馆"有品类词但带商务语境,"帮我写个跟进消息"有求解词但无
 * 品类词,都必须继续走正常链路。
 */
export function classifyOutOfServiceScope(
  message: string,
): OrbitAiOutOfScopeClassification | null {
  const text = message.trim();

  if (!text || businessContext.test(text)) {
    return null;
  }

  for (const rule of scopeRules) {
    if (rule.topic.test(text) && rule.ask.test(text)) {
      return {
        category: rule.category,
        domains: rule.domains,
        searchTerms: rule.searchTerms,
      };
    }
  }

  return null;
}
