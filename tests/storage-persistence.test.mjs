import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const html=readFileSync('index.html','utf8');
const start=html.indexOf('let dbPromise=null;function openDB(');
const end=html.indexOf('function bindAutosave(',start);
assert.ok(start>=0&&end>start,'Storage implementation missing from index.html');
const storageSource=html.slice(start,end);

function storageHarness({localFails=false,openFails=false}={}){
  const local=new Map();
  const durable=new Map();
  const pending=[];
  const connections=[];
  const opens=[];
  let localThrows=localFails,dbOpenFails=openFails;
  const statusEl={textContent:''};
  const indexedDB={
    open(name,version){
      opens.push({name,version});
      if(dbOpenFails)throw new Error('IndexedDB unavailable');
      const request={result:null,onupgradeneeded:null,onsuccess:null,onerror:null};
      queueMicrotask(()=>{
        const db={
          name,closed:false,onversionchange:null,onclose:null,
          objectStoreNames:{contains:()=>true},
          createObjectStore(){},
          close(){this.closed=true;this.onclose?.()},
          transaction(_store,mode){
            if(this.closed)throw new Error('Connection closed');
            const tx={oncomplete:null,onerror:null,onabort:null};
            tx.objectStore=()=>({
              put(value,key){
                const record=JSON.parse(JSON.stringify(value));
                pending.push({
                  name,key,record,
                  commit(){durable.set(name+':'+key,record);tx.oncomplete?.()},
                  fail(){tx.onerror?.()}
                });
              },
              get(key){
                const r={result:null,onsuccess:null,onerror:null};
                queueMicrotask(()=>{
                  r.result=durable.get(name+':'+key)||null;
                  r.onsuccess?.();
                });
                return r;
              }
            });
            return tx;
          }
        };
        connections.push(db);
        request.result=db;
        request.onsuccess?.();
      });
      return request;
    }
  };
  const ctx={
    DBNAME:'gb-board-db',OLD_DBS:['legacy-db'],STORAGE:'gb-board-data',
    state:{schemaVersion:7,goals:[],actions:[],counter:0},
    window:{indexedDB},
    indexedDB,
    localStorage:{
      setItem(key,value){if(localThrows)throw new Error('Storage full');local.set(key,value)},
      getItem(key){return local.get(key)||null}
    },
    $:()=>statusEl,
    setTimeout(){return 1},
    clone:x=>JSON.parse(JSON.stringify(x)),
    migrate:x=>x,
    captureMigrationSnapshot(){}
  };
  runInNewContext(storageSource,ctx);
  return {
    ctx,local,durable,pending,connections,opens,statusEl,
    setLocalFails:x=>localThrows=x,
    setOpenFails:x=>dbOpenFails=x
  };
}
async function until(fn,msg){
  for(let i=0;i<40;i++){
    if(fn())return;
    await new Promise(resolve=>setImmediate(resolve));
  }
  assert.fail('Timed out: '+msg);
}

test('two sequential saves reuse one active IndexedDB connection and preserve local mirror',async()=>{
  const h=storageHarness();
  h.ctx.state.counter=1;
  const first=h.ctx.save();
  await until(()=>h.pending.length===1,'first IDB write');
  h.pending[0].commit();
  assert.equal(await first,true);
  h.ctx.state.counter=2;
  const second=h.ctx.save();
  await until(()=>h.pending.length===2,'second IDB write');
  h.pending[1].commit();
  assert.equal(await second,true);
  assert.equal(h.opens.length,1);
  assert.equal(h.durable.get('gb-board-db:state').counter,2);
  assert.equal(JSON.parse(h.local.get('gb-board-data')).counter,2);
});

test('overlapping saves commit in call order using immutable snapshots',async()=>{
  const h=storageHarness();
  h.ctx.state.counter=1;
  const first=h.ctx.save();
  h.ctx.state.counter=2;
  const second=h.ctx.save();
  await until(()=>h.pending.length===1,'first pending transaction');
  assert.equal(h.pending[0].record.counter,1);
  assert.equal(JSON.parse(h.local.get('gb-board-data')).counter,2);
  assert.equal(h.pending.length,1,'second write must not overtake first');
  h.pending[0].commit();
  await until(()=>h.pending.length===2,'queued second transaction');
  assert.equal(h.pending[1].record.counter,2);
  h.pending[1].commit();
  assert.deepEqual(await Promise.all([first,second]),[true,true]);
  assert.equal(h.durable.get('gb-board-db:state').counter,2);
  assert.equal(h.opens.length,1);
});

test('failed first write does not block later writes or override newer status',async()=>{
  const h=storageHarness();
  h.ctx.state.counter=11;
  const first=h.ctx.save();
  h.ctx.state.counter=12;
  const second=h.ctx.save();
  await until(()=>h.pending.length===1,'first failed transaction');
  h.pending[0].fail();
  await until(()=>h.pending.length===2,'second transaction after failure');
  h.pending[1].commit();
  assert.deepEqual(await Promise.all([first,second]),[true,true]);
  assert.equal(h.durable.get('gb-board-db:state').counter,12);
  assert.equal(h.statusEl.textContent,'保存済み');
});

test('IndexedDB open failure keeps a usable localStorage fallback and retries later',async()=>{
  const h=storageHarness({openFails:true});
  h.ctx.state.counter=3;
  assert.equal(await h.ctx.save(),true);
  assert.equal(JSON.parse(h.local.get('gb-board-data')).counter,3);
  assert.equal(h.statusEl.textContent,'保存済み');
  h.setOpenFails(false);
  h.ctx.state.counter=4;
  const retry=h.ctx.save();
  await until(()=>h.pending.length===1,'retry write after opening failure');
  h.pending[0].commit();
  assert.equal(await retry,true);
  assert.equal(h.durable.get('gb-board-db:state').counter,4);
  assert.equal(h.opens.length,2);
});

test('localStorage failure still saves to IndexedDB; dual failure is reported',async()=>{
  const h=storageHarness({localFails:true});
  h.ctx.state.counter=5;
  const ok=h.ctx.save();
  await until(()=>h.pending.length===1,'IndexedDB fallback');
  h.pending[0].commit();
  assert.equal(await ok,true);
  assert.equal(h.statusEl.textContent,'保存済み');
  const both=storageHarness({localFails:true,openFails:true});
  assert.equal(await both.ctx.save(),false);
  assert.equal(both.statusEl.textContent,'保存失敗');
});

test('closed/version-changed connection is invalidated and reopened',async()=>{
  const h=storageHarness();
  const first=h.ctx.save();
  await until(()=>h.pending.length===1,'initial write');
  h.pending[0].commit();
  await first;
  const old=h.connections[0];
  old.onversionchange();
  assert.equal(old.closed,true);
  const again=h.ctx.save();
  await until(()=>h.pending.length===2,'write after version change');
  h.pending[1].commit();
  assert.equal(await again,true);
  assert.equal(h.opens.length,2);
});

test('Player State keys, autosave, migration and beforeunload safeguards are unchanged',()=>{
  assert.ok(html.includes("const STORAGE='gb-board-data'"));
  assert.ok(html.includes("OLD_KEYS=['gb-board-v05','gb-board-v04','gb-board-v03','gb-board-v02']"));
  assert.ok(html.includes('function bindAutosave(elements,persist,delay=400)'));
  assert.ok(html.includes('window.addEventListener(\'beforeunload\''));
  assert.ok(html.includes('async function hydrate()'));
  assert.ok(html.includes('const APP_VERSION=\'0.11.12\''));
  assert.ok(storageSource.includes("t.objectStore('kv').put(snapshot,'state')"));
  assert.ok(!storageSource.includes("put(clone("));
});
