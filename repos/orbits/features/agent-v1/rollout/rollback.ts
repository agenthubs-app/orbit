/**
 * agent-design AG18 — the rollback switch (CONVENTIONS §2 `ORBIT_AGENT_V1_PROPOSALS`, 设计稿 §8 第 5 步「回退」).
 *
 * Rolling back is not going back to the old path (`ORBIT_AGENT_V1_MODE=off` would bring back the old direct writes and
 * typed confirmation). With proposals `paused`:
 *
 * - no new card is frozen anywhere: chat, scheduled tasks and the MCP `propose_change` all go through
 *   `runtime.freezeCard`, which refuses (AgentProposalsPausedError) and each entry says so in words;
 * - a waiting card cannot be confirmed (decideAction refuses with PROPOSALS_PAUSED: "这项修改现在没有执行"); rejecting it
 *   is still possible (nothing is written);
 * - the execution queue claims nothing: approved items stay where they are, an item whose outcome is unknown stays in
 *   review (AG02), and done items keep their receipts;
 * - typed "确认" and an explicit "新建待办" write nothing (the new entry never wrote on words; now it also says why).
 *
 * Restoring is setting it back to `open`: the queue goes on with the same operation keys (no second effect), and a
 * waiting card is re-checked against the data at the click (AG02 decideAction) before it can run.
 */
import { evalSetting } from "../observability/trace";

export type AgentProposalsState = "open" | "paused";

/** The switch; an eval case may set it (`rollback` step) under ORBIT_AGENT_EVAL only (evalSetting is null elsewhere). */
export function readAgentProposalsState(env: Record<string, string | undefined> = process.env): AgentProposalsState {
  const override = evalSetting("agent_v1_proposals");
  const raw = typeof override === "string" ? override : env.ORBIT_AGENT_V1_PROPOSALS;
  return raw?.trim().toLowerCase() === "paused" ? "paused" : "open";
}

export function agentProposalsPaused(env: Record<string, string | undefined> = process.env): boolean {
  return readAgentProposalsState(env) === "paused";
}

export const PROPOSALS_PAUSED = "PROPOSALS_PAUSED" as const;

/** Thrown by freezeCard (and the card-revising calls) while proposals are paused. */
export class AgentProposalsPausedError extends Error {
  readonly code = PROPOSALS_PAUSED;
  constructor() {
    super("Agent write proposals are paused; no card was made.");
  }
}

export function isProposalsPausedError(error: unknown): error is AgentProposalsPausedError {
  return error instanceof AgentProposalsPausedError || (typeof error === "object" && error !== null && (error as { code?: unknown }).code === PROPOSALS_PAUSED);
}

type Language = "zh" | "ja" | "en";
const languageOf = (locale: string | undefined | null): Language => (locale === "ja" || locale === "en" ? locale : "zh");

/** What the user reads; plain words, no internal terms (界面用词要直白). */
export const PAUSED_WORDS: Record<Language, { newChange: string; click: string; typedConfirm: string; external: string }> = {
  en: {
    click: "This change was not made: making changes is switched off for now. The card stays as it is, and you can confirm it once changes are back on.",
    external: "Orbit is not taking new changes right now, so no card was made and nothing was written. Try again later.",
    newChange: "I can't change your records right now: making changes is switched off for a while. Nothing was prepared and nothing was written. Ask again later.",
    typedConfirm: "Making changes is switched off for now, so the change on the card will not be made and nothing was written.",
  },
  ja: {
    click: "この変更は実行していません。いまは変更の機能を止めています。カードはそのまま残るので、再開後にもう一度確定できます。",
    external: "いまは新しい変更を受け付けていないため、カードは作らず、何も書き込んでいません。しばらくしてからもう一度お試しください。",
    newChange: "いまは記録を変更できません。変更の機能をしばらく止めています。変更は用意しておらず、何も書き込んでいません。しばらくしてからもう一度お伝えください。",
    typedConfirm: "いまは変更の機能を止めているため、カードの変更は実行されず、何も書き込んでいません。",
  },
  zh: {
    click: "这项修改现在没有执行：修改功能暂时停用了。卡片先保留着，恢复后可以再确认。",
    external: "现在暂时不接收新的修改，没有生成卡片，也没有写入任何内容。请稍后再试。",
    newChange: "现在暂时不能改记录：修改功能暂时停用了。这次没有准备任何修改，也没有写入任何内容，可以稍后再说一次。",
    typedConfirm: "修改功能暂时停用了，卡上的修改现在不会执行，也没有写入任何内容。",
  },
};

export function pausedWords(locale: string | undefined | null) {
  return PAUSED_WORDS[languageOf(locale)];
}
