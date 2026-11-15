/**
 * Bulk records for the regular and large worlds (eval/README.md §11): fixed seed, same output every time.
 * Rules come from each world file's `bulk` section; `verifyWorldFacts` checks the `scale` and `facts` sections.
 * Bulk text is built from neutral templates and never names an anchor person, company or story word
 * (`bulk.must_not_produce`); `verifyWorldFacts` scans every generated string to prove it.
 */
import type { FixtureRecord, WorldFixture } from "./world";

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Rng {
  private readonly next: () => number;
  constructor(seed: number) {
    this.next = mulberry32(seed);
  }
  float(): number {
    return this.next();
  }
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }
  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)];
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  shuffle<T>(items: readonly T[]): T[] {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.next() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
  /** Language by weights {zh: 0.6, …}. */
  weighted<K extends string>(weights: Record<K, number>): K {
    const entries = Object.entries(weights) as [K, number][];
    let roll = this.next() * entries.reduce((sum, [, w]) => sum + w, 0);
    for (const [key, weight] of entries) {
      roll -= weight;
      if (roll < 0) return key;
    }
    return entries[entries.length - 1][0];
  }
}

const DAY = 86_400_000;
const JST = "+09:00";

function dayOf(ms: number): string {
  return new Date(ms + 9 * 3_600_000).toISOString().slice(0, 10);
}

function jstMs(date: string, time = "00:00"): number {
  return Date.parse(`${date}T${time}:00${JST}`);
}

function isoAt(ms: number): string {
  const local = new Date(ms + 9 * 3_600_000).toISOString().slice(0, 19);
  return `${local}${JST}`;
}

/** A moment between two JST days (inclusive), at a daytime minute. */
function momentBetween(rng: Rng, fromDay: string, toDay: string, hours: [number, number] = [9, 20]): number {
  const from = jstMs(fromDay);
  const days = Math.round((jstMs(toDay) - from) / DAY);
  const day = from + rng.int(0, days) * DAY;
  return day + rng.int(hours[0], hours[1]) * 3_600_000 + rng.pick([0, 10, 15, 20, 30, 40, 45, 50]) * 60_000;
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, "0");
}

function rangeIds(prefix: string, from: number, count: number, width = String(from).length): string[] {
  return Array.from({ length: count }, (_, index) => `${prefix}${pad(from + index, width)}`);
}

const ZH_GIVEN = [
  "子涵", "浩然", "雨桐", "思远", "嘉怡", "明轩", "若溪", "俊杰", "晓雯", "宇航", "欣然", "志强", "佳琪", "文博", "一凡",
  "梦瑶", "天佑", "静怡", "泽宇", "诗雨", "皓轩", "可欣", "亦辰", "晨曦", "书瑶", "景行", "安琪", "乐言", "清扬", "睿哲",
  "心悦", "沐阳", "若琳", "博涛", "雅婷", "子墨", "慧敏", "承泽", "语桐", "海宁", "秋实", "冬阳", "春晓", "玉衡", "启明",
  "知远", "怀瑾", "望舒", "星河", "长风",
];
const JA_GIVEN = [
  "翔太", "陽菜", "大翔", "結衣", "蓮", "美咲", "悠真", "葵", "湊", "凛", "颯太", "莉子", "陸", "心春", "樹", "芽依", "蒼",
  "紬", "奏太", "彩花", "海斗", "日向", "律", "楓", "陽斗", "咲良", "直樹", "真央", "拓海", "千尋", "優斗", "七海", "康介",
  "沙織", "智也", "麻衣", "亮", "絵美", "慎吾", "理恵", "隼人", "早紀", "和真", "由佳", "航", "瑞希", "圭", "香織", "誠一", "遥",
];

const ORG_PARTS = {
  regular: {
    zh: { head: ["云杉", "青禾", "远山", "知味", "白桦", "晴川", "木兰", "星野", "南风", "松涛", "鹿鸣", "清溪"], tail: ["商贸", "餐饮", "生活馆", "设计室", "文化", "零售", "传媒", "会展服务"] },
    ja: { head: ["朝霧", "若葉", "小春", "春日", "宮坂", "高槻", "藤原", "北斗", "桜井", "月見"], tail: ["商店", "企画", "デザイン", "商事", "物産", "スタジオ"] },
    en: { head: ["Juniper", "Harbor", "Maple", "Copper", "Willow", "Granite", "Meadow", "Cobalt"], tail: ["Trading", "Studio", "Supply", "Retail", "Media", "Works"] },
  },
  large: {
    zh: { head: ["启航", "远图", "青松", "华辰", "博睿", "云帆", "明德", "鼎新", "汇川", "清越", "嘉禾", "智联"], tail: ["科技", "咨询", "智能", "电子", "物流", "医疗", "能源", "软件"] },
    ja: { head: ["朝日", "若林", "北辰", "富士見", "青葉", "高砂", "大和", "千代田", "秋津", "八雲"], tail: ["工業", "電機", "システム", "技研", "商事", "製作所"] },
    en: { head: ["Summit", "Bluepeak", "Ironwood", "Silverline", "Brightpath", "Oakridge", "Clearwater", "Redstone"], tail: ["Systems", "Labs", "Consulting", "Logistics", "Medical", "Energy"] },
  },
} as const;

const ROLES = {
  regular: {
    zh: ["店长", "采购", "运营", "市场负责人", "设计师", "经理", "主理人", "销售"],
    ja: ["店長", "バイヤー", "営業担当", "企画担当", "マネージャー", "デザイナー"],
    en: ["Store Manager", "Buyer", "Operations Lead", "Designer", "Account Manager", "Marketing Lead"],
  },
  large: {
    zh: ["项目经理", "研发工程师", "人力资源经理", "销售总监", "产品经理", "运营总监", "技术顾问", "采购主管"],
    ja: ["プロジェクトマネージャー", "開発エンジニア", "人事マネージャー", "営業部長", "企画担当", "技術顧問"],
    en: ["Project Manager", "Software Engineer", "HR Manager", "Sales Director", "Product Manager", "Operations Director"],
  },
} as const;

type Lang = "zh" | "ja" | "en";

const MEMO_TEMPLATES: Record<"regular" | "large", Record<Lang, readonly string[]>> = {
  regular: {
    zh: ["下个月的订单数量大概会增加两成。", "确认了付款安排，月底前到账。", "下午去{org}拜访，聊了明年的合作节奏。", "展位位置定在入口附近。", "物流时效比上次快了一天。", "{org}的库存还够撑三周。", "订单数量先按上个月的量走。", "付款方式改成了月结。", "这周的拜访安排在周三。", "展位需要的桌子已经备齐。"],
    ja: ["来月の発注数が少し増えそうだと連絡があった。", "{org}への支払いは月末に完了予定。", "{org}を訪問し、来年の進め方について話した。", "展示会のブース位置が決まった。", "配送日数が前回より一日短くなった。", "在庫はあと三週間分ある。", "発注数は先月並みで進める。", "支払い方法を月締めに変えた。"],
    en: ["Order volume should rise a little next month.", "Payment from {org} should arrive by the end of the month.", "Visited {org} to talk about next year's plans.", "Our booth spot at the fair is near the entrance.", "Delivery took one day less than last time.", "Stock at {org} should last about three weeks.", "We will keep order volume at last month's level.", "Switched the payment terms to monthly."],
  },
  large: {
    zh: ["约了下周二见面。", "更新了简历，补充了最近的项目经历。", "{org}对上次推荐的人选反馈不错。", "听说{org}在扩大团队。", "约在下周四上午碰一次。", "简历里补了两段项目。", "{org}希望下次多推荐几位。", "行业里最近招人的公司变多了。"],
    ja: ["来週会う約束をした。", "履歴書を更新したと連絡があった。", "{org}から前回の紹介について好意的な反応があった。", "{org}がチームを拡大しているらしい。", "来週木曜の午前に会うことになった。", "業界全体で採用が増えているようだ。"],
    en: ["Set up a meeting for next Tuesday.", "Updated the resume with recent work.", "{org} gave good feedback on the last introduction.", "Heard that {org} is growing its team.", "We will meet on Thursday morning next week.", "More companies in the field are hiring this month."],
  },
};

const MEMO_TITLES: Record<"regular" | "large", Record<Lang, readonly string[]>> = {
  regular: { zh: ["拜访记录", "库存盘点", "付款跟进", "展位安排", "物流情况", "订单记录"], ja: ["訪問メモ", "在庫確認", "支払いメモ"], en: ["Visit notes", "Stock check", "Payment notes"] },
  large: { zh: ["约见记录", "简历更新", "客户反馈", "行业消息"], ja: ["面談メモ", "履歴書メモ", "業界ニュース"], en: ["Meeting notes", "Resume update", "Client feedback", "Industry news"] },
};

const TODO_TITLES: Record<"regular" | "large", Record<Lang, readonly string[]>> = {
  regular: { zh: ["整理本月库存", "核对付款明细", "安排下周拜访", "更新展位物料清单", "确认物流时效", "汇总订单数量"], ja: ["在庫を確認する", "支払い明細を確認する", "訪問の予定を立てる"], en: ["Check this month's stock", "Review payment details", "Plan next week's visits"] },
  large: { zh: ["安排约见", "整理客户反馈", "更新简历库", "汇总行业消息", "回复客户邮件", "准备约见材料"], ja: ["面談の予定を調整する", "顧客の反応をまとめる", "履歴書を整理する"], en: ["Schedule a meeting", "Summarize client feedback", "Update the resume archive", "Reply to client email"] },
};

const EVENT_FORMS = {
  regular: ["市集", "工作坊", "分享会", "展览", "体验课"],
  large: ["论坛", "研讨会", "交流会", "展会", "讲座"],
} as const;
const EVENT_VENUES = {
  regular: ["涩谷", "吉祥寺", "代官山", "清澄白河", "浅草", "下北泽", "自由之丘", "神保町"],
  large: ["品川", "丸之内", "横滨", "大阪", "名古屋", "台场", "新宿", "筑波"],
} as const;
const PRIVATE_EVENT_TITLES = {
  regular: ["朋友聚餐", "读书会", "家庭旅行", "老同事聚会", "社区跑步", "手作体验"],
  large: ["朋友聚餐", "读书会", "家庭出游", "老同事聚会", "徒步", "校友见面"],
} as const;
const SCHEDULE_TITLES = {
  regular: ["对账", "仓库盘点", "拜访客户", "线上会议", "整理账目", "健身", "看展"],
  large: ["客户电话", "内部例会", "约见候选人", "整理简历", "线上会议", "健身", "行业讲座"],
} as const;
const LARGE_SERIES_TITLES = ["晨会", "周报整理", "英语课", "健身", "客户例会", "读书", "复盘", "团队一对一"];

const FILLER: Record<Lang, readonly (readonly [string, string])[]> = {
  zh: [
    ["包材要怎么选比较省钱？", "先按常用尺寸统一规格，量大的时候再谈单价。"],
    ["邮件开头怎么写比较得体？", "先用一句话说明来意，再写具体的事。"],
    ["定价时怎么说明涨价比较好？", "说清楚原因和生效日期，给老客户留一点缓冲。"],
    ["出差住哪里方便？", "住在车站附近，早上赶路会轻松很多。"],
    ["发票抬头写错了怎么办？", "联系开票方作废重开，旧的留底备查。"],
    ["一周的时间怎么排比较好？", "把需要专注的事放在上午，琐事集中处理。"],
    ["怎么回复一封催进度的邮件？", "先说明目前进展，再给出下一步的时间。"],
    ["线上会议要提前准备什么？", "提前发议程，会后发一份简短纪要。"],
  ],
  ja: [
    ["メールの書き出しはどうすればいいですか。", "最初に用件を一文で伝えるのが一般的です。"],
    ["出張のときの宿はどこが便利ですか。", "駅の近くにすると朝の移動が楽になります。"],
    ["値上げの伝え方を教えてください。", "理由と適用日をはっきり書くと伝わりやすいです。"],
    ["会議の前に用意しておくものはありますか。", "議題を事前に共有し、終わったら要点を送ります。"],
  ],
  en: [
    ["How should I open a follow-up email?", "State the purpose in the first sentence, then the details."],
    ["Any tips for a short business trip?", "Stay near the station so early mornings are easier."],
    ["How do I explain a price change?", "Give the reason and the effective date, and keep it brief."],
    ["What should I prepare for an online meeting?", "Share an agenda beforehand and send a short summary after."],
  ],
};

const MEMORY_TEMPLATES = {
  constraint: ["安排日程时不要排在周三下午", "整理笔记时不要超过五条要点", "安排待办时一天不要超过六条", "安排日程时会议之间至少留十五分钟", "整理笔记时不要改写原话", "安排待办时不要把截止日放在节假日", "安排日程时上午九点前不排会", "整理笔记时不要合并不同日期的内容", "安排待办时不要把同一件事拆成三条以上"],
  preference: ["安排待办时把同类的放在一起", "整理笔记时按日期从新到旧", "安排日程时优先放在周二和周四", "整理笔记时先写结论", "安排待办时先做耗时短的", "安排日程时把外出集中在同一天", "整理笔记时保留原文的数字", "安排待办时把电话类的放在下午", "安排日程时给通勤留出时间", "整理笔记时用短句", "安排待办时把月底的事提前一周提醒", "安排日程时把学习安排在固定时段", "整理笔记时标出待确认的地方"],
  goal: ["这个季度把待办的逾期数降到五条以内", "每周整理一次笔记", "每月至少安排两次学习时间", "年底前把常用模板整理好", "下个月把日程里的空档用起来", "今年把客户资料补齐"],
  identity: ["我习惯用中文记笔记", "我平时在东京工作", "我每天早上先看日程", "我喜欢把事情列成清单"],
} as const;
const MEMORY_APPLIES = { constraint: ["schedule.plan", "memo.summarize", "todo.plan"], preference: ["todo.plan", "memo.summarize", "schedule.plan"], goal: ["todo.plan", "memo.summarize", "schedule.plan"], identity: ["memo.summarize", "schedule.plan", "todo.plan"] } as const;

interface Ctx {
  rng: Rng;
  size: "regular" | "large";
  account: string;
  world: WorldFixture;
  bulk: Record<string, any>;
  out: FixtureRecord[];
}

function push(ctx: Ctx, kind: FixtureRecord["kind"], id: string, data: Record<string, unknown>, account = ctx.account): void {
  ctx.out.push({ account, data: { id, ...data }, id, kind, origin: "bulk" });
}

function orgName(ctx: Ctx, lang: Lang): string {
  const parts = ORG_PARTS[ctx.size][lang];
  const head = ctx.rng.pick(parts.head);
  const tail = ctx.rng.pick(parts.tail);
  return lang === "en" ? `${head} ${tail}` : `${head}${tail}`;
}

function generateContacts(ctx: Ctx): FixtureRecord[] {
  const rules = ctx.bulk.contacts;
  const range = (rules.ids as string).match(/^([A-Z]+)(\d+)/u)!;
  const ids = rangeIds(range[1], Number(range[2]), rules.count);
  const anchorNames = new Set(ctx.world.anchors.filter((r) => r.kind === "contact").map((r) => String(r.data.name)));
  const used = new Set<string>();
  const pools = rules.name_pools;
  const made: FixtureRecord[] = [];
  const clock = Date.parse(ctx.world.clock);
  ids.forEach((id, index) => {
    const lang = ctx.rng.weighted(rules.mix as Record<Lang, number>);
    let name = "";
    for (let attempt = 0; attempt < 500 && (!name || used.has(name) || anchorNames.has(name)); attempt += 1) {
      if (lang === "zh") name = `${ctx.rng.pick(pools.zh_surnames)}${ctx.rng.pick(ZH_GIVEN)}`;
      else if (lang === "ja") name = `${ctx.rng.pick(pools.ja_surnames)}${ctx.rng.pick(JA_GIVEN)}`;
      else {
        const initial = attempt > 20 || ctx.size === "large" ? ` ${String.fromCharCode(65 + ctx.rng.int(0, 25))}.` : "";
        name = `${ctx.rng.pick(pools.en_given)}${initial} ${ctx.rng.pick(pools.en_surnames)}`;
      }
    }
    if (used.has(name) || anchorNames.has(name)) throw new Error(`name pool exhausted at ${id}`);
    used.add(name);
    const n = index + 1;
    let industry = ctx.rng.pick(rules.industries as string[]);
    let region = ctx.rng.pick(rules.regions as string[]);
    let role: string = ctx.rng.pick(ROLES[ctx.size][lang]);
    let lastInteractionOn: string | null = null;
    if (ctx.size === "regular") {
      if (n <= 19) {
        region = "东京";
        industry = "零售";
      } else {
        while (region === "东京" && industry === "零售") industry = ctx.rng.pick(rules.industries as string[]);
      }
      if (ctx.rng.chance(0.8)) lastInteractionOn = dayOf(clock - ctx.rng.int(1, 400) * DAY);
    } else {
      const others = (rules.industries as string[]).filter((value) => value !== "半导体");
      const nonSingapore = (rules.regions as string[]).filter((value) => value !== "新加坡");
      if (n <= 374) {
        region = "新加坡";
        industry = ctx.rng.pick(others);
      } else if (n <= 894) {
        region = ctx.rng.pick(nonSingapore);
        industry = "半导体";
        role = ctx.rng.pick(rules.semiconductor_roles as string[]);
        if (n <= 610) lastInteractionOn = dayOf(momentBetween(ctx.rng, "2025-01-01", "2026-09-09"));
        else if (n <= 850) lastInteractionOn = dayOf(momentBetween(ctx.rng, "2026-09-23", "2026-11-14"));
      } else {
        region = ctx.rng.pick(nonSingapore);
        industry = ctx.rng.pick(others);
      }
      if ((n <= 374 || n > 894) && ctx.rng.chance(0.8)) lastInteractionOn = dayOf(clock - ctx.rng.int(1, 400) * DAY);
    }
    const updatedFrom = ctx.size === "regular" ? "2026-01-01" : "2025-01-01";
    const updatedAt = isoAt(momentBetween(ctx.rng, updatedFrom, "2026-11-14"));
    const seq = pad(Number(id.replace(/^[A-Z]+/u, "")) - (ctx.size === "regular" ? 1000 : 10000), ctx.size === "regular" ? 4 : 5);
    const data = {
      email: `${id.toLowerCase()}@bulk.example.test`,
      industry,
      lang,
      lastInteractionOn,
      name,
      org: orgName(ctx, lang),
      phone: ctx.size === "regular" ? `+81-90-7000-${seq}` : `+81-90-8000-${seq}`,
      region,
      role,
      updatedAt,
      version: 1,
    };
    push(ctx, "contact", id, data);
    made.push(ctx.out[ctx.out.length - 1]);
  });
  return made;
}

/** One JST moment per memo following `over_time`, sorted ascending. */
function memoMoments(ctx: Ctx): number[] {
  const moments: number[] = [];
  const add = (fromDay: string, toDay: string, count: number) => {
    for (let i = 0; i < count; i += 1) moments.push(momentBetween(ctx.rng, fromDay, toDay));
  };
  const monthEnd = (year: number, month: number) => dayOf(Date.UTC(year, month, 0, 12));
  const month = (year: number, m: number, count: number) => add(`${year}-${pad(m, 2)}-01`, monthEnd(year, m), count);
  if (ctx.size === "regular") {
    for (let m = 6; m <= 12; m += 1) month(2025, m, 10);
    for (let m = 1; m <= 10; m += 1) month(2026, m, 29);
    add("2026-11-01", "2026-11-14", 22);
  } else {
    for (let m = 1; m <= 12; m += 1) month(2024, m, 80);
    for (let m = 1; m <= 12; m += 1) month(2025, m, 150);
    for (let m = 1; m <= 10; m += 1) month(2026, m, 205);
    add("2026-11-01", "2026-11-14", 171);
  }
  return moments.sort((a, b) => a - b);
}

interface MemoGroup {
  contactId: string;
  count: number;
  from?: string;
  to?: string;
  /** Exact days (large: last-interaction supplements). */
  days?: string[];
}

function generateMemos(ctx: Ctx, contacts: readonly FixtureRecord[]): void {
  const rules = ctx.bulk.memos;
  const range = (rules.ids as string).match(/^([A-Z]+)(\d+)/u)!;
  const ids = rangeIds(range[1], Number(range[2]), rules.count);
  const moments = memoMoments(ctx);
  if (moments.length !== ids.length) throw new Error(`memo distribution ${moments.length} ≠ ${ids.length}`);
  const groups: MemoGroup[] = [];
  const supplements: { contactId: string; day: string }[] = [];
  if (ctx.size === "regular") {
    groups.push({ contactId: "RC01", count: 7, from: "2025-06-01", to: "2025-12-07" });
    groups.push({ contactId: "RC01", count: 93, from: "2025-12-09", to: "2026-11-14" });
  } else {
    groups.push({ contactId: "LC11", count: 134, from: "2025-03-15", to: "2026-10-27" });
    groups.push({ contactId: "LC13", count: 117, from: "2024-06-19", to: "2026-10-20" });
    groups.push({ contactId: "LC01", count: 57, to: "2026-09-30" });
    groups.push({ contactId: "LC02", count: 34, to: "2026-10-31" });
    groups.push({ contactId: "LC08", count: 47, to: "2026-11-04" });
    groups.push({ contactId: "LC09", count: 8 });
    for (const anchor of ctx.world.anchors) {
      if (anchor.kind === "contact" && anchor.account === ctx.account && typeof anchor.data.lastInteractionOn === "string") {
        supplements.push({ contactId: anchor.id, day: anchor.data.lastInteractionOn });
      }
    }
  }
  // Slots: assign constrained groups first, each to random free slots inside its window.
  const slotOwner: (string | null)[] = moments.map(() => null);
  const slotInteraction: boolean[] = moments.map(() => false);
  for (const supplement of supplements) {
    const candidates = moments.map((ms, index) => ({ index, ms })).filter(({ index, ms }) => slotOwner[index] === null && dayOf(ms) === supplement.day);
    let index: number;
    if (candidates.length) index = candidates[0].index;
    else {
      // Move one free slot of the same month onto that day, so the monthly totals stay as written.
      const sameMonth = moments.map((ms, i) => ({ i, ms })).filter(({ i, ms }) => slotOwner[i] === null && dayOf(ms).slice(0, 7) === supplement.day.slice(0, 7));
      index = sameMonth[0].i;
      moments[index] = jstMs(supplement.day, "12:00");
    }
    slotOwner[index] = supplement.contactId;
    slotInteraction[index] = true;
  }
  for (const group of groups) {
    const free = moments
      .map((ms, index) => ({ index, ms }))
      .filter(({ index, ms }) => slotOwner[index] === null && (!group.from || dayOf(ms) >= group.from) && (!group.to || dayOf(ms) <= group.to));
    if (free.length < group.count) throw new Error(`not enough memo slots for ${group.contactId}`);
    for (const { index } of ctx.rng.shuffle(free).slice(0, group.count)) slotOwner[index] = group.contactId;
  }
  const bulkContacts = contacts.map((contact) => contact.id);
  const perContact = new Map<string, number>();
  const cap = ctx.size === "regular" ? 12 : 40;
  const contactById = new Map(contacts.map((contact) => [contact.id, contact]));
  const order = moments.map((ms, index) => ({ index, ms })).sort((a, b) => a.ms - b.ms);
  order.forEach(({ index, ms }, position) => {
    const id = ids[position];
    const anchorOwner = slotOwner[index];
    let contactIds: string[] = [];
    if (anchorOwner) contactIds = [anchorOwner];
    else {
      const wanted = ctx.rng.int(0, 2);
      for (let attempt = 0; attempt < 20 && contactIds.length < wanted; attempt += 1) {
        const candidate = ctx.rng.pick(bulkContacts);
        if (contactIds.includes(candidate) || (perContact.get(candidate) ?? 0) >= cap) continue;
        contactIds.push(candidate);
        perContact.set(candidate, (perContact.get(candidate) ?? 0) + 1);
      }
    }
    const lang = ctx.rng.weighted(ctx.bulk.languages as Record<Lang, number>);
    const linkedBulk = contactIds.length && !anchorOwner ? contactById.get(contactIds[0]) : undefined;
    const org = linkedBulk ? String(linkedBulk.data.org) : null;
    const templates = MEMO_TEMPLATES[ctx.size][lang].filter((t) => org || !t.includes("{org}"));
    const sentences = ctx.rng.int(1, 3);
    const parts = ctx.rng.shuffle(templates).slice(0, sentences).map((t) => t.replace("{org}", org ?? ""));
    const body = parts.join(lang === "en" ? " " : "");
    const supplement = Boolean(anchorOwner && slotInteraction[index]);
    const finalBody = supplement ? (lang === "en" ? "Quick call today." : lang === "ja" ? "今日は短く電話した。" : "今天简单通了个电话。") : body;
    const withInteraction = supplement || (contactIds.length > 0 && ctx.rng.chance(0.3));
    const title = !supplement && ctx.rng.chance(0.25) ? ctx.rng.pick(MEMO_TITLES[ctx.size][lang]) : undefined;
    push(ctx, "memo", id, {
      body: finalBody,
      contactIds,
      createdAt: isoAt(ms),
      ...(lang === "zh" ? {} : { locale: lang }),
      ...(title ? { title } : {}),
      ...(withInteraction
        ? { interaction: { actualContactIds: [contactIds[0]], channel: ctx.rng.pick(["phone", "meeting", "message"]), direction: ctx.rng.pick(["incoming", "outgoing", "mutual"]), occurredOn: dayOf(ms), precision: "day" } }
        : {}),
      version: 1,
      ...(supplement ? { supplementFor: contactIds[0] } : {}),
    });
  });
}

function generatePlatformEvents(ctx: Ctx): string[] {
  const rules = ctx.bulk.platform_events;
  const range = (rules.ids as string).match(/^([A-Z]+)(\d+)/u)!;
  const ids = rangeIds(range[1], Number(range[2]), rules.count);
  const [from, to] = rules.date_range as [string, string];
  const topics = rules.topics as string[];
  const related = new Set<string>();
  if (ctx.size === "regular") {
    for (const id of ctx.rng.shuffle(ids.slice(5)).slice(0, 23)) related.add(id);
  } else {
    ids.slice(36, 36 + 198).forEach((id) => related.add(id));
  }
  const used = new Set<string>();
  ids.forEach((id, index) => {
    const n = index + 1;
    let ms: number;
    const clock = Date.parse(ctx.world.clock);
    if (ctx.size === "regular" && n <= 5) {
      const day = ctx.rng.pick(["2026-11-21", "2026-11-22"]);
      ms = n <= 3 ? jstMs(day, `${pad(ctx.rng.int(10, 15), 2)}:00`) : jstMs(day, `${pad(ctx.rng.int(18, 20), 2)}:30`);
    } else if (ctx.size === "large" && n <= 36) {
      ms = momentBetween(ctx.rng, "2026-11-16", "2026-11-22", [9, 20]);
    } else if (related.has(id)) {
      ms = momentBetween(ctx.rng, from, dayOf(clock - DAY), [10, 19]);
    } else {
      do {
        ms = momentBetween(ctx.rng, from, to, [10, 19]);
      } while (
        (ctx.size === "regular" && ["2026-11-21", "2026-11-22", "2026-11-28", "2026-11-29"].includes(dayOf(ms))) ||
        (ctx.size === "large" && dayOf(ms) >= "2026-11-16" && dayOf(ms) <= "2026-11-22")
      );
    }
    const topic = ctx.rng.pick(topics);
    let title = "";
    for (let k = 1; !title || used.has(title); k += 1) title = `${topic}${ctx.rng.pick(EVENT_FORMS[ctx.size])}${k > 1 ? ` 第${k}期` : ""}`;
    used.add(title);
    push(
      ctx,
      "platform_event",
      id,
      { fee: ctx.rng.pick(["免费", "1000 日元", "2000 日元", "3000 日元"]), startsAt: isoAt(ms), title, topics: [topic], venue: ctx.rng.pick(EVENT_VENUES[ctx.size]) },
      "platform",
    );
    if (related.has(id)) {
      ctx.out.push({ account: ctx.account, data: { eventId: id, status: ctx.rng.pick(["registered", "attended"]) }, id: `my:${id}`, kind: "my_event", origin: "bulk" });
    }
  });
  return ids;
}

function generateTodos(ctx: Ctx, contacts: readonly FixtureRecord[], eventIds: readonly string[]): void {
  const bulkContacts = contacts.map((contact) => contact.id);
  const plain = ctx.bulk.todos.plain;
  const plainRange = (plain.ids as string).match(/^([A-Z]+)(\d+)/u)!;
  const plainIds = rangeIds(plainRange[1], Number(plainRange[2]), plain.count);
  const clock = Date.parse(ctx.world.clock);
  const titleFor = (lang: Lang) => ctx.rng.pick(TODO_TITLES[ctx.size][lang]);
  const openSchedule = (onlyDue = false): { plannedDate: string | null; dueAt: string | null } => {
    const roll = onlyDue ? 0 : ctx.rng.int(0, 2);
    const day = dayOf(momentBetween(ctx.rng, "2026-11-16", "2026-12-31"));
    if (roll === 0) return { dueAt: `${day}T18:00:00${JST}`, plannedDate: null };
    if (roll === 1) return { dueAt: null, plannedDate: day };
    return { dueAt: null, plannedDate: null };
  };
  plainIds.forEach((id, index) => {
    const n = index + 1;
    const lang = ctx.rng.weighted(ctx.bulk.languages as Record<Lang, number>);
    let status: "open" | "completed";
    let relatedContactIds: string[] = [];
    let schedule: { plannedDate: string | null; dueAt: string | null } = { dueAt: null, plannedDate: null };
    if (ctx.size === "regular") {
      status = n <= 19 ? "open" : "completed";
      if (n <= 14) {
        schedule = ctx.rng.chance(0.5) ? { dueAt: `${dayOf(momentBetween(ctx.rng, "2026-11-16", "2026-12-31"))}T18:00:00${JST}`, plannedDate: null } : { dueAt: null, plannedDate: dayOf(momentBetween(ctx.rng, "2026-11-16", "2026-12-31")) };
      }
      if (ctx.rng.chance(0.7)) relatedContactIds = [ctx.rng.pick(bulkContacts)];
    } else if (n <= 61) {
      status = "open";
      relatedContactIds = ["LC08"];
      schedule = openSchedule();
    } else if (n <= 72) {
      status = "open";
      relatedContactIds = ["LC09"];
      schedule = openSchedule(true);
    } else if (n <= 92) {
      status = "completed";
      relatedContactIds = ["LC11"];
    } else {
      status = n <= 92 + (370 - 72) ? "open" : "completed";
      const count = ctx.rng.int(0, 2);
      relatedContactIds = ctx.rng.shuffle(bulkContacts).slice(0, count);
      if (status === "open") schedule = openSchedule();
    }
    const eventLink = !relatedContactIds.some((c) => !c.match(/\d{4,}$/u)) && ctx.rng.chance(ctx.size === "regular" ? 0.2 : 0.1) ? ctx.rng.pick(eventIds) : null;
    const completedAt = status === "completed" ? isoAt(momentBetween(ctx.rng, ctx.size === "regular" ? "2025-09-01" : "2025-01-01", "2026-11-14")) : null;
    push(ctx, "todo", id, {
      ...schedule,
      ...(completedAt ? { completedAt } : {}),
      relatedContactIds,
      ...(eventLink ? { relatedEventRefs: [{ id: eventLink, kind: "platform" }] } : {}),
      status,
      title: titleFor(lang),
      updatedAt: completedAt ?? isoAt(clock - ctx.rng.int(1, 60) * DAY),
    });
  });
  const followups = ctx.bulk.todos.formal_followups;
  const fRange = (followups.ids as string).match(/^([A-Z]+)(\d+)/u)!;
  rangeIds(fRange[1], Number(fRange[2]), followups.count).forEach((id, index) => {
    const open = index < followups.open;
    const lang = ctx.rng.weighted(ctx.bulk.languages as Record<Lang, number>);
    const due = open
      ? `${dayOf(momentBetween(ctx.rng, ctx.size === "regular" ? "2026-11-23" : "2026-11-16", ctx.size === "regular" ? "2026-12-20" : "2027-01-31"))}T18:00:00${JST}`
      : `${dayOf(momentBetween(ctx.rng, "2025-09-01", "2026-11-10"))}T18:00:00${JST}`;
    push(ctx, "followup", id, {
      contactId: ctx.rng.pick(bulkContacts),
      dueAt: due,
      status: open ? "open" : "completed",
      ...(open ? {} : { completedAt: isoAt(Date.parse(due) + ctx.rng.int(0, 3) * DAY) }),
      title: lang === "en" ? "Follow up on the last conversation" : lang === "ja" ? "前回の話をフォローする" : "跟进上次聊的事",
    });
  });
}

function generateSchedule(ctx: Ctx, contacts: readonly FixtureRecord[]): void {
  const rules = ctx.bulk.schedule;
  const range = (rules.ids as string).match(/^([A-Z]+)(\d+)/u)!;
  const ids = rangeIds(range[1], Number(range[2]), rules.count);
  const seriesCount = rules.series.count as number;
  const seriesTitles: string[] = rules.series.titles ?? LARGE_SERIES_TITLES;
  const [from, to] = rules.singles.date_range as [string, string];
  const bulkContacts = contacts.map((contact) => contact.id);
  ids.forEach((id, index) => {
    const series = index < seriesCount;
    let ms: number;
    do {
      ms = series ? momentBetween(ctx.rng, "2026-09-01", "2026-11-14", [8, 19]) : momentBetween(ctx.rng, from, to, [8, 19]);
      // Regular: nothing on 2026-11-16 (a Monday), so no weekly series on Mondays either.
    } while (ctx.size === "regular" && (series ? new Date(ms + 9 * 3_600_000).getUTCDay() === 1 : dayOf(ms) === "2026-11-16"));
    const title = series ? `${seriesTitles[index % seriesTitles.length]}${index >= seriesTitles.length ? `（${Math.floor(index / seriesTitles.length) + 1}）` : ""}` : ctx.rng.pick(SCHEDULE_TITLES[ctx.size]);
    push(ctx, "schedule", id, {
      contactIds: ctx.rng.chance(0.3) ? [ctx.rng.pick(bulkContacts)] : [],
      endsAt: isoAt(ms + 3_600_000),
      ...(series ? { recurrence: { frequency: "weekly" } } : {}),
      startsAt: isoAt(ms),
      timeZone: "Asia/Tokyo",
      title,
    });
  });
}

function generatePrivateEvents(ctx: Ctx): void {
  const rules = ctx.bulk.private_events;
  const range = (rules.ids as string).match(/^([A-Z]+)(\d+)/u)!;
  const [from, to] = rules.date_range as [string, string];
  rangeIds(range[1], Number(range[2]), rules.count).forEach((id) => {
    let ms: number;
    do {
      ms = momentBetween(ctx.rng, from, to, [10, 17]);
    } while (
      (ctx.size === "regular" && ["2026-11-21", "2026-11-22", "2026-11-28", "2026-11-29"].includes(dayOf(ms))) ||
      (ctx.size === "large" && dayOf(ms) >= "2026-11-16" && dayOf(ms) <= "2026-11-22")
    );
    push(ctx, "private_event", id, { startsAt: isoAt(ms), title: ctx.rng.pick(PRIVATE_EVENT_TITLES[ctx.size]), venue: ctx.rng.pick(EVENT_VENUES[ctx.size]), version: 1 });
  });
}

function generateMemory(ctx: Ctx): void {
  const rules = ctx.bulk.memory;
  if (!rules?.count) return;
  const range = (rules.ids as string).match(/^([A-Z]+)(\d+)/u)!;
  const ids = rangeIds(range[1], Number(range[2]), rules.count);
  let cursor = 0;
  for (const [category, count] of Object.entries(rules.by_category as Record<keyof typeof MEMORY_TEMPLATES, number>)) {
    const contents = MEMORY_TEMPLATES[category as keyof typeof MEMORY_TEMPLATES];
    for (let i = 0; i < count; i += 1) {
      push(ctx, "memory", ids[cursor], { appliesTo: [MEMORY_APPLIES[category as keyof typeof MEMORY_APPLIES][i % 3]], category, content: contents[i % contents.length], revision: 1 });
      cursor += 1;
    }
  }
}

/** Messages of a conversation: key turns where written, filler elsewhere. */
export function materializeConversation(conversation: Record<string, any>, seed: number): { role: "user" | "assistant"; text: string; at: string; refs?: unknown; recordRefs?: unknown }[] {
  const rng = new Rng(seed);
  const turns = Number(conversation.turns ?? conversation.messages?.length ?? 0);
  if (Array.isArray(conversation.messages)) return conversation.messages;
  const start = Date.parse(conversation.startedAt);
  const end = Date.parse(conversation.lastActivityAt);
  const key = new Map<number, any>((conversation.key_turns ?? []).map((turn: any) => [Number(turn.turn), turn]));
  const language = String(conversation.language ?? "");
  const lang: Lang = language.startsWith("日") ? "ja" : language.startsWith("英") ? "en" : "zh";
  const messages: { role: "user" | "assistant"; text: string; at: string; refs?: unknown; recordRefs?: unknown }[] = [];
  for (let turn = 1; turn <= turns; turn += 1) {
    const atMs = key.get(turn)?.at ? Date.parse(key.get(turn).at) : start + Math.round(((end - start) * (turn - 1)) / Math.max(1, turns - 1));
    const keyTurn = key.get(turn);
    const [user, assistant] = keyTurn ? [keyTurn.user, keyTurn.assistant] : rng.pick(FILLER[lang]);
    messages.push({ at: isoAt(atMs), role: "user", text: user, ...(keyTurn?.refs ? { refs: keyTurn.refs } : {}) });
    messages.push({ at: isoAt(atMs + 20_000), role: "assistant", text: assistant, ...(keyTurn?.recordRefs ? { recordRefs: keyTurn.recordRefs } : {}) });
  }
  return messages;
}

function generateConversations(ctx: Ctx): void {
  const rules = ctx.bulk.conversations;
  const range = (rules.ids as string).match(/^([A-Z]+)(\d+)/u)!;
  const [minTurns, maxTurns] = ctx.size === "regular" ? [2, 18] : [1, 30];
  rangeIds(range[1], Number(range[2]), rules.count).forEach((id) => {
    const turns = ctx.rng.int(minTurns, maxTurns);
    const last = momentBetween(ctx.rng, "2026-08-01", "2026-11-14", [9, 21]);
    const lang = ctx.rng.weighted(ctx.bulk.languages as Record<Lang, number>);
    const start = last - turns * 120_000;
    const messages = Array.from({ length: turns }, (_, turn) => {
      const [user, assistant] = ctx.rng.pick(FILLER[lang]);
      const at = start + turn * 120_000;
      return [
        { at: isoAt(at), role: "user" as const, text: user },
        { at: isoAt(at + 20_000), role: "assistant" as const, text: assistant },
      ];
    }).flat();
    push(ctx, "conversation", id, { lastActivityAt: messages[messages.length - 1].at, messages, title: messages[0].text.slice(0, 20), turns });
  });
}

export interface GeneratedWorld {
  records: FixtureRecord[];
}

/** Bulk records of a regular or large world; base-v1 has none. Anchor conversations are materialized too. */
export function generateBulkWorld(world: WorldFixture): GeneratedWorld {
  if (!world.bulk) return { records: [] };
  const size = world.version.startsWith("regular") ? "regular" : "large";
  const ctx: Ctx = { account: world.mainAccount, bulk: world.bulk, out: [], rng: new Rng(Number(world.bulk.seed)), size, world };
  const contacts = generateContacts(ctx);
  const eventIds = generatePlatformEvents(ctx);
  generateMemos(ctx, contacts);
  generateTodos(ctx, contacts, eventIds);
  generateSchedule(ctx, contacts);
  generatePrivateEvents(ctx);
  generateMemory(ctx);
  generateConversations(ctx);
  return { records: ctx.out };
}

/** All records of a world: anchors (conversations materialized) plus bulk. */
export function worldRecords(world: WorldFixture, generated = generateBulkWorld(world)): FixtureRecord[] {
  const anchors = world.anchors.map((record, index) =>
    record.kind === "conversation" && !Array.isArray(record.data.messages)
      ? { ...record, data: { ...record.data, messages: materializeConversation(record.data, Number(world.bulk?.seed ?? 1) + index) } }
      : record,
  );
  return [...anchors, ...generated.records];
}

function bulkStrings(record: FixtureRecord): string[] {
  const data = record.data;
  const strings = [data.name, data.org, data.role, data.title, data.body, data.content, data.venue, ...((data.topics as string[]) ?? []), ...((data.tags as string[]) ?? [])];
  if (record.kind === "conversation") for (const message of (data.messages as { text: string }[]) ?? []) strings.push(message.text);
  return strings.filter((value): value is string => typeof value === "string");
}

function containsForbidden(text: string, word: string): boolean {
  if (/^[\x20-\x7e]+$/u.test(word)) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    return new RegExp(`(^|[^A-Za-z])${escaped}($|[^A-Za-z])`, "iu").test(text);
  }
  return text.includes(word);
}

/** Problems with the generated world against `scale`, `facts` and `must_not_produce`; [] when all hold. */
export function verifyWorldFacts(world: WorldFixture, generated = generateBulkWorld(world)): string[] {
  const problems: string[] = [];
  if (!world.bulk || !world.scale) return problems;
  const account = world.mainAccount;
  const all = worldRecords(world, generated);
  const mine = (kind: FixtureRecord["kind"]) => all.filter((record) => record.kind === kind && record.account === account);
  const expectEqual = (label: string, actual: number, expected: number) => {
    if (actual !== expected) problems.push(`${label}: ${actual} ≠ ${expected}`);
  };
  const scale = world.scale;
  expectEqual("contacts", mine("contact").length, scale.contacts);
  expectEqual("memos", mine("memo").length, scale.memos);
  expectEqual("todos (with formal follow-ups)", mine("todo").length + mine("followup").length, scale.todos.total);
  expectEqual("formal follow-ups", mine("followup").length, scale.todos.formal_followups);
  expectEqual("schedule", mine("schedule").length, scale.schedule.total);
  expectEqual("recurring series", mine("schedule").filter((record) => record.data.recurrence).length, scale.schedule.recurring_series);
  expectEqual("private events", mine("private_event").length, scale.private_events);
  expectEqual("platform events", all.filter((record) => record.kind === "platform_event").length, scale.platform_events.total);
  expectEqual("platform events related to me", mine("my_event").length, scale.platform_events.related_to_me);
  expectEqual("memory", mine("memory").length, scale.memory);
  expectEqual("conversations", mine("conversation").length, scale.conversations.total);
  const longest = Math.max(...mine("conversation").map((record) => (record.data.messages as unknown[]).length / 2));
  if (scale.conversations.longest_turns) expectEqual("longest conversation turns", longest, scale.conversations.longest_turns);
  if (scale.conversations.over_100_turns) {
    expectEqual("conversations over 100 turns", mine("conversation").filter((record) => (record.data.messages as unknown[]).length / 2 > 100).length, scale.conversations.over_100_turns);
  }
  // Names unique; bulk never uses anchor names or forbidden words.
  const names = mine("contact").map((record) => String(record.data.name));
  const duplicateBulk = generated.records.filter((record) => record.kind === "contact").map((record) => record.data.name);
  if (new Set(duplicateBulk).size !== duplicateBulk.length) problems.push("duplicate bulk contact names");
  const anchorNames = new Set(world.anchors.filter((record) => record.kind === "contact").map((record) => record.data.name));
  if (generated.records.some((record) => record.kind === "contact" && anchorNames.has(record.data.name))) problems.push("a bulk contact has an anchor's name");
  void names;
  const forbidden = world.bulk.must_not_produce ?? {};
  const words: string[] = [...(forbidden.surnames ?? []), ...(forbidden.en_names ?? []), ...(forbidden.orgs ?? []), ...(forbidden.words ?? [])];
  for (const record of generated.records) {
    if (record.data.supplementFor) continue;
    for (const text of bulkStrings(record)) {
      const hit = words.find((word) => containsForbidden(text, word));
      if (hit) {
        problems.push(`${record.id} contains forbidden "${hit}": ${text}`);
        break;
      }
    }
  }
  const memosOf = (contactId: string) =>
    mine("memo")
      .filter((record) => (record.data.contactIds as string[] | undefined)?.includes(contactId))
      .sort((a, b) => Date.parse(String(b.data.createdAt)) - Date.parse(String(a.data.createdAt)));
  const facts = world.bulk.facts ?? {};
  const openTodos = mine("todo").filter((record) => record.data.status === "open").length;
  const openFollowups = mine("followup").filter((record) => record.data.status === "open").length;
  if (facts.open_todos) {
    expectEqual("open plain todos", openTodos, facts.open_todos.plain);
    expectEqual("open formal follow-ups", openFollowups, facts.open_todos.formal_followups);
  }
  if (world.version.startsWith("regular")) {
    expectEqual("contacts_tokyo_retail", mine("contact").filter((record) => record.data.region === "东京" && record.data.industry === "零售").length, facts.contacts_tokyo_retail.count);
    const rc01 = memosOf("RC01");
    expectEqual("memos_linked_to_RC01", rc01.length, facts.memos_linked_to_RC01.count);
    expectEqual("RM05 rank among RC01 memos", rc01.findIndex((record) => record.id === "RM05") + 1, 97);
    const huiyou = mine("memo").filter((record) => String(record.data.body).includes("灰釉")).map((record) => record.id).sort();
    if (huiyou.join() !== [...facts.memos_with_word_灰釉].sort().join()) problems.push(`memos with 灰釉: ${huiyou.join()}`);
    const weekend = (days: string[]) => all.filter((record) => record.kind === "platform_event" && typeof record.data.startsAt === "string" && days.includes(dayOf(Date.parse(String(record.data.startsAt))))).length;
    expectEqual("platform events 11-21/22", weekend(["2026-11-21", "2026-11-22"]), facts["platform_events_starting_2026-11-21_or_22"].count);
    expectEqual("platform events 11-28/29", weekend(["2026-11-28", "2026-11-29"]), 0);
    const contactsByUpdate = mine("contact").sort((a, b) => Date.parse(String(b.data.updatedAt)) - Date.parse(String(a.data.updatedAt)) || String(a.id).localeCompare(String(b.id)));
    const lastThree = contactsByUpdate.slice(-3).map((record) => record.id).sort().join();
    if (lastThree !== "RC13,RC14,RC15") problems.push(`last three contacts by update: ${lastThree}`);
    if (mine("schedule").some((record) => record.origin === "bulk" && dayOf(Date.parse(String(record.data.startsAt))) === "2026-11-16")) problems.push("a bulk schedule item on 2026-11-16");
  } else {
    expectEqual("contacts_in_singapore", mine("contact").filter((record) => record.data.region === "新加坡").length, facts.contacts_in_singapore.count);
    expectEqual("singapore and semiconductor", mine("contact").filter((record) => record.data.region === "新加坡" && record.data.industry === "半导体").length, facts.contacts_in_singapore_and_semiconductor.count);
    const lc11 = memosOf("LC11");
    expectEqual("memos_linked_to_LC11", lc11.length, facts.memos_linked_to_LC11.count);
    if (lc11.slice(0, 4).map((record) => record.id).join() !== "LM17,LM16,LM14,LM15") problems.push(`first four LC11 memos: ${lc11.slice(0, 4).map((r) => r.id).join()}`);
    expectEqual("LM12 rank", lc11.findIndex((record) => record.id === "LM12") + 1, 140);
    const lc13 = memosOf("LC13");
    expectEqual("memos_linked_to_LC13", lc13.length, facts.memos_linked_to_LC13.count);
    expectEqual("LM06 rank", lc13.findIndex((record) => record.id === "LM06") + 1, 1);
    expectEqual("LM04 rank", lc13.findIndex((record) => record.id === "LM04") + 1, 120);
    expectEqual("memos_linked_to_LC01", memosOf("LC01").length, facts.memos_linked_to_LC01.count);
    expectEqual("memos_linked_to_LC02", memosOf("LC02").length, facts.memos_linked_to_LC02.count);
    expectEqual("LM03 newest of LC02", memosOf("LC02").findIndex((record) => record.id === "LM03") + 1, 1);
    expectEqual("memos_linked_to_LC08", memosOf("LC08").length, facts.memos_linked_to_LC08.count);
    const openOf = (contactId: string) => mine("todo").filter((record) => record.data.status === "open" && (record.data.relatedContactIds as string[] | undefined)?.includes(contactId)).length;
    expectEqual("open_todos_linked_to_LC08", openOf("LC08"), facts.open_todos_linked_to_LC08.count);
    expectEqual("open_todos_linked_to_LC09", openOf("LC09"), facts.open_todos_linked_to_LC09.count);
    const week = all.filter((record) => record.kind === "platform_event" && typeof record.data.startsAt === "string" && dayOf(Date.parse(String(record.data.startsAt))) >= "2026-11-16" && dayOf(Date.parse(String(record.data.startsAt))) <= "2026-11-22").length;
    expectEqual("platform events 11-16..22", week, facts["platform_events_2026-11-16_to_22"].count);
    const semiconductorStale = mine("contact").filter((record) => {
      if (record.data.industry !== "半导体") return false;
      const last = typeof record.data.lastInteractionOn === "string" ? record.data.lastInteractionOn : null;
      return last !== null && last <= "2026-09-16";
    }).length;
    expectEqual("semiconductor last interaction ≤ 2026-09-16", semiconductorStale, facts["semiconductor_contacts_last_interaction_on_or_before_2026-09-16"].count);
    const supplements = mine("memo").filter((record) => record.data.supplementFor);
    for (const supplement of supplements) {
      const anchor = world.anchors.find((record) => record.id === supplement.data.supplementFor);
      if (anchor && dayOf(Date.parse(String(supplement.data.createdAt))) !== anchor.data.lastInteractionOn) problems.push(`supplement for ${anchor.id} is not on its lastInteractionOn`);
    }
  }
  return problems;
}
