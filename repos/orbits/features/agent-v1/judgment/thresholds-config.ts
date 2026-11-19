/**
 * Written by `npm run agent-eval:calibrate -- --write` (scripts/agent-eval/calibrate-judgment.ts). Do not edit
 * by hand: a changed value needs a calibration run and its record (eval/calibration/judgment-thresholds-v3.md; v1/v2 for the cells it carries).
 * A question or language missing here is not enabled.
 */
import type { ThresholdConfig } from "./thresholds";

export const JUDGMENT_THRESHOLDS: ThresholdConfig = {
  calibratedOn: "2026-11-17",
  cells: {
    "match.level": {
      zh: 0.675,
      ja: 0.932,
      en: 0.542
    },
    "intent.explicitWrite": {
      zh: 0.951,
      ja: 0.933,
      en: 0.883
    },
    "duplicate.same": {
      zh: 0.833,
      ja: 0.873,
      en: 0.822
    },
    "outbound.extra": {
      zh: 0.901,
      ja: 0.87,
      en: 0.966
    },
    "interaction.happened": {
      zh: 0.836,
      ja: 0.631,
      en: 0.891
    },
    "followup.owner": {
      zh: 0.871,
      ja: 0.846,
      en: 0.752
    }
  },
  model: "gemini-decision-1",
  version: "judgment-thresholds@3"
};
