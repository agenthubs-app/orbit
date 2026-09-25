/** Authorized, bounded names for references on the current page, not details. */
export interface ContactLabelsContract {
  actorId: string;
  items: { id: string; namePreview: string; organizationPreview: string }[];
  asOf: string;
}
