import {createInboxNotificationHandler} from './handler';
export const dynamic='force-dynamic';
export const GET=(request:Request)=>createInboxNotificationHandler()('list',request);
