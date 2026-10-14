import { createContext } from "react";

/** Task 顶栏用：プラン段正在显示目标输入页时为 true（副标题换成说明句，b10 ①、b12 A-R23-02a～c）。 */
export const PlanGoalInputShown = createContext<((shown: boolean) => void) | null>(null);
