import {createInboxNotificationHandler} from '../handler';
export const dynamic='force-dynamic';
export const POST=(request:Request)=>createInboxNotificationHandler()('read',request);
