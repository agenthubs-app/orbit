import type { TaskCategory } from "./contract";

export const XIAOYU_SEED_CONTACT_NAMES = [
  "林玫",
  "佐藤健司",
  "田中爱子",
  "普丽娅·拉奥",
  "索菲娅·马丁内斯",
  "奥马尔·拉赫曼",
  "森花",
  "陈立安",
  "艾玛·威尔逊",
  "小林大地",
  "诺拉·费舍尔",
  "拉菲尔·科斯塔",
] as const;

export interface XiaoyuSeedTask {
  key: string;
  title: string;
  notes: string;
  category: Exclude<TaskCategory, "other">;
  plannedDate: string;
  dueAt: string;
  priority: "normal" | "high";
  relatedContactName?: string;
}

export interface XiaoyuCompletedSeedTask extends XiaoyuSeedTask {
  completedAt: string;
}

export interface XiaoyuSeedScheduleItem {
  key: string;
  title: string;
  date: string;
  startsAt: string;
  endsAt: string;
  kind: "meeting" | "event" | "personal";
  location: string;
  relatedContactName?: string;
}

export interface XiaoyuThreeMonthSeed {
  fromDate: string;
  throughDate: string;
  openTasks: readonly XiaoyuSeedTask[];
  completedTasks: readonly XiaoyuCompletedSeedTask[];
  scheduleItems: readonly XiaoyuSeedScheduleItem[];
}

const eventThemes = [
  ["关西企业 AI 实践交流会", "大阪创新中心"],
  ["制造业 AI 降本增效闭门会", "梅田知识资本"],
  ["中日企业数字化合作沙龙", "京都研究园"],
  ["AI 创业者与产业伙伴晚餐会", "本町商务中心"],
  ["企业智能体落地案例分享会", "大阪商工会议所"],
] as const;

const customerWork = [
  ["佐藤健司", "整理视觉质检试点的现状问题与验收指标"],
  ["陈立安", "完善线索路由自动化方案和六周验证范围"],
  ["艾玛·威尔逊", "复盘酒店客户关系管理上线数据并提炼案例"],
  ["普丽娅·拉奥", "确认企业 AI 项目的交付边界与升级机制"],
] as const;

const relationshipWork = [
  ["林玫", "发送本月企业 AI 项目清单并请她反馈优先级"],
  ["田中爱子", "确认下一场创始人圆桌的嘉宾画像"],
  ["小林大地", "交流关西制造企业近期的数字化需求"],
  ["奥马尔·拉赫曼", "更新联合销售客户短名单和负责人"],
  ["森花", "请她审阅酒店运营 AI 工作坊的大纲"],
  ["索菲娅·马丁内斯", "分享日本市场验证清单并确认合作切入点"],
] as const;

function assertDateKey(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value) || !Number.isFinite(Date.parse(`${value}T12:00:00+09:00`))) {
    throw new Error("fromDate must use YYYY-MM-DD");
  }
}

function addDays(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function addMonths(dateKey: string, months: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const targetMonth = month - 1 + months;
  const targetYear = year + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();
  return new Date(Date.UTC(targetYear, normalizedMonth, Math.min(day, lastDay)))
    .toISOString()
    .slice(0, 10);
}

function weekday(dateKey: string): number {
  return new Date(`${dateKey}T12:00:00Z`).getUTCDay();
}

function instant(dateKey: string, time: string): string {
  return new Date(`${dateKey}T${time}:00+09:00`).toISOString();
}

function task(input: Omit<XiaoyuSeedTask, "dueAt" | "key"> & { time: string; key: string }): XiaoyuSeedTask {
  const { time, ...value } = input;
  return { ...value, dueAt: instant(input.plannedDate, time) };
}

function schedule(input: Omit<XiaoyuSeedScheduleItem, "startsAt" | "endsAt" | "key"> & {
  durationMinutes: number;
  key: string;
  time: string;
}): XiaoyuSeedScheduleItem {
  const startsAt = instant(input.date, input.time);
  const endsAt = new Date(Date.parse(startsAt) + input.durationMinutes * 60_000).toISOString();
  const { durationMinutes: _durationMinutes, time: _time, ...value } = input;
  return { ...value, startsAt, endsAt };
}

function completedHistory(fromDate: string): XiaoyuCompletedSeedTask[] {
  const definitions = [
    ["完成 Orbit 企业 AI 诊断问卷初稿", "把客户现状、成本结构、数据条件和决策链整理为一页式问卷。", "work"],
    ["向林玫发送项目更新", "发送了三项企业 AI 合作进展，并记录她对制造业案例的反馈。", "relationship", "林玫"],
    ["复盘酒店客户自动化试点", "整理上线前后工时、响应速度和一线采用率，形成后续案例素材。", "work", "艾玛·威尔逊"],
    ["确认关西商务交流会合作方式", "与田中爱子确认嘉宾筛选、报名审核和会后跟进分工。", "event", "田中爱子"],
    ["完成七月经营数据复盘", "核对收入、项目毛利、模型费用和应收款，记录八月控制目标。", "personal"],
    ["完成制造业客户访谈", "访谈了现场负责人，确认视觉质检误检率和停线成本是首要问题。", "meeting", "佐藤健司"],
    ["更新企业 AI 服务报价模板", "把诊断、试点、上线和持续优化拆成清晰阶段与验收结果。", "work"],
    ["向普丽娅确认交付责任", "确认售前、实施、数据安全和客户成功的负责人及升级路径。", "relationship", "普丽娅·拉奥"],
    ["整理大阪潜在合作伙伴名单", "筛选十家咨询、系统集成与行业协会伙伴，并标注优先联系人。", "work"],
    ["完成八月内容选题安排", "确定三篇面向日本企业经营者的 AI 降本增效案例主题。", "work"],
  ] as const;

  return definitions.map(([title, notes, category, relatedContactName], index) => {
    const plannedDate = addDays(fromDate, -28 + index * 3);
    return {
      ...task({
        category,
        key: `history-${index + 1}`,
        notes,
        plannedDate,
        priority: "normal",
        ...(relatedContactName ? { relatedContactName } : {}),
        time: "17:00",
        title,
      }),
      completedAt: instant(plannedDate, "18:00"),
    };
  });
}

export function buildXiaoyuThreeMonthSeed(fromDate: string): XiaoyuThreeMonthSeed {
  assertDateKey(fromDate);
  const throughDate = addMonths(fromDate, 3);
  const openTasks: XiaoyuSeedTask[] = [
    task({
      category: "work",
      key: "today-enterprise-ai-interview-outline",
      notes: "围绕现状流程、人工成本、重复操作、数据权限和决策人，准备下周企业 AI 诊断会的提问顺序。",
      plannedDate: fromDate,
      priority: "high",
      time: "11:30",
      title: "整理下周企业 AI 诊断会的访谈提纲",
    }),
    task({
      category: "relationship",
      key: "today-sato-pilot-checklist",
      notes: "发送相机型号、产线节拍、缺陷样本和误检率清单，便于下周直接确认试点范围。",
      plannedDate: fromDate,
      priority: "high",
      relatedContactName: "佐藤健司",
      time: "16:30",
      title: "给佐藤健司发送视觉质检试点准备清单",
    }),
  ];
  const scheduleItems: XiaoyuSeedScheduleItem[] = [
    schedule({
      date: fromDate,
      durationMinutes: 60,
      key: "today-weekly-review",
      kind: "personal",
      location: "Orbit 办公室",
      time: "17:30",
      title: "本周经营复盘与下周优先级",
    }),
  ];

  for (let offset = 1; addDays(fromDate, offset) <= throughDate; offset += 1) {
    const date = addDays(fromDate, offset);
    const day = weekday(date);
    const weekIndex = Math.floor(offset / 7);

    if (day === 1) {
      openTasks.push(task({
        category: "work",
        key: `week-${weekIndex}-priorities`,
        notes: "从客户交付、销售机会、产品建设和团队事项中选出本周最重要的三项结果，并明确负责人。",
        plannedDate: date,
        priority: "high",
        time: "11:00",
        title: "确定本周 Orbit 的三项关键结果",
      }));
      scheduleItems.push(schedule({
        date,
        durationMinutes: 45,
        key: `week-${weekIndex}-team-sync`,
        kind: "meeting",
        location: "Google Meet",
        time: "09:30",
        title: "Orbit 团队周会",
      }));
    }

    if (day === 3) {
      const [relatedContactName, action] = relationshipWork[weekIndex % relationshipWork.length];
      openTasks.push(task({
        category: "relationship",
        key: `week-${weekIndex}-relationship`,
        notes: `${action}。联系前先查看最近一次互动和对方当前能提供、正在寻找的资源。`,
        plannedDate: date,
        priority: weekIndex % 3 === 0 ? "high" : "normal",
        relatedContactName,
        time: "17:00",
        title: action,
      }));
    }

    if (day === 5) {
      const personalReview = weekIndex > 0 && weekIndex % 4 === 0;
      openTasks.push(task({
        category: personalReview ? "personal" : "work",
        key: `week-${weekIndex}-review`,
        notes: personalReview
          ? "核对本月现金流、应收款、模型 API 成本和固定支出，记录下月需要调整的预算。"
          : "复盘本周客户进展、交付风险和下周承诺，只保留有明确负责人和时间的下一步。",
        plannedDate: date,
        priority: "normal",
        time: "17:30",
        title: personalReview ? "完成月度财务与模型成本复盘" : "完成本周客户与交付复盘",
      }));
    }

    const extraDay = weekIndex % 2 === 0 ? 2 : 4;
    if (day === extraDay) {
      const [relatedContactName, action] = customerWork[weekIndex % customerWork.length];
      const category = weekIndex % 4 === 0 ? "event" : "meeting";
      openTasks.push(task({
        category,
        key: `week-${weekIndex}-customer-work`,
        notes: `${action}。输出应控制在一页内，包含目标、已知事实、待确认问题和会后决策。`,
        plannedDate: date,
        priority: "normal",
        relatedContactName,
        time: "14:00",
        title: action,
      }));
      scheduleItems.push(schedule({
        date,
        durationMinutes: 60,
        key: `week-${weekIndex}-customer-meeting`,
        kind: "meeting",
        location: weekIndex % 3 === 0 ? "Orbit 办公室" : "Google Meet",
        relatedContactName,
        time: "15:30",
        title: `与${relatedContactName}推进企业 AI 合作`,
      }));
    }

    if (day === 6 && [1, 3, 6, 9, 12].includes(weekIndex)) {
      const [title, location] = eventThemes[[1, 3, 6, 9, 12].indexOf(weekIndex)];
      scheduleItems.push(schedule({
        date,
        durationMinutes: 150,
        key: `week-${weekIndex}-industry-event`,
        kind: "event",
        location,
        time: "13:30",
        title,
      }));
    }

    if (day === 4 && Number(date.slice(8, 10)) >= 24 && Number(date.slice(8, 10)) <= 30) {
      scheduleItems.push(schedule({
        date,
        durationMinutes: 45,
        key: `month-${date.slice(0, 7)}-admin`,
        kind: "personal",
        location: "Orbit 办公室",
        time: "18:00",
        title: "月末账务、合同与模型费用检查",
      }));
    }
  }

  return {
    completedTasks: completedHistory(fromDate),
    fromDate,
    openTasks,
    scheduleItems,
    throughDate,
  };
}
