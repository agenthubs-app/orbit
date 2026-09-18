import {createInboxNotificationHandler} from '../../handler';
export const dynamic='force-dynamic';
export const POST=(request:Request,context:{params:Promise<{id:string}>})=>createInboxNotificationHandler()('action',request,context);
