const clock=/^([01]\d|2[0-3]):[0-5]\d$/;

export function quietHoursPatch(start:string,end:string):{quietStart:string;quietEnd:string}|null {
 return clock.test(start)&&clock.test(end)&&start!==end?{quietStart:start,quietEnd:end}:null;
}
