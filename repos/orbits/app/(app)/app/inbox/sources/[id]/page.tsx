import {redirect} from 'next/navigation';
import {auth} from '../../../../../../auth';
import {NotificationSourcePage} from '../../notification-source-page';
export const dynamic='force-dynamic';
export default async function SourcePage({params}:{params:Promise<{id:string}>}) {
 const {id}=await params;
 if(!(await auth())?.user?.id)redirect('/app/account/login?'+new URLSearchParams({next:'/app/inbox/sources/'+encodeURIComponent(id)}));
 return <NotificationSourcePage notificationId={id}/>;
}
