import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext,Script} from 'node:vm';

import {harness,fixture,Element,body,current,saved,clone,html,navSource} from './helpers/memo-harness.mjs';

// AS-1 / AS-3: actual modal, DOM handlers, save queue, dismissal and timers.
for(const method of ['button','background','swipe'])test('AS-1/3: '+method+' waits for latest text and disposes old events',async()=>{
  const h=harness();h.ctx.openCapture('a');const el=body(h);h.input(el,' 最新\n本文 ★ ');
  if(method==='button')h.$('#closeCaptureEditor').click();
  if(method==='background')h.root.modal.dispatch('click');
  if(method==='swipe'){const sheet=h.root.modalSheet;sheet.ontouchstart({touches:[{clientY:0,clientX:0}],target:el});sheet.ontouchmove({touches:[{clientY:130,clientX:0}],target:el,preventDefault(){}});sheet.ontouchend()}
  await h.until(()=>h.pending.length===1);assert.equal(h.root.modal.classList.contains('open'),true);
  await h.finishWrites();assert.equal(h.root.modal.classList.contains('open'),false);
  assert.equal(saved(h).captures[0].text,' 最新\n本文 ★ ');
  assert.equal(h.pending.length,1,'flush must not duplicate successful saves');
  h.ctx.openCapture('b');h.input(el,'古いDOMからの入力');h.runTimers();await h.tick();
  assert.equal(h.ctx.state.captures[1].text,'別のメモ');assert.equal(h.pending.length,1);
});

test('AS-2: save1, further input, blur and repeated close await save2; navigate once',async()=>{
  const h=harness();h.ctx.openCapture('a');const el=body(h);h.input(el,'一回目');h.runTimers();
  await h.until(()=>h.pending.length===1);h.input(el,'二回目\n★');el.blur();
  const first=h.$('#closeCaptureEditor').click(),second=h.$('#closeCaptureEditor').click();
  let returned=false;first.then(()=>returned=true);await h.tick();assert.equal(returned,false);
  h.pending[0].done=true;h.pending[0].resolve();await h.until(()=>h.pending.length===2);
  assert.equal(h.pending[1].record.captures[0].text,'二回目\n★');assert.equal(returned,false);
  h.pending[1].done=true;h.pending[1].resolve();await Promise.all([first,second]);
  assert.equal(h.pending.length,2);assert.equal(h.root.modal.classList.contains('open'),false);
  assert.equal(h.evaluate('modalGeneration'),2,'one mount and exactly one close');
});

test('AS-4: dual failure retains sheet/input, retries latest text, and emits no success Undo',async()=>{
  const h=harness({localFails:true,idbFails:true});h.ctx.openCapture('a');h.input(body(h),'失敗しても保持');
  await h.close();assert.equal(h.root.modal.classList.contains('open'),true);assert.equal(body(h).value,'失敗しても保持');
  assert.equal(h.ctx.undoSnapshot,null);assert.equal(h.$('#saveStatus').textContent,'保存失敗');
  h.setFailures(false,false);h.input(body(h),'再試行の最新');await h.close();
  assert.equal(saved(h).captures[0].text,'再試行の最新');assert.equal(h.root.modal.classList.contains('open'),false);
});

test('AS-4/9: failed new memo Add retries the same ID, raw text, without duplicate/implicit insertion',async()=>{
  const h=harness({localFails:true,idbFails:true});h.ctx.openCapture();const el=body(h);h.input(el,'  新規\n★  ');h.runTimers();await h.tick();
  assert.equal(h.ctx.state.captures.length,2);assert.equal(h.pending.length,0);
  const add=h.$('#addCaptureRecord');add.click();await h.finishWrites();
  assert.equal(h.root.modal.classList.contains('open'),true);assert.equal(el.value,'  新規\n★  ');
  assert.equal(h.ctx.state.captures.length,2,'failed insert must not leak into unrelated saves');
  const attemptedId=h.pending[0].record.captures[0].id;
  h.setFailures(false,false);add.click();await h.finishWrites();
  assert.equal(h.ctx.state.captures.length,3);assert.equal(h.ctx.state.captures[0].id,attemptedId);
  assert.equal(saved(h).captures[0].text,'  新規\n★  ');
});

for(const [localFails,idbFails] of [[true,false],[false,true]])test('AS-5: one successful storage target permits exit '+JSON.stringify({localFails,idbFails}),async()=>{
  const h=harness({localFails,idbFails});h.ctx.openCapture('a');h.input(body(h),'片方の成功');await h.close();
  assert.equal(h.root.modal.classList.contains('open'),false);assert.equal(h.ctx.state.captures[0].text,'片方の成功');
});

test('AS-6: composition blocks close, replacement, archive and Enter without queued navigation',async()=>{
  const h=harness();h.ctx.openCapture('a');const el=body(h);el.dispatch('compositionstart');h.input(el,'変換途中');
  await h.$('#closeCaptureEditor').click();h.ctx.openCapture('b');h.ctx.modal('<h3>別画面</h3>');h.$('#archiveCaptureDetail').click();
  h.runTimers();await h.tick();assert.equal(body(h),el);assert.equal(h.pending.length,0);
  const sub=h.$('#subText');sub.value='未追加';await sub.dispatch('keydown',{key:'Enter',isComposing:true,shiftKey:false});
  assert.equal(current(h).children.length,1);
  el.dispatch('compositionend');await h.finishWrites();assert.equal(body(h),el,'compositionend must not replay blocked exits');
  await h.close();assert.equal(saved(h).captures[0].text,'変換途中');
});

test('AS-7: existing submemo flushes without blur; unadded field is not registered',async()=>{
  const h=harness();h.ctx.openCapture('a');const sub=h.root.modalSheet.querySelector('.subInlineEditable');
  h.input(sub,'  編集した子\n★  ');h.$('#subText').value='勝手に追加しない';h.ctx.openCapture('b');
  await h.finishWrites();assert.equal(current(h).children[0].text,'  編集した子\n★  ');assert.equal(current(h).children.length,1);
  assert.equal(body(h).value,'別のメモ');
});

test('AS-8: deleted memo and child cannot be resurrected by delayed input/timers',async()=>{
  const h=harness();h.ctx.openCapture('a');const el=body(h),sub=h.root.modalSheet.querySelector('.subInlineEditable');
  h.input(el,'保留');h.input(sub,'子も保留');h.ctx.state.captures=h.ctx.state.captures.filter(c=>c.id!=='a');
  h.runTimers();await h.tick();assert.equal(h.ctx.state.captures.length,1);assert.equal(h.pending.length,0);
  h.evaluate('replaceMemoState('+JSON.stringify(fixture())+')');h.input(el,'復元後の古い要素');h.runTimers();await h.tick();
  assert.equal(current(h).text,'  元の本文\n★  ');assert.equal(h.pending.length,0);
});

test('AS-8: equivalent render clone keeps ID-based body and child editing attached to current state',async()=>{
  const h=harness();h.ctx.openCapture('a');const old=current(h);h.ctx.state=clone(h.ctx.state);
  h.input(body(h),'複製後の本文');h.input(h.root.modalSheet.querySelector('.subInlineEditable'),'複製後の子');await h.close();
  assert.equal(old.text,'  元の本文\n★  ');assert.equal(current(h).text,'複製後の本文');assert.equal(current(h).children[0].text,'複製後の子');
});

test('AS-9: unchanged raw text does not save; blank edited text retains last nonempty body',async()=>{
  const h=harness();h.ctx.openCapture('a');await h.close();assert.equal(h.pending.length,0);assert.equal(current(h).text,'  元の本文\n★  ');
  h.ctx.openCapture('a');await h.tick();h.input(body(h),' \n ');await h.close();assert.equal(current(h).text,'  元の本文\n★  ');assert.equal(h.pending.length,0);
  assert.ok(h.trace.some(e=>e[0]==='toast'&&e[1].includes('空の本文は保存せず')));
});

for(const child of [false,true])test('UN-5: real '+(child?'submemo':'body')+' edit invalidates old whole-state Undo immediately',async()=>{
  const h=harness();const before=clone(h.ctx.state);h.ctx.showUndo('古い操作',before);h.ctx.openCapture('a');
  assert.ok(h.ctx.undoSnapshot,'opening alone must not invalidate Undo');
  const el=child?h.root.modalSheet.querySelector('.subInlineEditable'):body(h);h.input(el,'失ってはいけない');
  assert.equal(h.ctx.undoSnapshot,null);await h.$('#undoBtn').click();await h.close();
  assert.equal(child?current(h).children[0].text:current(h).text,'失ってはいけない');
});

test('UN-5: a previously running withUndo cannot publish a stale snapshot after input',async()=>{
  const h=harness();h.ctx.openCapture('a');const work=h.ctx.withUndo('保留中の全体Undo',()=>h.ctx.state.actions.reverse());
  await h.until(()=>h.pending.length===1);h.input(body(h),'後続入力');await h.finishWrites();await work;
  assert.equal(h.ctx.undoSnapshot,null);await h.close();assert.equal(current(h).text,'後続入力');
});

for(const action of ['archive','convert'])test('UN-6: '+action+' Undo restores prior state and allows further body editing',async()=>{
  const h=harness();h.ctx.openCapture('a');h.input(body(h),'整理前の最新本文');
  if(action==='archive')h.$('#archiveCaptureDetail').click();
  else h.root.modalSheet.querySelectorAll('.captureOrganize').find(b=>b.dataset.to==='action').click();
  await h.finishWrites();
  if(action==='convert'){h.$('#doConvert').click();await h.finishWrites()}
  assert.ok(h.ctx.undoSnapshot);h.$('#undoBtn').click();await h.finishWrites();
  assert.equal(current(h).status,'active');assert.equal(current(h).text,'整理前の最新本文');
  if(action==='convert')assert.equal(h.ctx.state.actions.length,2);
  h.ctx.openCapture('a');await h.tick();h.input(body(h),'Undo後の本文');await h.close();assert.equal(current(h).text,'Undo後の本文');
});

test('UN-6: existing reorder/withUndo remains reversible',async()=>{
  const h=harness();h.ctx.withUndo('並べ替え',()=>h.ctx.moveActionInPlan('one','two',true));await h.finishWrites();
  assert.deepEqual(h.ctx.state.actions.map(a=>a.id),['two','one']);h.$('#undoBtn').click();await h.finishWrites();
  assert.deepEqual(h.ctx.state.actions.map(a=>a.id),['one','two']);
});

test('AS-8: hydrate replacement disposes old timers and rebuilds same memo from current state',async()=>{
  const h=harness();h.ctx.openCapture('a');const old=body(h);const newer=fixture();newer.updatedAt='2099-01-01T00:00:00Z';newer.captures[0].text='読み込んだ内容';h.durable.set('state',newer);
  await h.ctx.hydrate();assert.equal(body(h).value,'読み込んだ内容');h.input(old,'古い書込み');h.runTimers();await h.tick();assert.equal(current(h).text,'読み込んだ内容');
});

test('bindAutosave keeps legacy undefined returns, shares flush, catches exceptions and disposes',async()=>{
  const h=harness();const el=new Element();h.ctx.testElement=el;h.ctx.calls=0;
  h.evaluate('globalThis.binding=bindAutosave([testElement],async()=>{calls++})');
  el.dispatch('input');await h.ctx.binding.flush();assert.equal(h.ctx.calls,1);
  h.ctx.binding.dispose();el.dispatch('input');h.runTimers();await h.tick();assert.equal(h.ctx.calls,1);
  h.evaluate('globalThis.failedBinding=bindAutosave([testElement],async()=>{throw Error("synthetic")})');
  assert.equal(await h.ctx.failedBinding.flush(),false);
});

test('AS-4: failed archive cannot bypass pending persistence by pressing Close',async()=>{
  const h=harness({localFails:true,idbFails:true});h.ctx.openCapture('a');
  h.$('#archiveCaptureDetail').click();await h.finishWrites();
  assert.equal(h.root.modal.classList.contains('open'),true);assert.equal(h.ctx.undoSnapshot,null);
  await h.close();assert.equal(h.root.modal.classList.contains('open'),true);
  h.setFailures(false,false);await h.close();
  assert.equal(saved(h).captures[0].status,'archived');assert.ok(h.ctx.undoSnapshot);
});

test('AS-4: failed conversion reuses one generated target on retry',async()=>{
  const h=harness({localFails:true,idbFails:true});h.ctx.confirmConvert('a','action');
  const button=h.$('#doConvert');button.click();await h.finishWrites();
  assert.equal(h.ctx.state.actions.length,3);assert.equal(h.ctx.undoSnapshot,null);
  const targetId=h.ctx.state.actions[0].id;
  h.setFailures(false,false);button.click();await h.finishWrites();
  assert.equal(h.ctx.state.actions.length,3);assert.equal(h.ctx.state.actions[0].id,targetId);assert.ok(h.ctx.undoSnapshot);
});

test('AS-2/9: new memo input during explicit Add is persisted before closing',async()=>{
  const h=harness();h.ctx.openCapture();h.input(body(h),'最初の新規本文');h.$('#addCaptureRecord').click();
  await h.until(()=>h.pending.length===1);h.input(body(h),'  最後の新規本文\n★  ');
  await h.finishWrites();assert.equal(h.ctx.state.captures.length,3);assert.equal(saved(h).captures[0].text,'  最後の新規本文\n★  ');
  assert.equal(h.root.modal.classList.contains('open'),false);
});

test('AS-6: new memo composition Enter/Add cannot create an implicit draft record',async()=>{
  const h=harness();h.ctx.openCapture();const el=body(h);el.dispatch('compositionstart');h.input(el,'新規変換中');
  await h.$('#addCaptureRecord').click();await h.$('#closeCaptureEditor').click();h.runTimers();await h.tick();
  assert.equal(h.ctx.state.captures.length,2);assert.equal(h.pending.length,0);assert.equal(body(h),el);
  el.dispatch('compositionend');await h.close();assert.equal(h.ctx.state.captures.length,2);
});

test('AS-7: inline list submemo is protected on replacement and composition redraw',async()=>{
  const h=harness();h.ctx.inbox();const el=h.root.inbox.querySelector('.subInlineEditable');
  el.dispatch('compositionstart');h.ctx.inbox();assert.equal(h.root.inbox.querySelector('.subInlineEditable'),el);
  h.input(el,'  一覧からの編集\n★  ');el.dispatch('compositionend');h.ctx.openCapture('b');
  await h.finishWrites();assert.equal(current(h).children[0].text,'  一覧からの編集\n★  ');assert.equal(body(h).value,'別のメモ');
});

test('AS-8: actual import disposes old session before replacing data and old events cannot rewrite it',async()=>{
  const h=harness();h.ctx.openCapture('a');const old=body(h);h.input(old,'復元前の入力');
  const incoming=fixture();incoming.captures[0].text='合成バックアップの内容';
  h.ctx.importJson({target:{files:[{data:JSON.stringify({state:incoming})}]}});
  await h.finishWrites();h.input(old,'古いイベント');h.runTimers();await h.tick();
  assert.equal(current(h).text,'合成バックアップの内容');assert.equal(saved(h).captures[0].text,'合成バックアップの内容');
});

test('AS-8: a late hydrate read cannot discard input made before the startup read completes',async()=>{
  const h=harness();h.ctx.openCapture('a');h.input(body(h),'起動中に入力した本文');
  const incoming=fixture();incoming.updatedAt='2099-01-01T00:00:00Z';incoming.captures[0].text='古い起動時読み取り';h.durable.set('state',incoming);
  const hydration=h.ctx.hydrate();await h.finishWrites();await hydration;
  assert.equal(body(h).value,'起動中に入力した本文');assert.equal(current(h).text,'起動中に入力した本文');
});

test('AS-1/3: actual bottom navigation flushes first and repeated taps navigate once',async()=>{
  const h=harness();const nav=new Element('nav',{class:'navbtn','data-nav':'plan'});
  const query=h.ctx.document.querySelectorAll;h.ctx.document.querySelectorAll=q=>q==='.navbtn'?[nav]:query(q);
  runInNewContext(navSource,h.ctx);h.ctx.openCapture('a');h.input(body(h),'タブへ行く前の本文');
  nav.click();nav.click();await h.until(()=>h.pending.length===1);assert.equal(h.trace.filter(e=>e[0]==='draw').length,0);
  await h.finishWrites();assert.deepEqual(h.trace.filter(e=>e[0]==='draw'),[['draw','plan']]);
  assert.equal(saved(h).captures[0].text,'タブへ行く前の本文');assert.equal(h.root.modal.classList.contains('open'),false);
});

test('AS-1: home shortcut navigation also waits for memo flush',async()=>{
  const h=harness();h.ctx.openCapture('a');h.input(body(h),'ホーム経由の移動');h.ctx.openHomeNav('plan');
  await h.until(()=>h.pending.length===1);assert.equal(h.trace.filter(e=>e[0]==='draw').length,0);
  await h.finishWrites();assert.deepEqual(h.trace.filter(e=>e[0]==='draw'),[['draw','plan']]);
});

test('AS-6/7: checkbox persistence does not regenerate body or discard the unadded submemo draft',async()=>{
  const h=harness();h.ctx.openCapture('a');const el=body(h),draft=h.$('#subText');draft.value='未追加を保持';
  const checkbox=h.root.modalSheet.querySelector('.subCheck');checkbox.checked=true;checkbox.dispatch('change');await h.finishWrites();
  assert.equal(body(h),el);assert.equal(h.$('#subText'),draft);assert.equal(draft.value,'未追加を保持');assert.equal(current(h).children.length,1);assert.equal(current(h).children[0].done,true);
});

test('AS-8: stale delayed swipe cannot dismiss a newly opened memo editor',async()=>{
  const h=harness();h.ctx.modal('<h3>以前のシート</h3>');const sheet=h.root.modalSheet;
  sheet.ontouchstart({touches:[{clientY:0,clientX:0}],target:sheet});sheet.ontouchmove({touches:[{clientY:130,clientX:0}],target:sheet,preventDefault(){}});sheet.ontouchend();
  h.ctx.openCapture('a');const el=body(h);h.runTimers(170);await h.tick();
  assert.equal(body(h),el);assert.equal(h.root.modal.classList.contains('open'),true);
});

test('AS-7/9: contenteditable block line breaks use rendered text, not flattened textContent',async()=>{
  const h=harness();h.ctx.openCapture('a');const el=h.root.modalSheet.querySelector('.subInlineEditable');
  // A browser represents Shift+Enter/pasted lines using blocks/br elements.
  el.innerText='  改行を含む子\n★  ';el.textContent='  改行を含む子★  ';el.dispatch('input');
  await h.close();assert.equal(current(h).children[0].text,'  改行を含む子\n★  ');
});

test('AS-4/UN-6: failed Undo persistence is retried before leaving the reopened editor',async()=>{
  const h=harness();const before=clone(h.ctx.state);h.ctx.state.actions.reverse();h.ctx.showUndo('順序を戻す',before);h.ctx.openCapture('a');
  h.setFailures(true,true);h.$('#undoBtn').click();await h.finishWrites();
  assert.equal(h.root.modal.classList.contains('open'),true);assert.equal(body(h).value,'  元の本文\n★  ');
  assert.ok(h.trace.some(e=>e[0]==='toast'&&e[1].startsWith('保存できませんでした。元に戻した内容')));
  await h.close();assert.equal(h.root.modal.classList.contains('open'),true);
  h.setFailures(false,false);await h.close();assert.deepEqual(saved(h).actions.map(a=>a.id),['one','two']);
});

test('submemo Add: A fails, B retry persists only B once under the same child ID',async()=>{
  const h=harness({localFails:true,idbFails:true});h.ctx.openCapture('a');const input=h.$('#subText'),add=h.$('#addSub');
  h.input(input,'追加A');add.click();await h.finishWrites();
  const childId=h.pending[0].record.captures[0].children[1].id;
  assert.equal(h.root.modal.classList.contains('open'),true);
  h.input(input,'  追加B\n★  ');h.setFailures(false,false);add.click();await h.finishWrites();
  assert.deepEqual(saved(h).captures[0].children.slice(1),[{id:childId,text:'  追加B\n★  ',done:false}]);
  assert.equal(current(h).children.length,2);
});

test('submemo Add: input B during save A is saved before the editor is rebuilt',async()=>{
  const h=harness();h.ctx.openCapture('a');const input=h.$('#subText');h.input(input,'追加A');h.$('#addSub').click();
  await h.until(()=>h.pending.length===1);const childId=h.pending[0].record.captures[0].children[1].id;
  h.input(input,'  保存中のB\n★  ');h.pending[0].done=true;h.pending[0].resolve();
  await h.until(()=>h.pending.length===2);
  assert.equal(h.$('#subText'),input,'Do not discard the current draft before the latest save succeeds');
  assert.equal(h.pending[1].record.captures[0].children[1].text,'  保存中のB\n★  ');
  await h.finishWrites();assert.deepEqual(saved(h).captures[0].children.slice(1),[{id:childId,text:'  保存中のB\n★  ',done:false}]);
});

test('submemo Add: repeated failures retain latest input and retry one stable child ID',async()=>{
  const h=harness({localFails:true,idbFails:true});h.ctx.openCapture('a');const input=h.$('#subText'),add=h.$('#addSub');
  for(const text of ['失敗A','失敗B','  最終C\n★  ']){
    h.input(input,text);add.click();await h.finishWrites();
    assert.equal(h.$('#subText'),input);assert.equal(input.value,text);assert.equal(current(h).children.length,2);
    assert.equal(h.root.modal.classList.contains('open'),true);
  }
  const ids=h.pending.map(p=>p.record.captures[0].children[1].id);assert.equal(new Set(ids).size,1);
  h.setFailures(false,false);add.click();await h.finishWrites();
  assert.deepEqual(saved(h).captures[0].children.slice(1),[{id:ids[0],text:'  最終C\n★  ',done:false}]);
});

test('unadded submemo: typing/blur/composition do not claim autosave or create storage writes',async()=>{
  const h=harness();h.ctx.openCapture('a');const input=h.$('#subText'),status=h.$('#saveStatus');
  status.textContent='端末保存 テスト';h.input(input,'未追加の入力');
  assert.equal(status.textContent,'端末保存 テスト','An unadded draft must not enter the autosave status cycle');
  input.blur();h.runTimers();await h.tick();assert.equal(h.pending.length,0);
  assert.match(h.$('#subDraftStatus')?.textContent||'',/未追加|まだ保存/);
  input.dispatch('compositionstart');h.input(input,'変換中');input.dispatch('compositionend');h.runTimers();await h.tick();
  assert.equal(status.textContent,'端末保存 テスト');assert.equal(h.pending.length,0);assert.equal(current(h).children.length,1);
});

test('submemo Add: composing the draft blocks Add and Enter, while existing child edits still save',async()=>{
  const h=harness();h.ctx.openCapture('a');const input=h.$('#subText'),child=h.root.modalSheet.querySelector('.subInlineEditable');
  input.dispatch('compositionstart');h.input(input,'変換中の新規子');await h.$('#addSub').click();
  await input.dispatch('keydown',{key:'Enter',isComposing:false,shiftKey:false});
  assert.equal(h.pending.length,0);assert.equal(current(h).children.length,1);
  await h.$('#closeCaptureEditor').click();assert.equal(h.root.modal.classList.contains('open'),true);
  input.dispatch('compositionend');h.runTimers();await h.tick();assert.equal(h.pending.length,0);
  h.input(child,'  既存の子を編集\n★  ');await h.close();
  assert.deepEqual(saved(h).captures[0].children,[{id:'child',text:'  既存の子を編集\n★  ',done:false}]);
});

test('submemo Add: last draft edit during a concurrent body save is included before leaving',async()=>{
  const h=harness();h.ctx.openCapture('a');const input=h.$('#subText');h.input(input,'追加A');h.$('#addSub').click();
  await h.until(()=>h.pending.length===1);h.input(body(h),'本文の後続編集');h.runTimers();h.input(input,'最新B');
  await h.finishWrites();const persisted=saved(h).captures[0];
  assert.equal(persisted.text,'本文の後続編集');assert.equal(persisted.children.length,2);assert.equal(persisted.children[1].text,'最新B');
});

test('submemo Add: after failure, Close also flushes the latest explicit-add draft once',async()=>{
  const h=harness({localFails:true,idbFails:true});h.ctx.openCapture('a');const input=h.$('#subText');h.input(input,'追加A');h.$('#addSub').click();await h.finishWrites();
  const childId=current(h).children[1].id;h.input(input,'閉じる前のB');h.setFailures(false,false);await h.close();
  assert.deepEqual(saved(h).captures[0].children.slice(1),[{id:childId,text:'閉じる前のB',done:false}]);
});

test('submemo Add: composition starting during save keeps the draft until an explicit retry',async()=>{
  const h=harness();h.ctx.openCapture('a');const input=h.$('#subText');h.input(input,'追加A');h.$('#addSub').click();await h.until(()=>h.pending.length===1);
  input.dispatch('compositionstart');h.input(input,'変換中のB');await h.finishWrites();
  assert.equal(h.$('#subText'),input);assert.equal(h.root.modal.classList.contains('open'),true);
  input.dispatch('compositionend');await h.tick();assert.equal(h.$('#subText'),input,'Do not replay a blocked transition after compositionend');
  h.$('#addSub').click();await h.finishWrites();assert.equal(saved(h).captures[0].children.length,2);assert.equal(saved(h).captures[0].children[1].text,'変換中のB');
  h.input(input,'破棄済みの入力');assert.equal(current(h).children[1].text,'変換中のB');
});

test('submemo Add: whitespace-only revision cannot silently confirm the earlier draft',async()=>{
  const h=harness({localFails:true,idbFails:true});h.ctx.openCapture('a');const input=h.$('#subText');h.input(input,'追加A');h.$('#addSub').click();await h.finishWrites();
  const childId=current(h).children[1].id;h.input(input,' \n ');h.setFailures(false,false);await h.close();
  assert.equal(h.root.modal.classList.contains('open'),true);assert.equal(h.$('#subText'),input);assert.equal(input.value,' \n ');
  h.input(input,'  確定B\n★  ');h.$('#addSub').click();await h.finishWrites();assert.deepEqual(saved(h).captures[0].children.slice(1),[{id:childId,text:'  確定B\n★  ',done:false}]);
});

// Parses all of the app, not just the extracted test sections.
test('full inline app is syntactically valid',()=>{const start=html.indexOf('const MASTER=JSON.parse');new Script(html.slice(start,html.indexOf('</script>',start)))});


test('pinning a memo waits for edits and remains available after changing status',async()=>{
  const h=harness();h.ctx.openCapture('a');h.input(body(h),'固定しておく申し送り');
  const action=h.$('#toggleCapturePin').click();await h.finishWrites();await action;
  assert.equal(saved(h).captures.find(x=>x.id==='a').text,'固定しておく申し送り');
  assert.equal(saved(h).captures.find(x=>x.id==='a').pinned,true);
  const now=h.ctx.state.captures.find(x=>x.id==='a');
  assert.equal(h.ctx.captureOnHome(now),true);
  now.status='processed';assert.equal(h.ctx.captureOnHome(now),true);
  now.status='archived';assert.equal(h.ctx.captureOnHome(now),false);
  now.status='active';
  const unpin=h.$('#toggleCapturePin').click();await h.finishWrites();await unpin;
  assert.equal(saved(h).captures.find(x=>x.id==='a').pinned,false);
});
