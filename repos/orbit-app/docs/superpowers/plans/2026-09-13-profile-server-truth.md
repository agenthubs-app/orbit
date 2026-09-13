# R-03：保留服务端资料原文实施计划

> **For agentic workers:** 使用 `superpowers:executing-plans` 在当前已批准目录逐步执行，不启动并行代理。此项是 R-03 的独立修复，不等于注册／OAuth／资料补全整项完成。

**Goal:** 资料预览与编辑器消费同一份服务端原文，任何账号 ID 都不触发虚构身份替换；账号入口使用真实登录名，缺名使用通用标签。

**Architecture:** 保留 HTTP client、契约校验、`profileToSummary`、保存及草稿保护。删除只服务于固定账号替换的 helper；资料卡直接使用已有 `storedProfile`。`mobileUserDisplayName` 只处理登录名去除首尾空白与显式 fallback。

**Tech Stack:** TypeScript、React Native、现有 RNW/Playwright 真路由边界测试、Node Test Runner、iOS Simulator。

**Spec:** [剩余功能计划 R-03](2026-09-13-app-remaining-functionality-and-connectivity.md)。09:31 已提出“保留现有布局、移除固定账号资料替换、保留服务端原文、真实登录名／通用占位、三语／空字段／草稿回归”的具体方案；12:32 用户明确授权自行继续，此处执行同一范围，不重复申请。

## 约束

- 仅编辑 App。没有 API、契约、数据库、账号或资料写入；不删除真实内容。
- 不改布局、资料必填规则或注册／OAuth 流程，不擅自决定 B1/D2。
- 中文、日文、英文姓名／公司／简介／列表都保留服务端值；账号登录名与个人公开资料名允许不同。
- 空资料仍为空，使用已有“未填写”等 UI 状态，不借用登录名伪装已补全。
- AI 侧栏缺名复用“账号”标签，不使用某位用户的名字。
- 先观察失败，再改生产代码；保留刷新、失败保存、切号和草稿保护的现有回归。
- 每个生产符号修改／删除前已做 upstream impact；测试文件未收录时明确记为 UNKNOWN，不当作零风险。
- 当前分支单独 commit，不推送；截图与测试日志不入库。

## 任务：移除固定身份替换

**Files:**

- 修改 `src/view-models/mobile-profile.ts`：只保留真实登录名归一化。
- 修改 `src/screens/profile/ProfileScreen.tsx`：去掉账号替换调用及只为该调用传递的 `authUser`。
- 修改 `src/screens/ai/AiScreen.tsx`：缺名标签改为“账号”。
- 修改 `tests/mobile-profile-view-model.test.ts`、`tests/account-session-view-model.test.ts`：替换旧身份特判预期，覆盖多语言、空白名、无会话、显式 fallback。
- 修改 `tests/ink-signal-profile.test.ts`、`tests/ink-signal-ai-home.test.ts`：在实际路由与客户端的 HTTP 边界注入资料／会话，检查屏幕与编辑值。
- 更新 `tests/profile-screen-source.test.ts`、`tests/ai-home-screen-copy.test.ts`：移除已被行为测试替代的 helper／具体假名字匹配，其余既有接线检查保留。
- 更新本计划及 `docs/verification/2026-09-13-app-connectivity.md`：记录红绿、运行验证及剩余范围。

**Interfaces:** `mobileUserDisplayName(user: MobileAuthUser | null | undefined, fallback = ""): string` 不变；`ProfileCard` 为文件内组件，移除不再使用的私有 `authUser` prop；不改变业务 DTO。

- [x] 运行现有七文件基线，确认没有未知失败。263/263，exit 0。
- [x] 写失败测试：固定旧 ID 的真实名字不能变成另一人；公开资料名不得被不同登录名覆盖；三种语言资料与空字段不被补成模板；编辑和刷新仍保护草稿。

```ts
assert.equal(mobileUserDisplayName({
  id: "user_mry5y200_58jpi8", name: "Alex Chen", email: "alex@example.test"
}), "Alex Chen");
// 真路由测试使用不同登录名；期望独立来自服务端 fixture 的 displayName。
assert.equal(await p.getByText("Alex Chen", { exact: true }).count(), 1);
await press(p, "编辑资料");
assert.equal(await p.getByRole("textbox", { name: "名字", exact: true }).inputValue(), "Alex Chen");
```

- [x] 执行相应新用例：21 项中 16 项按预期断言失败、5 项已有行为通过；没有加载／语法错误。
- [x] 最小修改：删除固定 ID、模板及 `hasChinese`／`preferredText`／`preferredList`／`profileSummaryForMobileUser`，保留真实登录名 helper：

```ts
export function mobileUserDisplayName(
  user: MobileAuthUser | null | undefined,
  fallback = ""
): string {
  return user?.name.trim() || fallback;
}
// ProfileCard:
const storedProfile = profileToSummary(data);
const displayProfile = storedProfile;
// AiScreen:
accountName={mobileUserDisplayName(auth.user, "账号")}
```

- [x] 运行七文件、全量测试、类型及同步检查；七文件 281/281、全量 2220/2220、同步 6/6，均 0 失败／取消／跳过、exit 0；类型检查 exit 0。新测试编写错误已诊断并修正，没有跳过用例。
- [x] Simulator 打开资料与账号页，核对真实 GET 和非写入展示；不提交个人内容，不声称完成跨端写回或新用户/OAuth 验收。资料页模板替换消失；账号页沿用登录会话，未导出会话原文作比对。
- [x] 自审差异和测试覆盖，确认生产改动只涉及三个 App 文件，不改保存、鉴权或服务端数据。

提交门槛：GitNexus staged detect_changes 通过后，仅提交本功能源码、测试和记录；实际提交以 Git 历史为准，不推送。

```sh
node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/mobile-profile-view-model.test.ts tests/account-session-view-model.test.ts tests/ink-signal-profile.test.ts tests/ink-signal-ai-home.test.ts tests/ink-signal-settings-account.test.ts tests/profile-screen-source.test.ts tests/ai-home-screen-copy.test.ts
npm run typecheck
npm test
git diff --check
```

## 审阅

覆盖已批准的原文、空字段、真实账号名和草稿要求；无新设计、依赖或共享类型。账号页面由既有 `accountSessionToView` 消费 helper，无须改其生产逻辑。三语指本项用户内容保真，不宣称全 App UI 已支持三语。

执行中修正了新测试的错误假设：现有编辑器没有公司／职位输入框，二者继续由实际预览验证；编辑器检查姓名、简介及提供／寻找字段，未借此增加未批准表单。第一次绿测的八个定位超时与一次元组类型错误保留日志，修正后新用例 21/21、七文件 281/281、类型检查通过。完整证据见[连通性记录第七节](../../verification/2026-09-13-app-connectivity.md)。
