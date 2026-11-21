// @ts-nocheck -- finder/impl/text.ts: copied byte for byte from lab-rsi repos/orbits/lab/record-finder/rsi/archive/r10/impl/text.ts
// (lab commit 931bae340, r10 accepted). Only these two header lines differ; the lab code does not pass this repo's build typecheck.
/**
 * Text folding and script helpers shared by every component: NFKC, case, kana folding (katakana → hiragana, long
 * vowel mark dropped), traditional / Japanese shinjitai → simplified Chinese, CJK numerals next to a counter → digits,
 * romaji for kana, pinyin for common Chinese characters, Latin diacritics, edit distance.
 * Pure general vocabulary; nothing here knows any user's records.
 */

// ---------------------------------------------------------------- traditional / shinjitai → simplified
// Each group: variants first, the simplified form last.
const VARIANT_GROUPS = [
  "資资", "発發发", "紀纪", "錄録录", "會会", "議议", "樣様样", "報报", "價価价", "書书", "單単单", "認认", "確确", "東东",
  "車车", "業业", "務务", "訂订", "機机", "場场", "見见", "積积", "銷销", "產産产", "質质", "經経经", "濟済济", "應応应",
  "廣広广", "國国", "門门", "問问", "時时", "間间", "買买", "賣売卖", "電电", "話话", "計计", "劃划", "記记", "實実实",
  "驗験验", "試试", "測测", "團団团", "關関关", "係系", "聯联", "絡络", "約约", "預预", "覽覧览", "氣気气", "處処处",
  "總総总", "長长", "張张", "劉刘", "陳陈", "聞闻", "齋斎斉齊斋", "邊邉辺边", "澤沢泽", "濱浜滨", "對対对", "點点", "樂楽乐",
  "數数", "萬万", "與与", "學学", "體体", "寫写", "讀読读", "談谈", "藝芸艺", "薦荐", "歲歳岁", "語语", "員员",
  "週周", "鄭郑", "趙赵", "錢钱", "楊杨", "馬马", "許许", "陽阳", "歐欧", "華华", "藍蓝", "灣湾", "啟啓启",
  "雲云", "織织", "傳伝传", "龍竜龙", "鳥鸟", "島岛", "飯饭", "館馆", "樓楼", "紅红", "綠緑绿", "銀银", "鐵鉄铁",
  "給给", "遠远", "嵐岚", "視视", "頭头", "鳴鸣", "貿贸", "偉伟", "暁曉晓", "詩诗", "誌志", "誠诚", "誰谁", "請请",
  "論论", "調调", "査查", "証證证", "説說说", "読讀读", "訪访", "設设", "評评", "課课", "議议", "講讲", "謝谢", "護护",
  "譲讓让", "変變变", "戦戰战", "選选", "還还", "進进", "連连", "運运", "過过", "達达", "違违", "適适", "遅遲迟", "邊边",
  "郵邮", "鄉郷乡", "醫医", "釘钉", "針针", "鈴铃", "鉛铅", "銭钱", "鋼钢", "録录", "鏡镜", "鐘鍾钟", "閉闭", "開开",
  "閑闲", "閣阁", "闘鬥斗", "隊队", "陸陆", "険險险", "隣邻", "隨随", "雑雜杂", "離离", "難难", "電电", "霧雾", "響响",
  "順顺", "預预", "領领", "頻频", "題题", "額额", "顔顏颜", "願愿", "類类", "顧顾", "風风", "飛飞", "飲饮", "飼饲",
  "餐餐", "館馆", "駅驛驿", "験验", "騒骚", "髪發发", "魚鱼", "鮮鲜", "鶏雞鸡", "麗丽", "黄黃黄", "齢齡龄", "亜亞亚",
  "仏佛", "仮假", "伝传", "価价", "倹俭", "児兒儿", "両兩两", "円圓圆", "冊册", "写寫写", "処处", "剤劑剂", "効效",
  "労勞劳", "勧勸劝", "単单", "収收", "叙敘叙", "号號号", "営營营", "図圖图", "囲圍围", "団团", "圧壓压", "堅坚",
  "塩鹽盐", "壊坏", "声聲声", "売卖", "変变", "夢梦", "奨獎奖", "嬢娘", "宝寶宝", "将將将", "専專专", "尋寻", "対对",
  "層层", "岳嶽岳", "巻卷", "帯帶带", "帰歸归", "庁廳厅", "広广", "応应", "恵惠", "悪惡恶", "悩惱恼", "惨慘惨", "戻戾",
  "払拂", "拡擴扩", "拠據据", "挙舉举", "捜搜", "掲揭", "摂攝摄", "撃擊击", "数数", "断斷断", "旧舊旧", "昼晝昼",
  "暦曆历", "条條条", "来來来", "枢樞枢", "栄榮荣", "桜櫻樱", "検檢检", "楼楼", "様样", "権權权", "横橫横", "歓歡欢",
  "歩步", "歴歷历", "残殘残", "殻殼壳", "毎每", "気气", "沢泽", "浅淺浅", "済济", "渉涉", "温溫温", "湾湾", "満滿满",
  "滝瀧泷", "漢汉", "潜潛潜", "災灾", "為爲为", "焼燒烧", "営营", "犠犧牺", "猟獵猎", "獣獸兽", "玉玉", "瓶瓶", "畳疊叠",
  "痴癡痴", "発发", "県縣县", "研研", "砕碎", "祝祝", "禅禪禅", "称稱称", "税稅税", "穏穩稳", "窓窗", "粋粹", "糸絲丝",
  "経经", "続續续", "総总", "緒绪", "緑绿", "線线", "縁緣缘", "縄繩绳", "縦縱纵", "繊纖纤", "缶罐", "聴聽听", "肃肅肃",
  "胆膽胆", "脳腦脑", "臓臟脏", "舗鋪铺", "芸艺", "茎莖茎", "荘莊庄", "蔵藏", "薬藥药", "虚虛虚", "蛍螢萤", "衛卫",
  "装裝装", "覚覺觉", "観觀观", "触觸触", "訳譯译", "証证", "誉譽誉", "読读", "謡謠谣", "豊豐丰", "賛贊赞", "転轉转",
  "軽輕轻", "辞辭辞", "辺边", "逓遞递", "郷乡", "酔醉", "釈釋释", "鉱礦矿", "鋳鑄铸", "閲閱阅", "関关", "隠隱隐",
  "雑杂", "霊靈灵", "静靜静", "頼賴赖", "顕顯显", "駆驅驱", "騎骑", "髄髓", "麦麥麦", "黒黑", "黙默", "齢龄", "亀龜龟",
  "蘇苏", "藝艺", "葉叶", "葯药", "萬万", "莊庄", "術术", "衝冲", "裏裡里", "製制", "複复", "覆复", "見见", "規规",
  "親亲", "覺觉", "觀观", "訂订", "訊讯", "託托", "記记", "訟讼", "訣诀", "訴诉", "診诊", "詞词", "詢询", "詳详",
  "誇夸", "誤误", "誘诱", "課课", "誰谁", "調调", "談谈", "請请", "諸诸", "謀谋", "謎谜", "講讲", "識识", "譜谱",
  "議议", "護护", "讚赞", "貝贝", "負负", "財财", "貢贡", "貨货", "販贩", "貧贫", "責责", "貴贵", "費费", "貸贷",
  "賀贺", "資资", "賃赁", "賓宾", "賞赏", "賠赔", "賢贤", "質质", "購购", "贈赠", "贊赞", "趕赶", "車车", "軍军",
  "軟软", "較较", "載载", "輔辅", "輛辆", "輝辉", "輪轮", "輸输", "轄辖", "辦办", "農农", "週周", "遊游", "運运",
  "過过", "選选", "遺遗", "郵邮", "鄰邻", "醬酱", "釋释", "鈔钞", "鉄铁", "銅铜", "鋒锋", "錯错", "鍵键", "鎖锁",
  "鎮镇", "長长", "門门", "閃闪", "閒闲", "間间", "閘闸", "閩闽", "闆板", "陣阵", "陰阴", "陳陈", "陸陆", "隊队",
  "階阶", "際际", "障障", "雖虽", "雙双", "雞鸡", "離离", "電电", "靈灵", "韓韩", "頁页", "項项", "順顺", "須须",
  "預预", "頓顿", "領领", "頭头", "題题", "顧顾", "顯显", "風风", "飯饭", "飲饮", "飽饱", "養养", "館馆", "首首",
  "駐驻", "騰腾", "驗验", "驚惊", "魯鲁", "鳳凤", "鴻鸿", "鹽盐", "麥麦", "點点", "齊齐", "齒歯齿", "龍龙", "龜龟",
  "億亿", "優优", "儲储", "兒儿", "內内", "兩两", "冊册", "凍冻", "劃划", "劇剧", "勁劲", "動动", "勝胜", "勢势",
  "勞劳", "區区", "協协", "卻却", "厲厉", "參参", "叢丛", "吳吴", "員员", "問问", "啓启", "喚唤", "喬乔", "單单",
  "嚴严", "團团", "園园", "圍围", "圖图", "國国", "圓圆", "執执", "堅坚", "報报", "場场", "塊块", "塗涂", "墊垫",
  "壓压", "壞坏", "壯壮", "壽寿", "夠够", "夾夹", "奪夺", "奮奋", "婦妇", "孫孙", "寧宁", "寬宽", "審审", "寫写",
  "實实", "寶宝", "將将", "專专", "尋寻", "對对", "導导", "屆届", "層层", "屬属", "崗岗", "嶺岭", "帥帅", "師师",
  "帳帐", "帶带", "幣币", "幫帮", "庫库", "廠厂", "廢废", "廣广", "張张", "強强", "彈弹", "彎弯", "後后", "徑径",
  "從从", "復复", "徵征", "憑凭", "憶忆", "應应", "懷怀", "戰战", "戲戏", "戶户", "拋抛", "挾挟", "捨舍", "掃扫",
  "掛挂", "採采", "換换", "揮挥", "損损", "搖摇", "擁拥", "擇择", "擔担", "據据", "擬拟", "擴扩", "擺摆", "攜携",
  "敵敌", "斂敛", "斷断", "於于", "昇升", "時时", "晉晋", "暫暂", "曆历", "書书", "會会", "東东", "條条", "棟栋",
  "業业", "極极", "榮荣", "構构", "槍枪", "標标", "樞枢", "模模", "樣样", "樹树", "橋桥", "機机", "檔档", "檢检",
  "櫃柜", "權权", "歐欧", "歡欢", "歲岁", "歷历", "歸归", "殘残", "殺杀", "毀毁", "氣气", "決决", "沒没", "況况",
  "淚泪", "淨净", "淺浅", "減减", "測测", "湯汤", "準准", "溝沟", "滅灭", "滬沪", "滯滞", "漁渔", "漲涨", "潔洁",
  "潤润", "澀渋涩", "濃浓", "濕湿", "灣湾", "災灾", "為为", "烏乌", "無无", "煙烟", "煩烦", "熱热", "燈灯", "營营",
  "爭争", "爲为", "牆墙", "狀状", "獨独", "獲获", "現现", "環环", "產产", "畫画", "異异", "當当", "療疗", "盡尽",
  "監监", "盤盘", "確确", "碼码", "礎础", "禮礼", "禪禅", "種种", "稱称", "穩稳", "競竞", "筆笔", "築筑", "簡简",
  "簽签", "籃篮", "類类", "糧粮", "紀纪", "約约", "紅红", "納纳", "純纯", "紙纸", "級级", "紛纷", "細细", "終终",
  "組组", "結结", "絕绝", "給给", "統统", "絲丝", "綁绑", "經经", "綜综", "維维", "網网", "緊紧", "緣缘", "編编",
  "練练", "縣县", "總总", "績绩", "繁繁", "織织", "繳缴", "續续", "罰罚", "罷罢", "義义", "習习", "聖圣", "聞闻",
  "聯联", "聲声", "職职", "聽听", "肅肃", "脅胁", "腦脑", "興兴", "舉举", "舊旧", "艙舱", "艱艰", "藥药", "蘭兰",
  "處处", "號号", "蟲虫", "補补", "裝装", "見见", "視视", "訓训", "設设", "許许", "評评", "試试", "詩诗", "話话",
  "該该", "認认", "語语", "說说", "誰谁", "論论", "證证", "變变", "讓让", "豐丰", "貓猫", "賣卖", "趨趋", "跡迹",
  "踐践", "蹤踪", "軌轨", "輕轻", "辭辞", "這这", "連连", "達达", "遠远", "適适", "遲迟", "還还", "邊边", "邏逻",
  "鄉乡", "醫医", "針针", "鈴铃", "銀银", "銷销", "鋪铺", "錢钱", "錦锦", "錄录", "鏈链", "鐘钟", "鑑鉴", "開开",
  "閱阅", "闊阔", "陽阳", "隨随", "險险", "隱隐", "雜杂", "雲云", "需需", "靜静", "響响", "頂顶", "頌颂", "頗颇",
  "頻频", "額额", "願愿", "類类", "飛飞", "餅饼", "餘余", "駕驾", "體体", "髮发", "鬥斗", "鬧闹", "魚鱼", "鮮鲜",
  "鳥鸟", "麗丽", "麼么", "黨党", "齡龄", "芸芸", "込込", "勉勉", "収收", "乗乘", "仮假", "侶侣", "帳帐", "扱扱",
  "済济", "渓溪", "瀬濑", "灯灯", "炉爐炉", "焔焰", "爪爪", "猶犹", "畑畑", "疎疏", "痩瘦", "盗盜盗", "砲炮", "祢祢",
  "禄祿禄", "穂穗", "竜龙", "粛肃", "絵繪绘", "継繼继", "綱纲", "緻致", "縛缚", "繰缲", "翻翻", "聡聪", "膨膨",
  "舎舍", "艶豔艳", "芦蘆芦", "荷荷", "菓菓", "蕾蕾", "虜虏", "衆眾众", "袴袴", "覇霸", "訂订", "詰诘", "誌志",
  "諭谕", "謄誊", "譲让", "豚豚", "賭赌", "購购", "贅赘", "躯軀躯", "輩辈", "轟轰", "逸逸", "遷迁", "郎郎", "酬酬",
  "醸釀酿", "釣钓", "鉢钵", "銃铳", "鋭锐", "錠锭", "錬炼", "鍋锅", "鍛锻", "鎌镰", "鑑鉴", "閥阀", "闇暗", "陥陷",
  "隷隶", "雇雇", "霞霞", "頃顷", "頒颁", "頬颊", "顛颠", "飢饥", "飾饰", "餌饵", "駄驮", "駒驹", "騰腾", "髙高",
  "鬱郁", "魂魂", "鯉鲤", "鯛鲷", "鶴鹤", "鹸碱", "麺麵面", "麹麴曲", "黙默", "鼓鼓", "鼻鼻", "嶋岛", "崎崎", "﨑崎",
  "桥桥", "橋桥", "則则", "刪删", "羅罗", "馮冯", "鄧邓", "蕭萧", "蔣蒋", "呂吕", "盧卢", "譚谭", "賈贾", "韋韦", "鄒邹", "龔龚", "龐庞", "聶聂", "畢毕", "駱骆", "鮑鲍", "饒饶", "繆缪", "婁娄", "竇窦", "宮宫", "閔闵", "鄔邬", "欒栾", "鞏巩", "鄺邝", "備备", "幾几", "們们", "嗎吗", "於于", "掃扫", "髪发", "渋澀涩", "芝芝", "浜滨", "亀龟", "恒恆恒", "弁辩", "辯辩", "瓣瓣", "辨辨",
];
const VARIANT = new Map<string, string>();
for (const g of VARIANT_GROUPS) {
  const chars = [...g];
  const target = chars[chars.length - 1];
  for (const ch of chars.slice(0, -1)) if (ch !== target && !VARIANT.has(ch)) VARIANT.set(ch, target);
}

export const isHan = (c: string) => /\p{Script=Han}/u.test(c);
export const isHira = (c: string) => /[ぁ-ゟ]/.test(c);
export const isKata = (c: string) => /[ァ-ヿㇰ-ㇿ]/.test(c);
export const isKana = (c: string) => isHira(c) || isKata(c);
export const isCJK = (c: string) => isHan(c) || isKana(c);
export const isLatin = (c: string) => /[a-zA-ZÀ-ɏ]/.test(c);
export const isDigit = (c: string) => /[0-9]/.test(c);

/** Latin diacritics and German umlaut spellings to plain ASCII (ü = ue = u). */
export function latinFold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/ae/g, "a")
    .replace(/oe/g, "o")
    .replace(/ue/g, "u")
    .replace(/ß/g, "ss");
}

/** Character-level fold: NFKC, lower case, simplified Han, katakana → hiragana; long vowel mark dropped. */
export function foldChar(ch: string): string {
  let out = "";
  for (const c of ch.normalize("NFKC").toLowerCase()) {
    const v = VARIANT.get(c) ?? c;
    const code = v.codePointAt(0)!;
    if (v === "ー" || v === "〜" || v === "～") continue;
    if (code >= 0x30a1 && code <= 0x30f6) out += String.fromCodePoint(code - 0x60);
    else if (/[À-ɏ]/.test(v)) out += latinFold(v);
    else out += v;
  }
  return out;
}

const foldCache = new Map<string, string>();
/** Fold a whole string for comparison (see foldChar) and convert CJK numerals next to a counter to digits. */
export function fold(s: string): string {
  const hit = foldCache.get(s);
  if (hit !== undefined) return hit;
  let out = "";
  for (const ch of s) out += foldChar(ch);
  out = numeralsToDigits(out);
  out = out.replace(/ue/g, "u").replace(/oe/g, "o").replace(/ae/g, "a");
  if (foldCache.size > 200000) foldCache.clear();
  foldCache.set(s, out);
  return out;
}

// ---------------------------------------------------------------- numbers
const CN_DIGIT: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
/** Parse a CJK numeral (一 … 九十九 …, also 两) or digits. Returns NaN when not a number. */
export function parseNumber(s: string): number {
  if (/^[0-9]+$/.test(s)) return Number(s);
  if (!s) return NaN;
  let total = 0, cur = 0, seen = false;
  for (const ch of s) {
    if (ch in CN_DIGIT) { cur = CN_DIGIT[ch]; seen = true; }
    else if (ch === "十") { total += (cur || 1) * 10; cur = 0; seen = true; }
    else if (ch === "百") { total += (cur || 1) * 100; cur = 0; seen = true; }
    else if (ch === "千") { total += (cur || 1) * 1000; cur = 0; seen = true; }
    else return NaN;
  }
  return seen ? total + cur : NaN;
}
export const NUM_CHARS = "零〇一二两兩三四五六七八九十百千";
export const NUM_RE = `[0-9]+|[${NUM_CHARS}]+`;
const COUNTERS = "份部个個件条條台本枚点點季月日号號年人位次周週天张張款";
/** 三份 → 3份, 第三 → 第3, 二十份 → 20份 (only next to a counter or after 第, so names like 一鸣 stay). */
export function numeralsToDigits(s: string): string {
  return s
    .replace(new RegExp(`第([${NUM_CHARS}]+)`, "g"), (m, n) => (isNaN(parseNumber(n)) ? m : `第${parseNumber(n)}`))
    .replace(new RegExp(`([${NUM_CHARS}]+)(?=[${COUNTERS}])`, "g"), (m, n) => (isNaN(parseNumber(n)) ? m : String(parseNumber(n))));
}

// ---------------------------------------------------------------- kana → romaji (Hepburn-ish, folded)
const ROMAJI: Record<string, string> = {
  あ: "a", い: "i", う: "u", え: "e", お: "o", か: "ka", き: "ki", く: "ku", け: "ke", こ: "ko", さ: "sa", し: "shi", す: "su",
  せ: "se", そ: "so", た: "ta", ち: "chi", つ: "tsu", て: "te", と: "to", な: "na", に: "ni", ぬ: "nu", ね: "ne", の: "no",
  は: "ha", ひ: "hi", ふ: "fu", へ: "he", ほ: "ho", ま: "ma", み: "mi", む: "mu", め: "me", も: "mo", や: "ya", ゆ: "yu",
  よ: "yo", ら: "ra", り: "ri", る: "ru", れ: "re", ろ: "ro", わ: "wa", を: "o", ん: "n", が: "ga", ぎ: "gi", ぐ: "gu",
  げ: "ge", ご: "go", ざ: "za", じ: "ji", ず: "zu", ぜ: "ze", ぞ: "zo", だ: "da", ぢ: "ji", づ: "zu", で: "de", ど: "do",
  ば: "ba", び: "bi", ぶ: "bu", べ: "be", ぼ: "bo", ぱ: "pa", ぴ: "pi", ぷ: "pu", ぺ: "pe", ぽ: "po", ゔ: "vu",
  ぁ: "a", ぃ: "i", ぅ: "u", ぇ: "e", ぉ: "o",
};
const YOON: Record<string, string> = { ゃ: "ya", ゅ: "yu", ょ: "yo" };
/** Kana (hiragana or katakana) → romaji, long vowels collapsed (やまだ はなこ → yamada hanako, さいとう → saito). */
export function toRomaji(kana: string): string {
  const s = [...kana].map((c) => { const code = c.codePointAt(0)!; return code >= 0x30a1 && code <= 0x30f6 ? String.fromCodePoint(code - 0x60) : c; });
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "っ") { const nx = ROMAJI[s[i + 1]]; if (nx) out += nx[0]; continue; }
    if (c === "ー") continue;
    if (YOON[c]) {
      if (out.endsWith("i")) {
        const base = out.slice(0, -1);
        out = /(sh|ch|j)$/.test(base) ? base + YOON[c].slice(1) : base + YOON[c];
      } else out += YOON[c];
      continue;
    }
    if (c === "ぇ" && out.endsWith("u")) { out = out.slice(0, -1) + (/[b-df-hj-np-tv-z]u$/.test(out) ? "e" : "we"); continue; }
    if (c === "ぃ" && out.endsWith("u")) { out = out.slice(0, -1) + (/[b-df-hj-np-tv-z]u$/.test(out) ? "i" : "wi"); continue; }
    // r08: the other small vowels write a foreign syllable the same way (フォ = fo, ウォ = wo, ファ = fa, ティ = ti, ディ = di, トゥ = tu)
    if (/[ぁぉ]/.test(c) && out.endsWith("u")) { out = out.slice(0, -1) + (/[b-df-hj-np-tv-z]u$/.test(out) ? "" : "w") + (c === "ぁ" ? "a" : "o"); continue; }
    if (c === "ぃ" && /[td]e$/.test(out)) { out = out.slice(0, -1) + "i"; continue; }
    if (c === "ぅ" && /[td]o$/.test(out)) { out = out.slice(0, -1) + "u"; continue; }
    out += ROMAJI[c] ?? (c === " " || c === "　" ? " " : "");
  }
  return out.replace(/ou/g, "o").replace(/oo/g, "o").replace(/uu/g, "u").replace(/aa/g, "a").replace(/ii/g, "i").replace(/ee/g, "e");
}
/**
 * Consonant skeleton shared by a katakana loanword (in romaji) and the Latin word it renders (データシート ≈ data sheet,
 * ホテル ≈ hotel, マネージャー ≈ manager): digraphs to one sound, r / l / w / y / h dropped (kana renders
 * them unreliably), voicing merged, vowels and doubled letters dropped.
 */
export function loanKey(s: string): string {
  let x = latinFold(s).toLowerCase().replace(/[^a-z]/g, "");
  x = x.replace(/th/g, "s").replace(/ph/g, "f").replace(/sh/g, "s").replace(/ch/g, "t").replace(/ts/g, "t").replace(/ck/g, "k")
    .replace(/c(?=[eiy])/g, "s").replace(/c/g, "k").replace(/q/g, "k").replace(/x/g, "ks").replace(/j/g, "z");
  x = x.replace(/[lrwyh]/g, "").replace(/g/g, "k").replace(/d/g, "t").replace(/[bv]/g, "p").replace(/z/g, "s");
  return x.replace(/[aeiou]+/g, "").replace(/(.)\1+/g, "$1");
}
/** A loose romaji key: drop vowels length, h after consonants, l→r (a German ü rendered ュ). */
export function soundKey(s: string): string {
  const x = latinFold(s).replace(/[^a-z]/g, "").replace(/l/g, "r").replace(/v/g, "b"); // kana has no l / v
  return (x[0] ?? "") + x.slice(1).replace(/[yh]/g, "").replace(/[aeiou]+/g, "").replace(/(.)\1+/g, "$1"); // kana has no silent h (Hannah = ハンナ)
}

// ---------------------------------------------------------------- pinyin (common surname / name / company characters)
const PINYIN_SRC: Record<string, string> = {
  a: "阿啊", ai: "爱艾哀", an: "安按案岸暗", ang: "昂", ao: "奥傲澳", ba: "八巴把爸霸拔", bai: "白百柏拜佰", ban: "班板办半般版伴扮",
  bang: "帮邦榜棒", bao: "包宝保报暴抱鲍薄", bei: "北贝备倍杯被背", ben: "本奔", beng: "崩", bi: "比必毕碧笔壁币闭", bian: "边变便编卞",
  biao: "标表彪", bie: "别", bin: "宾彬斌滨", bing: "兵冰并病炳秉", bo: "波博伯柏勃播泊", bu: "不步布部补", ca: "擦", cai: "才财材采彩菜蔡",
  can: "参餐灿", cang: "仓苍藏", cao: "草曹操", ce: "策测", cen: "岑", ceng: "层", cha: "茶查察差", chai: "柴", chan: "产禅", chang: "长常昌场厂唱畅",
  chao: "超朝潮巢", che: "车彻", chen: "陈晨辰沉臣尘", cheng: "成城程诚承乘呈", chi: "池驰持迟赤尺", chong: "冲崇充", chou: "仇", chu: "出初楚储褚",
  chuan: "川传船", chuang: "创窗", chun: "春纯", ci: "慈次", cong: "从聪丛", cui: "崔翠", cun: "村存", da: "大达打", dai: "代带戴岱黛",
  dan: "丹单旦但淡", dang: "当党", dao: "道刀岛导", de: "德得", deng: "邓登灯等", di: "迪地第帝弟狄", dian: "电典点店殿", diao: "刁", ding: "丁鼎定顶",
  dong: "东董冬栋洞动", dou: "窦斗", du: "杜都度渡独", duan: "段端", dui: "对", dun: "盾敦", duo: "多朵", e: "鄂峨", en: "恩", er: "尔二儿",
  fa: "发法", fan: "范樊凡帆繁", fang: "方芳房放", fei: "飞菲费非", fen: "芬分", feng: "风丰峰冯锋凤枫", fu: "傅付福富复甫符府阜", gai: "盖",
  gan: "甘干", gang: "刚钢港", gao: "高郜", ge: "葛戈格歌", geng: "耿", gong: "龚宫工公功", gou: "苟", gu: "顾古谷谷固", guan: "关管冠官",
  guang: "光广", gui: "桂贵", guo: "郭国果", hai: "海", han: "韩汉寒涵翰含", hang: "杭航", hao: "郝浩豪好昊皓", he: "何贺和河合赫荷", hei: "黑",
  heng: "恒衡亨", hong: "洪红宏鸿弘虹", hou: "侯后厚", hu: "胡湖虎沪", hua: "华花化", huai: "怀", huan: "环欢桓焕", huang: "黄皇煌", hui: "惠辉慧会汇徽",
  hun: "浑", huo: "霍火", ji: "季纪吉姬基冀计际集记", jia: "贾佳家嘉加甲", jian: "建剑健坚简鉴见", jiang: "江姜蒋将疆", jiao: "焦娇", jie: "杰洁捷节界",
  jin: "金晋锦津进靳今", jing: "京晶静精景敬井经", jiu: "九久", ju: "鞠居菊聚", juan: "娟", jun: "军君俊骏", kai: "凯开", kang: "康", ke: "柯科克可",
  kong: "孔空", kou: "寇", kuang: "匡邝", kun: "坤昆", lai: "来赖莱", lan: "兰蓝岚澜", lang: "朗郎浪", lao: "老劳", le: "乐", lei: "雷磊蕾", li: "李黎丽利力立理礼励历",
  lian: "连莲廉联", liang: "梁良亮凉", liao: "廖辽", lin: "林琳霖麟临", ling: "凌玲灵岭令", liu: "刘柳流留六", long: "龙隆", lou: "楼娄", lu: "陆卢鲁路露禄",
  luo: "罗洛骆", lv: "吕律绿", ma: "马麻", mai: "麦迈", man: "曼满", mao: "毛茂冒", mei: "梅美眉", men: "门", meng: "孟蒙梦萌", mi: "米密蜜",
  miao: "苗妙", min: "敏民闵旻", ming: "明鸣铭名", mo: "莫墨默", mu: "穆木牧慕", na: "娜纳", nan: "南楠男", ni: "倪妮", nian: "年", ning: "宁凝",
  niu: "牛", nong: "农", pan: "潘盼", pei: "裴佩沛", peng: "彭鹏蓬", pi: "皮", ping: "平萍", pu: "蒲浦普", qi: "齐祁琪奇琦启其齐旗", qian: "钱千倩谦乾",
  qiang: "强", qiao: "乔桥巧", qin: "秦琴勤钦", qing: "青清庆晴卿", qiu: "邱秋丘", qu: "曲屈瞿", quan: "全泉权", ran: "然冉", rao: "饶", ren: "任仁人",
  rong: "荣容融蓉", ru: "如汝儒", rui: "瑞锐蕊", run: "润", ruo: "若", sai: "赛", san: "三", sen: "森", sha: "沙莎", shan: "山珊善单闪", shang: "尚商上",
  shao: "邵少绍", she: "佘", shen: "沈申深神慎", sheng: "盛胜生圣升晟", shi: "石史施时师诗世实士", shou: "寿守", shu: "舒书淑树蜀", shuang: "双爽", shui: "水",
  shun: "顺", si: "司斯思丝四", song: "宋松颂", su: "苏素", sun: "孙", suo: "索", tai: "泰太台", tan: "谭谈坦", tang: "唐汤堂", tao: "陶涛桃", teng: "滕腾",
  tian: "田天甜", tie: "铁", ting: "婷亭庭廷", tong: "童同通彤", tu: "涂图", wan: "万宛婉万", wang: "王汪望旺", wei: "魏韦卫伟维薇威巍微", wen: "文温闻雯",
  wu: "吴武伍吾午无", xi: "习席西希曦熙溪喜夕", xia: "夏霞", xian: "先仙贤咸", xiang: "向项香祥翔湘", xiao: "肖萧晓小孝筱", xie: "谢解", xin: "辛欣新心鑫信馨",
  xing: "邢星兴幸杏行", xiong: "熊雄", xiu: "秀修", xu: "徐许须旭栩", xuan: "宣轩萱玄", xue: "薛雪学", xun: "荀寻勋", ya: "雅亚娅", yan: "严颜燕阎言彦岩延艳",
  yang: "杨阳扬羊洋养", yao: "姚尧瑶耀", ye: "叶业烨", yi: "易伊一义艺怡逸依宜毅仪亿", yin: "尹殷银音", ying: "英颖莹应鹰盈", yong: "永勇雍",
  you: "尤游友优", yu: "于余俞虞宇雨玉瑜郁禹宇语鱼", yuan: "袁元源远原园苑", yue: "岳越悦月乐", yun: "云芸韵运", zang: "臧", zeng: "曾增", zha: "查",
  zhai: "翟", zhan: "詹展战", zhang: "张章彰璋", zhao: "赵照昭钊", zhe: "哲浙", zhen: "甄珍真振贞镇", zheng: "郑正政征铮", zhi: "智志芝之知治致芷",
  zhong: "钟中仲忠众", zhou: "周舟洲州", zhu: "朱祝诸竹珠", zhuang: "庄壮", zhuo: "卓", zi: "紫子梓资", zong: "宗", zou: "邹", zu: "祖", zuo: "左佐",
};
/** More characters common in given names. */
const PINYIN_EXTRA: Record<string, string> = {
  lu: "璐鹿", ze: "泽则择", rui: "睿芮", man: "蔓", ran: "苒", miao: "淼", jin: "瑾", qian: "茜芊", xiao: "骁", ke: "珂", mu: "沐",
  nuo: "诺", qin: "覃", ou: "欧鸥", cheng: "澄", xuan: "璇", han: "晗瀚", chen: "宸琛", xin: "昕", yu: "钰裕羽", wei: "炜", ye: "烨",
  jing: "婧菁璟", shu: "姝", yan: "妍嫣琰砚雁", yuan: "媛缘", ming: "茗", li: "莉", he: "禾鹤", kui: "葵", jun: "珺峻隽", yue: "玥",
  jue: "珏", ying: "瑛", pu: "璞", zheng: "峥", rong: "嵘", yi: "屹祎翊轶", shuo: "硕", qi: "祺绮", sui: "穗", sheng: "笙", yun: "筠",
  qing: "箐", lun: "纶", ling: "翎苓", ru: "茹", bei: "蓓", die: "蝶", yao: "遥", fei: "霏", ning: "凝", hang: "航", zhi: "智",
};
/** Broad supplement: common surname and given-name characters (GB 2312 level-1 name usage), so any Chinese name reads. */
const PINYIN_NAMES: Record<string, string> = {
  a: "阿", ai: "蔼瑷嫒", an: "庵谙鞍俺", ang: "盎", ao: "敖翱遨鳌", ba: "芭笆", bai: "佰", ban: "斑颁", bang: "邦", bao: "褒葆苞",
  bei: "蓓悲辈", ben: "贲", bi: "璧弼碧毖庇", bian: "汴弁", biao: "飙骠", bin: "缤彬滨斌濒", bing: "冰丙", bo: "铂舶渤钵", bu: "卜",
  cai: "偲", can: "璨粲", cang: "沧", ce: "册", cen: "岑", chang: "嫦菖昶", chao: "晁钞", chen: "郴谌宸", cheng: "澄骋橙铖丞",
  chi: "炽", chong: "宠翀", chu: "楚褚雏", chuan: "钏", chuang: "闯", chun: "椿淳醇", ci: "辞", cong: "淙琮骢葱", cui: "璀粹萃",
  da: "笪", dai: "黛玳", dan: "丹聃郸", dang: "砀", dao: "稻焘", di: "笛翟荻娣棣", dian: "滇甸", diao: "雕", die: "蝶",
  dong: "彤", du: "笃", duan: "缎", dun: "敦", duo: "铎", e: "娥莪", en: "恩", fan: "梵璠", fang: "舫昉", fei: "斐妃",
  fen: "汾棻", feng: "沣枫俸", fu: "芙馥赋甫黻", gan: "淦赣", gang: "罡", gao: "皋杲", ge: "鸽", gen: "艮", geng: "庚赓", gong: "珙巩",
  gu: "鼓", guan: "莞", gui: "瑰圭珪", gun: "衮", guo: "椁", hai: "骸", han: "邯菡憨", hang: "沆", hao: "灏颢", he: "阖", heng: "珩蘅",
  hong: "竑闳泓", hu: "瑚琥祜", hua: "骅桦", huai: "淮槐", huan: "寰奂", huang: "璜篁凰", hui: "晖珲卉蕙", hun: "珲", huo: "获",
  ji: "骥冀霁玑姬佶", jia: "珈迦嘉", jian: "健渐谏", jiang: "绛", jiao: "皎姣", jie: "婕颉劼", jin: "衿瑾槿谨", jing: "竟婧旌靖径",
  jiong: "炯迥", jiu: "玖", ju: "琚炬", juan: "隽涓鹃", jue: "珏", jun: "钧筠浚郡", kai: "楷恺铠锴", kan: "侃", kang: "慷", kao: "考",
  ke: "恪轲", ken: "肯", kong: "孔", kui: "魁", kun: "琨焜", la: "拉", lai: "徕", lan: "斓阑", lang: "琅阆", lao: "烙", le: "勒",
  lei: "垒", li: "俐莉漓骊鲤", lian: "涟琏", liang: "靓", liao: "燎", lie: "烈", lin: "璘遴", ling: "伶羚聆菱龄", liu: "浏琉", long: "珑垅",
  lu: "潞麓璐", luan: "鸾", lun: "伦", luo: "珞", lv: "履", ma: "玛", mai: "麦", man: "嫚", mang: "芒", mei: "媚玫湄楣", meng: "盟",
  mi: "弥", mian: "冕", miao: "邈", min: "珉岷", ming: "溟", mo: "沫茉", mou: "牟", mu: "睦", na: "那", nai: "乃", nan: "楠",
  ni: "霓旎", nian: "念", niao: "袅", ou: "瓯", pa: "葩", pei: "培", peng: "芃", pin: "品", ping: "坪屏", po: "珀",
  qi: "淇岐琪麒骐綦", qian: "黔骞", qiang: "锵蔷", qiao: "翘", qie: "妾", qin: "沁", qing: "擎", qiong: "琼穹", qiu: "秋", qu: "渠",
  quan: "铨荃", que: "雀", qun: "群", ran: "燃", rang: "让", rao: "娆", ren: "韧", ri: "日", rong: "溶熔镕", rou: "柔", ru: "孺",
  rui: "芮", run: "闰", sa: "飒", sang: "桑", se: "瑟", sen: "森", shan: "杉姗衫", shang: "裳", shao: "韶", shen: "莘", sheng: "昇",
  shi: "拾湜", shou: "绶", shu: "曙澍殊", shuang: "霜", shuo: "朔", si: "嗣", song: "淞嵩", su: "肃夙", sui: "遂岁", sun: "荪",
  tai: "钛", tan: "檀昙", tang: "棠", tao: "滔韬", te: "特", teng: "藤", ti: "缇", tian: "恬", tiao: "苕", ting: "霆汀", tong: "桐瞳潼",
  tu: "途", tuo: "拓", wa: "娃", wan: "皖琬", wang: "汪", wei: "玮蔚纬苇", wen: "汶", wo: "沃", wu: "梧", xi: "汐羲禧晞茜", xia: "遐",
  xian: "娴弦岘", xiang: "骧", xiao: "潇", xie: "燮", xin: "歆忻", xing: "醒", xiong: "雄", xiu: "岫", xu: "煦序绪", xuan: "暄瑄煊",
  xue: "穴", xun: "珣浔迅", ya: "雅娅", yan: "焱晏衍", yang: "旸飏", yao: "珧窈", ye: "晔", yi: "奕弈懿漪熠", yin: "茵荫胤",
  ying: "滢莺樱璎", yong: "咏泳雍", you: "佑攸", yu: "渝昱妤煜毓钰", yuan: "沅垣嫄", yue: "钺", yun: "昀耘", zai: "载", zan: "瓒",
  zao: "藻", ze: "泽", zeng: "缯", zhan: "湛", zhang: "樟漳嶂", zhao: "兆", zhe: "喆", zhen: "臻桢蓁", zheng: "铮", zhi: "祉稚挚",
  zhong: "钟", zhou: "宙", zhu: "翥", zhuo: "灼琢", zi: "孜滋姿", zong: "棕", zun: "遵", zuo: "作",};
/** Characters used to spell foreign names by sound (r04). */
const PINYIN_TRANSLIT: Record<string, string> = {
  ai: "埃", bi: "彼", di: "蒂", e: "厄", fu: "弗伏", gang: "冈", gong: "贡", ha: "哈", ka: "卡", kan: "坎", ku: "库", kui: "奎", li: "里",
  lie: "列", miu: "缪", mo: "摩", mu: "姆", nai: "奈", nei: "内", ni: "尼", niu: "纽", pa: "帕", sa: "萨", sai: "塞", she: "舍", ta: "塔",
  tuo: "托", wa: "瓦", wu: "乌", xi: "锡", xiu: "休", ye: "耶", yin: "因", yue: "约", za: "扎", zi: "兹",
  // surname characters the tables above missed
  yan: "闫", pang: "庞", nie: "聂", ruan: "阮", weng: "翁", yu: "喻尉", miao: "缪", lu: "芦", qi: "戚", leng: "冷", tong: "佟", wu: "邬巫", luan: "栾", sui: "隋", hu: "狐",
};
/** r08: more sound-spelling characters (Xinhua transliteration usage) and common given-name characters the tables above missed. */
const PINYIN_R08: Record<string, string> = {
  shi: "什", dun: "顿", ci: "茨", fu: "夫", ge: "哥阁", gen: "根", gua: "瓜", kua: "夸", nie: "涅", nu: "努", pai: "派", qia: "恰", qie: "切", re: "热", ti: "提",
  shuai: "帅", xi: "兮", xiao: "箫", yao: "曜垚", shuo: "烁", yan: "炎", yu: "域", yong: "涌", li: "鹂梨荔离", yue: "跃", yi: "翼", rong: "榕", you: "柚",
  fei: "绯", tong: "铜", luan: "峦", ya: "崖", ye: "野夜", pu: "圃", lang: "廊", zhen: "震", xun: "巽", dui: "兑", hun: "昏", zhou: "昼",
  lun: "仑", jue: "崛", dian: "巅", wei: "嵬",
};
const PINYIN = new Map<string, string>();
for (const src of [PINYIN_SRC, PINYIN_EXTRA, PINYIN_NAMES, PINYIN_TRANSLIT, PINYIN_R08]) for (const [py, chars] of Object.entries(src)) for (const c of chars) if (!PINYIN.has(c)) PINYIN.set(c, py);
/** Pinyin syllables of a Chinese string (unknown characters → null). Folds variants first (華 → 华 → hua). */
export function pinyinOf(s: string): (string | null)[] {
  return [...s].filter((c) => isHan(c)).map((c) => PINYIN.get(VARIANT.get(c) ?? c) ?? null);
}

// ---------------------------------------------------------------- misc
export function editDistance(a: string, b: string, max = 3): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    let rowMin = dp[0];
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
      rowMin = Math.min(rowMin, dp[j]);
    }
    if (rowMin > max) return max + 1;
  }
  return dp[b.length];
}

/** English light stemmer for matching (bookings → book, renewing → renew, sheets → sheet). */
export function stem(w: string): string {
  let s = w.toLowerCase();
  if (s.length > 5 && s.endsWith("ings")) s = s.slice(0, -4);
  else if (s.length > 4 && s.endsWith("ing")) s = s.slice(0, -3);
  else if (s.length > 4 && s.endsWith("ies")) s = s.slice(0, -3) + "y";
  else if (s.length > 4 && s.endsWith("es") && /(ch|sh|x|s)es$/.test(s)) s = s.slice(0, -2);
  else if (s.length > 3 && s.endsWith("s") && !s.endsWith("ss")) s = s.slice(0, -1);
  else if (s.length > 4 && s.endsWith("ed")) s = s.slice(0, -2);
  if (s.length > 5 && s.endsWith("al")) s = s.slice(0, -2);
  return s;
}

/** Detect the main language of a sentence: kana → ja, Han → zh, else en. */
export function detectLang(s: string): "zh" | "ja" | "en" {
  if (/[ぁ-ゟァ-ヿ]/.test(s)) return "ja";
  if (/\p{Script=Han}/u.test(s)) return "zh";
  return "en";
}

// ---------------------------------------------------------------- romaji spellings, kana ↔ Latin sound, name kanji
/**
 * One key for the ways a Japanese reading is typed in Latin letters: Hepburn / Kunrei / Wāpuro spellings
 * (si = shi, ti = chi, tu = tsu, hu = fu, zi = ji, sya = sha), long vowels written or not (Kondou = Kondo = Kondō,
 * Ohno = Ono, Yuuki = Yuki), m before b/p/m (Homma = Honma).
 */
export function romajiKey(s: string): string {
  let x = latinFold(s).replace(/[^a-z]/g, "");
  x = x.replace(/sy([auo])/g, "sh$1").replace(/ty([auo])/g, "ch$1").replace(/zy([auo])/g, "j$1").replace(/jy([auo])/g, "j$1")
    .replace(/si/g, "shi").replace(/ti/g, "chi").replace(/tu/g, "tsu").replace(/hu/g, "fu").replace(/zi/g, "ji").replace(/di/g, "ji").replace(/du/g, "zu")
    .replace(/shhi/g, "shi").replace(/cchi/g, "tchi").replace(/chhi/g, "chi").replace(/tsshu/g, "tsu");
  x = x.replace(/m(?=[bpm])/g, "n").replace(/oh(?![aeiouy])/g, "o").replace(/ou/g, "o").replace(/oo/g, "o").replace(/uu/g, "u").replace(/aa/g, "a")
    .replace(/ii/g, "i").replace(/ee/g, "e");
  return x;
}

/**
 * Sound key of a Latin name word written the way katakana renders it (Smith ≈ スミス, Porter ≈ ポーター, Kramer ≈ クレーマー): spelling normalised to sounds first, then soundKey.
 */
export function latinSoundKey(s: string): string {
  let x = latinFold(s).replace(/[^a-z]/g, "");
  x = x.replace(/sch/g, "sh").replace(/ph/g, "f").replace(/th/g, "s").replace(/ck/g, "k").replace(/ch/g, "C")
    .replace(/c(?=[eiy])/g, "s").replace(/c/g, "k").replace(/C/g, "ch").replace(/q/g, "k").replace(/x/g, "ks")
    .replace(/([aeiou])r$/g, "$1").replace(/([aeiou])r(?=[^aeiouy])/g, "$1").replace(/m(?=[bp])/g, "n").replace(/ng$/g, "n");
  return soundKey(x);
}
/** A looser sound key: voicing and s / z / ts merged (katakana often voices or devoices: ローザ ≈ Rosa, ツ ≈ z). */
export function looseSoundKey(k: string): string {
  return k.replace(/ts/g, "s").replace(/z/g, "s").replace(/d/g, "t").replace(/g/g, "k").replace(/b/g, "p").replace(/(.)\1+/g, "$1");
}

/** Readings (kana) of kanji common in Japanese personal names, for a name the user typed in kanji but saved in kana. */
const JA_NAME_KANJI: [string, string][] = [
  [ "愛", "あい,まな,あ" ], [ "葵", "あおい" ], [ "明", "あき,めい,あ,あきら" ], [ "晶", "あき,しょう" ], [ "朝", "あさ,とも" ], [ "旭", "あさひ,あき" ], [ "梓", "あずさ" ],
  [ "彩", "あや,さい" ], [ "綾", "あや" ], [ "鮎", "あゆ" ], [ "歩", "あゆ,あゆみ,ほ" ], [ "杏", "あん,あんず" ], [ "安", "あ,やす,あん" ], [ "郁", "いく,か" ], [ "泉", "いずみ,せん" ],
  [ "一", "いち,かず,はじめ,い" ], [ "衣", "い,え,きぬ" ], [ "伊", "い" ], [ "乙", "おと" ], [ "羽", "は,う,わ" ], [ "詩", "うた,し" ], [ "海", "うみ,み,かい" ], [ "恵", "え,めぐみ,けい,めぐ" ],
  [ "栄", "えい,さかえ,ひで" ], [ "英", "えい,ひで,はな" ], [ "悦", "えつ" ], [ "絵", "え,かい" ], [ "央", "お,ひろ,なか" ], [ "桜", "さくら,おう" ], [ "音", "おと,ね,と,おん" ],
  [ "織", "おり,しき" ], [ "香", "か,かお,こう,かおり,きょう" ], [ "佳", "か,よし,けい" ], [ "花", "か,はな" ], [ "華", "か,はな" ], [ "夏", "か,なつ" ], [ "加", "か" ], [ "果", "か" ], [ "嘉", "か,よし" ],
  [ "薫", "かおる,かおり,くん" ], [ "馨", "かおる,けい" ], [ "楓", "かえで,ふう" ], [ "和", "かず,わ,やす,な" ], [ "数", "かず" ], [ "勝", "かつ,しょう,まさる" ], [ "克", "かつ" ],
  [ "要", "かなめ,よう" ], [ "奏", "かな,そう" ], [ "叶", "かな,きょう" ], [ "環", "たまき,かん" ], [ "菊", "きく" ], [ "希", "き,のぞみ,まれ" ], [ "紀", "き,のり" ], [ "喜", "き,よし" ],
  [ "貴", "き,たか" ], [ "輝", "き,てる,ひかる" ], [ "君", "きみ" ], [ "京", "きょう,けい,みやこ" ], [ "恭", "きょう,やす" ], [ "響", "きょう,ひびき" ], [ "清", "きよ,せい,きよし" ],
  [ "桐", "きり" ], [ "琴", "こと,きん" ], [ "空", "そら,くう" ], [ "健", "けん,たけ,けんじ" ], [ "賢", "けん,まさる" ], [ "謙", "けん" ], [ "憲", "けん,のり" ], [ "研", "けん" ],
  [ "光", "こう,ひかり,みつ,ひかる" ], [ "弘", "こう,ひろ,ひろし" ], [ "宏", "こう,ひろ,ひろし" ], [ "浩", "こう,ひろ,ひろし" ], [ "康", "こう,やす" ], [ "幸", "こう,ゆき,さち" ],
  [ "孝", "こう,たか" ], [ "航", "こう,わたる" ], [ "晃", "こう,あき" ], [ "耕", "こう" ], [ "剛", "ごう,たけし,つよし" ], [ "豪", "ごう" ], [ "心", "こころ,しん,み" ], [ "小", "こ,しょう,お" ],
  [ "子", "こ,し" ], [ "湖", "こ" ], [ "咲", "さき,さく,え" ], [ "早", "さ,さき" ], [ "沙", "さ,すな" ], [ "紗", "さ,しゃ" ], [ "彩", "あや,さい" ], [ "佐", "さ,すけ" ], [ "冴", "さえ" ],
  [ "栞", "しおり" ], [ "静", "しず,せい" ], [ "雫", "しずく" ], [ "忍", "しのぶ" ], [ "秀", "しゅう,ひで" ], [ "修", "しゅう,おさむ" ], [ "周", "しゅう,あまね" ], [ "俊", "しゅん,とし" ],
  [ "駿", "しゅん" ], [ "春", "しゅん,はる" ], [ "順", "じゅん" ], [ "純", "じゅん,すみ" ], [ "淳", "じゅん,あつし" ], [ "潤", "じゅん" ], [ "準", "じゅん" ], [ "昭", "しょう,あき" ],
  [ "翔", "しょう,かける,と" ], [ "将", "しょう,まさ" ], [ "祥", "しょう,さち" ], [ "正", "しょう,まさ,ただし,せい" ], [ "章", "しょう,あき" ], [ "彰", "しょう,あき" ], [ "尚", "しょう,なお,ひさ" ],
  [ "勝", "しょう,かつ,まさる" ], [ "伸", "しん,のぶ" ], [ "信", "しん,のぶ" ], [ "真", "しん,ま,まこと,さな" ], [ "慎", "しん" ], [ "新", "しん,あら" ], [ "晋", "しん" ], [ "進", "しん,すすむ" ],
  [ "仁", "じん,ひと,まさし" ], [ "澄", "すみ,ちょう" ], [ "菫", "すみれ" ], [ "涼", "りょう,すず" ], [ "鈴", "すず,れい,りん" ], [ "聖", "せい,さと,きよ" ], [ "誠", "せい,まこと,まさ" ],
  [ "晴", "せい,はる" ], [ "星", "せい,ほし" ], [ "千", "せん,ち,かず" ], [ "宗", "そう,むね" ], [ "創", "そう,はじめ" ], [ "蒼", "そう,あおい" ], [ "颯", "そう,はやて" ], [ "壮", "そう,たけ" ],
  [ "大", "だい,た,ひろ,まさる,お" ], [ "太", "た,だい,ふと" ], [ "泰", "たい,やす" ], [ "鷹", "たか" ], [ "隆", "たか,りゅう,たかし" ], [ "高", "たか,こう" ], [ "崇", "たか,そう,たかし" ],
  [ "拓", "たく,ひろ,ひらく" ], [ "卓", "たく,すぐる" ], [ "巧", "たくみ,こう" ], [ "匠", "たくみ,しょう" ], [ "武", "たけ,ぶ,む,たけし" ], [ "竜", "たつ,りゅう" ], [ "達", "たつ,たち,さとる" ],
  [ "樹", "き,じゅ,いつき,たつ" ], [ "珠", "たま,じゅ,み" ], [ "保", "たもつ,ほ,やす" ], [ "太郎", "たろう" ], [ "千尋", "ちひろ" ], [ "智", "ち,とも,さとし,さと" ], [ "知", "ち,とも,さと" ],
  [ "千", "ち,せん" ], [ "茶", "ちゃ" ], [ "司", "つかさ,し" ], [ "月", "つき,げつ" ], [ "翼", "つばさ,よく" ], [ "椿", "つばき" ], [ "鶴", "つる" ], [ "哲", "てつ,さとし" ], [ "徹", "てつ,とおる" ],
  [ "輝", "てる,き,ひかる" ], [ "照", "てる,しょう" ], [ "斗", "と" ], [ "冬", "ふゆ,とう" ], [ "透", "とおる,とう" ], [ "徳", "とく,のり" ], [ "俊", "とし,しゅん" ], [ "敏", "とし,びん" ],
  [ "寿", "とし,ひさ,じゅ" ], [ "友", "とも,ゆう" ], [ "朋", "とも" ], [ "智", "とも,ち,さとし" ], [ "知", "とも,ち" ], [ "豊", "とよ,ゆたか,ほう" ], [ "直", "なお,ただし,ちょく" ],
  [ "尚", "なお,ひさ" ], [ "菜", "な,さい" ], [ "奈", "な" ], [ "那", "な" ], [ "七", "なな,な" ], [ "渚", "なぎさ" ], [ "夏", "なつ,か" ], [ "波", "なみ,は" ], [ "成", "なり,せい,しげ" ],
  [ "信", "のぶ,しん" ], [ "伸", "のぶ,しん" ], [ "範", "のり" ], [ "典", "のり,てん" ], [ "憲", "のり,けん" ], [ "則", "のり" ], [ "法", "のり,ほう" ], [ "葉", "は,よう" ], [ "隼", "はやと,じゅん,はや" ],
  [ "颯", "はやて,そう" ], [ "遥", "はる,よう,はるか" ], [ "春", "はる,しゅん" ], [ "晴", "はる,せい" ], [ "陽", "はる,よう,ひ,あき" ], [ "悠", "ゆう,はる,ひさ" ], [ "遼", "りょう,はる" ],
  [ "日", "ひ,にち,か" ], [ "光", "ひかり,ひかる,こう,みつ" ], [ "久", "ひさ,く" ], [ "英", "ひで,えい" ], [ "秀", "ひで,しゅう" ], [ "瞳", "ひとみ" ], [ "雛", "ひな" ], [ "響", "ひびき" ],
  [ "博", "ひろ,はく,ひろし" ], [ "寛", "ひろ,かん,ひろし" ], [ "洋", "ひろ,よう,ひろし" ], [ "裕", "ひろ,ゆう,ひろし" ], [ "広", "ひろ,こう" ], [ "啓", "ひろ,けい,ひらく" ],
  [ "文", "ふみ,ぶん,あや" ], [ "史", "ふみ,し" ], [ "芙", "ふ" ], [ "富", "とみ,ふ" ], [ "舞", "まい,ま" ], [ "麻", "ま,あさ" ], [ "真", "ま,まこと,しん" ], [ "茉", "ま" ], [ "万", "ま,まん,かず" ],
  [ "雅", "まさ,が,みやび" ], [ "正", "まさ,しょう,ただし" ], [ "昌", "まさ,しょう" ], [ "政", "まさ,せい" ], [ "優", "ゆう,まさる,すぐる" ], [ "勝", "まさる,かつ" ], [ "学", "まなぶ,がく" ],
  [ "守", "まもる,もり" ], [ "衛", "まもる,え" ], [ "円", "まどか,えん" ], [ "丸", "まる" ], [ "美", "み,よし,び" ], [ "実", "み,みのる,じつ" ], [ "未", "み" ], [ "三", "み,さぶ,さん" ],
  [ "光", "みつ,ひかり" ], [ "満", "みつる,みつ" ], [ "緑", "みどり" ], [ "翠", "みどり,すい" ], [ "港", "みなと" ], [ "南", "みなみ" ], [ "稔", "みのる,とし" ], [ "宮", "みや" ], [ "雅", "みやび" ],
  [ "恵", "めぐみ,え,けい" ], [ "萌", "もえ" ], [ "元", "もと,げん" ], [ "基", "もと,き" ], [ "桃", "もも" ], [ "森", "もり,しん" ], [ "康", "やす,こう" ], [ "靖", "やす,せい" ], [ "泰", "やす,たい" ],
  [ "安", "やす,あん" ], [ "弥", "や,み,ひろ" ], [ "也", "や,なり" ], [ "耶", "や" ], [ "悠", "ゆう,はる" ], [ "優", "ゆう" ], [ "祐", "ゆう,すけ" ], [ "裕", "ゆう,ひろ" ], [ "勇", "ゆう,いさむ" ],
  [ "雄", "ゆう,お" ], [ "友", "ゆう,とも" ], [ "由", "ゆ,よし,ゆう" ], [ "結", "ゆ,ゆい" ], [ "唯", "ゆい" ], [ "雪", "ゆき,せつ" ], [ "幸", "ゆき,さち,こう" ], [ "行", "ゆき,こう" ], [ "之", "ゆき,の,し" ],
  [ "豊", "ゆたか" ], [ "夢", "ゆめ,む" ], [ "百合", "ゆり" ], [ "陽", "よう,ひ,はる" ], [ "洋", "よう,ひろ" ], [ "葉", "よう,は" ], [ "容", "よう" ], [ "蓉", "よう" ], [ "芳", "よし,ほう,か" ],
  [ "良", "よし,りょう,ら" ], [ "義", "よし,ぎ" ], [ "善", "よし,ぜん" ], [ "吉", "よし,きち" ], [ "慶", "よし,けい" ], [ "嘉", "よし,か" ], [ "好", "よし,こう" ], [ "頼", "より,らい" ],
  [ "来", "らい,く" ], [ "蘭", "らん" ], [ "里", "り,さと" ], [ "理", "り,おさむ,まさ" ], [ "莉", "り" ], [ "梨", "り,なし" ], [ "璃", "り" ], [ "陸", "りく" ], [ "律", "りつ" ], [ "立", "りつ,たつ" ],
  [ "竜", "りゅう,たつ" ], [ "龍", "りゅう,たつ" ], [ "隆", "りゅう,たか" ], [ "涼", "りょう,すず" ], [ "良", "りょう,よし" ], [ "亮", "りょう,あきら,すけ" ], [ "諒", "りょう" ], [ "遼", "りょう" ],
  [ "稜", "りょう" ], [ "凛", "りん" ], [ "琳", "りん" ], [ "麟", "りん" ], [ "玲", "れい" ], [ "礼", "れい,あや" ], [ "怜", "れい" ], [ "麗", "れい" ], [ "蓮", "れん" ], [ "錬", "れん" ], [ "廉", "れん" ],
  [ "郎", "ろう,お" ], [ "朗", "ろう,あき,お" ], [ "和", "わ,かず,やす" ], [ "渉", "わたる,しょう" ], [ "亘", "わたる" ], [ "介", "すけ,かい" ], [ "助", "すけ" ], [ "輔", "すけ,ほ" ], [ "甫", "すけ,ほ" ],
  [ "典", "のり" ], [ "治", "じ,はる,おさむ" ], [ "次", "じ,つぐ" ], [ "二", "じ,に,ふ" ], [ "司", "じ,し,つかさ" ], [ "児", "じ,こ" ], [ "史", "し,ふみ" ], [ "志", "し,ゆき,じ" ], [ "士", "し,じ" ],
  [ "嗣", "し,つぐ" ], [ "枝", "え,し" ], [ "江", "え,こう" ], [ "絵", "え" ], [ "代", "よ,だい" ], [ "世", "よ,せ,せい" ], [ "夜", "よ,や" ], [ "乃", "の,だい" ], [ "野", "の,や" ], [ "能", "の,よし" ],
  [ "音", "ね,おと" ], [ "寧", "ね,やす" ], [ "子", "こ" ], [ "胡", "こ" ], [ "瑚", "こ" ], [ "湖", "こ" ], [ "古", "こ,ふる" ], [ "実", "み" ], [ "見", "み" ], [ "巳", "み" ], [ "樹", "き,き" ], [ "紀", "き,のり" ],
  [ "輝", "き" ], [ "季", "き" ], [ "稀", "き" ], [ "姫", "ひめ,き" ], [ "妃", "ひ,き" ], [ "菜", "な" ], [ "帆", "ほ" ], [ "穂", "ほ" ], [ "保", "ほ" ], [ "歩", "ほ" ], [ "宝", "ほう,たから" ], [ "峰", "みね,ほう" ],
  // common surname kanji
  [ "田", "た,だ,でん" ], [ "中", "なか,ちゅう" ], [ "山", "やま,さん" ], [ "川", "かわ,がわ,せん" ], [ "本", "もと,ほん" ], [ "村", "むら" ], [ "井", "い,せい" ], [ "上", "うえ,かみ,じょう" ],
  [ "下", "した,しも,か" ], [ "木", "き,ぎ,もく" ], [ "林", "はやし,りん,ばやし" ], [ "島", "しま,じま,とう" ], [ "嶋", "しま,じま" ], [ "藤", "ふじ,とう,どう" ], [ "佐", "さ" ], [ "伊", "い" ],
  [ "渡", "わた,と" ], [ "辺", "べ,なべ,へん" ], [ "邊", "べ,なべ" ], [ "部", "べ,ぶ" ], [ "谷", "たに,や,だに" ], [ "原", "はら,ばら,げん" ], [ "野", "の,や" ], [ "松", "まつ,しょう" ],
  [ "竹", "たけ,ちく" ], [ "梅", "うめ,ばい" ], [ "石", "いし,せき,こく" ], [ "岡", "おか" ], [ "崎", "さき,ざき" ], [ "﨑", "さき,ざき" ], [ "沢", "さわ,ざわ,たく" ], [ "澤", "さわ,ざわ" ],
  [ "浜", "はま" ], [ "濱", "はま" ], [ "池", "いけ" ], [ "橋", "はし,ばし" ], [ "前", "まえ,ぜん" ], [ "後", "ご,うしろ,のち" ], [ "内", "うち,ない" ], [ "西", "にし,さい" ], [ "東", "ひがし,とう,あずま" ],
  [ "北", "きた,ほく" ], [ "南", "みなみ,なん" ], [ "坂", "さか,ざか" ], [ "阪", "さか" ], [ "宮", "みや" ], [ "森", "もり" ], [ "清", "きよ,し" ], [ "水", "みず,すい" ], [ "菊", "きく" ],
  [ "地", "ち,じ" ], [ "福", "ふく" ], [ "斎", "さい" ], [ "齋", "さい" ], [ "斉", "さい" ], [ "齊", "さい" ], [ "吉", "よし,きち" ], [ "高", "たか" ], [ "鈴", "すず" ], [ "近", "こん,ちか" ], [ "遠", "えん,とお" ],
  [ "関", "せき" ], [ "口", "ぐち,くち" ], [ "瀬", "せ,ぜ" ], [ "堀", "ほり" ], [ "星", "ほし" ], [ "長", "なが,ちょう" ], [ "谷川", "たにがわ" ], [ "久", "く,ひさ" ], [ "保", "ぼ,ほ,やす" ],
  [ "菅", "すが,かん" ], [ "杉", "すぎ" ], [ "桑", "くわ" ], [ "熊", "くま" ], [ "浅", "あさ" ], [ "荒", "あら" ], [ "新", "にい,あら,しん" ], [ "今", "いま" ], [ "金", "かね,きん,かな" ], [ "秋", "あき" ],
  [ "丸", "まる" ], [ "安", "やす,あ,あん" ], [ "永", "なが,えい" ], [ "平", "ひら,たいら,へい" ], [ "片", "かた" ], [ "桐", "きり" ], [ "鳥", "とり" ], [ "飯", "いい" ], [ "市", "いち" ], [ "城", "しろ,じょう" ],
  [ "宇", "う" ], [ "尾", "お" ], [ "小", "こ,お,しょう" ], [ "大", "おお,だい,た" ], [ "太", "おお,た" ], [ "千", "ち,せん" ], [ "葉", "ば,は,よう" ], [ "市川", "いちかわ" ], [ "早", "はや,さ" ],
  [ "河", "かわ,こう" ], [ "沼", "ぬま" ], [ "湯", "ゆ" ], [ "雨", "あま,う" ], [ "門", "かど,もん" ], [ "角", "かど,すみ" ], [ "白", "しら,しろ,はく" ], [ "黒", "くろ" ], [ "赤", "あか" ], [ "青", "あお" ],
  [ "緑", "みどり" ], [ "若", "わか" ], [ "菅原", "すがわら" ],
  // r08: more common surname / given-name kanji and fixed multi-kanji readings (any user's contacts)
  [ "人", "と,ひと,じん" ], [ "亜", "あ" ], [ "阿", "あ" ], [ "工", "く,こう" ], [ "浦", "うら" ], [ "横", "よこ" ], [ "増", "ます" ], [ "塚", "つか" ],
  [ "望", "もち,のぞみ,のぞむ,のぞ,ぼう" ], [ "長谷", "はせ" ], [ "井上", "いのうえ" ], [ "木下", "きのした" ], [ "山下", "やました" ], [ "渡部", "わたなべ" ],
  [ "藤原", "ふじわら" ], [ "服部", "はっとり" ], [ "原", "わら" ], [ "汰", "た" ], [ "哉", "や" ], [ "吾", "ご" ], [ "悟", "さとる,ご,さと" ], [ "聡", "さとし,そう,さと" ],
  [ "敦", "あつし,あつ" ], [ "篤", "あつ,あつし" ], [ "厚", "あつ,あつし" ], [ "勲", "いさお" ], [ "功", "いさお,こう" ], [ "茂", "しげる,しげ" ], [ "繁", "しげ,しげる" ],
  [ "昇", "のぼる,しょう" ], [ "登", "のぼる,と" ], [ "勉", "つとむ" ], [ "努", "つとむ" ], [ "力", "りき,ちから" ], [ "毅", "たけし,き" ], [ "譲", "ゆずる,じょう" ],
  [ "紘", "ひろ" ], [ "絢", "あや" ], [ "澪", "みお" ], [ "瑞", "みず,ずい" ], [ "紬", "つむぎ" ], [ "碧", "あお,へき" ], [ "朱", "あけ,しゅ" ], [ "茜", "あかね" ],
  [ "景", "けい,かげ" ], [ "圭", "けい" ], [ "慧", "けい,さと" ], [ "敬", "けい,たか" ], [ "湊", "みなと" ], [ "大和", "やまと" ], [ "日向", "ひなた" ],
  [ "塩", "しお" ], [ "鎌", "かま" ], [ "倉", "くら" ], [ "辻", "つじ" ], [ "畑", "はた" ], [ "畠", "はた" ], [ "篠", "しの" ], [ "笠", "かさ" ], [ "梶", "かじ" ],
  [ "宅", "たく" ], [ "垣", "がき,かき" ], [ "沖", "おき" ], [ "舟", "ふな" ], [ "船", "ふな" ], [ "江", "え" ], [ "条", "じょう" ], [ "条", "じょう" ], [ "寺", "てら,でら" ],
  [ "神", "かみ,じん,かん" ], [ "宮", "みや" ], [ "国", "くに" ], [ "古", "ふる" ], [ "里", "さと" ], [ "道", "みち" ], [ "通", "みち" ], [ "路", "みち" ], [ "富", "とみ" ], [ "根", "ね" ], [ "岩", "いわ" ], [ "草", "くさ" ], [ "柴", "しば" ], [ "芝", "しば" ], [ "服", "はっ,ふく" ], [ "武", "たけ" ], [ "酒", "さか,さけ" ],
];
const JA_NAME_READ = new Map<string, string[]>();
for (const [k, v] of JA_NAME_KANJI) {
  const key = [...k].map((c) => VARIANT.get(c) ?? c).join("");
  const prev = JA_NAME_READ.get(key) ?? [];
  JA_NAME_READ.set(key, [...new Set([...prev, ...v.split(",")])]);
}
const DAKU: Record<string, string> = { か: "が", き: "ぎ", く: "ぐ", け: "げ", こ: "ご", さ: "ざ", し: "じ", す: "ず", せ: "ぜ", そ: "ぞ", た: "だ", ち: "ぢ", つ: "づ", て: "で", と: "ど", は: "ば", ひ: "び", ふ: "ぶ", へ: "べ", ほ: "ぼ" };
const toHira = (s: string) => [...s].map((c) => { const k = c.codePointAt(0)!; return k >= 0x30a1 && k <= 0x30f6 ? String.fromCodePoint(k - 0x60) : c; }).join("");
const longFold = (s: string) => toRomaji(s);
/**
 * Can this kanji string be read as this kana reading? Each kanji (or listed kanji pair) takes one of its name
 * readings; a non-initial reading may be voiced (rendaku: 島 しま → じま); long vowels compared through romaji.
 */
export function kanjiReadsAs(kanji: string, kana: string): boolean {
  const chars = [...kanji].map((c) => VARIANT.get(c) ?? c);
  for (let i = 1; i < chars.length; i++) if (chars[i] === "々" || chars[i] === "〻") chars[i] = chars[i - 1]; // r08: the repeat mark reads as the kanji before it
  if (!chars.length || chars.length > 4 || !chars.every(isHan)) return false;
  const target = longFold(toHira(kana).replace(/[\s　]/g, ""));
  if (!target) return false;
  const seen = new Set<string>();
  const go = (i: number, pos: string): boolean => {
    if (i === chars.length) return longFold(pos) === target;
    const memo = `${i}|${pos}`;
    if (seen.has(memo)) return false;
    seen.add(memo);
    if (!target.startsWith(longFold(pos).slice(0, Math.max(0, longFold(pos).length - 2)))) return false;
    for (const len of [2, 1]) {
      if (i + len > chars.length) continue;
      const reads = JA_NAME_READ.get(chars.slice(i, i + len).join(""));
      if (!reads) continue;
      for (const r of reads) {
        const alts = i > 0 && DAKU[r[0]] ? [r, DAKU[r[0]] + r.slice(1)] : [r];
        for (const a of alts) if (go(i + len, pos + a)) return true;
      }
    }
    return false;
  };
  return go(0, "");
}

/**
 * Wade-Giles spelling of a pinyin syllable, apostrophes dropped (zhang → chang, xu → hsu, qiu → chiu, zhi → chih,
 * cai → tsai, guo → kuo, jiang → chiang): Taiwan and older passports spell Chinese names this way.
 */
export function wadeGiles(py: string): string {
  const s0 = py.toLowerCase().replace(/ü|v/g, "u");
  const whole: Record<string, string> = { zhi: "chih", chi: "chih", shi: "shih", ri: "jih", zi: "tzu", ci: "tzu", si: "ssu", er: "erh", you: "yu", yan: "yen", ye: "yeh", yong: "yung", yi: "i", yue: "yueh" };
  if (whole[s0]) return whole[s0];
  const m = s0.match(/^(zh|ch|sh|[bpmfdtnlgkhjqxrzcsyw]?)(.*)$/)!;
  const ini = m[1];
  let fin = m[2];
  const INI: Record<string, string> = { zh: "ch", ch: "ch", q: "ch", j: "ch", x: "hs", z: "ts", c: "ts", r: "j", b: "p", d: "t", g: "k" };
  fin = fin.replace(/iong$/, "iung").replace(/ong$/, "ung").replace(/ian$/, "ien").replace(/ie$/, "ieh").replace(/ue$/, "ueh");
  if (fin === "uo" && !/^(g|k|h|sh)$/.test(ini)) fin = "o";
  if (fin === "e" && /^(g|k|h)$/.test(ini)) fin = "o";
  return (INI[ini] ?? ini) + fin;
}
