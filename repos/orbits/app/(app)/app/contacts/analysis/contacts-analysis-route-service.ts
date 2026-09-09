import { createConfiguredMobileContactsDashboardService, type MobileContactsDashboardService } from "../../../../../features/mobile/contacts-dashboard-service";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { contactsAnalysisToView, type ContactsAnalysisView } from "./contacts-analysis-view-model";

export async function loadContactsAnalysis(actorId: string, language: OrbitLanguage, service?: MobileContactsDashboardService): Promise<ContactsAnalysisView> {
  if (!actorId.trim()) return { state: "error" };
  try {
    const result = await (service ?? createConfiguredMobileContactsDashboardService()).getDashboard({ actorId });
    return result.success ? contactsAnalysisToView(result.data, language) : { state: "error" };
  } catch {
    return { state: "error" };
  }
}
