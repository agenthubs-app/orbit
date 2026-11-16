# Sprint R40 — 可约时间：契约、存储、接口、共用计算

**Plan revision:** 2（吸收 Codex review 10、11）。**模式:** existing-codebase / single-generator。**档位:** L（新增独立契约与纯函数，不改既有行为；默认值 = 现状）。
**依据:** [DESIGN.md](../DESIGN.md) D4、D5；设计稿 ④⑤。
**单一目标:** 每个用户有一份「可约时间」，能读写；两端都能用同一组纯函数判断格子可约、预选最近 3 个空档、把候选时间写成三语正文。
**进入条件:** 无（可在 R39 前或后执行，本计划按 R39 之后排）。

## 上下文包

必读文件：
- `repos/orbits/app/(app)/app/orbit-2026/calendar/meeting-availability.ts` — `seedAvailableMeetingCandidates`（约 :34，写死工作日、9:00–17:00 起点、30 分步进、60 分、提前 15 分钟、每天最多 1 个、14 天内 3 个）、`createMeetingAvailabilityCheck`、`MeetingAvailability` 类型。新纯函数要能复现这套默认结果。
- `repos/orbits/app/(app)/app/orbit-2026/calendar/MeetingProposalModal.tsx` 约 :109–117 — 网格写死 5 天 × 18 个半小时、到 18:00。
- `repos/orbits/app/(app)/app/orbit-2026/calendar/meeting-proposal-client.ts` — `prepareMeetingProposal`（3–5 个、15–480 分、至少提前 15 分钟）。
- `repos/orbit-app/src/screens/calendar/meeting-proposal-flow.ts` :16 `seedMeetingCandidates`、`validateMeetingCandidates`（App 的另一套写死规则，R42 会改用新函数）。
- `repos/orbits/features/agent/preferences.ts` + `app/api/agent/preferences/route-handler.ts` — LiveRecordStore 按 actor 存一份偏好的现成写法（集合 `agentPreferences`，含 `quietHours`、`timeZone`）；照它新建集合，**不要**塞进 agentPreferences。
- `repos/orbits/features/tasks/local-date-time.ts` — `localParts`、`resolveLocalDateTime`、`calendarDate`、`validTimeZone`（时区换算一律用它们）。
- 契约新增步骤：`docs/designs/redesign-2026-10/sprints/HOW-TO-START-A-FEATURE-SPRINT.md` §3 第 5 条（contract/api-schema、请求体 `.strict()`、响应 tolerant、`contract-snapshot`、App sync）。

易错边界：
1. **默认值必须等于现状**：没存过设置的用户，`seedMeetingSlots(默认)` 与现有 `seedAvailableMeetingCandidates` 对同一输入结果一致（写对照测试）。
2. 时区：契约字段 `timeZoneMode: "device" | "fixed"` + `timeZone`（fixed 时必填、`validTimeZone` 校验）。默认 `device`。**所有计算函数都显式接收客户端解析好的有效时区**（device 模式由客户端用 `Intl` 取），服务端不猜时区。跨夏令时与 `Asia/Tokyo`、`America/New_York` 各测一例。
2b. 忙闲完整性：计算函数的忙碌输入沿用 `MeetingAvailability`（含 `complete`）；网格每格状态 = `allowed | busy | off | unknown`，读取不完整时非 off 的格子为 `unknown`（可手选、带提示），**自动预选只用确认空闲（complete 且不忙）的格子**；外部日历未连接（只看 Orbit 日程，视为完整）与读取失败（不完整）分别测试。
3. 校验：起 < 止；午休在起止之内且起 < 止；星期至少一天；时长 ∈ {30,60,90}；提前 ∈ {15m,1h,4h,1d,2d}；缓冲 ∈ {0,15,30}。非法 PUT → 400，不写入。
4. 正文格式化三语（ja/zh/en），包含日期（含星期）、起止、时长与形式；与设计稿 ③ 黄底段落一致（例：ja「・11/18（火）10:00–10:30」）；同一函数提供「替换已插入段落」所需的起止标记或可识别结构，重选时不动用户手改的其他内容。
5. 读失败（接口 5xx/离线）时调用方用默认值，不阻断提议。

## 范围与文件

- 新建：`repos/orbits/shared/contract/scheduling-availability.ts`、`shared/api-schema/scheduling-availability.ts`、`shared/compute/meeting-slots.ts`（`isSlotAllowed`、`availabilityGrid`、`seedMeetingSlots`、`formatMeetingSlotsText`、`replaceMeetingSlotsText`、`DEFAULT_SCHEDULING_AVAILABILITY`）、`features/scheduling/availability-store.ts`、`app/api/scheduling/availability/route.ts`（GET/PUT，需登录，`Cache-Control: private, no-store`）、对应测试；App 侧只由 `npm run sync:contract` 生成副本，并在 `src/api/endpoints.ts` 加路径函数。
- 修改：`shared/contract/index.ts` 导出；契约快照。
- 排除：任何 UI（R41/R42）；不改 `meeting-availability.ts` / App flow 的调用（UI Sprint 切换）。

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-R40-01 | 未设置用户 `GET` → 默认值（周一至五、09:00–18:00、无午休、60、提前 15 分钟、缓冲 0、`timeZoneMode:"device"`）；`PUT` 合法值后 `GET` 读回；非法值 400 不写；未登录 401；他人数据读不到。 | 路由测试（mock store + live store 各一） |
| SC-R40-02 | `seedMeetingSlots(默认, now, busy)` 与现有 `seedAvailableMeetingCandidates` 对照一致；设了 10:00–18:00、午休 12–13、提前 1 天、缓冲 15 后结果按规则避开（紧挨忙碌的格子被排除）。 | 单测 |
| SC-R40-03 | `availabilityGrid` 给出网格行（起止按设置）与每格 allowed/busy/off/unknown；读取不完整时预选为空、格子 unknown；两种时区、夏令时各一例。 | 单测 |
| SC-R40-04 | `formatMeetingSlotsText` 三语输出符合设计稿；`replaceMeetingSlotsText` 替换已插入段落且保留其余手改内容；正文里没有已插入段落时追加在合适位置。 | 单测 |
| SC-R40-05 | App sync 后 `contract-sync`、`contract-fixtures-parse` 通过；orbits `tsc -p tsconfig.build.json` 无错。 | 命令输出 |

## 执行顺序

1. 基线；2. 先写纯函数测试（SC-02～04）再实现；3. 契约、存储、路由（SC-01）；4. 同步 App、类型检查（SC-05）；5. 路径限定提交，写 `R40/REPORT.md`。

## 最小测试与检查

定向：新测试文件、`tests/contracts/*`、`tests/api/redesign-contract-routes.test.ts`（若按 redesign-contract 方式接）、App `contract-sync`/`contract-fixtures-parse`。不跑全量。
