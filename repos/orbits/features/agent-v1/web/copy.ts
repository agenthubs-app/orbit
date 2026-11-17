/**
 * Code's sentences for the web step (设计稿 §3.4 "通不过就不发", "完全无结果、部分可证、网页不可访问和供应商故障分别反馈";
 * agent-design AG09). Plain words (no 来源／证据): what was not looked up and why, what to do next, which pages were opened.
 */
import type { WebLanguage } from "./vocabulary";

export type BlockKind = "contact" | "private" | "judgment";

const pick = <T>(language: WebLanguage, zh: T, ja: T, en: T): T => (language === "zh" ? zh : language === "ja" ? ja : en);

const said = (language: WebLanguage, quote: string) => pick(language, `「${quote}」：`, `「${quote}」：`, `"${quote}": `);

export const WEB_WORDS = {
  off: (language: WebLanguage, quote: string) => said(language, quote) + pick(language, "联网查询现在是关着的，所以这次没有去查。", "ネット検索は今オフになっているため、今回は調べていません。", "web lookup is switched off right now, so I did not look it up."),
  noPublicName: (language: WebLanguage, quote: string) => said(language, quote) + pick(language,
    "这次没有联网查：要查的对象只能从你的记录里认出来，记录里的内容不会发出去。如果要查，请告诉我可以公开使用的名称或网址。",
    "今回はネットで調べていません。調べる対象があなたの記録の中でしか特定できず、記録の内容は外に送らないためです。調べる場合は、公開して使える名前かURLを教えてください。",
    "I did not look this up on the web: what to look up can only be identified from your records, and nothing from your records is sent out. To look it up, tell me a public name or a web address."),
  blocked: (language: WebLanguage, quote: string, kind: BlockKind) => said(language, quote) + (kind === "contact"
    ? pick(language,
      "这次没有联网查：检索内容里带着电话号码或邮箱这类联系方式，这样的检索不会发出去，也不会去掉它们后悄悄再搜。如果要查，请确认只用公开的姓名或机构名去查，或者给我一个网址。",
      "今回はネットで調べていません。検索内容に電話番号やメールアドレスなどの連絡先が含まれているため送らず、それを外してこっそり検索し直すこともしません。調べる場合は、公開されている名前や組織名だけで調べてよいか確認するか、URLを教えてください。",
      "I did not look this up on the web: the search would carry contact details such as a phone number or an e-mail address, so it is not sent, and I will not quietly search again without them. To look it up, confirm that only a public name or organization should be used, or give me a web address.")
    : kind === "private"
      ? pick(language,
        "这次没有联网查：检索内容里有不该发出去的私人资料（例如金额、地址或你记录里的原文），所以整条没有发出。如果要查，请告诉我可以公开使用的名称或网址。",
        "今回はネットで調べていません。検索内容に外へ出せない個人的な情報（金額、住所、記録の文面など）が含まれていたため、送っていません。調べる場合は、公開して使える名前かURLを教えてください。",
        "I did not look this up on the web: the search would carry private details (an amount, an address or words from your records), so it was not sent. To look it up, tell me a public name or a web address.")
      : pick(language,
        "这次没有联网查：这条检索词可能带出查公开信息以外的内容，所以没有发出。如果要查，请换一个只含公开名称的说法，或者给我一个网址。",
        "今回はネットで調べていません。この検索語は公開情報を調べる以上の内容を含むおそれがあるため、送っていません。調べる場合は、公開されている名前だけで言い直すか、URLを教えてください。",
        "I did not look this up on the web: the search might carry more than what is needed to find the public information, so it was not sent. To look it up, rephrase it with only a public name, or give me a web address.")),
  confirm: (language: WebLanguage, quote: string, query: string) => said(language, quote) + pick(language,
    `要上网查的话，会发出这条检索词：「${query}」（其中的姓名取自你的联系人记录）。要发出吗？`,
    `ネットで調べる場合、この検索語を送ります：「${query}」（名前はあなたの連絡先の記録から取りました）。送ってよいですか。`,
    `To look this up on the web, this search would be sent: "${query}" (the name comes from your contact record). Send it?`),
  sendLabel: (language: WebLanguage) => pick(language, "发出这条检索词", "この検索語を送る", "Send this search"),
  skipLabel: (language: WebLanguage) => pick(language, "不发", "送らない", "Don't send"),
  skipped: (language: WebLanguage, quote: string) => said(language, quote) + pick(language, "你选了不发，这次没有联网查。", "送らないことにしたので、今回はネットで調べていません。", "you chose not to send it, so I did not look it up."),
  sameName: (language: WebLanguage, quote: string, name: string) => said(language, quote) + pick(language,
    `搜「${name}」找到了指向不同对象的结果，你问的是哪一个？`,
    `「${name}」で検索すると、別々の人物や組織を指す結果が出てきました。どちらのことですか。`,
    `Searching for "${name}" found results about different people or organizations. Which one do you mean?`),
  noResult: (language: WebLanguage, query: string) => pick(language,
    `上网搜「${query}」没有找到公开资料。这只说明这次没搜到，不代表没有。`,
    `「${query}」でネット検索しましたが、公開情報は見つかりませんでした。今回見つからなかったというだけで、存在しないという意味ではありません。`,
    `A web search for "${query}" found no public information. That only means this search found nothing, not that there is none.`),
  noRelevant: (language: WebLanguage, query: string) => pick(language,
    `上网搜「${query}」的结果里没有讲这件事的页面，所以没有打开。`,
    `「${query}」の検索結果には、このことを扱うページがなかったため、開いていません。`,
    `The results of a web search for "${query}" had no page about this, so none was opened.`),
  searchFailed: (language: WebLanguage, query: string, timeout: boolean) => pick(language,
    `上网搜「${query}」这次没有成功（${timeout ? "超时" : "服务没有返回结果"}），所以没有查到。`,
    `「${query}」のネット検索は今回うまくいきませんでした（${timeout ? "タイムアウト" : "サービスから結果が返りませんでした"}）。`,
    `The web search for "${query}" did not work this time (${timeout ? "it timed out" : "the service returned nothing"}).`),
  readFailed: (language: WebLanguage, url: string, timeout: boolean) => pick(language,
    `这个页面这次没能读到：${timeout ? "读取超时（10 秒内没有返回）" : "读取服务没有返回内容"}。我没有看到页面内容，所以不说它写了什么。链接：${url} ，可以稍后再试。`,
    `このページは今回読めませんでした（${timeout ? "読み込みがタイムアウトしました（10秒以内に返りませんでした）" : "読み込みサービスから内容が返りませんでした"}）。内容は見ていないので、何が書かれているかは言えません。リンク：${url} 。時間をおいて試してください。`,
    `I could not read this page this time: ${timeout ? "reading it timed out (no answer within 10 seconds)" : "the reading service returned nothing"}. I have not seen its content, so I can't say what it says. Link: ${url} — you can try again later.`),
  budget: (language: WebLanguage, quote: string, found: { title: string; url: string } | null) => said(language, quote) + pick(language,
    `这次没能打开原页核实，原因是本次查证的次数已经用完（每次最多搜索 2 次、打开 2 个网页）。${found ? `搜到的页面是「${found.title}」 ${found.url} ，搜索摘要不算核实过的内容。` : ""}`,
    `今回は元のページを開いて確かめられませんでした。今回の調査回数（検索2回・ページ2件まで）を使い切ったためです。${found ? `見つかったページは「${found.title}」 ${found.url} です。検索結果の要約は確認済みの内容ではありません。` : ""}`,
    `I could not open the page to check it this time, because this request's lookups are used up (at most 2 searches and 2 pages).${found ? ` The page found is "${found.title}" ${found.url}; a search snippet is not a checked fact.` : ""}`),
  noUrl: (language: WebLanguage, quote: string) => said(language, quote) + pick(language, "这个链接不能打开（只读公开的 http/https 网页，链接要原样来自你这次的话或这次的搜索结果）。", "このリンクは開けません（公開の http/https ページで、今回の発言か今回の検索結果にあるリンクだけを開きます）。", "this link can't be opened (only public http/https pages, exactly as given in your message or found by this search)."),
  saveNotYet: (language: WebLanguage, quote: string) => said(language, quote) + pick(language,
    "把网上查到的内容存成记录，目前还做不到，所以没有出卡，也没有改动任何记录。",
    "ネットで調べた内容を記録として保存することはまだできないため、カードは出しておらず、記録も変えていません。",
    "saving what was found on the web as a record is not available yet, so no card was made and nothing was changed."),
  sources: (language: WebLanguage, queries: readonly string[], pages: readonly { title: string; url: string; date: string | null }[]) => {
    const q = queries.map((query) => pick(language, `「${query}」`, `「${query}」`, `"${query}"`)).join(pick(language, "、", "、", ", "));
    const p = pages.map((page) => `${page.title ? pick(language, `《${page.title}》`, `『${page.title}』`, `"${page.title}"`) : ""} ${page.url}${page.date ? pick(language, `（页面日期 ${page.date}）`, `（ページの日付 ${page.date}）`, ` (page date ${page.date})`) : ""}`.trim()).join(pick(language, "；", "；", "; "));
    const parts = [q ? pick(language, `发出的检索词：${q}`, `送った検索語：${q}`, `Searched for: ${q}`) : "", p ? pick(language, `打开的网页：${p}`, `開いたページ：${p}`, `Pages opened: ${p}`) : ""].filter(Boolean);
    return parts.length ? pick(language, `（联网：${parts.join("。")}。）`, `（ネット：${parts.join("。")}。）`, `(Web: ${parts.join(". ")}.)`) : "";
  },
};
