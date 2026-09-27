# Sprint 0105 — 页面对齐例外

**Plan revision:** 1。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** 用户 2026-09-27 决定：`/admin/read-cost` 列为例外（网页管理页）；`/agent/plan`、`/agent/strategy` 列为例外，理由「不符合事务管家定位，内容以后拆进 App 首页和收件箱，不做原样移植；网页端暂不改」；`/profile/onboarding`、`/events/[id]/live` 补到 App（0106、0107）。
**单一目标:** `route-parity` 支持带原因的「只在网页上有」例外，失败列表只剩 0106/0107 要补的两项。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 0104 合并后的 `chat-agent`（开工时追加提交号）。已知失败：App 1（route-parity）+ 不稳定用例；orbits 见最近 REPORT。
**进入条件:** 0104 已合并。无外部授权需求。

## 已查明的事实（2026-09-27）

- `repos/orbit-app/tests/route-parity.test.ts`：网页根 `../orbits/app/(app)/app` 下的 `page.tsx`（去掉路由组与 `/page`），原生根 `app/` 下文件（去掉 `_layout`、`/index`）；第 80 行断言 `missingRoutes` 深等于 `[]`；单向（网页 ⊆ 原生）；**没有例外机制**。当前缺 5 项：`/admin/read-cost`、`/agent/plan`、`/agent/strategy`、`/events/[id]/live`、`/profile/onboarding`。
- 相邻的 `tests/app-wide-route-coverage.test.ts` 是另一种机制（显式双向清单 + README 表格），本 Sprint 不动它。

## 范围与文件

- 读取：上述两个测试文件。
- 修改：`repos/orbit-app/tests/route-parity.test.ts`。
- 新建：例外清单（放在测试同目录的小模块或测试文件内常量均可），每项 `{ route, reason, decidedAt: "2026-09-27", decidedBy: "user" }`。
- 排除：补任何页面；修改网页端；修改 `app-wide-route-coverage`。

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-0105-01 | 运行 route-parity，失败信息中的缺失列表恰好为 `/events/[id]/live`、`/profile/onboarding` | 测试输出 |
| SC-0105-02 | 例外项缺少原因、或例外指向的网页页面已不存在时，测试失败（「过期例外」必须被清理） | 自测用例 RED→GREEN |
| SC-0105-03 | 临时新增一个网页页面（测试夹具/临时目录模拟）且 App 无对应页面时，测试仍失败 | 自测用例 |
| SC-0105-04 | App 全量除 route-parity（仍缺 2 项，属预期）外无新增失败；App typecheck 通过 | 摘要 |

## 测试

- 档位 L（只改一个测试文件）。开发集：route-parity；收口：App 全量一次（确认没有其他测试依赖该文件的导出）。
- 不运行：orbits 全量（未改 orbits 代码）。

## 失败与交接

交接写明：0106、0107 完成后该测试应转绿；若届时仍有新缺口，按用户决定处理，不得临时加例外。报告列出例外清单全文。
