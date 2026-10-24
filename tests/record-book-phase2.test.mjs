import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext,Script} from 'node:vm';
import {projectRecordMaster} from '../lib/record-master-projection.mjs';

const data=path=>JSON.parse(readFileSync(path,'utf8'));
const master=projectRecordMaster(
  data('data/board-master.full.v1.json'),data('data/tool-upgrades.v1.json'),
  data('data/bazaar-facilities.v1.json'),data('data/bazaar-shops.v1.json')
);
const source=readFileSync('record-book.js','utf8');
const plain=x=>JSON.parse(JSON.stringify(x));

function fixture(){
  const sandbox={
    RECORD_MASTER:master,state:{ui:{},playerRecords:{}},
    MASTER:{animals:[]},
    clone:x=>JSON.parse(JSON.stringify(x)),
    withUndo:async(label,fn)=>{
      const snapshot=JSON.parse(JSON.stringify(sandbox.state));
      fn();
      const ok=typeof sandbox.save==='function'?await sandbox.save():true;
      if(ok!==false)sandbox.lastUndo={label,snapshot};
      return ok;
    },
    norm:s=>String(s).normalize('NFKC').trim().toLowerCase().replace(/[\s　・･\-_]+/g,''),
  };
  runInNewContext(source,sandbox);
  return {sandbox,eval:code=>runInNewContext(code,sandbox)};
}

test('record Master is generated reproducibly from audited catalogs',()=>{
  new Script(readFileSync('record-master.js','utf8'));
  const actual=runInNewContext(readFileSync('record-master.js','utf8')+'\nRECORD_MASTER');
  assert.deepEqual(plain(actual),master);
  assert.equal(master.tools.length,8);
  assert.equal(master.tools.filter(t=>t.upgradable).length,5);
  assert.equal(master.upgrades.length,37);
  assert.equal(master.facilities.length,38);
  assert.equal(master.ranks.length,7);
  assert.ok(master.facilities.every(f=>f.unlock&&Number.isInteger(f.unlock.rank_min)&&Array.isArray(f.unlock.required_facility_ids)));
  assert.deepEqual(master.tools.map(t=>t.id),
    ['hoe','watering_can','sickle','fishing_rod','hatchet','brush','milker','clippers']);
  assert.ok(master.upgrades.every(u=>u.materials.every(m=>m.name_ja&&Number.isInteger(m.quantity)&&m.quantity>0)));
  assert.ok(master.facilities.every(f=>Number.isInteger(f.price_g)&&f.price_g>=0));
  assert.ok(!('residents' in master));
});

test('field crop structure survives normalization with existing legacy notes and entries',()=>{
  const f=fixture();
  f.sandbox.state.playerRecords={
    fields:{note:'果樹の予備',entries:[{id:'old',title:'畑の手帳'}],crops:[{id:'crop1',name:'オリーブ',count:16}]},
    tools:{ownedStageById:{hoe:'gold'},customStageById:{watering_can:'自分の呼び方'}}
  };
  f.eval('normalizePlayerRecords(state)');
  assert.deepEqual(plain(f.sandbox.state.playerRecords.fields),{
    note:'果樹の予備',entries:[{id:'old',title:'畑の手帳'}],
    crops:[{id:'crop1',name:'オリーブ',count:16}]
  });
  assert.equal(f.sandbox.state.playerRecords.tools.ownedStageById.hoe,'gold');
  assert.equal(f.sandbox.state.playerRecords.tools.customStageById.watering_can,'自分の呼び方');
});

test('field +/- changes planting count, while harvest records an event without removing fruit trees',async()=>{
  const f=fixture();
  const crop={id:'c1',name:'オリーブ',count:2,harvestCount:0};
  f.sandbox.state.playerRecords={fields:{crops:[crop],note:'以前の畑メモ',entries:[]}};
  f.sandbox.save=async()=>true;
  f.sandbox.toast=()=>{};
  let renders=0;
  f.sandbox.renderRecordFields=()=>{renders++};
  await f.eval('recordBookAdjustCrop("c1",-1)');
  assert.equal(crop.count,1);
  await f.eval('recordBookAdjustCrop("c1",-1)');
  assert.equal(crop.count,0);
  await f.eval('recordBookAdjustCrop("c1",-1)');
  assert.equal(crop.count,0);
  await f.eval('recordBookAdjustCrop("c1",1)');
  assert.equal(crop.count,1);
  await f.eval('recordBookHarvestCrop("c1")');
  assert.equal(crop.harvestCount,1);
  assert.equal(crop.count,1);
  assert.ok(crop.lastHarvestedAt);
  assert.equal(f.sandbox.state.playerRecords.fields.note,'以前の畑メモ');
  assert.equal(renders,4);
});

test('facility Master match requires exact entered shop and upgrade name',()=>{
  const f=fixture();
  const match=plain(f.eval('recordBookFacilityMatch("カバンを広げる","ウィルバー")'));
  assert.equal(match.id,'fac_wilbur_bag_1');
  assert.equal(match.price_g,5000);
  assert.equal(f.eval('recordBookFacilityMatch("カバンを広げる","ゴラン")'),null);
  assert.equal(f.eval('recordBookFacilityMatch("カバン","ウィルバー")'),null);
  assert.equal(f.eval('recordBookFacilityMatch("カバンを広げる","")'),null);
});

test('facility completed/discovered IDs follow player-authored entries only',()=>{
  const f=fixture();
  const r={discoveredIds:[],completedIds:[],discoveredShopIds:[],customEntries:[
    {id:'one',masterId:'fac_wilbur_bag_1',shopId:'shop_wilbur',completed:true},
    {id:'custom',masterId:null,shopName:'牧場の近所',completed:false}
  ]};
  f.sandbox.state.playerRecords.facilities=r;
  f.eval('recordBookSyncFacilityIds(state.playerRecords.facilities)');
  assert.deepEqual(plain(r.discoveredIds),['fac_wilbur_bag_1']);
  assert.deepEqual(plain(r.completedIds),['fac_wilbur_bag_1']);
  assert.deepEqual(plain(r.discoveredShopIds),['shop_wilbur']);
  r.customEntries[0].completed=false;
  f.eval('recordBookSyncFacilityIds(state.playerRecords.facilities)');
  assert.deepEqual(plain(r.completedIds),[]);
  r.customEntries=[];
  f.eval('recordBookSyncFacilityIds(state.playerRecords.facilities,"fac_wilbur_bag_1")');
  assert.deepEqual(plain(r.discoveredIds),[]);
  assert.deepEqual(plain(r.completedIds),[]);
});

test('tool grade resolver recognizes owned stages but never autocompletes unknown upgrades',()=>{
  const f=fixture();
  assert.deepEqual(plain(f.eval('recordBookToolResolve("hoe","オリハルコン")')),
    {stage:'orichalcum',custom:'',upgradeId:'tool_upgrade_hoe_orichalcum'});
  assert.deepEqual(plain(f.eval('recordBookToolResolve("watering_can","銀のじょうろ")')),
    {stage:'silver',custom:'',upgradeId:'tool_upgrade_watering_can_silver'});
  assert.deepEqual(plain(f.eval('recordBookToolResolve("hoe","まだ知らないグレード")')),
    {stage:null,custom:'まだ知らないグレード'});
  assert.deepEqual(plain(f.eval('recordBookToolResolve("milker","初期")')),
    {stage:'base',custom:''});
  assert.deepEqual(plain(f.eval('recordBookToolResolve("hoe","")')),
    {stage:null,custom:''});
});

test('upgrade material references expose only stages explicitly discovered by player',()=>{
  const f=fixture();
  f.sandbox.state.playerRecords.tools={ownedStageById:{},customStageById:{},notesById:{},discoveredUpgradeIds:[]};
  assert.deepEqual(plain(f.eval('recordBookDiscoveredForTool("hoe",state.playerRecords.tools)')),[]);
  f.sandbox.state.playerRecords.tools.discoveredUpgradeIds=['tool_upgrade_hoe_copper'];
  const visible=plain(f.eval('recordBookDiscoveredForTool("hoe",state.playerRecords.tools)'));
  assert.equal(visible.length,1);
  assert.equal(visible[0].name_ja,'銅のクワ');
  assert.ok(visible[0].materials.length>0);
  assert.ok(!visible.some(u=>u.stage==='silver'));
  assert.deepEqual(plain(f.eval('recordBookDiscoveredForTool("watering_can",state.playerRecords.tools)')),[]);
});

test('tap sorting, crop count, compact ranks, species shortcuts and no spoiled lists are wired',()=>{
  const html=readFileSync('index.html','utf8');
  const worker=readFileSync('sw.js','utf8');
  assert.ok(source.includes('recordSortButton'));
  assert.ok(source.includes('data-sort="birthday"'));
  assert.ok(source.includes('recordCropCount'));
  assert.ok(source.includes('recordAnimalGroupAdd'));
  assert.ok(source.includes('recordAnimalTypeAdd'));
  assert.ok(source.includes('recordRankIcon'));
  assert.ok(source.includes('recordBookMedalIcon'));
  assert.ok(source.includes('<svg class="recordMedalIcon"'));
  assert.ok(source.includes('recordAnimalFriendship'));
  assert.ok(source.includes('recordAnimalRelaxation'));
  assert.ok(source.includes('recordCropAdjust'));
  assert.ok(source.includes('recordCropHarvest'));
  assert.ok(source.includes('recordBookPage'));
  assert.ok(source.includes('recordFacilityToggle'));
  assert.ok(source.includes('recordToolKnownRecipes'));
  assert.ok(!source.includes('RECORD_MASTER.facilities.map('));
  assert.ok(!source.includes('RECORD_MASTER.shops.map('));
  assert.ok(!source.includes('RECORD_MASTER.upgrades.map('));
  assert.ok(html.includes('<script src="./record-master.js"></script>'));
  assert.ok(worker.includes("'./record-master.js'"));
});

test('harvested crops remain visible until archived, can be restored, and can cycle for repeat harvests',async()=>{
  const f=fixture();
  const crop={id:'c1',name:'オリーブ',count:16,harvestCount:0};
  f.sandbox.state.playerRecords={fields:{note:'',entries:[],crops:[crop]}};
  f.sandbox.save=async()=>true;
  f.sandbox.toast=()=>{};
  f.sandbox.renderRecordFields=()=>{};
  await f.eval('recordBookSetCropFlags("c1",{archived:true})');
  assert.equal(crop.archived,undefined,'unharvested crops cannot be archived');
  await f.eval('recordBookHarvestCrop("c1")');
  assert.equal(crop.harvested,true);
  assert.equal(crop.harvestCount,1);
  assert.equal(crop.count,16);
  await f.eval('recordBookHarvestCrop("c1")');
  assert.equal(crop.harvestCount,1,'repeated taps must not double-count');
  await f.eval('recordBookSetCropFlags("c1",{archived:true})');
  assert.equal(crop.archived,true);
  await f.eval('recordBookAdjustCrop("c1",-1)');
  assert.equal(crop.count,16,'archived records cannot be incremented or decremented');
  await f.eval('recordBookSetCropFlags("c1",{archived:false})');
  assert.equal(crop.archived,false);
  assert.equal(crop.harvested,true);
  await f.eval('recordBookSetCropFlags("c1",{harvested:false})');
  assert.equal(crop.harvested,false);
  await f.eval('recordBookHarvestCrop("c1")');
  assert.equal(crop.harvestCount,2);
  assert.equal(crop.count,16,'regrowing crops and trees keep their planting count');
});
test('bazaar rank recording uses only a player-entered name and never reveals future facility items',()=>{
  const f=fixture();
  f.eval('normalizePlayerRecords(state)');
  assert.deepEqual(plain(f.eval('recordBookBazaarRankResolve("町のバザール")')),{rankName:'町のバザール',rankNumber:3});
  assert.deepEqual(plain(f.eval('recordBookBazaarRankResolve("30")')),{rankName:'30',rankNumber:30});
  assert.deepEqual(plain(f.eval('recordBookBazaarRankResolve("")')),{rankName:'',rankNumber:null});
  assert.deepEqual(plain(f.eval('recordBookBazaarRankResolve("自分の呼び方")')),{rankName:'自分の呼び方',rankNumber:null});
  assert.ok(!source.includes('RECORD_MASTER.ranks.map('));
  assert.ok(!source.includes('RECORD_MASTER.facilities.map('));
  assert.ok(source.includes('recordBazaarRankEdit'));
});
test('only upgradeable tools are listed and grade is the only editable field',()=>{
  assert.ok(source.includes('RECORD_MASTER.tools.filter(t=>t.upgradable)'));
  assert.ok(source.includes('recordToolGrade'));
  assert.ok(!source.includes('recordToolDiscovered'));
  assert.ok(!source.includes('recordToolNote'));
  assert.ok(!source.includes('recordToolQuick'));
  assert.ok(source.includes('recordToolKnownRecipes'));
});
test('harvested and archived controls are wired with an explicit return to growing state',()=>{
  assert.ok(source.includes('recordCropHarvestedLabel'));
  assert.ok(source.includes('recordCropArchive'));
  assert.ok(source.includes('recordCropRestore'));
  assert.ok(source.includes('recordCropResume'));
  assert.ok(source.includes('archived.length'));
  assert.ok(source.includes('crops.filter(c=>c&&!c.archived)'));
});

test('harvest uses the shared five-second Undo and restores prior crop state without touching planting count',async()=>{
  const f=fixture(),crop={id:'c1',name:'オリーブ',count:16,harvestCount:2,lastHarvestedAt:'2026-10-18T10:00:00Z'};
  f.sandbox.state.playerRecords={fields:{crops:[crop],note:'残しておく',entries:[]}};
  f.sandbox.save=async()=>true;
  f.sandbox.toast=()=>{};
  f.sandbox.renderRecordFields=()=>{};
  await f.eval('recordBookHarvestCrop("c1")');
  assert.equal(crop.harvestCount,3);
  assert.equal(crop.harvested,true);
  assert.equal(crop.count,16);
  assert.equal(crop.harvestUndo,undefined,'old always-visible undo metadata is no longer added');
  assert.equal(f.sandbox.lastUndo.label,'収穫を元に戻せます');
  const before=plain(f.sandbox.lastUndo.snapshot);
  const previous=before.playerRecords.fields.crops[0];
  assert.equal(previous.harvestCount,2);
  assert.equal(previous.lastHarvestedAt,'2026-10-18T10:00:00Z');
  assert.equal(previous.harvested,undefined);
  assert.equal(previous.count,16);
  f.sandbox.state=before;
  assert.equal(f.sandbox.state.playerRecords.fields.note,'残しておく');
  assert.equal(f.sandbox.state.playerRecords.fields.crops[0].count,16);
});
test('harvest save failure rolls the visible state back and never offers Undo',async()=>{
  const f=fixture(),crop={id:'c1',name:'トマト',count:3,harvestCount:4};
  f.sandbox.state.playerRecords={fields:{crops:[crop]}};
  f.sandbox.toast=()=>{};
  f.sandbox.renderRecordFields=()=>{};
  f.sandbox.save=async()=>false;
  await f.eval('recordBookHarvestCrop("c1")');
  assert.equal(crop.harvestCount,4);
  assert.equal(crop.harvested,undefined);
  assert.equal(crop.lastHarvestedAt,undefined);
  assert.equal(f.sandbox.lastUndo,undefined);
});
test('crop row harvest control binds via the multi-selector and no persistent Undo button remains',async()=>{
  const f=fixture(),crop={id:'c1',name:'にんじん',count:2,harvestCount:0};
  f.sandbox.state.playerRecords={fields:{note:'',entries:[],crops:[crop]}};
  const nodes={};
  f.sandbox.$=id=>id==='#recordCropAdd'?(nodes.add={onclick:null}):null;
  f.sandbox.$$=sel=>sel==='.recordCropHarvest'?[nodes.harvest={dataset:{id:'c1'},onclick:null}]:[];
  f.sandbox.recordBookPage=()=>{};
  f.sandbox.recordBookShell=()=>'<div>sheet</div>';
  f.sandbox.bindRecordBookBack=()=>{};
  f.sandbox.esc=s=>String(s);
  f.sandbox.leaveRecordBook=async fn=>fn();
  f.sandbox.save=async()=>true;
  f.sandbox.toast=()=>{};
  f.eval('renderRecordFields()');
  f.sandbox.renderRecordFields=()=>{};
  assert.equal(typeof nodes.harvest.onclick,'function');
  await nodes.harvest.onclick();
  assert.equal(crop.harvested,true);
  assert.equal(crop.harvestCount,1);
  assert.equal(f.sandbox.lastUndo.label,'収穫を元に戻せます');
  assert.ok(source.includes("$$('.recordCropHarvest').forEach("));
  assert.ok(!source.split('\n').some(line=>/^\s*\$\('\.recordCropHarvest'\)\.forEach/.test(line)));
  assert.ok(!source.includes('recordCropUndo'));
  assert.ok(!source.includes('recordBookUndoHarvestCrop'));
});
test('the shared Undo button refreshes an open record bottom sheet after restoring state',async()=>{
  const html=readFileSync('index.html','utf8');
  const start=html.indexOf("$('#undoBtn').onclick=async()=>{");
  const end=html.indexOf('\nfunction show(id)',start);
  assert.ok(start>0&&end>start,'shared Undo handler was not found');
  const undoSource=html.slice(start,end);
  const before={playerRecords:{fields:{crops:[{id:'c1',name:'にんじん',count:2,harvestCount:0}]}}};
  const modal={classList:{contains:v=>v==='open'}};
  const sheet={classList:{contains:v=>v==='recordBookViewSheet'}};
  const undo={classList:{remove(){}}};
  const button={onclick:null};
  let didRender=false,didRefresh=false,didDispose=false,didSave=false;
  const context={
    undoSnapshot:before,memoLinksUndo:null,memoEditors:new Set(),
    state:{playerRecords:{fields:{crops:[{id:'c1',count:2,harvestCount:1,harvested:true}]}}},
    recordBookView:'fields',
    recordBookEditor:{dispose(){didDispose=true}},
    $:selector=>({'#undoBtn':button,'#modal':modal,'#modalSheet':sheet,'#undo':undo})[selector]||null,
    flushMemoEditors:async()=>true,
    replaceMemoState(next){context.state=next},
    render(){didRender=true},
    renderRecordBookView(){didRefresh=true},
    memoOperation:()=>async()=>{didSave=true;return true},
    toast(){}
  };
  runInNewContext(undoSource,context);
  assert.equal(typeof button.onclick,'function');
  await button.onclick();
  assert.equal(context.state, before);
  assert.equal(context.recordBookEditor,null);
  assert.ok(didRender&&didRefresh&&didDispose&&didSave);
});
test('undo is a temporary shared action, not a permanently visible crop control',()=>{
  const html=readFileSync('index.html','utf8');
  assert.ok(source.includes("withUndo('収穫を元に戻せます'"));
  assert.ok(html.includes("undoTimer=setTimeout("));
  assert.ok(html.includes("},5000)"));
  assert.ok(html.includes('<div id="undo" class="undo">'));
  assert.ok(!html.includes('.recordCropUndo{'));
});

test('harvest is a prominent button next to the crop name, and Undo remains temporary',()=>{
  const start=source.indexOf('function renderRecordFields(){');
  const end=source.indexOf('async function recordBookAdjustCrop',start);
  assert.ok(start>=0&&end>start);
  const render=source.slice(start,end);
  assert.match(render, /recordCropIdentity[\s\S]*?recordCropRow[\s\S]*?recordCropHarvest[\s\S]*?recordCropStepper/);
  const afterBottom=render.slice(render.indexOf('<div class="recordCropBottom">'));
  assert.ok(!afterBottom.includes('<button class="recordCropHarvest"'));
  assert.ok(source.includes("$$('.recordCropHarvest').forEach("));
  assert.ok(source.includes("withUndo('収穫を元に戻せます'"));
});
test('crop name suggestions use existing field records and player-discovered seed knowledge only',()=>{
  const f=fixture();
  f.sandbox.state.playerRecords={fields:{crops:[{id:'a',name:'オリーブ'},{id:'b',name:'トマト',archived:true}]}};
  f.sandbox.state.knownEntities=['tomato_seeds','secret_seed','unseen_tomato'];
  f.sandbox.state.playerState={tomato_seeds:{seedCount:4}};
  f.sandbox.ent=id=>({tomato_seeds:{id,kind:'seed',name_ja:'トマトの種'},
    secret_seed:{id,kind:'seed',name_ja:'未発見の種'},unseen_tomato:{id,kind:'crop',name_ja:'未発見の野菜'}})[id]||null;
  f.sandbox.cultivationSource=e=>e;
  f.sandbox.name=id=>({tomato_seeds:'トマトの種'})[id]||id;
  const names=plain(f.eval('recordBookKnownCropNames()'));
  assert.ok(names.includes('オリーブ'));
  assert.ok(names.includes('トマト'));
  assert.ok(!names.some(x=>x.includes('未発見')));
  assert.equal(names.filter(x=>x==='トマト').length,1);
});
test('facility suggestions require prior player discovery and respect the entered contractor',()=>{
  const f=fixture();
  const discovered=master.facilities.find(x=>x.name_ja&&x.shop_id==='shop_wilbur');
  assert.ok(discovered);
  f.sandbox.state.playerRecords={facilities:{
    discoveredIds:[],completedIds:[],discoveredShopIds:[],
    customEntries:[{id:'f1',title:'倉庫を自分で改良',shopName:'ウィルバー'},
                   {id:'f2',title:'土の改良を記録',shopName:'ゴラン'}]}};
  const privateNames=plain(f.eval('recordBookKnownFacilityNames("ウィルバー")'));
  assert.deepEqual(privateNames,['倉庫を自分で改良']);
  assert.ok(!privateNames.includes(discovered.name_ja));
  assert.deepEqual(plain(f.eval('recordBookKnownFacilityNames("ゴラン")')),['土の改良を記録']);
  const shopNames=plain(f.eval('recordBookKnownShopNames()'));
  assert.deepEqual(shopNames,['ウィルバー','ゴラン']);
  f.sandbox.state.playerRecords.facilities.discoveredIds=[discovered.id];
  const withMaster=plain(f.eval('recordBookKnownFacilityNames("ウィルバー")'));
  assert.ok(withMaster.includes(discovered.name_ja));
});
test('tool grade suggestions never reveal unknown future upgrade stages',()=>{
  const f=fixture();
  f.sandbox.state.playerRecords={tools:{
    ownedStageById:{hoe:'gold'},customStageById:{},discoveredUpgradeIds:[],notesById:{}
  }};
  let labels=plain(f.eval('recordBookKnownToolGrades("hoe")'));
  assert.ok(labels.includes('金のクワ'));
  assert.ok(!labels.some(x=>x.includes('オリハルコン')));
  assert.ok(!labels.some(x=>x.includes('究極')));
  assert.deepEqual(plain(f.eval('recordBookKnownToolGrades("watering_can")')),[]);
  f.sandbox.state.playerRecords.tools.discoveredUpgradeIds=['tool_upgrade_hoe_copper'];
  labels=plain(f.eval('recordBookKnownToolGrades("hoe")'));
  assert.ok(labels.includes('銅のクワ'));
  assert.ok(!labels.some(x=>x.includes('銀のクワ')));
});
test('suggestion chips filter names and fill the input when tapped',()=>{
  const f=fixture();
  const listeners={};
  const input={value:'オ',addEventListener(type,cb){listeners[type]=cb},
    dispatchEvent(e){listeners[e.type]?.(e)}};
  const box={hidden:true,_html:'',items:[],set innerHTML(v){this._html=v;this.items=[]},
    get innerHTML(){return this._html},append(b){this.items.push(b)}};
  f.sandbox.$=q=>({'#recordCropName':input,'#recordCropNameSuggestions':box})[q];
  f.sandbox.document={createElement(type){
    assert.equal(type,'button');
    return {addEventListener(kind,cb){this[kind]=cb},type:'',textContent:'',className:''};
  }};
  f.sandbox.Event=class{constructor(type){this.type=type}};
  f.sandbox.inputChoices=()=>['オリーブ','オレンジ','未発見の作物'];
  f.eval('recordBookBindKnownSuggestions("recordCropName",inputChoices)');
  listeners.input();
  assert.equal(box.hidden,false);
  assert.deepEqual(box.items.map(b=>b.textContent),['オリーブ','オレンジ']);
  box.items[0].click();
  assert.equal(input.value,'オリーブ');
  assert.equal(box.hidden,true);
});
