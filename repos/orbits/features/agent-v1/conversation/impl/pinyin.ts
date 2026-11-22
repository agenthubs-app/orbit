// @ts-nocheck -- conversation/impl/pinyin.ts: copied byte for byte from lab-conv repos/orbits/lab/conversation/rsi/archive/r09-maintenance/impl/pinyin.ts
// (lab commit 567915f70, r09 = r08 + reference spans stop at function words). Only these two header lines differ; the lab code does not pass this repo's build typecheck.
/**
 * Toneless pinyin of common Chinese characters (simplified), grouped by syllable: the characters that most often
 * appear in personal names, given names and company names in general — a general frequency list, not this world's
 * names — so a Chinese name or company core can meet its romanised spelling in an English or mixed message.
 * A name is romanised only when every character of it is in the table. Polyphonic characters take their name reading.
 */
const BY_SYLLABLE =
  "a:阿 ai:艾爱蔼 an:安岸按 ang:昂 ao:敖奥傲澳 " +
  "ba:巴八 bai:白百柏拜 ban:班板 bang:邦帮 bao:包宝保鲍报 bei:北贝备 ben:本奔 bi:毕碧必璧 bian:边卞变 biao:彪标 bin:彬斌宾滨 bing:冰兵炳秉 bo:博波柏伯勃 bu:卜步 " +
  "cai:蔡才彩财采 can:灿 cang:苍 cao:曹草 cen:岑 chai:柴 chang:常昌长畅 chao:超潮 che:车 chen:陈晨辰臣 cheng:程成城诚承乘 chi:池迟驰 chong:崇冲 chu:楚初储褚 chuan:川传船 chuang:创 chun:春纯淳 ci:慈 cong:丛聪 cui:崔翠 cun:村 " +
  "da:达大 dai:戴代黛 dan:丹旦 dang:党 dao:道 de:德 deng:邓登灯 di:狄迪笛帝 dian:典殿电 diao:刁 ding:丁鼎定 dong:董东栋冬 dou:窦 du:杜都 duan:段端 dui:兑 dun:敦 duo:多朵 " +
  "e:鄂娥 en:恩 er:尔 " +
  "fa:发法 fan:范樊凡帆繁 fang:方房芳放 fei:费飞菲 fen:芬 feng:冯丰峰凤枫锋风 fu:付傅符富福甫阜伏 " +
  "gan:甘干 gang:刚港 gao:高 ge:葛戈格歌 geng:耿 gong:龚宫巩公功 gou:苟 gu:顾古谷谷 guan:关管冠官 guang:光广 gui:桂贵 guo:郭国果 " +
  "hai:海 han:韩汉涵寒翰 hang:杭航 hao:郝浩豪昊好 he:何贺和河禾荷鹤合赫 hei:黑 heng:恒衡 hong:洪红宏鸿弘虹 hou:侯厚 hu:胡虎湖 hua:华花桦 huai:怀 huan:欢环焕 huang:黄皇煌 hui:惠慧辉晖会汇 hun:珲 huo:霍火 " +
  "ji:纪季吉姬冀稽基济计 jia:贾佳嘉家加 jian:简建剑坚健鉴 jiang:江姜蒋将 jiao:焦娇 jie:杰洁捷婕 jin:金靳锦晋进瑾谨 jing:景静晶京敬靖婧经精 jiu:久九 ju:居菊巨聚 juan:娟 jue:觉 jun:军君俊峻钧骏 " +
  "kai:凯开楷 kang:康 ke:柯克可科 kong:孔 kou:寇 kuan:宽 kuang:邝匡况 kun:坤昆 " +
  "lai:赖来莱 lan:兰蓝岚澜 lang:郎朗 lao:劳 le:乐 lei:雷磊蕾 leng:冷 li:李黎丽立力利莉理礼励历 lian:连廉莲联 liang:梁亮良凉 liao:廖辽 lin:林琳霖麟临 ling:凌玲灵岭令 liu:刘柳留流 long:龙隆 lou:娄楼 lu:陆卢鲁路露芦禄 lv:吕律绿 luan:栾 lun:伦 luo:罗骆洛 " +
  "ma:马麻 mai:麦迈 man:曼满 mang:芒 mao:毛茂贸 mei:梅美媚 meng:孟蒙梦萌 mi:米密 miao:苗缪妙 min:闵敏民旻 ming:明铭鸣 mo:莫墨 mou:牟 mu:穆木牧慕 " +
  "na:娜纳 nan:南楠男 ni:倪妮 nian:年 ning:宁凝 niu:牛 nong:农 " +
  "ou:欧区鸥 " +
  "pan:潘盼 pang:庞 pei:裴佩沛 peng:彭鹏蓬 pi:皮 ping:平萍屏 pu:蒲浦普朴 " +
  "qi:齐祁戚琪奇启琦麒其 qian:钱谦倩千前 qiang:强 qiao:乔桥巧 qin:秦覃琴勤钦沁 qing:青清庆晴卿 qiu:邱秋丘仇 qu:屈曲瞿渠 quan:全权泉 que:阙 qun:群 " +
  "ran:冉然 rao:饶 ren:任仁 rong:荣蓉融容戎 ru:如儒茹 ruan:阮 rui:瑞睿芮锐 run:润 ruo:若 " +
  "sa:萨 sai:赛 san:三 sang:桑 sen:森 sha:沙莎 shan:单山珊善杉 shang:尚商上 shao:邵少韶 she:佘 shen:沈申深莘 sheng:盛圣胜生升晟 shi:石施史师时诗世士实 shou:寿守 shu:舒书淑叔蜀 shuang:双爽 shui:水 shun:顺 si:司思斯 song:宋松颂嵩 su:苏素肃 sui:隋穗遂 sun:孙 suo:所索 " +
  "tai:台泰太 tan:谭檀坦 tang:唐汤棠堂 tao:陶涛桃韬 teng:滕腾 tian:田天甜添 tie:铁 ting:婷庭廷亭 tong:童佟通同彤桐 tu:涂图 tuo:拓 " +
  "wan:万宛婉晚湾 wang:王汪旺望 wei:魏韦卫伟威薇巍维蔚 wen:文温闻雯 weng:翁 wo:沃 wu:吴武伍邬巫吾悟舞 " +
  "xi:席西希喜溪曦熙锡 xia:夏霞 xian:冼先贤仙娴 xiang:向项香祥翔湘 xiao:肖萧晓小笑 xie:谢解 xin:辛新欣鑫心馨信 xing:邢星兴幸杏 xiong:熊雄 xiu:秀修 xu:徐许胥旭栩 xuan:宣轩萱璇 xue:薛雪学 xun:荀寻迅勋 " +
  "ya:亚雅 yan:严颜阎闫燕艳岩彦妍延研 yang:杨阳洋扬 yao:姚尧耀瑶遥 ye:叶业烨 yi:易伊怡毅艺义依宜一益逸 yin:尹殷银音寅 ying:应英莹颖瑛鹰营 yong:永勇雍 you:尤游友佑 yu:于余俞虞喻禹宇玉雨瑜钰裕郁羽 yuan:袁元远源苑媛渊圆 yue:岳月越悦跃 yun:云芸韵运允 " +
  "zang:臧 zeng:增 zha:查 zhai:翟 zhan:詹展湛战 zhang:张章彰 zhao:赵昭照兆朝 zhe:哲浙 zhen:甄珍真振震贞 zheng:郑正政峥征铮 zhi:智志芝之治知致 zhong:钟仲中忠众 zhou:周舟州洲 zhu:朱祝诸竹珠柱 zhuang:庄壮 zhuo:卓 zi:子紫梓自资 zong:宗 zou:邹 zu:祖 zuo:左佐";

/** Compound surnames read as one unit at the start of a name. */
const COMPOUND = "欧阳ouyang 司马sima 诸葛zhuge 上官shangguan 东方dongfang 皇甫huangfu 公孙gongsun 慕容murong 司徒situ 夏侯xiahou 令狐linghu 端木duanmu 南宫nangong 尉迟yuchi 长孙zhangsun 宇文yuwen";

const MAP = new Map<string, string>();
for (const tok of COMPOUND.split(/\s+/)) {
  const m = /^([㐀-鿿]+)([a-z]+)$/u.exec(tok);
  if (m) MAP.set(m[1], m[2]);
}
for (const grp of BY_SYLLABLE.trim().split(/\s+/)) {
  const [syl, chars] = grp.split(":");
  for (const ch of chars ?? "") if (!MAP.has(ch)) MAP.set(ch, syl);
}

/** More characters frequent in given names and surnames (general list), each with its pinyin and tone. */
const SUPPLEMENT =
  "菁jing1 璐lu4 妤yu2 翊yi4 昕xin1 晗han2 皓hao4 煜yu4 泽ze2 宸chen2 骁xiao1 奕yi4 弈yi4 珂ke1 玥yue4 苒ran3 沐mu4 筱xiao3 茜qian4 蕊rui3 " +
  "娅ya4 嫣yan1 姝shu1 歆xin1 钊zhao1 锴kai3 炜wei3 赟yun1 喆zhe2 堃kun1 淼miao3 帅shuai4 琛chen1 琼qiong2 璟jing3 珏jue2 昱yu4 晔ye4 曜yao4 榕rong2 " +
  "槿jin3 浚jun4 澄cheng2 潇xiao1 湉tian2 漪yi1 淇qi2 渝yu2 灏hao4 焱yan4 炎yan2 煊xuan1 熠yi4 燊shen1 祺qi2 稷ji4 竣jun4 绮qi3 缘yuan2 羿yi4 " +
  "芊qian1 芷zhi3 菡han4 蓓bei4 蝶die2 誉yu4 诺nuo4 镇zhen4 阔kuo4 雁yan4 霏fei1 龄ling2 孝xiao4 嵘rong2 懿yi4 斐fei3 汐xi1 涌yong3 滢ying2 漫man4 " +
  "盈ying2 筠yun2 蕴yun4 言yan2 豫yu4 竺zhu2 揭jie1 晏yan4 聂nie4 鞠ju1 粟su4 裘qiu2 綦qi2 晁chao2 植zhi2 奚xi1 曾zeng1 位wei4 薄bo2 辜gu1 " +
  "邸di3 谈tan2 屠tu2 郜gao4 糜mi2 鄢yan1 井jing3 练lian4 封feng1 原yuan2 衣yi1 栗li4 荆jing1 谌chen2 习xi2 蔺lin4 雍yong1 濮pu2 宓mi4 闫yan2 " +
  "恺kai3 凯kai3 铠kai3 锦jin3 婕jie2 琰yan3 瑗yuan4 琬wan3 璋zhang1 珺jun4 瑄xuan1 琪qi2 婵chan2 娇jiao1 婷ting2 妮ni1 姗shan1 婧jing4 雅ya3 舜shun4 " +
  "乾qian2 坚jian1 岩yan2 峻jun4 崧song1 嵩song1 巧qiao3 帝di4 庚geng1 弛chi2 彪biao1 律lv4 徽hui1 恬tian2 悠you1 慕mu4 抒shu1 拓tuo4 昌chang1 晋jin4";
const TONE_SUP = new Map<string, number>();
for (const tok of SUPPLEMENT.trim().split(/\s+/)) {
  const m = /^(.)([a-z]+)(\d)$/u.exec(tok);
  if (!m) continue;
  if (!MAP.has(m[1])) MAP.set(m[1], m[2]);
  TONE_SUP.set(m[1], +m[3]);
}

/** Pinyin syllables of a Chinese string (compound surnames first), or null when a character is not in the table. */
export function pinyinOf(s: string): string[] | null {
  const cs = [...s.replace(/\s+/g, "")];
  if (!cs.length) return null;
  const out: string[] = [];
  for (let i = 0; i < cs.length; i++) {
    const two = cs[i] + (cs[i + 1] ?? "");
    if (i === 0 && MAP.has(two) && cs.length > 2) { out.push(MAP.get(two)!); i++; continue; }
    const p = MAP.get(cs[i]);
    if (!p) return null;
    out.push(p);
  }
  return out;
}

/**
 * Tones of the table's characters (1–4), syllable by syllable in the same order as BY_SYLLABLE: the usual reading in
 * names. Used only to tell apart names of the same toneless spelling when a message writes tone marks (R15).
 */
const TONES =
  "a:1 ai:443 an:144 ang:2 ao:2444 ba:11 bai:2334 ban:13 bang:11 bao:13344 bei:344 ben:31 bi:4444 bian:144 biao:11 bin:1111 bing:1133 bo:21222 bu:34 " +
  "cai:42323 can:4 cang:1 cao:23 cen:2 chai:2 chang:2124 chao:12 che:1 chen:2222 cheng:222222 chi:222 chong:21 chu:3133 chuan:122 chuang:4 chun:122 ci:2 cong:21 cui:14 cun:1 " +
  "da:24 dai:444 dan:14 dang:3 dao:4 de:2 deng:411 di:2224 dian:344 diao:1 ding:134 dong:3141 dou:4 du:41 duan:41 dui:4 dun:1 duo:13 " +
  "e:42 en:1 er:3 fa:13 fan:42212 fang:1214 fei:411 fen:1 feng:2114111 fu:44242342 " +
  "gan:11 gang:13 gao:1 ge:3121 geng:3 gong:11311 gou:3 gu:4333 guan:1341 guang:13 gui:44 guo:123 " +
  "hai:3 han:24224 hang:22 hao:34243 he:242222424 hei:1 heng:22 hong:222222 hou:24 hu:232 hua:214 huai:2 huan:124 huang:222 hui:441144 hun:1 huo:43 " +
  "ji:442141144 jia:31111 jian:344144 jiang:1131 jiao:11 jie:2222 jin:1434433 jing:341144411 jiu:33 ju:1244 juan:1 jue:2 jun:114414 " +
  "kai:313 kang:1 ke:1431 kong:3 kou:4 kuan:1 kuang:414 kun:11 " +
  "lai:422 lan:2222 lang:23 lao:2 le:4 lei:233 leng:3 li:32444443344 lian:2222 liang:2422 liao:42 lin:22222 ling:22234 liu:2322 long:22 lou:22 lu:4234424 lv:344 luan:2 lun:2 luo:244 " +
  "ma:32 mai:44 man:43 mang:2 mao:244 mei:234 meng:4242 mi:34 miao:244 min:3322 ming:222 mo:44 mou:2 mu:4444 " +
  "na:44 nan:222 ni:21 nian:2 ning:22 niu:2 nong:2 ou:111 " +
  "pan:14 pang:2 pei:244 peng:222 pi:2 ping:222 pu:2333 " +
  "qi:221223222 qian:21412 qiang:2 qiao:223 qin:222214 qing:11421 qiu:1112 qu:1122 quan:222 que:4 qun:2 " +
  "ran:32 rao:2 ren:42 rong:22222 ru:222 ruan:3 rui:4444 run:4 ruo:4 " +
  "sa:4 sai:4 san:1 sang:1 sen:1 sha:11 shan:41141 shang:414 shao:432 she:2 shen:3111 sheng:444114 shi:213121442 shou:43 shu:11223 shuang:13 shui:3 shun:4 si:111 song:4141 su:144 sui:244 sun:1 suo:33 " +
  "tai:244 tan:223 tang:2122 tao:2121 teng:22 tian:2121 tie:3 ting:2222 tong:221222 tu:22 tuo:4 " +
  "wan:43331 wang:2144 wei:424311124 wen:2122 weng:1 wo:4 wu:23311243 " +
  "xi:21131111 xia:42 xian:31212 xiang:441221 xiao:11334 xie:44 xin:1111114 xing:21144 xiong:22 xiu:41 xu:23143 xuan:1112 xue:132 xun:2241 " +
  "ya:43 yan:22224424222 yang:2222 yao:22422 ye:444 yi:41244441244 yin:31212 ying:1123112 yong:331 you:2234 yu:22224334324443 yuan:22324212 yue:44444 yun:22443 " +
  "zang:1 zeng:1 zha:1 zhai:2 zhan:1344 zhang:111 zhao:41441 zhe:24 zhen:111441 zheng:444111 zhi:4411414 zhong:14114 zhou:1111 zhu:141214 zhuang:14 zhuo:2 zi:33341 zong:1 zou:1 zu:3 zuo:33";

const TONE = new Map<string, number>();
{
  const chars = new Map<string, string>();
  for (const grp of BY_SYLLABLE.trim().split(/\s+/)) { const [syl, cs] = grp.split(":"); chars.set(syl, cs ?? ""); }
  for (const grp of TONES.trim().split(/\s+/)) {
    const [syl, ds] = grp.split(":");
    const cs = [...(chars.get(syl) ?? "")];
    if (cs.length !== ds.length) continue;           // a row that does not line up gives no tones (never a guess)
    cs.forEach((ch, k) => { if (!TONE.has(ch)) TONE.set(ch, +ds[k]); });
  }
  for (const [ch, t] of TONE_SUP) if (!TONE.has(ch)) TONE.set(ch, t);
}

/** The tones of a Chinese string's characters, or null when one is unknown. */
export function tonesOfChars(s: string): number[] | null {
  const out: number[] = [];
  for (const ch of s.replace(/\s+/g, "")) { const t = TONE.get(ch); if (!t) return null; out.push(t); }
  return out;
}
