export interface OrbitAgentConnectionView {
  company: string;
  displayName: string;
  g: string;
  id: string;
  industry: string;
  initial: string;
  pipelineStatus: "to_contact" | "in_progress" | "partnered";
  title: string;
}

export interface OrbitAgentEventView {
  code: string;
  g: string;
  id: string;
  name: string;
  place: string;
  startsAt: string;
}

export interface OrbitAgentPeopleResultView {
  connection: OrbitAgentConnectionView;
  match: number;
  opener: string;
  reason: string;
}

export interface OrbitAgentEventResultView {
  event: OrbitAgentEventView;
  howto: string;
  reason: string;
  score: number;
}

// 跟进/待办面板项：来自 followup_queue artifact 的行程复核卡。
export interface OrbitAgentTodoResultView {
  contactName: string;
  due: string;
  id: string;
  organization: string;
  priority: string;
  reason: string;
  sourceLabel: string;
  task: string;
  title: string;
}

export interface OrbitAgentScenarioView {
  intro: string;
  items:
    | OrbitAgentPeopleResultView[]
    | OrbitAgentEventResultView[]
    | OrbitAgentTodoResultView[];
  kind: "people" | "events" | "todos";
  note?: string;
  panelTitle: string;
  q: string;
}

export interface OrbitAgentHistoryView {
  group: string;
  id: string;
  pinned?: boolean;
  q: string;
  sessionId?: string;
  title: string;
  when: string;
}

export interface OrbitAgentSuggestView {
  icon: string;
  label: string;
  q: string;
}

export interface OrbitAgentViewModel {
  history: OrbitAgentHistoryView[];
  scenarios: {
    events: OrbitAgentScenarioView;
    people: OrbitAgentScenarioView;
    peopleToEvents: OrbitAgentScenarioView;
  };
  suggests: OrbitAgentSuggestView[];
}
