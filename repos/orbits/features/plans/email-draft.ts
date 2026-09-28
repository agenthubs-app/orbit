/**
 * 「约 TA」行动上的「起草邮件」（RW-11，Sprint W0010）：只在用户点击时生成，止于草稿——
 * 返回可编辑的文字，不保存、不发送、不打开任何邮件通道。
 *
 * 草稿通过 `PlanEmailDraftProvider` 注入。当前实现是模板（联系人姓名 / 公司 / 职位、
 * 人脉需求的描述、计划目标），不调任何模型；`message-drafts` 的既有能力是按场景返回固定夹具，
 * 不接受这些字段，所以不复用。以后接 AI：写一个实现同一接口的 provider，
 * 把 `resolvePlanEmailDraftProvider` 里的那一行换掉即可——付费 AI 起草仍需要新的用户决定（D5 不覆盖）。
 */
export interface PlanEmailDraftInput {
  language: "zh" | "en";
  contactName: string;
  organization: string | null;
  role: string | null;
  needTitle: string;
  needDescription: string | null;
  goal: string | null;
}

export interface PlanEmailDraft {
  subject: string;
  body: string;
  /** 生成方式（界面不展示；方便以后区分模板与 AI）。 */
  provider: string;
}

export interface PlanEmailDraftProvider {
  readonly name: string;
  draft(input: PlanEmailDraftInput): Promise<PlanEmailDraft>;
}

function clean(value: string | null | undefined, max = 200): string | null {
  const text = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  return text ? text.slice(0, max) : null;
}

export function createTemplatePlanEmailDraftProvider(): PlanEmailDraftProvider {
  return {
    name: "template",
    async draft(input) {
      const name = clean(input.contactName, 80) ?? (input.language === "en" ? "there" : "您");
      const org = clean(input.organization);
      const role = clean(input.role);
      const need = clean(input.needDescription) ?? clean(input.needTitle) ?? "";
      const goal = clean(input.goal, 300);
      if (input.language === "en") {
        const where = org && role ? ` as ${role} at ${org}` : org ? ` at ${org}` : role ? ` as ${role}` : "";
        return {
          body: [
            `Hi ${name},`,
            "",
            goal
              ? `I'm currently working on this goal: "${goal}". Part of it is finding ${need}.`
              : `I'm currently looking for ${need}.`,
            `Given your experience${where}, I'd really value your perspective.`,
            "",
            "Would you have 20 minutes in the coming week for a short chat? Any time or place that suits you works for me.",
            "",
            "Thank you,",
          ].join("\n"),
          provider: "template",
          subject: `Could we find 20 minutes to talk? — ${clean(input.needTitle) ?? need}`,
        };
      }
      const where = org && role ? `您在${org}担任${role}` : org ? `您在${org}的经验` : role ? `您作为${role}的经验` : "您的经验";
      return {
        body: [
          `${name}您好：`,
          "",
          goal ? `我最近在推进「${goal}」，其中很需要${need}方面的帮助。` : `我最近在找${need}方面的帮助。`,
          `想到${where}，很想听听您的看法。`,
          "",
          "不知道您下周是否方便抽 20 分钟聊一聊？时间和地点都按您方便来。",
          "",
          "谢谢！",
        ].join("\n"),
        provider: "template",
        subject: `想约您 20 分钟聊聊 —— ${clean(input.needTitle) ?? need}`,
      };
    },
  };
}

/** 草稿 provider 的唯一选择点：接 AI 时只换这一行（需要先有用户决定）。 */
export function resolvePlanEmailDraftProvider(): PlanEmailDraftProvider {
  return createTemplatePlanEmailDraftProvider();
}
