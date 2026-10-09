# Sprint R03 — 文案源、字典拆分、两端全面日文化

**Plan revision:** 1。**模式:** existing-codebase / single-generator（执行人：小雨）。
**单一目标:** ① 建立 `repos/orbits/shared/copy/` 三语标准用词源与术语表、写作规范；② App 字典按功能拆分；③ 两端写死的文字全部抽出并补齐三语；④ 语言回退改为日语；⑤ 用可重复运行的「翻译质量循环」把所有文案做到达标，并留下以后新增文案也能接着用的检查工具。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** R01 合入后的 `redesign` HEAD（R02 是否已合入不影响本 Sprint）。
**进入条件:** R01 completed（`shared` 同步白名单已放宽，RD-08）。RD-11、RD-12、RD-13 已定。

## 已查清的事实（按 `9d404c1c8`）

1. **App 字典**：`repos/orbit-app/src/i18n/messages.ts`（2,190 行：`messageKeys` 字面量数组 + `MessageKey` / `MessageDictionary` 类型 + `createTranslator`）；`zh.ts` / `en.ts` / `ja.ts` 各 2,184 行（`as const satisfies MessageDictionary`）；约 2,248 个 key，用前缀分域（contacts 295、profile 166、notes 134、inbox 131、aiConversation 97、onboarding 95、schedule 93、permissions 87、ai 74 …）。`tests/app-locale-core.test.ts:32` 断言三份字典 key 一致。屏幕用 `const locale = useOrbitLocale(); locale.t("key", {vars})`，另有 `t.literal()`；84 个屏幕文件用了 `t(`。
2. **App 语言判定**：`src/i18n/locale-core.ts:11-20` 用 `expo-localization` 的 `getLocales()`，只认 zh / ja / en，**都不匹配时回退 zh**；:22-29 账号设为手动时用账号语言；`OrbitLocaleContext.tsx:24-45` 无 Provider 时回退 zh；偏好经 `/api/account/language-preference` 读写。
3. **App 写死的文字（估算，含注释和测试 id 残留，只作数量级）**：`src/screens`、`src/components`、`app` 的 tsx 中含汉字的非注释行约 996 行（116 个文件）；`src/view-models` 约 1,701 行。`src/view-models/app-navigation.ts:13-55` 的返回标签、`AppScreen.tsx:68,72` 的「返回」都是写死的。
4. **Web 文案**：`app/(app)/app/orbit-language-context.tsx:57-62` 的 `t({en, zh, ja})`：ja 时取 `copy.ja ?? copy.en`，无 Provider 时返回 zh（:73-80）；服务端 `orbit-language-server.ts:107-110` 同规则，另有 `localizeOrbitTree`（:69）。`app/(app)/app/` 下 `zh:` 约 3,980 处，`ja:` 约 297 处（16 个文件，集中在 `orbit-event-content.ts`、`ingest-v2-copy.ts`、`orbit-contacts-presentation.ts`、inbox）；导航、壳、六域 UI 基本没有 ja，回退成英文。旧的 `orbit-lang-runtime-client.tsx:35-36` 只认 zh / en。
5. **Web 语言判定**：`?lang=` → `proxy.ts`（:36、54-55、156-158）写 `x-orbit-lang` 头和 cookie → `app/(app)/app/layout.tsx:29-31` 读取；**缺省 zh**（`orbit-language-core.ts:12-14`）；zh 时 URL 不带 `lang`（:23-28）；切换写 cookie 和 localStorage 后整页刷新；`<html lang>` 映射 en / ja / zh-CN（`app/layout.tsx:300-303`，`tests/ui/orbit-html-lang.test.ts` 守着）。类型 `shared/contract/language.ts`。
6. **设计稿标准用词（只有日语，`01-system.html`）**：⑩ 状态标签用词（:494, 501-508，每张卡最多 1 个珊瑚色、≤8 字、不可点）；⑯ 草稿边界（:614-618：「送信はしません · 送信はあなたが行います」「下書きを作成」「下書きを開く」「コピー」「メールアプリで開く」，禁用「送信」「送る」按钮与「送信しました」类 Toast；:603「メッセージは添えません · あとから取り消せます」）；Toast（:288-292，撤销一律「元に戻す」，「取り消す」只用于已对外生效的撤回 :625）；确认框（:313-333）；筛选（:362-363）；AI 卡（:379-381，依据以「根拠：」开头）；离线 / 错误 / 降级（:454-469，禁用「エラーが発生しました」）；加载（:437-446）；示例模式（:474-478）；配额（:511-519）；推送长按菜单（:540-551）；权限（:414-422）；导航名（`kit.js:95, 104-108`：ホーム / 人脈 / iOrbit / イベント / Task / 受信箱 / 主催 / 設定；Task 分段 カレンダー / To-do / プラン / メモ）；首页编辑（:651-656）；Web 右栏「iOrbit に聞く… ⌘K」（`web.html:415, 421`）。设置页语言选项 日本語 / English / 中文（簡体）（`b5-me-inbox.html:1174, 1238`）。

## 上下文包

### 必读
- 上面列出的设计稿位置；`IMPLEMENTATION-PLAN.md` §3.2。
- App：`src/i18n/*`、`app-locale-core.test.ts`、`AppScreen.tsx`、`app-navigation.ts`、写死文字最多的 view-models。
- Web：`orbit-language-{context,core,server}.ts(x)`、`proxy.ts`、`app/layout.tsx`、`orbit-html-lang.test.ts`、ja 覆盖最高的几个文案文件（作为现有日文风格的参考）。

### 关键符号与 impact（开工时重跑）
- App `createTranslator`、`MessageKey`、`useOrbitLocale` — 84 个屏幕文件，HIGH；**key 和调用方式不变**，拆分只改文件组织。
- App `resolveLocale` 类函数（`locale-core.ts`）、Web `parseOrbitLanguage` / 缺省语言 — 每个请求和启动都经过，HIGH。

### 易错边界（全部写进 SC）
拆分时漏 key 或改了 key；抽取文字时改变了运行时行为（拼接、复数、插值顺序）；日语里混入简体字形（如「关」「设」）；同一概念多种叫法；按钮超长被截断；把「送信」做成按钮；老用户的手动语言被改掉；Web 无 cookie 时的回退在服务端和客户端不一致导致闪烁。

## 契约（本 Sprint 定稿，REPORT 交接）

### A. 标准用词源 `repos/orbits/shared/copy/`
- `ja.ts` / `zh.ts` / `en.ts`：纯常量，按用途分组（`chip`、`toast`、`confirm`、`filter`、`aiCard`、`offline`、`error`、`degraded`、`loading`、`sample`、`quota`、`push`、`permission`、`nav`、`taskSegments`、`homeEdit`、`draftBoundary`）；键名和占位符三语一致。经同步进入 App `src/api/copy/`。
- 两端的组件和壳只从这里取固定说法，不得各写一份。

### B. 术语表与写作规范（翻译前必须先完成，见 F 的关卡 1）
- `R03-copy-and-ja/research.md`：**调研记录**。至少覆盖：
  - 名片和人脉：Eight、Sansan、LinkedIn 日本版
  - 活动：Peatix、connpass、Doorkeeper
  - 日历和待办：Google カレンダー、TimeTree、iOS 自带 App（カレンダー、リマインダー）
  - 通用和 AI：Notion、Slack、ChatGPT 日文版
  - 写作规范：Apple 日语风格指南、Microsoft 日本語スタイルガイド、JTF 日本語標準スタイルガイド
  
  对每个核心概念，记录各产品的叫法和出处（链接或截图）。
- `R03-copy-and-ja/glossary.md`：**术语表**。每条包括：概念说明、日 / 中 / 英写法、词性、用在哪里、禁用写法（附原因）、例句、调研依据、选择理由。至少覆盖：
  - 产品里的所有名词：人脈、つながり、連絡先、イベント、参加予定、予定、To-do、プラン、メモ、下書き、受信箱、秘書、iOrbit、名刺、招待コード、主催 等；
  - 所有动作动词：追加、保存、削除、元に戻す、取り消す、完了、明日へ 等。
- `R03-copy-and-ja/style-guide.md`：**写作规范**，包括：
  - 语气：正文用です・ます，按钮用动词原形或「〜する」，标签用体言止め；
  - 长度上限：状态标签 ≤8 字，Toast 主句 ≤16 字，按钮和标题按组件定；
  - 全角半角：数字和英文半角，括号「」（）全角；
  - 日期：「10月7日（水）」；
  - 长音：「ユーザー」；
  - 标点和空格；
  - 中文规范（大陆简体）与英文规范（简洁、句首大写规则）。

### C. App 字典拆分
- 改为 `src/i18n/<locale>/<domain>.ts`，每个前缀一个文件；`messages.ts` 只做汇总和类型（`MessageKey` 由各域文件推导或生成）。**key 名、内容、调用方式全部不变。**
- 测试：三语 key 完全一致；没有空值；每个 key 只出现在一个域文件里。

### D. 写死文字全部抽出
- **App**：`src/screens`、`src/components`、`app`、`src/view-models` 中所有用户可见的文字抽进对应域字典，补齐三语。插值、复数、拼接改成字典里的完整句子模板，不在代码里拼。
- **Web**：
  - 所有 `t({...})` 补齐 `ja`；
  - JSX 和数据里写死、未经 `t()` 的用户可见文字，改成 `t()` 或移进文案文件；
  - 新页面和新组件的文案放在 `app/(app)/app/orbit-2026/copy/<domain>.ts`，类型上 `ja` 必填；
  - 旧页面里内联的 `t({...})` 位置不动，只补齐 `ja`。理由：内联本来就跟着组件文件走，两人不会同时改同一个大文件，搬家只会增加改动面。
- **门禁**：新增 `no-hardcoded-copy` 测试，在 App 的 src、app，以及 Web 的 `app/(app)/app` 里扫描。
  - 不允许出现含汉字、平假名、片假名的字面量，只有以下例外：字典和文案文件、`t({...})` 参数、注释、测试 id、R08 的演示世界 fixture、设计稿原样搬运并注明来源的常量；
  - Web 的每个 `t({...})` 必须有非空的 `ja`。

### E. 语言回退
- **App**：设备语言不是 zh / ja / en 时回退 **ja**；无 Provider 时回退 ja；账号设为手动的用户保持原选择。
- **Web**：没有 cookie 和 `?lang` 时按 `Accept-Language` 选 zh / ja / en，都不是时用 **ja**。
  - 服务端判定和客户端一致，首屏不闪；
  - 已有 cookie 的用户不变；
  - URL 规则改为：ja 是缺省语言时不带 `lang`，其他语言带上（同步修改 `orbit-language-core.ts` 的 URL 规则与相关测试）；
  - `<html lang>` 门禁保持通过。

### F. 翻译质量循环（RD-13，硬要求）

**关卡 1：术语表通过**
- `research.md`、`glossary.md`、`style-guide.md` 完成后，交给**独立审校**：另开一个 AI 会话（如 Codex，或另一个 Claude 会话），角色是日语母语的产品文案审校。
- 审校结果中**没有严重和中等问题**，才能开始大批量翻译。
- 审校意见和处理结果写进 `R03-copy-and-ja/glossary-review.md`。

**关卡 2：每一轮循环**（工具放在 `repos/orbits/scripts/copy-qa/`，两端共用，以后新增文案也能接着跑）
1. **翻译**：按术语表和写作规范翻译或修改。
2. **自动检查** `copy-qa check`，每项输出问题数：
   - 术语合规：概念对应的规定写法，以及禁用写法清单；
   - 禁用词（⑯ 的「送信しました」等，「エラーが発生しました」）；
   - 按组件类型的字数上限；
   - 三语占位符一致（`{name}` 等）；
   - 日语里的简体字形（简体专用字表）；
   - 日语和中文完全相同（疑似没翻译）；
   - 空值；
   - 语气一致（句末です・ます / 按钮形式）；
   - 全角半角规则。
3. **独立审校**：同一个独立审校会话逐条审，按准确、自然、术语、是否适合界面四个维度打 1–5 分，问题分严重 / 中等 / 轻微。
   - 标准用词、导航、错误和离线提示 100% 审；
   - 其余按功能分批**全部审完**，不抽样。
4. **放回界面检查**：
   - App 日语界面在 320pt 和 2 倍字号下截图，覆盖每个功能的主要屏幕；
   - Web 在 375 和 1440 下截图；
   - 审校看截图，找截断、难看的换行、上下文不通。
5. **修改**，进入下一轮。

**达标条件（全部满足才算完成）**
- 自动检查**零问题**；
- 独立审校**没有严重和中等问题**；
- 每个维度平均分 ≥4.5；
- 轻微问题全部修掉，或逐条写明保留理由。

**留痕**：每一轮的检查问题数、审校问题数、平均分写进 `R03-copy-and-ja/qa-rounds.md`（一轮一行），REPORT 里画出变化。

**适用范围**
- 中文（大陆简体）和英文走同一套循环。
- App 现有的 2,184 条日语**也要过一遍**，不能默认已经合格。

## 范围与文件

- **新建**：
  - `repos/orbits/shared/copy/{ja,zh,en}.ts` 和对应的 App 同步副本；
  - `repos/orbits/scripts/copy-qa/*`；
  - `app/(app)/app/orbit-2026/copy/`；
  - `R03-copy-and-ja/{research,glossary,style-guide,glossary-review,qa-rounds}.md`。
- **修改**：
  - App：`src/i18n/**`（拆分）、所有含写死文字的文件、`locale-core.ts`、`OrbitLocaleContext.tsx`、`scripts/sync-contract.mjs`（加 `copy`）；
  - Web：所有缺 `ja` 的 `t({})`、写死文字所在文件、`orbit-language-{core,context,server}`、`proxy.ts`。
- **测试**：
  - App：`app-locale-core` 扩展；新增 `i18n-domain-split.test.ts`、`copy-sync.test.ts`、`no-hardcoded-copy.test.ts`、`locale-fallback-ja.test.ts`；
  - Web：新增 `no-hardcoded-copy.test.ts`、`t-requires-ja.test.ts`、`language-accept-header.test.ts`；`orbit-html-lang` 保持通过；
  - `copy-qa` 自身的单测。
- **不做**：组件、导航（R04–R07 只使用本 Sprint 的文案源）；R08 演示世界里的示例数据文字（由 R08 负责三语）。

## 验收契约

| SC | 操作链 | 主证据 |
| --- | --- | --- |
| SC-R03-01 先调研再定术语 | 调研记录、术语表、写作规范完成并通过独立审校后，才开始大批量翻译 | `glossary-review.md` 的日期早于大批量翻译提交；审校无严重 / 中等问题 |
| SC-R03-02 标准用词同源 | 两端组件 / 壳要显示固定说法时，从 `shared/copy` 取；改一条，两端一起变 | `copy-sync.test.ts` + 一个两端渲染测试 |
| SC-R03-03 字典拆分无损 | 拆分后 key 集合、每个 key 的三语内容与拆分前完全一致 | `i18n-domain-split.test.ts`（与拆分前快照比对） |
| SC-R03-04 没有写死文字 | 两端扫描零违规；Web 每个 `t()` 都有 `ja` | `no-hardcoded-copy`、`t-requires-ja` |
| SC-R03-05 回退日语 | App 设备语言设为法语 → 新用户看到日语；Web 浏览器语言 `fr` 且无 cookie → 日语且首屏不闪；手动选过中文的用户不变 | 测试 + 模拟器 / 浏览器截图 |
| SC-R03-06 质量循环达标 | 最后一轮：自动检查 0 问题；审校无严重 / 中等问题；四个维度平均 ≥4.5；轻微问题已处理或写明理由 | `qa-rounds.md`、最后一轮的审校记录 |
| SC-R03-07 放回界面没问题 | 日语界面截图集（App 320pt + 2 倍字号，Web 375 / 1440）无截断、无夹杂其他语言 | 证据目录截图对照页 |

### 必需证据子表

| SC | 子断言 | 证据 |
| --- | --- | --- |
| 01 | 术语表每条都有调研依据（至少 2 个产品或 1 份风格指南）和选择理由 | `glossary.md` |
| 03 | 每个 key 只在一个域文件出现；没有空值 | 测试 |
| 04 | 抽取前后关键页面的运行结果一致（插值、复数、拼接改成模板后的值相同） | 渲染测试抽样 |
| 06 | 中文和英文也有各自的循环记录；App 原有 2,184 条日语已过检 | `qa-rounds.md` |
| 06 | `copy-qa check` 可以在新增文案上单独运行，用法写进 REPORT | REPORT |
| 全部 | 两端全量对照基线零新增失败；`tsc`、`typecheck:app`、`lint` 通过；`detect-changes` 写进 REPORT | 全量清单 |
| 报告 | 给产品负责人看：调研记录、术语表、写作规范、三语标准用词对照表、各轮数字的变化、每个功能抽样 10 条（三语并排）和对应截图 | REPORT |

## 执行顺序

1. 记录基线；跑 impact；统计两端写死文字与缺 `ja` 的数量。
2. 调研 → 术语表 → 写作规范 → **独立审校通过（关卡 1）**。
3. 建 `copy-qa` 工具（先写它的单测）和 `shared/copy`。
4. App 字典拆分（机械拆分，快照比对）。
5. 两端抽取写死文字，接上门禁测试。
6. 语言回退改动。
7. 按 F 的循环跑到达标，每轮记一行。
8. 截图集、全量测试、写 REPORT。

## 失败与交接

关卡 1 没通过：不得进入大批量翻译。某个功能的文字无法抽取（例如来自服务端数据）：写进 REPORT，并标出负责的功能 Sprint。

REPORT 交接内容：
- 术语表和写作规范的最终版（以后所有 Sprint 都必须遵守）；
- `copy-qa` 的用法和达标条件；
- 两端新增文案时该放在哪里；
- 语言回退规则。
