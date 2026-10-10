import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createKnownEconomyLoader} from '../lib/known-economy-on-demand.mjs';
import {
  listAppKnownEconomyDiscovery,prepareAppKnownEconomy
} from '../lib/app-player-economy-bridge.mjs';
import {
  stateFromBackupText,readDevicePlayerState,readExistingIndexedDB
} from '../economy-lab/state.mjs';
import {escapeEconomyHtml,describeMissing} from '../economy-lab/view.mjs';

const master=JSON.parse(readFileSync('data/board-master.full.v1.json','utf8'));
const player=()=>({schemaVersion:7,knownEntities:[],knownRecipes:[],
  knownProcesses:[],knownFacts:[],playerState:{},goals:[],
  requirements:{},requests:[],recipeMeta:{}});
const frozen=x=>JSON.stringify(x);
test('the full Master loader does not fetch until explicitly called',async()=>{
  let calls=0;
  const load=createKnownEconomyLoader(async (url,options)=>{
    calls++;
    assert(url.pathname.endsWith('/data/board-master.full.v1.json'));
    assert.equal(url.searchParams.get('economy_rev'),'v08_20261010');
    assert.equal(options.method,'GET');
    assert.equal(options.credentials,'same-origin');
    return {ok:true,json:async()=>master};
  });
  assert.equal(calls,0);assert.equal(load.isLoaded(),false);
  assert.equal(await load.load(),master);
  assert.equal(await load.load(),master);
  assert.equal(calls,1);
  assert.equal(load.isLoaded(),true);
});
test('a failed offline load is retryable and never marks the Master loaded',async()=>{
  let count=0;
  const lazy=createKnownEconomyLoader(async()=>{
    count++;
    if(count===1)throw new Error('private network error');
    return {ok:true,json:async()=>master};
  });
  await assert.rejects(lazy.load(),{message:'economy_master_unavailable'});
  assert.equal(lazy.isLoaded(),false);
  assert.equal(await lazy.load(),master);assert.equal(count,2);
});
test('incomplete startup projection is not accepted as a full Master',async()=>{
  const lazy=createKnownEconomyLoader(async()=>({ok:true,json:async()=>({
    entities:[],cooking_recipes:[]
  })}));
  await assert.rejects(lazy.load(),{message:'economy_master_invalid'});
});
test('known-only picker recognizes legacy flour, but not undiscovered catalog products',()=>{
  const s=player();s.knownEntities=['wheat','wheat_flour'];
  const original=frozen(s),prior=frozen(master);
  const a=listAppKnownEconomyDiscovery(master,s);
  assert.equal(a.status,'ready');
  assert(a.items.some(x=>x.label_ja==='小麦'));
  assert(a.items.some(x=>x.label_ja==='小麦粉'));
  assert(!a.facilities.some(x=>x.facility_id.startsWith('windmill:')));
  const extra=structuredClone(master);
  extra.windmill_items.push({id:'hidden_item_v08',name_ja:'未知の商品',base_sell_price:99999});
  const b=listAppKnownEconomyDiscovery(extra,s);
  assert.deepEqual(b,a);
  assert(!JSON.stringify(a).includes('未知の商品'));
  assert.equal(frozen(s),original);assert.equal(frozen(master),prior);
});
test('only already-learned processing exposes the relevant windmill facility',()=>{
  const s=player();s.knownEntities=['wheat','wheat_flour'];
  s.knownProcesses=['wheat_flour'];
  const a=listAppKnownEconomyDiscovery(master,s);
  assert.deepEqual(a.facilities.filter(x=>x.facility_id.startsWith('windmill:'))
    .map(x=>x.facility_id),['windmill:red']);
  assert(!JSON.stringify(a).includes('黄色い風車'));
});
test('archived recipes are not offered as an active kitchen facility',()=>{
  const s=player();s.knownRecipes=['pizza'];s.recipeMeta={pizza:{archived:true}};
  const a=listAppKnownEconomyDiscovery(master,s);
  assert.deepEqual(a.facilities,[]);
  s.recipeMeta.pizza.archived=false;
  const b=listAppKnownEconomyDiscovery(master,s);
  assert(b.facilities.some(x=>x.facility_id==='kitchen:oven'));
});
test('a warehouse seedling can be discovered without counting harvested apples',()=>{
  const s=player();s.knownEntities=['apple'];
  s.playerState.apple={seedCount:1,status:'stored',location:'warehouse',seedQuality:3};
  const a=listAppKnownEconomyDiscovery(master,s);
  assert(a.items.some(x=>x.item_id==='entities:apple_seedling'));
  const r=prepareAppKnownEconomy(master,s,{scenario:{horizon_minutes:120},verified:{
    cash_g:0,confirm_baseline_only:true,available_route_ids:[]
  }});
  assert.equal(r.player.inventory['entities:apple'],undefined);
  assert.equal(r.player.inventory['entities:apple_seedling'],1);
});
test('unrecognized Player State does not reveal Master labels',()=>{
  assert.deepEqual(listAppKnownEconomyDiscovery(master,{schemaVersion:8}),{
    status:'unsupported_player_schema',items:[],facilities:[]
  });
});
test('backup parsing requires the approved envelope and never mutates State',()=>{
  const p=player(),input=JSON.stringify({
    format:'grand-bazaar-companion-backup',formatVersion:1,
    appVersion:'0.11.12',state:p
  });
  assert.deepEqual(stateFromBackupText(input),p);
  assert.deepEqual(stateFromBackupText(JSON.stringify(p)),p);
  for(const data of ['not JSON',JSON.stringify({state:p}),
    JSON.stringify({format:'evil',formatVersion:1,state:p})])
    assert.throws(()=>stateFromBackupText(data),{message:'backup_invalid'});
});
test('reading device data never creates a missing IndexedDB database',async()=>{
  let opens=0;
  const idb={databases:async()=>[{name:'another-app',version:1}],
    open:()=>{opens++;throw new Error('must not open')}};
  assert.equal(await readExistingIndexedDB(idb),null);
  assert.equal(opens,0);
});
test('read-only mirror is used without stores or migrations',async()=>{
  const good=player();good.updatedAt='2026-10-10T10:00:00Z';
  const local={getItem:key=>key==='gb-board-data'?JSON.stringify(good):null};
  const idb={databases:async()=>[]};
  const result=await readDevicePlayerState({local,idb});
  assert.deepEqual(result,good);
});
test('HTML escaping keeps user-derived labels inert',()=>{
  assert.equal(escapeEconomyHtml('<img src=x onerror="alert(1)">'),
    '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
  assert(describeMissing([{code:'known_stock_quantity_not_confirmed',
    label_ja:'小麦'}])[0].includes('小麦'));
});
test('pilot is separate from current PWA startup and has working structure',()=>{
  const html=readFileSync('economy-lab/index.html','utf8');
  const index=readFileSync('index.html','utf8');
  const worker=readFileSync('sw.js','utf8');
  assert(html.includes('src="./app.mjs"'));
  for(const id of ['useDevice','backupFile','focusItem','facilityChoices',
    'routeChoices','runComparison','comparisonOutput'])
    assert(html.includes('id="'+id+'"'));
  assert(!index.includes('economy-lab/app.mjs'));
  assert(!worker.includes('board-master.full.v1.json'));
  assert(Buffer.byteLength(html)<15000);
  for(const f of ['economy-lab/app.mjs','economy-lab/state.mjs',
    'economy-lab/view.mjs','lib/known-economy-on-demand.mjs'])
    execFileSync(process.execPath,['--check',f],{stdio:'pipe'});
});
