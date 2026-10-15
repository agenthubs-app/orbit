// R27：eventsJourney 文案的短键翻译（与 Web `t("key")` 同写法）。
import { useMemo } from "react";

import type { MessageKey } from "../../../i18n/messages";
import { useOrbitLocale } from "../../../i18n/OrbitLocaleContext";
import type { JourneyT } from "./journey-model";

export function useJourneyT(): { t: JourneyT; language: string } {
  const { t, language } = useOrbitLocale();
  return useMemo(() => ({ language, t: (key: string, values?: Record<string, string | number>) => t(`eventsJourney.${key}` as MessageKey, values) }), [t, language]);
}
