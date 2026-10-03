# Sprint W0059 — 详情关闭回原页（L）

> revision 2（2026-10-03）：按 [REVIEW-2026-10-03.md](../REVIEW-2026-10-03.md) 修订（revision 1 SHA256 `782739ecee95005a6976145a4983b322a26535064b489ad7ab1bb6eb2a4627db`）：G-4 来路判定改为「一次性导航意图」并排除刷新／直达／陈旧记录；G-12 依赖改为 W0057 之后（同改 `[id]/page.tsx`）；G-15 来源标签最长前缀优先、滚动恢复断言 `scrollY`。

**Plan revision:** 2。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** RC-03（REQUIREMENTS 大目标 5）；D53（关闭行为）、D63。
**单一目标:** 联系人详情弹窗的四种关闭方式（×、底部关闭、Esc、点遮罩）统一为：有站内来路 → `router.back()`（浏览器原生恢复滚动）；无站内来路 → 合法的 `returnTo` 或 `/app/contacts`。示例弹窗（传了 `onClose`）行为不变。
**易读目标:** [GOAL.md](GOAL.md)。
**视觉依据:** 原型 <https://claude.ai/artifact/1xi35cdWj5hjv8oPZDbHcV> 画板①顶部：左上「‹ 返回 iOrbit」文字按钮（标签随来源变化），右上 ×。
**基线:** 编制时 `chat-agent` = `a7c96deb`。W0059 与 W0060 改同一个文件 `network-detail-modal.tsx`：**不得并行**；建议交给同一个 Generator 先 W0059 后 W0060，各自提交、各写 REPORT（RULES 1.1「合并小 Sprint 的执行」）。
**进入条件:** W0057 completed（rev 2 G-12：两者都改 `app/(app)/app/contacts/[id]/page.tsx`；执行顺序固定为 W0057 → W0058 → W0059 → W0060 → W0061）。不涉及付费 AI（上限 0，天然为 0）。

## 上下文包（Generator 从这里起步）

### 必读文件
- `app/(app)/app/contacts/network-0918/network-detail-modal.tsx`（386 行）：
  - :148 `NetworkDetailModal({ contact, closeHref, onFollow, extra, insight, onClose, dialogRef })`；
  - :155–158 `close = useCallback(() => { if (onClose) onClose(); else window.location.assign(closeHref); })`；
  - :159–164 `onCloseLink`：只有传了 `onClose` 才 `preventDefault`；
  - :181–198 Esc（输入框／textarea／contentEditable 内不关；示例拦截层开着时不关）与 :200–202 遮罩点击；
  - :234 右上 × `<a ref={closeRef} href={closeHref} onClick={onCloseLink}>`；:324 底部 `<a className="btn nw-detail-close" href={closeHref} onClick={onCloseLink}>`；
  - :335–386 `NetworkDemoDetailDialog`／`useNetworkDemoDetail(closeHref)`：示例期传 `onClose`，只收起弹窗、把焦点还给触发元素，不导航。
- `app/(app)/app/contacts/[id]/page.tsx`：:168（示例分支）、:280、:286 三处 `closeHref: "/app/contacts"` 写死；页面签名里的 `searchParams` 已有 `appointmentId`／`eventId`／memo 参数（加 `returnTo` 时照同样方式读取）。
- 入口（只核对，不必全改）：`iorbit-plan.tsx:766`、`iorbit-rich-components.tsx:429`／`:523`（`navigate()` 且 **未 encode**）、`today-plan-items.ts:75`、`home-facts-route-service.ts:858`、`network-model.ts:148`、`contact-card-view-model.ts:64`、`compose-app-contacts-from-previously-approved-mock-first-capabilities/contacts-route-view-model.ts:262`（**未 encode**，`contact.id.replace(/^contact:/, "")`）、`network-opportunities.tsx:230`（`preserveHref`）、`event-schedule-modal.tsx:98`（带 `?appointmentId=&eventId=`）。
- 列表与 memo 保存：`network-cards.tsx:38`、`network-all.tsx:28` 保存 memo 后 `window.location.reload()`（不新增历史条目，保持）。
- 测试：`tests/pages/app-network-detail-modal.test.tsx`、`tests/pages/app-network-demo-mode.test.tsx`、`tests/pages/contact-card-route.test.ts`。

### 关键符号
- `export function NetworkDetailModal(...)` —— 直接调用方 3（`NetworkAll`、`NetworkCards`、`NetworkDemoDetailDialog`），LOW。
- `export function useNetworkDemoDetail(closeHref: string)` —— 示例期管线／列表用。

### 易错边界（都对应到 SC）
1. **「有站内来路」的判定（rev 2 G-4）：**不能用「本标签页上一个路径」——`sessionStorage` 跨刷新保留，地址栏直达或刷新会读到陈旧路径。改为**一次性导航意图**：`app/(app)/app/layout.tsx` 挂的客户端组件在捕获阶段监听站内点击（`<a>` 指向 `/app/contacts/<id>`）并提供 `navigateToContact()` 给 `router.push` 类入口；离开前写 `{ from, to, at, nonce }`；详情挂载时**只在** `to` 与当前路径（含 query）精确相等、`at` 在 30 秒内、且 `performance.getEntriesByType('navigation')[0].type` 不是 `reload` 时消费（读后立即删除），否则视为无来路。读写都 try/catch，不可用时视为无来路（SC-01、SC-02）。
2. **四种关法同一函数：**×、底部关闭、Esc、遮罩全部调用同一个 `close()`；两个 `<a>` 保留 `href`（无 JS、中键新标签时仍可用），点击时 `preventDefault` 再走 `close()`（SC-01）。
3. **`returnTo` 防开放跳转：**只接受以单个 `/app/` 开头的相对路径；拒绝 `//`、`/\`、协议、`/app/contacts/<同一联系人>` 自身、超过 512 字符；不合法时忽略并回 `/app/contacts`（SC-02）。
4. **示例弹窗不导航：**传了 `onClose` 时一切照旧（只收起、焦点归还），不调用 back、不读来路记录器（SC-03）。
5. **Esc 例外不变：**输入框里按 Esc 不关闭；示例拦截层开着时不关闭——W0060 会加内联 memo 输入框，这条必须保持（SC-03）。
6. **「返回 {来源}」标签**按来路路径**最长前缀优先**映射（`/app/agent/plan` → 我的计划、`/app/agent` → iOrbit、`/app/contacts/dashboard` → 人脉分析、`/app/contacts` → 人脉、`/app/events` → 活动、其他 `/app/*` → 返回）；无来路时显示「返回人脉」并去 `/app/contacts`；中英双语（SC-01）。
7. **入口编码**：顺手把两处未 encode 的入口改为 `encodeURIComponent`（`iorbit-rich-components.tsx:429/:523`、`contacts-route-view-model.ts:262`），只改拼接，不改跳转目标（SC-04）。

## 范围与文件

- 修改：`network-detail-modal.tsx`（close、两个链接、返回按钮）、`[id]/page.tsx`（读 `returnTo` 并校验、传给弹窗）、`app/(app)/app/layout.tsx` 或其下的客户端外壳（挂来路记录器）、上面三处入口编码、对应测试。
- 新建：`app/(app)/app/contacts/network-0918/detail-return.ts`（纯函数：来路判定、`returnTo` 校验、标签映射）与其单测。
- 排除：详情布局改版（W0060）；入口统一加 `returnTo`（不需要：有站内来路即 back）；App 端。

## 验收契约

| SC | 操作链（可观察行为） | 主证据 |
| --- | --- | --- |
| SC-W0059-01 | **有来路回原页。**记录器有上一个 `/app/*` 路径时，×／底部关闭／Esc／遮罩四种操作都调用 `router.back()` 且不调用 `location.assign`；左上「返回 {来源}」标签正确并同样后退 | `app-network-detail-modal.test.tsx`（四种操作逐一断言）+ `detail-return` 单测 |
| SC-W0059-02 | **无来路回人脉。**直接打开、新标签页、刷新详情页、意图过期（>30 s）或目标不符、`sessionStorage` 抛错时四种关法都去 `/app/contacts`；带合法 `returnTo` 去 `returnTo`；非法 `returnTo`（`//evil.com`、`https:`、`/\x`、`/app/contacts/<自身>`、超长）被忽略 | 单测（表驱动）+ 页面测试 |
| SC-W0059-03 | **示例与 Esc 例外。**示例弹窗四种关法只收起、焦点归还、0 次导航；输入框内 Esc 不关；示例拦截层开着时 Esc 不关 | `app-network-demo-mode.test.tsx` + 组件测试 |
| SC-W0059-04 | **真实页面回原位。**从首页、我的计划、人脉列表（滚动后）、人脉分析、活动日程弹窗各点开一次再关：回到原页且滚动位置恢复（断言 `window.scrollY` 与离开前相差 ≤50px，截图只作辅证）；新标签直开回 `/app/contacts`；两处入口 id 含特殊字符时可正确打开 | 浏览器验证 1440／375 截图（证据目录）+ 入口单测 |

## 一次 Generator 的执行顺序

1. 登记 run-01、Planner SHA256、基线；impact `NetworkDetailModal`、`AppContactDetailPage`（GitNexus 名以实际为准）。
2. 纯函数 + 单测 → 弹窗接线 → 页面 `returnTo` → 记录器 → 入口编码；RED → GREEN。
3. 浏览器验证 → 路径限定提交 `sprint/W0059-detail-close-return` → REPORT → 协调者合并。

## 最小测试与检查

- **档位：L**（单组件与一处页面参数，边界清楚；若 impact 出现 HIGH/CRITICAL 或布局外壳影响面大于预期，升 H 并在 REPORT 说明）。
- 开发：`detail-return` 单测、`app-network-detail-modal.test.tsx`。
- 收口：`app-network-demo-mode.test.tsx`、`contact-card-route.test.ts`、首页与计划页入口相关测试（`grep -rl "/app/contacts/" tests/pages`）、`npx tsc --noEmit -p .`。默认不跑全量。

## 付费 AI 调用上限

0（本 Sprint 不涉及 AI）。

## 回滚

revert 本 Sprint 提交；记录器只写 `sessionStorage`，无持久数据。

## 风险

- 用户在详情里又点开另一位联系人（列表在弹窗背后可点）后关闭，会回到上一位联系人的详情——与浏览器后退一致，成熟产品（LinkedIn、Gmail 弹层）同样如此，接受。
- `router.back()` 回到整页加载的来源页时依赖浏览器 bfcache／滚动恢复；若来源页 `scrollRestoration` 被手动设成 manual，需在 REPORT 登记。

## Planner 定（对标）

| 编号 | 结论 | 对标做法 |
| --- | --- | --- |
| W59-1 | 来路用按标签页的 `sessionStorage` 记录器判定 | GitHub／Linear 的「Back」：只在同标签页有站内历史时后退，否则去列表 |
| W59-2 | `returnTo` 只收 `/app/` 相对路径 | OWASP 开放跳转防护：白名单相对路径 |
| W59-3 | 左上「返回 {来源}」按来源前缀命名 | Gmail／Notion 的「← 返回 收件箱」 |
