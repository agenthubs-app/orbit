import { createMatchFieldsInferenceHandler } from "./handler";

export const dynamic = "force-dynamic";
// The model has 30 s (MATCH_FIELDS_MODEL_DEFAULTS).
export const maxDuration = 40;
export const POST = createMatchFieldsInferenceHandler();
