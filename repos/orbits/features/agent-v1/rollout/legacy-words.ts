/**
 * agent-design AG18-1 — what an old client's old confirm buttons answer once the new entry is on (no imports: the old
 * routes load it without the new flow).
 */
export const LEGACY_CONFIRM_ELSEWHERE = "CONFIRM_ON_NEW_CLIENT" as const;

type Language = "zh" | "ja" | "en";
const languageOf = (locale: unknown): Language => (locale === "ja" || locale === "en" ? locale : "zh");

const DRAFT: Record<Language, string> = {
  en: "Nothing was created. This card was left from an earlier chat: open the new Orbit app or the web and ask for it again there; it will be checked against your data now and shown on a new card to confirm.",
  ja: "何も作成していません。このカードは以前のやり取りで残ったものです。新しい Orbit アプリかウェブでもう一度頼んでください。いまのデータで確かめた新しいカードで確定できます。",
  zh: "没有创建任何内容。这张卡是以前的对话里留下的：请到新版 App 或网页上再说一次要做的事，会按现在的数据核对，出一张新卡再确认。",
};

const ACTION: Record<Language, string> = {
  en: "Nothing was changed. Confirm this on the card in the new Orbit app or on the web, where it shows what will change now.",
  ja: "何も変更していません。新しい Orbit アプリかウェブのカードで、いま変わる内容を見てから確定してください。",
  zh: "没有修改任何内容。请到新版 App 或网页上的卡片里，看清现在要改的内容再确认。",
};

export function legacyDraftConfirmWords(locale: unknown): string {
  return DRAFT[languageOf(locale)];
}

export function legacyActionDecisionWords(locale: unknown): string {
  return ACTION[languageOf(locale)];
}

/**
 * The old accept / dismiss routes (old App to-do page: an empty body, no revision, no hash). A card with an origin is
 * decided only by a button decision on the current revision, so these routes never decide it. With the new entry on
 * (or proposals paused) an old card without an origin is not approved here either: nobody can show that the user saw
 * what it would change now. Dismissing an old card stays possible (it writes nothing).
 */
export function legacyDecisionRefusal(input: { decision: "accept" | "dismiss"; hasOrigin: boolean; entryOn: boolean; paused: boolean }): boolean {
  if (input.hasOrigin) return true;
  return input.decision === "accept" && (input.entryOn || input.paused);
}
