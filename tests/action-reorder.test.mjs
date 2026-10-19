import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync('index.html','utf8');
const start=html.indexOf('const MASTER=JSON.parse');
assert.ok(start>=0);
const app=html.slice(start,html.indexOf('</script>',start));
const from=app.indexOf('function moveActionInPlan(');
const until=app.indexOf('function bindActionReorder(',from);
assert.ok(from>=0&&until>from);
const moveSrc=app.slice(from,until);
function rig(actions){
  const ctx={state:{actions:structuredClone(actions)}};
  vm.runInNewContext(moveSrc,ctx);
  return ctx;
}
const item=(id,done=false)=>({id,text:'task-'+id,done,pinned:false});
const ids=ctx=>ctx.state.actions.map(x=>x.id);
test('dragging a task down changes order only once',()=>{
  const ctx=rig([item('a'),item('b'),item('c')]);
  assert.equal(ctx.moveActionInPlan('a','c',true),true);
  assert.deepEqual(ids(ctx),['b','c','a']);
});
test('dragging a task up puts it before its target',()=>{
  const ctx=rig([item('a'),item('b'),item('c')]);
  assert.equal(ctx.moveActionInPlan('c','a',false),true);
  assert.deepEqual(ids(ctx),['c','a','b']);
});
test('completed actions retain their positions and stored attributes',()=>{
  const ctx=rig([item('a'),item('finished',true),item('b'),item('c')]);
  assert.equal(ctx.moveActionInPlan('a','c',true),true);
  assert.deepEqual(ids(ctx),['b','finished','c','a']);
  assert.equal(ctx.state.actions[1].done,true);
  assert.equal(ctx.state.actions[1].text,'task-finished');
});
test('invalid, finished, unchanged and adjacent noop moves do not mutate',()=>{
  const ctx=rig([item('a'),item('b'),item('done',true)]);
  const initial=JSON.stringify(ctx.state.actions);
  assert.equal(ctx.moveActionInPlan('done','a',false),false);
  assert.equal(ctx.moveActionInPlan('missing','a',false),false);
  assert.equal(ctx.moveActionInPlan('a','a',true),false);
  assert.equal(ctx.moveActionInPlan('a','b',false),false);
  assert.equal(JSON.stringify(ctx.state.actions),initial);
});
test('UI has a mobile grip isolated from checkbox and supports keyboard movement',()=>{
  assert.ok(html.includes('class="actionGrip"'));
  assert.ok(html.includes('id="planActionList"'));
  assert.ok(html.includes('data-action-id='));
  assert.ok(html.includes('touch-action:none'));
  assert.ok(app.includes("handle.addEventListener('pointerdown'"));
  assert.ok(app.includes("handle.addEventListener('pointermove'"));
  assert.ok(app.includes("handle.addEventListener('pointerup'"));
  assert.ok(app.includes("handle.addEventListener('pointercancel'"));
  assert.ok(app.includes("e.key!=='ArrowUp'&&e.key!=='ArrowDown'"));
  assert.ok(app.includes("showUndo('やることの並べ替えを元に戻せます',before)"));
  assert.ok(app.includes('bindActionReorder()'));
});
