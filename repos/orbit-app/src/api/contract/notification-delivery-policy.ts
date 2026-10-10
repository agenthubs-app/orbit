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
 /** R08 (R14 owns, settings use): quiet hours "HH:MM", daily push cap 1..3, secretary switches. */
 quietStart?:string;
 quietEnd?:string;
 dailyCap?:1|2|3;
 secretaryMail?:boolean;
 secretaryDeadline?:boolean;
 secretaryPick?:boolean;
 meetingException?:boolean;
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
 // R08 (R14): the same settings as the DTO's new optional fields.
 quietStart?:string;
 quietEnd?:string;
 dailyCap?:1|2|3;
 secretaryMail?:boolean;
 secretaryDeadline?:boolean;
 secretaryPick?:boolean;
 meetingException?:boolean;
}
export interface InboxDeliveryOwnerDTO {
 actorId:string;
 deviceId:string;
 owner:'local'|'server';
 generation:number;
 cutover:boolean;
}
