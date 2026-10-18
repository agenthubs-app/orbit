import {redirect} from 'next/navigation';
import {auth} from '../../../../../auth';
import {NotificationSettingsPageClient} from './NotificationSettingsPageClient';

export const dynamic='force-dynamic';
export default async function NotificationSettingsPage(){
 const session=await auth();
 if(!session?.user?.id)redirect('/app/account/login?next=%2Fapp%2Fsettings%2Fnotifications');
 return <NotificationSettingsPageClient/>;
}
