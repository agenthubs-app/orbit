export interface OrbitScheduleConnectionView {
  company: string;
  displayName: string;
  g: string;
  id: string;
  initial: string;
  title: string;
}

export interface OrbitScheduleItemView {
  cid: string;
  date: string;
  dur: string;
  id: string;
  place: string;
  status: "已确认" | "待确认";
  time: string;
  topic: string;
}

export interface OrbitScheduleViewModel {
  connections: OrbitScheduleConnectionView[];
  schedules: OrbitScheduleItemView[];
  today: {
    d: number;
    m: number;
    y: number;
  };
}

const connections: OrbitScheduleConnectionView[] = [
  { id: "c1", displayName: "山田 健太", initial: "山", company: "三菱商事", title: "VP", g: "g-indigo" },
  { id: "c2", displayName: "王芳", initial: "王", company: "华为日本", title: "COO", g: "g-slate" },
  { id: "c3", displayName: "佐藤 美咲", initial: "佐", company: "Sony", title: "Director", g: "g-emerald" },
  { id: "c4", displayName: "陈立", initial: "陈", company: "Parlay", title: "创始人", g: "g-rose" },
  { id: "c5", displayName: "林雅玲", initial: "林", company: "Sequoia", title: "Partner", g: "g-amber" },
  { id: "c6", displayName: "森田 健", initial: "森", company: "野村证券", title: "MD", g: "g-sky" },
  { id: "c7", displayName: "张伟", initial: "张", company: "云启科技", title: "CEO", g: "g-violet" },
  { id: "c8", displayName: "田中 由美", initial: "田", company: "Rakuten", title: "Head of BD", g: "g-emerald" },
];

export function getOrbitScheduleViewModel(): OrbitScheduleViewModel {
  return {
    connections,
    today: { y: 2026, m: 5, d: 27 },
    schedules: [
      { id: "s0", date: "2026-06-23", time: "09:30", cid: "c8", dur: "30 分钟", place: "Rakuten 总部", topic: "电商平台入驻对接", status: "已确认" },
      { id: "s1", date: "2026-06-27", time: "15:00", cid: "c5", dur: "30 分钟", place: "线上 · Google Meet", topic: "过 deck，聊 A 轮节奏", status: "已确认" },
      { id: "s2", date: "2026-06-27", time: "18:30", cid: "c1", dur: "现场", place: "TBC · 圆桌 3", topic: "跨境供应链合作", status: "已确认" },
      { id: "s3", date: "2026-06-28", time: "11:00", cid: "c4", dur: "45 分钟", place: "六本木 · Blue Bottle", topic: "对话式 AI 集成", status: "待确认" },
      { id: "s4", date: "2026-06-30", time: "14:00", cid: "c7", dur: "60 分钟", place: "线上 · 腾讯会议", topic: "云服务续约与折扣", status: "已确认" },
      { id: "s5", date: "2026-07-02", time: "10:30", cid: "c2", dur: "45 分钟", place: "华为日本 · 会议室", topic: "MOU 签署与 Q3 发布", status: "已确认" },
      { id: "s6", date: "2026-07-08", time: "16:00", cid: "c6", dur: "30 分钟", place: "野村证券 35F", topic: "金融科技标的讨论", status: "待确认" },
      { id: "s7", date: "2026-07-15", time: "13:00", cid: "c3", dur: "60 分钟", place: "Sony · 品川", topic: "品牌联名提案", status: "已确认" },
      { id: "s8", date: "2026-07-15", time: "17:30", cid: "c4", dur: "现场", place: "AI Founders Night", topic: "Demo 互看", status: "待确认" },
    ],
  };
}
