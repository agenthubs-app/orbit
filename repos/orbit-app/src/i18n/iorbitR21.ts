import type { OrbitLanguage } from "../api/contract/language";
import { iorbitR21Ja } from "./iorbit-r21/ja";
import { iorbitR21Zh } from "./iorbit-r21/zh";
import { iorbitR21En } from "./iorbit-r21/en";

type Copy = { [K in keyof typeof iorbitR21Ja]: string };
export const iorbitR21Copy: Record<OrbitLanguage, Copy> = { ja: iorbitR21Ja, zh: iorbitR21Zh, en: iorbitR21En };
