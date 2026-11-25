import { createAutofillInferenceHandler } from "./handler";

export const dynamic = "force-dynamic";
// 模型最多 12 秒（AUTOFILL_MODEL_DEFAULTS），契约承诺 15 秒内返回。
export const maxDuration = 20;
export const POST = createAutofillInferenceHandler();
