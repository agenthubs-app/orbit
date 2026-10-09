# Sprint R03 — REVIEW（独立复核）

**复核人：** 独立 AI 复核会话（不是执行人），2026-10-10。
**对象：** `git diff 36ac64bad..a3914f311`（提交 `7c42c3b60` 关卡 1 文档、`4cb76ad8c` 代码与翻译、`a3914f311` REPORT），在 `redesign` HEAD `a3914f311` 上复核。
**依据：** PLANNER 修订 2（唯一契约）、README 通用规则 1–9、RD-11、RD-12（修订）、RD-13、RD-24、RD-25。REPORT 只作线索；下面每条结论都是复核人重跑、重读或注入验证得出的。
**基线：** `ac07300af`：App 4097 条 / 1 失败（`route-parity`）；orbits 6845 条 / 5 失败（DEP0205）；两端 typecheck / lint 0。

## 结论：有条件通过

主体都已做到，而且复核人独立核实过：
- 字典拆分无损：复核人自己比对了拆分前后的三语内容，2,253 个 key 一个不少、值完全一致。
- 写死文字门禁能拦住问题：开工快照确实冻结在基线上，D 节里 App 部分为 0；共注入 14 次，除 3 处已知漏洞（m3、m4）外全部被拦。
- 语言回退：服务端和客户端一致，已有 cookie 的用户不受影响；浏览器实测结果与 REPORT 相符。
- legacy 测试语言不会泄漏到生产。
- 两端全量对照基线零新增失败，typecheck / lint 全部为 0。

但有 **4 条中等问题**：
- **M1**：`copy-qa` 读 App 域字典时不带组件类型，所以「字数上限」「语气」两类检查在 App 文案上从来没有执行。本 Sprint 的导航壳和登录会话共 43 条文案也包括在内。
- **M2**：PLANNER D 节列出的「Web 导航壳相关文件」既没有处理，也没有截图，也没有登记为例外。
- **M3**：legacy 测试接缝让所有骨架测试都只在中文下运行。新加的日语默认路径和返回栏规则没有任何渲染测试。
- **M4**：术语表至少 16 条没有调研依据，但 REPORT 把 SC-01 记为 ✅。

**条件：** M1–M4 在 `redesign` 上修完（RD-25）后，R03 视为完成。
- M2 和 M4 主要是登记和补文档，改动很小。
- M1 和 M3 要改工具、补测试。
- R04 可以同时开工；但 R04 若要用 `copy-qa` 检查自己的 App 文案，必须等 M1 修完，否则长度和语气检查形同虚设。

没有严重问题。

## 逐 SC 核实

| SC | 结论 | 复核人做了什么 / 证据 |
| --- | --- | --- |
| 01 先调研再定术语 | ⚠️ 部分 | **时间顺序成立**：`7c42c3b60`（02:00:56）只含 research / glossary / style-guide / glossary-review 四个文档；`glossary-review.md` 第 4 轮「通过」；全部代码和翻译都在 `4cb76ad8c`（02:59:23）。之后 glossary 只补了 1 行「開催前」，来源是文案第 1 轮审校的 L11。research 覆盖 PLANNER 点名的 15 个产品和指南，含 19 个链接。**子断言没有做到**：「每条至少 2 个产品或 1 份风格指南」，见 M4 |
| 02 标准用词同源 | ✅ | `shared/copy/{ja,zh,en}.ts` 三语同组同键，零 import；App 副本 `src/api/copy/` 与源逐字节一致（`copy-sync` 测试）。App `useStandardCopy` / `currentStandardCopy`、Web `standardCopyFor` 读同一份；`sync-contract.mjs` 白名单加了 `copy`，`AGENTS.md` 已更新（RD-08）。复核人实测：Web `/showcase/copy` 在 fr 浏览器下「人脈」，在 cookie=zh 时「人脉」，与 App 展示页测试读的是同一个值 |
| 03 字典拆分无损 | ✅ | **独立比对**：用 `git show ac07300af:` 取出拆分前的 `ja/zh/en.ts`，与拆分后 `src/i18n/<locale>/index.ts` 汇总结果逐 key 比较。三语都是旧 2,253 键：缺 0、改 0；新增 43 键，全部属于 `shell` / `session` 两个新域。`createTranslator`、`interpolate`、`OrbitTranslator`、`t.literal` 与旧实现逐行相同；`MessageKey` 改为从 zh 推导，调用方式不变。App 屏幕文件除 D 节范围外一个没动 |
| 04 写死文字只减不增 | ⚠️ 基本达成 | **开工快照是真冻结的**：复核人用 `git archive ac07300af` 导出基线源码，用同一个扫描器重扫。<br>- App：基线 156 个文件 8,313 条；减去 D 节的 6 个文件（AuthSessionProvider 22、app-navigation 22、AppErrorBoundary 6、AppScreen 3、OrbitRouteAccessBoundary 2，以及旧 `ja/zh/en.ts` 字典），正好等于快照的 148 个文件 3,779 条。<br>- Web：基线与快照逐文件完全相同（235 个文件，写死 2,306 条，缺日文 3,695 处）。<br>- 两份快照都由 sha256 锁住。<br>**注入结果**见下表「运行时抽查 · 注入」：除半角片假名和 `app/(app)/app` 以外的新页面（m3、m4）外，全部被拦。<br>**D 节**：App 部分现在为 0（`ZERO` 名单强制）；Web 根 layout、`orbit-language-*`、`orbit-2026/**`、`app/page.tsx`、`/showcase/copy` 也为 0。但 Web 导航壳不是 0，见 M2。<br>**Web 新文案缺 `ja`**：注入一张缺 `ja` 的文案表后，`npm run typecheck` 报 TS2741，EXIT 2 |
| 05 回退日语 | ✅（App 模拟器为已知例外） | App：`languageFromDeviceLocales` 遇 fr / de / 空列表都返回 ja；手动选过语言的用户（manual）保持原选择；无 Provider 时为 ja（`locale-fallback-ja` 测试先清掉接缝再加载模块，确实测到了生产默认值）。<br>Web：`resolveRequestOrbitLanguage` 的顺序是 `?lang` 头 → cookie → Accept-Language（按 q 值）→ ja。根 layout、`(app)/app/layout`、`app/page.tsx`、`getOrbitServerLanguage` 四个入口都用它，`proxy.ts` 只在有 `?lang` 时写头。复核人用 Playwright 实测（见下文）：服务端 `<html lang>` 与水合后一致，控制台无错误。URL 规则：日语不带 `lang`，中英带上（测试覆盖）。App 模拟器截图未做（规则 6，`.env.local` 指向正式环境），与 REPORT 例外一致 |
| 06 质量循环达标 | ⚠️ 部分 | `qa-rounds.md` 三轮每轮一行。第 3 轮文案审校结果为 0 / 0 / 3；截图审校 0 / 2 / 4，修改后有独立复查，结论「通过」。三语各有平均分，都 ≥4.5。轻微问题有处理或理由。复核人重跑 `npm run copy:qa`：161 条，0 问题。**但**这个「0」对 App 的 43 条（shell / session）只跑了一部分规则：长度、语气、按组件类型限定的禁用词都没有执行（M1） |
| 07 放回界面没问题 | ⚠️ 部分 | 证据目录里有 App（react-native-web）320pt 1× / 2× 的三语截图 12 张、Web 375 / 1440 的标准用词展示页 6 张，以及 fallback 截图 5 张。**缺两样**：Web 导航壳的截图（PLANNER F-4 要求 Web「覆盖同样的范围」），以及「截图对照页」（SC-07 主证据、规则 5），见 M2、m9 |

### 必需证据子表

| SC | 子断言 | 复核结果 |
| --- | --- | --- |
| 01 | 术语表每条有调研依据（≥2 产品或 1 份指南）和选择理由 | ❌ 16 条依据为「—」或「无先例」（M4）；选择理由每条都有 |
| 03 | 每个 key 只在一个域文件；无空值 | ✅ 测试；复核人独立比对见上 |
| 04 | 抽取前后运行结果一致 | ✅（有审校依据的改动除外）插值改成了 `{count}` 模板。中文输出共 10 处变化，逐条都能在 `qa-review-round-1/2/3.md` 里找到依据，变化清单见「改动面」 |
| 04 | 允许清单初始条数写进 REPORT | ✅ App 148 / 3,779；Web 235 / 2,306 + 3,695（复核人重扫一致） |
| 06 | 中文、英文也有循环记录 | ✅ `qa-rounds.md` 每轮三语平均分 |
| 06 | `copy-qa` 可单独运行，用法写进 REPORT | ✅ `npm run copy:qa`、`-- --shared`、`-- --app tasks` 都能单独运行，有问题时退出码为 1。`check.mjs` 头部指向的 `scripts/copy-qa/README.md` 不存在（m5） |
| 全部 | 全量零新增、tsc、typecheck:app、lint、detect-changes | ✅ 见「全量与基线对照」；`detect-changes.txt` 在证据目录 |
| 报告 | 调研、术语表、规范、对照表、各轮数字、三语并排截图 | ⚠️ 前五项都有；「三语并排截图」只是一个目录，没有对照页（m9） |

## 运行时抽查

**Web**
- 复用本机 3000 端口已在运行的 `repos/orbits` dev server（next-server 16.2.9，cwd 是本仓库，HEAD 含 R03）。数据库没有动，没有连 Neon。
- curl 与 Playwright（Chromium，375 宽）实测：

| 浏览器语言 | cookie | 服务端 `<html lang>` | 水合后 | 页面 | 控制台错误 |
| --- | --- | --- | --- | --- | --- |
| fr-FR | 无 | ja | ja | Copy · ja，「人脈」 | 0 |
| en-US | 无 | en | en | Copy · en，「Network」 | 0 |
| zh-CN | 无 | zh-CN | — | — | — |
| `de-DE,en;q=0.5` | 无 | en（按 q 值选到 en） | — | — | — |
| fr-FR | zh | zh-CN | zh-CN | Copy · zh，「人脉」 | 0 |

- `/app/login?lang=en` + cookie zh → 服务端返回 `set-cookie: orbit-lang=en`，`<html lang="en">`，`?lang` 优先，正确。
- `/showcase/copy?lang=en` + cookie zh → 仍是 zh。`proxy.ts:170` 的 matcher 只覆盖 `/app`、`/api`，与页面注释的说法不符（m8）。
- fr 浏览器打开落地页 `/`：`<html lang="ja">`，但顶部导航是「Events / Contacts / Sign in」（日文缺失，回退英文）。这是 M2 的现场表现。

**App**
- **没有启动模拟器或 Metro**（复核指示 + 规则 6）。
- App 端的依据：
  - 全量测试；
  - 复核人看了执行人的 react-native-web 截图 `app-shell-ja-320-2x.png`：返回栏「‹戻る」，标题「言語」，底栏是 ホーム / 人脈 / iOrbit / イベント / マイページ，没有夹杂其他语言。但截图里根错误页的「再試行」按钮被底栏盖住了（夹具把两者叠在一起），所以从这张图判断不了按钮有没有被截断（m9）。

**注入**：全部在工作区临时修改，只跑单个测试，跑完立即还原。注入是在 App 全量结束之后、Web 全量开始之前做的，没有污染全量结果。

| # | 注入 | 预期 | 结果 |
| --- | --- | --- | --- |
| A1 | 新建 `src/components/ui/ReviewProbe.tsx` 返回 `"保存"` | 拦 | ✅ 2 条失败（清单外 + ZERO） |
| A2 | 清单外文件 `src/hooks/useOrbitApiClient.ts` 加 `"テスト"` | 拦 | ✅ 1 条失败 |
| A3 | 清单内 `src/components/ErrorState.tsx` 加 1 条 | 拦 | ✅ 1 条失败 |
| A4 | `AppScreen.tsx` 加 `accessibilityHint="見出し"` | 拦 | ✅ 2 条失败 |
| A5 | 清单内文件把 1 条中文改成英文、不改清单 | 要求下调清单 | ✅ 1 条失败（「lower the allow list」） |
| A6 | 类型字面量 `type P = "保存" \| "削除"` | 可争议 | 被计入（偏严，可接受） |
| A7 | 半角片假名 `"ｾｰﾌﾞ"` | 拦 | ❌ 通过（m4） |
| W1 | `orbit-2026/probe/*.tsx` 写 JSX 文字 `保存する` | 拦 | ✅ 2 条失败 |
| W2 | 同上写 `t({ zh, en })` | 拦 | ✅ 2 条失败 |
| W3 | `t({ zh, en, ja: "Save" })`（ja 照抄英文） | 理想应拦 | ❌ 通过（m4） |
| W4 | 清单内 `orbit-account-shell.tsx` 加一个缺 ja 的对象 | 拦 | ✅ 1 条失败 |
| W5 | `orbit-language-core.ts` 加 `"テスト"` | 拦 | ✅ 2 条失败 |
| W6 | 新页面 `app/showcase/probe/page.tsx` 写 `保存する` | 新代码应拦 | ❌ 通过（不在扫描范围，m3） |
| W7 | `orbit-2026/copy/review-probe.ts` 缺 `ja` | typecheck 失败 | ✅ TS2741，EXIT 2 |

## legacy 测试语言接缝（重点 4）

- **会不会泄漏到生产：不会。**
  - App：`locale-core.ts:18` 用 `declare const` 声明接缝，`:36` 用 `typeof` 读取。只有测试在设置它：`tests/helpers/register-render-hooks.mjs:18` 设成全局变量，约 80 个浏览器测试通过 esbuild `define` 设置。Metro 和生产构建都不定义它，`typeof` 对未声明的标识符是安全的，结果为 ja。
  - Web：`orbit-language-core.ts:20-22` 在运行时读 `process.env.ORBIT_LEGACY_TEST_LANGUAGE`，全仓库只有 `scripts/run-node-tests.mjs:28` 设置它。客户端包里非 `NEXT_PUBLIC_` 的变量读出来是 `undefined`，所以生产上服务端和客户端都是 ja。但这个读取留在生产代码路径上，部署环境一旦误设，服务端和客户端就会不一致（m1）。
- **会不会掩盖真实回归：会，掩盖了一部分（M3）。**
  - 旧屏测试钉在中文，这一点合理：这些屏会被整屏重写（RD-24），否则 App 844 条、Web 11 条旧测试会白白失败。
  - 问题在于接缝对 App 测试进程是全局的，本 Sprint 自己写的骨架代码因此也只在中文下被测：底栏、返回栏、根错误页、登录会话提示都是。
  - 生产默认的日语路径上，只有纯函数和「无 Provider」有测试。
  - 新行为完全没有测试：返回栏的通用「戻る」规则（`AppScreen.tsx:59`），以及 Provider 上层读语言的 `publishOrbitLanguage` / `currentStandardCopy` / `currentTranslator`。
  - 复核人 grep 了 `tests/`，以上符号和 `getFontScale` 的命中都是 0。

## 改动面

- **旧屏没有被改（RD-24）**：
  - App 改动的产品代码只有这些：D 节文件（AppScreen、app-navigation、OrbitRouteAccessBoundary、AppErrorBoundary、AuthSessionProvider、OrbitTabBar）；`src/i18n/**`；`src/api/copy/**`（同步副本）；新展示页 `app/showcase/copy.tsx` 和 `src/screens/showcase/CopyShowcaseScreen.tsx`；`scripts/page-offline-inventory.ts` 和 `docs/offline/page-inventory.md`（为新路由登记）；`AGENTS.md`、`sync-contract.mjs`。
  - Web 改动的产品代码只有这些：`app/layout.tsx`、`app/(app)/app/layout.tsx`、`orbit-language-{core,server}.ts`、`orbit-2026/copy/*`、`app/showcase/copy/*`、`app/page.tsx`。
  - `app/page.tsx` 是落地页（归属 R18），但只把语言判定换成 `resolveRequestOrbitLanguage`。这是「服务端各入口同一规则、首屏不闪」必需的接线，不算改旧屏。
  - 测试文件除新增外，大多只加了一行 `define`（接缝）；另有 `ink-signal-shell`、`ink-signal-events`、`auth-session-provider-races`、`render-app-error-screen`、`app-locale-core`、`orbit-html-lang` 的断言随审校后的文案或日语默认值一起更新。
- **中文输出的变化（都有审校依据）**：

  | 位置 | 改动前 → 改动后 | 依据 |
  | --- | --- | --- |
  | 返回目标 | 导入中心 → 导入 | 第 1 轮 L9 |
  | 返回目标 | 关系对话 → 往来记录 | 第 1 轮 L9 |
  | 返回目标 | 日程 → 日历 | 第 1 轮 L8 |
  | 返回目标、底栏 | IORBIT → iOrbit | 第 1 轮 M5 |
  | 根错误页标题 | 这个页面出了点问题 → 无法显示页面 | 第 1 轮 M6、截图 L1 |
  | 根错误页 | 错误信息 → 错误详情 | 第 1 轮 L9 |
  | 登录会话提示 | 注销 → 退出登录 | 自定决定 8 |
  | 登录会话提示 | 继续此账号 → 继续使用此账号 | 第 1 轮、第 2 轮 L4 |
  | 登录会话提示 | 登录身份校验失败 → 无法验证登录身份 | 第 1 轮、第 2 轮 L4 |
  | 登录会话提示 | 有 1 项 → 有1项 | 中文数字空格规则 |

  日文底栏：つながり → 人脈，IORBIT → iOrbit。
- **行为改动（D 节内）**：
  - 返回栏：系统字号 ≥1.5 倍、或目标名超过 12 个字符时，只显示通用的「戻る / 返回 / Back」；读屏标签仍带目标名。
  - 底栏标签：`maxFontSizeMultiplier={1}`，不再随系统字号放大（自定决定 12，大字号用长按放大视图，留给 R05）。在 R05 做之前，这是辅助功能上一个已登记的退步。
- **GitNexus（复核人重跑）**：`createTranslator` 为 CRITICAL（direct 82），与 REPORT 的对策（签名和行为不变）相符；复核人比对实现，确实逐行相同。`resolveRequestOrbitLanguage` 返回 not found / UNKNOWN，因为索引早于 R03。复核人用文本搜索确认调用方：4 个入口 + `/showcase/copy`，`normalizeOrbitLanguage` 的旧调用方在活动详情、现场、报名 3 页（旧屏，语义「无效值 → 默认语言」没变）。
- **构建产物误入库**：`repos/orbits/tsconfig.build.tsbuildinfo`（m7）。

## 问题清单

### 严重

无。

### 中等

**M1 `copy-qa` 检查 App 域字典时不带组件类型，长度、语气、限定场合的禁用词从来没有执行**
- 现象：
  - `loadAppDomains(appRoot, domains, kinds = {})` 给每条 App 文案的 `kind` 都是 `undefined`，`cli.mjs` 调用时也不传 `kinds`。
  - 但 `check.mjs` 里的 `LENGTH_LIMITS`、`EN_LENGTH_LIMITS`、`toneIssues` 的按钮 / 标签 / Toast / 正文规则、中文「已发送」的场合限定，全部以 `kind` 为前提。
  - 结果：本 Sprint 范围内的 App 文案（`shell` 22 条、`session` 21 条，共 43 条）在这几类检查上的「0 问题」只是因为没执行。
  - 功能 Sprint 按交接说明跑 `npm run copy:qa -- --app <domain>`，也同样拿不到这些检查。
  - Web 这边，`OrbitCopyEntry.kind` 也是可选的，不写就同样被跳过。
- 位置：
  - `repos/orbits/scripts/copy-qa/sources.mjs:21`
  - `repos/orbits/scripts/copy-qa/cli.mjs:23`
  - `repos/orbits/app/(app)/app/orbit-2026/copy/types.ts:11`
- 复现：
  - `node --import tsx -e` 调 `loadAppDomains("../orbit-app", ["shell","session"])`：43 条，带 kind 的 0 条。
  - 拿一条 25 字、以「します」结尾的日文：不带 kind 时 `checkCopy` 报 0 问题；加上 `kind: "button"` 后报 length 1、tone 1。
  - `npm run copy:qa -- --app tasks`：length 0、tone 0。
- 影响：
  - SC-06「自动检查 0 问题」对 App 部分说多了。
  - PLANNER F 要求的「按组件类型的字数上限」「语气一致」在 App 上没有落地。
  - 后续每个 Sprint 都会被这个 0 误导。
- 建议修法：
  1. 给 App 文案登记组件类型：在 `scripts/copy-qa/kinds.mjs` 加 `APP_KEY_KINDS`（或在域字典旁放一份 `<domain>.kinds.ts`），`cli.mjs` 传给 `loadAppDomains`。
  2. 没有类型的条目一律报一条 `kind-missing` 问题，不要默默跳过。Web `OrbitCopyEntry.kind` 改为必填。
  3. 补单测：「不带 kind 的条目会被报告」。
  4. 给 `shell` / `session` 标好类型后重跑：返回目标名按 `nav`，按钮按 `button`，提示句按 `sentence`。在 `qa-rounds.md` 补一行。

**M2 PLANNER D 节的「Web 导航壳相关文件」没有处理，也没有截图和登记**
- 现象：
  - PLANNER D「要处理的范围」写的是「Web：根 layout、`orbit-language-*`、**导航壳相关文件**、`orbit-2026/**`」。F-4 也要求 Web 截图覆盖导航壳。
  - 但现在的 Web 导航壳 `orbit-public-shell.tsx`（写死 2 条、缺日文 36 处）和 `orbit-account-shell.tsx`（缺日文 3 处）都留在允许清单里。
  - Web 截图只拍了标准用词展示页。
  - REPORT 只写了「Web 的根 layout、`orbit-language-*`、`orbit-2026/**` 原本就是 0」，没有提导航壳，也没有列为例外。
- 位置：`repos/orbits/tests/fixtures/hardcoded-copy-legacy-allowlist.json:664`（account-shell）、`:720`（public-shell）；`repos/orbits/tests/ui/no-hardcoded-copy.test.ts:18`（`ZERO` 不含壳）；REPORT「做了什么」第 6 条、「已知例外」。
- 复现：
  - `curl -H "Accept-Language: fr-FR" http://localhost:3000/` → `<html lang="ja">`，顶部导航是「Events / Contacts / Sign in / Join now」（英文回退）；
  - 也可以直接看上面两行允许清单。
- 判断：旧顶栏会在 R07 被整屏替换（R07 PLANNER 第 2 条点名 `OrbitTopNav` / `AccountTopNav`），按 RD-24 不处理旧壳是说得通的。但契约写了要处理，偏离又没有登记，产品负责人看 REPORT 会以为 Web 壳已经日文化。
- 建议修法（二选一）：
  - (a) **推荐**：在 REPORT「已知例外」登记：Web 旧导航壳由 R07 整屏替换（新壳放在 `orbit-2026/**`，自动落进 `ZERO`）；SC-04 / SC-07 改记为 ⚠️；在 R07 PLANNER 的验收里加一句「新壳文案零写死、`copy-qa` 0 问题、两个旧壳文件从允许清单删除」。
  - (b) 把两个壳文件里缺的 `ja` 补上，补拍 Web 375 / 1440 的壳截图，再走一轮审校。
- 同时补一个截图对照页（见 m9）。

**M3 legacy 测试接缝让骨架代码只在中文下被测；日语默认路径的新行为没有测试**
- 现象：
  - App 的接缝在 `register-render-hooks.mjs:18` 对整个测试进程全局生效。D 节组件的渲染测试（`ink-signal-shell`、`render-app-error-screen`、`auth-session-provider-*` 等）因此全部在中文下运行。
  - 本 Sprint 新加的行为在任何语言下都没有测试：
    - `AppScreen.tsx:59` 的通用返回规则（字号 ≥1.5 倍、或目标名超过 12 个字符时显示「戻る」）；
    - `OrbitLocaleProvider.tsx:335` `publishOrbitLanguage` → `currentTranslator()` / `currentStandardCopy()` 这条 Provider 上层的语言链路（AuthSessionProvider 的确认框和错误、根错误页都走它）；
    - 复核人在 `tests/` 里 grep `getFontScale|genericBack|戻る|publishOrbitLanguage|currentStandardCopy|currentTranslator`，命中 0。
  - 生产默认是日语，而 PLANNER 规则 2 要求真实渲染测试，所以接缝在这里掩盖了「日语下壳是否正确」。
- 影响：
  - 返回栏规则或上层语言链路坏了，全量照样全绿。
  - R04 / R05 接着改壳时，这些行为没有回归保护。
- 建议修法：补 3 组测试，先清掉接缝或显式包 `OrbitLocaleContext` 的 ja Provider：
  1. `AppScreen`：ja 下 `PixelRatio.getFontScale()` 打桩为 2 → 显示「戻る」，读屏标签是「設定に戻る」；目标名超过 12 个字符同样显示「戻る」；1 倍且目标名短时显示目标名。
  2. `AppErrorBoundary`：先 `publishOrbitLanguage("ja")` 再渲染 → 标题、正文、「再試行」都是日文；换成 `en` 时跟着变。
  3. `AuthSessionProvider`：ja 下触发「其他账号待同步」确认框 → 按钮是 ja 的 `session.*` 文案，`{count}` 被正确填入。
- 另外，在 `AGENTS.md` 和 REPORT 交接里写一句：新代码的测试不得依赖接缝。

**M4 术语表至少 16 条没有调研依据，REPORT 却记 SC-01 为 ✅**
- 现象：
  - 必需证据子表要求「术语表**每条**都有调研依据（至少 2 个产品或 1 份风格指南）」。
  - 以下各条的「调研依据」一栏是「—」或「无先例」：
    - 依据为「—」：未报名 :69、打开草稿 :80、用邮件 App 打开 :82、不代发说明 :83、发送（禁用词）:84、加载慢 :118、AI 不可用 :120、示例数据 :123、本月剩余次数 :124、已达上限 :125、逾期 :126、从通知打开 :127；
    - 依据为「无先例 / 无直接先例」：秘書 :42、参加予定 :67、招待コード :73（只 1 个产品）；
    - 申込済み :68 只有 1 个产品，并注明「research 未存证」。
  - 这些多半是设计稿定稿的说法，选择理由写的是「设计稿」，但设计稿不属于契约认可的依据类型。
  - REPORT 写「✅ … 未存证的依据已注明」，等于把缺口说成了达标。
- 位置：`docs/designs/redesign-2026-10/sprints/R03-copy-and-ja/glossary.md`（行号见上）；REPORT「验收」SC-01 行和子表第 1 行。
- 复现：用 awk 取术语表各表「调研依据」列，筛「—」和「无」。
- 建议修法：
  - 能补的补：加载慢、AI 不可用、配额、逾期这类在 Notion / Slack / ChatGPT / iOS 里都有对应写法，补出处；
  - 补不了的，在 glossary §10 列成「以设计稿定稿为唯一依据」的例外清单，请产品负责人过目；
  - REPORT 的 SC-01 和子表改记为 ⚠️，写明条数。

### 轻微

**m1 Web 接缝在生产代码路径上运行时读环境变量。** `repos/orbits/app/(app)/app/orbit-language-core.ts:20-22` 每次调用都读 `process.env.ORBIT_LEGACY_TEST_LANGUAGE`。生产不会设置它，但如果哪天在 Vercel 或本地 dev 的环境里误设，服务端会用 zh、客户端（读不到这个变量）会用 ja，造成首屏不一致，URL 规则也会错。建议加 `process.env.NODE_ENV === "test"` 守卫，或改由测试 import 一个 setter。

**m2 Provider 首次渲染前，上层文案固定为日语，不看设备语言。** `repos/orbit-app/src/i18n/locale-core.ts:31` 在 `publishedLanguage` 为空时直接取 `fallbackOrbitLanguage()`（ja）。冷启动时如果根错误边界在 Provider 渲染前就捕获了错误，中文设备的用户会看到日文错误页。另外，`publishOrbitLanguage` 在 render 里执行（`OrbitLocaleProvider.tsx:335`），属于渲染期副作用。建议回退改为 `languageFromDeviceLocales(getLocales())`（原生端）；发布语言放进 `useLayoutEffect`，或在模块初始化时先用设备语言初始化。

**m3 门禁的扫描范围漏掉了 Web 根目录下的新页面。**
- Web 只扫 `app/(app)/app`（`tests/support/hardcoded-copy.ts:52`）。`app/layout.tsx`、`app/page.tsx`、`app/showcase/**` 都不在范围内：注入 W6（`app/showcase/probe/page.tsx` 写 `保存する`）照样通过。
- R03 自己的 `/showcase/copy` 和 R02 的 `/showcase/icons` 就在这里，R06 的组件展示页大概率也会放在这里。
- App 和 Web 都把同步目录（`shared/**` → `src/api/{contract,…}`）排除在外，结果是 `shared/contract` 里的写死文字两边都不查。
- 建议：Web 扫描加上 `app/showcase/**`、`app/layout.tsx`、`app/page.tsx`，并把前两者放进 `ZERO`。

**m4 门禁有两个低成本绕过方式。**
- 半角片假名不在 `CJK` 正则里（两端 `tests/support/hardcoded-copy.ts:11`），注入 A7（`"ｾｰﾌﾞ"`）通过。建议把 `｡-ﾟ` 加进去。
- `t({ zh, en, ja: "Save" })` 这种 ja 照抄英文的写法不算缺日文（注入 W3）。`orbit-2026/copy` 里的文案有 `copy-qa` 兜底，旧页面不在本 Sprint 范围，可以只登记，不改。

**m5 `copy-qa` 与文档有出入，单测只覆盖到规则大类。**
- 写作规范 §1.1 标了 ✔ 的「确认框标题用问句『〜しますか？』」，`check.mjs` 里没有实现（`toneIssues` 没有 `dialogTitle` 分支）。
- 反过来，`check.mjs:54-66` 多了全局禁用清单里没有的规则：中文「联络人」、英文「Todo」，以及对所有组件类型生效的英文 `^Send`。这与术语表「只报告全局禁用清单」「两者不一致时以清单为准」的说法矛盾。
- 文件头写着「Usage: scripts/copy-qa/README.md」（`check.mjs:7`），但这个文件不存在。
- 单测给 9 类规则各配了一个坏样本，但大约一半子规则没有样本：
  - 禁用词：私たち、过度敬语、中文「发生错误」、中文按钮里的「已发送」、英文 we / our / Sent；
  - 术语：受信トレイ、ドラフト、リトライ、ToDo、環境設定；
  - 全半角：全角括号、「？」、句读点、日期空格；
  - 语气：正文句的です・ます；
  - 外部服务名白名单。
- 建议：
  - 补上问句规则，多出来的规则写回术语表的全局禁用清单（或删掉）；
  - 补 README 或改掉这条引用；
  - 用表驱动的方式，给每个子规则补一个坏样本。

**m6 拆分哈希测试没有给后续 Sprint 留说明。** `repos/orbit-app/tests/i18n-domain-split.test.ts:23` 的 `ADDED_SINCE_SPLIT` 只放了 `shell`、`session`。功能 Sprint 新增一个域，或者按审校改了旧 key 的值，这条测试都会失败，必须同时改测试，但 REPORT 交接里没有写。建议在测试注释和 REPORT 交接写明：「新增域加进 `ADDED_SINCE_SPLIT`；重写旧屏改旧值时，更新 PRE_SPLIT 的哈希，或把该域整体移进 `ADDED_SINCE_SPLIT`」。

**m7 构建产物误入库。** `4cb76ad8c` 提交了 `repos/orbits/tsconfig.build.tsbuildinfo`（一行 JSON，`tsc` 增量缓存），与本 Sprint 无关。建议删掉，并加进 `.gitignore`。

**m8 `/showcase/copy` 的 `?lang=` 不生效。** 页面注释（`repos/orbits/app/showcase/copy/page.tsx:9`）说按「?lang= / cookie / browser」，但 `proxy.ts:170` 的 matcher 只覆盖 `/app`、`/api`。实测 `?lang=en` + cookie zh 仍渲染 zh。展示页只给开发看，影响很小。改注释，或在页面里直接读 `searchParams.lang` 即可。

**m9 截图证据不完整。**
- 没有截图对照页（SC-07 主证据、规则 5；R01 有 `compare.html`），产品负责人只能逐张翻目录。
- `app-shell-*-2x.png` 里根错误页的「再試行」按钮被夹具里的底栏盖住，这张图证明不了「无截断」。
- 建议：生成一个三语并排的 `compare.html`（App 壳 1× / 2× 各一行、Web 展示页 375 / 1440 各一行）；壳的截图夹具让错误页单独成屏，或者加底部留白。

## 全量测试与基线对照

复核人在 `redesign` HEAD `a3914f311` 上重跑（Node v26.10.0；orbits 带 `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8`；跑之前先删了 `.next/types`）。两端全量没有同时跑：App 跑完后才开始 Web。

| 项目 | 基线 `ac07300af` | REPORT 收口 | 复核实测 | 对照 |
| --- | --- | --- | --- | --- |
| App `npm test` | 4097 条，1 失败 | 4111 条，4 失败（1 已知 + 2 已修后重跑通过 + 1 偶发） | **4111 条，4110 通过，1 失败，0 取消** | 唯一失败是 `route-parity`「native app has a route for every web app surface」（`/start`，已知）。零新增；REPORT 提到的 `tasks-unification` 偶发这次没有出现 |
| App `tsc --noEmit` | 0 | 0 | **EXIT 0** | 一致 |
| orbits `npm test` | 6845 条，5 失败 | 6863 条，5 失败，872 跳过 | **6863 条，5986 通过，5 失败，872 跳过** | 5 条都是 DEP0205：canonical membership operator、operator script import、relationship-lifecycle offline preflight ×2、fixture CLI，与基线逐条对上。零新增 |
| orbits `typecheck` | 0 | 0 | **EXIT 0** | 一致 |
| orbits `typecheck:app` | 0 | 0 | **EXIT 0** | 一致 |
| orbits `lint` | 0 | 0 | **EXIT 0** | 一致 |
| `npm run copy:qa` | — | 0 | **161 条，0 问题** | 但 App 的 43 条没有执行长度和语气检查（M1） |

## 复核过程说明

- 字典拆分的比对脚本、基线源码导出（`git archive ac07300af`）、扫描比对脚本、Playwright 脚本和全量日志都在复核会话的 scratchpad 里（`r03/`），没有入库。
- 注入共 14 次（App 7 次、Web 7 次），都在工作区临时修改，跑单个测试或 typecheck 后立即还原。还原后 `git status` 只剩复核开始前就有的用户未提交文件。
- 没有连 Neon，没有部署，没有调用付费 AI；没有启动模拟器或 Metro。`bridge/*`、`docs/designs/Orbit_0918/`、`repos/orbits/docs/development/web-2026-09-17/*`、`repos/orbits/docs/operations/2026-09-25-neon-egress-audit.md`、`.claude/launch.json` 都没有动。复核唯一的产出是本文件。
- 3000 端口的 dev server 是本机已在运行的那个，复核人没有启动、也没有停止它；只发了 GET 请求，没有登录，没有写数据。

## 处理记录（执行人，2026-10-10）

修在 `redesign` 上（RD-25），代码提交 `0373249a6`。

| 问题 | 修法 | 状态 |
| --- | --- | --- |
| **M1** copy-qa 不带 App 组件类型 | App 新增 `src/i18n/copy-kinds.ts`（模式 → 类型），`sources.mjs` 按它给每个键定类型；范围内的键没有类型时新增的 `kind` 规则报问题。补上后立刻查出 6 条：3 个返回目标名改登记为 `label`（返回栏放不下时本来就退回「戻る」），3 个英文全宽按钮缩短（Keep and sign out / Discard and sign out / Use this account）。现在 161 条 0 问题，且长度、语气两类真的执行 | 已修 |
| **M2** Web 导航壳未处理 | 登记为已知例外（REPORT「已知例外」）：旧顶栏和悬浮球在 R07 整体删除重建（RD-19），新壳读 `shared/copy`；落地页随其负责 Sprint | 登记，R07 关闭 |
| **M3** 骨架只在中文下测过 | 新增 `tests/skeleton-japanese.test.tsx`（加载前清掉 legacy 测试语言）：无 Provider 时底栏是日文；返回栏 1× 显示「設定」、2× 字号显示「戻る」；Provider 上层的语言链路（发布前为日语、发布英文后根错误页和翻译跟着变） | 已修 |
| **M4** 术语表缺依据 | 术语表 4.1：24 条补上依据（风格指南条款或 research.md 里存证过的产品），含义与写法不变；REPORT SC-01 改为「复核后补齐」 | 已修 |
| m1 Web 接缝读环境变量 | `defaultOrbitLanguage()` 在 `NODE_ENV=production` 时一律日语，忽略接缝；加测试 | 已修 |
| m2 首渲染前的语言 | `OrbitLocaleProvider` 在创建时就发布设备语言（`useState` 初始化），之后每次渲染照旧同步 | 已修 |
| m3 Web 门禁范围 | 新增测试：`app/showcase/**`、根 layout、落地页、`orbit-2026/**` 写死文字和缺日文必须为 0 | 已修 |
| m4 门禁绕过 | 两端扫描都把半角片假名算进去；新代码（上一条的范围）里 `ja` 与 `en` 相同（3 个以上拉丁字母、非产品名）报错 | 已修 |
| m5 copy-qa 与文档对不上 | 实现「确认框标题是问句」（类型 `confirmTitle`）；新增 `scripts/copy-qa/README.md` 写明规则与依据；单测补 13 个子规则样本 | 已修 |
| m6 拆分哈希测试的维护 | 写进 REPORT 交接 | 已修（文档） |
| m7 构建缓存入库 | `git rm --cached tsconfig.build.tsbuildinfo`，`.gitignore` 加 `*.tsbuildinfo` | 已修 |
| m8 `/showcase/copy?lang=` 不生效 | 页面自己读 `searchParams.lang`（中间件只覆盖 `/app`、`/api`） | 已修 |
| m9 没有对照页 / 错误页按钮被盖住 | 证据目录新增 `compare.html` / `compare.png`（三语并排，App 1× / 2×、Web 375 / 1440）；壳截图的演示排版改为错误页与底栏分开 | 已修 |

### 修复后全量（`0373249a6`）

| 项目 | 结果 |
| --- | --- |
| App `npm test` | 4114 条，4112 通过，2 失败：已知 `route-parity`；`ink-signal-card-review`「narrow-large」负载偶发（单独重跑 2 次 31/31 通过） |
| App `tsc` | EXIT 0 |
| orbits `npm test` | 6866 条，5989 通过，5 失败（DEP0205 ×5，基线），872 跳过 |
| orbits `typecheck` / `typecheck:app` / `lint` | 0 / 0 / 0 |
| `npm run copy:qa` | 161 条，0 问题（长度、语气已对 App 文案执行） |
| detect-changes | 16 个文件、5 个符号，受影响流程 2 |
