import assert from "node:assert/strict";
import test from "node:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { TasksWorkspace } from "../../app/(app)/app/tasks/tasks-workspace";

test("Web tasks use bounded pages, search on the server and discard denied page data", async t => {
  const calls:string[]=[];
  let denied=false;
  t.mock.method(globalThis,"fetch",async (path:string)=>{
    calls.push(path);
    if(path==="/api/task-suggestions")return Response.json({success:true,data:{suggestions:[]}});
    if(!path.startsWith('/api/tasks/page?'))return Response.json({success:false,error:{code:'UNEXPECTED_FULL_READ'}},{status:500});
    if(denied)return Response.json({success:false,error:{code:'UNAUTHORIZED'}},{status:401});
    const p=new URL(path,'https://orbit.test').searchParams,status=p.get('status')??'open',query=p.get('query')??'';
    const start=p.get('cursor')==='page2'?30:0,total=query?1:65,count=query?1:30;
    return Response.json({success:true,data:{actorId:'a',status,scope:'all',query,total,counts:{open:total,completed:0},hasMore:!query,nextCursor:query?null:'page2',asOf:'2026-09-25T00:00:00Z',
      items:Array.from({length:count},(_,n)=>({id:`t:${start+n}`,titlePreview:query?'页外搜索结果':`Task ${start+n}`,locationPreview:null,status,category:'work',priority:'normal',plannedDate:null,dueAt:null,updatedAt:'2026-09-25T00:00:00Z',relatedContact:null}))}});
  });
  let root:ReactTestRenderer;
  await act(async()=>{root=create(<TasksWorkspace/>);});
  t.after(()=>act(()=>root.unmount()));
  assert.ok(calls.some(path=>path.startsWith('/api/tasks/page?')));
  assert.equal(root!.root.findAllByType('li').length,30);
  await act(async()=>root.root.findByProps({'aria-label':'下一页待办'}).props.onClick());
  assert.equal(root!.root.findAllByType('li').length,30);
  assert.equal(root!.root.findAllByProps({href:'/app/tasks/t%3A0'}).length,0);
  assert.equal(root!.root.findAllByProps({href:'/app/tasks/t%3A30'}).length,1);
  await act(async()=>root.root.findByProps({type:'search'}).props.onChange({target:{value:'页外关键词'}}));
  assert.match(JSON.stringify(root!.toJSON()),/页外搜索结果/);
  assert.ok(calls.some(path=>new URL(path,'https://orbit.test').searchParams.get('query')==='页外关键词'));
  denied=true;
  await act(async()=>root.root.findAllByType('button').find(button=>button.children.includes('刷新'))!.props.onClick());
  assert.doesNotMatch(JSON.stringify(root!.toJSON()),/页外搜索结果/);
  assert.equal(root!.root.findAllByProps({type:'checkbox'}).length,0);
  assert.ok(!calls.some(path=>path.startsWith('/api/tasks?')));
});

test("a slow old task search cannot replace a newer result", async t => {
  let finishOld:((response:Response)=>void)|undefined;
  const result=(query:string)=>Response.json({success:true,data:{actorId:"a",status:"open",scope:"all",query,total:1,counts:{open:1,completed:0},hasMore:false,nextCursor:null,asOf:"2026-09-25T00:00:00Z",
    items:[{id:query||"initial",titlePreview:query||"initial",locationPreview:null,status:"open",category:"work",priority:"normal",plannedDate:null,dueAt:null,updatedAt:"2026-09-25T00:00:00Z",relatedContact:null}]}});
  t.mock.method(globalThis,"fetch",async(path:string)=>{
    if(path==="/api/task-suggestions")return Response.json({success:true,data:{suggestions:[]}});
    const query=new URL(path,"https://orbit.test").searchParams.get("query")??"";
    if(query==="old search")return new Promise<Response>(resolve=>{finishOld=resolve;});
    return result(query);
  });
  let root:ReactTestRenderer;
  await act(async()=>{root=create(<TasksWorkspace/>);});
  t.after(()=>act(()=>root.unmount()));
  await act(async()=>root.root.findByProps({type:"search"}).props.onChange({target:{value:"old search"}}));
  assert.ok(finishOld);
  await act(async()=>root.root.findByProps({type:"search"}).props.onChange({target:{value:"new search"}}));
  assert.equal(root!.root.findAllByProps({href:"/app/tasks/new%20search"}).length,1);
  await act(async()=>finishOld!(result("old search")));
  assert.equal(root!.root.findAllByProps({href:"/app/tasks/old%20search"}).length,0);
  assert.equal(root!.root.findAllByProps({href:"/app/tasks/new%20search"}).length,1);
});
