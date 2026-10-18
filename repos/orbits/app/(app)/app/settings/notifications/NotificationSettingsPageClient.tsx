'use client';
import {AccountLayout} from '../../orbit-2026/account/AccountLayout';
import {NotificationDeliverySettings} from '../notification-delivery-settings';
import {NotificationDiscoverySettings} from '../notification-discovery-settings';
import {notificationCopy} from '../../orbit-2026/copy/notifications';
import {pickCopy} from '../../orbit-2026/copy/types';
import {useOrbitLanguage} from '../../orbit-language-context';

export function NotificationSettingsPageClient(){
 const {language}=useOrbitLanguage();
 return <AccountLayout active="notifications" title={pickCopy(notificationCopy.title,language)} subtitle={pickCopy(notificationCopy.subtitle,language)}>
  <NotificationDeliverySettings/>
  <NotificationDiscoverySettings/>
 </AccountLayout>;
}
