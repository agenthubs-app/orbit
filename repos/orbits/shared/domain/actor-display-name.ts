/** 给别人看的名字：资料姓名，没有才用会话里的账号名（简化注册后是邮箱前缀）。报名、站内信、会后材料共用。 */
export function actorDisplayName(actor: { name?: string | null; profileName?: string } | null | undefined): string | null | undefined {
  return actor?.profileName?.trim() || actor?.name;
}
