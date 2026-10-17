// R17 主催（App）：host 文案的短键翻译（与 Web `t("key")` 同写法；键同 Web copy/host.ts，App 独有的以 `app` 开头）。
import { useMemo } from "react";

import type { MessageKey } from "../../i18n/messages";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import type { HostT } from "./host-model";

export function useHostT(): { t: HostT; language: string } {
  const { t, language } = useOrbitLocale();
  return useMemo(() => ({ language, t: (key: string, values?: Record<string, string | number>) => t(`host.${key}` as MessageKey, values) }), [t, language]);
}
