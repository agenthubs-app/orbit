export type OrbitContactPipelineStatus = "to_contact" | "in_progress" | "partnered";
export type OrbitIntroStatus = "draft" | "sent";

export interface OrbitContactView {
  company: string;
  encounters: OrbitContactEncounterView[];
  displayName: string;
  email: string;
  g: string;
  id: string;
  industry: string;
  initial: string;
  lineId: string;
  lastEventId: string;
  met: string;
  note: string;
  notes: OrbitContactNoteView[];
  offering: string;
  phone: string;
  pipelineStatus: OrbitContactPipelineStatus;
  seeking: string;
  source: "exchange" | "scan" | "manual";
  stage: string;
  title: string;
  wechat: string;
}

export interface OrbitContactNoteView {
  body: string;
  createdAt: string;
  id: string;
}

export interface OrbitContactPublicProfileView {
  bio: string;
  conversationPrompts: string[];
  industry: string;
  intro: string;
  offering: string[];
  seeking: string[];
  topics: string[];
}

export interface OrbitContactEncounterView {
  context: {
    metAt: string;
    publicProfile: OrbitContactPublicProfileView;
    reason: string;
    score: number;
    tableNo: number;
  };
  createdAt: string;
  eventId: string;
  id: string;
}

export interface OrbitPipelineStatusView {
  label: string;
  value: OrbitContactPipelineStatus;
}

export interface OrbitContactEventView {
  id: string;
  name: string;
}

export interface OrbitIntroView {
  blurb: string;
  id: string;
  labelA: string;
  labelB: string;
  statusBadge: OrbitIntroStatus;
}

export interface OrbitContactsViewModel {
  connections: OrbitContactView[];
  events: OrbitContactEventView[];
  intros: OrbitIntroView[];
  pipelineStatuses: OrbitPipelineStatusView[];
}
