import {notFound,redirect} from 'next/navigation';
import {auth} from '../../../../../../auth';
import {NotificationSourcePage} from '../../notification-source-page';
import {notificationIdFromRouteParam} from '../../notification-source-view-model';
export const dynamic='force-dynamic';
export default async function SourcePage({params}:{params:Promise<{id:string}>}) {
 const notificationId=notificationIdFromRouteParam((await params).id);if(notificationId===null)notFound();
 if(!(await auth())?.user?.id)redirect('/app/account/login?'+new URLSearchParams({next:'/app/inbox/sources/'+encodeURIComponent(notificationId)}));
 return <NotificationSourcePage notificationId={notificationId}/>;
}
