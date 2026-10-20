import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext,Script} from 'node:vm';

const html=readFileSync('index.html','utf8');
const start=html.indexOf('const MASTER=JSON.parse');
assert.ok(start>=0);
const app=html.slice(start,html.indexOf('</script>',start));
function section(a,b){
  const start=app.indexOf(a),end=app.indexOf(b,start+a.length);
  assert.ok(start>=0&&end>start,'Missing section '+a);
  return app.slice(start,end);
}
const suggestSource=section('function recipeRegistrationCandidates(', 'function openKnownRecipe(');
const groupSource=section('function knownGroupOptions(', 'function recipeGoalFor(');
const titles={
  pizza:'ピザ',
  pizza_toast:'ピザトースト',
  herb_sandwich:'ハーブサンドイッチ',
  herb_tea:'ハーブティー',
  cookie:'クッキー',
  mint_tea:'ミントティー'
};
const recipes=Object.keys(titles).map(id=>({id}));
const normalize=s=>String(s||'').normalize('NFKC').trim().toLowerCase().replace(/[\s　・･\-_]+/g,'')
  .replace(/[ァ-ヶ]/g,ch=>String.fromCharCode(ch.charCodeAt(0)-0x60));
function suggest(text,known=[]){
  const c={state:{knownRecipes:known},RECIPE_ROWS:recipes,FALLBACK_RECIPES:{},norm:normalize,rname:id=>titles[id]};
  const fn=runInNewContext(suggestSource+'\nrecipeRegistrationCandidates',c);
  return Array.from(fn(text),r=>r.id);
}
test('existing discovered recipes can be found with short partial names',()=>{
  assert.deepEqual(suggest('ピ',['pizza']),['pizza']);
  assert.deepEqual(suggest('ク',['cookie']),['cookie']);
  assert.deepEqual(suggest('ハーブ',['herb_sandwich']),['herb_sandwich']);
});
test('unknown recipes never appear in a short or ambiguous candidate list',()=>{
  assert.deepEqual(suggest(''),[]);
  assert.deepEqual(suggest('ピ'),[]);
  assert.deepEqual(suggest('ハー'),[]);
  assert.deepEqual(suggest('ハーブ'),[]);
  assert.deepEqual(suggest('ティー'),[]);
});
test('a strongly implied single unknown recipe can be suggested, but only from a prefix',()=>{
  assert.deepEqual(suggest('ピザ'),['pizza']);
  assert.deepEqual(suggest('ピザトースト',['pizza']),['pizza_toast']);
  assert.deepEqual(suggest('ハーブサン'),['herb_sandwich']);
  assert.deepEqual(suggest('ブサンド'),[]);
  assert.deepEqual(suggest('ハーブティー'),['herb_tea']);
  assert.deepEqual(suggest('グランドバザール'),[]);
});
test('known recipe candidates update as the player registers recipes',()=>{
  const known=[];
  assert.deepEqual(suggest('ク',known),[]);
  known.push('cookie');
  assert.deepEqual(suggest('ク',known),['cookie']);
});
test('known ingredient group options derive from recorded knowledge, not inventory',()=>{
  const c={
    state:{knownEntities:[]},
    groupById:new Map([['herbs',{members:['mint','lavender','unknown']}]]),
  };
  const knownGroupOptions=runInNewContext(groupSource+'\nknownGroupOptions',c);
  assert.deepEqual(Array.from(knownGroupOptions('herbs')),[]);
  c.state.knownEntities.push('mint');
  assert.deepEqual(Array.from(knownGroupOptions('herbs')),['mint']);
  c.state.knownEntities.push('lavender');
  assert.deepEqual(Array.from(knownGroupOptions('herbs')),['mint','lavender']);
  assert.ok(!groupSource.includes('inventory'));
});
test('tapping an existing crop opens its editable details immediately, without a second tap',()=>{
  const show=section('function showCrop(id,opts={}){','function intOrNull(');
  const cropRows=section('function bindCropRows(){','function refreshCropResults(');
  assert.ok(cropRows.includes("$$('.cropOpen').forEach(b=>b.onclick=()=>showCrop(b.dataset.id))"));
  assert.ok(show.includes('id="seedCount"'),'Seed count should be accessible on first tap');
  assert.ok(show.includes('id="growingCount"'),'Growing amount should be directly editable');
  assert.ok(show.includes('id="cropNote"'));
  assert.ok(show.includes('id="locationSelect"'));
  assert.ok(show.includes('id="cropStockDecision"'));
  assert.ok(show.includes('id="cropGrowingBanner"'),'Keep existing growing badge');
  assert.ok(!show.includes('id="cropEditToggle"'),'No new tap to open editing');
  assert.ok(!show.includes('id="cropEditFields"'),'Editable fields should be visible by default');
  assert.ok(!show.includes('cropReadOverview'),'Undo the newly introduced summary/editor detour');
  assert.ok(show.includes('const persistCrop=async()=>'));
  assert.ok(show.includes("bindAutosave([$('#seedCount'),$('#growingCount'),$('#cropNote')],persistCrop)"));
  assert.ok(!html.includes('.cropCompact.growing{background:'),'Green row background must stay removed');
  assert.ok(html.includes('class="cropGrowingBadge"'));
  assert.ok(!html.includes('.cropGrowingBanner.active{background:#e3f2df'));
});

test('new crop registration opens the name form without forcing keyboard focus and returns to list',async()=>{
  const editor=section('function openAddKnown(){','const FALLBACK_RECIPES=');
  assert.ok(editor.includes('<input id="knownName"'));
  assert.ok(!editor.includes('autofocus'));
  assert.ok(!editor.includes('?.focus('));
  const dom={},events=[],playerState={};
  dom['#knownName']={value:'',focus(){throw Error('Name field must not be focused automatically')}};
  dom['#registerKnown']={onclick:null};
  dom['#knownKind']={value:'crop'};
  dom['#knownKindWrap']={style:{}};
  dom['#knownDetect']={textContent:'',innerHTML:''};
  const known={id:'tomato_seed',name_ja:'トマトの種',kind:'seed'};
  const state={knownEntities:[],customEntities:[],playerState};
  const context={
    deferMemoNavigation:()=>false,
    modal:markup=>events.push(['modal',markup]),
    $:id=>dom[id],
    findByName:name=>name==='トマトの種'?known:null,
    masterSeasonsForId:()=>['春','夏'],
    player:id=>playerState[id]||(playerState[id]={knownSeasons:[]}),
    state,
    save:async()=>events.push(['save']),
    closeModal:()=>events.push(['close']),
    crops:()=>events.push(['list']),
    toast:s=>events.push(['toast',s]),
    showCrop:()=>{throw Error('New registration must not auto-open the item editor')},
    name:id=>id==='tomato_seed'?'トマトの種':id,
    kindLabelForEntity:()=> '作物',
    setTimeout:()=>{throw Error('New registration must not schedule a keyboard focus')},
    esc:String
  };
  const open=runInNewContext(editor+'\nopenAddKnown',context);
  open();
  assert.equal(events[0][0],'modal');
  assert.ok(dom['#registerKnown'].onclick);
  dom['#knownName'].value='トマトの種';
  await dom['#registerKnown'].onclick();
  assert.deepEqual(state.knownEntities,['tomato_seed']);
  assert.deepEqual(Array.from(playerState.tomato_seed.knownSeasons),['春','夏']);
  assert.deepEqual(events.map(x=>x[0]),['modal','save','close','list','toast']);
});
test('recipe selection does not register an item until explicit confirmation',()=>{
  const editor=section('function openKnownRecipe(){','function playerHint(');
  assert.ok(editor.includes('id="knownRecipeCandidates"'));
  assert.ok(editor.includes("$$('.knownRecipeCandidate').forEach"));
  assert.ok(editor.includes("$('#knownRecipeName').addEventListener('input',showRecipeCandidates)"));
  assert.ok(editor.includes("$('#knownRecipeName').value=rname(r.id)"));
  assert.ok(editor.includes("$('#registerRecipe').onclick=async()=>"));
  assert.ok(editor.indexOf("state.knownRecipes.push(r.id)")>editor.indexOf("$('#registerRecipe').onclick=async()=>"));
  assert.ok(editor.includes('知っている料理は名前の一部で検索できます'));
  assert.ok(app.includes('所持している現物や在庫数を表すものではありません'));
  assert.equal((html.match(/知っている候補：/g)||[]).length,3);
  new Script(app);
});
