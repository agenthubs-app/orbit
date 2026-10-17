/**
 * R11a（連絡先の編集，b5 #42 / #45）：改联系人的基本字段（氏名・会社・役職・メール・電話）。Owner: 乙 (R11a).
 * Used by: App / Web 連絡先の編集。PATCH /api/contacts/:id/fields。被覆盖的旧值进 fieldHistory（「以前の値」）。
 * 业界 / 職位層 / 段階 / タグ 仍走 PATCH /api/contacts/:id。
 */
export type ContactEditableField = "displayName" | "organization" | "role" | "email" | "phone";

export interface ContactFieldsUpdateInput {
  /** null clears the field; displayName cannot be cleared. */
  values: Partial<Record<ContactEditableField, string | null>>;
}

export interface ContactFieldsUpdateResult {
  contactId: string;
  changed: ContactEditableField[];
  updatedAt: string;
}
