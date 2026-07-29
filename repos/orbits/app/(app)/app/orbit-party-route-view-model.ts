export interface OrbitPartyPersonView {
  company: string;
  contactId: string | null;
  g: string;
  groupNumber: number | null;
  icebreakers: string[];
  id: string;
  industry: string;
  initial: string;
  name: string;
  offering: string;
  reason: string;
  score: number;
  seat: string | null;
  seeking: string;
  summary: string;
  title: string;
  topics: string[];
}

export interface OrbitPartyAgendaItemView {
  description: string;
  label: string;
  time: string;
}

export interface OrbitPartyMeView {
  groupNumber: number | null;
  initial: string;
  name: string;
  offering: string[];
  prompts: string[];
  role: string;
  seat: string | null;
  seeking: string[];
  topics: string[];
}

export interface OrbitPartyViewModel {
  accessCode: string | null;
  agenda: OrbitPartyAgendaItemView[];
  checkInAvailable: boolean;
  eventId: string;
  eventName: string;
  /**
   * UI-audit fix C10. The party screen hardcoded BOTH an "已结束" pill in its
   * chrome and a "进行中" badge (plus a "TONIGHT" eyebrow and an enabled 签到
   * button) in its hero card, unconditionally — so it always claimed the event
   * was over and live at the same time. Neither read any event state, because
   * there was none on this view model to read. Derived from the same
   * eventStatusFor() the landing and admin surfaces already use, so all three
   * agree about a given event.
   */
  eventPhase: "active" | "upcoming" | "ended";
  eventVenue: string;
  icebreakers: string[];
  me: OrbitPartyMeView;
  recommendations: OrbitPartyPersonView[];
  tableMates: OrbitPartyPersonView[];
}
