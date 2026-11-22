/**
 * Hotfix 2026-11-20 part 3 (judges on cdd160127, the Web's suggested questions): 「推荐值得参加的活动并说明原因。」 and its ja / en
 * twins got the plain upcoming list with no reasons; 「告诉我现在该联系谁、原因和下一步。」 got no next step.
 *
 * Code writes both, from the records only — never a model sentence, never anything invented:
 * - asked why, each listed event's reason is its own themes, and, where one of the user's notes (or a saved preference)
 *   mentions the same theme, that link ("你的笔记「兴趣笔记」里写了摄影"); an event with no theme gets no reason. All events stay
 *   listed in time order; one line says which ones fit the notes.
 * - asked for a next step, each ranked person's line ends with 「下一步：<the to-do or follow-up as written>」 — the record that
 *   put them on the list.
 */
import type { DomainReader, DomainScope, RecordView } from "../../domains/types";
import type { Language } from "../../functions/copy";

const REASONS_ASKED = /(原因|理由|为什么|为何|なぜ|どうして|\bwhy\b|\breasons?\b|\bexplain\b)/iu;
const NEXT_STEP_ASKED = /(下一步|接下来做什么|怎么跟进|次の一歩|次のステップ|次に何を|\bnext steps?\b|\bwhat to do next\b)/iu;

export const asksForReasons = (words: string) => REASONS_ASKED.test(words);
export const asksForNextStep = (words: string) => NEXT_STEP_ASKED.test(words);

/**
 * Release-2 gate 2 (AE-ANS-003 「哪些活动？你觉得有必要参加？为什么？」 about the events just listed): asking which are worth going
 * to, and why, is the same request as 「推荐值得参加的活动并说明原因」 — part 3's reasons from each event's themes and the user's
 * notes, over the events the question is about. No model call decides "worth it".
 */
const WORTH_ASKED = /(有必要(?:参加|去)|值不值得|值得(?:参加|去)|该不该去|要不要去|行く価値|参加すべき|行くべき|行った方がいい|参加した方がいい|\bworth (?:going|attending|it)\b|\bshould I (?:go|attend)\b)/iu;
export const asksWhichAreWorthIt = (words: string) => WORTH_ASKED.test(words) && REASONS_ASKED.test(words);

/** An event's themes as the organizer tagged them ("摄影、街拍" → ["摄影", "街拍"]). */
export function themesOf(topics: string | null): string[] {
  return topics ? [...new Set(topics.split(/[、,，/／\s]+/u).map((item) => item.trim()).filter((item) => [...item].length >= 2))] : [];
}

export interface ThemeLink {
  theme: string;
  /** The note that mentions it (its title, or its first words), or a saved preference's words. */
  note?: { ref: string; title: string; view: RecordView };
  memory?: string;
}

/**
 * For each theme of the events, the user's own note (or saved preference) that mentions it — read under the account's scope,
 * by the theme's own words. Themes no record mentions are left out.
 */
export async function themeLinks(reader: DomainReader, scope: DomainScope, themes: readonly string[], memories: readonly string[]): Promise<Map<string, ThemeLink>> {
  const out = new Map<string, ThemeLink>();
  for (const theme of themes) {
    const memory = memories.find((words) => words.includes(theme));
    if (memory) {
      out.set(theme, { memory, theme });
      continue;
    }
    const found = await reader.read("memo", scope, { limit: 5, text: theme }).catch(() => ({ items: [] as RecordView[] }));
    const view = found.items.find((item) => String(item.fields.body ?? "").includes(theme) || String(item.fields.title ?? "").includes(theme));
    if (view) {
      const title = String(view.fields.title ?? "").trim() || String(view.fields.body ?? "").replace(/\s+/gu, " ").slice(0, 16);
      out.set(theme, { note: { ref: view.ref, title, view }, theme });
    }
  }
  return out;
}

/** One event's reason: its themes, and the record that mentions one of them. */
export function eventReason(language: Language, themes: readonly string[], links: ReadonlyMap<string, ThemeLink>): string | null {
  if (!themes.length) return null;
  const link = themes.map((theme) => links.get(theme)).find(Boolean);
  const list = themes.join(language === "en" ? ", " : "、");
  if (language === "en") return `about ${list}${link ? (link.note ? `; your note "${link.note.title}" mentions ${link.theme}` : `; your saved preference mentions ${link.theme}`) : ""}`;
  if (language === "ja") return `テーマは${list}${link ? (link.note ? `。メモ「${link.note.title}」に${link.theme}とあります` : `。保存した好みに${link.theme}とあります`) : ""}`;
  return `主题是${list}${link ? (link.note ? `；你的笔记「${link.note.title}」里写了${link.theme}` : `；你保存的偏好里写了${link.theme}`) : ""}`;
}

/** The line after the list: how many fit what the user's records say, and which themes. */
export function fitLine(language: Language, fitting: number, total: number, themes: readonly string[]): string {
  if (!fitting) return { en: "None of them matches a theme your notes mention; each one's own themes are given.", ja: "メモに書かれた関心と重なるイベントはありません。それぞれのテーマを添えています。", zh: "没有和你笔记里写的兴趣对得上的；每场都写了它自己的主题。" }[language];
  const list = themes.join(language === "en" ? ", " : "、");
  if (language === "en") return `${fitting} of the ${total} match what your notes mention (${list}); the others are listed by time as well.`;
  if (language === "ja") return `${total}件のうち${fitting}件が、メモに書かれた関心（${list}）と重なります。ほかも時間順に並べています。`;
  return `这 ${total} 场里有 ${fitting} 场和你笔记里写的兴趣（${list}）对得上，其余也按时间列在里面。`;
}

/** A ranked person's next step: the recorded item that put them on the list, as written. */
export function nextStepWords(language: Language, title: string): string {
  if (language === "en") return `Next step: "${title}"`;
  if (language === "ja") return `次の一歩：「${title}」`;
  return `下一步：「${title}」`;
}
