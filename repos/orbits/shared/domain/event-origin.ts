export interface EventOrigin {
  eventId: string;
  relationshipPairId?: string;
  sourceActionId: string;
  attributedAt?: string;
}

export function eventOrigin(input: {
  eventId: string;
  relationshipPairId?: string;
  sourceActionId: string;
  attributedAt?: string;
}): EventOrigin {
  return {
    eventId: input.eventId.trim(),
    ...(input.relationshipPairId?.trim()
      ? { relationshipPairId: input.relationshipPairId.trim() }
      : {}),
    sourceActionId: input.sourceActionId.trim(),
    ...(input.attributedAt?.trim()
      ? { attributedAt: input.attributedAt.trim() }
      : {}),
  };
}
