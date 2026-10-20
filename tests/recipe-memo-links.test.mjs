import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,body,current,saved,clone} from './helpers/memo-harness.mjs';

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
