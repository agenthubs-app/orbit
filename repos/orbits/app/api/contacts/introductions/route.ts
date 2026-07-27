import {
  createContactIntroductionsGetHandler,
  createContactIntroductionsPostHandler,
} from "./handler";

export const dynamic = "force-dynamic";

export const GET = createContactIntroductionsGetHandler();
export const POST = createContactIntroductionsPostHandler();
