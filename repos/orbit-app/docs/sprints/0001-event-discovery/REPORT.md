# Sprint 0001 — 活动筛选执行总结

## 运行记录

- 目标／原需求：R-09 活动发现筛选收尾；承接暂停点四文件，不重新实现。
- 结果：completed；五项 SC 均有证据。此结果只覆盖本 Sprint，不关闭 R-09 的时区、首页或后续原生要求。
- run：run-01；唯一 Generator `/root`；2026-09-14 00:03:40～00:19 JST。
- Planner revision：1；SHA256：`e81528e71ff7162a7abd43e599d25dc806613575a50ae25241a340067e0d9b93`。
- 基线 HEAD：`62bbe0af12475953e53c1d91a10b69d93ca8db56`；承接四文件 56 行增加／8 行删除，运行期间未再修改产品代码。
- 被验收的功能 HEAD：`bc6a6c1ed8e8946668d16a6923741569577b56ef`，`chat-agent`，已本地提交，未推送。
- 环境：原登录账号、原本地 API／Metro；iPhone 17 Pro Simulator，iOS 26.4。没有切换账号、重启服务或创建活动。

## 改了什么与 commit 对应

以下四文件均在功能提交 `bc6a6c1ed8e8946668d16a6923741569577b56ef`（`fix(sprint-0001): preserve all event discovery filters`）中。

| 功能／原因 | 实际文件 | 验证的 SC |
| --- | --- | --- |
| 地点和话题菜单保留全部选项，取消前八项截断 | `src/screens/events/EventsScreen.tsx` | 01、03、04 |
| 共享发现话题保留全部选项，单活动话题不截为三项；继续去重和去空白 | `src/view-models/events.ts` | 02、05 |
| 增加17项地点／话题菜单、后页记录导航、第4标签搜索及筛选的真实路由交互 | `tests/ink-signal-events.test.ts` | 01、02、03 |
| 完整话题转换断言，覆盖原先被截掉的标签 | `tests/screen-state.test.ts` | 02、05 |

## 验收结果

本节证据目录均相对于 App：`build/harness-state/evidence/sprint-0001/run-01/`。

| SC | 结果 | 证据及覆盖范围 |
| --- | --- | --- |
| SC-0001-01 | pass | 两个完整测试文件106/106；地点和话题各有17个可点击选项，第9／17项正确筛选，导航保留夹具记录的原始 ID `discovery:16`。实际 `/events` 路由经 RNW 渲染，只在 HTTP 边界使用受控数据。 |
| SC-0001-02 | pass | 同次106/106；第4标签可搜索、可选择，重复标签只呈现一次，空白不成为选项；共享转换断言保留全部话题。 |
| SC-0001-03 | pass | 同次完整相关文件中的8→16→全部／收起、筛选重置、组合搜索和计数用例通过；新增用例清空后恢复17条结果、首屏8条，未产生写请求。 |
| SC-0001-04 | pass | `api/public-summary.json`：00:08 JST，`GET /api/events/public` 200，13条／13个唯一ID、4个地点。Simulator 默认即将开始1条，选全部时间后13条／首批8条，上海筛出3条，清空地点恢复13条。证据为 `screenshots/events-ax.json`、`all-events-ax.json`、`shanghai-ax.json`、`all-events-stable.png` 和 `shanghai.png`。 |
| SC-0001-05 | pass | H档全量2577/2577、类型exit 0；四文件差异与功能提交一致。提交前已执行 scoped staged `gitnexus_detect_changes` 并检查范围，没有混入其他 Sprint 或 Web 文件。 |

公开集合是服务端当前配置工作区内的公开活动集合；本次13条不证明跨租户全平台覆盖。真实样本只有4个地点，接口记录没有话题标签，界面沿用既有标题推断。第9／17项和第4标签边界由受控路由测试证明，不声称 Simulator 覆盖了不存在的样本。

原生观察窗口为00:06:36～00:13:36 JST，`api/native-http.json` 中 `nonGetCount = 0`。没有点击报名／推荐写操作；此记录证明本次请求范围，不概括其他 GET 必然无副作用。

## 最小验证与失败记录

| 命令／场景 | 版本／时间 | 结果 | 证据 |
| --- | --- | --- | --- |
| `node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/ink-signal-events.test.ts tests/screen-state.test.ts` | 00:04～00:05 JST，四文件与功能 HEAD 相同 | exit 0，106/106，37.229秒，0失败／取消／跳过 | `commands/targeted.log` |
| `npm run typecheck` | 同版本，00:04 JST | exit 0 | `commands/typecheck.log` |
| `npm test` | 同版本，00:05～00:08 JST | exit 0，2577/2577，166.287秒，0失败／取消／跳过 | `commands/full.log` |
| Simulator 活动页只读冒烟 | 同版本，00:06～00:14 JST | 1→13、地点3→清空13；稳定截图复核 | `screenshots/`、`api/` |
| `git diff --check`、四文件暂存范围及 `gitnexus_detect_changes` | 提交前，00:12～00:13 JST | 通过；功能提交仅四文件56+/8- | Git提交及本轮工具记录 |
| `git diff --exit-code bc6a6c1ed -- src/screens/events/EventsScreen.tsx src/view-models/events.ts tests/ink-signal-events.test.ts tests/screen-state.test.ts` | 报告前，00:19 JST | exit 0；没有以旧版本结果覆盖新修改 | 本轮命令记录 |

承接的 TDD 历史保留在 `/tmp/orbit-r09-discovery-{baseline,red,green,green-final,types}-20260913.log`：基线103/103，修改前5项预期RED；首次GREEN 3/5，两项测试漏了重新展开筛选菜单，修正后5/5。本 run 不丢弃已完成的 RED 或重新实现代码，相关文件和全量没有新增失败。原生自动化首次短点击未打开时间菜单，按实际按钮位置和触摸时长重新操作后打开；未据此宣称产品故障已修复。

`eventTopics` 的 upstream impact 为 CRITICAL：两个直接转换函数、间接30符号／5模块；启动前已告知并采用 H 档完整回归。其他三个待改符号为 LOW。提交范围检查不降低共享转换原有风险级别。

没有重复同步测试：本次 `npm test` 已包含 contract-sync、api-schema-sync、domain-sync，且没有修改契约。没有跑 AI/OCR、报名写入、全平台视觉、真实相机／推送、Android 或 VoiceOver；它们不属于本 Sprint 的 SC，仍由后续计划保留。

## 交接

- App 版本为上述功能 HEAD；API 源码树为 `b1bcc6df622c9122b7a1a435aca3cbe8963d3865`（`HEAD:repos/orbits`），运行观察的 API PID 为31574。源码树标识不等于部署版本，本次未发布。
- 另一端影响：没有 Web/API、共享契约或根 Bridge 修改。活动标签不再被 App 截断；跨工作区公开集合的产品范围仍需服务端确认。供 Bridge 协调者引用本报告，本轮不越权更新根台账。
- 本 Sprint 四个产品文件已提交，无残余产品差异。规则、19份 Planner、登记表和本报告由协调者单独提交；0002 的三个文档由其唯一 Generator 持有。既有设计图片、prototype、`.gitnexus` 等非本轮文件未纳入提交。
- 测试句柄3505、35211、51569均已正常结束。原 App／API／Metro 服务保留，不因本 Sprint 完成停止它们；后续使用前重新确认状态。0001 的 Simulator 文件锁释放。
- 费用：本 Sprint 0次新增AI/OCR请求、0新增预留；原累计上限$5和已记录$0.012780／5次供应商请求不重置。下次付费场景前仍须核对原账本。
- 回退：若需要撤销，可经授权对功能 SHA 做定向 revert；本轮未执行回退、merge、push或部署。
- 下一步：完成0002就绪交接，依赖齐全才领取后续 Sprint；0009处理账号时区，不把当前本地时间显示当成IANA时区契约已完成。
