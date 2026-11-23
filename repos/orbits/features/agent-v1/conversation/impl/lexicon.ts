// @ts-nocheck -- conversation/impl/lexicon.ts: copied byte for byte from lab-conv repos/orbits/lab/conversation/rsi/archive/r12-maintenance/impl/lexicon.ts
// (lab commit c13d85089, r12 = r11 + when to ask round 3: contact exact picks, the stated kind wins over title words, a plural pronoun with no recent people goes without binding). Only these two header lines differ; the lab code does not pass this repo's build typecheck.
/**
 * General vocabulary (zh / ja / en): pronouns, pointer words, ordinals, record-kind words, follow-up markers, honorifics,
 * role synonyms, generic company suffixes and city names. Nothing here is this world's content. Everything is compared
 * after fold() (simplified Chinese, hiragana, lower case), so the lists are folded when used.
 */
import { fold, fre } from "./text";
import type { RecordKind } from "../types";

const F = (xs: string[]) => xs.map(fold);

export const COMPOUND_SURNAMES = F(["欧阳", "司马", "诸葛", "上官", "东方", "皇甫", "尉迟", "公孙", "慕容", "长孙", "宇文", "司徒", "夏侯", "令狐", "独孤", "端木", "西门", "南宫"]);

export const HONORIFICS = F(["さん", "様", "さま", "先生", "老师", "老板", "总", "君", "ちゃん", "氏", "女士", "小姐", "mr.", "ms.", "mrs.", "mr", "ms"]);

/** Role words → fragments of a job title they fit (title strings folded). */
export const ROLE_SYNONYMS: [string[], string[]][] = [
  [F(["律师", "弁護士", "lawyer", "律所", "法律事務所", "attorney", "bengoshi"]), F(["律师", "弁護士"])],
  [F(["助理", "assistant", "アシスタント"]), F(["助理", "assistant"])],
  [F(["经理", "マネージャー", "manager", "マネジャー"]), F(["经理", "マネージャー", "manager"])],
  [F(["质量", "品質", "品质", "quality"]), F(["质量", "品質", "quality"])],
  [F(["销售", "営業", "sales"]), F(["销售", "営業", "sales"])],
  [F(["部长", "部長", "部長さん", "bucho", "buchou"]), F(["部長", "部长"])],
  [F(["课长", "課長", "kacho", "kachou"]), F(["課長", "课长"])],
  [F(["总监", "director", "ディレクター"]), F(["总监", "director"])],
  [F(["采购", "購買", "purchasing", "procurement"]), F(["采购", "購買", "purchasing"])],
  [F(["副总"]), F(["副总"])],
  [F(["厂长", "工場長"]), F(["厂长"])],
  [F(["社长", "社長", "president", "ceo", "shacho", "shachou"]), F(["社长", "社長", "ceo"])],
  [F(["代表"]), F(["代表"])],
  [F(["取締役", "董事"]), F(["取締役", "董事"])],
  [F(["支店長", "支行长", "branch manager"]), F(["支店長"])],
  [F(["合伙人", "partner"]), F(["合伙人", "partner"])],
  [F(["设计师", "デザイナー", "designer"]), F(["设计师"])],
  [F(["财务", "経理"]), F(["财务"])],
  [F(["cto"]), F(["cto"])],
];

export const COMPANY_SUFFIXES = F([
  "株式会社", "有限公司", "股份有限公司", "集团", "公司", "合同会社", "精密", "建材", "生物", "物流", "咨询", "科技", "茶业", "电子", "律师事务所", "法律事務所",
  "事务所", "化工", "传媒", "会展", "投资", "设计", "工作室", "模具", "化成", "精機", "精机", "広告", "广告", "ロジスティクス", "銀行", "银行", "商事", "商社", "贸易",
  "电器", "工業", "工业", "制造", "製作所", "制作所", "コワーキング", "振興公社", "公社", "中小企業", "中小企业",
  "实业", "控股", "网络", "信息", "软件", "能源", "医药", "制药", "食品", "服装", "汽车", "地产", "置业", "餐饮", "文化", "教育", "金融", "证券", "保险", "机械", "環境", "环保", "材料", "半导体", "通信", "航运", "船务", "国际", "商贸", "供应链", "技术", "产业", "工作所", "不動産", "証券", "保険", "製薬", "食品工業", "運輸", "运输", "物産", "產業", "産業", "電機", "電子", "技研", "システム", "ホールディングス", "グループ", "ジャパン",
]);

export const CITY_WORDS = F(["上海", "北京", "深圳", "广州", "杭州", "苏州", "南京", "天津", "重庆", "成都", "武汉", "西安", "香港", "台北", "东京", "東京都", "大阪", "名古屋", "横浜", "京都", "福冈", "札幌", "神户"]);

// ---------------------------------------------------------------- pointers, pronouns, ordinals

export const PERSON_PRONOUN_F = F(["她", "彼女", "she", "her"]);
export const PERSON_PRONOUN_M = F(["他", "彼", "he", "him", "his"]);
export const PERSON_PRONOUN_ANY = F(["这人", "那人", "此人", "その人", "あの人", "この人", "那个人", "这个人", "那位", "这位", "その方", "あの方", "them", "they", "ta"]);

/** Classifier / pointer words → the kinds of record they can point at. */
export const POINTER_KINDS: [string[], RecordKind[]][] = [
  [F(["那篇", "这篇", "那份纪要", "那份笔记", "那份记录", "该篇"]), ["memo"]],
  [F(["那场", "这场", "那届", "那期"]), ["event"]],
  [F(["那位", "这位", "那个人", "这个人", "その人", "あの人", "その方", "あの方", "この方", "窓口", "对接人", "联系窗口", "担当者", "contact person", "point of contact"]), ["contact"]],
  [F(["那条", "这条", "那件", "这件", "那项"]), ["todo", "schedule", "memo"]],
];

export const KIND_WORDS: [RecordKind, string[]][] = [
  ["todo", F(["待办", "代办", "todo", "to-do", "to do", "todos", "タスク", "task", "tasks", "提醒", "リマインド", "remind", "任务", "やること", "要做的事", "要做的", "名下", "reminder"])],
  ["memo", F(["笔记", "纪要", "备忘", "备忘录", "memo", "memos", "メモ", "ノート", "notes", "note", "議事録", "记录", "會議紀錄"])],
  ["schedule", F(["日程", "安排", "予定", "schedule", "calendar", "appointment", "日历", "行程", "约个时间", "约个 meeting", "meeting", "打ち合わせ", "会议", "1:1", "call with", "电话会议", "スケジュール", "カレンダー", "开会", "啥会", "什么会", "几个会", "冲突", "撞上", "かぶって", "重なって", "clash", "clashes", "conflict", "conflicts", "double-booked"])],
  ["event", F(["活动", "イベント", "event", "events", "展会", "展示会", "セミナー", "seminar", "交流会", "峰会", "研讨会", "meetup", "论坛", "フォーラム", "summit", "展览", "博览会", "音乐会", "コンサート", "concert", "trade show", "workshop", "ワークショップ"])],
  ["contact", F(["联系人", "連絡先", "contact", "contacts", "谁", "誰", "哪几位", "哪些人", "什么人", "是做什么的", "的人", "の人", "電話番号", "电话号码", "手机号", "phone number", "公司叫什么", "哪家公司", "会社",
    "联系方式", "联络方式", "联系电话", "邮箱", "名片", "メールアドレス", "メアド", "連絡方法", "contact info", "contact details", "email address"])],
];

export const ORDINAL_WORDS: [RegExp, (m: RegExpExecArray) => number][] = [];

const CN_DIGIT: Record<string, number> = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
const EN_ORD: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, "1st": 1, "2nd": 2, "3rd": 3, "4th": 4, "5th": 5 };
const num = (s: string) => (/^\d+$/.test(s) ? Number(s) : CN_DIGIT[s] ?? (s === "十" ? 10 : NaN));

/** The ordinal a phrase uses (第二个 / 2番目 / 二番目 / 3つ目 / 1人目 / the second one / #3), 0 = none; -1 = the last one. */
export function ordinalOf(t: string): { n: number; kind?: RecordKind; at: [number, number] } | null {
  // r10: an edition number (第<n>届 / 第3回) and a day count (第二天) are no list positions
  let m = /第\s*([一二两三四五六七八九十\d]+)(?![\d一二两三四五六七八九十]|\s*(?:届|回|期|次|版|号|代|年|季|天|周|週))\s*(个|条|篇|场|位|件|项|个人|名|点)?/u.exec(t);
  if (m && m[2] !== "点") {
    const k = m[2] === "位" || m[2] === "个人" || m[2] === "名" ? "contact" : m[2] === "篇" ? "memo" : m[2] === "场" ? "event" : undefined;
    return { n: num(m[1]), kind: k, at: [m.index, m.index + m[0].length] };
  }
  m = fre(/([一二三四五六七八九十\d]+)\s*(番目|つ目|个目|個目|件目|人目|本目)/u).exec(t);
  if (m) return { n: num(m[1]), kind: m[2] === "人目" ? "contact" : undefined, at: [m.index, m.index + m[0].length] };
  m = /\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|1st|2nd|3rd|4th|5th)\b/u.exec(t);
  if (m) return { n: EN_ORD[m[1]], at: [m.index, m.index + m[0].length] };
  m = /#\s*(\d+)/u.exec(t);
  if (m) return { n: Number(m[1]), at: [m.index, m.index + m[0].length] };
  m = fre(/(最后(?:一|那|这)?[个条篇场位]|最後の|the last one|the last (?:task|todo|note|memo|event|item))/u).exec(t);
  if (m) return { n: -1, at: [m.index, m.index + m[0].length] };
  return null;
}

/** "the one asked first" markers: point at the earliest mention of the kind, not a list position. */
export const BEGINNING = F(["最开始", "一开始", "最早", "最初", "一番最初", "初めに", "at the start", "at the beginning", "very first"]);
/** Pointer words that do not say the kind. */
export const BARE_POINTERS = F([
  "那个", "这个", "那些", "这些", "它", "它们", "那件事", "这件事", "那事", "那条", "这条", "那份", "这份",
  "それ", "これ", "あれ", "そっち", "こっち", "あっち", "そちら", "あちら", "その件", "例の件", "例のやつ", "さっきの", "そのやつ", "そいつ", "あの件",
  "it", "that", "this", "that one", "this one", "those", "these",
]);
export const RECENT_MARKERS = F(["刚才", "刚刚", "方才", "さっき", "先ほど", "先程", "earlier", "just now", "a moment ago"]);
/** Words that anchor a reference to a particular earlier list / time of the talk (it is not a bare pointer). */
export const ANCHOR_WORDS = F(["昨天", "昨日", "昨晚", "昨夜", "yesterday", "last night", "清单", "列表", "一覧", "リスト", "list", "那份", "那张", "去过的", "行った"]);

// ---------------------------------------------------------------- follow-up markers

export const CORRECT_MARKERS = F([
  "不是", "不对", "搞错", "弄错", "看错", "错了", "我说的是", "我问的是", "我要的是", "我指的是", "说的是", "不要笔记", "其实是",
  "じゃなくて", "じゃない", "ではなく", "ではない", "違う", "ちがう", "間違", "のことだった", "のことなんだけど", "のこと",
  "no, i meant", "i meant", "not that", "wrong", "i said", "i asked about", "not the", "it's not", "isn't",
  "我是说", "我是问", "我想问的是", "我问的其实是", "应该是", "才对", "说错", "弄混", "搞混", "记错",
  "のつもり", "のことです", "のことなんです", "違くて", "ちゃう", "間違えた", "勘違い",
  "i mean", "should be", "actually i", "mixed up", "rather than", "instead of",
]);
export const REPEAT_MARKERS = F(["再给我看", "再看一次", "再看一遍", "再列一遍", "再列一次", "再发一遍", "再发一次", "再来一次", "再来一遍", "再给我", "重新列", "再show", "再 show", "再贴", "再看下", "再给我看看",
  "もう一度", "もう一回", "もう1回", "再表示", "again", "once more", "one more time", "re-list", "relist", "pull up"]);
export const REPEAT_TRIGGERS = F(["again", "もう一度", "もう一回", "もう1回", "再", "改めて", "再度", "重新", "repeat", "once more"]);
export const DISPLAY_VERBS = F(["看", "列", "发", "show", "見せ", "みせ", "出して", "一覧", "list", "pull", "贴", "来一次", "来一遍", "please", "表示", "给我", "显示", "展示", "出一下", "see", "view", "display", "send", "list them", "お願い"]);
export const ONLY_MARKERS = F(["只要", "只看", "只留", "只列", "只显示", "只给", "就要", "仅", "だけ", "のみ", "only", "just the", "just ", "绞", "絞", "限定", "filter", "留没", "留下", "就看", "光看", "仅看", "单看", "只剩", "just", "solely", "limit to", "narrow", "ばかり", "限って", "に限る"]);
export const ADJUST_ADD = F(["也加上", "加上", "也加", "加进来", "加进去", "也算", "算进来", "也列", "一起列", "一起加", "也一起", "入れて", "入れと", "も入れ", "加えて", "追加して", "一緒に並べ", "も一緒", "throw in", "include", "add the", "too", "as well", "也要", "算上", "也放进", "放进来", "补上", "含めて", "足して", "も追加", "も足", "も出して", "も並べ", "も見せ", "plus the", "also add", "also show", "along with"]);
export const ADJUST_REMOVE = F(["去掉", "拿掉", "删掉那", "别列", "不要列", "不用列", "除掉", "排除", "除外", "外して", "抜いて", "drop", "remove", "leave out", "without", "except", "不用列", "就别列", "不要显示", "不显示", "别显示", "除いて", "抜きで", "なしで", "省いて", "外し", "不要了", "就不要了", "别要了", "消しといて", "skip the", "exclude", "minus", "get rid of", "take out"]);
export const THIS_TIME = F(["这次", "这回", "这一次", "今回", "今度は", "this time", "for now"]);
export const SESSION_SCOPE = F(["以后", "之后", "今后", "往后", "从现在起", "接下来", "これから", "今後", "以降", "from now on", "going forward", "always",
  // r07: "in this conversation / chat" (the whole talk, not "this time")
  "这次对话", "这次聊天", "本次对话", "这个对话", "这段对话", "整个对话", "这次会话", "这轮对话", "今天的对话", "この会話", "このチャット", "今回の会話", "この話の間", "this conversation", "this chat", "rest of the chat", "rest of this chat", "for this session"]);
export const FOLLOW_MARKERS_START = F(["那", "那么", "じゃあ", "では", "それじゃ", "and", "what about", "how about", "ok, and", "and the"]);
export const FOLLOW_MARKERS_END = F(["呢", "は", "は?", "はどう", "はどうなる", "だと", "だとどう", "のほうは", "の方は", "the same?"]);
export const LIST_POINTERS = F([
  "这几个", "这几场", "这几条", "这几篇", "这几位", "这些", "那些", "这里面", "这其中", "里面", "里头", "其中", "这两", "这三", "这四", "那两", "那三", "哪个", "哪条", "哪场", "哪篇", "哪位", "哪一",
  "この中", "このうち", "その中", "そのうち", "どれ", "どっち", "どちら", "の中で",
  "which of", "which one", "of these", "of those", "the two", "these", "those", "which is", "which should",
]);

export const DEFER_MARKERS = F(["先不管", "先放", "放一放", "放放", "等会儿", "等一下再", "回头再", "以后再说", "再说吧", "先别管", "别管", "先搁", "不急", "晚点再", "改天",
  "後で", "あとで", "後回し", "あと回し", "置いといて", "置いておいて", "一旦置", "また今度", "今度でいい", "それは後", "暂缓", "回头说", "later", "hold off", "put that aside", "on hold", "park that", "never mind", "forget it", "hold that", "skip that", "先不说", "不说这个", "这个先不说", "それはさておき", "それは置いといて"]);
export const UNSURE_MARKERS = F(["我想想", "让我想想", "想一想", "考虑一下", "考える", "考えさせて", "考えます", "検討します", "let me think", "think about it", "need to think", "记不清", "想不起", "忘了", "不记得", "不确定", "说不清", "都行", "都可以", "无所谓", "随便", "你定", "你看着办", "你决定", "差不多", "哪个都", "你懂的", "都一样",
  "忘れ", "思い出せ", "わからない", "分からない", "どっちでも", "どちらでも", "任せ", "まかせ", "どれでも", "だってば", "なんでもいい",
  "not sure", "can't remember", "cannot remember", "don't remember", "no idea", "whichever", "either", "you pick", "you choose", "up to you", "any of", "doesn't matter", "dunno", "no preference", "either is fine", "either way", "whatever works"]);
export const VAGUE_TIME = F(["过几天", "过阵子", "过段时间", "以后", "回头", "改天", "そのうち", "近いうち", "いつか", "later", "sometime", "some day", "soon"]);
export const NEGATION_AFTER = F(["别动", "不动", "不要", "不用", "不改", "别改", "そのまま", "じゃなくて", "ではなく", "はいい", "stays", "unchanged", "not"]);
export const ACK_ONLY = F(["嗯", "好", "好的", "知道了", "明白", "了解", "收到", "行", "ok", "okay", "got it", "thanks", "うん", "わかった", "了解です", "はい"]);
/** r11: a typed confirmation (the words a person types instead of clicking a confirm button). */
export const CONFIRM_WORDS = F(["确认", "確認", "确定", "確定", "确认无误", "没问题", "可以", "对", "对的", "是的", "执行", "就这样", "就这么办", "嗯嗯",
  "承認", "お願いします", "お願い", "それで", "それでお願いします", "いいよ", "いいです", "大丈夫", "オッケー", "おけ", "おっけー", "了解しました", "承知しました",
  "confirm", "confirmed", "i confirm", "yes", "yep", "yeah", "yup", "sure", "go ahead", "do it", "approve", "approved", "sounds good", "looks good", "lgtm", "please do"]);

// ---------------------------------------------------------------- verbs, status

export const VERB_WORDS: [string, string[]][] = [
  ["delete", F(["删", "删除", "去掉这", "消して", "消しと", "消しておい", "消去", "削除", "delete", "remove"])],
  ["complete", F(["完成", "勾掉", "搞定", "做完了", "弄完了", "标成完成", "标完成", "完了に", "完了で", "済み", "done", "mark", "complete", "finished"])],
  ["link", F(["关联", "紐づけ", "紐付け", "link"])],
  ["create", F(["建个", "建一个", "创建", "新建", "加个", "加一个", "添加", "记个", "记一下", "记一个", "作って", "作っと", "追加", "入れて", "入れと", "入れたい", "入れよう", "make a", "add a", "create", "remind me", "提醒我", "リマインド", "约他", "约个", "set up", "帮我记", "建一条", "也建", "新規作成", "作成して", "作成しと", "记一篇", "记一条", "写一篇", "加一条", "add one more", "one more todo", "one more task"])],
  ["update", F(["改到", "改成", "改个", "改一下", "挪", "推到", "推迟", "延后", "提前", "前倒し", "延ば", "ずら", "移して", "変えて", "変えと", "変えてお", "変更", "push", "move", "reschedule", "备注", "メモ足", "postpone", "报个名", "申し込", "停一次", "sign up", "转给", "分享给", "共有", "転送", "share", "早め", "遅らせ", "ずらせ", "変更でき", "動かせ", "に変更", "に移動", "改为", "调到", "换到", "往后推", "推一推", "后ろにず", "後ろにず"])],
];

export const OPEN_WORDS = F(["没做", "未完成", "还没", "没完成", "没做完", "没弄", "开着", "未完了", "終わってない", "終わっていない", "まだ", "残って", "open", "still need", "pending", "outstanding", "still owe", "not done", "unfinished", "留没做", "没做的"]);
export const DONE_WORDS = F(["做完的", "已完成", "完成的", "完了済み", "終わった", "done ones", "completed"]);
export const NEG_DONE = F(["出さないで", "不要", "不用看", "别给", "别列", "除外", "不显示", "去掉", "drop", "hide", "don't show", "不看"]);

export const STATEMENT_MARKERS = F(["出張", "都在", "なんだ", "予定です", "行ってくる", "向かう", "滞在", "我下周", "我在", "我要", "我会", "我有空", "我请假", "我去", "要去", "出差", "にいる", "に行く", "行きます", "いるから", "休み", "有空", "请假", "i'll be", "i will be", "i'm in", "i am in", "i'm off", "i'm free"]);

export const QUESTION_MARKERS = F(["吗", "呢", "啥", "咋", "多会儿", "いくつ", "ある？", "ある?", "？", "?", "什么", "哪", "几", "多少", "谁", "怎么", "是不是", "有没有", "了没", "没有", "ですか", "ますか", "か？", "か?", "っけ", "何", "いつ", "どこ", "誰", "どう", "what", "when", "where", "who", "which", "how", "is ", "are ", "did ", "do ", "any"]);

export const TOPIC_PATTERNS: RegExp[] = [
  new RegExp(`([\\p{L}\\p{N}]{1,12}?)\\s*(${F(["相关", "有关", "関連", "関係", "关系", "系", "絡み", "がらみ", "方面", "领域", "まわり", "周り"]).join("|")}|-related|related)`, "u"),
  /(?<!(?:what|how)\s)(?:about|regarding)\s+([a-z0-9][a-z0-9 .-]{1,20})/u,
  /「([^」]{1,20})」/u,
];

/**
 * Frequent English words (function words, auxiliaries, everyday verbs, time and request words, and common words that
 * people's or companies' names are often made of). A Latin name form that is one of these is a name only in name
 * position (see world.ts latinNamePosition); elsewhere it is the ordinary word.
 */
export const EN_COMMON = new Set(F((
  "a about above after again against all also am an and any are as at away back be because been before being below between both but by can " +
  "could did do does done down during each else ever every few for from further get got had has have having he her here hers him his how i if in " +
  "into is it its just last least less let like made make many may me might more most much must my near need never new next no nor not now of off " +
  "often on once one only or other our out over own per please same she should since so some still such than that the their them then there these " +
  "they this those though through till to too under until up upon us very was we well were what when where which while who whom whose why will " +
  "with within without would yet you your yours " +
  "today tomorrow yesterday tonight morning noon afternoon evening night week weekend month year day days time soon later early late first second " +
  "third final daily weekly monthly annual spring summer autumn fall winter " +
  "add ask book bring call change check close come confirm copy cut delete done drop email find follow give go hold join keep leave list look mark " +
  "meet move note open order pay pick plan push put read remind reply report review run say see send set share show sign start stop take talk tell " +
  "update visit wait want write " +
  "able bright clear fair free fine frank good grand great green hope joy just kind major prime rich rose royal sure swift true young " +
  "art bell bill brown cash grace hall hill king lane price page star sun wood"
).split(/\s+/).filter(Boolean)));

/**
 * Well-known cities and districts (R18: their romaji / English / other-script spellings are common knowledge): each row
 * is [Latin spellings…] → CJK spellings (the first one is reported; the others are other ways to write it). A general
 * gazetteer of major Japanese, Chinese and Asian places, not this world's locations. Kana spellings are read through
 * their romaji, so they need no rows of their own. A district never implies its city (R18): rows are independent.
 */
export const PLACE_TABLE: [string[], string[]][] = ([
  // Japan: cities and prefectures
  [["tokyo"], ["東京", "东京"]], [["osaka"], ["大阪"]], [["nagoya"], ["名古屋"]], [["yokohama"], ["横浜", "横滨"]], [["kyoto"], ["京都"]],
  [["kobe"], ["神戸", "神户"]], [["fukuoka"], ["福岡", "福冈"]], [["sapporo"], ["札幌"]], [["sendai"], ["仙台"]], [["kawasaki"], ["川崎"]],
  [["saitama"], ["埼玉"]], [["chiba"], ["千葉", "千叶"]], [["nara"], ["奈良"]], [["hiroshima"], ["広島", "广岛"]], [["okinawa"], ["沖縄", "冲绳"]],
  [["naha"], ["那覇", "那霸"]], [["kanazawa"], ["金沢", "金泽"]], [["niigata"], ["新潟"]], [["shizuoka"], ["静岡", "静冈"]], [["hamamatsu"], ["浜松"]],
  [["kumamoto"], ["熊本"]], [["kagoshima"], ["鹿児島", "鹿儿岛"]], [["okayama"], ["岡山", "冈山"]], [["kamakura"], ["鎌倉", "镰仓"]], [["hakone"], ["箱根"]],
  [["ibaraki"], ["茨城"]], [["tochigi"], ["栃木"]], [["gunma"], ["群馬", "群马"]], [["nagano"], ["長野", "长野"]], [["matsuyama"], ["松山"]],
  [["chiba makuhari", "makuhari"], ["幕張", "幕张"]], [["narita"], ["成田"]], [["haneda"], ["羽田"]], [["itami"], ["伊丹"]],
  // Tokyo districts
  [["shibuya"], ["渋谷", "涩谷"]], [["shinjuku"], ["新宿"]], [["ginza"], ["銀座", "银座"]], [["roppongi"], ["六本木"]], [["akihabara"], ["秋葉原", "秋叶原"]],
  [["ikebukuro"], ["池袋"]], [["shinagawa"], ["品川"]], [["marunouchi"], ["丸の内", "丸之内"]], [["otemachi"], ["大手町"]], [["nihonbashi", "nihombashi"], ["日本橋", "日本桥"]],
  [["toranomon"], ["虎ノ門", "虎之门", "虎门"]], [["akasaka"], ["赤坂"]], [["aoyama"], ["青山"]], [["omotesando"], ["表参道"]], [["harajuku"], ["原宿"]],
  [["ueno"], ["上野"]], [["asakusa"], ["浅草"]], [["odaiba"], ["お台場", "台场"]], [["shiodome"], ["汐留"]], [["shimbashi", "shinbashi"], ["新橋", "新桥"]],
  [["ebisu"], ["恵比寿", "惠比寿"]], [["meguro"], ["目黒", "目黑"]], [["gotanda"], ["五反田"]], [["osaki"], ["大崎"]], [["hamamatsucho"], ["浜松町"]],
  [["kagurazaka"], ["神楽坂", "神乐坂"]], [["jimbocho", "jinbocho"], ["神保町"]], [["kichijoji"], ["吉祥寺"]], [["nakano"], ["中野"]], [["shimokitazawa"], ["下北沢", "下北泽"]],
  [["kanda"], ["神田"]], [["yurakucho"], ["有楽町", "有乐町"]], [["tamachi"], ["田町"]], [["azabu"], ["麻布"]], [["daikanyama"], ["代官山"]],
  [["ariake"], ["有明"]], [["toyosu"], ["豊洲", "丰洲"]], [["kiyosumi"], ["清澄"]], [["ochanomizu"], ["御茶ノ水", "御茶之水"]], [["iidabashi"], ["飯田橋", "饭田桥"]],
  // Kansai, Kyushu and other districts
  [["umeda"], ["梅田"]], [["namba"], ["難波", "难波"]], [["shinsaibashi"], ["心斎橋", "心斋桥"]], [["tennoji"], ["天王寺"]], [["kitashinchi"], ["北新地"]],
  [["hakata"], ["博多"]], [["tenjin"], ["天神"]], [["gion"], ["祇園", "祇园"]], [["minatomirai"], ["みなとみらい", "港未来"]],
  [["sannomiya"], ["三宮", "三宫"]], [["susukino"], ["すすきの", "薄野"]],
  // China and Asia
  [["shanghai"], ["上海"]], [["beijing", "peking"], ["北京"]], [["shenzhen"], ["深圳"]], [["guangzhou", "canton"], ["广州"]], [["hangzhou"], ["杭州"]],
  [["suzhou"], ["苏州"]], [["nanjing"], ["南京"]], [["tianjin"], ["天津"]], [["chongqing"], ["重庆"]], [["chengdu"], ["成都"]], [["wuhan"], ["武汉"]],
  [["xian", "xi'an"], ["西安"]], [["xiamen"], ["厦门"]], [["qingdao"], ["青岛"]], [["dalian"], ["大连"]], [["ningbo"], ["宁波"]], [["hong kong", "hongkong"], ["香港"]],
  [["macau", "macao"], ["澳门"]], [["taipei"], ["台北"]], [["kaohsiung"], ["高雄"]], [["taichung"], ["台中"]], [["seoul"], ["首尔", "ソウル"]], [["busan"], ["釜山"]],
  [["singapore"], ["新加坡", "シンガポール"]], [["bangkok"], ["曼谷", "バンコク"]], [["hanoi"], ["河内", "ハノイ"]], [["ho chi minh", "saigon"], ["胡志明", "ホーチミン"]],
  [["kuala lumpur"], ["吉隆坡", "クアラルンプール"]], [["jakarta"], ["雅加达", "ジャカルタ"]], [["manila"], ["马尼拉", "マニラ"]], [["new york"], ["纽约", "ニューヨーク"]],
  [["london"], ["伦敦", "ロンドン"]], [["paris"], ["巴黎", "パリ"]], [["san francisco"], ["旧金山", "サンフランシスコ"]], [["los angeles"], ["洛杉矶", "ロサンゼルス"]],
] as [string[], string[]][]).map(([ls, cs]) => [F(ls), F(cs)] as [string[], string[]]);

// ---------------------------------------------------------------- r07: writes in flight (cards, write questions)

/** Calling off a change that waits for its click (…先不建了 / やっぱり…しないで / never mind). */
export const CANCEL_MARKERS = F(["不建了", "先不建", "不用建", "别建了", "不要建", "先别建", "不做了", "先不做", "不用做了", "不改了", "先不改", "不用改了", "别改了", "不删了", "先不删", "别删了", "不用删",
  "取消吧", "取消这", "取消那", "撤销", "算了", "不用了", "先不要了", "やめて", "やめとく", "やめよう", "やめた", "やっぱりいい", "やっぱいい", "作らないで", "消さないで", "変えないで", "しないで", "なしにして", "取り消し", "キャンセル",
  "never mind that", "never mind this", "cancel that", "cancel it", "cancel this", "scrap that", "don't create", "don't delete", "don't change", "don't do it", "leave it as it is", "forget that one"]);
/** A change of mind or a correction of a value of the change in flight (やっぱり / 还是 / actually / make it …). */
export const AMEND_MARKERS = F(["やっぱり", "やっぱ", "やはり", "じゃなくて", "ではなく", "にして", "にしといて", "にしておいて", "に変えて", "に変更", "でお願い", "ごめん", "間違え",
  "还是", "改成", "换成", "改为", "不对", "不是", "我说的是", "应该是", "才对", "说错", "搞错", "弄错", "记错", "其实是",
  "actually", "make it", "instead", "rather", "change it to", "i meant", "should be", "sorry", "wait"]);
/** The same kind of change once more, for another person or record (也 / 一样 / 同じ / same / another …). */
export const COPY_MARKERS = F(["也", "一样", "同样", "照样", "同上", "另外建", "再建", "再给", "再来一", "同じ", "同様", "も作", "にも", "もう一つ", "もう1つ", "もうひとつ", "same", "another", "also", "too", "as well", "likewise"]);
/** Going back to a change that was interrupted (就按刚才的建 / さっきのままで / go ahead with …). */
export const RESUME_MARKERS = F(["照建", "照做", "照办", "照常", "按刚才", "就按", "按原来", "继续建", "还是建", "接着建", "さっきのまま", "そのまま", "あのまま", "元のまま", "go ahead with", "as it was", "as before", "as planned"]);
/** The day of the change before (同一天 / 同じ日 / same day / 日子跟刚才一样). */
export const SAME_DAY = F(["同一天", "同一日", "同日", "同じ日", "同じ日付", "日にちは同じ", "日付は同じ", "那天", "那一天", "当天", "その日", "same day", "same date", "that day"]);
/** "The other one" (另一个 / もう一つの / the other one). */
export const OTHER_WORDS = F(["另一", "另外一", "另外那", "剩下", "残りの", "the remaining", "もう一つの", "もう1つの", "もうひとつの", "もう片方", "もう一方", "the other", "other one"]);
