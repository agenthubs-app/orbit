# Sprint R40 — REPORT（2026-11-17）

## 结果

SC-R40-01～05 全部通过，实现提交 `39d56b1e3`（19 个文件：契约、api-schema、`shared/compute/meeting-slots.ts`、`compute-text` 新增时区工具、`features/scheduling/availability-store.ts`、`app/api/scheduling/availability/{route,route-handler}.ts`、`tests/scheduling/*`、App 同步副本、`schedulingAvailabilityPath()`、契约快照）。协调者复跑 `tests/scheduling/*.test.ts` 13/13（orbit_test，0 跳过）。

## SC 表

| SC | 结果 | 证据 |
| --- | --- | --- |
| 01 | 通过 | `tests/scheduling/availability-routes.test.ts`，内存与 PostgreSQL 各一遍：默认值、合法 PUT 读回（weekdays 按周一→周日）、17 种非法体 400 且不写、他人读默认、未登录 401、`private, no-store`、store null → 503、存储抛错 → 500 不泄露；live 只一行且 `record_id = user_id = actor`。 |
| 02 | 通过 | `tests/scheduling/meeting-slots.test.ts`：默认设置下 `seedMeetingSlots` 与 `seedAvailableMeetingCandidates` 对 5 组夹具 + 4 时区 × 24 时刻（跨周末、跨美国夏令时）共 96 例一致；自定义（10–18、午休 12–13、提前 1 天、缓冲 15）按规则避开。 |
| 03 | 通过 | Tokyo 16 行逐格断言；未连外部日历（视为完整）预选 3 个；读取失败预选为空、未知格 unknown；New York 夏令时前后、不存在/重复时刻为 off。 |
| 04 | 通过 | 三语全文断言；`replaceMeetingSlotsText` 插入/替换/删除/无结尾问候追加/签名与 `$&` 原样。 |
| 05 | 通过 | App sync 后 contract-sync、contract-fixtures-parse、compute-sync、endpoints、contract-tolerant-reading 46/46；orbits `tsc -p tsconfig.build.json` 0 错；快照一致；schema parity 2/2。 |

## 基线对照

orbits：改前 56（52 过、0 失败、4 无库跳过）→ 改后含新测 75/75。App：11/11（+34/34）→ 46/46。零新增失败。

协调者补充：R40 报告指出 App 全仓 `tsc` 有 `relationship-pages.ts(105)` 错误。经与 R39 之前的版本对照，**这是 R39 引入的**（App 开了 `exactOptionalPropertyTypes`，契约 `appointmentId?: string | null` 与 schema 推断不符）。协调者已修：契约改为 `appointmentId?: string | null | undefined`，同步 App、更新快照，见提交 `fix(contact-reach R39): appointmentId optional type…`。App `tsc` 只剩改前即有的 `tests/ios-scene-lifecycle-config.test.ts(47)`（及引用 orbits 测试支持文件的若干既有错误）。

## GitNexus

`ORBIT_API_ENDPOINTS` impact UNKNOWN（3 个同名候选）：只加新键，文本搜索确认按键读取。`compute-text.ts` 只追加 `isValidTimeZone`、`zonedWallClock`。detect-changes low、0 流程。快照里 `reminderMinutes` 字面量联合显示顺序变化，集合不变。

## 假设（可撤回）

- A1 PUT 起止与午休只接受整点/半点，结束最晚 23:30；读取宽松。
- A2 PUT 整份替换；device 模式下 `timeZone` 可为 null 或保留上次固定时区。
- **A3（与 PLANNER 字面不同，协调者接受）**：读取不完整时 allowed 降为 unknown，但已读到的忙碌仍为 busy（与现有 `createMeetingAvailabilityCheck` 一致）。
- A4 预选沿用旧规则：从明天起每天最多 1 个、看 14 天、凑不满 3 个返回 []、只在读取完整且窗口 ≤15 天时预选；「提前」严格大于 now+提前量，1d/2d 按 24/48 小时。
- A5 缓冲前后都留。
- A6 夏令时不存在/重复的本地时刻为 off，不预选。
- A7 正文不放隐藏标记；靠上次插入原文或段落形状（首行模板 + 「・」/「- 」行）找回；找不到则插在结尾问候前或追加末尾；正文不写时区名。
- A8 非生产无数据库时退回内存 store（同 agentPreferences）；生产无库 503。

## 未完成

无。新集合在现有 `orbit_records` 表，不需要迁移。

## 交接（R41 / R42）

- 接口 `GET/PUT /api/scheduling/availability`（登录，信封 `{success,data}`）：200 `SchedulingAvailabilityContract`；400 `VALIDATION_ERROR`（`context.field`）；401；503（`SCHEDULING_AVAILABILITY_UNCONFIGURED`）；500。**读失败用 `DEFAULT_SCHEDULING_AVAILABILITY`，不挡提议。**
- App：`schedulingAvailabilityPath()` / `ORBIT_API_ENDPOINTS.schedulingAvailability`；schema `src/api/schema/scheduling-availability.ts`；计算 `src/api/compute/meeting-slots.ts`。Web：`shared/api-schema/scheduling-availability.ts` 读 `schedulingAvailabilitySchema`、写 `schedulingAvailabilityUpdateInputSchema`；选项常量 `SCHEDULING_WEEKDAYS / SCHEDULING_DURATIONS / SCHEDULING_MINIMUM_NOTICES / SCHEDULING_BUFFERS`。
- 类型：

```ts
type SchedulingWeekday = "mon"|"tue"|"wed"|"thu"|"fri"|"sat"|"sun";
type SchedulingDurationMinutes = 30|60|90;
type SchedulingMinimumNotice = "15m"|"1h"|"4h"|"1d"|"2d";
type SchedulingBufferMinutes = 0|15|30;
type SchedulingTimeZoneMode = "device"|"fixed";
interface SchedulingTimeRange { start: string; end: string }
interface SchedulingAvailabilitySettings { weekdays: SchedulingWeekday[]; start: string; end: string; lunch: SchedulingTimeRange|null; durationMinutes: SchedulingDurationMinutes; minimumNotice: SchedulingMinimumNotice; bufferMinutes: SchedulingBufferMinutes; timeZoneMode: SchedulingTimeZoneMode; timeZone: string|null }
interface SchedulingAvailabilityContract extends SchedulingAvailabilitySettings { updatedAt: string|null }
type SchedulingAvailabilityUpdateInput = SchedulingAvailabilitySettings; // PUT 体，strict
```

- 默认：`{ weekdays:["mon","tue","wed","thu","fri"], start:"09:00", end:"18:00", lunch:null, durationMinutes:60, minimumNotice:"15m", bufferMinutes:0, timeZoneMode:"device", timeZone:null }`；从未保存时 `updatedAt:null`。
- 有效时区由调用方算：`fixed && timeZone ? timeZone : Intl.DateTimeFormat().resolvedOptions().timeZone`。
- `meeting-slots.ts` 导出：

```ts
interface MeetingSlot { startsAt: string; endsAt: string }
interface MeetingBusyAvailability { from: string; to: string; complete: boolean; items: readonly { startsAt: string; endsAt?: string; allDay?: boolean; timeZone?: string }[] }
type MeetingSlotState = "allowed"|"busy"|"off"|"unknown";
interface MeetingSlotCell { time: string; startsAt: string|null; endsAt: string|null; state: MeetingSlotState }
interface MeetingSlotGridDay { date: string; weekday: SchedulingWeekday; cells: MeetingSlotCell[] }
interface MeetingSlotGrid { rows: string[]; days: MeetingSlotGridDay[] }
type MeetingSlotLanguage = "ja"|"zh"|"en";
type MeetingSlotMedium = "in_person"|"video"|"phone";
const DEFAULT_SCHEDULING_AVAILABILITY: SchedulingAvailabilitySettings;
function minimumNoticeMinutes(notice: SchedulingMinimumNotice): number;
function addLocalDays(date: string, offset: number): string | null;
function localWeekday(date: string): SchedulingWeekday | null;
function localDateOf(now: number, timeZone: string): string | null;
function isSlotAllowed(settings, slot: MeetingSlot, input: { timeZone: string; now: number }): boolean;
function availabilityGrid(settings, input: { timeZone: string; now: number; days: readonly string[]; availability: MeetingBusyAvailability | null; durationMinutes?: number }): MeetingSlotGrid;
function seedMeetingSlots(settings, input: { timeZone: string; now: number; availability: MeetingBusyAvailability; count?: number; horizonDays?: number; durationMinutes?: number }): MeetingSlot[];
function formatMeetingSlotsText(slots: readonly MeetingSlot[], input: { language: MeetingSlotLanguage; timeZone: string; durationMinutes: number; medium?: MeetingSlotMedium | null }): string;
function replaceMeetingSlotsText(body: string, block: string, options?: { previous?: string | null }): string;
```

- 用法：网格行 = 设置的起止每 30 分钟；`days` 由调用方给；unknown 可手选（带提示），busy/off 不可选；重叠与最多 5 个由调用方检查。重选：保存上次 block，`replaceMeetingSlotsText(body, newBlock, { previous: lastBlock })`；空 block = 删除该段。
- 正文样例（各 30 分钟；按真实日历出星期）：

```
以下の日時のいずれかで、30 分ほどお時間をいただけますでしょうか（オンライン）。
・11/18（水）10:00–10:30

以下时间您是否方便？想约您 30 分钟左右（面谈）。
・11/18（周三）10:00–10:30

Would any of these times work for a 30-minute phone call?
- Wed, Nov 18, 10:00–10:30
```

英文首行随形式：video「a 30-minute online meeting」、in_person「a 30-minute meeting in person」、无形式「a 30-minute meeting」。
