/**
 * R08 contract 12 — plan v2, top level only.
 * @draft until R22 (owner: 甲). Used by: home plan score, Task plan segment, event scoring.
 * Not checked by the append-only snapshot until R22 fixes the full fields.
 */
export interface PlanIntakeSummary {
  goal: string;
  answeredQuestions: number;
  totalQuestions: number;
}

export interface PlanV2Step {
  id: string;
  title: string;
  personTypeKey: string;
}

export interface PlanV2PersonType {
  key: string;
  label: string;
  target: number;
  met: number;
}

export interface PlanV2Summary {
  goal: string;
  goalKind: string;
  steps: readonly PlanV2Step[];
  personTypes: readonly PlanV2PersonType[];
  sample?: true;
}

export interface PlanScoreView {
  /** 0–100. */
  total: number;
  byType: readonly { key: string; label: string; score: number }[];
  todayDelta: number;
}

export interface PlanV2SummaryResponse {
  summary: PlanV2Summary;
  score: PlanScoreView;
}
