export type TaskWriteAuthorization =
  | { kind: "direct"; title: string }
  | { kind: "suggestion"; title: string }
  | { kind: "note_suggestion" }
  | { kind: "none" };

/**
 * Authorize from the complete user utterance, never from a planner proposal or
 * text with negative clauses removed. This is deliberately a small command
 * grammar: unrecognized/compound language cannot authorize an immediate write.
 * Quoted/reported commands do not match the imperative prefix.
 */
export function taskWriteAuthorization(message: string): TaskWriteAuthorization {
  const text = message.trim();
  const none = { kind: "none" } as const;
  if (!text ||
    /[?？]|(?:谁|什么|是否|能否|能不能|可不可以|要不要|会不会|怎么|如何|为什么|如果|假如|假设|引用|例子|示例)|(?:吗|麼|么)[。！!\s]*$/u.test(text) ||
    /(?:不要|别|別|勿|无需|無需|禁止|暂不|暫不|不(?:创建|新建|添加|生成|执行|写入|保存|需要|用|必|能|应|会|想|打算|准备|计划)|取消)/u.test(text) ||
    /(?:只|仅|僅)(?:查询|查|读|讀|看|搜索|检索|分析|解释|讨论|展示|列出|告诉)|\bread[ -]?only\b/iu.test(text) ||
    /\b(?:do\s+not|don['’]t|never|without|not\s+now|no\s+(?:tasks?|todos?)|(?:only|just)\s+(?:read|query|look|search|show|explain|discuss)|(?:can|could|would|should|may)\s+(?:you|i|we)|if|suppose|whether|example|quoted)\b/iu.test(text)
  ) return none;

  const normalized = text.replace(/[。！!.]+$/u, "").trim();
  // More than one instruction needs review; do not discard trailing constraints.
  if (/[。；;\r\n]/u.test(normalized)) return none;

  const command = normalized.match(/^(?:(?:请|請|麻烦|麻煩|帮我|幫我|替我|为我|為我)\s*)*(?:创建|建立|新增|新建|添加|加到|加入|记(?:下|一个)?|設置|设(?:置)?)(?:一个|一条|个|条)?(?:跟进)?(?:待办|任务)(?:[：:]|\s+)(.+)$/u)
    ?? normalized.match(/^(?:please\s+)?(?:create|add|make)\s+(?:a\s+)?(?:follow[ -]?up\s+)?(?:task|to-?do)\b\s*[:：]?\s*(.+)$/iu);
  if (command) {
    const title = command[1].replace(/^[：:\s]+/u, "").trim();
    // An empty title must not be supplied by the model as implicit consent.
    if (/[\p{L}\p{N}]/u.test(title) && !/^(?:或|或者|还是|or\b)/iu.test(title)) {
      return { kind: "direct", title: title.slice(0, 180) };
    }
    return none;
  }

  if (/^(?:(?:请|帮我|替我)\s*)*(?:从|根据|基于)(?:这篇|这条|该|当前)?笔记(?:中)?(?:创建|生成|整理|提取)(?:待办|任务)(?:建议)?$/u.test(normalized)) {
    return { kind: "note_suggestion" };
  }
  const commitment = /^(?:我|我们)(?:之后|稍后|今天|明天|后天|下周|本周|晚上|下午|上午)?(?:还)?(?:要|需要|得|打算|准备|计划)|^(?:i|we)\s+(?:need|plan|intend|have)\s+to\b/iu;
  const action = /(?:联系|跟进|确认|整理|提交|发送|发|准备|预约|购买|完成|更新|安排|回复)|\b(?:contact|follow\s+up|prepare|submit|send|buy|finish|update|schedule|reply)\b/iu;
  return commitment.test(normalized) && action.test(normalized)
    ? { kind: "suggestion", title: normalized.slice(0, 180) }
    : none;
}
