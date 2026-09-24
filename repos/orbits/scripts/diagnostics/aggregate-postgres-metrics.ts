import {createInterface} from 'node:readline';

/** Feed newline-delimited postgres_read_metric events; no database/network I/O. */
export function aggregatePostgresMetrics(lines:readonly string[]) {
  const groups=new Map<string,{fingerprint:string;queries:number;rows:number;bytes:number;failed:number}>();
  let accepted=0,rejected=0;
  for(const line of lines) {
    let value;try{value=JSON.parse(line);}catch{rejected++;continue;}
    if(value?.event!=='postgres_read_metric')continue;
    if(!['returnedRows','approximateSerializedRowBytes'].every(key=>Number.isSafeInteger(value[key])&&value[key]>=0)) {rejected++;continue;}
    const fingerprint=typeof value.queryFingerprint==='string'&&/^[a-f0-9]{24}$/.test(value.queryFingerprint)?value.queryFingerprint:'unattributed';
    const row=groups.get(fingerprint)??{fingerprint,queries:0,rows:0,bytes:0,failed:0};
    row.queries++;row.rows+=value.returnedRows;row.bytes+=value.approximateSerializedRowBytes;row.failed+=value.failed===true?1:0;
    groups.set(fingerprint,row);accepted++;
  }
  return {kind:'decoded_row_estimate_not_provider_billing',accepted,rejected,groups:[...groups.values()].sort((a,b)=>b.bytes-a.bytes)};
}
if(process.argv[1]?.endsWith('/aggregate-postgres-metrics.ts')) {
  // Input should be an explicit bounded export window, not an endless log tail.
  void (async()=>{
    const lines:string[]=[];
    for await(const line of createInterface({input:process.stdin}))lines.push(line);
    console.log(JSON.stringify(aggregatePostgresMetrics(lines),null,2));
  })().catch(()=>{console.error('Unable to read metric input');process.exitCode=1;});
}
