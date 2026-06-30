import type {
  OrbitAgentArtifactGeneratedViewAction,
  OrbitAgentArtifactGeneratedViewItem,
  OrbitAgentArtifactGeneratedViewMetadata,
  OrbitAgentArtifactGeneratedViewSection,
  OrbitAgentArtifactPayload,
  OrbitAgentArtifactSurface,
  OrbitAgentArtifactWidthHint,
} from "./artifact-contract";

// artifact-view-model 把 agent 生成的结构化 artifact 转成 UI 可直接渲染的稳定形状。
// 这里不做业务推理，只做字段清洗、空值规整和“动作必须确认”的展示约束。
export interface OrbitAgentArtifactActionViewModel {
  id: string;
  label: string;
  requiresConfirmation: boolean;
}

export interface OrbitAgentArtifactMetadataViewModel {
  label: string;
  value: string;
}

export interface OrbitAgentArtifactItemViewModel {
  id: string;
  title: string;
  subtitle: string | null;
  body: string | null;
  reason: string | null;
  confidenceLabel: string | null;
  metadata: readonly OrbitAgentArtifactMetadataViewModel[];
  actions: readonly OrbitAgentArtifactActionViewModel[];
  evidenceIds: readonly string[];
}

export interface OrbitAgentArtifactSectionViewModel {
  title: string;
  body: string | null;
  items: readonly OrbitAgentArtifactItemViewModel[];
}

export interface OrbitAgentArtifactSurfaceViewModel {
  artifactId: string;
  taskId: string;
  kind: OrbitAgentArtifactPayload["task"]["kind"];
  surface: OrbitAgentArtifactSurface;
  widthHint: OrbitAgentArtifactWidthHint | null;
  title: string;
  subtitle: string | null;
  summary: string;
  sections: readonly OrbitAgentArtifactSectionViewModel[];
  emptyState: string | null;
  nextAction: string;
  sourceModules: readonly string[];
  evidenceIds: readonly string[];
  actionsRequireConfirmation: true;
}

function textOrNull(value: string | undefined): string | null {
  // UI 层用 null 表示“不显示这一段文本”，避免空字符串占位。
  return value && value.trim() ? value : null;
}

function actionViewModel(
  action: OrbitAgentArtifactGeneratedViewAction,
): OrbitAgentArtifactActionViewModel {
  // action 只是供 UI 展示/确认的候选动作，不代表已经执行。
  return {
    id: action.actionId,
    label: action.label,
    requiresConfirmation: action.requiresConfirmation,
  };
}

function metadataViewModel(
  metadata: OrbitAgentArtifactGeneratedViewMetadata,
): OrbitAgentArtifactMetadataViewModel {
  return {
    label: metadata.label,
    value: metadata.value,
  };
}

function itemViewModel(
  item: OrbitAgentArtifactGeneratedViewItem,
): OrbitAgentArtifactItemViewModel {
  // item 级字段复制成只读数组，避免 UI 后续误改原始 artifact payload。
  return {
    actions: item.actions.map(actionViewModel),
    body: textOrNull(item.body),
    confidenceLabel: textOrNull(item.confidenceLabel),
    evidenceIds: [...item.evidenceIds],
    id: item.id,
    metadata: item.metadata.map(metadataViewModel),
    reason: textOrNull(item.reason),
    subtitle: textOrNull(item.subtitle),
    title: item.title,
  };
}

function sectionViewModel(
  section: OrbitAgentArtifactGeneratedViewSection,
): OrbitAgentArtifactSectionViewModel {
  return {
    body: textOrNull(section.body),
    items: section.items.map(itemViewModel),
    title: section.title,
  };
}

export function createOrbitAgentArtifactSurfaceViewModel(
  payload: OrbitAgentArtifactPayload,
): OrbitAgentArtifactSurfaceViewModel | null {
  const { result, task } = payload;

  // 只有 ready 且有 generatedView 的 artifact 才能渲染成 surface。
  // pending/failure/null view 交给上层状态视图处理。
  if (result.status !== "ready" || result.generatedView === null) {
    return null;
  }

  return {
    // 当前所有 artifact action 都要求用户确认，UI 不能把它们当作一键外部执行。
    actionsRequireConfirmation: true,
    artifactId: task.artifactId,
    emptyState: textOrNull(result.generatedView.emptyState),
    evidenceIds: [...result.provenance.evidenceIds],
    kind: task.kind,
    nextAction: result.nextAction,
    sections: result.generatedView.sections.map(sectionViewModel),
    sourceModules: [...result.provenance.sourceModules],
    subtitle: textOrNull(result.presentation.subtitle),
    summary: result.generatedView.summary,
    surface: result.presentation.preferredSurface,
    taskId: task.taskId,
    title: result.presentation.title,
    widthHint: result.presentation.widthHint ?? null,
  };
}

export function selectPrimaryOrbitAgentArtifactSurface(
  payloads: readonly OrbitAgentArtifactPayload[],
): OrbitAgentArtifactSurfaceViewModel | null {
  // 多 artifact 时选择第一个可渲染 surface，保持 chat side-panel 有稳定主视图。
  for (const payload of payloads) {
    const viewModel = createOrbitAgentArtifactSurfaceViewModel(payload);

    if (viewModel) {
      return viewModel;
    }
  }

  return null;
}
