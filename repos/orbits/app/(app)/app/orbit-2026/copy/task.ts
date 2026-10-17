import type { OrbitCopyTable } from "./types";

export const taskCopy = {
  proposalTitle: { ja: "面談の日程提案", zh: "提议会面时间", en: "Propose meeting times", kind: "dialogTitle" },
  proposalCandidates: { ja: "候補を選ぶ", zh: "选择候选时间", en: "Choose times", kind: "label" },
  proposalFormat: { ja: "形式と場所", zh: "形式与地点", en: "Format and place", kind: "label" },
  proposalReview: { ja: "送る前の確認", zh: "发送前确认", en: "Review before sending", kind: "label" },
} as const satisfies OrbitCopyTable;
