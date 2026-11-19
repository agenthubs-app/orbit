/**
 * R11a（連絡先の編集，b5 #42 / #45）：改联系人的基本字段（氏名・会社・役職・メール・電話）。Owner: 乙 (R11a).
 * Used by: App / Web 連絡先の編集。PATCH /api/contacts/:id/fields。被覆盖的旧值进 fieldHistory（「以前の値」）。
 * 业界 / 職位層 / 段階 / タグ 仍走 PATCH /api/contacts/:id。
 */
export type ContactEditableField = "displayName" | "organization" | "role" | "email" | "phone";

export interface ContactFieldsUpdateInput {
  /** null clears the field; displayName cannot be cleared. */
  values: Partial<Record<ContactEditableField, string | null>>;
  /**
   * agent-design AG12：可选的期望版本（联系人每次写入加一的修改次数记号）。带了就不自动重试，与当前版本不符返回 409 CONFLICT；
   * 不带的旧客户端行为不变。
   */
  expectedVersion?: number;
}

export interface ContactFieldsUpdateResult {
  contactId: string;
  changed: ContactEditableField[];
  updatedAt: string;
  /** AG12：写入后的版本（旧服务端不返回）。 */
  version?: number;
}
