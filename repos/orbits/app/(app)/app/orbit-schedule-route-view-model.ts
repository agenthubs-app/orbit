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
