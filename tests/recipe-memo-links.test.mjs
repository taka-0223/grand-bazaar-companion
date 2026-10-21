import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,body,current,saved,clone,html,navSource} from './helpers/memo-harness.mjs';

const cases=[
  ['ピザを作りたい',['ピザ'],['ピザ']],
  ['チーズケーキ作る',['ケーキ','チーズケーキ'],['チーズケーキ']],
  ['チーズケーキ作る',['ケーキ'],[]],
  ['ぶどうパンを焼く',['パン'],[]],['パンを買う',['パン'],['パン']],
  ['フライパンを買う',['パン'],[]],['卵かけご飯にする',['ご飯'],[]],
  ['ピザとご飯',['ピザ','ご飯'],['ピザ','ご飯']],['湯豆腐',['豆腐'],[]],
  ['あげだし豆腐',['豆腐'],[]],['焼きうどん',['うどん'],[]],
  ['うどんを10杯',['うどん'],['うどん']],['豆乳プリン',['プリン'],['プリン']],
  ['フレンチトースト',['トースト'],[]],
  ['チョコホールケーキ',['ケーキ','ホールケーキ','チョコホールケーキ'],['チョコホールケーキ']],
  ['ﾋﾟｻﾞを作る',['ピザ'],['ピザ']],['ぴざ作る',['ピザ'],['ピザ']],
  ['ピザ、パン、ご飯、ケーキ',['ピザ','パン','ご飯','ケーキ'],['ピザ','パン','ご飯']],
  ['mysteryを作る',['mystery'],[]],['ピザ×10',['ピザ'],['ピザ']],
  ['ピザピザ',['ピザ'],[]],['おいしいピザ',['ピザ'],[]],
  ['うどん屋に行く',['うどん'],['うどん']],['焼きたてのピザ',['ピザ'],['ピザ']],
  ['ピザが食べたい',['ピザ'],['ピザ']]
];
function setup(text='ピザとパン',options={}){
  const h=harness({names:{pizza:'ピザ',bread:'パン',rice:'ご飯',cake:'ケーキ',secret:'秘密料理',...options.names},...options});
  h.ctx.state.knownRecipes=['pizza','bread','rice','cake'];current(h).text=text;return h;
}
const choices=(h,where='#memoLinksCandidates')=>h.$(where).querySelectorAll('.memoLinkChoice');
const remove=h=>h.$('#memoLinksSelected').querySelectorAll('.memoLinkRemove');
async function toggle(h,index=0){const work=choices(h)[index].dispatch('change');await h.finishWrites();await work}
async function undo(h){const work=h.$('#undoBtn').click();await h.finishWrites();await work}
const links=h=>clone(current(h).links);
for(const [index,[text,known,expected]] of cases.entries())test(`M-${index+1}: ${text}`,()=>{
  const names=Object.fromEntries(known.map((label,i)=>['r'+i,label]));if(index===18){delete names.r0}
  const h=harness({names});h.ctx.state.knownRecipes=known.map((_,i)=>'r'+i);
  assert.deepEqual(clone(h.ctx.memoRecipeCandidates(text)),expected.map(label=>'r'+known.indexOf(label)));
});

test('longest matches precede linked exclusion; no space/middot removal; Latin case folding',()=>{
  const h=harness({names:{p:'豆乳プリン',s:'プリン',l:'ABC',a:'ピザ パン',b:'ピザ・パン',one:'飯'}});h.ctx.state.knownRecipes=['p','s','l','a','b','one'];
  assert.deepEqual(clone(h.ctx.memoRecipeCandidates('豆乳プリン',['p'])),[]);
  assert.deepEqual(clone(h.ctx.memoRecipeCandidates('abc!')),['l']);
  assert.deepEqual(clone(h.ctx.memoRecipeCandidates('ピザパン 飯')),[]);
  assert.deepEqual(clone(h.ctx.memoRecipeCandidates('ピザ パン、ピザ・パン')),['a','b']);
});

test('known-only candidates/search and generic unresolved labels do not expose IDs or Master names',()=>{
  const h=setup('秘密料理とpizzaとピザ');current(h).links=[{kind:'recipe',id:'secret'},{kind:'recipe',id:'unresolved'}];h.ctx.state.knownRecipes.push('unresolved');
  h.ctx.openCapture('a');assert.equal(h.pending.length,0);
  assert.equal(h.$('#memoLinksSelected').innerHTML.includes('未確認のつながり'),true);
  for(const forbidden of ['秘密料理','secret','unresolved'])assert.equal(h.$('#memoLinksSelected').innerHTML.includes(forbidden),false);
  assert.deepEqual(clone(h.ctx.memoRecipeCandidates('秘密料理とunresolved')),[]);
  assert.deepEqual(clone(h.ctx.searchMemoRecipes('秘密')),[]);
  h.$('#memoLinksSearch').click();h.input(h.$('#memoLinksQuery'),'秘密');
  assert.equal(h.$('#memoLinksResults').textContent,'知っている料理に見つかりません。料理タブで登録できます');
});

test('opening/list rendering and unselected candidates never save or create links',()=>{
  const h=setup();h.ctx.openCapture('a');assert.equal(choices(h).length,2);assert.ok(choices(h).every(x=>!x.checked));
  assert.equal(Object.hasOwn(current(h),'links'),false);assert.equal(h.pending.length,0);
  h.evaluate('disposeMemoEditors();memoRecipeMatches=()=>{throw Error("list must not match")};inbox()');
  assert.equal(h.pending.length,0);
});

test('new memo checkboxes only stage links; cancel discards; explicit Add stores kind/id once',async()=>{
  const h=setup();h.ctx.openCapture();h.input(body(h),'  ピザを作る\n★  ');h.runTimers(250);
  await choices(h)[0].dispatch('change');assert.equal(h.$('#memoLinksSelected').querySelector('.memoLinkDraftChoice').checked,true);assert.equal(h.ctx.state.captures.length,2);assert.equal(h.pending.length,0);
  await h.close();assert.equal(h.ctx.state.captures.length,2);
  h.ctx.openCapture();await h.finishWrites();h.input(body(h),'  ピザを作る\n★  ');h.runTimers(250);await choices(h)[0].dispatch('change');
  h.$('#addCaptureRecord').click();await h.finishWrites();
  assert.equal(saved(h).captures[0].text,'  ピザを作る\n★  ');assert.deepEqual(saved(h).captures[0].links,[{kind:'recipe',id:'pizza'}]);
});

test('new memo without a selection has no links field; failure retains staged links and same creation ID',async()=>{
  const h=setup('ピザ',{localFails:true,idbFails:true});h.ctx.openCapture();h.input(body(h),'ピザ');h.runTimers(250);choices(h)[0].dispatch('change');
  h.$('#addCaptureRecord').click();await h.finishWrites();const id=h.pending[0].record.captures[0].id;
  assert.equal(h.ctx.state.captures.length,2);assert.equal(h.$('#memoLinksSelected').querySelectorAll('.memoLinkDraftChoice').length,1);h.setFailures(false,false);
  h.$('#addCaptureRecord').click();await h.finishWrites();assert.equal(h.ctx.state.captures[0].id,id);assert.equal(h.ctx.state.captures.length,3);
  h.ctx.openCapture();await h.finishWrites();h.input(body(h),'選択なし');h.$('#addCaptureRecord').click();await h.finishWrites();assert.equal(Object.hasOwn(saved(h).captures[0],'links'),false);
});

test('dirty body/submemo flush before links; preserve raw input, other records and player knowledge',async()=>{
  const h=setup();h.ctx.openCapture('a');const el=body(h),other=clone(h.ctx.state.captures[1]),player=clone(h.ctx.state.playerState),known=clone(h.ctx.state.knownRecipes);
  const child=h.root.modalSheet.querySelector('.subInlineEditable');h.input(el,'  ピザとパン\n★  ');h.input(child,'  子\n☆  ');h.$('#subText').value='未追加';
  const work=choices(h)[0].dispatch('change');await h.until(()=>h.pending.length===1);
  assert.equal(Object.hasOwn(h.pending[0].record.captures[0],'links'),false);assert.equal(h.pending[0].record.captures[0].text,el.value);
  await h.finishWrites();await work;assert.equal(h.pending.length,2);assert.equal(body(h),el);
  assert.deepEqual(links(h),[{kind:'recipe',id:'pizza'}]);assert.equal(current(h).children[0].text,'  子\n☆  ');assert.equal(current(h).children.length,1);
  assert.deepEqual(clone(h.ctx.state.captures[1]),other);assert.deepEqual(clone(h.ctx.state.playerState),player);assert.deepEqual(clone(h.ctx.state.knownRecipes),known);
});

test('clean link operation saves once; repeated rapid taps do not duplicate; input during save is flushed',async()=>{
  const h=setup();h.ctx.openCapture('a');const button=choices(h)[0];button.dispatch('change');button.dispatch('change');
  await h.until(()=>h.pending.length===1);h.input(body(h),'保存中の最新\n★');
  await h.finishWrites();assert.equal(h.pending.length,2);assert.deepEqual(links(h),[{kind:'recipe',id:'pizza'}]);assert.equal(saved(h).captures[0].text,'保存中の最新\n★');
});

test('failed link save has retry, no success Undo, latest text and no duplicates on repeated retry',async()=>{
  const h=setup('ピザ',{localFails:true,idbFails:true});h.ctx.openCapture('a');await toggle(h);
  assert.equal(h.evaluate('memoLinksUndo'),null);assert.equal(h.$('#memoLinksRetry').classList.contains('hidden'),false);assert.equal(remove(h).length,1);
  h.$('#memoLinksRetry').click();await h.finishWrites();assert.equal(current(h).links.length,1);
  h.input(body(h),'  最新の本文\n★  ');h.setFailures(false,false);h.$('#memoLinksRetry').click();await h.finishWrites();
  assert.equal(saved(h).captures[0].text,'  最新の本文\n★  ');assert.equal(saved(h).captures[0].links.length,1);assert.ok(h.evaluate('memoLinksUndo'));
});

test('mixed future/invalid entries, unknown keys/order and duplicate link data survive reads and unrelated changes',async()=>{
  const h=setup('パン');const raw=[null,{kind:'future',id:'x',extra:[1]},{kind:'recipe',id:'pizza',extra:7},{kind:'recipe',id:'pizza',extra:8},{kind:'recipe',id:2}];current(h).links=clone(raw);
  h.ctx.openCapture('a');assert.deepEqual(links(h),raw);assert.equal(remove(h).length,1);
  await toggle(h);assert.deepEqual(links(h),[...raw,{kind:'recipe',id:'bread'}]);
  remove(h)[0].click();await h.finishWrites();assert.deepEqual(links(h),[raw[0],raw[1],raw[4],{kind:'recipe',id:'bread'}]);
  await undo(h);assert.deepEqual(links(h),[...raw,{kind:'recipe',id:'bread'}]);
});

test('last link removal deletes field only when empty, preserving unsupported entries',async()=>{
  for(const remaining of [[],[{kind:'future',id:'x'}]]){
    const h=setup();current(h).links=[{kind:'recipe',id:'pizza'},...remaining];h.ctx.openCapture('a');remove(h)[0].click();await h.finishWrites();
    assert.equal(Object.hasOwn(current(h),'links'),!!remaining.length);if(remaining.length)assert.deepEqual(links(h),remaining);
    await undo(h);assert.deepEqual(links(h),[{kind:'recipe',id:'pizza'},...remaining]);
  }
});

for(const malformed of ['future-format',{v:2},null])test('non-array links remain untouched while body is editable: '+JSON.stringify(malformed),async()=>{
  const h=setup();current(h).links=clone(malformed);h.ctx.openCapture('a');assert.equal(choices(h).length,0);assert.equal(h.$('#memoLinksSearch').disabled,true);
  assert.equal(h.ctx.changeCaptureLink(current(h),'pizza',true),false);h.input(body(h),'原文更新\n★');await h.close();
  assert.deepEqual(saved(h).captures[0].links,malformed);assert.equal(saved(h).captures[0].text,'原文更新\n★');
});

test('maximum three unique valid links; restored overflow is not truncated; only explicit removal changes it',async()=>{
  const h=setup('ピザ、パン、ご飯、ケーキ');h.ctx.openCapture('a');await toggle(h);await toggle(h);await toggle(h);
  assert.equal(current(h).links.length,3);assert.equal(h.ctx.changeCaptureLink(current(h),'cake',true),false);assert.equal(h.ctx.changeCaptureLink(current(h),'pizza',true),false);
  current(h).links.push({kind:'recipe',id:'cake',extra:1});h.evaluate('refreshMemoRecipeLinks()');assert.equal(remove(h).length,4);assert.equal(current(h).links.length,4);
});

test('manual search stays in sheet, normalizes names, and rechecks knowledge at click time',async()=>{
  const h=setup('おいしいピザ');h.ctx.openCapture('a');assert.equal(choices(h).length,0);const el=body(h);
  h.$('#memoLinksSearch').click();h.input(h.$('#memoLinksQuery'),'ﾋﾟｻﾞ');assert.equal(choices(h,'#memoLinksResults').length,1);
  const option=choices(h,'#memoLinksResults')[0];h.ctx.state.knownRecipes=[];option.dispatch('change');await h.finishWrites();assert.equal(Object.hasOwn(current(h),'links'),false);assert.equal(body(h),el);
});

test('IME blocks link changes/Undo, debounce preserves body DOM, disposed timers cannot touch another sheet',async()=>{
  const h=setup();h.ctx.openCapture('a');await toggle(h);const el=body(h),original=h.$('#memoLinksCandidates').innerHTML;
  el.dispatch('compositionstart');h.input(el,'パンへ変換中');h.runTimers(250);assert.equal(h.$('#memoLinksCandidates').innerHTML,original);
  await h.$('#undoBtn').click();assert.equal(current(h).links.length,1);assert.equal(body(h),el);
  el.dispatch('compositionend');h.runTimers(250);assert.equal(body(h),el);h.input(el,'遅延入力');await h.close();h.ctx.openCapture('b');const next=body(h);h.runTimers(250);assert.equal(body(h),next);
});

test('links-only Undo preserves later body, submemo, status, other state and editor DOM; editing still works afterwards',async()=>{
  const h=setup();h.ctx.openCapture('a');await toggle(h);const el=body(h),child=h.root.modalSheet.querySelector('.subInlineEditable');
  h.input(el,'  リンク後の本文\n★  ');h.input(child,'後の子\n☆');current(h).status='processed';h.ctx.state.actions.reverse();
  h.ctx.state=clone(h.ctx.state);await undo(h);
  assert.equal(Object.hasOwn(current(h),'links'),false);assert.equal(current(h).text,'  リンク後の本文\n★  ');assert.equal(current(h).children[0].text,'後の子\n☆');assert.equal(current(h).status,'processed');assert.equal(h.ctx.state.actions[0].id,'two');assert.equal(body(h),el);
  h.input(el,'Undo後の追記');await h.close();assert.equal(saved(h).captures[0].text,'Undo後の追記');
});

test('Undo flush failure keeps links/input/token; retry succeeds; Undo persistence failure retries without rolling back text',async()=>{
  const h=setup();h.ctx.openCapture('a');await toggle(h);h.setFailures(true,true);h.input(body(h),'保持する本文');await undo(h);assert.equal(current(h).links.length,1);assert.ok(h.evaluate('memoLinksUndo'));
  h.setFailures(false,false);await undo(h);assert.equal(Object.hasOwn(current(h),'links'),false);assert.equal(current(h).text,'保持する本文');
  h.input(body(h),'ピザ');h.runTimers(250);await toggle(h);h.setFailures(true,true);await undo(h);assert.equal(h.$('#memoLinksRetry').classList.contains('hidden'),false);
  h.setFailures(false,false);h.$('#memoLinksRetry').click();await h.finishWrites();assert.equal(Object.hasOwn(saved(h).captures[0],'links'),false);
});

test('stale Undo cannot overwrite changed links, deleted memo or replaced state',async()=>{
  for(const mode of ['changed','deleted','replaced']){
    const h=setup();h.ctx.openCapture('a');await toggle(h);
    if(mode==='changed')current(h).links=[{kind:'recipe',id:'bread'}];
    if(mode==='deleted')h.ctx.state.captures=h.ctx.state.captures.filter(c=>c.id!=='a');
    if(mode==='replaced')h.evaluate('replaceMemoState(clone(state))');
    await undo(h);if(mode==='changed')assert.deepEqual(links(h),[{kind:'recipe',id:'bread'}]);if(mode==='deleted')assert.equal(h.ctx.state.captures.some(c=>c.id==='a'),false);
    if(mode==='replaced')assert.equal(current(h).links.length,1);
  }
});

test('shared Undo: latest links or existing whole-state operation replaces previous token',async()=>{
  const h=setup();h.ctx.openCapture('a');h.ctx.showUndo('old',clone(h.ctx.state));await toggle(h);assert.equal(h.ctx.undoSnapshot,null);assert.ok(h.evaluate('memoLinksUndo'));
  const before=clone(h.ctx.state);h.ctx.state.actions.reverse();h.ctx.showUndo('reorder',before);assert.equal(h.evaluate('memoLinksUndo'),null);await undo(h);assert.equal(h.ctx.state.actions[0].id,'one');assert.deepEqual(links(h),[{kind:'recipe',id:'pizza'}]);
});


test('UI excludes linked recipes before applying the three-candidate limit',()=>{
  const h=setup('ピザ、パン、ご飯、ケーキ');current(h).links=[{kind:'recipe',id:'pizza'}];h.ctx.openCapture('a');
  assert.equal(choices(h).length,3);assert.ok(h.$('#memoLinksCandidates').innerHTML.includes('ケーキ'));
});

// PR-D: actual sheet handlers, one RAM return, real save queue with controlled Promises.
function navigation(options={}){
  const h=setup('ピザを作りたい\n2行目',options);
  current(h).links=[{kind:'recipe',id:'pizza'},{kind:'recipe',id:'bread'}];
  h.ctx.state.captures[1].text='別の関連メモ\n非表示の2行目';h.ctx.state.captures[1].links=[{kind:'recipe',id:'pizza'}];
  return h;
}
const back=h=>h.evaluate('memoRecipeReturn');
const openNames=h=>h.$('#memoLinksSelected').querySelectorAll('.memoLinkOpen');
async function hit(h,selector){const work=h.$(selector).click();await h.finishWrites();await work}
async function fromMemo(h){h.ctx.openCapture('a');const work=openNames(h)[0].click();await h.finishWrites();await work}
async function reverse(h,index=0){const work=h.root.modalSheet.querySelectorAll('.recipeMemoOpen')[index].click();await h.finishWrites();await work}
function swipe(h){const sheet=h.root.modalSheet;sheet.ontouchstart({touches:[{clientY:0,clientX:0}],target:sheet});sheet.ontouchmove({touches:[{clientY:140,clientX:0}],target:sheet,preventDefault(){}});sheet.ontouchend();h.runTimers(170)}

test('reverse section reads explicit links once, keeps capture order, first lines and escaped text; inactive contents remain private',()=>{
  const h=navigation();current(h).text='<b>A & "B"</b>\n秘密の2行目';
  h.ctx.state.captures.push({id:'processed',status:'processed',text:'変換済み秘密',links:[{kind:'recipe',id:'pizza'}]},
    {id:'archived',status:'archived',text:'アーカイブ秘密',links:[{kind:'recipe',id:'pizza'}]},
    {id:'unlinked',status:'active',text:'リンクなし秘密',sourceRecipeId:'pizza'});
  h.ctx.scanCalls=0;h.evaluate('const readCaptureLinks=captureLinks;captureLinks=c=>{scanCalls++;return readCaptureLinks(c)}');
  h.ctx.showRecipe('pizza');assert.equal(h.ctx.scanCalls,h.ctx.state.captures.length);
  const markup=h.root.modalSheet.innerHTML;assert.ok(markup.indexOf('この料理のメモ')>markup.indexOf('所持している現物'));
  assert.ok(markup.indexOf('この料理のメモ')<markup.indexOf('id="makeRecipeGoal"'));assert.ok(markup.includes('&lt;b&gt;A &amp; &quot;B&quot;&lt;/b&gt;'));
  assert.ok(markup.indexOf('data-capture="a"')<markup.indexOf('data-capture="b"'));
  for(const text of ['秘密の2行目','非表示の2行目','変換済み秘密','アーカイブ秘密','リンクなし秘密'])assert.equal(markup.includes(text),false);
  assert.ok(markup.includes('変換済み 1件・アーカイブ 1件'));assert.equal(h.pending.length,0);
});

test('zero reverse links, unknown/unresolved names or missing recipe data never add a reverse heading',()=>{
  const h=navigation();h.ctx.state.captures=[];h.ctx.showRecipe('pizza');assert.equal(h.$('#recipeMemoSection'),null);
  h.ctx.state.captures=[{id:'z',status:'active',text:'秘密',links:[{kind:'recipe',id:'secret'}]}];
  assert.equal(h.ctx.recipeMemoSection('secret'),'');h.ctx.state.knownRecipes.push('unresolved');assert.equal(h.ctx.recipeMemoSection('unresolved'),'');
  h.ctx.recipeData=()=>null;assert.equal(h.ctx.recipeMemoSection('pizza'),'');
});

for(const method of ['top','bottom','background','swipe'])test('N-1/N-2: '+method+' consumes recipe→memo return and restores memo scroll',async()=>{
  const h=navigation();h.ctx.openCapture('a');h.root.modalSheet.scrollTop=126;const el=body(h);h.input(el,'  ピザの最新本文\n★  ');
  const child=h.root.modalSheet.querySelector('.subInlineEditable');h.input(child,'  子も最新\n☆  ');openNames(h)[0].click();await h.finishWrites();
  assert.equal(back(h).kind,'capture');assert.equal(back(h).scrollTop,126);assert.equal(saved(h).captures[0].text,el.value);
  if(method==='top')await hit(h,'#closeRecipeSheet');if(method==='bottom')await hit(h,'#recipeSheetCloseBottom');
  if(method==='background'){h.root.modal.dispatch('click');await h.finishWrites()}
  if(method==='swipe'){swipe(h);await h.finishWrites()}
  assert.equal(back(h),null);assert.equal(body(h).value,'  ピザの最新本文\n★  ');assert.equal(current(h).children[0].text,'  子も最新\n☆  ');assert.equal(h.root.modalSheet.scrollTop,126);
});

test('N-3: recipe archive succeeds before returning; failures and repeated close retain sheet/return until retry',async()=>{
  const h=navigation();await fromMemo(h);h.setFailures(true,true);const token=back(h),sheet=h.root.modalSheet.innerHTML;
  const first=h.$('#archiveRecipe').click(),second=h.$('#closeRecipeSheet').click();await h.finishWrites();await Promise.all([first,second]);
  assert.equal(back(h),token);assert.equal(h.root.modalSheet.innerHTML,sheet);assert.equal(h.pending.length,1);assert.equal(h.ctx.state.recipeMeta.pizza.archived,false);
  h.setFailures(false,false);await hit(h,'#archiveRecipe');assert.equal(back(h),null);assert.ok(body(h));assert.equal(h.ctx.state.recipeMeta.pizza.archived,true);
});

test('N-4/NV-4: favorite, recipe-goal creation/edit/quantity and process confirmation preserve same-recipe return',async()=>{
  const h=navigation({recipes:{pizza:{id:'pizza',ingredient:['wheat','wheat','tomato']},bread:{id:'bread',ingredient:[]}}});await fromMemo(h);const token=back(h);
  await hit(h,'#favoriteRecipe');assert.equal(back(h),token);assert.equal(h.ctx.state.recipeMeta.pizza.favorite,true);
  await hit(h,'#makeRecipeGoal');h.$('#recipeQty').value='2';await hit(h,'#createRecipeGoal');const goal=h.ctx.state.goals[0];
  assert.equal(goal.sourceRecipeId,'pizza');assert.equal(goal.targetQty,2);assert.deepEqual(clone(h.ctx.state.requirements[goal.id]).map(x=>x.need),[4,2]);assert.equal(back(h),token);
  await hit(h,'#sheetEditGoal');h.$('#goalStatus').value='active';h.input(h.$('#goalTitle'),'手動の料理目標');const changed=h.$('#goalTitle').dispatch('change');await h.finishWrites();await changed;await hit(h,'#closeGoalEditor');
  await hit(h,'#sheetEditRecipeQty');h.$('#editRecipeQty').value='3';await hit(h,'#saveRecipeQty');assert.equal(h.ctx.state.goals[0].title,'手動の料理目標');assert.equal(h.ctx.state.goals[0].targetQty,3);
  await hit(h,'#sheetCloseBottom');assert.equal(back(h),token);assert.ok(h.$('#openRecipeGoal'));
  h.ctx.confirmRevealProcess('flour');await hit(h,'#backRevealProcess');assert.equal(back(h),token);
  h.ctx.confirmRevealProcess('flour');await hit(h,'#revealProcessYes');assert.equal(back(h),token);assert.ok(h.ctx.state.knownProcesses.includes('flour'));
  await hit(h,'#closeRecipeSheet');assert.equal(back(h),null);assert.ok(body(h));
});

test('existing sourceRecipeId goal remains separate from explicit memo links',async()=>{
  const h=navigation();h.ctx.state.goals=[{id:'g',sourceRecipeId:'pizza',targetQty:4,title:'既存料理目標',status:'active'}];h.ctx.state.requirements.g=[{targetId:'wheat',label:'小麦粉',need:4,have:3,sourceRecipeId:'pizza'}];
  const before=clone(h.ctx.state.goals);await fromMemo(h);assert.ok(h.$('#openRecipeGoal'));await hit(h,'#openRecipeGoal');await hit(h,'#sheetCloseBottom');await hit(h,'#closeRecipeSheet');
  assert.deepEqual(clone(h.ctx.state.goals),before);assert.equal(h.ctx.state.requirements.g[0].have,3);
});

test('N-5: opening another recipe discards old memo return; closing it uses existing recipe-list path',async()=>{
  const h=navigation();await fromMemo(h);h.ctx.showRecipe('bread');assert.equal(back(h),null);await hit(h,'#closeRecipeSheet');assert.equal(h.root.modal.classList.contains('open'),false);assert.ok(h.trace.some(x=>x[0]==='recipes'));
});

test('N-6: tab navigation discards return; reopening same recipe never revives it',async()=>{
  const h=navigation();await fromMemo(h);h.root.nav=new (h.root.modal.constructor)('nav',{class:'navbtn','data-nav':'recipes'});
  h.evaluate(navSource);
  await h.root.nav.click();assert.equal(back(h),null);h.ctx.showRecipe('pizza');await hit(h,'#closeRecipeSheet');assert.equal(h.root.modal.classList.contains('open'),false);
});

for(const method of ['button','background','swipe'])test('N-7/NV-1: reverse memo '+method+' flushes, redraws recipe and consumes older A return',async()=>{
  const h=navigation();await fromMemo(h);h.root.modalSheet.scrollTop=47;await reverse(h,1);assert.equal(back(h).kind,'recipe');assert.equal(back(h).captureId,'b');
  h.input(body(h),'更新済みのB\n2行目');
  if(method==='button')h.$('#closeCaptureEditor').click();if(method==='background')h.root.modal.dispatch('click');if(method==='swipe')swipe(h);
  await h.finishWrites();assert.equal(back(h),null);assert.ok(h.root.modalSheet.innerHTML.includes('更新済みのB'));assert.equal(h.root.modalSheet.scrollTop,47);
  await hit(h,'#closeRecipeSheet');assert.equal(h.root.modal.classList.contains('open'),false);assert.equal(back(h),null);
});

for(const operation of ['delete','archive','action','goal'])test('N-8: reverse memo '+operation+' success discards return and keeps existing inbox destination',async()=>{
  const h=navigation();h.ctx.showRecipe('pizza');await reverse(h,1);
  if(operation==='delete')await hit(h,'#deleteCap');if(operation==='archive')await hit(h,'#archiveCaptureDetail');
  if(operation==='action'||operation==='goal'){h.root.modalSheet.querySelectorAll('.captureOrganize').find(x=>x.dataset.to===operation).click();await h.finishWrites();await hit(h,'#doConvert')}
  assert.equal(back(h),null);assert.equal(h.root.modal.classList.contains('open'),false);assert.ok(h.root.inbox.innerHTML.includes('メモ'));
  if(operation==='delete')assert.equal(h.ctx.state.captures.some(c=>c.id==='b'),false);
  if(operation==='action')assert.equal(h.ctx.state.actions[0].sourceCaptureId,'b');if(operation==='goal')assert.equal(h.ctx.state.goals[0].sourceCaptureId,'b');
  if(operation==='action'||operation==='goal')assert.equal(Object.hasOwn((operation==='action'?h.ctx.state.actions:h.ctx.state.goals)[0],'links'),false);
});

test('N-8: cancelling deletion/conversion retains the return and editable memo',async()=>{
  const h=navigation();h.ctx.showRecipe('pizza');await reverse(h,1);const token=back(h);h.ctx.confirm=()=>false;await hit(h,'#deleteCap');assert.equal(back(h),token);
  h.root.modalSheet.querySelector('.captureOrganize').click();await h.finishWrites();assert.ok(h.$('#cancelCaptureConvert'));await hit(h,'#cancelCaptureConvert');assert.equal(back(h),token);assert.ok(body(h));
  await h.close();assert.equal(back(h),null);assert.ok(h.$('#closeRecipeSheet'));
});

test('N-9: new memo choices never navigate or create a return',async()=>{
  const h=navigation();h.ctx.openCapture();const el=body(h);h.input(el,'ピザ');h.runTimers(250);await choices(h)[0].dispatch('change');assert.equal(body(h),el);assert.equal(back(h),null);assert.equal(openNames(h).length,0);assert.equal(h.pending.length,0);
});

test('NV-2: X→B→Y→B replaces the old X return; closing B then uses inbox',async()=>{
  const h=navigation();h.ctx.showRecipe('pizza');await reverse(h);const first=back(h);openNames(h)[1].click();await h.finishWrites();assert.equal(back(h).recipeId,'bread');assert.notEqual(back(h),first);
  await hit(h,'#closeRecipeSheet');assert.equal(back(h),null);assert.ok(body(h));await h.close();assert.equal(h.root.modal.classList.contains('open'),false);
});

for(const exit of ['home','settings','calendar','quick'])test('NV-3: '+exit+' preserves input/return on failure, then discards only after successful flush',async()=>{
  const h=navigation();h.ctx.showRecipe('pizza');await reverse(h);const token=back(h),el=body(h);h.input(el,'移動直前の本文');h.setFailures(true,true);
  const go=()=>exit==='home'?h.ctx.openHomeNav('plan'):exit==='settings'?h.ctx.settings():exit==='calendar'?h.ctx.openCalendarSheet():h.ctx.openQuickAdd();
  go();await h.finishWrites();assert.equal(back(h),token);assert.equal(body(h),el);assert.equal(el.value,'移動直前の本文');
  h.setFailures(false,false);go();await h.finishWrites();assert.equal(back(h),null);assert.equal(saved(h).captures[0].text,'移動直前の本文');
});

test('NV-5: delayed old swipe and archive/favorite callbacks cannot close or replace a newer sheet',async()=>{
  for(const action of ['#favoriteRecipe','#archiveRecipe']){
  const h=navigation();await fromMemo(h);const oldEnd=h.root.modalSheet.onpointerup;
  h.root.modalSheet.onpointerdown({pointerType:'mouse',button:0,pointerId:7,clientY:0,clientX:0,target:h.root.modalSheet});h.root.modalSheet.onpointermove({pointerType:'mouse',pointerId:7,clientY:120,clientX:0});
  const favorite=h.$(action).click();await h.until(()=>h.pending.length===1);await reverse(h,1); // no memo editor yet, so the new sheet opens without another save
  oldEnd({pointerType:'mouse',pointerId:7});h.runTimers(170);await h.finishWrites();await favorite;assert.ok(body(h));assert.equal(back(h).captureId,'b');
  }
});

test('failed reverse-memo close keeps editor, raw input and recipe return until retry',async()=>{
  const h=navigation();h.ctx.showRecipe('pizza');await reverse(h);const token=back(h),el=body(h);h.setFailures(true,true);h.input(el,'  保存失敗でも残す\n★  ');await h.close();assert.equal(back(h),token);assert.equal(body(h),el);
  h.setFailures(false,false);await h.close();assert.equal(back(h),null);assert.ok(h.root.modalSheet.innerHTML.includes('保存失敗でも残す'));
});

test('failed memo→recipe flush retains the earlier return; input during save reaches newest persisted text',async()=>{
  const h=navigation();h.ctx.showRecipe('pizza');await reverse(h);const token=back(h),el=body(h);h.setFailures(true,true);h.input(el,'最初');openNames(h)[1].click();await h.finishWrites();assert.equal(back(h),token);assert.equal(body(h),el);
  h.setFailures(false,false);openNames(h)[1].click();await h.until(()=>h.pending.filter(x=>!x.done).length===1);h.input(el,'  最新の本文\n☆  ');await h.finishWrites();assert.equal(back(h).recipeId,'bread');assert.equal(saved(h).captures[0].text,'  最新の本文\n☆  ');
});

test('IME blocks name navigation/return consumption; × only removes, without starting navigation',async()=>{
  const h=navigation();h.ctx.showRecipe('pizza');await reverse(h);const token=back(h),el=body(h);el.dispatch('compositionstart');h.input(el,'日本語変換中');await openNames(h)[0].click();await h.$('#closeCaptureEditor').click();assert.equal(body(h),el);assert.equal(back(h),token);
  el.dispatch('compositionend');const work=remove(h)[0].click();await h.finishWrites();await work;assert.equal(body(h),el);assert.equal(back(h),token);assert.equal(current(h).links.some(x=>x.id==='pizza'),false);
});

test('tap revalidates known recipe/data/link and deleted return memo is never resurrected',async()=>{
  const h=navigation();h.ctx.openCapture('a');const el=body(h),button=openNames(h)[0];h.ctx.state.knownRecipes=[];await button.click();assert.equal(body(h),el);assert.equal(back(h),null);
  h.ctx.state.knownRecipes=['pizza','bread'];h.ctx.recipeData=()=>null;await button.click();assert.equal(body(h),el);
  const other=navigation();await fromMemo(other);other.ctx.state.captures=other.ctx.state.captures.filter(c=>c.id!=='a');await hit(other,'#closeRecipeSheet');assert.equal(back(other),null);assert.equal(other.ctx.state.captures.some(c=>c.id==='a'),false);
});

test('knowledge changing while flush awaits does not dispose the still-editable memo',async()=>{
  const h=navigation();h.ctx.openCapture('a');const el=body(h);h.input(el,'保留本文');openNames(h)[0].click();await h.until(()=>h.pending.length===1);h.ctx.state.knownRecipes=[];await h.finishWrites();assert.equal(body(h),el);assert.equal(back(h),null);assert.equal(h.evaluate('[...memoEditors].some(e=>e.body&&!e.disposed)'),true);
});

test('navigation reads do not change playerState or known lists; state replacement clears the RAM return',async()=>{
  const h=navigation();const player=clone(h.ctx.state.playerState),known=clone([h.ctx.state.knownEntities,h.ctx.state.knownRecipes,h.ctx.state.knownProcesses]);await fromMemo(h);await reverse(h,1);await h.close();await hit(h,'#closeRecipeSheet');
  assert.deepEqual(clone(h.ctx.state.playerState),player);assert.deepEqual(clone([h.ctx.state.knownEntities,h.ctx.state.knownRecipes,h.ctx.state.knownProcesses]),known);
  await fromMemo(h);h.evaluate('replaceMemoState(clone(state))');assert.equal(back(h),null);
});

test('actual home, memo list, recipe list and recipe search never match/scan memo links',()=>{
  const h=navigation();const section=(a,b)=>{const start=html.indexOf(a);assert.ok(start>=0);return html.slice(start,html.indexOf(b,start+a.length))};
  Object.assign(h.ctx,{RECIPE_ROWS:[],todayStripHtml:()=>'',seasonReminderBannerHtml:()=>'',homeProgressHtml:()=>'',bazaarPrepHtml:()=>'',recentStripHtml:()=>'',bindTodayStrip(){},bindRecent(){},bindBazaarPrep(){}});
  h.evaluate(section('function home(){','function planTags(')+section('function knownRecipeRows(){','function recipeRegistrationCandidates('));
  h.evaluate('memoRecipeMatches=recipeMemoSection=captureLinks=()=>{throw Error("List rendering must not scan links or match memo recipes")};home();recipesScreen();inbox()');
  h.input(h.$('#recipeSearch'),'ピザ');assert.ok(h.root.recipes.innerHTML.includes('知っている料理'));assert.ok(h.root.home.innerHTML.includes('未整理メモ'));assert.equal(h.pending.length,0);
});

test('failed destructive memo actions retain the current sheet and return; retry consumes only on success',async()=>{
  for(const operation of ['delete','archive','convert']){
    const h=navigation();h.ctx.showRecipe('pizza');await reverse(h,1);const token=back(h);
    if(operation==='convert'){h.root.modalSheet.querySelector('.captureOrganize').click();await h.finishWrites()}
    const selector=operation==='delete'?'#deleteCap':operation==='archive'?'#archiveCaptureDetail':'#doConvert';const sheet=h.root.modalSheet.innerHTML;
    h.setFailures(true,true);await hit(h,selector);assert.equal(back(h),token);assert.equal(h.root.modalSheet.innerHTML,sheet);
    h.setFailures(false,false);await hit(h,selector);assert.equal(back(h),null);assert.equal(h.root.modal.classList.contains('open'),false);
  }
});

for(const archived of [false,true])test('failed recipe archive restores '+archived+' before Close and unrelated data save',async()=>{
  const h=navigation();h.ctx.state.recipeMeta.pizza={favorite:false,archived};await fromMemo(h);
  h.setFailures(true,true);await hit(h,'#archiveRecipe');assert.equal(h.ctx.state.recipeMeta.pizza.archived,archived);
  assert.ok(h.$('#archiveRecipe'));assert.equal(back(h).kind,'capture');await hit(h,'#closeRecipeSheet');assert.ok(body(h));
  h.setFailures(false,false);h.input(body(h),'失敗後に保存する別のデータ');await h.close();
  assert.equal(saved(h).captures[0].text,'失敗後に保存する別のデータ');assert.equal(saved(h).recipeMeta.pizza.archived,archived);
});

for(const archived of [false,true])test('failed recipe archive restores '+archived+' after another sheet opens during save',async()=>{
  const h=navigation();h.ctx.state.recipeMeta.pizza={favorite:false,archived};await fromMemo(h);h.setFailures(true,true);
  const work=h.$('#archiveRecipe').click();await h.until(()=>h.pending.length===1);assert.equal(h.ctx.state.recipeMeta.pizza.archived,!archived);
  const navigate=h.root.modalSheet.querySelectorAll('.recipeMemoOpen')[1].click();await h.until(()=>!!body(h));
  const el=body(h),token=back(h);h.ctx.state=clone(h.ctx.state);
  await h.finishWrites();await Promise.all([work,navigate]);assert.equal(body(h),el);assert.equal(back(h),token);assert.equal(h.ctx.state.recipeMeta.pizza.archived,archived);
  h.setFailures(false,false);h.input(el,'別シートで追記して保存');await h.close();
  assert.equal(saved(h).recipeMeta.pizza.archived,archived);assert.equal(saved(h).captures[1].text,'別シートで追記して保存');
});

test('failed recipe unarchive retries the same target and returns only after success',async()=>{
  const h=navigation();h.ctx.state.recipeMeta.pizza={favorite:false,archived:true};await fromMemo(h);const token=back(h);h.setFailures(true,true);
  await hit(h,'#archiveRecipe');assert.equal(h.ctx.state.recipeMeta.pizza.archived,true);assert.equal(back(h),token);assert.ok(h.$('#archiveRecipe'));
  h.setFailures(false,false);await hit(h,'#archiveRecipe');assert.equal(saved(h).recipeMeta.pizza.archived,false);assert.equal(h.ctx.state.recipeMeta.pizza.archived,false);assert.equal(back(h),null);assert.ok(body(h));
});
