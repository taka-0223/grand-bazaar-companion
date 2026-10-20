import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const html=readFileSync('index.html','utf8');
const bootstrap=html.indexOf('const MASTER=JSON.parse');
assert.ok(bootstrap>=0,'App bootstrap must exist');
const app=html.slice(bootstrap,html.indexOf('</script>',bootstrap));
function section(start,end){
  const a=app.indexOf(start),b=app.indexOf(end,a+start.length);
  assert.ok(a>=0&&b>a,'Missing app section '+start);
  return app.slice(a,b);
}
const planSource=section('function plan(){','// Reorder only currently visible');
const reorderSource=section('function moveActionInPlan(','async function toggleAction(');
const bindGoalSource=section('function bindGoalOpen(){','const SCREEN_RENDERERS=');

function fakeRow(id,index){
  const marks=new Set();
  return {
    dataset:{actionId:id},
    classList:{add(...names){for(const name of names)marks.add(name)},remove(...names){for(const name of names)marks.delete(name)}},
    getBoundingClientRect:()=>({top:100+index*58,height:50})
  };
}

function fakeHandle(id,row){
  const listeners={};
  return {
    dataset:{actionId:id},
    listeners,
    addEventListener:(kind,handler)=>{listeners[kind]=handler},
    setPointerCapture:()=>{},
    closest:()=>row,
    focus:()=>{}
  };
}

function planHarness(){
  const events=[];
  const ctx={
    state:{
      goals:[{id:'g1',status:'active',kind:'goal',title:'自分の目標'}],
      actions:[{id:'a1',text:'はじめのタスク',done:false,pinned:false,goalId:null},
        {id:'a2',text:'次のタスク',done:false,pinned:false,goalId:null},
        {id:'a3',text:'最後のタスク',done:false,pinned:false,goalId:null},
        {id:'finished',text:'完了済み',done:true,pinned:false,goalId:null}],
      requirements:{},ui:{planShowCompleted:false}
    },
    planKind:()=> 'plan',
    goalCard:g=>'<div class="goalOpen" data-id="'+g.id+'">目標</div>',
    requestsHomeHtml:()=>'',bindRequestsHome:()=>{},
    esc:x=>String(x),clone:x=>JSON.parse(JSON.stringify(x)),
    openGoalSheet:(...args)=>events.push({type:'goal',args}),
    openAction:(...args)=>events.push({type:'action',args}),
    toggleAction:()=>{},save:async()=>{events.push({type:'save'})},
    showUndo:(label,snapshot)=>events.push({type:'undo',label,snapshot}),
    window:{innerHeight:850,scrollBy:()=>{}}
  };
  let visible={};
  const dom={
    set innerHTML(value){
      this.value=value;
      const goalIds=[...value.matchAll(/class="card clickable goalOpen" data-id="([^"]+)"/g)].map(x=>x[1]);
      const actionIds=[...value.matchAll(/class="actionrow planActionRow" data-action-id="([^"]+)"/g)].map(x=>x[1]);
      visible.goal=goalIds.map(id=>({dataset:{id},onclick:null}));
      visible.action=actionIds.map(id=>({dataset:{id},onclick:null}));
      visible.pins=actionIds.map(id=>({dataset:{pin:id},onclick:null}));
      visible.checks=actionIds.map(id=>({dataset:{id},onchange:null}));
      visible.rows=actionIds.map(fakeRow);
      visible.handles=actionIds.map((id,i)=>fakeHandle(id,visible.rows[i]));
    },
    get innerHTML(){return this.value||''}
  };
  const container={
    querySelectorAll(selector){
      if(selector==='.actionGrip')return visible.handles;
      if(selector==='.planActionRow')return visible.rows;
      return [];
    }
  };
  ctx.$=selector=>{
    if(selector==='#plan')return dom;
    if(selector==='#toggleCompletedGoals')return null;
    if(selector==='#planActionList')return visible.handles?.length?container:null;
    return null;
  };
  ctx.$$=selector=>{
    if(selector==='.goalOpen')return visible.goal||[];
    if(selector==='.actionCheck')return visible.checks||[];
    if(selector==='.actionEdit')return visible.action||[];
    if(selector==='[data-pin]')return visible.pins||[];
    return [];
  };
  ctx.document={querySelectorAll:selector=>selector==='.actionGrip'?visible.handles:[]};
  runInNewContext(bindGoalSource+'\n'+reorderSource+'\n'+planSource,ctx);
  return {ctx,events,plan:()=>runInNewContext('plan()',ctx),visible:()=>visible,html:dom};
}

async function flushUntil(check){
  for(let n=0;n<40;n++){
    if(check())return;
    await new Promise(resolve=>setImmediate(resolve));
  }
  assert.fail('UI operation did not finish');
}

test('all selector iteration uses the multiple-element query helper',()=>{
  const wrong=[...app.matchAll(/(?<!\$)\$\(['"][^'"]+['"]\)\.(?:forEach|map|filter|some|find)\(/g)];
  assert.deepEqual(wrong.map(x=>x[0]),[],'Single-element selector cannot be iterated');
  assert.ok(app.includes("$$('[data-pin]').forEach"));
  assert.ok(app.includes("$$('.goalOpen').forEach"));
});

test('plan() completes binding for goal and task editors, pin and grip',()=>{
  const h=planHarness();
  assert.doesNotThrow(()=>h.plan());
  const ui=h.visible();
  assert.equal(ui.goal.length,1);
  assert.equal(ui.action.length,3);
  assert.ok(ui.goal.every(x=>typeof x.onclick==='function'));
  assert.ok(ui.action.every(x=>typeof x.onclick==='function'));
  assert.ok(ui.pins.every(x=>typeof x.onclick==='function'));
  assert.ok(ui.handles.every(x=>typeof x.listeners.pointerdown==='function'));
  assert.ok(ui.handles.every(x=>typeof x.listeners.pointermove==='function'));
  assert.ok(ui.handles.every(x=>typeof x.listeners.pointerup==='function'));
  ui.goal[0].onclick();
  ui.action[1].onclick();
  assert.deepEqual(h.events.filter(x=>x.type==='goal')[0].args,['g1','plan']);
  assert.deepEqual(h.events.filter(x=>x.type==='action')[0].args,[null,'a2','plan']);
});

test('Android-style pointer drag reorders tasks and records undo without losing content',async()=>{
  const h=planHarness();
  h.plan();
  const grip=h.visible().handles[0];
  grip.listeners.pointerdown({button:0,pointerType:'touch',pointerId:7,preventDefault(){}});
  grip.listeners.pointermove({pointerId:7,clientY:300});
  grip.listeners.pointerup({pointerId:7});
  await flushUntil(()=>h.events.some(x=>x.type==='undo'));
  assert.deepEqual(h.ctx.state.actions.map(x=>x.id),['a2','a3','a1','finished']);
  assert.equal(h.ctx.state.actions.find(x=>x.id==='a1').text,'はじめのタスク');
  assert.equal(h.events.filter(x=>x.type==='save').length,1);
  assert.equal(h.events.filter(x=>x.type==='undo').length,1);
  assert.deepEqual(h.events.find(x=>x.type==='undo').snapshot.actions.map(x=>x.id),
    ['a1','a2','a3','finished']);
});

test('touch cancellation cannot change order',async()=>{
  const h=planHarness();h.plan();
  const grip=h.visible().handles[0];
  grip.listeners.pointerdown({button:0,pointerType:'touch',pointerId:6,preventDefault(){}});
  grip.listeners.pointermove({pointerId:6,clientY:300});
  grip.listeners.pointercancel();
  grip.listeners.pointerup({pointerId:6});
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(h.ctx.state.actions.map(x=>x.id),['a1','a2','a3','finished']);
  assert.equal(h.events.filter(x=>x.type==='save').length,0);
});

test('drag handle remains separate from task editing and checkbox',()=>{
  const h=planHarness();h.plan();
  const html=h.html.innerHTML;
  assert.match(html,/class="actionGrip"/);
  assert.match(html,/class="grow clickable actionEdit"/);
  assert.match(html,/class="check actionCheck"/);
  assert.ok(readFileSync('index.html','utf8').includes('touch-action:none'));
  assert.ok(app.includes("const handles=[...container.querySelectorAll('.actionGrip')]"));
});
