// @ts-nocheck -- conversation/impl/text.ts: copied byte for byte from lab-conv repos/orbits/lab/conversation/rsi/archive/r10/impl/text.ts
// (lab commit 41c7a53d6, r10 = r09 + when to ask: confirmations, missing values, requests that ask for nothing). Only these two header lines differ; the lab code does not pass this repo's build typecheck.
/**
 * Text normalisation shared by every part of the implementation: NFKC, lower case, Latin diacritics stripped,
 * traditional Chinese and Japanese shinjitai folded onto simplified Chinese, katakana folded onto hiragana.
 * The character table is a general traditional / shinjitai → simplified table (not this world's content).
 */

const PAIRS =
  "這这會会議议紀纪錄录録录樣样給给總总遠远嵐岚電电視视訊讯華华雲云東东気气氣气發发発发資资書书見见積积報报價价価价確确認认" +
  "單单単单銀银業业務务員员長长經经経经師师運运費费貨货櫃柜時时間间問问題题図图圖图紙纸計计劃划開开關关関关聯联連连絡络様样號号" +
  "週周個个們们對对対对說说説说話话讀读読读調调査查傳传伝传體体実实實实驗验験验審审質质測测試试歲岁歳岁禮礼準准備备參参与与與与學学" +
  "習习戰战戦战國国際际場场覽览覧览營营営营銷销張张偉伟劉刘軍军鳴鸣趙赵陳陈鄭郑楊杨馬马許许靜静歐欧陽阳錢钱強强濱滨浜滨橫横" +
  "廣广広广樂乐楽乐賣卖売卖續续続续鐵铁鉄铁澤泽沢泽邊边辺边圓圆円圆縣县県县黑黑黒黑歸归帰归權权権权檢检検检險险険险轉转転转辦办" +
  "勞劳労劳覺觉覚觉舉举挙举讓让譲让謝谢語语證证証证談谈處处処处結结緒绪緣缘縁缘線线細细組组繪绘絵绘統统練练績绩織织約约級级" +
  "終终編编綠绿緑绿鋼钢鏡镜門门閉闭聞闻陰阴隊队雜杂雑杂難难頭头顏颜顔颜願愿類类風风飛飞飯饭館馆鳥鸟魚鱼齋斋斎斋齊齐斉齐齒齿歯齿" +
  "齡龄齢龄亞亚亜亚惡恶悪恶壓压圧压圍围囲围醫医隱隐隠隐榮荣栄荣鹽盐塩盐應应応应櫻樱桜樱假假擴扩拡扩勸劝勧劝卷卷巻卷寬宽寛宽" +
  "歡欢歓欢觀观観观偽伪戲戏戯戏犧牺犠牺舊旧據据拠据峽峡狹狭曉晓暁晓區区驅驱駆驱惠惠恵惠繼继継继雞鸡鶏鸡藝艺芸艺擊击撃击劍剑剣剑" +
  "圈圈圏圈顯显顕显嚴严厳严礦矿鉱矿濟济済济劑剂剤剂贊赞賛赞殘残残残兒儿児儿濕湿湿湿寫写写写釋释釈释壽寿寿寿收收収收從从従从澀涩渋涩" +
  "獸兽獣兽縱纵縦纵肅肃粛肃敘叙將将将将獎奖奨奖涉涉渉涉燒烧焼烧乘乘乗乘淨净浄净剩剩剰剩疊叠畳叠條条条条狀状状状釀酿醸酿囑嘱嘱嘱" +
  "觸触触触寢寝寝寝慎慎盡尽尽尽粹粹粋粹醉醉酔醉穗穗穂穗隨随随随髓髓髄髓樞枢枢枢數数数数瀨濑瀬濑聲声声声靜静静静竊窃窃窃攝摄摂摄" +
  "專专専专淺浅浅浅踐践践践錢钱銭钱潛潜潜潜纖纤繊纤禪禅禅禅雙双双双壯壮壮壮爭争争争莊庄荘庄搜搜捜搜插插挿插巢巢巣巢裝装装装僧僧" +
  "層层層层騷骚騒骚增增増增憎憎藏藏蔵藏贈赠贈赠臟脏臓脏屬属属属墮堕堕堕帶带帯带滯滞滞滞臺台瀧泷滝泷擇择択择擔担担担膽胆胆胆團团団团" +
  "彈弹弾弹斷断断断遲迟遅迟癡痴晝昼昼昼蟲虫虫虫鑄铸鋳铸廳厅庁厅徵征徴征聽听聴听鎮镇鎮镇塚冢遞递逓递點点点点燈灯灯灯當当当当黨党党党" +
  "盜盗盗盗稻稻稲稻鬥斗闘斗德德徳德獨独独独屆届届届惱恼悩恼腦脑脳脑廢废廃废拜拜拝拜髮发髪发拔拔抜拔晚晚晩晚蠻蛮蛮蛮祕秘秘秘賓宾" +
  "頻频敏敏甁瓶瓶瓶侮侮福福拂拂払拂佛佛仏佛併并並并塀塀餅饼餅饼變变変变舖铺舗铺步步歩步寶宝宝宝豐丰豊丰褒褒沒没没没飜翻每每毎每" +
  "萬万満满滿满免免默默黙默彌弥弥弥藥药薬药譯译訳译豫豫餘余余余譽誉誉誉搖摇揺摇謠谣謡谣來来来来賴赖頼赖亂乱乱乱欄栏欄栏龍龙竜龙" +
  "虜虏両两兩两獵猎猟猎淚泪涙泪壘垒塁垒勵励励励戾戾戻戾靈灵霊灵曆历暦历歷历歴历戀恋恋恋爐炉炉炉樓楼楼楼祿禄禄禄灣湾湾湾" +
  "車车軍军輛辆輸输軟软載载輕轻較较輪轮輩辈農农濃浓辭辞邏逻郵邮鄉乡醜丑醬酱錯错鍵键鐘钟閱阅闆板陸陆險险隻只雖虽雙双雞鸡離离" +
  "電电靈灵響响頁页項项順顺須须頒颁預预領领頻频題题額额風风飄飘飯饭飲饮飽饱餐餐養养餓饿館馆首首馬马駐驻驗验騎骑體体髮发鬆松" +
  "魯鲁鮮鲜鳳凤麥麦麵面點点齊齐龜龟優优價价億亿儀仪償偿兩两冊册凍冻剛刚創创劇剧務务勝胜勢势區区協协卻却厲厉參参雙双叢丛" +
  "啟启喪丧單单嚴严團团園园圓圆塊块壞坏壓压奪夺奮奋婦妇媽妈孫孙寧宁實实寵宠尋寻導导將将層层屆届島岛峯峰幣币幫帮幹干廠厂廳厅" +
  "張张彎弯彙汇徑径後后復复恥耻悅悦惡恶惱恼愛爱態态慣惯慮虑憶忆懷怀戶户掛挂採采換换揚扬損损搶抢擁拥擇择擔担據据擬拟攜携敗败" +
  "敵敌斂敛無无昇升晉晋暈晕暢畅暫暂曬晒會会東东棄弃極极構构槍枪樁桩標标樹树橋桥機机檔档權权歡欢歲岁殺杀殼壳毀毁氣气決决沖冲" +
  "況况涼凉測测渦涡溝沟滅灭滬沪漁渔漢汉潔洁潤润澤泽濟济災灾煙烟煩烦燈灯營营燭烛爺爷狀状獲获現现瑣琐環环產产畫画畢毕異异當当" +
  "療疗盡尽監监盤盘矚瞩礎础禮礼稅税穀谷穩稳竊窃筆笔築筑簡简簽签籌筹糧粮糾纠紅红納纳紛纷紹绍絕绝絲丝綁绑綜综緊紧總总績绩繁繁" +
  "罰罚罷罢義义習习聖圣職职聯联肅肃脈脉腳脚臉脸舉举艙舱艱艰莖茎萊莱葉叶著着蒼苍蓋盖蔣蒋蘇苏蘭兰處处號号蟲虫補补裝装複复規规" +
  "視视覺觉覽览觀观訂订訊讯討讨訓训記记訪访設设許许診诊詞词詢询試试詳详誌志誘诱語语誤误課课請请諾诺謀谋講讲謂谓識识譜谱護护" +
  "讚赞貝贝負负財财貢贡貧贫責责貴贵買买貸贷賀贺資资賢贤賬账賽赛贏赢趕赶趨趋跡迹踐践軌轨辦办農农這这連连進进遊游運运過过達达" +
  "違违遞递遠远適适遲迟遷迁選选遺遗邊边鄰邻醫医釋释鈴铃鉛铅銅铜鋒锋錄录錦锦鍋锅鎖锁鏈链鑒鉴閃闪閉闭閣阁闊阔闖闯關关陣阵陰阴陳陈" +
  "隨随隱隐雜杂雲云電电震震靜静頂顶頃顷頓顿頗颇頸颈頻频顧顾顯显飾饰餘余駕驾駛驶騰腾驚惊髒脏鬧闹魚鱼鴨鸭鵬鹏鹽盐麗丽黨党齡龄" +
  "読读売卖帰归権权転转営营効效恒恒黄黄研研径径茎茎掲揭渓溪蛍萤勲勋倹俭献献桟栈蚕蚕惨惨糸丝辞辞湿湿将将奨奖剰剩嬢娘譲让醸酿" +
  "嘱嘱寝寝尽尽粋粹穂穗髄髓瀬濑摂摄繊纤禅禅荘庄捜搜挿插巣巢騒骚蔵藏臓脏堕堕滝泷択择胆胆団团弾弹遅迟昼昼鋳铸徴征聴听逓递稲稻" +
  "闘斗悩恼脳脑廃废髪发抜拔晩晚蛮蛮賓宾瓶瓶塀塀餅饼弁办舗铺褒褒翻翻黙默弥弥訳译謡谣頼赖欄栏竜龙虜虏猟猎涙泪塁垒霊灵暦历歴历炉炉楼楼禄禄" +
  "沈沈審审査查総总託托銘铭邸邸貿贸荷荷鳥鸟惑惑缶罐芦芦";

const CHAR_MAP = new Map<string, string>();
for (let i = 0; i + 1 < PAIRS.length; i += 2) {
  const from = PAIRS[i];
  const to = PAIRS[i + 1];
  if (from !== to && !CHAR_MAP.has(from)) CHAR_MAP.set(from, to);
}

const LATIN_ACCENT = /[À-ɏ]/g;

/** The folded form of a string, character for character (same length for almost all inputs). */
export function fold(s: string): string {
  let out = s.normalize("NFKC").toLowerCase();
  out = out.replace(LATIN_ACCENT, (c) => c.normalize("NFKD").replace(/[̀-ͯ]/g, ""));
  let r = "";
  let mask = "";
  let kata = false;
  for (const ch of out) {
    const code = ch.codePointAt(0)!;
    const piece = code >= 0x30a1 && code <= 0x30f6 ? String.fromCodePoint(code - 0x60) : CHAR_MAP.get(ch) ?? ch;   // katakana → hiragana
    r += piece;
    const k = code >= 0x30a1 && code <= 0x30ff;
    if (k) kata = true;
    mask += (k ? "1" : "0").repeat(piece.length);
  }
  if (kata) {
    if (KATA.size > 20000) KATA.clear();
    KATA.set(r, mask);
  }
  return r;
}

/** Which characters of a folded text were katakana before folding ("1" / "0" per UTF-16 unit), when it was folded here. */
const KATA = new Map<string, string>();
export function katakanaMask(folded: string): string | null {
  return KATA.get(folded) ?? null;
}

/** Folded and without spaces or middle dots (for CJK-style substring matching). */
export const squash = (s: string) => fold(s).replace(/[\s·・　_\-]+/g, "");

export const isCjk = (ch: string) => /[㐀-鿿豈-﫿]/u.test(ch);
export const isKana = (ch: string) => /[぀-ヿ]/u.test(ch);
export const isLatin = (ch: string) => /[a-z0-9]/i.test(ch);

/** Compiles a list of words (folded) into one alternation regex; longest first. */
export function wordsRe(words: readonly string[], flags = "u"): RegExp {
  const ws = [...new Set(words.map(fold))].sort((a, b) => b.length - a.length).map(escapeRe);
  return new RegExp(ws.join("|"), flags);
}

export const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Does a folded text contain a Latin word / phrase with word boundaries, or a CJK / kana string anywhere? */
export function containsTerm(text: string, term: string): boolean {
  if (!term) return false;
  if (/^[a-z0-9 .'&-]+$/.test(term)) {
    const re = new RegExp(`(^|[^a-z0-9])${escapeRe(term)}($|[^a-z0-9])`);
    return re.test(text);
  }
  return text.includes(term);
}

/** Index of a term in a folded text with the same boundary rule as containsTerm (-1 = absent). */
export function indexOfTerm(text: string, term: string, from = 0): number {
  if (!term) return -1;
  if (/^[a-z0-9 .'&-]+$/.test(term)) {
    const re = new RegExp(`(^|[^a-z0-9])(${escapeRe(term)})(?=$|[^a-z0-9])`, "g");
    re.lastIndex = from;
    const m = re.exec(text);
    return m ? m.index + m[1].length : -1;
  }
  return text.indexOf(term, from);
}

/** The longest common substring length of two folded strings (CJK counts characters; Latin is compared as words). */
export function commonRun(a: string, b: string): number {
  if (!a || !b) return 0;
  let best = 0;
  const prev = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let diag = 0;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = a[i - 1] === b[j - 1] ? diag + 1 : 0;
      if (prev[j] > best) best = prev[j];
      diag = tmp;
    }
  }
  return best;
}

/** Content chunks of a folded text: CJK / kana runs and Latin words, split at punctuation and spaces. */
export function chunks(text: string): string[] {
  return text.split(/[\s,，、。.！!？?：:；;「」『』（）()【】\[\]"'“”‘’…—~〜/]+/u).filter(Boolean);
}

const FRE_CACHE = new Map<string, RegExp>();
/** A regex literal written with traditional / shinjitai / katakana characters, folded so it runs on fold()ed text. */
export function fre(re: RegExp): RegExp {
  const key = `${re.flags}\u0000${re.source}`;
  let r = FRE_CACHE.get(key);
  if (!r) {
    let src = "";
    for (const ch of re.source) {
      const code = ch.codePointAt(0)!;
      if (code >= 0x30a1 && code <= 0x30f6) src += String.fromCodePoint(code - 0x60);
      else src += CHAR_MAP.get(ch) ?? ch;
    }
    r = new RegExp(src, re.flags);
    FRE_CACHE.set(key, r);
  }
  if (r.global || r.sticky) r.lastIndex = 0;
  return r;
}
