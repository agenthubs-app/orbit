/**
 * R11a 追补（RD-33 主会话代定，2026-10-18）：联系人标签里由系统写入的内部标签不给用户看（界面用词要直白）。
 * Owner: 乙 (R11a). Used by: App 連絡先の編集（`src/screens/network/ContactEditScreen.tsx`）。
 *
 * 内部标签是导入 / 演示数据写下的「命名空间:英文 slug」：`source:external-import`、`event:<slug>`、
 * `priority:<slug>`、`topic:<slug>`。用户自己输入的标签（「CFO」「展示会で名刺交換」）照常显示。
 * 编辑页只显示用户标签；保存时把原有的内部标签原样放回，不因为看不见就被删掉。
 */

const INTERNAL_TAG = /^(?:source|event|priority|topic):[a-z0-9][a-z0-9._:-]*$/;

export function isInternalContactTag(tag: string): boolean {
  return INTERNAL_TAG.test(tag);
}

export function userFacingContactTags(tags: readonly string[]): string[] {
  return tags.filter((tag) => !isInternalContactTag(tag));
}

/** 保存时用：原有的内部标签（顺序不变）+ 用户在编辑页留下的标签；去重。 */
export function mergeEditedContactTags(original: readonly string[], editedUserTags: readonly string[]): string[] {
  const merged = [...original.filter(isInternalContactTag), ...editedUserTags.filter((tag) => !isInternalContactTag(tag))];
  return merged.filter((tag, index) => merged.indexOf(tag) === index);
}
