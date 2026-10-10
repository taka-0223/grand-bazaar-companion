import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync('sw.js','utf8');
const scope='https://example.test/grand-bazaar-companion/';
const response=name=>({name,ok:true,clone(){return response(name)}});

function controlledWorker({online=true,previewCached=null}={}){
  const handlers={},network=[],put=[];
  const home=response('home'),pilot=response('economy-lab');
  const caches={
    match:async key=>typeof key==='string'?(
      key==='./index.html'?home:null):(
      key.url.endsWith('/economy-lab/')?previewCached:null
    ),
    open:async name=>({put:async(request,value)=>put.push({
      name,url:request.url,resource:value.name
    })}),
    keys:async()=>[],
    delete:async()=>true
  };
  const fetch=async request=>{
    network.push(request.url||String(request));
    if(!online)throw new Error('offline');
    return pilot;
  };
  const self={
    registration:{scope},location:{href:scope+'sw.js'},
    addEventListener:(name,fn)=>{handlers[name]=fn}
  };
  runInNewContext(source,{self,caches,fetch,URL,Response:{
    error:()=>({name:'offline-error',ok:false})
  }});
  const navigate=async path=>{
    const req={method:'GET',mode:'navigate',url:scope+path};
    const event={request:req,response:null,respondWith(p){this.response=p}};
    handlers.fetch(event);
    return event.response?await event.response:null;
  };
  return {navigate,network,put,handlers};
}
test('normal home stays offline-first and never triggers a full Master request',async()=>{
  const sw=controlledWorker({online:false});
  assert.equal((await sw.navigate('')).name,'home');
  assert.equal((await sw.navigate('index.html')).name,'home');
  assert.deepEqual(sw.network,[]);
  assert(!source.includes('board-master.full.v1.json'));
});
test('opt-in economy route is not silently rewritten to PWA home',async()=>{
  const sw=controlledWorker();
  const output=await sw.navigate('economy-lab/');
  assert.equal(output.name,'economy-lab');
  assert.equal(sw.network.length,1);
  assert(sw.network[0].endsWith('/economy-lab/'));
  assert.equal(sw.put[0].resource,'economy-lab');
  assert(sw.put[0].url.endsWith('/economy-lab/'));
});
test('once opened online, pilot can return its exact cached page offline',async()=>{
  const sw=controlledWorker({online:false,previewCached:response('previous-lab')});
  assert.equal((await sw.navigate('economy-lab/')).name,'previous-lab');
  assert.deepEqual(sw.put,[]);
});
test('first offline visit to pilot fails instead of showing misleading home',async()=>{
  const sw=controlledWorker({online:false});
  assert.equal((await sw.navigate('economy-lab/')).name,'offline-error');
});
test('non-GET requests are not intercepted by caching navigation logic',()=>{
  const sw=controlledWorker();
  let used=false;
  sw.handlers.fetch({request:{method:'POST',mode:'navigate',
    url:scope+'economy-lab/'},respondWith(){used=true}});
  assert.equal(used,false);
});
