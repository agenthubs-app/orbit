/**
 * 可约时间（contact-reach D4，R40）。负责人：甲（R40）；使用方：Web R41（设置 › 日程、选时段、邮件插入时间）、
 * App R42（同上）。`GET/PUT /api/scheduling/availability`，按登录账号存一份。
 * 计算（格子可约、预选、三语正文）在 shared/compute/meeting-slots.ts，两端共用；默认值
 * `DEFAULT_SCHEDULING_AVAILABILITY` 也在那里（= 改造前写死的规则）。
 */

/** 星期，周一起。 */
export type SchedulingWeekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export type SchedulingDurationMinutes = 30 | 60 | 90;
/** 至少提前多久：15 分钟、1 小时、4 小时、1 天（24 小时）、2 天（48 小时）。 */
export type SchedulingMinimumNotice = "15m" | "1h" | "4h" | "1d" | "2d";
/** 会面前后各留出的分钟数。 */
export type SchedulingBufferMinutes = 0 | 15 | 30;
/** device = 跟随设备时区（客户端用 Intl 取）；fixed = 用 `timeZone`。 */
export type SchedulingTimeZoneMode = "device" | "fixed";

/** 本地时刻 "HH:mm"，只取整点或半点；start < end。 */
export interface SchedulingTimeRange {
  start: string;
  end: string;
}

export interface SchedulingAvailabilitySettings {
  /** 至少一天，不重复，按周一→周日排序。 */
  weekdays: SchedulingWeekday[];
  /** 一天里可约的开始与结束（"HH:mm"，整点或半点）。 */
  start: string;
  end: string;
  /** 可选午休一段，必须在 start–end 之内。 */
  lunch: SchedulingTimeRange | null;
  durationMinutes: SchedulingDurationMinutes;
  minimumNotice: SchedulingMinimumNotice;
  bufferMinutes: SchedulingBufferMinutes;
  timeZoneMode: SchedulingTimeZoneMode;
  /** fixed 时必填（IANA 时区）；device 时可为 null，也可保留上次选的固定时区。 */
  timeZone: string | null;
}

export interface SchedulingAvailabilityContract extends SchedulingAvailabilitySettings {
  /** 从未保存过为 null（此时其余字段是默认值）。 */
  updatedAt: string | null;
}

/** PUT 请求体：整份替换（最后写入为准）。 */
export type SchedulingAvailabilityUpdateInput = SchedulingAvailabilitySettings;
