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

// Agent can start before the actor has imported any relationship conversations.
// Keep this model free of people, events, and history so the welcome screen never
// presents sample entities as if they belonged to the signed-in actor.
export function createOrbitAgentStarterViewModel(): OrbitAgentViewModel {
  const peopleQuery = "帮我找当前最值得跟进的人脉。";
  const eventQuery = "推荐我现在应该关注的活动。";
  const todoQuery = "整理我当前的关系待办，并说明来源和优先级。";

  return {
    history: [],
    scenarios: {
      events: {
        intro: "",
        items: [],
        kind: "events",
        panelTitle: "",
        q: eventQuery,
      },
      people: {
        intro: "",
        items: [],
        kind: "people",
        panelTitle: "",
        q: peopleQuery,
      },
      peopleToEvents: {
        intro: "",
        items: [],
        kind: "todos",
        panelTitle: "",
        q: todoQuery,
      },
    },
    suggests: [
      { icon: "users", label: "找值得跟进的人脉", q: peopleQuery },
      { icon: "calendar", label: "推荐可拓展活动", q: eventQuery },
      { icon: "check", label: "整理关系待办", q: todoQuery },
    ],
  };
}
