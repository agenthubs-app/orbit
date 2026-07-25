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
  /**
   * Optional override for the card's "查看名片/起草邮件" links. Defaults to
   * `/app/contacts/${cid}` when absent (unchanged behavior for every
   * existing caller). Set this for synthetic timeline entries that don't
   * back a real contact — e.g. a confirmed arrangement event merged into
   * the Today time spine — so the action links at a real route instead of
   * a contact page that doesn't exist for that id.
   */
  detailHref?: string;
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
