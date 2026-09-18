import {createInboxNotificationHandler} from '../handler';
export const dynamic='force-dynamic';
export const GET=(request:Request,context:{params:Promise<{id:string}>})=>createInboxNotificationHandler()('detail',request,context);
