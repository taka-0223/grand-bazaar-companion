import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext,Script} from 'node:vm';
import {projectRuntimeMaster} from '../lib/runtime-master-projection.mjs';

const source=readFileSync('record-book.js','utf8');
const html=readFileSync('index.html','utf8');
const full=JSON.parse(readFileSync('data/board-master.full.v1.json','utf8'));
const plain=value=>JSON.parse(JSON.stringify(value));

function fixture(overrides={}){
  const input={schemaVersion:7,season:'冬',knownEntities:['chicken'],captures:[{id:'note-existing',text:'残しておく'}],residentProfiles:{},ui:{recent:[]},requests:[]};
  const sandbox={state:input,MASTER:projectRuntimeMaster(full),CAL_SEASONS:['春','夏','秋','冬'],
    norm:s=>String(s).normalize('NFKC').trim().toLowerCase().replace(/[\s　・･\-_]+/g,''),
    residentBirthday(name){return {カゲツ:{season:'春',day:5},アギ:{season:'冬',day:28},ミーナ:{season:'冬',day:4}}[name]||null},
    knownResidentNames(){return [...new Set([...Object.keys(sandbox.state.residentProfiles),...sandbox.state.requests.map(x=>x.requester),...sandbox.state.ui.recent.filter(x=>x.kind==='resident').map(x=>x.id)])]},
    residentProfile(name){return sandbox.state.residentProfiles[name]||{}},
    esc:s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
    ...overrides};
  runInNewContext(source,sandbox);
  return {sandbox,evalCode:code=>runInNewContext(code,sandbox)};
}

test('standalone record UI script is syntactically valid and loaded before the main app bootstrap',()=>{
  new Script(source);
  assert.ok(html.indexOf('<script src="./record-book.js"></script>')<html.indexOf('const MASTER=JSON.parse'));
  assert.ok(html.indexOf('<script src="./record-master.js"></script>')<html.indexOf('<script src="./record-book.js"></script>'));
  assert.ok(html.includes('normalizePlayerRecords(x);'));
  assert.ok(!html.includes("if(typeof renderRecordBookView==='function'&&renderRecordBookView())return;"));
  assert.ok(source.includes("$('#modalSheet').classList.add('recordBookViewSheet')"));
  assert.ok(html.includes('renderRecordBookHub();'));
});

test('optional playerRecords normalization preserves schema 7 and prior user state',()=>{
  const f=fixture();
  f.evalCode('normalizePlayerRecords(state)');
  assert.equal(f.sandbox.state.schemaVersion,7);
  assert.deepEqual(plain(f.sandbox.state.captures),[{id:'note-existing',text:'残しておく'}]);
  assert.deepEqual(plain(f.sandbox.state.playerRecords),{
    fields:{note:'',entries:[],crops:[]},barn:{animals:[],contestRankByAnimalId:{}},
    bazaar:{rankName:'',rankNumber:null},
    facilities:{discoveredIds:[],completedIds:[],discoveredShopIds:[],notesById:{},customEntries:[]},
    tools:{ownedStageById:{},discoveredUpgradeIds:[],notesById:{},customStageById:{}}
  });
  f.sandbox.state.playerRecords.fields.note='手前の畑\n翌日は水やり';
  f.sandbox.state.playerRecords.barn.animals=[{id:'a1',speciesName:'ニワトリ',nickname:'タマ'}];
  f.sandbox.state.playerRecords.barn.contestRankByAnimalId.chicken='silver';
  f.evalCode('normalizePlayerRecords(state)');
  assert.equal(f.sandbox.state.playerRecords.fields.note,'手前の畑\n翌日は水やり');
  assert.equal(f.sandbox.state.playerRecords.barn.animals.length,1);
  assert.equal(f.sandbox.state.playerRecords.barn.contestRankByAnimalId.chicken,'silver');
});

test('encountered resident list sorts correctly and never reads all resident birthday names',()=>{
  const f=fixture();
  f.sandbox.state.residentProfiles={'未知さん':{registered:true},'ミーナ':{},'アギ':{}};
  f.sandbox.state.requests=[{requester:'カゲツ'}];
  assert.deepEqual(plain(f.evalCode('recordResidentNames("name")')),
    ['アギ','カゲツ','ミーナ','未知さん']);
  assert.deepEqual(plain(f.evalCode('recordResidentNames("birthday")')),
    ['カゲツ','ミーナ','アギ','未知さん']);
  assert.equal(f.evalCode('recordResidentNames().includes("フェリックス")'),false);
});

test('animal type canonicalization requires an exact player-entered name; no spoiler candidates',()=>{
  const f=fixture();
  assert.deepEqual(plain(f.evalCode('recordBookSpecies("ニワトリ")')),{animalId:'chicken',speciesName:'ニワトリ'});
  assert.deepEqual(plain(f.evalCode('recordBookSpecies("ニワ")')),{animalId:null,speciesName:'ニワ'});
  assert.deepEqual(plain(f.evalCode('recordBookSpecies("わが家の新種")')),{animalId:null,speciesName:'わが家の新種'});
  assert.equal(source.includes('datalist'),false);
  assert.equal(source.includes('MASTER.animals.map('),false);
});

test('record bottom sheet keeps its scroll position when updating the same category',()=>{
  const sheet={scrollTop:196,dataset:{recordView:'barn'},classes:new Set(['recordBookViewSheet'])};
  sheet.classList={contains:value=>sheet.classes.has(value),add:value=>sheet.classes.add(value)};
  const f=fixture({
    $:()=>sheet,
    modal:()=>{sheet.scrollTop=0;sheet.classes.delete('recordBookViewSheet')}
  });
  f.evalCode('recordBookView="barn";recordBookPage("更新");');
  assert.equal(sheet.scrollTop,196);
  f.evalCode('recordBookView="fields";recordBookPage("別の項目");');
  assert.equal(sheet.scrollTop,0);
});

test('one rank is shared by individuals of exactly the same animal type',()=>{
  const f=fixture();
  const animals=[
    {id:'1',animalId:'chicken',speciesName:'ニワトリ',nickname:'ココ'},
    {id:'2',animalId:'chicken',speciesName:'ニワトリ',nickname:'ピヨ'},
    {id:'3',animalId:'cow',speciesName:'ウシ',nickname:'モモ'},
    {id:'4',animalId:null,speciesName:'飼い主の呼び名',nickname:'タロウ'}
  ];
  f.sandbox.state.playerRecords={barn:{animals,contestRankByAnimalId:{chicken:'gold'}}};
  const groups=plain(f.evalCode('recordBookAnimalGroups(state.playerRecords.barn.animals)'));
  assert.equal(groups.length,3);
  assert.deepEqual(groups.map(g=>[g.key,g.animals.length]),[['chicken',2],['cow',1],['custom:飼い主の呼び名',1]]);
  assert.equal(f.sandbox.state.playerRecords.barn.contestRankByAnimalId.chicken,'gold');
});

test('no predeclared field count or locked farm area names leak into the record UI',()=>{
  assert.ok(source.includes('畑の数や区画は決め打ちしません'));
  assert.ok(source.includes('fields.entries'));
  assert.ok(!source.includes('12×6'));
  assert.ok(!source.includes('ゴラン'));
  assert.ok(!source.includes('ウィルバー'));
  assert.ok(!source.includes('畑2'));
});

