import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import { createContactLabelsReader } from "../../features/contacts/contact-label-service";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";

test("contact labels read only requested owned names, not bodies or relationship grants",{skip:!process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL},async()=>{
  const url=new URL(process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL!);assert.ok(["localhost","127.0.0.1"].includes(url.hostname));assert.equal(url.search,"");
  const schema="contact_labels_"+randomUUID().replaceAll("-","");
  const pool=new Pool({connectionString:url.toString(),max:1,options:`-c search_path=${schema} -c statement_timeout=15000`});
  try{
    await pool.query(`create schema ${schema}`);await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    for(const [id,owner,account] of [["own","a","a"],["foreign","b","b"],["conflict","a","b"],["array","a",["a"]],["unowned",null,"a"]]){
      await pool.query(`insert into orbit_records(workspace_id,collection_name,record_id,user_id,source_type,source_id,payload,created_at,updated_at)
        values('w','contacts',$1,$2,'manual','test',$3::jsonb,now(),now())`,[id,owner,JSON.stringify({id,accountId:account,displayName:`Name ${id}`,organization:"名".repeat(2000),notes:"PRIVATE".repeat(100000)})]);
    }
    let bytes=0,queries=0;
    const reader=createContactLabelsReader({workspaceId:"w",client:{async query(sql,values){const result=await pool.query(sql,values as unknown[]);queries++;bytes+=Buffer.byteLength(JSON.stringify(result.rows));return result;}}});
    const ids=["own","foreign","conflict","array","unowned","missing"];
    const first=await reader.read("a",ids);
    assert.deepEqual(first.items.map(item=>item.id),["own"]);assert.equal(first.items[0]?.organizationPreview.length,120);assert.equal(queries,1);assert.ok(bytes<1000);
    await pool.query(`insert into orbit_records(workspace_id,collection_name,record_id,user_id,source_type,source_id,payload,created_at,updated_at)
      select 'w','contacts','growth:'||n,'a','manual','test',jsonb_build_object('id','growth:'||n,'displayName','Growth','notes',repeat('x',4096)),now(),now() from generate_series(1,10000)n`);
    bytes=0;queries=0;assert.deepEqual((await reader.read("a",ids)).items,first.items);assert.equal(queries,1);assert.ok(bytes<1000);
    await pool.query("update orbit_records set user_id='b' where record_id='own'");
    assert.deepEqual((await reader.read("a",ids)).items,[]);
    for(const invalid of [Array(31).fill("own"),[""],["x".repeat(2049)]])await assert.rejects(reader.read("a",invalid),/INPUT_INVALID/);
  }finally{await pool.query(`drop schema if exists ${schema} cascade`);await pool.end();}
});
