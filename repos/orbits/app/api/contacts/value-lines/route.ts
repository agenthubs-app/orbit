import { createContactValueLinesHandler } from "./handler";

export const dynamic = "force-dynamic";

// GET /api/contacts/value-lines?ids=&lang=：「TA 能帮你」一句话（W0061，本人范围、只读）。
export const GET = createContactValueLinesHandler();
