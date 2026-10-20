# R20b 独立 REVIEW

**结论：请求修正，Sprint 未收口。** 已按要求 fetch 并只读复核 `origin/redesign` 的 R20b 提交、PLANNER、REPORT、代码及所列测试对照；本地分支落后远端，未在旧检出上运行测试。REPORT 对 SC-01、05、08、10、11、13～16 的未闭项总体如实，但 SC-08 和 SC-16 有下述不准确说法。**S：未发现已证实项。**

## M

1. **设备端保留失效计划链接。** `repos/orbits/features/sync/read-service.ts:298` 直接投影原始 `planLink`；task 域水位只随 task 记录变化。计划失效后设备既不收到新版，也不会隐藏链接。SC-11 的 RED／SKIP 与代码吻合。请由 sync owner 补计划状态参与 manifest、cursor 重置及 page 投影的回归。
2. **补扫日志仍含可关联个人的 ID。** `repos/orbits/features/notes/service.ts:194–197` 在 enqueue 失败时记录 actor、contact、note ID；`tests/services/notes-service.test.ts:365–367` 只断言正文未泄露。请改为固定 stage／code，并测试所有 ID、正文和任意错误文均不入日志。
3. **Web “API 不可用时禁用”证据不足。** `repos/orbits/app/(app)/app/orbit-2026/task/TaskContainer.tsx:41–48,81` 仅看 `navigator.onLine`；浏览器在线而 API 中断时按钮仍可点。现有测试只切浏览器离线。请接入服务可达状态并补 API 中断测试。
4. **Web 宽进会让坏行破坏页面。** `repos/orbits/app/(app)/app/orbit-2026/memo/memo-model.ts:67–75` 只检查 `mentions` 是数组，`[null]` 会通过；`MemoWorkspace.tsx:21–22` 随后读取 `mention.start`。请逐行校验 token，跳过坏 note，补混合列表测试。
5. **越线自查结论不成立。** `c823cceaf` 改了 PLANNER §1 未列的 `repos/orbits/features/sync/read-service.ts:183,298` 和 `repos/orbit-app/src/view-models/tasks-mirror.ts:5`，而 REPORT:156 称实现全在许可路径。请主会话明确归属并修正交接记录。
6. **“自身新失败 0”尚不可采信。** REPORT:160–161 的最后一次全量仍为 Web **33 fail、3 个新增名**，App **14 fail、4 个新增名**。后续 Web 定向绿及 App 个别复现不能替代同版本全量逐名对照；SC-15 保持未过。

## m

- `repos/orbit-app/tests/memo-route-wiring.test.ts:5–18` 只检查导入文字，未实际打开四条旧 URL。请补含 `contactId` 的路由着陆测试；目前不能仅凭该测试证明 SC-12 无断链。

## 核实通过及边界

SC-02／03 的 BREAKING 登记、strict 离线 schema 副本和 `domain-registry.ts:207–225` 字段齐全；notes 写入有 actor 关联校验。SC-04、06、07、09、12 有新屏、兼容路由及定向测试证据；旧 `notes-source*`、`NoteSourceTasks` 保留。R20b 提交未触及组件库、token、OAuth `returnTo` 或公开字段。SC-05／08 的真实设备活动 token、SC-10 的真实 provider／账本、SC-11 的设备同步及 E 线联验、SC-13／14 像素门禁仍未通过。