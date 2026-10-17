/**
 * R11a（PLANNER 契约 6，代定 9）：联系人软删除与恢复。Owner: 乙 (R11a). Used by: App / Web 連絡先の編集「削除」、Toast「元に戻す」、
 * App 离线写入队列。DELETE /api/contacts/:id、POST /api/contacts/:id/restore（30 天内）。
 * 软删只把联系人记录标成已删除（写 deletedAt），メモ与其他记录不动；读取侧随联系人一起隐藏，恢复后照旧显示。
 */
export interface ContactDeleteResult {
  contactId: string;
  deletedAt: string;
  /** deletedAt + 30 days: restore is accepted until then. */
  restorableUntil: string;
}

export interface ContactRestoreResult {
  contactId: string;
  restoredAt: string;
}
