import { createNotificationPreferencesGetHandler, createNotificationPreferencesPatchHandler } from "./handler";

export const GET = createNotificationPreferencesGetHandler();
export const PATCH = createNotificationPreferencesPatchHandler();
