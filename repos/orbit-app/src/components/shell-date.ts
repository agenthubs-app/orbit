// Shell header dates (kit D.today.date 「10月7日（水）」) and the home greeting, shared by
// the Task top bar and the home .hhead.
/** The pattern is per language (Japanese full-width brackets). */
export function shellHeaderDate(date: Date, language: string, timeZone: string, t: (key: "shell.task.headerDate", values: Record<string, string>) => string): string {
  const locale = language === "ja" ? "ja-JP" : language === "zh" ? "zh-CN" : "en-US";
  // QA-A3: on the device (Hermes) the zh-CN parts came back as "10月26周一日" — the weekday
  // landed inside the day. Read the numbers from en-US parts and the weekday on its own.
  const parts = new Intl.DateTimeFormat("en-US", { month: language === "en" ? "long" : "numeric", day: "numeric", timeZone }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone }).format(date);
  return t("shell.task.headerDate", { month: part("month"), day: part("day"), weekday });
}

type GreetingKey = "shell.home.greetingMorning" | "shell.home.greetingDay" | "shell.home.greetingEvening";
/** kit .hhead small 「おはようございます、佐藤さん」: by the hour in the user's time zone; the family name when known. */
export function shellGreeting(date: Date, timeZone: string, name: string | null | undefined, t: (key: GreetingKey | `${GreetingKey}Named`, values?: Record<string, string>) => string): string {
  const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone }).format(date));
  const key: GreetingKey = hour >= 4 && hour < 11 ? "shell.home.greetingMorning" : hour >= 11 && hour < 18 ? "shell.home.greetingDay" : "shell.home.greetingEvening";
  const family = name?.trim().split(/\s+/u)[0];
  return family ? t(`${key}Named`, { name: family }) : t(key);
}
