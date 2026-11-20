/**
 * AG14 UI run (early judge, AE-REF-007 R2): a Japanese answer about Chinese records kept words of the records as they
 * were — 「交付周期」「报价」「修订版」 inside Japanese sentences. The answer model copies the material's words when it
 * paraphrases; nothing checked it. Code now finds such words and the answer step gets its one repair with them named.
 *
 * A word counts when, outside quotes and outside every name the user or a record gives (contact names, record
 * titles), a run of Han characters of the answer appears word for word in a Chinese sentence of the material and is
 * not plain Japanese: it has a character Japanese does not use (报, 订 …), or it is three characters or longer
 * (交付周期). Two-character runs of shared characters (月末, 期限) are left alone. English answers: any such run.
 */

/** Simplified forms that Japanese does not write (the common ones in business records). */
const SIMPLIFIED_ONLY = new Set(Array.from(
  "们这说话时间个为见问题对东发经过动还进现实学会机关开长门车书买卖认让论计设语读议请谈费贵资质账货购单从众优价务产亲仅传伤体侧准则刚办协卫厂历压县参双变叶号吗听启员响团园围图圆坏块坚报场备复头夺奋妇实宽寻导岁岛帅师带帮库应废异弃张录归当怀态总恋悬惊惯戏战户执扩扫护担拥择拦拨挡挥损换据掷携摄撑数断无旧显晓暂术杀杂权条来杨极构枪柜标栏树样桥档梦检楼横欢欧毕气汇汉沟没泪济浅测浏涂润涨渐温湾灭灯灵炉点炼烂烟热爱爷牵犹状独狮猎献环电画畅疗盐监盖盘矿码砖础硕确碍礼祸离种积称稳穷窃竞笔简类粮紧红约级纪纤纯纲纳纵纸线练组细织终绍经结绕绘给络绝统继绩绪续绳维绵综绿缓编缘缩网罗罚职联聪肃肠肤肿胁胜脑脚脱艰节苏药获荣萝营蓝虑虽蚀补衬袭装观规视览觉触订讨训讯记讲许访证评识诉词译试诗诚诞询该详误诸课谁调谊谋谓谢谱贝负贡财责败贩贪贯贴贸赏赔赖赚赛赞赠赢赶趋跃践踪轮软轻载较辅辆辈辉输辩边达迁运远违连迟适选递逻遗邮邻郁酱释针钉钟钢钥钱铁铃铜铭银锁锅锋错锦键镇闭闲闷闹闻阅阔队阳阴阵际陆陈险随隐难雾顺须顾顿预领频颜额风飞饭饮饰饱馆马驱驶驻验骑鱼鸟鸡鸣鸭麦黄龙",
));

const HAN_RUN = /\p{Script=Han}+/gu;
const KANA = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;
/** Quoted spans: a quoted word is the record's own wording, said as such. */
const QUOTED = /「[^」]*」|『[^』]*』|“[^”]*”|"[^"]*"|【[^】]*】/gu;

const isChineseSentence = (text: string) => /\p{Script=Han}/u.test(text) && !KANA.test(text);
const notPlainJapanese = (run: string) => run.length >= 3 || Array.from(run).some((char) => SIMPLIFIED_ONLY.has(char));

/**
 * The words of a Japanese or English answer left as they stand in the Chinese material. `names` are the names and
 * titles the user's message and the records give (they stay as they are); `material` the material's sentences.
 */
export function untranslatedSourceWords(input: { text: string; language: "zh" | "ja" | "en"; material: readonly string[]; names: readonly string[] }): string[] {
  if (input.language === "zh") return [];
  const chinese = input.material.filter(isChineseSentence);
  if (!chinese.length) return [];
  const names = input.names.filter((name) => /\p{Script=Han}/u.test(name));
  const open = input.text.replace(QUOTED, " ");
  const found: string[] = [];
  for (const match of open.matchAll(HAN_RUN)) {
    const run = match[0];
    if (found.includes(run)) continue;
    if (input.language === "ja" && !notPlainJapanese(run)) continue;
    if (names.some((name) => name.includes(run) || run.includes(name))) continue;
    if (!chinese.some((sentence) => sentence.includes(run))) continue;
    found.push(run);
  }
  return found;
}

/** The repair note the answer step adds for a part whose answer kept such words. */
export function untranslatedProblem(partId: string, words: readonly string[], language: "ja" | "en"): string {
  const target = language === "ja" ? "Japanese" : "English";
  return `${partId}: the answer is in ${target} but keeps words of the Chinese records as they are (${words.join(", ")}); say each of them in ${target}. Only a record's own name or title stays as it is, inside 「」.`;
}
