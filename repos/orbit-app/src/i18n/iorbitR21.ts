import type { OrbitLanguage } from "../api/contract/language";
import { iorbitR21Ja } from "./ja/iorbitR21";
import { iorbitR21Zh } from "./zh/iorbitR21";
import { iorbitR21En } from "./en/iorbitR21";

type Copy = { [K in keyof typeof iorbitR21Ja]: string };
export const iorbitR21Copy: Record<OrbitLanguage, Copy> = { ja: iorbitR21Ja, zh: iorbitR21Zh, en: iorbitR21En };
