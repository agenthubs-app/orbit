# Sprint R36b — 计划 v3：初稿页 App

## 要实现什么

App 的「初版」画面按定稿设计（`plan-draft-v5-proposal.html` v16 的「手机」视图 · 「初稿 · 确认」页）重做，内容与 Web（R36a）相同：结论区、路线 + 完成标志、按阶段分组的可调人物类型表（删 / 人数 / 分量，合计 100 才能确定）、依据区。初稿页上的调整不占「手动编辑 1 次」（D-1），确定时用 R36a 加的「带调整确定」接口（契约经 `sync:contract` 同步）。`schemaVersion` 不是 3 的旧草稿仍显示旧画面。手动编辑把类型挪到别的阶段时同步改 `stepKey`（R35 交接）。

## 做完能看到什么

- 模拟器（iPhone 16e，日文）连 mock 服务器三份设计稿示例 fixture，`/plans/flow/<intakeId>` 浅色画面与原型「手机」视图逐像素一致（只有数据文字不同）。
- 删一类 / 改人数 / 改分量后合计实时变化，≠100 时「确定」禁用并显示差多少；确定后计划按调整内容建立，`manualEditUsed` 仍为 false。
- v2 旧草稿仍是 R23 的 PlanDraftCard 画面。

## 怎么验收

像素门禁：三种目标 × 模拟器浅色（原型无深色：深色按 token 实现只截图留档，不进门禁）；超阈值带全部 `[data]` / `[raster]` / `[contrast]`。App 测试：画面渲染 / 调整与合计 / 确定请求体 / v2 退回；App typecheck。不涉及真实 AI、生产、TestFlight。

完整验收项和启动条件见 [PLANNER.md](PLANNER.md)。本页说明预期目标，不代表已实现；整体设计见 [plan-v3/DESIGN.md](../plan-v3/DESIGN.md)。
