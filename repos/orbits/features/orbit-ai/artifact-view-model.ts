import type {
  OrbitAgentArtifactGeneratedViewAction,
  OrbitAgentArtifactGeneratedViewItem,
  OrbitAgentArtifactGeneratedViewMetadata,
  OrbitAgentArtifactGeneratedViewSection,
  OrbitAgentArtifactPayload,
  OrbitAgentArtifactSurface,
  OrbitAgentArtifactWidthHint,
} from "./artifact-contract";

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
  return value && value.trim() ? value : null;
}

function actionViewModel(
  action: OrbitAgentArtifactGeneratedViewAction,
): OrbitAgentArtifactActionViewModel {
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

  if (result.status !== "ready" || result.generatedView === null) {
    return null;
  }

  return {
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
  for (const payload of payloads) {
    const viewModel = createOrbitAgentArtifactSurfaceViewModel(payload);

    if (viewModel) {
      return viewModel;
    }
  }

  return null;
}
