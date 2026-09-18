export interface InboxDeliveryPreferencesDTO {
 actorId:string;
 revision:number;
 messageEnabled:boolean;
 reminderEnabled:boolean;
 suggestionEnabled:boolean;
 updateEnabled:boolean;
 lockScreenContent:'private'|'full';
 quietHoursEnabled:boolean;
 timeZone:string;
 mutedConversationIds:readonly string[];
}
export interface InboxDeliveryPreferencesInput {
 expectedRevision:number;
 messageEnabled?:boolean;
 reminderEnabled?:boolean;
 suggestionEnabled?:boolean;
 updateEnabled?:boolean;
 lockScreenContent?:'private'|'full';
 quietHoursEnabled?:boolean;
 muteConversation?:{conversationId:string;muted:boolean};
}
export interface InboxDeliveryOwnerDTO {
 actorId:string;
 deviceId:string;
 owner:'local'|'server';
 generation:number;
 cutover:boolean;
}
