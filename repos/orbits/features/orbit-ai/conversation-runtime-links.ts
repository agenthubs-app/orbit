export interface OrbitConversationRuntimeActionLink {
  actionId: string;
  conversationId?: string;
  runId: string;
  updatedAt: string;
}

export interface OrbitConversationRuntimeLink {
  actionIds: readonly string[];
  runId: string;
}

/**
 * A conversation response links one run, so its actionIds must come from that
 * same run. Returning every historical conversation action with only the
 * newest runId makes older ids impossible to resolve through the run route.
 */
export function latestConversationRuntimeLink(
  actions: readonly OrbitConversationRuntimeActionLink[],
  activeConversationId: string | null,
): OrbitConversationRuntimeLink | null {
  if (!activeConversationId) return null;

  const conversationActions = actions.filter(
    (action) => action.conversationId === activeConversationId,
  );
  const latest = [...conversationActions].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  )[0];

  if (!latest) return null;

  return {
    actionIds: conversationActions
      .filter((action) => action.runId === latest.runId)
      .map((action) => action.actionId),
    runId: latest.runId,
  };
}
