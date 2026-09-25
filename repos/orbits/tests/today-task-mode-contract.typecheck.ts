import type { z } from "zod";
import type { todayTaskSummaryModeSchema } from "../shared/api-schema/today";
import type { TodayTaskSummaryModeContract } from "../shared/contract/today";
import type { ContractMatches } from "../shared/contract-check";

true satisfies ContractMatches<
  z.infer<typeof todayTaskSummaryModeSchema>,
  TodayTaskSummaryModeContract
>;
