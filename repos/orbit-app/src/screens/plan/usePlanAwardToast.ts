// R24: what the user sees after a score command (UI-SPEC 记录弹层 / A1 ②): a toast
// 「+X 点」 with 5-second 元に戻す (undo = only the score entry is reversed; the meeting
// record stays), or, when nothing was added, the server's reason in plain words.
import { useCallback } from "react";

import type { PlanAwardResult } from "../../api/contract/plan-v2";
import { useToast } from "../../components/ui";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { usePlanApi } from "./plan-api";
import { newIdempotencyKey } from "./plan-model";
import { awardReasonKey } from "./plan-overview-model";

export function usePlanAwardToast(planId: string, onChanged: () => void) {
  const api = usePlanApi();
  const toast = useToast();
  const { t } = useOrbitLocale();
  return useCallback((results: readonly PlanAwardResult[], label: string, who: string) => {
    const counted = results.filter((result) => result.part !== "none" && result.awardLogId);
    if (counted.length === 0) {
      const key = awardReasonKey(results.find((result) => result.reason)?.reason);
      toast.info(t("plan.award.noPoints"), key ? { sub: t(key) } : undefined);
      return;
    }
    const points = counted.reduce((sum, result) => sum + result.points, 0);
    const half = counted.some((result) => result.part === "overflow");
    toast.success(t("plan.award.added", { points }), {
      sub: t(half ? "plan.award.addedHalfSub" : "plan.award.addedSub", { label, who }),
      undo: () => {
        void (async () => {
          let ok = true;
          for (const result of counted) {
            const undone = await api.undoAward(planId, result.awardLogId!, newIdempotencyKey("undo"));
            ok = ok && undone.ok;
          }
          onChanged();
          if (ok) toast.info(t("plan.award.undone"));
          else toast.error(t("plan.error.generic"));
        })();
      },
    });
  }, [api, onChanged, planId, t, toast]);
}
