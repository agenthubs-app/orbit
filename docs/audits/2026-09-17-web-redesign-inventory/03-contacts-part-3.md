| 1191 | [blurb, setBlurb] = useState("") |
| 1192 | [picking, setPicking] = useState("") |
| 1193 | [query, setQuery] = useState("") |
| 1194 | [saving, setSaving] = useState(false) |
| 1195 | [error, setError] = useState("") |
| 1196 | [requestId] = useState(() =&gt; globalThis.crypto.randomUUID()) |
| 1359 | [composerOpen, setComposerOpen] = useState(false) |
| 1360 | [introductions, setIntroductions] = useState(viewModel.intros) |
| 1361 | [selectedIntroduction, setSelectedIntroduction] = useState&lt;OrbitIntroView \| null&gt;(null) |
| 1362 | [filter, setFilter] = useState&lt;"all" \| OrbitIntroStatus&gt;("all") |
| 1363 | [query, setQuery] = useState("") |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 173 | link/a · MobileCrmHeader | t({ en: "Scan card", zh: "扫名片" }) | /app/contacts/new | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 195 | field/input · MobileCrmHeader | resolvedPlaceholder | onchange: (event) =&gt; onQueryChange?.(event.target.value) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 207 | link/a · MobileCrmHeader | {item.label} | crmHref(item.href) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 301 | role-button/span · Basis | t({ en: "Show basis", zh: "查看依据" }) | onclick: (event) =&gt; { event.preventDefault(); }; onkeydown: (event) =&gt; { if (event.key !== "Enter" && event.key !== " ") return; event.preventDefault(); event.currentTarget.click(); } | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 335 | link/a · PersonCard | {item.displayName \|\| t({ en: "Unnamed contact", zh: "未命名联系人" })} {crmRole(item, t)} {` · ${item.industry}`} {&lt;div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}&gt; {item.valueTags.map((tag) =&gt; &lt;span className="nc-tag nc-tag-value" key={tag}&gt;{tag}&lt;/span&gt;)} &lt;/div&gt;} / {null} {&lt;div className="nc-foot"&gt; &lt;span className="nc-act"&gt;&lt;Icon name={item.dormant ? "bell" : "arrow"} size={16} /&gt;{t({ en: "Suggested", zh: "建议" })}：{item.nextAction.text}&lt;/span&gt; &lt;Basis kind="e …（完整表达式见源码） | `/app/contacts/${item.id}` | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 533 | link/a · OrbitRealCardsList | Skip to results / 跳到联系人结果 | #contact-results-desktop | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 536 | link/a · OrbitRealCardsList | Scan / 扫名片 | /app/contacts/new | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 537 | link/a · OrbitRealCardsList | Import / 导入人脉 | /app/contacts/new | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 542 | field/input · OrbitRealCardsList | t({ en: "Search contacts", zh: "搜索人脉" }) | onchange: (event) =&gt; setQuery(event.target.value) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 549 | button/button · OrbitRealCardsList | {suggestion.label} | onclick: () =&gt; applySearchSuggestion(suggestion) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 554 | button/button · OrbitRealCardsList | {label} {counts[key] \|\| 0} | onclick: () =&gt; setStage(key) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 560 | button/button · OrbitRealCardsList | {tag} {items.filter((item) =&gt; item.valueTags.includes(tag)).length} | onclick: () =&gt; setValueTag((current) =&gt; current === tag ? null : tag) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 578 | link/a · OrbitRealCardsList | Browse events / 去看看活动 | /app/events | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 585 | button/button · OrbitRealCardsList | Clear filters / 清除筛选 | onclick: clearFilters | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 608 | button/button · OrbitRealCardsList | {label} | onclick: () =&gt; setStage(key) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 620 | button/button · OrbitRealCardsList | {tag} | onclick: () =&gt; setValueTag((current) =&gt; current === tag ? null : tag) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 636 | link/a · OrbitRealCardsList | Browse events / 去看看活动 | /app/events | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 643 | button/button · OrbitRealCardsList | Clear filters / 清除筛选 | onclick: clearFilters | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1024 | button/button · IntroRow | t({ en: `View introduction between ${intro.labelA} and ${intro.labelB}`, zh: `查看${intro.labelA}与${intro.labelB}的引荐记录`, }) | onclick: onOpen | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1085 | callback-control/ModalShell · IntroDetailModal | {intro.labelA} → {intro.labelB} {introStatusLabel(intro.statusBadge, t)} Introduction note / 引荐说明 {intro.blurb} {[ { id: intro.contactAId, label: intro.labelA, role: t({ en: "Contact A", zh: "联系人 A" }) }, { id: intro.contactBId, label: intro.labelB, role: t({ en: "Contact B", zh: "联系人 B" }) }, ].map((contact) =&gt; ( &lt;a className="card-flat" href={contact.id ? `/app/contacts/${encodeURIComponent(contact.id)}` : "/app/contacts"} key={contact.role} style={{ alignItems: "center", c …（完整表达式见源码） | onclose: onClose | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1112 | link/a · IntroDetailModal | {contact.role} {contact.label} | contact.id ? `/app/contacts/${encodeURIComponent(contact.id)}` : "/app/contacts" | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1140 | button/button · IntroDetailModal | Done / 完成 | onclick: onClose | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1164 | button/button · PickerSlot | {person.displayName} | onclick: onPick | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1169 | button/button · PickerSlot | Pick a contact / 选择联系人 | onclick: onPick | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1287 | callback-control/ModalShell · IntroComposerModal | Pick the first contact / 选择第一位联系人 / Pick the second contact / 选择第二位联系人 {&lt;&gt; &lt;div style={{ marginBottom: 14, position: "relative" }}&gt; &lt;Icon name="search" size={17} color="var(--text-3)" style={{ left: 13, position: "absolute", top: 14 }} /&gt; &lt;input aria-label={t({ en: "Search contacts", zh: "搜索名片夹" })} autoFocus className="field" onChange={(event) =&gt; setQuery(event.target.value)} placeholder={t({ en: "Search contacts", zh: "搜索名片夹" })} style={{ paddingLeft: 40 }} type="search" va …（完整表达式见源码） | onclose: () =&gt; setPicking("") | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1293 | field/input · IntroComposerModal | t({ en: "Search contacts", zh: "搜索名片夹" }) | onchange: (event) =&gt; setQuery(event.target.value) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1297 | button/button · IntroComposerModal | {item.displayName} {crmRole(item, t)} | onclick: () =&gt; pick(item.id) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1326 | link/a · IntroComposerModal | Add contacts / 添加联系人 | /app/contacts/new | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1336 | callback-control/ModalShell · IntroComposerModal | Make an introduction / 发起引荐 Pick two contacts and write the introduction note. Saving creates an account-scoped draft; it does not send anything. / 选择两位联系人并填写引荐词。保存后会生成仅属于当前账号的草稿，不会自动发送。 Intro note / 引荐词 {&lt;p role="alert" style={{ color: "var(--danger)", fontSize: 13, margin: "10px 0 0" }}&gt;{error}&lt;/p&gt;} / {null} Cancel / 取消 Saving… / 保存中… / Save draft / 保存草稿 | onclose: onClose | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1337 | form-submit-boundary/form · IntroComposerModal | Make an introduction / 发起引荐 Pick two contacts and write the introduction note. Saving creates an account-scoped draft; it does not send anything. / 选择两位联系人并填写引荐词。保存后会生成仅属于当前账号的草稿，不会自动发送。 Intro note / 引荐词 {&lt;p role="alert" style={{ color: "var(--danger)", fontSize: 13, margin: "10px 0 0" }}&gt;{error}&lt;/p&gt;} / {null} Cancel / 取消 Saving… / 保存中… / Save draft / 保存草稿 | onsubmit: (event) =&gt; { event.preventDefault(); void saveIntroduction(); } | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1346 | field/textarea · IntroComposerModal | t({ en: "Write the note both contacts will review.", zh: "填写给双方查看的引荐说明。" }) | onchange: (event) =&gt; setBlurb(event.target.value) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1349 | button/button · IntroComposerModal | Cancel / 取消 | onclick: onClose | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1350 | button/button · IntroComposerModal | Saving… / 保存中… / Save draft / 保存草稿 |  | {"disabled":"!aId \|\| !bId \|\| !blurb.trim() \|\| saving","renderGateProps":[],"conditions":[]} |
| 1402 | button/button · OrbitRealCardsIntros | Make introduction / 发起引荐 | onclick: () =&gt; setComposerOpen(true) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1407 | button/button · OrbitRealCardsIntros | {item.label} {item.count} | onclick: () =&gt; setFilter(item.key) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1413 | callback-control/IntroRow · OrbitRealCardsIntros |  | onopen: () =&gt; setSelectedIntroduction(intro) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1431 | button/button · OrbitRealCardsIntros | {item.label} {item.count} | onclick: () =&gt; setFilter(item.key) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1437 | callback-control/IntroRow · OrbitRealCardsIntros |  | onopen: () =&gt; setSelectedIntroduction(intro) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1440 | callback-control/IntroComposerModal · OrbitRealCardsIntros |  | onclose: () =&gt; setComposerOpen(false); oncreated: (introduction) =&gt; { setIntroductions((current) =&gt; [introduction, ...current]); setComposerOpen(false); } | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1441 | callback-control/IntroDetailModal · OrbitRealCardsIntros |  | onclose: () =&gt; setSelectedIntroduction(null) | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 1222 | saveIntroduction | 调用 | POST | "/api/contacts/introductions" |
| 1222 | saveIntroduction | 路径常量 | 见调用/handler | "/api/contacts/introductions" |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 41 | 翻译 en | "All" |
| 41 | 翻译 zh | "全部" |
| 42 | 翻译 en | "Relationship progress" |
| 42 | 翻译 zh | "关系进展" |
| 43 | 翻译 en | "Intros" |
| 43 | 翻译 zh | "引荐" |
| 44 | 翻译 en | "Network analysis" |
| 44 | 翻译 zh | "人脉分析" |
| 45 | 翻译 en | "All arrangements" |
| 45 | 翻译 zh | "全部安排" |
| 85 | 翻译 en | "No company or title yet" |
| 85 | 翻译 zh | "暂无公司职位" |
| 167 | 翻译 en | "Search name / company / industry" |
| 167 | 翻译 zh | "搜索姓名 / 公司 / 行业" |
| 171 | 翻译 en | "All contacts" |
| 171 | 翻译 zh | "全部人脉" |
| 173 | 属性 aria-label | t({ en: "Scan card", zh: "扫名片" }) |
| 174 | 翻译 en | "Scan card" |
| 174 | 翻译 zh | "扫名片" |
| 195 | 属性 placeholder | resolvedPlaceholder |
| 253 | 文案/数据常量 en | "Scanned" |
| 253 | 文案/数据常量 zh | "名片扫描" |
| 254 | 文案/数据常量 en | "Exchanged" |
| 254 | 文案/数据常量 zh | "名片交换" |
| 255 | 文案/数据常量 en | "QR scan" |
| 255 | 文案/数据常量 zh | "现场扫码" |
| 256 | 文案/数据常量 en | "Event" |
| 256 | 文案/数据常量 zh | "活动导入" |
| 257 | 文案/数据常量 en | "Imported" |
| 257 | 文案/数据常量 zh | "通讯录" |
| 258 | 文案/数据常量 en | "Referral" |
| 258 | 文案/数据常量 zh | "朋友推荐" |
| 259 | 文案/数据常量 en | "Manual" |
| 259 | 文案/数据常量 zh | "手动" |
| 263 | 文案/数据常量 en | "Strong" |
| 263 | 文案/数据常量 zh | "强关系" |
| 264 | 文案/数据常量 en | "Medium" |
| 264 | 文案/数据常量 zh | "中关系" |
| 265 | 文案/数据常量 en | "Weak" |
| 265 | 文案/数据常量 zh | "弱关系" |
| 266 | 文案/数据常量 en | "Dormant" |
| 266 | 文案/数据常量 zh | "沉睡" |
| 267 | 文案/数据常量 en | "Unscored" |
| 267 | 文案/数据常量 zh | "未评分" |
| 298 | 文案/数据常量 en | "AI" |
| 298 | 文案/数据常量 zh | "AI 推断" |
| 298 | 文案/数据常量 en | "Rule" |
| 298 | 文案/数据常量 zh | "统计规则" |
| 298 | 文案/数据常量 en | "Evidence" |
| 298 | 文案/数据常量 zh | "证据直采" |
| 298 | 文案/数据常量 en | "You set" |
| 298 | 文案/数据常量 zh | "你设定" |
| 301 | 属性 aria-label | t({ en: "Show basis", zh: "查看依据" }) |
| 306 | 翻译 en | "Show basis" |
| 306 | 翻译 zh | "查看依据" |
| 344 | 翻译 en | "Unnamed contact" |
| 344 | 翻译 zh | "未命名联系人" |
| 360 | 翻译 en | "Suggested" |
| 360 | 翻译 zh | "建议" |
| 491 | 翻译 en | "All" |
| 491 | 翻译 zh | "全部" |
| 494 | 翻译 en | "Who can intro an investor?" |
| 494 | 翻译 zh | "谁能介绍投资人？" |
| 495 | 翻译 en | "Investor" |
| 495 | 翻译 zh | "投资人" |
| 498 | 翻译 en | "Founders met in 3 months" |
| 498 | 翻译 zh | "近三个月认识的创始人" |
| 499 | 翻译 en | "Founder" |
| 499 | 翻译 zh | "创始人" |
| 502 | 翻译 en | "High-value to follow up" |
| 502 | 翻译 zh | "待跟进的高价值关系" |
| 503 | 翻译 en | "High value" |
| 503 | 翻译 zh | "高价值" |
| 507 | 翻译 en | "contacts" |
| 507 | 翻译 zh | "位联系人" |
| 507 | 翻译 en | `from ${eventCount} events` |
| 507 | 翻译 zh | `来自 ${eventCount} 场活动` |
| 529 | 翻译 en | "All contacts" |
| 529 | 翻译 zh | "全部人脉" |
| 534 | 翻译 en | "Skip to results" |
| 534 | 翻译 zh | "跳到联系人结果" |
| 536 | 翻译 en | "Scan" |
| 536 | 翻译 zh | "扫名片" |
| 537 | 翻译 en | "Import" |
| 537 | 翻译 zh | "导入人脉" |
| 542 | 属性 placeholder | t({ en: "Search name, company, role, industry, or value", zh: "搜索姓名、公司、职位、行业或关系价值" }) |
| 542 | 属性 aria-label | t({ en: "Search contacts", zh: "搜索人脉" }) |
| 542 | 翻译 en | "Search contacts" |
| 542 | 翻译 zh | "搜索人脉" |
| 542 | 翻译 en | "Search name, company, role, industry, or value" |
| 542 | 翻译 zh | "搜索姓名、公司、职位、行业或关系价值" |
| 544 | 翻译 en | `${filtered.length} results` |
| 544 | 翻译 zh | `${filtered.length} 条` |
| 577 | 翻译 en | "Contacts appear here after you and another attendee agree to exchange business cards at an event." |
| 577 | 翻译 zh | "在活动中与对方互相同意交换名片后，联系人会出现在这里。" |
| 579 | 翻译 en | "Browse events" |
| 579 | 翻译 zh | "去看看活动" |
| 584 | 翻译 en | "No matching contacts yet." |
| 584 | 翻译 zh | "当前没有符合筛选的联系人。" |
| 586 | 翻译 en | "Clear filters" |
| 586 | 翻译 zh | "清除筛选" |
| 591 | 属性 aria-label | t({ en: `${filtered.length} contact results`, zh: `${filtered.length} 条联系人结果` }) |
| 591 | 翻译 en | `${filtered.length} contact results` |
| 591 | 翻译 zh | `${filtered.length} 条联系人结果` |
| 602 | 属性 aria-label | t({ en: "Contact filters", zh: "联系人筛选" }) |
| 603 | 翻译 en | "Contact filters" |
| 603 | 翻译 zh | "联系人筛选" |
| 635 | 翻译 en | "Contacts appear here after you and another attendee agree to exchange business cards at an event." |
| 635 | 翻译 zh | "在活动中与对方互相同意交换名片后，联系人会出现在这里。" |
| 637 | 翻译 en | "Browse events" |
| 637 | 翻译 zh | "去看看活动" |
| 642 | 翻译 en | "No matching contacts yet." |
| 642 | 翻译 zh | "当前没有符合筛选的联系人。" |
| 644 | 翻译 en | "Clear filters" |
| 644 | 翻译 zh | "清除筛选" |
| 649 | 属性 aria-label | t({ en: `${filtered.length} contact results`, zh: `${filtered.length} 条联系人结果` }) |
| 649 | 翻译 en | `${filtered.length} contact results` |
| 649 | 翻译 zh | `${filtered.length} 条联系人结果` |
| 1007 | 翻译 en | "Sent" |
| 1007 | 翻译 zh | "已发送" |
| 1007 | 翻译 en | "Draft" |
| 1007 | 翻译 zh | "草稿" |
| 1024 | 属性 aria-label | t({ en: `View introduction between ${intro.labelA} and ${intro.labelB}`, zh: `查看${intro.labelA}与${intro.labelB}的引荐记录`, }) |
| 1026 | 翻译 en | `View introduction between ${intro.labelA} and ${intro.labelB}` |
| 1027 | 翻译 zh | `查看${intro.labelA}与${intro.labelB}的引荐记录` |
| 1042 | 翻译 en | "Contact A" |
| 1042 | 翻译 zh | "联系人 A" |
| 1045 | 翻译 en | "Contact B" |
| 1045 | 翻译 zh | "联系人 B" |
| 1050 | 翻译 en | "View details" |
| 1050 | 翻译 zh | "查看详情" |
| 1058 | 翻译 en | "Not recorded" |
| 1058 | 翻译 zh | "未记录" |
| 1065 | 文案/数据常量 dateStyle | "medium" |
| 1066 | 文案/数据常量 timeStyle | "short" |
| 1069 | 文案/数据常量 dateStyle | "long" |
| 1070 | 文案/数据常量 timeStyle | "short" |
| 1088 | 翻译 en | "Introduction details" |
| 1088 | 翻译 zh | "引荐详情" |
| 1101 | 翻译 en | "Introduction note" |
| 1101 | 翻译 zh | "引荐说明" |
| 1109 | 翻译 en | "Contact A" |
| 1109 | 翻译 zh | "联系人 A" |
| 1110 | 翻译 en | "Contact B" |
| 1110 | 翻译 zh | "联系人 B" |
| 1130 | 翻译 en | "Created" |
| 1130 | 翻译 zh | "创建时间" |
| 1134 | 翻译 en | "Last updated" |
| 1134 | 翻译 zh | "最近更新" |
| 1141 | 翻译 en | "Done" |
| 1141 | 翻译 zh | "完成" |
| 1171 | 翻译 en | "Pick a contact" |
| 1171 | 翻译 zh | "选择联系人" |
| 1275 | 翻译 en | "The introduction draft could not be saved. Please retry." |
| 1276 | 翻译 zh | "引荐草稿未能保存，请重试。" |
| 1287 | 翻译 en | "Pick a contact" |
| 1287 | 翻译 zh | "选择联系人" |
| 1288 | 翻译 en | "Pick the first contact" |
| 1288 | 翻译 zh | "选择第一位联系人" |
| 1288 | 翻译 en | "Pick the second contact" |
| 1288 | 翻译 zh | "选择第二位联系人" |
| 1293 | 属性 placeholder | t({ en: "Search contacts", zh: "搜索名片夹" }) |
| 1293 | 翻译 en | "Search contacts" |
| 1293 | 翻译 zh | "搜索名片夹" |
| 1308 | 翻译 en | "No contacts match this search." |
| 1309 | 翻译 zh | "没有符合当前搜索的联系人。" |
| 1318 | 翻译 en | "No contacts are available yet" |
| 1318 | 翻译 zh | "还没有可选择的联系人" |
| 1322 | 翻译 en | "Add at least two source-backed contacts before creating an introduction draft." |
| 1323 | 翻译 zh | "至少添加两位有来源记录的联系人后，才能创建引荐草稿。" |
| 1327 | 翻译 en | "Add contacts" |
| 1327 | 翻译 zh | "添加联系人" |
| 1336 | 翻译 en | "Create introduction" |
| 1336 | 翻译 zh | "创建引荐" |
| 1338 | 翻译 en | "Make an introduction" |
| 1338 | 翻译 zh | "发起引荐" |
| 1339 | 翻译 en | "Pick two contacts and write the introduction note. Saving creates an account-scoped draft; it does not send anything." |
| 1339 | 翻译 zh | "选择两位联系人并填写引荐词。保存后会生成仅属于当前账号的草稿，不会自动发送。" |
| 1341 | 属性 label | t({ en: "Contact A", zh: "联系人 A" }) |
| 1341 | 翻译 en | "Contact A" |
| 1341 | 翻译 zh | "联系人 A" |
| 1343 | 属性 label | t({ en: "Contact B", zh: "联系人 B" }) |
| 1343 | 翻译 en | "Contact B" |
| 1343 | 翻译 zh | "联系人 B" |
| 1345 | 翻译 en | "Intro note" |
| 1345 | 翻译 zh | "引荐词" |
| 1346 | 属性 placeholder | t({ en: "Write the note both contacts will review.", zh: "填写给双方查看的引荐说明。" }) |
| 1346 | 翻译 en | "Write the note both contacts will review." |
| 1346 | 翻译 zh | "填写给双方查看的引荐说明。" |
| 1349 | 翻译 en | "Cancel" |
| 1349 | 翻译 zh | "取消" |
| 1350 | 翻译 en | "Saving…" |
| 1350 | 翻译 zh | "保存中…" |
| 1350 | 翻译 en | "Save draft" |
| 1350 | 翻译 zh | "保存草稿" |
| 1370 | 翻译 en | "All" |
| 1370 | 翻译 zh | "全部" |
| 1371 | 翻译 en | "Draft" |
| 1371 | 翻译 zh | "草稿" |
| 1372 | 翻译 en | "Sent" |
| 1372 | 翻译 zh | "已发送" |
| 1384 | 翻译 en | "All" |
| 1384 | 翻译 zh | "全部" |
| 1385 | 翻译 en | "Draft" |
| 1385 | 翻译 zh | "草稿" |
| 1386 | 翻译 en | "Sent" |
| 1386 | 翻译 zh | "已发送" |
| 1399 | 翻译 en | "Introductions" |
| 1399 | 翻译 zh | "引荐记录" |
| 1400 | 翻译 en | "Every introduction you've sent or saved lives here." |
| 1400 | 翻译 zh | "你已经发出或保存过的引荐，都在这里。" |
| 1402 | 翻译 en | "Make introduction" |
| 1402 | 翻译 zh | "发起引荐" |
| 1412 | 翻译 en | "No introductions match these filters yet." |
| 1412 | 翻译 zh | "还没有符合筛选条件的引荐记录。" |
| 1419 | 属性 placeholder | t({ en: "Search contacts / intro notes", zh: "搜索联系人 / 引荐词" }) |
| 1420 | 翻译 en | "Make introduction" |
| 1420 | 翻译 zh | "发起引荐" |
| 1423 | 翻译 en | "Search contacts / intro notes" |
| 1423 | 翻译 zh | "搜索联系人 / 引荐词" |
| 1436 | 翻译 en | "No introductions match these filters yet." |
| 1436 | 翻译 zh | "还没有符合筛选条件的引荐记录。" |

## repos/orbits/app/(app)/app/contacts/page.tsx

源码：[page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/page.tsx>)

静态来源入口：`/app/contacts`

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 37 | 属性 title | routeState.copy.title |

## repos/orbits/app/(app)/app/orbit-contacts-presentation.ts

源码：[orbit-contacts-presentation.ts](</Users/li/work/orbit/repos/orbits/app/(app)/app/orbit-contacts-presentation.ts>)

静态来源入口：`/app/contacts`、`/app/contacts/[id]`

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 27 | 文案/数据常量 zh | "门店店主" |
| 27 | 文案/数据常量 en | "Store Owner" |
| 27 | 文案/数据常量 ja | "店舗オーナー" |
| 28 | 文案/数据常量 zh | "投资合伙人" |
| 28 | 文案/数据常量 en | "Investor Partner" |
| 28 | 文案/数据常量 ja | "投資パートナー" |
| 29 | 文案/数据常量 zh | "市场负责人" |
| 29 | 文案/数据常量 en | "Marketing Lead" |
| 29 | 文案/数据常量 ja | "マーケティング責任者" |
| 30 | 文案/数据常量 zh | "产品经理" |
| 30 | 文案/数据常量 en | "Product Manager" |
| 30 | 文案/数据常量 ja | "プロダクトマネージャー" |
| 31 | 文案/数据常量 zh | "DX 顾问" |
| 31 | 文案/数据常量 en | "DX Consultant" |
| 31 | 文案/数据常量 ja | "DXコンサルタント" |
| 32 | 文案/数据常量 zh | "销售总监" |
| 32 | 文案/数据常量 en | "Sales Director" |
| 32 | 文案/数据常量 ja | "営業ディレクター" |
| 33 | 文案/数据常量 zh | "社群组织者" |
| 33 | 文案/数据常量 en | "Community Organizer" |
| 33 | 文案/数据常量 ja | "コミュニティ主催者" |
| 34 | 文案/数据常量 zh | "创始人 CEO" |
| 34 | 文案/数据常量 en | "Founder CEO" |
| 34 | 文案/数据常量 ja | "創業者CEO" |
| 38 | 文案/数据常量 zh | "大阪" |
| 38 | 文案/数据常量 en | "Osaka" |
| 39 | 文案/数据常量 zh | "深圳" |
| 39 | 文案/数据常量 en | "Shenzhen" |
| 39 | 文案/数据常量 ja | "深セン" |
| 40 | 文案/数据常量 zh | "新加坡" |
| 40 | 文案/数据常量 en | "Singapore" |
| 40 | 文案/数据常量 ja | "シンガポール" |
| 41 | 文案/数据常量 zh | "东京" |
| 41 | 文案/数据常量 en | "Tokyo" |
| 41 | 文案/数据常量 ja | "東京" |
| 45 | 文案/数据常量 zh | "北星" |
| 45 | 文案/数据常量 en | "North Star" |
| 45 | 文案/数据常量 ja | "ノーススター" |
| 46 | 文案/数据常量 zh | "青叶" |
| 46 | 文案/数据常量 en | "Aoba" |
| 46 | 文案/数据常量 ja | "青葉" |
| 47 | 文案/数据常量 zh | "横滨" |
| 47 | 文案/数据常量 en | "Yokohama" |
| 47 | 文案/数据常量 ja | "横浜" |
| 48 | 文案/数据常量 zh | "关西" |
| 48 | 文案/数据常量 en | "Kansai" |
| 48 | 文案/数据常量 ja | "関西" |
| 49 | 文案/数据常量 zh | "梅田" |
| 49 | 文案/数据常量 en | "Umeda" |
| 50 | 文案/数据常量 zh | "晨光" |
| 50 | 文案/数据常量 en | "Morning Light" |
| 50 | 文案/数据常量 ja | "モーニングライト" |
| 51 | 文案/数据常量 zh | "雪松" |
| 51 | 文案/数据常量 en | "Cedar" |
| 51 | 文案/数据常量 ja | "シダー" |
| 52 | 文案/数据常量 zh | "蓝港" |
| 52 | 文案/数据常量 en | "Blue Harbor" |
| 52 | 文案/数据常量 ja | "ブルーハーバー" |
| 53 | 文案/数据常量 zh | "竹林" |
| 53 | 文案/数据常量 en | "Bamboo Grove" |
| 53 | 文案/数据常量 ja | "バンブーグローブ" |
| 54 | 文案/数据常量 zh | "南山" |
| 54 | 文案/数据常量 en | "Nanshan" |
| 55 | 文案/数据常量 zh | "银座" |
| 55 | 文案/数据常量 en | "Ginza" |
| 55 | 文案/数据常量 ja | "銀座" |
| 56 | 文案/数据常量 zh | "红桥" |
| 56 | 文案/数据常量 en | "Red Bridge" |
| 56 | 文案/数据常量 ja | "レッドブリッジ" |
| 60 | 文案/数据常量 zh | "食品" |
| 60 | 文案/数据常量 en | "Foods" |
| 60 | 文案/数据常量 ja | "フーズ" |
| 61 | 文案/数据常量 zh | "科技" |
| 61 | 文案/数据常量 en | "Technologies" |
| 61 | 文案/数据常量 ja | "テクノロジー" |
| 62 | 文案/数据常量 zh | "合伙" |
| 62 | 文案/数据常量 en | "Partners" |
| 62 | 文案/数据常量 ja | "パートナーズ" |
| 63 | 文案/数据常量 zh | "资本" |
| 63 | 文案/数据常量 en | "Capital" |
| 63 | 文案/数据常量 ja | "キャピタル" |
| 64 | 文案/数据常量 zh | "社群" |
| 64 | 文案/数据常量 en | "Community" |
| 64 | 文案/数据常量 ja | "コミュニティ" |
| 68 | 文案/数据常量 zh | "战略契合" |
| 68 | 文案/数据常量 en | "Strategic fit" |
| 68 | 文案/数据常量 ja | "戦略フィット" |
| 69 | 文案/数据常量 zh | "知识交流" |
| 69 | 文案/数据常量 en | "Knowledge exchange" |
| 69 | 文案/数据常量 ja | "ナレッジ交換" |
| 70 | 文案/数据常量 zh | "引荐路径" |
| 70 | 文案/数据常量 en | "Referral path" |
| 70 | 文案/数据常量 ja | "紹介ルート" |
| 71 | 文案/数据常量 zh | "社群资源" |
| 71 | 文案/数据常量 en | "Community context" |
| 71 | 文案/数据常量 ja | "コミュニティ文脈" |
| 72 | 文案/数据常量 zh | "商业机会" |
| 72 | 文案/数据常量 en | "Commercial opportunity" |
| 72 | 文案/数据常量 ja | "商業機会" |
| 88 | 文案/数据常量 zh | "跟进前先核对证据" |
| 88 | 文案/数据常量 en | "review evidence before follow-up" |
| 88 | 文案/数据常量 ja | "フォローアップ前に証跡を確認" |
| 89 | 文案/数据常量 zh | "创建任务前，先核对匹配联系人的来源证据。" |
| 89 | 文案/数据常量 en | "Review the matched contacts with source evidence before creating tasks." |
| 89 | 文案/数据常量 ja | "タスク作成前に、一致した連絡先のソース証跡を確認する。" |

## repos/orbits/features/contacts/contact-detail-tag-and-status-mock/api-probe-controls.tsx

源码：[api-probe-controls.tsx](</Users/li/work/orbit/repos/orbits/features/contacts/contact-detail-tag-and-status-mock/api-probe-controls.tsx>)

静态来源入口：`/dev/capabilities/[slug]`

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 10 | form-submit-boundary/form · ContactDetailEditForm | Mock contact detail tag and status edit form | onsubmit: (event) =&gt; void submit(event, { action: "/api/contacts/demo-contact-1", arrayFields: ["addTags"], method: "PATCH", }) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 26 | field/select · ContactDetailEditForm | Active Needs follow-up Nurture Archived |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 34 | field/select · ContactDetailEditForm | topic:venture-ecosystem topic:storage-pilots priority:warm-follow-up |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 45 | field/textarea · ContactDetailEditForm | Note |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 51 | button/button · ContactDetailEditForm | Preview mock update |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 74 | form-submit-boundary/form · ContactDetailApiProbeForms | Run contact detail API probe | onsubmit: (event) =&gt; void submitGet(event) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 80 | button/button · ContactDetailApiProbeForms | Run detail probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 84 | form-submit-boundary/form · ContactDetailApiProbeForms | Run empty contact detail API probe | onsubmit: (event) =&gt; void submitGet(event) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 91 | button/button · ContactDetailApiProbeForms | Run empty probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 95 | form-submit-boundary/form · ContactDetailApiProbeForms | Run pending contact detail API probe | onsubmit: (event) =&gt; void submitGet(event) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 102 | button/button · ContactDetailApiProbeForms | Run pending probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 106 | form-submit-boundary/form · ContactDetailApiProbeForms | Run controlled failure contact detail API probe | onsubmit: (event) =&gt; void submitGet(event) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 113 | button/button · ContactDetailApiProbeForms | Run controlled failure probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 11 | ContactDetailEditForm | 路径常量 | 见调用/handler | "/api/contacts/demo-contact-1" |
| 19 | ContactDetailEditForm | 路径常量 | 见调用/handler | "/api/contacts/demo-contact-1" |
| 67 | submitGet | 路径常量 | 见调用/handler | "/api/contacts/demo-contact-1" |
| 75 | ContactDetailApiProbeForms | 路径常量 | 见调用/handler | "/api/contacts/demo-contact-1" |
| 85 | ContactDetailApiProbeForms | 路径常量 | 见调用/handler | "/api/contacts/demo-contact-1" |
| 96 | ContactDetailApiProbeForms | 路径常量 | 见调用/handler | "/api/contacts/demo-contact-1" |
| 107 | ContactDetailApiProbeForms | 路径常量 | 见调用/handler | "/api/contacts/demo-contact-1" |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 10 | 属性 aria-label | Mock contact detail tag and status edit form |
| 25 | 属性 label | Status |
| 27 | JSX文字 | Active |
| 28 | JSX文字 | Needs follow-up |
| 29 | JSX文字 | Nurture |
| 30 | JSX文字 | Archived |
| 33 | 属性 label | Add tag |
| 36 | JSX文字 | topic:venture-ecosystem |
| 38 | JSX文字 | topic:storage-pilots |
| 40 | JSX文字 | priority:warm-follow-up |
| 44 | 属性 label | Note |
| 52 | JSX文字 | Preview mock update |
| 74 | 属性 aria-label | Run contact detail API probe |
| 81 | JSX文字 | Run detail probe |
| 84 | 属性 aria-label | Run empty contact detail API probe |
| 92 | JSX文字 | Run empty probe |
| 95 | 属性 aria-label | Run pending contact detail API probe |
| 103 | JSX文字 | Run pending probe |
| 106 | 属性 aria-label | Run controlled failure contact detail API probe |
| 114 | JSX文字 | Run controlled failure probe |

## repos/orbits/features/contacts/contact-detail-tag-and-status-mock/debug-view.tsx

源码：[debug-view.tsx](</Users/li/work/orbit/repos/orbits/features/contacts/contact-detail-tag-and-status-mock/debug-view.tsx>)

静态来源入口：`/dev/capabilities/[slug]`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 214 | ContactDetailEvidenceRows | header |  |  |
| 218 | ContactDetailEvidenceRows | h3 | contact.displayName | relationship-name |
| 446 | ContactDetailTagAndStatusMockDemo | header |  | workbench-header |
| 448 | ContactDetailTagAndStatusMockDemo | h1 | Contact detail tag and status mock |  |
| 460 | ContactDetailTagAndStatusMockDemo | section | Contact detail tag and status states | workbench-grid |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 117 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/contacts/demo-contact-1" |
| 124 | (module / render callback) | 路径常量 | 见调用/handler | "PATCH /api/contacts/demo-contact-1" |
| 131 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/contacts/demo-contact-1?scenario=empty" |
| 137 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/contacts/demo-contact-1?scenario=pending" |
| 143 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/contacts/demo-contact-1?scenario=failure" |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 116 | 文案/数据常量 label | "Read contact detail" |
| 123 | 文案/数据常量 label | "Patch contact detail" |
| 130 | 文案/数据常量 label | "Empty detail" |
| 136 | 文案/数据常量 label | "Pending detail" |
| 142 | 文案/数据常量 label | "Controlled failure" |
| 160 | 属性 aria-label | Contact detail evidence |
| 172 | 属性 aria-label | Contact detail tags |
| 186 | JSX文字 | Contact |
| 188 | JSX文字 | at |
| 192 | JSX文字 | Status |
| 193 | JSX文字 | Status: |
| 196 | JSX文字 | Last interaction |
| 197 | JSX文字 | Last interaction: |
| 200 | JSX文字 | Next action |
| 201 | JSX文字 | Next action: |
| 210 | 属性 aria-label | `Contact detail evidence for ${contact.displayName}` |
| 220 | JSX文字 | at |
| 225 | JSX文字 | Source |
| 226 | JSX文字 | Source: |
| 229 | JSX文字 | Evidence |
| 231 | JSX文字 | Evidence: |
| 238 | JSX文字 | Status |
| 239 | JSX文字 | Status: |
| 242 | JSX文字 | Last interaction |
| 243 | JSX文字 | Last interaction: |
| 278 | 属性 aria-label | Mock-only execution checks |
| 280 | JSX文字 | Database reads |
| 286 | JSX文字 | Audit log writes |
| 292 | JSX文字 | Persistence writes |
| 315 | 属性 title | Detail edits stay fixture-backed |
| 321 | JSX文字 | Scan this first: the detail panel keeps source evidence beside tags, status, notes, and last interaction metadata while persistence and audit execution flags remain false. |
| 325 | 属性 aria-label | Contact detail operator checkpoint |
| 330 | JSX文字 | Contact represented |
| 334 | JSX文字 | Edit controls represented |
| 336 | JSX文字 | tags and |
| 337 | JSX文字 | statuses are exposed from the contract. |
| 342 | JSX文字 | Mock execution |
| 344 | JSX文字 | database reads |
| 344 | JSX文字 | ; audit log writes |
| 348 | JSX文字 | Verifier note |
| 350 | JSX文字 | Browser smoke should judge API envelopes and rendered states; live persistence stays outside this mock. |
| 361 | 属性 title | Edit contact tags and status with context |
| 367 | JSX文字 | This boundary applies deterministic local rules to a fixture contact so the detail panel can show tag editing, status changes, notes, and last interaction metadata before live persistence exists. |
| 372 | 属性 aria-label | Contact detail guardrails |
| 373 | JSX文字 | source evidence |
| 374 | JSX文字 | no live persistence |
| 375 | JSX文字 | status context |
| 383 | 属性 aria-label | Contact detail tag and status API probe actions |
| 388 | JSX文字 | These probes exercise detail read, deterministic patch, empty, pending, and controlled failure paths inside the contact detail tag and status mock boundary. |
| 411 | 文案/数据常量 summary | "Operator confirmed the venture ecosystem follow-up path." |
| 447 | JSX文字 | Developer capability runtime |
| 448 | JSX文字 | Contact detail tag and status mock |
| 450 | JSX文字 | Mock-first boundary for understanding one relationship, why it exists, what context created it, and which tag, status, note, or last-interaction update is sensible before live persistence exists. |
| 460 | 属性 aria-label | Contact detail tag and status states |
| 464 | 属性 title | Success state |
| 480 | 属性 title | Empty state |
| 486 | JSX文字 | Contact |
| 487 | JSX文字 | No contact detail is selected. |
| 490 | JSX文字 | State |
| 503 | 属性 title | Pending state |
| 509 | JSX文字 | Detail status |
| 515 | JSX文字 | Contact |
| 516 | JSX文字 | Detail rendering waits for local fixture review. |
| 526 | 属性 title | Failure state |
| 531 | JSX文字 | Error code |
| 537 | JSX文字 | Message |
| 541 | JSX文字 | Recovery |
| 551 | 属性 title | Relationship detail stays explainable |
| 558 | JSX文字 | The selected contact keeps tags, status, notes, last interaction metadata, source, evidence ids, and a next action together. |
| 567 | 属性 title | Rule-based tag and status changes are deterministic |
| 574 | 属性 aria-label | Updated contact tags |
| 586 | 属性 title | No live persistence happens in the mock |
| 593 | JSX文字 | The mock sets contact persistence writes, production audit log writes, external network requests, AI calls, calendar/email requests, and notifications to false. |
| 605 | 属性 title | Contact detail route uses shared envelopes |
| 610 | JSX文字 | The declared probes cover detail read and patch routes. Empty, pending, validation, and controlled failure probes document non-success product states without leaving the mock boundary. |
| 616 | JSX文字 | Failure mapping |
| 624 | JSX文字 | maps to a shared failure envelope. |
| 629 | 属性 aria-label | Contact detail tag and status API probes |
| 637 | JSX文字 | returns |
| 645 | 属性 title | Replacement notes stay with the capability |
| 651 | JSX文字 | Handoff doc |
| 657 | JSX文字 | Required coverage |
| 659 | JSX文字 | Live service and provider files, switch mechanism, required env vars and permissions, privacy and provenance constraints, and replacement tests are documented before live providers are wired. |
| 666 | 属性 aria-label | Contact detail live handoff excerpts |

## repos/orbits/features/contacts/contacts-list-search-and-filter-mock/debug-view.tsx

源码：[debug-view.tsx](</Users/li/work/orbit/repos/orbits/features/contacts/contacts-list-search-and-filter-mock/debug-view.tsx>)

静态来源入口：`/dev/capabilities/[slug]`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 224 | ContactEvidenceRows | header |  |  |
| 228 | ContactEvidenceRows | h3 | contact.displayName | relationship-name |
| 524 | ContactsListSearchAndFilterMockDemo | header |  | workbench-header |
| 526 | ContactsListSearchAndFilterMockDemo | h1 | Contacts list search and filter mock |  |
| 538 | ContactsListSearchAndFilterMockDemo | section | Contacts list search and filter states | workbench-grid |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 403 | form-submit-boundary/form · ContactsSearchPanel | Mock contacts list filter form |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 410 | field/input · ContactsSearchPanel | Try storage or venture ecosystem |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 417 | field/select · ContactsSearchPanel | All sources Manual note External contacts Email signal Event import |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 426 | field/select · ContactsSearchPanel | All statuses Needs follow-up Active Nurture |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 433 | button/button · ContactsSearchPanel | Search contact list |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 458 | form-submit-boundary/form · ApiProbeActions | Run contacts list API probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 459 | button/button · ApiProbeActions | Run list probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 463 | form-submit-boundary/form · ApiProbeActions | Run empty contacts list API probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 469 | button/button · ApiProbeActions | Run empty probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 473 | form-submit-boundary/form · ApiProbeActions | Run pending contacts list API probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 479 | button/button · ApiProbeActions | Run pending probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 483 | form-submit-boundary/form · ApiProbeActions | Run controlled failure contacts search API probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 488 | button/button · ApiProbeActions | Run controlled failure probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 111 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/contacts" |
| 118 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/contacts/search" |
| 126 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/contacts?tag=topic:storage-pilots&source=manual&status=needs_follow_up" |
| 133 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/contacts?scenario=empty" |
| 139 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/contacts?scenario=pending" |
| 145 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/contacts/search?scenario=failure" |
| 404 | ContactsSearchPanel | 路径常量 | 见调用/handler | "/api/contacts" |
| 458 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/contacts" |
| 464 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/contacts" |
| 474 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/contacts" |
| 484 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/contacts/search?scenario=failure" |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 110 | 文案/数据常量 label | "List contacts" |
| 117 | 文案/数据常量 label | "Search contacts" |
| 124 | 文案/数据常量 label | "Filtered list" |
| 132 | 文案/数据常量 label | "Empty contacts list" |
| 138 | 文案/数据常量 label | "Pending contacts list" |
| 144 | 文案/数据常量 label | "Controlled failure" |
| 162 | 属性 aria-label | Contacts list evidence |
| 179 | JSX文字 | at |
| 180 | JSX文字 | Next: |
| 219 | 属性 aria-label | `Contact row evidence for ${contact.displayName}` |
| 230 | JSX文字 | at |
| 235 | JSX文字 | Source |
| 236 | JSX文字 | Source: |
| 239 | JSX文字 | Evidence |
| 241 | JSX文字 | Evidence: |
| 248 | JSX文字 | Relationship value |
| 250 | JSX文字 | Value score: |
| 254 | JSX文字 | Status |
| 255 | JSX文字 | Status: |
| 258 | JSX文字 | Next action |
| 259 | JSX文字 | Next action: |
| 272 | 属性 aria-label | Contacts list tag filters |
| 314 | 属性 aria-label | Mock-only execution checks |
| 316 | JSX文字 | Search index |
| 322 | JSX文字 | Database queries |
| 328 | JSX文字 | External requests |
| 348 | 属性 title | Search and filters are fixture-backed |
| 354 | JSX文字 | Scan this first: contact rows carry source evidence, relationship context, value scoring, and follow-up rationale while live execution flags remain false. |
| 358 | 属性 aria-label | Contacts list operator checkpoint |
| 363 | JSX文字 | Contacts represented |
| 364 | JSX文字 | source-backed contacts. |
| 367 | JSX文字 | Filters represented |
| 369 | JSX文字 | Tags, sources, relationship value, and status filters are exposed from the contract. |
| 374 | JSX文字 | Mock execution |
| 376 | JSX文字 | search index |
| 376 | JSX文字 | ; database queries |
| 380 | JSX文字 | Verifier note |
| 382 | JSX文字 | Browser smoke should judge API envelopes and rendered states; live search and persistence stay outside this mock. |
| 393 | 属性 title | Search contacts with source context |
| 399 | JSX文字 | This boundary uses deterministic fixtures and local rules to search the contact list by name, organization, relationship context, tags, value, source, and status. |
| 403 | 属性 aria-label | Mock contacts list filter form |
| 409 | 属性 label | Search |
| 410 | 属性 placeholder | Try storage or venture ecosystem |
| 416 | 属性 label | Source |
| 418 | JSX文字 | All sources |
| 419 | JSX文字 | Manual note |
| 420 | JSX文字 | External contacts |
| 421 | JSX文字 | Email signal |
| 422 | JSX文字 | Event import |
| 425 | 属性 label | Status |
| 427 | JSX文字 | All statuses |
| 428 | JSX文字 | Needs follow-up |
| 429 | JSX文字 | Active |
| 430 | JSX文字 | Nurture |
| 434 | JSX文字 | Search contact list |
| 437 | 属性 aria-label | Contacts list guardrails |
| 438 | JSX文字 | source evidence |
| 439 | JSX文字 | no live persistence |
| 440 | JSX文字 | follow-up context |
| 448 | 属性 aria-label | Contacts list search and filter API probe actions |
| 453 | JSX文字 | These probes exercise list, search, filtered, empty, pending, and controlled failure paths inside the contacts list search and filter mock boundary. |
| 458 | 属性 aria-label | Run contacts list API probe |
| 460 | JSX文字 | Run list probe |
| 463 | 属性 aria-label | Run empty contacts list API probe |
| 470 | JSX文字 | Run empty probe |
| 473 | 属性 aria-label | Run pending contacts list API probe |
| 480 | JSX文字 | Run pending probe |
| 483 | 属性 aria-label | Run controlled failure contacts search API probe |
| 489 | JSX文字 | Run controlled failure probe |
| 525 | JSX文字 | Developer capability runtime |
| 526 | JSX文字 | Contacts list search and filter mock |
| 528 | JSX文字 | Mock-first boundary for reviewing who Orbit knows, why the relationship exists, which context created it, and what follow-up action is sensible before live search or persistence exists. |
| 538 | 属性 aria-label | Contacts list search and filter states |
| 542 | 属性 title | Success state |
| 552 | JSX文字 | Contacts represented |
| 553 | JSX文字 | contacts. |
| 556 | JSX文字 | Available filters |
| 558 | JSX文字 | tags, |
| 559 | JSX文字 | sources, |
| 560 | JSX文字 | values, and |
| 562 | JSX文字 | statuses. |
| 573 | 属性 title | Empty state |
| 579 | JSX文字 | Contacts |
| 580 | JSX文字 | No contact rows are available for review. |
| 583 | JSX文字 | State |
| 596 | 属性 title | Pending state |
| 602 | JSX文字 | Search status |
| 608 | JSX文字 | Contacts |
| 609 | JSX文字 | List rendering waits for local fixture review. |
| 619 | 属性 title | Failure state |
| 624 | JSX文字 | Error code |
| 630 | JSX文字 | Message |
| 634 | JSX文字 | Recovery |
| 644 | 属性 title | Contact list rows stay explainable |
| 651 | JSX文字 | Each contact keeps source, evidence, relationship context, value scoring, status, and a next action beside the row. |
| 661 | 属性 title | Rule-based filters are deterministic |
| 668 | 属性 aria-label | Selected value filters |
| 669 | JSX文字 | topic:storage-pilots |
| 670 | JSX文字 | referral_path |
| 671 | JSX文字 | commercial_opportunity |
| 678 | 属性 title | No live lookup happens in the mock |
| 685 | JSX文字 | The mock sets search index reads, database queries, external network requests, AI calls, calendar/email requests, and notifications to false. |
| 697 | 属性 title | Contact routes use shared envelopes |
| 702 | JSX文字 | The declared probes cover contact list and search routes. Empty and controlled failure probes document non-success product states without leaving the mock boundary. |
| 708 | JSX文字 | Failure mapping |
| 716 | JSX文字 | maps to a shared failure envelope. |
| 721 | 属性 aria-label | Contacts list search and filter API probes |
| 730 | JSX文字 | returns |
| 737 | 属性 title | Replacement notes stay with the capability |
| 743 | JSX文字 | Handoff doc |
| 749 | JSX文字 | Required coverage |
| 751 | JSX文字 | Live service and provider files, switch mechanism, required env vars and permissions, privacy and provenance constraints, and replacement tests are documented before live providers are wired. |
| 758 | 属性 aria-label | Contacts live handoff excerpts |


