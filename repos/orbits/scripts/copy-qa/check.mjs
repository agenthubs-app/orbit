// copy-qa: the automatic check of the R03 translation-quality loop (RD-13).
//
// Input: copy entries `{ id, kind?, ja, zh, en }`. Output: issues grouped by rule.
// The rules come from docs/designs/redesign-2026-10/sprints/R03-copy-and-ja/
// glossary.md (the「全局禁用清单」and its matching rules) and style-guide.md (items
// marked ✔). When the two disagree with this file, the documents win: fix the code.
// Usage: scripts/copy-qa/README.md.

export const RULES = [
  "kind",
  "empty",
  "placeholders",
  "forbidden",
  "glossary",
  "length",
  "simplified-in-ja",
  "untranslated",
  "tone",
  "width",
];

// Limits in full-width characters (half-width counts 0.5, a {placeholder} counts 2).
export const LENGTH_LIMITS = { chip: 8, toast: 16, button: 10, fullButton: 16, swipe: 5, nav: 6, tab: 6, dialogTitle: 24, confirmTitle: 24, banner: 32 };
// English limits in characters (style-guide §3, review M15).
export const EN_LENGTH_LIMITS = { chip: 20, button: 24, fullButton: 24, swipe: 12, toast: 32, nav: 12, tab: 12 };

// Hard bans (style-guide §1.1, §2, §3; design 01-system.html ⑧ ⑯).
const FORBIDDEN = {
  ja: [
    [/エラーが発生しました/, "笼统的「エラーが発生しました」：写清楚什么失败"],
    [/送信しました|送信済み|送信する|^送る$|^送信$/, "Orbit 不代发：禁止以 Orbit 为主语的「送信」肯定式（否定式和询问用户式允许）"],
    [/私たち/, "不用「私たち」，主语写 Orbit / iOrbit"],
    [/させていただ|でございます|になられ/, "过度敬语"],
  ],
  zh: [
    [/发生错误|出错了/, "笼统错误句：写清楚什么失败"],
  ],
  en: [
    [/An error occurred|Something went wrong/i, "Generic error: say what failed"],
    [/\bsent\b/i, "Orbit never sends on the user's behalf"],
    [/^Send\b/, "Orbit never sends on the user's behalf"],
    [/\b(?:we|our)\b/i, "No \"we\": say Orbit"],
  ],
};

// Kind-limited bans: Chinese "sent" wording only on buttons and toasts (glossary L35).
const FORBIDDEN_BY_KIND = {
  zh: { kinds: new Set(["button", "fullButton", "swipe", "toast"]), rules: [[/已发送|发送成功|^发送$/, "Orbit 不代发"]] },
};

// External service names may contain otherwise-banned words (glossary L35).
const EXTERNAL_NAMES = /Google コンタクト|Microsoft To Do|Google ToDo/g;

// Glossary bans (glossary.md「全局禁用清单」).
const GLOSSARY = {
  ja: [
    [/コンタクト/, "単个联系人用「連絡先」（glossary §1）"],
    [/受信トレイ/, "用「受信箱」（glossary §1）"],
    [/ドラフト/, "用「下書き」（glossary §2）"],
    [/リトライ/, "按钮用「再試行」，句子用「もう一度お試しください」"],
    [/ToDo|TODO|To Do/, "分段名写「To-do」"],
    [/再試行してください|再度実行/, "句子用「もう一度お試しください」"],
    [/ユーザ(?!ー)|カレンダ(?!ー)|メンバ(?!ー)|リマインダ(?!ー)|サーバ(?!ー)/, "词尾长音保留（style-guide §1.3）"],
    [/環境設定/, "用「設定」"],
  ],
  zh: [[/联络人/, "用「联系人」"]],
  en: [[/\bTodo\b|\bTODO\b/, "Write \"To-do\""]],
};

// Simplified-only Chinese characters that never appear in Japanese text.
// 「湾」 is not here: Japanese writes 湾 too (東京湾、湾岸; the old form is 灣) — R08 review m8.
const SIMPLIFIED_ONLY = new Set([..."关设发录页动过选这还进间问题时网络对说话认识们个为门开长东车见几样么让给请应该边从读结经级纪线组织终细绿统计记讲论证识诉试误语详谈谢资费贵买卖实宝导岁岛带帮广库废异弃张弹归彻态总惊惯戏战户执扩扫扬扰护报择挂挤挥损换摆显晓暂术杀杂权极构档检楼欢气汉沟泪洁测济涨渐满灭灵灾炉炼烂热烦烧爱献环现确离种积稳穷竞笔筑签简粮紧红纤约纯纲纳纵纸纹练绍绑绕绘给络绝继续维综缓编缩罗罚职联肃肠肤脉脑脏脱节药获营虑虚虽补装观规视览觉订认讨训议讯许访评词译诗诚询课谁调谊谋谓贝负贡财责贤败货质购贯贴贷贸贺赏赔赖赛赞赠赶趋跃践转轮软轻载较辅辆辉辑输辞达迁运远违连迟适递遗邮针钟钢钥钱铁银链销锁错键镜闪闭闲闻阅队阳阴阵阶际陆陈险随隐难韩顶项顺须顾预领频额颜风飞饭饮馆驱驶驾验骑鱼鸟鸡齐齿龙龟"]);

// Same text in ja and zh is fine for these (product names, shared kanji words).
// 日本語 / 中文: language names are written in their own language in every UI language (endonyms).
const SAME_OK = new Set(["iOrbit", "Task", "To-do", "保存", "主催", "名刺", "予定", "通知", "編集", "追加", "削除", "公開", "失敗", "管理", "日本語", "中文"]);

const PLACEHOLDER = /\{([A-Za-z0-9_]+)\}/g;

// Parenthesised supplements on buttons (「（1回使います）」) do not count (style-guide §1.2).
export function visualLength(text) {
  const withoutPlaceholders = text.replace(/（[^）]*）$/, "").replace(PLACEHOLDER, "ＸＸ");
  let length = 0;
  for (const char of withoutPlaceholders) length += /[\u0000-ÿ]/.test(char) ? 0.5 : 1;
  return length;
}

function placeholders(text) {
  return [...text.matchAll(PLACEHOLDER)].map((m) => m[1]).sort().join(",");
}

const BUTTON_KINDS = new Set(["button", "fullButton", "swipe"]);
const LABEL_KINDS = new Set(["chip", "nav", "tab", "button", "fullButton", "swipe"]);

function toneIssues(entry) {
  const issues = [];
  const { ja, kind } = entry;
  if (!ja) return issues;
  if (LABEL_KINDS.has(kind) && /。$/.test(ja)) issues.push(["ja", "标签和按钮不加「。」"]);
  if (BUTTON_KINDS.has(kind) && /(です|ます|ません|ください)$/.test(ja)) issues.push(["ja", "按钮用名词形或「〜する」，不用です・ます"]);
  if (kind === "toast" && /。$/.test(ja)) issues.push(["ja", "Toast 主句不加「。」"]);
  if (kind === "confirmTitle") {
    if (!/？$/.test(ja)) issues.push(["ja", "确认框标题用问句「〜しますか？」"]);
    if (entry.zh && !/？$/.test(entry.zh)) issues.push(["zh", "确认框标题用问句，以「？」结尾"]);
    if (entry.en && !/\?$/.test(entry.en)) issues.push(["en", "Confirm titles are questions"]);
  }
  if (kind === "sentence" && !/(です|ます|ません|ください|でした|ました)。?$/.test(ja.split(" · ").at(-1))) issues.push(["ja", "正文句用です・ます"]);
  if (kind === "sentence" && /(です|ます|ません|ください|でした|ました)$/.test(ja)) issues.push(["ja", "正文句末尾加「。」"]);
  if (entry.en && LABEL_KINDS.has(kind)) {
    const words = entry.en.split(/\s+/).filter((w) => /^[A-Za-z]/.test(w));
    const proper = /^(iOrbit|Mail|Settings|Inbox|Task|Google|Orbit)$/;
    // Single letters and acronyms (Series A, AI, CFO) are not title case.
    const capitalizedAfterFirst = words.slice(1).filter((w) => /^[A-Z][a-z]/.test(w) && !proper.test(w));
    if (capitalizedAfterFirst.length > 0) issues.push(["en", `Sentence case: "${entry.en}"`]);
  }
  return issues;
}

function widthIssues(lang, text) {
  const issues = [];
  if (lang === "ja") {
    if (/[０-９Ａ-Ｚａ-ｚ]/.test(text)) issues.push("数字和拉丁字母用半角");
    if (/[()]/.test(text.replace(/\([^)]*[A-Za-z][^)]*\)/g, ""))) issues.push("括号用全角（）");
    if (/[?!](?!\w)/.test(text)) issues.push("问号用全角「？」");
    if (/[,.](?=\s|$)/.test(text.replace(/[A-Za-z0-9.]+\.[A-Za-z0-9]+/g, ""))) issues.push("句读点用「、」「。」");
    if (/\d\s+(月|日|年)/.test(text)) issues.push("日期数字与「月日年」之间不加空格");
    if (/[～~]/.test(text)) issues.push("范围用「〜」（U+301C）");
    if (/[A-Za-z][\u3040-\u30ff\u4e00-\u9fff]|[\u3040-\u30ff\u4e00-\u9fff][A-Za-z]/.test(text.replace(/To-do/g, "").replace(/\{[A-Za-z0-9_]+\}/g, "").replace(/([\u30a0-\u30ff])[A-Z](?![A-Za-z])/g, "$1"))) issues.push("拉丁字母单词与日文之间加半角空格");
  }
  if (lang === "zh") {
    if (/[一-鿿][,?!:;]|[,?!:;][一-鿿]/.test(text)) issues.push("中文标点用全角");
    // Times keep their spaces (「22:00〜7:30 不推送」), like the Japanese rule.
    if (/[一-鿿] (?:\{|\d)|(?:\}|\d) [一-鿿]/.test(text.replace(/\d{1,2}:\d{2}(?:〜\d{1,2}:\d{2})?/g, "T"))) issues.push("中文与数字、占位符之间不加空格");
  }
  if (lang === "en" && /[、。（）「」？！]/.test(text)) issues.push("English uses ASCII punctuation");
  return issues;
}

/** @param {{ id: string, kind?: string, ja?: string, zh?: string, en?: string }[]} entries */
export function checkCopy(entries) {
  const issues = [];
  const add = (rule, entry, lang, message) => issues.push({ rule, id: entry.id, lang, message, text: lang ? entry[lang] : undefined });
  for (const entry of entries) {
    if (entry.needsKind) add("kind", entry, undefined, "没有组件类型：在 repos/orbit-app/src/i18n/copy-kinds.ts 登记，长度和语气检查才会执行");
    for (const lang of ["ja", "zh", "en"]) {
      const text = entry[lang];
      if (typeof text !== "string" || text.trim() === "") {
        add("empty", entry, lang, "空值");
        continue;
      }
      for (const [pattern, why] of FORBIDDEN[lang]) if (pattern.test(text)) add("forbidden", entry, lang, why);
      const byKind = FORBIDDEN_BY_KIND[lang];
      if (byKind && byKind.kinds.has(entry.kind)) for (const [pattern, why] of byKind.rules) if (pattern.test(text)) add("forbidden", entry, lang, why);
      const glossaryText = text.replace(EXTERNAL_NAMES, "");
      for (const [pattern, why] of GLOSSARY[lang]) if (pattern.test(glossaryText)) add("glossary", entry, lang, why);
      for (const why of widthIssues(lang, text)) add("width", entry, lang, why);
    }
    const langs = ["ja", "zh", "en"].filter((lang) => typeof entry[lang] === "string");
    if (new Set(langs.map((lang) => placeholders(entry[lang]))).size > 1) add("placeholders", entry, undefined, `占位符不一致：${langs.map((l) => `${l}=[${placeholders(entry[l])}]`).join(" ")}`);
    if (entry.ja) {
      const bad = [...entry.ja].filter((char) => SIMPLIFIED_ONLY.has(char));
      if (bad.length) add("simplified-in-ja", entry, "ja", `日语里出现简体字形：${[...new Set(bad)].join("")}`);
      if (entry.zh && entry.ja === entry.zh && !SAME_OK.has(entry.ja) && /[぀-ヿ一-鿿]/.test(entry.ja)) add("untranslated", entry, "zh", "日语和中文完全相同，疑似没翻译");
    }
    const limit = entry.kind ? LENGTH_LIMITS[entry.kind] : undefined;
    if (limit && entry.ja && visualLength(entry.ja) > limit) add("length", entry, "ja", `超过 ${entry.kind} 上限 ${limit}（现 ${visualLength(entry.ja)}）`);
    if (limit && entry.zh && visualLength(entry.zh) > limit) add("length", entry, "zh", `超过 ${entry.kind} 上限 ${limit}（现 ${visualLength(entry.zh)}）`);
    const enLimit = entry.kind ? EN_LENGTH_LIMITS[entry.kind] : undefined;
    const enLength = entry.en ? entry.en.replace(/ \([^)]*\)$/, "").replace(PLACEHOLDER, "NN").length : 0;
    if (enLimit && enLength > enLimit) add("length", entry, "en", `Over the ${entry.kind} limit ${enLimit} (${enLength}; a placeholder counts as 2)`);
    if (entry.en && /\{count\} [a-z]+s\b/.test(entry.en)) add("tone", entry, "en", "Count before a plural noun breaks at 1: rephrase or split One / Other");
    for (const [lang, message] of toneIssues(entry)) add("tone", entry, lang, message);
  }
  const counts = Object.fromEntries(RULES.map((rule) => [rule, issues.filter((issue) => issue.rule === rule).length]));
  return { entries: entries.length, issues, counts, total: issues.length };
}
