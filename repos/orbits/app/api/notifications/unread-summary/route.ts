import {createLegacyUnreadSummaryGetHandler} from './handler';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const GET=createLegacyUnreadSummaryGetHandler();
