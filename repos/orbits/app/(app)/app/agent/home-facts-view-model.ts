import type {
  HomeFactsAppointmentItem,
  HomeFactsAppointmentSource,
  HomeFactsFollowupCollection,
  HomeFactsFollowupItem,
  HomeFactsFollowupSource,
  HomeFactsGroup,
  HomeFactsGroupKey,
  HomeFactsPersonalItem,
  HomeFactsPersonalSource,
  HomeFactsRouteModel,
  HomeFactsSourceKey,
  HomeFactsSourceState,
  HomeFactsTaskItem,
} from "./home-facts-route-service";

export interface HomeFactsViewGroup {
  count: number | null;
  items: readonly HomeFactsViewItem[];
  key: HomeFactsGroupKey;
  label: string;
  viewHref: string;
}

export type HomeFactsViewItem =
  | HomeFactsTaskItem
  | (HomeFactsFollowupItem & { href: string | null })
  | HomeFactsPersonalItem
  | HomeFactsAppointmentItem;

export interface HomeFactsViewSource {
  count: number | null;
  groups: readonly HomeFactsViewGroup[];
  items: readonly HomeFactsViewItem[];
  reason?: string;
  sourceLabel: string;
  state: HomeFactsSourceState;
  stateLabel: string;
  viewHref: string;
}

export interface HomeFactsFollowupViewSource extends HomeFactsViewSource {
  current: HomeFactsViewCollection;
  history: HomeFactsViewCollection;
  orphan: HomeFactsViewCollection;
}

export interface HomeFactsPersonalViewSource extends HomeFactsViewSource {
  coverage: "starts-in-window";
}

export interface HomeFactsViewCollection {
  count: number | null;
  items: readonly HomeFactsViewItem[];
  viewHref?: string;
  warning?: string;
}

export interface HomeFactsSectionViewModel extends HomeFactsViewSource {
  key: HomeFactsSourceKey;
  title: string;
}

export interface HomeFactsViewModel {
  appointments: HomeFactsSectionViewModel;
  followups: HomeFactsFollowupViewSource & HomeFactsSectionViewModel;
  personal: HomeFactsPersonalViewSource & HomeFactsSectionViewModel;
  sections: readonly HomeFactsSectionViewModel[];
  snapshotAt: string;
  tasks: HomeFactsSectionViewModel & { key: "tasks" };
  window: HomeFactsRouteModel["window"];
}

const GROUP_LABELS: Record<HomeFactsGroupKey, string> = {
  overdue: "逾期",
  "plan-past": "已过计划日",
  recent: "七日内",
  undated: "未排期",
};

const SOURCE_TITLES: Record<HomeFactsSourceKey, string> = {
  tasks: "待办事项",
  followups: "关系跟进",
  personal: "七日内开始的个人日程",
  appointments: "七日内已确认约谈",
};

const STATE_LABELS: Record<HomeFactsSourceState, string> = {
  ready: "有事实",
  empty: "暂无事实",
  unavailable: "来源不可用",
};

function mapTaskItem(item: HomeFactsTaskItem): HomeFactsViewItem {
  return { ...item };
}

function mapFollowupItem(item: HomeFactsFollowupItem): HomeFactsViewItem {
  return { ...item, href: item.operationHref };
}

function mapPersonalItem(item: HomeFactsPersonalItem): HomeFactsViewItem {
  return { ...item };
}

function mapAppointmentItem(item: HomeFactsAppointmentItem): HomeFactsViewItem {
  return { ...item };
}

function mapGroup<TItem>(
  group: HomeFactsGroup<TItem>,
  mapItem: (item: TItem) => HomeFactsViewItem,
): HomeFactsViewGroup {
  return {
    count: group.count,
    items: group.items.map(mapItem),
    key: group.key,
    label: GROUP_LABELS[group.key],
    viewHref: group.viewHref,
  };
}

function mapSource<TItem>(
  source: {
    count: number | null;
    groups?: readonly HomeFactsGroup<TItem>[];
    items: readonly TItem[];
    reason?: string;
    sourceLabel: string;
    state: HomeFactsSourceState;
    viewHref: string;
  },
  key: HomeFactsSourceKey,
  mapItem: (item: TItem) => HomeFactsViewItem,
): HomeFactsSectionViewModel {
  return {
    count: source.count,
    groups: (source.groups ?? []).map((group) => mapGroup(group, mapItem)),
    items: source.items.map(mapItem),
    ...(source.reason ? { reason: source.reason } : {}),
    sourceLabel: source.sourceLabel,
    state: source.state,
    stateLabel: STATE_LABELS[source.state],
    title: SOURCE_TITLES[key],
    viewHref: source.viewHref,
    key,
  };
}

function mapCollection(
  collection: HomeFactsFollowupCollection,
): HomeFactsViewCollection {
  return {
    count: collection.count,
    items: collection.items.map(mapFollowupItem),
    ...(collection.viewHref ? { viewHref: collection.viewHref } : {}),
    ...(collection.warning ? { warning: collection.warning } : {}),
  };
}

function mapFollowups(
  source: HomeFactsFollowupSource,
): HomeFactsFollowupViewSource & HomeFactsSectionViewModel {
  return {
    ...mapSource(source, "followups", mapFollowupItem),
    current: mapCollection(source.current),
    history: mapCollection(source.history),
    orphan: mapCollection(source.orphan),
  };
}

function mapPersonal(
  source: HomeFactsPersonalSource,
): HomeFactsPersonalViewSource & HomeFactsSectionViewModel {
  return {
    ...mapSource(source, "personal", mapPersonalItem),
    coverage: source.coverage,
  };
}

function mapAppointments(
  source: HomeFactsAppointmentSource,
): HomeFactsSectionViewModel {
  return mapSource(source, "appointments", mapAppointmentItem);
}

/**
 * Pure route-to-render adapter. It has no feature imports and performs no I/O.
 */
export function homeFactsToViewModel(
  routeModel: HomeFactsRouteModel,
): HomeFactsViewModel {
  const tasks = mapSource(routeModel.tasks, "tasks", mapTaskItem) as HomeFactsViewModel["tasks"];
  const followups = mapFollowups(routeModel.followups);
  const personal = mapPersonal(routeModel.personal);
  const appointments = mapAppointments(routeModel.appointments);
  return {
    appointments,
    followups,
    personal,
    sections: [tasks, followups, personal, appointments],
    snapshotAt: routeModel.snapshotAt,
    tasks,
    window: routeModel.window,
  };
}
